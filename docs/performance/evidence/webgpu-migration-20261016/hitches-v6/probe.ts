import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { Script } from "node:vm";
import { setImmediate } from "node:timers/promises";
import ts from "typescript";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { LoadAssetContainerAsync } from "@babylonjs/core/Loading/sceneLoader";
import "@babylonjs/loaders/glTF";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import "@babylonjs/core/Meshes/instancedMesh";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { FreeCamera } from "@babylonjs/core/Cameras/freeCamera";
import { Vector3, Matrix, Quaternion } from "@babylonjs/core/Maths/math.vector";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Constants } from "@babylonjs/core/Engines/constants";
import { PointLight } from "@babylonjs/core/Lights/pointLight";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { Light } from "@babylonjs/core/Lights/light";
import { ShadowGenerator } from "@babylonjs/core/Lights/Shadows/shadowGenerator";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import "./client/render-shaders";
import { PlayerFlashlight } from "./client/flashlight";
import { StableLightState } from "./client/stable-light-state";
import { GltfLightBudget } from "./client/gltf-light-budget";
import { prepareLightVariants } from "./client/light-preparation";
import { arePreparationEffectsReady } from "./client/strict-material-preparation";
import { LocalAvatarPresentation } from "./client/local-avatar-presentation";
import { clampOrbitPitch } from "./client/camera-look";
import { writeVector3 } from "./client/transform-updates";
import { applyArtLighting } from "./client/art-lighting";
import { selectLightingPreview } from "./client/lighting-preview";
import { sunState, moonState, windVector } from "./shared/weather";
import { B6_LAYOUT, B6_ENTRY_PACK, B6_STAIR_CORES } from "./shared/b6-interior";
import { B6_ASSET_MANIFEST, B6_PROP_PLACEMENTS } from "./shared/b6-props";
import { renderBudget } from "./shared/render-quality";
import { SPAWN } from "./shared/world";
import { TreeWindPlugin } from "./client/tree-wind";
import { configureTreeMaterial } from "./client/tree-appearance";
import { createWebGpuShadowDepthWrapper } from "./client/webgpu-shadow-readiness";
import { applyCampusSkyIntensity, campusShadowResponse, campusBloomResponse, solarShadowsEnabled } from "./client/cinematic";

const sha = (s: string) => createHash("sha256").update(s).digest("hex");
const sources: Record<string, string> = {};
function ast(file: string) {
  const text = readFileSync(new URL(file, import.meta.url), "utf8");
  sources[file] = sha(text);
  return ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
}
function makeClass(file: string, className: string, names: string[], environment: Record<string, unknown>, constructor = "", preNames: string[] = []) {
  const source = ast(file);
  const cls = source.statements.find((node): node is ts.ClassDeclaration => ts.isClassDeclaration(node) && node.name?.text === className)!;
  const members = cls.members.filter(node => node.name && names.includes(node.name.getText(source)));
  assert.equal(new Set(members.map(node => node.name!.getText(source))).size, names.length);
  const before = source.statements.filter(node =>
    ts.isFunctionDeclaration(node) ? preNames.includes(node.name?.text ?? "") :
    ts.isVariableStatement(node) && node.declarationList.declarations.some(decl => preNames.includes(decl.name.getText(source))))
    .map(node => node.getText(source).replace(/^export /, "")).join("\n");
  const code = `${before}\nclass Selected { ${constructor}\n${members.map(node => node.getText(source)).join("\n")} }`;
  const compiled = ts.transpileModule(code, { compilerOptions: { target: ts.ScriptTarget.ES2022, useDefineForClassFields: false } }).outputText;
  return new Script(`(function(env){ const {${Object.keys(environment).join(",")}}=env; ${compiled}; return Selected; })`).runInThisContext()(environment);
}
const b6Source = ast("client/b6-reality.ts");
const b6Class = b6Source.statements.find((n): n is ts.ClassDeclaration => ts.isClassDeclaration(n) && n.name?.text === "B6RealityController")!;
const b6Ctor = b6Class.members.find(ts.isConstructorDeclaration)!;
const lightStart = b6Ctor.body!.statements.findIndex(node => node.getText(b6Source).startsWith("this.light = new PointLight"));
assert.ok(lightStart >= 0);
const lightSetup = b6Ctor.body!.statements.slice(lightStart).map(node => node.getText(b6Source)).join("\n");
const selectedAssets = B6_ASSET_MANIFEST.assets.filter(asset => ["reception-counter", "noticeboard"].includes(asset.id));
const selectedPlacements = B6_PROP_PLACEMENTS.filter(p => ["reception-counter", "noticeboard"].includes(p.asset));
assert.equal(selectedAssets.length, 2); assert.equal(selectedPlacements.length, 2);
const benchmark = JSON.parse(readFileSync(new URL("../../webgpu-hitch-validation-20261017/async-v2-first-f-benchmark.json", import.meta.url), "utf8"));
const weather = Object.freeze(benchmark.weather ?? benchmark.weatherAtEnd);
const recordedPosition = Object.freeze(benchmark.sceneView.position);
const stages = ast("client/light-preparation.ts").statements.find(node => ts.isVariableStatement(node) && node.declarationList.declarations.some(d => d.name.getText() === "stages"))!.getText();

