import test from "node:test";
import assert from "node:assert/strict";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { PBRBaseMaterial } from "@babylonjs/core/Materials/PBR/pbrBaseMaterial.pure";
import { MaterialDefines } from "@babylonjs/core/Materials/materialDefines";
import { FreeCamera } from "@babylonjs/core/Cameras/freeCamera";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { WebGPUEngine } from "@babylonjs/core/Engines/webgpuEngine.pure";
import { WebGPUCacheBindGroups } from "@babylonjs/core/Engines/WebGPU/webgpuCacheBindGroups";
import { RoutineCallProfile, createMaterialRoutineProfile } from "../client/qa-routine-profile";

const selection = (target: object, ...keys: string[]) => keys.map(key => ({ id: key, target, key }));

test("nested selected calls subtract direct child duration exactly; idle boundaries read no clocks", () => {
  let time = 0, clocks = 0;
  const target = {
    outer() { time += 2; this.middle(); time += 5; return "result"; },
    middle() { time += 3; this.inner(); time += 4; },
    inner() { time += 7; },
  };
  const profile = new RoutineCallProfile(selection(target, "outer", "middle", "inner"), () => { clocks++; return time; });
  assert.equal(target.outer(), "result"); assert.equal(clocks, 0);
  profile.beginFrame(); assert.equal(clocks, 0); assert.equal(target.outer(), "result");
  const snap = profile.endFrame(); assert.equal(clocks, 6);
  assert.deepEqual(snap, { rows: [
    { id: "outer", calls: 1, inclusiveMs: 21, selfSelectedMs: 7 },
    { id: "middle", calls: 1, inclusiveMs: 14, selfSelectedMs: 7 },
    { id: "inner", calls: 1, inclusiveMs: 7, selfSelectedMs: 7 },
  ], errors: 0, depthSkipped: 0, restoreConflicts: 0 });
  target.outer(); assert.equal(clocks, 6); profile.dispose(); target.outer(); assert.equal(clocks, 6);
});

test("recursion aggregates inclusive calls and exclusive selected time", () => {
  let time = 0;
  const target = { recurse(n: number): number { time++; if (n) this.recurse(n - 1); time++; return n; } };
  const profile = new RoutineCallProfile(selection(target, "recurse"), () => time);
  profile.beginFrame(); assert.equal(target.recurse(3), 3);
  assert.deepEqual(profile.endFrame().rows, [{ id: "recurse", calls: 4, inclusiveMs: 20, selfSelectedMs: 8 }]);
  profile.dispose();
});

test("receiver, argument references, return/Promise identity and original throws survive instrumentation", async () => {
  const receiver = { flag: 1 }, args = [{ x: 2 }, undefined], returned = Promise.resolve({ answer: 42 }), failure = new Error("original");
  const target = { method(this: unknown, ...actual: unknown[]) {
    assert.equal(this, receiver); assert.equal(actual[0], args[0]); assert.equal(actual[1], args[1]); return returned;
  }, fail() { throw failure; } };
  const profile = new RoutineCallProfile(selection(target, "method", "fail"), () => 10);
  profile.beginFrame(); assert.equal(target.method.apply(receiver, args), returned);
  assert.throws(() => target.fail(), error => error === failure);
  assert.equal(profile.endFrame().rows[1].calls, 1); profile.dispose(); await returned;
});

test("diagnostic clock throw/nonfinite/negative does not replace original errors", () => {
  const failure = new Error("original"), target = { fail() { throw failure; }, success() { return 17; } };
  let read = 0;
  const profile = new RoutineCallProfile(selection(target, "fail", "success"), () => { read++; if (read === 1) throw new Error("clock"); return Number.NaN; });
  profile.beginFrame(); assert.throws(() => target.fail(), error => error === failure); assert.equal(target.success(), 17);
  assert.equal(profile.endFrame().errors, 2); assert.equal(profile.dispose().errors, 2);
  const clock = [3, 2], p2 = new RoutineCallProfile(selection(target, "success"), () => clock.shift()!);
  p2.beginFrame(); assert.equal(target.success(), 17); const s = p2.endFrame();
  assert.equal(s.errors, 1); assert.equal(s.rows[0].inclusiveMs, 0); p2.dispose();
});

