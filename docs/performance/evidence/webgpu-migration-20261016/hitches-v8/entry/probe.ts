import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { Script } from "node:vm";
import { setImmediate } from "node:timers/promises";
import ts from "typescript";
import RAPIER from "@dimforge/rapier3d-compat";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData";
import "@babylonjs/core/Meshes/instancedMesh";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { FreeCamera } from "@babylonjs/core/Cameras/freeCamera";
import { Vector3, Matrix } from "@babylonjs/core/Maths/math.vector";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { PointLight } from "@babylonjs/core/Lights/pointLight";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { Light } from "@babylonjs/core/Lights/light";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import { LoadAssetContainerAsync } from "@babylonjs/core/Loading/sceneLoader";
import "@babylonjs/loaders/glTF";
import "../../webgpu-hitch-validation-20261017/b6-preparation-v1/client/render-shaders";
import { PlayerFlashlight } from "../../webgpu-hitch-validation-20261017/b6-preparation-v1/client/flashlight";
import { StableLightState } from "../../webgpu-hitch-validation-20261017/b6-preparation-v1/client/stable-light-state";
import { GltfLightBudget } from "../../webgpu-hitch-validation-20261017/b6-preparation-v1/client/gltf-light-budget";
import { clampOrbitPitch } from "../../webgpu-hitch-validation-20261017/b6-preparation-v1/client/camera-look";
import { createB6ExteriorConcreteMaterial } from "../../webgpu-hitch-validation-20261017/b6-preparation-v1/client/b6-exterior-concrete";
import { B6_LAYOUT, B6_ENTRY_PACK, B6_REALITY_BOXES, B6_STAIR_MESHES, B6_STAIR_CORES } from "../../webgpu-hitch-validation-20261017/b6-preparation-v1/shared/b6-interior";
import { B6_ASSET_MANIFEST, B6_PROP_PLACEMENTS } from "../../webgpu-hitch-validation-20261017/b6-preparation-v1/shared/b6-props";
import { B6_STAIR_MATERIALS, b6StairUVs } from "../../webgpu-hitch-validation-20261017/b6-preparation-v1/shared/b6-stair-materials";
import { b6FacadeOwnsBoxFace } from "../../webgpu-hitch-validation-20261017/b6-preparation-v1/shared/b6-facade-plan";
import { renderBudget } from "../../webgpu-hitch-validation-20261017/b6-preparation-v1/shared/render-quality";

const sha = (bytes: string | Uint8Array) => createHash("sha256").update(bytes).digest("hex");
const sources: Record<string, string> = {};
const base = new URL("../../webgpu-hitch-validation-20261017/b6-preparation-v1/", import.meta.url);
const benchmarkBytes = readFileSync(new URL("../b6-candidate-inside-first-f-benchmark.json", base));
sources["evidence/b6-candidate-inside-first-f-benchmark.json"] = sha(benchmarkBytes);
const benchmark = JSON.parse(benchmarkBytes.toString());
const quality = benchmark.quality;
assert.equal(quality, "medium");
const rawBytes = readFileSync(new URL("../async-b6-candidate-inside1-session.jsonl", base));
sources["evidence/async-b6-candidate-inside1-session.jsonl"] = sha(rawBytes);
const sample = rawBytes.toString().trim().split("\n").flatMap(line => JSON.parse(line).records ?? []).find(r => r.seq === 4575);
assert.equal(sample.kind, "mesh-draw-sample");
assert.equal(sample.data.reason, "action:flashlight");
const originalTopMeshes = sample.data.topMeshes.filter((m: any) => m.name.startsWith("b6 "));
function source(file: string) {
  const bytes = readFileSync(new URL(file, base)); sources[file] = sha(bytes);
  return ts.createSourceFile(file, bytes.toString(), ts.ScriptTarget.Latest, true);
}
function evaluate(code: string, env: Record<string, unknown>, result: string) {
  const js = ts.transpileModule(code, { compilerOptions: { target: ts.ScriptTarget.ES2022, useDefineForClassFields: false } }).outputText;
  return new Script(`(function(env){const {${Object.keys(env)}}=env;${js};return ${result};})`).runInThisContext()(env);
}
function klass(file: string, name: string, members: string[], env: Record<string, unknown>, ctor = "") {
  const ast = source(file), cls = ast.statements.find((n): n is ts.ClassDeclaration => ts.isClassDeclaration(n) && n.name?.text === name)!;
  const selected = cls.members.filter(n => n.name && members.includes(n.name.getText(ast)));
  assert.equal(selected.length, members.length);
  return evaluate(`class Selected {${ctor}\n${selected.map(n => n.getText(ast)).join("\n")}}`, env, "Selected");
}

