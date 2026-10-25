import test from "node:test";
import assert from "node:assert/strict";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { FreeCamera } from "@babylonjs/core/Cameras/freeCamera";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";
import { ShadowGenerator } from "@babylonjs/core/Lights/Shadows/shadowGenerator";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { ShaderMaterial } from "@babylonjs/core/Materials/shaderMaterial";
import { ImageProcessingConfiguration } from "@babylonjs/core/Materials/imageProcessingConfiguration";
import {
  InternalTexture,
  InternalTextureSource,
} from "@babylonjs/core/Materials/Textures/internalTexture";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import {
  CinematicAtmosphere,
  campusShadowResponse,
  campusBloomResponse,
  snappedShadowFocus,
  readBoundBloomPixels,
} from "../client/cinematic";
import { renderBudget } from "../shared/render-quality";

// Only cube allocation is stubbed. These checks exercise Babylon's real light
// view/projection/caster callbacks; they are not GPU or visual evidence.
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

function fixture(t: import("node:test").TestContext) {
  const engine = new SceneEngine(),
    scene = new Scene(engine);
  scene.useRightHandedSystem = true;
  const camera = new FreeCamera("observer", new Vector3(0, 2, -4), scene);
  scene.activeCamera = camera;
  const light = new DirectionalLight(
    "one celestial key",
    new Vector3(-0.6, -0.8, 0),
    scene,
  );
  const atmosphere = new CinematicAtmosphere(scene, camera, light);
  const input = {
    dt: 0,
    player: { x: 0, y: 0, z: 0 },
    quality: "low",
    cloud: 0,
    rain: 0,
    daylight: 1,
    keySource: "sun" as const,
  };
  t.after(() => {
    atmosphere.dispose();
    scene.dispose();
    engine.dispose();
  });
  const filter = () => {
    scene.incrementRenderId();
    const map = light.getShadowGenerator()!.getShadowMap()!;
    return [
      ...map.getCustomRenderList!(0, map.renderList!, map.renderList!.length)!,
    ];
  };
  return { engine, scene, light, atmosphere, input, filter };
}

test("shadow contrast follows actual sun/moon irradiance, horizon and weather", () => {
  const sunny = campusShadowResponse("sun", -0.8, 1, 0);
  const fullMoon = campusShadowResponse("moon", -0.8, 0.025, 0);
  const faintMoon = campusShadowResponse("moon", -0.8, 0.003, 0);
  assert.ok(sunny.enabled && fullMoon.enabled);
  assert.ok(faintMoon.strength < fullMoon.strength / 5);
  for (const source of ["sun", "moon"] as const) {
    assert.equal(campusShadowResponse(source, 0.2, 1, 0).enabled, false);
    assert.equal(campusShadowResponse(source, 0, 1, 0).strength, 0);
    assert.equal(campusShadowResponse(source, -0.8, 0, 0).enabled, false);
    assert.equal(campusShadowResponse(source, -0.8, 1, 1).enabled, false);
    assert.equal(campusShadowResponse(source, Number.NaN, 1, 0).enabled, false);
    let previous = 1;
    for (let cloud = 0; cloud <= 1; cloud += 0.02) {
      const response = campusShadowResponse(source, -0.8, 1, cloud);
      assert.ok(response.strength <= previous);
      assert.ok(response.darkness >= 0 && response.darkness <= 1);
      previous = response.strength;
    }
  }
  assert.equal(campusShadowResponse("none", -1, 1, 0).enabled, false);
  assert.ok(
    campusShadowResponse("sun", -0.8, 1, 0, 8).strength < sunny.strength,
  );
  assert.ok(
    campusShadowResponse("sun", -0.01, 1, 0).strength < sunny.strength / 10,
  );
});

