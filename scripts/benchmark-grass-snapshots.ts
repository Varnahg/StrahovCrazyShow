/** CPU-only, paired real PhotoGrassBatch campaign. Never a renderer/FPS benchmark. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFile, mkdir, writeFile, appendFile } from "node:fs/promises";
import { cpus, platform, release, totalmem } from "node:os";
import { resolve, relative, isAbsolute, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Script } from "node:vm";
import ts from "typescript";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import * as thinInstances from "@babylonjs/core/Meshes/thinInstanceMesh";
import * as bounding from "@babylonjs/core/Culling/boundingInfo";
import * as vectors from "@babylonjs/core/Maths/math.vector";
import * as budget from "../client/photo-grass-budget";
import type { PhotoGrassBatch, GrassRootState } from "../client/photo-grass-batch";

const root = resolve(import.meta.dirname, "..");
const batchPath = "client/photo-grass-batch.ts";
const hash = (value: string | Uint8Array) => createHash("sha256").update(value).digest("hex");
const git = (...args: string[]) => execFileSync("git", args, { cwd: root, windowsHide: true, maxBuffer: 8 * 1024 * 1024 });
export const SIZES = [256, 2048, 8192] as const;
export const SCENARIOS = ["sparse-1", "sparse-32", "tail-remove", "fade-only", "no-op", "full-churn", "rebound"] as const;
export const CONTROL_SCENARIOS = ["no-op", "fade-only"] as const;
type ControlScenario = typeof CONTROL_SCENARIOS[number];
type Variant = "baseline" | "candidate";
export type Scenario = typeof SCENARIOS[number];
type BatchConstructor = typeof PhotoGrassBatch;
type Options = { baseline: string; out: string; pairs: number; iterations?: number; warmup?: number; controlsOnly: boolean };
const USAGE = "node --import tsx scripts/benchmark-grass-snapshots.ts --baseline FULL_40_HEX_COMMIT --out ABSOLUTE_NEW_DIRECTORY [--pairs 5] [--iterations N] [--warmup N] [--controls-only]";

export function parseArguments(args: string[]): Options | { help: true } {
  if (args.length === 1 && ["--help", "-h"].includes(args[0])) return { help: true };
  const values: Record<string, string> = {};
  let controlsOnly = false;
  for (let i = 0; i < args.length; i++) {
    const key = args[i];
    if (key === "--controls-only") {
      if (controlsOnly) throw new Error("Duplicate --controls-only");
      controlsOnly = true; continue;
    }
    const value = args[++i];
    if (!["--baseline", "--out", "--pairs", "--iterations", "--warmup"].includes(key) ||
        value === undefined || value.startsWith("--") || Object.hasOwn(values, key)) throw new Error(USAGE);
    values[key] = value;
  }
  if (controlsOnly && values["--iterations"] !== undefined) throw new Error("--controls-only uses five fixed 65536-operation blocks; --iterations is for the full campaign");
  if (!/^[a-f0-9]{40}$/.test(values["--baseline"] ?? "") || !isAbsolute(values["--out"] ?? "")) throw new Error(USAGE);
  const number = (key: string, fallback?: number) => {
    if (values[key] === undefined) return fallback;
    if (!/^[1-9][0-9]*$/.test(values[key])) throw new Error("Expected positive integer: " + key);
    const n = Number(values[key]);
    if (!Number.isSafeInteger(n) || n > (key === "--pairs" ? 25 : 100000)) throw new Error("Excessive count: " + key);
    return n;
  };
  return { baseline: values["--baseline"], out: resolve(values["--out"]), pairs: number("--pairs", 5)!,
    iterations: number("--iterations"), warmup: number("--warmup"), controlsOnly };
}

export function campaignCoverage(controlsOnly: boolean, pairs: number) {
  return { mode: controlsOnly ? "controls-only-blocks" : "full-operation-campaign",
    scenarios: controlsOnly ? [...CONTROL_SCENARIOS] : [...SCENARIOS], sizes: [...SIZES],
    cases: SIZES.length * (controlsOnly ? CONTROL_SCENARIOS.length : SCENARIOS.length),
    pairCount: pairs, meetsFivePairCoverage: !controlsOnly && pairs >= 5,
    meetsFiveControlPairCoverage: controlsOnly && pairs >= 5,
    completeSevenScenarioCoverage: !controlsOnly };
}

const compilerOptions: ts.CompilerOptions = {
  target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS,
  esModuleInterop: true, useDefineForClassFields: false,
};
/** Both versions execute identical transpilation/VM loading and the SAME module objects. */
export function compileBatch(source: string, label: string) {
  const result = ts.transpileModule(source, { compilerOptions, fileName: "photo-grass-batch.ts", reportDiagnostics: true });
  const errors = result.diagnostics?.filter(d => d.category === ts.DiagnosticCategory.Error) ?? [];
  if (errors.length) throw new Error(ts.formatDiagnosticsWithColorAndContext(errors, {
    getCurrentDirectory: () => root, getCanonicalFileName: name => name, getNewLine: () => "\n",
  }));
  const imports: Record<string, unknown> = {
    "@babylonjs/core/Meshes/thinInstanceMesh": thinInstances,
    "@babylonjs/core/Culling/boundingInfo": bounding,
    "@babylonjs/core/Maths/math.vector": vectors,
    "./photo-grass-budget": budget,
  };
  type LoadedModule = { exports: { PhotoGrassBatch?: BatchConstructor } };
  const module: LoadedModule = { exports: {} };
  const requireExact = (name: string) => {
    if (!Object.hasOwn(imports, name)) throw new Error("Unrecorded runtime import: " + name);
    return imports[name];
  };
  const factory = new Script("(function(require, module, exports) {\n" + result.outputText + "\n})", {
    filename: label + "-photo-grass-batch.cjs",
  }).runInThisContext() as (require: typeof requireExact, module: LoadedModule, exports: LoadedModule["exports"]) => void;
  factory(requireExact, module, module.exports);
  if (typeof module.exports.PhotoGrassBatch !== "function") throw new Error("Missing PhotoGrassBatch export");
  return { Batch: module.exports.PhotoGrassBatch, compiled: result.outputText };
}

