// Register the portable CPU regressions against the installed Babylon package.
export {};
await import(new URL("./fixtures/webgpu-shadow-sharing/shadow-share.test.mjs", import.meta.url).href);
await import(new URL("./fixtures/webgpu-shadow-sharing/pass-ownership.test.mjs", import.meta.url).href);
await import(new URL("./fixtures/webgpu-shadow-sharing/nonstandalone.test.mjs", import.meta.url).href);