test("a finally-clock failure cannot replace the original selected routine exception", () => {
  const failure = new Error("original"), target = { run() { throw failure; } }; let clocks = 0;
  const profile = new RoutineCallProfile(selection(target, "run"), () => {
    if (++clocks === 2) throw new Error("finally clock"); return 10;
  });
  profile.beginFrame(); assert.throws(() => target.run(), error => error === failure);
  assert.equal(profile.endFrame().errors, 1); profile.dispose();
});

test("partial installation failure rolls back exact earlier descriptors atomically", () => {
  const first = { run() { return 3; } }, descriptor = Object.getOwnPropertyDescriptor(first, "run");
  const second = new Proxy({ run() {} }, { defineProperty() { throw new Error("blocked install"); } });
  assert.throws(() => new RoutineCallProfile([{ id: "one", target: first, key: "run" }, { id: "two", target: second, key: "run" }]), /blocked install/);
  assert.deepEqual(Object.getOwnPropertyDescriptor(first, "run"), descriptor);
  assert.equal(first.run(), 3);
});

test("throwing proxy after successful mutation also rolls back its installed wrapper", () => {
  const backing = { run() { return 3; } }, descriptor = Object.getOwnPropertyDescriptor(backing, "run"); let define = 0;
  const target = new Proxy(backing, { defineProperty(object, key, value) { Reflect.defineProperty(object, key, value); if (++define === 1) throw new Error("after apply"); return true; } });
  assert.throws(() => new RoutineCallProfile(selection(target, "run")), /after apply/);
  assert.deepEqual(Object.getOwnPropertyDescriptor(backing, "run"), descriptor);
});

test("exact own descriptor flags restored; foreign replacement remains untouched", () => {
  const target = {}; const original = () => 3;
  Object.defineProperty(target, "run", { value: original, configurable: false, writable: true, enumerable: false });
  const descriptor = Object.getOwnPropertyDescriptor(target, "run");
  const profile = new RoutineCallProfile(selection(target, "run"));
  assert.notEqual(Object.getOwnPropertyDescriptor(target, "run")!.value, original);
  assert.deepEqual(profile.dispose(), { errors: 0, restoreConflicts: 0 });
  assert.deepEqual(Object.getOwnPropertyDescriptor(target, "run"), descriptor);
  const second = new RoutineCallProfile(selection(target, "run")), foreign = () => 8;
  Object.defineProperty(target, "run", { value: foreign });
  assert.deepEqual(second.dispose(), { errors: 0, restoreConflicts: 1 });
  assert.equal(Object.getOwnPropertyDescriptor(target, "run")!.value, foreign);
  assert.deepEqual(second.dispose(), { errors: 0, restoreConflicts: 1 });
});

test("foreign deletion or descriptor flag change is reported and never overwritten", () => {
  for (const remove of [false, true]) {
    const target = { run() {} }, profile = new RoutineCallProfile(selection(target, "run"));
    if (remove) Reflect.deleteProperty(target, "run"); else Object.defineProperty(target, "run", { enumerable: false });
    const external = Object.getOwnPropertyDescriptor(target, "run");
    assert.equal(profile.dispose().restoreConflicts, 1); assert.deepEqual(Object.getOwnPropertyDescriptor(target, "run"), external);
  }
});

