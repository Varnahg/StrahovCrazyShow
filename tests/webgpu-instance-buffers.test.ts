// Portable regressions resolve the actual installed Babylon package.
export {};
await import(new URL("./fixtures/webgpu-instance-buffers/instance-buffers.test.mjs", import.meta.url).href);
