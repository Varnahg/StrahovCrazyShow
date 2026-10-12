/** Sequential, owned-process loopback A/B. This runner never starts a browser or GPU workload. */
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { access, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import net from "node:net";
import { createRequire } from "node:module";
import os from "node:os";
import { isAbsolute, join, relative, resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { pathToFileURL } from "node:url";

const USAGE = `Usage: node scripts/compare-network-checkpoints.mjs BASELINE_SNAPSHOT CANDIDATE_SNAPSHOT OUTPUT_DIR [COUNT=100] [REPETITIONS=3] [SECONDS=30] [PORT=2580]

Runs A/B, then B/A, alternating each repetition. Each sample owns a fresh server,
uses that frozen snapshot's diverse-profile/network harness, and retains raw JSON,
one-second server telemetry, bounded process logs and summary.json. All manifested
source files are SHA-256 verified before any measurement. OUTPUT_DIR must be empty.
COUNT: 1..100; REPETITIONS: 1..10; SECONDS: 10..90; warmup: 5 seconds.
Each sample has a 120-second deadline including startup and client joins.
Ports 2567, 2568 and 2570 are forbidden. Default endpoint is 127.0.0.1:2580.
Run only after builds/tests are complete, without concurrent GPU or load tests.
Payload rates exclude WebSocket/TCP/TLS overhead. No public-network or GPU claim.
--help performs no filesystem mutation and starts no processes.`;

if (process.argv.includes("--help") || process.argv.includes("-h")) {
  console.log(USAGE);
  process.exit(0);
}
const args = process.argv.slice(2);
if (args.length < 3 || args.length > 7) throw new Error(USAGE);
const baseline = resolve(args[0]),
  candidate = resolve(args[1]),
  output = resolve(args[2]);
const count = Number(args[3] ?? 100),
  repetitions = Number(args[4] ?? 3);
const seconds = Number(args[5] ?? 30),
  port = Number(args[6] ?? 2580);
for (const [name, value, min, max] of [
  ["COUNT", count, 1, 100],
  ["REPETITIONS", repetitions, 1, 10],
  ["SECONDS", seconds, 10, 90],
  ["PORT", port, 1, 65535],
])
  if (!Number.isInteger(value) || value < min || value > max)
    throw new Error(`Invalid ${name}: ${value}`);
if ([2567, 2568, 2570].includes(port))
  throw new Error(
    "Shared development, benchmark and integration ports are forbidden.",
  );
if (baseline === candidate)
  throw new Error("Baseline and candidate must be different frozen snapshots.");
const endpoint = `http://127.0.0.1:${port}`;
const warmupSeconds = 5,
  sampleTimeoutMs = 120000,
  logLimitBytes = 2 * 1024 * 1024;
const owned = new Set();
let interrupted;
const sleep = (ms) => new Promise((accept) => setTimeout(accept, ms));
const finite = (value) => typeof value === "number" && Number.isFinite(value);
const median = (values) => {
  const sorted = values.filter(finite).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const half = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[half]
    : (sorted[half - 1] + sorted[half]) / 2;
};
const hashBytes = (bytes) => createHash("sha256").update(bytes).digest("hex");
const errorText = (error) =>
  error instanceof Error ? `${error.name}: ${error.message}` : String(error);
async function fileHash(path) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest("hex");
}
async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}
function ensureRunning() {
  if (interrupted) throw new Error(`Runner interrupted by ${interrupted}`);
}
function contained(root, path) {
  const name = relative(root, path);
  return (
    name !== "" &&
    name !== ".." &&
    !name.startsWith("..\\") &&
    !name.startsWith("../") &&
    !isAbsolute(name)
  );
}

