import authored from "./data/assets/b6-manifest.json";
import furniture from "./data/assets/environment-manifest.json";
import { B6_ROOM_AREAS, B6_STAIR_CORES } from "./b6-interior";

export const B6_ASSET_MANIFEST = {
  assets: [
    ...authored.assets,
    ...furniture.assets.filter((asset) => asset.id.startsWith("dorm-")),
  ],
  attribution:
    "Project-authored geometry/textures; photographs are reference links only.",
};
export type B6PropPlacement = {
  id: string;
  asset: string;
  areaId: string;
  level: number;
  x: number;
  y: number;
  z: number;
  yaw: number;
  confidence: "low-typology-inferred" | "medium-plan-derived";
  currentB6Confirmed: false;
};
export const B6_PROP_PLACEMENTS: B6PropPlacement[] = [];
const place = (
  asset: string,
  areaId: string,
  level: number,
  x: number,
  y: number,
  z: number,
  yaw = 0,
) =>
  B6_PROP_PLACEMENTS.push({
    id: `${areaId}:${asset}:${B6_PROP_PLACEMENTS.length}`,
    asset,
    areaId,
    level,
    x,
    y: y + level * 3,
    z,
    yaw,
    confidence: "low-typology-inferred",
    currentB6Confirmed: false,
  });

for (const area of B6_ROOM_AREAS) {
  if (area.level < 0) continue;
  const { minX, maxX, minZ, maxZ } = area.bounds,
    z = (minZ + maxZ) / 2;
  place(
    "door-open",
    area.id,
    area.level,
    area.door.x,
    0,
    area.door.z,
    area.door.yaw,
  );
  if (area.kind === "bedroom") {
    const mirror = area.side === "west" ? 1 : -1;
    const outsideX = area.side === "west" ? minX : maxX;
    for (const sign of [-1, 1]) {
      place(
        "dorm-bed",
        area.id,
        area.level,
        outsideX + mirror * 2.9,
        0,
        z + sign * 1.02,
        mirror < 0 ? Math.PI : 0,
      );
      place(
        "dorm-desk",
        area.id,
        area.level,
        outsideX + mirror * 0.55,
        0,
        z + sign * 0.7,
        area.side === "west" ? Math.PI / 2 : -Math.PI / 2,
      );
      place(
        "dorm-chair",
        area.id,
        area.level,
        outsideX + mirror * 1.15,
        0,
        z + sign * 0.7,
        area.side === "west" ? Math.PI / 2 : -Math.PI / 2,
      );
    }
    place(
      "dorm-wardrobe",
      area.id,
      area.level,
      outsideX + mirror * 5.1,
      0,
      z + 1.02,
    );
    place(
      "dorm-wall-shelf",
      area.id,
      area.level,
      outsideX + mirror * 2.9,
      1.55,
      z + 1.44,
    );
    place(
      "radiator",
      area.id,
      area.level,
      outsideX + mirror * 0.22,
      0,
      z,
      area.side === "west" ? Math.PI / 2 : -Math.PI / 2,
    );
    place(
      "fluorescent-light",
      area.id,
      area.level,
      outsideX + mirror * 3,
      2.59,
      z,
      Math.PI / 2,
    );
  } else if (area.kind === "bathroom") {
    for (let i = 0; i < 3; i++) {
      if (area.index === 0)
        place(
          "toilet",
          area.id,
          area.level,
          11.0 + i * 1.55,
          0,
          maxZ - 0.6,
          Math.PI,
        );
      else place("shower", area.id, area.level, 11.1 + i * 1.6, 0, minZ + 0.58);
    }
    for (const sign of [-1, 1])
      place(
        "sink",
        area.id,
        area.level,
        15.5,
        0,
        z + sign * 0.75,
        -Math.PI / 2,
      );
    place("fluorescent-light", area.id, area.level, 13, 2.59, z);
  }
}
place("reception-counter", "b6:reception", 0, -2.7, 0, -70.6, Math.PI);
place("noticeboard", "b6:reception", 0, -6.84, 0.8, -72.3, Math.PI / 2);
for (let level = -1; level <= 5; level++) {
  for (let z = -86; z < -22; z += 6.4)
    place(
      "fluorescent-light",
      `b6:${level}:corridor`,
      level,
      8,
      2.59,
      z,
      Math.PI / 2,
    );
  for (let z = -86; z < -22; z += 3)
    place("cable-tray", `b6:${level}:corridor`, level, 9.25, 2.5, z);
  // Stair rails are now the shared, collidable dogleg-core geometry. The old
  // eight-metre straight-flight GLB stays in the historical asset library but
  // is never placed over the real two-core reconstruction.
  for (const core of B6_STAIR_CORES) {
    place("fluorescent-light",`b6:${level}:${core.id}:floor-landing`,level,3,2.59,core.minZ+6.65,Math.PI/2);
    if (level < 5) place("fluorescent-light",`b6:${level}:${core.id}:half-landing`,level,3,1.5+2.59,core.minZ+1.15,Math.PI/2);
  }
}

const assets = new Map(
  B6_ASSET_MANIFEST.assets.map((asset) => [asset.id, asset]),
);
/** Same transformed local envelopes as the corresponding rendered GLB instance. */
export const B6_PROP_COLLISIONS = B6_PROP_PLACEMENTS.flatMap((placement) => {
  const asset = assets.get(placement.asset);
  if (!asset) throw new Error("Missing B6 asset " + placement.asset);
  return asset.collisionBoxes.map((box) => ({
    x:
      placement.x +
      box.center[0] * Math.cos(placement.yaw) +
      box.center[2] * Math.sin(placement.yaw),
    y: placement.y + box.center[1],
    z:
      placement.z -
      box.center[0] * Math.sin(placement.yaw) +
      box.center[2] * Math.cos(placement.yaw),
    w: box.dimensions[0],
    h: box.dimensions[1],
    d: box.dimensions[2],
    yaw: placement.yaw + box.rotation[1],
    sourceId: placement.id,
  }));
});
