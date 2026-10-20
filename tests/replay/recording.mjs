import { createHash } from "node:crypto";

const finite = (value) => typeof value === "number" && Number.isFinite(value);
const boolean = (value) => typeof value === "boolean";
const text = (value) => typeof value === "string" && value.length <= 160;
const nullableNumber = (value) => value === null || finite(value);
const choice = (...values) => (value) => values.includes(value);
const vector = { x: finite, y: finite, z: finite };
const levels = { low: finite, mid: finite, high: finite };
const wind = { speed: finite, direction: finite };
const fieldSource = {
  kind: choice("station", "model"), source: text,
  observedAt: finite, stale: boolean,
};
const rendering = {
  mode: choice("auto", "low", "medium", "high"),
  quality: choice("low", "medium", "high"),
  targetFps: finite, effectiveTargetFps: finite, presentationHz: nullableNumber,
  hardwareScaling: finite, renderScale: finite, reason: text, revision: finite,
  budgets: {
    architectureDetailMetres: finite, avatarNearMetres: finite,
    avatarMediumMetres: finite, grassRangeMetres: finite, grassTiles: finite,
    grassDensity: finite, b6PropRadiusMetres: finite, shadowMapSize: finite,
    postProcesses: boolean,
  },
};
const weather = {
  temperature: nullableNumber, wind: finite, windDirection: finite,
  rain: finite, cloud: finite, observedAt: nullableNumber, fetchedAt: finite,
  source: text, cloudSource: text, stale: boolean,
  status: choice("live", "fallback", "unavailable"),
  sourceKind: choice("station", "model"), cloudObservedAt: nullableNumber,
  cloudStale: boolean, cloudLayers: levels,
  cloudWinds: { low: wind, mid: wind, high: wind }, cloudWindSource: text,
  windGust: finite, humidity: finite, visibility: finite, snowfall: finite,
  liquidPrecipitation: finite,
  precipitationType: choice("none", "rain", "snow", "mixed", "freezing-rain", "hail", "unknown"),
  fieldSources: Object.fromEntries(
    ["windGust", "humidity", "visibility", "snowfall", "liquidPrecipitation", "precipitationType"]
      .map((field) => [field, fieldSource]),
  ),
};
const stateSchema = {
  position: vector,
  camera: {
    ...vector, yaw: finite, pitch: finite, distance: finite, fov: finite,
    firstPerson: boolean,
  },
  // Zone is observed coverage evidence; it does not certify traversability.
  zone: text, vehicle: boolean, speed: finite, flashlight: boolean,
  rendering, lightingInstant: finite, lightingPreview: boolean, weather,
};
const eventSchemas = {
  action: {
    action: choice("interact", "flashlight"), enabled: boolean,
    vehicle: boolean, position: vector,
  },
  "quality-change": { rendering },
  "lighting-change": { mode: choice("real", "day", "night", "golden-hour", "blue-hour", "full-moon") },
  "camera-change": { firstPerson: boolean, distance: finite, vehicle: boolean },
};
const object = (value) => value !== null && typeof value === "object" && !Array.isArray(value);

/** Copy only known technical fields, including falsy values, without shared references. */
function project(value, schema) {
  const output = {};
  if (!object(value)) return output;
  for (const [key, rule] of Object.entries(schema)) {
    if (typeof rule === "function") {
      if (rule(value[key])) output[key] = value[key];
    } else {
      const nested = project(value[key], rule);
      if (Object.keys(nested).length) output[key] = nested;
    }
  }
  return output;
}

function requireCondition(condition, message) {
  if (!condition) throw new Error(`Invalid recording: ${message}`);
}

function parseRecords(bytes, sessionId) {
  const records = [];
  const snapshots = new Set();
  const batchIds = new Set();
  for (const [index, line] of new TextDecoder("utf-8", { fatal: true })
    .decode(bytes).split(/\r?\n/).entries()) {
    if (!line.trim()) continue;
    let row;
    try { row = JSON.parse(line); }
    catch { throw new Error(`Invalid recording: malformed JSON on line ${index + 1}`); }
    requireCondition(object(row) && row.schemaVersion === 1, `unsupported envelope on line ${index + 1}`);
    requireCondition(row.sessionId === sessionId, `wrong session on line ${index + 1}`);
    requireCondition(row.type === "session-log" || row.type === "batch", `unsupported row type on line ${index + 1}`);
    if (row.source?.buildSnapshotId !== undefined) {
      requireCondition(typeof row.source.buildSnapshotId === "string"
        && /^[a-f0-9]{64}$/i.test(row.source.buildSnapshotId), "invalid buildSnapshotId");
      snapshots.add(row.source.buildSnapshotId.toLowerCase());
    }
    if (row.type !== "batch") continue;
    requireCondition(Number.isSafeInteger(row.batchId) && row.batchId >= 0, "invalid batchId");
    requireCondition(!batchIds.has(row.batchId), `duplicate batch ${row.batchId}`);
    batchIds.add(row.batchId);
    requireCondition(Array.isArray(row.records) && row.records.length > 0, "empty or invalid batch records");
    for (const record of row.records) {
      requireCondition(object(record) && Number.isSafeInteger(record.seq) && record.seq >= 0
        && finite(record.atMs) && record.atMs >= 0 && typeof record.kind === "string"
        && object(record.data), "malformed record");
      records.push(record);
    }
  }
  requireCondition(records.length > 0, "no records");
  records.sort((a, b) => a.seq - b.seq);
  for (const [index, record] of records.entries()) {
    requireCondition(record.seq === index,
      record.seq < index ? `duplicate sequence ${record.seq}` : `sequence gap before ${record.seq}`);
  }
  requireCondition(snapshots.size === 1, "missing or conflicting build snapshot identity");
  return { records, buildSnapshotId: [...snapshots][0] };
}

