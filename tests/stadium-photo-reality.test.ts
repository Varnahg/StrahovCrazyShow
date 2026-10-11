import test from "node:test";
import assert from "node:assert/strict";
import RAPIER from "@dimforge/rapier3d-compat";
import {
  buildLandmarkPlan,
  STADIUM_EAST_PAVILION,
  STADIUM_PLAN,
  isClosedStadiumInterior,
} from "../shared/landmark-reality";
import { groundHeight, buildingBaseHeight } from "../shared/terrain";
import {
  Simulation,
  initPhysics,
  CHARACTER_HALF_HEIGHT,
  CHARACTER_RADIUS,
} from "../shared/simulation";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { buildLandmarkReality } from "../client/landmark-reality";

const plan = buildLandmarkPlan(),
  source = STADIUM_EAST_PAVILION,
  pavilion = plan.stadium.east;

test("photo-correct east pavilion preserves the OSM outline and owns its actual DEM base", () => {
  const actual = STADIUM_PLAN.parts.find((p) => p.osmId === "480849465")!;
  assert.deepEqual(source.footprint, actual.points);
  assert.equal(source.osmHeight, 20);
  assert.equal(source.height, 24);
  assert.match(source.heightProvenance, /IPR2023/);
  assert(
    Math.abs(
      pavilion.baseY - buildingBaseHeight(actual.points as [number, number][]),
    ) < 1e-9,
  );
  assert(
    Math.abs(pavilion.baseY - plan.stadium.baseY) > 2.5,
    "must not inherit the higher western stadium hillside",
  );
  assert(pavilion.frontageMetres > 125 && pavilion.frontageMetres < 128);
  assert.equal(pavilion.stairFlights, 2);
  assert.equal(pavilion.stairStepsPerFlight, 28);
});

test("east curtain wall has unequal horizontal rows, a broad opaque band and narrow clerestory, with separately authored far geometry", () => {
  const near = plan.parts.find(
      (p) =>
        p.group === "stadium" &&
        p.material === "stadium-glass" &&
        p.lod === "near",
    )!,
    far = plan.parts.find(
      (p) =>
        p.group === "stadium" &&
        p.material === "stadium-glass" &&
        p.lod === "far",
    )!;
  assert(near && far);
  const heights = near.positions
    .filter((_, i) => i % 3 === 1)
    .map((y) => y - pavilion.baseY);
  assert(heights.every((y) => y >= source.cantileverSoffitY + 0.24 - 1e-6));
  assert(
    heights.every(
      (y) =>
        y <= source.principalGlassTopY + 0.01 ||
        y >= source.upperGlassBottomY - 0.01,
    ),
    "the photographed broad concrete band cannot become another glass storey",
  );
  assert(near.colors && near.colors.length === (near.positions.length / 3) * 4);
  assert(near.colors.every(Number.isFinite));
  assert(far.indices.length < near.indices.length / 10);
  assert(pavilion.glazingBays >= 49 && pavilion.glazingBays <= 51);
  assert(plan.parts.some((p) => p.material === "stadium-cladding"));
  assert(plan.parts.some((p) => p.material === "stadium-soffit"));
  assert(
    plan.parts.some((p) => p.material === "stadium-rail" && p.lod === "near"),
  );
});

test("recessed pavilion piers retain the visible covered portal with an explicit pilot closure behind it", async () => {
  await initPhysics();
  const world = new RAPIER.World({ x: 0, y: 0, z: 0 }),
    data = plan.collision;
  world.createCollider(
    RAPIER.ColliderDesc.trimesh(
      new Float32Array(data.positions),
      new Uint32Array(data.indices),
      RAPIER.TriMeshFlags.FIX_INTERNAL_EDGES,
    ),
  );
  world.createCollider(
    RAPIER.ColliderDesc.trimesh(
      new Float32Array(plan.twoSidedExteriorCollision.positions),
      new Uint32Array(plan.twoSidedExteriorCollision.indices),
      RAPIER.TriMeshFlags.FIX_INTERNAL_EDGES_TWO_SIDED,
    ),
  );
  world.step();
  try {
    const from = {
        x: -130,
        y: groundHeight(-130, source.coveredPortalZ) + 1.0,
        z: source.coveredPortalZ,
      },
      to = { x: -165, y: groundHeight(-165, 18.1) + 1, z: 18.1 },
      length = Math.hypot(to.x - from.x, to.y - from.y, to.z - from.z);
    const hit = world.castShape(
      from,
      { x: 0, y: 0, z: 0, w: 1 },
      {
        x: (to.x - from.x) / length,
        y: (to.y - from.y) / length,
        z: (to.z - from.z) / length,
      },
      new RAPIER.Ball(0.42),
      0.01,
      length,
      true,
    );
    assert.ok(
      hit,
      "the existing source portal is physically closed for the exterior-only pilot",
    );
    assert.ok(
      hit.time_of_impact > 10,
      "closure must stand behind the photographed outer piers, not across the street",
    );
    const piers = plan.boxes.filter(
      (b) =>
        b.group === "stadium" &&
        b.material === "concrete" &&
        Math.abs(b.w - 0.67) < 1e-9 &&
        Math.abs(b.d - 0.8) < 1e-9,
    );
    assert.equal(piers.length, pavilion.columns);
    assert(
      piers.every(
        (p) =>
          Math.abs(p.z - source.coveredPortalZ) > source.portalClearWidth / 2,
      ),
    );
    assert(piers.length >= 16);
  } finally {
    world.free();
  }
});

