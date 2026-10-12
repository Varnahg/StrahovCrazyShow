export interface FarLipRecipe {
  removedTriangles: number[];
  indices: number[];
  sourceIds: number[];
  positions: number[][];
  normals: number[][];
  uv: number[][];
  retainedRings: number[];
  sourceSha256: string;
  nearSha256: string;
  maximumNormalizedPositionError: number;
  sourceTriangleCount: number;
  sourceNode: string;
}
export const EXPECTED_FAR_SHA: string;
export function createFarLipRecipe(
  nearBytes: Buffer,
  sourceBytes: Buffer,
): FarLipRecipe;
export function repairFarBytes(
  input: Buffer,
  source: FarLipRecipe,
): {
  bytes: Buffer;
  audit: {
    inputSha256: string;
    outputSha256: string;
    removedTriangles: number[];
    addedTriangles: number;
    triangles: number;
    parts: number;
    unchangedViews: { view: number; sha256: string }[];
    sourceVertices: number;
    retainedVertexChannelsByteIdentical: boolean;
    retainedTriangleIndicesUnchanged: boolean;
    method: string;
  };
};
