import test, { after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createHash } from "node:crypto";
import { setImmediate as turn, setTimeout as pause } from "node:timers/promises";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { FreeCamera } from "@babylonjs/core/Cameras/freeCamera";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { PointLight } from "@babylonjs/core/Lights/pointLight";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import { Matrix, Vector3 } from "@babylonjs/core/Maths/math.vector";
import { acquireGrassResources, type GrassResources } from "../webgpu-hitch-validation-20261017/low-vehicle-v2/client/photo-grass-resources";
import { PhotoGrassBatch, type GrassRootState } from "../webgpu-hitch-validation-20261017/low-vehicle-v2/client/photo-grass-batch";
import { VehicleLighting } from "../webgpu-hitch-validation-20261017/low-vehicle-v2/client/vehicle-lighting";
import { StableLightState } from "../webgpu-hitch-validation-20261017/low-vehicle-v2/client/stable-light-state";
import "../webgpu-hitch-validation-20261017/low-vehicle-v2/client/render-shaders";

const base = new URL("../webgpu-hitch-validation-20261017/low-vehicle-v2/", import.meta.url);
const pack = JSON.parse(fs.readFileSync(new URL("public/models/vegetation/grass/geometry.json", base), "utf8"));
const recipe = JSON.parse(fs.readFileSync(new URL("public/models/vegetation/grass/material.json", base), "utf8"));
const hash = (x: string | Uint8Array) => createHash("sha256").update(x).digest("hex");
const report: any = { limits: ["Actual CPU thin branch with explicit NullEngine capability adaptation, not GPU/hardware rendering", "Pinned NullEngine.createTexture synthetic ready1x1 texture IO, no pixel decoding; real production geometry/recipe/PBR/plugin", "GLSL frontend, not nativeWGSL pipeline proof"], geometry: { sourceGeometrySha256: pack.sourceGeometrySha256, farTriangles: pack.levels.far.triangles, mediumTriangles: pack.levels.medium.triangles }, cases: [] };
after(() => fs.writeFileSync(new URL(`report-${process.env.PROOF_RUN}.json`, import.meta.url), JSON.stringify(report, null, 2) + "\n", { flag: "wx" }));

