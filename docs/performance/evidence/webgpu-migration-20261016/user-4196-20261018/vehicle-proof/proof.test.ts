import test, { after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { Script } from "node:vm";
import { createHash } from "node:crypto";
import { setImmediate as turn } from "node:timers/promises";
import ts from "typescript";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { FreeCamera } from "@babylonjs/core/Cameras/freeCamera";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";
import { PointLight } from "@babylonjs/core/Lights/pointLight";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { PlayerFlashlight } from "../webgpu-hitch-validation-20261017/opaque-combined-v1/client/flashlight";
import { VehicleLighting } from "../webgpu-hitch-validation-20261017/opaque-combined-v1/client/vehicle-lighting";
import { StableLightState } from "../webgpu-hitch-validation-20261017/opaque-combined-v1/client/stable-light-state";
import { GltfLightBudget } from "../webgpu-hitch-validation-20261017/opaque-combined-v1/client/gltf-light-budget";
import { prepareLightVariants } from "../webgpu-hitch-validation-20261017/opaque-combined-v1/client/light-preparation";
import { arePreparationEffectsReady } from "../webgpu-hitch-validation-20261017/opaque-combined-v1/client/strict-material-preparation";
import { applyArtLighting } from "../webgpu-hitch-validation-20261017/opaque-combined-v1/client/art-lighting";
import { selectLightingPreview } from "../webgpu-hitch-validation-20261017/opaque-combined-v1/client/lighting-preview";
import { sunState, moonState } from "../webgpu-hitch-validation-20261017/opaque-combined-v1/shared/weather";
import "../webgpu-hitch-validation-20261017/opaque-combined-v1/client/render-shaders";
import "@babylonjs/core/Shaders/shadowMap.vertex";
import "@babylonjs/core/Shaders/shadowMap.fragment";

const sha = (s: string) => createHash("sha256").update(s).digest("hex");
const source = ts.createSourceFile("game.ts", fs.readFileSync(new URL("../webgpu-hitch-validation-20261017/opaque-combined-v1/client/game.ts", import.meta.url), "utf8"), ts.ScriptTarget.Latest, true);
const names = ["prepareLightingVariants", "isMeshReadyForCamera", "updateRenderEnvironment"];
const declaration = source.statements.find((n): n is ts.ClassDeclaration => ts.isClassDeclaration(n) && n.name?.text === "Game")!;
const methods = declaration.members.filter(n => n.name && names.includes(n.name.getText(source)));
assert.equal(methods.length, 3);
const code = ts.transpileModule(`class ProofGame {${methods.map(n => n.getText(source)).join("\n")}}`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
const make = new Script(`(env)=>{const {PlayerFlashlight,Vector3,MeshBuilder,prepareLightVariants,arePreparationEffectsReady,selectLightingPreview,applyArtLighting,performance,window,document}=env;${code};return ProofGame;}`).runInThisContext();
const anchor = Date.parse("2026-10-18T12:45:00Z");
const select = (mode: Parameters<typeof selectLightingPreview>[0]) => selectLightingPreview(mode, anchor);
const report: any = { scope: "Actual Babylon9.30 CPU frontend, not WGSL/GPU/pixels/whole-world or 903ms causality", methods: methods.map(n => ({ name: n.name!.getText(source), sha256: sha(n.getText(source)) })), cases: [] };
after(() => fs.writeFileSync(new URL(`report-${process.env.PROOF_RUN}.json`, import.meta.url), JSON.stringify(report, null, 2) + "\n", { flag: "wx" }));

async function proof(quality: "low" | "medium", candidate: "none" | "car" | "torch-shadow-off", receivesShadows = true) {
  const row: any = { quality, candidate, receivesShadows, complete: false, snapshots: [], decisions: [], keyDifferences: [] };
  report.cases.push(row);
  const engine = new NullEngine(), scene = new Scene(engine);
  scene.useRightHandedSystem = true;
  const camera = new FreeCamera("real camera/pass", new Vector3(0, 3, -8), scene);
  camera.setTarget(new Vector3(0, 1, 4)); scene.activeCamera = camera;
  const sources: any[] = [], subjects: any[] = [], drawn = new Set<number>();
  for (const kind of ["Standard", "PBR"] as const) for (const shadows of [receivesShadows]) {
    const material = kind === "PBR" ? new PBRMaterial(`${kind}-${shadows}`, scene) : new StandardMaterial(`${kind}-${shadows}`, scene);
    material.maxSimultaneousLights = 4;
    const mesh = MeshBuilder.CreateBox(`${kind}-${shadows}`, {}, scene);
    mesh.position.set((subjects.length - .5) * 1.2, 1, 4);
    mesh.material = material; mesh.receiveShadows = shadows; mesh.metadata = { depthCaster: "opaque" };
    const instance = mesh.createInstance(`${kind}-${shadows}-instance`);
    instance.position = mesh.position.add(new Vector3(0, 0, 2)); instance.receiveShadows = shadows;
    mesh.onAfterRenderObservable.add(() => { if (engine.currentRenderPassId === camera.renderPassId) drawn.add(mesh.uniqueId); });
    sources.push(mesh); subjects.push({ kind, shadows, mesh, instance, material });
  }
  const sun = new DirectionalLight("actual celestial slot", Vector3.Down(), scene);
  const ambient = new HemisphericLight("ambient", Vector3.Up(), scene);
  const streets = [0, 1].map(i => { const p = new PointLight(`mapped POINT ${i}`, new Vector3(i + 2, 3, 1), scene); p.range = 22; return p; });
  const root = new TransformNode("actual torch root", scene), elbow = new TransformNode("actual right elbow", scene);
  elbow.parent = root; elbow.position.set(0, 1.3, 0); elbow.rotation.x = -Math.PI / 2;
  const rig = { root, rightElbow: elbow, eyeHeight: 1.63, bodyHeight: 1.8, measurements: { legSpacing: .105 } };
  const car = new TransformNode("driving visual root", scene); car.position.set(0, 0, 1); car.setEnabled(false);
  const parked = new TransformNode("parked visual root", scene);
  const beam = new VehicleLighting(scene), torch = new PlayerFlashlight(scene), stable = new StableLightState(scene), budget = new GltfLightBudget(scene);
  const skyMaterial = new StandardMaterial("sky IO material", scene); skyMaterial.disableLighting = true; skyMaterial.disableDepthWrite = true; skyMaterial.backFaceCulling = false;
  const atmosphere = { material: skyMaterial, update() {}, dispose() {} };
  let loop: (() => void) | undefined, stage = "", programs = 0;
  const originalProgram = engine.createShaderProgram;
  engine.createShaderProgram = function (...args) { programs++; return Reflect.apply(originalProgram, this, args); };
  // Only stage-selection/scheduler route through this adapter. Mesh checks,
  // rendering, shader construction, cache and Effect.isReady use the real engine.
  const gameEngine = { isWebGPU: true, get currentRenderPassId() { return engine.currentRenderPassId; }, set currentRenderPassId(v) { engine.currentRenderPassId = v; }, runRenderLoop(cb: () => void) { assert.equal(loop, undefined); loop = cb; }, stopRenderLoop(cb: () => void) { if (loop === cb) loop = undefined; } };
  const Game = make({ PlayerFlashlight, Vector3, MeshBuilder, prepareLightVariants, arePreparationEffectsReady: () => arePreparationEffectsReady(engine), selectLightingPreview: select, applyArtLighting, performance, window: { setTimeout, clearTimeout }, document: { hidden: false, addEventListener() {}, removeEventListener() {} } });
  const actor = Object.freeze({ position: Object.freeze({ x: 0, y: .8, z: 0 }), vehicle: false });
  const game: any = Object.assign(new Game(), { engine: gameEngine, scene, camera, sun, ambient, lights: streets, lamps: new StandardMaterial("lamp fixtures", scene), clouds: [], car, parkedCar: parked, vehicleLighting: beam, flashlight: torch, stableLights: stable, gltfLightBudget: budget, quality, actor, localId: "local", avatars: new Map([["local", rig]]), profile: Object.freeze({ preset: 0 }), weather: Object.freeze({ cloud: .99, rain: 0, wind: 0 }), timeOverride: select("night").instant, flashlightOn: false, disposed: false, rendererFailed: false,
    renderHealth: { snapshot: () => ({ errorCount: 0, pendingPreparationOperations: 0, phase: "preparing" }) },
    compilationProfile: { setStage(value: string) { stage = value; } },
    skyWeather: { atmosphere, update({ instant }: { instant: number }) { return { sun: sunState(instant), moon: moonState(instant), wind: { x: 0, z: 0 } }; } },
    updateWorldPresentation(pos: unknown) { assert.equal(pos, actor.position); },
    updateCameraFollow(_p: unknown, _h: number, dt: number) { assert.equal(dt, 1); },
    localAvatarPresentation: { update: () => ({ visible: true, cameraLight: false, resetAnimation: false }) },
    updateAvatarPresentation(_id: string, _rig: unknown, _feet: unknown, dt: number) { assert.equal(dt, 0); },
  });
  const invariant = () => ({ actor, root: root.position.asArray(), elbow: elbow.rotation.asArray(), car: car.position.asArray(), carRotation: car.rotation.asArray(), camera: camera.position.asArray(), cameraRotation: camera.rotation.asArray(), profile: game.profile });
  const before = JSON.stringify(invariant());
  const stageEffects = new Map<string, Set<any>>(), stageSnapshots = new Map<string, any>();
  function capture(label: string) {
    const meshes = subjects.map(s => {
      const effect = s.mesh.subMeshes[0]._getDrawWrapper(camera.renderPassId)?.effect;
      assert.ok(effect?.isReady(), s.mesh.name + " actual ready effect");
      assert.ok(drawn.has(s.mesh.uniqueId), s.mesh.name + " actual main draw");
      const storage = s.mesh._instanceDataStorage, pass = storage.useMonoDataStorageRenderPass ? storage.dataStorageRenderPass : storage.renderPasses[engine.currentRenderPassId];
      const instances = pass?.batchCache?.visibleInstances?.[0] ?? storage.batchCache?.visibleInstances?.[0] ?? [];
      assert.ok(instances.some((i: any) => i === s.instance), s.mesh.name + " actual visible regular instance batch");
      return { name: s.mesh.name, effectId: effect.uniqueId, defines: effect.defines, definesSha256: sha(effect.defines), kind: s.kind, receiveShadows: s.shadows, instancedDefine: /#define INSTANCES\b/.test(effect.defines), drawn: true, visibleInstanceId: s.instance.uniqueId, effect };
    });
    return { label, programs, torch: { enabled: torch.beam.light.isEnabled(), shadow: torch.beam.light.shadowEnabled, candidates: torch.beam.light.getShadowGenerator()?.getShadowMap()?.renderList?.length ?? 0 }, car: { enabled: beam.light.isEnabled(), shadow: beam.light.shadowEnabled, visual: car.isEnabled() }, lights: scene.lights.filter(l => l.isEnabled()).map(l => ({name:l.name,type:l.getTypeID(),shadow:l.shadowEnabled})), meshes };
  }
  const serial = (s: any) => ({ ...s, meshes: s.meshes.map(({ effect, ...m }: any) => m) });
  const draw = () => { budget.prepareFrame(); stable.update(); drawn.clear(); scene.render(); };
  async function settle(label: string) { for (let i = 0; i < 5; i++) { draw(); await turn(); } const snapshot = capture(label); row.snapshots.push(serial(snapshot)); return snapshot; }
  function environment(torchOn: boolean) { game.updateRenderEnvironment(actor.position, rig, false, 0, 0, game.timeOverride, torchOn); }
  function pointCount(n: number) { streets.forEach((l,i) => { l.setEnabled(i < n); l.intensity = i < n ? .7 : 0; }); }
  function driving(n: number) { car.setEnabled(true); parked.setEnabled(false); environment(false); pointCount(n); }
  function restore() { car.setEnabled(false); parked.setEnabled(true); environment(false); }
  try {
    const resultPromise = game.prepareLightingVariants(() => { draw(); if (subjects.every(s => drawn.has(s.mesh.uniqueId) && s.mesh.subMeshes[0]._getDrawWrapper(camera.renderPassId)?.effect?.isReady())) { const snapshot = capture(stage); stageSnapshots.set(stage, serial(snapshot)); for (const m of snapshot.meshes) { const set = stageEffects.get(m.name) ?? new Set(); set.add(m.effect); stageEffects.set(m.name,set); } } });
    let settled = false; resultPromise.finally(() => { settled = true; });
    for (let i = 0; !settled && i < 2000; i++) { loop?.(); await turn(); }
    assert.ok(settled, "bounded actual preparation loop completed");
    const result = await resultPromise;
    row.preparation = result;
    assert.equal(result.status, "complete"); assert.equal(result.stages.length, 13);
    row.startup = [...stageSnapshots.values()];
    assert.equal(stageSnapshots.size, 13);
    const baseline = await settle("baseline restore"); const baselinePrograms = programs;
    const startupEngineEffects = new Set(Object.values((engine as any)._compiledEffects));
    const torchShadowBefore = torch.beam.light.shadowEnabled;
    const warmed: any[] = [];
    if (candidate !== "none") {
      for (const n of [0,1]) {
        if (candidate === "car") driving(n);
        else { car.setEnabled(false); environment(true); pointCount(n); torch.beam.light.shadowEnabled = false; }
        warmed.push(await settle(`warm ${candidate} point${n}`));
      }
      if (candidate === "torch-shadow-off") torch.beam.light.shadowEnabled = torchShadowBefore;
      restore(); await settle("candidate restored");
    }
    for (const n of [0,1]) {
      const priorPrograms = programs; driving(n); const actual = await settle(`drive point${n}`);
      assert.equal(actual.car.shadow, quality !== "low"); assert.equal(actual.car.enabled, true); assert.equal(actual.torch.enabled, false);
      for (const [i,m] of actual.meshes.entries()) {
        const wasPrepared = stageEffects.get(m.name)!.has(m.effect);
        row.decisions.push({ pointCount:n, name:m.name, startupEffectReuse:wasPrepared, startupEngineEffectReuse:startupEngineEffects.has(m.effect), newPrograms:programs-priorPrograms, effectId:m.effectId, definesSha256:m.definesSha256 });
        const preparedLines = new Set<string>(stageSnapshots.get(`night-${n}-on`).meshes[i].defines.split("\n"));
        const driveLines = new Set<string>(m.defines.split("\n"));
        const removed = [...preparedLines].filter(line => !driveLines.has(line));
        const added = [...driveLines].filter(line => !preparedLines.has(line));
        assert.deepEqual(added, []);
        assert.deepEqual(removed, quality === "low" && m.receiveShadows ? ["#define SHADOW0", "#define SHADOWPOISSON0", "#define SHADOWS"] : []);
        row.keyDifferences.push({pointCount:n,name:m.name,removed,added});
        if (candidate === "none") assert.equal(wasPrepared, quality === "medium" || !m.receiveShadows, `${quality} ${m.name} point${n} startup key coverage`);
        else { assert.equal(m.effect,warmed[n].meshes[i].effect,`${m.name} warm -> drive exact Effect reuse`); assert.equal(m.defines,warmed[n].meshes[i].defines); }
      }
      if (candidate !== "none") assert.equal(programs, priorPrograms, "no new actual shader programs after warmup");
      else if (quality === "low" && receivesShadows) {
        const pbr = actual.meshes.find((m: any) => m.kind === "PBR")!;
        assert.equal(startupEngineEffects.has(pbr.effect), false, "isolated shadow receiver PBR key genuinely absent from engine startup cache");
        assert.ok(programs > priorPrograms, "cold low vehicle key creates an actual program");
      } else assert.equal(programs, priorPrograms, "control already has actual programs");
    }
    restore(); const restored = await settle("final restore");
    assert.equal(JSON.stringify(invariant()), before, "actor/profile/camera/rig/car pose unchanged");
    for (let i=0;i<subjects.length;i++)assert.equal(restored.meshes[i].effect,baseline.meshes[i].effect,"restore original actual material Effect");
    assert.equal(car.isEnabled(),false); assert.equal(parked.isEnabled(),true); assert.equal(beam.light.isEnabled(),false); assert.equal(torch.beam.light.isEnabled(),false);
    assert.equal(torch.beam.light.shadowEnabled, torchShadowBefore, "temporary shadowOFF override fully removed");
    row.instanceScope={regularInstances:subjects.length,hardwareInstancing:engine.getCaps().instancedArrays,description:"actual regular-instance batch rendered through NullEngine fallback; no hardware INSTANCES/GPU claim"};
    row.programsAfterStartup=baselinePrograms; row.programsFinal=programs; row.complete=true;
  } finally { game.cancelLightPreparation?.(); torch.dispose(); beam.dispose(); budget.dispose(); stable.dispose(); scene.dispose(); engine.dispose(); row.cleaned={scene:scene.isDisposed,engine:engine.isDisposed,loopAttached:!!loop}; }
}

test("low baseline13 leaves actual unshadowed vehicle receiver keys cold", () => proof("low","none"));
test("independent nonreceiver control already prepared the unshadowed keys", () => proof("low","none",false));
test("actual low car0/1 warmup restores and reuses the same Effects", () => proof("low","car"));
test("torch shadowOFF is a bounded key-equivalence control for low car0/1", () => proof("low","torch-shadow-off"));
test("medium retains shadowed SPOT and reuses baseline13 keys", () => proof("medium","none"));