test("failed restoration leaves only an inert wrapper and reports failure idempotently", () => {
  let rejectRestore = false, clocks = 0;
  const backing = { run() { return 31; } }, descriptor = Object.getOwnPropertyDescriptor(backing, "run")!;
  const target = new Proxy(backing, { defineProperty(object, key, value) {
    if (rejectRestore) throw new Error("restore denied"); return Reflect.defineProperty(object, key, value);
  } });
  const profile = new RoutineCallProfile(selection(target, "run"), () => ++clocks);
  rejectRestore = true; assert.deepEqual(profile.dispose(), { errors: 1, restoreConflicts: 1 });
  assert.equal(target.run(), 31); assert.equal(clocks, 0);
  assert.deepEqual(profile.dispose(), { errors: 1, restoreConflicts: 1 });
  Object.defineProperty(backing, "run", descriptor);
});

test("dispose inside selected call restores immediately and stale finally never clocks a new profiler", () => {
  let clocks = 0, old: RoutineCallProfile, next: RoutineCallProfile;
  const target = { outer() { old.dispose(); next = new RoutineCallProfile(selection(target, "inner"), () => { clocks++; return 7; }); next.beginFrame(); this.inner(); }, inner() { return 2; } };
  const descriptor = Object.getOwnPropertyDescriptor(target, "outer");
  old = new RoutineCallProfile(selection(target, "outer", "inner"), () => { clocks++; return 1; });
  old.beginFrame(); target.outer();
  assert.equal(clocks, 3); assert.equal(next!.endFrame().rows[0].calls, 1);
  assert.deepEqual(Object.getOwnPropertyDescriptor(target, "outer"), descriptor);
  next!.dispose(); assert.equal(old.dispose().errors, 1);
});

test("end/begin during an outer call isolates old generation from new frame and detached snapshots", () => {
  let clocks = 0, profile: RoutineCallProfile, prior: ReturnType<RoutineCallProfile["endFrame"]>;
  const target = { outer() { prior = profile.endFrame(); profile.beginFrame(); this.inner(); }, inner() {} };
  profile = new RoutineCallProfile(selection(target, "outer", "inner"), () => ++clocks);
  profile.beginFrame(); target.outer(); const next = profile.endFrame();
  assert.equal(clocks, 3); assert.equal(prior!.errors, 1); assert.equal(prior!.rows[0].calls, 1);
  assert.equal(next.rows[0].calls, 0); assert.equal(next.rows[1].inclusiveMs, 1);
  prior!.rows[0].calls = 999; assert.equal(profile.endFrame().rows[0].calls, 0); profile.dispose();
});

test("depth limit32 preserves recursion and reports omitted timings with no extra clock reads", () => {
  let clocks = 0; const target = { run(n: number): number { return n ? this.run(n - 1) + 1 : 0; } };
  const profile = new RoutineCallProfile(selection(target, "run"), () => ++clocks);
  profile.beginFrame(); assert.equal(target.run(39), 39); const s = profile.endFrame();
  assert.equal(s.rows[0].calls, 40); assert.equal(s.depthSkipped, 8); assert.equal(clocks, 64); profile.dispose();
});

test("target limits/duplicates/accessors/inherited/nonreplaceable methods fail before mutation", () => {
  const target = { run() {} }, original = target.run;
  assert.throws(() => new RoutineCallProfile(Array.from({ length: 9 }, (_, i) => ({ id: String(i), target, key: "run" }))), RangeError);
  assert.throws(() => new RoutineCallProfile(selection(target, "run", "run")), TypeError);
  const getter = Object.defineProperty({}, "run", { get() { throw new Error("must not read"); }, configurable: true });
  assert.throws(() => new RoutineCallProfile(selection(getter, "run")), TypeError);
  assert.throws(() => new RoutineCallProfile(selection(Object.create(target), "run")), TypeError);
  const fixed = Object.defineProperty({}, "run", { value() {} });
  assert.throws(() => new RoutineCallProfile(selection(fixed, "run")), TypeError); assert.equal(target.run, original);
});

