import { test } from "node:test";
import assert from "node:assert/strict";
import RAPIER from "@dimforge/rapier3d-compat";
import {
  Simulation,
  initPhysics,
  CHARACTER_HALF_HEIGHT,
  CHARACTER_RADIUS,
  type Actor,
} from "../shared/simulation";
import { BOUNDS, BUILDINGS, B6_BOXES } from "../shared/world";
import { groundHeight, groundNormal } from "../shared/terrain";
import {
  B6_LAYOUT,
  B6_ROOM_AREAS,
  b6EntranceHeight,
  B6_STAIR_CORES,
  b6StairRoute,
} from "../shared/b6-interior";
await initPhysics();
const idle = { x: 0, z: 0, yaw: 0, jump: false, seq: 0 };
const height = CHARACTER_HALF_HEIGHT + CHARACTER_RADIUS;
const foundation = B6_LAYOUT.foundationOffset;
/** Fixed world instant isolates physics assertions from changing traffic schedules. */
const tick = (sim: Simulation) => sim.tick(0);
function settle(sim: Simulation, actor: Actor, count = 45) {
  for (let i = 0; i < count; i++) {
    actor.step(idle);
    tick(sim);
  }
}
function forbidFallback(actor: Actor) {
  actor.setPosition = () =>
    assert.fail(
      "Continuous physics may not teleport or use the fall-recovery guard",
    );
}
function contains(points: [number, number][], x: number, z: number) {
  let result = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const a = points[i],
      b = points[j];
    if (
      a[1] > z !== b[1] > z &&
      x < ((b[0] - a[0]) * (z - a[1])) / (b[1] - a[1]) + a[0]
    )
      result = !result;
  }
  return result;
}
function nearEdge(
  points: [number, number][],
  x: number,
  z: number,
  margin = 1,
) {
  return points.some((b, i) => {
    if (!i) return false;
    const a = points[i - 1],
      dx = b[0] - a[0],
      dz = b[1] - a[1],
      t = Math.max(
        0,
        Math.min(
          1,
          ((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz || 1),
        ),
      );
    return Math.hypot(x - a[0] - t * dx, z - a[1] - t * dz) < margin;
  });
}
function walkTo(
  sim: Simulation,
  actor: Actor,
  x: number,
  z: number,
  limit = 600,
) {
  for (let i = 0; i < limit; i++) {
    const p = actor.position,
      dx = x - p.x,
      dz = z - p.z,
      d = Math.hypot(dx, dz);
    if (d < 0.13) return;
    actor.step({ ...idle, x: dx / d, z: dz / d });
    tick(sim);
    assert.ok(Number.isFinite(actor.position.y));
  }
  assert.fail(`Blocked before ${x},${z}: ${JSON.stringify(actor.position)}`);
}

test("sampled accessible outdoor ground follows actual DEM heights without holes or fallback teleports", () => {
  const sim = new Simulation(),
    a = sim.add("outdoor-probe"),
    place = a.setPosition.bind(a);
  forbidFallback(a);
  tick(sim);
  let checked = 0,
    belowOldZero = 0,
    slopes = 0;
  for (let x = BOUNDS.minX + 2; x < BOUNDS.maxX; x += 11)
    for (let z = BOUNDS.minZ + 2; z < BOUNDS.maxZ; z += 11) {
      if (
        BUILDINGS.some(
          (b) => contains(b.points, x, z) || nearEdge(b.points, x, z),
        )
      )
        continue;
      if (x > -13 && x < 21 && z > -97 && z < -15) continue;
      const ground = groundHeight(x, z),
        initial = { x, y: ground + 1, z };
      const obstruction = sim.world.intersectionWithShape(
        initial,
        { x: 0, y: 0, z: 0, w: 1 },
        new RAPIER.Capsule(CHARACTER_HALF_HEIGHT, CHARACTER_RADIUS),
        undefined,
        undefined,
        a.collider,
        a.body,
        (c) => !sim.groundColliders.has(c.handle),
      );
      if (obstruction) continue;
      place(initial);
      // From ground+1, a valid .82m support is reached in about 9 ticks.
      // Eighteen ticks gives a second settling interval; unsupported gravity
      // would already lower the centre by .855m, failing the same clearance.
      settle(sim, a, 18);
      const p = a.position,
        normal = groundNormal(p.x, p.z),
        clearance = p.y - groundHeight(p.x, p.z);
      assert.ok(
        clearance >= height - 0.035,
        `ground penetration at ${x},${z}: clearance=${clearance}, pose=${JSON.stringify(p)}`,
      );
      assert.ok(
        clearance <
          CHARACTER_HALF_HEIGHT +
            CHARACTER_RADIUS / Math.max(0.15, normal.y) +
            0.25,
        `unexpected hover at ${x},${z}: ${clearance}`,
      );
      assert.ok(
        Math.hypot(p.x - x, p.z - z) < 2,
        `unexpected relocation at ${x},${z}`,
      );
      checked++;
      if (p.y < 0) belowOldZero++;
      if (normal.y < 0.99) slopes++;
    }
  assert.ok(checked > 900, `only ${checked} outdoor probes`);
  assert.ok(belowOldZero > 300);
  assert.ok(slopes > 50);
  console.log("DEM outdoor coverage", { checked, belowOldZero, slopes });
  sim.dispose();
});

test("walking and the actual driven chassis approach but cannot tunnel through a solid wall", () => {
  const sim = new Simulation(),
    wallZ = -24,
    wallY = groundHeight(22, wallZ);
  sim.solid(22, wallY + 1, wallZ, 30, 6, 0.4);
  tick(sim);
  const a = sim.add("wall-probe", {
    x: 22,
    y: groundHeight(22, -14) + 1,
    z: -14,
  });
  forbidFallback(a);
  for (let i = 0; i < 200; i++) {
    a.step({ ...idle, z: -1 });
    tick(sim);
    assert.ok(a.position.z > wallZ + 0.25);
  }
  assert.ok(a.position.z < -20, "walker must actually approach the wall");
  sim.car.park();
  sim.car.reset({ x: 22, y: groundHeight(22, -14) - 0.0112, z: -14 }, Math.PI);
  a.setVehicle(true);
  let maxSpeed = 0,
    minZ = -14;
  for (let i = 0; i < 280; i++) {
    a.step({ ...idle, z: 1 });
    tick(sim);
    maxSpeed = Math.max(maxSpeed, Math.abs(a.speed));
    minZ = Math.min(minZ, a.position.z);
    assert.ok(
      a.position.z > wallZ + 0.25,
      `vehicle tunneled to ${a.position.z}`,
    );
  }
  assert.ok(maxSpeed > 2, `vehicle never drove: ${maxSpeed}`);
  assert.ok(
    minZ < -18,
    "vehicle must drive toward the wall, not away or remain parked",
  );
  sim.dispose();
});

test("terrain-relative outer barriers retain walkers and the car below the old absolute fall threshold", () => {
  const sim = new Simulation(),
    a = sim.add("boundary-probe", {
      x: BOUNDS.maxX - 3,
      y: groundHeight(BOUNDS.maxX - 3, 126) + 1,
      z: 126,
    });
  forbidFallback(a);
  settle(sim, a, 60);
  assert.ok(
    a.position.y < -8,
    "fixture must exercise real ground below the obsolete absolute -8 limit",
  );
  for (let i = 0; i < 180; i++) {
    a.step({ ...idle, x: 1 });
    tick(sim);
    assert.ok(a.position.x < BOUNDS.maxX + 0.5);
  }
  assert.ok(
    a.position.x > BOUNDS.maxX - 2.2,
    "walker must reach the real barrier",
  );
  sim.car.park();
  sim.car.reset(
    {
      x: BOUNDS.maxX - 8,
      y: groundHeight(BOUNDS.maxX - 8, 115) - 0.0112,
      z: 115,
    },
    Math.PI / 2,
  );
  a.setVehicle(true);
  let maximum = sim.car.position.x;
  for (let i = 0; i < 300; i++) {
    a.step({ ...idle, z: 1 });
    tick(sim);
    maximum = Math.max(maximum, a.position.x);
    assert.ok(
      a.position.x < BOUNDS.maxX + 0.5,
      `car escaped the sloping boundary: ${JSON.stringify(a.position)}`,
    );
  }
  assert.ok(maximum > BOUNDS.maxX - 5, "driven car must approach the boundary");
  sim.dispose();
});

test("B6 exterior north twelve-step entry and first-floor route are continuously walkable without teleporting", () => {
  const sim = new Simulation(),
    a = sim.add("entrance-probe", {
      ...B6_LAYOUT.outsideSpawn,
      y: groundHeight(B6_LAYOUT.outsideSpawn.x, B6_LAYOUT.outsideSpawn.z) + 1,
    });
  forbidFallback(a);
  settle(sim, a);
  for (const [x, z] of [...B6_LAYOUT.approachRoute, ...B6_LAYOUT.serviceRoute]) {
    walkTo(sim, a, x, z);
    const p = a.position,
      expectedFoot =
        b6EntranceHeight(p.x, p.z) ??
        (p.x < B6_LAYOUT.lobby.maxX && p.z < B6_LAYOUT.lobby.minZ ? groundHeight(p.x, p.z) : foundation);
    assert.ok(
      p.y >= expectedFoot + height - 0.04,
      `unsupported entry/stair route at ${x},${z}: ${JSON.stringify(p)}`,
    );
  }
  assert.ok(
    Math.abs(a.position.y - (foundation + 3 + height + 0.02)) < 0.04,
    `first-floor landing not reached: ${JSON.stringify(a.position)}`,
  );
  sim.dispose();
});

test("every catalogued B6 room has a supported doorway approach and passage into that actual room", () => {
  const sim = new Simulation(),
    a = sim.add("door-probe"),
    place = a.setPosition.bind(a),
    failures = [];
  forbidFallback(a);
  for (const room of B6_ROOM_AREAS.filter((r) => r.level >= 0)) {
    const floor = foundation + room.level * 3,
      sign = room.side === "west" ? -1 : 1;
    place({ x: room.door.x - sign * 0.8, y: floor + 1, z: room.door.z });
    settle(sim, a, 18);
    const targetX = room.door.x + sign * 1.05;
    let reached = false;
    for (let i = 0; i < 90; i++) {
      if (Math.abs(a.position.x - targetX) < 0.13) {
        reached = true;
        break;
      }
      a.step({ ...idle, x: sign });
      tick(sim);
    }
    if (!reached || Math.abs(a.position.y - (floor + height + 0.02)) > 0.05)
      failures.push({
        room: room.id,
        target: { x: targetX, z: room.door.z },
        position: { ...a.position },
        reached,
      });
  }
  assert.deepEqual(
    failures,
    [],
    `Actual door routes failed (${failures.length}): ${JSON.stringify(failures.slice(0, 12))}`,
  );
  sim.dispose();
});

test("B6 catalogued room floors, basement and every stair flight remain supported at the raised foundation", () => {
  const sim = new Simulation(),
    a = sim.add("floor-probe"),
    place = a.setPosition.bind(a);
  forbidFallback(a);
  for (const room of B6_ROOM_AREAS) {
    const floor = foundation + room.level * 3,
      sign = room.side === "west" ? -1 : 1;
    place({ x: room.door.x + sign * 0.9, y: floor + 1, z: room.door.z });
    settle(sim, a, 30);
    assert.ok(
      Math.abs(a.position.y - (floor + height + 0.02)) < 0.05,
      `unsupported ${room.id}: ${JSON.stringify(a.position)}`,
    );
  }
  for (const core of B6_STAIR_CORES)
    for (let level = -1; level < 5; level++) {
      const route=b6StairRoute(core.id);
      place({x:route[0][0],y:foundation+level*3+0.85,z:route[0][1]});
      for(const [x,z] of route) walkTo(sim,a,x,z,220);
      assert.ok(
        Math.abs(a.position.y - (foundation + (level + 1) * 3 + height + 0.02)) < 0.06,
        `blocked ${core.id} dogleg from ${level}: ${JSON.stringify(a.position)}`,
      );
    }
  sim.dispose();
});

test("B6 real glass collider prevents a window exit above furniture and roof stops a genuine jump", () => {
  const sim = new Simulation(),
    room = B6_ROOM_AREAS.find(
      (r) =>
        r.side === "east" &&
        r.level === 2 &&
        r.kind === "bedroom" &&
        r.index === 10,
    )!;
  const floor = foundation + room.level * 3,
    a = sim.add("window-probe", { x: 15.2, y: floor + 1.75, z: room.door.z }),
    place = a.setPosition.bind(a);
  forbidFallback(a);
  tick(sim);
  const hit = sim.world.castRay(
    new RAPIER.Ray(
      { x: 15, y: floor + 1.6, z: room.door.z },
      { x: 1, y: 0, z: 0 },
    ),
    3,
    true,
    undefined,
    undefined,
    a.collider,
    a.body,
  );
  assert.ok(hit, "window-height ray must meet the glass");
  assert.ok(
    hit.collider.halfExtents()!.x < 0.1,
    "the collision at window height must be the thin glass, not an opaque backing wall",
  );
  for (let i = 0; i < 150; i++) {
    a.step({ ...idle, x: 1, jump: i === 30 });
    tick(sim);
    assert.ok(
      a.position.x < 15.7,
      `escaped window ${JSON.stringify(a.position)}`,
    );
  }
  const topRoom = B6_ROOM_AREAS.find(
    (r) =>
      r.side === "east" &&
      r.level === 5 &&
      r.kind === "bedroom" &&
      r.index === 10,
  )!;
  const topFloor = foundation + topRoom.level * 3;
  place({ x: 10.9, y: topFloor + 1, z: topRoom.door.z });
  settle(sim, a);
  let maxY = a.position.y;
  for (let i = 0; i < 100; i++) {
    a.step({ ...idle, jump: i === 0 });
    tick(sim);
    maxY = Math.max(maxY, a.position.y);
  }
  const roof = B6_BOXES.find(
    (b) => b.kind === "floor" && b.level === 6 && b.x === 8,
  )!;
  assert.ok(maxY > topFloor + 1.3, "roof test must actually jump");
  assert.ok(
    maxY + height <= foundation + roof.y - roof.h / 2 + 0.025,
    `head crossed roof: ${maxY + height}`,
  );
  const camera = sim.cameraDistance(
    { x: 8, y: foundation + 1.5, z: -45 },
    { x: 25, y: foundation + 1.5, z: -45 },
    a,
  );
  assert.ok(camera < 8, "camera sweep must stop before B6 exterior");
  sim.dispose();
});
