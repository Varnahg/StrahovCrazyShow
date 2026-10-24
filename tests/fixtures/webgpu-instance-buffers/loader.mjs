// Normal test runs have no source overlay, env switch or QA-cache dependency.
export const core = new URL('../', import.meta.resolve('@babylonjs/core/Meshes/mesh.js'));
export const moduleAt = relative => import(new URL(relative, core).href);
