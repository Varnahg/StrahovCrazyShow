import type { Buffer } from "node:buffer";
export function parseGlb(bytes: Buffer): {
  json: any;
  bin: Buffer;
  accessor(id: number): number[][];
};
