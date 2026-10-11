import earcut from "earcut";
import type { Building } from "./types";
import { buildingArchitecture } from "./world";
import { LANDMARK_BUILDING_REPLACEMENTS } from "./landmark-reality";

/** The same flat roof already drawn by architecture-reality. Height and outline
 * retain their catalog/OSM provenance; this adds no surveyed roof thickness. */
export function buildingRoofGeometry(building: Building, baseY: number) {
  if (
    buildingArchitecture(building)?.block === 6 ||
    building.id === "7645350" ||
    LANDMARK_BUILDING_REPLACEMENTS.has(building.id)
  )
    return null;
  const points = building.points.slice();
  if (
    points.length > 1 &&
    points[0][0] === points.at(-1)![0] &&
    points[0][1] === points.at(-1)![1]
  )
    points.pop();
  const triangles = earcut(points.flat());
  const y = baseY + building.height;
  const positions = points.flatMap(([x, z]) => [x, y, z]);
  const indices: number[] = [];
  for (let i = 0; i < triangles.length; i += 3) {
    const [a, b, c] = triangles.slice(i, i + 3);
    const up =
      (points[b][1] - points[a][1]) * (points[c][0] - points[a][0]) -
      (points[b][0] - points[a][0]) * (points[c][1] - points[a][1]);
    indices.push(a, ...(up >= 0 ? [b, c] : [c, b]));
  }
  return { points, triangles, positions, indices, y };
}
