import coverage from "./data/campus-coverage.json";
import { groundHeight, TERRAIN_REFERENCE_BPV } from "./terrain";
import type {
  OutdoorArtifact,
  OutdoorArtifactCollider,
  OutdoorArtifactMaterial,
  OutdoorArtifactPart,
  OutdoorArtifactPlan,
} from "./outdoor-artifacts";

type P = [number, number, number];
type Material = OutdoorArtifactMaterial;
const CHECKED_AT = "2026-10-12";
const TRACTOR_SOURCE = "https://umenipromesto.eu/katalog/detail/1798/62?v=list";
const TOWER_SOURCE = "https://prague.eu/cs/objevujte/petrinska-rozhledna/";

/** Same local metre projection used by fetch-map; +X east and +Z south. */
function project(lat: number, lon: number) {
  return {
    x: Number(
      (
        (lon - coverage.origin.lon) *
        111320 *
        Math.cos((coverage.origin.lat * Math.PI) / 180)
      ).toFixed(2),
    ),
    z: Number((-(lat - coverage.origin.lat) * 111320).toFixed(2)),
  };
}

export const LANDMARK_REFERENCE = {
  checkedAt: CHECKED_AT,
  tractor: {
    source: TRACTOR_SOURCE,
    photo: "https://umenipromesto.eu/data/katalog/1798/img-0311-6927.jpg",
    photoAuthor: "Ondřej Surový",
    photoDate: "2022-07",
    osmSource: "https://www.openstreetmap.org/node/13482792171",
    sourceTimestamp: "2026-07-07T06:06:41Z",
    lat: 50.081671,
    lon: 14.390167,
    catalogLat: 50.081729,
    catalogLon: 14.390208,
    dimensionMethod:
      "photo interpretation; approximately 3.9 m tall, not a survey",
    yawMethod:
      "photo interpretation toward the B5 frontage; approximate, not a measured azimuth",
  },
  tower: {
    source: TOWER_SOURCE,
    photo:
      "https://pct-wp-prod.storage.googleapis.com/2024/03/14160723/DSC_6996-c.jpg",
    lat: 50.083543041143,
    lon: 14.395043251282,
    sourcePosition:
      "Prague City Tourism route destination embedded in the official page",
    structureHeight: 58.7,
    baseDiagonal: 21.65,
    firstPlatform: 20,
    topPlatform: 51,
    baseAltitude: 324,
    heightMethod:
      "2021 remeasurement of highest original structural point, reported by operator",
    altitudeMethod:
      "operator's rounded altitude; interpreted in the project's Bpv datum, ±2 m allowance, not a local survey",
    radioMast:
      "Modern antenna above the historical structural peak omitted: verified height unavailable.",
  },
} as const;

const tractorPosition = project(
  LANDMARK_REFERENCE.tractor.lat,
  LANDMARK_REFERENCE.tractor.lon,
);
const towerPosition = project(
  LANDMARK_REFERENCE.tower.lat,
  LANDMARK_REFERENCE.tower.lon,
);

