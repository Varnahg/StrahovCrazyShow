import mapRaw from "./data/map.json";
import catalogRaw from "./data/building-catalog.json";
import { buildingBaseHeight, groundHeight } from "./terrain";
import type { Building, Vec3 } from "./types";
import earcut from "earcut";
import {
  osmAssetIdentity,
  type WorldAssetIdentity,
} from "./world-asset-identity";

/** Source geometry is OSM, not a rescaled approximation of a dormitory. */
export const B1_OSM_ID = "53929063";
export const B1_RENDER_HEIGHT = 9.6;
export const LANDMARK_BUILDING_REPLACEMENTS = new Set([B1_OSM_ID]);
export const LANDMARK_SOURCE = {
  checkedAt: "2026-10-10",
  b1: "https://www.elsa.cvut.cz/bezbarierove-cvut/pristupnost-objektu/objekt/?o=81",
  b1Photo:
    "https://www.elsa.cvut.cz/wp-content/themes/elsa-cvut/images/objekty/12_6_koleje_Strahov/GALERIE/FULL/03_BLOK_1.JPG",
  b1Door:
    "https://www.elsa.cvut.cz/wp-content/themes/elsa-cvut/images/objekty/12_6_koleje_Strahov/GALERIE/FULL/04_BLOK_1_vstup.JPG",
  entrancePhoto:
    "https://www.elsa.cvut.cz/wp-content/themes/elsa-cvut/images/objekty/12_6_koleje_Strahov/GALERIE/FULL/12_BLOK_2_typicky_hlavni_vstup.JPG",
  entrancePlan:
    "https://www.elsa.cvut.cz/wp-content/themes/elsa-cvut/images/objekty/12_6_koleje_Strahov/SCHEMA/FULL/BLOK_2_-_1NP.jpg",
  b6Plan: "https://wiki.sh.cvut.cz/_media/kolej/bloky/0.jpg",
  b6NorthPhoto:
    "https://www.google.com/maps/@?api=1&map_action=pano&pano=gWCshoWQgiJdy1QWcqe1eQ&heading=178.82123&pitch=20&fov=90",
  stadium: "https://www.openstreetmap.org/relation/1515034",
  stadiumPhoto:
    "https://commons.wikimedia.org/wiki/File:Praha_Strahovsky_stadion.jpg",
  stadiumConstruction:
    "https://www.holcim.cz/sites/czech2/files/2022-06/2013_01.pdf",
  stadiumEastCorrection:
    "Three user-supplied Google Street View reference screenshots inspected 2026-10-10: Vanickova east pavilion from both directions and the opposite campus pavement. Capture date unavailable; references are not textures or photogrammetric geometry.",
  limits:
    "B1 three storeys are photo/document evidence, 9.6 m is interpreted. Entrance proportions and stair heights are interpreted from the named B2 photograph and ELSA description. Stadium plan/heights retain OSM; tier count, pier pitch and material ageing are interpreted, not surveyed. B6 remains owned by its playable interior module.",
} as const;

export function landmarkBuildingHeight(
  building: Pick<Building, "id" | "height">,
) {
  return building.id === B1_OSM_ID ? B1_RENDER_HEIGHT : building.height;
}

export type LandmarkMaterial =
  | "concrete"
  | "pale"
  | "trim"
  | "blind"
  | "base"
  | "metal"
  | "glass"
  | "infill"
  | "brick"
  | "seat"
  | "roof"
  | "stadium-glass"
  | "stadium-frame"
  | "stadium-cladding"
  | "stadium-soffit"
  | "stadium-rail";
export type LandmarkMeshData = {
  positions: number[];
  normals: number[];
  indices: number[];
  uvs: number[];
  /** Original authored pane variation; never sampled from reference pixels. */
  colors?: number[];
};
export type LandmarkPart = LandmarkMeshData & {
  asset: WorldAssetIdentity;
  group: string;
  material: LandmarkMaterial;
  lod: "near" | "far" | "both";
};
export type LandmarkBox = {
  group: string;
  material: LandmarkMaterial;
  x: number;
  y: number;
  z: number;
  w: number;
  h: number;
  d: number;
  yaw?: number;
  collision: boolean;
};
export type MappedEntrance = {
  block: number;
  buildingId: string;
  x: number;
  z: number;
  nx: number;
  nz: number;
  baseY: number;
  rise: number;
  steps: number;
  edgeA: [number, number];
  edgeB: [number, number];
  confidence: "osm-projection-plus-shared-photo-typology";
};
type P = [number, number, number];
type P2 = [number, number];

function ring(points: P2[]) {
  const result = points.slice();
  if (
    result.length > 1 &&
    Math.hypot(
      result[0][0] - result.at(-1)![0],
      result[0][1] - result.at(-1)![1],
    ) < 0.0001
  )
    result.pop();
  return result;
}
export function landmarkEdges(points: P2[]) {
  const p = ring(points);
  const area = p.reduce((s, a, i) => {
    const b = p[(i + 1) % p.length];
    return s + a[0] * b[1] - b[0] * a[1];
  }, 0);
  return p.flatMap((a, i) => {
    const b = p[(i + 1) % p.length],
      length = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (length < 0.08) return [];
    const tx = (b[0] - a[0]) / length,
      tz = (b[1] - a[1]) / length,
      sign = area >= 0 ? 1 : -1;
    return [{ a, b, length, tx, tz, nx: tz * sign, nz: -tx * sign }];
  });
}

/** The reception projects west, but its door faces NORTH. ELSA's B2 plan
 * anchors north to Chaloupeckého; B6's wiki arrow and Sep 2025 north panorama
 * independently confirm this orientation. Never confuse a western projection
 * with a west-facing doorway or use the club 007 entrance. */
export function mappedDormEntrances(
  buildings: Building[],
  baseElevation = (b: Building) => buildingBaseHeight(b.points),
): MappedEntrance[] {
  return buildings.flatMap((b) => {
    const match = /blok (\d+)$/i.exec(b.name),
      block = Number(match?.[1]);
    if (![2, 3, 4, 5, 7, 8, 9, 10].includes(block)) return [];
    const candidates = landmarkEdges(b.points).filter(
      (e) => e.nz < -0.8 && e.length >= 5.1 && e.length <= 6.4,
    );
    const edge = candidates.sort(
      (a, c) => a.a[0] + a.b[0] - (c.a[0] + c.b[0]),
    )[0];
    if (!edge) return [];
    const x = (edge.a[0] + edge.b[0]) / 2,
      z = (edge.a[1] + edge.b[1]) / 2;
    // The campus slopes down along the 70 m slabs. A whole-building median is
    // not the ground at a stair approach and would bury several visible steps.
    const baseY = Math.max(
      baseElevation(b),
      groundHeight(x + edge.nx * 4, z + edge.nz * 4),
    );
    return [
      {
        block,
        buildingId: b.id,
        x,
        z,
        nx: edge.nx,
        nz: edge.nz,
        edgeA: [...edge.a] as [number, number],
        edgeB: [...edge.b] as [number, number],
        baseY,
        rise: 1.8,
        steps: 12,
        confidence: "osm-projection-plus-shared-photo-typology" as const,
      },
    ];
  });
}

