import test from "node:test";
import assert from "node:assert/strict";
import { verifyBaselineSources, verifyBaselineManifest, runDirectory, cache } from "./common.mjs";
import { join } from "node:path";
import { readFile } from "node:fs/promises";
import { gunzipSync } from "node:zlib";

test("baseline manifest is byte-pinned independently of any working report or rewritten bundle hashes", async () => {
  const bytes = gunzipSync(await readFile(new URL("../../render-profile-20261102/artifacts/build-identity.json.gz", import.meta.url)));
  assert.doesNotThrow(() => verifyBaselineManifest(bytes));
  const rewritten = JSON.parse(bytes);
  rewritten.bundleFiles["index.html"].sha256 = "0".repeat(64);
  assert.throws(() => verifyBaselineManifest(Buffer.from(JSON.stringify(rewritten, null, 2))), /manifest changed/);
  const altered = Buffer.from(bytes); altered[altered.length - 1] ^= 1;
  assert.throws(() => verifyBaselineManifest(altered), /manifest changed/);
});

test("archived client permits only explicit client/test differences and rejects changed server/shared/runtime inputs", () => {
  const before = { "client/game.ts": "old", "server/index.ts": "same", "shared/world.ts": "same", "pnpm-lock.yaml": "same" };
  const after = { ...before, "client/game.ts": "new", "client/webgpu-shader-preparation.ts": "new" };
  assert.deepEqual(verifyBaselineSources(before, after), ["client/game.ts", "client/webgpu-shader-preparation.ts"]);
  for (const path of ["server/index.ts", "shared/world.ts", "pnpm-lock.yaml", "client/avatar-presets.ts", "scripts/timeline-client.ts"])
    assert.throws(() => verifyBaselineSources(before, { ...after, [path]: "different" }), /dependency changed/);
  const removed = { ...after }; delete removed["server/index.ts"];
  assert.throws(() => verifyBaselineSources(before, removed), /dependency changed/);
  assert.equal(runDirectory("run1-attempt2"), join(cache, "runs", "run1-attempt2"));
  assert.throws(() => runDirectory("../run1"), /Invalid run/);
});
