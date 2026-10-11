import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { Simulation, initPhysics } from "../../shared/simulation";

await initPhysics();
const label = process.argv[2] || "after";
if (!/^[a-z0-9-]+$/.test(label)) throw new Error("Invalid evidence label");
const simulation = new Simulation();
const actor = simulation.add("continuous-b6-entry", { x: -9, y: 1, z: -73 });
const idle = { x: 0, z: 0, yaw: 0, jump: false, seq: 0 };
let teleportCalls = 0,
  tick = 0,
  lowestY = Infinity;
actor.setPosition = () => {
  teleportCalls++;
  throw new Error("A continuous route must never teleport or respawn");
};
const step = (x: number, z: number) => {
  actor.step({ ...idle, x, z, seq: ++tick });
  simulation.tick(Date.parse("2026-10-10T10:00:00Z"));
  lowestY = Math.min(lowestY, actor.position.y);
};
for (let i = 0; i < 30; i++) step(0, 0);
const waypoints = [
  [-3.5, -73],
  [3.2, -73],
  [3.2, -79],
  [8, -79],
  [8, -69.5],
];
const segments: unknown[] = [];
let failure: string | undefined;
try {
  for (const [x, z] of waypoints) {
    const started = tick;
    let reached = false;
    for (let i = 0; i < 600; i++) {
      const dx = x - actor.position.x,
        dz = z - actor.position.z,
        distance = Math.hypot(dx, dz);
      if (distance < 0.13) {
        reached = true;
        break;
      }
      step(dx / distance, dz / distance);
    }
    segments.push({
      waypoint: { x, z },
      reached,
      ticks: tick - started,
      position: { ...actor.position },
    });
    if (!reached) throw new Error(`Blocked before ${x},${z}`);
  }
  if (actor.position.y <= 3.65)
    throw new Error(`First floor not reached: y=${actor.position.y}`);
} catch (error) {
  failure = error instanceof Error ? error.message : String(error);
}
const result = {
  recordedAt: new Date().toISOString(),
  label,
  simulationHz: 60,
  movementSpeed: 4.6,
  initialSpawn: { x: -9, y: 1, z: -73 },
  waypoints,
  segments,
  teleportCalls,
  sourceSha256: createHash("sha256")
    .update(readFileSync(new URL("../../shared/world.ts", import.meta.url)))
    .digest("hex"),
  ticks: tick,
  lowestY,
  finalPosition: { ...actor.position },
  passed: !failure,
  failure,
};
simulation.dispose();
writeFileSync(
  new URL(`B6-entry-${label}.json`, import.meta.url),
  JSON.stringify(result, null, 2) + "\n",
);
console.log(JSON.stringify(result, null, 2));
process.exitCode = failure ? 1 : 0;
