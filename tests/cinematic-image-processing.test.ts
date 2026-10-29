import test, { type TestContext } from "node:test";
import assert from "node:assert/strict";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { FreeCamera } from "@babylonjs/core/Cameras/freeCamera";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { ImageProcessingConfiguration } from "@babylonjs/core/Materials/imageProcessingConfiguration";
import {
  InternalTexture,
  InternalTextureSource,
} from "@babylonjs/core/Materials/Textures/internalTexture";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { PostProcess } from "@babylonjs/core/PostProcesses/postProcess";
import { CinematicAtmosphere } from "../client/cinematic";

// NullEngine has no GL cube allocator. Only that allocation is substituted;
// controller, materials, pipeline, config/defines and camera operations are real.
class SceneEngine extends NullEngine {
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

// Babylon9.30 exposes public attach/detach methods, but no public chain getter.
// Observe those actual calls instead of changing the camera or reading internals.
class ObservedCamera extends FreeCamera {
  readonly attached = new Set<PostProcess>();
  override attachPostProcess(
    ...args: Parameters<FreeCamera["attachPostProcess"]>
  ) {
    const position = super.attachPostProcess(...args);
    if (position >= 0) this.attached.add(args[0]);
    return position;
  }
  override detachPostProcess(postProcess: PostProcess) {
    super.detachPostProcess(postProcess);
    this.attached.delete(postProcess);
  }
}

const flushObservers = () =>
  new Promise<void>((resolve) => setTimeout(resolve, 5));
type LitMaterial = StandardMaterial | PBRMaterial;
function materialDefines(material: LitMaterial) {
  const defines = {} as Parameters<
    ImageProcessingConfiguration["prepareDefines"]
  >[0];
  material.imageProcessingConfiguration.prepareDefines(defines, false);
  return defines;
}
function fixture(t: TestContext) {
  const engine = new SceneEngine(),
    scene = new Scene(engine);
  scene.useRightHandedSystem = true;
  const camera = new ObservedCamera(
    "image-contract",
    new Vector3(0, 2, -4),
    scene,
  );
  scene.activeCamera = camera;
  const light = new DirectionalLight("celestial", new Vector3(0, -1, 0), scene);
  const materials = [
    new StandardMaterial("standard", scene),
    new PBRMaterial("pbr", scene),
  ];
  const baseline = {
    postProcesses: engine.postProcesses.length,
    textures: scene.textures.length,
    materials: scene.materials.length,
    imageObservers:
      scene.imageProcessingConfiguration.onUpdateParameters.observers.length,
    resizeObservers: engine.onResizeObservable.observers.length,
  };
  const atmosphere = new CinematicAtmosphere(scene, camera, light);
  t.after(() => {
    atmosphere.dispose();
    scene.dispose();
    engine.dispose();
  });
  const update = (quality: "low" | "medium" | "high", daylight = 0) =>
    atmosphere.update({
      quality,
      daylight,
      dt: 0,
      cloud: 0,
      rain: 0,
      player: { x: 0, y: 0, z: 0 },
      keySource: "none",
    });
  return {
    engine,
    scene,
    camera,
    light,
    atmosphere,
    materials,
    baseline,
    update,
  };
}
function assertMaterialProcessing(
  scene: Scene,
  materials: LitMaterial[],
  expectedExposure: number,
) {
  const config = scene.imageProcessingConfiguration;
  assert.equal(
    config.isEnabled,
    true,
    "scene material image processing remains enabled",
  );
  assert.equal(
    config.applyByPostProcess,
    false,
    "materials own the color transform",
  );
  assert.equal(
    config.toneMappingType,
    ImageProcessingConfiguration.TONEMAPPING_ACES,
  );
  assert.ok(Math.abs(config.exposure - expectedExposure) < 1e-12);
  for (const material of materials) {
    assert.equal(material.imageProcessingConfiguration, config);
    const defines = materialDefines(material);
    assert.equal(defines.IMAGEPROCESSING, true, material.name);
    assert.equal(defines.IMAGEPROCESSINGPOSTPROCESS, false, material.name);
    assert.equal(defines.TONEMAPPING, 2, material.name);
    assert.equal(defines.EXPOSURE, true, material.name);
    assert.equal(defines.CONTRAST, true, material.name);
    assert.equal(defines.COLORCURVES, true, material.name);
  }
}
function assertCameraPasses(
  camera: ObservedCamera,
  quality: "low" | "medium" | "high",
) {
  const passes = [...camera.attached];
  assert.ok(
    passes.every(
      (pass) => pass.getClassName() !== "ImageProcessingPostProcess",
    ),
    "no fullscreen image processing is attached to the display-space scene",
  );
  if (quality === "low") assert.equal(passes.length, 0);
  else {
    assert.ok(
      passes.some((pass) => pass.getClassName() === "FxaaPostProcess"),
      "FXAA remains attached",
    );
    assert.ok(
      passes.some((pass) => /bloom/i.test(pass.name)),
      "bloom remains attached",
    );
  }
}

for (const firstQuality of ["low", "medium", "high"] as const) {
  test(`${firstQuality}-first keeps actual Standard/PBR ACES defines without a fullscreen color pass`, (t) => {
    const { scene, camera, materials, update } = fixture(t);
    update(firstQuality);
    assertMaterialProcessing(scene, materials, 1.18);
    assertCameraPasses(camera, firstQuality);
  });
}

test("quality transitions and low exposure updates keep effective processing and bounded resources", async (t) => {
  const { scene, engine, camera, materials, update } = fixture(t);
  update("high");
  await flushObservers();
  assertMaterialProcessing(scene, materials, 1.18);
  const ceiling = {
    effects: engine.postProcesses.length,
    imageObservers:
      scene.imageProcessingConfiguration.onUpdateParameters.observers.length,
    resizeObservers: engine.onResizeObservable.observers.length,
    textures: scene.textures.length,
  };
  for (let cycle = 0; cycle < 3; cycle++) {
    for (const quality of ["low", "medium", "high"] as const) {
      const daylight = cycle % 2;
      update(quality, daylight);
      assertMaterialProcessing(scene, materials, daylight ? 1.08 : 1.18);
      assertCameraPasses(camera, quality);
      if (quality === "low") {
        update("low", 1 - daylight);
        assertMaterialProcessing(scene, materials, daylight ? 1.18 : 1.08);
        assertCameraPasses(camera, "low");
      }
      await flushObservers();
      assert.ok(engine.postProcesses.length <= ceiling.effects);
      assert.ok(scene.textures.length <= ceiling.textures);
      assert.ok(
        scene.imageProcessingConfiguration.onUpdateParameters.observers
          .length <= ceiling.imageObservers,
      );
      assert.ok(
        engine.onResizeObservable.observers.length <= ceiling.resizeObservers,
      );
    }
  }
});

test("explicit owner material configuration is retained through quality and exposure changes", (t) => {
  const { scene, camera, materials, update } = fixture(t);
  const own = new ImageProcessingConfiguration();
  own.exposure = 0.75;
  own.contrast = 1.04;
  own.toneMappingEnabled = true;
  own.toneMappingType = ImageProcessingConfiguration.TONEMAPPING_STANDARD;
  const standard = new StandardMaterial("explicit standard", scene);
  const pbr = new PBRMaterial("explicit pbr", scene);
  for (const material of [standard, pbr])
    material.imageProcessingConfiguration = own;
  const expected = materialDefines(standard);
  for (const quality of ["medium", "low", "high"] as const) {
    update(quality, 1);
    assertMaterialProcessing(scene, materials, 1.08);
    assertCameraPasses(camera, quality);
    for (const material of [standard, pbr]) {
      assert.equal(material.imageProcessingConfiguration, own);
      assert.deepEqual(materialDefines(material), expected);
      assert.equal(own.exposure, 0.75);
      assert.equal(own.contrast, 1.04);
      assert.equal(own.applyByPostProcess, false);
    }
  }
});

for (const finalQuality of ["low", "high"] as const) {
  test(`dispose from ${finalQuality} releases owned effects/textures/observers and leaves material config usable`, async (t) => {
    const { scene, engine, camera, atmosphere, materials, baseline, update } =
      fixture(t);
    update("medium");
    update(finalQuality);
    assertMaterialProcessing(scene, materials, 1.18);
    atmosphere.dispose();
    atmosphere.dispose();
    await flushObservers();
    assert.equal(camera.attached.size, 0);
    assert.equal(engine.postProcesses.length, baseline.postProcesses);
    assert.equal(scene.textures.length, baseline.textures);
    assert.equal(scene.materials.length, baseline.materials);
    assert.equal(
      scene.imageProcessingConfiguration.onUpdateParameters.observers.length,
      baseline.imageObservers,
    );
    assert.equal(
      engine.onResizeObservable.observers.length,
      baseline.resizeObservers,
    );
    assert.equal(scene.environmentTexture, null);
    scene.imageProcessingConfiguration.exposure = 1.08;
    await flushObservers();
    assertMaterialProcessing(scene, materials, 1.08);
    assert.equal(camera.attached.size, 0);
    assert.equal(engine.postProcesses.length, baseline.postProcesses);
  });
}