async function inspectSnapshot(label, root) {
  const manifestPath = join(root, "source-manifest.json");
  const manifestBytes = await readFile(manifestPath);
  const manifest = JSON.parse(manifestBytes);
  if (
    typeof manifest.snapshotId !== "string" ||
    !manifest.files ||
    typeof manifest.files !== "object" ||
    Array.isArray(manifest.files)
  )
    throw new Error(`${label}: invalid source manifest`);
  const files = Object.entries(manifest.files);
  if (!files.length) throw new Error(`${label}: empty source manifest`);
  const mismatches = [];
  for (const [name, expected] of files) {
    ensureRunning();
    const path = resolve(root, name);
    if (
      !contained(root, path) ||
      typeof expected !== "string" ||
      !/^[a-f0-9]{64}$/i.test(expected)
    )
      throw new Error(`${label}: unsafe or invalid manifested path ${name}`);
    try {
      const actual = await fileHash(path);
      if (actual !== expected)
        mismatches.push({ path: name, expected, actual });
    } catch (error) {
      mismatches.push({ path: name, expected, error: errorText(error) });
    }
  }
  const required = [
    "server/index.ts",
    "scripts/performance-server-preload.mjs",
    "scripts/performance-diverse.mjs",
    "scripts/performance-network.ts",
    "package.json",
    "pnpm-lock.yaml",
  ];
  for (const name of required)
    if (!manifest.files[name])
      mismatches.push({
        path: name,
        error: "Required runtime/harness file is not manifested",
      });
  const require = createRequire(join(root, "package.json")),
    installedDependencies = {};
  for (const name of [
    "tsx",
    "@colyseus/core",
    "@colyseus/sdk",
    "@colyseus/ws-transport",
    "@dimforge/rapier3d-compat",
  ]) {
    try {
      const path = require.resolve(name + "/package.json");
      const bytes = await readFile(path);
      installedDependencies[name] = {
        version: JSON.parse(bytes).version,
        packagePath: path,
        packageSha256: hashBytes(bytes),
      };
    } catch (error) {
      installedDependencies[name] = { error: errorText(error) };
    }
  }
  const result = {
    label,
    root,
    sourceSnapshotId: manifest.snapshotId,
    manifestPath,
    manifestSha256: hashBytes(manifestBytes),
    verifiedFileCount: files.length,
    integrityPassed: mismatches.length === 0,
    mismatches,
    runtimeAndHarnessHashes: Object.fromEntries(
      required.map((name) => [name, manifest.files[name] ?? null]),
    ),
    productionBuildExists: await exists(join(root, "dist", "index.html")),
    installedDependencies,
    package: JSON.parse(await readFile(join(root, "package.json"), "utf8")),
  };
  return result;
}

async function assertPortAvailable() {
  const probe = net.createServer();
  await new Promise((accept, reject) => {
    probe.once("error", reject);
    probe.listen({ host: "127.0.0.1", port, exclusive: true }, accept);
  });
  await new Promise((accept, reject) =>
    probe.close((error) => (error ? reject(error) : accept())),
  );
}

function boundedLog(path) {
  const stream = createWriteStream(path, { flags: "wx" });
  const info = {
    path,
    bytesSeen: 0,
    bytesCaptured: 0,
    truncated: false,
    error: null,
  };
  stream.on("error", (error) => {
    info.error = errorText(error);
  });
  return {
    info,
    append(chunk) {
      info.bytesSeen += chunk.length;
      const remaining = Math.max(0, logLimitBytes - info.bytesCaptured);
      if (remaining) {
        const body = chunk.subarray(0, remaining);
        stream.write(body);
        info.bytesCaptured += body.length;
      }
      if (chunk.length > remaining) info.truncated = true;
    },
    async close() {
      if (stream.destroyed) return;
      await new Promise((accept) => {
        stream.once("close", accept);
        stream.end();
      });
    },
  };
}

function launch(role, commandArgs, cwd, env, sampleDir) {
  ensureRunning();
  const stdout = boundedLog(join(sampleDir, `${role}.stdout.log`));
  const stderr = boundedLog(join(sampleDir, `${role}.stderr.log`));
  const child = spawn(process.execPath, commandArgs, {
    cwd,
    env,
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  const record = {
    role,
    child,
    pid: child.pid ?? null,
    command: [process.execPath, ...commandArgs],
    cwd,
    stdout: stdout.info,
    stderr: stderr.info,
    ready: false,
    stopped: false,
    spawnError: null,
    exit: null,
    killedByRunner: false,
    tail: "",
  };
  owned.add(record);
  child.stdout.on("data", (chunk) => {
    stdout.append(chunk);
    record.tail = (record.tail + chunk.toString()).slice(-65536);
    if (record.tail.includes(`Strahov multiplayer: ${endpoint}`))
      record.ready = true;
  });
  child.stderr.on("data", (chunk) => stderr.append(chunk));
  child.on("error", (error) => {
    record.spawnError = errorText(error);
  });
  record.closed = new Promise((accept) =>
    child.once("close", (code, signal) => {
      record.stopped = true;
      record.exit = { code, signal, at: new Date().toISOString() };
      owned.delete(record);
      Promise.all([stdout.close(), stderr.close()]).then(() =>
        accept(record.exit),
      );
    }),
  );
  return record;
}

async function within(promise, timeout, message) {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(message)),
          Math.max(1, timeout),
        );
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}
async function stop(record) {
  if (!record || record.stopped) {
    if (record) await record.closed;
    return;
  }
  record.killedByRunner = true;
  record.child.kill("SIGTERM");
  try {
    await within(
      record.closed,
      1500,
      "Owned process did not stop after SIGTERM",
    );
  } catch {
    if (!record.stopped) record.child.kill("SIGKILL");
    await within(
      record.closed,
      5000,
      `Owned ${record.role} PID ${record.pid} did not exit`,
    );
  }
}
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => {
    interrupted = signal;
    for (const record of owned) {
      record.killedByRunner = true;
      record.child.kill("SIGTERM");
    }
  });
