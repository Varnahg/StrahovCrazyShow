import { createReadStream } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { createGunzip } from "node:zlib";
import { createInterface } from "node:readline";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { assessFrameSample, DEFAULT_FRAME_ACCEPTANCE, gameplayAcceptancePolicy, MAX_ACCEPTANCE_FRAMES } from "../shared/gameplay-acceptance.ts";

const finite = value => typeof value === "number" && Number.isFinite(value);
const count = value => Number.isSafeInteger(value) && value >= 0;
const point = value => value && [value.x, value.y, value.z].every(finite);
const hashPattern = /^[a-f0-9]{64}$/;
const sessionPattern = /^[a-f0-9-]{36}$/i;

/** Omezený agregátor původních záznamů. Uchovává jen intervaly (nejvýše
 * MAX_ACCEPTANCE_FRAMES) a čítače; neukládá kopii resource/LoAF/raw payloadů. */
export class GameplayAcceptanceCollector {
  constructor({ sourceHash, policy = {} }) {
    if (!hashPattern.test(sourceHash ?? "")) throw new Error("Expected explicit sourceHash");
    this.sourceHash = sourceHash;
    this.policy = gameplayAcceptancePolicy(policy);
    this.frames = [];
    this.issues = new Map();
    this.sessionId = null;
    this.sourceSeen = false;
    this.sessionStart = false;
    this.lastSeq = -1;
    this.lastBatch = -1;
    this.recordCount = 0;
    this.readyAtMs = null;
    this.disposedAtMs = null;
    this.visibleMs = 0;
    this.movementMs = 0;
    this.travelMetres = 0;
    this.excludedWindows = 0;
    this.windowCount = 0;
    this.qualities = new Set();
    this.previousWindow = null;
    this.previousCounters = null;
    this.networkSamples = 0;
    this.resyncCounterDelta = 0;
    this.correctionCounterDelta = 0;
    this.resyncEvents = 0;
    this.correctionEvents = 0;
    this.maxCorrectionMetres = 0;
    this.motionBarrier = 0;
    this.browserVisible = null;
    this.hiddenAtMs = null;
    this.hiddenIntervals = [];
    this.pendingLeaveAtMs = null;
    this.maxAuthorityAgeMs = 0;
    this.authorityAgeSamples = 0;
    this.timelineWaits = 0;
    this.timelineWaitReasons = {};
    this.disconnectedWindows = 0;
  }
  issue(code, message) {
    if (this.issues.size < 32 && !this.issues.has(code)) this.issues.set(code, { code, message });
  }
  addBatch(row, knownSessionId) {
    if (!row || typeof row !== "object" || row.schemaVersion !== 1) {
      this.issue("invalid-batch", "Neplatná verze nebo tvar diagnostické dávky."); return;
    }
    const id = row.sessionId ?? knownSessionId;
    if (!sessionPattern.test(id ?? "") || this.sessionId && this.sessionId !== id)
      this.issue("session-identity", "Záznam nemá jednu jednoznačnou relaci.");
    else this.sessionId = id;
    const sourceHash = row.source?.buildSnapshotId;
    if (sourceHash !== this.sourceHash) this.issue("source-identity", "Zdrojový hash dávky neodpovídá zadání.");
    else this.sourceSeen = true;
    if (row.type === "session-log") return;
    if (!count(row.batchId) || row.batchId !== this.lastBatch + 1)
      this.issue("batch-gap", "Chybí dávka nebo je dávka duplicitní či přeházená.");
    this.lastBatch = row.batchId;
    if (!Array.isArray(row.records) || !row.records.length || row.records.length > 128) {
      this.issue("invalid-records", "Dávka nemá platný omezený seznam záznamů."); return;
    }
    for (const record of row.records) this.addRecord(record);
  }
  addRecord(record) {
    if (++this.recordCount > 2_000_000) { this.issue("record-limit", "Překročen limit zpracovaných záznamů."); return; }
    if (!record || !count(record.seq) || record.seq !== this.lastSeq + 1)
      this.issue("sequence-gap", "Číslování diagnostiky má mezeru nebo duplicitu.");
    this.lastSeq = record?.seq;
    if (!finite(record?.atMs) || record.atMs < 0 || typeof record.kind !== "string" || !record.data || typeof record.data !== "object") {
      this.issue("invalid-record", "Záznam nemá platný čas, typ nebo data."); return;
    }
    const { kind, atMs, data } = record;
    if (kind === "recording-gap") this.issue("recording-gap", "Recorder výslovně hlásí ztrátu záznamů.");
    if (kind === "session-start") {
      if (this.sessionStart) this.issue("multiple-starts", "Relace obsahuje více začátků.");
      this.sessionStart = true;
    }
    if (kind === "browser-state") {
      this.browserVisible = data.visibility === "visible";
      if (data.visibility === "hidden" && this.hiddenAtMs === null) this.hiddenAtMs = atMs;
      else if (data.visibility === "visible" && this.hiddenAtMs !== null) {
        if (atMs < this.hiddenAtMs) this.issue("visibility-clock", "Čas změny viditelnosti není platný.");
        else if (this.hiddenIntervals.length >= 4096) this.issue("visibility-limit", "Překročen limit intervalů viditelnosti.");
        else this.hiddenIntervals.push([this.hiddenAtMs, atMs]);
        this.hiddenAtMs = null;
      }
    }
    if (kind === "game-ready") {
      if (this.readyAtMs !== null) this.issue("multiple-games", "Hodnocení nesmí sloučit více herních životních cyklů.");
      else this.readyAtMs = atMs;
    }
    if (["startup-error", "render-fault"].includes(kind)) this.issue("runtime-fault", "Hra zaznamenala startup nebo renderovou chybu.");
    if (this.readyAtMs === null || atMs < this.readyAtMs || this.disposedAtMs !== null) return;
    if (["network-left", "network-disconnected"].includes(kind)) this.pendingLeaveAtMs = atMs;
    if (kind === "network-connected") this.pendingLeaveAtMs = null;
    if (kind === "game-dispose") { this.disposedAtMs = atMs; return; }
    if (kind === "network-timeline-wait" && this.browserVisible !== false) {
      if (!["no-authority", "stale-authority", "prediction-budget", "latency-budget"].includes(data.reason) || typeof data.recoveryRequested !== "boolean")
        this.issue("invalid-timeline-wait", "Čekání síťové timeline nemá známý typ.");
      else {
        this.timelineWaits++;
        this.timelineWaitReasons[data.reason] = (this.timelineWaitReasons[data.reason] ?? 0) + 1;
      }
    }
    if (kind === "network-correction" && this.browserVisible !== false) {
      if (typeof data.resync !== "boolean" || data.correctionAvailable !== true || !finite(data.correctionMetres) || data.correctionMetres < 0) {
        this.issue("invalid-correction", "Korekce nemá známou platnou vzdálenost nebo typ."); return;
      }
      if (data.resync) this.resyncEvents++;
      if (data.resync || data.correctionMetres >= 0.35) this.motionBarrier++;
      this.correctionEvents++;
      this.maxCorrectionMetres = Math.max(this.maxCorrectionMetres, data.correctionMetres);
    }
    if (kind === "frame-window") this.addWindow(data, atMs);
  }
  uncoveredGap(fromMs, toMs, toleranceMs = 2) {
    if (toMs <= fromMs + toleranceMs) return false;
    let cursor = fromMs;
    const spans = this.hiddenAtMs === null ? this.hiddenIntervals : [...this.hiddenIntervals, [this.hiddenAtMs, Infinity]];
    for (const [start, end] of spans) {
      if (end <= cursor) continue;
      if (start > cursor + toleranceMs) return true;
      cursor = Math.max(cursor, end);
      if (cursor + toleranceMs >= toMs) return false;
    }
    return cursor + toleranceMs < toMs;
  }
  addWindow(data, atMs) {
    const intervals = data.frameMs;
    if (!finite(data.fromMs) || !finite(data.toMs) || data.fromMs < 0 || data.toMs < data.fromMs || data.toMs > atMs + 1 ||
        !Array.isArray(intervals) || !intervals.length || intervals.length > 1024 ||
        intervals.some(x => !finite(x) || x <= 0 || x > 1_200_000) || data.summary?.frames !== intervals.length ||
        !["visible", "hidden", "transition", "unknown"].includes(data.visibility) || typeof data.afterVisibilityChange !== "boolean") {
      this.issue("invalid-window", "Snímkové okno je neúplné nebo neplatné."); return;
    }
    const sum = intervals.reduce((total, value) => total + value, 0);
    if (Math.abs(sum - (data.toMs - data.fromMs)) > intervals.length * 0.11 + 1)
      this.issue("window-duration", "Intervaly neodpovídají délce snímkového okna.");
    const previous = this.previousWindow;
    if (previous && data.fromMs < previous.toMs - 1)
      this.issue("window-overlap", "Snímková okna se překrývají nebo jsou duplicitní.");
    const eligible = data.visibility === "visible" && !data.afterVisibilityChange && data.fromMs >= this.readyAtMs;
    const contiguous = eligible && previous?.eligible && data.fromMs <= previous.toMs + 2;
    // I vyloučené transition/hidden okno je časový doklad. Nesmí však
    // automaticky omluvit libovolnou mezeru před následujícím oknem.
    const boundary = previous?.toMs ?? this.readyAtMs;
    if (this.uncoveredGap(boundary, data.fromMs, previous ? 2 : this.policy.maxFrameMs))
      this.issue(previous ? "window-gap" : "leading-window-gap", "Před snímkovým oknem chybí nevysvětlený časový úsek.");
    if (data.visibility === "unknown") this.issue("unknown-visibility", "Část herního intervalu nemá známou viditelnost.");
    const context = data.context;
    const current = { ...data, recordedAtMs: atMs, eligible, motionBarrier: this.motionBarrier };
    this.previousWindow = current;
    this.pendingLeaveAtMs = null;
    if (!eligible) { this.excludedWindows++; return; }
    if (this.frames.length + intervals.length > MAX_ACCEPTANCE_FRAMES) {
      this.issue("frame-limit", "Překročen limit snímků pro vyhodnocení."); return;
    }
    this.frames.push(...intervals);
    this.visibleMs += sum;
    this.windowCount++;
    if (!context || context.mode !== "multiplayer" || !["connected", "connecting", "disconnected"].includes(context.connection) ||
        !point(context.position) || !finite(context.speed) || !finite(data.contextAtMs) || data.contextAtMs > atMs + 1 ||
        !["low", "medium", "high"].includes(context.rendering?.quality)) {
      this.issue("invalid-context", "Chybí platný připojený herní kontext, rychlost nebo kvalita."); return;
    }
    if (context.connection !== "connected") this.disconnectedWindows++;
    this.qualities.add(context.rendering.quality);
    const net = context.network;
    if (!net || !count(net.corrections) || !count(net.resyncs) || !count(net.timeline?.inputEpoch)) {
      this.issue("missing-network", "Chybí platné kumulativní síťové čítače a epocha."); return;
    }
    if (net.authorityAgeMs === null || net.authorityAgeMs === undefined)
      this.issue("missing-authority-age", "Chybí stáří autority potřebné k ověření síťové čerstvosti.");
    else if (!finite(net.authorityAgeMs) || net.authorityAgeMs < 0)
      this.issue("invalid-authority-age", "Stáří autority není platné číslo.");
    else { this.authorityAgeSamples++; this.maxAuthorityAgeMs = Math.max(this.maxAuthorityAgeMs, net.authorityAgeMs); }
    this.networkSamples++;
    const counters = this.previousCounters;
    if (counters) {
      if (net.corrections < counters.corrections || net.resyncs < counters.resyncs)
        this.issue("network-counter-reset", "Síťový čítač klesl uvnitř stejné herní relace.");
      else if (contiguous) {
        this.resyncCounterDelta += net.resyncs - counters.resyncs;
        this.correctionCounterDelta += net.corrections - counters.corrections;
      }
    }
    this.previousCounters = { corrections: net.corrections, resyncs: net.resyncs };
    // Pohyb je odhad z recorderu, ne input replay. Teleport/resync/gap nesmí
    // vytvořit ujetou trasu; vzdálenost musí souhlasit s nenulovou rychlostí.
    const old = previous?.context;
    const dt = data.contextAtMs - (previous?.contextAtMs ?? NaN);
    if (contiguous && old && point(old.position) && old.connection === "connected" && context.connection === "connected" &&
        finite(old.speed) && context.speed >= 0.25 && old.speed >= 0.25 && dt > 0 && dt <= 2500 &&
        old.network?.resyncs === net.resyncs && old.network?.timeline?.inputEpoch === net.timeline.inputEpoch &&
        previous.motionBarrier === this.motionBarrier) {
      const distance = Math.hypot(context.position.x - old.position.x, context.position.y - old.position.y, context.position.z - old.position.z);
      if (distance >= 0.01 && distance <= Math.max(context.speed, old.speed) * dt / 1000 * 1.5 + 0.5) {
        this.travelMetres += distance;
        this.movementMs += Math.min(sum, dt);
      }
    }
  }
  assessment({ completeSession = false } = {}) {
    const framePolicy = Object.fromEntries(Object.keys(DEFAULT_FRAME_ACCEPTANCE).map(key => [key, this.policy[key]]));
    const frameSample = assessFrameSample(this.frames, framePolicy);
    const reasons = [...this.issues.values()];
    if (this.disposedAtMs !== null && this.previousWindow) {
      const last = this.previousWindow;
      // toMs je začátek posledního snímku. Na ukončení rozpracovaného
      // callbacku/intervalu povolujeme nejvýše jeden přípustný maxFrameMs.
      const end = this.pendingLeaveAtMs ?? this.disposedAtMs;
      if (this.uncoveredGap(last.toMs, end, this.policy.maxFrameMs))
        reasons.push({ code: "trailing-window-gap", message: "Před ukončením hraní chybí nevysvětlený snímkový interval." });
    }
    if (!this.sourceSeen || !this.sessionId || !this.sessionStart || this.readyAtMs === null)
      reasons.push({ code: "missing-identity-or-ready", message: "Chybí doložená identita a připravený herní životní cyklus." });
    if (this.networkSamples < 2) reasons.push({ code: "missing-network", message: "Chybí alespoň dva síťové snapshoty viditelného hraní." });
    // Při chybě identity/pořadí/čísel není bezpečné připsat výsledek scénáři.
    // Zjištěná mezera wall-time coverage ale nesmí skrýt doložený dlouhý snímek.
    const coverageIssues = reasons.filter(reason => ["window-duration", "window-gap", "leading-window-gap", "trailing-window-gap", "unknown-visibility", "missing-authority-age"].includes(reason.code));
    const invalid = reasons.length > coverageIssues.length;
    if (completeSession && this.disposedAtMs === null) {
      const issue = { code: "missing-game-dispose", message: "Záznam neobsahuje potvrzené ukončení herní relace." };
      coverageIssues.push(issue); reasons.push(issue);
    }
    reasons.push(...frameSample.reasons);
    const coverageReasons = [];
    for (const [code, message, actual, limit] of [
      ["short-gameplay", "Chybí dostatečně dlouhé viditelné hraní.", this.visibleMs / 1000, this.policy.minVisibleSeconds],
      ["missing-movement", "Chybí dostatečný čas doloženého pohybu.", this.movementMs / 1000, this.policy.minMovementSeconds],
      ["short-route", "Chybí dostatečná doložená trasa.", this.travelMetres, this.policy.minTravelMetres],
    ]) if (actual + 1e-9 < limit) coverageReasons.push({ code, message, actual, limit });
    reasons.push(...coverageReasons);
    // Detailní eventy jsou filtrované, absolutní snapshoty kumulativní.
    // Dvě pozorování téže resynchronizace se nikdy nesčítají.
    const resyncs = Math.max(this.resyncEvents, this.resyncCounterDelta);
    const resyncsPerMinute = this.visibleMs > 0 ? resyncs * 60000 / this.visibleMs : null;
    const timelineWaitsPerMinute = this.visibleMs > 0 ? this.timelineWaits * 60000 / this.visibleMs : null;
    const networkReasons = [];
    if (resyncsPerMinute !== null && resyncsPerMinute > this.policy.maxResyncsPerMinute)
      networkReasons.push({ code: "resync-rate", message: "Četnost resynchronizací překračuje mez.", actual: resyncsPerMinute, limit: this.policy.maxResyncsPerMinute });
    if (this.maxCorrectionMetres > this.policy.maxCorrectionMetres)
      networkReasons.push({ code: "position-correction", message: "Korekce polohy překračuje mez.", actual: this.maxCorrectionMetres, limit: this.policy.maxCorrectionMetres });
    if (this.maxAuthorityAgeMs > this.policy.maxAuthorityAgeMs)
      networkReasons.push({ code: "stale-authority", message: "Stáří autority překračuje mez.", actual: this.maxAuthorityAgeMs, limit: this.policy.maxAuthorityAgeMs });
    if (timelineWaitsPerMinute !== null && timelineWaitsPerMinute > this.policy.maxTimelineWaitsPerMinute)
      networkReasons.push({ code: "timeline-wait-rate", message: "Četnost čekání síťové timeline překračuje mez.", actual: timelineWaitsPerMinute, limit: this.policy.maxTimelineWaitsPerMinute });
    if (this.disconnectedWindows)
      networkReasons.push({ code: "connection-not-ready", message: "Během viditelného hraní nebylo připojení připravené.", actual: this.disconnectedWindows, limit: 0 });
    reasons.push(...networkReasons);
    const failed = frameSample.status === "failed" || networkReasons.length > 0;
    return {
      schemaVersion: 1, scope: "gameplay", status: invalid ? "inconclusive" : failed ? "failed" :
        frameSample.status === "passed" && !coverageReasons.length && !coverageIssues.length ? "passed" : "inconclusive",
      observationScope: completeSession ? "complete-game-session" : "planned-measurement-window",
      sourceHash: this.sourceHash, sessionId: this.sessionId, policy: this.policy, reasons,
      evidenceValid: !invalid, coverageComplete: !invalid && !coverageReasons.length && !coverageIssues.length, coverageIssues,
      frameSample, readyAtMs: this.readyAtMs, disposedAtMs: this.disposedAtMs,
      coverage: { visibleSeconds: this.visibleMs / 1000, movementSeconds: this.movementMs / 1000, travelMetres: this.travelMetres,
        boundaryAllowanceMs: this.policy.maxFrameMs,
        movementScope: "Conservative estimate from contiguous position/speed snapshots without correction or epoch changes; not an input replay",
        windows: this.windowCount, excludedWindows: this.excludedWindows, qualities: [...this.qualities] },
      network: { samples: this.networkSamples, resyncs, resyncEvents: this.resyncEvents, resyncCounterDelta: this.resyncCounterDelta,
        resyncsPerMinute, correctionCounterDelta: this.correctionCounterDelta, detailedCorrectionEvents: this.correctionEvents,
        maxCorrectionMetres: this.maxCorrectionMetres,
        authorityAgeSamples: this.authorityAgeSamples, maxAuthorityAgeMs: this.authorityAgeSamples ? this.maxAuthorityAgeMs : null,
        timelineWaits: this.timelineWaits, timelineWaitReasons: { ...this.timelineWaitReasons }, timelineWaitsPerMinute,
        disconnectedWindows: this.disconnectedWindows,
        scope: "Resyncs=max(detailed visible events,cumulative snapshot delta), never their sum; detailed correction distance is a lower-bound maximum" },
      records: this.recordCount, lastSeq: this.lastSeq,
    };
  }
}