/** Lightweight map inventory; importing this does not build the geometry. */
export const OUTDOOR_LANDMARKS: readonly OutdoorArtifact[] = [
  {
    id: "punk-tractor",
    kind: "tractor",
    name: "První punkový pomník · růžový traktor",
    source: TRACTOR_SOURCE,
    ...tractorPosition,
    yaw: 0.18,
    points: [],
    osmId: "13482792171",
    osmType: "node",
    nearbyTreeOsmIds: [],
    tags: {
      tourism: "artwork",
      artwork_type: "installation",
      artist_name: "David Černý",
      start_date: "2022-06-22",
      checkedAt: CHECKED_AT,
    },
    positionEvidence:
      "OSM node 13482792171 v4 (2026-07-07); GHMP SVP-0770 marker differs by 7.1 m; map point retained, no claim of survey precision.",
    orientationEvidence: LANDMARK_REFERENCE.tractor.yawMethod,
    dimensionsEvidence:
      "GHMP photo by Ondřej Surový 07/2022: nose-up pink Zetor, two rear tyres, one raised front tyre and one padlock. Dimensions are photo interpretation, not measured.",
  },
  {
    id: "petrin-tower",
    kind: "tower",
    name: "Petřínská rozhledna · vzdálená dominanta",
    source: TOWER_SOURCE,
    ...towerPosition,
    yaw: 0,
    points: [],
    osmId: "7645353",
    osmType: "way",
    nearbyTreeOsmIds: [],
    tags: {
      man_made: "tower",
      "tower:construction": "lattice",
      "tower:type": "observation",
      backdrop: "yes",
      checkedAt: CHECKED_AT,
    },
    positionEvidence:
      "Official operator's route point (50.083543041143, 14.395043251282), checked 2026-10-12; north of playable terrain, never moved into campus.",
    orientationEvidence:
      "Eightfold structural symmetry; octagon yaw interpreted, not surveyed.",
    dimensionsEvidence:
      "Prague City Tourism: structure 58.70 m, base diagonal 21.65 m, platforms 20/51 m, ground altitude 324 m. Secondary widths and truss spacing interpreted from operator photo; extra modern radio mast omitted.",
  },
];

type Solid = {
  x: number;
  y: number;
  z: number;
  w: number;
  h: number;
  d: number;
  material: Material;
};
/** These are actual rendered engine/chassis surfaces, not an enclosing invisible wall. */
export const TRACTOR_SOLIDS: readonly Solid[] = [
  {
    x: 0,
    y: 0.86,
    z: 0.14,
    w: 1.12,
    h: 0.62,
    d: 1.12,
    material: "outdoor-pink-dark",
  },
  {
    x: 0,
    y: 2.365,
    z: 0.23,
    w: 0.56,
    h: 1.75,
    d: 0.62,
    material: "outdoor-pink",
  },
  {
    x: 0,
    y: 1.39,
    z: -0.09,
    w: 0.82,
    h: 0.65,
    d: 0.69,
    material: "outdoor-pink-dark",
  },
  {
    x: 0,
    y: 0.74,
    z: -0.8,
    w: 1.18,
    h: 1.4,
    d: 0.12,
    material: "outdoor-pink",
  },
];

const add = (a: P, b: P): P => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a: P, b: P): P => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const scale = (a: P, k: number): P => [a[0] * k, a[1] * k, a[2] * k];
const cross = (a: P, b: P): P => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const unit = (p: P): P => scale(p, 1 / Math.hypot(...p));

