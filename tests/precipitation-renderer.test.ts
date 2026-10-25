import test from "node:test";
import assert from "node:assert/strict";
import { setImmediate as turn } from "node:timers/promises";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { FreeCamera } from "@babylonjs/core/Cameras/freeCamera";
import {
  Matrix,
  Vector2,
  Vector3,
  Vector4,
} from "@babylonjs/core/Maths/math.vector";
import { ShaderMaterial } from "@babylonjs/core/Materials/shaderMaterial";
import { ShaderLanguage } from "@babylonjs/core/Materials/shaderLanguage";
import { Constants } from "@babylonjs/core/Engines/constants";
import { ShaderStore } from "@babylonjs/core/Engines/shaderStore";
import { WebGPUShaderProcessorWGSL } from "@babylonjs/core/Engines/WebGPU/webgpuShaderProcessorsWGSL";
import { WebGPUShaderProcessingContext } from "@babylonjs/core/Engines/WebGPU/webgpuShaderProcessingContext";
import {
  Initialize,
  Process,
  Finalize,
} from "@babylonjs/core/Engines/Processors/shaderProcessor";
import type { _IProcessingOptions } from "@babylonjs/core/Engines/Processors/shaderProcessingOptions";
import {
  PrecipitationRenderer,
  PRECIPITATION_BUDGET,
  PRECIPITATION_SHADERS,
  projectedPrecipitationVelocityToRef,
  type PrecipitationFrame,
} from "../client/precipitation-renderer";
import { precipitationAppearance } from "../client/weather-particles";
import {
  createWeatherScenario,
  WEATHER_SCENARIOS,
} from "../shared/weather-scenarios";
import { windVector } from "../shared/weather";

test("rain tangent and extent match actual perspective motion at +/-85 degrees and off axis", () => {
  const projection = Matrix.PerspectiveFovRH(0.9, 16 / 9, 0.1, 200),
    velocityWorld = new Vector3(0, -11, 0);
  let oldAngleError = 0;
  for (const degrees of [-85, 0, 85])
    for (const center of [
      new Vector3(3, 0, -10),
      new Vector3(-4, 2, -8),
      new Vector3(0, 0, -10),
    ]) {
      const pitch = (degrees * Math.PI) / 180;
      const view = Matrix.LookAtRH(
        Vector3.Zero(),
        new Vector3(0, Math.sin(pitch), Math.cos(pitch)),
        Vector3.Up(),
      );
      const viewProjection = view.multiply(projection);
      const worldCenter = Vector3.TransformCoordinates(
        center,
        view.clone().invert(),
      );
      const velocity = Vector3.TransformNormal(velocityWorld, view),
        flow = new Vector2();
      assert.equal(
        projectedPrecipitationVelocityToRef(center, velocity, projection, flow),
        true,
      );
      const epsilon = 0.0001;
      // Independent oracle: actually move the world point and project through the
      // native Babylon LookAtRH/PerspectiveFovRH matrix, rather than repeat the derivative.
      const plus = Vector3.TransformCoordinates(
        worldCenter.add(velocityWorld.scale(epsilon)),
        viewProjection,
      );
      const minus = Vector3.TransformCoordinates(
        worldCenter.subtract(velocityWorld.scale(epsilon)),
        viewProjection,
      );
      const measured = new Vector2(
        (plus.x - minus.x) / (2 * epsilon),
        (plus.y - minus.y) / (2 * epsilon),
      );
      const clip = Vector4.TransformCoordinates(center, projection);
      const predicted = new Vector2(
        (flow.x * projection.m[0]) / clip.w,
        (flow.y * projection.m[5]) / clip.w,
      );
      assert.ok(
        Vector2.Distance(measured, predicted) < 2e-6,
        `${degrees}° ${center.toString()}: projected derivative must match actual displacement`,
      );
      // Project the resulting billboard's longitudinal offset too: both direction
      // and streak extent must follow the same moving-point displacement.
      const shutter = 0.16 / velocityWorld.length();
      const end = Vector3.TransformCoordinates(
        center.add(new Vector3(flow.x * shutter, flow.y * shutter, 0)),
        projection,
      );
      const start = Vector3.TransformCoordinates(
        center.subtract(new Vector3(flow.x * shutter, flow.y * shutter, 0)),
        projection,
      );
      assert.ok(Math.abs(end.x - start.x - measured.x * shutter * 2) < 2e-6);
      assert.ok(Math.abs(end.y - start.y - measured.y * shutter * 2) < 2e-6);
      if (degrees === -85 && center.x === 3) {
        const old = new Vector2(
          (velocity.x * projection.m[0]) / clip.w,
          (velocity.y * projection.m[5]) / clip.w,
        );
        oldAngleError =
          (Math.acos(
            Vector2.Dot(old.normalize(), measured.clone().normalize()),
          ) *
            180) /
          Math.PI;
        assert.ok(
          oldAngleError > 60,
          "fixture must expose the original mostly vertical but actually oblique streak",
        );
        assert.ok(
          (0.16 * flow.length()) / velocity.length() >
            ((0.16 * Math.hypot(velocity.x, velocity.y)) / velocity.length()) *
              3,
        );
      }
    }
  assert.ok(oldAngleError > 60);
  for (const shader of Object.values(PRECIPITATION_SHADERS))
    assert.match(
      shader.vertexSource,
      /clipVelocity\.xy - clipCenter\.xy \* \(clipVelocity\.w \/ clipCenter\.w\)/,
    );
});