export function createFixture(Batch: BatchConstructor, n: number) {
  assert.ok(Number.isInteger(n) && n >= 2);
  const engine = new NullEngine(), scene = new Scene(engine);
  const material = new StandardMaterial("benchmark-unlit", scene);
  material.disableLighting = true;
  // Same tiny geometry and material on both sides; no texture IO or scene render.
  const resources = { clone(_level: budget.CandidateLevel, name: string) {
    const mesh = new Mesh(name, scene), data = new VertexData();
    data.positions = [-0.1, 0, 0, 0.1, 0, 0, 0, 0.8, 0];
    data.normals = [0, 0, 1, 0, 0, 1, 0, 0, 1];
    data.indices = [0, 1, 2]; data.applyToMesh(mesh); mesh.material = material;
    return mesh;
  } };
  const batch = new Batch("far", resources);
  batch.reserve(n);
  const matrices = new Float32Array((n + 1) * 16);
  const roots: GrassRootState[] = [];
  for (let id = 0; id <= n; id++) {
    const offset = id * 16, yaw = (id % 31) * 0.07, scale = 0.8 + (id % 7) * 0.04;
    matrices[offset] = Math.cos(yaw) * scale; matrices[offset + 2] = -Math.sin(yaw) * scale;
    matrices[offset + 5] = 0.7 + (id % 11) * 0.03;
    matrices[offset + 8] = Math.sin(yaw) * scale; matrices[offset + 10] = Math.cos(yaw) * scale;
    matrices[offset + 12] = id % 97; matrices[offset + 13] = (id % 13) * 0.125;
    matrices[offset + 14] = Math.floor(id / 97); matrices[offset + 15] = 1;
    roots.push({ id, tileId: "cpu-fixture", x: matrices[offset + 12] + 128,
      y: matrices[offset + 13], z: matrices[offset + 14] - 64, seed: (id % 251) / 251,
      level: "far", slot: -1, fade: { from: 0, to: 1, startedAt: 1 } });
  }
  const add = (value: GrassRootState) => batch.add(value, matrices, value.id * 16, 128, -64);
  for (let i = 0; i < n; i++) add(roots[i]);
  batch.flush();
  return { batch, roots, matrices, n, add, dispose() { batch.dispose(); material.dispose(); scene.dispose(); engine.dispose(); } };
}
export type Fixture = ReturnType<typeof createFixture>;

