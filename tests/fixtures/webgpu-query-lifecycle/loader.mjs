// Portable runs use the real installed package; no cache/env/source overlay.
export const core = new URL('../', import.meta.resolve('@babylonjs/core/Engines/webgpuEngine.pure.js'));
export const moduleAt = relative => import(new URL(relative, core).href);