async function fixture(name: string) {
  const row: any = { name, complete: false, captures: [] }; report.cases.push(row);
  const engine = new NullEngine({renderWidth:128,renderHeight:128,textureSize:1,deterministicLockstep:false,lockstepMaxSteps:4}), scene = new Scene(engine);
  row.capabilities = { beforeInstancedArrays: engine.getCaps().instancedArrays, afterInstancedArrays: true, gpuDraw: false };
  engine.getCaps().instancedArrays = true;
  scene.useRightHandedSystem = true;
  const camera = new FreeCamera("grass proof camera", new Vector3(0, .3, -1), scene); camera.minZ = .01; camera.setTarget(new Vector3(0, .02, 2)); scene.activeCamera = camera;
  new HemisphericLight("ambient", Vector3.Up(), scene);
  const point = new PointLight("mapped POINT", new Vector3(0, 3, 2), scene); point.setEnabled(false);
  const car = new TransformNode("existing car pose", scene), beam = new VehicleLighting(scene), stable = new StableLightState(scene);
  let programs = 0, ioCalls = 0, materialDisposals = 0, textureDisposals = 0, currentThinCalls = 0, currentInstances: number[] = [];
  const program = engine.createShaderProgram, drawElements = engine.drawElementsType;
  engine.createShaderProgram = function (...args) { programs++; return Reflect.apply(program, this, args); };
  engine.drawElementsType = function (...args) { currentInstances.push(args[3] ?? 0); return Reflect.apply(drawElements, this, args); };
  const leases = new Set<GrassResources>(), batches = new Set<PhotoGrassBatch>(), meshes: any[] = [];
  function lease() {
    const resource = acquireGrassResources(scene, pack, recipe, 1024, (channel, gamma) => {
      ioCalls++;
      // Pinned NullEngine.createTexture supplies its own ready InternalTexture
      // without image IO. No mesh/material/effect readiness is overridden.
      const texture = new Texture("/textures/vegetation/grass/" + pack.textures.files[channel].file, scene, false, false); texture.gammaSpace = gamma;
      texture.onDisposeObservable.add(() => textureDisposals++);
      return { texture, ready: Promise.resolve() };
    }); leases.add(resource); return resource;
  }
  const live = lease(); await live.ready;
  assert.ok(Object.values(live.maps).every(texture=>texture.isReady()), "texture IO adapter actually ready before shader comparison");
  for (const material of new Set(Object.values(live.materials))) material.onDisposeObservable.add(() => materialDisposals++);
  function addRoot(batch: PhotoGrassBatch, id = 1, x = 0) {
    const state: GrassRootState = { id, tileId: "bounded-proof", x, y: 0, z: 2, seed: .25, level: batch.level, slot: -1, fade: { from: 1, to: 1, startedAt: 0 } };
    batch.add(state, Float32Array.from(Matrix.Translation(x, 0, 2).asArray()), 0, 0, 0); batch.flush(); return state;
  }
  function batch(resource = live, level: "far" | "medium" = "far", unique = true) {
    const b = new PhotoGrassBatch(level, resource); batches.add(b);
    if (unique) b.mesh.makeGeometryUnique();
    const method = (b.mesh as any)._renderWithThinInstances;
    (b.mesh as any)._renderWithThinInstances = function (...args: unknown[]) { currentThinCalls++; return Reflect.apply(method, this, args); };
    return b;
  }
  function lighting(n: number) { point.setEnabled(n === 1); beam.update(car, 1, true, "low"); stable.update(); assert.equal(beam.light.shadowEnabled, false); }
  function frame() { currentThinCalls = 0; currentInstances = []; engine.beginFrame(); scene.render(); engine.endFrame(); }
  async function settle(mesh?: any) {
    for (let i = 0; i < 8; i++) { frame(); await turn(); }
    if (mesh) { const e = mesh.subMeshes[0]?._getDrawWrapper(camera.renderPassId)?.effect; if (!e?.isReady()) row.notReady={programs,thinCalls:currentThinCalls,enabled:mesh.isEnabled(),visible:mesh.isVisible,count:mesh.thinInstanceCount,pass:camera.renderPassId,active:scene.getActiveMeshes().length,meshReady:mesh.isReady(true),maps:Object.entries(live.maps).map(([k,v])=>[k,v.isReady()]),effects:Object.values((engine as any)._compiledEffects).map((v:any)=>({id:v.uniqueId,ready:v.isReady(),error:v.getCompilationError?.()}))}; assert.ok(e?.isReady(), "real ready Effect after actual renders"); return e; }
  }
  function capture(label: string, mesh?: any) {
    const effect = mesh?.subMeshes[0]?._getDrawWrapper(camera.renderPassId)?.effect;
    const result = { label, programs, enabled: mesh?.isEnabled(), count: mesh?.thinInstanceCount ?? 0, hasThinInstances: mesh?.hasThinInstances ?? false, thinCalls: currentThinCalls, submittedInstances: currentInstances.slice(), attributes: effect?.getAttributesNames() ?? [], vertexBuffers: mesh?.getVerticesDataKinds() ?? [], effectId: effect?.uniqueId ?? null, effectDisposed: effect?.isDisposed ?? null, defines: effect?.defines ?? null, definesSha256: effect ? hash(effect.defines) : null, geometryIndices: mesh?.getTotalIndices() ?? 0, allocatedBytes: [...batches].find(b => b.mesh === mesh)?.allocatedBytes ?? 0 };
    row.captures.push(result); return { ...result, effect };
  }
  async function endDeferredDisposal() { await pause(0); await turn(); engine.beginFrame(); engine.endFrame(); await turn(); }
  function assertThin(snapshot: ReturnType<typeof capture>) {
    assert.equal(snapshot.count, 1); assert.ok(snapshot.hasThinInstances); assert.ok(snapshot.thinCalls > 0); assert.ok(snapshot.submittedInstances.includes(1));
    assert.match(snapshot.defines!, /^#define INSTANCES$/m); assert.match(snapshot.defines!, /^#define THIN_INSTANCES$/m);
    for (const attr of ["world0", "world1", "world2", "world3", "photoGrassFade"]) { assert.ok(snapshot.attributes.includes(attr)); assert.ok(snapshot.vertexBuffers.includes(attr)); }
  }
  async function dispose() { for (const b of batches) b.dispose(); for (const m of meshes) m.dispose(false, false); for (const l of leases) l.release(); await endDeferredDisposal(); beam.dispose(); stable.dispose(); scene.dispose(); engine.dispose(); row.cleanup = { scene: scene.isDisposed, engine: engine.isDisposed, materialDisposals, textureDisposals, ioCalls }; assert.equal(materialDisposals, 2); assert.equal(textureDisposals, 5); }
  return { row, engine, scene, camera, live, batches, leases, meshes, lease, batch, addRoot, lighting, frame, settle, capture, assertThin, endDeferredDisposal, dispose, counts: () => ({ programs, ioCalls, materialDisposals, textureDisposals }) };
}

for (const control of ["ready-only", "noninstance", "zero-count"] as const)
  test(`isolated ${control} does not prepare the actual first FAR thin path`, async () => {
    const f = await fixture(control);
    try {
      let subject: any;
      if (control === "noninstance") { subject = f.live.clone("far", "noninstanced FAR control"); subject.position.z = 2; f.meshes.push(subject); }
      if (control === "zero-count") { const zero = f.batch(); zero.reserve(1); zero.flush(); subject = zero.mesh; assert.equal(subject.thinInstanceCount, 0); assert.equal(subject.isEnabled(), false); }
      for (const n of [0, 1]) { f.lighting(n); await f.settle(control === "noninstance" ? subject : undefined); const s = f.capture(`control point${n}`, subject); assert.equal(s.thinCalls, 0); if (control === "noninstance") { assert.ok(!s.attributes.includes("photoGrassFade")); assert.doesNotMatch(s.defines!, /^#define THIN_INSTANCES$/m); } }
      if (subject) subject.setEnabled(false);
      const ordinary = f.batch(); f.addRoot(ordinary);
      for (const n of [0, 1]) { f.lighting(n); const before = f.counts().programs; await f.settle(ordinary.mesh); const s = f.capture(`first ordinary FAR point${n}`, ordinary.mesh); f.assertThin(s); assert.equal(f.counts().programs - before, 1); }
      f.row.complete = true;
    } finally { await f.dispose(); }
  });

test("temporary FAR warm owner hands over exact Effects and medium shares the observed shader", async () => {
  const f = await fixture("warm-handover");
  try {
    const owner = f.lease(), warm = f.batch(owner), effects: any[] = []; f.addRoot(warm);
    for (const n of [0, 1]) { f.lighting(n); await f.settle(warm.mesh); const s = f.capture(`warm FAR point${n}`, warm.mesh); f.assertThin(s); effects.push(s.effect); }
    warm.mesh.setEnabled(false);
    const ordinary = f.batch(); f.addRoot(ordinary);
    for (const n of [0, 1]) { f.lighting(n); const before = f.counts().programs; await f.settle(ordinary.mesh); const s = f.capture(`ordinary before owner release point${n}`, ordinary.mesh); f.assertThin(s); assert.equal(s.effect, effects[n]); assert.equal(f.counts().programs, before); }
    warm.dispose(); owner.release(); await f.endDeferredDisposal();
    for (const n of [0, 1]) { f.lighting(n); const before = f.counts().programs; await f.settle(ordinary.mesh); const s = f.capture(`ordinary after deferred cleanup point${n}`, ordinary.mesh); f.assertThin(s); assert.equal(s.effect, effects[n]); assert.equal(f.counts().programs, before); }
    ordinary.mesh.setEnabled(false); const medium = f.batch(f.live, "medium"); f.addRoot(medium);
    for (const n of [0, 1]) { f.lighting(n); const before = f.counts().programs; await f.settle(medium.mesh); const s = f.capture(`medium point${n}`, medium.mesh); f.assertThin(s); assert.equal(s.effect, effects[n]); assert.equal(f.counts().programs, before); }
    assert.equal(f.counts().materialDisposals, 0); assert.equal(f.counts().textureDisposals, 0); assert.equal(f.counts().ioCalls, 5);
    f.row.complete = true;
  } finally { await f.dispose(); }
});

test("immediate temporary disposal is measured only after the real deferred Effect cleanup", async () => {
  const f = await fixture("dispose-before-first-ordinary");
  try {
    const owner = f.lease(), warm = f.batch(owner), effects: any[] = []; f.addRoot(warm);
    for (const n of [0, 1]) { f.lighting(n); await f.settle(warm.mesh); effects.push(f.capture(`warm point${n}`, warm.mesh).effect); }
    warm.dispose(); owner.release(); await f.endDeferredDisposal();
    f.row.disposedEffectsBeforeOrdinary = effects.map(e => ({ id: e.uniqueId, disposed: e.isDisposed }));
    const ordinary = f.batch(); f.addRoot(ordinary); f.row.reuse = [];
    for (const n of [0, 1]) { f.lighting(n); const before = f.counts().programs; await f.settle(ordinary.mesh); const s = f.capture(`late ordinary point${n}`, ordinary.mesh); f.assertThin(s); f.row.reuse.push({ point: n, sameEffect: s.effect === effects[n], newPrograms: f.counts().programs - before }); }
    f.row.complete = true;
  } finally { await f.dispose(); }
});

test("temporary FAR ownership preserves live geometry buffers roots materials textures and wind", async () => {
  const f = await fixture("ownership");
  try {
    const live = f.batch(f.live, "far", false); f.addRoot(live, 31, .1); f.addRoot(live, 32, -.1);
    Object.assign(f.live.wind, { time: 7, windX: 2, windZ: -3, viewerX: 1, focusZ: 4 });
    const before = { roots: JSON.stringify(live.roots), wind: JSON.stringify(f.live.wind), matrices: Array.from((live as any).matrices as Float32Array), fades: Array.from((live as any).fades as Float32Array), buffers: ["world0", "world1", "world2", "world3", "photoGrassFade"].map(k => live.mesh.getVertexBuffer(k)), geometry: live.mesh.geometry, material: live.mesh.material, maps: Object.values(f.live.maps), bytes: live.allocatedBytes };
    const owner = f.lease(); assert.notEqual(owner.wind, f.live.wind); assert.equal(owner.material, f.live.material);
    const warm = f.batch(owner, "far", process.env.PROOF_UNSAFE_GEOMETRY !== "1");
    f.addRoot(warm, 90, .4); f.lighting(0); await f.settle(warm.mesh);
    f.row.geometryOwnership={unique:process.env.PROOF_UNSAFE_GEOMETRY!=="1",shared:live.mesh.geometry===warm.mesh.geometry,buffersPreserved:["world0", "world1", "world2", "world3", "photoGrassFade"].map((kind,i)=>({kind,same:live.mesh.getVertexBuffer(kind)===before.buffers[i]}))};
    for (const [i, kind] of ["world0", "world1", "world2", "world3", "photoGrassFade"].entries()) assert.ok(live.mesh.getVertexBuffer(kind)===before.buffers[i], `live ${kind} buffer identity preserved`);
    warm.dispose(); warm.dispose(); owner.release(); owner.release(); await f.endDeferredDisposal();
    assert.equal(warm.mesh.isDisposed(), true); assert.equal(warm.allocatedBytes, 0); assert.equal(warm.roots.length, 0);
    assert.equal(live.mesh.geometry, before.geometry); assert.equal(live.mesh.material, before.material); assert.equal(live.allocatedBytes, before.bytes); assert.equal(JSON.stringify(live.roots), before.roots); assert.equal(JSON.stringify(f.live.wind), before.wind);
    assert.deepEqual(Array.from((live as any).matrices as Float32Array), before.matrices); assert.deepEqual(Array.from((live as any).fades as Float32Array), before.fades);
    assert.deepEqual(Object.values(f.live.maps), before.maps); assert.equal(f.counts().materialDisposals, 0); assert.equal(f.counts().textureDisposals, 0); assert.equal(f.counts().ioCalls, 5);
    for (const [i,kind]of ["world0", "world1", "world2", "world3", "photoGrassFade"].entries()) {assert.equal(live.mesh.getVertexBuffer(kind),before.buffers[i]);assert.ok(before.buffers[i]?.getBuffer(), "live buffer remains owned after temporary disposal");}
    await f.settle(live.mesh); assert.equal(live.mesh.thinInstanceCount, 2);
    f.row.complete = true;
  } finally { await f.dispose(); }
});
