import { Matrix, Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector";
import { sampleGroundCover, type GroundCoverSample } from "../shared/ground-cover";
import { BUILDINGS, MAP } from "../shared/world";
import { placementClassifier, sampleHash } from "../shared/vegetation";
import { groundHeight, groundNormal } from "../shared/terrain";
import { grassRootId } from "./photo-grass-budget";

export type FlowerPlacement = {
  id: number; tileId: string; x: number; y: number; z: number; seed: number;
  matrix: Float32Array;
};
export const FLOWER_CACHE_LIMIT = 1536;

/** One stable candidate per square metre. The shared mask is the probability,
 * never multiplied by quality, camera time or another density interpretation. */
export function createGroundFlowerPlacement(radius: number, dependencies?: {
  cover: typeof sampleGroundCover;
  allowed: (x: number, z: number) => boolean;
  height: typeof groundHeight;
  normal: typeof groundNormal;
}) {
  const allowed = dependencies?.allowed ?? placementClassifier(BUILDINGS, MAP.paths).grass;
  const cover = dependencies?.cover ?? sampleGroundCover;
  const height = dependencies?.height ?? groundHeight, normalAt = dependencies?.normal ?? groundNormal;
  const sample: GroundCoverSample = { variation: 0, grassDensity: 0, wear: 0, flowerDensity: 0 };
  const cache = new Map<string, FlowerPlacement | null>();
  const matrix = Matrix.Identity(), rotation = Quaternion.Identity(), tilt = Quaternion.Identity(), yaw = Quaternion.Identity();
  const position = Vector3.Zero(), up = Vector3.Up(), normal = Vector3.Up(), scale = Vector3.One();
  return {
    candidate(tileX: number, tileZ: number): FlowerPlacement | null {
      const tileId = tileX + ":" + tileZ;
      if (cache.has(tileId)) return cache.get(tileId)!;
      const seed = Math.imul(tileX, 73856093) ^ Math.imul(tileZ, 19349663) ^ 0x48da15;
      const x = tileX + 0.15 + sampleHash(seed) * 0.7, z = tileZ + 0.15 + sampleHash(seed + 1) * 0.7;
      cover(x, z, sample);
      let result: FlowerPlacement | null = null;
      if (sampleHash(seed + 2) < sample.flowerDensity && allowed(x, z) &&
          allowed(x - radius, z - radius) && allowed(x + radius, z - radius) &&
          allowed(x - radius, z + radius) && allowed(x + radius, z + radius)) {
        const y = height(x, z) + 0.0025, n = normalAt(x, z);
        normal.set(n.x, n.y, n.z); Quaternion.FromUnitVectorsToRef(up, normal, tilt);
        Quaternion.RotationYawPitchRollToRef(sampleHash(seed + 3) * Math.PI * 2, 0, 0, yaw);
        tilt.multiplyToRef(yaw, rotation); position.set(x, y, z);
        Matrix.ComposeToRef(scale, rotation, position, matrix);
        result = { id: grassRootId(tileX, tileZ, 0), tileId, x, y, z, seed: sampleHash(seed + 4), matrix: Float32Array.from(matrix.asArray()) };
      }
      cache.set(tileId, result);
      if (cache.size > FLOWER_CACHE_LIMIT) cache.delete(cache.keys().next().value!);
      return result;
    },
    get size() { return cache.size; },
    dispose() { cache.clear(); },
  };
}
