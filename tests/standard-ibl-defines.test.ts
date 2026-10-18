import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { setImmediate as turn } from "node:timers/promises";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { FreeCamera } from "@babylonjs/core/Cameras/freeCamera";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { FresnelParameters } from "@babylonjs/core/Materials/fresnelParameters";
import { RawCubeTexture } from "@babylonjs/core/Materials/Textures/rawCubeTexture";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import { InternalTexture, InternalTextureSource } from "@babylonjs/core/Materials/Textures/internalTexture";
import { Constants } from "@babylonjs/core/Engines/constants";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { SpotLight } from "@babylonjs/core/Lights/spotLight";
import { PointLight } from "@babylonjs/core/Lights/pointLight";

// Preserve real cube/material/Effect/readiness behavior; only the headless pixel
// upload is replaced. This fixture is not a GPU, image or performance proof.
class ReflectionEngine extends NullEngine {
  override createRawCubeTexture(...args: Parameters<NullEngine["createRawCubeTexture"]>) {
    const texture = new InternalTexture(this, InternalTextureSource.CubeRaw);
    texture.isCube = texture.isReady = true;
    texture.width = texture.height = texture.baseWidth = texture.baseHeight = args[1];
    texture.generateMipMaps = args[4] ?? false;
    texture.samplingMode = args[6] ?? Texture.TRILINEAR_SAMPLINGMODE;
    return texture;
  }
}

function fixture(t: TestContext, textureLOD: boolean) {
  const engine = new ReflectionEngine();
  engine.getCaps().textureLOD = textureLOD;
  const scene = new Scene(engine);
  scene.useRightHandedSystem = true;
  scene.fogMode = Scene.FOGMODE_EXP;
  scene.fogDensity = 0.0018;
  const camera = new FreeCamera("camera", new Vector3(0, 0, -5), scene);
  camera.setTarget(Vector3.Zero());
  scene.activeCamera = camera;
  new HemisphericLight("sky", Vector3.Up(), scene);
  new SpotLight("car beam", new Vector3(0, 3, -2), new Vector3(0, -1, 1), Math.PI / 3, 2, scene);
  const point = new PointLight("mapped lamp", new Vector3(1, 2, 0), scene);
  point.setEnabled(false);
  const cube = new RawCubeTexture(
    scene,
    Array.from({ length: 6 }, () => new Uint8Array([128, 96, 64, 255])),
    1,
    Constants.TEXTUREFORMAT_RGBA,
    Constants.TEXTURETYPE_UNSIGNED_BYTE,
    true,
    false,
    Texture.TRILINEAR_SAMPLINGMODE,
  );
  cube.coordinatesMode = Texture.CUBIC_MODE;
  cube.gammaSpace = false;
  const material = new StandardMaterial("reflective receiver", scene);
  material.reflectionTexture = cube;
  material.reflectionFresnelParameters = new FresnelParameters({ power: 5 });
  material.roughness = 0.04;
  material.maxSimultaneousLights = 4;
  const warm = CreateBox("representative", {}, scene);
  warm.material = material;
  // Construct before warming; sharing a material must not share submesh history.
  const fresh = warm.clone("unvisited receiver", null, true)!;
  fresh.setEnabled(false);
  assert.equal(fresh.material, material);
  assert.equal(fresh.geometry, warm.geometry);
  const drawn = new Set<Mesh>();
  for (const mesh of [warm, fresh])
    mesh.onAfterRenderObservable.add(() => {
      if (engine.currentRenderPassId === camera.renderPassId) drawn.add(mesh);
    });
  const effectOf = (mesh: Mesh) => mesh.subMeshes[0]._getDrawWrapper(camera.renderPassId)?.effect;
  const draw = async (mesh: Mesh) => {
    // Async shader imports depend on IO completion, not event-loop turn count.
    const deadline = performance.now() + 4_000;
    while (performance.now() < deadline) {
      drawn.clear();
      scene.render();
      await turn();
      const effect = effectOf(mesh);
      if (drawn.has(mesh) && effect?.isReady()) return effect;
    }
    assert.fail("actual receiver did not become ready and draw");
  };
  t.after(() => {
    try { scene.dispose(); }
    finally { engine.dispose(); }
    assert.equal(scene.meshes.length, 0);
    assert.equal(scene.materials.length, 0);
    assert.equal(scene.textures.length, 0);
  });
  return { engine, scene, cube, material, warm, fresh, point, effectOf, draw };
}

