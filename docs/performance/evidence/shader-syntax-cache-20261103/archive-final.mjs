// Jednorázový archiv existujících dokončených běhů; nespouští hru ani měření.
import { readFile, readdir, mkdir, writeFile, copyFile } from "node:fs/promises";
import { resolve, join, relative } from "node:path";
import { createHash } from "node:crypto";
import { gzipSync, gunzipSync } from "node:zlib";

const root = resolve(import.meta.dirname, "../../../..");
const candidate = join(root, ".cache/render-next-20261102/candidate9");
const out = join(import.meta.dirname, "final-artifacts");
await mkdir(out); // Nikdy nepřepsat předchozí důkaz.
const hash = bytes => createHash("sha256").update(bytes).digest("hex");
const artifacts = [];
async function archive(file, name) {
  const bytes = await readFile(file), packed = gzipSync(bytes);
  if (!bytes.equals(gunzipSync(packed))) throw new Error("Archive roundtrip failed: " + file);
  await writeFile(join(out, name + ".gz"), packed, { flag: "wx" });
  artifacts.push({ source: relative(root, file).replaceAll("\\", "/"), archive: "final-artifacts/" + name + ".gz",
    bytes: bytes.length, sha256: hash(bytes), gzipBytes: packed.length, gzipSha256: hash(packed) });
}
const runs = [];
for (const [label, name] of [["on1", "run1"], ["off1", "run2"], ["off2", "run3"], ["on2", "run1-attempt2"]]) {
  const folder = join(candidate, "runs", name);
  const report = JSON.parse(await readFile(join(folder, "experiment-summary.json"), "utf8"));
  if (!report.checks.cleanup || !report.cleanup.server.inputsRevalidated) throw new Error("Unverified cleanup: " + name);
  const records = [];
  for (const file of report.diagnosticFiles) {
    const rows = (await readFile(file, "utf8")).trim().split("\n").map(JSON.parse);
    records.push(...rows.flatMap(row => row.records ?? []));
    await archive(file, label + "-" + file.split(/[\\/]/).at(-1));
  }
  for (let i = 0; i < records.length; i++) if (records[i].seq !== i) throw new Error("Sequence gap: " + label + ":" + i);
  const last = kind => records.filter(row => row.kind === kind).at(-1)?.data ?? null;
  const preparation = last("lighting-preparation");
  runs.push({ label, run: name, sourceHash: report.sourceHash, decision: report.decision, checks: report.checks,
    timings: report.timings, presentation: last("presentation-rate"), renderer: last("renderer-ready"),
    qualities: preparation?.qualities, preparationMs: preparation?.elapsedMs,
    lastStage: preparation?.stages?.at(-1)?.stage,
    cache: last("shader-syntax-cache"), errors: records.filter(r => ["render-fault", "startup-error"].includes(r.kind)),
    benchmarkResults: report.benchmarks, diagnosticRecordCount: records.length });
  for (const file of await readdir(folder)) if (/\.json$/.test(file) || file === "peers-samples.jsonl")
    await archive(join(folder, file), label + "-" + file);
  for (const file of ["runtime.json", "samples.jsonl"]) await archive(join(folder, "system", file), label + "-system-" + file);
  if (report.benchmarks.length) for (const b of report.benchmarks) await archive(b.file, label + "-benchmark-" + b.file.split(/[\\/]/).at(-1));
}
if (new Set(runs.map(run => run.sourceHash)).size !== 1) throw new Error("Different builds");
await archive(join(candidate, "build/identity.json"), "candidate9-build-identity.json");
for (const label of ["on1", "off1", "off2", "on2"]) await archive(join(candidate, "plan-" + label + ".json"), "plan-" + label + ".json");
const checks = join(root, ".cache/shader-syntax-cache-integration-20261103");
for (const file of ["final-full-tests.log", "pdf-isolated.log", "final-targeted.log", "final-build.log", "final-build-2.log",
  "final-integration.log", "monitor-import-fix.log", "monitor-revalidation-budget.log", "dependency-v4-audit.json", "install-v4.log"])
  await archive(join(checks, file), file);
await copyFile(join(candidate, "three-player-medium.jpg"), join(out, "three-player-medium.jpg"));
const shot = await readFile(join(out, "three-player-medium.jpg"));
artifacts.push({ archive: "final-artifacts/three-player-medium.jpg", bytes: shot.length, sha256: hash(shot) });
const result = { schemaVersion: 1, capturedAtUTC: new Date().toISOString(), decision: "not-accepted-default-remains-off",
  reason: "Only one of two enabled starts reached Game.ready; both controls timed out, off2 had unstable idle cadence. No valid paired startup speed estimate.",
  plan: "final-campaign.md", runs, artifacts,
  validation: { fullTests: { total: 3029, pass: 3023, fail: 1, skipped: 5,
    failed: "rag-pdf-extraction: an immediately resolving endless stream cannot starve the deadline", isolatedRerun: "1/1 PASS" },
    cacheTargeted: "70/70 PASS", monitor: "20/20 PASS", harness: "3/3 PASS", productionBuild: "PASS after TS7016 runtime-import repair", sdkIntegration: "PASS" },
  limitations: ["No accepted gameplay FPS gain", "No full B6/car/night route acceptance", "No driver-cache purge or fixed clocks",
    "Settings panel open in three spawn samples; two SDK peers, not three humans", "Remaining wall time includes verification, UI, settling and cleanup",
    "startupClientMs uses client mode-change to game-ready; startupObservedMs uses saved-log observations"] };
await writeFile(join(import.meta.dirname, "final-results.json"), JSON.stringify(result, null, 2) + "\n", { flag: "wx" });
console.log(JSON.stringify({ runs: runs.map(r => ({ label: r.label, decision: r.decision, qualities: r.qualities,
  cache: r.cache?.syntaxCache?.stats, renderer: r.renderer })), artifacts: artifacts.length,
  rawBytes: artifacts.reduce((n, a) => n + a.bytes, 0), packedBytes: artifacts.reduce((n, a) => n + (a.gzipBytes ?? a.bytes), 0) }));