export const COMMON_DORM_ENTRANCES = mappedDormEntrances(
  mapRaw.buildings as unknown as Building[],
);
export function entryForFacade(
  buildingId: string,
  a: readonly [number, number],
  b: readonly [number, number],
) {
  return COMMON_DORM_ENTRANCES.find(
    (e) =>
      e.buildingId === buildingId &&
      ((Math.hypot(e.edgeA[0] - a[0], e.edgeA[1] - a[1]) < 0.05 &&
        Math.hypot(e.edgeB[0] - b[0], e.edgeB[1] - b[1]) < 0.05) ||
        (Math.hypot(e.edgeA[0] - b[0], e.edgeA[1] - b[1]) < 0.05 &&
          Math.hypot(e.edgeB[0] - a[0], e.edgeB[1] - a[1]) < 0.05)),
  );
}
/** Cosmetic NPC surface helper; actual players still climb shared Rapier steps. */
export function commonEntranceHeight(x: number, z: number) {
  for (const e of COMMON_DORM_ENTRANCES) {
    const dx = x - e.x,
      dz = z - e.z,
      u = -e.nz * dx + e.nx * dz,
      out = e.nx * dx + e.nz * dz;
    if (Math.abs(u) > 3.45 / 2 || out < 0 || out > 3.96) continue;
    const step =
      out < 0.48
        ? 12
        : Math.max(1, Math.min(12, Math.ceil((3.96 - out) / 0.29)));
    return e.baseY + (step * e.rise) / e.steps;
  }
  return undefined;
}

const emptyMeshData = (): LandmarkMeshData => ({
  positions: [],
  normals: [],
  indices: [],
  uvs: [],
});

class Geometry {
  readonly parts = new Map<string, LandmarkPart>();
  readonly collision = emptyMeshData();
  /** Open roof surfaces require contacts from both sides, unlike the closed
   * wall/box stream. Keep their Rapier flags separate from existing solids. */
  readonly twoSidedRoofCollision = emptyMeshData();
  readonly boxes: LandmarkBox[] = [];
  part(
    group: string,
    material: LandmarkMaterial,
    lod: LandmarkPart["lod"] = "both",
  ) {
    // A porch belongs to one building. Materials may be shared, but merging
    // different entries would destroy independent model identity and pivots.
    const key = `${group}:${material}:${lod}`;
    let value = this.parts.get(key);
    if (!value) {
      value = {
        asset: landmarkAssetIdentity(group),
        group,
        material,
        lod,
        positions: [],
        normals: [],
        indices: [],
        uvs: [],
      };
      this.parts.set(key, value);
    }
    return value;
  }
  quad(
    group: string,
    material: LandmarkMaterial,
    a: P,
    b: P,
    c: P,
    d: P,
    normal: P,
    lod: LandmarkPart["lod"] = "both",
    collide = false,
    uv = [0, 0, 1, 1],
  ) {
    const add = (data: LandmarkMeshData) => {
      const start = data.positions.length / 3;
      data.positions.push(...a, ...b, ...c, ...d);
      for (let i = 0; i < 4; i++) data.normals.push(...normal);
      data.uvs.push(uv[0], uv[1], uv[2], uv[1], uv[2], uv[3], uv[0], uv[3]);
      const u = b.map((x, i) => x - a[i]),
        v = c.map((x, i) => x - a[i]);
      const facing =
        (u[1] * v[2] - u[2] * v[1]) * normal[0] +
        (u[2] * v[0] - u[0] * v[2]) * normal[1] +
        (u[0] * v[1] - u[1] * v[0]) * normal[2];
      const winding = facing >= 0 ? [0, 1, 2, 0, 2, 3] : [0, 2, 1, 0, 3, 2];
      const corners = [a, b, c, d];
      for (let k = 0; k < 6; k += 3) {
        const pa = corners[winding[k]],
          pb = corners[winding[k + 1]],
          pc = corners[winding[k + 2]],
          u = pb.map((v, i) => v - pa[i]),
          v = pc.map((v, i) => v - pa[i]);
        if (
          Math.hypot(
            u[1] * v[2] - u[2] * v[1],
            u[2] * v[0] - u[0] * v[2],
            u[0] * v[1] - u[1] * v[0],
          ) > 1e-9
        )
          data.indices.push(
            start + winding[k],
            start + winding[k + 1],
            start + winding[k + 2],
          );
      }
    };
    add(this.part(group, material, lod));
    if (collide) add(this.collision);
  }
  box(box: LandmarkBox, lod: LandmarkPart["lod"] = "both") {
    this.boxes.push(box);
    const { group, material, x, y, z, w, h, d, collision } = box,
      yaw = box.yaw ?? 0;
    const cos = Math.cos(yaw),
      sin = Math.sin(yaw);
    const p = (px: number, py: number, pz: number): P => [
      x + cos * px + sin * pz,
      y + py,
      z - sin * px + cos * pz,
    ];
    const normal = (nx: number, ny: number, nz: number): P => [
      cos * nx + sin * nz,
      ny,
      -sin * nx + cos * nz,
    ];
    const face = (coords: number[][], n: P, tw: number, th: number) =>
      this.quad(
        group,
        material,
        ...(coords.map((v) => p(v[0], v[1], v[2])) as [P, P, P, P]),
        normal(...n),
        lod,
        collision,
        [0, 0, tw / 3, th / 3],
      );
    face(
      [
        [-w / 2, -h / 2, -d / 2],
        [w / 2, -h / 2, -d / 2],
        [w / 2, h / 2, -d / 2],
        [-w / 2, h / 2, -d / 2],
      ],
      [0, 0, -1],
      w,
      h,
    );
    face(
      [
        [w / 2, -h / 2, d / 2],
        [-w / 2, -h / 2, d / 2],
        [-w / 2, h / 2, d / 2],
        [w / 2, h / 2, d / 2],
      ],
      [0, 0, 1],
      w,
      h,
    );
    face(
      [
        [-w / 2, -h / 2, d / 2],
        [-w / 2, -h / 2, -d / 2],
        [-w / 2, h / 2, -d / 2],
        [-w / 2, h / 2, d / 2],
      ],
      [-1, 0, 0],
      d,
      h,
    );
    face(
      [
        [w / 2, -h / 2, -d / 2],
        [w / 2, -h / 2, d / 2],
        [w / 2, h / 2, d / 2],
        [w / 2, h / 2, -d / 2],
      ],
      [1, 0, 0],
      d,
      h,
    );
    face(
      [
        [-w / 2, h / 2, -d / 2],
        [w / 2, h / 2, -d / 2],
        [w / 2, h / 2, d / 2],
        [-w / 2, h / 2, d / 2],
      ],
      [0, 1, 0],
      w,
      d,
    );
    face(
      [
        [-w / 2, -h / 2, d / 2],
        [w / 2, -h / 2, d / 2],
        [w / 2, -h / 2, -d / 2],
        [-w / 2, -h / 2, -d / 2],
      ],
      [0, -1, 0],
      w,
      d,
    );
  }
  roof(
    group: string,
    points: P2[],
    y: number,
    collision: LandmarkMeshData,
    up = true,
  ) {
    const p = ring(points),
      idx = earcut(p.flat()),
      target = this.part(group, "roof");
    const append = (data: LandmarkMeshData) => {
      const start = data.positions.length / 3;
      for (const [x, z] of p) {
        data.positions.push(x, y, z);
        data.normals.push(0, up ? 1 : -1, 0);
        data.uvs.push(x / 3, z / 3);
      }
      for (let i = 0; i < idx.length; i += 3) {
        const [a, b, c] = idx.slice(i, i + 3),
          pa = p[a],
          pb = p[b],
          pc = p[c],
          cross =
            (pb[0] - pa[0]) * (pc[1] - pa[1]) -
            (pb[1] - pa[1]) * (pc[0] - pa[0]),
          reverse = up ? cross > 0 : cross < 0;
        data.indices.push(
          start + a,
          start + (reverse ? c : b),
          start + (reverse ? b : c),
        );
      }
    };
    append(target);
    append(collision);
  }
  rod(group: string, material: LandmarkMaterial, a: P, b: P, radius: number) {
    const axis = b.map((v, i) => v - a[i]),
      length = Math.hypot(...axis);
    if (length < 1e-7) return;
    const d = axis.map((v) => v / length),
      side = [-d[2], 0, d[0]],
      sl = Math.hypot(...side);
    side.forEach((v, i) => (side[i] = v / sl));
    const up = [
      d[1] * side[2] - d[2] * side[1],
      d[2] * side[0] - d[0] * side[2],
      d[0] * side[1] - d[1] * side[0],
    ];
    const p = (origin: P, angle: number): P =>
      origin.map(
        (v, i) =>
          v + radius * (side[i] * Math.cos(angle) + up[i] * Math.sin(angle)),
      ) as P;
    for (let i = 0; i < 6; i++) {
      const angle = (i * Math.PI) / 3,
        next = ((i + 1) * Math.PI) / 3,
        normal = side.map(
          (v, j) =>
            v * Math.cos((angle + next) / 2) +
            up[j] * Math.sin((angle + next) / 2),
        ) as P;
      this.quad(
        group,
        material,
        p(a, angle),
        p(b, angle),
        p(b, next),
        p(a, next),
        normal,
        "near",
      );
    }
  }
}

