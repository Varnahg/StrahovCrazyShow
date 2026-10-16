import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { FreeCamera } from "@babylonjs/core/Cameras/freeCamera";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder";
import "@babylonjs/core/Meshes/instancedMesh";
import { SubMesh } from "@babylonjs/core/Meshes/subMesh";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { PBRMetallicRoughnessMaterial } from "@babylonjs/core/Materials/PBR/pbrMetallicRoughnessMaterial";
import { PBRSpecularGlossinessMaterial } from "@babylonjs/core/Materials/PBR/pbrSpecularGlossinessMaterial";
import { MultiMaterial } from "@babylonjs/core/Materials/multiMaterial";
import { ImageProcessingConfiguration } from "@babylonjs/core/Materials/imageProcessingConfiguration";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import { DefaultRenderingPipeline } from "@babylonjs/core/PostProcesses/RenderPipeline/Pipelines/defaultRenderingPipeline";
import { WebGPUPipelineContext } from "@babylonjs/core/Engines/WebGPU/webgpuPipelineContext";
import type { Effect } from "@babylonjs/core/Materials/effect";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";

function observeInvalidation(material: object, record: () => void) {
  const observed = material as {
    _markAllSubMeshesAsImageProcessingDirty(): void;
  };
  const original = observed._markAllSubMeshesAsImageProcessingDirty;
  observed._markAllSubMeshesAsImageProcessingDirty = function () {
    record();
    return original.call(this);
  };
}

// Actual Babylon readiness/material binding, not a GPU or performance fixture.
async function fixture(t: TestContext) {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  t.after(() => {
    scene.dispose();
    engine.dispose();
  });
  const camera = new FreeCamera("value updates", new Vector3(0, 0, -4), scene);
  scene.activeCamera = camera;
  const config = scene.imageProcessingConfiguration;
  config.exposure = 1.08;
  const materials = [
    new StandardMaterial("standard", scene),
    new PBRMaterial("pbr", scene),
    new PBRMetallicRoughnessMaterial("metallic roughness", scene),
    new PBRSpecularGlossinessMaterial("specular glossiness", scene),
  ];
  const meshes: AbstractMesh[] = materials.map((material, i) => {
    const mesh = CreateBox(`box ${i}`, {}, scene);
    mesh.material = material;
    return mesh;
  });
  const multi = new MultiMaterial("mixed family", scene);
  multi.subMaterials = [materials[0], materials[1]];
  const mixed = CreateBox("multi-material geometry", {}, scene);
  mixed.material = multi;
  mixed.subMeshes = [];
  new SubMesh(0, 0, mixed.getTotalVertices(), 0, 18, mixed);
  new SubMesh(1, 0, mixed.getTotalVertices(), 18, 18, mixed);
  meshes.push(mixed);
  // Babylon renders an instance through its source submesh/effect. Its own
  // submesh has no effect; it still belongs to the scene-wide dirty traversal.
  const instance = (meshes[0] as ReturnType<typeof CreateBox>).createInstance(
    "instance",
  );
  assert.equal(instance.sourceMesh, meshes[0]);
  const settle = async () => {
    for (let i = 0; i < 4; i++) {
      scene.render();
      await new Promise<void>((resolve) => setImmediate(resolve));
    }
  };
  await settle();
  for (const mesh of meshes)
    assert.ok(
      mesh.subMeshes.every((sub) => sub.effect?.isReady()),
      mesh.name,
    );
  let invalidations = 0;
  for (const material of materials)
    observeInvalidation(material, () => {
      invalidations++;
    });
  let traversals = 0;
  for (const sub of new Set(meshes.flatMap((mesh) => mesh.subMeshes))) {
    const original = sub.getMaterial;
    sub.getMaterial = function (...args) {
      traversals++;
      return original.apply(this, args);
    };
  }
  const bindings: { effect: Effect; exposure: number }[] = [];
  const originalBind = config.bind;
  config.bind = function (effect, ...args) {
    bindings.push({ effect, exposure: this.exposure });
    return originalBind.call(this, effect, ...args);
  };
  const reset = () => {
    invalidations = traversals = 0;
    bindings.length = 0;
  };
  const assertCurrentBindings = () => {
    for (const mesh of meshes)
      for (const sub of mesh.subMeshes)
        assert.ok(
          bindings.some(
            (b) => b.effect === sub.effect && b.exposure === config.exposure,
          ),
          `${mesh.name}: exact current exposure reaches its real effect`,
        );
  };
  return {
    engine,
    scene,
    camera,
    config,
    materials,
    meshes,
    bindings,
    settle,
    reset,
    counts: () => ({ invalidations, traversals }),
    assertCurrentBindings,
  };
}