function processInfo(record) {
  if (!record) return null;
  const { child: _child, closed: _closed, tail: _tail, ...info } = record;
  return info;
}

async function analyzeTelemetry(path, startedAt, endedAt) {
  const text = await readFile(path, "utf8");
  const malformed = [],
    intervals = [];
  for (const [index, line] of text.split(/\r?\n/).entries()) {
    if (!line.trim()) continue;
    try {
      const entry = JSON.parse(line);
      const fields = [
        "time",
        "elapsedMs",
        "cpuMs",
        "rssBytes",
        "heapUsedBytes",
        "eventLoopDelayP95Ms",
        "eventLoopDelayP99Ms",
        "eventLoopDelayMaxMs",
      ];
      if (
        !fields.every((name) => finite(entry[name]) && entry[name] >= 0) ||
        entry.elapsedMs <= 0
      )
        throw new Error("Invalid telemetry interval");
      if (entry.time - entry.elapsedMs >= startedAt && entry.time <= endedAt)
        intervals.push(entry);
    } catch (error) {
      malformed.push({ line: index + 1, error: errorText(error) });
    }
  }
  const elapsedMs = intervals.reduce((sum, item) => sum + item.elapsedMs, 0);
  const cpuMs = intervals.reduce((sum, item) => sum + item.cpuMs, 0);
  return {
    path,
    recordingStartedAt: startedAt,
    recordingEndedAt: endedAt,
    inclusionRule:
      "Only complete telemetry windows: windowEnd - elapsedMs >= recordingStartedAt AND windowEnd <= recordingEndedAt; no startup/warmup/shutdown partial windows.",
    eventLoopNote:
      "P95/P99 below are medians or maxima of per-window telemetry histogram percentiles. They are not pooled event-loop percentiles, frame times, GPU or input-to-photon measurements.",
    includedIntervals: intervals.length,
    includedElapsedMs: elapsedMs,
    cpuMs,
    timeWeightedSingleCoreCpuPercent: elapsedMs
      ? (cpuMs / elapsedMs) * 100
      : null,
    rssPeakBytes: intervals.length
      ? Math.max(...intervals.map((item) => item.rssBytes))
      : null,
    heapPeakBytes: intervals.length
      ? Math.max(...intervals.map((item) => item.heapUsedBytes))
      : null,
    eventLoopP95WindowMedianMs: median(
      intervals.map((item) => item.eventLoopDelayP95Ms),
    ),
    eventLoopP99WindowMedianMs: median(
      intervals.map((item) => item.eventLoopDelayP99Ms),
    ),
    eventLoopP95WindowMaxMs: intervals.length
      ? Math.max(...intervals.map((item) => item.eventLoopDelayP95Ms))
      : null,
    eventLoopP99WindowMaxMs: intervals.length
      ? Math.max(...intervals.map((item) => item.eventLoopDelayP99Ms))
      : null,
    eventLoopMaxMs: intervals.length
      ? Math.max(...intervals.map((item) => item.eventLoopDelayMaxMs))
      : null,
    malformed,
  };
}

