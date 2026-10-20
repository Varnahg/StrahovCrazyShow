import { createReadStream } from "node:fs";
import { readdir, stat } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createInterface } from "node:readline";

const LOG_NAME = /^([a-f0-9-]{36})(?:\.part-\d{4,})?\.jsonl$/;
const finite = (value) => typeof value === "number" && Number.isFinite(value);
const DETAIL_LIMIT = 200;
const THRESHOLDS = [50, 100, 250, 1000];
const frameValues = (data) => data.frameMs ?? data.frameIntervalsMs;
const foreground = (data) =>
  !["hidden", "transition"].includes(data.visibility) &&
  !data.afterVisibilityChange &&
  data.context?.visibility !== "hidden" &&
  data.context?.visible !== false;
// Identity changes retain transport evidence and its original connected time.
// The full event still belongs to lifecycle history and server-clock boundaries.
const isConnectionTransition = (kind, data) =>
  kind === "network-connected" ||
  kind === "network-connecting" ||
  kind === "network-disconnected" ||
  (kind === "network-left" && data.reason !== "identity-change");
// Exact frequency tables avoid retaining every raw interval twice and copying
// millions of samples for percentile sorting when reading retained 128 MiB logs.
function samples() {
  return { frequencies: new Map(), count: 0, total: 0 };
}
function addSample(stats, value) {
  stats.frequencies.set(value, (stats.frequencies.get(value) ?? 0) + 1);
  stats.count++;
  stats.total += value;
}
function distribution(stats) {
  const sorted = [...stats.frequencies].sort((a, b) => a[0] - b[0]);
  const quantile = (q) => {
    let count = 0;
    for (const [value, frequency] of sorted) {
      count += frequency;
      if (count >= Math.ceil(stats.count * q)) return value;
    }
    return null;
  };
  const thresholds = Object.fromEntries(
    THRESHOLDS.map((threshold) => [
      `atLeast${threshold}Ms`,
      sorted.reduce(
        (sum, [value, count]) => sum + (value >= threshold ? count : 0),
        0,
      ),
    ]),
  );
  return {
    frames: stats.count,
    averageFps: stats.total ? (1000 * stats.count) / stats.total : null,
    p50FrameMs: quantile(0.5),
    p95FrameMs: quantile(0.95),
    p99FrameMs: quantile(0.99),
    maxFrameMs: sorted.at(-1)?.[0] ?? null,
    thresholds,
  };
}
function retainLatest(list, record, limit = DETAIL_LIMIT) {
  // Normal append order needs no sort; tolerate out-of-order retained parts.
  const index =
    list.length && record.seq < list.at(-1).seq
      ? list.findIndex((item) => item.seq > record.seq)
      : -1;
  if (index < 0) list.push(record);
  else list.splice(index, 0, record);
  if (list.length > limit) list.shift();
}
const recordCost = (record) =>
  record.data.frameMs ??
  record.data.durationMs ??
  record.data.duration ??
  record.data.cpuMs ??
  0;
function retainWorst(list, record, limit = 30) {
  list.push(record);
  list.sort((a, b) => recordCost(b) - recordCost(a));
  if (list.length > limit) list.pop();
}

const CLOCK_TIMINGS = ["elapsedMs", "cpuMs", "elapsedMaxMs", "cpuMaxMs"];
const CLOCK_BOUNDARIES = new Set([
  "session-start",
  "session-end",
  "game-start",
  "game-dispose",
  "game-disposed",
  "game-end",
  "mode-change",
  "network-connecting",
  "network-connected",
  "network-disconnected",
  "network-left",
]);
const nonnegative = (value) => finite(value) && value >= 0;

// Only scalar evidence is retained. Game contexts can contain large inventories
// and unrelated private metadata; the offline clock summary does not need them.
function clockEvidence(record) {
  const { seq, atMs, kind, data } = record;
  if (CLOCK_BOUNDARIES.has(kind) || kind === "recording-gap")
    return { seq, atMs, type: kind === "recording-gap" ? "gap" : "boundary" };
  if (kind !== "frame-window") return null;
  const clock = data.context?.network?.server?.clock;
  if (clock == null) return { seq, atMs, type: "missing" };
  const contextAtMs = data.contextAtMs;
  if (
    typeof clock !== "object" ||
    Array.isArray(clock) ||
    !nonnegative(contextAtMs) ||
    contextAtMs > atMs + 1 ||
    !Number.isSafeInteger(clock.callbacks) ||
    clock.callbacks < 0 ||
    !nonnegative(clock.droppedTotalMs)
  )
    return { seq, atMs, type: "invalid" };
  const values = [
    clock.callbacks,
    clock.droppedTotalMs,
    ...CLOCK_TIMINGS.map((key) =>
      nonnegative(clock[key]) ? clock[key] : null,
    ),
  ];
  return {
    seq,
    atMs,
    contextAtMs,
    type: "sample",
    values,
    signature: JSON.stringify(values),
  };
}

