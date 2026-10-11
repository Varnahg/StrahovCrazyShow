/** Read-only native production KCC audit. No raw scan, teleport or deleted solid. */
import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import RAPIER from "@dimforge/rapier3d-compat";
import {
  Simulation,
  initPhysics,
  CHARACTER_RADIUS,
  CHARACTER_HALF_HEIGHT,
  type Actor,
} from "../shared/simulation";
import { SPAWN, PLACES, TREES, BOUNDS, B6_BOXES } from "../shared/world";
import {
  groundHeight,
  PARKING_SLOTS,
  isRealityGroundSurface,
} from "../shared/terrain";
import {
  STREETS,
  STREET_FEATURES,
  streetPolygonContains,
  streetSurfaceAt,
  type StreetPoint,
} from "../shared/streets";
import { findCampusWalkRoute } from "../shared/campus-routes";
import { B6_LAYOUT } from "../shared/b6-interior";
import { buildCampusExteriorPlan } from "../shared/campus-exterior";
import { canonicalInput, FIXED_DT } from "../shared/netcode";
import type { Vec3 } from "../shared/types";
type Point = StreetPoint;
type Route = {
  id: string;
  points: Point[];
  provenance: string[];
  sourceWayIds: string[];
  goal: Point;
  marker?: Point;
};
const started = performance.now(),
  stamp = new Date().toISOString(),
  labelIndex = process.argv.indexOf("--label");
const label =
  labelIndex < 0
    ? stamp.replace(/[^0-9]/g, "").slice(0, 14)
    : process.argv[labelIndex + 1];
if (!/^[a-zA-Z0-9_-]+$/.test(label ?? "")) throw new Error("Invalid label");
const onlyIndex = process.argv.indexOf("--only"),
  only = onlyIndex < 0 ? undefined : process.argv[onlyIndex + 1];
const hash = (bytes: Uint8Array | string) =>
  createHash("sha256").update(bytes).digest("hex");
async function sourceHashes() {
  const files = (await readdir("shared", { recursive: true }))
    .filter((file) => /\.(ts|json)$/.test(file))
    .sort();
  return Object.fromEntries(
    await Promise.all(
      files.map(async (file) => [
        "shared/" + file.replaceAll("\\", "/"),
        hash(await readFile("shared/" + file)),
      ]),
    ),
  );
}
const before = await sourceHashes();
await initPhysics();
const constructionStarted = performance.now(),
  sim = new Simulation(),
  constructionSeconds = (performance.now() - constructionStarted) / 1000;
if (sim.photogrammetry)
  throw new Error("Native audit unexpectedly loaded source-scan geometry");
const exterior = buildCampusExteriorPlan(),
  colliders: RAPIER.Collider[] = [];
sim.world.forEachCollider((c) => colliders.push(c));
const trees = colliders.filter(
  (c) => c.shapeType() === RAPIER.ShapeType.Cylinder,
);
const parked = colliders.filter((c) => {
  if (
    c.handle === sim.car.collider.handle ||
    c.shapeType() !== RAPIER.ShapeType.Cuboid ||
    c.parent()?.bodyType() !== RAPIER.RigidBodyType.Fixed
  )
    return false;
  const e = (c.shape as RAPIER.Cuboid).halfExtents;
  return (
    Math.abs(e.x - 1.02) < 1e-5 &&
    Math.abs(e.y - 0.615) < 1e-5 &&
    Math.abs(e.z - 1.78) < 1e-5
  );
});
const exteriorColliders = colliders.filter(
  (c) =>
    c.shapeType() === RAPIER.ShapeType.TriMesh &&
    (c.shape as RAPIER.TriMesh).vertices.length ===
      exterior.collision.positions.length &&
    (c.shape as RAPIER.TriMesh).indices.length ===
      exterior.collision.indices.length,
);
if (
  trees.length !== TREES.length ||
  parked.length !== PARKING_SLOTS.length ||
  !exteriorColliders.length
)
  throw new Error("Production court/tree/car solids were omitted");