function nativeCapacity(f: Fixture) {
  // Pinned Babylon diagnostic only, never timed or used to change the capacity.
  const storage = (f.batch.mesh as unknown as { _thinInstanceDataStorage: { matrixData: Float32Array } })._thinInstanceDataStorage;
  return storage.matrixData.length / 16;
}

export function mutate(f: Fixture, scenario: Scenario, iteration: number) {
  const batch = f.batch;
  if (scenario === "sparse-1" || scenario === "sparse-32") {
    const count = scenario === "sparse-1" ? 1 : Math.min(32, f.n - 1);
    for (let i = 0; i < count; i++) {
      const value = batch.roots[i]; batch.remove(value); f.add(value);
    }
  } else if (scenario === "tail-remove") batch.remove(batch.roots[batch.roots.length - 1]);
  else if (scenario === "fade-only") {
    for (let i = 0; i < Math.min(32, f.n); i++) {
      const value = batch.roots[i]; value.fade.to = iteration % 2; value.fade.startedAt = iteration * 0.25;
      batch.updateFade(value);
    }
  } else if (scenario === "full-churn") {
    while (batch.roots.length) batch.remove(batch.roots[batch.roots.length - 1]);
    for (let i = 0; i < f.n; i++) f.add(f.roots[iteration % 2 ? i : f.n - 1 - i]);
  } else if (scenario === "rebound") f.add(f.roots[f.n]);
}

/** Three identical clock reads: total INCLUDES mutation, tracking and nested flush. */
export function measureOperation(f: Fixture, scenario: Scenario, iteration: number, now = () => performance.now()) {
  const started = now();
  mutate(f, scenario, iteration);
  const flushStarted = now();
  f.batch.flush();
  const finished = now();
  return { totalMs: finished - started, flushMs: finished - flushStarted };
}

function restoreTail(f: Fixture) {
  // Fixture preparation only: the measured packet is tail removal + its flush.
  f.add(f.roots[f.n - 1]); f.batch.flush();
}

export function snapshot(f: Fixture) {
  const b = f.batch, bounds = b.mesh.getBoundingInfo().boundingBox;
  const actual = b.mesh.thinInstanceGetWorldMatrices();
  const matrices = actual.map(matrix => Array.from(matrix.m));
  for (let slot = 0; slot < b.roots.length; slot++) {
    const value = b.roots[slot], expected = f.matrices.slice(value.id * 16, value.id * 16 + 16);
    expected[12] += 128; expected[14] -= 64;
    assert.equal(value.slot, slot, "root slot");
    assert.deepEqual(matrices[slot], Array.from(expected), "independent Float32 transform oracle");
  }
  assert.equal(actual.length, b.roots.length);
  assert.equal(b.mesh.thinInstanceCount, b.roots.length);
  const fade = b.mesh.getVertexBuffer("photoGrassFade")?.getFloatData(b.roots.length);
  assert.ok(fade);
  const activeFades = Array.from(fade).slice(0, b.roots.length * 4);
  const expectedFades = new Float32Array(b.roots.flatMap(value => [value.fade.from, value.fade.to, value.fade.startedAt, value.seed]));
  assert.deepEqual(activeFades, Array.from(expectedFades), "independent fade oracle");
  return { matrices, fades: activeFades, slots: b.roots.map(value => [value.id, value.slot]),
    count: b.mesh.thinInstanceCount, enabled: b.mesh.isEnabled(),
    minimum: bounds.minimumWorld.asArray(), maximum: bounds.maximumWorld.asArray() };
}

