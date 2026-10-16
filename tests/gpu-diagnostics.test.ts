import { test } from "node:test";
import assert from "node:assert/strict";
import {
  classifyGpu,
  readGpuDiagnostics,
  readGpuContextDiagnostics,
  getRendererInfo,
  readWebGpuMainPassTiming,
} from "../client/gpu-diagnostics";

test("GPU diagnostics identify actual Intel and GTX renderers, not the high-performance request", () => {
  const intel = readGpuDiagnostics({
    getGlInfo: () => ({
      renderer:
        "ANGLE (Intel, Intel(R) UHD Graphics 630 (0x00003E92) Direct3D11 vs_5_0 ps_5_0, D3D11)",
      vendor: "Google Inc. (Intel)",
      version: "WebGL 2.0",
    }),
    getCreationOptions: () => ({ powerPreference: "high-performance" }),
    webGLVersion: 2,
  });
  assert.equal(intel.classification, "integrated");
  assert.equal(intel.requestedPowerPreference, "high-performance");
  assert.equal(intel.webglVersion, 2);
  assert.match(intel.warnings[0], /integrovanou/);
  const nvidia = readGpuDiagnostics({
    getGlInfo: () => ({
      renderer:
        "ANGLE (NVIDIA, NVIDIA GeForce GTX 1060 Direct3D11 vs_5_0 ps_5_0, D3D11)",
    }),
    getCreationOptions: () => ({ powerPreference: "high-performance" }),
  });
  assert.equal(nvidia.classification, "dedicated");
  assert.equal(nvidia.warnings.length, 0);
});

test("WebGPU diagnostics use public adapter info and never open a GL context", () => {
  const engine = {
    isWebGPU: true,
    compatibilityMode: false,
    enableGPUTimingMeasurements: true,
    getInfo: () => ({
      vendor: "nvidia",
      renderer: "pascal",
      version: "NVIDIA GeForce GTX 1060",
    }),
    getGlInfo() {
      throw new Error("WebGPU must not request GL info");
    },
    getCreationOptions: () => ({
      antialias: true,
      powerPreference: "high-performance",
    }),
    getRenderingCanvas() {
      throw new Error("WebGPU must not request a GL context");
    },
  };
  const info = readGpuDiagnostics(engine);
  assert.equal(info.backend, "webgpu");
  assert.equal(info.classification, "dedicated");
  assert.equal(info.renderer, "pascal");
  assert.equal(info.version, "NVIDIA GeForce GTX 1060");
  assert.equal(info.webglVersion, null);
  assert.equal(info.compatibilityMode, false);
  assert.equal(info.gpuTimingScope, "main-render-pass-only");
  assert.deepEqual(info.context, {
    requestedAntialias: true,
    actualAntialias: null,
    defaultFramebuffer: null,
    sampleBuffers: null,
    samples: null,
  });
});

test("renderer info prefers the common API, retains masked data and tolerates lost context", () => {
  assert.deepEqual(
    getRendererInfo({
      getInfo: () => ({
        renderer: "  measured renderer ",
        vendor: "vendor",
        version: "v1",
      }),
      getGlInfo() {
        throw new Error("common API must take precedence");
      },
    }),
    { renderer: "measured renderer", vendor: "vendor", version: "v1" },
  );
  const missing = getRendererInfo({
    isWebGPU: true,
    getGlInfo() {
      throw new Error("forbidden");
    },
  });
  assert.match(missing.renderer, /Nezveřejněno/);
  assert.deepEqual(
    getRendererInfo({
      getInfo() {
        throw new Error("lost");
      },
    }),
    missing,
  );
  assert.equal(
    readGpuDiagnostics({
      isWebGPU: true,
      getInfo: () => ({ renderer: "pascal", vendor: "nvidia" }),
    }).classification,
    "unknown",
  );
});

