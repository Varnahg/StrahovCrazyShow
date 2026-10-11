import landcover from "./data/landcover.json";
import northCourtStyle from "./data/north-court-style.json";
import map from "./data/map.json";
import {
  drapeTriangles,
  groundHeight,
  buildingBaseHeight,
  type GroundPoint,
  type TerrainMeshData,
} from "./terrain";
import { STREET_FEATURES } from "./streets";
import earcut from "earcut";
import {
  osmAssetIdentity,
  type WorldAssetIdentity,
} from "./world-asset-identity";

/** These are original meshes built from open, attributed source geometry.
 * Photograph interpretation never upgrades an estimate into a survey. */
export const CAMPUS_EXTERIOR_SOURCE = {
  checkedAt: "2026-10-10",
  footprint:
    "https://api.openstreetmap.org/api/0.6/map?bbox=14.3842,50.07725,14.3985,50.0834",
  attribution:
    "© OpenStreetMap contributors · ODbL; datový podklad © IPR Praha · CC BY 4.0",
  orthoDate: "2024-06-08",
  ortho:
    "https://gs-pub.praha.eu/imgs/rest/services/ort/letecke_snimkovani/ImageServer",
  orthoSha256:
    "924ee88ce0e094dcc30683fae0e836bc4d0b39dcb2ffbb65809f9f00146d657d",
  venues: "https://wiki.sh.cvut.cz/kolej/hospody",
  market: "https://wiki.sh.cvut.cz/kolej/okoli",
  sports: "https://suz.cvut.cz/cz/komercni-sluzby/pronajem-sportovist",
  eastPhoto:
    "https://mapy.com/cs/zakladni?q=Recharging%20bar&source=firm&id=13296995&pid=101883310&newest=1&yaw=4.343&x=14.3938139&y=50.0812633&ds=2&z=17&ovl=8",
  eastPhotoDate: "2023-06-01",
  interpretation:
    "Court outlines are OSM polygons. Green, yellow/blue and red surface families and the low flat roof are interpreted from IPR ortho; line widths, fence heights, post pitch and open access gates are unmeasured game adaptations. Blue tennis markings coexist with source soccer tags; they do not change OSM data. Market/bar door positions remain unverified. No Google texture or 3D tile is redistributed or derived.",
  northCourt:{osmId:northCourtStyle.osmId,checkedAt:"2026-10-11",orthoCaptureDate:northCourtStyle.orthoCaptureDate,orthoSha256:northCourtStyle.orthoSha256,ortho:northCourtStyle.orthoSourceUrl,rawSportTag:northCourtStyle.sourceSportTag,rawSurfaceTag:northCourtStyle.sourceSurfaceTagRetained,visualSport:northCourtStyle.visualSport,measured:false,terrainInterpretation:"IPR23 red ground corroborated against DMR5G; canonical local TIN with3m apron"},
} as const;

export type ExteriorMaterial =
  | "turf"
  | "ochre"
  | "blue"
  | "red"
  | "sand"
  | "paint"
  | "fence"
  | "roof"
  | "roofSeam"
  | "concrete"
  | "courtGreen"
  | "courtRed";