export function countConversions(operation: () => void) {
  const originalFrom = vectors.Matrix.FromArray, originalTo = vectors.Matrix.FromArrayToRef;
  let fromDepth = 0, nativeFromArray = 0, directToRef = 0;
  vectors.Matrix.FromArray = function(...args: Parameters<typeof originalFrom>) {
    fromDepth++;
    try { return originalFrom.apply(vectors.Matrix, args); } finally { fromDepth--; }
  };
  vectors.Matrix.FromArrayToRef = function(...args: Parameters<typeof originalTo>) {
    if (fromDepth) nativeFromArray++; else directToRef++;
    return originalTo.apply(vectors.Matrix, args);
  } as typeof originalTo;
  try { operation(); return { nativeFromArray, directToRef, total: nativeFromArray + directToRef }; }
  finally { vectors.Matrix.FromArray = originalFrom; vectors.Matrix.FromArrayToRef = originalTo; }
}

export function proveParity(A: BatchConstructor, B: BatchConstructor, n: number, scenarios: readonly Scenario[] = SCENARIOS) {
  const results = [];
  for (const scenario of scenarios) {
    const a = createFixture(A, n), b = createFixture(B, n);
    try {
      const countA = countConversions(() => { mutate(a, scenario, 0); a.batch.flush(); });
      const countB = countConversions(() => { mutate(b, scenario, 0); b.batch.flush(); });
      const first = snapshot(a); assert.deepEqual(snapshot(b), first, scenario + " exact parity");
      const allocatedBytes = { baseline: a.batch.allocatedBytes, candidate: b.batch.allocatedBytes };
      // Exercise repeated recycled-slot reuse outside all timing/counter windows.
      if (scenario !== "tail-remove" && scenario !== "rebound") {
        for (let i = 1; i < 4; i++) {
          mutate(a, scenario, i); a.batch.flush(); mutate(b, scenario, i); b.batch.flush();
          assert.deepEqual(snapshot(b), snapshot(a), scenario + " repeated parity");
        }
      }
      results.push({ scenario, n, baseline: countA, candidate: countB, allocatedBytes,
        capacity: { baseline: nativeCapacity(a), candidate: nativeCapacity(b) }, parity: true,
        stateSha256: hash(JSON.stringify(first)) });
    } finally { a.dispose(); b.dispose(); }
  }
  return results;
}

export function summarize(values: readonly number[]) {
  assert.ok(values.length && values.every(value => Number.isFinite(value) && value >= 0));
  const sorted = [...values].sort((a, b) => a - b);
  const q = (p: number) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))];
  return { count: values.length, sum: values.reduce((sum, value) => sum + value, 0),
    mean: values.reduce((sum, value) => sum + value, 0) / values.length,
    median: q(0.5), p95: q(0.95), p99: q(0.99), min: sorted[0], max: sorted[sorted.length - 1] };
}

export function runCase(Batch: BatchConstructor, n: number, scenario: Scenario, iterations: number, warmup: number) {
  let f: Fixture | undefined;
  const totalMs: number[] = [], flushMs: number[] = [];
  try {
    if (scenario !== "rebound") f = createFixture(Batch, n);
    for (let i = -warmup; i < iterations; i++) {
      if (scenario === "rebound") f = createFixture(Batch, n);
      assert.ok(f);
      const value = measureOperation(f, scenario, i + warmup);
      if (i >= 0) { totalMs.push(value.totalMs); flushMs.push(value.flushMs); }
      if (scenario === "tail-remove" && i < iterations - 1) restoreTail(f);
      if (scenario === "rebound" && i < iterations - 1) { f.dispose(); f = undefined; }
    }
    assert.ok(f);
    return { n, scenario, iterations, warmup, totalMs, flushMs,
      summary: { total: summarize(totalMs), nestedFlush: summarize(flushMs) },
      finalStateSha256: hash(JSON.stringify(snapshot(f))), allocatedBytes: f.batch.allocatedBytes, capacity: nativeCapacity(f) };
  } finally { f?.dispose(); }
}