for (const textureLOD of [false, true]) {
  test(`Standard reflection reuses warmed Effects for fresh submeshes, textureLOD=${textureLOD}`, async t => {
    const f = fixture(t, textureLOD);
    const withoutPoint = await f.draw(f.warm);
    const withoutContext = withoutPoint.getPipelineContext();
    assert.ok(withoutContext, "ready Effect owns a real pipeline context");
    f.point.setEnabled(true);
    const withPoint = await f.draw(f.warm);
    const withContext = withPoint.getPipelineContext();
    assert.ok(withContext, "second light variant owns a real pipeline context");
    assert.notEqual(withPoint, withoutPoint, "actual light-count variants differ");
    assert.equal(f.effectOf(f.fresh), undefined, "fresh receiver was never ready or drawn during warming");
    assert.equal(f.fresh.subMeshes[0].materialDefines, undefined);
    f.warm.setEnabled(false);
    f.fresh.setEnabled(true);
    const first = await f.draw(f.fresh);
    assert.equal(first === withPoint, true, "same real material/layout/light state must reuse the warmed Effect");
    assert.equal(first.getPipelineContext() === withContext, true);
    assert.equal(first.defines, withPoint.defines);
    assert.deepEqual(first.getAttributesNames(), withPoint.getAttributesNames());
    assert.match(first.defines, /^#define USESPHERICALFROMREFLECTIONMAP$/m);
    assert.equal(/^#define LODBASEDMICROSFURACE$/m.test(first.defines), textureLOD);
    assert.match(first.defines, /^#define FOG$/m);
    for (const enabled of [false, true, false]) {
      f.point.setEnabled(enabled);
      const effect = await f.draw(f.fresh);
      assert.equal(effect === (enabled ? withPoint : withoutPoint), true);
      assert.equal(effect.getPipelineContext() === (enabled ? withContext : withoutContext), true);
    }
    assert.equal(withPoint.isDisposed, false);
    assert.equal(withoutPoint.isDisposed, false);
  });

  test(`Standard reflection null/cube lifecycle retains actual values and cube Effect reuse, textureLOD=${textureLOD}`, async t => {
    const f = fixture(t, textureLOD);
    f.material.reflectionTexture = null;
    const empty = await f.draw(f.warm);
    assert.doesNotMatch(empty.defines, /^#define REFLECTION$/m);
    f.material.reflectionTexture = f.cube;
    const reflected = await f.draw(f.warm);
    const context = reflected.getPipelineContext();
    assert.ok(context, "cube Effect owns a real pipeline context");
    assert.match(reflected.defines, /^#define REFLECTION$/m);
    assert.match(reflected.defines, /^#define USESPHERICALFROMREFLECTIONMAP$/m);
    assert.equal(/^#define LODBASEDMICROSFURACE$/m.test(reflected.defines), textureLOD);
    f.material.reflectionTexture = null;
    const removed = await f.draw(f.warm);
    assert.doesNotMatch(removed.defines, /^#define REFLECTION$/m);
    assert.doesNotMatch(removed.defines, /^#define USESPHERICALFROMREFLECTIONMAP$/m);
    // LOD's existing no-reflection reset semantics are outside this declaration
    // fix. Returning to the same cube must still reuse its complete variant.
    f.material.reflectionTexture = f.cube;
    const restored = await f.draw(f.warm);
    assert.equal(restored === reflected, true);
    assert.equal(restored.getPipelineContext() === context, true);
    assert.equal(restored.defines, reflected.defines);
    assert.equal(f.scene.textures.includes(f.cube), true);
    assert.equal(f.cube.isReady(), true);
  });
}
