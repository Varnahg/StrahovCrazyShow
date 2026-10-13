/** Run serially under heavy-validation: pnpm exec tsx scripts/profile-transit-cost.ts [checkout].
 * The same driver accepts the frozen baseline, which has no vehicle-only API.
 * This isolates CPU sampling work, not browser frame time or GPU performance.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { cpus } from "node:os";
import { resolve } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import { performance } from "node:perf_hooks";

const checkout = resolve(process.argv[2] ?? process.cwd());
type TransitModule = typeof import("../shared/transit");
type CompatibleTransitModule = Omit<TransitModule, "sampleTransitVehicles"> & {
  sampleTransitVehicles?: TransitModule["sampleTransitVehicles"];
};
const transit = (await import(
  pathToFileURL(resolve(checkout, "shared/transit.ts")).href
)) as CompatibleTransitModule;
const sampleVehicles = transit.sampleTransitVehicles ?? transit.sampleTransit;
const start = transit.serviceDayEpoch(transit.TRANSIT_FEED.start);
const arrival = transit.getPreviewArrival(start + 6 * 3600000);
if (!arrival)
  throw new Error("Bundled transit feed has no reproducible arrival");
const windows = [
  { name: "passenger-arrival", now: arrival.at + 2000 },
  { name: "walking-passengers", now: arrival.at + 32000 },
  {
    name: "expired-feed",
    now: transit.serviceDayEpoch(
      transit.shiftServiceDate(transit.TRANSIT_FEED.end, 1),
    ),
  },
];
const count = 240;
function run(now: number, timed: boolean) {
  const durations: number[] = [];
  const checksum = createHash("sha256");
  let vehicles = 0;
  for (let index = 0; index < count; index++) {
    const before = performance.now();
    const frame = sampleVehicles(now + index * (1000 / 30));
    const obstacles = transit.transitObstacles(frame);
    if (timed) durations.push(performance.now() - before);
    vehicles += obstacles.length;
    checksum.update(JSON.stringify(obstacles));
  }
  durations.sort((a, b) => a - b);
  return {
    calls: count,
    vehicles,
    obstacleSha256: checksum.digest("hex"),
    cpuMs: {
      mean:
        durations.reduce((sum, value) => sum + value, 0) /
        Math.max(1, durations.length),
      p95: durations[Math.floor(durations.length * 0.95)] ?? 0,
      p99: durations[Math.floor(durations.length * 0.99)] ?? 0,
    },
  };
}
for (const window of windows) run(window.now, false);
const results = [];
for (let repeat = 0; repeat < 5; repeat++)
  for (const window of windows)
    results.push({
      repeat,
      scenario: window.name,
      now: window.now,
      ...run(window.now, true),
    });
const sources = ["shared/transit.ts", "shared/simulation.ts"];
console.log(
  JSON.stringify(
    {
      scope:
        "Serial Node CPU transit sampling plus collision obstacle preparation; not browser FPS or full physics timing",
      node: process.version,
      cpu: cpus()[0]?.model,
      createdAt: new Date().toISOString(),
      checkout,
      mode: transit.sampleTransitVehicles
        ? "vehicle-only"
        : "full-transit-baseline",
      driverSha256: createHash("sha256")
        .update(readFileSync(fileURLToPath(import.meta.url)))
        .digest("hex"),
      sourceSha256: Object.fromEntries(
        sources.map((path) => [
          path,
          createHash("sha256")
            .update(readFileSync(resolve(checkout, path)))
            .digest("hex"),
        ]),
      ),
      results,
    },
    null,
    2,
  ),
);