function describeEffect(effect: any) {
  return effect ? { id: effect.uniqueId, disposed: effect.isDisposed, definesSha: sha(effect.defines),
    lightDefines: effect.defines.split("\n").filter((line: string) => /^#define (LIGHT\d|POINTLIGHT\d|DIRLIGHT\d|SPOTLIGHT\d|HEMILIGHT\d|LIGHT_FALLOFF|SHADOW|MAXLIGHT|INSTANCES|THIN_INSTANCES|NUM_BONE)/.test(line)) } : null;
}
async function scenario(nowIso: string) {
  const now = Date.parse(nowIso);
  class FrozenDate extends Date { static now() { return now; } }
  let clock = 100, loop: (() => void) | undefined, timer: { at: number; callback(): void } | undefined;
  const engine: any = new NullEngine({ renderWidth: 1512, renderHeight: 642, textureSize: 16, deterministicLockstep: false, lockstepMaxSteps: 1 });
  // CPU bookkeeping feature only; draw/buffer bindings remain NullEngine no-ops.
  engine.getCaps().instancedArrays = true;
  const scene = new Scene(engine); scene.useRightHandedSystem = true;
  try {
  const camera = new FreeCamera("fixture actual Game camera", new Vector3(SPAWN.x, SPAWN.y + 2, SPAWN.z - 5), scene);
  camera.fov = .85; camera.minZ = .08; camera.maxZ = 1100; scene.activeCamera = camera;
  const ambient = new HemisphericLight("sky", Vector3.Up(), scene);
  const sun = new DirectionalLight("sun", Vector3.Down(), scene);
  const lamps = new StandardMaterial("fixture lamp material", scene);
  const lights = [SPAWN, { x: -4.85, z: -77.05 }].flatMap((pos, zone) => [0, 1, 2].map(i => {
    const light = new PointLight(`fixture street ${zone}/${i}`, new Vector3(pos.x + 2 + i * 3, 4, pos.z), scene);
    light.range = 22; light.falloffType = Light.FALLOFF_STANDARD; light.setEnabled(false); return light;
  }));
  // Same ownership order as Game: observe glTF activation before loading assets.
  const stable = new StableLightState(scene), budgets = new GltfLightBudget(scene);
  const B6 = makeClass("client/b6-reality.ts", "B6RealityController", ["stats", "managed", "sources", "materials", "imported", "light", "interiorLightEnabled", "disposed", "buildingRoot", "lightWorldPosition", "inverseBuildingWorld", "lastPlayer", "lastQuality", "lastFloor", "loadProps", "update", "dispose"], {
    Vector3, Matrix, Mesh, PointLight, Light, Color3, B6_LAYOUT, B6_ENTRY_PACK, B6_STAIR_CORES, renderBudget,
    B6_ASSET_MANIFEST: { assets: selectedAssets }, B6_PROP_PLACEMENTS: selectedPlacements,
    LoadAssetContainerAsync,
  }, `constructor(scene, options = {}) { this.scene=scene; this.options=options; ${lightSetup} }`, ["B6_ENTRY_VISIBILITY_BOUNDS", "B6_CONSTRUCTION_BOUNDS", "distanceToBounds"]);
  const b6: any = new B6(scene, { assetSource: (url: string) => new Uint8Array(readFileSync(new URL("assets/" + url.split("/").at(-1), import.meta.url))) });
  await b6.loadProps();
  assert.deepEqual(b6.stats.errors, []); assert.equal(b6.stats.loadedAssets, 2); assert.ok(b6.stats.propInstances >= 2);
  const subjects: any[] = [
    { role: "resident Standard", mesh: MeshBuilder.CreateBox("layout Standard", {}, scene) },
    { role: "resident PBR leaf", mesh: MeshBuilder.CreateBox("layout PBR leaf", {}, scene) },
    ...b6.managed.map((entry: any) => ({ role: `B6 instance ${entry.mesh.metadata.sourceId} / ${entry.mesh.material.name}`, mesh: entry.mesh })),
  ];
  subjects[0].mesh.material = new StandardMaterial("layout Standard", scene);
  const leaf = new PBRMaterial("layout leaves", scene);
  leaf.albedoTexture = new Texture("data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jB5kAAAAASUVORK5CYII=", scene);
  leaf.albedoTexture.hasAlpha = true; assert.equal(leaf.albedoTexture.isReady(), true);
  configureTreeMaterial(leaf); new TreeWindPlugin(leaf, { time: 0, x: 1, z: 0 }); subjects[1].mesh.material = leaf;
  for (const row of subjects) {
    if (!row.mesh.isAnInstance) row.mesh.receiveShadows = true;
    row.mesh.metadata = { ...row.mesh.metadata, depthCaster: row === subjects[1] ? "alpha-test" : "opaque", windDeformed: row === subjects[1] };
  }
  engine._isWebGPU = true; const leafWrapper: any = createWebGpuShadowDepthWrapper(leaf, scene); engine._isWebGPU = false;
  leaf.shadowDepthWrapper = leafWrapper;
  const skyMat = new StandardMaterial("sky IO substitute", scene); skyMat.disableLighting = true;
  const atmosphere = { material: skyMat, update() {}, dispose() {} };
  const sink: any = { setFloat() { return this; }, setVector3() { return this; }, setColor3() { return this; } };
  const Sky = makeClass("client/sky-weather.ts", "SkyWeatherController", ["observer", "direction", "right", "up", "back", "light", "worldUp", "lastInstant", "initialized", "state", "placeDisc", "update"],
    { Vector3, Quaternion, sunState, moonState, windVector, Date: FrozenDate }, "", ["clamp", "mix", "moonDiscLightVector"]);
  const sky: any = Object.assign(new Sky(), { scene, atmosphere, sunMaterial: sink, moonMaterial: sink,
    sunDisc: new TransformNode("sun IO", scene), moonDisc: new TransformNode("moon IO", scene) });
  sky.sunDisc.rotationQuaternion = Quaternion.Identity(); sky.moonDisc.rotationQuaternion = Quaternion.Identity();
  const celestialShadow = new ShadowGenerator(32, sun);
  const Cinematic = makeClass("client/cinematic.ts", "CinematicAtmosphere", ["update"], { Vector3, Constants, applyCampusSkyIntensity, campusShadowResponse, campusBloomResponse, solarShadowsEnabled }, "", ["clamp", "SHADOW_SPAN", "writeSnappedShadowFocus"]);
  const cinematic: any = Object.assign(new Cinematic(), { scene, sun, shadow: celestialShadow, quality: "medium", disposed: false,
    stats: { skyUpdates: 0 }, shadowFocus: { focus: Vector3.Zero(), direction: Vector3.Zero(), texel: 0 },
    timer: 0, environmentTimer: 0, lastSky: new Color3(), lastHorizon: new Color3(),
    configureGlass() { throw Error("Glass configuration is outside this fixed-quality probe"); },
    selectCasters() { throw Error("Unexpected active celestial shadow; full spatial caster selection is outside this probe"); },
    reflectionData() { return { faces: [], polynomial: null }; }, environment: { update() {}, sphericalPolynomial: null } });
  const actor = Object.freeze({ position: Object.freeze({ ...SPAWN }), vehicle: false, grounded: true });
  const physics = { updates: 0, queries: 0 }, network = { inputs: 0 };
  const rigRoot = new TransformNode("representative local avatar", scene), elbow = new TransformNode("representative right elbow", scene);
  elbow.parent = rigRoot; elbow.position.set(.25, 1.15, .05); elbow.rotation.x = -Math.PI / 2;
  const rig: any = { root: rigRoot, rightElbow: elbow, eyeHeight: 1.63, bodyHeight: 1.8, measurements: { legSpacing: .105 },
    target: { id: "local", yaw: 0, vehicle: false }, lod: { update: (input: any) => ({ visible: input.visible, level: "near", resetAnimation: false }), animationDelta: () => 0 },
    animation: { reset() {}, update() { throw Error("No animation advancement in presentation proof"); } } };
  let stage = "unprepared", lastSample: any;
  let mainDrawn = new Set<any>();
  let shadowDrawn = new Map<number, Set<any>>();
  const shadowObservers = new Map<any, any>();
  const drawObservers: { source: any; observer: any }[] = [];
  const subjectSources = new Set(subjects.map(row => row.mesh.sourceMesh ?? row.mesh));
  const collectDrawn = (source: any, into: Set<any>) => {
    if (!subjectSources.has(source)) return;
    const storage = source._instanceDataStorage;
    const passStorage = storage.useMonoDataStorageRenderPass ? storage.dataStorageRenderPass : storage.renderPasses[engine.currentRenderPassId];
    const batch = passStorage.batchCache;
    for (const sub of source.subMeshes) {
      if (batch.renderSelf[sub._id]) into.add(source);
      for (const instance of batch.visibleInstances[sub._id] ?? []) into.add(instance);
    }
  };
  for (const source of subjectSources) {
    const observer = source.onAfterRenderObservable.add(() => {
      if (engine.currentRenderPassId !== camera.renderPassId) return;
      collectDrawn(source, mainDrawn);
    });
    drawObservers.push({ source, observer });
  }
  const stageSamples: Record<string, any> = {};
  const Game = makeClass("client/game.ts", "Game", ["prepareLighting", "isMeshReadyForCamera", "updateWorldPresentation", "updateRenderEnvironment", "updateCameraFollow", "updateAvatarPresentation"], {
    PlayerFlashlight, Vector3, prepareLightVariants, arePreparationEffectsReady, applyArtLighting, clampOrbitPitch, writeVector3,
    selectLightingPreview: (mode: any) => selectLightingPreview(mode, now), Date: FrozenDate,
    performance: { now: () => clock }, document: { hidden: false, addEventListener() {}, removeEventListener() {} },
    window: { setTimeout: (callback: () => void, ms: number) => { timer = { at: clock + ms, callback }; return 1; }, clearTimeout: () => { timer = undefined; } },
    zoneAt: () => { throw Error("No rain branch expected"); },
  });
  const game: any = Object.assign(new Game(), { scene, engine, camera, actor, ready: false, disposed: false, rendererFailed: false,
    quality: "medium", timeOverride: null, flashlightOn: false, yaw: 0, pitch: .28, distance: 5, cameraArm: 5,
    firstPerson: false, footFirstPerson: false, vehicleCameraSnap: true, localId: "local", avatars: new Map([["local", rig]]), profile: {}, weather,
    ambient, sun, lights, lamps, car: new TransformNode("inactive car", scene), clouds: [], skyWeather: sky, cinematic, b6Reality: b6,
    localAvatarPresentation: new LocalAvatarPresentation(), contactShadows: { set() {} },
    sim: { cameraDistance: (from: Vector3, to: Vector3) => { physics.queries++; return Vector3.Distance(from, to); }, tick() { physics.updates++; throw Error("Physics advanced"); }, setPosition() { throw Error("Actor moved"); } },
    onInput: () => { network.inputs++; throw Error("Network input"); },
    renderHealth: { snapshot: () => ({ errorCount: 0, phase: "preparing", pendingPreparationOperations: 0 }) },
    compilationProfile: { setStage: (name: string) => { if (lastSample && stage !== name) stageSamples[stage] = lastSample; stage = name; } },
  });
  game.car.setEnabled(false);
  engine.runRenderLoop = (callback: () => void) => { assert.equal(loop, undefined); loop = callback; };
  engine.stopRenderLoop = (callback: () => void) => { if (callback === loop) loop = undefined; };
  const moveResidents = (pos: any) => { subjects[0].mesh.position.set(pos.x - .4, pos.y, pos.z + 3); subjects[1].mesh.position.set(pos.x + .4, pos.y, pos.z + 3); };
  moveResidents(actor.position);
  const depthEntries = () => [...(leafWrapper._subMeshToDepthWrapper.mm.get(subjects[1].mesh.subMeshes[0])?.entries() ?? [])] as [any, any][];
  const depths = () => depthEntries().map(([generator, entry]) => ({ light: generator.getLight().name, pass: generator.getShadowMap()?.renderPassId,
    token: entry.token, effect: describeEffect(entry.mainDrawWrapper.effect) }));
  const sample = (label: string) => ({ label, at: new Date(sky.state.instant).toISOString(), daylight: sky.state.sun.daylight,
    sunAltitude: sky.state.sun.altitude, moonAltitude: sky.state.moon.altitude, moonFraction: sky.state.moon.fraction,
    skyKey: sun.isEnabled() ? (sun.intensity === 0 ? "zero" : "directional") : "none", sunIntensity: sun.intensity,
    celestialShadows: cinematic.stats.shadowSource, b6: b6.interiorLightEnabled, leafDepths: depths(),
    camera: { pass: camera.renderPassId, position: camera.position.asArray(), target: camera.getTarget().asArray() },
    subjects: subjects.map(row => {
      const mesh: any = row.mesh, rendering = mesh.sourceMesh ?? mesh, sub = rendering.subMeshes[0];
      return { role: row.role, attached: scene.meshes.includes(mesh), enabled: mesh.isEnabled(), active: scene.getActiveMeshes().data.slice(0, scene.getActiveMeshes().length).includes(mesh),
        instance: mesh.isAnInstance, sourceHasInstances: rendering.hasInstances, drawn: mainDrawn.has(mesh), shadowDrawPasses: [...shadowDrawn].filter(([_, drawn]) => drawn.has(mesh)).map(([pass]) => pass), receiveShadows: rendering.receiveShadows, cap: mesh.material.maxSimultaneousLights,
        ordered: mesh.lightSources.map((light: any) => ({ name: light.name, type: light.getClassName(), falloff: light.falloffType,
          shadow: light.shadowEnabled && !!light.getShadowGenerator()?.getShadowMap()?.renderList?.length, filter: light.getShadowGenerator()?.filter ?? null,
          filteringQuality: light.getShadowGenerator()?.filteringQuality ?? null, priority: light.renderPriority, intensity: light.intensity,
          position: light.position?.asArray() ?? null, direction: light.direction?.asArray() ?? null })),
        effect: describeEffect(sub._getDrawWrapper(camera.renderPassId)?.effect) };
    }) });
  const render = () => {
    try {
      for (const generator of [celestialShadow, game.flashlight?.beam.light.getShadowGenerator()].filter(Boolean)) if (!shadowObservers.has(generator)) {
        const observer = generator.onAfterShadowMapRenderMeshObservable.add((source: any) => {
          const pass = engine.currentRenderPassId;
          let drawn = shadowDrawn.get(pass); if (!drawn) shadowDrawn.set(pass, drawn = new Set());
          collectDrawn(source, drawn);
        });
        shadowObservers.set(generator, observer);
      }
      budgets.prepareFrame(); stable.update(); mainDrawn = new Set(); shadowDrawn = new Map(); scene.render(); lastSample = sample(stage);
    }
    catch (error) { console.error("Probe render failed at", stage, error); throw error; }
  };
  const output: any = { nowIso, selectedPlacements, nightAnchor: new Date(selectLightingPreview("night", now).instant!).toISOString() };
  try {
    const beforeActor = JSON.stringify(actor), beforeWeather = JSON.stringify(weather);
    let result: any, rejection: unknown;
    game.prepareLighting(render).then((value: any) => { result = value; }, (error: unknown) => { rejection = error; });
    for (let i = 0; !result && !rejection && i < 1800; i++) {
      clock += 16; loop?.(); if (timer && clock >= timer.at) timer.callback(); await setImmediate();
    }
    if (rejection) throw rejection;
    assert.ok(result); assert.equal(result.status, "complete"); stageSamples[stage] = lastSample;
    output.startup = { result, stages: stageSamples };
    assert.ok(Object.values(stageSamples).every((row: any) => row.b6 === false));
    assert.equal(budgets.stats.activeLoaders, 0);
    assert.ok(b6.managed.every((entry: any) => !scene.meshes.includes(entry.mesh)));
    const originalAvatar = rigRoot.position.clone(), originalLocalView = JSON.stringify(game.localAvatarPresentation.state), originalCamera = camera.position.clone();
    const presentation = (pos: any, instant: number, enabled: boolean, label: string, replayCamera = false) => {
      stage = label; moveResidents(pos);
      game.updateWorldPresentation(pos);
      game.updateCameraFollow(Vector3.FromArray([pos.x, pos.y, pos.z]), rig.eyeHeight, 1);
      if (replayCamera) {
        const world = Matrix.FromArray(benchmark.sceneView.camera.viewMatrix).invert();
        camera.position.copyFrom(Vector3.FromArray([benchmark.sceneView.camera.position.x, benchmark.sceneView.camera.position.y, benchmark.sceneView.camera.position.z]));
        camera.setTarget(Vector3.TransformCoordinates(new Vector3(0, 0, -1), world));
      }
      // Candidate proof is camera-only: actual avatar/animation/actor stay at spawn.
      game.updateRenderEnvironment(pos, rig, true, 0, clock / 1000, instant, enabled);
    };
    const settleRender = async () => {
      for (let i = 0; i < 45; i++) { clock += 16; render(); await setImmediate(); if (arePreparationEffectsReady(engine)) { render(); return; } }
      throw Error("Presentation effects did not settle");
    };
    output.b6 = [];
    for (const date of ["2026-10-17", "2026-10-18"]) {
      const day = Date.parse(date + "T10:00:00Z");
      for (const enabled of [false, true]) {
        presentation(recordedPosition, day, enabled, `${date}/recorded-B6/${enabled ? "on" : "off"}`, true);
        await settleRender(); const row: any = sample(stage);
        assert.equal(row.b6, true); assert.ok(row.subjects.filter((s: any) => s.instance).every((s: any) => s.attached));
        assert.ok(row.subjects.every((s: any) => s.cap === 4), "actual glTF budget ownership keeps declared four-light caps");
        assert.ok(row.subjects.filter((s: any) => s.instance && s.drawn).every((s: any) => s.effect?.lightDefines.includes("#define INSTANCES")), "native main draw is the regular-instance shader path");
        output.b6.push(row);
      }
    }
    // Camera-only nav-derived viewpoint, preserving the real actor and avatar.
    const interior = { x: B6_LAYOUT.approachRoute.at(-1)![0], y: recordedPosition.y, z: B6_LAYOUT.approachRoute.at(-1)![1] };
    presentation(interior, Date.parse("2026-10-18T10:00:00Z"), true, "navigation-interior/on");
    camera.position.set(interior.x, B6_LAYOUT.foundationOffset + rig.eyeHeight, interior.z);
    camera.setTarget(new Vector3(...[B6_LAYOUT.serviceRoute[1][0], camera.position.y, B6_LAYOUT.serviceRoute[1][1]] as [number, number, number]));
    game.updateRenderEnvironment(interior, rig, true, 0, clock / 1000, Date.parse("2026-10-18T10:00:00Z"), true);
    await settleRender(); output.navigationView = sample(stage);
    // Alternative grounded in the authored entrance landing, with an inward
    // camera-only view toward the last approach-route point. This tests coverage
    // without choosing or implementing a production preparation viewpoint.
    const landing = { x: B6_LAYOUT.entry.x, y: recordedPosition.y, z: B6_LAYOUT.entry.landingMaxZ };
    presentation(landing, Date.parse("2026-10-18T10:00:00Z"), true, "authored-landing/on");
    camera.position.set(landing.x, B6_LAYOUT.foundationOffset + rig.eyeHeight, landing.z);
    camera.setTarget(new Vector3(interior.x, camera.position.y, interior.z));
    game.updateRenderEnvironment(landing, rig, true, 0, clock / 1000, Date.parse("2026-10-18T10:00:00Z"), true);
    await settleRender(); output.entryView = sample(stage);
    // Return to the exact reference view before probing variant ownership.
    presentation(recordedPosition, Date.parse("2026-10-18T10:00:00Z"), true, "reuse-before-restore", true);
    await settleRender(); const beforeRestore = sample(stage);
    const preparedDepths = depthEntries().map(([_, entry]) => entry.mainDrawWrapper.effect);
    assert.ok(preparedDepths.length > 0, "the leaf actually has a prepared torch shadow variant");
    presentation(actor.position, game.timeOverride ?? now, game.flashlightOn, "restore-real-request");
    await settleRender(); output.restore = sample(stage);
    const disposedAfterRestore = preparedDepths.map(effect => ({ id: effect.uniqueId, disposed: effect.isDisposed }));
    assert.ok(disposedAfterRestore.every(row => row.disposed), "actual OFF render retires prepared future ON depth effects");
    assert.ok(Vector3.Distance(camera.position, originalCamera) < .01, "presentation camera returns to the requested spawn pose");
    assert.ok(rigRoot.position.equals(originalAvatar));
    assert.equal(JSON.stringify(game.localAvatarPresentation.state), originalLocalView);
    presentation(recordedPosition, Date.parse("2026-10-18T10:00:00Z"), true, "reuse-after-restore", true);
    await settleRender(); const afterRestore = sample(stage);
    const reused = beforeRestore.subjects.filter((row: any) => row.drawn).map((row: any) => {
      const next = afterRestore.subjects.find((candidate: any) => candidate.role === row.role)!;
      return { role: row.role, beforeId: row.effect?.id, afterId: next.effect?.id, sameDefines: row.effect?.definesSha === next.effect?.definesSha };
    });
    assert.ok(reused.every((row: any) => row.beforeId === row.afterId && row.sameDefines), "live cached main/instance Effects are reused after the same presentation returns");
    assert.ok(beforeRestore.leafDepths.every(old => !afterRestore.leafDepths.some(next => old.token === next.token)), "depth wrapper creates new identities despite cached main reuse");
    output.reuse = { beforeRestore, disposedAfterRestore, afterRestore, main: reused };
    presentation(actor.position, game.timeOverride ?? now, game.flashlightOn, "final-restore-real-request");
    await settleRender(); output.finalRestore = sample(stage);
    assert.equal(output.restore.b6, false); assert.ok(b6.managed.every((entry: any) => !scene.meshes.includes(entry.mesh)));
    assert.equal(JSON.stringify(actor), beforeActor); assert.equal(JSON.stringify(weather), beforeWeather);
    assert.equal(physics.updates, 0); assert.equal(network.inputs, 0);
    assert.equal(game.flashlightOn, false); assert.equal(game.timeOverride, null); assert.equal(game.ready, false);
    output.ownership = { actorUnchanged: true, weatherUnchanged: true, physicsUpdates: physics.updates, readonlyCameraQueries: physics.queries, networkInputs: network.inputs, avatarPosition: rigRoot.position.asArray(), localAvatarPresentationUnchanged: true, activeGltfLoads: budgets.stats.activeLoaders };
    output.pass = true;
  } catch (error) { output.error = String(error); writeFileSync(`failed-${nowIso.slice(11,16).replace(":", "")}.json`, JSON.stringify({ output, lastSample }, null, 2)); throw error; }
  finally { for (const [generator, observer] of shadowObservers) generator.onAfterShadowMapRenderMeshObservable.remove(observer); for (const { source, observer } of drawObservers) source.onAfterRenderObservable.remove(observer); budgets.dispose(); stable.dispose(); game.flashlight?.dispose(); b6.dispose(); leafWrapper.dispose(); celestialShadow.dispose(); scene.dispose(); engine.dispose(); }
  return output;
  } finally { scene.dispose(); engine.dispose(); }
}

const startedAt = new Date().toISOString(), started = performance.now(), usage = process.cpuUsage();
const results: any[] = [];
try {
  for (const now of ["2026-10-17T21:59:00Z", "2026-10-17T22:04:36Z"]) results.push(await scenario(now));
  const report = { startedAt, endedAt: new Date().toISOString(), wallMs: performance.now() - started, cpu: process.cpuUsage(usage), sources, originalStagesSource: stages, results, passed: true };
  writeFileSync("report.json", JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify({ startedAt, endedAt: report.endedAt, wallMs: report.wallMs, cases: results.length, passed: true }));
} catch (error) { writeFileSync("failed-report.json", JSON.stringify({ startedAt, sources, results, error: String(error) }, null, 2)); throw error; }