test("projected flow handles orthographic projection and rejects near/behind/non-finite homogeneous inputs", () => {
  const perspective = Matrix.PerspectiveFovRH(0.9, 1.5, 0.1, 100),
    flow = new Vector2(99, 99);
  for (const center of [
    new Vector3(3, 0, -0.01),
    Vector3.Zero(),
    new Vector3(3, 0, 2),
    new Vector3(NaN, 0, -10),
  ]) {
    assert.equal(
      projectedPrecipitationVelocityToRef(
        center,
        new Vector3(0, -11, -1),
        perspective,
        flow,
      ),
      false,
    );
    assert.deepEqual(flow.asArray(), [0, 0]);
  }
  assert.equal(
    projectedPrecipitationVelocityToRef(
      new Vector3(3, 0, -10),
      new Vector3(Infinity, 0, 0),
      perspective,
      flow,
    ),
    false,
  );
  const ortho = Matrix.OrthoOffCenterRH(-10, 10, -5, 5, 0.1, 100);
  assert.equal(
    projectedPrecipitationVelocityToRef(
      new Vector3(3, 2, -10),
      new Vector3(2, -11, 8),
      ortho,
      flow,
    ),
    true,
  );
  assert.deepEqual(flow.asArray(), [2, -11]);
  assert.equal(
    projectedPrecipitationVelocityToRef(
      new Vector3(3, 0, -10),
      new Vector3(0, -11, 0),
      Matrix.Zero(),
      flow,
    ),
    false,
  );
  assert.deepEqual(flow.asArray(), [0, 0]);
});

