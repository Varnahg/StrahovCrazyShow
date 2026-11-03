import test from "node:test";
import assert from "node:assert/strict";
import { appendFile, mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
// Runtime Node helper, matching the other .mjs harness tests in this repository.
const { IncrementalJsonl, runExperiment, validateExperimentPlan } =
  await import(new URL("../scripts/performance-experiment.mjs", import.meta.url).href);

const hash = "a".repeat(64), id = "11111111-1111-4111-8111-111111111111";
const plan = { problem: "Start čeká", hypothesis: "Cache zkrátí parsing", change: "Cache on", metric: "Startup ms",
  correctness: "Stejné shader varianty", acceptance: "Opakovaný zdravý start", sourceHash: hash,
  benchmarkCount: 0, timeoutSeconds: 30, systemTelemetry: true };
const store = (file: string, value: unknown) => writeFile(file, JSON.stringify(value) + "\n");
const exists = async (file: string) => { try { await stat(file); return true; } catch { return false; } };
const event = (seq: number, kind: string, data: object = {}) => ({ seq, atMs: seq * 10, kind, data });
const readyRecords = () => [event(0, "session-start"), event(1, "mode-change", { mode: "multi" }),
  event(2, "presentation-rate", { reliable: true, observedBrowserHz: 60 }), event(3, "game-ready")];
const batch = (records: unknown[], buildSnapshotId = hash) => ({ source: { buildSnapshotId }, records });

test("plán vyžaduje hypotézu, korektnost, hash a omezenou délku před startem", () => {
  assert.equal(validateExperimentPlan({ ...plan, systemTelemetry: undefined }).systemTelemetry, true);
  for (const change of [{ hypothesis: " " }, { sourceHash: "head" }, { benchmarkCount: 1.5 }, { timeoutSeconds: 0 }, { systemTelemetry: "yes" }])
    assert.throws(() => validateExperimentPlan({ ...plan, ...change }));
});

test("JSONL zachová rozdělené UTF-8 a neúplný řádek bez znovučtení", async () => {
  const root = await mkdtemp(join(tmpdir(), "render-lines-"));
  try {
    const file = join(root, "log.jsonl"), bytes = Buffer.from('{"text":"příprava"}\n');
    const at = bytes.indexOf(Buffer.from("ř")) + 1;
    await writeFile(file, bytes.subarray(0, at));
    const reader = new IncrementalJsonl(); assert.deepEqual(await reader.read(file), []);
    const firstOffset = reader.offset;
    await appendFile(file, bytes.subarray(at));
    assert.deepEqual(await reader.read(file), [{ text: "příprava" }]);
    assert.ok(reader.offset > firstOffset); assert.deepEqual(await reader.read(file), []);
    await writeFile(file, ""); await assert.rejects(reader.read(file), /truncated/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

type Options = { records?: object[]; buildHash?: string; runtimeHash?: string; count?: number; telemetry?: boolean;
  noSample?: boolean; stopSampler?: boolean; badCleanup?: boolean; rotate?: boolean; secondClient?: boolean;
  missingCleanup?: boolean; benchmark?: boolean; oldClient?: boolean; partial?: boolean; backlog?: boolean; backlogFault?: boolean; cleanupSamplerLimit?: boolean };
async function fixture(options: Options = {}) {
  const root = await mkdtemp(join(tmpdir(), "render-experiment-")), run = join(root, ".cache/run1");
  const diag = join(root, ".cache/game-diagnostics"), planPath = join(root, "plan.json");
  let time = Date.parse("2026-11-03T12:00:00Z"), finishServer!: () => void, finished = false, sampler: any;
  await mkdir(diag, { recursive: true });
  await store(planPath, { ...plan, benchmarkCount: options.count ?? 0, systemTelemetry: options.telemetry ?? true });
  if (options.oldClient) await store(join(diag, id + ".jsonl"), batch(readyRecords()));
  const serve = async () => {
    await mkdir(run);
    await store(join(run, "runtime.json"), { sourceHash: options.runtimeHash ?? hash, origin: "http://127.0.0.1:4179" });
    const records = options.records ?? readyRecords();
    if (!options.oldClient) {
      if (options.backlogFault) {
        const lines = [batch(readyRecords()), ...Array.from({ length: 120 }, (_, i) => batch([
          event(i + 4, "unselected", { text: "x".repeat(10000) })])), batch([event(124, "render-fault")])];
        await writeFile(join(diag, id + ".jsonl"), lines.map(line => JSON.stringify(line)).join("\n") + "\n");
      } else if (options.backlog) {
        await writeFile(join(diag, id + ".jsonl"), Array.from({ length: 120 }, (_, seq) => JSON.stringify(batch([
          event(seq, "unselected", { text: "x".repeat(10000) })]))).join("\n") + "\n");
        await store(join(diag, id + ".part-0001.jsonl"), batch([
          event(120, "presentation-rate", { reliable: true, observedBrowserHz: 60 }), event(121, "game-ready")]));
      } else if (options.rotate) {
        await store(join(diag, id + ".jsonl"), batch(records.slice(0, 2), options.buildHash));
        await store(join(diag, id + ".part-0001.jsonl"), batch(records.slice(2), options.buildHash));
      } else if (options.partial) await writeFile(join(diag, id + ".jsonl"), JSON.stringify(batch(records)));
      else await store(join(diag, id + ".jsonl"), batch(records, options.buildHash));
      if (options.secondClient) await store(join(diag, "22222222-2222-4222-8222-222222222222.jsonl"), batch(readyRecords()));
    }
    if (options.benchmark) {
      await mkdir(join(run, "benchmarks"));
      await store(join(run, "benchmarks/a.json"), { sourceSnapshotId: hash, receivedAtUTC: new Date(time).toISOString(),
        benchmark: { sourceSnapshotId: hash, frames: 3, durationSeconds: .01, renderErrorCount: 0, assetLoadErrorCount: 0,
          averageFps: 30, p95FrameMs: 35, p99FrameMs: 40, quality: "medium", avatars: 3, viewport: { width: 1280, height: 720 } } });
    }
    await new Promise<void>(done => { finishServer = done; });
  };
  const runtime = {
    now: () => time, pollMs: 1, cleanupMs: 5000, telemetryGraceMs: 2000, telemetryStaleMs: 2000,
    startSampler: ({ run }: { run: string }) => {
      sampler = { settled: false, error: null, code: null, pid: 123 };
      return sampler;
    },
    sleep: async () => {
      time += 1000;
      if (sampler && !await exists(join(run, "system"))) {
        await mkdir(join(run, "system"));
        await store(join(run, "system/runtime.json"), { status: "running" });
        if (!options.noSample) await store(join(run, "system/samples.jsonl"), { recordType: "sample", utc: new Date(time).toISOString() });
      }
      if (sampler && options.stopSampler && !finished) {
        await store(join(run, "system/runtime.json"), { status: "stopped", reason: "output-limit", cleanupErrors: [] });
        sampler.settled = true; sampler.code = 0;
      }
      if (options.partial && await exists(join(diag, id + ".jsonl"))) {
        await appendFile(join(diag, id + ".jsonl"), "\n"); options.partial = false;
      }
      if (!finished && await exists(join(run, "STOP"))) {
        finished = true;
        if (!options.missingCleanup) await store(join(run, "cleanup.json"), { apiExited: true, inputsRevalidated: !options.badCleanup,
          failure: null, cleanupErrors: options.badCleanup ? ["changed input"] : [] });
        if (sampler) {
          sampler.settled = true; sampler.code = 0;
          await store(join(run, "system/runtime.json"), { status: "stopped", reason: options.cleanupSamplerLimit ? "output-limit" : "stop-file", cleanupErrors: [] });
        }
        finishServer?.();
      }
      await new Promise<void>(done => setImmediate(done));
    }
  };
  try {
    const result = await runExperiment({ root, run, planPath, serve, log: () => {} }, runtime);
    assert.deepEqual(JSON.parse(await readFile(join(run, "experiment-summary.json"), "utf8")), result);
    assert.equal(await exists(join(run, "STOP")), true);
    return result;
  } finally { await rm(root, { recursive: true, force: true }); }
}

test("úspěch vyžaduje uložený startup, presentation, systémový vzorek a cleanup", async () => {
  const result = await fixture(); assert.equal(result.decision, "measurement-complete", result.reasons.join());
  assert.equal(result.optimizationAccepted, false); assert.equal(result.telemetrySamples, 1); assert.equal(result.checks.cleanup, true);
  assert.equal(result.timings.startupClientMs, 20);
});
test("rotované díly téže session zachovají pořadí", async () => {
  const result = await fixture({ rotate: true }); assert.equal(result.decision, "measurement-complete"); assert.equal(result.diagnosticFiles.length, 2);
});
test("rotace nepředběhne více než 1 MiB nevyčteného základního logu", async () => {
  const result = await fixture({ backlog: true, telemetry: false });
  assert.equal(result.decision, "measurement-complete"); assert.equal(result.diagnosticFiles.length, 2);
});
test("ready v prvním chunku nesmí skrýt chybu v již uloženém backlogu", async () => {
  const result = await fixture({ backlogFault: true, telemetry: false });
  assert.equal(result.decision, "inconclusive"); assert.match(result.reasons.join(), /render-fault/);
});
test("neúplný poslední řádek nedokončí startup před jeho doručením", async () => {
  assert.equal((await fixture({ partial: true })).decision, "measurement-complete");
});
test("benchmarky se shodným hashem se uloží do souhrnu", async () => {
  const result = await fixture({ count: 1, benchmark: true }); assert.equal(result.decision, "measurement-complete");
  assert.equal(result.benchmarks.length, 1); assert.equal(result.timings.measuredMs, 10);
});
test("vypnutá systémová telemetrie je výslovně omezená", async () => {
  const result = await fixture({ telemetry: false }); assert.equal(result.decision, "measurement-complete");
  assert.equal(result.checks.systemTelemetry, "unavailable-by-plan");
});
test("jiný runtime hash se odmítne a vlastní server se uklidí", async () => {
  const result = await fixture({ runtimeHash: "b".repeat(64) }); assert.equal(result.decision, "inconclusive");
  assert.match(result.reasons.join(), /Runtime source identity/); assert.equal(result.checks.cleanup, true);
});
test("jiný klientský hash ani stará session neprokážou ready", async () => {
  for (const options of [{ buildHash: "b".repeat(64) }, { oldClient: true }]) {
    const result = await fixture(options); assert.equal(result.decision, "inconclusive"); assert.equal(result.checks.clientIdentity, false);
  }
});
test("dva nové klienty se shodným hashem jsou nejednoznačné", async () => {
  const result = await fixture({ secondClient: true }); assert.equal(result.decision, "inconclusive"); assert.match(result.reasons.join(), /Multiple new/);
});
test("chybějící a ukončený systémový sběr nepovolí úspěch", async () => {
  for (const options of [{ noSample: true }, { stopSampler: true }]) {
    const result = await fixture(options); assert.equal(result.decision, "inconclusive"); assert.match(result.reasons.join(), /telemetry|sampler/);
  }
});
test("startup-error je selhání; timeout bez ready je neprůkazný", async () => {
  const result = await fixture({ records: [event(0, "startup-error", { message: "timeout" })] });
  assert.equal(result.decision, "startup-failed");
  assert.equal((await fixture({ records: [event(0, "session-start")], telemetry: false })).decision, "inconclusive");
});
test("chyba po ready zneplatní herní měření bez přeznačení na startup timeout", async () => {
  const result = await fixture({ records: [...readyRecords(), event(4, "render-fault")] });
  assert.equal(result.decision, "inconclusive"); assert.equal(result.checks.startupReady, true);
});
test("mezera diagnostických sekvencí se nezamění za úplný profil", async () => {
  const result = await fixture({ records: [event(0, "session-start"), event(2, "game-ready")] });
  assert.equal(result.decision, "inconclusive"); assert.match(result.reasons.join(), /sequence gap/);
});
test("chybějící cleanup nebo změněné vstupy zneplatní dokončené měření", async () => {
  for (const options of [{ badCleanup: true }, { missingCleanup: true }]) {
    const result = await fixture(options); assert.equal(result.decision, "inconclusive"); assert.equal(result.checks.cleanup, false);
  }
});
test("output-limit mezi posledním vzorkem a cleanup není úspěšné ukončení", async () => {
  const result = await fixture({ cleanupSamplerLimit: true });
  assert.equal(result.decision, "inconclusive"); assert.equal(result.checks.cleanup, false);
  assert.equal(result.cleanup.system.reason, "output-limit");
});

test("abort dorazí před vytvořením runu a STOP se doručí i pozdě vzniklému adresáři", async () => {
  const root = await mkdtemp(join(tmpdir(), "render-late-run-")), run = join(root, ".cache/run1"), planPath = join(root, "plan.json");
  await mkdir(join(root, ".cache")); await store(planPath, { ...plan, systemTelemetry: false });
  let time = Date.parse("2026-11-03T12:00:00Z"), observedAbort = false;
  try {
    const result = await runExperiment({ root, run, planPath, log: () => {}, serve: async (signal: AbortSignal) => {
      await new Promise<void>(done => signal.addEventListener("abort", () => { observedAbort = true; done(); }, { once: true }));
      // Reprodukuje poslední asynchronní mkdir již rozběhnuté přípravy.
      await mkdir(run);
      while (!await exists(join(run, "STOP"))) await new Promise(done => setTimeout(done, 1));
      await store(join(run, "cleanup.json"), { apiExited: true, inputsRevalidated: true, failure: null, cleanupErrors: [] });
    } }, { now: () => time, pollMs: 1, cleanupMs: 10000,
      sleep: async () => { time += 1000; await new Promise(done => setTimeout(done, 2)); } });
    assert.equal(observedAbort, true); assert.equal(result.decision, "inconclusive"); assert.equal(result.checks.cleanup, true);
    assert.equal(await exists(join(run, "STOP")), true);
  } finally { await rm(root, { recursive: true, force: true }); }
});
