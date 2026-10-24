// Production tests resolve installed Babylon; isolated candidate overlays are explicit tooling only.
export {};
await import(new URL("./fixtures/webgpu-query-lifecycle/query-lifecycle.test.mjs", import.meta.url).href);
