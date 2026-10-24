import { test } from "node:test";
import assert from "node:assert/strict";
import {
  initPhysics,
  Simulation,
  CHARACTER_HALF_HEIGHT,
  CHARACTER_RADIUS,
} from "../shared/simulation";
import { groundHeight, groundNormal, TERRAIN } from "../shared/terrain";
import { cadB6EntranceHeight } from "../shared/cad-buildings";
import { updateRainSegments } from "../client/weather-particles";
await initPhysics();
const idle = { x: 0, z: 0, yaw: 0, jump: false, seq: 0 };
/** A capsule can overlap several DEM triangles. The centre's normal alone
 * underestimates the supporting height at convex grid/diagonal seams. Sample
 * the lower spherical cap (2cm horizontal quadrature), plus the analytic plane
 * solution. This follows the same 4m piecewise-triangle surface as physics. */
function expectedContact(x: number, z: number) {
  const radius = CHARACTER_RADIUS,
    n = groundNormal(x, z);
  let y = -Infinity;
  const samples = Math.ceil(radius / .02);
  for (let ix = -samples; ix <= samples; ix++)
    for (let iz = -samples; iz <= samples; iz++) {
      const dx = ix * 0.02,
        dz = iz * 0.02,
        r2 = dx * dx + dz * dz;
      if (r2 > radius * radius) continue;
      y = Math.max(
        y,
        groundHeight(x + dx, z + dz) +
          CHARACTER_HALF_HEIGHT +
          Math.sqrt(radius * radius - r2),
      );
    }
  const grid = TERRAIN.grid,
    u = ((x - grid.minX) / grid.step) % 1,
    v = ((z - grid.minZ) / grid.step) % 1;
  const triangleEdgeDistance =
    Math.min(u, 1 - u, v, 1 - v, Math.abs(u + v - 1) / Math.SQRT2) * grid.step;
  // A tangent plane only extends over its own triangle. At a concave seam an
  // infinite plane can overestimate support by centimetres on a steep slope.
  if (triangleEdgeDistance > radius)
    y = Math.max(y, groundHeight(x, z) + CHARACTER_HALF_HEIGHT + radius / n.y);
  return y + 0.0201;
}
test("rain wraps coherently without flashing eighteen-meter segments", () => {
  const lines = [
    [
      { x: 0, y: -0.9, z: 0 },
      { x: 0.12, y: -1.6, z: 0 },
    ],
  ];
  for (let i = 0; i < 1000; i++) {
    updateRainSegments(lines, 1 / 60, { rain: 3, precipitationType: "rain" });
    assert.ok(Math.abs(lines[0][0].y - lines[0][1].y - 0.32) < 1e-8);
  }
});
test("resting walkable DEM contact stays within three millimetres at former trouble points and grid seams", () => {
  const sim = new Simulation(),
    a = sim.add("rest-probe"),
    place = a.setPosition.bind(a);
  a.setPosition = () =>
    assert.fail("Rest contact may not use fallback teleportation");
  const evidence = [];
  for (const [x, z] of [
    [26, 79],
    [191, -75],
    [22, -14],
    [36.01, -130],
    [32.01, -116],
    [16.01, -100],
    // -7.05,-80 is now a native CAD stair/riser, not outdoor DEM. Keep this
    // approach-area probe on actual DEM just outside the native entry bounds;
    // cad-building-world.test.ts covers the current native stairs separately.
    [-8.5, -80],
    [36, 20],
  ]) {
    assert.ok(
      groundNormal(x, z).y > 0.9,
      "rest fixtures must be walkable ground, not a steep sliding embankment",
    );
    assert.equal(cadB6EntranceHeight(x, z), undefined, "DEM fixture must not be a native stair surface");
    place({ x, y: groundHeight(x, z) + 1, z });
    for (let i = 0; i < 60; i++) {
      a.step(idle);
      sim.tick(0);
    }
    const heights = [];
    for (let i = 0; i < 120; i++) {
      a.step(idle);
      sim.tick(0);
      heights.push(a.position.y);
    }
    const p = a.position,
      expected = expectedContact(p.x, p.z),
      oscillation = Math.max(...heights) - Math.min(...heights);
    assert.ok(
      Math.abs(p.y - expected) < 0.003,
      `DEM capsule penetration/hover at ${x},${z}: actual=${p.y}, envelope=${expected}`,
    );
    assert.ok(
      oscillation < 0.003,
      `unstable rest at ${x},${z}: ${oscillation}m`,
    );
    assert.ok(
      Math.hypot(p.x - x, p.z - z) < 0.025,
      "rest may not hide vibration by sliding away",
    );
    evidence.push({ x, z, oscillation, clearanceError: p.y - expected });
  }
  console.log("DEM resting stability", evidence);
  sim.dispose();
});
test("walking across real DEM grid seams follows terrain without extra eye-height vibration", () => {
  const sim = new Simulation(),
    a = sim.add("walking-probe", {
      x: 176,
      y: groundHeight(176, 10) + 1,
      z: 10,
    });
  a.setPosition = () => assert.fail("Ground following may not teleport");
  for (let i = 0; i < 60; i++) {
    a.step(idle);
    sim.tick(0);
  }
  const residuals = [],
    heights = [];
  for (let i = 0; i < 240; i++) {
    a.step({ ...idle, x: 1 });
    sim.tick(0);
    const p = a.position;
    residuals.push(p.y - expectedContact(p.x, p.z));
    heights.push(p.y);
  }
  assert.ok(a.position.x > 194, "must actually cross several 4m DEM cells");
  assert.ok(
    Math.max(...heights) - Math.min(...heights) > 0.4,
    "fixture must exercise actual changing terrain height",
  );
  assert.ok(
    Math.max(...residuals) - Math.min(...residuals) < 0.003,
    `ground-following oscillation: ${Math.max(...residuals) - Math.min(...residuals)}`,
  );
  assert.ok(
    Math.max(...residuals.map(Math.abs)) < 0.003,
    "capsule must follow its supporting spherical-cap envelope",
  );
  console.log("DEM walking clearance", {
    heightChange: Math.max(...heights) - Math.min(...heights),
    residualRange: Math.max(...residuals) - Math.min(...residuals),
  });
  sim.dispose();
});
test("steep actual embankment slides downhill while remaining supported instead of being misclassified as rest vibration", () => {
  const sim = new Simulation(),
    x = 36.01,
    z = -150,
    // On this ~60 degree face, ground+1 intersects the vertical capsule before
    // the first step. Start above its analytic support rather than testing
    // recovery from an invalid penetrating spawn.
    a = sim.add("slope-probe", { x, y: expectedContact(x, z) + 0.03, z });
  a.setPosition = () =>
    assert.fail("Steep-slope contact may not use fall recovery");
  assert.ok(
    groundNormal(x, z).y < 0.65,
    "fixture must represent the surveyed steep DEM feature",
  );
  const initialGround = groundHeight(x, z);
  let maxResidual = 0;
  for (let i = 0; i < 180; i++) {
    a.step(idle);
    sim.tick(0);
    if (i > 30) {
      const p = a.position;
      maxResidual = Math.max(
        maxResidual,
        Math.abs(p.y - expectedContact(p.x, p.z)),
      );
      assert.ok(p.y - groundHeight(p.x, p.z) > 0.75);
    }
  }
  const p = a.position;
  assert.ok(
    Math.hypot(p.x - x, p.z - z) > 0.3,
    "steep slope must slide rather than freeze in midair",
  );
  assert.ok(
    groundHeight(p.x, p.z) < initialGround - 0.5,
    "sliding direction must be downhill",
  );
  assert.ok(
    maxResidual < 0.05,
    `sliding contact must stay close to the supporting curved capsule envelope: ${maxResidual}`,
  );
  sim.dispose();
});
