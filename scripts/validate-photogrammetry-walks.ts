/** Read-only KCC audit of the actual finest source collision, NOT legacy DEM.
 * One complete production Simulation is reused. No teleport, jump, tolerance
 * increase, generated bridge or runtime/source geometry edit is permitted. */
import { readFile, writeFile, mkdir, readdir } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";
import RAPIER from "@dimforge/rapier3d-compat";
import {
  Simulation,
  initPhysics,
  CHARACTER_HALF_HEIGHT,
  CHARACTER_RADIUS,
  type Actor,
} from "../shared/simulation";
import {
  decodePhotogrammetryCollision,
  photoCollisionCutout,
} from "../shared/photogrammetry-gameplay";
import {
  decodeI3SGeometry,
  photogrammetryPositions,
  photogrammetryNodeCenter,
  type PhotogrammetryManifest,
} from "../shared/photogrammetry";
import { findCampusWalkRoute } from "../shared/campus-routes";
import { B6_LAYOUT } from "../shared/b6-interior";
import { SPAWN, PLACES, BOUNDS } from "../shared/world";
import { groundHeight } from "../shared/terrain";
import { isRealityGroundSurface } from "../shared/terrain";
import {
  STREETS,
  STREET_FEATURES,
  streetPolygonContains,
} from "../shared/streets";
import {
  applyPhotogrammetryGroundRepairs,
  getPhotogrammetryGroundPatchGeometry,
  PHOTOGRAMMETRY_GROUND_REPAIRS,
} from "../shared/photogrammetry-ground";
import { FIXED_DT } from "../shared/netcode";
import type { Vec3 } from "../shared/types";
import { LANDCOVER, pointInPolygon } from "../shared/vegetation";

type Point = [number, number];
type Route = {
  id: string;
  points: Point[];
  length: number;
  provenance: string;
};
const started = performance.now();
const timestamp = new Date().toISOString();
const labelIndex = process.argv.indexOf("--label");
const spawnProbesOnly = process.argv.includes("--spawn-probes-only");
const allowDetours = process.argv.includes("--detours");
const allowGrassDetours = process.argv.includes("--grass-detours");
const allowApronDetours = process.argv.includes("--apron-detour");
const photoApron2024: Point[] = [
  [-112.2, 32],
  [-91, 32],
  [-91, 39.28],
  [-103.7, 39.28],
  [-103.7, 37],
  [-112.2, 37],
];
const onlyRouteIndex = process.argv.indexOf("--only-route");
const onlyRoute =
  onlyRouteIndex >= 0 ? process.argv[onlyRouteIndex + 1] : undefined;
const gridIndex = process.argv.indexOf("--nav-grid");
const navGrid = gridIndex >= 0 ? Number(process.argv[gridIndex + 1]) : 1;
if (![1, 0.5, 0.25].includes(navGrid))
  throw new Error("--nav-grid must be1,.5 or.25m; physics is never changed");
const spawnPointsIndex = process.argv.indexOf("--spawn-points");
const spawnCandidates: Point[] =
  spawnPointsIndex >= 0
    ? process.argv[spawnPointsIndex + 1]
        .split("/")
        .map((text) => text.split(",").map(Number) as Point)
    : [
        [95, 12],
        [110, 12],
        [130, 12],
      ];
if (
  spawnCandidates.length > 40 ||
  spawnCandidates.some((p) => p.length !== 2 || !p.every(Number.isFinite))
)
  throw new Error(
    "Invalid --spawn-points: expected x,z/x,z, at most 40 points",
  );
const label =
  labelIndex >= 0
    ? process.argv[labelIndex + 1]
    : timestamp.replace(/[^0-9]/g, "").slice(0, 14);
if (!/^[a-zA-Z0-9_-]+$/.test(label ?? ""))
  throw new Error("Invalid audit label");
const hash = (bytes: Uint8Array | string) =>
  createHash("sha256").update(bytes).digest("hex");
async function hashSharedSources() {
  const files = (await readdir("shared", { recursive: true }))
    .filter((file) => /\.(ts|json)$/.test(file))
    .map((file) => "shared/" + file.replaceAll("\\", "/"))
    .sort();
  return Object.fromEntries(
    await Promise.all(
      files.map(async (file) => [file, hash(await readFile(file))]),
    ),
  );
}
const sourceHashes = await hashSharedSources();
const compressed = await readFile(
  "public/models/photogrammetry/ipr2023/collision.pcm.gz",
);
const raw = gunzipSync(compressed);
const rawArray = raw.buffer.slice(
  raw.byteOffset,
  raw.byteOffset + raw.byteLength,
) as ArrayBuffer;
const collision = decodePhotogrammetryCollision(rawArray);
const manifest = JSON.parse(
  await readFile("shared/data/photogrammetry.json", "utf8"),
) as PhotogrammetryManifest;
const outputTriangles = collision.indices.length / 3;

// Reproduce only the builder's triangle acceptance counters. This maps Rapier
// face IDs back to the original IPR node without modifying/welding the source.
const ranges: Array<{ id: string; first: number; end: number }> = [];
let accepted = 0;
for (const node of manifest.nodes.filter(
  (node) => node.level === manifest.highestDetailLevel,
)) {
  const geometry = decodeI3SGeometry(await readFile("public" + node.geometry));
  const positions = applyPhotogrammetryGroundRepairs(
    photogrammetryPositions(geometry, node, manifest),
  );
  const bits = new Uint32Array(positions.buffer);
  const first = accepted;
  for (let i = 0; i < positions.length; i += 9) {
    const point = (offset: number) => ({
      x: positions[i + offset],
      y: positions[i + offset + 1],
      z: positions[i + offset + 2],
    });
    if (photoCollisionCutout(point(0), point(3), point(6))) continue;
    const same = (a: number, b: number) =>
      bits[i + a] === bits[i + b] &&
      bits[i + a + 1] === bits[i + b + 1] &&
      bits[i + a + 2] === bits[i + b + 2];
    if (same(0, 3) || same(0, 6) || same(3, 6)) continue;
    accepted++;
  }
  ranges.push({ id: node.id, first, end: accepted });
}
if (accepted !== outputTriangles)
  throw new Error(
    `Collision/source triangle acceptance differs: ${accepted}/${outputTriangles}; rebuild the collision before this audit`,
  );