async function runSample(snapshot, repetition, ordinal) {
  const dir = join(
    output,
    `${String(ordinal).padStart(2, "0")}-r${repetition}-${snapshot.label}`,
  );
  await mkdir(dir);
  const rawPath = join(dir, "network.json"),
    telemetryPath = join(dir, "server-telemetry.jsonl");
  const sample = {
    ordinal,
    repetition,
    label: snapshot.label,
    sourceSnapshotId: snapshot.sourceSnapshotId,
    sampleDir: dir,
    rawPath,
    profilesPath: rawPath + ".profiles.json",
    telemetryPath,
    startedAt: new Date().toISOString(),
    status: "running",
    errors: [],
    qualityIssues: [],
  };
  let server, harness;
  const deadline = performance.now() + sampleTimeoutMs;
  const env = {
    ...process.env,
    PORT: String(port),
    STRAHOV_PERF_TELEMETRY: telemetryPath,
  };
  delete env.STRAHOV_PERF_HARNESS_SOURCE;
  delete env.STRAHOV_PERF_HARNESS_METADATA;
  try {
    ensureRunning();
    await assertPortAvailable();
    server = launch(
      "server",
      [
        "--import",
        pathToFileURL(
          join(snapshot.root, "scripts/performance-server-preload.mjs"),
        ).href,
        "--import",
        "tsx",
        join(snapshot.root, "server/index.ts"),
      ],
      snapshot.root,
      env,
      dir,
    );
    while (!server.ready) {
      ensureRunning();
      if (server.stopped || server.spawnError)
        throw new Error(
          `Owned server failed before readiness: ${server.spawnError ?? JSON.stringify(server.exit)}`,
        );
      if (performance.now() >= deadline)
        throw new Error(
          "120-second sample deadline reached during owned server startup",
        );
      await sleep(100);
    }
    const health = await fetch(endpoint + "/api/health", {
      signal: AbortSignal.timeout(
        Math.max(1, Math.floor(Math.min(3000, deadline - performance.now()))),
      ),
    });
    if (!health.ok || !(await health.json()).ok)
      throw new Error("Owned server did not pass health check");
    ensureRunning();
    const harnessEnv = { ...env };
    delete harnessEnv.STRAHOV_PERF_TELEMETRY;
    harness = launch(
      "harness",
      [
        "--import",
        "tsx",
        join(snapshot.root, "scripts/performance-diverse.mjs"),
        snapshot.root,
        endpoint,
        String(count),
        String(seconds),
        "crowded",
        rawPath,
        String(warmupSeconds),
        String(count),
      ],
      snapshot.root,
      harnessEnv,
      dir,
    );
    await within(
      harness.closed,
      deadline - performance.now(),
      "120-second sample deadline reached during network workload",
    );
    ensureRunning();
    if (harness.spawnError || harness.exit.code !== 0)
      throw new Error(
        `Owned harness failed: ${harness.spawnError ?? JSON.stringify(harness.exit)}`,
      );
    if (server.stopped)
      throw new Error("Owned server exited before harness finished");
    sample.status = "completed";
  } catch (error) {
    sample.status = "failed";
    sample.errors.push(errorText(error));
  } finally {
    // Only direct child process handles created by this sample are terminated.
    // No port owner lookup, shell kill command, foreign PID or inherited server.
    for (const record of [harness, server])
      try {
        await stop(record);
      } catch (error) {
        sample.status = "failed";
        sample.errors.push(errorText(error));
      }
    sample.server = processInfo(server);
    sample.harness = processInfo(harness);
    sample.endedAt = new Date().toISOString();
  }
  try {
    const raw = JSON.parse(await readFile(rawPath, "utf8"));
    const requiredNumbers = [
      "startedAt",
      "endedAt",
      "durationMs",
      "aggregateDownKBps",
      "aggregateUpKBps",
      "tickHzServerClock",
      "motionHz",
      "minRowsPerMotion",
      "maxRowsPerMotion",
      "resyncsDuringMeasurement",
    ];
    if (
      !requiredNumbers.every((name) => finite(raw[name])) ||
      raw.endedAt <= raw.startedAt ||
      !Array.isArray(raw.errors)
    )
      throw new Error("Incomplete or invalid network report schema");
    if (
      raw.sourceSnapshotId !== snapshot.sourceSnapshotId ||
      raw.endpoint !== endpoint ||
      raw.count !== count ||
      raw.expectedPopulation !== count ||
      raw.authenticatedRooms !== count
    )
      throw new Error(
        "Network report provenance/cohort differs from this owned sample",
      );
    const metricNames = [
      "durationMs",
      "aggregateDownKBps",
      "aggregateUpKBps",
      "monitorDownKBps",
      "monitorUpKBps",
      "monitorMotionBytesMedian",
      "monitorMotionBytesP95",
      "tickHzObserved",
      "tickHzServerClock",
      "motionHz",
      "motionGapP95Ms",
      "motionGapP99Ms",
      "ackAgeP95Ms",
      "ackAgeP99Ms",
      "ackLagCommandsP95",
      "minRowsPerMotion",
      "maxRowsPerMotion",
      "movingClients",
      "resyncsDuringMeasurement",
      "maxBufferedBytes",
    ];
    sample.network = Object.fromEntries(
      metricNames.map((name) => [name, raw[name] ?? null]),
    );
    sample.network.monitorMotionPackets =
      raw.rawMonitor?.motionTimes?.length ?? null;
    sample.network.monitorInputPackets =
      raw.rawMonitor?.inputTimes?.length ?? null;
    sample.network.applicationErrorCount = raw.errors.length;
    sample.network.applicationErrors = raw.errors;
    sample.network.stopReason = raw.stopReason;
    sample.telemetry = await analyzeTelemetry(
      telemetryPath,
      raw.startedAt,
      raw.endedAt,
    );
    if (
      !sample.telemetry.includedIntervals ||
      sample.telemetry.malformed.length
    )
      throw new Error(
        "No complete valid recording telemetry, or malformed telemetry lines",
      );
    if (raw.minRowsPerMotion !== count || raw.maxRowsPerMotion !== count)
      sample.qualityIssues.push(
        "Authenticated population changed during recording",
      );
    if (raw.movingClients !== count)
      sample.qualityIssues.push(
        "Not every requested client moved at least one metre",
      );
    if (raw.resyncsDuringMeasurement)
      sample.qualityIssues.push(
        `${raw.resyncsDuringMeasurement} authority resync flags`,
      );
    if (raw.errors.length)
      sample.qualityIssues.push(`${raw.errors.length} application errors`);
    if (raw.stopReason !== "deadline" || raw.durationMs < seconds * 1000 - 100)
      sample.qualityIssues.push(
        "Recording did not complete the requested duration",
      );
    sample.eligibleForComparison =
      sample.status === "completed" &&
      raw.minRowsPerMotion === count &&
      raw.maxRowsPerMotion === count &&
      raw.stopReason === "deadline" &&
      raw.durationMs >= seconds * 1000 - 100;
    sample.functionalPass =
      sample.status === "completed" && sample.qualityIssues.length === 0;
  } catch (error) {
    sample.status = "failed";
    sample.errors.push(`Report analysis: ${errorText(error)}`);
    sample.eligibleForComparison = false;
    sample.functionalPass = false;
  }
  await writeFile(
    join(dir, "sample-summary.json"),
    JSON.stringify(sample, null, 2) + "\n",
  );
  return sample;
}

