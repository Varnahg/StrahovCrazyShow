import test from "node:test";
import assert from "node:assert/strict";
import RAPIER from "@dimforge/rapier3d-compat";
import {
  buildLandmarkPlan,
  STADIUM_PLAN,
  STADIUM_CLOSED_BOUNDARY,
  isClosedStadiumInterior,
  STADIUM_INTERIOR_CLOSED,
} from "../shared/landmark-reality";
import { pointInsideStadiumBoundary } from "../shared/stadium-exterior";
import { groundHeight } from "../shared/terrain";
import { Simulation, initPhysics } from "../shared/simulation";
const plan = buildLandmarkPlan();
await initPhysics();
function addClosure(world: RAPIER.World) {
  const data = plan.twoSidedExteriorCollision;
  world.createCollider(
    RAPIER.ColliderDesc.trimesh(
      new Float32Array(data.positions),
      new Uint32Array(data.indices),
      RAPIER.TriMeshFlags.FIX_INTERNAL_EDGES_TWO_SIDED,
    ),
  );
}

test("closed stadium boundary follows the source outline behind exterior paths and preserves the open field", () => {
  assert.equal(STADIUM_INTERIOR_CLOSED, true);
  assert.deepEqual(plan.stadium.access.points, STADIUM_CLOSED_BOUNDARY);
  assert.equal(isClosedStadiumInterior(STADIUM_PLAN.center), true);
  for (const point of STADIUM_CLOSED_BOUNDARY)
    assert.ok(
      pointInsideStadiumBoundary(
        { x: point[0], z: point[1] },
        STADIUM_PLAN.outer,
      ),
    );
  for (const [x, z] of STADIUM_CLOSED_BOUNDARY)
    assert.equal(
      pointInsideStadiumBoundary({ x, z }, STADIUM_PLAN.inner),
      false,
      "closure must stay outside the source field void",
    );
  for (const z of [-135, -50, 17.522, 80, 170])
    assert.equal(
      isClosedStadiumInterior({ x: -130, z }),
      false,
      "Vanickova pavement remains outside the closure",
    );
  for (const panel of plan.stadium.access.panels) {
    assert.ok(panel.top - groundHeight(panel.x, panel.z) >= 3.2 - 1e-9);
    assert.ok(panel.bottom < groundHeight(panel.x, panel.z));
  }
  const rendered = plan.parts.find(
    (p) =>
      p.group === "stadium" &&
      p.material === "stadium-soffit" &&
      p.lod === "both",
  )!;
  const collision = plan.twoSidedExteriorCollision,
    access = plan.stadium.access;
  assert.equal(access.renderIndexCount, collision.indices.length);
  assert.equal(collision.indices.length / 3, access.panels.length * 2);
  for (let i = 0; i < collision.indices.length; i++) {
    const a = rendered.indices[access.renderIndexStart + i],
      b = collision.indices[i];
    assert.deepEqual(
      rendered.positions.slice(a * 3, a * 3 + 3),
      collision.positions.slice(b * 3, b * 3 + 3),
      "every visible closure triangle is the physical triangle",
    );
  }
  assert.equal(plan.stadium.tower.osmId, "456174850");
  assert.equal(plan.stadium.tower.height, 38);
  const world = new RAPIER.World({ x: 0, y: 0, z: 0 });
  try {
    world.createCollider(
      RAPIER.ColliderDesc.trimesh(
        new Float32Array(plan.collision.positions),
        new Uint32Array(plan.collision.indices),
        RAPIER.TriMeshFlags.FIX_INTERNAL_EDGES,
      ),
    );
    addClosure(world);
    world.step();
    assert.equal(
      world.castRay(
        new RAPIER.Ray(
          { ...STADIUM_PLAN.center, y: 60 },
          { x: 0, y: -1, z: 0 },
        ),
        60,
        true,
      ),
      null,
      "no flat roof or invisible cap across the open field",
    );
  } finally {
    world.free();
  }
});