const supportHandles = new Set(sim.groundColliders);
for (const c of colliders) {
  if (c.shapeType() !== RAPIER.ShapeType.Cuboid) continue;
  const p = c.translation(),
    e = (c.shape as RAPIER.Cuboid).halfExtents;
  if (
    B6_BOXES.some(
      (b) =>
        ["floor", "stair"].includes(b.kind) &&
        Math.hypot(
          p.x - b.x,
          p.y - b.y - B6_LAYOUT.foundationOffset,
          p.z - b.z,
        ) < 0.001 &&
        Math.abs(e.x - b.w / 2) < 0.001 &&
        Math.abs(e.y - b.h / 2) < 0.001 &&
        Math.abs(e.z - b.d / 2) < 0.001,
    )
  )
    supportHandles.add(c.handle);
}
const parking = STREETS.parking.find((p) => p.id === "155743958");
if (!parking) throw new Error("Missing central parking155743958");
const anchor: Point = [109.52341319607139, -11.40754211169377];
for (let i = 0; i <= 100; i++) {
  const t = i / 100,
    x = SPAWN.x + (anchor[0] - SPAWN.x) * t,
    z = SPAWN.z + (anchor[1] - SPAWN.z) * t;
  if (
    !streetPolygonContains(
      { outer: parking.points, holes: [], area: 0 },
      x,
      z,
    ) ||
    (!streetSurfaceAt(x, z) && !isRealityGroundSurface(x, z))
  )
    throw new Error("Private virtual parking connector left mapped asphalt");
}
const footways = STREET_FEATURES.filter(
  (f) =>
    f.kind !== "road" &&
    !["no", "private"].includes(f.tags.foot) &&
    (["yes", "designated", "permissive"].includes(f.tags.foot) ||
      !["no", "private"].includes(f.tags.access)),
).flatMap((f) =>
  f.points
    .slice(1)
    .map((b, i) => ({ a: f.points[i], b, width: f.width, id: f.id })),
);
function segmentDistance(p: Point, a: Point, b: Point) {
  const dx = b[0] - a[0],
    dz = b[1] - a[1],
    t = Math.max(
      0,
      Math.min(
        1,
        ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / (dx * dx + dz * dz || 1),
      ),
    );
  return Math.hypot(p[0] - a[0] - dx * t, p[1] - a[1] - dz * t);
}
function sourceArea(p: Point) {
  if (
    streetPolygonContains(
      { outer: parking!.points, holes: [], area: 0 },
      ...p,
    ) &&
    (streetSurfaceAt(...p) === "asphalt" || isRealityGroundSurface(...p))
  )
    return "virtual-private-parking155743958";
  const foot = footways.find(
    (s) =>
      segmentDistance(p, s.a, s.b) <=
      Math.max(0.05, s.width / 2 - CHARACTER_RADIUS - 0.02),
  );
  return foot ? "public-osm-footway:" + foot.id : undefined;
}
function colliderKind(c: RAPIER.Collider, witness?: Vec3) {
  if (sim.groundColliders.has(c.handle)) return "native-DMR-ground";
  if (c.handle === sim.car.collider.handle) return "interactive-car";
  if (parked.some((p) => p.handle === c.handle)) {
    const p = c.parent()!.translation(),
      slot = PARKING_SLOTS.find((s) => Math.hypot(s.x - p.x, s.z - p.z) < 0.01);
    return "parked-car:" + (slot?.id ?? c.handle);
  }
  if (c.shapeType() === RAPIER.ShapeType.Cylinder) {
    const p = c.translation(),
      tree = TREES.find((t) => Math.hypot(t.x - p.x, t.z - p.z) < 0.01);
    return "tree:" + (tree?.osmId ?? c.handle);
  }
  if (exteriorColliders.some((p) => p.handle === c.handle)) {
    const fence = witness
      ? exterior.fences
          .map((f) => ({
            id: f.courtId,
            d: segmentDistance([witness.x, witness.z], f.a, f.b),
          }))
          .sort((a, b) => a.d - b.d)[0]
      : undefined;
    return "court-fence-mesh" + (fence && fence.d < 0.5 ? ":" + fence.id : "");
  }
  return supportHandles.has(c.handle)
    ? "B6-floor-or-stair"
    : "native-building-or-prop:" + c.handle;
}
function contacts(actor: Actor) {
  const out: any[] = [];
  for (let i = 0; i < actor.controller.numComputedCollisions(); i++) {
    const c = actor.controller.computedCollision(i);
    if (c?.collider)
      out.push({
        kind: colliderKind(c.collider, c.witness1),
        collider: c.collider.handle,
        witness: { ...c.witness1 },
        normal: { ...c.normal1 },
        remaining: { ...c.translationDeltaRemaining },
      });
  }
  return out;
}
function actualSupport(actor: Actor) {
  const p = actor.position,
    origin = { x: p.x, y: p.y + 0.1, z: p.z },
    hit = sim.world.castRayAndGetNormal(
      new RAPIER.Ray(origin, { x: 0, y: -1, z: 0 }),
      1.8,
      true,
      undefined,
      undefined,
      actor.collider,
      actor.body,
      (c) => !sim.walkingColliders.has(c.handle),
    );
  return hit
    ? {
        y: origin.y - hit.timeOfImpact,
        normal: { ...hit.normal },
        kind: colliderKind(hit.collider),
      }
    : undefined;
}