/** All material/LOD parts resolve back to one building source object. */
export function landmarkAssetIdentity(group: string): WorldAssetIdentity {
  if (group === "b1") return osmAssetIdentity("building", "way", B1_OSM_ID);
  if (group === "stadium")
    return osmAssetIdentity("building", "relation", "1515034");
  const entry = COMMON_DORM_ENTRANCES.find((e) => group === `entry-${e.block}`);
  if (entry) return osmAssetIdentity("building", "way", entry.buildingId);
  throw new Error(`Unknown landmark asset group ${group}`);
}

function b1(g: Geometry, building: Building, baseY: number) {
  const edges = landmarkEdges(building.points),
    height = B1_RENDER_HEIGHT,
    group = "b1";
  for (const e of edges) {
    const point = (u: number, y: number, outward = 0): P => [
      e.a[0] + e.tx * u + e.nx * outward,
      baseY + y,
      e.a[1] + e.tz * u + e.nz * outward,
    ];
    const panel = (
      material: LandmarkMaterial,
      u: number,
      y: number,
      w: number,
      h: number,
      outward = 0,
      lod: LandmarkPart["lod"] = "both",
    ) =>
      g.quad(
        group,
        material,
        point(u, y, outward),
        point(u + w, y, outward),
        point(u + w, y + h, outward),
        point(u, y + h, outward),
        [e.nx, 0, e.nz],
        lod,
        false,
        [u / 3, y / 3, (u + w) / 3, (y + h) / 3],
      );
    if (e.length <= 5) panel("pale", 0, 0, e.length, height);
    else {
      panel("pale", 0, 0, e.length, 3.75);
      panel("pale", 0, 5.95, e.length, 0.7);
      panel("pale", 0, 8.85, e.length, height - 8.85);
    }
    panel("base", 0, 0, e.length, 0.82, 0.012);
    // Two tall office bands and small ground-floor openings, not a six-storey
    // dormitory grid. Spacing is interpreted from ELSA's identified B1 photo.
    const cells = Math.max(1, Math.round(e.length / 2.12)),
      pitch = e.length / cells;
    if (e.length > 5)
      for (let i = 0; i < cells; i++) {
        const u = i * pitch + 0.19,
          w = Math.max(0.4, pitch - 0.38);
        panel("trim", i * pitch, 3.72, 0.19, 5.16, 0.065);
        panel("trim", u + w, 3.72, pitch - w - 0.19, 5.16, 0.065);
        for (const y of [3.75, 6.65]) {
          panel("glass", u, y, w, 2.2, -0.14);
          panel("trim", u - 0.045, y - 0.04, 0.045, 2.28, 0.07, "near");
          panel("trim", u + w, y - 0.04, 0.045, 2.28, 0.07, "near");
          panel("trim", u, y + 1.65, w, 0.045, -0.095, "near");
          panel("trim", u + w * 0.5 - 0.018, y, 0.036, 2.2, -0.095, "near");
          panel("metal", u - 0.04, y - 0.06, w + 0.08, 0.045, 0.09, "near");
          // Four real reveal faces create depth and grazing-light shade.
          const fronts = [
            point(u, y, 0.065),
            point(u + w, y, 0.065),
            point(u + w, y + 2.2, 0.065),
            point(u, y + 2.2, 0.065),
          ];
          const backs = [
            point(u, y, -0.14),
            point(u + w, y, -0.14),
            point(u + w, y + 2.2, -0.14),
            point(u, y + 2.2, -0.14),
          ];
          const normals: P[] = [
            [0, 1, 0],
            [-e.tx, 0, -e.tz],
            [0, -1, 0],
            [e.tx, 0, e.tz],
          ];
          for (let side = 0; side < 4; side++)
            g.quad(
              group,
              "trim",
              fronts[side],
              fronts[(side + 1) % 4],
              backs[(side + 1) % 4],
              backs[side],
              normals[side],
              "near",
            );
          if ((i + Math.round(y) * 3) % 7 === 0)
            panel("blind", u + 0.04, y + 1.4, w - 0.08, 0.75, -0.13, "near");
        }
        if (i % 2 === 0)
          panel("glass", u + 0.12, 1.35, Math.min(0.95, w), 0.8, 0.027);
      }
    for (const y of [3.44, 6.39, 9.33])
      panel("trim", 0, y, e.length, 0.12, 0.12);
    // The normal entrance belongs on Chaloupeckého, the north cross-wing.
    if (e.nz < -0.8 && e.length > 25) {
      const doorU = (-74.5 - e.a[0]) / e.tx;
      if (doorU > 1.7 && doorU < e.length - 1.7) {
        panel("glass", doorU - 1.45, 0.02, 2.9, 2.45, 0.035);
        for (const u of [
          doorU - 1.45,
          doorU - 0.85,
          doorU,
          doorU + 0.85,
          doorU + 1.45,
        ])
          panel("trim", u - 0.025, 0, 0.05, 2.5, 0.095);
        panel("trim", doorU - 1.48, 2.45, 2.96, 0.065, 0.095);
        panel("metal", doorU - 0.12, 0.9, 0.025, 0.37, 0.14, "near");
        panel("metal", doorU + 0.12, 0.9, 0.025, 0.37, 0.14, "near");
      }
    }
  }
  // Earcut preserves the concave Z footprint and its two external courtyards.
  g.roof(group, building.points, baseY + height, g.twoSidedRoofCollision);
  return { group, points: ring(building.points), baseY, height };
}