test("WebGPU pass time rejects missing, stale and zero legacy-style samples", () => {
  const engine = {
    isWebGPU: true,
    enableGPUTimingMeasurements: true,
    gpuTimeInFrameForMainPass: { counter: { count: 0, current: 0 } },
  };
  assert.equal(readWebGpuMainPassTiming(engine).ms, null);
  engine.gpuTimeInFrameForMainPass.counter = { count: 1, current: 14_500_000 };
  assert.deepEqual(readWebGpuMainPassTiming(engine), {
    scope: "main-render-pass-only",
    count: 1,
    fresh: true,
    ms: 14.5,
  });
  assert.equal(readWebGpuMainPassTiming(engine, 1).ms, null);
  for (const current of [0, -1, NaN, Infinity]) {
    engine.gpuTimeInFrameForMainPass.counter.current = current;
    assert.equal(readWebGpuMainPassTiming(engine).ms, null);
  }
  engine.enableGPUTimingMeasurements = false;
  assert.equal(readWebGpuMainPassTiming(engine).ms, null);
  assert.equal(readWebGpuMainPassTiming({ isWebGPU: false }).ms, null);
});

test("software renderer takes precedence and ambiguous GPU names remain unknown", () => {
  for (const name of [
    "ANGLE (Google, Vulkan SwiftShader Device, SwiftShader driver)",
    "llvmpipe (LLVM 15.0.7, 256 bits)",
    "Microsoft Basic Render Driver",
    "ANGLE (Microsoft WARP)",
  ])
    assert.equal(classifyGpu(name), "software", name);
  for (const name of [
    "ANGLE",
    "WebKit WebGL",
    "AMD Radeon(TM) Graphics",
    "Intel(R) Arc(TM) Graphics",
    "Apple M3",
    "NVIDIA",
    "",
  ])
    assert.equal(classifyGpu(name), "unknown", name);
  assert.equal(classifyGpu("AMD Radeon RX 6800"), "dedicated");
  assert.equal(classifyGpu("Intel Arc A750 Graphics"), "dedicated");
  assert.equal(classifyGpu("Intel(R) Iris(R) Xe MAX Graphics"), "dedicated");
});

test("unavailable driver data or unknown options do not invent a GPU selection", () => {
  const missing = readGpuDiagnostics({
    getGlInfo() {
      throw new Error("Context unavailable");
    },
    getCreationOptions() {
      throw new Error("Unavailable");
    },
  });
  assert.equal(missing.classification, "unknown");
  assert.equal(missing.requestedPowerPreference, "unknown");
  assert.equal(missing.webglVersion, null);
  assert.equal(
    readGpuDiagnostics({
      getGlInfo: () => ({}),
      getCreationOptions: () => ({ powerPreference: "choose-nvidia" }),
    }).requestedPowerPreference,
    "unknown",
  );
});

test("AA diagnostics read actual default framebuffer samples without binding or polling a render target", () => {
  let binding: object | null = null,
    lost = false;
  const queries: number[] = [];
  const gl = {
    FRAMEBUFFER_BINDING: 1,
    SAMPLE_BUFFERS: 2,
    SAMPLES: 3,
    isContextLost: () => lost,
    getContextAttributes: () => ({ antialias: false }),
    getParameter(key: number) {
      queries.push(key);
      return key === 1 ? binding : key === 2 ? 0 : 0;
    },
  };
  const engine = {
    getGlInfo: () => ({}),
    webGLVersion: 2,
    getCreationOptions: () => ({ antialias: true }),
    getRenderingCanvas: () =>
      ({
        getContext: (kind: string) => {
          assert.equal(kind, "webgl2");
          return gl;
        },
      }) as unknown as HTMLCanvasElement,
  };
  assert.deepEqual(readGpuContextDiagnostics(engine), {
    requestedAntialias: true,
    actualAntialias: false,
    defaultFramebuffer: true,
    sampleBuffers: 0,
    samples: 0,
  });
  assert.deepEqual(queries, [1, 2, 3]);
  queries.length = 0;
  binding = {};
  assert.deepEqual(readGpuContextDiagnostics(engine), {
    requestedAntialias: true,
    actualAntialias: false,
    defaultFramebuffer: false,
    sampleBuffers: null,
    samples: null,
  });
  assert.deepEqual(
    queries,
    [1],
    "offscreen sample count must never be reported as canvas MSAA",
  );
  queries.length = 0;
  lost = true;
  assert.equal(readGpuContextDiagnostics(engine).actualAntialias, null);
  assert.equal(queries.length, 0);
  assert.deepEqual(readGpuContextDiagnostics({ getGlInfo: () => ({}) }), {
    requestedAntialias: null,
    actualAntialias: null,
    defaultFramebuffer: null,
    sampleBuffers: null,
    samples: null,
  });
});