test("an explicitly masked key skips only the duplicate cloud attenuation and preserves legacy callers", () => {
  for (const source of ["sun", "moon"] as const) {
    const intensity = source === "sun" ? 0.8 : 0.025;
    const clear = campusShadowResponse(source, -0.8, intensity, 0, 2, true);
    for (const cloud of [0, 0.2, 0.5, 0.85, 1]) {
      assert.deepEqual(
        campusShadowResponse(source, -0.8, intensity, cloud, 2, true),
        clear,
      );
      assert.deepEqual(
        campusShadowResponse(source, -0.8, intensity, cloud, 2),
        campusShadowResponse(source, -0.8, intensity, cloud, 2, false),
      );
    }
    assert.equal(
      campusShadowResponse(source, -0.8, 0, 0, 0, true).enabled,
      false,
    );
    assert.equal(
      campusShadowResponse(source, 0.1, intensity, 0, 0, true).enabled,
      false,
    );
    assert.ok(
      campusShadowResponse(source, -0.8, intensity, 1, 8, true).strength <
        campusShadowResponse(source, -0.8, intensity, 1, 0, true).strength,
    );
  }
  assert.equal(
    campusShadowResponse("none", -0.8, 1, 0, 0, true).enabled,
    false,
  );
  assert.equal(campusShadowResponse("sun", -0.8, 1, 1).enabled, false);
  assert.equal(campusShadowResponse("sun", -0.8, 1, 1, 0, true).enabled, true);
});

test("cloud-mask crossings toggle and refresh the existing shadow map immediately for sun and moon", (t) => {
  const { scene, light, atmosphere, input, filter } = fixture(t);
  const caster = MeshBuilder.CreateBox(
    "cloud crossing caster",
    { size: 2 },
    scene,
  );
  caster.material = new StandardMaterial("cloud crossing opaque", scene);
  caster.metadata = { depthCaster: "opaque" };
  caster.position.set(0, 3, 0);
  atmosphere.update({ ...input, cloud: 1 });
  assert.equal(
    light.shadowEnabled,
    false,
    "omitted flag retains the coverage fallback",
  );
  const map = light.getShadowGenerator()!.getShadowMap();
  const textureCount = scene.textures.length;
  for (const keySource of ["sun", "moon"] as const) {
    for (const intensity of [
      keySource === "sun" ? 0.8 : 0.025,
      0,
      keySource === "sun" ? 0.7 : 0.02,
    ]) {
      light.intensity = intensity;
      atmosphere.update({
        ...input,
        cloud: 1,
        keySource,
        daylight: keySource === "sun" ? 1 : 0,
        cloudOcclusionApplied: true,
      });
      assert.equal(light.shadowEnabled, intensity > 0);
      assert.equal(
        atmosphere.stats.shadowSource,
        intensity > 0 ? keySource : "none",
      );
      assert.equal(light.getShadowGenerator()!.getShadowMap(), map);
      assert.equal(scene.textures.length, textureCount);
      if (intensity > 0)
        assert.ok(
          filter().includes(caster),
          "caster selection refreshes immediately without waiting for the 0.4 s cadence",
        );
      else assert.deepEqual(filter(), []);
    }
  }
});

