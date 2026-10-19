// Resolve the installed package, including pnpm's physical dependency layout.
// No source overlays, environment overrides or QA paths in the normal test run.
const shadowModule = import.meta.resolve("@babylonjs/core/Materials/shadowDepthWrapper.js");
const core = new URL("../", shadowModule);
export const moduleAt = (relativePath) => import(new URL(relativePath, core).href);