test("exposure values keep real Standard/PBR/multi/instance effects without scene traversal, including frozen materials", async (t) => {
  const f = await fixture(t);
  let notifications = 0;
  f.config.onUpdateParameters.add((value) => {
    assert.equal(value, f.config, "observable payload identity is retained");
    notifications++;
  });
  for (const frozen of [false, true]) {
    for (const material of f.materials)
      frozen ? material.freeze() : material.unfreeze();
    await f.settle();
    const effects = f.meshes.flatMap((mesh) =>
      mesh.subMeshes.map((sub) => sub.effect),
    );
    f.reset();
    const before = notifications;
    f.config.exposure += 0.000013;
    assert.deepEqual(f.counts(), { invalidations: 0, traversals: 0 });
    assert.equal(notifications, before + 1);
    f.scene.render();
    f.assertCurrentBindings();
    assert.deepEqual(
      f.meshes.flatMap((mesh) => mesh.subMeshes.map((sub) => sub.effect)),
      effects,
    );
    f.reset();
    f.config.exposure = f.config.exposure;
    assert.equal(
      notifications,
      before + 1,
      "unchanged setter still does nothing",
    );
    assert.deepEqual(f.counts(), { invalidations: 0, traversals: 0 });
  }
});

test("1↔non1 exposure still prepares real shader variants; all other configuration changes retain dirty notification", async (t) => {
  const f = await fixture(t);
  for (const value of [1, 1.08, 1]) {
    f.reset();
    f.config.exposure = value;
    assert.equal(f.counts().invalidations, f.materials.length);
    assert.ok(f.counts().traversals > 0);
    await f.settle();
    for (const mesh of f.meshes)
      for (const sub of mesh.subMeshes)
        assert.equal(
          (sub.materialDefines as unknown as { EXPOSURE: boolean }).EXPOSURE,
          value !== 1,
        );
  }
  for (const change of [
    () => {
      f.config.contrast = 1.2;
    },
    () => {
      f.config.toneMappingEnabled = true;
    },
    () => {
      f.config.toneMappingType = ImageProcessingConfiguration.TONEMAPPING_ACES;
    },
    () => {
      f.config.colorCurvesEnabled = true;
    },
    () => {
      f.config.colorGradingTexture = new Texture(null, f.scene);
    },
    () => {
      f.config.colorGradingEnabled = true;
    },
    () => {
      f.config.colorGradingWithGreenDepth = false;
    },
    () => {
      f.config.colorGradingBGR = false;
    },
    () => {
      f.config.whiteBalanceEnabled = true;
    },
    () => {
      f.config.temperature = 6000;
    },
    () => {
      f.config.tint = 1;
    },
    () => {
      f.config.vignetteEnabled = true;
    },
    () => {
      f.config.ditheringEnabled = true;
    },
    () => {
      f.config.isEnabled = false;
    },
    () => {
      f.config.isEnabled = true;
    },
    () => {
      f.config.applyByPostProcess = true;
    },
    () => {
      f.config.applyByPostProcess = false;
    },
    () => {
      f.config.onUpdateParameters.notifyObservers(f.config);
    },
  ]) {
    f.reset();
    change();
    assert.equal(
      f.counts().invalidations,
      f.materials.length,
      change.toString(),
    );
    assert.ok(f.counts().traversals > 0);
  }
  f.reset();
  f.config.outputTextureWidth = 640;
  f.config.outputTextureHeight = 480;
  assert.deepEqual(
    f.counts(),
    { invalidations: 0, traversals: 0 },
    "dimensions are existing value fields, not dirty setters",
  );
});

