/** B6 schematic stair cores, calibrated to the existing 16 × 70 m shell.
 * The SH plan establishes two west-side cores and half landings, but supplies
 * no dimensions. All metric values here are explicitly model estimates.
 */
export const B6_STAIR_CORES = [
  { id: "north-reception", minX: 0.25, maxX: 5.75, minZ: -78.6, maxZ: -71.1, sourceBayIndices: [16, 17, 18, 19] },
  { id: "south-service", minX: 0.25, maxX: 5.75, minZ: -38.1, maxZ: -30.6, sourceBayIndices: [3, 4, 5] },
] as const;
export const B6_STAIR_DIMENSIONS = {
  flightWidth: 2.4,
  riser: 0.15,
  tread: 0.35,
  risersPerFlight: 10,
  slabDepth: 0.24,
  floorRise: 3,
  railHeight: 1.02,
  balusterPitch: 0.14,
  measured: false,
} as const;
export type B6StairMaterial = "striped-corridor" | "terrazzo-tread" | "painted-concrete" | "black-metal" | "wood-handrail" | "entry-metal" | "entry-dark-metal" | "entry-glass";
export type B6StairMesh = {
  id: string;
  coreId: string;
  level: number;
  kind: "flight" | "handrail";
  material: B6StairMaterial;
  /** B6 local metres, before the common foundation offset is added once. */
  positions: number[];
  indices: number[];
  castsShadow: true;
  collides: true;
  exteriorEntry?:true;
};
export type B6StairBox = {
  coreId: string;
  level: number;
  x: number; y: number; z: number;
  w: number; h: number; d: number;
  kind: "floor" | "wall";
  role: "rail" | "stair-landing";
  material: B6StairMaterial;
};
export const B6_STAIR_MESHES: B6StairMesh[] = [];
export const B6_STAIR_BOXES: B6StairBox[] = [];

function quad(mesh: B6StairMesh, a: number[], b: number[], c: number[], d: number[]) {
  const i = mesh.positions.length / 3;
  mesh.positions.push(...a, ...b, ...c, ...d);
  // Physical source buffers use right-handed, outward CCW faces. Babylon's
  // box-compatible clockwise upload is a winding-only conversion in the
  // renderer; vertex positions, treads and continuous soffit remain identical.
  mesh.indices.push(i, i + 1, i + 2, i, i + 2, i + 3);
}
function beam(mesh: B6StairMesh, a: number[], b: number[], width: number, height: number) {
  const dz = b[2] - a[2], dy = b[1] - a[1], length = Math.hypot(dz, dy);
  const normal = [0, dz / length * height / 2, -dy / length * height / 2];
  const corners = (p: number[]) => [
    [p[0] - width / 2, p[1] - normal[1], p[2] - normal[2]],
    [p[0] + width / 2, p[1] - normal[1], p[2] - normal[2]],
    [p[0] + width / 2, p[1] + normal[1], p[2] + normal[2]],
    [p[0] - width / 2, p[1] + normal[1], p[2] + normal[2]],
  ];
  const s = corners(a), e = corners(b);
  quad(mesh, s[3], s[2], s[1], s[0]);
  quad(mesh, e[0], e[1], e[2], e[3]);
  for (let i = 0; i < 4; i++) quad(mesh, s[i], s[(i + 1) % 4], e[(i + 1) % 4], e[i]);
}