/** Read-only A* proposal; the untouched production KCC must walk every result. */
function detour(actor: Actor, from: Point, goal: Point, grid = 0.5) {
  const capsule = new RAPIER.Capsule(CHARACTER_HALF_HEIGHT, CHARACTER_RADIUS),
    rotation = { x: 0, y: 0, z: 0, w: 1 };
  const cache = new Map<
      string,
      { p: Point; center: Vec3; allowed: boolean; area?: string }
    >(),
    edges = new Map<string, boolean>(),
    key = (p: Point) => p[0] + "," + p[1];
  const minX = Math.min(from[0], goal[0]) - 8,
    maxX = Math.max(from[0], goal[0]) + 8,
    minZ = Math.min(from[1], goal[1]) - 8,
    maxZ = Math.max(from[1], goal[1]) + 8;
  const node = (p: Point) => {
    const id = key(p),
      prior = cache.get(id);
    if (prior) return prior;
    const area = sourceArea(p),
      ray = new RAPIER.Ray(
        { x: p[0], y: groundHeight(...p) + 2.8, z: p[1] },
        { x: 0, y: -1, z: 0 },
      );
    const hit = area
      ? sim.world.castRayAndGetNormal(
          ray,
          5,
          true,
          undefined,
          undefined,
          actor.collider,
          actor.body,
          (c) => supportHandles.has(c.handle),
        )
      : undefined;
    const center = {
      x: p[0],
      y: hit
        ? ray.origin.y -
          hit.timeOfImpact +
          CHARACTER_HALF_HEIGHT +
          CHARACTER_RADIUS / Math.max(0.35, hit.normal.y) +
          0.04
        : NaN,
      z: p[1],
    };
    const blocked = hit
      ? sim.world.intersectionWithShape(
          center,
          rotation,
          capsule,
          undefined,
          undefined,
          actor.collider,
          actor.body,
          (c) =>
            !sim.walkingColliders.has(c.handle) &&
            !supportHandles.has(c.handle),
        )
      : true;
    const result = {
      p,
      center,
      allowed: !!area && !!hit && hit.normal.y > 0.5 && !blocked,
      area,
    };
    cache.set(id, result);
    return result;
  };
  const edge = (a: Point, b: Point) => {
    const id = key(a) + ">" + key(b);
    if (edges.has(id)) return edges.get(id)!;
    let previous = node(a),
      clear = previous.allowed;
    const samples = Math.max(
      1,
      Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 0.25),
    );
    for (let i = 1; clear && i <= samples; i++) {
      const t = i / samples,
        next = node([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
      clear =
        next.allowed &&
        Math.abs(next.center.y - previous.center.y) <
          0.22 +
            Math.hypot(next.p[0] - previous.p[0], next.p[1] - previous.p[1]);
      if (clear)
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
          (c) =>
            !sim.walkingColliders.has(c.handle) &&
            !supportHandles.has(c.handle),
        );
      previous = next;
    }
    edges.set(id, clear);
    return clear;
  };
  if (!node(from).allowed || !node(goal).allowed) return undefined;
  const open: { p: Point; cost: number; score: number }[] = [],
    costs = new Map([[key(from), 0]]),
    parents = new Map<string, Point>(),
    h = (p: Point) => Math.hypot(p[0] - goal[0], p[1] - goal[1]);
  const offer = (a: Point, b: Point, cost: number) => {
    if (!edge(a, b) || (costs.get(key(b)) ?? Infinity) <= cost) return;
    costs.set(key(b), cost);
    parents.set(key(b), a);
    open.push({ p: b, cost, score: cost + h(b) });
  };
  for (
    let x = Math.floor(from[0] / grid) * grid - grid;
    x <= Math.ceil(from[0] / grid) * grid + grid;
    x += grid
  )
    for (
      let z = Math.floor(from[1] / grid) * grid - grid;
      z <= Math.ceil(from[1] / grid) * grid + grid;
      z += grid
    )
      if (Math.hypot(x - from[0], z - from[1]) <= grid * 2.1)
        offer(from, [x, z], Math.hypot(x - from[0], z - from[1]));
  let expanded = 0,
    found: Point | undefined;
  while (open.length && expanded < 15000) {
    let best = 0;
    for (let i = 1; i < open.length; i++)
      if (open[i].score < open[best].score) best = i;
    const current = open.splice(best, 1)[0];
    if (current.cost !== costs.get(key(current.p))) continue;
    expanded++;
    if (h(current.p) <= grid * 2.1 && edge(current.p, goal)) {
      parents.set(key(goal), current.p);
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
      const next: Point = [current.p[0] + dx * grid, current.p[1] + dz * grid];
      if (
        next[0] >= minX &&
        next[0] <= maxX &&
        next[1] >= minZ &&
        next[1] <= maxZ
      )
        offer(current.p, next, current.cost + Math.hypot(dx, dz) * grid);
    }
  }
  if (!found) return undefined;
  const path: Point[] = [found];
  let cursor = found;
  while (key(cursor) !== key(from)) {
    const parent = parents.get(key(cursor));
    if (!parent || path.some((p) => key(p) === key(parent))) return undefined;
    path.push(parent);
    cursor = parent;
  }
  path.reverse();
  const smooth: Point[] = [path[0]];
  let at = 0;
  while (at < path.length - 1) {
    let next = path.length - 1;
    while (next > at + 1 && !edge(path[at], path[next])) next--;
    smooth.push(path[next]);
    at = next;
  }
  return {
    points: smooth,
    gridMetres: grid,
    expanded,
    checkedNodes: cache.size,
    areas: [...new Set(path.map((p) => node(p).area))],
  };
}
const routes: Route[] = [],
  connector =
    "Explicit virtual access through mapped private parking155743958 to public foot graph; no public parking access claim.";