function entrances(g: Geometry, rows: MappedEntrance[]) {
  for (const e of rows) {
    const group = `entry-${e.block}`,
      tx = -e.nz,
      tz = e.nx;
    const yaw = Math.atan2(-tz, tx);
    const at = (u: number, v: number, out: number) => ({
      x: e.x + tx * u + e.nx * out,
      y: e.baseY + v,
      z: e.z + tz * u + e.nz * out,
    });
    const box = (
      material: LandmarkMaterial,
      u: number,
      v: number,
      out: number,
      w: number,
      h: number,
      d: number,
      collision = true,
      lod: LandmarkPart["lod"] = "both",
    ) =>
      g.box(
        { group, material, ...at(u, v, out), w, h, d, yaw, collision },
        lod,
      );
    const stepDepth = 0.29,
      landing = 0.48,
      depth = e.steps * stepDepth + landing,
      width = 3.45;
    for (let i = 0; i < e.steps; i++) {
      const h = ((i + 1) * e.rise) / e.steps,
        outward = landing + (e.steps - i - 0.5) * stepDepth;
      box("concrete", 0, h / 2, outward, width, h, stepDepth + 0.002);
    }
    box("concrete", 0, e.rise / 2, landing / 2, width, e.rise, landing);
    box("metal", 0, e.rise + 2.58, depth / 2, width + 0.18, 0.12, depth + 0.13);
    for (const side of [-1, 1]) {
      box(
        "metal",
        side * (width / 2 - 0.035),
        (e.rise + 2.55) / 2,
        depth - 0.04,
        0.065,
        e.rise + 2.55,
        0.065,
      );
      // The identified B2 photograph has one screened side and one open side
      // alongside the concrete core. Two opaque side walls made a false tunnel.
      if (side === -1) {
        box(
          "pale",
          side * (width / 2 + 0.015),
          1.35,
          depth / 2,
          0.08,
          2.7,
          depth,
        );
        box(
          "infill",
          side * (width / 2 + 0.015),
          3.52,
          depth / 2,
          0.065,
          1.64,
          depth,
        );
        box(
          "metal",
          side * (width / 2 + 0.035),
          2.7,
          depth / 2,
          0.07,
          0.06,
          depth,
        );
        for (let rib = 0; rib < 15; rib++)
          box(
            "metal",
            side * (width / 2 + 0.058),
            3.51,
            ((rib + 0.5) * depth) / 15,
            0.025,
            1.62,
            0.025,
            false,
            "near",
          );
      }
      // Sloping handrail follows the actual stair incline, kept out of the
      // clear 3.1 m walking strip. Thin rods do not need microscopic colliders.
      for (const rise of [0.45, 0.85]) {
        const a = at(
            side * (width / 2 - 0.18),
            0.15 + rise,
            landing + (e.steps - 0.5) * stepDepth,
          ),
          b = at(
            side * (width / 2 - 0.18),
            e.rise + rise,
            landing + 0.5 * stepDepth,
          );
        g.rod(group, "metal", [a.x, a.y, a.z], [b.x, b.y, b.z], 0.025);
      }
      for (let i = 0; i < e.steps; i++) {
        const out = landing + (e.steps - i - 0.5) * stepDepth,
          y = ((i + 1) * e.rise) / e.steps + 0.85;
        if (i % 3 === 0)
          box(
            "metal",
            side * (width / 2 - 0.18),
            y - 0.38,
            out,
            0.035,
            0.76,
            0.035,
            false,
            "near",
          );
      }
    }
    // Closed exterior doors represent unimplemented interiors honestly. B6
    // is intentionally excluded and retains its traversable shared opening.
    box("glass", 0, e.rise + 1.16, 0.045, 1.75, 2.32, 0.035, false);
    for (const u of [-0.9, 0, 0.9])
      box("metal", u, e.rise + 1.16, 0.075, 0.055, 2.38, 0.05, false);
    box("metal", 0, e.rise + 2.35, 0.075, 1.85, 0.065, 0.05, false);
  }
}

/** First positive ray intersection, valid for the mapped stadium's star-shaped
 * bowl. Vertex angles are included so original perimeter corners are retained. */
export function ringRayDistance(
  points: P2[],
  cx: number,
  cz: number,
  angle: number,
) {
  const dx = Math.cos(angle),
    dz = Math.sin(angle);
  let result = Infinity;
  for (const e of landmarkEdges(points)) {
    const ex = e.b[0] - e.a[0],
      ez = e.b[1] - e.a[1],
      den = dx * ez - dz * ex;
    if (Math.abs(den) < 1e-9) continue;
    const ax = e.a[0] - cx,
      az = e.a[1] - cz;
    const t = (ax * ez - az * ex) / den,
      u = (ax * dz - az * dx) / den;
    if (t > 0 && u >= -1e-7 && u <= 1 + 1e-7) result = Math.min(result, t);
  }
  return result;
}