const nearbySourceNodes = (position: Vec3) =>
  manifest.nodes
    .filter((node) => {
      if (node.level !== manifest.highestDetailLevel) return false;
      const center = photogrammetryNodeCenter(node, manifest);
      return (
        Math.hypot(center.x - position.x, center.z - position.z) <=
        node.radius + 2
      );
    })
    .map((node) => node.id);
const sourceCache = new Map<
  string,
  { positions: Float32Array; faces: Int32Array }
>();
function sourceGeometry(id: string) {
  const cached = sourceCache.get(id);
  if (cached) return cached;
  const node = manifest.nodes.find((node) => node.id === id)!;
  const positions = applyPhotogrammetryGroundRepairs(
    photogrammetryPositions(
      decodeI3SGeometry(readFileSync("public" + node.geometry)),
      node,
      manifest,
    ),
  );
  const bits = new Uint32Array(positions.buffer);
  const faces = new Int32Array(positions.length / 9).fill(-1);
  let face = ranges.find((range) => range.id === id)!.first;
  for (let i = 0; i < positions.length; i += 9) {
    const point = (offset: number) => ({
      x: positions[i + offset],
      y: positions[i + offset + 1],
      z: positions[i + offset + 2],
    });
    if (photoCollisionCutout(point(0), point(3), point(6))) continue;
    const same = (a: number, b: number) =>
      bits[i + a] === bits[i + b] &&
      bits[i + a + 1] === bits[i + b + 1] &&
      bits[i + a + 2] === bits[i + b + 2];
    if (same(0, 3) || same(0, 6) || same(3, 6)) continue;
    faces[i / 9] = face++;
  }
  const value = { positions, faces };
  sourceCache.set(id, value);
  return value;
}
/** This Rapier build reports featureId=0 on the giant mesh for unrelated hits.
 * Identify the actual source by a direct two-sided Möller–Trumbore intersection
 * at the witnessed point. Never label a far-away node from that featureId. */
function sourceId(point: Vec3, normal: Vec3) {
  const origin = {
    x: point.x + normal.x * 0.08,
    y: point.y + normal.y * 0.08,
    z: point.z + normal.z * 0.08,
  };
  const d = { x: -normal.x, y: -normal.y, z: -normal.z };
  let best:
    | {
        score: number;
        sourceNodeId: string;
        sourceOriginalTriangle: number;
        collisionTriangle: number;
        intersectionDistance: number;
      }
    | undefined;
  for (const id of nearbySourceNodes(point)) {
    const { positions: p, faces } = sourceGeometry(id);
    for (let i = 0; i < p.length; i += 9) {
      if (faces[i / 9] < 0) continue;
      const e1x = p[i + 3] - p[i],
        e1y = p[i + 4] - p[i + 1],
        e1z = p[i + 5] - p[i + 2];
      const e2x = p[i + 6] - p[i],
        e2y = p[i + 7] - p[i + 1],
        e2z = p[i + 8] - p[i + 2];
      const hx = d.y * e2z - d.z * e2y,
        hy = d.z * e2x - d.x * e2z,
        hz = d.x * e2y - d.y * e2x;
      const determinant = e1x * hx + e1y * hy + e1z * hz;
      if (Math.abs(determinant) < 1e-10) continue;
      const sx = origin.x - p[i],
        sy = origin.y - p[i + 1],
        sz = origin.z - p[i + 2];
      const u = (sx * hx + sy * hy + sz * hz) / determinant;
      if (u < -1e-5 || u > 1.00001) continue;
      const qx = sy * e1z - sz * e1y,
        qy = sz * e1x - sx * e1z,
        qz = sx * e1y - sy * e1x;
      const v = (d.x * qx + d.y * qy + d.z * qz) / determinant;
      if (v < -1e-5 || u + v > 1.00001) continue;
      const distance = (e2x * qx + e2y * qy + e2z * qz) / determinant;
      if (distance < 0 || distance > 0.3) continue;
      const score = Math.abs(distance - 0.08);
      if (!best || score < best.score)
        best = {
          score,
          sourceNodeId: id,
          sourceOriginalTriangle: i / 9,
          collisionTriangle: faces[i / 9],
          intersectionDistance: distance,
        };
    }
  }
  return best
    ? {
        ...best,
        sourceIdentification: "direct-derived-source-triangle-intersection",
      }
    : { sourceIdentification: "unresolved-direct-intersection" };
}

const routes: Route[] = [];
for (const [id, end] of [
  ["spawn-east-10m", [SPAWN.x + 10, SPAWN.z]],
  ["spawn-west-10m", [SPAWN.x - 10, SPAWN.z]],
  ["spawn-north-10m", [SPAWN.x, SPAWN.z - 10]],
  ["spawn-south-10m", [SPAWN.x, SPAWN.z + 10]],
] as [string, Point][])
  routes.push({
    id,
    points: [[SPAWN.x, SPAWN.z], end],
    length: 10,
    provenance:
      "cardinal movement from the production spawn, explicitly an audit path rather than an asserted map route",
  });
