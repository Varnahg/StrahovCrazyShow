import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { FreeCamera } from "@babylonjs/core/Cameras/freeCamera";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder";
import "@babylonjs/core/Meshes/instancedMesh";
import { Material } from "@babylonjs/core/Materials/material";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { FresnelParameters } from "@babylonjs/core/Materials/fresnelParameters";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import {
  InternalTexture,
  InternalTextureSource,
} from "@babylonjs/core/Materials/Textures/internalTexture";
import {
  CinematicAtmosphere,
  applyWindowSkyReflection,
} from "../client/cinematic";

// Only cube storage is a CPU stand-in. Material setters, effects, defines,
// readiness, frame binding and scene/engine observer ownership are real Babylon.
class CpuSceneEngine extends NullEngine {
  override createRawCubeTexture(
    ...args: Parameters<NullEngine["createRawCubeTexture"]>
  ) {
    const texture = new InternalTexture(this, InternalTextureSource.CubeRaw);
    texture.isCube = true;
    texture.width =
      texture.height =
      texture.baseWidth =
      texture.baseHeight =
        args[1];
    texture.isReady = true;
    return texture;
  }
}

async function fixture(
  t: TestContext,
  types: ("b6" | "exterior")[] = ["b6"],
  before?: (materials: StandardMaterial[], scene: Scene) => void,
) {
  const engine = new CpuSceneEngine();
  const scene = new Scene(engine);
  const otherEngine = new NullEngine();
  const otherScene = new Scene(otherEngine);
  let atmosphere: CinematicAtmosphere | undefined;
  t.after(() => {
    atmosphere?.dispose();
    scene.dispose();
    otherScene.dispose();
    engine.dispose();
    otherEngine.dispose();
  });
  const camera = new FreeCamera("observer", new Vector3(0, 1, -8), scene);
  camera.setTarget(Vector3.Zero());
  scene.activeCamera = camera;
  const sun = new DirectionalLight("key", Vector3.Down(), scene);
  const materials = types.map((kind, index) => {
    const material = new StandardMaterial(`window ${index}`, scene);
    material.metadata =
      kind === "b6"
        ? { realityGlass: true, block: 6, windowStyle: "clear" }
        : { exteriorOnlyGlass: true };
    material.alpha = kind === "b6" ? 0.32 : 1;
    return material;
  });
  const meshes = materials.map((material, index) => {
    const mesh = CreateBox(`window geometry ${index}`, {}, scene);
    mesh.position.x = index * 0.5;
    mesh.material = material;
    return mesh;
  });
  // One owned material used by multiple drawables, including source instancing.
  const shared = CreateBox("shared geometry", {}, scene);
  shared.material = materials[0];
  meshes.push(shared);
  meshes[0].createInstance("shared instance");
  const unrelated = new StandardMaterial(
    "unrelated same-scene material",
    scene,
  );
  const otherMaterial = new StandardMaterial(
    "other engine material",
    otherScene,
  );
  CreateBox("other engine geometry", {}, otherScene).material = otherMaterial;
  before?.(materials, scene);
  atmosphere = new CinematicAtmosphere(scene, camera, sun);
  const input = {
    dt: 0,
    player: { x: 0, y: 0, z: 0 },
    quality: "low",
    cloud: 0,
    daylight: 0,
    keySource: "none" as const,
  };
  atmosphere.update(input);
  const settle = async () => {
    for (let index = 0; index < 4; index++) {
      scene.render();
      await new Promise<void>((resolve) => setImmediate(resolve));
    }
  };
  await settle();
  for (const mesh of meshes) assert.ok(mesh.subMeshes[0].effect?.isReady());
  const resets = new Map<StandardMaterial, number>();
  for (const material of [...materials, unrelated, otherMaterial]) {
    const original = material.resetDrawCache;
    material.resetDrawCache = function () {
      resets.set(material, (resets.get(material) ?? 0) + 1);
      return original.call(this);
    };
  }
  let ownerFresnelSweeps = 0;
  let foreignFresnelSweeps = 0;
  for (const target of [scene, otherScene]) {
    const original = target.markAllMaterialsAsDirty;
    target.markAllMaterialsAsDirty = function (flag, predicate) {
      if (flag & Material.FresnelDirtyFlag) {
        if (target === scene) ownerFresnelSweeps++;
        else foreignFresnelSweeps++;
      }
      return original.call(this, flag, predicate);
    };
  }
  return {
    engine,
    scene,
    otherScene,
    materials,
    meshes,
    unrelated,
    otherMaterial,
    atmosphere,
    input,
    settle,
    resets,
    sweeps: () => ({ ownerFresnelSweeps, foreignFresnelSweeps }),
  };
}