/** One builder owns world transforms, winding and batching by material. */
class Geometry {
  private readonly batches = new Map<Material, OutdoorArtifactPart>();
  private readonly cy: number;
  private readonly sy: number;
  constructor(
    readonly artifact: OutdoorArtifact,
    readonly baseY: number,
  ) {
    this.cy = Math.cos(artifact.yaw);
    this.sy = Math.sin(artifact.yaw);
  }
  world(p: P): P {
    return [
      this.artifact.x + p[0] * this.cy + p[2] * this.sy,
      this.baseY + p[1],
      this.artifact.z - p[0] * this.sy + p[2] * this.cy,
    ];
  }
  triangle(material: Material, a: P, b: P, c: P, outward?: P) {
    let n = cross(sub(b, a), sub(c, a));
    if (Math.hypot(...n) < 1e-8) return;
    if (outward && n.reduce((sum, v, i) => sum + v * outward[i], 0) < 0) {
      [b, c] = [c, b];
      n = scale(n, -1);
    }
    n = unit(n);
    const normal: P = [
      n[0] * this.cy + n[2] * this.sy,
      n[1],
      -n[0] * this.sy + n[2] * this.cy,
    ];
    let part = this.batches.get(material);
    if (!part) {
      part = {
        artifactId: this.artifact.id,
        material,
        positions: [],
        normals: [],
        indices: [],
        uvs: [],
        lod: "both",
      };
      this.batches.set(material, part);
    }
    const start = part.positions.length / 3;
    for (const p of [a, b, c]) {
      part.positions.push(...this.world(p));
      part.normals.push(...normal);
    }
    part.indices.push(start, start + 1, start + 2);
    part.uvs.push(
      0,
      0,
      Math.hypot(...sub(b, a)),
      0,
      0,
      Math.hypot(...sub(c, a)),
    );
  }
  quad(material: Material, a: P, b: P, c: P, d: P, outward?: P) {
    this.triangle(material, a, b, c, outward);
    this.triangle(material, a, c, d, outward);
  }
  box(material: Material, center: P, size: P) {
    const corner = (x: number, y: number, z: number): P =>
      add(center, [(x * size[0]) / 2, (y * size[1]) / 2, (z * size[2]) / 2]);
    const faces = [
      [
        [-1, -1, -1],
        [-1, 1, -1],
        [1, 1, -1],
        [1, -1, -1],
      ],
      [
        [1, -1, 1],
        [1, 1, 1],
        [-1, 1, 1],
        [-1, -1, 1],
      ],
      [
        [-1, -1, 1],
        [-1, 1, 1],
        [-1, 1, -1],
        [-1, -1, -1],
      ],
      [
        [1, -1, -1],
        [1, 1, -1],
        [1, 1, 1],
        [1, -1, 1],
      ],
      [
        [-1, 1, -1],
        [-1, 1, 1],
        [1, 1, 1],
        [1, 1, -1],
      ],
      [
        [-1, -1, 1],
        [-1, -1, -1],
        [1, -1, -1],
        [1, -1, 1],
      ],
    ];
    for (const f of faces)
      this.quad(
        material,
        ...(f.map((p) => corner(p[0], p[1], p[2])) as [P, P, P, P]),
      );
  }
  beam(material: Material, a: P, b: P, radius: number, sides = 6) {
    const axis = unit(sub(b, a)),
      u = unit(cross(axis, Math.abs(axis[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0])),
      v = cross(axis, u);
    const offset = (i: number) =>
      add(
        scale(u, Math.cos((i * Math.PI * 2) / sides) * radius),
        scale(v, Math.sin((i * Math.PI * 2) / sides) * radius),
      );
    for (let i = 0; i < sides; i++) {
      const p = offset(i),
        q = offset(i + 1);
      this.quad(
        material,
        add(a, p),
        add(a, q),
        add(b, q),
        add(b, p),
        add(p, q),
      );
      this.triangle(material, a, add(a, p), add(a, q), scale(axis, -1));
      this.triangle(material, b, add(b, p), add(b, q), axis);
    }
  }
  /** Broad rectangular tread blocks: radial thickness is independent of width. */
  tread(a: P, b: P, radial: P) {
    const axis = unit(sub(b, a)),
      u = unit(cross(axis, radial)),
      v = unit(cross(u, axis));
    const offsets: P[] = [
      [-1, -1, 0],
      [1, -1, 0],
      [1, 1, 0],
      [-1, 1, 0],
    ].map(([x, y]) => add(scale(u, x * 0.065), scale(v, y * 0.035)));
    for (let i = 0; i < 4; i++) {
      const p = offsets[i],
        q = offsets[(i + 1) % 4];
      this.quad(
        "outdoor-pink",
        add(a, p),
        add(a, q),
        add(b, q),
        add(b, p),
        add(p, q),
      );
    }
    this.quad(
      "outdoor-pink",
      ...(offsets.map((o) => add(a, o)) as [P, P, P, P]),
      scale(axis, -1),
    );
    this.quad(
      "outdoor-pink",
      ...(offsets.map((o) => add(b, o)) as [P, P, P, P]),
      axis,
    );
  }
  /** Faceted annular tyre, axis X; the hollow wheel shape remains visible. */
  tyre(
    center: P,
    outer: number,
    width: number,
    material: Material = "outdoor-pink",
    segments = 24,
  ) {
    const tube = outer * 0.25,
      ring = outer - tube;
    const p = (i: number, j: number): P => {
      const a = (i * Math.PI * 2) / segments,
        b = (j * Math.PI) / 3;
      return add(center, [
        (Math.sin(b) * width) / 2,
        Math.cos(a) * (ring + Math.cos(b) * tube),
        Math.sin(a) * (ring + Math.cos(b) * tube),
      ]);
    };
    for (let i = 0; i < segments; i++)
      for (let j = 0; j < 6; j++) {
        const a = p(i, j),
          b = p(i + 1, j),
          c = p(i + 1, j + 1),
          d = p(i, j + 1);
        const angle = ((i + 0.5) * Math.PI * 2) / segments;
        this.quad(
          material,
          a,
          b,
          c,
          d,
          sub(
            scale(add(add(a, b), add(c, d)), 0.25),
            add(center, [0, Math.cos(angle) * ring, Math.sin(angle) * ring]),
          ),
        );
      }
  }
  finish() {
    return [...this.batches.values()];
  }
}

function tractorPlan(
  artifact: OutdoorArtifact,
  height: (x: number, z: number) => number,
) {
  const flat = new Geometry(artifact, 0);
  // A rigid sculpture settles to the lower tyre contact on the existing slope;
  // the uphill tyre may embed slightly. No invented paving slab or pitched collider.
  const contacts = [-0.81, 0.81].map((x) => flat.world([x, 0, 0.2]));
  const g = new Geometry(
    artifact,
    Math.min(...contacts.map(([x, , z]) => height(x, z))),
  );
  const colliders: OutdoorArtifactCollider[] = [];
  for (const solid of TRACTOR_SOLIDS) {
    g.box(
      solid.material,
      [solid.x, solid.y, solid.z],
      [solid.w, solid.h, solid.d],
    );
    const [x, y, z] = g.world([solid.x, solid.y, solid.z]);
    colliders.push({
      artifactId: artifact.id,
      x,
      y,
      z,
      w: solid.w,
      h: solid.h,
      d: solid.d,
      yaw: artifact.yaw,
    });
  }
  // Eight-sided, chamfered engine hood wrapped around the shared collision core.
  const hoodRing = (y: number, w: number, d: number): P[] => [
    [-w / 2 + 0.09, y, 0.23 - d / 2],
    [w / 2 - 0.09, y, 0.23 - d / 2],
    [w / 2, y, 0.23 - d / 2 + 0.09],
    [w / 2, y, 0.23 + d / 2 - 0.09],
    [w / 2 - 0.09, y, 0.23 + d / 2],
    [-w / 2 + 0.09, y, 0.23 + d / 2],
    [-w / 2, y, 0.23 + d / 2 - 0.09],
    [-w / 2, y, 0.23 - d / 2 + 0.09],
  ];
  const hood = [
    hoodRing(1.49, 0.76, 0.86),
    hoodRing(3.21, 0.76, 0.86),
    hoodRing(3.38, 0.6, 0.74),
  ];
  for (let j = 1; j < hood.length; j++)
    for (let i = 0; i < 8; i++) {
      const k = (i + 1) % 8;
      const radial = scale(add(hood[j][i], hood[j][k]), 0.5);
      radial[1] = 0;
      radial[2] -= 0.23;
      g.quad(
        "outdoor-pink",
        hood[j - 1][i],
        hood[j - 1][k],
        hood[j][k],
        hood[j][i],
        radial,
      );
    }
  for (let i = 0; i < 8; i++)
    g.triangle(
      "outdoor-pink",
      [0, 3.38, 0.23],
      hood[2][i],
      hood[2][(i + 1) % 8],
      [0, 1, 0],
    );
  for (const side of [-1, 1]) {
    // Hood panel seams and stamped vents follow the photographic long engine panels.
    g.box("outdoor-pink-dark", [side * 0.386, 2.3, 0.23], [0.01, 0.028, 0.52]);
    for (let y = 2.6; y < 3.08; y += 0.1)
      g.box("outdoor-pink-dark", [side * 0.384, y, 0.24], [0.012, 0.032, 0.3]);
  }
  // Axles, rear hubs and raised front wheel. Painted rubber is visible in the GHMP photo.
  g.beam("outdoor-pink-dark", [-1.05, 0.87, 0.2], [1.05, 0.87, 0.2], 0.13, 8);
  g.beam("outdoor-pink-dark", [-0.79, 3.34, 0.23], [0.79, 3.34, 0.23], 0.09, 8);
  for (const side of [-1, 1]) {
    const x = side * 0.81;
    g.tyre([x, 0.88, 0.2], 0.87, 0.46, "outdoor-pink", 32);
    g.beam(
      "outdoor-pink-dark",
      [x - 0.24, 0.88, 0.2],
      [x + 0.24, 0.88, 0.2],
      0.4,
      16,
    );
    g.beam(
      "outdoor-pink",
      [x - side * 0.23, 0.88, 0.2],
      [x + side * 0.28, 0.88, 0.2],
      0.19,
      8,
    );
    for (let bolt = 0; bolt < 6; bolt++) {
      const a = (bolt * Math.PI) / 3,
        y = 0.88 + Math.cos(a) * 0.14,
        z = 0.2 + Math.sin(a) * 0.14;
      g.beam(
        "outdoor-pink-dark",
        [x + side * 0.285, y, z],
        [x + side * 0.315, y, z],
        0.026,
        6,
      );
    }
    for (let i = 0; i < 20; i++) {
      const a = (i * Math.PI) / 10;
      for (const half of [-1, 1])
        g.tread(
          [
            x,
            0.88 + 0.875 * Math.cos(a - 0.08),
            0.2 + 0.875 * Math.sin(a - 0.08),
          ],
          [
            x + half * 0.22,
            0.88 + 0.855 * Math.cos(a + 0.08),
            0.2 + 0.855 * Math.sin(a + 0.08),
          ],
          [0, Math.cos(a), Math.sin(a)],
        );
    }
    // Open cabin rests on its rear cage; do not replace it with a glazed upright cab.
    for (const z of [-0.84, 0.15])
      g.beam(
        "outdoor-pink",
        [side * 0.61, 0.08, z],
        [side * 0.61, 1.56, z],
        0.038,
      );
    g.beam(
      "outdoor-pink",
      [side * 0.61, 0.1, -0.84],
      [side * 0.61, 0.1, 0.3],
      0.038,
    );
    g.beam(
      "outdoor-pink",
      [side * 0.61, 1.56, -0.84],
      [side * 0.61, 1.76, 0.25],
      0.038,
    );
    g.beam(
      "outdoor-pink",
      [side * 0.61, 0.15, -0.84],
      [side * 0.61, 1.5, 0.15],
      0.025,
    );
    g.box("outdoor-pink", [side * 0.58, 1.2, 0.2], [0.1, 0.16, 1.62]);
  }
  for (const y of [0.08, 1.54])
    g.beam("outdoor-pink", [-0.61, y, -0.84], [0.61, y, -0.84], 0.035);
  g.tyre([0.8, 3.34, 0.23], 0.46, 0.24);
  g.beam("outdoor-pink-dark", [0.65, 3.34, 0.23], [0.95, 3.34, 0.23], 0.24, 16);
  // The other front wheel is the circular padlock body, with its shackle hanging down.
  g.tyre([-0.8, 3.34, 0.23], 0.48, 0.19, "outdoor-dark-metal");
  g.beam(
    "outdoor-galvanized",
    [-0.93, 3.34, 0.23],
    [-0.68, 3.34, 0.23],
    0.365,
    24,
  );
  const lockFace = -0.942;
  g.beam(
    "outdoor-black",
    [lockFace, 3.22, 0.31],
    [lockFace, 3.47, 0.12],
    0.025,
    6,
  );
  g.beam(
    "outdoor-black",
    [lockFace - 0.01, 3.34, 0.23],
    [lockFace + 0.01, 3.34, 0.23],
    0.055,
    12,
  );
  const shackle: P[] = [
    [-0.8, 3.03, -0.08],
    [-0.8, 2.55, -0.08],
  ];
  for (let i = 0; i <= 10; i++) {
    const a = Math.PI + (i * Math.PI) / 10;
    shackle.push([-0.8, 2.55 + Math.sin(a) * 0.3, 0.22 + Math.cos(a) * 0.3]);
  }
  shackle.push([-0.8, 3.03, 0.52]);
  for (let i = 1; i < shackle.length; i++)
    if (Math.hypot(...sub(shackle[i], shackle[i - 1])) > 0.001)
      g.beam("outdoor-galvanized", shackle[i - 1], shackle[i], 0.065, 8);
  // Radiator slots, headlights and the exposed transmission make its silhouette identifiable.
  for (let x = -0.3; x <= 0.31; x += 0.1)
    g.box("outdoor-pink-dark", [x, 3.38, 0.235], [0.032, 0.035, 0.65]);
  for (const x of [-0.44, 0.44])
    g.beam("outdoor-pink", [x, 3.12, -0.02], [x, 3.12, -0.23], 0.11, 10);
  g.box("outdoor-pink", [0, 1.92, -0.36], [0.7, 0.1, 0.32]);
  return { parts: g.finish(), colliders };
}

function towerPlan(artifact: OutdoorArtifact) {
  const reference = LANDMARK_REFERENCE.tower;
  const baseRadius = reference.baseDiagonal / 2;
  // Outside the DEM: never sample its clamped north edge as the tower's foundation.
  const g = new Geometry(
    artifact,
    reference.baseAltitude - TERRAIN_REFERENCE_BPV,
  );
  const at = (i: number, r: number, y: number): P => [
    Math.cos((i * Math.PI) / 4) * r,
    y,
    Math.sin((i * Math.PI) / 4) * r,
  ];
  const levels = [
    [0.9, baseRadius],
    [5, 8.1],
    [10, 6.3],
    [15, 4.95],
    [reference.firstPlatform, 4.0],
    [25, 3.2],
    [30, 2.75],
    [35, 2.4],
    [40, 2.15],
    [45, 1.97],
    [reference.topPlatform, 1.85],
  ];
  for (let j = 1; j < levels.length; j++) {
    const [lo, r0] = levels[j - 1],
      [hi, r1] = levels[j];
    for (let i = 0; i < 8; i++) {
      g.beam(
        "outdoor-ivory",
        at(i, r0, lo),
        at(i, r1, hi),
        j < 4 ? 0.14 : 0.105,
        4,
      );
      g.beam("outdoor-ivory", at(i, r1, hi), at(i + 1, r1, hi), 0.075, 4);
      g.beam("outdoor-galvanized", at(i, r0, lo), at(i + 1, r1, hi), 0.053, 4);
      g.beam("outdoor-galvanized", at(i + 1, r0, lo), at(i, r1, hi), 0.053, 4);
    }
  }
  // Central lift shaft and two helical stair silhouettes; not playable stairs.
  g.beam("outdoor-ivory", [0, 1, 0], [0, 53, 0], 0.55, 8);
  for (let helix = 0; helix < 2; helix++)
    for (let i = 0; i < 128; i++) {
      const a = (i * Math.PI) / 8 + helix * Math.PI,
        b = ((i + 1) * Math.PI) / 8 + helix * Math.PI;
      g.beam(
        "outdoor-dark-metal",
        [Math.cos(a) * 1.05, 1 + (i * 50) / 128, Math.sin(a) * 1.05],
        [Math.cos(b) * 1.05, 1 + ((i + 1) * 50) / 128, Math.sin(b) * 1.05],
        0.07,
        4,
      );
    }
  const deck = (floor: number, radius: number, height: number) => {
    for (let i = 0; i < 8; i++) {
      g.quad(
        "outdoor-ivory",
        at(i, radius, floor - 0.25),
        at(i + 1, radius, floor - 0.25),
        at(i + 1, radius, floor),
        at(i, radius, floor),
        at(i + 0.5, 1, 0),
      );
      g.triangle(
        "outdoor-ivory",
        [0, floor, 0],
        at(i, radius, floor),
        at(i + 1, radius, floor),
        [0, 1, 0],
      );
      g.quad(
        "outdoor-ivory",
        at(i, radius, floor),
        at(i + 1, radius, floor),
        at(i + 1, radius, floor + 0.9),
        at(i, radius, floor + 0.9),
        at(i + 0.5, 1, 0),
      );
      g.quad(
        "outdoor-glass",
        at(i, radius - 0.02, floor + 0.9),
        at(i + 1, radius - 0.02, floor + 0.9),
        at(i + 1, radius - 0.02, floor + height),
        at(i, radius - 0.02, floor + height),
        at(i + 0.5, 1, 0),
      );
      g.beam(
        "outdoor-ivory",
        at(i, radius, floor),
        at(i, radius, floor + height),
        0.065,
        4,
      );
      g.beam(
        "outdoor-ivory",
        at(i, radius, floor + height),
        at(i + 1, radius, floor + height),
        0.095,
        4,
      );
      const m = scale(
        add(at(i, radius, floor + 0.9), at(i + 1, radius, floor + 0.9)),
        0.5,
      );
      g.beam("outdoor-ivory", m, add(m, [0, height - 0.9, 0]), 0.036, 4);
      g.triangle(
        "outdoor-ivory",
        at(i, radius + 0.3, floor + height),
        at(i + 1, radius + 0.3, floor + height),
        [0, floor + height + 0.7, 0],
        [0, 1, 0],
      );
    }
  };
  deck(reference.firstPlatform, 5.0, 2.45);
  deck(reference.topPlatform, 3.05, 3.25);
  for (let i = 0; i < 8; i++)
    g.beam(
      "outdoor-galvanized",
      at(i, 1.8, 54.9),
      [0, reference.structureHeight, 0],
      0.048,
      4,
    );
  // Eight real support feet; no surrounding invented park or expanded walk bounds.
  for (let i = 0; i < 8; i++)
    g.box("outdoor-concrete", at(i, baseRadius, 0.45), [1.25, 0.9, 1.25]);
  return g.finish();
}

/** Shared deterministic geometry. Call once per world; there is no per-frame allocation. */
export function buildOutdoorLandmarkPlan(
  options: { groundHeight?: (x: number, z: number) => number } = {},
): OutdoorArtifactPlan {
  const tractor = tractorPlan(
    OUTDOOR_LANDMARKS[0],
    options.groundHeight ?? groundHeight,
  );
  const parts = [...tractor.parts, ...towerPlan(OUTDOOR_LANDMARKS[1])];
  return {
    parts,
    colliders: tractor.colliders,
    artifacts: OUTDOOR_LANDMARKS,
    audit: [
      {
        artifactId: "punk-tractor",
        reason:
          "Photo-interpreted dimensions and orientation; OSM/GHMP coordinate discrepancy 7.1 m; only visible body/cabin solids collide, curved tyres and padlock are cosmetic.",
      },
      {
        artifactId: "petrin-tower",
        reason:
          "Skyline backdrop north of playable bounds; base elevation is the operator's rounded 324 m in the project datum (±2 m assumption), radio mast omitted pending dimensions.",
      },
    ],
    stats: {
      artifactCount: 2,
      triangleCount: parts.reduce((n, p) => n + p.indices.length / 3, 0),
      colliderCount: tractor.colliders.length,
      byKind: { tractor: 1, tower: 1 },
    },
  };
}