test("every closure panel and seam blocks a capsule at walking and jumping heights", () => {
  const world = new RAPIER.World({ x: 0, y: 0, z: 0 });
  try {
    world.createCollider(
      RAPIER.ColliderDesc.trimesh(
        new Float32Array(plan.collision.positions),
        new Uint32Array(plan.collision.indices),
        RAPIER.TriMeshFlags.FIX_INTERNAL_EDGES,
      ),
    );
    addClosure(world);
    world.step();
    for (const panel of plan.stadium.access.panels) {
      const tx = Math.cos(panel.yaw),
        tz = -Math.sin(panel.yaw),
        nx = -tz,
        nz = tx;
      for (const along of [0, Math.max(0, panel.w / 2 - 0.11)])
        for (const height of [0.82, 2.8]) {
          const x = panel.x + tx * along,
            z = panel.z + tz * along,
            y = groundHeight(x, z) + height;
          const hit = world.castShape(
            { x: x + nx * 2, y, z: z + nz * 2 },
            { x: 0, y: 0, z: 0, w: 1 },
            { x: -nx, y: 0, z: -nz },
            new RAPIER.Capsule(0.38, 0.42),
            0.01,
            4,
            true,
          );
          assert.ok(
            hit,
            `open seam at edge ${panel.edge}, x${x}, z${z}, height${height}`,
          );
        }
    }
  } finally {
    world.free();
  }
});

test("actual CCD car cannot drive through the former east portal and a jumping walker cannot bypass it", () => {
  const sim = new Simulation(),
    z = 17.522;
  const idle = { x: 0, z: 0, yaw: 0, jump: false, seq: 0 };
  try {
    sim.car.reset(
      { x: -134, y: groundHeight(-134, z) - 0.0112, z },
      -Math.PI / 2,
    );
    sim.car.unpark("attack");
    sim.car.body.setLinvel({ x: -15, y: 0, z: 0 }, true);
    let closure: RAPIER.Collider | undefined;
    sim.world.forEachCollider((c) => {
      const s = c.shape;
      if (
        s instanceof RAPIER.TriMesh &&
        s.indices.length === plan.twoSidedExteriorCollision.indices.length &&
        s.vertices.length === plan.twoSidedExteriorCollision.positions.length
      )
        closure = c;
    });
    assert.ok(closure);
    let minimumX = Infinity,
      closureContacts = 0;
    for (let i = 0; i < 120; i++) {
      sim.tick(0);
      minimumX = Math.min(minimumX, sim.car.position.x);
      assert.equal(
        isClosedStadiumInterior(sim.car.position),
        false,
        "chassis center crossed closure during CCD step",
      );
      sim.world.contactPair(sim.car.collider, closure, (manifold) => {
        if (manifold.numContacts() > 0) closureContacts++;
      });
    }
    assert.equal(isClosedStadiumInterior(sim.car.position), false);
    assert.ok(
      minimumX < -140 && closureContacts > 0,
      `chassis did not contact actual closure: minX ${minimumX}, contacts ${closureContacts}`,
    );
    sim.car.recover();
    const actor = sim.add("walker", {
      x: -136,
      y: groundHeight(-136, z) + 1,
      z,
    });
    for (let i = 0; i < 300; i++) {
      actor.step({ ...idle, x: -1, jump: i % 55 === 0 });
      sim.tick(0);
      assert.equal(
        isClosedStadiumInterior(actor.position),
        false,
        "jump entered the closure polygon",
      );
    }
    assert.ok(actor.position.x < -140 && actor.position.x > -145);
  } finally {
    sim.dispose();
  }
});

test("actual walker can still follow the outside Vanickova pavement past the pavilion", () => {
  const sim = new Simulation(),
    start = { x: -130, z: 6 };
  const actor = sim.add("outside", {
      ...start,
      y: groundHeight(start.x, start.z) + 1,
    }),
    idle = { x: 0, z: 0, yaw: 0, jump: false, seq: 0 };
  try {
    for (let i = 0; i < 30; i++) {
      actor.step(idle);
      sim.tick(0);
    }
    for (let i = 0; i < 330; i++) {
      actor.step({ ...idle, z: 1 });
      sim.tick(0);
      assert.equal(isClosedStadiumInterior(actor.position), false);
    }
    assert.ok(
      actor.position.z > 30,
      `outside route stopped at ${JSON.stringify(actor.position)}`,
    );
    assert.ok(Math.abs(actor.position.x - start.x) < 0.1);
  } finally {
    sim.dispose();
  }
});
