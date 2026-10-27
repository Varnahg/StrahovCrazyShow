import { treeAssetUrl, type TreeAssetFile } from "./tree-asset-types";

export const TREE_CLUSTER_BANK_LIMIT = 432;
export const TREE_CLUSTER_GROUP_LIMIT = 65534;
export const TREE_CLUSTER_RECORD_BYTES = 32;
export const TREE_CLUSTER_EXACT = 65535;
export type TreeClusterCard = Readonly<{
  positions: readonly number[]; normals: readonly number[]; uvs: readonly number[];
}>;
export type TreeClusterBank = Readonly<{
  version: 1; coordinateSpace: "gltf-y-up"; units: "metres";
  /** Coverage calibration of the derived atlas, never the original leaf mask. */
  alphaCutoff: number;
  normalMapStrength: number;
  prototypes: readonly Readonly<{ id: number; cards: readonly TreeClusterCard[] }>[];
  textures: Readonly<Record<"color" | "opacity" | "normalGL" | "roughness", TreeAssetFile>>;
}>;

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw Error("Invalid tree cluster object");
  return value as Record<string, unknown>;
}
function numbers(value: unknown, length: number, min: number, max: number) {
  if (!Array.isArray(value) || value.length !== length) throw Error("Invalid tree cluster vector");
  const values = Array.from(value);
  if (values.some(n => typeof n !== "number" || !Number.isFinite(n) || n < min || n > max))
    throw Error("Invalid tree cluster vector");
  return Object.freeze(values as number[]);
}
function texture(value: unknown): TreeAssetFile {
  const raw = object(value);
  if (typeof raw.bytes !== "number" || !Number.isSafeInteger(raw.bytes) || raw.bytes < 1 || raw.bytes > 32 * 1024 * 1024 ||
      typeof raw.sha256 !== "string" || !/^[a-f0-9]{64}$/.test(raw.sha256)) throw Error("Invalid tree cluster texture integrity");
  return Object.freeze({ url: treeAssetUrl(raw.url, "/textures/trees/"), bytes: raw.bytes, sha256: raw.sha256 });
}
function card(value: unknown): TreeClusterCard {
  const raw = object(value), positions = numbers(raw.positions, 12, -2, 2), normals = numbers(raw.normals, 12, -1.001, 1.001), uvs = numbers(raw.uvs, 8, 0, 1);
  const a = [0, 1, 2].map(k => positions[3 + k] - positions[k]), b = [0, 1, 2].map(k => positions[9 + k] - positions[k]);
  const cross = [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]], area = Math.hypot(...cross);
  if (area < 1e-8 || Math.abs(a[0] * b[0] + a[1] * b[1] + a[2] * b[2]) > Math.hypot(...a) * Math.hypot(...b) * 1e-4 ||
      [0, 1, 2].some(k => Math.abs(positions[k] + positions[6 + k] - positions[3 + k] - positions[9 + k]) > 1e-5))
    throw Error("Tree cluster card must be a nondegenerate rectangle");
  for (let vertex = 0; vertex < 4; vertex++) {
    const offset = vertex * 3, normalLength = Math.hypot(normals[offset], normals[offset + 1], normals[offset + 2]);
    const alignment = (normals[offset] * cross[0] + normals[offset + 1] * cross[1] + normals[offset + 2] * cross[2]) / area;
    if (Math.abs(normalLength - 1) > 1e-4 || alignment < .9999) throw Error("Tree cluster card normal/winding mismatch");
  }
  const uvArea = (uvs[2] - uvs[0]) * (uvs[7] - uvs[1]) - (uvs[3] - uvs[1]) * (uvs[6] - uvs[0]);
  if (Math.abs(uvArea) < 1e-10 || Math.abs(uvs[0] + uvs[4] - uvs[2] - uvs[6]) > 1e-6 || Math.abs(uvs[1] + uvs[5] - uvs[3] - uvs[7]) > 1e-6)
    throw Error("Invalid tree cluster UV rectangle");
  return Object.freeze({ positions, normals, uvs });
}

/** Pure bounded parser. Source audit/provenance is kept in the authoring manifest;
 * only immutable card geometry and texture integrity enter the runtime bank. */
export function parseTreeClusterBank(value: unknown): TreeClusterBank {
  const raw = object(value);
  if (raw.version !== 1 || raw.coordinateSpace !== "gltf-y-up" || raw.units !== "metres" ||
      !Array.isArray(raw.prototypes) || !raw.prototypes.length || raw.prototypes.length > TREE_CLUSTER_BANK_LIMIT)
    throw Error("Unsupported tree cluster bank");
  const alphaCutoff = raw.alphaCutoff ?? .5, normalMapStrength = raw.normalMapStrength ?? 1;
  if (typeof alphaCutoff !== "number" || !Number.isFinite(alphaCutoff) || alphaCutoff < .1 || alphaCutoff > .9 ||
      typeof normalMapStrength !== "number" || !Number.isFinite(normalMapStrength) || normalMapStrength < 0 || normalMapStrength > 2)
    throw Error("Invalid tree cluster atlas calibration");
  const prototypes = Array.from(raw.prototypes).map((value, index) => {
    const item = object(value);
    if (item.id !== index || !Array.isArray(item.cards) || item.cards.length < 1 || item.cards.length > 2) throw Error("Invalid tree cluster prototype identity");
    return Object.freeze({ id: index, cards: Object.freeze(Array.from(item.cards).map(card)) });
  });
  const source = object(raw.textures);
  const textures = Object.freeze({ color: texture(source.color), opacity: texture(source.opacity), normalGL: texture(source.normalGL), roughness: texture(source.roughness) });
  return Object.freeze({ version: 1, coordinateSpace: "gltf-y-up", units: "metres", alphaCutoff, normalMapStrength, prototypes: Object.freeze(prototypes), textures });
}