function emptyServerClock() {
  return {
    status: "unavailable",
    scope:
      "Observed counter increments between comparable retained server-clock snapshots; not a full-session total. Each segment's first value is a baseline, not observed work. The sum is a lower bound only assuming counter continuity inside those segments. No server-instance ID is recorded: an unobserved restart may be undetectable. Unsampled start/end, gaps and callback peaks remain unknown. Room clock counters are separate from player queue counters and recovery events.",
    samples: 0,
    comparableIntervals: 0,
    observed: { callbacks: null, droppedMs: null },
    sampledCurrentMaxMs: { elapsed: null, cpu: null },
    reportedLifetimeMaxMs: { elapsed: null, cpu: null },
    diagnostics: {
      ambiguousLog: false,
      ambiguousSequences: 0,
      duplicateContexts: 0,
      conflictingContexts: 0,
      missingSamples: 0,
      invalidSamples: 0,
      unavailableTimingValues: 0,
      staleContexts: 0,
      counterResets: 0,
      clockConflicts: 0,
      sequenceGaps: 0,
      recordingGaps: 0,
      lifecycleBoundaries: 0,
      numericOverflows: 0,
    },
    segments: [],
    omittedSegments: 0,
  };
}

function summarizeServerClock(ordered, evidence, ambiguous, ambiguousLog) {
  const result = emptyServerClock();
  result.diagnostics.ambiguousLog = !!ambiguousLog;
  // The legacy reader intentionally retains its original first-delivery result
  // and integrity warning. No new clock conclusion may depend on which corrupt
  // batch/session copy happened to be read first.
  if (ambiguousLog) return result;
  const contexts = new Map(),
    conflicts = new Set();
  for (const [seq, sample] of evidence) {
    if (ambiguous.has(seq) || sample.type !== "sample") continue;
    const existing = contexts.get(sample.contextAtMs);
    if (existing) {
      if (existing.signature !== sample.signature)
        conflicts.add(sample.contextAtMs);
      existing.latestAtMs = Math.max(existing.latestAtMs, sample.atMs);
    } else
      contexts.set(sample.contextAtMs, {
        signature: sample.signature,
        latestAtMs: sample.atMs,
      });
  }
  result.diagnostics.conflictingContexts = conflicts.size;
  const seenContexts = new Set();
  let previousSeq = -1,
    lastContextAt = -Infinity,
    boundaryAt = -Infinity;
  let previous = null,
    segment = null,
    callbacks = 0,
    droppedMs = 0;
  const finish = () => {
    if (segment) {
      if (result.segments.length < DETAIL_LIMIT) result.segments.push(segment);
      else result.omittedSegments++;
    }
    segment = null;
    previous = null;
  };
  const barrier = (atMs) => {
    boundaryAt = Math.max(boundaryAt, atMs);
    finish();
  };
  const endpoint = (sample) => ({
    callbacks: sample.values[0],
    droppedTotalMs: sample.values[1],
  });
  const start = (sample) => {
    previous = sample;
    segment = {
      fromSeq: sample.seq,
      toSeq: sample.seq,
      fromContextAtMs: sample.contextAtMs,
      toContextAtMs: sample.contextAtMs,
      baseline: endpoint(sample),
      last: endpoint(sample),
      intervals: 0,
      callbacksDelta: 0,
      droppedMsDelta: 0,
    };
  };
  for (const [seq, atMs] of ordered) {
    if (seq > previousSeq + 1) {
      result.diagnostics.sequenceGaps++;
      // The missing event's time is unknown. Conservatively require a sample
      // no older than the first retained delivery after the gap.
      barrier(ambiguous.get(seq) ?? atMs);
    }
    previousSeq = seq;
    if (ambiguous.has(seq)) {
      result.diagnostics.ambiguousSequences++;
      barrier(ambiguous.get(seq));
      continue;
    }
    const sample = evidence.get(seq);
    if (!sample) continue;
    if (sample.type === "boundary" || sample.type === "gap") {
      result.diagnostics[
        sample.type === "gap" ? "recordingGaps" : "lifecycleBoundaries"
      ]++;
      barrier(sample.atMs);
      continue;
    }
    if (sample.type === "missing" || sample.type === "invalid") {
      result.diagnostics[
        sample.type === "missing" ? "missingSamples" : "invalidSamples"
      ]++;
      barrier(sample.atMs);
      continue;
    }
    if (conflicts.has(sample.contextAtMs)) {
      barrier(contexts.get(sample.contextAtMs).latestAtMs);
      continue;
    }
    if (sample.contextAtMs < boundaryAt || sample.contextAtMs < lastContextAt) {
      result.diagnostics.staleContexts++;
      // A rejected stale delivery is not a new lifecycle boundary. Moving the
      // boundary to every flush would indefinitely reject normally lagged data.
      finish();
      continue;
    }
    if (seenContexts.has(sample.contextAtMs)) {
      result.diagnostics.duplicateContexts++;
      continue;
    }
    seenContexts.add(sample.contextAtMs);
    lastContextAt = sample.contextAtMs;
    if (
      previous &&
      sample.values[0] === previous.values[0] &&
      sample.signature !== previous.signature
    ) {
      result.diagnostics.clockConflicts++;
      barrier(sample.atMs);
      continue;
    }
    result.samples++;
    result.diagnostics.unavailableTimingValues += sample.values
      .slice(2)
      .filter((value) => value === null).length;
    for (const [name, offset] of [
      ["sampledCurrentMaxMs", 2],
      ["reportedLifetimeMaxMs", 4],
    ])
      for (const [key, index] of [
        ["elapsed", offset],
        ["cpu", offset + 1],
      ])
        if (sample.values[index] !== null)
          result[name][key] = Math.max(
            result[name][key] ?? 0,
            sample.values[index],
          );
    if (
      previous &&
      (sample.values[0] < previous.values[0] ||
        sample.values[1] < previous.values[1])
    ) {
      result.diagnostics.counterResets++;
      finish();
    }
    if (!previous) {
      start(sample);
      continue;
    }
    // Re-sampling one cached authority is not a fresh server-clock endpoint.
    if (sample.values[0] === previous.values[0]) continue;
    const callbackDelta = sample.values[0] - previous.values[0];
    const droppedDelta = sample.values[1] - previous.values[1];
    if (
      !Number.isSafeInteger(callbacks + callbackDelta) ||
      !finite(droppedMs + droppedDelta)
    ) {
      result.diagnostics.numericOverflows++;
    } else {
      callbacks += callbackDelta;
      droppedMs += droppedDelta;
    }
    result.comparableIntervals++;
    segment.toSeq = sample.seq;
    segment.toContextAtMs = sample.contextAtMs;
    segment.last = endpoint(sample);
    segment.intervals++;
    segment.callbacksDelta = sample.values[0] - segment.baseline.callbacks;
    segment.droppedMsDelta = sample.values[1] - segment.baseline.droppedTotalMs;
    previous = sample;
  }
  finish();
  if (result.comparableIntervals && !result.diagnostics.numericOverflows) {
    result.status = "observed-intervals";
    result.observed = { callbacks, droppedMs };
  }
  return result;
}

