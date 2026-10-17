import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { NullEngine } from '@babylonjs/core/Engines/nullEngine.js';
import { Scene } from '@babylonjs/core/scene.js';
import { FreeCamera } from '@babylonjs/core/Cameras/freeCamera.js';
import { Vector3, Matrix } from '@babylonjs/core/Maths/math.vector.js';
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight.js';
import { PointLight } from '@babylonjs/core/Lights/pointLight.js';
import { SpotLight } from '@babylonjs/core/Lights/spotLight.js';
import { Light } from '@babylonjs/core/Lights/light.js';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder.js';
import '@babylonjs/core/Meshes/instancedMesh.js';
import '@babylonjs/core/Meshes/thinInstanceMesh.js';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial.js';
import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial.js';

const startedAtUTC = new Date().toISOString(), start = performance.now(), cpuStart = process.cpuUsage();
console.log(JSON.stringify({ startedAtUTC, scope: 'Small CPU-only NullEngine light membership/readiness probe; QA overlap marker, not a production benchmark' }));
const engine = new NullEngine(), scene = new Scene(engine);
new FreeCamera('probe camera', new Vector3(0, 2, -4), scene);
new HemisphericLight('ambient', Vector3.Up(), scene);
const point = new PointLight('B6-like point range12', Vector3.Zero(), scene);
const spot = new SpotLight('torch-like spot range24', Vector3.Zero(), Vector3.Forward(), 0.72, 64, scene);
point.range = 12; spot.range = 24;
for (const light of [point, spot]) { light.falloffType = Light.FALLOFF_STANDARD; light.setEnabled(false); }
const entries = [];
for (const [kind, Material] of [['PBR', PBRMaterial], ['Standard', StandardMaterial]]) {
  for (let i = 0; i < 9; i++) {
    const far = i > 0;
    const mesh = MeshBuilder.CreateBox(`${kind}-${far ? 'far-' + i : 'near'}`, { size: 1 }, scene);
    mesh.position.set(far ? 50 + i * 5 : 0, 0, far ? 0 : 3);
    mesh.computeWorldMatrix(true);
    const material = new Material(mesh.name + '-material', scene);
    material.maxSimultaneousLights = 4;
    mesh.material = material;
    entries.push({ mesh, material, kind, far });
  }
}
const lightDefines = entry => Object.fromEntries(Object.entries(entry.mesh.subMeshes[0].materialDefines ?? {})
  .filter(([key]) => /^(LIGHT\d|(?:POINT|SPOT|HEMI|DIR)LIGHT\d|LIGHT_FALLOFF_)/.test(key)));
