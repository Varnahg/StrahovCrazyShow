import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { readGlb, sha256 } from "../geometry-b6-south/reduce.mjs";
import { decodeTreePrototype, treePrototypeFoliageRanks } from "../../client/tree-asset-decode.ts";
import { decodeTreeClusterGeometry } from "../../client/tree-cluster-geometry.ts";
import { parseTreeClusterBank } from "../../shared/tree-cluster-types.ts";
import { parseTreePilotManifest } from "../../shared/tree-asset-types.ts";
import { silhouetteGroup } from "./quarter-acceptance.mjs";
import { quarterDir } from "./quarter.mjs";
import { autumnCutoff, autumnEvidence, autumnFolder, autumnReview, autumnTargets, branchFolder } from "./quarter-autumn.mjs";
import { finalPairCutoff, finalPairEvidence, finalPairFolder, finalPairModes, finalPairTargets } from "./quarter-final-pair.mjs";
import { lastTreeEvidence, lastTreeId, referenceCardsMode } from "./quarter-last-7259.mjs";

const [mode, label, ...extra] = process.argv.slice(2);
assert.ok(["--plan", "--write", "--verify"].includes(mode) && /^[a-z0-9-]{1,20}$/.test(label) && !extra.length);
const json = path => JSON.parse(readFileSync(path, "utf8"));
const buffer = bytes => Uint8Array.from(bytes).buffer;
const encode = value => Buffer.from(JSON.stringify(value, null, 2) + "\n");
const release = json("shared/data/assets/geometry-release-20261111.json");
const rollout = join(quarterDir, "rollout");
assert.match(realpathSync(rollout), /^D:[\\/]/i);
const output = "shared/data/assets/tree-quarter-rollout-20261113.json";
const autumn = label === "autumn";
const pair = label === "pair";
const last = label === referenceCardsMode;
const foliageRun = last ? { targets: [lastTreeId], previous: json(finalPairEvidence + "release-pair.json") }
  : pair ? finalPairTargets() : autumn ? autumnTargets() : undefined;
const evidence = last ? lastTreeEvidence : pair ? finalPairEvidence : autumn ? autumnEvidence : label === "branches" ? "_bmad-output/implementation-artifacts/tree-quarter-branches-20261113/"
  : "_bmad-output/implementation-artifacts/tree-quarter-rollout-20261113/";
const previous = foliageRun?.previous ?? (label === "branches"
  ? json("_bmad-output/implementation-artifacts/tree-quarter-rollout-20261113/release-final.json") : undefined);
const prefix = "/models/vegetation/seasonal-geometry-20261111/quarter-20261113/";
const atlasPrefix = "/textures/trees/quarter-20261113/";
const inventory = new Map(json(join(rollout, "inventory-v2.json")).map(job => [job.id, job]));
const assets = new Map();

function pinned(descriptor, path = "public" + descriptor.url) {
  const data = readFileSync(path);
  assert.equal(data.length, descriptor.bytes, path);
  assert.equal(sha256(data), descriptor.sha256, path);
  return data;
}
function asset(url, bytes, path) {
  const descriptor = { url, bytes: bytes.length, sha256: sha256(bytes) };
  const previous = assets.get(url);
  if (previous) assert.deepEqual(previous.descriptor, descriptor);
  else assets.set(url, { descriptor, ...(path ? { path } : { bytes }) });
  return descriptor;
}
function publish(path, bytes) {
  if (existsSync(path)) {
    assert.ok(readFileSync(path).equals(bytes), path);
    return;
  }
  assert.equal(mode, "--write", path);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, bytes, { flag: "wx" });
}