function fixture(t: import("node:test").TestContext, native = false) {
  const engine = new NullEngine();
  (engine as unknown as { _isWebGPU: boolean })._isWebGPU = native;
  const scene = new Scene(engine);
  scene.useRightHandedSystem = true;
  const camera = new FreeCamera(
    "precipitation camera",
    new Vector3(0, 2, -4),
    scene,
  );
  camera.setTarget(new Vector3(0, 2, 0));
  const renderer = new PrecipitationRenderer(scene);
  const material = renderer.mesh.material as ShaderMaterial;
  t.after(() => {
    renderer.dispose();
    scene.dispose();
    engine.dispose();
  });
  const input: PrecipitationFrame = {
    dt: 0,
    weather: { rain: 12, precipitationType: "rain" },
    wind: { x: 0, z: 0 },
    position: { x: 0, y: 0, z: 0 },
    quality: "medium",
    illumination: 1,
    outside: true,
  };
  return { engine, scene, renderer, material, input };
}
function positions(renderer: PrecipitationRenderer) {
  return renderer.mesh.getVerticesData("position")!;
}
function shapes(renderer: PrecipitationRenderer) {
  return renderer.mesh.getVerticesData("shape")!;
}
function preparedEffect(renderer: PrecipitationRenderer) {
  return renderer.mesh.subMeshes[0]._getDrawWrapper(
    renderer.mesh.getScene().activeCamera!.renderPassId,
  )?.effect;
}
async function prepare(renderer: PrecipitationRenderer) {
  const deadline = performance.now() + 3000;
  while (!renderer.prepare() && performance.now() < deadline) await turn();
  assert.equal(
    renderer.prepare(),
    true,
    "real ShaderMaterial should compile while clear/disabled",
  );
}

test("bounded families retain provenance and give snow, drizzle, hail and mixed precipitation distinct quads", (t) => {
  const { scene, renderer, input } = fixture(t);
  const mesh = renderer.mesh,
    positionBuffer = mesh.getVertexBuffer("position"),
    shapeBuffer = mesh.getVertexBuffer("shape"),
    material = mesh.material;
  for (const scenario of WEATHER_SCENARIOS) {
    const weather = createWeatherScenario(scenario.id, 1234),
      before = JSON.stringify(weather);
    const appearance = precipitationAppearance(weather);
    for (const quality of ["low", "medium", "high"] as const) {
      renderer.update({ ...input, weather, quality });
      assert.equal(
        renderer.activeCount,
        Math.ceil(PRECIPITATION_BUDGET[quality] * appearance.density),
      );
      assert.equal(mesh.subMeshes[0].indexCount, renderer.activeCount * 6);
      assert.equal(mesh.isEnabled(), appearance.density > 0);
      const data = shapes(renderer);
      let snow = 0,
        liquid = 0;
      for (let i = 0; i < renderer.activeCount; i++) {
        const p = i * 16,
          expectedSnow = (i * 0.61803398875) % 1 < appearance.snowFraction;
        assert.equal(
          data[p + 2],
          expectedSnow ? 1 : appearance.hail ? 2 : appearance.drizzle ? 3 : 0,
        );
        if (expectedSnow) {
          snow++;
          assert.ok(data[p] <= 0.018001);
          assert.ok(data[p + 1] <= 0.018001);
        } else liquid++;
        assert.ok(data[p] > 0 && data[p + 1] <= 0.326 && data[p + 3] > 0);
      }
      if (scenario.id === "mixed") assert.ok(snow > 0 && liquid > 0);
      assert.equal(
        JSON.stringify(weather),
        before,
        "rendering cannot relabel DEMO or mutate provider fields",
      );
    }
  }
  const unclassified = {
    ...createWeatherScenario("rain", 0),
    temperature: -20,
    precipitationType: undefined,
    snowfall: 0,
  };
  renderer.update({ ...input, weather: unclassified });
  assert.equal(
    shapes(renderer)[2],
    0,
    "temperature alone cannot manufacture snow",
  );
  assert.equal(scene.meshes.length, 1);
  assert.equal(scene.materials.length, 1);
  assert.equal(scene.textures.length, 0);
  assert.equal(mesh.material, material);
  assert.equal(mesh.getVertexBuffer("position"), positionBuffer);
  assert.equal(mesh.getVertexBuffer("shape"), shapeBuffer);
});