// Only canonical exterior-entry boxes/meshes. No fabricated proxy geometry.
const boxes = B6_REALITY_BOXES.filter(b => b.role === "exterior-entry" ||
  b.kind === "stair" && b.x === B6_LAYOUT.entry.x && b.z >= B6_LAYOUT.entry.stepsFromZ && b.z <= B6_LAYOUT.entry.landingMaxZ);
const stairs = B6_STAIR_MESHES.filter(m => m.exteriorEntry);
const assets = B6_ASSET_MANIFEST.assets.filter(a => ["reception-counter", "noticeboard"].includes(a.id));
const placements = B6_PROP_PLACEMENTS.filter(p => ["reception-counter", "noticeboard"].includes(p.asset));
assert.equal(assets.length, 2); assert.equal(placements.length, 2);
const ast = source("client/b6-reality.ts");
const named = (name: string) => ast.statements.find(n => ts.isFunctionDeclaration(n) ? n.name?.text === name :
  ts.isVariableStatement(n) && n.declarationList.declarations.some(d => d.name.getText(ast) === name))!.getText(ast).replace(/^export /, "");
const env: Record<string, unknown> = { Vector3, Matrix, Mesh, VertexData, PointLight, Light, Color3, PBRMaterial, Texture,
  B6_LAYOUT, B6_ENTRY_PACK, B6_STAIR_CORES, B6_REALITY_BOXES: boxes, B6_STAIR_MESHES: stairs, B6_ROOM_AREAS: [],
  B6_STAIR_MATERIALS, b6StairUVs, b6FacadeOwnsBoxFace, createB6ExteriorConcreteMaterial, renderBudget,
  B6_ASSET_MANIFEST: { assets }, B6_PROP_PLACEMENTS: placements, LoadAssetContainerAsync };
for (const name of ["createB6BoxFaceParts", "createB6StairMaterials", "createB6StairMeshes", "distanceToBounds", "B6_ENTRY_VISIBILITY_BOUNDS", "B6_CONSTRUCTION_BOUNDS"])
  env[name] = evaluate(named(name), env, name);
const cls = ast.statements.find((n): n is ts.ClassDeclaration => ts.isClassDeclaration(n) && n.name?.text === "B6RealityController")!;
const ctor = cls.members.find(ts.isConstructorDeclaration)!;
// Remove only room-number plate generation (no room areas are in this fixture).
const statements = ctor.body!.statements.filter(n => !(ts.isForStatement(n) && n.initializer?.getText(ast).startsWith("let level =")));
assert.equal(ctor.body!.statements.length - statements.length, 1);
const B6 = klass("client/b6-reality.ts", "B6RealityController", ["stats", "managed", "sources", "materials", "imported", "light", "interiorLightEnabled", "disposed", "buildingRoot", "lightWorldPosition", "inverseBuildingWorld", "lastPlayer", "lastQuality", "lastFloor", "loadProps", "update", "dispose"], env,
  `constructor(scene,options={}){this.scene=scene;this.options=options;${statements.map(n => n.getText(ast)).join("\n")}}`);
