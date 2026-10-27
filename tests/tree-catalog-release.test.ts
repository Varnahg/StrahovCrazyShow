import test from "node:test";
import assert from "node:assert/strict";
import { createReadStream, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { TREES } from "../shared/world";
import { treeTrunkCollision } from "../shared/vegetation";
import { parseTreePilotManifest, type TreeAssetFile } from "../shared/tree-asset-types";
import { parseTreeClusterBank } from "../shared/tree-cluster-types";
import materials from "../shared/data/assets/tree-materials-manifest.json";
import bark from "../shared/data/assets/tree-bark-material.json";

type FilePin = { path: string; bytes: number; sha256: string };
type NativeDependency = {
  sourceTreeId: string; native: FilePin;
  libraries: (FilePin & { relativePath: string })[];
  packedMaterialsLocal: boolean;
};
const root = path.resolve(import.meta.dirname, "..");
const json = (file: string) => JSON.parse(readFileSync(path.join(root, file), "utf8"));

/** Skutečně dodané soubory, nikoli syntetická fixture nebo privátní cache.
 * Každý unikátní soubor hashujeme proudově právě jednou. */
test("shipped tree catalogue closes all 110 runtime and editable native dependencies", async () => {
  const release = json("docs/trees/20261025/catalog-release.json") as {
    files: FilePin[]; nativeDependencies: NativeDependency[]; nativeCatalog: FilePin;
  };
  const descriptor = json("shared/data/assets/tree-catalog.json") as TreeAssetFile;
  assert.ok(Array.isArray(release.files) && release.files.length > 0);
  const files = new Map<string, FilePin>();
  const sharedInputs = new Set(["shared/data/assets/tree-bark-material.json", "shared/data/assets/tree-materials-manifest.json",
    "shared/data/tree-leaf-components.json", "shared/data/tree-phenology.json", "shared/data/tree-reconstruction.json"]);
  for (const file of release.files) {
    assert.ok(sharedInputs.has(file.path) || /^(public\/(models\/vegetation|textures\/trees)|assets\/(blender\/vegetation|sources\/trees))\/[A-Za-z0-9_./-]+$/.test(file.path), file.path);
    assert.ok(!file.path.split("/").some(part => part === "." || part === ".."));
    assert.ok(Number.isSafeInteger(file.bytes) && file.bytes > 0, file.path);
    assert.match(file.sha256, /^[a-f0-9]{64}$/);
    assert.ok(!files.has(file.path), `Duplicate release file: ${file.path}`);
    files.set(file.path, file);
  }
  const requirePin = (pin: FilePin) => {
    const accepted = files.get(pin.path);
    assert.ok(accepted, `Missing dependency: ${pin.path}`);
    assert.equal(accepted.bytes, pin.bytes, pin.path);
    assert.equal(accepted.sha256, pin.sha256, pin.path);
  };
  const requireRuntime = (pin: TreeAssetFile) => requirePin({ path: "public" + pin.url, bytes: pin.bytes, sha256: pin.sha256 });
  requireRuntime(descriptor);
  const manifest = parseTreePilotManifest(json("public" + descriptor.url));
  assert.equal(manifest.version, 4);
  assert.equal(TREES.length, 110);
  assert.equal(manifest.placements.length, TREES.length);
  assert.equal(Object.keys(manifest.prototypes).length, TREES.length);
  const sourceIds = TREES.map(tree => tree.osmId).sort();
  assert.deepEqual(manifest.placements.map(p => p.sourceTreeId).sort(), sourceIds);
  const families = { broadleaf: "deciduous-broadleaf", conifer: "evergreen-conifer", bare: "reference-bare" };
  for (const placement of manifest.placements) {
    const tree = TREES.find(source => source.osmId === placement.sourceTreeId)!;
    const reconstruction = tree.reconstruction!;
    assert.deepEqual(placement.sourceRootXZ, [tree.x, tree.z]);
    assert.equal(placement.positionUncertaintyMetres, tree.positionUncertaintyMetres ?? reconstruction.reference.positionUncertaintyMetres);
    assert.equal(placement.prototypeCandidates.length, 1);
    const id = placement.prototypeCandidates[0], prototype = manifest.prototypes[id];
    assert.ok(placement.selectedPrototypeId === null || placement.selectedPrototypeId === id);
    assert.equal(prototype.sourceTreeId, tree.osmId);
    assert.equal(prototype.family, families[reconstruction.appearance as keyof typeof families]);
    assert.equal(prototype.nominalHeight, reconstruction.height);
    assert.equal(prototype.nominalCrownDiameter, reconstruction.crownDiameter);
    assert.equal(prototype.trunkRadius, treeTrunkCollision(tree).radius);
    assert.equal(prototype.lodProfile, "full-coverage");
    for (const lod of prototype.lods) requireRuntime(lod);
    if (prototype.farCluster) requireRuntime(prototype.farCluster.placements);
  }
  for (const pin of Object.values(manifest.banks!)) {
    requireRuntime(pin);
    const bank = parseTreeClusterBank(json("public" + pin.url));
    for (const texture of Object.values(bank.textures)) requireRuntime(texture);
  }
  // Materiály se načítají nezávisle na geometrii runtime manifestu.
  for (const material of materials.assets) for (const texture of Object.values(material.maps)) requireRuntime(texture);
  for (const texture of Object.values(bark.channels)) requireRuntime(texture);

  assert.ok(Array.isArray(release.nativeDependencies));
  assert.deepEqual(release.nativeDependencies.map(item => item.sourceTreeId).sort(), sourceIds);
  requirePin(release.nativeCatalog);
  const nativeCatalog = json(release.nativeCatalog.path).nativeCatalog as (FilePin & { sourceTreeId: string })[];
  assert.deepEqual(nativeCatalog.map(item => item.sourceTreeId).sort(), sourceIds);
  assert.equal(new Set(release.nativeDependencies.map(item => item.native.path)).size, TREES.length);
  const packedIds = new Set(["ipr-crown-014", "ipr-b6-north-conifer"]);
  for (const item of release.nativeDependencies) {
    requirePin(item.native);
    assert.deepEqual(nativeCatalog.find(entry => entry.sourceTreeId === item.sourceTreeId), { sourceTreeId: item.sourceTreeId, ...item.native });
    assert.match(item.native.path, /^assets\/blender\/vegetation\/.+\.blend$/);
    assert.equal(item.packedMaterialsLocal, packedIds.has(item.sourceTreeId));
    assert.equal(item.libraries.length, item.packedMaterialsLocal ? 0 : 1);
    for (const library of item.libraries) {
      requirePin(library);
      assert.equal(library.relativePath, "//../materials.blend");
      assert.equal(path.posix.normalize(path.posix.join(path.posix.dirname(item.native.path), library.relativePath.slice(2))), library.path);
    }
  }
  for (const file of files.values()) {
    const hash = createHash("sha256"); let bytes = 0;
    for await (const chunk of createReadStream(path.join(root, file.path))) { bytes += chunk.length; hash.update(chunk); }
    assert.equal(bytes, file.bytes, file.path);
    assert.equal(hash.digest("hex"), file.sha256, file.path);
  }
});