/** Read only. Broken/incomplete lines remain on disk and are reported rather
 * than silently making a failed or interrupted session look successful. */
export async function summarizeDiagnosticFiles(files) {
  const sequenceTimes = new Map(),
    batches = new Map(),
    sources = new Map();
  const serverClockEvidence = new Map(),
    ambiguousClockSequences = new Map();
  let ambiguousClockLog = false;
  const warnings = new Set();
  let omittedWarnings = 0;
  const warn = (message) => {
    if (warnings.has(message)) return;
    if (warnings.size < DETAIL_LIMIT) warnings.add(message);
    else omittedWarnings++;
  };
  const allFrames = samples(),
    foregroundFrames = samples(),
    excludedFrames = samples(),
    correctionDistances = samples();
  const errors = [],
    hitches = [],
    observerEntries = [],
    frameHitches = [],
    changes = [],
    gaps = [],
    lifecycle = [],
    actions = [];
  const kinds = Object.create(null),
    connectionEvents = [],
    connectionSamples = [];
  const counts = {
    errors: 0,
    hitches: 0,
    changes: 0,
    gaps: 0,
    lifecycle: 0,
    actions: 0,
  };
  const network = {
    inputOverflowEvents: 0,
    droppedInputsAtLeast: 0,
    overflowsWithoutDropCount: 0,
    correctionEvents: 0,
    hardCorrectionEvents: 0,
    hardCorrectionsDuringModeChange: 0,
    hardCorrectionsDuringRespawn: 0,
    resyncEvents: 0,
    resyncsWithoutReason: 0,
    resyncsWithZeroDistance: 0,
    correctionsWithoutDistance: 0,
    resyncReasons: Object.create(null),
    inconsistentConnectionWindows: 0,
  };
  let sessionId = null,
    receivedFromUTC = null,
    receivedToUTC = null,
    policy = null,
    integrityIssues = 0,
    cleanPagehide = false;
  for (const file of files) {
    let lineNumber = 0;
    const lines = createInterface({
      input: createReadStream(file),
      crlfDelay: Infinity,
    });
    for await (const line of lines) {
      lineNumber++;
      if (!line.trim()) continue;
      let row;
      try {
        row = JSON.parse(line);
      } catch {
        integrityIssues++;
        warn(
          `${basename(file)}:${lineNumber}: malformed or truncated JSON line`,
        );
        continue;
      }
      if (!row || typeof row !== "object") {
        integrityIssues++;
        warn(`${basename(file)}:${lineNumber}: invalid log entry`);
        continue;
      }
      if (row.type === "session-log") {
        policy ??= row.policy ?? null;
        if (row.part > 0)
          warn(
            `Rotated log part ${row.part}; older parts may have expired under retention.`,
          );
        if (row.retentionRemovedFiles > 0)
          warn(
            `Collector had removed ${row.retentionRemovedFiles} old log files under retention.`,
          );
        continue;
      }
      if (row.type !== "batch" || !Array.isArray(row.records)) {
        integrityIssues++;
        warn(`${basename(file)}:${lineNumber}: unknown log entry`);
        continue;
      }
      if (sessionId && row.sessionId !== sessionId) {
        ambiguousClockLog = true;
        integrityIssues++;
        warn(`${basename(file)}:${lineNumber}: mixed session ignored`);
        continue;
      }
      sessionId = row.sessionId;
      if (batches.has(row.batchId)) {
        if (batches.get(row.batchId) !== row.digest) {
          ambiguousClockLog = true;
          integrityIssues++;
          warn(`Conflicting duplicate batch ${row.batchId}`);
        }
        continue;
      }
      batches.set(row.batchId, row.digest);
      if (row.source?.contentSha256)
        sources.set(row.source.contentSha256, row.source);
      if (typeof row.receivedAtUTC === "string") {
        receivedFromUTC =
          receivedFromUTC && receivedFromUTC < row.receivedAtUTC
            ? receivedFromUTC
            : row.receivedAtUTC;
        receivedToUTC =
          receivedToUTC && receivedToUTC > row.receivedAtUTC
            ? receivedToUTC
            : row.receivedAtUTC;
      }
      for (const record of row.records) {
        if (
          !Number.isSafeInteger(record?.seq) ||
          record.seq < 0 ||
          !finite(record.atMs) ||
          typeof record.kind !== "string" ||
          !record.data ||
          typeof record.data !== "object"
        ) {
          integrityIssues++;
          warn(`Batch ${row.batchId}: invalid record ignored`);
          continue;
        }
        if (sequenceTimes.has(record.seq)) {
          ambiguousClockSequences.set(
            record.seq,
            Math.max(
              ambiguousClockSequences.get(record.seq) ??
                sequenceTimes.get(record.seq),
              record.atMs,
            ),
          );
          integrityIssues++;
          warn(`Duplicate record sequence ${record.seq}`);
          continue;
        }
        sequenceTimes.set(record.seq, record.atMs);
        const clock = clockEvidence(record);
        if (clock) serverClockEvidence.set(record.seq, clock);
        kinds[record.kind] = (kinds[record.kind] ?? 0) + 1;
        const { data, kind } = record;
        if (kind === "frame-window") {
          const values = frameValues(data);
          if (Array.isArray(values)) {
            const visible = foreground(data);
            for (const value of values) {
              if (!finite(value) || value <= 0) continue;
              addSample(allFrames, value);
              addSample(visible ? foregroundFrames : excludedFrames, value);
            }
          }
          if (data.context?.mode === "multiplayer" && data.context.connection)
            connectionSamples.push({
              seq: record.seq,
              connection: data.context.connection,
              atMs: finite(data.contextAtMs) ? data.contextAtMs : record.atMs,
            });
        }
        if (
          /error|rejection|context-lost/.test(kind) ||
          (kind === "resource-timing" &&
            finite(data.responseStatus) &&
            data.responseStatus >= 400)
        ) {
          counts.errors++;
          retainLatest(errors, record);
        }
        if (/hitch|longtask|long-animation-frame/.test(kind)) {
          counts.hitches++;
          retainWorst(hitches, record);
          if (kind === "frame-hitch" && foreground(data))
            retainWorst(frameHitches, record);
          if (kind === "longtask" || kind === "long-animation-frame")
            retainWorst(observerEntries, record);
        }
        if (
          /setting|quality|lighting|weather|resize|resolution|camera|vehicle|ui-panel|ui-state|avatar-change/.test(
            kind,
          )
        ) {
          counts.changes++;
          retainLatest(changes, record);
        }
        if (/gap/.test(kind)) {
          counts.gaps++;
          retainLatest(gaps, record);
        }
        if (
          /session|game-|connection|network|visibility|browser-state|^action$|^mode-change$|^pagehide$/.test(
            kind,
          )
        ) {
          counts.lifecycle++;
          retainLatest(lifecycle, record);
        }
        if (kind === "action") {
          counts.actions++;
          retainLatest(actions, record);
        }
        if (isConnectionTransition(kind, data))
          connectionEvents.push({
            seq: record.seq,
            atMs: record.atMs,
            connected: kind === "network-connected",
          });
        if (kind === "network-input-overflow") {
          network.inputOverflowEvents++;
          const dropped = data.droppedInputs ?? data.queued;
          if (finite(dropped) && dropped >= 0)
            network.droppedInputsAtLeast += dropped;
          else network.overflowsWithoutDropCount++;
        }
        if (kind === "network-correction") {
          network.correctionEvents++;
          const distance = data.correctionMetres;
          if (!finite(distance) || distance < 0)
            network.correctionsWithoutDistance++;
          if (data.resync) {
            network.resyncEvents++;
            if (distance === 0) network.resyncsWithZeroDistance++;
            const reason = data.resyncReason;
            if (typeof reason === "string" && reason.trim())
              network.resyncReasons[reason] =
                (network.resyncReasons[reason] ?? 0) + 1;
            else network.resyncsWithoutReason++;
          } else if (finite(distance) && distance >= 0.35) {
            network.hardCorrectionEvents++;
            addSample(correctionDistances, distance);
            if (data.modeChanged) network.hardCorrectionsDuringModeChange++;
            if (data.respawn) network.hardCorrectionsDuringRespawn++;
          }
        }
        if (kind === "pagehide" && data.persisted === false)
          cleanPagehide = true;
      }
    }
  }
  const ordered = [...sequenceTimes].sort((a, b) => a[0] - b[0]);
  const serverClock = summarizeServerClock(
    ordered,
    serverClockEvidence,
    ambiguousClockSequences,
    ambiguousClockLog,
  );
  const missingSequences = [];
  let previous = -1,
    previousTime = -Infinity;
  for (const [seq, atMs] of ordered) {
    if (seq > previous + 1)
      missingSequences.push({ from: previous + 1, to: seq - 1 });
    if (atMs < previousTime) {
      integrityIssues++;
      warn(`Monotonic time went backwards at sequence ${seq}`);
    }
    previous = seq;
    previousTime = atMs;
  }
  if (missingSequences.length)
    warn(
      `Missing record sequences: ${missingSequences
        .slice(0, DETAIL_LIMIT)
        .map((gap) => `${gap.from}–${gap.to}`)
        .join(", ")}`,
    );
  if (!kinds["session-end"] && !cleanPagehide)
    warn(
      "No session-end record: session may still be running, or the tab/process ended before delivery.",
    );
  if (sources.size > 1)
    warn(
      "Source changed during recording; compare the per-batch source identities before attributing performance changes.",
    );
  if (counts.gaps)
    warn(`${counts.gaps} explicit recording-gap events: log is incomplete.`);
  connectionEvents.sort((a, b) => a.seq - b.seq);
  connectionSamples.sort((a, b) => a.seq - b.seq);
  let connectionIndex = 0,
    connection = null;
  for (const sample of connectionSamples) {
    while (
      connectionIndex < connectionEvents.length &&
      connectionEvents[connectionIndex].seq < sample.seq
    )
      connection = connectionEvents[connectionIndex++];
    if (
      connection?.connected &&
      sample.atMs >= connection.atMs &&
      ["connecting", "offline", "disconnected"].includes(sample.connection)
    )
      network.inconsistentConnectionWindows++;
  }
  const distances = distribution(correctionDistances);
  network.hardCorrectionMetres = {
    samples: distances.frames,
    median: distances.p50FrameMs,
    p95: distances.p95FrameMs,
    p99: distances.p99FrameMs,
    max: distances.maxFrameMs,
  };
  const performance = distribution(foregroundFrames);
  const incidents = [];
  const incident = (code, severity, count, message) => {
    if (count) incidents.push({ code, severity, count, message });
  };
  incident(
    "runtime-errors",
    "high",
    counts.errors,
    "Explicit error events were recorded (JavaScript/resource/render/network); these are counted separately from stalls, overflows and corrections.",
  );
  incident(
    "foreground-frame-stalls",
    performance.thresholds.atLeast250Ms ? "high" : "medium",
    performance.thresholds.atLeast50Ms,
    "Delivered foreground frame intervals reached at least 50 ms. Count comes from raw frame windows, not overlapping hitch/longtask/LoAF events.",
  );
  incident(
    "network-input-overflow",
    "high",
    network.inputOverflowEvents,
    `Input queues overflowed; at least ${network.droppedInputsAtLeast} inputs were reported discarded. This does not by itself identify a transport or server cause.`,
  );
  incident(
    "network-hard-correction",
    "medium",
    network.hardCorrectionEvents,
    "Non-resync correction records reached 0.35 m; mode changes/respawns may be intentional. This is observed correction, not proof of a physics or connection fault.",
  );
  incident(
    "network-resync",
    "medium",
    network.resyncEvents,
    "Authority resynchronizations occurred; reasons and surrounding lifecycle must be inspected before attributing them to a fault.",
  );
  incident(
    "resync-reason-missing",
    "medium",
    network.resyncsWithoutReason,
    "Resynchronization reason was not recorded; the cause cannot be recovered from these records alone.",
  );
  incident(
    "connection-state-inconsistent",
    "medium",
    network.inconsistentConnectionWindows,
    "Sampled multiplayer context reports connecting/offline/disconnected after a connected event and before a recorded disconnect; diagnostic state is inconsistent.",
  );
  incident(
    "recording-incomplete",
    "medium",
    missingSequences.length + counts.gaps + integrityIssues,
    "Missing sequences, recording gaps or invalid/conflicting log data limit conclusions drawn from this recording.",
  );
  if (
    network.resyncEvents &&
    network.resyncsWithZeroDistance === network.resyncEvents &&
    network.resyncsWithoutReason === network.resyncEvents
  )
    warn(
      "All resync distances are zero and reasons are absent. Older legacy resync records used authority position as the baseline; verify source identity before interpreting these as zero displacement.",
    );
  for (const [name, values] of Object.entries({
    errors,
    changes,
    gaps,
    lifecycle,
    actions,
  })) {
    values.sort((a, b) => a.seq - b.seq);
    if (counts[name] > values.length)
      warn(
        `${name}: showing latest ${values.length} of ${counts[name]} records; exact counts are preserved and full detail remains in the source files.`,
      );
  }
  if (omittedWarnings)
    warnings.add(
      `${omittedWarnings} additional warning occurrences omitted from this bounded report.`,
    );
  return {
    sessionId,
    files,
    receivedFromUTC,
    receivedToUTC,
    durationMs: ordered.length > 1 ? ordered.at(-1)[1] - ordered[0][1] : 0,
    records: ordered.length,
    batches: batches.size,
    kinds,
    gameplay: {
      detected: allFrames.count > 0 || !!kinds["game-ready"],
      rawFrameIntervals: allFrames.count,
      gameReadyEvents: kinds["game-ready"] ?? 0,
    },
    performance,
    allVisibilityPerformance: distribution(allFrames),
    excludedVisibilityPerformance: distribution(excludedFrames),
    statisticsScope:
      "Global nearest-rank p95/p99 from delivered raw frame intervals, not averages of window percentiles. Foreground excludes explicitly hidden windows and visibility transitions; asynchronous GPU samples are not frame intervals.",
    sources: [...sources.values()],
    policy,
    severity: incidents.some((item) => item.severity === "high")
      ? "high"
      : incidents.length
        ? "medium"
        : "none-observed",
    incidents,
    network,
    serverClock,
    counts,
    errors,
    worstHitches: hitches,
    worstForegroundFrameHitches: frameHitches,
    worstObserverEntries: observerEntries,
    observerCounts: {
      longtask: kinds.longtask ?? 0,
      longAnimationFrame: kinds["long-animation-frame"] ?? 0,
      sampledFrameHitches: kinds["frame-hitch"] ?? 0,
    },
    changes,
    gaps,
    lifecycle,
    actions,
    missingSequences,
    warnings: [...warnings],
  };
}