const original = JSON.parse(pinned(release.trees));
const catalog = foliageRun ? JSON.parse(pinned(previous.descriptor)) : original;
const baseline = parseTreePilotManifest(original);
const originalBank = Object.values(baseline.banks)[0];
const template = JSON.parse(pinned(originalBank));
const pilots = [ ["018", "d", 6], ["061", "d-061", 1], ["012", "d-012", 2] ];
const folders = last ? [{ slug: lastTreeId, dir: join(rollout, lastTreeId + "-" + referenceCardsMode),
  candidate: "candidate.json", review: "review-" + referenceCardsMode + ".json" }]
  : pair ? foliageRun.targets.flatMap(slug => finalPairModes.map(variant =>
  ({slug, dir:join(rollout, `${slug}-${variant}`), candidate:"candidate.json", review:`review-${variant}.json` })))
  : autumn ? foliageRun.targets.flatMap(slug => [
  { slug, dir:branchFolder(slug), candidate:"candidate.json", review:"review-autumn-cutoff.json" },
  ...["cards", "spread"].map(variant => ({ slug, dir:join(rollout, `${slug}-autumn-${variant}`), candidate:"candidate.json", review:`review-autumn-${variant}.json` })),
]) : pilots.map(([slug, dir, run]) => ({ slug, dir: join(quarterDir, dir), candidate: slug + ".json", review: `webgl-review${run}/review.json` }));
for (const dir of readdirSync(rollout, { withFileTypes:true }).filter(item => item.isDirectory())) {
  if (foliageRun || autumnFolder.test(dir.name) || finalPairFolder.test(dir.name) || dir.name.endsWith("-" + referenceCardsMode)) continue;
  if (/-branches(?:-fit)?$/.test(dir.name) && label !== "branches") continue;
  const entry = { slug: dir.name.replace(/-(?:tight-019|coverage(?:-fixed)?|branches(?:-fit)?)$/, ""), dir: join(rollout, dir.name), candidate: "candidate.json", review: "review.json" };
  folders.push(entry);
  if (label === "branches" && dir.name.endsWith("-branches-fit") && existsSync(join(entry.dir,"review-branches.json")))
    folders.push({ ...entry, review:"review-branches.json" });
  if (dir.name.endsWith("-tight-019") && existsSync(join(entry.dir,"review-cutoff.json")))
    folders.push({ ...entry, review: "review-cutoff.json" });
}
const decisions = [], accepted = foliageRun ? [...previous.accepted] : [], failures = [], publishedIds = new Set(accepted);

