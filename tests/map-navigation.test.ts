import test from "node:test";
import assert from "node:assert/strict";
import RAPIER from "@dimforge/rapier3d-compat";
import {
  Actor,
  Simulation,
  initPhysics,
  CHARACTER_RADIUS,
  CHARACTER_HALF_HEIGHT,
} from "../shared/simulation";
import { stepRigidWorld } from "../shared/physics-step";
import { FIXED_DT } from "../shared/netcode";
import { BUILDINGS, PLACES, SPAWN, BOUNDS } from "../shared/world";
import {
  STADIUM_PLAN,
  isClosedStadiumInterior,
} from "../shared/landmark-reality";
import { CAD_B6_ENTRY } from "../shared/cad-buildings";
import {
  MapNavigator,
  insideMapPolygon,
  resolveNavigationTarget,
  type NavigationScheduling,
} from "../client/map-navigation";
import {
  createNavigationClearance,
  NAVIGATION_CLEARANCE,
} from "../client/navigation-physics";
import {
  mapToScreen,
  screenToMap,
  type MapPoint,
} from "../client/minimap-math";

const d = (a: MapPoint, b: MapPoint) => Math.hypot(a.x - b.x, a.z - b.z);
const way = (
  points: [number, number][],
  tags: Record<string, string> = {},
  prefix = "n",
) => ({ points, nodeIds: points.map((_, i) => prefix + i), tags });

test("navigation target policy refuses closed stadium/unknown interiors and sends known dorms to their exterior approach", () => {
  assert.equal(resolveNavigationTarget(STADIUM_PLAN.center), undefined);
  assert.equal(resolveNavigationTarget({ x: NaN, z: 0 }), undefined);
  assert.equal(
    resolveNavigationTarget({ x: BOUNDS.maxX + 1, z: 0 }),
    undefined,
  );
  for (const id of ["b6", "club6"]) {
    const p = PLACES.find((p) => p.id === id)!;
    const resolved = resolveNavigationTarget(p)!;
    const { start, end } = CAD_B6_ENTRY;
    const dx = resolved.point.x - start.x,
      dz = resolved.point.z - start.z;
    assert.ok(Math.abs(Math.hypot(dx, dz) - 0.6) < 1e-10);
    assert.ok(
      Math.abs(dx * (end.z - start.z) - dz * (end.x - start.x)) < 1e-10,
    );
    assert.ok(dx * (end.x - start.x) + dz * (end.z - start.z) < 0);
    assert.equal(resolved.toEntrance, true);
    resolved.point.x += 100;
    assert.ok(
      d(resolveNavigationTarget(p)!.point, start) < 0.61,
      "callers cannot mutate the cached source approach",
    );
  }
  const unknown = BUILDINGS.find(
    (b) => b.name && !b.name.includes("blok") && b.points.length >= 4,
  )!;
  const centre = {
    x: unknown.points.reduce((s, p) => s + p[0], 0) / unknown.points.length,
    z: unknown.points.reduce((s, p) => s + p[1], 0) / unknown.points.length,
  };
  assert.ok(insideMapPolygon(centre, unknown.points));
  assert.equal(resolveNavigationTarget(centre), undefined);
});

test("arrived requires a walkable connection and is revoked when the player leaves its radius", () => {
  const start = { x: 200, z: 150 },
    target = { x: 201, z: 150 };
  const blocked = new MapNavigator(() => false, []);
  assert.equal(
    blocked.plan(start, target).status,
    "unavailable",
    "one metre through a wall is not arrival",
  );
  const open = new MapNavigator(() => true, []);
  assert.equal(open.plan(start, target).status, "arrived");
  assert.equal(
    open.plan({ x: 198.5, z: 150 }, target).status,
    "route",
    "arrival must not stick for three extra metres",
  );
});