test("one real Babylon map retargets solar to lunar ground projections immediately", (t) => {
  const { scene, light, atmosphere, input, filter } = fixture(t);
  const caster = MeshBuilder.CreateBox("caster", { size: 2 }, scene);
  caster.position.set(2, 6, -3);
  caster.material = new StandardMaterial("opaque", scene);
  caster.metadata = { depthCaster: "opaque" };
  caster.computeWorldMatrix(true);
  atmosphere.update(input);
  const generator = light.getShadowGenerator()!,
    map = generator.getShadowMap();
  assert.ok(filter().includes(caster));
  const solarMatrix = generator.getTransformMatrix().clone();
  const visits = atmosphere.stats.selectionMeshVisits;
  light.direction.set(0.6, -0.8, 0);
  light.intensity = 0.025;
  atmosphere.update({ ...input, daylight: 0, keySource: "moon" });
  assert.equal(light.getShadowGenerator(), generator);
  assert.equal(generator.getShadowMap(), map);
  assert.equal(
    scene.lights.length,
    1,
    "lunar shadows cannot reserve another light slot",
  );
  assert.equal(atmosphere.stats.shadowSource, "moon");
  assert.ok(
    atmosphere.stats.selectionMeshVisits > visits,
    "source switch refreshes immediately",
  );
  assert.ok(filter().includes(caster));
  const lunarMatrix = generator.getTransformMatrix();
  assert.ok(!lunarMatrix.equals(solarMatrix));
  const ground = caster.position.add(
    light.direction.scale(caster.position.y / -light.direction.y),
  );
  const fromCaster = Vector3.TransformCoordinates(caster.position, lunarMatrix);
  const fromGround = Vector3.TransformCoordinates(ground, lunarMatrix);
  assert.ok(Math.abs(fromCaster.x - fromGround.x) < 1e-6);
  assert.ok(Math.abs(fromCaster.y - fromGround.y) < 1e-6);
  assert.ok(Math.abs(fromCaster.z - fromGround.z) > 0.001);
  const staleGround = Vector3.TransformCoordinates(ground, solarMatrix);
  const staleCaster = Vector3.TransformCoordinates(
    caster.position,
    solarMatrix,
  );
  assert.ok(
    Math.hypot(staleGround.x - staleCaster.x, staleGround.y - staleCaster.y) >
      0.01,
  );
  assert.equal(
    scene.imageProcessingConfiguration.toneMappingType,
    ImageProcessingConfiguration.TONEMAPPING_ACES,
  );
  assert.equal(scene.imageProcessingConfiguration.applyByPostProcess, false);
  assert.ok(scene.imageProcessingConfiguration.exposure < 1.2);
  light.direction.y = 0.1;
  atmosphere.update({ ...input, daylight: 0, keySource: "moon" });
  assert.equal(light.shadowEnabled, false);
  assert.equal(atmosphere.stats.shadowSource, "none");
  assert.deepEqual(filter(), []);
  const nightVisits = atmosphere.stats.selectionMeshVisits;
  for (let i = 0; i < 10; i++)
    atmosphere.update({ ...input, dt: 0.1, daylight: 0, keySource: "none" });
  assert.equal(atmosphere.stats.selectionMeshVisits, nightVisits);
});

test("quality keeps the same map budgets/PCF and bounded night bloom without another exposure pass", (t) => {
  const { engine, scene, light, atmosphere, input } = fixture(t);
  for (const quality of ["high", "medium", "low"]) {
    atmosphere.update({
      ...input,
      quality,
      daylight: 0,
      keySource: "none",
      rain: 8,
    });
    const generator = light.getShadowGenerator() as ShadowGenerator;
    assert.equal(generator.mapSize, renderBudget(quality).shadowMapSize);
    assert.equal(
      generator.filter,
      engine._features.supportShadowSamplers
        ? ShadowGenerator.FILTER_PCF
        : ShadowGenerator.FILTER_POISSONSAMPLING,
      "the real engine selects PCF or its documented capability fallback",
    );
    assert.equal(generator.useContactHardeningShadow, false);
    assert.ok(generator.getShadowMap()!.getCustomRenderList);
    assert.equal(scene.imageProcessingConfiguration.applyByPostProcess, false);
    if (quality === "low") assert.equal(atmosphere.stats.bloomWeight, 0);
    else {
      assert.ok(atmosphere.stats.bloomThreshold >= 0.88);
      assert.ok(atmosphere.stats.bloomWeight <= 0.13);
    }
  }
  assert.ok(
    campusBloomResponse(0).threshold < campusBloomResponse(1).threshold,
  );
  assert.deepEqual(
    campusBloomResponse(-10, Infinity),
    campusBloomResponse(0, 0),
  );
});