test("observer masks, late notification subscribers and disposal during dispatch retain their ownership", async (t) => {
  const f = await fixture(t);
  let maskTwo = 0;
  let maskFour = 0;
  let late = 0;
  f.config.onUpdateParameters.add(() => {
    maskTwo++;
  }, 2);
  f.config.onUpdateParameters.add(() => {
    maskFour++;
  }, 4);
  const installer = f.config.onUpdateParameters.add(
    () => {
      f.config.onUpdateParameters.add(() => {
        late++;
      });
      f.config.onUpdateParameters.remove(installer);
    },
    -1,
    true,
  );
  f.config.exposure += 0.000013;
  assert.deepEqual([maskTwo, maskFour, late], [1, 1, 1]);
  const victim = f.materials[0];
  const removeMaterial = f.config.onUpdateParameters.add(
    () => {
      victim.dispose();
      f.config.onUpdateParameters.remove(removeMaterial);
    },
    -1,
    true,
  );
  f.reset();
  f.config.contrast += 0.1;
  assert.equal(f.counts().invalidations, f.materials.length - 1);
  f.reset();
  f.config.exposure += 0.000013;
  assert.deepEqual(f.counts(), { invalidations: 0, traversals: 0 });
  assert.deepEqual([maskTwo, maskFour, late], [3, 3, 3]);
});

test("exposure→contrast and contrast→exposure nested setters preserve the full update and do not leak the value marker", async (t) => {
  const f = await fixture(t);
  for (const outer of ["exposure", "contrast"] as const) {
    let inside = false;
    const observer = f.config.onUpdateParameters.add(
      () => {
        if (inside) return;
        inside = true;
        if (outer === "exposure") f.config.contrast += 0.1;
        else f.config.exposure += 0.000013;
        inside = false;
      },
      -1,
      true,
    );
    f.reset();
    if (outer === "exposure") f.config.exposure += 0.000013;
    else f.config.contrast += 0.1;
    assert.equal(f.counts().invalidations, f.materials.length, outer);
    f.config.onUpdateParameters.remove(observer);
    f.reset();
    f.config.onUpdateParameters.notifyObservers(f.config);
    assert.equal(
      f.counts().invalidations,
      f.materials.length,
      "ordinary notify after nesting",
    );
    f.scene.render();
    f.assertCurrentBindings();
  }
});

test("direct nested notifications remain full updates, and a throwing observer cannot taint later updates", async (t) => {
  const f = await fixture(t);
  let inside = false;
  const nested = f.config.onUpdateParameters.add(
    () => {
      if (inside) return;
      inside = true;
      f.config.onUpdateParameters.notifyObservers(f.config);
      inside = false;
    },
    -1,
    true,
  );
  f.reset();
  f.config.exposure += 0.000013;
  assert.ok(
    f.counts().invalidations >= f.materials.length,
    "direct notify is never value-only",
  );
  f.config.onUpdateParameters.remove(nested);
  const error = new Error("observer failure");
  const throwing = f.config.onUpdateParameters.add(
    () => {
      throw error;
    },
    -1,
    true,
  );
  assert.throws(
    () => {
      f.config.exposure = 1.111;
    },
    (actual) => actual === error,
  );
  assert.equal(
    f.config.exposure,
    1.111,
    "setter keeps original value-before-notify ordering",
  );
  f.config.onUpdateParameters.remove(throwing);
  f.reset();
  f.config.contrast += 0.1;
  assert.equal(f.counts().invalidations, f.materials.length);
  f.reset();
  f.config.exposure += 0.000013;
  assert.deepEqual(f.counts(), { invalidations: 0, traversals: 0 });
});

test("late materials and independently owned configurations start with current exposure and retain observer disposal", async (t) => {
  const f = await fixture(t);
  f.config.exposure = 1.12;
  const late = new PBRMaterial("late loaded material", f.scene);
  const mesh = CreateBox("late geometry", {}, f.scene);
  mesh.material = late;
  await f.settle();
  assert.equal(
    (mesh.subMeshes[0].materialDefines as unknown as { EXPOSURE: boolean })
      .EXPOSURE,
    true,
  );
  assert.ok(
    f.bindings.some(
      (b) => b.effect === mesh.subMeshes[0].effect && b.exposure === 1.12,
    ),
  );
  const own = new ImageProcessingConfiguration();
  own.exposure = 1.4;
  late.imageProcessingConfiguration = own;
  await f.settle();
  let ownDirty = 0;
  observeInvalidation(late, () => {
    ownDirty++;
  });
  f.config.contrast += 0.1;
  assert.equal(ownDirty, 0, "scene config was detached");
  own.exposure = 1.41;
  assert.equal(ownDirty, 0);
  own.contrast = 1.1;
  assert.equal(ownDirty, 1);
  late.dispose();
  own.contrast = 1.2;
  assert.equal(ownDirty, 1, "disposed material does not remain subscribed");
});