for (const job of folders) {
  if (!existsSync(join(job.dir, job.candidate))) continue;
  for (const name of (job.review === "review.json" || foliageRun ? readdirSync(job.dir) : []).filter(name => /^webgl-review[0-9]+-failure\.json$/.test(name)))
    failures.push({ ...json(join(job.dir, name)), run: name });
  if (!existsSync(join(job.dir, job.review))) continue;
  const c = json(join(job.dir, job.candidate)), r = json(join(job.dir, job.review));
  if (foliageRun) assert.equal(c.id, job.slug);
  if (autumn) assert.ok(autumnReview.test(job.review));
  const source = baseline.prototypes[c.id], budget = inventory.get(c.id);
  assert.ok(source && budget);
  assert.deepEqual(c.source, release.trees);
  assert.equal(r.id, c.id);
  assert.equal(r.webglVersion, 2);
  assert.equal(r.focus, true);
  assert.equal(r.visibility, "visible");
  assert.equal(r.calibration, false);
  assert.deepEqual(r.hashes, c.rows.map(row => row.descriptor.sha256));
  assert.deepEqual(r.textures, c.textures);
  assert.deepEqual(r.midTextures, c.midTextures);
  if (last) assert.deepEqual(Object.keys(c.midTextures ?? {}).sort(), ["color", "normalGL", "opacity", "roughness"]);
  assert.deepEqual(c.rows.map(row => row.lod), [0, 1]);
  const stages = source.family === "deciduous-broadleaf" ? [0, .5, 1] : [1];
  assert.equal(r.measurements.length, 12 * stages.length);
  assert.equal(r.shadowChecks.length, 4);
  // The previously played hybrid build used a lighter LOD1 for this one tree.
  const strict019 = c.id === "catalog-ipr-crown-019" ? 53279 : Infinity;
  const rows = c.rows.map(row => {
    const { lod, after, descriptor, before } = row;
    const cap = Math.min(budget.rows[lod].budget, lod === 1 ? strict019 : Infinity);
    assert.equal(before, budget.rows[lod].before);
    assert.ok(Number.isSafeInteger(after) && after > 0 && after <= budget.rows[lod].budget);
    assert.equal(new Set(r.shadowChecks.filter(check => check.lod === lod && check.darker >= 100).map(check => check.arm)).size, 2);
    const images = stages.map(leaves => {
      const samples = r.measurements.filter(item => item.lod === lod && item.leaves === leaves).sort((a,b) => a.view-b.view);
      assert.deepEqual(samples.map(item => item.view), [0,1,2,3,4,5]);
      for (const sample of samples) assert.deepEqual(sample.exported, [before, after]);
      const cutoff = samples[0].cutoff;
      assert.ok(Number.isFinite(cutoff) && cutoff >= .1 && cutoff <= .5 && samples.every(item => item.cutoff === cutoff));
      if (autumn) assert.equal(cutoff, lod === 0 ? .5 : autumnCutoff(c.id, job.review.slice(7,-5)));
      if (pair) assert.equal(cutoff, lod === 0 ? .5 : finalPairCutoff(c.id, job.review.slice(7,-5)));
      if (last) assert.equal(cutoff, .5);
      const { peak, meanDifference, pass } = silhouetteGroup(samples);
      return { leaves, cutoff, zoom: samples[0].zoom ?? 1, peak, meanDifference, pass };
    });
    assert.ok(images.every(image => image.cutoff === images[0].cutoff));
    return { lod, before, current: budget.rows[lod].runtime, after, cap, sha256: descriptor.sha256, images,
      pass: after <= cap && images.every(group => group.pass) };
  });
  const pass = rows.every(row => row.pass);
  const decision = { id:c.id, variant: job.dir.split(/[\\/]/).at(-1), review:job.review, gpu:r.gpu, rows, pass };
  decisions.push(decision);
  if (!pass) continue;
  if (publishedIds.has(c.id)) {
    assert.ok(label === "branches" || foliageRun, "More than one accepted candidate for " + c.id);
    continue;
  }
  publishedIds.add(c.id);
  if (previous) decision.selected = true;

  const textureFiles = c.textures && Object.fromEntries(Object.entries(c.textures).map(([name, file]) =>
    [name, asset(atlasPrefix + name + ".png", pinned(file, join(quarterDir, "d", name + ".png")))]));
  const midTextureFiles = last && Object.fromEntries(Object.entries(c.midTextures).map(([name, file]) =>
    [name, asset(atlasPrefix + `4314257259-${name}-${file.sha256.slice(0,8)}.png`, pinned(file, join(job.dir, name + ".png")))]));
  const prototype = catalog.prototypes[c.id];
  delete prototype.midCluster;
  const winter = foliageRun ? json(join(branchFolder(c.id), "candidate.json")) : undefined;
  for (const row of rows) {
    const lod = row.lod;
    const descriptor = c.rows[lod].descriptor;
    const bytes = pinned(descriptor, join(job.dir, `${job.slug}-lod${lod}.glb`));
    if (winter) {
      const oldDescriptor = winter.rows[lod].descriptor;
      if (lod === 0) assert.deepEqual(descriptor, oldDescriptor);
      else assertSameWood(bytes, pinned(oldDescriptor, join(branchFolder(c.id), `${c.id}-lod1.glb`)));
    }
    assert.deepEqual(readGlb(bytes).doc.nodes, readGlb(pinned(source.lods[lod])).doc.nodes);
    const parts = decodeTreePrototype(buffer(bytes), c.id, source, lod);
    assert.equal(parts.reduce((n, part) => n + part.indices.length / 3, 0), row.after);
    const ranks = treePrototypeFoliageRanks(parts);
    if (!(lod === 1 && source.midCluster))
      assert.deepEqual(ranks, treePrototypeFoliageRanks(decodeTreePrototype(buffer(pinned(source.lods[lod])), c.id, source, lod)));
    if (source.farCluster) {
      const far = decodeTreePrototype(buffer(pinned(source.lods[2])), c.id, source, 2);
      const bank = parseTreeClusterBank(JSON.parse(pinned(baseline.banks[source.farCluster.bankId])));
      const cards = decodeTreeClusterGeometry(buffer(pinned(source.farCluster.placements)), bank,
        { groupCount: source.farCluster.groupCount, exactRanks: treePrototypeFoliageRanks(far) });
      assert.deepEqual(ranks, treePrototypeFoliageRanks([...far, { ...cards, role: "foliage" }]));
    }
    const file = asset(prefix + `${c.id}-lod${lod}-${descriptor.sha256.slice(0,8)}.glb`, bytes,
      join(job.dir, `${job.slug}-lod${lod}.glb`));
    let leafBankId;
    if (textureFiles) {
      const cutoff = row.images[0].cutoff;
      const combined = lod === 1 && midTextureFiles;
      leafBankId = combined ? "quarter-leaf-4314257259" : `quarter-leaf-${cutoff.toFixed(2).replace(".", "")}`;
      const data = { ...template, prototypes: template.prototypes.slice(0,1), textures: combined || textureFiles,
        alphaCutoff: cutoff, normalMapStrength: combined ? 1 : .45 };
      parseTreeClusterBank(data);
      catalog.banks[leafBankId] = asset(prefix + leafBankId + ".json", encode(data));
    }
    prototype.lods[lod] = { ...file, meshNames: descriptor.meshNames, ...(leafBankId ? { leafBankId } : {}) };
  }
  accepted.push(c.id);
}