test("actual Standard/PBR NullEngine draw exercises default pinned descriptors and exact cleanup", async () => {
  const targets = [
    [StandardMaterial.prototype, "isReadyForSubMesh"], [PBRBaseMaterial.prototype, "isReadyForSubMesh"],
    [PBRBaseMaterial.prototype, "_prepareEffect"], [PBRBaseMaterial.prototype, "_prepareDefines"],
    [MaterialDefines, "_SerializeForEngine"], [WebGPUEngine.prototype, "createEffect"],
    [WebGPUEngine.prototype, "updateUniformBuffer"], [WebGPUCacheBindGroups.prototype, "getBindGroups"],
  ] as const;
  const descriptors = targets.map(([object, key]) => Object.getOwnPropertyDescriptor(object, key));
  const engine = new NullEngine(), scene = new Scene(engine), camera = new FreeCamera("camera", new Vector3(0, 1, -6), scene);
  camera.setTarget(Vector3.Zero()); new HemisphericLight("sky", Vector3.Up(), scene);
  const standard = MeshBuilder.CreateBox("standard", {}, scene), pbr = MeshBuilder.CreateBox("pbr", {}, scene);
  standard.position.x = -1; pbr.position.x = 1; standard.material = new StandardMaterial("standard", scene); pbr.material = new PBRMaterial("pbr", scene);
  const profile = createMaterialRoutineProfile();
  try {
    targets.forEach(([object, key], i) => assert.notEqual(Object.getOwnPropertyDescriptor(object, key)!.value, descriptors[i]!.value));
    const totals = new Map<string, number>();
    for (let i = 0; i < 4; i++) {
      profile.beginFrame(); scene.render(); const sample = profile.endFrame();
      assert.equal(sample.errors, 0); assert.equal(sample.rows.length, 8);
      for (const row of sample.rows) { totals.set(row.id, (totals.get(row.id) ?? 0) + row.calls); assert.ok(row.inclusiveMs >= row.selfSelectedMs); }
      await new Promise(resolve => setTimeout(resolve, 0));
    }
    for (const id of ["StandardMaterial.isReadyForSubMesh", "PBRBaseMaterial.isReadyForSubMesh", "PBRBaseMaterial._prepareEffect", "PBRBaseMaterial._prepareDefines", "MaterialDefines._SerializeForEngine"])
      assert.ok((totals.get(id) ?? 0) > 0, id);
    assert.equal(totals.get("WebGPUEngine.createEffect"), 0); // NullEngine is explicitly not a GPU proof.
    assert.deepEqual(profile.dispose(), { errors: 0, restoreConflicts: 0 });
    targets.forEach(([object, key], i) => assert.deepEqual(Object.getOwnPropertyDescriptor(object, key), descriptors[i]));
  } finally { profile.dispose(); scene.dispose(); engine.dispose(); }
});


test("static serializer hook leaves stock toString identity and custom return/throw contract untouched", () => {
  const stock=MaterialDefines.prototype.toString, descriptor=Object.getOwnPropertyDescriptor(MaterialDefines,"_SerializeForEngine");
  const profile=createMaterialRoutineProfile();
  try {
    assert.equal(MaterialDefines.prototype.toString,stock);
    const receiver={toString(...args:unknown[]){assert.equal(this,receiver);assert.equal(args.length,0);return "custom sentinel";}} as unknown as MaterialDefines;
    profile.beginFrame();assert.equal(MaterialDefines._SerializeForEngine(receiver,null as any),"custom sentinel");
    const error=new Error("exact custom throw");receiver.toString=()=>{throw error;};
    assert.throws(()=>MaterialDefines._SerializeForEngine(receiver,null as any),e=>e===error);
    const sample=profile.endFrame();assert.equal(sample.rows.find(x=>x.id==="MaterialDefines._SerializeForEngine")!.calls,2);
    assert.equal(sample.errors,0);assert.equal(MaterialDefines.prototype.toString,stock);
  } finally {assert.deepEqual(profile.dispose(),{errors:0,restoreConflicts:0});}
  assert.deepEqual(Object.getOwnPropertyDescriptor(MaterialDefines,"_SerializeForEngine"),descriptor);assert.equal(MaterialDefines.prototype.toString,stock);
});
