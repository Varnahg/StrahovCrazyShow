import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
const root = resolve(process.argv[2]);
const load = (path) => import(pathToFileURL(resolve(root, path)).href);
const { Color3 } = await load("node_modules/@babylonjs/core/Maths/math.color.js");
const candidate = existsSync(resolve(root, "client/sky-reflection.ts"));
const module = await load(candidate ? "client/sky-reflection.ts" : "client/cinematic.ts");
const palettes = [
  [new Color3(0.5, 0.7, 0.9), new Color3(0.8, 0.85, 0.9)],
  [new Color3(0.015, 0.025, 0.07), new Color3(0.03, 0.04, 0.06)],
];
const started = performance.now();
const sampler = candidate ? new module.SkyReflectionSampler() : null;
const update = (index) => sampler
  ? sampler.update(...palettes[index % 2])
  : module.skyReflectionData(...palettes[index % 2]);
update(0);
const firstUpdateIncludingSetupMs = performance.now() - started;
for (let i = 0; i < 30; i++) update(i);
const samples = [];
let checksum = 0;
for (let i = 0; i < 300; i++) {
  const t = performance.now();
  const data = update(i);
  samples.push(performance.now() - t);
  checksum += data.faces[2][(16 * 32 + 16) * 4] + data.polynomial.xx.x;
}
samples.sort((a, b) => a - b);
const percentile = (fraction) => samples[Math.ceil(samples.length * fraction) - 1];
console.log(JSON.stringify({ root, candidate, samples: samples.length,
  firstUpdateIncludingSetupMs, p50Ms: percentile(0.5), p95Ms: percentile(0.95),
  p99Ms: percentile(0.99), maxMs: samples.at(-1), checksum,
  scope: "CPU sky update only; no texture upload, GPU, scene, or FPS measurement" }, null, 2));