test("world wind already converted from FROM moves rain downwind while camera translation does not drag particles", (t) => {
  const { renderer, input } = fixture(t);
  renderer.update(input);
  const before = positions(renderer).slice(0, 3),
    wind = windVector(10, 270);
  renderer.update({ ...input, dt: 0.05, wind });
  const after = positions(renderer);
  assert.ok(wind.x > 0);
  assert.ok(Math.abs(after[0] - before[0] - wind.x * 0.55 * 0.05) < 2e-6);
  assert.ok(Math.abs(after[1] - before[1] + 11 * 0.05) < 2e-6);
  const world = [after[0], after[1], after[2]];
  renderer.update({ ...input, position: { x: 0.25, y: 0.2, z: -0.3 } });
  const moved = positions(renderer),
    origin = renderer.mesh.position;
  assert.ok(Math.abs(moved[0] + origin.x - world[0]) < 2e-6);
  assert.ok(Math.abs(moved[1] + origin.y - world[1]) < 2e-6);
  assert.ok(Math.abs(moved[2] + origin.z - world[2]) < 2e-6);
});

test("dt, wraps, teleports, quality and indoor resets preserve compact independent quads inside fixed bounds", (t) => {
  const a = fixture(t),
    b = fixture(t);
  a.renderer.update(a.input);
  b.renderer.update(b.input);
  a.renderer.update({ ...a.input, dt: 100 });
  b.renderer.update({ ...b.input, dt: 0.1 });
  assert.deepEqual(
    positions(a.renderer),
    positions(b.renderer),
    "large gaps are bounded, not enormous falling steps",
  );
  for (let frame = 0; frame < 90; frame++) {
    a.renderer.update({
      ...a.input,
      dt: 0.1,
      wind: { x: 70, z: -70 },
      position: { x: frame === 40 ? 1000 : 0, y: frame % 4, z: 0 },
      quality: frame % 2 ? "high" : "low",
    });
    const data = positions(a.renderer);
    for (let i = 0; i < a.renderer.activeCount; i++) {
      const p = i * 12;
      assert.ok(
        data[p] >= -10 &&
          data[p] <= 10 &&
          data[p + 1] >= -2 &&
          data[p + 1] <= 10 &&
          data[p + 2] >= -10 &&
          data[p + 2] <= 10,
      );
      for (let v = 1; v < 4; v++)
        for (let c = 0; c < 3; c++)
          assert.equal(
            data[p + v * 3 + c],
            data[p + c],
            "one center drives all corners after wrapping",
          );
    }
  }
  a.renderer.update({ ...a.input, outside: false });
  assert.equal(a.renderer.activeCount, 0);
  assert.equal(a.renderer.mesh.isEnabled(), false);
  a.renderer.update({
    ...a.input,
    position: { x: -2000, y: 100, z: 500 },
    weather: createWeatherScenario("snow-heavy", 0),
  });
  assert.ok(a.renderer.activeCount > 160);
  assert.equal(a.renderer.mesh.isEnabled(), true);
  a.renderer.mesh.computeWorldMatrix(true);
  const box = a.renderer.mesh.getBoundingInfo().boundingBox;
  assert.equal(box.minimum.x, -11);
  assert.equal(box.minimum.y, -3);
  assert.equal(box.maximum.y, 11);
  assert.equal(box.centerWorld.x, -2000);
  assert.equal(box.centerWorld.z, 500);
  a.renderer.update({ ...a.input, position: { x: NaN, y: 0, z: 0 } });
  assert.equal(a.renderer.mesh.isEnabled(), false);
});

