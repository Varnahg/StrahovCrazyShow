import { readFile, writeFile } from "node:fs/promises";
import { createReadStream } from "node:fs";
import { createHash } from "node:crypto";
import { join, resolve } from "node:path";
const evidence = import.meta.dirname;
const manifest = JSON.parse(await readFile(join(evidence, "final-b/source-manifest.json"), "utf8"));
const sha = async (path) => {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest("hex");
};
const files = Object.entries(manifest.files);
const frozenDifferences = [];
let cursor = 0;
await Promise.all(Array.from({length: 4}, async () => {
  while (cursor < files.length) {
    const [file, expected] = files[cursor++];
    const actual = await sha(join(manifest.snapshotRoot, file));
    if (actual !== expected) frozenDifferences.push({file, expected, actual});
  }
}));
const owned = ["shared/outdoor-artifacts.ts", "shared/outdoor-landmarks.ts", "shared/outdoor-world.ts", "shared/data/outdoor-artifacts.json", "shared/simulation.ts", "shared/netcode.ts", "client/outdoor-artifacts.ts", "client/map-artifacts.tsx", "client/minimap.tsx", "client/minimap.css", "client/game.ts", "client/world-renderer.ts", "scripts/fetch-outdoor-artifacts.mjs", "tests/outdoor-artifacts.test.ts", "tests/outdoor-artifacts-renderer.test.ts", "tests/outdoor-landmarks.test.ts", "tests/outdoor-world.test.ts", "tests/map-artifacts.test.ts"];
const live = await Promise.all(owned.map(async file => ({file, expected:manifest.files[file], actual:await sha(join(manifest.sourceRoot,file))})));
const harnessFiles = ["docs/verification/outdoor-artifacts.html", "docs/verification/outdoor-artifacts.tsx", "docs/verification/world-walk.html", "docs/verification/world-walk.ts"];
const harness = await Promise.all(harnessFiles.map(async file => ({file,sha256:await sha(join(manifest.snapshotRoot,file))})));
const result = {checkedAt:new Date().toISOString(), snapshotId:manifest.snapshotId, frozenFiles:files.length, frozenDifferences, liveOwnedFiles:owned.length, liveOwnedDifferences:live.filter(x=>x.expected!==x.actual), harness};
await writeFile(join(evidence,"final-b/source-check.json"),JSON.stringify(result,null,2)+"\n");
console.log(JSON.stringify(result,null,2));
if (frozenDifferences.length || result.liveOwnedDifferences.length) process.exitCode=1;