export async function diagnosticsReport(
  target = ".cache/game-diagnostics",
  { all = false } = {},
) {
  const absolute = resolve(target);
  const info = await stat(absolute).catch(() => null);
  if (!info)
    return { sessions: [], warnings: [`No diagnostics found at ${absolute}.`] };
  if (info.isFile())
    return {
      sessions: [await summarizeDiagnosticFiles([absolute])],
      warnings: [],
      selection:
        "explicit file (only the requested file; no session substitution)",
    };
  const groups = new Map();
  for (const name of await readdir(absolute)) {
    const match = LOG_NAME.exec(name);
    if (!match) continue;
    const path = join(absolute, name),
      file = await stat(path);
    if (!file.isFile()) continue;
    const entry = groups.get(match[1]) ?? { files: [], modified: 0 };
    entry.files.push(path);
    entry.modified = Math.max(entry.modified, file.mtimeMs);
    groups.set(match[1], entry);
  }
  const selected = [...groups.values()].sort((a, b) => b.modified - a.modified);
  const sessions = [];
  let fallback = null,
    skipped = 0;
  for (const group of selected) {
    const session = await summarizeDiagnosticFiles(group.files.sort());
    if (all) sessions.push(session);
    else if (session.gameplay.detected) {
      sessions.push(session);
      break;
    } else {
      fallback ??= session;
      skipped++;
    }
  }
  if (!all && !sessions.length && fallback) sessions.push(fallback);
  return {
    sessions,
    warnings: sessions.length ? [] : [`No session JSONL logs in ${absolute}.`],
    selection: all
      ? "all retained sessions (newest modified first)"
      : sessions[0]?.gameplay.detected
        ? `latest retained gameplay session by file modification time (raw frame intervals or game-ready); skipped ${skipped} newer sessions without gameplay evidence`
        : "latest retained session fallback: no retained session contains raw frame intervals or game-ready; gameplay has not been established",
  };
}