for (const id of ["stadium191a", "stadium191b"]) {
  const place = PLACES.find((p) => p.id === id)!,
    route = findCampusWalkRoute(anchor, [place.x, place.z], 4);
  if (!route) throw new Error("Missing strict public foot route " + id);
  routes.push({
    id,
    points: [[SPAWN.x, SPAWN.z], ...route.points],
    goal: [place.x, place.z],
    sourceWayIds: [
      ...new Set(
        route.segments.flatMap((s) => (s.featureId ? [s.featureId] : [])),
      ),
    ],
    provenance: [
      connector,
      "Strict public OSM route, max4m endpoint attachment; local detours stay in existing parking/footways.",
    ],
  });
}
const rko = PLACES.find((p) => p.id === "rko")!,
  rkoGraph = findCampusWalkRoute(anchor, [rko.x, rko.z], 4);
if (!rkoGraph) throw new Error("Missing R-ko public approach");
const rkoApproach = rkoGraph.points.at(-2)!;
routes.push({
  id: "rko-public-approach",
  points: [[SPAWN.x, SPAWN.z], ...rkoGraph.points.slice(0, -1)],
  goal: rkoApproach,
  marker: [rko.x, rko.z],
  sourceWayIds: [
    ...new Set(
      rkoGraph.segments.flatMap((s) => (s.featureId ? [s.featureId] : [])),
    ),
  ],
  provenance: [
    connector,
    "Closest mapped public footway outside solid Potraviny; marker lies inside, no invented doorway or bar interior.",
  ],
});
const b6Graph = findCampusWalkRoute(
  anchor,
  [B6_LAYOUT.outsideSpawn.x, B6_LAYOUT.outsideSpawn.z],
  10,
);
if (!b6Graph) throw new Error("Missing mapped B6 north approach");
const b6Points: Point[] = [
  [SPAWN.x, SPAWN.z],
  ...b6Graph.points,
  ...B6_LAYOUT.approachRoute,
  ...B6_LAYOUT.serviceRoute.slice(0, 1),
];
routes.push({
  id: "b6-north-reception",
  points: b6Points,
  goal: b6Points.at(-1)!,
  sourceWayIds: [
    ...new Set(
      b6Graph.segments.flatMap((s) => (s.featureId ? [s.featureId] : [])),
    ),
  ],
  provenance: [
    connector,
    "Mapped graph plus explicit <=10m model-entry connector, shared twelve risers, north doorway and reception; unmeasured reconstruction.",
  ],
});
const reports: any[] = [];
try {
  for (const route of routes.filter((route) => !only || route.id === only)) {
    console.log(
      JSON.stringify({
        phase: "native-route-start",
        id: route.id,
        spawn: SPAWN,
        goal: route.goal,
      }),
    );
    const actor = sim.add("native-walk-" + route.id, SPAWN);
    let teleportAttempts = 0;
    actor.setPosition = () => {
      teleportAttempts++;
      throw new Error("Production teleport/fall-recovery invoked");
    };
    const points = route.points.map((p) => [...p] as Point),
      detours: any[] = [],
      trace: any[] = [];
    let ticks = 0,
      travelled = 0,
      grounded = 0,
      maxHorizontalStep = 0,
      maxVerticalStep = 0,
      minGap = Infinity,
      maxGap = -Infinity,
      passed = false,
      failure: any;
    const step = (x: number, z: number) => {
      const previous = { ...actor.position },
        input = canonicalInput({
          x,
          z,
          yaw: Math.atan2(x, z),
          jump: false,
          seq: ticks + 1,
        })!;
      actor.step(input, FIXED_DT);
      sim.tick(0);
      ticks++;
      const p = actor.position,
        moved = Math.hypot(p.x - previous.x, p.z - previous.z),
        vertical = Math.abs(p.y - previous.y),
        support = actualSupport(actor);
      travelled += moved;
      maxHorizontalStep = Math.max(maxHorizontalStep, moved);
      maxVerticalStep = Math.max(maxVerticalStep, vertical);
      if (actor.grounded) grounded++;
      if (
        ![p.x, p.y, p.z].every(Number.isFinite) ||
        moved > 0.15 ||
        vertical > 0.25 ||
        p.x < BOUNDS.minX ||
        p.x > BOUNDS.maxX ||
        p.z < BOUNDS.minZ ||
        p.z > BOUNDS.maxZ
      )
        throw new Error("Discontinuous, nonfinite or out-of-bounds KCC step");
      if (support) {
        const gap = p.y - support.y;
        minGap = Math.min(minGap, gap);
        maxGap = Math.max(maxGap, gap);
        if (
          gap < CHARACTER_HALF_HEIGHT + CHARACTER_RADIUS - 0.05 ||
          gap >
            CHARACTER_HALF_HEIGHT +
              CHARACTER_RADIUS / Math.max(0.35, support.normal.y) +
              0.3
        )
          throw new Error("Capsule penetration/hover over actual support");
      } else throw new Error("Missing actual physics support");
      if (ticks % 120 === 0)
        trace.push({ tick: ticks, position: { ...p }, support });
    };
    let waypoint = 1;
    try {
      for (let i = 0; i < 45; i++) step(0, 0);
      while (waypoint < points.length) {
        const target = points[waypoint];
        let best = Infinity,
          lastProgress = ticks,
          budget =
            Math.ceil(
              Math.hypot(
                target[0] - actor.position.x,
                target[1] - actor.position.z,
              ) /
                (4.6 / 60),
            ) *
              2 +
            180,
          blocked = false;
        while (budget-- > 0) {
          const p = actor.position,
            dx = target[0] - p.x,
            dz = target[1] - p.z,
            d = Math.hypot(dx, dz);
          if (d < 0.12) break;
          if (d < best - 0.03) {
            best = d;
            lastProgress = ticks;
          }
          if (ticks - lastProgress >= 120) {
            blocked = true;
            break;
          }
          const scale = Math.min(1, d / (4.6 / 60));
          step((dx / d) * scale, (dz / d) * scale);
        }
        if (blocked || budget <= 0) {
          const from: Point = [actor.position.x, actor.position.z],
            blockedContacts = contacts(actor);
          let plan: ReturnType<typeof detour>,
            rejoin = waypoint;
          if (detours.length < 20)
            for (
              let future = waypoint;
              future < Math.min(points.length, waypoint + 8) && !plan;
              future++
            ) {
              const goal = points[future],
                distance = Math.hypot(goal[0] - from[0], goal[1] - from[1]);
              if (distance > 40) break;
              plan =
                detour(actor, from, goal, 0.5) ??
                detour(actor, from, goal, 0.25);
              if (plan) rejoin = future;
            }
          if (!plan) {
            failure = {
              reason:
                "blocked with no capsule-safe detour inside existing source asphalt/footways",
              target,
              position: { ...actor.position },
              contacts: blockedContacts,
            };
            break;
          }
          detours.push({
            from,
            rejoin: points[rejoin],
            skippedOriginalWaypoints: points.slice(waypoint, rejoin),
            ...plan,
            blockingContacts: blockedContacts,
          });
          points.splice(
            waypoint,
            rejoin - waypoint + 1,
            ...plan.points.slice(1),
          );
          console.log(
            JSON.stringify({
              phase: "native-detour",
              route: route.id,
              from,
              rejoin: plan.points.at(-1),
              nodes: plan.expanded,
              grid: plan.gridMetres,
            }),
          );
          continue;
        }
        waypoint++;
      }
      if (!failure) {
        for (let i = 0; i < 60; i++) step(0, 0);
        const p = actor.position;
        if (Math.hypot(p.x - route.goal[0], p.z - route.goal[1]) >= 0.2)
          throw new Error("Final destination not reached");
        if (grounded / ticks < 0.95)
          throw new Error("Insufficient grounded samples");
        passed = true;
      }
    } catch (error) {
      failure = {
        reason: String(error),
        target: points[waypoint],
        position: { ...actor.position },
        contacts: contacts(actor),
      };
    }
    reports.push({
      id: route.id,
      passed,
      start: SPAWN,
      goal: route.goal,
      marker: route.marker,
      markerDistance: route.marker
        ? Math.hypot(
            actor.position.x - route.marker[0],
            actor.position.z - route.marker[1],
          )
        : undefined,
      finalPosition: { ...actor.position },
      ticks,
      seconds: ticks / 60,
      travelled,
      maxHorizontalStep,
      maxVerticalStep,
      minSupportGap: minGap,
      maxSupportGap: maxGap,
      groundedSamples: grounded,
      groundedFraction: grounded / ticks,
      teleportAttempts,
      provenance: route.provenance,
      sourceWayIds: route.sourceWayIds,
      nominalPoints: route.points,
      walkedWaypoints: points,
      detours,
      trace,
      failure,
    });
    sim.remove(actor.id);
    console.log(
      JSON.stringify({
        phase: "native-route-complete",
        id: route.id,
        passed,
        ticks,
        travelled,
        failure,
      }),
    );
  }
} finally {
  sim.dispose();
}
const after = await sourceHashes(),
  sourceStable = JSON.stringify(before) === JSON.stringify(after),
  passed =
    reports.length > 0 &&
    reports.every((report) => report.passed) &&
    sourceStable;