test("ordinary animation reuses buffers and issues one retained position upload, with no per-family material variants", async (t) => {
  const f = fixture(t);
  f.engine.currentRenderPassId = 901;
  await prepare(f.renderer);
  assert.equal(
    f.engine.currentRenderPassId,
    901,
    "readiness must restore its caller's render pass",
  );
  assert.equal(
    f.renderer.mesh.isEnabled(),
    false,
    "clear prewarm must not display precipitation",
  );
  const effect = preparedEffect(f.renderer);
  assert.ok(effect);
  assert.doesNotMatch(effect.defines, /LIGHT\d|SHADOW\d/);
  const pos = positions(f.renderer),
    shape = shapes(f.renderer),
    index = f.renderer.mesh.getIndices();
  f.renderer.update(f.input);
  let uploads = 0;
  const original = f.engine.updateDynamicVertexBuffer.bind(f.engine);
  t.mock.method(
    f.engine,
    "updateDynamicVertexBuffer",
    (...args: Parameters<NullEngine["updateDynamicVertexBuffer"]>) => {
      uploads++;
      assert.equal(args[1], pos);
      return original(...args);
    },
  );
  const animation = { ...f.input, dt: 0.016 };
  for (let frame = 0; frame < 20; frame++) f.renderer.update(animation);
  assert.equal(uploads, 20);
  assert.equal(positions(f.renderer), pos);
  assert.equal(shapes(f.renderer), shape);
  assert.equal(f.renderer.mesh.getIndices(), index);
  t.mock.restoreAll();
  for (const id of [
    "snow-heavy",
    "hail",
    "drizzle",
    "mixed",
    "clear",
  ] as const) {
    f.renderer.update({ ...f.input, weather: createWeatherScenario(id, 0) });
    assert.equal(f.renderer.prepare(), true);
    assert.equal(preparedEffect(f.renderer), effect);
  }
  assert.equal(f.material.alphaMode, Constants.ALPHA_COMBINE);
  assert.equal(f.material.disableDepthWrite, true);
  assert.equal(f.material.disableColorWrite, false);
  assert.equal(f.material.depthFunction, 0);
  assert.equal(f.material.needAlphaBlending(), true);
  assert.equal(f.renderer.mesh.renderingGroupId, 0);
  assert.equal(f.scene.lights.length, 0);
  assert.equal(f.scene.particleSystems.length, 0);
});

test("cold clear preparation and wet/clear/move transitions submit bounded batches", async (t) => {
  const f = fixture(t);
  await prepare(f.renderer);
  const effect = preparedEffect(f.renderer);
  const counts: number[] = [];
  t.mock.method(
    f.engine,
    "drawElementsType",
    (_fill: number, _start: number, count: number) => {
      counts.push(count);
    },
  );
  for (let frame = 0; frame < 3; frame++) {
    f.renderer.mesh.computeWorldMatrix(true);
    f.scene.render();
  }
  assert.deepEqual(
    counts,
    [],
    "clear startup preparation must submit no precipitation",
  );
  f.renderer.update(f.input);
  f.scene.render();
  assert.deepEqual(counts, [f.renderer.activeCount * 6]);
  f.renderer.update({ ...f.input, weather: undefined });
  f.scene.render();
  assert.equal(counts.length, 1);
  const position = { x: 110, y: -2.2, z: 12 };
  const camera = f.scene.activeCamera as FreeCamera;
  camera.position.set(110, -0.6, 20);
  camera.setTarget(new Vector3(110, -0.6, 12));
  f.renderer.update({ ...f.input, position, weather: undefined });
  f.renderer.mesh.computeWorldMatrix(true);
  f.scene.render();
  assert.equal(counts.length, 1, "moving during clear weather stays disabled");
  f.renderer.update({
    ...f.input,
    position,
    weather: createWeatherScenario("snow-heavy", 0),
  });
  assert.equal(f.renderer.prepare(), true);
  assert.equal(preparedEffect(f.renderer), effect);
  f.scene.render();
  assert.deepEqual(counts, [6144, 4836]);
  const bounds = f.renderer.mesh.getBoundingInfo().boundingBox;
  assert.equal(bounds.minimumWorld.x, 99);
  assert.equal(bounds.maximumWorld.x, 121);
  assert.equal(bounds.minimumWorld.z, 1);
  assert.equal(bounds.maximumWorld.z, 23);
});

