import fs from "node:fs";
import path from "node:path";
import {
  buildLandmarkPlan,
  B1_OSM_ID,
  STADIUM_PLAN,
  LANDMARK_SOURCE,
} from "../../../shared/landmark-reality";
import map from "../../../shared/data/map.json";
import { buildingBaseHeight } from "../../../shared/terrain";
import type { Building } from "../../../shared/types";
const buildings = map.buildings as unknown as Building[],
  plan = buildLandmarkPlan({ buildings }),
  b1 = buildings.find((b) => b.id === B1_OSM_ID)!,
  b2 = buildings.find((b) => b.id === "53929060")!;
const single = buildLandmarkPlan({ buildings: [b2] }),
  entry = single.entrances[0];
const source = {
  schemaVersion: 1,
  source: LANDMARK_SOURCE,
  coordinates:
    "x east, y up, z south; modules subtract their origin and inverse-rotate yaw for Blender/glTF export",
  modules: [
    {
      id: "b1-administration",
      origin: { x: -87.03, y: buildingBaseHeight(b1.points), z: 77.57, yaw: 0 },
      parts: plan.parts.filter((p) => p.group === "b1" && p.lod !== "far"),
    },
    {
      id: "great-strahov-stadium",
      modelScope: plan.stadium.access.policy.mode,
      interiorPubliclyAccessible: false,
      origin: { ...STADIUM_PLAN.center, y: plan.stadium.baseY, yaw: 0 },
      parts: plan.parts.filter((p) => p.group === "stadium" && p.lod !== "far"),
    },
    {
      id: "great-strahov-stadium-far",
      modelScope: plan.stadium.access.policy.mode,
      interiorPubliclyAccessible: false,
      origin: { ...STADIUM_PLAN.center, y: plan.stadium.baseY, yaw: 0 },
      parts: plan.parts.filter(
        (p) => p.group === "stadium" && p.lod !== "near",
      ),
    },
    {
      id: "common-covered-entrance",
      origin: {
        x: entry.x,
        y: entry.baseY,
        z: entry.z,
        yaw: Math.atan2(entry.nx, entry.nz),
      },
      parts: single.parts.filter(
        (p) => ["entries", "entry-2"].includes(p.group) && p.lod !== "far",
      ),
    },
  ],
  metrics: {
    collisionTriangles:
      (plan.collision.indices.length +
        plan.twoSidedRoofCollision.indices.length +
        plan.twoSidedExteriorCollision.indices.length) /
      3,
    nearTriangles: plan.parts
      .filter((p) => p.lod !== "far")
      .reduce((n, p) => n + p.indices.length / 3, 0),
    farTriangles: plan.parts
      .filter((p) => p.lod !== "near")
      .reduce((n, p) => n + p.indices.length / 3, 0),
    entrances: plan.entrances,
  },
};
const out = path.resolve("docs/reality-pack/landmarks/geometry-source.json");
fs.writeFileSync(out, JSON.stringify(source));
console.log(
  JSON.stringify(
    {
      output: out,
      modules: source.modules.map((m) => ({
        id: m.id,
        triangles: m.parts.reduce((n, p) => n + p.indices.length / 3, 0),
      })),
      ...source.metrics,
      entrances: source.metrics.entrances.length,
    },
    null,
    2,
  ),
);