const stadiumSource = catalogRaw.landmarks.find(
  (l) => l.id === "great-strahov-stadium",
)!;
export const STADIUM_PLAN = {
  outer: stadiumSource.outerRings[0] as P2[],
  inner: stadiumSource.innerRings[0] as P2[],
  center: { x: -286, z: 18 },
  parts: stadiumSource.parts,
  rows: 22,
  upperHeight: 10,
  lowerHeight: 1.1,
  pierPitch: 7.8,
};

const eastPavilionSource = STADIUM_PLAN.parts.find(
  (p) => p.osmId === "480849465",
)!;
/** Exact OSM street-side polyline, north to south. Vertical subdivision and
 * stair dimensions are interpreted from the supplied photos, not surveyed.
 * The undercroft portal follows covered service way 873110981 at z=17.522.
 */
export const STADIUM_EAST_PAVILION = {
  osmId: eastPavilionSource.osmId,
  footprint: eastPavilionSource.points as P2[],
  frontage: [
    [-140.18, -48.38],
    [-139.39, -16.53],
    [-138.08, 17.52],
    [-137.81, 45.34],
    [-137.38, 65.93],
    [-137.09, 77.75],
  ] as P2[],
  height: eastPavilionSource.height,
  concourseY: 4.2,
  cantileverSoffitY: 8.4,
  principalGlassTopY: 13.6,
  upperGlassBottomY: 18.35,
  upperGlassTopY: 19.55,
  columnInset: 3.4,
  columnPitch: 7.8,
  glazingPitch: 2.55,
  coveredPortalZ: 17.522,
  portalClearWidth: 5.8,
  stairWidth: 3.8,
  stairOutward: 3.0,
  stairStepsPerFlight: 28,
  stairRun: 0.31,
  stairLandingHalfLength: 1.8,
  confidence:
    "OSM-footprint-and-height; source-DEM-base; photo-interpreted-structural-silhouette-and-detail" as const,
};

export function distanceToStadium(position: Pick<Vec3, "x" | "z">) {
  const inside = (points: P2[]) => {
    let value = false;
    for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
      const a = points[i],
        b = points[j];
      if (
        a[1] > position.z !== b[1] > position.z &&
        position.x <
          ((b[0] - a[0]) * (position.z - a[1])) / (b[1] - a[1]) + a[0]
      )
        value = !value;
    }
    return value;
  };
  if (inside(STADIUM_PLAN.outer) && !inside(STADIUM_PLAN.inner)) return 0;
  let minimum = Infinity;
  for (const points of [STADIUM_PLAN.outer, STADIUM_PLAN.inner])
    for (let i = 0; i < points.length - 1; i++) {
      const a = points[i],
        b = points[i + 1],
        dx = b[0] - a[0],
        dz = b[1] - a[1],
        length = dx * dx + dz * dz;
      if (length < 1e-8) continue;
      const t = Math.max(
        0,
        Math.min(
          1,
          ((position.x - a[0]) * dx + (position.z - a[1]) * dz) / length,
        ),
      );
      minimum = Math.min(
        minimum,
        Math.hypot(position.x - a[0] - t * dx, position.z - a[1] - t * dz),
      );
    }
  return minimum;
}

