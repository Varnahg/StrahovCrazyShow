import { test } from "node:test";
import assert from "node:assert/strict";
import { classifyGpu, readGpuDiagnostics } from "../client/gpu-diagnostics";

test("GPU diagnostics identify actual Intel and GTX renderers, not the high-performance request", () => {
  const intel = readGpuDiagnostics({
    getGlInfo: () => ({renderer: "ANGLE (Intel, Intel(R) UHD Graphics 630 (0x00003E92) Direct3D11 vs_5_0 ps_5_0, D3D11)", vendor: "Google Inc. (Intel)", version: "WebGL 2.0"}),
    getCreationOptions: () => ({powerPreference: "high-performance"}),
    webGLVersion: 2,
  });
  assert.equal(intel.classification, "integrated");
  assert.equal(intel.requestedPowerPreference, "high-performance");
  assert.equal(intel.webglVersion, 2);
  assert.match(intel.warnings[0], /integrovanou/);
  const nvidia = readGpuDiagnostics({
    getGlInfo: () => ({renderer: "ANGLE (NVIDIA, NVIDIA GeForce GTX 1060 Direct3D11 vs_5_0 ps_5_0, D3D11)"}),
    getCreationOptions: () => ({powerPreference: "high-performance"}),
  });
  assert.equal(nvidia.classification, "dedicated");
  assert.equal(nvidia.warnings.length, 0);
});

test("software renderer takes precedence and ambiguous GPU names remain unknown", () => {
  for (const name of ["ANGLE (Google, Vulkan SwiftShader Device, SwiftShader driver)", "llvmpipe (LLVM 15.0.7, 256 bits)", "Microsoft Basic Render Driver", "ANGLE (Microsoft WARP)"])
    assert.equal(classifyGpu(name), "software", name);
  for (const name of ["ANGLE", "WebKit WebGL", "AMD Radeon(TM) Graphics", "Intel(R) Arc(TM) Graphics", "Apple M3", "NVIDIA", ""])
    assert.equal(classifyGpu(name), "unknown", name);
  assert.equal(classifyGpu("AMD Radeon RX 6800"), "dedicated");
  assert.equal(classifyGpu("Intel Arc A750 Graphics"), "dedicated");
  assert.equal(classifyGpu("Intel(R) Iris(R) Xe MAX Graphics"), "dedicated");
});

test("unavailable driver data or unknown options do not invent a GPU selection", () => {
  const missing = readGpuDiagnostics({
    getGlInfo() { throw new Error("Context unavailable"); },
    getCreationOptions() { throw new Error("Unavailable"); },
  });
  assert.equal(missing.classification, "unknown");
  assert.equal(missing.requestedPowerPreference, "unknown");
  assert.equal(missing.webglVersion, null);
  assert.equal(readGpuDiagnostics({getGlInfo: () => ({}), getCreationOptions: () => ({powerPreference: "choose-nvidia"})}).requestedPowerPreference, "unknown");
});
