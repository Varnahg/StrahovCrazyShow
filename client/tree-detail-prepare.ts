import type { TreeAssetFile, TreePrototype } from "../shared/tree-asset-types";
import type { TreeClusterBank } from "../shared/tree-cluster-types";
import { decodeTreePrototype, treePrototypeFoliageRanks } from "./tree-asset-decode";
import { decodeTreeClusterGeometry } from "./tree-cluster-geometry";
import { createTreeSeasonGeometryPlan, type TreeSeasonGeometryPlan } from "./tree-season-plan";

export type TreeDetailInput = {
  id: string;
  lod: 0 | 1;
  prototype: TreePrototype;
  groups?: { key: string; bank: TreeClusterBank; ranks: readonly number[] };
};
export type DetailParts = (ReturnType<typeof decodeTreePrototype>[number] & { clusterKey?: string; seasonPlan?: TreeSeasonGeometryPlan })[];
export type PreparedTreeDetail = { parts: DetailParts; prepareMs: number; seasonPlanMs: number };

/** Wait for both owned transfers even on failure, then prepare the exact
 * same validated geometry in either execution context. */
type ReadAsset = (file: TreeAssetFile) => Promise<ArrayBuffer>;
export function prepareTreeDetail(input: TreeDetailInput, read: ReadAsset): Promise<PreparedTreeDetail>;
export function prepareTreeDetail(input: TreeDetailInput, read: ReadAsset, current: () => boolean): Promise<PreparedTreeDetail | undefined>;
export async function prepareTreeDetail(input: TreeDetailInput, read: ReadAsset, current?: () => boolean) {
  const { id, lod, prototype, groups } = input;
  const cluster = lod === 1 ? prototype.midCluster : undefined;
  if (!!cluster !== !!groups) throw Error("Tree mid bank missing from far pool");
  const [model, placements] = await Promise.allSettled([
    read(prototype.lods[lod]), cluster ? read(cluster.placements) : undefined,
  ]);
  if (current && !current()) return undefined;
  if (model.status === "rejected") throw model.reason;
  if (placements.status === "rejected") throw placements.reason;
  const started = performance.now();
  const parts: DetailParts = decodeTreePrototype(model.value, id, prototype, lod);
  if (cluster && groups && placements.value) {
    const geometry = decodeTreeClusterGeometry(placements.value, groups.bank, { groupCount: cluster.groupCount, exactRanks: [] });
    const exactCount = treePrototypeFoliageRanks(parts).length;
    parts.push({ ...geometry, name: id + "__lod1__cluster-foliage", lod, role: "foliage",
      materialKey: prototype.family === "evergreen-conifer" ? "fir_tree_01" : "LeafSet024", clusterKey: groups.key });
    const ranks = treePrototypeFoliageRanks(parts);
    if (ranks.length !== exactCount + cluster.groupCount || ranks.length !== groups.ranks.length ||
        ranks.some((rank, i) => rank !== groups.ranks[i])) throw Error("Tree mid rank coverage differs from far");
  }
  const seasonStarted = performance.now();
  for (const part of parts) {
    if (!part.colors) continue;
    part.seasonPlan = createTreeSeasonGeometryPlan(part.indices, part.colors);
    part.indices = part.seasonPlan.indices;
  }
  return { parts, prepareMs: performance.now() - started, seasonPlanMs: performance.now() - seasonStarted };
}

/** Multiple accessors can be views of the same GLB. Transfer each buffer once. */
export function treeDetailTransferList(detail: PreparedTreeDetail): ArrayBuffer[] {
  const owned = new Set<ArrayBuffer>();
  for (const part of detail.parts)
    for (const view of [part.positions, part.normals, part.uvs, part.indices, part.colors,
      part.seasonPlan?.indices, part.seasonPlan?.ranks, part.seasonPlan?.indexEnds])
      if (view) {
        if (!(view.buffer instanceof ArrayBuffer)) throw Error("Tree detail requires transferable buffers");
        owned.add(view.buffer);
      }
  return [...owned];
}
