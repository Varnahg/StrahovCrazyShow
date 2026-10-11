import {
  initPhysics,
  Simulation,
  CHARACTER_HALF_HEIGHT,
  CHARACTER_RADIUS,
} from "../../../shared/simulation";
import { groundHeight, groundNormal } from "../../../shared/terrain";
await initPhysics();
const idle = { x: 0, z: 0, yaw: 0, jump: false, seq: 0 };
const sim = new Simulation(),
  a = sim.add("diagnostic");
const rows = [];
for (const [x, z] of [
  [26, 79],
  [191, -75],
  [22, -14],
  [36.01, -150],
  [16.01, -100],
  [-7.05, -80],
  [36, 20],
]) {
  a.setPosition({ x, y: groundHeight(x, z) + 1, z });
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
    n = groundNormal(p.x, p.z),
    expected =
      groundHeight(p.x, p.z) +
      CHARACTER_HALF_HEIGHT +
      CHARACTER_RADIUS / n.y +
      0.0201;
  rows.push({
    start: { x, z },
    position: { ...p },
    normal: n,
    ground: groundHeight(p.x, p.z),
    expected,
    residual: p.y - expected,
    oscillation: Math.max(...heights) - Math.min(...heights),
    grounded: a.grounded,
  });
}
console.log(JSON.stringify(rows, null, 2));
a.setPosition({ x: 176, y: groundHeight(176, 10) + 1, z: 10 });
for (let i = 0; i < 60; i++) {
  a.step(idle);
  sim.tick(0);
}
const residuals = [],
  walking = [];
for (let i = 0; i < 240; i++) {
  a.step({ ...idle, x: 1 });
  sim.tick(0);
  const p = a.position,
    n = groundNormal(p.x, p.z);
  const residual =
    p.y -
    groundHeight(p.x, p.z) -
    CHARACTER_HALF_HEIGHT -
    CHARACTER_RADIUS / n.y -
    0.0201;
  residuals.push(residual);
  if (i % 20 === 0)
    walking.push({ i, position: { ...p }, residual, normalY: n.y });
}
console.log(
  JSON.stringify(
    { walking, residualRange: Math.max(...residuals) - Math.min(...residuals) },
    null,
    2,
  ),
);
sim.dispose();