test("removed wind materials release only the shadow wrapper owned by this atmosphere", async (t) => {
  const { scene, atmosphere, input, filter } = fixture(t);
  const material = new ShaderMaterial("wind leaves", scene, "unused", {
    attributes: ["position"],
    uniforms: ["worldViewProjection"],
    needAlphaTesting: true,
  });
  const caster = MeshBuilder.CreateBox("leaves", {}, scene);
  caster.position.y = 3;
  caster.material = material;
  caster.metadata = { depthCaster: "alpha-test", windDeformed: true };
  atmosphere.update({ ...input, quality: "medium" });
  assert.ok(filter().includes(caster));
  const wrapper = material.shadowDepthWrapper!;
  assert.ok(wrapper);
  let disposals = 0;
  const dispose = wrapper.dispose.bind(wrapper);
  wrapper.dispose = () => {
    disposals++;
    dispose();
  };
  material.dispose();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(disposals, 1);
  assert.equal(material.shadowDepthWrapper, null);
  atmosphere.dispose();
  assert.equal(
    disposals,
    1,
    "a removed material cannot remain retained for a second teardown",
  );
});

test("allocation-free live snapping retains Babylon transverse projections at solar/lunar/zenith angles", () => {
  const player = new Vector3(19.263, 5.824, -17.768);
  for (const direction of [
    Vector3.Down(),
    new Vector3(-0.95, -0.02, 0.3),
    new Vector3(0.37, -0.65, -0.5),
  ]) {
    const result = snappedShadowFocus(player, direction, 1024);
    const normal = direction.normalizeToNew();
    const right = Vector3.Cross(
      Math.abs(normal.y) > 0.98 ? Vector3.Forward() : Vector3.Up(),
      normal,
    ).normalize();
    const up = Vector3.Cross(normal, right).normalize();
    const focus = player.add(new Vector3(0, 3, 0));
    assert.ok(
      Math.abs(Vector3.Dot(result.focus.subtract(focus), normal)) < 1e-10,
    );
    for (const axis of [right, up]) {
      const projected = Vector3.Dot(result.focus, axis) / result.texel;
      assert.ok(Math.abs(projected - Math.round(projected)) < 1e-9);
    }
  }
});

test("explicit bloom diagnostics observe one frame, coalesce requests and remove all capture observers", async (t) => {
  const { scene, atmosphere, input } = fixture(t);
  atmosphere.update({ ...input, quality: "medium" });
  const camera = scene.activeCamera!;
  const posts = camera._postProcesses.filter((post) => post !== null);
  assert.match(posts[0].name, /^campus bloom highlights /);
  assert.deepEqual(
    posts.slice(1).map((post) => post.name),
    ["horizontal blur", "vertical blur", "bloomMerge", "fxaa"],
  );
  const before = posts.map((post) => [
    post.onBeforeRenderObservable.hasObservers(),
    post.onAfterRenderObservable.hasObservers(),
  ]);
  const report = atmosphere.captureDiagnostics();
  assert.equal(atmosphere.captureDiagnostics(), report);
  scene.onBeforeRenderObservable.notifyObservers(scene);
  scene.onAfterDrawPhaseObservable.notifyObservers(scene);
  for (const post of posts) {
    post.onBeforeRenderObservable.notifyObservers(post.getEffect());
    post.onAfterRenderObservable.notifyObservers(post.getEffect());
  }
  scene.onAfterRenderObservable.notifyObservers(scene);
  const captured = await report;
  assert.equal(captured.status, "captured");
  assert.equal(captured.passes.length, 5);
  assert.ok(captured.sceneSource);
  assert.ok(captured.passes.every((pass) => pass.before && pass.after));
  assert.doesNotThrow(() => JSON.stringify(captured));
  assert.deepEqual(
    posts.map((post) => [
      post.onBeforeRenderObservable.hasObservers(),
      post.onAfterRenderObservable.hasObservers(),
    ]),
    before,
  );
  assert.deepEqual(
    camera._postProcesses.filter((post) => post !== null),
    posts,
    "capture never rebuilds or detaches the pipeline",
  );
});