function eastPavilion(g: Geometry, stadiumBaseY: number) {
  const source = STADIUM_EAST_PAVILION,
    group = "stadium",
    front = source.frontage;
  // A median of the whole 500 m bowl raised this road-side pavilion by 2.98 m.
  // Keep the optional whole-model offset, but anchor the pavilion to its own
  // actual ground samples rather than the western hillside.
  const offset = stadiumBaseY - buildingBaseHeight(STADIUM_PLAN.outer),
    baseY = buildingBaseHeight(source.footprint) + offset,
    lengths = front
      .slice(1)
      .map((p, i) => Math.hypot(p[0] - front[i][0], p[1] - front[i][1])),
    total = lengths.reduce((a, b) => a + b, 0);
  function at(s: number, y: number, out = 0) {
    let remaining = Math.max(0, Math.min(total, s)),
      i = 0;
    while (i < lengths.length - 1 && remaining > lengths[i])
      remaining -= lengths[i++];
    const a = front[i],
      b = front[i + 1],
      tx = (b[0] - a[0]) / lengths[i],
      tz = (b[1] - a[1]) / lengths[i],
      nx = tz,
      nz = -tx;
    return {
      p: [
        a[0] + tx * remaining + nx * out,
        baseY + y,
        a[1] + tz * remaining + nz * out,
      ] as P,
      tx,
      tz,
      nx,
      nz,
    };
  }
  const box = (
    kind: LandmarkMaterial,
    s: number,
    y: number,
    out: number,
    w: number,
    h: number,
    d: number,
    collide = true,
    lod: LandmarkPart["lod"] = "both",
  ) => {
    const v = at(s, y, out);
    g.box(
      {
        group,
        material: kind,
        x: v.p[0],
        y: v.p[1],
        z: v.p[2],
        w,
        h,
        d,
        yaw: Math.atan2(-v.tz, v.tx),
        collision: collide,
      },
      lod,
    );
  };
  const face = (
    kind: LandmarkMaterial,
    a: number,
    b: number,
    low: number,
    high: number,
    out = 0,
    lod: LandmarkPart["lod"] = "both",
    solid = false,
    tint = 1,
  ) => {
    const v = at((a + b) / 2, 0, out);
    g.quad(
      group,
      kind,
      at(a, low, out).p,
      at(b, low, out).p,
      at(b, high, out).p,
      at(a, high, out).p,
      [v.nx, 0, v.nz],
      lod,
      solid,
      [a / 3, low / 3, b / 3, high / 3],
    );
    if (kind === "stadium-glass") {
      const part = g.part(group, kind, lod),
        old = part.positions.length / 3 - 4;
      part.colors ??= Array.from({ length: old * 4 }, () => 1);
      for (let i = 0; i < 4; i++)
        part.colors.push(tint, tint * 0.99, tint * 0.97, 1);
    }
  };
  const spans = lengths.map((length, i) => ({
    a: lengths.slice(0, i).reduce((a, b) => a + b, 0),
    b: lengths.slice(0, i + 1).reduce((a, b) => a + b, 0),
  }));
  for (const span of spans) {
    const middle = (span.a + span.b) / 2,
      width = span.b - span.a;
    // Horizontal opaque metal-faced lower concourse, not a ground-floor wall.
    box(
      "concrete",
      middle,
      source.concourseY - 0.18,
      -9.5,
      width,
      0.36,
      16.6,
      true,
    );
    face(
      "stadium-cladding",
      span.a,
      span.b,
      source.concourseY,
      source.concourseY + 1.13,
      -1.15,
      "both",
      true,
    );
    box(
      "stadium-soffit",
      middle,
      source.cantileverSoffitY + 0.12,
      -8.4,
      width,
      0.24,
      16.8,
      true,
    );
    face(
      "concrete",
      span.a,
      span.b,
      source.principalGlassTopY,
      source.upperGlassBottomY,
      0.03,
      "both",
      true,
    );
    face(
      "stadium-frame",
      span.a,
      span.b,
      source.upperGlassTopY,
      source.height,
      0.04,
      "both",
      true,
    );
    face(
      "stadium-glass",
      span.a,
      span.b,
      source.cantileverSoffitY + 0.24,
      source.principalGlassTopY,
      0.025,
      "far",
      true,
    );
    face(
      "stadium-glass",
      span.a,
      span.b,
      source.upperGlassBottomY,
      source.upperGlassTopY,
      0.025,
      "far",
      true,
    );
    // The projecting roof and ribbed underside carry the recognizable profile.
    box(
      "stadium-soffit",
      middle,
      source.height + 0.12,
      -8.2,
      width + 0.02,
      0.24,
      18.2,
      true,
    );
    box(
      "stadium-cladding",
      middle,
      source.height + 0.13,
      0.88,
      width,
      0.18,
      0.12,
      false,
    );
    for (const y of [
      source.cantileverSoffitY + 0.24,
      9.24,
      10.12,
      11.45,
      source.principalGlassTopY,
      source.upperGlassBottomY,
      source.upperGlassTopY,
    ])
      box("stadium-frame", middle, y, 0.095, width, 0.065, 0.13, false);
    for (let s = span.a + 0.65; s < span.b; s += 1.3)
      box(
        "stadium-frame",
        s,
        source.concourseY + 0.56,
        -1.12,
        0.018,
        1.12,
        0.045,
        false,
        "near",
      );
    for (let s = span.a + 1.8; s < span.b; s += 3.6)
      box(
        "stadium-frame",
        s,
        (source.principalGlassTopY + source.upperGlassBottomY) / 2,
        0.047,
        0.018,
        source.upperGlassBottomY - source.principalGlassTopY,
        0.025,
        false,
        "near",
      );
    // Deep rear support wall is interrupted by the OSM covered service portal.
    const rearMiddle = at(middle, 0, -16.2).p;
    if (
      Math.abs(rearMiddle[2] - source.coveredPortalZ) >
      source.portalClearWidth / 2 + (span.b - span.a) / 2
    )
      face(
        "concrete",
        span.a,
        span.b,
        0,
        source.concourseY - 0.35,
        -16.2,
        "both",
        true,
      );
  }
  const columns = Math.ceil(total / source.columnPitch);
  let columnRows = 0;
  for (let i = 0; i <= columns; i++) {
    const s = (i * total) / columns;
    if (
      Math.abs(at(s, 0).p[2] - source.coveredPortalZ) <
      source.portalClearWidth / 2 + 0.4
    )
      continue;
    columnRows++;
    for (const [out, top, w] of [
      [-source.columnInset, source.cantileverSoffitY, 0.67],
      [-1.45, source.concourseY - 0.36, 0.54],
    ]) {
      const p = at(s, 0, out).p,
        bottom = groundHeight(p[0], p[2]) + offset - baseY - 0.15;
      box("concrete", s, (bottom + top) / 2, out, w, top - bottom, 0.8, true);
    }
    // Concrete structural beams disappear into the dark cantilever soffit.
    box(
      "stadium-soffit",
      s,
      source.cantileverSoffitY - 0.2,
      -6.9,
      0.36,
      0.4,
      13.6,
      true,
    );
  }
  // The source has a curtain-wall grid, with four unequal-height rows below
  // a broad concrete spandrel and a narrow clerestory. It is never a dorm grid.
  const bays = Math.ceil(total / source.glazingPitch),
    pitch = total / bays;
  for (let i = 0; i < bays; i++) {
    const a = i * pitch,
      b = (i + 1) * pitch,
      tint = 0.82 + 0.16 * ((Math.sin(i * 37.17) + 1) / 2);
    for (const [low, high] of [
      [source.cantileverSoffitY + 0.24, 9.24],
      [9.24, 10.12],
      [10.12, 11.45],
      [11.45, source.principalGlassTopY],
      [source.upperGlassBottomY, source.upperGlassTopY],
    ])
      face(
        "stadium-glass",
        a + 0.025,
        b - 0.025,
        low + 0.025,
        high - 0.025,
        0.03,
        "near",
        true,
        tint,
      );
    for (const [low, high] of [
      [source.cantileverSoffitY + 0.24, source.principalGlassTopY],
      [source.upperGlassBottomY, source.upperGlassTopY],
    ])
      box(
        "stadium-frame",
        a,
        (low + high) / 2,
        0.095,
        0.058,
        high - low,
        0.13,
        false,
        "near",
      );
    if (i % 2 === 0)
      for (const [low, high] of [
        [source.cantileverSoffitY + 0.24, source.principalGlassTopY],
        [source.upperGlassBottomY, source.upperGlassTopY],
      ])
        box(
          "stadium-frame",
          a,
          (low + high) / 2,
          0.095,
          0.058,
          high - low,
          0.13,
          false,
          "far",
        );
  }
  // Original authored folded flights flank the actual central service portal.
  // Their position follows the portal; exact flight shape/risers are a photo
  // interpretation pending the source IPR mesh, explicitly not photogrammetry.
  const stairS = lengths[0] + lengths[1],
    run = source.stairStepsPerFlight * source.stairRun,
    landing = source.stairLandingHalfLength,
    halfWidth = source.stairWidth / 2;
  box(
    "concrete",
    stairS,
    source.concourseY - 0.16,
    1.9,
    landing * 2,
    0.32,
    6.0,
    true,
  );
  const stairProfiles: P2[][] = [];
  for (const direction of [-1, 1]) {
    const bottomS = stairS + direction * (landing + run),
      bottom = at(bottomS, 0, source.stairOutward).p,
      bottomY = groundHeight(bottom[0], bottom[2]) + offset - baseY - 0.025,
      rise = source.concourseY - bottomY;
    const sAt = (progress: number) =>
      stairS + direction * (landing + run - progress);
    for (let i = 0; i < source.stairStepsPerFlight; i++) {
      const h = bottomY + ((i + 1) * rise) / source.stairStepsPerFlight;
      box(
        "concrete",
        sAt((i + 0.5) * source.stairRun),
        h - 0.13,
        source.stairOutward,
        source.stairRun + 0.004,
        0.26,
        source.stairWidth,
        true,
      );
    }
    // Thin sculpted cheek beams retain an open arch below the upper flight.
    const profile: P2[] = [];
    for (let i = 0; i <= 16; i++) {
      const t = i / 16,
        u = t * run;
      profile.push([u, bottomY + t * rise + 0.11]);
    }
    for (let i = 16; i >= 0; i--) {
      const t = i / 16,
        u = t * run,
        round = 0.3 * Math.sin(Math.PI * t);
      profile.push([u, bottomY + t * rise - 0.46 - round]);
    }
    stairProfiles.push(profile);
    const indices = earcut(profile.flat());
    for (const side of [-1, 1]) {
      const out = source.stairOutward + side * (halfWidth + 0.035),
        thickness = 0.2,
        p = (index: number, depth: number) =>
          at(sAt(profile[index][0]), profile[index][1], out + depth).p;
      for (let i = 0; i < indices.length; i += 3) {
        const [a, b, c] = indices.slice(i, i + 3),
          v = at(stairS, 0, out);
        for (const d of [-thickness / 2, thickness / 2])
          g.quad(
            group,
            "concrete",
            p(a, d),
            p(b, d),
            p(c, d),
            p(c, d),
            [v.nx * Math.sign(d), 0, v.nz * Math.sign(d)],
            "both",
            true,
          );
      }
      for (let i = 0; i < profile.length; i++) {
        const next = (i + 1) % profile.length,
          a = p(i, -thickness / 2),
          b = p(next, -thickness / 2),
          c = p(next, thickness / 2),
          d = p(i, thickness / 2),
          dx = b[0] - a[0],
          dy = b[1] - a[1],
          dz = b[2] - a[2],
          l = Math.hypot(dx, dy, dz),
          v = at(stairS, 0, out);
        g.quad(
          group,
          "concrete",
          a,
          b,
          c,
          d,
          [(-v.tx * dy) / l, (dx * v.tx + dz * v.tz) / l, (-v.tz * dy) / l],
          "both",
          true,
        );
      }
      const railOut = out - side * 0.15;
      g.rod(
        group,
        "stadium-rail",
        at(sAt(0), bottomY + 1.0, railOut).p,
        at(sAt(run), source.concourseY + 1.0, railOut).p,
        0.022,
      );
      for (let i = 0; i <= 12; i++) {
        const t = i / 12;
        box(
          "stadium-rail",
          sAt(t * run),
          bottomY + t * rise + 0.52,
          railOut,
          0.026,
          0.98,
          0.026,
          false,
          "near",
        );
      }
    }
  }
  for (const out of [1.05, 4.8]) {
    g.rod(
      group,
      "stadium-rail",
      at(stairS - landing, source.concourseY + 1, out).p,
      at(stairS + landing, source.concourseY + 1, out).p,
      0.022,
    );
    for (let s = stairS - landing; s <= stairS + landing; s += 0.6)
      box(
        "stadium-rail",
        s,
        source.concourseY + 0.5,
        out,
        0.026,
        1,
        0.026,
        false,
        "near",
      );
  }
  // Close only the two ends of the elevated office body. Ground-level ends
  // remain open, so this cannot regress into a solid pavilion-shaped cuboid.
  for (const s of [0, total]) {
    const v = at(s, 0),
      normal: P = [v.tx * (s === 0 ? -1 : 1), 0, v.tz * (s === 0 ? -1 : 1)];
    g.quad(
      group,
      "concrete",
      at(s, source.cantileverSoffitY, 0).p,
      at(s, source.cantileverSoffitY, -18).p,
      at(s, source.height, -18).p,
      at(s, source.height, 0).p,
      normal,
      "both",
      true,
    );
  }
  return {
    osmId: source.osmId,
    baseY,
    height: source.height,
    frontageMetres: total,
    columns: columnRows,
    glazingBays: bays,
    stairFlights: 2,
    stairStepsPerFlight: source.stairStepsPerFlight,
    stairCenter: at(stairS, 0).p,
    stairProfiles,
  };
}