/** Two clocks per whole block, with no per-operation timers or nested flush metric. */
export function measureControlBlock(f: Fixture, scenario: ControlScenario, operations: number, offset: number,
  now = () => performance.now()) {
  assert.ok(Number.isSafeInteger(operations) && operations > 0);
  const started = now();
  for (let i = 0; i < operations; i++) { mutate(f, scenario, offset + i); f.batch.flush(); }
  const elapsedMs = now() - started;
  return { operations, elapsedMs, perOperationMs: elapsedMs / operations };
}

export function runControlPair(A: BatchConstructor, B: BatchConstructor, n: number, scenario: ControlScenario,
  order: readonly Variant[], warmup = 8192, blocks = 5, operations = 65536) {
  assert.deepEqual([...order].sort(), ["baseline", "candidate"]);
  assert.ok(Number.isSafeInteger(warmup) && warmup > 0 && Number.isSafeInteger(blocks) && blocks > 0);
  const fixtures = { baseline: createFixture(A, n), candidate: createFixture(B, n) };
  const rawBlocks: Record<Variant, ReturnType<typeof measureControlBlock>[]> = { baseline: [], candidate: [] };
  try {
    assert.deepEqual(snapshot(fixtures.candidate), snapshot(fixtures.baseline), "Control initial data parity");
    // Warm the SAME loop with both classes before either measured block. Split
    // warmup into two interleaved rounds so the call site has seen both shapes.
    const rounds = [Math.ceil(warmup / 2), Math.floor(warmup / 2)];
    let offset = 0;
    for (const count of rounds) {
      if (count) for (const variant of order) measureControlBlock(fixtures[variant], scenario, count, offset);
      offset += count;
    }
    const before = snapshot(fixtures.baseline);
    assert.deepEqual(snapshot(fixtures.candidate), before, "Control data parity after equal warmup");
    for (let block = 0; block < blocks; block++) for (const variant of order)
      rawBlocks[variant].push(measureControlBlock(fixtures[variant], scenario, operations, warmup + block * operations));
    const after = snapshot(fixtures.baseline);
    assert.deepEqual(snapshot(fixtures.candidate), after, "Control final data parity");
    if (scenario === "no-op") assert.deepEqual(after, before, "No-op must not introduce placebo state changes");
    return order.map(variant => ({ variant, n, scenario, iterations: blocks, warmup,
      blocks, operationsPerBlock: operations, rawBlocks: rawBlocks[variant],
      totalMs: rawBlocks[variant].map(value => value.perOperationMs), flushMs: null,
      summary: { total: summarize(rawBlocks[variant].map(value => value.perOperationMs)), nestedFlush: null },
      beforeStateSha256: hash(JSON.stringify(before)), finalStateSha256: hash(JSON.stringify(after)),
      allocatedBytes: fixtures[variant].batch.allocatedBytes, capacity: nativeCapacity(fixtures[variant]) }));
  } finally { fixtures.baseline.dispose(); fixtures.candidate.dispose(); }
}

async function inputHashes() {
  const names = [batchPath, "client/photo-grass-budget.ts", "scripts/benchmark-grass-snapshots.ts",
    "tests/benchmark-grass-snapshots.test.ts", "tests/photo-grass.test.ts", "tests/ground-flowers.test.ts",
    "tests/photo-grass-preparation.test.ts", "package.json", "pnpm-lock.yaml", "tsconfig.json"];
  return Object.fromEntries(await Promise.all(names.map(async name => [name, hash(await readFile(join(root, name)))])));
}

