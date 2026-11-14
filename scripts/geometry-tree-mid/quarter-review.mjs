import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { access, mkdir, readdir, readFile, realpath, writeFile } from "node:fs/promises";
import { join } from "node:path";
import express from "express";
import { build } from "vite";
import { quarterDir } from "./quarter.mjs";
import { autumnCutoff, autumnTargets } from "./quarter-autumn.mjs";
import { finalPairCutoff, finalPairFolder, finalPairModes, finalPairTargets } from "./quarter-final-pair.mjs";
import { lastTreeId, referenceCardsMode } from "./quarter-last-7259.mjs";

const root = process.cwd();
const record = "_bmad-output/implementation-artifacts/drive-stalls-followup-20261112";
const [run = "webgl-review1", reviewMode = "verify", cutoffArgument, slug = "018", ...extra] = process.argv.slice(2);
const autumn = /^autumn-(cutoff|cards|spread)$/.test(reviewMode);
const pair = finalPairModes.includes(reviewMode);
const referenceCards = reviewMode === referenceCardsMode;
assert.ok(/^webgl-review[1-9][0-9]*$/.test(run) && (["verify", "calibrate", "batch", "branches"].includes(reviewMode) || autumn || pair || referenceCards) && !extra.length);
const branchBatch = reviewMode === "branches";
const batch = reviewMode === "batch" || branchBatch || autumn || pair || referenceCards;
assert.ok(["018", "061", "012"].includes(slug));
const id = "catalog-ipr-crown-" + slug;
const textureDir = await realpath(join(quarterDir, "d"));
const dir = await realpath(join(quarterDir, batch ? "rollout" : slug === "018" ? "d" : "d-" + slug));
assert.match(dir, /^D:[\\/]/i);
assert.match(textureDir, /^D:[\\/]/i);
const cutoff = Number(cutoffArgument ?? (slug === "012" ? 0.25 : 0.24));
assert.ok(Number.isFinite(cutoff) && cutoff >= .1 && cutoff <= .5);
const calibration = reviewMode === "calibrate";
const output = join(dir, run), dist = join(output, "dist");
const json = async path => JSON.parse(await readFile(path, "utf8"));
const sha = bytes => createHash("sha256").update(bytes).digest("hex");
const files = new Map();
async function pin(descriptor, path = "public" + descriptor.url, type = "application/octet-stream") {
  const bytes = await readFile(path);
  assert.equal(bytes.length, descriptor.bytes, path);
  assert.equal(sha(bytes), descriptor.sha256, path);
  files.set(descriptor.url, { type, bytes });
  return bytes;
}
async function single() {
const candidate = await json(join(dir, slug + ".json"));
const independent = await json(join(dir, slug + "-holdout.json"));
const offline = await json(slug === "018" ? join(record, "tree-quarter-018-d-acceptance-v2.json") : join(dir, "acceptance.json"));
assert.equal(candidate.id, id);
assert.equal(independent.id, id);
assert.equal(offline.id, id);
assert.equal(offline.passesOfflineAcceptance, true);
const source = JSON.parse(await pin(candidate.source));
const prototype = source.prototypes[id];
const midDir = ".cache/geometry-release-20261111/tree-mid-all/candidate";
const midReceipt = await json(join(midDir, "receipt.json"));
assert.deepEqual(midReceipt.source, candidate.source);
const mid = JSON.parse(await pin(midReceipt.catalog, join(midDir, "catalog.json"))).prototypes[id];
const bank = source.banks[prototype.farCluster.bankId];
const bankValue = JSON.parse(await pin(bank, undefined, "application/json"));
await pin(mid.midCluster.placements, join(midDir, id + "-mid.bin"));
await pin(mid.lods[1], join(midDir, id + "-lod1.glb"));
await pin(prototype.lods[0]);
await pin(prototype.lods[1]);
for (const [channel, descriptor] of Object.entries(candidate.textures)) {
  await pin(descriptor, join(textureDir, channel + ".png"), "image/png");
}
const materials = await json("shared/data/assets/tree-materials-manifest.json");
const bark = await json("shared/data/assets/tree-bark-material.json");
for (const descriptor of [...Object.values(bankValue.textures),
  ...Object.values(materials.assets.find(row => row.id === "LeafSet024").maps),
  ...Object.values(bark.channels)]) {
  await pin(descriptor, undefined, descriptor.url.endsWith(".png") ? "image/png" : "image/jpeg");
}
for (const row of candidate.rows) {
  assert.equal(row.descriptor.sha256, offline.rows[row.lod].sha256);
  await pin(row.descriptor, join(dir, `${slug}-lod${row.lod}.glb`));
}
return { id, prototype, mid, bank, textures: candidate.textures, calibration, cutoff,
  rows: candidate.rows.map(row => ({ lod: row.lod, after: row.after, descriptor: row.descriptor,
    samples: calibration ? Array.from({length:6}, (_,i) => [i*Math.PI/3+.15,i%2?.10:0,45]) :
      independent.rows[row.lod].samples })) };
}
const data = batch ? undefined : await single();
const jobs = new Map();
const routes = new Map();
const targets = pair ? new Set(finalPairTargets().targets) : autumn ? new Set(autumnTargets().targets) : undefined;
let base, midCatalog, materials, bark;
if (batch) {
  const release = await json("shared/data/assets/geometry-release-20261111.json");
  base = JSON.parse(await pin(release.trees));
  const midDir = ".cache/geometry-release-20261111/tree-mid-all/candidate";
  const midReceipt = await json(join(midDir, "receipt.json"));
  assert.deepEqual(midReceipt.source, release.trees);
  midCatalog = JSON.parse(await pin(midReceipt.catalog, join(midDir, "catalog.json")));
  materials = await json("shared/data/assets/tree-materials-manifest.json");
  bark = await json("shared/data/assets/tree-bark-material.json");
  for (const path of await readdir(dir, { withFileTypes:true })) {
    if (!path.isDirectory()) continue;
    if (referenceCards ? path.name !== lastTreeId + "-" + referenceCardsMode :
      path.name.endsWith("-" + referenceCardsMode) || (pair ? !path.name.endsWith("-" + reviewMode) : finalPairFolder.test(path.name))) continue;
    if (branchBatch && !path.name.endsWith("-branches-fit")) continue;
    if (autumn && !path.name.endsWith(reviewMode === "autumn-cutoff" ? "-branches-fit" : "-" + reviewMode)) continue;
    const folder = join(dir, path.name);
    const candidate = await json(join(folder, "candidate.json")).catch(error => {
      if (error.code === "ENOENT") return undefined;
      throw error;
    });
    if (!candidate) continue;
    if (targets && !targets.has(candidate.id)) continue;
    assert.ok([candidate.id, candidate.id + "-coverage", candidate.id + "-coverage-fixed", candidate.id + "-branches", candidate.id + "-branches-fit", "catalog-ipr-crown-019-tight-019"].includes(path.name) ||
      (autumn || pair || referenceCards) && path.name === candidate.id + "-" + reviewMode);
    assert.deepEqual(candidate.source, release.trees);
    const receipt = autumn || pair || referenceCards ? `review-${reviewMode}.json` : branchBatch ? "review-branches.json" : "review.json";
    const review = await json(join(folder, receipt)).catch(error => {
      if (error.code === "ENOENT") return undefined;
      throw error;
    });
    const retry019 = path.name === "catalog-ipr-crown-019-tight-019" && !!review && run === "webgl-review4";
    if (review && !retry019) continue;
    if (retry019) {
      try { await access(join(folder, "review-cutoff.json")); continue; } catch (error) { if (error.code !== "ENOENT") throw error; }
    }
    assert.ok(!jobs.has(candidate.id));
    jobs.set(candidate.id, { candidate, folder, retry019, receipt: retry019 ? "review-cutoff.json" : receipt });
  }
  assert.ok(jobs.size, "No unreviewed geometry candidates");
}
async function batchInput(id) {
  const { candidate, folder, retry019 } = jobs.get(id);
  const prototype = base.prototypes[id], mid = midCatalog.prototypes[id];
  const bank = prototype.farCluster ? base.banks[prototype.farCluster.bankId] : undefined;
  files.clear();
  const bankValue = bank && JSON.parse(await pin(bank, undefined, "application/json"));
  const midDir = ".cache/geometry-release-20261111/tree-mid-all/candidate";
  if (mid.midCluster) await pin(mid.midCluster.placements, join(midDir, id + "-mid.bin"));
  await pin(mid.lods[1], join(midDir, id + "-lod1.glb"));
  for (const file of prototype.lods.slice(0,2)) await pin(file);
  for (const [channel, descriptor] of Object.entries(candidate.textures ?? {}))
    await pin(descriptor, join(textureDir, channel + ".png"), "image/png");
  for (const [channel, descriptor] of Object.entries(candidate.midTextures ?? {}))
    await pin(descriptor, join(folder, channel + ".png"), "image/png");
  for (const descriptor of [...Object.values(bankValue?.textures ?? {}),
    ...Object.values(materials.assets.find(row => row.id === (prototype.family === "evergreen-conifer" ? "fir_tree_01" : "LeafSet024")).maps),
    ...Object.values(bark.channels)])
    await pin(descriptor, undefined, descriptor.url.endsWith(".png") ? "image/png" : "image/jpeg");
  for (const row of candidate.rows) await pin(row.descriptor, join(folder, `${id}-lod${row.lod}.glb`));
  routes.clear();
  for (const [url, file] of files) routes.set(url, file);
  const oldReview = autumn || pair || referenceCards || /-branches(?:-fit)?$/.test(folder) ? await json(join(dir, id, "review.json")) : undefined;
  const previousFailure = await readdir(folder).then(names => names.includes("webgl-review3-failure.json"));
  const failure = previousFailure ? await json(join(folder,"webgl-review3-failure.json")) : undefined;
  const midZoom = oldReview?.measurements.find(row => row.lod === 1)?.zoom ??
    (failure?.phase.startsWith("LOD1") && failure.error.includes("Plocha") && failure.error.includes("ořez 0") ? 1.65 : 1);
  return { id, prototype, mid, bank, textures: candidate.textures, midTextures: candidate.midTextures,
    cutoff: referenceCards ? .5 : pair ? finalPairCutoff(id, reviewMode) : autumn ? autumnCutoff(id, reviewMode)
      : branchBatch ? (id === "catalog-ipr-crown-019" ? .20 : .28) : retry019 ? .18 : cutoff,
    batch: true, capture: referenceCards, midZoom,
    rows: candidate.rows };
}
await mkdir(output);
await writeFile(join(output, "index.html"), `<!doctype html><html lang="cs"><meta charset="utf-8">
<title>${batch ? "Stromy" : "Strom " + slug} ve WebGL2</title><style>
body{font:16px system-ui;margin:16px;background:#f0f2f4;color:#15242a}canvas{width:min(940px,100%);height:auto;background:#d5e1e8;display:block}button{font:inherit;padding:8px 14px}
</style><h1>${batch ? "Stromy" : "Strom " + slug} ve WebGL2</h1><button id="run">Spustit porovnání</button>
<p id="status" role="status">Připraveno.</p><canvas id="tree" aria-label="Porovnání stromu ${slug}"></canvas>
<script type="module" src="./review.ts"></script></html>`, { flag: "wx" });
const reviewPath = join(root, "scripts/geometry-tree-mid/quarter-review.ts");
const review = await readFile(reviewPath, "utf8");
await writeFile(join(output, "review.ts"), review.replace(/"\.\.\/\.\.\/(client|shared)\//g,
  (_match, directory) => `"${root.replaceAll("\\", "/")}/${directory}/`), { flag: "wx" });
