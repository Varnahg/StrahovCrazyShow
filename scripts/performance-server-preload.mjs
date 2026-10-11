/** Read-only Node telemetry. Preload before tsx/server; never patches simulation. */
import { monitorEventLoopDelay } from 'node:perf_hooks';
import { appendFileSync } from 'node:fs';
const output = process.env.STRAHOV_PERF_TELEMETRY;
if (output) {
  const delay = monitorEventLoopDelay({ resolution: 10 });
  delay.enable();
  let cpu = process.cpuUsage(), at = performance.now();
  const timer = setInterval(() => {
    const now = performance.now(), next = process.cpuUsage(), elapsed = now - at;
    const cpuMs = (next.user - cpu.user + next.system - cpu.system) / 1000;
    appendFileSync(output, JSON.stringify({
      time: Date.now(), elapsedMs: elapsed, cpuMs, singleCoreCpuPercent: cpuMs / elapsed * 100,
      rssBytes: process.memoryUsage().rss, heapUsedBytes: process.memoryUsage().heapUsed,
      eventLoopDelayMedianMs: delay.percentile(50) / 1e6,
      eventLoopDelayP95Ms: delay.percentile(95) / 1e6,
      eventLoopDelayP99Ms: delay.percentile(99) / 1e6,
      eventLoopDelayMaxMs: delay.max / 1e6,
    }) + '\n');
    at = now; cpu = next; delay.reset();
  }, 1000);
  timer.unref();
}