function stadium(g: Geometry, baseY: number) {
  const { outer, inner, center, rows, upperHeight, lowerHeight } = STADIUM_PLAN;
  const outside = ring(outer),
    inside = ring(inner),
    points = [...outside, ...inside],
    triangles = earcut(points.flat(), [outside.length]);
  type Section = { x: number; z: number; t: number };
  const vertices = points.map(([x, z], i) => ({
    x,
    z,
    t: i < outside.length ? 1 : 0,
  }));
  const clip = (poly: Section[], value: number, above: boolean) => {
    const result: Section[] = [];
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i],
        b = poly[(i + 1) % poly.length],
        ain = above ? a.t >= value - 1e-8 : a.t <= value + 1e-8,
        bin = above ? b.t >= value - 1e-8 : b.t <= value + 1e-8;
      if (ain) result.push(a);
      if (ain !== bin) {
        const f = (value - a.t) / (b.t - a.t);
        result.push({
          x: a.x + (b.x - a.x) * f,
          z: a.z + (b.z - a.z) * f,
          t: value,
        });
      }
    }
    return result.filter(
      (p, i) =>
        i === 0 ||
        Math.hypot(p.x - result[i - 1].x, p.z - result[i - 1].z) > 1e-7,
    );
  };
  const pos = (v: Section, y: number): P => [v.x, baseY + y, v.z];
  for (let j = 0; j < triangles.length; j += 3) {
    const triangle = triangles.slice(j, j + 3).map((i) => vertices[i]);
    const far = triangle.map((v) =>
      pos(v, lowerHeight + (upperHeight - lowerHeight) * v.t),
    );
    g.quad(
      "stadium",
      "concrete",
      far[0],
      far[1],
      far[2],
      far[2],
      [0, 1, 0],
      "far",
    );
    for (let i = 0; i < rows; i++) {
      const lo = i / rows,
        hi = (i + 1) / rows,
        h = lowerHeight + (upperHeight - lowerHeight) * hi,
        prev = lowerHeight + (upperHeight - lowerHeight) * lo;
      const poly = clip(clip(triangle, lo, true), hi, false);
      if (poly.length < 3) continue;
      // Clip each exact annulus triangle into step bands. Radial sampling
      // cannot preserve the bowl's re-entrant west-side notches; using the
      // original hole polygon prevents a spurious roof over those field bays.
      for (let k = 1; k < poly.length - 1; k++)
        g.quad(
          "stadium",
          "seat",
          pos(poly[0], h),
          pos(poly[k], h),
          pos(poly[k + 1], h),
          pos(poly[k + 1], h),
          [0, 1, 0],
          "near",
          true,
          [poly[0].x / 3, poly[0].z / 3, poly[k + 1].x / 3, poly[k + 1].z / 3],
        );
      const cuts = poly.filter((v) => Math.abs(v.t - lo) < 1e-7);
      if (cuts.length >= 2) {
        const a = cuts[0],
          b = cuts.find((v) => Math.hypot(v.x - a.x, v.z - a.z) > 1e-6);
        if (b) {
          const len = Math.hypot(b.x - a.x, b.z - a.z),
            midX = (a.x + b.x) / 2,
            midZ = (a.z + b.z) / 2,
            n: P = [(b.z - a.z) / len, 0, -(b.x - a.x) / len];
          if (n[0] * (midX - center.x) + n[2] * (midZ - center.z) > 0) {
            n[0] *= -1;
            n[2] *= -1;
          }
          g.quad(
            "stadium",
            "concrete",
            pos(a, i === 0 ? 0 : prev),
            pos(b, i === 0 ? 0 : prev),
            pos(b, h),
            pos(a, h),
            n,
            "near",
            true,
          );
        }
      }
    }
  }
  for (const e of landmarkEdges(outer)) {
    if (e.length < 0.5) continue;
    // The main east pavilion has its own photo-correct structure. A generic
    // ten-metre ring parapet here used to occlude its blue curtain wall.
    const middleZ = (e.a[1] + e.b[1]) / 2;
    if (
      e.nx > 0.9 &&
      middleZ > STADIUM_EAST_PAVILION.frontage[0][1] &&
      middleZ < STADIUM_EAST_PAVILION.frontage.at(-1)![1]
    )
      continue;
    const yaw = Math.atan2(-e.tz, e.tx),
      cx = (e.a[0] + e.b[0]) / 2,
      cz = (e.a[1] + e.b[1]) / 2;
    const box = (
      material: LandmarkMaterial,
      u: number,
      y: number,
      out: number,
      w: number,
      h: number,
      d: number,
      lod: LandmarkPart["lod"] = "both",
      collision = true,
    ) =>
      g.box(
        {
          group: "stadium",
          material,
          x: e.a[0] + e.tx * u + e.nx * out,
          y: baseY + y,
          z: e.a[1] + e.tz * u + e.nz * out,
          w,
          h,
          d,
          yaw,
          collision,
        },
        lod,
      );
    // Continuous upper concrete parapet and projecting lower concourse.
    box("concrete", e.length / 2, upperHeight - 0.8, 0, e.length, 1.6, 0.45);
    box("concrete", e.length / 2, upperHeight - 2.2, 0.22, e.length, 0.32, 1.9);
    const count = Math.max(1, Math.ceil(e.length / STADIUM_PLAN.pierPitch));
    for (let i = 0; i <= count; i++) {
      const u = (e.length * i) / count,
        x = e.a[0] + e.tx * u,
        z = e.a[1] + e.tz * u;
      const foot = Math.min(0, groundHeight(x, z) - baseY) - 0.15,
        top = upperHeight - 2.2;
      box("concrete", u, (foot + top) / 2, -0.23, 0.48, top - foot, 0.65);
    }
    // Shadowed open bays, not a full-height concrete wall. Actual pier gaps
    // remain physical gaps; only visible piers/slabs are collidable.
    void cx;
    void cz;
  }
  // Explicit OSM part IDs retain the differing main stand heights. East is
  // horizontal glazing over concrete decks; north/south are open colonnades.
  for (const p of STADIUM_PLAN.parts.filter((p) =>
    ["480849464", "480849466"].includes(p.osmId),
  )) {
    const isEast = p.osmId === "480849465",
      edges = landmarkEdges(p.points as P2[]),
      h = p.height;
    for (const e of edges) {
      const point = (u: number, y: number, out = 0): P => [
        e.a[0] + e.tx * u + e.nx * out,
        baseY + y,
        e.a[1] + e.tz * u + e.nz * out,
      ];
      const face = (
        mat: LandmarkMaterial,
        y: number,
        hh: number,
        out = 0,
        lod: LandmarkPart["lod"] = "both",
        solid = true,
      ) =>
        g.quad(
          "stadium",
          mat,
          point(0, y, out),
          point(e.length, y, out),
          point(e.length, y + hh, out),
          point(0, y + hh, out),
          [e.nx, 0, e.nz],
          lod,
          solid,
          [0, 0, e.length / 3, hh / 3],
        );
      face("concrete", h - (isEast ? 1.55 : 1.05), isEast ? 1.55 : 1.05);
      if (isEast) {
        for (const y of [8.6, 12.25, 15.9]) {
          face("glass", y, 2.55, 0.018);
          face("concrete", y - 1.1, 1.1, 0.13);
          const n = Math.ceil(e.length / 2.65);
          for (let i = 0; i <= n; i++) {
            const u = (e.length * i) / n;
            g.quad(
              "stadium",
              "metal",
              point(u - 0.022, y, 0.045),
              point(u + 0.022, y, 0.045),
              point(u + 0.022, y + 2.55, 0.045),
              point(u - 0.022, y + 2.55, 0.045),
              [e.nx, 0, e.nz],
              "near",
            );
          }
        }
      } else {
        const n = Math.ceil(e.length / 7.8),
          yaw = Math.atan2(-e.tz, e.tx);
        for (let i = 0; i <= n; i++)
          g.box({
            group: "stadium",
            material: "concrete",
            x: e.a[0] + (e.tx * e.length * i) / n,
            y: baseY + (10 + h - 1.05) / 2,
            z: e.a[1] + (e.tz * e.length * i) / n,
            w: 0.46,
            h: h - 1.05 - 10,
            d: 0.46,
            yaw,
            collision: true,
          });
      }
    }
    g.roof("stadium", p.points as P2[], baseY + h, g.collision);
    g.roof("stadium", p.points as P2[], baseY + h - 0.45, g.collision, false);
    if (isEast)
      g.roof("stadium", p.points as P2[], baseY + 7.5, g.collision, false);
  }
  const east = eastPavilion(g, baseY);
  return { baseY, samples: points.length, rows, east };
}

export function buildLandmarkPlan(
  options: {
    buildings?: Building[];
    baseElevation?: (building: Building) => number;
    stadiumBaseY?: number;
  } = {},
) {
  const buildings =
      options.buildings ?? (mapRaw.buildings as unknown as Building[]),
    base = options.baseElevation ?? ((b) => buildingBaseHeight(b.points));
  const geometry = new Geometry(),
    building = buildings.find((b) => b.id === B1_OSM_ID),
    b1Roof = building ? b1(geometry, building, base(building)) : undefined;
  const entranceRows = mappedDormEntrances(buildings, base);
  entrances(geometry, entranceRows);
  const stadiumBaseY =
    options.stadiumBaseY ?? buildingBaseHeight(STADIUM_PLAN.outer);
  const stadiumStats = stadium(geometry, stadiumBaseY);
  return {
    parts: [...geometry.parts.values()],
    collision: geometry.collision,
    twoSidedRoofCollision: geometry.twoSidedRoofCollision,
    boxes: geometry.boxes,
    entrances: entranceRows,
    b1Roof,
    stadium: stadiumStats,
  };
}

export type LandmarkPlan = ReturnType<typeof buildLandmarkPlan>;