for (const frozen of [false, true])
  test(`owned Fresnel cleanup keeps a live ${frozen ? "frozen" : "unfrozen"} scene renderable without global invalidation`, async (t) => {
    const f = await fixture(t);
    const material = f.materials[0];
    const reflection = material.reflectionFresnelParameters;
    const opacity = material.opacityFresnelParameters;
    if (frozen) {
      material.freeze();
      await f.settle();
    }
    const oldEffect = f.meshes[0].subMeshes[0].effect;
    const alpha = material.alpha;
    f.atmosphere.dispose();
    assert.deepEqual(f.sweeps(), {
      ownerFresnelSweeps: 0,
      foreignFresnelSweeps: 0,
    });
    assert.equal(material.reflectionTexture, null);
    assert.equal(material.reflectionFresnelParameters, null);
    assert.equal(material.opacityFresnelParameters, null);
    assert.equal(
      reflection.isEnabled,
      true,
      "detach does not mutate a borrowed parameter object",
    );
    assert.equal(opacity.isEnabled, true);
    assert.equal(
      f.resets.get(material),
      1,
      "one reset after both owned properties were detached",
    );
    assert.equal(material.alpha, alpha);
    assert.equal(material.isFrozen, frozen);
    assert.equal(f.scene.isDisposed, false);
    assert.equal(f.scene.environmentTexture, null);
    await f.settle();
    for (const mesh of f.meshes) {
      const sub = mesh.subMeshes[0];
      const defines = sub.materialDefines as unknown as {
        FRESNEL: boolean;
        OPACITYFRESNEL: boolean;
        REFLECTIONFRESNEL: boolean;
      };
      assert.equal(defines.FRESNEL, false);
      assert.equal(defines.OPACITYFRESNEL, false);
      assert.equal(defines.REFLECTIONFRESNEL, false);
      assert.ok(sub.effect!.isReady());
    }
    assert.notEqual(f.meshes[0].subMeshes[0].effect, oldEffect);
    assert.equal(f.resets.get(f.unrelated), undefined);
    assert.equal(f.resets.get(f.otherMaterial), undefined);
    f.atmosphere.dispose();
    assert.equal(f.resets.get(material), 1);
  });

test("objects shared with another engine remain enabled and owned by its material", async (t) => {
  const f = await fixture(t);
  const reflection = f.materials[0].reflectionFresnelParameters;
  const opacity = f.materials[0].opacityFresnelParameters;
  f.otherMaterial.reflectionFresnelParameters = reflection;
  f.otherMaterial.opacityFresnelParameters = opacity;
  f.atmosphere.dispose();
  assert.equal(f.otherMaterial.reflectionFresnelParameters, reflection);
  assert.equal(f.otherMaterial.opacityFresnelParameters, opacity);
  assert.ok(reflection.isEnabled && opacity.isEnabled);
  assert.deepEqual(f.sweeps(), {
    ownerFresnelSweeps: 0,
    foreignFresnelSweeps: 0,
  });
});

test("equals-rejected parameter assignments never acquire external ownership", async (t) => {
  let previousReflection!: FresnelParameters;
  let previousOpacity!: FresnelParameters;
  const f = await fixture(t, ["b6"], ([material], scene) => {
    applyWindowSkyReflection(material, new Texture(null, scene));
    previousReflection = material.reflectionFresnelParameters;
    previousOpacity = material.opacityFresnelParameters;
  });
  assert.equal(f.materials[0].reflectionFresnelParameters, previousReflection);
  assert.equal(f.materials[0].opacityFresnelParameters, previousOpacity);
  f.atmosphere.dispose();
  assert.equal(f.materials[0].reflectionTexture, null);
  assert.equal(f.materials[0].reflectionFresnelParameters, previousReflection);
  assert.equal(f.materials[0].opacityFresnelParameters, previousOpacity);
  assert.ok(previousReflection.isEnabled && previousOpacity.isEnabled);
  assert.equal(f.resets.get(f.materials[0]), undefined);
  assert.deepEqual(f.sweeps(), {
    ownerFresnelSweeps: 0,
    foreignFresnelSweeps: 0,
  });
});