if (!spawnProbesOnly) {
  const anchor: Point = [109.52341319607139, -11.40754211169377];
  const connectorLength = Math.hypot(anchor[0] - SPAWN.x, anchor[1] - SPAWN.z);
  const parking = STREETS.parking.find(
    (parking) => parking.id === "155743958",
  )!;
  if (!parking) throw new Error("Missing canonical parking area155743958");
  for (let sample = 0; sample <= 100; sample++) {
    const t = sample / 100,
      x = SPAWN.x + (anchor[0] - SPAWN.x) * t,
      z = SPAWN.z + (anchor[1] - SPAWN.z) * t;
    if (
      !streetPolygonContains(
        { outer: parking.points, holes: [], area: 0 },
        x,
        z,
      ) ||
      !isRealityGroundSurface(x, z)
    )
      throw new Error(
        `Explicit parking connector leaves its proven asphalt polygon at ${x},${z}`,
      );
  }
  const connectorProvenance =
    "Explicit game-only connector through actual OSM parking155743958/IPR asphalt; access=private, not an assertion of public real-world access. All101samples lie in both the mapped parking and calibrated asphalt surface.";
  routes.unshift({
    id: "parking-to-footgraph-connector",
    points: [[SPAWN.x, SPAWN.z], anchor],
    length: connectorLength,
    provenance: connectorProvenance,
  });
  for (const id of ["stadium191a", "stadium191b"]) {
    const place = PLACES.find((p) => p.id === id)!;
    const route = findCampusWalkRoute(anchor, [place.x, place.z], 10);
    if (!route) throw new Error(`Missing actual connected public route ${id}`);
    routes.push({
      id,
      points: [[SPAWN.x, SPAWN.z], ...route.points],
      length: connectorLength + route.length,
      provenance:
        connectorProvenance +
        " Then connected public OSM pedestrian ways with strict <=10m endpoint attachment; no global widened connector tolerance.",
    });
  }
  const rko = findCampusWalkRoute(anchor, [145, -58], 10);
  if (!rko) throw new Error("Missing connected R-ko east public approach");
  routes.push({
    id: "rko-east-public-approach",
    points: [[SPAWN.x, SPAWN.z], ...rko.points],
    length: connectorLength + rko.length,
    provenance:
      connectorProvenance +
      " Then mapped connected public walking route to the east of the Potraviny/R-ko building; <=10m endpoint attachment, not an invented shop doorway.",
  });
  const b6Points: Point[] = [
    [B6_LAYOUT.outsideSpawn.x, B6_LAYOUT.outsideSpawn.z],
    ...B6_LAYOUT.approachRoute,
    ...B6_LAYOUT.serviceRoute.slice(0, 2),
  ];
  routes.push({
    id: "b6-north-stairs-to-reception",
    points: b6Points,
    length: b6Points
      .slice(1)
      .reduce(
        (sum, p, i) =>
          sum + Math.hypot(p[0] - b6Points[i][0], p[1] - b6Points[i][1]),
        0,
      ),
    provenance:
      "canonical B6 north stairs, doorway and reception route; original photo collision plus explicitly modeled playable-interior cutout",
  });
}

await initPhysics();
console.log(
  JSON.stringify({
    phase: "building-one-full-photo-simulation",
    triangles: outputTriangles,
    seconds: (performance.now() - started) / 1000,
  }),
);
const constructionStarted = performance.now();
const sim = new Simulation(collision);
const constructionSeconds = (performance.now() - constructionStarted) / 1000;
const originalSourceHandle = [...sim.groundColliders][0];
const sourceKind = (handle: number) =>
  handle === originalSourceHandle
    ? "derived-source-mesh"
    : sim.groundColliders.has(handle)
      ? "derived-ground-fill"
      : handle === sim.car.collider.handle
        ? "interactive-car"
        : "native-b6-or-object";
function groundFillIds(point: Vec3) {
  return PHOTOGRAMMETRY_GROUND_REPAIRS.patches
    .filter((patch) =>
      streetPolygonContains(
        { outer: patch.polygon as Point[], holes: [], area: 0 },
        point.x,
        point.z,
      ),
    )
    .map((patch) => ({
      patchId: patch.id,
      wayId: patch.wayId,
      sourceNodeIds: patch.sourceNodeIds,
    }));
}
const idle = { x: 0, z: 0, yaw: 0, jump: false, seq: 0 };
const reports: any[] = [];
const spawnProbes: any[] = [];
const detourPlanningDiagnostics: any[] = [];
const probe = (
  actor: Actor,
  x: number,
  z: number,
  y = actor.position.y + 0.1,
  length = 2.5,
  sourceOnly = false,
) => {
  const ray = new RAPIER.Ray({ x, y, z }, { x: 0, y: -1, z: 0 });
  const hit = sim.world.castRayAndGetNormal(
    ray,
    length,
    true,
    undefined,
    undefined,
    actor.collider,
    actor.body,
    (collider) =>
      !sim.walkingColliders.has(collider.handle) &&
      (!sourceOnly || sim.groundColliders.has(collider.handle)),
  );
  return hit
    ? {
        y: y - hit.timeOfImpact,
        normal: { ...hit.normal },
        source: sim.groundColliders.has(hit.collider.handle),
        sourceKind: sourceKind(hit.collider.handle),
        collider: hit.collider.handle,
        ...(hit.collider.handle === originalSourceHandle
          ? sourceId({ x, y: y - hit.timeOfImpact, z }, hit.normal)
          : sim.groundColliders.has(hit.collider.handle)
            ? {
                groundFillIds: groundFillIds({ x, y: y - hit.timeOfImpact, z }),
              }
            : {}),
        rapierFeatureId: hit.featureId,
      }
    : undefined;
};
function collisionEvidence(actor: Actor) {
  const contacts: any[] = [];
  for (let i = 0; i < actor.controller.numComputedCollisions(); i++) {
    const contact = actor.controller.computedCollision(i);
    if (!contact?.collider) continue;
    const source = sim.groundColliders.has(contact.collider.handle);
    const p = contact.witness1,
      n = contact.normal1;
    const ray = new RAPIER.Ray(
      { x: p.x + n.x * 0.08, y: p.y + n.y * 0.08, z: p.z + n.z * 0.08 },
      { x: -n.x, y: -n.y, z: -n.z },
    );
    const hit = source
      ? sim.world.castRayAndGetNormal(
          ray,
          0.3,
          true,
          undefined,
          undefined,
          actor.collider,
          actor.body,
          (collider) => sim.groundColliders.has(collider.handle),
        )
      : undefined;
    contacts.push({
      source,
      sourceKind: sourceKind(contact.collider.handle),
      collider: contact.collider.handle,
      witness: { ...p },
      normal: { ...n },
      remaining: { ...contact.translationDeltaRemaining },
      ...(contact.collider.handle === originalSourceHandle
        ? sourceId(p, n)
        : source
          ? { groundFillIds: groundFillIds(p) }
          : {}),
      rapierFeatureId: hit?.featureId,
    });
  }
  return contacts;
}
const parkingPolygon = STREETS.parking.find(
  (parking) => parking.id === "155743958",
)!;
const publicFootSegments = STREET_FEATURES.filter(
  (feature) =>
    feature.kind !== "road" &&
    !["no", "private"].includes(feature.tags.foot) &&
    (["yes", "designated", "permissive"].includes(feature.tags.foot) ||
      !["no", "private"].includes(feature.tags.access)),
).flatMap((feature) =>
  feature.points.slice(1).map((b, i) => ({
    a: feature.points[i],
    b,
    width: feature.width,
    id: feature.id,
  })),
);
function footwayAt(x: number, z: number) {
  for (const segment of publicFootSegments) {
    const dx = segment.b[0] - segment.a[0],
      dz = segment.b[1] - segment.a[1],
      t = Math.max(
        0,
        Math.min(
          1,
          ((x - segment.a[0]) * dx + (z - segment.a[1]) * dz) /
            (dx * dx + dz * dz || 1),
        ),
      );
    if (
      Math.hypot(x - segment.a[0] - t * dx, z - segment.a[1] - t * dz) <=
      Math.max(0.05, segment.width / 2 - CHARACTER_RADIUS - 0.02)
    )
      return segment.id;
  }
  return undefined;
}
function detourArea(x: number, z: number) {
  if (
    streetPolygonContains(
      { outer: parkingPolygon.points, holes: [], area: 0 },
      x,
      z,
    ) &&
    isRealityGroundSurface(x, z)
  )
    return "parking155743958-game-only-access-private";
  if (allowApronDetours) {
    const west = STREETS.parking.find((parking) => parking.id === "155743959");
    if (
      west &&
      streetPolygonContains({ outer: west.points, holes: [], area: 0 }, x, z)
    )
      return "parking155743959-game-only-access-permit";
  }
  const footway = footwayAt(x, z);
  return footway ? "osm-footway:" + footway : undefined;
}
/** Read-only 1m A*: queries never move/replace the actor. Every edge remains
 * in mapped parking or actual footway width and is swept against this world.
 * Normal production KCC must subsequently prove the planned waypoints. */