assert.ok(accepted.length, "No tree passed both LOD budgets and WebGL2");
parseTreePilotManifest(catalog);
if (previous) {
  const previousCatalog = JSON.parse(pinned(previous.descriptor));
  const addedIds = new Set(accepted.filter(id => !previous.accepted.includes(id)));
  assert.deepEqual(catalog.placements, previousCatalog.placements);
  for (const [id, prototype] of Object.entries(previousCatalog.prototypes)) {
    if (!addedIds.has(id)) assert.deepEqual(catalog.prototypes[id], prototype, id);
    else if (last) {
      const { lods: oldLods, ...oldIdentity } = prototype;
      const { lods: newLods, ...newIdentity } = catalog.prototypes[id];
      assert.deepEqual(oldIdentity, newIdentity, id);
      assert.deepEqual(oldLods[2], newLods[2], id);
    } else assert.deepEqual(catalog.prototypes[id].lods[2], prototype.lods[2], id);
  }
  for (const [id, bank] of Object.entries(previousCatalog.banks)) assert.deepEqual(catalog.banks[id], bank, id);
}
const descriptor = asset(prefix + `catalog-${label}.json`, encode(catalog));
const summary = { descriptor, accepted, decisions, failures,
  unreviewed: (foliageRun?.targets ?? [...inventory.keys()]).filter(id => !decisions.some(decision => decision.id === id)) };
if (previous) {
  const targetIds = foliageRun?.targets ?? [...inventory.keys()].filter(id => !previous.accepted.includes(id));
  const evaluated = new Set(decisions.filter(row => foliageRun || row.review === "review-branches.json").map(row => row.id));
  const run = {
    previous: previous.descriptor, targeted: targetIds.length,
    reviewed: targetIds.filter(id => evaluated.has(id)),
    pending: targetIds.filter(id => !evaluated.has(id)),
    added: accepted.filter(id => !previous.accepted.includes(id)),
  };
  summary[last ? "lastRun" : pair ? "pairRun" : autumn ? "autumnRun" : "branchRun"] = run;
  assert.ok(mode === "--plan" || !run.pending.length, "Finish WebGL2 review before publishing");
  if (last && mode !== "--plan") {
    assert.deepEqual(run.added, [lastTreeId], "Last tree did not pass both LOD budgets and WebGL2");
    assert.equal(accepted.length, 110);
  }
}
if (mode !== "--plan") {
  for (const [url, item] of assets) {
    assert.match(realpathSync(dirname("public" + url)), /^D:[\\/]/i, url);
    if (item.path) assert.equal(statSync(item.path).size, item.descriptor.bytes);
    publish("public" + url, item.path ? pinned(item.descriptor, item.path) : item.bytes);
  }
  publish(evidence + `release-${label}.json`, encode(summary));
  if (mode === "--verify") assert.deepEqual(json(output), descriptor);
  else writeFileSync(output, encode(descriptor));
}
console.log(JSON.stringify({ descriptor, accepted, rejected: new Set(decisions.filter(decision => !publishedIds.has(decision.id))
  .map(decision => decision.id)).size, unreviewed:summary.unreviewed.length, assets: assets.size }));

function assertSameWood(candidate, baseline) {
  const wood = raw => {
    const { doc, accessor } = readGlb(raw);
    const node = doc.nodes.find(node => node.extras.role === "wood");
    const primitive = doc.meshes[node.mesh].primitives[0];
    return { node, indices:accessor(primitive.indices).bytes,
      attributes:Object.fromEntries(Object.entries(primitive.attributes).map(([name, index]) => [name, accessor(index).bytes])) };
  };
  assert.deepEqual(wood(candidate), wood(baseline), "Autumn export changed wood bytes");
}
