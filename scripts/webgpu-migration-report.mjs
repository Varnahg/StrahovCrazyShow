/** Offline evidence report. Never executes log contents or changes raw inputs.
 * Usage: node scripts/webgpu-migration-report.mjs manifest.json report.json
 * Report generation is not migration approval; see docs/performance/webgpu-acceptance.md.
 */
import { readFile, writeFile, stat, realpath, mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const BACKENDS = new Set(["webgl2", "webgpu", "webgpu-fast"]);
const CHANNELS = [
  "effect",
  "shader",
  "pipeline",
  "validation",
  "texture",
  "device",
  "render",
];
const PHASES = [
  "glslToSpirv",
  "spirvToWgsl",
  "compilerLoad",
  "shaderPreparation",
  "shaderModule",
  "shaderValidation",
  "syncPipeline",
  "asyncPipeline",
  "submit",
];
const METRICS = [
  "calls",
  "completed",
  "failures",
  "pending",
  "cpuTotalMs",
  "cpuMaxMs",
  "asyncTotalMs",
  "asyncMaxMs",
];
const ERROR_KINDS = new Set([
  "unhandled-rejection",
  "console-error",
  "js-error",
  "render-fault",
  "webgpu-validation-error",
  "startup-error",
]);
const ERROR_TEXT =
  /GPUValidationError|GPUOutOfMemoryError|GPUInternalError|GLSL compilation failed|shader compilation (?:failed|error)|(?:invalid|failed to create)\s+(?:ShaderModule|RenderPipeline|CommandBuffer)|uncaught\b|unhandled\s+(?:promise\s+)?rejection|(?:device|context) (?:was )?lost|<html\b|<!doctype html/i;
const DEFAULT_POLICY = Object.freeze({
  minimumDurationSeconds: 10,
  requiredRepeats: 3,
  durationToleranceSeconds: 0.5,
  maxTemperatureDeltaC: 3,
  maxClockDeltaPercent: 5,
  positionToleranceMetres: 0,
  angleToleranceRadians: 0,
  fovToleranceRadians: 0,
});
const object = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const finite = (v) => typeof v === "number" && Number.isFinite(v);
const count = (v) => Number.isSafeInteger(v) && v >= 0;
const text = (v) => typeof v === "string" && v.trim().length > 0;
const hash = (v) => createHash("sha256").update(v).digest("hex");
const canonical = (v) =>
  JSON.stringify(v, (_key, value) =>
    object(value)
      ? Object.fromEntries(
          Object.entries(value).sort(([a], [b]) => a.localeCompare(b)),
        )
      : value,
  );
const same = (a, b) => canonical(a) === canonical(b);
const pathKey = (path) =>
  process.platform === "win32" ? path.toLowerCase() : path;
const statusFor = (reasons) =>
  reasons.some((r) => r.severity === "invalid")
    ? "invalid"
    : reasons.length
      ? "unverified"
      : "valid";

export function frameStatistics(frames) {
  if (
    !Array.isArray(frames) ||
    !frames.length ||
    frames.some((v) => !finite(v) || v <= 0)
  )
    throw new Error(
      "frameIntervalsMs must be a nonempty array of finite positive numbers",
    );
  const sorted = frames.slice().sort((a, b) => a - b);
  const sum = frames.reduce((total, value) => total + value, 0);
  if (!finite(sum)) throw new Error("Frame interval sum is not finite");
  return {
    frames: frames.length,
    durationSecondsFromFrames: sum / 1000,
    fps: (frames.length * 1000) / sum,
    p95Ms: sorted[Math.ceil(sorted.length * 0.95) - 1],
    p99Ms: sorted[Math.ceil(sorted.length * 0.99) - 1],
    maximumMs: sorted.at(-1),
    stalls: Object.fromEntries(
      [50, 100, 250, 1000].map((threshold) => [
        threshold,
        frames.filter((v) => v >= threshold).length,
      ]),
    ),
  };
}

function policyFor(manifest) {
  const policy = { ...DEFAULT_POLICY, ...manifest.policy };
  for (const key of Object.keys(DEFAULT_POLICY))
    if (!finite(policy[key]) || policy[key] < 0)
      throw new Error(`Invalid policy.${key}`);
  if (!Number.isInteger(policy.requiredRepeats) || policy.requiredRepeats < 3)
    throw new Error(
      "policy.requiredRepeats must be an integer of at least three",
    );
  if (
    policy.minimumDurationSeconds <= 0 ||
    policy.durationToleranceSeconds >= policy.minimumDurationSeconds
  )
    throw new Error(
      "Duration tolerance must be smaller than the positive minimum duration",
    );
  return policy;
}

function collector() {
  const reasons = [];
  return {
    reasons,
    add(severity, code, detail, evidence) {
      reasons.push({
        severity,
        code,
        detail,
        ...(evidence ? { evidence } : {}),
      });
    },
    get status() {
      return statusFor(reasons);
    },
  };
}

function inputReader(baseDirectory) {
  const cache = new Map();
  const inputs = new Map();
  const observed = new Map();
  const declaredPaths = new Set();
  const cacheBudget = 32 * 1024 * 1024;
  let cachedBytes = 0;
  return {
    inputs,
    declaredPaths,
    async verifyStable() {
      for (const [key, initial] of observed) {
        try {
          const current = await stat(initial.path);
          if (
            current.size !== initial.size ||
            current.mtimeMs !== initial.mtimeMs
          )
            inputs.get(key).stable = false;
        } catch {
          inputs.get(key).stable = false;
        }
      }
      return [...inputs.values()].filter((input) => !input.stable);
    },
    async read(reference) {
      const path = typeof reference === "string" ? reference : reference?.path;
      if (!text(path)) throw new Error("Missing evidence path");
      const absolute = resolve(baseDirectory, path);
      declaredPaths.add(absolute);
      let result = cache.get(absolute);
      if (!result) {
        const actualPath = await realpath(absolute);
        declaredPaths.add(actualPath);
        const before = await stat(actualPath);
        const bytes = await readFile(actualPath);
        const after = await stat(actualPath);
        result = {
          path,
          absolute: actualPath,
          sha256: hash(bytes),
          bytes: bytes.length,
          stable:
            before.size === after.size && before.mtimeMs === after.mtimeMs,
          text: bytes.toString("utf8"),
        };
        const key = pathKey(actualPath),
          previous = inputs.get(key);
        if (previous) {
          if (!previous.observedSha256.includes(result.sha256))
            previous.observedSha256.push(result.sha256);
          previous.stable &&=
            result.stable && previous.sha256 === result.sha256;
          result.stable = previous.stable;
        } else {
          inputs.set(key, {
            path,
            absolute: actualPath,
            sha256: result.sha256,
            bytes: result.bytes,
            stable: result.stable,
            observedSha256: [result.sha256],
          });
          observed.set(key, {
            path: actualPath,
            size: after.size,
            mtimeMs: after.mtimeMs,
          });
        }
        // Diagnostic archives can be large. Reuse a bounded amount of source
        // text, retaining only small identity records after eviction.
        if (result.bytes <= cacheBudget) {
          while (cache.size && cachedBytes + result.bytes > cacheBudget) {
            const first = cache.keys().next().value;
            cachedBytes -= cache.get(first).bytes;
            cache.delete(first);
          }
          cache.set(absolute, result);
          cachedBytes += result.bytes;
        }
      }
      return {
        ...result,
        hashMatches:
          reference?.sha256 === undefined ||
          (typeof reference.sha256 === "string" &&
            reference.sha256.toLowerCase() === result.sha256),
      };
    },
  };
}

async function readEvidence(reader, reference, label, findings) {
  try {
    const value = await reader.read(reference);
    if (!value.stable)
      findings.add(
        "unverified",
        "input-changing",
        `${label} changed while being read`,
        value.path,
      );
    if (!value.hashMatches)
      findings.add(
        "invalid",
        "input-hash-mismatch",
        `${label} differs from the declared SHA-256`,
        value.path,
      );
    return value;
  } catch (error) {
    findings.add(
      "unverified",
      "input-unavailable",
      `${label}: ${error.message}`,
      typeof reference === "string" ? reference : reference?.path,
    );
    return null;
  }
}

function validateHealth(raw, findings) {
  const health = raw?.renderHealth;
  if (!object(health)) {
    findings.add(
      "unverified",
      "health-missing",
      "Both renderer health boundaries are required",
    );
    return;
  }
  if (health.valid === false)
    findings.add(
      "invalid",
      "health-invalid",
      "Benchmark explicitly reports invalid renderer health",
    );
  else if (health.valid !== true)
    findings.add(
      "unverified",
      "health-validity-missing",
      "Benchmark health.valid is missing",
    );
  for (const side of ["start", "end"]) {
    const value = health[side];
    if (!object(value)) {
      findings.add(
        "unverified",
        "health-boundary-missing",
        `Missing health.${side}`,
      );
      continue;
    }
    if (value.valid === false || (text(value.phase) && value.phase !== "ready"))
      findings.add(
        "invalid",
        "health-not-ready",
        `${side} renderer is not ready and valid`,
      );
    else if (value.valid !== true || value.phase !== "ready")
      findings.add(
        "unverified",
        "health-state-missing",
        `Incomplete ${side} health state`,
      );
    for (const key of [
      "rendererId",
      "generation",
      "errorCount",
      "pendingOperations",
    ])
      if (!count(value[key]))
        findings.add(
          "unverified",
          "health-counter-missing",
          `${side}.${key} must be a nonnegative integer`,
        );
    if (value.purpose !== "game")
      findings.add(
        value.purpose ? "invalid" : "unverified",
        "health-purpose",
        `${side} health must belong to the game`,
      );
    if (value.errorCount > 0 || value.pendingOperations > 0)
      findings.add(
        "invalid",
        "health-errors-or-pending",
        `${side}: errors=${value.errorCount}, pending=${value.pendingOperations}`,
      );
    const counts = CHANNELS.map((key) => value.counts?.[key]);
    if (!counts.every(count))
      findings.add(
        "unverified",
        "health-channels-missing",
        `${side} channel counters are incomplete`,
      );
    else if (
      counts.some((n) => n > 0) ||
      counts.reduce((a, b) => a + b, 0) !== value.errorCount
    )
      findings.add(
        "invalid",
        "health-channel-errors",
        `${side} channel counters report errors or disagree with the total`,
      );
    if (Array.isArray(value.firstErrors) && value.firstErrors.length)
      findings.add(
        "invalid",
        "health-recorded-errors",
        `${side} retains error records`,
      );
  }
  if (object(health.start) && object(health.end))
    for (const key of ["rendererId", "generation"])
      if (health.start[key] !== health.end[key])
        findings.add(
          "invalid",
          "health-generation-changed",
          `${key} changed during the sample`,
        );
}

function compilationSummary(raw, backend, findings) {
  const snapshots = raw?.compilation;
  if (!object(snapshots?.start) || !object(snapshots?.end)) {
    findings.add(
      "unverified",
      "compilation-missing",
      "Compilation start/end snapshots are required",
    );
    return null;
  }
  const { start, end } = snapshots;
  const native = backend !== "webgl2";
  if (start.generation !== end.generation)
    findings.add(
      "invalid",
      "compilation-generation-changed",
      "Compilation counters changed generation",
    );
  const deltas = {};
  for (const side of ["start", "end"]) {
    const snapshot = snapshots[side];
    if (snapshot.active !== true || !count(snapshot.generation))
      findings.add(
        "unverified",
        "compilation-inactive",
        `${side} compilation profile is inactive or incomplete`,
      );
    if (native && snapshot.backend !== "webgpu")
      findings.add(
        "invalid",
        "compilation-backend",
        `${side} profile is not WebGPU`,
      );
    if (!count(snapshot.observerErrors) || snapshot.observerErrors > 0)
      findings.add(
        "unverified",
        "compilation-observer-errors",
        `${side} monitoring is incomplete`,
      );
    if (native && typeof snapshot.attachedAfterDeviceCreation !== "boolean")
      findings.add(
        "unverified",
        "compilation-startup-coverage-unknown",
        `${side} profiler does not disclose its attachment boundary`,
      );
    if (native) {
      for (const hook of [
        "engine._compileRawShaderToSpirV",
        "engine.prepareGlslangAndTintAsync",
        "engine._preparePipelineContextAsync",
        "device.createShaderModule",
        "device.createRenderPipeline",
        "device.createRenderPipelineAsync",
        "queue.submit",
        "module.getCompilationInfo",
      ])
        if (snapshot.hooks?.[hook] !== "installed")
          findings.add(
            "unverified",
            "compilation-hook-unavailable",
            `${side}: ${hook} is not installed`,
          );
    }
    for (const phase of PHASES) {
      const metric = snapshot.metrics?.[phase];
      if (
        !object(metric) ||
        METRICS.some((key) => !finite(metric[key]) || metric[key] < 0) ||
        ["calls", "completed", "failures", "pending"].some(
          (key) => !count(metric[key]),
        )
      ) {
        findings.add(
          "unverified",
          "compilation-metric-missing",
          `${side}.${phase} is incomplete`,
        );
        continue;
      }
      if (metric.failures > 0 || metric.pending > 0)
        findings.add(
          "invalid",
          "compilation-failure-or-pending",
          `${side}.${phase}: failures=${metric.failures}, pending=${metric.pending}`,
        );
      if (
        metric.completed + metric.pending !== metric.calls ||
        metric.failures > metric.completed
      )
        findings.add(
          "invalid",
          "compilation-counter-inconsistent",
          `${side}.${phase} counters disagree`,
        );
      if (
        native &&
        ["glslToSpirv", "spirvToWgsl", "compilerLoad"].includes(phase) &&
        metric.calls > 0
      )
        findings.add(
          "invalid",
          "native-converter-used",
          `${side}.${phase} ran in the native WGSL candidate`,
        );
    }
  }
  for (const phase of PHASES) {
    const a = start.metrics?.[phase],
      b = end.metrics?.[phase];
    if (!a || !b || METRICS.some((key) => !finite(a[key]) || !finite(b[key])))
      continue;
    for (const key of METRICS.filter((key) => key !== "pending"))
      if (b[key] < a[key])
        findings.add(
          "invalid",
          "compilation-counter-regressed",
          `${phase}.${key} decreased`,
        );
    deltas[phase] = Object.fromEntries(
      ["calls", "completed", "failures", "cpuTotalMs", "asyncTotalMs"].map(
        (key) => [key, b[key] - a[key]],
      ),
    );
    deltas[phase].lifetimeCpuMaxMsAtEnd = b.cpuMaxMs;
    deltas[phase].lifetimeAsyncMaxMsAtEnd = b.asyncMaxMs;
  }
  if (start.attachedAfterDeviceCreation !== end.attachedAfterDeviceCreation)
    findings.add(
      "invalid",
      "compilation-attachment-changed",
      "Profiler attachment identity changed",
    );
  if (native && (!finite(deltas.submit?.calls) || deltas.submit.calls <= 0))
    findings.add(
      "unverified",
      "submission-not-observed",
      "No successful submission interval was observed",
    );
  return {
    start,
    end,
    deltas,
    startupPhaseCoverage: !native
      ? "not-applicable"
      : start.attachedAfterDeviceCreation === true
        ? "partial-engine-init-excluded"
        : start.attachedAfterDeviceCreation === false
          ? "initial-device-observed"
          : "unknown",
    converterObservationScope:
      "Only the observed profiler lifetime; absence of calls does not establish behavior before attachment.",
    scope:
      "CPU API-call totals; async completion latencies can overlap. Maxima are lifetime values, not interval maxima. Shared cache and last-frame bundle counters are not per-run distributions.",
  };
}

async function consoleEvidence(descriptor, reader, findings) {
  if (descriptor?.complete !== true)
    findings.add(
      "unverified",
      "console-incomplete",
      "Console capture must cover startup through sample end",
    );
  const file = await readEvidence(reader, descriptor, "console", findings);
  if (!file) return [];
  let rows;
  if (descriptor.format === "text")
    rows = file.text
      .split(/\r?\n/)
      .map((message, i) => ({ message, line: i + 1 }));
  else if (descriptor.format === "json") {
    try {
      const value = JSON.parse(file.text);
      rows = Array.isArray(value) ? value : value.entries;
      if (!Array.isArray(rows))
        throw new Error("Expected an array or {entries:[]}");
      if (
        value.truncated === true ||
        value.hasMore === true ||
        value.dropped > 0
      )
        findings.add(
          "unverified",
          "console-truncated",
          "Console export reports omitted messages",
          file.path,
        );
    } catch (error) {
      findings.add("unverified", "console-parse", error.message, file.path);
      return [];
    }
  } else {
    findings.add(
      "unverified",
      "console-format",
      "Specify console format json or text",
      file.path,
    );
    return [];
  }
  const failures = [];
  rows.forEach((row, i) => {
    if (
      typeof row !== "string" &&
      (!object(row) ||
        ![row.message, row.text, row.description].some(
          (value) => typeof value === "string",
        ))
    )
      findings.add(
        "unverified",
        "console-entry-shape",
        "Console entry lacks a recognized text field",
        `${file.path}:${i + 1}`,
      );
    const level = String(row?.level ?? row?.type ?? "").toLowerCase();
    const message =
      typeof row === "string"
        ? row
        : String(
            row?.message ?? row?.text ?? row?.description ?? canonical(row),
          );
    if (
      ["error", "fatal", "assert"].includes(level) ||
      ERROR_TEXT.test(message) ||
      /^\s*(?:error|fatal|uncaught)\b/i.test(message)
    )
      failures.push({
        source: file.path,
        line: row?.line ?? i + 1,
        kind: level || "console-text",
        message,
        record: row,
      });
  });
  for (const failure of failures)
    findings.add(
      "invalid",
      "console-error",
      failure.message,
      `${failure.source}:${failure.line}`,
    );
  return failures;
}

async function diagnosticEvidence(run, reader, findings) {
  const descriptor = run.evidence?.diagnostics;
  if (descriptor?.complete !== true)
    findings.add(
      "unverified",
      "diagnostics-incomplete",
      "JSONL capture must cover the complete startup-to-end sequence",
    );
  const paths = descriptor?.paths;
  if (!Array.isArray(paths) || !paths.length)
    findings.add(
      "unverified",
      "diagnostics-missing",
      "At least one JSONL file is required",
    );
  const selected = new Map();
  const conflicts = [];
  let foundSession = false;
  for (const reference of Array.isArray(paths) ? paths : []) {
    const file = await readEvidence(reader, reference, "diagnostics", findings);
    if (!file) continue;
    const lines = file.text.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      if (!lines[i].trim()) continue;
      let value;
      try {
        value = JSON.parse(lines[i]);
      } catch (error) {
        findings.add(
          "unverified",
          "diagnostics-parse",
          error.message,
          `${file.path}:${i + 1}`,
        );
        continue;
      }
      if (!object(value)) {
        findings.add(
          "unverified",
          "diagnostics-envelope",
          "JSONL envelope is not an object",
          `${file.path}:${i + 1}`,
        );
        continue;
      }
      if (value.sessionId !== run.sessionId) continue;
      foundSession = true;
      if (
        value.source?.buildSnapshotId &&
        value.source.buildSnapshotId !== run.sourceSnapshotId
      )
        findings.add(
          "invalid",
          "diagnostics-source-mismatch",
          "JSONL source differs from the run snapshot",
          `${file.path}:${i + 1}`,
        );
      if (
        (value.type === "batch" || count(value.seq)) &&
        !text(value.source?.buildSnapshotId)
      )
        findings.add(
          "unverified",
          "diagnostics-source-missing",
          "JSONL batch lacks buildSnapshotId",
          `${file.path}:${i + 1}`,
        );
      const records =
        value.type === "batch"
          ? value.records
          : count(value.seq)
            ? [value]
            : [];
      if (!Array.isArray(records)) {
        findings.add(
          "unverified",
          "diagnostics-records",
          "Malformed records",
          `${file.path}:${i + 1}`,
        );
        continue;
      }
      for (const record of records) {
        if (
          !object(record) ||
          !count(record.seq) ||
          !finite(record.atMs) ||
          !text(record.kind) ||
          !object(record.data)
        ) {
          findings.add(
            "unverified",
            "diagnostics-record",
            "Malformed diagnostic record",
            `${file.path}:${i + 1}`,
          );
          continue;
        }
        if (record.seq < descriptor.fromSeq || record.seq > descriptor.toSeq)
          continue;
        const previous = selected.get(record.seq);
        if (previous && !same(previous.record, record)) {
          findings.add(
            "invalid",
            "diagnostics-conflicting-sequence",
            `Conflicting copies of seq ${record.seq}`,
            `${file.path}:${i + 1}`,
          );
          conflicts.push({ record, source: file.path, line: i + 1 });
        } else if (!previous)
          selected.set(record.seq, { record, source: file.path, line: i + 1 });
      }
    }
  }
  if (!foundSession)
    findings.add(
      "unverified",
      "diagnostics-session-missing",
      "The requested session was not found",
    );
  const bounds =
    count(descriptor?.fromSeq) &&
    count(descriptor?.toSeq) &&
    descriptor.toSeq >= descriptor.fromSeq;
  const rows = [...selected.values()].sort(
    (a, b) => a.record.seq - b.record.seq,
  );
  if (!bounds)
    findings.add(
      "unverified",
      "diagnostics-bounds",
      "Explicit fromSeq/toSeq bounds are required",
    );
  else {
    let expected = descriptor.fromSeq;
    for (const { record } of rows) {
      if (record.seq !== expected)
        findings.add(
          "unverified",
          "diagnostics-gap",
          `Missing sequences ${expected}..${record.seq - 1}`,
        );
      expected = record.seq + 1;
    }
    if (expected <= descriptor.toSeq)
      findings.add(
        "unverified",
        "diagnostics-gap",
        `Missing sequences ${expected}..${descriptor.toSeq}`,
      );
  }
  for (let i = 1; i < rows.length; i++)
    if (rows[i].record.atMs < rows[i - 1].record.atMs)
      findings.add(
        "invalid",
        "diagnostics-time-regressed",
        "Monotonic record time went backwards",
      );
  const start = selected.get(descriptor?.benchmarkStartSeq)?.record;
  if (start?.kind !== "benchmark-start")
    findings.add(
      "unverified",
      "benchmark-start-missing",
      "benchmarkStartSeq must identify a benchmark-start record",
    );
  const failures = [],
    work = [];
  for (const row of [...rows, ...conflicts]) {
    const { record } = row;
    if (record.kind === "recording-gap")
      findings.add(
        "unverified",
        "diagnostics-recording-gap",
        "Recorder explicitly reports discarded evidence",
        `${row.source}:${row.line}#${record.seq}`,
      );
    const failure =
      ERROR_KINDS.has(record.kind) ||
      /context-lost|device-lost/.test(record.kind) ||
      (record.kind === "lighting-preparation" &&
        record.data.status !== "complete") ||
      (record.kind === "webgpu-work" &&
        (record.data.error ||
          record.data.failures > 0 ||
          record.data.status === "failed")) ||
      (record.kind === "resource-timing" &&
        record.data.responseStatus >= 400 &&
        /\.(?:png|jpe?g|webp|glb|gltf|ktx2?|dds|fx|wgsl|wasm)(?:$|[?#])/i.test(
          record.data.source ?? "",
        ));
    if (failure) {
      const item = {
        source: row.source,
        line: row.line,
        seq: record.seq,
        kind: record.kind,
        message: String(
          record.data.message ??
            record.data.reason ??
            record.data.status ??
            canonical(record.data),
        ),
        record,
      };
      failures.push(item);
      findings.add(
        "invalid",
        "diagnostic-error",
        item.message,
        `${row.source}:${row.line}#${record.seq}`,
      );
    }
    if (record.kind === "webgpu-work") work.push(record);
    if (start && record.seq >= start.seq) {
      if (
        (record.kind === "frame-window" &&
          (record.data.visibility !== "visible" ||
            record.data.afterVisibilityChange === true)) ||
        (record.kind === "browser-state" && record.data.visibility === "hidden")
      )
        findings.add(
          "invalid",
          "sample-not-foreground",
          "The measurement crossed hidden/transition visibility",
          `${row.source}:${row.line}`,
        );
    }
  }
  const preceding = rows
    .map((row) => row.record)
    .filter((record) => !start || record.seq < start.seq);
  const ready = preceding.findLast((record) => record.kind === "game-ready");
  const mode = preceding.findLast((record) => record.kind === "mode-change");
  const renderer = preceding.findLast(
    (record) =>
      record.kind === "renderer-ready" && (!ready || record.seq < ready.seq),
  );
  const preparation = preceding.findLast(
    (record) => record.kind === "lighting-preparation",
  );
  if (run.startup?.status === "ready") {
    if (!ready || !mode)
      findings.add(
        "unverified",
        "startup-proof-missing",
        "mode-change and game-ready records are required",
      );
    if (!renderer)
      findings.add(
        "unverified",
        "renderer-startup-proof-missing",
        "renderer-ready evidence is required",
      );
    else if (
      renderer.data.backend !== (run.backend === "webgl2" ? "webgl2" : "webgpu")
    )
      findings.add(
        renderer.data.backend ? "invalid" : "unverified",
        "renderer-startup-backend",
        "Startup renderer identity differs from the manifest",
      );
    if (preparation?.data.status !== "complete")
      findings.add(
        "unverified",
        "preparation-proof-missing",
        "Completed lighting preparation was not demonstrated",
      );
    if (
      mode &&
      renderer &&
      ready &&
      !(
        mode.seq < renderer.seq &&
        renderer.seq < ready.seq &&
        preparation?.seq > mode.seq &&
        preparation.seq < ready.seq
      )
    )
      findings.add(
        "invalid",
        "startup-order-inconsistent",
        "The latest startup attempt did not demonstrate ordered renderer/preparation/game readiness",
      );
  }
  return {
    initialState: start?.data ?? null,
    initialAtMs: start?.atMs ?? null,
    lastAtMs: rows.at(-1)?.record.atMs ?? null,
    failures,
    conflicts,
    work,
    startupDurationMs: ready && mode ? ready.atMs - mode.atMs : null,
    startupTimeline: {
      modeChangeAtMs: mode?.atMs ?? null,
      rendererReadyAtMs: renderer?.atMs ?? null,
      gameReadyAtMs: ready?.atMs ?? null,
      engineInitializationMs: renderer?.data.durationMs ?? null,
    },
    sequence: {
      from: descriptor?.fromSeq ?? null,
      to: descriptor?.toSeq ?? null,
      records: rows.length,
    },
  };
}

function validateObservedView(value, label, findings) {
  const positions = [value?.position, value?.camera?.position];
  if (
    positions.some(
      (position) =>
        !object(position) ||
        !["x", "y", "z"].every((key) => finite(position[key])),
    ) ||
    ![
      value?.yaw,
      value?.pitch,
      value?.camera?.fov,
      value?.camera?.minZ,
      value?.camera?.maxZ,
    ].every(finite)
  )
    findings.add(
      "unverified",
      "view-missing",
      `${label} world/camera position, yaw, pitch, FOV and clip distances are required`,
    );
  else if (
    value.camera.fov <= 0 ||
    value.camera.fov >= Math.PI ||
    value.camera.minZ <= 0 ||
    value.camera.maxZ <= value.camera.minZ
  )
    findings.add("invalid", "view-range", `${label} has invalid camera optics`);
}

function validateConditions(run, raw, findings) {
  const c = run.conditions;
  for (const key of [
    "gpuId",
    "browserId",
    "fixtureId",
    "routeId",
    "cacheState",
  ])
    if (!text(c?.[key]))
      findings.add(
        "unverified",
        "condition-missing",
        `Missing conditions.${key}`,
      );
  for (const key of ["visible", "hud"])
    if (c?.[key] !== true)
      findings.add(
        c?.[key] === false ? "invalid" : "unverified",
        "condition-required",
        `${key} must be true`,
      );
  if (c?.other3DScenes !== 0)
    findings.add(
      count(c?.other3DScenes) ? "invalid" : "unverified",
      "other-scenes",
      "No concurrent 3D scene is allowed in the performance sample",
    );
  if (c?.frameCapHz !== null && (!finite(c?.frameCapHz) || c.frameCapHz <= 0))
    findings.add(
      "unverified",
      "frame-cap-missing",
      "Record frameCapHz, or explicit null when unknown",
    );
  const thermal = c?.thermal;
  if (
    !object(thermal) ||
    !["startC", "endC", "minClockMHz", "maxClockMHz"].every((key) =>
      finite(thermal[key]),
    )
  )
    findings.add(
      "unverified",
      "thermal-missing",
      "Temperature boundaries and observed clock range are required",
    );
  else if (
    thermal.minClockMHz <= 0 ||
    thermal.maxClockMHz < thermal.minClockMHz
  )
    findings.add("invalid", "thermal-range", "Invalid observed clock range");
  if (!raw) return;
  if (!text(raw.date) || !finite(Date.parse(raw.date)))
    findings.add(
      "unverified",
      "sample-timestamp-missing",
      "A recorded benchmark completion timestamp is required",
    );
  for (const key of ["viewport", "renderResolution"])
    if (
      !object(raw[key]) ||
      !["width", "height"].every(
        (axis) => Number.isInteger(raw[key][axis]) && raw[key][axis] > 0,
      )
    )
      findings.add(
        "unverified",
        "resolution-missing",
        `Missing positive ${key} dimensions`,
      );
  if (!text(raw.quality))
    findings.add("unverified", "quality-missing", "Missing quality");
  if (!count(raw.avatars) || raw.avatars < 1)
    findings.add(
      "unverified",
      "population-missing",
      "Missing positive avatar count",
    );
  const lod = object(raw.avatarLod) ? Object.values(raw.avatarLod) : [];
  if (!lod.length || !lod.every(count))
    findings.add(
      "unverified",
      "population-end-missing",
      "Missing final LOD population",
    );
  else if (lod.reduce((a, b) => a + b, 0) !== raw.avatars)
    findings.add(
      "invalid",
      "population-changed",
      "Minimum and final avatar populations differ",
    );
  if (!object(raw.weatherAtStart) || !object(raw.weatherAtEnd))
    findings.add(
      "unverified",
      "weather-missing",
      "Weather fixture snapshots are required",
    );
  else if (!same(raw.weatherAtStart, raw.weatherAtEnd))
    findings.add(
      "invalid",
      "weather-changed",
      "Weather changed during the measured interval",
    );
  if (!finite(raw.sceneView?.lightingInstant))
    findings.add(
      "unverified",
      "lighting-missing",
      "An exact lighting UTC instant is required",
    );
  validateObservedView(raw.sceneView, "final", findings);
}

function targetResults(run, targets) {
  const rules = [
    ["minimumFps", run.metrics?.fps, (a, b) => a >= b, ">="],
    ["maximumP95Ms", run.metrics?.p95Ms, (a, b) => a <= b, "<="],
    ["maximumP99Ms", run.metrics?.p99Ms, (a, b) => a <= b, "<="],
    ["maximumFrameMsExclusive", run.metrics?.maximumMs, (a, b) => a < b, "<"],
    [
      "maximumStartupMs",
      run.startup?.observedDurationMs,
      (a, b) => a <= b,
      "<=",
    ],
  ];
  const results = [];
  const known = new Set([...rules.map(([key]) => key), "maximumStalls"]);
  for (const key of Object.keys(targets ?? {}))
    if (!known.has(key))
      results.push({
        target: key,
        limit: targets[key],
        observed: null,
        operator: null,
        met: null,
        reason: "Unknown target name",
      });
  for (const [key, observed, compare, operator] of rules)
    if (targets?.[key] !== undefined) {
      const limit = targets[key];
      results.push({
        target: key,
        limit,
        observed: finite(observed) ? observed : null,
        operator,
        met:
          finite(limit) && limit >= 0 && finite(observed)
            ? compare(observed, limit)
            : null,
      });
    }
  for (const [threshold, limit] of Object.entries(targets?.maximumStalls ?? {}))
    results.push({
      target: `stalls>=${threshold}ms`,
      limit,
      observed: run.metrics?.stalls[threshold] ?? null,
      operator: "<=",
      met:
        count(limit) && count(run.metrics?.stalls[threshold])
          ? run.metrics.stalls[threshold] <= limit
          : null,
    });
  return {
    status:
      run.status !== "valid"
        ? "unverified"
        : !results.length || results.some((r) => r.met === null)
          ? "unverified"
          : results.every((r) => r.met)
            ? "passed"
            : "failed",
    results,
  };
}

async function analyzeRun(entry, reader, policy, targets) {
  const findings = collector();
  for (const key of ["id", "scenario", "sourceSnapshotId", "sessionId"])
    if (!text(entry?.[key]))
      findings.add("unverified", "run-identity-missing", `Missing run.${key}`);
  if (!/^[a-f\d]{64}$/i.test(entry.sourceSnapshotId ?? ""))
    findings.add(
      "unverified",
      "snapshot-hash-missing",
      "sourceSnapshotId must identify the SHA-256 source/assets checkpoint",
    );
  if (!BACKENDS.has(entry.backend))
    findings.add(
      "invalid",
      "backend-unknown",
      `Unknown backend ${entry.backend}`,
    );
  if (!Number.isSafeInteger(entry.order) || entry.order < 0)
    findings.add(
      "unverified",
      "order-missing",
      "An explicit nonnegative capture order is required",
    );
  if (!object(entry.startup) || !text(entry.startup.status))
    findings.add(
      "unverified",
      "startup-status-missing",
      "Explicit startup status is required",
    );
  else if (entry.startup.status !== "ready")
    findings.add(
      "invalid",
      "startup-failed",
      `${entry.startup.status}: ${entry.startup.message ?? "startup did not complete"}`,
    );
  if (!finite(entry.startup?.durationMs) || entry.startup.durationMs < 0)
    findings.add(
      "unverified",
      "startup-duration-missing",
      "Record measured startup duration",
    );
  let raw = null,
    metrics = null,
    benchmarkInput = null;
  if (entry.benchmark) {
    const file = await readEvidence(
      reader,
      entry.benchmark,
      "benchmark",
      findings,
    );
    if (file) {
      benchmarkInput = { path: file.path, sha256: file.sha256 };
      try {
        raw = JSON.parse(file.text);
      } catch (error) {
        findings.add("unverified", "benchmark-json", error.message, file.path);
      }
    }
  } else
    findings.add(
      "unverified",
      "benchmark-missing",
      "No completed benchmark; startup failure is retained",
    );
  if (!object(raw)) {
    if (raw !== null)
      findings.add(
        "invalid",
        "benchmark-shape",
        "Benchmark JSON must be an object",
      );
    raw = null;
  }
  if (raw) {
    try {
      metrics = frameStatistics(raw.frameIntervalsMs);
    } catch (error) {
      findings.add(
        Array.isArray(raw.frameIntervalsMs) ? "invalid" : "unverified",
        "frame-intervals",
        error.message,
      );
    }
    if (raw.sourceSnapshotId !== entry.sourceSnapshotId)
      findings.add(
        raw.sourceSnapshotId ? "invalid" : "unverified",
        "benchmark-source-mismatch",
        "Benchmark source does not match manifest",
      );
    const actualBackend = raw.gpu?.backend;
    if (actualBackend !== (entry.backend === "webgl2" ? "webgl2" : "webgpu"))
      findings.add(
        actualBackend ? "invalid" : "unverified",
        "benchmark-backend-mismatch",
        "Actual backend does not match manifest",
      );
    if (
      entry.backend !== "webgl2" &&
      raw.gpu?.compatibilityMode !== (entry.backend === "webgpu")
    )
      findings.add(
        typeof raw.gpu?.compatibilityMode === "boolean"
          ? "invalid"
          : "unverified",
        "compatibility-mode",
        "Actual WebGPU compatibility mode does not match manifest",
      );
    for (const key of ["renderErrorCount", "assetLoadErrorCount"])
      if (!count(raw[key]))
        findings.add("unverified", "error-counter-missing", `Missing ${key}`);
      else if (raw[key] > 0)
        findings.add("invalid", "runtime-errors", `${key}=${raw[key]}`);
    if (!finite(raw.durationSeconds) || raw.durationSeconds <= 0)
      findings.add(
        "unverified",
        "duration-missing",
        "A positive wall duration is required",
      );
    else {
      if (
        raw.durationSeconds <
        policy.minimumDurationSeconds - policy.durationToleranceSeconds
      )
        findings.add(
          "invalid",
          "duration-too-short",
          "Sample is shorter than the required interval",
        );
      if (
        metrics &&
        Math.abs(metrics.durationSecondsFromFrames - raw.durationSeconds) >
          policy.durationToleranceSeconds
      )
        findings.add(
          "unverified",
          "duration-inconsistent",
          "Raw frame intervals disagree with wall duration",
        );
    }
    if (metrics && raw.frames !== undefined && raw.frames !== metrics.frames)
      findings.add(
        "invalid",
        "frame-count-mismatch",
        "Declared frame count disagrees with raw intervals",
      );
    validateHealth(raw, findings);
  }
  validateConditions(entry, raw, findings);
  const compilation = raw
    ? compilationSummary(raw, entry.backend, findings)
    : null;
  const consoleFailures = await consoleEvidence(
    entry.evidence?.console,
    reader,
    findings,
  );
  const diagnostics = await diagnosticEvidence(entry, reader, findings);
  if (raw && diagnostics.initialState) {
    const initial = diagnostics.initialState;
    validateObservedView(initial, "initial", findings);
    if (!count(initial.rendererId))
      findings.add(
        "unverified",
        "initial-renderer-missing",
        "benchmark-start lacks a renderer identity",
      );
    else if (
      count(raw.renderHealth?.start?.rendererId) &&
      initial.rendererId !== raw.renderHealth.start.rendererId
    )
      findings.add(
        "invalid",
        "initial-renderer-mismatch",
        "benchmark-start belongs to another renderer",
      );
    if (
      finite(raw.durationSeconds) &&
      finite(diagnostics.lastAtMs) &&
      diagnostics.lastAtMs <
        diagnostics.initialAtMs +
          (raw.durationSeconds - policy.durationToleranceSeconds) * 1000
    )
      findings.add(
        "unverified",
        "diagnostics-tail-incomplete",
        "The selected JSONL sequence does not cover the completed sample interval",
      );
    if (!count(initial.avatars))
      findings.add(
        "unverified",
        "initial-population-missing",
        "benchmark-start must record avatars",
      );
    else if (initial.avatars !== raw.avatars)
      findings.add(
        "invalid",
        "initial-population-mismatch",
        "Initial and measured minimum populations differ",
      );
    for (const key of ["quality", "viewport", "renderResolution"])
      if (!same(initial[key], raw[key]))
        findings.add(
          initial[key] === undefined ? "unverified" : "invalid",
          "initial-settings-mismatch",
          `Initial ${key} differs from the completed benchmark`,
        );
  }
  if (
    finite(diagnostics.startupDurationMs) &&
    finite(entry.startup?.durationMs) &&
    Math.abs(diagnostics.startupDurationMs - entry.startup.durationMs) >
      policy.durationToleranceSeconds * 1000
  )
    findings.add(
      "unverified",
      "startup-duration-inconsistent",
      "Declared startup duration differs from the JSONL timeline",
    );
  const output = {
    id: entry.id,
    scenario: entry.scenario,
    backend: entry.backend,
    sourceSnapshotId: entry.sourceSnapshotId,
    order: entry.order,
    status: findings.status,
    performanceEligible: findings.status === "valid",
    reasons: findings.reasons,
    benchmarkInput,
    metrics,
    conditions: entry.conditions ?? null,
    startup: {
      ...entry.startup,
      observedDurationMs: diagnostics.startupDurationMs,
    },
    rawFailures: [...consoleFailures, ...diagnostics.failures],
    diagnostics,
    renderHealth: raw?.renderHealth ?? null,
    compilation,
    observations: raw
      ? {
          quality: raw.quality,
          date: raw.date,
          viewport: raw.viewport,
          renderResolution: raw.renderResolution,
          avatars: raw.avatars,
          weatherAtStart: raw.weatherAtStart,
          weatherAtEnd: raw.weatherAtEnd,
          sceneView: raw.sceneView,
          durationSeconds: raw.durationSeconds,
          gpu: raw.gpu,
          renderer: raw.renderer,
          rendering: raw.rendering,
          frameWork: raw.frameWork,
          ambient: raw.ambient,
          drawCalls: raw.drawCalls,
          triangles: raw.triangles,
        }
      : null,
  };
  output.targets = targetResults(output, targets);
  return output;
}

const within = (a, b, tolerance) =>
  finite(a) && finite(b) && Math.abs(a - b) <= tolerance;
const withinAngle = (a, b, tolerance) => {
  if (!finite(a) || !finite(b)) return false;
  const delta = Math.abs((a - b) % (2 * Math.PI));
  return Math.min(delta, 2 * Math.PI - delta) <= tolerance;
};
function compareView(a, b, policy, label, issues) {
  if (!object(a) || !object(b)) {
    issues.push(`${label}: missing state`);
    return;
  }
  for (const key of ["x", "y", "z"])
    if (
      !within(
        a.position?.[key],
        b.position?.[key],
        policy.positionToleranceMetres,
      )
    )
      issues.push(`${label}.position.${key}: missing or mismatched`);
  for (const key of ["yaw", "pitch"])
    if (
      !(key === "yaw" ? withinAngle : within)(
        a[key],
        b[key],
        policy.angleToleranceRadians,
      )
    )
      issues.push(`${label}.${key}: missing or mismatched`);
  for (const key of ["x", "y", "z"])
    if (
      !within(
        a.camera?.position?.[key],
        b.camera?.position?.[key],
        policy.positionToleranceMetres,
      )
    )
      issues.push(`${label}.camera.position.${key}: missing or mismatched`);
  for (const key of ["fov", "minZ", "maxZ"])
    if (
      !within(
        a.camera?.[key],
        b.camera?.[key],
        key === "fov"
          ? policy.fovToleranceRadians
          : policy.positionToleranceMetres,
      )
    )
      issues.push(`${label}.camera.${key}: missing or mismatched`);
  // Projection matrices intentionally differ between WebGL and WebGPU depth conventions.
}

function compareConditions(a, b, policy) {
  const issues = [];
  const gpuA = a.observations?.gpu?.classification;
  const gpuB = b.observations?.gpu?.classification;
  if (
    text(gpuA) &&
    text(gpuB) &&
    gpuA !== "unknown" &&
    gpuB !== "unknown" &&
    gpuA !== gpuB
  )
    issues.push(
      "Observed GPU classifications differ despite the declared GPU identity",
    );
  for (const key of ["scenario", "sourceSnapshotId"])
    if (a[key] !== b[key]) issues.push(`${key} differs`);
  for (const key of [
    "gpuId",
    "browserId",
    "fixtureId",
    "routeId",
    "cacheState",
    "frameCapHz",
  ])
    if (!same(a.conditions?.[key], b.conditions?.[key]))
      issues.push(`conditions.${key} differs`);
  for (const key of [
    "quality",
    "viewport",
    "renderResolution",
    "avatars",
    "weatherAtStart",
    "weatherAtEnd",
  ])
    if (!same(a.observations?.[key], b.observations?.[key]))
      issues.push(`${key} differs`);
  if (
    a.observations?.sceneView?.lightingInstant !==
    b.observations?.sceneView?.lightingInstant
  )
    issues.push("lightingInstant differs");
  if (
    !within(
      a.observations?.durationSeconds,
      b.observations?.durationSeconds,
      policy.durationToleranceSeconds,
    )
  )
    issues.push("duration differs");
  compareView(
    a.diagnostics.initialState,
    b.diagnostics.initialState,
    policy,
    "initial",
    issues,
  );
  compareView(
    a.observations?.sceneView,
    b.observations?.sceneView,
    policy,
    "final",
    issues,
  );
  return issues;
}

function thermalIssues(runs, policy) {
  if (!runs.length) return ["No thermal observations"];
  const thermal = runs.map((run) => run.conditions?.thermal);
  if (
    thermal.some(
      (v) =>
        !v || ![v.startC, v.endC, v.minClockMHz, v.maxClockMHz].every(finite),
    )
  )
    return ["Thermal/clock evidence is incomplete"];
  const temperatures = thermal.flatMap((v) => [v.startC, v.endC]);
  const minClock = Math.min(...thermal.map((v) => v.minClockMHz)),
    maxClock = Math.max(...thermal.map((v) => v.maxClockMHz));
  const issues = [];
  if (
    Math.max(...temperatures) - Math.min(...temperatures) >
    policy.maxTemperatureDeltaC
  )
    issues.push("Temperature envelope exceeds policy");
  if (
    minClock <= 0 ||
    (100 * (maxClock - minClock)) / ((maxClock + minClock) / 2) >
      policy.maxClockDeltaPercent
  )
    issues.push("Clock envelope exceeds policy");
  return issues;
}

const distribution = (values) => {
  const sorted = values.slice().sort((a, b) => a - b),
    mid = Math.floor(sorted.length / 2);
  return {
    n: sorted.length,
    median:
      sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2,
    min: sorted[0],
    max: sorted.at(-1),
    values,
  };
};

function comparisonsFor(manifest, runs, policy) {
  const byId = new Map(runs.map((run) => [run.id, run]));
  const pairs = (manifest.expectedPairs ?? []).map((pair, index) => {
    const baseline = byId.get(pair.baseline),
      candidate = byId.get(pair.candidate),
      issues = [];
    if (!baseline || !candidate) issues.push("Expected run is missing");
    if (baseline && candidate) {
      if (baseline.status !== "valid" || candidate.status !== "valid")
        issues.push("Both runs must be valid");
      if (baseline.backend === candidate.backend)
        issues.push("A pair must compare different backends");
      if (
        pair.scenario !== baseline.scenario ||
        pair.scenario !== candidate.scenario
      )
        issues.push("Pair scenario does not match its runs");
      issues.push(
        ...compareConditions(baseline, candidate, policy),
        ...thermalIssues([baseline, candidate], policy),
      );
    }
    return {
      id: pair.id ?? `pair-${index}`,
      scenario: pair.scenario,
      baseline: pair.baseline,
      candidate: pair.candidate,
      baselineBackend: baseline?.backend ?? null,
      candidateBackend: candidate?.backend ?? null,
      comparable: issues.length === 0,
      issues,
    };
  });
  const groups = new Map();
  for (const pair of pairs) {
    const key = canonical([
      pair.scenario,
      pair.baselineBackend,
      pair.candidateBackend,
    ]);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(pair);
  }
  const comparisons = [...groups.values()].map((group) => {
    const issues = [],
      used = new Set(),
      selected = [];
    if (group.length < policy.requiredRepeats)
      issues.push(`Need at least ${policy.requiredRepeats} expected pairs`);
    for (const pair of group) {
      if (!pair.comparable) issues.push(`Pair ${pair.id} is not comparable`);
      for (const id of [pair.baseline, pair.candidate]) {
        if (used.has(id)) issues.push(`Run ${id} reused across repetitions`);
        used.add(id);
        if (byId.has(id)) selected.push(byId.get(id));
      }
    }
    const ordered = selected.slice().sort((a, b) => a.order - b.order);
    if (new Set(ordered.map((run) => run.order)).size !== ordered.length)
      issues.push("Capture orders are duplicated");
    const artifacts = selected.map((run) => run.benchmarkInput?.sha256);
    if (
      artifacts.some((value) => !value) ||
      new Set(artifacts).size !== artifacts.length
    )
      issues.push(
        "Independent raw benchmark artifacts are required; identical bytes cannot be counted as repetitions",
      );
    for (let i = 1; i < ordered.length; i++)
      if (
        !(
          Date.parse(ordered[i].observations?.date) >
          Date.parse(ordered[i - 1].observations?.date)
        )
      )
        issues.push(
          "Recorded completion timestamps do not confirm the capture order",
        );
    const directions = new Set();
    const orderIndex = new Map(ordered.map((run, index) => [run.id, index]));
    for (const pair of group) {
      const a = orderIndex.get(pair.baseline) ?? -1,
        b = orderIndex.get(pair.candidate) ?? -1;
      if (a < 0 || b < 0 || Math.abs(a - b) !== 1)
        issues.push(`Pair ${pair.id} is not interleaved as an adjacent block`);
      else directions.add(a < b ? "AB" : "BA");
    }
    if (directions.size < 2)
      issues.push(
        "Pair order is not counterbalanced (both AB and BA required)",
      );
    for (const run of selected.slice(1))
      issues.push(
        ...compareConditions(selected[0], run, policy).map(
          (issue) => `Series: ${issue}`,
        ),
      );
    issues.push(...thermalIssues(selected, policy));
    const claimAvailable = issues.length === 0;
    const summarize = (backend) => {
      const observations = selected.filter((run) => run.backend === backend);
      return {
        ...Object.fromEntries(
          ["fps", "p95Ms", "p99Ms", "maximumMs"].map((key) => [
            key,
            distribution(observations.map((run) => run.metrics[key])),
          ]),
        ),
        startupMs: distribution(
          observations.map((run) => run.startup.observedDurationMs),
        ),
        stalls: Object.fromEntries(
          [50, 100, 250, 1000].map((threshold) => [
            threshold,
            distribution(
              observations.map((run) => run.metrics.stalls[threshold]),
            ),
          ]),
        ),
      };
    };
    const relative = claimAvailable
      ? Object.fromEntries(
          ["fps", "p95Ms", "p99Ms", "maximumMs"].map((key) => [
            key,
            distribution(
              group.map(
                (pair) =>
                  100 *
                  (byId.get(pair.candidate).metrics[key] /
                    byId.get(pair.baseline).metrics[key] -
                    1),
              ),
            ),
          ]),
        )
      : null;
    return {
      scenario: group[0].scenario,
      baselineBackend: group[0].baselineBackend,
      candidateBackend: group[0].candidateBackend,
      expectedPairs: group.map((pair) => pair.id),
      claimAvailable,
      issues: [...new Set(issues)],
      order: ordered.map((run) => run.id),
      statistics: claimAvailable
        ? {
            baseline: summarize(group[0].baselineBackend),
            candidate: summarize(group[0].candidateBackend),
            pairedPercentChange: relative,
            pairedAbsoluteChange: {
              startupMs: distribution(
                group.map(
                  (pair) =>
                    byId.get(pair.candidate).startup.observedDurationMs -
                    byId.get(pair.baseline).startup.observedDurationMs,
                ),
              ),
              stalls: Object.fromEntries(
                [50, 100, 250, 1000].map((threshold) => [
                  threshold,
                  distribution(
                    group.map(
                      (pair) =>
                        byId.get(pair.candidate).metrics.stalls[threshold] -
                        byId.get(pair.baseline).metrics.stalls[threshold],
                    ),
                  ),
                ]),
              ),
            },
          }
        : null,
      limits: [
        "Percentiles are per-run nearest-rank values; never pooled or averaged to hide a failing repetition.",
        "Presentation FPS under a frame cap does not establish uncapped GPU throughput.",
        "Compilation API and async timings are not whole-frame GPU execution times.",
      ],
    };
  });
  return { pairs, comparisons };
}

export async function buildWebGpuMigrationReport(
  manifest,
  { baseDirectory = process.cwd() } = {},
) {
  if (
    !object(manifest) ||
    manifest.schemaVersion !== 1 ||
    !text(manifest.id) ||
    !Array.isArray(manifest.runs) ||
    !Array.isArray(manifest.expectedPairs)
  )
    throw new Error(
      "Expected manifest schemaVersion:1, id, runs and expectedPairs arrays",
    );
  if (
    manifest.expectedPairs.some(
      (pair) =>
        !object(pair) ||
        ![pair.id, pair.scenario, pair.baseline, pair.candidate].every(text),
    )
  )
    throw new Error(
      "Each expected pair needs id, scenario, baseline and candidate run IDs",
    );
  if (
    new Set(manifest.expectedPairs.map((pair) => pair.id)).size !==
    manifest.expectedPairs.length
  )
    throw new Error("Expected pair IDs must be unique");
  const policy = policyFor(manifest),
    reader = inputReader(baseDirectory);
  const entries = manifest.runs.map((run) => (object(run) ? run : {}));
  const runs = [];
  for (const entry of entries)
    runs.push(await analyzeRun(entry, reader, policy, manifest.targets));
  const idCounts = new Map();
  for (const run of runs) idCounts.set(run.id, (idCounts.get(run.id) ?? 0) + 1);
  const unstableInputs = await reader.verifyStable();
  for (const run of runs) {
    if (idCounts.get(run.id) > 1) {
      run.reasons.push({
        severity: "invalid",
        code: "duplicate-run-id",
        detail: "Run IDs must be unique",
      });
    }
    if (unstableInputs.length)
      run.reasons.push({
        severity: "unverified",
        code: "evidence-set-changing",
        detail:
          "Evidence changed during analysis; freeze the complete input set before making comparisons",
        evidence: unstableInputs.map((input) => input.path).join(", "),
      });
    run.status = statusFor(run.reasons);
    run.performanceEligible = run.status === "valid";
    run.targets = targetResults(run, manifest.targets);
  }
  const { pairs, comparisons } = comparisonsFor(manifest, runs, policy);
  return {
    schemaVersion: 1,
    id: manifest.id,
    policy,
    configuredTargets: manifest.targets ?? null,
    targetSummary: Object.fromEntries(
      ["passed", "failed", "unverified"].map((status) => [
        status,
        runs.filter((run) => run.targets.status === status).length,
      ]),
    ),
    method:
      "FPS=n/sum(raw frame intervals)*1000; p95/p99 nearest rank; maximum and >=50/100/250/1000ms counts. All attempts retained. No performance claim from invalid, unverified or non-comparable pairs.",
    summary: {
      runs: runs.length,
      valid: runs.filter((run) => run.status === "valid").length,
      invalid: runs.filter((run) => run.status === "invalid").length,
      unverified: runs.filter((run) => run.status === "unverified").length,
      comparableGroups: comparisons.filter((group) => group.claimAvailable)
        .length,
    },
    migrationApproval:
      "not-decided: requires the separate functional, visual, GPU, integration and release review",
    inputs: [...reader.inputs.values()],
    declaredInputPaths: [...reader.declaredPaths],
    runs,
    pairs,
    comparisons,
  };
}

export async function reportFromManifest(manifestPath) {
  const path = await realpath(resolve(manifestPath));
  const bytes = await readFile(path);
  const report = await buildWebGpuMigrationReport(
    JSON.parse(bytes.toString("utf8")),
    { baseDirectory: dirname(path) },
  );
  return { ...report, manifest: { path, sha256: hash(bytes) } };
}

export async function main(args = process.argv.slice(2)) {
  if (args.length !== 2)
    throw new Error(
      "Usage: node scripts/webgpu-migration-report.mjs manifest.json report.json",
    );
  const report = await reportFromManifest(args[0]);
  const output = resolve(args[1]);
  let actualOutput = output;
  try {
    actualOutput = await realpath(output);
  } catch {
    /* New output. */
  }
  const inputs = new Set(
    [
      report.manifest.path,
      ...report.declaredInputPaths,
      ...report.inputs.map((input) => input.absolute),
    ].map(pathKey),
  );
  if (inputs.has(pathKey(actualOutput)))
    throw new Error(
      "Output must not overwrite the manifest or any raw evidence input",
    );
  try {
    if ((await stat(actualOutput)).nlink > 1)
      throw new Error("Output must not overwrite a hard-linked file");
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify(report.summary));
  return report;
}

if (
  process.argv[1] &&
  pathKey(resolve(process.argv[1])) === pathKey(fileURLToPath(import.meta.url))
)
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 2;
  });
