/** Stable source identity is independent of materials and runtime LOD batches. */
export type WorldAssetIdentity = {
  key: string;
  kind: "building" | "court";
  sourceType: "way" | "relation";
  sourceId: string;
  sourceUrl: string;
};

export function osmAssetIdentity(
  kind: WorldAssetIdentity["kind"],
  sourceType: WorldAssetIdentity["sourceType"],
  sourceId: string,
): WorldAssetIdentity {
  return {
    key: `${kind}:osm:${sourceType}:${sourceId}`,
    kind,
    sourceType,
    sourceId,
    sourceUrl: `https://www.openstreetmap.org/${sourceType}/${sourceId}`,
  };
}
