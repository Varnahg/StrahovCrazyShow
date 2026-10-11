import { Vector3 } from "@babylonjs/core/Maths/math.vector";
type Geometry = { positions: readonly number[]; indices: readonly number[] };
type Volume = { planes: readonly (readonly number[])[] };
function clip(polygon: Vector3[], plane: readonly number[]) {
  const output: Vector3[] = [];
  const distance = (p: Vector3) =>
    p.x * plane[0] + p.y * plane[1] + p.z * plane[2] + plane[3];
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i],
      b = polygon[(i + 1) % polygon.length],
      da = distance(a),
      db = distance(b);
    if (da >= 0) output.push(a);
    if (da >= 0 !== db >= 0)
      output.push(Vector3.Lerp(a, b, Math.max(0, Math.min(1, da / (da - db)))));
  }
  return output;
}
/** Independent full-polygon overlap audit in the canonical head metre frame.
 * Alpha-zero geometry counts too; a centre-point test cannot miss a card edge. */
export function wholeHairVolumeOverlap(
  geometry: Geometry,
  volumes: readonly Volume[],
) {
  let area = 0;
  for (let i = 0; i < geometry.indices.length; i += 3) {
    const triangle = geometry.indices
      .slice(i, i + 3)
      .map(
        (index) =>
          new Vector3(
            geometry.positions[index * 3] * 0.184,
            geometry.positions[index * 3 + 1] * 0.235,
            geometry.positions[index * 3 + 2] * 0.195,
          ),
      );
    for (const volume of volumes) {
      let polygon = triangle;
      for (const plane of volume.planes) {
        polygon = clip(polygon, plane);
        if (polygon.length < 3) break;
      }
      for (let j = 1; j + 1 < polygon.length; j++)
        area +=
          Vector3.Cross(
            polygon[j].subtract(polygon[0]),
            polygon[j + 1].subtract(polygon[0]),
          ).length() / 2;
    }
  }
  return area;
}