test("mapped access and foot override are respected, and interior attachments on a long segment avoid endpoint detours", () => {
  const start = { x: 200, z: 150 },
    target = { x: 280, z: 150 };
  assert.equal(
    new MapNavigator(
      () => true,
      [
        way(
          [
            [150, 150],
            [350, 150],
          ],
          { access: "private" },
        ),
      ],
    ).plan(start, target).status,
    "unavailable",
  );
  assert.equal(
    new MapNavigator(
      () => true,
      [
        way(
          [
            [150, 150],
            [350, 150],
          ],
          { foot: "no" },
        ),
      ],
    ).plan(start, target).status,
    "unavailable",
  );
  const nav = new MapNavigator(
    () => true,
    [
      way(
        [
          [150, 150],
          [350, 150],
        ],
        { access: "private", foot: "yes" },
      ),
    ],
  );
  const route = nav.plan(start, target);
  assert.equal(route.status, "route");
  assert.equal(route.distance, 80);
  assert.deepEqual(route.points, [start, target]);
});

test("cache progress preserves the checked perpendicular connector instead of cutting a blocked corner", () => {
  const start = { x: 200, z: 150 },
    corner = { x: 200, z: 220 },
    target = { x: 280, z: 220 };
  const allowed = (a: MapPoint, b: MapPoint) =>
    Math.abs(a.x - b.x) < 1e-8 || Math.abs(a.z - b.z) < 1e-8;
  const nav = new MapNavigator(allowed, [
    way([
      [200, 150],
      [200, 220],
      [280, 220],
    ]),
  ]);
  const route = nav.plan(start, target);
  assert.equal(route.status, "route");
  const searches = nav.searches;
  const progressed = nav.plan({ x: 202, z: 218 }, target);
  assert.equal(nav.searches, searches);
  assert.deepEqual(progressed.points.slice(0, 3), [
    { x: 202, z: 218 },
    { x: 200, z: 218 },
    corner,
  ]);
  for (let i = 1; i < progressed.points.length; i++)
    assert.ok(
      allowed(progressed.points[i - 1], progressed.points[i]),
      "returned segment was never validated",
    );
});

test("both maps reuse one result, stationary draws perform no collision/search work, and map rotation preserves route positions", () => {
  const start = { x: 200, z: 150 },
    target = { x: 280, z: 150 };
  let calls = 0;
  const nav = new MapNavigator(() => {
    calls++;
    return true;
  }, [
    way([
      [150, 150],
      [350, 150],
    ]),
  ]);
  const route = nav.plan(start, target),
    searches = nav.searches,
    initialCalls = calls;
  for (let frame = 0; frame < 600; frame++)
    assert.equal(nav.plan({ ...start }, target), route);
  assert.equal(nav.searches, searches);
  assert.equal(calls, initialCalls);
  assert.equal(nav.cacheHits, 600);
  const progressed = nav.plan({ x: 205, z: 150 }, target);
  assert.equal(nav.searches, searches);
  assert.ok(progressed.distance < route.distance);
  for (const rotation of [0, Math.PI / 2, -Math.PI / 2, Math.PI])
    for (const p of progressed.points) {
      const camera = { x: 210, z: 170, scale: 3.7, rotation },
        size = { width: 420, height: 280 };
      assert.ok(
        d(p, screenToMap(mapToScreen(p, camera, size), camera, size)) < 1e-8,
      );
    }
  // Caller updates must not mutate a cached route's first point.
  start.x = 400;
  target.z = 300;
  assert.deepEqual(route.points[0], { x: 200, z: 150 });
  assert.deepEqual(route.endpoint, { x: 280, z: 150 });
});

test("static edge cache preserves direction when a slope or ledge is passable only one way", () => {
  const a = { x: 200, z: 150 },
    b = { x: 280, z: 220 };
  const clear = (from: MapPoint, to: MapPoint) =>
    (Math.abs(from.x - to.x) < 1e-8 || Math.abs(from.z - to.z) < 1e-8) &&
    to.x >= from.x;
  const nav = new MapNavigator(clear, [
    way([
      [200, 150],
      [200, 220],
      [280, 220],
    ]),
  ]);
  assert.equal(nav.plan(a, b).status, "route");
  assert.equal(
    nav.plan(b, a).status,
    "unavailable",
    "reverse edge must not borrow the forward clearance result",
  );
});