test("actual cinematic pipeline receives every exposure update and keeps bloom bindings/chain intact", async (t) => {
  const f = await fixture(t);
  const pipeline = new DefaultRenderingPipeline(
    "cinematic recipe",
    true,
    f.scene,
    [f.camera],
    false,
  );
  pipeline.imageProcessingEnabled = false;
  if (pipeline.imageProcessingEnabled !== f.config.isEnabled)
    f.config.onUpdateParameters.notifyObservers(f.config);
  pipeline.fxaaEnabled = true;
  pipeline.bloomEnabled = true;
  pipeline.bloomScale = 0.5;
  pipeline.bloomKernel = 32;
  pipeline.bloomThreshold = 0.96;
  pipeline.bloomWeight = 0.1;
  pipeline.prepare();
  pipeline.automaticBuild = true;
  f.config.applyByPostProcess = false;
  await f.settle();
  // The existing recipe disables config image processing; preserve this baseline.
  assert.equal(f.config.isEnabled, false);
  const pipelineInternals = pipeline as unknown as {
    bloom: {
      _downscale: {
        _exposure: number;
        _effectWrapper: { effect: Effect; bind(noDefaults: boolean): void };
      };
    };
  };
  const bloom = pipelineInternals.bloom;
  const downscale = bloom._downscale;
  const wrapper = (
    downscale as unknown as {
      _effectWrapper: { effect: Effect; bind(noDefaults: boolean): void };
    }
  )._effectWrapper;
  const effect = wrapper.effect;
  const writes: { name: string; value: number }[] = [];
  const setFloat = effect.setFloat;
  effect.setFloat = function (name, value) {
    writes.push({ name, value });
    return setFloat.call(this, name, value);
  };
  f.reset();
  f.config.exposure = 1.123456;
  assert.deepEqual(f.counts(), { invalidations: 0, traversals: 0 });
  assert.equal(downscale._exposure, 1.123456);
  wrapper.bind(true);
  assert.ok(writes.some((w) => w.name === "exposure" && w.value === 1.123456));
  assert.equal(pipelineInternals.bloom, bloom);
  assert.equal(wrapper.effect, effect);
  pipeline.dispose();
});

test("WebGPU leftovers transport exact float values through both existing UBO cache modes", () => {
  for (const ownerKeyed of [false, true]) {
    const uploads: number[] = [];
    let id = 0;
    const engine = {
      supportsUniformBuffers: true,
      _uniformBuffers: [] as unknown[],
      _features: {
        trackUbosInFrame: true,
        checkUbosContentBeforeUpload: true,
        uniformBufferHardCheckMatrix: false,
      },
      frameId: 1,
      createUniformBuffer(data: Float32Array) {
        return { uniqueId: ++id, bytes: Float32Array.from(data) };
      },
      updateUniformBuffer(buffer: { bytes: Float32Array }, data: Float32Array) {
        buffer.bytes = Float32Array.from(data);
        uploads.push(data[0]);
      },
      _releaseBuffer() {
        return true;
      },
    };
    const context = new WebGPUPipelineContext(
      {
        leftOverUniforms: [{ name: "exposureLinear", type: "f32" }],
      } as ConstructorParameters<typeof WebGPUPipelineContext>[0],
      engine as unknown as ConstructorParameters<
        typeof WebGPUPipelineContext
      >[1],
    );
    context.buildUniformLayout();
    const owner = {};
    try {
      for (const [value, expectedUploads] of [
        [1.08, 1],
        [1.080013, 1],
        [1.080013, 0],
      ]) {
        const before = uploads.length;
        context.setFloat("exposureLinear", value);
        const buffer = context.uniformBuffer!;
        if (ownerKeyed)
          (
            buffer as unknown as { _updateOwnerKeyed(owner: object): void }
          )._updateOwnerKeyed(owner);
        else buffer.update();
        assert.equal(uploads.length - before, expectedUploads);
        assert.equal(
          (buffer.getBuffer() as unknown as { bytes: Float32Array }).bytes[0],
          Math.fround(value),
        );
        engine.frameId++;
      }
    } finally {
      context.dispose();
    }
    assert.equal(engine._uniformBuffers.length, 0);
  }
});