const CameraOwner = klass("client/game.ts", "Game", ["updateCameraFollow", "pitch", "distance", "cameraArm"], { Vector3, clampOrbitPitch });
const SimulationQueries = klass("shared/simulation.ts", "Simulation", ["solid", "cameraDistance"], { RAPIER });
for (const file of ["shared/b6-entry.ts", "shared/b6-interior.ts", "shared/b6-stairs.ts", "shared/b6-props.ts", "shared/b6-stair-materials.ts", "shared/b6-facade-plan.ts", "shared/render-quality.ts", "client/flashlight.ts", "client/vehicle-lighting.ts", "client/b6-exterior-concrete.ts", "client/camera-look.ts", "client/gltf-light-budget.ts", "client/stable-light-state.ts"]) source(file);
for (const file of ["@babylonjs/core/package.json", "@babylonjs/core/Meshes/mesh.pure.js", "@babylonjs/core/Engines/nullEngine.pure.js", "@dimforge/rapier3d-compat/package.json", "@dimforge/rapier3d-compat/dist/rapier.mjs"])
  sources[`dependencies-v5/${file}`] = sha(readFileSync(new URL(`node_modules/${file}`, import.meta.url)));

await RAPIER.init();
const engine: any = new NullEngine({ renderWidth: 1512, renderHeight: 642, textureSize: 16, deterministicLockstep: false, lockstepMaxSteps: 1 });
engine.getCaps().instancedArrays = true; // CPU instance bookkeeping only; no GPU buffers or draws.
const scene = new Scene(engine); scene.useRightHandedSystem = true;
const camera = new FreeCamera("actual camera API/pass", Vector3.Zero(), scene);
camera.fov = .85; camera.minZ = .08; camera.maxZ = 1100; scene.activeCamera = camera;
new HemisphericLight("sky", Vector3.Up(), scene);
new DirectionalLight("sun", Vector3.Down(), scene);
const stable = new StableLightState(scene), budgets = new GltfLightBudget(scene);
const b6 = new B6(scene, { assetSource(url: string) {
  const file = url.split("/").at(-1)!;
  const bytes = readFileSync(new URL(`../b6-variant-proof-20261018/assets/${file}`, import.meta.url));
  sources[`assets/${file}`] = sha(bytes); return new Uint8Array(bytes);
} });
const torch = new PlayerFlashlight(scene);
const rig = { root: new TransformNode("unmoved rig IO", scene), rightElbow: new TransformNode("unmoved elbow IO", scene) } as any;
const world = new RAPIER.World({ x: 0, y: 0, z: 0 });
const sim = Object.assign(new SimulationQueries(), { world, walkingColliders: new Set(), car: {} });
for (const b of boxes) sim.solid(b.x, b.y + B6_LAYOUT.foundationOffset, b.z, b.w, b.h, b.d, b.yaw);
for (const m of stairs) if (m.collides && m.indices.length) world.createCollider(RAPIER.ColliderDesc.trimesh(Float32Array.from(m.positions), Uint32Array.from(m.indices), RAPIER.TriMeshFlags.FIX_INTERNAL_EDGES).setTranslation(0, B6_LAYOUT.foundationOffset, 0));
// Broadphase initialization of this isolated static fixture, never production physics.
world.step();
const actor = Object.freeze({ vehicle: false, collider: undefined, body: undefined });
const body = new Vector3(B6_LAYOUT.entry.x, B6_LAYOUT.foundationOffset + .8, B6_LAYOUT.entry.landingMaxZ);
const route = B6_LAYOUT.approachRoute.at(-1)!;
const owner = Object.assign(new CameraOwner(), { camera, actor, sim, firstPerson: false, footFirstPerson: false,
  yaw: Math.atan2(route[0] - body.x, route[1] - body.z), vehicleCameraSnap: true });
