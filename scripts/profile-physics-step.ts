/** Isolated CPU microbenchmark. Do not run alongside a browser GPU benchmark. */
import { performance } from "node:perf_hooks";
import { Simulation, initPhysics } from "../shared/simulation";
import { groundHeight } from "../shared/terrain";
import { FIXED_DT } from "../shared/netcode";

await initPhysics();
const at = Date.parse("2026-10-11T06:15:00Z");
const results = [];
for (const actors of [1, 30])
  for (const mode of ["optimized", "standard-wrapper", "optimized", "standard-wrapper"]) {
    const sim = new Simulation();
    if (mode === "standard-wrapper") {
      const step = sim.world.physicsPipeline.step.bind(sim.world.physicsPipeline);
      sim.world.physicsPipeline.step = (...args) => {
        step(...args);
        sim.world.mapNewSoftBodies();
      };
    }
    for (let i = 0; i < actors; i++) {
      const x = 110 + (i % 6) * 1.4, z = 12 + Math.floor(i / 6) * 1.4;
      sim.add("actor:" + i, { x, y: groundHeight(x, z) + 1, z });
    }
    const times: number[] = [];
    try {
      for (let tick = 0; tick < 360; tick++) {
        const started = performance.now();
        for (const actor of sim.actors.values())
          actor.step({ x: 0, z: 0, yaw: 0, jump: false, seq: tick });
        sim.tick(at + tick * FIXED_DT * 1000);
        if (tick >= 120) times.push(performance.now() - started);
      }
      times.sort((a, b) => a - b);
      results.push({
        actors,
        mode,
        warmupTicks: 120,
        measuredTicks: times.length,
        colliders: sim.world.colliders.len(),
        softBodies: sim.world.softBodies.len(),
        meanTickMs: times.reduce((sum, time) => sum + time, 0) / times.length,
        p95TickMs: times[Math.floor(times.length * 0.95)],
        p99TickMs: times[Math.floor(times.length * 0.99)],
      });
    } finally {
      sim.dispose();
    }
  }
console.log(JSON.stringify({
  scope: "Node CPU simulation only; this is not browser FPS or GPU evidence",
  createdAt: new Date().toISOString(),
  physicsHz: 1 / FIXED_DT,
  optimization: "Same public Rapier physicsPipeline.step; omit soft-body wrapper discovery only with no soft bodies",
  results,
}, null, 2));