export async function evaluateGameplayLog(path, options) {
  const collector = new GameplayAcceptanceCollector(options);
  const input = createReadStream(path);
  const stream = path.endsWith(".gz") ? input.pipe(createGunzip()) : input;
  let bytes = 0, lastByte;
  if (stream !== input) input.on("error", error => stream.destroy(error));
  stream.on("data", chunk => {
    bytes += chunk.length; lastByte = chunk[chunk.length - 1];
    if (bytes > 256 * 1024 * 1024) stream.destroy(new Error("Diagnostic input size limit"));
  });
  const lines = createInterface({ input: stream, crlfDelay: Infinity });
  try {
    for await (const line of lines) {
      if (Buffer.byteLength(line) > 1024 * 1024) throw new Error("Diagnostic line size limit");
      if (!line.trim()) continue;
      try { collector.addBatch(JSON.parse(line)); }
      catch (error) { collector.issue("invalid-jsonl", "Neplatný JSONL záznam: " + String(error).slice(0, 200)); }
    }
    if (lastByte !== 10) collector.issue("unterminated-jsonl", "Poslední JSONL řádek není potvrzen koncem řádku.");
  } finally { lines.close(); stream.destroy(); input.destroy(); }
  return collector.assessment({ completeSession: true });
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 1 && args[0] === "--help") {
    console.log("node scripts/gameplay-acceptance.mjs <recording.jsonl[.gz]> --source <sha256> [--policy <json>] [--output <new.json>]"); return;
  }
  const path = args.shift();
  const flags = {};
  while (args.length) {
    const key = args.shift(), value = args.shift();
    if (!["--source", "--policy", "--output"].includes(key) || !value || Object.hasOwn(flags, key)) throw new Error("Invalid CLI arguments");
    flags[key] = value;
  }
  if (!path || path.startsWith("--")) throw new Error("Explicit diagnostic log path required");
  const policy = flags["--policy"] ? JSON.parse(await readFile(flags["--policy"], "utf8")) : {};
  const result = await evaluateGameplayLog(path, { sourceHash: flags["--source"], policy });
  const output = JSON.stringify(result, null, 2) + "\n";
  if (flags["--output"]) await writeFile(flags["--output"], output, { flag: "wx" });
  console.log(output.trimEnd());
  process.exitCode = result.status === "passed" ? 0 : result.status === "failed" ? 2 : 3;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