const observations: any[] = [], rows: any[] = [];
let drawn = new Set<Mesh>();
const startedAt = new Date().toISOString(), started = performance.now();
const report: any = { startedAt, snapshot: "a94ea6ced62b1aa5a3e7c5f94aa4884cce83f30bb5063cda2e4e126507f4eb78", sources,
  rawReference: { seq: sample.seq, atMs: sample.atMs, topMeshes: originalTopMeshes, scope: "Name-matched actual mesh samples; raw aggregate material effect418 is not a per-submesh shader dump." },
  fixture: { quality, boxes: boxes.length, stairMeshes: stairs.length, colliderCount: world.colliders.len(), staticInitializationSteps: 1,
    textures: "Actual factory texture objects; NullEngine synthesizes ready 16x16 internal textures without fetching pixels.",
    collision: "Actual extracted Simulation.cameraDistance + Rapier Ball(.22) sweep; canonical exterior-entry colliders only. Missing surrounding world/photogrammetry, no actor collider needed because isolated actor has no body.",
    render: "Actual Babylon scene/material/mesh/regular-instance camera-pass frontend on NullEngine; no raster/occlusion/WGSL/GPU or performance proof.",
    light: "Bounded day layout: B6 point + directional + hemi, actual player flashlight OFF/ON. No full Game environment/weather." },
  derivation: { body: body.asArray(), approachTarget: route, yaw: owner.yaw, pitch: owner.pitch, distance: owner.distance,
    source: "Same landing as frozen a94; inward yaw from final approachRoute point; original Game defaults pitch/distance; actual updateCameraFollow with snap (no interpolation history), local real collision solve." }, rows };
