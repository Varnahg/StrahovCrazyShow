/** Read-only runtime audit. Run: node --import tsx docs/optimization-study/evidence/physics-diagnostics.mts .cache/physics-rerun.json */
import RAPIER from '@dimforge/rapier3d-compat';
import { Actor, Simulation, initPhysics } from '../../../.cache/optimization-study-snapshot/shared/simulation.ts';
import { sanitizeInput } from '../../../.cache/optimization-study-snapshot/shared/profile.ts';
import { B6_BOXES, BUILDINGS } from '../../../.cache/optimization-study-snapshot/shared/world.ts';
import { cpus, totalmem, platform, release } from 'node:os';
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

await initPhysics();
const idle = { x: 0, z: 0, yaw: 0, jump: false, seq: 0 };
const source = new URL('../../../.cache/optimization-study-snapshot/', import.meta.url);
const tick = (a: Actor, input = idle) => { a.step(input); a.sim.world.step(); };
const bare = () => {
  const world = new RAPIER.World({ x: 0, y: -18, z: 0 });
  world.timestep = 1 / 30;
  return { world } as Simulation;
};

// A reconstruction of only the former large ground collider, not an old full-world snapshot.
const ground: unknown[] = [];
for (const variant of ['former-large-ground-isolated', 'small-ground-isolated', 'snapshot-full-world']) {
  const sim = variant === 'snapshot-full-world' ? new Simulation() : bare();
  if (variant === 'former-large-ground-isolated') {
    sim.world.createCollider(RAPIER.ColliderDesc.cuboid(242, .5, 500).setTranslation(258, -.5, 0));
  } else if (variant === 'small-ground-isolated') {
    sim.world.createCollider(RAPIER.ColliderDesc.cuboid(10, .5, 10).setTranslation(26, -.5, 79));
  }
  sim.world.step();
  const a = new Actor(sim, 'ground', { x: 26, y: 1, z: 79 });
  const samples = [];
  for (let i = 0; i < 60; i++) {
    tick(a);
    if (i < 20 || i === 59) samples.push({ tick: i, y: a.position.y, grounded: a.grounded });
  }
  ground.push({ variant, colliderCountIncludingActor: sim.world.colliders.len(), final: a.position, samples });
  sim.world.free();
}

const carSim = bare();
carSim.world.createCollider(RAPIER.ColliderDesc.cuboid(10, .5, 10).setTranslation(0, -.5, 0));
const carWall = carSim.world.createCollider(RAPIER.ColliderDesc.cuboid(.1, 2, 10).setTranslation(1.1, 2, 0));
carSim.world.step();
const car = new Actor(carSim, 'car', { x: 0, y: 1, z: 0 });
car.setVehicle(true);
for (let i = 0; i < 30; i++) tick(car);
let firstPenetration: unknown = null, maxPenetrationMeters = 0;
for (let i = 0; i < 30; i++) {
  tick(car, { ...idle, x: 1, z: 1 });
  const contact = car.collider.contactCollider(carWall, 0);
  if (contact && contact.distance < 0) {
    firstPenetration ??= { tick: i, position: car.position, yaw: car.yaw, depthMeters: -contact.distance };
    maxPenetrationMeters = Math.max(maxPenetrationMeters, -contact.distance);
  }
}
const carRotation = { fixture: 'Wall inner face x=1.0; car starts x=z=0 with half extents .88,.6,1.8. Hold forward+right for 30 ticks after settling.', firstPenetration, maxPenetrationMeters, finalPosition: car.position, finalYaw: car.yaw };
carSim.world.free();

const playSim = new Simulation(), player = playSim.add('play', { x: 22, y: 1, z: -14 });
const jumpStarts = [];
let wasAscending = false;
for (let i = 0; i < 150; i++) {
  tick(player, { ...idle, jump: true });
  if (player.vertical > 0 && !wasAscending) jumpStarts.push(i);
  wasAscending = player.vertical > 0;
}
playSim.solid(22, 2, -24, 30, 4, .4); playSim.tick();
player.setPosition({ x: 22, y: 1, z: -14 });
for (let i = 0; i < 200; i++) tick(player, { ...idle, z: -1 });
const wallMovement = player.controller.computedMovement();
const wallSpeed = { reportedSpeedMetersPerSecond: player.speed, actualMovementLastTick: wallMovement, actualHorizontalSpeedLastTick: Math.hypot(wallMovement.x, wallMovement.z) * 30, position: player.position };
playSim.dispose();