test("bound-framebuffer probes use only advertised RGBA types and preserve packing/framebuffer state", () => {
  const constants = {
    IMPLEMENTATION_COLOR_READ_FORMAT: 1,
    IMPLEMENTATION_COLOR_READ_TYPE: 2,
    READ_FRAMEBUFFER_BINDING: 3,
    DRAW_FRAMEBUFFER_BINDING: 4,
    READ_FRAMEBUFFER: 5,
    FRAMEBUFFER_COMPLETE: 6,
    PIXEL_PACK_BUFFER_BINDING: 7,
    PACK_ROW_LENGTH: 8,
    PACK_SKIP_PIXELS: 9,
    PACK_SKIP_ROWS: 10,
    RGBA: 6408,
    UNSIGNED_BYTE: 5121,
    FLOAT: 5126,
    HALF_FLOAT: 5131,
    SAMPLES: 11,
  };
  const framebuffer = {};
  const make = (type: number, overrides: Record<number, unknown> = {}) => {
    const calls: unknown[][] = [];
    const state: Record<number, unknown> = {
      1: constants.RGBA,
      2: type,
      3: framebuffer,
      4: framebuffer,
      7: null,
      8: 0,
      9: 0,
      10: 0,
      11: 0,
      ...overrides,
    };
    const gl = {
      ...constants,
      getParameter: (name: number) => state[name],
      checkFramebufferStatus: () => constants.FRAMEBUFFER_COMPLETE,
      readPixels: (
        x: number,
        y: number,
        width: number,
        height: number,
        format: number,
        requestedType: number,
        destination: Uint8Array | Uint16Array | Float32Array,
      ) => {
        calls.push([
          x,
          y,
          width,
          height,
          format,
          requestedType,
          destination.constructor.name,
        ]);
        destination.set(
          type === constants.UNSIGNED_BYTE
            ? [255, 128, 0, 255]
            : type === constants.HALF_FLOAT
              ? [0x3c00, 0x3800, 0, 0x3c00]
              : [1, 0.5, 0, 1],
        );
      },
    } as unknown as WebGL2RenderingContext;
    return { gl, calls, state };
  };
  for (const type of [
    constants.UNSIGNED_BYTE,
    constants.FLOAT,
    constants.HALF_FLOAT,
  ]) {
    const { gl, calls, state } = make(type);
    const before = { ...state };
    const result = readBoundBloomPixels(gl, 1260, 702);
    assert.equal(result.samples.length, 15);
    assert.equal(calls.length, 15);
    assert.deepEqual(result.samples[0].xy, [126, 631]);
    assert.deepEqual(result.samples[0].rgba, [
      1,
      type === constants.UNSIGNED_BYTE ? 128 / 255 : 0.5,
      0,
      1,
    ]);
    assert.deepEqual(state, before);
    assert.ok(
      calls.every((call) => call[2] === 1 && call[3] === 1 && call[5] === type),
    );
  }
  for (const overrides of [
    { 1: 0 },
    { 2: 0 },
    { 4: {} },
    { 7: {} },
    { 8: 1 },
    { 9: 1 },
    { 10: 1 },
    { 11: 4 },
  ]) {
    const { gl, calls } = make(constants.FLOAT, overrides);
    assert.ok(readBoundBloomPixels(gl, 1260, 702).skipped);
    assert.equal(
      calls.length,
      0,
      "unsupported reads never probe by causing GL errors",
    );
  }
});

test("bloom diagnostics timeout/disposal are bounded and do not wait for or submit a frame", async (t) => {
  const { scene, atmosphere, input } = fixture(t);
  assert.equal((await atmosphere.captureDiagnostics()).status, "no-pipeline");
  atmosphere.update({ ...input, quality: "medium" });
  const posts = scene.activeCamera!._postProcesses.filter(
    (post) => post !== null,
  );
  const timeout = await atmosphere.captureDiagnostics({ timeoutMs: 1 });
  assert.equal(timeout.status, "timeout");
  assert.equal(timeout.frameId, null);
  assert.ok(timeout.passes.every((pass) => !pass.before && !pass.after));
  assert.ok(
    posts.every(
      (post) =>
        !post.onBeforeRenderObservable.hasObservers() &&
        !post.onAfterRenderObservable.hasObservers(),
    ),
  );
  const pending = atmosphere.captureDiagnostics();
  atmosphere.dispose();
  assert.equal((await pending).status, "disposed");
  assert.equal((await atmosphere.captureDiagnostics()).status, "disposed");
});