/**
 * Compile uncompressed diagnostic JSONL bytes into a bounded sampled-state replay.
 * The caller handles file/gzip I/O. Hash and continuity cover the complete source,
 * while fromSeq/toSeq select one game and readySeq anchors its replay clock.
 */
export function compileRecording(bytes, options) {
  requireCondition(bytes instanceof Uint8Array, "expected uncompressed Uint8Array bytes");
  requireCondition(object(options) && typeof options.id === "string" && /^[a-z0-9-]+$/.test(options.id), "invalid id");
  requireCondition(typeof options.sessionId === "string" && options.sessionId.length > 0, "missing sessionId");
  requireCondition(typeof options.sha256 === "string" && /^[a-f0-9]{64}$/i.test(options.sha256), "invalid expected SHA-256");
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  requireCondition(sha256 === options.sha256.toLowerCase(), "SHA-256 mismatch");
  const { records, buildSnapshotId } = parseRecords(bytes, options.sessionId);
  const { fromSeq, toSeq, readySeq } = options;
  requireCondition([fromSeq, toSeq, readySeq].every(Number.isSafeInteger)
    && fromSeq >= 0 && fromSeq <= readySeq && readySeq <= toSeq && toSeq < records.length,
  "invalid sequence selection");
  const selected = records.slice(fromSeq, toSeq + 1);
  const ready = records[readySeq];
  requireCondition(ready.kind === "game-ready", "readySeq is not game-ready");
  requireCondition(selected.filter((record) => record.kind === "game-ready").length === 1,
    "selection includes multiple games");
  const replayRecords = records.slice(readySeq, toSeq + 1);
  requireCondition(!replayRecords.some((record) => record.seq !== readySeq
    && ["game-start", "session-start"].includes(record.kind)), "selection crosses game lifecycle");
  requireCondition(!replayRecords.some((record) => record.seq < toSeq
    && ["game-dispose", "game-disposed", "game-end", "session-end"].includes(record.kind)),
  "selection continues beyond game end");

  const limitations = [
    "Sampled render-state replay; original tick inputs, physics, collisions, multiplayer and recovery are not reproduced.",
    "Actor and vehicle orientation are absent; camera orientation does not establish actor facing.",
    "Sample times use contextAtMs; unsampled movement/actions and interpolated intermediate frames are not historical evidence.",
    "Appearance, identity, UI contents, network/browser details and performance telemetry are intentionally omitted.",
    "Automatic quality is observed output; forcing it does not validate adaptation or historical FPS.",
  ];
  const timeline = [];
  const missing = new Map();
  const unsupportedActions = [];
  for (const record of replayRecords) {
    if (record.kind === "frame-window") {
      requireCondition(finite(record.data.contextAtMs), `missing contextAtMs at seq ${record.seq}`);
      requireCondition(record.data.contextAtMs >= ready.atMs && record.data.contextAtMs <= record.atMs,
        `context time outside game/record bounds at seq ${record.seq}`);
      const state = project(record.data.context, stateSchema);
      requireCondition(state.position && ["x", "y", "z"].every((key) => finite(state.position[key])),
        `missing sampled position at seq ${record.seq}`);
      for (const key of Object.keys(stateSchema)) {
        if (!(key in state)) missing.set(key, (missing.get(key) ?? 0) + 1);
      }
      if (state.camera) {
        for (const key of Object.keys(stateSchema.camera)) {
          if (!(key in state.camera)) missing.set(`camera.${key}`, (missing.get(`camera.${key}`) ?? 0) + 1);
        }
      }
      timeline.push({ atMs: record.data.contextAtMs - ready.atMs, seq: record.seq, type: "sample", state });
    } else if (Object.hasOwn(eventSchemas, record.kind)) {
      const data = project(record.data, eventSchemas[record.kind]);
      if (record.kind === "action" && !data.action) {
        unsupportedActions.push(record.seq);
        continue;
      }
      requireCondition(record.atMs >= ready.atMs, `event precedes game-ready at seq ${record.seq}`);
      timeline.push({ atMs: record.atMs - ready.atMs, seq: record.seq, type: "event", kind: record.kind, data });
    }
  }
  timeline.sort((a, b) => a.atMs - b.atMs || a.seq - b.seq);
  const samples = timeline.filter((item) => item.type === "sample");
  requireCondition(samples.length > 0, "no sampled states in selection");
  if (samples[0].atMs > 0) limitations.push(`No sample at game-ready; first observed state is seq ${samples[0].seq} at ${samples[0].atMs}ms.`);
  for (const [key, count] of missing) limitations.push(`Optional state.${key} is missing/invalid in ${count} sample(s); no value was invented.`);
  if (unsupportedActions.length) limitations.push(`Unknown actions at seq ${unsupportedActions.join(",")} were omitted without inventing behavior.`);
  const gaps = samples.slice(1).flatMap((sample, index) => {
    const gap = sample.atMs - samples[index].atMs;
    return gap > 3000 ? [`${samples[index].seq}->${sample.seq}: ${gap}ms`] : [];
  });
  if (gaps.length) limitations.push(`Unobserved sample intervals over 3000ms: ${gaps.join("; ")}.`);
  const faults = replayRecords.filter((record) => ["render-fault", "js-error", "unhandled-rejection"].includes(record.kind));
  if (faults.length) limitations.push(`Historical errors at seq ${faults.map((record) => record.seq).join(",")} are provenance only, not replay actions or expected failures.`);
  return {
    schemaVersion: 1,
    id: options.id,
    source: { sessionId: options.sessionId, sha256, buildSnapshotId, fromSeq, toSeq, readySeq, recordCount: records.length },
    durationMs: timeline.at(-1).atMs,
    limitations,
    timeline,
  };
}