const yaw = Math.PI / 8;
const rawInput = { ...idle, x: Math.sin(yaw) + Math.cos(yaw), z: Math.cos(yaw) - Math.sin(yaw), yaw };
const wireInput = sanitizeInput(rawInput)!;
const normalized = (i: typeof idle) => { const n = Math.max(1, Math.hypot(i.x, i.z)); return { x: i.x / n, z: i.z / n }; };
const localDirection = normalized(rawInput), serverDirection = normalized(wireInput);
const inputMismatch = { cameraYawRadians: yaw, rawInput, wireInput, localDirection, serverDirection, angularDifferenceDegrees: Math.abs(Math.atan2(localDirection.x, localDirection.z) - Math.atan2(serverDirection.x, serverDirection.z)) * 180 / Math.PI, hypotheticalUnobstructedDriftMetersPerSecond: Math.hypot(localDirection.x - serverDirection.x, localDirection.z - serverDirection.z) * 4.6 };

function summarize(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  const at = (p: number) => sorted[Math.min(sorted.length - 1, Math.ceil(p * sorted.length) - 1)];
  return { mean: values.reduce((a, b) => a + b, 0) / values.length, p50: at(.5), p95: at(.95), p99: at(.99), max: sorted.at(-1) };
}
const benchmark = [];
for (const actorCount of [1, 16, 32, 100]) {
  const sim = new Simulation();
  const actors = Array.from({ length: actorCount }, (_, i) => sim.add(String(i), { x: 100 + (i % 8) * 3, y: 1, z: Math.floor(i / 8) * 3 }));
  const queries: number[] = [], steps: number[] = [], total: number[] = [];
  for (let i = 0; i < 720; i++) {
    const input = { ...idle, x: Math.sin(i * .02), z: Math.cos(i * .02), seq: i };
    const start = performance.now();
    for (const actor of actors) actor.step(input);
    const middle = performance.now();
    sim.tick();
    const end = performance.now();
    if (i >= 120) { queries.push(middle - start); steps.push(end - middle); total.push(end - start); }
  }
  benchmark.push({ actorCount, colliderCount: sim.world.colliders.len(), warmupTicks: 120, measuredTicks: 600, controllerAndQueriesMs: summarize(queries), worldStepMs: summarize(steps), combinedMs: summarize(total) });
  sim.dispose();
}

const hashes = Object.fromEntries(['shared/simulation.ts', 'shared/world.ts', 'shared/profile.ts'].map(path => [path, createHash('sha256').update(readFileSync(new URL(path, source))).digest('hex')]));
const result = {
  generatedAtUtc: new Date().toISOString(),
  scope: 'Frozen .cache/optimization-study-snapshot. No runtime source edits. Former-large-ground is an isolated reconstruction. Measurements are local headless diagnostic evidence, not FPS, input-to-photon latency, production capacity, or guaranteed budgets.',
  environment: { platform: platform(), osRelease: release(), cpu: cpus()[0]?.model, logicalCpuCount: cpus().length, totalMemoryGiB: totalmem() / 1024 ** 3, node: process.version, concurrentWork: 'Other audit agents and user applications may be active; no process/thermal isolation.' },
  snapshotSourceSha256: hashes,
  scene: { buildingCount: BUILDINGS.length, b6BoxCount: B6_BOXES.length },
  ground, carRotation, heldJump: { heldTicks: 150, upwardIntervalsStartTicks: jumpStarts }, wallSpeed, inputMismatch,
  benchmarkDescription: 'Sequential 1,16,32,100 walking actors; full frozen world; 120 warmup + 600 measured ticks; identical rotating movement inputs for all actors. Timings use performance.now around actor.step loop and world.step. No render, networking, React, or wall-clock pacing. Single run per actor count; rerun for robust comparison.',
  benchmark
};
const output = process.argv[2] || '.cache/physics-rerun.json';
writeFileSync(output, JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify({ output, carRotation, heldJump: result.heldJump, wallSpeed, inputMismatch, benchmark }, null, 2));