test("illumination/visibility are bounded uniforms; dispose owns only this batch and survives scene teardown", async (t) => {
  const f = fixture(t),
    other = new PrecipitationRenderer(f.scene);
  t.after(() => other.dispose());
  f.renderer.update({
    ...f.input,
    illumination: Infinity,
    wind: { x: NaN, z: Infinity },
    weather: { rain: 12, visibility: 0 },
  });
  const uniforms = f.material as unknown as { _floats: Record<string, number> };
  assert.equal(uniforms._floats.illumination, 0);
  assert.ok(Number.isFinite(uniforms._floats.extinction));
  await prepare(f.renderer);
  await prepare(other);
  f.renderer.dispose();
  f.renderer.dispose();
  f.renderer.update(f.input);
  assert.equal(f.renderer.prepare(), false);
  assert.equal(f.renderer.activeCount, 0);
  assert.equal(f.scene.meshes.length, 1);
  assert.equal(f.scene.materials.length, 1);
  assert.equal(
    other.prepare(),
    true,
    "disposing one material must not retire the other owner's effect",
  );
  f.scene.dispose();
  other.update(f.input);
  other.dispose();
  assert.equal(other.prepare(), false);
  assert.equal(f.scene.meshes.length, 0);
  assert.equal(f.scene.materials.length, 0);
});

test("native WGSL and GLSL expose the same texture-free unlit interface and preserve engine clip transforms", (t) => {
  const f = fixture(t, true);
  assert.equal(f.material.options.shaderLanguage, ShaderLanguage.WGSL);
  assert.deepEqual(f.material.options.samplers, []);
  for (const reverse of [false, true]) {
    const context = new WebGPUShaderProcessingContext(ShaderLanguage.WGSL);
    const options: _IProcessingOptions = {
      defines: [],
      indexParameters: {},
      isFragment: false,
      shouldUseHighPrecisionShader: true,
      supportsUniformBuffers: true,
      shadersRepository: "",
      includesShadersStore: ShaderStore.IncludesShadersStoreWGSL,
      processor: new WebGPUShaderProcessorWGSL(),
      processingContext: context,
      version: "100",
      platformName: "WEBGPU",
      isNDCHalfZRange: true,
      useReverseDepthBuffer: reverse,
    };
    let result: { vertexCode: string; fragmentCode: string } | undefined;
    Initialize(options);
    Process(PRECIPITATION_SHADERS.wgsl.vertexSource, options, (vertex) => {
      options.isFragment = true;
      Process(
        PRECIPITATION_SHADERS.wgsl.fragmentSource,
        options,
        (fragment) => {
          result = Finalize(vertex, fragment, options);
        },
      );
    });
    assert.ok(result);
    assert.deepEqual(
      context.leftOverUniforms.map((v) => v.name).sort(),
      [...f.material.options.uniforms].sort(),
    );
    assert.deepEqual(Object.keys(context.availableTextures), []);
    assert.deepEqual(Object.keys(context.availableSamplers), []);
    assert.doesNotMatch(
      result.vertexCode + result.fragmentCode,
      /attribute vec|uniform float|gl_Position|gl_FragColor|textureSample|texture2D/,
    );
    assert.match(result.vertexCode, /internals.yFactor_/);
    assert.equal(
      (result.vertexCode.match(/return vertexOutputs;/g) ?? []).length,
      1,
    );
    assert.match(result.fragmentCode, /discard/);
  }
  for (const shader of Object.values(PRECIPITATION_SHADERS)) {
    assert.match(shader.vertexSource, /worldView/);
    assert.match(shader.vertexSource, /projection/);
    assert.doesNotMatch(shader.vertexSource, /farDepth|position\.z\s*=|LIGHT/);
    assert.match(shader.fragmentSource, /contour/);
    assert.match(shader.fragmentSource, /smoothstep/);
  }
  // CPU processing/NullEngine does not validate native GPU typing or pixels.
});