try {
  await b6.loadProps(); assert.deepEqual(b6.stats.errors, []); assert.equal(b6.stats.loadedAssets, 2);
  const subjects = b6.managed.map((e: any) => e.mesh);
  assert.equal(subjects.filter((m: any) => m.isAnInstance).length, 8);
  for (const sourceMesh of new Set<Mesh>(subjects.map((m: any) => m.sourceMesh ?? m))) {
    const observer = sourceMesh.onAfterRenderObservable.add(() => {
      if (engine.currentRenderPassId !== camera.renderPassId) return;
      const storage = (sourceMesh as any)._instanceDataStorage;
      const pass = storage.useMonoDataStorageRenderPass ? storage.dataStorageRenderPass : storage.renderPasses[engine.currentRenderPassId];
      for (const sub of sourceMesh.subMeshes) {
        if (pass.batchCache.renderSelf[sub._id]) drawn.add(sourceMesh);
        for (const instance of pass.batchCache.visibleInstances[sub._id] ?? []) drawn.add(instance);
      }
    });
    observations.push({ sourceMesh, observer });
  }
  b6.update({ player: body, quality });
  for (const m of subjects) m.computeWorldMatrix(true);
  const views = ["flat-landing", "source-orbit-local-collision"];
  for (const view of views) {
    if (view === "flat-landing") {
      camera.position.set(body.x, B6_LAYOUT.foundationOffset + 1.63, body.z);
      camera.setTarget(new Vector3(route[0], camera.position.y, route[1]));
    } else owner.updateCameraFollow(body, 1.63, 1);
    for (const enabled of [false, true]) {
      torch.update(rig, camera, enabled, true, quality); budgets.prepareFrame(); stable.update();
      // Preserve final-frame draw identity rather than accumulating earlier frames.
      for (let i = 0; i < 8; i++) { drawn = new Set(); scene.render(); await setImmediate(); }
      const drawnRows = subjects.filter((m: Mesh) => drawn.has(m)).map((m: any) => {
        const sourceMesh = m.sourceMesh ?? m, effect = sourceMesh.subMeshes[0]._getDrawWrapper(camera.renderPassId)?.effect;
        assert.ok(effect?.isReady());
        const entry = ["b6 stair:entry-metal", "b6:concrete stair treads"].includes(m.material.name);
        return { mesh: m.name, sourceMesh: sourceMesh.name, material: m.material.name, materialId: m.material.uniqueId,
          submesh: sourceMesh.subMeshes[0]._id, submeshCount: sourceMesh.subMeshes.length, vertices: sourceMesh.getTotalVertices(),
          attributes: sourceMesh.getVerticesDataKinds(), receiveShadows: sourceMesh.receiveShadows,
          sourceIds: m.metadata?.sourceIds ?? [], instance: m.isAnInstance, effect: effect.uniqueId, definesSha256: sha(effect.defines),
          fullDefines: entry ? effect.defines : undefined,
          defines: effect.defines.split("\n").filter((s: string) => /^#define (LIGHT\d|POINTLIGHT\d|DIRLIGHT\d|SPOTLIGHT\d|HEMILIGHT\d|INSTANCES|BUMP|ALBEDO|SHADOW)/.test(s)) };
      });
      rows.push({ view, flashlight: enabled, cameraPass: camera.renderPassId, camera: camera.position.asArray(), target: camera.getTarget().asArray(),
        cameraArm: view === views[1] ? owner.cameraArm : null, drawn: drawnRows, originalParts: drawnRows.filter((r: any) => r.instance).length,
        entryMetal: drawnRows.some((r: any) => r.material === "b6 stair:entry-metal"),
        entryHandrails: drawnRows.some((r: any) => r.mesh === "b6 dogleg floor 0 entry-metal"),
        concreteTreads: drawnRows.some((r: any) => r.material === "b6:concrete stair treads") });
    }
  }
  report.completed = true;
  report.candidateMeetsCoverage = rows.filter(r => r.view === views[1]).every(r => r.originalParts === 8 && r.entryMetal && r.entryHandrails && r.concreteTreads);
  assert.ok(report.candidateMeetsCoverage, "single proposed view must retain original8 and draw both actual missing mesh names");
  assert.ok(rows.filter(r => r.view === views[0]).every(r => r.originalParts === 8 && r.entryMetal && !r.entryHandrails && !r.concreteTreads));
  const on = rows.find(r => r.view === views[1] && r.flashlight).drawn;
  const metalBox = on.find((r: any) => r.mesh === "b6 floor 0 b6 stair:entry-metal");
  const metalRail = on.find((r: any) => r.mesh === "b6 dogleg floor 0 entry-metal");
  assert.equal(metalBox.materialId, metalRail.materialId); assert.notEqual(metalBox.effect, metalRail.effect);
  assert.equal(metalBox.receiveShadows, false); assert.equal(metalRail.receiveShadows, true);
  report.entryMetalVariantDifference = {
    boxOnly: metalBox.fullDefines.split("\n").filter((s: string) => !metalRail.fullDefines.split("\n").includes(s)),
    handrailOnly: metalRail.fullDefines.split("\n").filter((s: string) => !metalBox.fullDefines.split("\n").includes(s)),
    sameMaterial: true, distinctSubmeshesAndEffects: true,
    rawLimit: "Names match raw seq4575. CPU shader/Effect IDs cannot be equated with production WebGPU IDs242/418." };
  assert.ok(rig.root.position.equals(Vector3.Zero())); assert.ok(rig.rightElbow.position.equals(Vector3.Zero()));
  assert.equal(budgets.stats.activeLoaders, 0);
} catch (error) { report.error = String(error); throw error; }
finally {
  for (const { sourceMesh, observer } of observations) sourceMesh.onAfterRenderObservable.remove(observer);
  torch.dispose(); budgets.dispose(); stable.dispose(); b6.dispose(); scene.dispose(); engine.dispose(); world.free();
  report.endedAt = new Date().toISOString(); report.wallMs = performance.now() - started; report.cleanupCompleted = true;
  writeFileSync(new URL("report.json", import.meta.url), JSON.stringify(report, null, 2) + "\n");
}
console.log(JSON.stringify({ completed: report.completed, candidateMeetsCoverage: report.candidateMeetsCoverage, rows: rows.map(({ drawn, ...row }) => row), wallMs: report.wallMs }));