async function dependencyHashes() {
  const result: Record<string, string> = {};
  for (const name of ["Engines/nullEngine", "Meshes/thinInstanceMesh", "Maths/math.vector", "Culling/boundingInfo", "Meshes/mesh", "Buffers/buffer"]) {
    for (const suffix of [".js", ".pure.js"]) {
      const path = "node_modules/@babylonjs/core/" + name + suffix;
      try { result[path] = hash(await readFile(join(root, path))); }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT" || suffix === ".js") throw error; }
    }
  }
  for (const name of ["@babylonjs/core", "typescript", "tsx"]) {
    const path = "node_modules/" + name + "/package.json";
    result[path] = hash(await readFile(join(root, path)));
  }
  return result;
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  if ("help" in options) { console.log(USAGE); return; }
  if (resolve(process.cwd()).toLowerCase() !== root.toLowerCase() || git("branch", "--show-current").toString().trim() !== "main")
    throw new Error("Use only the canonical checkout on main");
  const relativeOut = relative(join(root, ".cache/grass-matrix-20261102"), options.out);
  if (!relativeOut || relativeOut.startsWith("..") || isAbsolute(relativeOut)) throw new Error("Output must be a new directory under .cache/grass-matrix-20261102");
  await mkdir(resolve(options.out, ".."), { recursive: true });
  await mkdir(options.out); // Preserve every prior success/failure; never overwrite.
  const startedAt = new Date().toISOString();
  try {
    const before = await inputHashes(), dependencies = await dependencyHashes();
    const baseline = git("show", options.baseline + ":" + batchPath), candidate = await readFile(join(root, batchPath));
    assert.equal(hash(git("show", options.baseline + ":client/photo-grass-budget.ts")), before["client/photo-grass-budget.ts"], "Shared runtime budget dependency differs from baseline");
    const a = compileBatch(baseline.toString("utf8"), "baseline"), b = compileBatch(candidate.toString("utf8"), "candidate");
    await writeFile(join(options.out, "baseline.cjs"), a.compiled, { flag: "wx" });
    await writeFile(join(options.out, "candidate.cjs"), b.compiled, { flag: "wx" });
    const coverage = campaignCoverage(options.controlsOnly, options.pairs);
    const scenarios: readonly Scenario[] = coverage.scenarios;
    const metadata = { schemaVersion: 1, startedAt, coverage, baselineCommit: options.baseline,
      candidateHead: git("rev-parse", "HEAD").toString().trim(), baselineSourceSha256: hash(baseline), candidateSourceSha256: hash(candidate),
      compiled: { baseline: hash(a.compiled), candidate: hash(b.compiled) }, inputs: before, dependencies,
      node: process.version, nodeVersions: process.versions, typescript: ts.version, compilerOptions,
      cpu: { model: cpus()[0]?.model, logicalProcessors: cpus().length, reportedMHz: cpus().map(cpu => cpu.speed) },
      os: { platform: platform(), release: release(), totalMemoryBytes: totalmem() }, options,
      method: { scope: "CPU wall time on real PhotoGrassBatch/NullEngine; no render, GPU, FPS or browser claim",
        clock: options.controlsOnly ? "performance.now; two reads around each 65536-operation block, no per-operation clock" : "performance.now; three clock reads per operation on both variants",
        timing: options.controlsOnly ? "Five raw blocks per control/variant, whole mutate+flush loop elapsed divided by exact operation count; nested flush is null, never inferred" : "total mutate+flush includes add/remove bookkeeping and rebound allocation/copy; nested flush is contained in total, never add them",
        controlsCalibration: options.controlsOnly ? "Only no-op and fade-only. Default8192 equal warmup operations per variant in two interleaved rounds before timing; five blocks interleave variants in the pair order. Loop/JIT cost is included, not subtracted; no artificial state mutation or instrumentation. Tight-loop no-op cost is not an isolated game-frame cost. Original full campaign and acceptance threshold remain unchanged." : null,
        capacity: "Unmodified real default FAR capacity cap floor(280000/22)=12727; rebound doubles until clamped by that cap. Actual final capacity is recorded.",
        preparation: "Geometry, material, roots and transform arrays are created outside timing. Tail is restored with add+flush between samples; rebound has a fresh N-capacity fixture before each timed append+flush. No forced GC.",
        sparse: "sparse-1/32 recycle 1/32 non-tail roots using remove+append; both calls are inside total. This changes at most 2/33 numeric slots at fixed N.",
        order: "five pairs by default; A/B then B/A alternation per pair, same order across all cases in a pair",
        instrumentation: "Conversion wrappers and parity checks run separately before timing and are restored. Every raw warm-run sample retained, no outlier filtering.",
        dependencies: "Both variants receive identical imported Babylon/budget module objects; dependency hashes cover package metadata and directly relevant engine modules, not all transitive modules",
      } };
    await writeFile(join(options.out, "metadata.json"), JSON.stringify(metadata, null, 2) + "\n", { flag: "wx" });
    const parity = SIZES.flatMap(n => proveParity(a.Batch, b.Batch, n, scenarios));
    await writeFile(join(options.out, "parity.json"), JSON.stringify(parity, null, 2) + "\n", { flag: "wx" });
    type Record = (ReturnType<typeof runCase> | ReturnType<typeof runControlPair>[number]) & {
      pair: number;
      variant: "baseline" | "candidate";
      order: readonly ("baseline" | "candidate")[];
    };
    const records: Record[] = [];
    for (let pair = 0; pair < options.pairs; pair++) {
      const order = pair % 2 === 0 ? ["baseline", "candidate"] as const : ["candidate", "baseline"] as const;
      for (const n of SIZES) for (const scenario of scenarios) {
        const paired: Record[] = [];
        if (options.controlsOnly) {
          for (const result of runControlPair(a.Batch, b.Batch, n, scenario as ControlScenario, order, options.warmup ?? 8192)) {
            const record: Record = { pair: pair + 1, order, ...result };
            await appendFile(join(options.out, "raw.jsonl"), JSON.stringify(record) + "\n");
            records.push(record); paired.push(record);
          }
        } else for (const variant of order) {
          const iterations: number = options.iterations ?? (scenario === "rebound" ? 16 : 128);
          const warmup: number = options.warmup ?? (scenario === "rebound" ? 4 : 32);
          const result: Record = { pair: pair + 1, variant, order, ...runCase(variant === "baseline" ? a.Batch : b.Batch, n, scenario, iterations, warmup) };
          await appendFile(join(options.out, "raw.jsonl"), JSON.stringify(result) + "\n");
          records.push(result); paired.push(result);
        }
        assert.equal(paired[0].finalStateSha256, paired[1].finalStateSha256, "Timed cases must end in identical data");
      }
      console.log(`Completed CPU pair ${pair + 1}/${options.pairs}; all raw samples retained.`);
    }
    assert.deepEqual(await inputHashes(), before, "Inputs changed during the campaign");
    assert.deepEqual(await dependencyHashes(), dependencies, "Dependencies changed during the campaign");
    const comparison = SIZES.flatMap(n => scenarios.map(scenario => {
      const pairs = Array.from({ length: options.pairs }, (_, i) => {
        const get = (variant: string) => records.find(r => r.pair === i + 1 && r.n === n && r.scenario === scenario && r.variant === variant)!;
        const A = get("baseline"), B = get("candidate");
        return { pair: i + 1, baselineTotalMeanMs: A.summary.total.mean, candidateTotalMeanMs: B.summary.total.mean,
          totalRatio: A.summary.total.mean ? B.summary.total.mean / A.summary.total.mean : null,
          baselineFlushMeanMs: A.summary.nestedFlush?.mean ?? null, candidateFlushMeanMs: B.summary.nestedFlush?.mean ?? null };
      });
      return { n, scenario, pairs, fasterPairs: pairs.filter(p => p.totalRatio !== null && p.totalRatio < 1).length,
        overTenPercentSlowerPairs: pairs.filter(p => p.totalRatio !== null && p.totalRatio > 1.1).length };
    }));
    await writeFile(join(options.out, "summary.json"), JSON.stringify({ completedAt: new Date().toISOString(), inputRevalidated: true,
      ...coverage, comparison,
      interpretation: "Descriptive CPU campaign. Admission uses whole-operation pair consistency and parity; nested flush gain alone is insufficient. No GPU or FPS claim." }, null, 2) + "\n", { flag: "wx" });
  } catch (error) {
    await writeFile(join(options.out, "failure.json"), JSON.stringify({ startedAt, failedAt: new Date().toISOString(), error: String(error), stack: error instanceof Error ? error.stack : null }, null, 2) + "\n", { flag: "wx" });
    throw error;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
