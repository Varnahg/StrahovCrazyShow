import { mkdirSync, writeFileSync } from "node:fs";
import {
  buildCampusExteriorPlan,
  CAMPUS_EXTERIOR_SOURCE,
} from "../shared/campus-exterior";
const folder = "assets/blender/campus-exterior";
mkdirSync(folder, { recursive: true });
const plan = buildCampusExteriorPlan();
writeFileSync(
  `${folder}/source-plan.json`,
  JSON.stringify({ source: CAMPUS_EXTERIOR_SOURCE, plan }, null, 2) + "\n",
);
console.log(
  JSON.stringify({
    parts: plan.parts.length,
    triangles: plan.parts.reduce((s, p) => s + p.indices.length / 3, 0),
    farTriangles: plan.parts
      .filter((p) => p.lod === "both")
      .reduce((s, p) => s + p.indices.length / 3, 0),
    collisionTriangles: plan.collision.indices.length / 3,
  }),
);
