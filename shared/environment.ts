import manifest from "./data/assets/environment-manifest.json";
import {groundHeight} from './terrain';
export const ENVIRONMENT_ASSETS = manifest.assets;
export type EnvironmentPlacement = {
  asset: string;
  x: number;
  y: number;
  z: number;
  yaw: number;
  interior: boolean;
};
export const ENVIRONMENT_PLACEMENTS: EnvironmentPlacement[] = [];
const place = (
  asset: string,
  x: number,
  y: number,
  z: number,
  yaw = 0,
  interior = true,
) => ENVIRONMENT_PLACEMENTS.push({ asset, x, y, z, yaw, interior });
// Illustrative furnishing based on historical room typology; not a surveyed B6 inventory.
for (let floor = 0; floor <= 5; floor++)
  for (const row of [0, 3, 6, 11]) {
    const y = floor * 3,
      z = -25.7 - row * 5.4;
    place("dorm-bed", 1.25, y, z - 0.7, Math.PI / 2);
    place("dorm-desk", 4.6, y, z + 0.8);
    place("dorm-chair", 4.6, y, z - 0.05, Math.PI);
    place("dorm-wardrobe", 1.1, y, z + 1.6);
    place("dorm-nightstand", 2.2, y, z - 1.7);
    place("dorm-wall-shelf", 4.6, y + 1.5, z + 2.35);
  }
place("dorm-kitchenette", -5.3, 3, -75.5);
place("dorm-desk", -3.5, 15, -73);
place("dorm-chair", -3.5, 15, -74, Math.PI);
place("dorm-chair", -3.5, 15, -72);
for (let x = 40; x < 250; x += 50) place("campus-bench", x, 0, 18, 0, false);
// Rotate identical collision proxies and GLB instances from the same manifest.
export const ENVIRONMENT_COLLISIONS = ENVIRONMENT_PLACEMENTS.flatMap((p) => {
  const asset = ENVIRONMENT_ASSETS.find((a) => a.id === p.asset);
  if (!asset) throw new Error("Unknown environment asset: " + p.asset);
  return asset.collisionBoxes.map((b) => ({
    x: p.x + b.center[0] * Math.cos(p.yaw) + b.center[2] * Math.sin(p.yaw),
    y: p.y + b.center[1]+(p.interior?0:groundHeight(p.x,p.z)),
    z: p.z - b.center[0] * Math.sin(p.yaw) + b.center[2] * Math.cos(p.yaw),
    w: b.dimensions[0],
    h: b.dimensions[1],
    d: b.dimensions[2],
    yaw: p.yaw + b.rotation[1],
  }));
});