const effectId = entry => entry.mesh.subMeshes[0].effect?.uniqueId ?? null;
const dirty = entry => entry.mesh.subMeshes[0].materialDefines?._areLightsDirty === true;
const ready = entry => entry.material.isReadyForSubMesh(entry.mesh, entry.mesh.subMeshes[0], false);
async function prepare() {
  await Promise.all(entries.map(entry => entry.material.forceCompilationAsync(entry.mesh)));
  scene.incrementRenderId();
  for (const entry of entries) assert.equal(ready(entry), true, entry.mesh.name);
}
function aabbDistance(mesh) {
  mesh.computeWorldMatrix(true);
  const box = mesh.getBoundingInfo().boundingBox;
  const distance = axis => Math.max(box.minimumWorld[axis], 0, -box.maximumWorld[axis]);
  return Math.hypot(distance('x'), distance('y'), distance('z'));
}
function bounds(mesh) {
  mesh.computeWorldMatrix(true);
  const { boundingBox: box, boundingSphere: sphere } = mesh.getBoundingInfo();
  return { name: mesh.name, centerDistance: sphere.centerWorld.length(), sphereMinimumDistance: Math.max(0, sphere.centerWorld.length() - sphere.radiusWorld), aabbMinimumDistance: aabbDistance(mesh), min: box.minimumWorld.asArray(), max: box.maximumWorld.asArray() };
}
const scenarios = [];
try {
  await prepare();
  for (const light of [point, spot]) {
    const before = entries.map(entry => ({ id: effectId(entry), defines: lightDefines(entry) }));
    light.setEnabled(true);
    const dirtyAfterEnable = entries.map(entry => dirty(entry));
    scene.incrementRenderId();
    const immediateReady = entries.map(entry => ready(entry));
    await prepare();
    const rows = entries.map((entry, i) => ({
      name: entry.mesh.name, kind: entry.kind, far: entry.far, outsideRange: aabbDistance(entry.mesh) > light.range,
      canAffectMesh: light.canAffectMesh(entry.mesh), listed: entry.mesh.lightSources.includes(light), dirtyAfterEnable: dirtyAfterEnable[i],
      immediateReady: immediateReady[i], ready: ready(entry), effectChanged: effectId(entry) !== before[i].id,
      definesChanged: JSON.stringify(lightDefines(entry)) !== JSON.stringify(before[i].defines), defines: lightDefines(entry),
    }));
    const far = rows.filter(row => row.far);
    assert.equal(far.length, 16);
    assert.ok(far.every(row => row.outsideRange && row.canAffectMesh && row.listed && row.dirtyAfterEnable && row.definesChanged && row.effectChanged && row.ready));
    const enabledEffects = entries.map(effectId);
    const enabledDefines = entries.map(entry => JSON.stringify(lightDefines(entry)));
    light.intensity = 0;
    const dirtyAtZero = entries.filter(dirty).length;
    scene.incrementRenderId(); entries.forEach(ready);
    const zeroUnchanged = entries.every((entry, i) => effectId(entry) === enabledEffects[i] && JSON.stringify(lightDefines(entry)) === enabledDefines[i]);
    assert.equal(dirtyAtZero, 0); assert.equal(zeroUnchanged, true);
    assert.ok(entries.every(entry => entry.mesh.lightSources.includes(light)));
    light.setEnabled(false);
    const dirtyAfterDisable = entries.filter(dirty).length;
    await prepare();
    assert.equal(dirtyAfterDisable, entries.length);
    scenarios.push({ light: light.name, range: light.range, total: rows.length, far: far.length,
      farDirty: far.filter(row => row.dirtyAfterEnable).length, farDefinesChanged: far.filter(row => row.definesChanged).length,
      farEffectsChanged: far.filter(row => row.effectChanged).length, zeroIntensity: { dirty: dirtyAtZero, unchanged: zeroUnchanged, stillConsumesSlot: true },
      dirtyAfterDisable, reusedBaselineEffects: entries.filter((entry, i) => effectId(entry) === before[i].id).length, rows });
    light.intensity = 1;
  }
  // Comparison only in this tiny fixture: no production membership policy.
  point.includedOnlyMeshes = entries.filter(entry => aabbDistance(entry.mesh) <= point.range).map(entry => entry.mesh);
  await prepare();
  const beforeScoped = entries.map(effectId);
  point.setEnabled(true);
  const scopedDirty = entries.map(dirty);
  await prepare();
  const scoped = {
    included: point.includedOnlyMeshes.length,
    farDirty: entries.filter((entry, i) => entry.far && scopedDirty[i]).length,
    farEffectChanges: entries.filter((entry, i) => entry.far && effectId(entry) !== beforeScoped[i]).length,
    nearDirty: entries.filter((entry, i) => !entry.far && scopedDirty[i]).length,
  };
  assert.deepEqual(scoped, { included: 2, farDirty: 0, farEffectChanges: 0, nearDirty: 2 });
  const large = MeshBuilder.CreateBox('center outside, geometry intersects range', { width: 100, height: 2, depth: 2 }, scene);
  large.position.x = 50;
  const source = MeshBuilder.CreateBox('regular instance source far', { size: 2 }, scene); source.position.x = 100;
  const instance = source.createInstance('regular instance near'); instance.position.set(0, 0, 3);
  // Enable only the CPU bookkeeping API on NullEngine; no GPU support claim.
  engine.getCaps().instancedArrays = true;
  const thin = MeshBuilder.CreateBox('thin source translated100, instance translated-100', { size: 2 }, scene); thin.position.x = 100;
  thin.thinInstanceAdd(Matrix.Translation(-100, 0, 3)); thin.thinInstanceRefreshBoundingInfo(true);
  const shapeBounds = [large, source, instance, thin].map(bounds);
  assert.ok(shapeBounds[0].centerDistance > 24 && shapeBounds[0].aabbMinimumDistance < 12);
  assert.ok(shapeBounds[1].aabbMinimumDistance > 24 && shapeBounds[2].aabbMinimumDistance < 12);
  assert.ok(shapeBounds[3].aabbMinimumDistance < 12);
  const sources = [
    'Lights/light.js', 'Meshes/abstractMesh.pure.js', 'Materials/materialHelper.functions.js',
    'Materials/PBR/pbrBaseMaterial.pure.js', 'Materials/standardMaterial.pure.js',
    ...['Shaders', 'ShadersWGSL'].flatMap(prefix => ['lightFragment.js', 'lightsFragmentFunctions.js', 'pbrDirectLightingFalloffFunctions.js'].map(file => `${prefix}/ShadersInclude/${file}`)),
  ].map(path => { const bytes = readFileSync('node_modules/@babylonjs/core/' + path); return { path, sha256: createHash('sha256').update(bytes).digest('hex') }; });
  const report = { startedAtUTC, completedAtUTC: new Date().toISOString(), cpuWallMs: performance.now() - start,
    engine: 'Babylon9.30 NullEngine, actual PBR/Standard/Light/mesh readiness; no GPU compiler/device',
    scenarios, scopedMembershipFixture: scoped, bounds: shapeBounds, sources,
    limitations: 'Synthetic18-material fixture, not a count of production affected materials or GPU latency. Thin-instance capability enabled solely for actual CPU bounds bookkeeping on NullEngine. Bounds examples establish center-only unsafety, not a complete production culling proof. Runtime source/asset/dependencies unchanged.' };
  writeFileSync('report.json', JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
  console.log(JSON.stringify({ passed: true, startedAtUTC, completedAtUTC: report.completedAtUTC, cpuWallMs: report.cpuWallMs, scenarios: scenarios.map(({ rows, ...rest }) => rest), scoped, shapeBounds }));
} finally {
  scene.dispose(); engine.dispose();
  console.log(JSON.stringify({ finishedAtUTC: new Date().toISOString(), fixtureWallMs: performance.now() - start, processCpuMicroseconds: process.cpuUsage(cpuStart), scope: 'fixture work after module imports, cleanup included' }));
}
