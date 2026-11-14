import { BUILDINGS, TREES, buildingArchitecture } from "../../../shared/world";
import { entryForFacade, LANDMARK_BUILDING_REPLACEMENTS } from "../../../shared/landmark-reality";
import { hasCadBuilding } from "../../../shared/cad-buildings";
import { pointInPolygon, treeTrunkCollision } from "../../../shared/vegetation";
import { streetSurfaceAt } from "../../../shared/streets";
import { architectureEdges, planFacadeOpenings } from "../../../client/architecture-reality";
import { drapeTriangles, buildingBaseHeight, type GroundPoint } from "../../../shared/terrain";
import evidence from "../../../shared/data/facade-reality.json";

const treeHits = [];
for (const tree of TREES) {
  const { x, z, radius } = treeTrunkCollision(tree);
  for (const b of BUILDINGS) {
    const touches = architectureEdges(b.points).some((edge) => {
      const t = Math.max(0, Math.min(edge.length, (x - edge.a[0]) * edge.tx + (z - edge.a[1]) * edge.tz));
      return Math.hypot(x - edge.a[0] - t * edge.tx, z - edge.a[1] - t * edge.tz) < radius;
    });
    if (touches || pointInPolygon(x, z, b.points)) treeHits.push({ tree: tree.osmId, building: b.id, x, z });
  }
  if (streetSurfaceAt(x, z)) treeHits.push({ tree: tree.osmId, street: true, x, z });
}

const windows = [];
let sampled = 0;
for (const b of BUILDINGS) {
  if (hasCadBuilding(b.id) || LANDMARK_BUILDING_REPLACEMENTS.has(b.id)) continue;
  const catalog = buildingArchitecture(b);
  const block = catalog?.block;
  const type = evidence.phenotypes.find((p) => p.osmId === b.id)?.type ?? (catalog?.kind === "dormitory" ? "standard" : "unknown");
  const base = buildingBaseHeight(b.points);
  for (const [edgeIndex, edge] of architectureEdges(b.points).entries()) {
    const entry = entryForFacade(b.id, edge.a, edge.b);
    for (const opening of planFacadeOpenings(edge, b.height, type, block)) {
      if (entry && opening.v < Math.max(4.6, entry.baseY + entry.rise + 2.65 - base) && block !== 4) continue;
      const point = (u: number, depth: number): GroundPoint => [edge.a[0] + u * edge.tx + depth * edge.nx, edge.a[1] + u * edge.tz + depth * edge.nz];
      const start = opening.u - 0.045, end = opening.u + opening.w + 0.045;
      const area = [point(start, -0.21), point(end, -0.21), point(end, 0.08), point(start, 0.08)];
      const terrain = drapeTriangles(area, [0, 1, 2, 0, 2, 3]).positions;
      if (!terrain.length) continue;
      sampled++;
      let highest = -Infinity;
      let where: GroundPoint | undefined;
      for (let i = 0; i < terrain.length; i += 3) {
        if (terrain[i + 1] <= highest) continue;
        highest = terrain[i + 1];
        where = [terrain[i], terrain[i + 2]];
      }
      const fitsGround = opening.v <= 1 && (type === "canteen" || block === 3 || block === 8);
      const trim = fitsGround && highest - base + 0.092 > opening.v;
      const bottom = trim ? Math.ceil((highest - base + 0.092) * 10) / 10 : opening.v;
      if (opening.v + opening.h - bottom < 0.32 && trim) continue;
      const penetration = highest - (base + bottom - 0.072);
      if (penetration > 0.001) windows.push({ building: b.id, block, edge: edgeIndex, u: opening.u, penetration, where });
    }
  }
}
console.log(JSON.stringify({ treeCount: TREES.length, treeHits, sampledWindows: sampled, ordinaryWindowSillHits: windows }, null, 2));