test("a mapped edge cannot cross the closed stadium even when a coarse collision predicate says clear", () => {
  const centre = STADIUM_PLAN.center,
    start = { x: -495, z: centre.z },
    target = { x: -105, z: centre.z };
  assert.ok(
    !isClosedStadiumInterior(start) && !isClosedStadiumInterior(target),
  );
  const nav = new MapNavigator(
    () => true,
    [
      way([
        [start.x, start.z],
        [target.x, target.z],
      ]),
    ],
  );
  assert.equal(nav.plan(start, target).status, "unavailable");
});

function manualScheduling() {
  let time = 0,
    id = 0;
  const queued = new Map<number, () => void>();
  const scheduling: NavigationScheduling = {
    now: () => time,
    defer: (callback) => {
      const key = ++id;
      queued.set(key, callback);
      return () => {
        queued.delete(key);
      };
    },
  };
  return {
    scheduling,
    queued,
    advance: (ms: number) => {
      time += ms;
    },
    flush: () => {
      let turns = 0;
      while (queued.size) {
        assert.ok(turns++ < 10000);
        const [key, callback] = queued.entries().next().value!;
        queued.delete(key);
        callback();
      }
    },
  };
}

test("cooperative planner shares pending work, yields bounded units, and finishes at the latest player position", async () => {
  const clock = manualScheduling();
  let queries = 0;
  const clear = Object.assign(
    () => {
      throw new Error("async must use the same yielding predicate");
    },
    {
      steps: function* () {
        for (let unit = 0; unit < 12; unit++) {
          queries++;
          clock.advance(0.6);
          yield;
        }
        return true;
      },
    },
  );
  const nav = new MapNavigator(clear, [], clock.scheduling);
  const target = { x: 220, z: 150 };
  const first = nav.planAsync({ x: 200, z: 150 }, target);
  assert.ok(
    clock.queued.size > 0,
    "work must still be pending after the first budget",
  );
  const second = nav.planAsync({ x: 201, z: 150 }, target);
  assert.equal(
    first,
    second,
    "mini and expanded map must share the same pending promise",
  );
  clock.flush();
  const result = await first;
  assert.equal(result.status, "route");
  assert.deepEqual(result.points[0], { x: 201, z: 150 });
  assert.equal(
    nav.searches,
    1,
    "moving during search should prune its result, not duplicate A*",
  );
  assert.ok(nav.chunkProfile.chunks > 1);
  assert.ok(
    nav.chunkProfile.maxChunkMs <= 3.61,
    "budget may overshoot by one indivisible 0.6ms work unit",
  );
  const before = queries;
  assert.equal(await nav.planAsync({ x: 201, z: 150 }, target), result);
  assert.equal(queries, before);
  nav.dispose();
});

test("superseding/cancelling/disposal stop stale work and no Rapier query runs after Game ownership ends", async () => {
  await initPhysics();
  const sim = new Simulation(),
    clock = manualScheduling();
  let queries = 0;
  const original = sim.world.castShape.bind(sim.world);
  sim.world.castShape = (...args: Parameters<typeof original>) => {
    queries++;
    clock.advance(0.8);
    return original(...args);
  };
  const nav = new MapNavigator(
    createNavigationClearance(sim),
    undefined,
    clock.scheduling,
  );
  const old = nav.planAsync(
    SPAWN,
    PLACES.find((p) => p.id === "b6")!,
  );
  assert.ok(clock.queued.size > 0 && queries > 0);
  const next = nav.planAsync(
    SPAWN,
    PLACES.find((p) => p.id === "rko")!,
  );
  assert.notEqual(old, next);
  assert.equal((await old).status, "unavailable");
  const staleCallbacks = [...clock.queued.values()];
  nav.dispose();
  nav.dispose();
  const stopped = queries;
  sim.dispose();
  for (const callback of staleCallbacks) callback();
  clock.flush();
  assert.equal((await next).status, "unavailable");
  assert.equal(queries, stopped);
  assert.equal(
    (await nav.planAsync(SPAWN, { x: 130, z: 12 })).status,
    "unavailable",
  );
  assert.equal(nav.plan(SPAWN, { x: 130, z: 12 }).status, "unavailable");
  assert.equal(queries, stopped);
});

