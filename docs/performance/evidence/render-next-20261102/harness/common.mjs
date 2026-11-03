// Archivovaný původní harness zůstává byte-identický pro jeho staré buildy.
// Obecné hashování, STOP a SDK lifetime sdílíme; nové jsou jen cesty kandidáta.
export * from "../../render-profile-20261102/harness/common.mjs";
import * as shared from "../../render-profile-20261102/harness/common.mjs";
import { join } from "node:path";
import { readFile } from "node:fs/promises";

const variant = process.env.STRAHOV_SHADER_CANDIDATE ?? "candidate1";
if (variant !== "baseline" && !/^candidate[1-9][0-9]*$/.test(variant)) throw new Error("Invalid candidate identity");
export const cache = join(shared.root, ".cache/render-next-20261102", variant);
export const buildDir = variant === "baseline" ? shared.buildDir : join(cache, "build");
export const dist = join(buildDir, "dist");
const changedClientAndTests = new Set([
  "client/game.ts", "client/webgpu-shader-preparation.ts",
  "tests/game-webgpu-startup.test.ts", "tests/game-light-preparation.test.ts", "tests/webgpu-shader-preparation.test.ts",
  "client/startup-material-readiness.ts", "tests/startup-material-readiness.test.ts", "tests/webgpu-shadow-freshness.test.ts",
  "client/light-preparation.ts", "tests/light-preparation.test.ts", "tests/game-light-lifecycle.test.ts",
]);
// Původní byte manifest, převzatý z commitnutého reportu d4e8f1c24ce43eaaad1d2d9dc9c7661c6b2433ae.
const BASELINE_MANIFEST_SHA256 = "9a12c49ad38d501a99eb9c0b9a69998ac80e3475f0ea5c92a2f4c48bc0ba2148";
export function verifyBaselineManifest(bytes) {
  if (shared.hash(bytes) !== BASELINE_MANIFEST_SHA256) throw new Error("Original baseline build manifest changed");
}
export function verifyBaselineSources(expected, current) {
  const differences = [...new Set([...Object.keys(expected), ...Object.keys(current)])]
    .filter(path => expected[path] !== current[path]).sort();
  for (const path of differences) if (!changedClientAndTests.has(path))
    throw new Error("Baseline server/source dependency changed: " + path);
  return differences;
}
export function runDirectory(name) {
  if (!/^run[123](?:-attempt[1-9][0-9]*)?$/.test(name)) throw new Error("Invalid run name");
  return join(cache, "runs", name);
}
export async function readInputs() {
  const inputs = await shared.readInputs();
  const harness = await shared.treeHashes(import.meta.dirname);
  return { ...inputs, harness, parentHarnessHash: inputs.harnessHash,
    harnessHash: shared.hash(JSON.stringify({ harness, parentHarnessHash: inputs.harnessHash })) };
}
export async function verifyBuild() {
  const manifestBytes = await readFile(join(buildDir, "identity.json"));
  if (variant === "baseline") verifyBaselineManifest(manifestBytes);
  const identity = JSON.parse(manifestBytes);
  const current = await readInputs();
  let verification;
  if (variant === "baseline") {
    // Starý klient se nikdy nepřestavuje. Jediné povolené rozdíly nejsou runtime
    // závislosti serveru; server/shared/scripts/config/assets/dependencies musí
    // zůstat stejné. Každý rozdíl a oba source hashe se přiznají v runtime JSON.
    for (const key of ["publicHash", "dependencyHash"])
      if (identity.inputs[key] !== current[key]) throw new Error("Baseline input changed: " + key);
    if (current.parentHarnessHash !== identity.inputs.harnessHash || current.oldHarness.sha256 !== identity.inputs.oldHarness.sha256)
      throw new Error("Archived baseline harness changed");
    verification = { mode: "frozen-client-unchanged-server", compiledClientSourceHash: identity.inputs.sourceHash,
      currentCheckoutSourceHash: current.sourceHash, servingHarnessHash: current.harnessHash,
      differingClientAndTestFiles: verifyBaselineSources(identity.inputs.source.files, current.source.files) };
  } else shared.assertInputIdentity(identity.inputs, current);
  if (JSON.stringify(identity.bundleFiles) !== JSON.stringify(await shared.treeHashes(dist)))
    throw new Error("Built dist bytes changed");
  return { ...identity, verification };
}