export const NORTH_COURT_STYLE=northCourtStyle;
export type ExteriorPart = TerrainMeshData & {
  asset: WorldAssetIdentity;
  group: string;
  material: ExteriorMaterial;
  lod: "both" | "near";
};
export type ExteriorCourt = {
  osmId: string;
  name: string;
  points: GroundPoint[];
  sourceSurface: string | null;
  sourceSport: "soccer" | "tennis" | "beachvolleyball";
  visualSurface: ExteriorMaterial;
  blueInset: boolean;
  center: { x: number; z: number };
  width: number;
  length: number;
  /** Unit axes from the mapped quadrilateral, not an axis-aligned substitute. */
  across: GroundPoint;
  along: GroundPoint;
  fenceHeight: number;
};
export type ExteriorFence = {
  courtId: string;
  a: GroundPoint;
  b: GroundPoint;
  height: number;
};
export type ExteriorGate = {
  courtId: string;
  a: GroundPoint;
  b: GroundPoint;
  width: number;
  provenance: "game-access-adaptation-not-surveyed";
};
export type CampusExteriorPlan = {
  parts: ExteriorPart[];
  collision: TerrainMeshData;
  courts: ExteriorCourt[];
  fences: ExteriorFence[];
  gates: ExteriorGate[];
  shopRoof: {
    buildingId: string;
    points: GroundPoint[];
    y: number;
    provenance: string;
  };
};
const empty = (): TerrainMeshData => ({
  positions: [],
  indices: [],
  normals: [],
  uvs: [],
});
const courtIds = [
  "41833989",
  "41833990",
  "108568385",
  "108568430",
  "293949918",
  "293949920",
];
const ring = (points: number[][]): GroundPoint[] => {
  const p = points.map(([x, z]) => [x, z] as GroundPoint);
  if (Math.hypot(p[0][0] - p.at(-1)![0], p[0][1] - p.at(-1)![1]) < 1e-6)
    p.pop();
  return p;
};
export const CAMPUS_COURTS: ExteriorCourt[] = courtIds.map((osmId, i) => {
  const source = landcover.areas.find((a) => a.osmId === osmId)!;
  if (!source) throw new Error(`Missing source court ${osmId}`);
  const points = ring(source.points),
    south = points
      .slice()
      .sort((a, b) => b[1] - a[1])
      .slice(0, 2)
      .sort((a, b) => a[0] - b[0]),
    north = points
      .slice()
      .sort((a, b) => a[1] - b[1])
      .slice(0, 2)
      .sort((a, b) => a[0] - b[0]),
    [sw, se] = south,
    [nw] = north;
  const isNorth=osmId===northCourtStyle.osmId;
  const width = isNorth?northCourtStyle.widthMetres:Math.hypot(se[0] - sw[0], se[1] - sw[1]);
  const length = isNorth?northCourtStyle.lengthMetres:Math.hypot(sw[0] - nw[0], sw[1] - nw[1]);
  return {
    osmId,
    name: [
      "Západní fotbalové hřiště",
      "Prostřední víceúčelové hřiště",
      "Východní víceúčelové hřiště",
      "Červený tenisový kurt",
      "Beachvolejbal u Marketu",
      northCourtStyle.name,
    ][i],
    points,
    sourceSurface: source.surface,
    sourceSport: i === 3||isNorth ? "tennis" : i === 4 ? "beachvolleyball" : "soccer",
    visualSurface:
      isNorth?"courtGreen":i === 0 ? "turf" : i === 3 ? "red" : i === 4 ? "sand" : "ochre",
    blueInset: i === 1 || i === 2,
    center: {
      x: points.reduce((s, p) => s + p[0], 0) / 4,
      z: points.reduce((s, p) => s + p[1], 0) / 4,
    },
    width,
    length,
    across: isNorth?[northCourtStyle.across[0],northCourtStyle.across[1]]:[(se[0] - sw[0]) / width, (se[1] - sw[1]) / width],
    along: isNorth?[northCourtStyle.along[0],northCourtStyle.along[1]]:[(sw[0] - nw[0]) / length, (sw[1] - nw[1]) / length],
    fenceHeight: i === 4||isNorth ? 0 : i === 3 ? 3 : 3.5,
  };
});
/** Local court axes preserve its photographed rotation and four mapped corners. */
export function courtPoint(
  c: ExteriorCourt,
  u: number,
  v: number,
): GroundPoint {
  return [
    c.center.x + c.across[0] * u + c.along[0] * v,
    c.center.z + c.across[1] * u + c.along[1] * v,
  ];
}

const paths = STREET_FEATURES.filter((f) =>
  ["footway", "steps", "sidewalk", "pedestrian-area"].includes(f.kind),
);
function distanceSegment(p: GroundPoint, a: GroundPoint, b: GroundPoint) {
  const dx = b[0] - a[0],
    dz = b[1] - a[1],
    l = dx * dx + dz * dz;
  const t = l
    ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / l))
    : 0;
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dz);
}
/** Existing paths retain their full mapped/inferred width + capsule clearance. */
export function exteriorPathClearance(p: GroundPoint) {
  let result = Infinity;
  for (const path of paths)
    for (let i = 1; i < path.points.length; i++)
      result = Math.min(
        result,
        distanceSegment(p, path.points[i - 1], path.points[i]) - path.width / 2,
      );
  return result;
}