const report = {
  schemaVersion: 1,
  kind: "production-native-authored-KCC-walk-audit",
  label,
  timestamp: stamp,
  photogrammetryLoaded: false,
  legacyStartUsed: false,
  spawn: SPAWN,
  constructionSeconds,
  totalSeconds: (performance.now() - started) / 1000,
  sourceStableDuringAudit: sourceStable,
  sourceHashes: before,
  sourceHashesAfter: after,
  world: {
    courtCount: exterior.courts.length,
    fenceSegments: exterior.fences.length,
    gates: exterior.gates.length,
    courtColliderMeshes: exteriorColliders.length,
    treeTrunks: trees.length,
    parkedCars: parked.length,
    colliders: colliders.length,
  },
  physics: {
    fixedDt: FIXED_DT,
    capsuleRadius: CHARACTER_RADIUS,
    capsuleHalfHeight: CHARACTER_HALF_HEIGHT,
    teleportAllowed: false,
    jumpAllowed: false,
    collisionDisableAllowed: false,
    trafficSampleInstant: 0,
    trafficScope:
      "Deterministic static-route regression, not live PID traffic proof.",
  },
  passed,
  reports,
};
await mkdir("docs/model-review", { recursive: true });
const base = "docs/model-review/authored-walks-" + label;
await writeFile(base + ".json", JSON.stringify(report, null, 2));
const lines = [
  `# Nativní fyzikální průchod: ${label}`,
  "",
  `Výsledek: **${passed ? "PASS" : "FAIL"}**. Produkční Simulation() bez IPR collideru, start(${SPAWN.x};${SPAWN.z}), ${trees.length}kmenů, ${parked.length}parkovaných aut, ${exterior.courts.length}oplocených hřišť. Zdrojové hashe před/po:${sourceStable ? "shodné" : "ZMĚNĚNÉ"}.`,
  "",
  "Normální Actor/KCC, 60Hz fyzika. Žádný skok, teleport, vypnutí objektu nebo změna geometrie. A* pouze navrhuje lokální body na existujícím zdrojovém asfaltu/footways; každý návrh musí projít nezměněnou fyzikou. Parkoviště je virtuální private spojka. R-ko se ověřuje k chodníku před solidní budovou, nikoli do baru. B6 navazuje modelovými schody a recepcí. Dopravní čas0 je deterministická statická regrese, nikoli průchod mezi živými autobusy.",
  "",
  "| Trasa | Stav | Metry | Tiky | Grounded | Max horizontální krok | Detoury |",
  "|---|---|---:|---:|---:|---:|---:|",
  ...reports.map(
    (r) =>
      `| ${r.id} | ${r.passed ? "PASS" : "FAIL"} | ${r.travelled.toFixed(3)} | ${r.ticks} | ${(r.groundedFraction * 100).toFixed(2)}% | ${r.maxHorizontalStep.toFixed(6)}m | ${r.detours.length} |`,
  ),
  "",
];
for (const r of reports.filter((r) => r.failure))
  lines.push(
    "## " + r.id,
    "",
    r.failure.reason,
    "",
    "Blokované souřadnice: " +
      JSON.stringify(r.failure.position) +
      ". Cíl: " +
      JSON.stringify(r.failure.target) +
      ".",
    "",
    "Kontakty: " + JSON.stringify(r.failure.contacts),
    "",
  );
lines.push(
  "Podrobné body, kontakty, provenance a zdrojové hashe jsou v JSON. Nejde o GPU/FPS měření ani o potvrzení nezaměřených architektonických detailů.",
  "",
);
await writeFile(base + ".md", lines.join(String.fromCharCode(10)));
console.log(
  JSON.stringify({
    phase: "audit-complete",
    passed,
    sourceStable,
    files: [base + ".json", base + ".md"],
  }),
);
if (!passed) process.exitCode = 1;
