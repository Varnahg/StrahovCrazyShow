import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import {
  buildCampusExteriorPlan,
  type ExteriorPart,
} from "../shared/campus-exterior";
const before = JSON.parse(
  readFileSync("assets/blender/campus-exterior/source-plan.json", "utf8"),
).plan;
const after = buildCampusExteriorPlan();
function triangleHash(parts: ExteriorPart[]) {
  const rows = parts
    .flatMap((p) => {
      const result: string[] = [];
      for (let i = 0; i < p.indices.length; i += 3)
        result.push(
          JSON.stringify([
            p.material,
            p.lod,
            ...p.indices
              .slice(i, i + 3)
              .map((v) => p.positions.slice(v * 3, v * 3 + 3)),
          ]),
        );
      return result;
    })
    .sort();
  return createHash("sha256").update(JSON.stringify(rows)).digest("hex");
}
const result = {
  beforeParts: before.parts.length,
  afterParts: after.parts.length,
  beforeTriangles: before.parts.reduce(
    (s: number, p: ExteriorPart) => s + p.indices.length / 3,
    0,
  ),
  afterTriangles: after.parts.reduce((s, p) => s + p.indices.length / 3, 0),
  beforeTriangleHash: triangleHash(before.parts),
  afterTriangleHash: triangleHash(after.parts),
  collisionUnchanged:
    JSON.stringify(before.collision) === JSON.stringify(after.collision),
};
if (
  result.beforeTriangleHash !== result.afterTriangleHash ||
  !result.collisionUnchanged
)
  throw Error(JSON.stringify(result));
mkdirSync("docs/reality-pack/separate-assets", { recursive: true });
writeFileSync(
  "docs/reality-pack/separate-assets/geometry-equivalence.json",
  JSON.stringify(result, null, 2) + "\n",
);
console.log(result);