class Geometry {
  parts = new Map<string, ExteriorPart>();
  collision = empty();
  part(
    group: string,
    material: ExteriorMaterial,
    lod: ExteriorPart["lod"] = "both",
  ) {
    const key = `${group}:${material}:${lod}`;
    let part = this.parts.get(key);
    if (!part) {
      const asset =
        group === "market-roof"
          ? osmAssetIdentity("building", "way", "7645350")
          : osmAssetIdentity("court", "way", group.replace(/^court-/, ""));
      part = { ...empty(), asset, group, material, lod };
      this.parts.set(key, part);
    }
    return part;
  }
  append(part: TerrainMeshData, data: TerrainMeshData) {
    const base = part.positions.length / 3;
    part.positions.push(...data.positions);
    part.normals.push(...data.normals);
    part.uvs.push(...data.uvs);
    part.indices.push(...data.indices.map((i) => i + base));
  }
  surface(
    group: string,
    material: ExteriorMaterial,
    points: GroundPoint[],
    offset: number,
    lod: ExteriorPart["lod"] = "both",
  ) {
    const data = drapeTriangles(points, earcut(points.flat()), offset);
    data.uvs = data.uvs.map((v) => v * 4); // mesh UVs are metres, as on the roof
    this.append(this.part(group, material, lod), data);
  }
  surfaceWithHoles(group:string,material:ExteriorMaterial,outer:GroundPoint[],holes:GroundPoint[][],offset:number,lod:ExteriorPart["lod"]="both"){
    const points=[...outer],starts:number[]=[];for(const hole of holes){starts.push(points.length);points.push(...hole);}
    const data=drapeTriangles(points,earcut(points.flat(),starts,2),offset);data.uvs=data.uvs.map(v=>v*4);this.append(this.part(group,material,lod),data);
  }
  quad(
    group: string,
    material: ExteriorMaterial,
    corners: [number, number, number][],
    lod: ExteriorPart["lod"] = "both",
    collide = false,
  ) {
    const [a, b, c] = corners,
      u = b.map((x, i) => x - a[i]),
      v = c.map((x, i) => x - a[i]);
    const n = [
        u[1] * v[2] - u[2] * v[1],
        u[2] * v[0] - u[0] * v[2],
        u[0] * v[1] - u[1] * v[0],
      ],
      len = Math.hypot(...n);
    if (len < 1e-9) return;
    const data = {
      positions: corners.flat(),
      normals: corners.flatMap(() => n.map((x) => x / len)),
      indices: [0, 1, 2, 0, 2, 3],
      uvs: [0, 0, 1, 0, 1, 1, 0, 1],
    };
    this.append(this.part(group, material, lod), data);
    if (collide) this.append(this.collision, data);
  }
  beam(
    group: string,
    material: ExteriorMaterial,
    a: [number, number, number],
    b: [number, number, number],
    w: number,
    lod: ExteriorPart["lod"] = "both",
  ) {
    const dx = b[0] - a[0],
      dy = b[1] - a[1],
      dz = b[2] - a[2],
      l = Math.hypot(dx, dy, dz);
    if (l < 1e-6) return;
    // Two crossed opaque strips. No alpha textures or transparent fence sorting.
    const h = Math.hypot(dx, dz),
      nx = h > 1e-6 ? ((-dz / h) * w) / 2 : w / 2,
      nz = h > 1e-6 ? ((dx / h) * w) / 2 : 0;
    this.quad(
      group,
      material,
      [
        [a[0] + nx, a[1], a[2] + nz],
        [b[0] + nx, b[1], b[2] + nz],
        [b[0] - nx, b[1], b[2] - nz],
        [a[0] - nx, a[1], a[2] - nz],
      ],
      lod,
    );
    const rx = nx / (w / 2),
      rz = nz / (w / 2),
      sx = ((dy / l) * rz * w) / 2,
      sy = (((dz / l) * rx - (dx / l) * rz) * w) / 2,
      sz = ((-dy / l) * rx * w) / 2;
    this.quad(
      group,
      material,
      [
        [a[0] + sx, a[1] + sy, a[2] + sz],
        [b[0] + sx, b[1] + sy, b[2] + sz],
        [b[0] - sx, b[1] - sy, b[2] - sz],
        [a[0] - sx, a[1] - sy, a[2] - sz],
      ],
      lod,
    );
  }
}