await build({ root: output, configFile: false, publicDir: false, logLevel: "warn",
  resolve: { alias: [{ find: /^@babylonjs\//, replacement: `${root.replaceAll("\\", "/")}/node_modules/@babylonjs/` }] },
  cacheDir: join(output, "vite"), build: { outDir: dist, emptyOutDir: false, copyPublicDir: false } });

const app = express(), origin = "http://127.0.0.1:4179";
app.get("/review-data", (_request, response) => response.json(data ?? { ids: [...jobs.keys()] }));
if (batch) {
  app.get("/review-data/:id", async (request, response) => {
    if (!jobs.has(request.params.id)) return response.sendStatus(404);
    return response.json(await batchInput(request.params.id));
  });
  app.use((request, response, next) => {
    const file = request.method === "GET" && routes.get(request.path);
    if (!file) return next();
    response.type(file.type).send(file.bytes);
  });
}
for (const [url, { type, bytes }] of files) app.get(url, (_request, response) => response.type(type).send(bytes));
app.use(express.static(dist, { dotfiles: "deny" }));
app.post("/capture", express.raw({ type: "image/png", limit: "4mb" }), async (request, response) => {
  const name = request.query.name;
  if (request.get("Origin") !== origin || typeof name !== "string" ||
      !/^lod[01]-(winter|autumn|full|shadow)-(original|candidate)$/.test(name) || !Buffer.isBuffer(request.body)) {
    return response.sendStatus(400);
  }
  await writeFile(join(output, name + ".png"), request.body, { flag: "wx" });
  response.sendStatus(204);
});
app.post("/receipt", express.json({ limit: "128kb" }), async (request, response) => {
  const job = batch ? jobs.get(request.body?.id) : undefined;
  const expected = job?.candidate.family === "deciduous-broadleaf" || job?.candidate.textures ? 36 : 12;
  if (request.get("Origin") !== origin || (batch ? !job : request.body?.id !== id) ||
      request.body?.webglVersion !== 2 || request.body?.measurements?.length !== (batch ? expected : calibration ? 48 : 36)) return response.sendStatus(400);
  await writeFile(join(job?.folder ?? output, job?.receipt ?? "review.json"), JSON.stringify(request.body, null, 2) + "\n", { flag: "wx" });
  response.sendStatus(204);
});
if (batch) app.post("/failure", express.json({ limit: "4kb" }), async (request, response) => {
  const { id, error, phase } = request.body ?? {};
  const job = jobs.get(id);
  if (request.get("Origin") !== origin || !job || typeof error !== "string" || typeof phase !== "string")
    return response.sendStatus(400);
  await writeFile(join(job.folder, `${run}-failure.json`), JSON.stringify({ id, error, phase,
    hashes: job.candidate.rows.map(row => row.descriptor.sha256) }, null, 2) + "\n", { flag: "wx" });
  response.sendStatus(204);
});
const server = app.listen(4179, "127.0.0.1");
await new Promise((resolve, reject) => { server.once("listening", resolve); server.once("error", reject); });
await writeFile(join(output, "runtime.json"), JSON.stringify({ origin, pid: process.pid, id,
  reviewSha256: sha(review), models: batch ? Object.fromEntries([...jobs].map(([key, job]) =>
    [key, job.candidate.rows.map(row => row.descriptor.sha256)])) : data.rows.map(row => row.descriptor.sha256) }, null, 2), { flag: "wx" });
console.log("Ready " + origin + " · " + reviewMode);
const stop = setInterval(async () => {
  try { await access(join(output, "STOP")); } catch { return; }
  clearInterval(stop);
  server.closeAllConnections();
  server.close();
}, 500);