test("async planning and synchronous draining produce identical production physics routes", async () => {
  await initPhysics();
  const sim = new Simulation();
  try {
    for (const id of ["sports", "rko", "b6", "stadium191a"]) {
      const sync = new MapNavigator(createNavigationClearance(sim)),
        asyncNav = new MapNavigator(createNavigationClearance(sim)),
        target = PLACES.find((p) => p.id === id)!;
      assert.deepEqual(
        await asyncNav.planAsync(SPAWN, target),
        sync.plan(SPAWN, target),
        id,
      );
      console.log(
        "Async navigation chunks",
        JSON.stringify({
          id,
          ...asyncNav.chunkProfile,
          clearanceChecks: asyncNav.clearanceChecks,
        }),
      );
      sync.dispose();
      asyncNav.dispose();
    }
  } finally {
    sim.dispose();
  }
});

function walkActor(sim: Simulation, actor: Actor, points: MapPoint[]) {
  let ticks = 0,
    maxVerticalChange = 0,
    previousY = actor.position.y;
  const step = (x = 0, z = 0) => {
    actor.step({ seq: ++ticks, x, z, yaw: 0, run: false, jump: false });
    stepRigidWorld(sim.world);
    maxVerticalChange = Math.max(
      maxVerticalChange,
      Math.abs(actor.position.y - previousY),
    );
    previousY = actor.position.y;
    assert.ok(Object.values(actor.position).every(Number.isFinite));
    assert.ok(!isClosedStadiumInterior(actor.position));
  };
  for (let i = 0; i < 90; i++) step();
  const segments = [];
  for (const point of points.slice(1)) {
    const start = { ...actor.position },
      limit = Math.ceil(d(start, point) / 4.6 / FIXED_DT) + 180;
    let count = 0,
      remaining = d(start, point);
    for (; count < limit; count++) {
      const p = actor.position,
        dx = point.x - p.x,
        dz = point.z - p.z;
      remaining = Math.hypot(dx, dz);
      if (remaining < 0.1) break;
      const fraction = Math.min(1, remaining / (4.6 * FIXED_DT));
      step((dx / remaining) * fraction, (dz / remaining) * fraction);
    }
    segments.push({ point, ticks: count, remaining });
    if (remaining >= 0.1) break;
  }
  return {
    ticks,
    maxVerticalChange,
    segments,
    completed:
      segments.length === points.length - 1 &&
      segments.every((s) => s.remaining < 0.1),
    end: { ...actor.position },
  };
}

test("production KCC walks SPAWN to sports, Rko, B6 exterior, Stadion191A and an arbitrary waypoint without teleporting", async () => {
  await initPhysics();
  const reports = [];
  const sim = new Simulation();
  const destinations = [
    ...["sports", "rko", "b6", "stadium191a"].map((id) => ({
      id,
      target: PLACES.find((p) => p.id === id)!,
    })),
    { id: "arbitrary waypoint", target: { x: SPAWN.x + 8, z: SPAWN.z - 6 } },
  ];
  try {
    for (const { id, target } of destinations) {
      const nav = new MapNavigator(createNavigationClearance(sim));
      const started = performance.now(),
        route = nav.plan(SPAWN, target),
        planMs = performance.now() - started;
      assert.equal(route.status, "route", id);
      assert.ok(route.points.every((p) => !isClosedStadiumInterior(p)));
      const actor = sim.add("navigation-KCC");
      const result = walkActor(sim, actor, route.points);
      assert.ok(result.completed, `${id} failed: ${JSON.stringify(result)}`);
      assert.ok(d(actor.position, route.endpoint) < 0.1);
      if (route.toEntrance)
        assert.ok(
          !BUILDINGS.some((b) => insideMapPolygon(route.endpoint, b.points)),
          "do not advertise an unfinished interior",
        );
      reports.push({
        id,
        distance: route.distance,
        planMs,
        searches: nav.searches,
        graphSearches: nav.graphSearches,
        clearanceChecks: nav.clearanceChecks,
        ...result,
      });
      nav.dispose();
      sim.remove("navigation-KCC");
    }
  } finally {
    sim.dispose();
  }
  console.log("Map navigation actual KCC audit", JSON.stringify(reports));
});