const courtGroup = (c: ExteriorCourt) => `court-${c.osmId}`;

function localRect(
  c: ExteriorCourt,
  halfW: number,
  halfL: number,
): GroundPoint[] {
  return [
    [-halfW, -halfL],
    [halfW, -halfL],
    [halfW, halfL],
    [-halfW, halfL],
  ].map(([u, v]) => courtPoint(c, u, v));
}
function line(
  g: Geometry,
  c: ExteriorCourt,
  ua: number,
  va: number,
  ub: number,
  vb: number,
  width = 0.075,
) {
  const a = courtPoint(c, ua, va),
    b = courtPoint(c, ub, vb),
    dx = b[0] - a[0],
    dz = b[1] - a[1],
    l = Math.hypot(dx, dz);
  if (l < 1e-6) return;
  const nx = ((-dz / l) * width) / 2,
    nz = ((dx / l) * width) / 2;
  g.surface(
    courtGroup(c),
    "paint",
    [
      [a[0] + nx, a[1] + nz],
      [a[0] - nx, a[1] - nz],
      [b[0] - nx, b[1] - nz],
      [b[0] + nx, b[1] + nz],
    ],
    0.041,
    "near",
  );
}
function rectangleLines(g: Geometry, c: ExteriorCourt, w: number, l: number) {
  line(g, c, -w / 2, -l / 2, w / 2, -l / 2);
  line(g, c, w / 2, -l / 2, w / 2, l / 2);
  line(g, c, w / 2, l / 2, -w / 2, l / 2);
  line(g, c, -w / 2, l / 2, -w / 2, -l / 2);
}
function tennis(g: Geometry, c: ExteriorCourt) {
  rectangleLines(g, c, 10.97, 23.77);
  line(g, c, -4.115, -11.885, -4.115, 11.885);
  line(g, c, 4.115, -11.885, 4.115, 11.885);
  line(g, c, -4.115, -6.4, 4.115, -6.4);
  line(g, c, -4.115, 6.4, 4.115, 6.4);
  line(g, c, 0, -6.4, 0, 6.4);
  // A proper geometric net, simplified opaque strands only in the detail LOD.
  const p = (u: number, y: number) => {
    const [x, z] = courtPoint(c, u, 0);
    return [x, groundHeight(x, z) + y, z] as [number, number, number];
  };
  for (const u of [-6.05, 6.05])
    g.beam(courtGroup(c), "fence", p(u, 0), p(u, 1.1), 0.07);
  g.beam(courtGroup(c), "paint", p(-6.05, 1.05), p(6.05, 1.05), 0.04);
  for (let y = 0.15; y < 1.06; y += 0.15)
    g.beam(courtGroup(c), "fence", p(-6.05, y), p(6.05, y), 0.012, "near");
  for (let u = -6; u <= 6; u += 0.3)
    g.beam(courtGroup(c), "fence", p(u, 0.1), p(u, 1.05), 0.009, "near");
}
function fence(
  g: Geometry,
  c: ExteriorCourt,
  fences: ExteriorFence[],
  gates: ExteriorGate[],
) {
  if (c.fenceHeight === 0) return;
  for (let edge = 0; edge < 4; edge++) {
    const a = c.points[edge],
      b = c.points[(edge + 1) % 4],
      dx = b[0] - a[0],
      dz = b[1] - a[1],
      length = Math.hypot(dx, dz),
      count = Math.ceil(length / 0.2);
    const at = (t: number): GroundPoint => [a[0] + dx * t, a[1] + dz * t];
    // Two open gates are explicit navigability adaptations; their locations are
    // not represented as surveyed gates. Long side paths retain all clearances.
    const northSouth = edge === 0 || edge === 2;
    const allowed = (t: number) =>
      !(northSouth && Math.abs((t - 0.5) * length) < 1.3) &&
      exteriorPathClearance(at(t)) > 0.75;
    let begin: number | null = null;
    const chunks: [number, number][] = [];
    for (let i = 0; i <= count; i++) {
      const t = i / count,
        ok = i < count && allowed((i + 0.5) / count);
      if (ok && begin === null) begin = t;
      if (!ok && begin !== null) {
        if (t - begin > 0.003) chunks.push([begin, t]);
        begin = null;
      }
    }
    if (northSouth)
      gates.push({
        courtId: c.osmId,
        a: at(0.5 - 1.3 / length),
        b: at(0.5 + 1.3 / length),
        width: 2.6,
        provenance: "game-access-adaptation-not-surveyed",
      });
    for (const [from, to] of chunks) {
      const p = at(from),
        q = at(to),
        span = (to - from) * length;
      fences.push({ courtId: c.osmId, a: p, b: q, height: c.fenceHeight });
      const posts = Math.max(1, Math.ceil(span / 3));
      for (let i = 0; i <= posts; i++) {
        const r = at(from + ((to - from) * i) / posts),
          y = groundHeight(...r);
        g.beam(
          courtGroup(c),
          "fence",
          [r[0], y, r[1]],
          [r[0], y + c.fenceHeight, r[1]],
          0.07,
        );
      }
      const py = groundHeight(...p),
        qy = groundHeight(...q);
      for (const h of [0.25, c.fenceHeight])
        g.beam(
          courtGroup(c),
          "fence",
          [p[0], py + h, p[1]],
          [q[0], qy + h, q[1]],
          0.045,
        );
      // The same visible boundary is also the collision boundary. The fine
      // strands add no different solids, and neither collider spans a gate.
      g.quad(
        courtGroup(c),
        "fence",
        [
          [p[0], py, p[1]],
          [q[0], qy, q[1]],
          [q[0], qy + c.fenceHeight, q[1]],
          [p[0], py + c.fenceHeight, p[1]],
        ],
        "near",
        true,
      );
      // Remove the opaque sheet from render; retain only strands and collider.
      const part = g.part(courtGroup(c), "fence", "near");
      part.positions.splice(-12);
      part.normals.splice(-12);
      part.uvs.splice(-8);
      part.indices.splice(-6);
      const strands = Math.ceil(span / 0.55);
      for (let i = 1; i < strands; i++) {
        const r = at(from + ((to - from) * i) / strands),
          y = groundHeight(...r);
        g.beam(
          courtGroup(c),
          "fence",
          [r[0], y + 0.06, r[1]],
          [r[0], y + c.fenceHeight, r[1]],
          0.014,
          "near",
        );
      }
      for (let h = 0.55; h < c.fenceHeight; h += 0.55)
        g.beam(
          courtGroup(c),
          "fence",
          [p[0], py + h, p[1]],
          [q[0], qy + h, q[1]],
          0.014,
          "near",
        );
    }
  }
}