export function formatDiagnosticsReport(report) {
  const lines = [...report.warnings];
  const number = (value) => (finite(value) ? value.toFixed(2) : "unavailable");
  if (report.selection) lines.push(`Selection: ${report.selection}`);
  for (const session of report.sessions) {
    const serverClock = session.serverClock ?? emptyServerClock();
    lines.push(
      `Session ${session.sessionId}`,
      `Received ${session.receivedFromUTC} → ${session.receivedToUTC}; ${session.records} records / ${session.batches} batches`,
      `Foreground ${session.performance.frames} frames: ${number(session.performance.averageFps)} FPS; p95 ${number(session.performance.p95FrameMs)} ms; p99 ${number(session.performance.p99FrameMs)} ms; worst ${number(session.performance.maxFrameMs)} ms`,
      `Severity: ${session.severity}; ${session.counts.errors} runtime errors; ${session.incidents.length} incident categories. Zero runtime errors does not establish healthy gameplay.`,
      `Foreground raw intervals ≥50/100/250/1000 ms: ${THRESHOLDS.map((threshold) => session.performance.thresholds[`atLeast${threshold}Ms`]).join(" / ")}`,
      `Excluded hidden/transition intervals: ${session.excludedVisibilityPerformance.frames}; ≥50/100/250/1000 ms: ${THRESHOLDS.map((threshold) => session.excludedVisibilityPerformance.thresholds[`atLeast${threshold}Ms`]).join(" / ")}`,
      `Observer entries: ${session.observerCounts.sampledFrameHitches} sampled frame hitches, ${session.observerCounts.longtask} longtasks, ${session.observerCounts.longAnimationFrame} long-animation-frames. These can overlap and are not added to raw stall counts.`,
      `Network: ${session.network.inputOverflowEvents} input overflows / at least ${session.network.droppedInputsAtLeast} discarded inputs; ${session.network.resyncEvents} resyncs (${session.network.resyncsWithoutReason} without reason); ${session.network.hardCorrectionEvents} non-resync corrections ≥0.35 m; median/p95/max ${number(session.network.hardCorrectionMetres.median)} / ${number(session.network.hardCorrectionMetres.p95)} / ${number(session.network.hardCorrectionMetres.max)} m.`,
      `Server clock: ${serverClock.status}; observed increments ${serverClock.observed.callbacks ?? "unavailable"} callbacks / ${number(serverClock.observed.droppedMs)} ms dropped across ${serverClock.comparableIntervals} comparable intervals; ${serverClock.samples} retained samples.`,
      `Server clock sampled callback maxima elapsed/CPU: ${number(serverClock.sampledCurrentMaxMs.elapsed)} / ${number(serverClock.sampledCurrentMaxMs.cpu)} ms; reported lifetime maxima elapsed/CPU: ${number(serverClock.reportedLifetimeMaxMs.elapsed)} / ${number(serverClock.reportedLifetimeMaxMs.cpu)} ms (may include work before the first observation).`,
      `Server clock scope: ${serverClock.scope}`,
      `Server clock coverage: ${JSON.stringify(serverClock.diagnostics)}; ${serverClock.omittedSegments} segment details omitted.`,
      `Sources: ${session.sources.map((source) => `${source.gitHead ?? "no-git"} / ${source.contentSha256} / dirty=${source.dirty}`).join(", ")}`,
    );
    for (const item of session.incidents)
      lines.push(
        `INCIDENT [${item.severity}] ${item.code}: ${item.count}. ${item.message}`,
      );
    for (const warning of session.warnings) lines.push(`WARNING: ${warning}`);
    for (const record of session.worstForegroundFrameHitches.slice(0, 10)) {
      const { data } = record;
      lines.push(
        `FRAME +${number((data.intervalEndMs ?? record.atMs) / 1000)}s #${record.seq}: ${number(data.frameMs)} ms; previous-frame CPU ${number(data.previousFrame?.cpuMs)} ms; previous-frame phases ${JSON.stringify(data.previousFrame?.phases ?? null)}; previous-frame engine phases ${JSON.stringify(data.previousFrame?.enginePhases ?? null)}; sampled previous context ${JSON.stringify(data.previousContext ?? null)} (age ${number(data.previousContextAgeMs)} ms). CPU timing localizes recorded work; it does not establish GPU/shader causality.`,
      );
    }
    for (const [label, records] of [
      ["ERROR", session.errors],
      ["OBSERVER", session.worstObserverEntries.slice(0, 10)],
      ["CHANGE", session.changes.slice(-30)],
      ["LIFECYCLE", session.lifecycle.slice(-30)],
      ["ACTION", session.actions.slice(-30)],
    ])
      for (const record of records) {
        const timing =
          label === "OBSERVER"
            ? `observed start +${number(record.data.startTime / 1000)}s; delivered +${number(record.atMs / 1000)}s`
            : `+${number(record.atMs / 1000)}s`;
        lines.push(
          `${label} ${timing} #${record.seq} ${record.kind} ${JSON.stringify(record.data)}`,
        );
      }
    lines.push(`Files: ${session.files.join(", ")}`);
  }
  return lines.join("\n");
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  const args = process.argv.slice(2);
  const unexpected = args.filter(
    (arg) =>
      arg.startsWith("--") && !["--all", "--json", "--help"].includes(arg),
  );
  if (args.includes("--help"))
    console.log(
      "node scripts/diagnostics-report.mjs [file-or-directory] [--all] [--json]\nDefault: latest retained gameplay session (raw frames or game-ready) in .cache/game-diagnostics; latest session fallback when no gameplay exists. An explicit file reads only that file. Read only; --all covers every retained session. Text/JSON detail lists are bounded; aggregate counts and frame percentiles cover all delivered records.",
    );
  else if (unexpected.length) {
    console.error(`Unknown option: ${unexpected.join(", ")}`);
    process.exitCode = 1;
  } else {
    try {
      const report = await diagnosticsReport(
        args.find((arg) => !arg.startsWith("--")),
        { all: args.includes("--all") },
      );
      console.log(
        args.includes("--json")
          ? JSON.stringify(report, null, 2)
          : formatDiagnosticsReport(report),
      );
    } catch (error) {
      console.error(`Cannot read diagnostics: ${error.message}`);
      process.exitCode = 1;
    }
  }
}