function planPhysicalDetour(actor: Actor, from: Point, target: Point) {
  const length = Math.hypot(target[0] - from[0], target[1] - from[1]);
  const goal: Point =
    length > 35
      ? [
          from[0] + ((target[0] - from[0]) * 25) / length,
          from[1] + ((target[1] - from[1]) * 25) / length,
        ]
      : target;
  const minX = Math.floor(Math.min(from[0], goal[0]) - 12),
    maxX = Math.ceil(Math.max(from[0], goal[0]) + 12),
    minZ = Math.floor(Math.min(from[1], goal[1]) - 12),
    maxZ = Math.ceil(Math.max(from[1], goal[1]) + 12);
  const capsule = new RAPIER.Capsule(CHARACTER_HALF_HEIGHT, CHARACTER_RADIUS),
    rotation = { x: 0, y: 0, z: 0, w: 1 };
  const cache = new Map<
      string,
      {
        point: Point;
        center: Vec3;
        allowed: boolean;
        area?: string;
        support?: any;
        blockedBy?: any;
      }
    >(),
    edges = new Map<string, boolean>();
  const key = (p: Point) => p[0] + "," + p[1];
  const areaAt = (x: number, z: number) => {
    const base = detourArea(x, z);
    if (base) return base;
    if (allowApronDetours && pointInPolygon(x, z, photoApron2024))
      return "photo-interpreted-asphalt-apron-2024-IPR-no-public-access-claim";
    if (!allowGrassDetours || Math.hypot(x - from[0], z - from[1]) > 6)
      return undefined;
    const grass = LANDCOVER.areas.find(
      (area) =>
        ["grass", "meadow", "grassland"].includes(area.kind) &&
        pointInPolygon(x, z, area.points),
    );
    return grass
      ? `mapped-${grass.kind}:${grass.osmId}-local-game-detour-no-public-access-claim`
      : undefined;
  };
  const node = (p: Point) => {
    const id = key(p);
    let n = cache.get(id);
    if (n) return n;
    const area = areaAt(p[0], p[1]);
    const supportRay = new RAPIER.Ray(
      { x: p[0], y: groundHeight(p[0], p[1]) + 0.6, z: p[1] },
      { x: 0, y: -1, z: 0 },
    );
    const support = area
      ? sim.world.castRayAndGetNormal(
          supportRay,
          3,
          true,
          undefined,
          undefined,
          actor.collider,
          actor.body,
          (c) => sim.groundColliders.has(c.handle),
        )
      : undefined;
    const supported = !!support && support.normal.y > 0.35;
    const center = {
      x: p[0],
      y: supported ? supportRay.origin.y - support!.timeOfImpact + 0.85 : NaN,
      z: p[1],
    };
    const blocked =
      area && supported
        ? sim.world.intersectionWithShape(
            center,
            rotation,
            capsule,
            undefined,
            undefined,
            actor.collider,
            actor.body,
            (c) => !sim.walkingColliders.has(c.handle),
          )
        : true;
    n = {
      point: p,
      center,
      allowed: !!area && supported && !blocked,
      area,
      support: support
        ? {
            y: supportRay.origin.y - support.timeOfImpact,
            normal: { ...support.normal },
            sourceKind: sourceKind(support.collider.handle),
          }
        : undefined,
      blockedBy:
        blocked && typeof blocked !== "boolean"
          ? { sourceKind: sourceKind(blocked.handle), collider: blocked.handle }
          : undefined,
    };
    cache.set(id, n);
    return n;
  };
  const edge = (a: Point, b: Point) => {
    const id = key(a) + ">" + key(b);
    if (edges.has(id)) return edges.get(id)!;
    const an = node(a),
      bn = node(b);
    let clear = an.allowed && bn.allowed;
    if (clear) {
      const distance = Math.hypot(b[0] - a[0], b[1] - a[1]),
        samples = Math.ceil(distance / 0.25);
      let previous = an;
      for (let i = 1; i <= samples; i++) {
        const t = i / samples;
        const next = node([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
        if (!next.allowed) {
          clear = false;
          break;
        }
        clear = !sim.world.castShape(
          previous.center,
          rotation,
          {
            x: next.center.x - previous.center.x,
            y: next.center.y - previous.center.y,
            z: next.center.z - previous.center.z,
          },
          capsule,
          0.002,
          1,
          true,
          undefined,
          undefined,
          actor.collider,
          actor.body,
          (c) => !sim.walkingColliders.has(c.handle),
        );
        if (!clear) break;
        previous = next;
      }
    }
    edges.set(id, clear);
    return clear;
  };
  const abortPlan = (reason: string) => {
    const detail = {
      reason,
      from,
      target,
      goal,
      start: node(from),
      destination: node(goal),
      checkedNodes: [...cache.values()],
    };
    detourPlanningDiagnostics.push(detail);
    console.log(
      JSON.stringify({
        phase: "detour-planner-rejected",
        reason,
        from,
        target,
        goal,
        start: detail.start,
        destination: detail.destination,
        checkedNodes: cache.size,
      }),
    );
    return undefined;
  };
  if (!node(from).allowed) return abortPlan("start-not-plannable");
  if (!node(goal).allowed) return abortPlan("destination-not-plannable");
  const open: Array<{ p: Point; cost: number; score: number }> = [],
    costs = new Map<string, number>([[key(from), 0]]),
    parents = new Map<string, Point>();
  const heuristic = (p: Point) => Math.hypot(p[0] - goal[0], p[1] - goal[1]);
  const offer = (a: Point, b: Point, cost: number) => {
    if (!edge(a, b)) return;
    const previous = costs.get(key(b));
    if (previous !== undefined && previous <= cost) return;
    costs.set(key(b), cost);
    parents.set(key(b), a);
    open.push({ p: b, cost, score: cost + heuristic(b) });
  };
  for (
    let x = Math.floor(from[0] / navGrid) * navGrid - navGrid;
    x <= Math.ceil(from[0] / navGrid) * navGrid + navGrid;
    x += navGrid
  )
    for (
      let z = Math.floor(from[1] / navGrid) * navGrid - navGrid;
      z <= Math.ceil(from[1] / navGrid) * navGrid + navGrid;
      z += navGrid
    ) {
      const p: Point = [x, z];
      if (Math.hypot(x - from[0], z - from[1]) <= 1.6)
        offer(from, p, Math.hypot(x - from[0], z - from[1]));
    }
  let expanded = 0,
    found: Point | undefined;
  while (open.length && expanded < 5000) {
    let best = 0;
    for (let i = 1; i < open.length; i++)
      if (open[i].score < open[best].score) best = i;
    const current = open.splice(best, 1)[0];
    if (current.cost !== costs.get(key(current.p))) continue;
    expanded++;
    if (heuristic(current.p) <= 1.6 && edge(current.p, goal)) {
      if (key(goal) !== key(current.p)) parents.set(key(goal), current.p);
      found = goal;
      break;
    }
    for (const [dx, dz] of [
      [-1, 0],
      [1, 0],
      [0, -1],
      [0, 1],
      [-1, -1],
      [-1, 1],
      [1, -1],
      [1, 1],
    ]) {
      const p: Point = [
        current.p[0] + dx * navGrid,
        current.p[1] + dz * navGrid,
      ];
      if (p[0] < minX || p[0] > maxX || p[1] < minZ || p[1] > maxZ) continue;
      offer(current.p, p, current.cost + Math.hypot(dx, dz) * navGrid);
    }
  }
  if (!found)
    return abortPlan("no-capsule-safe-supported-edge-path-in-allowed-surface");
  const path: Point[] = [found];
  let cursor = found;
  while (key(cursor) !== key(from)) {
    const parent = parents.get(key(cursor));
    if (!parent || path.some((p) => key(p) === key(parent))) return undefined;
    path.push(parent);
    cursor = parent;
  }
  path.reverse();
  const smoothed: Point[] = [path[0]];
  let at = 0;
  while (at < path.length - 1) {
    let next = path.length - 1;
    while (next > at + 1 && !edge(path[at], path[next])) next--;
    smoothed.push(path[next]);
    at = next;
  }
  return {
    points: smoothed,
    subGoalOnly: goal !== target,
    expanded,
    gridMetres: navGrid,
    grassDetourMaxRadius: allowGrassDetours ? 6 : 0,
    photoApron: allowApronDetours
      ? {
          polygon: photoApron2024,
          source:
            "docs/photogrammetry/evidence/vanickova-crossing-ortho-2024.jpg",
          sha256:
            "d55f5311b1dd4a083b59653e8598a0a3f3f9beef8b7c7f5e3d97c8ab5a62e5c8",
          captureDate: "2024-06-08",
          provenance:
            "Visual interpretation of the paved north apron, excluding visible grass island and avoiding the boundary line in front of B2. This is a game-only QA detour over existing source geometry; no map/geometry change or public-access assertion.",
        }
      : undefined,
    groundFallbackAllowed: false,
    plannedLength: smoothed
      .slice(1)
      .reduce(
        (sum, p, i) =>
          sum + Math.hypot(p[0] - smoothed[i][0], p[1] - smoothed[i][1]),
        0,
      ),
    areas: [...new Set(path.map((p) => node(p).area))],
    provenance:
      "Read-only 1m A* within parking155743958 (game-only accessprivate connector), actual public OSM footway width minus capsule radius, and optionally mapped grass/meadow/grassland within6m of the actual blocker (game-only detour, no public access claim). Every25cm edge sample requires actual source/fill support, no DEM fallback; production capsule overlap and swept edges; actor follows normal KCC afterwards, no physics mutation.",
  };
}
try {
  if (spawnProbesOnly)
    for (const [x, z] of spawnCandidates) {
      const nominal = groundHeight(x, z),
        surface = sim.surfaceHeight(x, z);
      const actor = sim.add(`spawn-candidate-${x}-${z}`, {
        x,
        y: surface + 1,
        z,
      });
      actor.setPosition = () => {
        throw new Error(
          "Spawn candidate fell into production teleport recovery",
        );
      };
      const overlap = (shape: RAPIER.Shape, center: Vec3, yaw = 0) => {
        const collider = sim.world.intersectionWithShape(
          center,
          { x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) },
          shape,
          undefined,
          undefined,
          actor.collider,
          actor.body,
          (c) => !sim.walkingColliders.has(c.handle),
        );
        return collider
          ? {
              collider: collider.handle,
              source: sim.groundColliders.has(collider.handle),
            }
          : null;
      };
      const capsuleOverlap = overlap(
        new RAPIER.Capsule(CHARACTER_HALF_HEIGHT, CHARACTER_RADIUS),
        { x, y: surface + 0.8201, z },
      );
      const carOverlapYaw0 = overlap(new RAPIER.Cuboid(1.02, 0.615, 1.78), {
        x,
        y: surface - 0.0112 + 0.945,
        z,
      });
      const carOverlapYaw90 = overlap(
        new RAPIER.Cuboid(1.02, 0.615, 1.78),
        { x, y: surface - 0.0112 + 0.945, z },
        Math.PI / 2,
      );
      const clearances: any[] = [];
      for (const height of [0.55, 1.2])
        for (let direction = 0; direction < 8; direction++) {
          const angle = (direction * Math.PI) / 4;
          const ray = new RAPIER.Ray(
            { x, y: surface + height, z },
            { x: Math.cos(angle), y: 0, z: Math.sin(angle) },
          );
          const hit = sim.world.castRayAndGetNormal(
            ray,
            8,
            true,
            undefined,
            undefined,
            actor.collider,
            actor.body,
            (c) => !sim.walkingColliders.has(c.handle),
          );
          clearances.push({
            height,
            angleDegrees: direction * 45,
            clearMetres: hit?.timeOfImpact ?? 8,
            source: hit
              ? sim.groundColliders.has(hit.collider.handle)
              : undefined,
            ...(hit && sim.groundColliders.has(hit.collider.handle)
              ? sourceId(
                  {
                    x: x + ray.dir.x * hit.timeOfImpact,
                    y: surface + height,
                    z: z + ray.dir.z * hit.timeOfImpact,
                  },
                  hit.normal,
                )
              : {}),
          });
        }
      let error: string | undefined;
      try {
        for (let tick = 0; tick < 60; tick++) {
          actor.step({ ...idle, seq: tick });
          sim.tick(0);
        }
      } catch (cause) {
        error = String(cause);
      }
      const p = { ...actor.position };
      const result = {
        x,
        z,
        dmrY: nominal,
        surfaceHeightHelper: surface,
        nearDmrSourceRay: probe(actor, x, z, nominal + 0.6, 3, true),
        highestNearbySourceRay: probe(actor, x, z, nominal + 3, 6, true),
        capsuleOverlap,
        carOverlapYaw0,
        carOverlapYaw90,
        minimumTorsoClearance: Math.min(
          ...clearances.map((c) => c.clearMetres),
        ),
        clearances,
        settledPosition: p,
        grounded: actor.grounded,
        physicalSupport: probe(actor, p.x, p.z),
        error,
        safeForPlayer:
          !capsuleOverlap &&
          !error &&
          actor.grounded &&
          Math.hypot(p.x - x, p.z - z) < 0.1,
        safeForCarYaw0: !carOverlapYaw0,
        safeForCarYaw90: !carOverlapYaw90,
        publicRouteConnections: ["stadium191a", "stadium191b"].map((id) => {
          const goal = PLACES.find((place) => place.id === id)!;
          const route = findCampusWalkRoute([x, z], [goal.x, goal.z], 10);
          return {
            id,
            connected: !!route,
            length: route?.length,
            startConnector: route?.startConnector,
            firstSegments: route?.segments.slice(0, 3),
          };
        }),
      };
      spawnProbes.push(result);
      console.log(
        JSON.stringify({
          phase: "spawn-candidate",
          ...result,
          clearances: undefined,
        }),
      );
      sim.remove(actor.id);
    }
  for (const route of spawnProbesOnly
    ? []
    : routes.filter((route) => !onlyRoute || route.id === onlyRoute)) {
    const start = route.points[0];
    const actor = sim.add("photo-walk-" + route.id, {
      x: start[0],
      y: sim.surfaceHeight(start[0], start[1]) + 1,
      z: start[1],
    });
    let ticks = 0,
      travelled = 0,
      maxStep = 0,
      maxVerticalStep = 0,
      grounded = 0,
      waypoint = 0;
    let failure: any,
      lastProgressAt = 0,
      bestDistance = Infinity;
    const samples: any[] = [];
    const workingPoints = route.points.map((point) => [...point] as Point),
      detours: any[] = [];
    actor.setPosition = (position) => {
      throw new Error(
        `Forbidden production fall-recovery teleport to ${JSON.stringify(position)}`,
      );
    };
    const snapshot = () => {
      const p = { ...actor.position };
      return {
        tick: ticks,
        position: p,
        grounded: actor.grounded,
        verticalVelocity: actor.vertical,
        surfaceHeightHelper: sim.surfaceHeight(p.x, p.z),
        dmrY: groundHeight(p.x, p.z),
        support: probe(actor, p.x, p.z),
        sourceSupport: probe(actor, p.x, p.z, p.y + 0.1, 4, true),
        nearbySourceNodes: nearbySourceNodes(p),
      };
    };
    const step = (x: number, z: number) => {
      const before = { ...actor.position };
      try {
        actor.step({ ...idle, x, z, seq: ticks + 1 });
        sim.tick(0);
      } catch (error) {
        failure = {
          kind: "production-teleport-guard-or-physics-error",
          message: String(error),
          ...snapshot(),
        };
        return;
      }
      ticks++;
      const p = actor.position,
        moved = Math.hypot(p.x - before.x, p.z - before.z),
        vertical = Math.abs(p.y - before.y);
      travelled += moved;
      maxStep = Math.max(maxStep, moved);
      maxVerticalStep = Math.max(maxVerticalStep, vertical);
      if (actor.grounded) grounded++;
      if (ticks % 15 === 0) samples.push(snapshot());
      if (![p.x, p.y, p.z].every(Number.isFinite))
        failure = { kind: "nonfinite-position", ...snapshot() };
      else if (moved > 0.15)
        failure = {
          kind: "discontinuous-horizontal-movement",
          moved,
          ...snapshot(),
        };
      else if (
        p.x <= BOUNDS.minX ||
        p.x >= BOUNDS.maxX ||
        p.z <= BOUNDS.minZ ||
        p.z >= BOUNDS.maxZ
      )
        failure = { kind: "outside-playable-bounds", ...snapshot() };
      else if (p.y < groundHeight(p.x, p.z) - 2 && !probe(actor, p.x, p.z))
        failure = {
          kind: "fell-below-ground-without-physical-support",
          ...snapshot(),
        };
    };
    for (let i = 0; i < 45 && !failure; i++) step(0, 0);
    const settledStart = snapshot();
    for (
      waypoint = 1;
      waypoint < workingPoints.length && !failure;
      waypoint++
    ) {
      const target = workingPoints[waypoint];
      let replanned = false;
      bestDistance = Infinity;
      lastProgressAt = ticks;
      let budget =
        Math.ceil(
          Math.hypot(
            target[0] - actor.position.x,
            target[1] - actor.position.z,
          ) /
            (4.6 * FIXED_DT),
        ) + 240;
      while (budget-- > 0 && !failure) {
        const dx = target[0] - actor.position.x,
          dz = target[1] - actor.position.z,
          distance = Math.hypot(dx, dz);
        if (distance < 0.12) break;
        if (distance < bestDistance - 0.03) {
          bestDistance = distance;
          lastProgressAt = ticks;
        }
        if (ticks - lastProgressAt >= 120) {
          if (
            allowDetours &&
            detours.length < 20 &&
            (route.id.startsWith("stadium") ||
              route.id.startsWith("rko") ||
              route.id === "parking-to-footgraph-connector")
          ) {
            const from: Point = [actor.position.x, actor.position.z];
            const plan = planPhysicalDetour(actor, from, target);
            if (
              plan &&
              plan.points.length > 2 &&
              !detours.some(
                (old) =>
                  Math.hypot(old.from[0] - from[0], old.from[1] - from[1]) <
                  0.3,
              )
            ) {
              detours.push({
                ...plan,
                from,
                target,
                blockedAt: snapshot(),
                contacts: collisionEvidence(actor),
              });
              workingPoints.splice(
                waypoint,
                0,
                ...plan.points.slice(1, plan.subGoalOnly ? undefined : -1),
              );
              console.log(
                JSON.stringify({
                  phase: "read-only-detour-planned",
                  route: route.id,
                  from,
                  target,
                  points: plan.points,
                  areas: plan.areas,
                }),
              );
              replanned = true;
              break;
            }
          }
          failure = {
            kind: "actual-kcc-blocked-no-progress-for-two-seconds",
            target,
            distance,
            waypoint,
            ...snapshot(),
            contacts: collisionEvidence(actor),
          };
          break;
        }
        const scale = Math.min(1, distance / (4.6 * FIXED_DT));
        step((dx / distance) * scale, (dz / distance) * scale);
      }
      if (replanned) {
        waypoint--;
        continue;
      }
      if (budget <= 0 && !failure)
        failure = {
          kind: "actual-kcc-waypoint-budget-exhausted",
          target,
          waypoint,
          ...snapshot(),
          contacts: collisionEvidence(actor),
        };
    }
    if (!failure) for (let i = 0; i < 45 && !failure; i++) step(0, 0);
    const end = route.points.at(-1)!;
    const final = snapshot();
    const reached =
      !failure &&
      Math.hypot(final.position.x - end[0], final.position.z - end[1]) < 0.2;
    const report = {
      id: route.id,
      pass: reached,
      routeMetres: route.length,
      routeSha256: hash(JSON.stringify(route)),
      provenance: route.provenance,
      ticks,
      seconds: ticks * FIXED_DT,
      travelledMetres: travelled,
      maxStep,
      maxVerticalStep,
      groundedFraction: grounded / Math.max(1, ticks),
      settledStart,
      final,
      failure,
      points: route.points,
      actualWaypointPlan: workingPoints,
      detours,
      samples,
    };
    reports.push(report);
    console.log(
      JSON.stringify({
        id: route.id,
        pass: reached,
        ticks,
        travelledMetres: travelled,
        failure: failure
          ? {
              kind: failure.kind,
              position: failure.position,
              nodes: failure.nearbySourceNodes,
              contacts: failure.contacts?.slice(0, 3),
            }
          : undefined,
      }),
    );
    sim.remove(actor.id);
  }
} finally {
  sim.dispose();
}

const afterHashes = await hashSharedSources();
const collisionSha256After = hash(
  await readFile("public/models/photogrammetry/ipr2023/collision.pcm.gz"),
);
const summary = {
  schemaVersion: 1,
  timestamp,
  label,
  mode: spawnProbesOnly
    ? "actual-full-finest-photogrammetry-spawn-overlap-and-support"
    : "actual-full-finest-photogrammetry-production-KCC",
  legacyDemSimulationUsed: false,
  physicalDetoursEnabled: allowDetours,
  detourNavGridMetres: navGrid,
  mappedGrassDetoursEnabled: allowGrassDetours,
  photoInterpretedApronEnabled: allowApronDetours,
  onlyRoute,
  detourPlanningDiagnostics,
  simulationInstances: 1,
  teleportOrJumpUsed: false,
  constructionSeconds,
  totalSeconds: (performance.now() - started) / 1000,
  collision: {
    gzipSha256: hash(compressed),
    rawSha256: hash(raw),
    vertices: collision.positions.length / 3,
    triangles: outputTriangles,
    bytes: compressed.length,
  },
  derivedGroundFill: {
    triangles: getPhotogrammetryGroundPatchGeometry().indices.length / 3,
    patchCount: getPhotogrammetryGroundPatchGeometry().patchCount,
    areaSquareMetres: getPhotogrammetryGroundPatchGeometry().areaSquareMetres,
  },
  sourceHashes,
  sourceHashesAfter: afterHashes,
  collisionSha256After,
  sourceStableDuringAudit:
    JSON.stringify(sourceHashes) === JSON.stringify(afterHashes) &&
    collisionSha256After === hash(compressed),
  thresholds: {
    characterRadius: CHARACTER_RADIUS,
    characterHalfHeight: CHARACTER_HALF_HEIGHT,
    fixedDt: FIXED_DT,
    waypointReach: 0.12,
    noProgressMetres: 0.03,
    noProgressSeconds: 2,
    maxStepMetres: 0.15,
  },
  pass: spawnProbesOnly
    ? spawnProbes.every(
        (probe) =>
          probe.safeForPlayer && probe.safeForCarYaw0 && probe.safeForCarYaw90,
      )
    : reports.every((report) => report.pass),
  passed: spawnProbesOnly
    ? spawnProbes.filter(
        (probe) =>
          probe.safeForPlayer && probe.safeForCarYaw0 && probe.safeForCarYaw90,
      ).length
    : reports.filter((report) => report.pass).length,
  failed: spawnProbesOnly
    ? spawnProbes.filter(
        (probe) =>
          !probe.safeForPlayer ||
          !probe.safeForCarYaw0 ||
          !probe.safeForCarYaw90,
      ).length
    : reports.filter((report) => !report.pass).length,
  reports,
  spawnProbes,
};
await mkdir("docs/photogrammetry", { recursive: true });
const stem = "docs/photogrammetry/gameplay-walk-" + label;
await writeFile(stem + ".json", JSON.stringify(summary));
const lines = [
  "# Průchozí skutečná fotogrammetrie: fyzikální audit",
  "",
  `Běh ${timestamp}; zdrojová kolize SHA-256 \`${summary.collision.gzipSha256}\`.`,
  "",
  `Použita jedna produkční \`new Simulation(photoCollision)\`, ${outputTriangles.toLocaleString("cs-CZ")} nejpodrobnějších trojúhelníků. Původní DEM simulace se nepoužila. Žádná trasa neteleportuje, neskáče ani neupravuje kolize či toleranci. Čas provozu je deterministicky 0; jde o fyzikální audit zdrojového povrchu, nikoli GPU/FPS test.`,
  "",
  `**Výsledek: ${summary.passed}/${spawnProbesOnly ? spawnProbes.length : reports.length} ${spawnProbesOnly ? "fyzikálních spawn sond" : "průchodů"} PASS, ${summary.failed} FAIL.** Stabilita souborů během běhu: ${summary.sourceStableDuringAudit ? "beze změn" : "některé soubory byly souběžně změněny; opakovat na zmrazeném zdroji"}.`,
  "",
  "| Trasa | Výsledek | Projitá / plánovaná délka | První problém |",
  "|---|---|---:|---|",
  ...reports.map(
    (report) =>
      `| ${report.id} | ${report.pass ? "PASS" : "FAIL"} | ${report.travelledMetres.toFixed(2)} / ${report.routeMetres.toFixed(2)} m | ${report.failure ? `${report.failure.kind} při X=${report.failure.position?.x?.toFixed(3)}, Y=${report.failure.position?.y?.toFixed(3)}, Z=${report.failure.position?.z?.toFixed(3)}` : "—"} |`,
  ),
  ...(spawnProbesOnly
    ? [
        "",
        "## Samostatné sondy spawnu",
        "",
        "| X,Z | Hráč | Auto yaw0 / yaw90 | Nejmenší radiální odstup | Source výška | Foot graph do10m |",
        "|---|---|---|---:|---:|---|",
        ...spawnProbes.map(
          (probe) =>
            `| ${probe.x},${probe.z} | ${probe.safeForPlayer ? "PASS" : "FAIL"} | ${probe.safeForCarYaw0 ? "PASS" : "FAIL"} / ${probe.safeForCarYaw90 ? "PASS" : "FAIL"} | ${probe.minimumTorsoClearance.toFixed(3)}m | ${probe.surfaceHeightHelper.toFixed(3)}m | ${probe.publicRouteConnections.every((route: any) => route.connected) ? "spojen" : "nespojen"} |`,
        ),
      ]
    : []),
  "",
  "První zaseknutí/propad, skutečné Rapier kontaktní body, normály, ID původních IPR uzlů, ray support, pomocná výška spawnu, waypointy a vzorky po 0,25 s jsou v přiloženém JSON. KCC má nezměněný produkční autostep 0,22 m a capsule 0,42/0,38 m. FAIL se nesmí považovat za průchod úspěšný na základě starších testů DEM.",
  "",
  "Opakování:",
  "",
  "```powershell",
  `pnpm exec tsx scripts/validate-photogrammetry-walks.ts ${spawnProbesOnly ? "--spawn-probes-only " : ""}--label ${label}-repeat`,
  "```",
  "",
];
await writeFile(stem + ".md", lines.join("\n"));
console.log(
  JSON.stringify({
    phase: "done",
    passed: summary.passed,
    failed: summary.failed,
    json: stem + ".json",
    markdown: stem + ".md",
    seconds: summary.totalSeconds,
  }),
);
if (!summary.pass || !summary.sourceStableDuringAudit) process.exitCode = 1;