/** Finest authored source plan stays intact. Runtime LOD only disables parts. */
export function buildCampusExteriorPlan(): CampusExteriorPlan {
  const g = new Geometry(),
    fences: ExteriorFence[] = [],
    gates: ExteriorGate[] = [];
  for (const c of CAMPUS_COURTS) {
    if(c.osmId===northCourtStyle.osmId){
      const red=northCourtStyle.redPolygon.map(p=>[p[0],p[1]] as GroundPoint);
      g.surfaceWithHoles(courtGroup(c),"courtGreen",c.points,[red],.027);
      g.surface(courtGroup(c),"courtRed",red,.027);
      for(const polygon of northCourtStyle.paintPolygons)g.surfaceWithHoles(courtGroup(c),"paint",polygon.outer.map(p=>[p[0],p[1]] as GroundPoint),polygon.holes.map(ring=>ring.map(p=>[p[0],p[1]] as GroundPoint)),.041,"near");
      // Ortho proves the outline/colours, but no surveyed fence height, gate or
      // net collision. Do not add guessed vertical obstacles to this patch.
      continue;
    }
    g.surface(courtGroup(c), c.visualSurface, c.points, 0.027);
    if (c.blueInset)
      g.surface(courtGroup(c), "blue", localRect(c, 5.8, 12.4), 0.034);
    if (c.sourceSport === "soccer") {
      rectangleLines(g, c, c.width - 2.6, c.length - 3.2);
      line(g, c, -c.width / 2 + 1.3, 0, c.width / 2 - 1.3, 0);
      for (let i = 0; i < 40; i++) {
        const a = (i * Math.PI) / 20,
          b = ((i + 1) * Math.PI) / 20;
        line(
          g,
          c,
          Math.cos(a) * 3,
          Math.sin(a) * 3,
          Math.cos(b) * 3,
          Math.sin(b) * 3,
        );
      }
      // Goals sit inside the mapped play area. They do not obstruct the gates.
      for (const sign of [-1, 1]) {
        const v = sign * (c.length / 2 - 1.7),
          p = (u: number, y: number) => {
            const [x, z] = courtPoint(c, u, v);
            return [x, groundHeight(x, z) + y, z] as [number, number, number];
          };
        for (const u of [-1.6, 1.6])
          g.beam(courtGroup(c), "paint", p(u, 0), p(u, 2), 0.075);
        g.beam(courtGroup(c), "paint", p(-1.6, 2), p(1.6, 2), 0.075);
      }
    }
    if (c.blueInset || c.sourceSport === "tennis") tennis(g, c);
    if (c.sourceSport === "beachvolleyball") {
      rectangleLines(g, c, 8, 16);
      const p = (u: number, y: number) => {
        const [x, z] = courtPoint(c, u, 0);
        return [x, groundHeight(x, z) + y, z] as [number, number, number];
      };
      for (const u of [-4.6, 4.6])
        g.beam(courtGroup(c), "paint", p(u, 0), p(u, 2.5), 0.09);
      for (const y of [1.4, 2.4])
        g.beam(courtGroup(c), "paint", p(-4.6, y), p(4.6, y), 0.045);
      for (let u = -4.5; u < 4.6; u += 0.3)
        g.beam(courtGroup(c), "fence", p(u, 1.4), p(u, 2.4), 0.012, "near");
      for (let y = 1.55; y < 2.4; y += 0.15)
        g.beam(courtGroup(c), "fence", p(-4.6, y), p(4.6, y), 0.012, "near");
    }
    fence(g, c, fences, gates);
  }
  const shop = map.buildings.find((b) => b.id === "7645350")!,
    points = ring(shop.points),
    y = buildingBaseHeight(points) + shop.height + 0.025;
  const roofData = empty();
  for (const [x, z] of points) {
    roofData.positions.push(x, y, z);
    roofData.normals.push(0, 1, 0);
    roofData.uvs.push(x, z);
  }
  const idx = earcut(points.flat());
  for (let i = 0; i < idx.length; i += 3) {
    const [a, b, c] = idx.slice(i, i + 3),
      p = points[a],
      q = points[b],
      r = points[c];
    const cross = (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
    roofData.indices.push(a, ...(cross > 0 ? [c, b] : [b, c]));
  }
  g.append(g.part("market-roof", "roof"), roofData);
  // Edge flashings follow every actual roof edge; they do not extend a guessed
  // storefront or create an entrance through the existing solid building wall.
  for (let i = 0; i < points.length; i++) {
    const a = points[i],
      b = points[(i + 1) % points.length];
    g.beam(
      "market-roof",
      "roofSeam",
      [a[0], y + 0.065, a[1]],
      [b[0], y + 0.065, b[1]],
      0.11,
    );
  }
  return {
    parts: [...g.parts.values()].filter((p) => p.indices.length),
    collision: g.collision,
    courts: CAMPUS_COURTS,
    fences,
    gates,
    shopRoof: {
      buildingId: shop.id,
      points,
      y,
      provenance:
        "OSM one-storey shell; IPR flat-roof interpretation; existing architecture retains east mural and flue",
    },
  };
}