function comparisons(samples) {
  const metrics = [
    "aggregateDownKBps",
    "aggregateUpKBps",
    "monitorMotionPackets",
    "monitorInputPackets",
    "tickHzServerClock",
    "motionHz",
    "ackAgeP95Ms",
    "ackAgeP99Ms",
    "resyncsDuringMeasurement",
    "applicationErrorCount",
    "timeWeightedSingleCoreCpuPercent",
    "rssPeakBytes",
    "eventLoopP95WindowMedianMs",
    "eventLoopP99WindowMedianMs",
    "eventLoopMaxMs",
  ];
  const byLabel = Object.fromEntries(
    ["A", "B"].map((label) => [
      label,
      samples.filter(
        (sample) => sample.label === label && sample.eligibleForComparison,
      ),
    ]),
  );
  const result = {};
  for (const metric of metrics) {
    const read = (sample) =>
      sample.network?.[metric] ?? sample.telemetry?.[metric];
    const aValues = byLabel.A.map(read).filter(finite),
      bValues = byLabel.B.map(read).filter(finite);
    const a = median(aValues),
      b = median(bValues);
    result[metric] = {
      baselineMedian: a,
      candidateMedian: b,
      baselineSamples: aValues.length,
      candidateSamples: bValues.length,
      candidateMinusBaseline: a !== null && b !== null ? b - a : null,
      differencePercent:
        a !== null && a !== 0 && b !== null ? ((b - a) / a) * 100 : null,
    };
  }
  return {
    note: "Medians use completed, provenance-matching, full-population/duration samples. Resyncs and application errors are NOT excluded to hide instability; inspect functionalPass and every qualityIssues list. Missing/failed samples stay in samples and make the planned comparison incomplete.",
    eligibleBaselineSamples: byLabel.A.length,
    eligibleCandidateSamples: byLabel.B.length,
    completePlannedComparison:
      byLabel.A.length === repetitions && byLabel.B.length === repetitions,
    metrics: result,
  };
}