test("external replacements/null and a transferred reflection texture survive cleanup", async (t) => {
  const f = await fixture(t, ["b6", "b6", "b6", "b6"]);
  const [reflectionChanged, opacityChanged, cleared, textureChanged] =
    f.materials;
  const foreignReflection = new FresnelParameters({ bias: 0.2 });
  const foreignOpacity = new FresnelParameters({ power: 3 });
  reflectionChanged.reflectionFresnelParameters = foreignReflection;
  opacityChanged.opacityFresnelParameters = foreignOpacity;
  // Babylon's runtime permits null; its 9.30 accessor declaration is nonnullable.
  cleared.reflectionFresnelParameters = null!;
  const texture = new Texture(null, f.scene);
  const retainedReflection = textureChanged.reflectionFresnelParameters;
  const retainedOpacity = textureChanged.opacityFresnelParameters;
  textureChanged.reflectionTexture = texture;
  assert.doesNotThrow(() => f.atmosphere.dispose());
  assert.equal(
    reflectionChanged.reflectionFresnelParameters,
    foreignReflection,
  );
  assert.equal(reflectionChanged.opacityFresnelParameters, null);
  assert.equal(opacityChanged.reflectionFresnelParameters, null);
  assert.equal(opacityChanged.opacityFresnelParameters, foreignOpacity);
  assert.equal(cleared.reflectionFresnelParameters, null);
  assert.equal(cleared.opacityFresnelParameters, null);
  assert.ok(foreignReflection.isEnabled && foreignOpacity.isEnabled);
  assert.equal(textureChanged.reflectionTexture, texture);
  assert.equal(textureChanged.reflectionFresnelParameters, retainedReflection);
  assert.equal(textureChanged.opacityFresnelParameters, retainedOpacity);
  assert.ok(retainedReflection.isEnabled && retainedOpacity.isEnabled);
  assert.equal(f.resets.get(textureChanged), undefined);
  for (const material of [reflectionChanged, opacityChanged, cleared])
    assert.equal(f.resets.get(material), 1);
  assert.deepEqual(f.sweeps(), {
    ownerFresnelSweeps: 0,
    foreignFresnelSweeps: 0,
  });
});

test("exterior-only glass retains its foreign opacity and subsequent renderer use", async (t) => {
  const opacity = new FresnelParameters({ bias: 0.3 });
  const f = await fixture(t, ["exterior"], ([material]) => {
    material.opacityFresnelParameters = opacity;
  });
  assert.equal(f.materials[0].opacityFresnelParameters, opacity);
  f.atmosphere.dispose();
  assert.equal(f.materials[0].opacityFresnelParameters, opacity);
  assert.ok(opacity.isEnabled);
  assert.equal(f.materials[0].alpha, 1);
  assert.equal(f.resets.get(f.materials[0]), 1);
  await f.settle();
  const defines = f.meshes[0].subMeshes[0].materialDefines as unknown as {
    OPACITYFRESNEL: boolean;
    REFLECTIONFRESNEL: boolean;
  };
  assert.equal(defines.OPACITYFRESNEL, true);
  assert.ok(!defines.REFLECTIONFRESNEL);
});

test("quality changes retain ownership; an already disposed material is not reclaimed", async (t) => {
  const f = await fixture(t, ["b6", "b6"]);
  const material = f.materials[0];
  const reflection = material.reflectionFresnelParameters;
  const opacity = material.opacityFresnelParameters;
  for (const quality of ["medium", "high", "low"]) {
    f.atmosphere.update({ ...f.input, quality });
    assert.equal(material.reflectionFresnelParameters, reflection);
    assert.equal(material.opacityFresnelParameters, opacity);
  }
  f.materials[1].dispose();
  f.atmosphere.dispose();
  assert.equal(f.resets.get(material), 1);
  assert.equal(f.resets.get(f.materials[1]), undefined);
  f.atmosphere.update({ ...f.input, quality: "high" });
  f.atmosphere.dispose();
  assert.equal(f.resets.get(material), 1);
  assert.deepEqual(f.sweeps(), {
    ownerFresnelSweeps: 0,
    foreignFresnelSweeps: 0,
  });
});