async function synthetic(
  kind: "headroom" | "corridor" | "step" | "slope",
  value: number,
) {
  await initPhysics();
  const world = new RAPIER.World({ x: 0, y: -18, z: 0 }),
    groundColliders = new Set<number>();
  world.timestep = FIXED_DT;
  const ground = (desc: RAPIER.ColliderDesc) => {
    const c = world.createCollider(desc);
    groundColliders.add(c.handle);
  };
  if (kind === "slope") {
    const angle = -Math.atan(value);
    ground(
      RAPIER.ColliderDesc.cuboid(5, 0.1, 8)
        .setTranslation(0, -0.1 / Math.cos(angle), 0)
        .setRotation({
          x: Math.sin(angle / 2),
          y: 0,
          z: 0,
          w: Math.cos(angle / 2),
        }),
    );
  } else
    ground(RAPIER.ColliderDesc.cuboid(10, 0.1, 10).setTranslation(0, -0.1, 0));
  if (kind === "headroom")
    world.createCollider(
      RAPIER.ColliderDesc.cuboid(3, 0.1, 0.5).setTranslation(0, value + 0.1, 0),
    );
  if (kind === "corridor")
    for (const side of [-1, 1])
      world.createCollider(
        RAPIER.ColliderDesc.cuboid(1, 1, 0.5).setTranslation(
          side * (value / 2 + 1),
          1,
          0,
        ),
      );
  if (kind === "step")
    ground(
      RAPIER.ColliderDesc.cuboid(5, value / 2, 5).setTranslation(
        0,
        value / 2,
        5,
      ),
    );
  const sim = {
    world,
    walkingColliders: new Set<number>(),
    groundColliders,
    surfaceHeight: (_x: number, z: number) =>
      kind === "step" ? (z >= 0 ? value : 0) : kind === "slope" ? z * value : 0,
    car: {
      body: world.createRigidBody(
        RAPIER.RigidBodyDesc.fixed().setTranslation(100, 0, 100),
      ),
    },
  } as unknown as Simulation;
  stepRigidWorld(world);
  const start = { x: 0, z: -2 },
    end = { x: 0, z: 2 };
  const clear = createNavigationClearance(sim)(start, end);
  const actor = new Actor(sim, "synthetic-real-KCC", {
    ...start,
    y: sim.surfaceHeight(start.x, start.z) + 1,
  });
  const walked = walkActor(sim, actor, [start, end]);
  world.free();
  return { clear, walked };
}

test("clearance envelope follows the actual character width, height and stair allowance", () => {
  const nav = NAVIGATION_CLEARANCE;
  assert.ok(
    Math.abs(nav.radius + nav.contactMargin - CHARACTER_RADIUS - 0.02) < 1e-10,
  );
  assert.ok(
    Math.abs(
      nav.centreHeight +
        nav.halfHeight +
        nav.radius +
        nav.contactMargin -
        (2 * (CHARACTER_HALF_HEIGHT + CHARACTER_RADIUS) + 0.02),
    ) < 1e-10,
  );
  assert.ok(
    Math.abs(
      nav.centreHeight -
        nav.halfHeight -
        nav.radius -
        nav.contactMargin -
        nav.maximumStepUp,
    ) < 1e-10,
  );
});

test("clearance agrees with actual KCC on representative headroom, capsule margin, ledges and slopes", async () => {
  const width = 2 * (CHARACTER_RADIUS + 0.02);
  const height = 2 * (CHARACTER_HALF_HEIGHT + CHARACTER_RADIUS) + 0.02;
  for (const [kind, value, expected] of [
    ["headroom", 1.55, false],
    ["headroom", height - 0.02, false],
    ["headroom", height + 0.02, true],
    ["headroom", 1.9, true],
    ["corridor", width - 0.02, false],
    ["corridor", width + 0.02, true],
    ["corridor", 0.7, true],
    ["corridor", 0.87, true],
    ["corridor", 0.94, true],
    ["step", 0.35, false],
    ["step", 0.15, true],
    ["slope", 1.25, false],
    ["slope", 0.12, true],
  ] as const) {
    const result = await synthetic(kind, value);
    assert.equal(
      result.walked.completed,
      expected,
      `real KCC ${kind} ${value}: ${JSON.stringify(result.walked)}`,
    );
    assert.equal(result.clear, expected, `planner ${kind} ${value}`);
  }
});