if (
  contained(baseline, output) ||
  contained(candidate, output) ||
  output === baseline ||
  output === candidate
)
  throw new Error("Output must be outside both frozen snapshots.");
await mkdir(output, { recursive: true });
if ((await readdir(output)).length)
  throw new Error(
    "OUTPUT_DIR must be empty; existing evidence is never overwritten.",
  );
const cpuModels = new Map();
for (const cpu of os.cpus())
  cpuModels.set(cpu.model, (cpuModels.get(cpu.model) ?? 0) + 1);
const summary = {
  schema: "strahov-network-checkpoint-comparison-v1",
  startedAt: new Date().toISOString(),
  runnerPath: import.meta.filename,
  runnerSha256: await fileHash(import.meta.filename),
  options: {
    baseline,
    candidate,
    output,
    endpoint,
    count,
    repetitions,
    seconds,
    warmupSeconds,
    sampleTimeoutMs,
    logLimitBytes,
  },
  runtime: {
    node: process.version,
    executable: process.execPath,
    platform: process.platform,
    arch: process.arch,
    osRelease: os.release(),
    osVersion: os.version(),
    cpuModels: [...cpuModels].map(([model, logicalCount]) => ({
      model,
      logicalCount,
    })),
    availableParallelism: os.availableParallelism(),
    totalMemoryBytes: os.totalmem(),
  },
  scope:
    "Real SDK sessions and unchanged frozen production server code through tsx; isolated loopback; sequential fresh-server A/B then B/A. Six diverse profiles. No browser, GPU, artificial Internet latency/loss, build or test run. Payload rates are decimal KB/s and exclude WebSocket/TCP/TLS framing. CPU is server-only telemetry, not total server+client cost. No capacity, GPU/FPS or public-network claim.",
  snapshots: [],
  samples: [],
  errors: [],
};
const saveSummary = async () => {
  summary.comparison = comparisons(summary.samples);
  await writeFile(
    join(output, "summary.json"),
    JSON.stringify(summary, null, 2) + "\n",
  );
};
try {
  await saveSummary();
  for (const [label, root] of [
    ["A", baseline],
    ["B", candidate],
  ]) {
    console.log(`${label}: verifying every manifested snapshot file`);
    summary.snapshots.push(await inspectSnapshot(label, root));
    await saveSummary();
  }
  if (summary.snapshots.some((snapshot) => !snapshot.integrityPassed))
    throw new Error(
      "Frozen snapshot integrity verification failed; no measurements started",
    );
  for (let repetition = 1; repetition <= repetitions; repetition++) {
    const order =
      repetition % 2 ? summary.snapshots : [...summary.snapshots].reverse();
    for (const snapshot of order) {
      ensureRunning();
      console.log(
        `Sample ${summary.samples.length + 1}/${repetitions * 2}: repetition ${repetition}, ${snapshot.label}, ${count} clients, ${seconds}s`,
      );
      const sample = await runSample(
        snapshot,
        repetition,
        summary.samples.length + 1,
      );
      summary.samples.push(sample);
      await saveSummary();
      console.log(
        `${sample.label} ${sample.status}; functionalPass=${sample.functionalPass}; details=${join(sample.sampleDir, "sample-summary.json")}`,
      );
      if (owned.size)
        throw new Error(
          "An owned child did not stop; refusing to overlap the next sample",
        );
    }
  }
} catch (error) {
  summary.errors.push(errorText(error));
} finally {
  for (const record of [...owned])
    try {
      await stop(record);
    } catch (error) {
      summary.errors.push(errorText(error));
    }
  summary.endedAt = new Date().toISOString();
  summary.interrupted = interrupted ?? null;
  await saveSummary();
}
console.log(
  JSON.stringify({
    summaryPath: join(output, "summary.json"),
    completePlannedComparison: summary.comparison.completePlannedComparison,
    samples: summary.samples.length,
    errors: summary.errors,
  }),
);
if (
  summary.errors.length ||
  !summary.comparison.completePlannedComparison ||
  summary.samples.some((sample) => !sample.functionalPass)
)
  process.exitCode = 1;