for (const core of B6_STAIR_CORES) {
  const south = core.minZ + 5.8, north = south - 3.5;
  for (let level = -1; level <= 5; level++) {
    // The corridor-level landing is part of the west floor strips. This middle
    // landing joins the two opposing flights at half the floor rise.
    if (level < 5) B6_STAIR_BOXES.push({
      coreId: core.id, level, x: 3, y: level * 3 + 1.5 - 0.15,
      z: (core.minZ + north) / 2, w: core.maxX - core.minX, h: 0.3,
      d: north - core.minZ, kind: "floor", role: "stair-landing", material: "striped-corridor",
    });
    if (level >= 5) continue;
    for (const [flight, centerX, fromZ, direction, baseRise] of [
      [0, 4.4, south, -1, 0],
      [1, 1.6, north, 1, 1.5],
    ] as const) {
      const baseY = level * 3 + baseRise;
      const makeMesh = (material: B6StairMaterial, kind: B6StairMesh["kind"] = "flight"): B6StairMesh => ({
        id: `${core.id}:${level}:${flight}:${material}`, coreId: core.id, level,
        kind, material, positions: [], indices: [], castsShadow: true, collides: true,
      });
      const treadMesh = makeMesh("terrazzo-tread"), concreteMesh = makeMesh("painted-concrete");
      const x0 = centerX - 1.2, x1 = centerX + 1.2;
      const bottom = (distance: number) => baseY + distance * 1.5 / 3.5 - 0.24;
      for (let step = 0; step < 10; step++) {
        const s = step * 0.35, e = (step + 1) * 0.35;
        const z0 = fromZ + direction * s, z1 = fromZ + direction * e;
        const y0 = baseY + step * 0.15, y1 = baseY + (step + 1) * 0.15;
        // Consistent outward winding for both opposing flights.
        const q = (mesh: B6StairMesh, a: number[], b: number[], c: number[], d: number[]) =>
          direction === 1 ? quad(mesh, a, b, c, d) : quad(mesh, d, c, b, a);
        q(treadMesh, [x0, y1, z0], [x0, y1, z1], [x1, y1, z1], [x1, y1, z0]);
        q(concreteMesh, [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [x1, y0, z0]);
        q(concreteMesh, [x0, bottom(s), z0], [x0, bottom(e), z1], [x0, y1, z1], [x0, y1, z0]);
        q(concreteMesh, [x1, y1, z0], [x1, y1, z1], [x1, bottom(e), z1], [x1, bottom(s), z0]);
      }
      const endZ = fromZ + direction * 3.5;
      const q = (a: number[], b: number[], c: number[], d: number[]) =>
        direction === 1 ? quad(concreteMesh, a, b, c, d) : quad(concreteMesh, d, c, b, a);
      q([x0, baseY, fromZ], [x1, baseY, fromZ], [x1, bottom(0), fromZ], [x0, bottom(0), fromZ]);
      q([x0, bottom(3.5), endZ], [x1, bottom(3.5), endZ], [x1, baseY + 1.5, endZ], [x0, baseY + 1.5, endZ]);
      q([x1, bottom(0), fromZ], [x1, bottom(3.5), endZ], [x0, bottom(3.5), endZ], [x0, bottom(0), fromZ]);
      B6_STAIR_MESHES.push(treadMesh, concreteMesh);
      for (const railX of [x0, x1]) {
        const rail = makeMesh("wood-handrail", "handrail");
        rail.id += `:${railX}`;
        beam(rail, [railX, baseY + 1.02, fromZ], [railX, baseY + 2.52, endZ], 0.06, 0.055);
        B6_STAIR_MESHES.push(rail);
        for (let post = 0; post <= 25; post++) {
          // The half-landing guard owns these two shared junction posts.
          // A second coincident/contained post adds overlapping black surfaces
          // and duplicate colliders without changing the physical railing.
          if ((flight === 0 && railX === x0 && post === 25) ||
              (flight === 1 && railX === x1 && post === 0)) continue;
          const distance = post * 3.5 / 25;
          const top = baseY + distance * 1.5 / 3.5 + 1.02;
          const walking = baseY + Math.min(10, Math.floor(distance / 0.35) + 1) * 0.15;
          B6_STAIR_BOXES.push({
            coreId: core.id, level, x: railX, y: (walking + top) / 2,
            z: fromZ + direction * distance, w: 0.018, h: top - walking, d: 0.018,
            kind: "wall", role: "rail", material: "black-metal",
          });
        }
      }
    }
    // Guard along the open central well on the half landing; no rail crosses
    // either flight or the floor landing's access from the central corridor.
    const landingY = level * 3 + 1.5;
    for (let i = 0; i <= 2; i++) B6_STAIR_BOXES.push({
      coreId: core.id, level, x: 2.8 + i * 0.2, y: landingY + 0.51,
      z: north, w: 0.018, h: 1.02, d: 0.018, kind: "wall", role: "rail", material: "black-metal",
    });
    for (let post=0;post<=17;post++) B6_STAIR_BOXES.push({
      coreId:core.id,level,x:0.35,y:landingY+0.51,z:core.minZ+(north-core.minZ)*post/17,
      w:0.018,h:1.02,d:0.018,kind:"wall",role:"rail",material:"black-metal",
    });
    B6_STAIR_BOXES.push({coreId:core.id,level,x:0.35,y:landingY+1.02,z:(core.minZ+north)/2,
      w:0.06,h:0.055,d:north-core.minZ,kind:"wall",role:"rail",material:"wood-handrail"});
    B6_STAIR_BOXES.push({coreId:core.id,level,x:3,y:landingY+1.02,z:north,
      w:0.4,h:0.055,d:0.06,kind:"wall",role:"rail",material:"wood-handrail"});
  }
}

/** Continuous floor-to-floor walking route; same route repeats at each level. */
export function b6StairRoute(coreId: string): [number, number][] {
  const core = B6_STAIR_CORES.find((entry) => entry.id === coreId);
  if (!core) throw new Error("Unknown B6 stair core " + coreId);
  const floorZ = core.minZ + 6.65, halfZ = core.minZ + 1.15;
  return [[6.8, floorZ], [4.4, floorZ], [4.4, halfZ], [1.6, halfZ], [1.6, floorZ], [6.8, floorZ]];
}
