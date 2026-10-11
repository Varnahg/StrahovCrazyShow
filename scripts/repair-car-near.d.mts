export const EXPECTED_NEAR_SHA: string;
export const REPAIR: Readonly<{
  node: string;
  triangles: readonly number[];
  before: readonly (readonly number[])[];
  after: readonly (readonly number[])[];
}>;
export function sha(bytes: Uint8Array): string;
export function boundary(
  triangles: readonly (readonly number[])[],
  positions: number[][],
): [string, number][];
export function repairNearBytes(input: Buffer): {
  bytes: Buffer;
  audit: {
    inputSha256: string;
    outputSha256: string;
    permittedByteOffsets: number[];
    changedByteOffsets: number[];
    maximumVertexDisplacementMetres: number;
    replacementFaces: { indices: number[]; area: number; normalDot: number }[];
  };
};
