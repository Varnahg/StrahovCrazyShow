import { open, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { isAbsolute, join, relative, resolve } from "node:path";
import { StringDecoder } from "node:string_decoder";
import { spawn } from "node:child_process";
import { gameplayAcceptancePolicy } from "../shared/gameplay-acceptance.ts";
import { GameplayAcceptanceCollector } from "./gameplay-acceptance.mjs";

const delay = ms => new Promise(done => setTimeout(done, ms));
const optional = async (fn, fallback) => { try { return await fn(); } catch (e) { if (e.code === "ENOENT") return fallback; throw e; } };
const json = async file => {
  for (let attempt = 0; ; attempt++) {
    try { return await optional(async () => JSON.parse(await readFile(file, "utf8")), null); }
    catch (error) {
      // Runtime i benchmark se zapisují do nového souboru: krátce může být částečný.
      if (!(error instanceof SyntaxError) || attempt === 2) throw error;
      await delay(10);
    }
  }
};
const files = directory => optional(() => readdir(directory), []);
const save = (file, value) => writeFile(file, JSON.stringify(value, null, 2) + "\n", { flag: "wx" });
const sessionId = name => /^([a-f0-9-]{36})(?:\.part-\d+)?\.jsonl$/i.exec(name)?.[1];
const selectedKinds = new Set(["session-start", "source-identity", "presentation-rate", "mode-change", "renderer-ready", "lighting-preparation",
  "shader-syntax-cache", "startup-cpu-profile", "render-fault", "startup-error", "game-ready", "game-dispose"]);

export function validateExperimentPlan(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Experiment plan must be an object");
  for (const key of ["problem", "hypothesis", "change", "metric", "correctness", "acceptance"])
    if (typeof value[key] !== "string" || !value[key].trim() || value[key].length > 4000) throw new Error("Invalid plan field: " + key);
  if (!/^[a-f0-9]{64}$/.test(value.sourceHash ?? "")) throw new Error("Invalid sourceHash");
  if (!Number.isInteger(value.benchmarkCount) || value.benchmarkCount < 0 || value.benchmarkCount > 30) throw new Error("Invalid benchmarkCount");
  if (!Number.isInteger(value.timeoutSeconds) || value.timeoutSeconds < 30 || value.timeoutSeconds > 1800) throw new Error("Invalid timeoutSeconds");
  if (value.systemTelemetry !== undefined && typeof value.systemTelemetry !== "boolean") throw new Error("Invalid systemTelemetry");
  if (value.gameplayAcceptance !== undefined) value = { ...value, gameplayAcceptance: gameplayAcceptancePolicy(value.gameplayAcceptance) };
  return { ...value, systemTelemetry: value.systemTelemetry ?? true };
}

/** Jedno čtení nejvýše 1 MiB, UTF-8 i neúplný řádek přežijí další poll. */
export class IncrementalJsonl {
  offset = 0; pending = ""; hasMore = false; decoder = new StringDecoder("utf8");
  async read(file) {
    const handle = await optional(() => open(file, "r"), null);
    if (!handle) return [];
    try {
      const info = await handle.stat();
      if (info.size < this.offset) throw new Error("Log was truncated: " + file);
      const count = Math.min(info.size - this.offset, 1024 * 1024);
      if (!count) return [];
      const buffer = Buffer.allocUnsafe(count);
      const { bytesRead } = await handle.read(buffer, 0, count, this.offset);
      this.offset += bytesRead; this.hasMore = info.size > this.offset; this.pending += this.decoder.write(buffer.subarray(0, bytesRead));
      const end = this.pending.lastIndexOf("\n"), lines = end < 0 ? [] : this.pending.slice(0, end).split("\n");
      if (end >= 0) this.pending = this.pending.slice(end + 1);
      if (this.pending.length > 1024 * 1024) throw new Error("Oversized unfinished JSONL record: " + file);
      return lines.filter(line => line.trim()).map(line => JSON.parse(line));
    } finally { await handle.close(); }
  }
}

function startSystemSampler({ root, run, plan }) {
  const child = spawn("pwsh", ["-NoLogo", "-NoProfile", "-File", join(root, "scripts/capture-system-gpu.ps1"),
    "-OutputDirectory", join(run, "system"), "-DurationSeconds", String(plan.timeoutSeconds + 30),
    "-IntervalSeconds", "2"], { cwd: root, windowsHide: true, stdio: "ignore" });
  const state = { pid: child.pid, settled: false, error: null, code: null };
  state.done = new Promise(done => {
    child.once("error", error => { state.error = String(error); state.settled = true; done(); });
    child.once("exit", code => { state.code = code; state.settled = true; done(); });
  });
  return state;
}

async function stopFile(file) {
  try { await writeFile(file, "Owned experiment monitor requested cleanup\n", { flag: "wx" }); }
  catch (e) { if (e.code !== "EEXIST" && e.code !== "ENOENT") throw e; }
}

function benchmarkResult(value, expectedHash) {
  const b = value?.benchmark;
  if (value?.sourceSnapshotId !== expectedHash || b?.sourceSnapshotId !== expectedHash) throw new Error("Benchmark source identity mismatch");
  if (!Number.isInteger(b.frames) || b.frames <= 0 || !Number.isFinite(b.durationSeconds) || b.durationSeconds <= 0 ||
      b.renderErrorCount !== 0 || b.assetLoadErrorCount !== 0 || !Number.isFinite(b.averageFps) ||
      !Number.isFinite(b.p95FrameMs) || !Number.isFinite(b.p99FrameMs)) throw new Error("Incomplete or unhealthy benchmark");
  return { durationSeconds: b.durationSeconds, frames: b.frames, fps: b.averageFps, p95Ms: b.p95FrameMs,
    p99Ms: b.p99FrameMs, quality: b.quality ?? null, avatars: b.avatars ?? null, viewport: b.viewport ?? null, renderResolution: b.renderResolution ?? null };
}

/** Pozoruje jeden nový klient; serve vlastní server i jeho cleanup. Nikdy neřídí UI. */
export async function runExperiment({ root, run, planPath, serve, log = value => console.log(JSON.stringify(value)) }, runtime = {}) {
  root = resolve(root); run = resolve(run);
  const withinCache = relative(join(root, ".cache"), run);
  if (!withinCache || withinCache.startsWith("..") || isAbsolute(withinCache)) throw new Error("Run must be a new directory within root/.cache");
  if (await optional(() => stat(run), null)) throw new Error("Refusing to reuse an existing run directory");
  const plan = validateExperimentPlan(await json(planPath));
  const now = runtime.now ?? Date.now, sleep = runtime.sleep ?? delay, pollMs = runtime.pollMs ?? 500;
  const started = now(), deadline = started + plan.timeoutSeconds * 1000;
  const diagnosticDir = join(root, ".cache/game-diagnostics"), oldSessions = new Set((await files(diagnosticDir)).map(sessionId));
  const readers = new Map(), matched = new Set(), benchmarkFiles = new Set(), diagnostics = new Map();
  const gameplay = plan.gameplayAcceptance ? new GameplayAcceptanceCollector({ sourceHash: plan.sourceHash, policy: plan.gameplayAcceptance }) : null;
  const summary = { schemaVersion: 1, decision: "inconclusive", optimizationAccepted: false, gameplayAccepted: false, gameplay: null, sourceHash: plan.sourceHash,
    startedAtUTC: new Date(started).toISOString(), checks: { runtimeIdentity: false, clientIdentity: false, presentation: false,
      systemTelemetry: plan.systemTelemetry ? "pending" : "unavailable-by-plan", startupReady: false, cleanup: false },
    reasons: [], events: [], diagnosticFiles: [], benchmarks: [], telemetrySamples: 0, eventOmissions: 0 };
  let serverSettled = false, serverError = null, sampler, runtimeAt, readyAt, firstClientAt, lastTelemetryAt, savedPlan = false;
  let stopping = false, lastProgress = started, lastSeq = -1, clientStartupAt, clientReadyAt;
  let gameplayEnded = false, lastGameplayEvaluationMs = -Infinity;
  const cancellation = new AbortController();
  const onSignal = () => { stopping = true; cancellation.abort(); };
  process.once("SIGINT", onSignal); process.once("SIGTERM", onSignal);
  const serverDone = Promise.resolve().then(() => serve(cancellation.signal)).then(() => { serverSettled = true; }, error => { serverSettled = true; serverError = String(error); });
  const readRows = async file => { let reader = readers.get(file); if (!reader) readers.set(file, reader = new IncrementalJsonl()); return reader.read(file); };
  try {
    log({ phase: "starting", run, sourceHash: plan.sourceHash, deadlineUTC: new Date(deadline).toISOString() });
    while (now() < deadline && !stopping) {
      let diagnosticsDrained = true, telemetryDrained = true;
      if (serverSettled) throw new Error("Server ended before measurement: " + (serverError ?? "no error reported"));
      const info = await json(join(run, "runtime.json"));
      if (info) {
        if (info.sourceHash !== plan.sourceHash) throw new Error("Runtime source identity mismatch");
        summary.checks.runtimeIdentity = true;
        if (!savedPlan) {
          await save(join(run, "experiment-plan.json"), plan); savedPlan = true; runtimeAt = now();
          if (plan.systemTelemetry) sampler = (runtime.startSampler ?? startSystemSampler)({ root, run, plan });
          log({ phase: "server-ready", origin: info.origin, systemTelemetry: plan.systemTelemetry });
        }
      }
      if (sampler) {
        if (sampler.settled) throw new Error("System sampler ended during measurement: " + (sampler.error ?? sampler.code));
        const systemState = await json(join(run, "system/runtime.json"));
        if (systemState && systemState.status !== "running") throw new Error("System telemetry stopped: " + systemState.reason);
        for (const row of await readRows(join(run, "system/samples.jsonl"))) {
          if (row.recordType === "summary") throw new Error("System telemetry ended: " + row.reason);
          if (row.recordType === "sample") {
            const at = Date.parse(row.utc);
            if (!Number.isFinite(at) || at < started || at > now() + 5000) throw new Error("Invalid system sample timestamp");
            summary.telemetrySamples++; lastTelemetryAt = at; summary.checks.systemTelemetry = "observed";
          }
        }
        const systemReader = readers.get(join(run, "system/samples.jsonl"));
        telemetryDrained = !systemReader?.hasMore && !systemReader?.pending;
        if (now() - runtimeAt > (runtime.telemetryGraceMs ?? 30000) &&
            (lastTelemetryAt === undefined || now() - lastTelemetryAt > (runtime.telemetryStaleMs ?? 15000))) throw new Error("System telemetry missing or stale");
      }
      const names = (await files(diagnosticDir)).filter(name => sessionId(name) && !oldSessions.has(sessionId(name)))
        .sort((a, b) => sessionId(a).localeCompare(sessionId(b)) || Number(a.includes(".part-")) - Number(b.includes(".part-")) || a.localeCompare(b));
      for (const name of names) {
        const id = sessionId(name), file = join(diagnosticDir, name);
        for (const row of await readRows(file)) {
          const hash = row.source?.buildSnapshotId ?? row.records?.find(r => r.kind === "source-identity")?.data?.source?.buildSnapshotId;
          if (hash && hash !== plan.sourceHash) {
            if (gameplay && matched.has(id)) { gameplay.issue("source-identity", "Zdrojová identita relace se během měření změnila."); throw new Error("Gameplay source identity changed"); }
            diagnostics.set(id, false); continue;
          }
          if (hash === plan.sourceHash) { diagnostics.set(id, true); matched.add(id); }
          if (matched.size > 1) throw new Error("Multiple new matching clients; interval is ambiguous");
          if (!diagnostics.get(id)) continue;
          gameplay?.addBatch(row, id);
          summary.checks.clientIdentity = true; firstClientAt ??= now();
          if (!summary.diagnosticFiles.includes(file)) summary.diagnosticFiles.push(file);
          for (const record of row.records ?? []) {
            if (!Number.isInteger(record.seq) || record.seq !== lastSeq + 1) throw new Error("Diagnostic sequence gap or duplicate");
            lastSeq = record.seq;
            if (selectedKinds.has(record.kind)) {
              if (summary.events.length < 256) summary.events.push(JSON.stringify(record).length < 65536 ? record :
                { seq: record.seq, atMs: record.atMs, kind: record.kind, dataOmitted: "See raw diagnostic file" });
              else summary.eventOmissions++;
            }
            if (record.kind === "presentation-rate") summary.checks.presentation = record.data?.reliable === true && record.data?.observedBrowserHz >= 20;
            if (record.kind === "mode-change" && record.data?.mode === "multi" && Number.isFinite(record.atMs)) clientStartupAt = record.atMs;
            if (record.kind === "game-dispose" && gameplay) gameplayEnded = true;
            else if (["startup-error", "render-fault", "game-dispose"].includes(record.kind)) {
              summary.decision = summary.checks.startupReady ? "inconclusive" : "startup-failed";
              throw new Error("Client terminal event: " + record.kind);
            }
            if (record.kind === "game-ready") {
              summary.checks.startupReady = true; readyAt ??= now(); clientReadyAt = record.atMs;
              log({ phase: "game-ready", sessionId: id });
            }
          }
        }
        // Rotovaný díl nesmí předběhnout dosud nepřečtený konec předchozího.
        const reader = readers.get(file);
        if (reader?.hasMore || reader?.pending) { diagnosticsDrained = false; break; }
      }
      if (summary.checks.startupReady) for (const name of (await files(join(run, "benchmarks"))).filter(name => name.endsWith(".json"))) {
        if (benchmarkFiles.has(name)) continue;
        const file = join(run, "benchmarks", name), value = await json(file);
        const received = Date.parse(value?.receivedAtUTC);
        if (!Number.isFinite(received) || received < started) throw new Error("Benchmark timestamp does not belong to run");
        summary.benchmarks.push({ file, ...benchmarkResult(value, plan.sourceHash) }); benchmarkFiles.add(name);
        log({ phase: "benchmark-saved", count: benchmarkFiles.size, expected: plan.benchmarkCount });
      }
      if (summary.checks.runtimeIdentity && summary.checks.clientIdentity && summary.checks.presentation && summary.checks.startupReady &&
          diagnosticsDrained && telemetryDrained && (!plan.systemTelemetry || summary.checks.systemTelemetry === "observed") &&
          summary.benchmarks.length >= plan.benchmarkCount) {
        if (!gameplay) { summary.decision = "measurement-complete"; break; }
        if (gameplayEnded || (gameplay.visibleMs >= plan.gameplayAcceptance.minVisibleSeconds * 1000 &&
            gameplay.visibleMs - lastGameplayEvaluationMs >= 5000)) {
          lastGameplayEvaluationMs = gameplay.visibleMs;
          summary.gameplay = gameplay.assessment();
          if (summary.gameplay.status === "failed") {
            summary.decision = "gameplay-failed";
            summary.reasons.push(...summary.gameplay.reasons.map(reason => "Gameplay: " + reason.code));
            break;
          }
          if (summary.gameplay.status === "passed") { summary.decision = "measurement-complete"; break; }
          if (gameplayEnded) { summary.reasons.push("Gameplay ended without sufficient valid evidence"); break; }
        }
      }
      if (now() - lastProgress >= 10000) { log({ phase: "waiting", checks: summary.checks, benchmarks: summary.benchmarks.length }); lastProgress = now(); }
      await sleep(pollMs);
    }
    if (summary.decision === "inconclusive" && (stopping || now() >= deadline))
      summary.reasons.push(stopping ? "Interrupted" : "Experiment deadline reached; no success inferred");
  } catch (error) { summary.reasons.push(String(error)); }
  finally {
    cancellation.abort();
    const requestStop = async () => {
      for (const file of [join(run, "STOP"), join(run, "system/STOP")]) {
        try { await stopFile(file); } catch (error) { if (!summary.reasons.includes("STOP failed: " + error)) summary.reasons.push("STOP failed: " + error); }
      }
    };
    await requestStop();
    // This includes a full source/asset/dependency rehash (128s observed locally),
    // after the measured interval and STOP. It does not extend game readiness.
    const cleanupLimit = now() + (runtime.cleanupMs ?? 300000);
    while ((!serverSettled || (sampler && !sampler.settled)) && now() < cleanupLimit) {
      await sleep(pollMs); await requestStop();
    }
    if (serverSettled) await serverDone;
    const cleanupJson = async file => { try { return await json(file); } catch (error) { summary.reasons.push("Unreadable cleanup: " + error); return null; } };
    const cleanup = await cleanupJson(join(run, "cleanup.json"));
    const systemCleanup = sampler ? await cleanupJson(join(run, "system/runtime.json")) : null;
    summary.checks.cleanup = serverSettled && !serverError && cleanup?.apiExited === true && cleanup?.inputsRevalidated === true &&
      cleanup?.failure === null && Array.isArray(cleanup?.cleanupErrors) && cleanup.cleanupErrors.length === 0 &&
      (!sampler || (sampler.settled && !sampler.error && sampler.code === 0 && systemCleanup?.status === "stopped" && systemCleanup.reason === "stop-file" &&
        Array.isArray(systemCleanup.cleanupErrors) && systemCleanup.cleanupErrors.length === 0));
    if (!summary.checks.cleanup) {
      summary.reasons.push("Cleanup incomplete or input revalidation failed" + (serverError ? ": " + serverError : ""));
      if (["measurement-complete", "gameplay-failed"].includes(summary.decision)) summary.decision = "inconclusive";
    }
    summary.cleanup = { serverSettled, serverError, server: cleanup, system: systemCleanup, samplerPid: sampler?.pid ?? null };
    if (gameplay) {
      summary.gameplay = gameplay.assessment();
      summary.gameplayAccepted = summary.decision === "measurement-complete" && summary.checks.cleanup && summary.gameplay.status === "passed";
    }
    const wallMs = now() - started, startupObservedMs = readyAt === undefined ? null : readyAt - firstClientAt;
    const measuredMs = summary.benchmarks.reduce((sum, b) => sum + b.durationSeconds * 1000, 0);
    summary.timings = { wallMs, serverPreparationObservedMs: runtimeAt === undefined ? null : runtimeAt - started,
      startupClientMs: Number.isFinite(clientStartupAt) && Number.isFinite(clientReadyAt) && clientReadyAt >= clientStartupAt ? clientReadyAt - clientStartupAt : null,
      startupObservedMs, measuredMs, remainingMs: measuredMs + (startupObservedMs ?? 0) <= wallMs ? wallMs - measuredMs - (startupObservedMs ?? 0) : null,
      scope: "Observed wall phases; startup from first saved client log to saved ready. Remaining includes server preparation, UI, settling, observation and cleanup; it is not pure operator overhead." };
    summary.finishedAtUTC = new Date(now()).toISOString();
    process.removeListener("SIGINT", onSignal); process.removeListener("SIGTERM", onSignal);
    if (await optional(() => stat(run), null)) {
      if (!savedPlan) await save(join(run, "experiment-plan.json"), plan);
      await save(join(run, "experiment-summary.json"), summary);
    }
    log({ phase: "finished", decision: summary.decision, reasons: summary.reasons, cleanup: summary.checks.cleanup });
  }
  return summary;
}