test("actual production KCC approaches the east covered portal but cannot enter the closed stadium", async () => {
  await initPhysics();
  const sim = new Simulation(),
    start = {
      x: -130,
      y: groundHeight(-130, source.coveredPortalZ) + 1,
      z: source.coveredPortalZ,
    },
    actor = sim.add("stadium-undercroft", start),
    idle = { x: 0, z: 0, yaw: 0, jump: false, seq: 0 };
  actor.setPosition = () =>
    assert.fail("undercroft traversal may not teleport or fall-recover");
  let moved = 0,
    last = actor.position;
  try {
    for (let i = 0; i < 35; i++) {
      actor.step(idle);
      sim.tick(0);
    }
    for (let i = 0; i < 470; i++) {
      const p = actor.position,
        target = { x: -165, z: 18.1 },
        dx = target.x - p.x,
        dz = target.z - p.z,
        d = Math.hypot(dx, dz);
      if (d < 0.15) break;
      actor.step({ ...idle, x: dx / d, z: dz / d });
      sim.tick(0);
      const actual = actor.position,
        step = Math.hypot(actual.x - last.x, actual.z - last.z);
      moved += step;
      last = actual;
      assert(step < 0.12);
      assert(
        actual.y - groundHeight(actual.x, actual.z) >
          CHARACTER_HALF_HEIGHT + CHARACTER_RADIUS - 0.03,
      );
    }
    assert(
      actor.position.x > -145 && actor.position.x < -140,
      `unexpected closure position ${JSON.stringify(actor.position)}`,
    );
    assert(moved > 10 && moved < 16);
    assert.equal(isClosedStadiumInterior(actor.position), false);
  } finally {
    sim.dispose();
  }
});

test("both interpreted exterior flights are continuous physical stairs with an open arch below", async () => {
  await initPhysics();
  const sim = new Simulation(),
    front = source.frontage,
    lengths = front
      .slice(1)
      .map((p, i) => Math.hypot(p[0] - front[i][0], p[1] - front[i][1])),
    center = lengths[0] + lengths[1];
  const point = (s: number) => {
    let rest = s,
      i = 0;
    while (i < lengths.length - 1 && rest > lengths[i]) rest -= lengths[i++];
    const a = front[i],
      b = front[i + 1],
      tx = (b[0] - a[0]) / lengths[i],
      tz = (b[1] - a[1]) / lengths[i];
    return {
      x: a[0] + tx * rest + tz * source.stairOutward,
      z: a[1] + tz * rest - tx * source.stairOutward,
    };
  };
  const idle = { x: 0, z: 0, yaw: 0, jump: false, seq: 0 };
  try {
    for (const direction of [-1, 1]) {
      const start = point(
          center +
            direction *
              (source.stairLandingHalfLength +
                source.stairStepsPerFlight * source.stairRun +
                0.7),
        ),
        target = point(center + direction * 0.7),
        actor = sim.add(`stadium-stair-${direction}`, {
          ...start,
          y: groundHeight(start.x, start.z) + 1,
        });
      actor.setPosition = () =>
        assert.fail("stadium stair audit cannot teleport or fall-recover");
      for (let i = 0; i < 35; i++) {
        actor.step(idle);
        sim.tick(0);
      }
      let maxRise = 0,
        prev = actor.position.y;
      for (let i = 0; i < 420; i++) {
        const p = actor.position,
          dx = target.x - p.x,
          dz = target.z - p.z,
          d = Math.hypot(dx, dz);
        if (d < 0.16) break;
        actor.step({ ...idle, x: dx / d, z: dz / d });
        sim.tick(0);
        maxRise = Math.max(maxRise, actor.position.y - prev);
        prev = actor.position.y;
      }
      const actual = actor.position;
      assert(
        Math.hypot(actual.x - target.x, actual.z - target.z) < 0.2,
        `flight ${direction} blocked at ${JSON.stringify(actual)}`,
      );
      assert(
        Math.abs(actual.y - (pavilion.baseY + source.concourseY + 0.82)) <
          0.035,
        `wrong landing support for flight ${direction}`,
      );
      assert(maxRise < 0.25, "no stair-sized teleport");
      sim.remove(actor.id);
    }
  } finally {
    sim.dispose();
  }
});

test("stadium silhouette materials stay batched and every LOD uses the original full-detail source", () => {
  const engine = new NullEngine(),
    scene = new Scene(engine);
  scene.useRightHandedSystem = true;
  const controller = buildLandmarkReality({ scene, plan });
  try {
    const stadium = controller.meshes.filter(
      (m) => m.metadata.landmark === "stadium",
    );
    assert(
      stadium.length <= 18,
      `too many unbatched stadium draws: ${stadium.length}`,
    );
    assert(controller.metrics.collisionTriangles < 30000);
    const glass = stadium.filter(
      (m) => m.material?.name === "landmark:stadium-glass",
    );
    assert.equal(glass.length, 2);
    assert(glass.every((m) => m.metadata.depthCaster === false));
    controller.update({ x: 1000, z: 1000 }, "low");
    assert(glass.some((m) => m.metadata.lod === "far" && m.isEnabled()));
    controller.update({ x: -130, z: source.coveredPortalZ }, "high");
    assert(glass.some((m) => m.metadata.lod === "near" && m.isEnabled()));
    console.log("Photo-correct stadium component geometry", {
      ...controller.metrics,
      stadiumMeshes: stadium.length,
      pavilion,
    });
  } finally {
    controller.dispose();
    scene.dispose();
    engine.dispose();
  }
});
