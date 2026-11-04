import test from "node:test";
import assert from "node:assert/strict";
import { setImmediate } from "node:timers/promises";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { FreeCamera } from "@babylonjs/core/Cameras/freeCamera";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { MultiMaterial } from "@babylonjs/core/Materials/multiMaterial";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";
import { PointLight } from "@babylonjs/core/Lights/pointLight";
import { BindLights } from "@babylonjs/core/Materials/materialHelper.functions";
import type { Effect, IEffectCreationOptions } from "@babylonjs/core/Materials/effect";
import { StableLightState } from "../client/stable-light-state";
import { StartupMaterialReadiness } from "../client/startup-material-readiness";

function guard(scene: Scene, signal?: AbortSignal) {
  const engine = scene.getEngine() as unknown as { _isWebGPU: boolean }, before = engine._isWebGPU;
  engine._isWebGPU = true;
  try { return new StartupMaterialReadiness(scene, { signal }); }
  finally { engine._isWebGPU = before; }
}

async function fixture(kind: "standard" | "pbr", initial: "hemi" | "point" = "hemi") {
  const engine = new NullEngine();
  Object.defineProperty(engine, "supportsUniformBuffers", { value: true });
  const scene = new Scene(engine); scene.shadowsEnabled = false;
  new FreeCamera("camera", new Vector3(0, 2, -4), scene);
  const mesh = MeshBuilder.CreateBox("actual main receiver", {}, scene);
  const material = kind === "standard" ? new StandardMaterial(kind, scene) : new PBRMaterial(kind, scene);
  mesh.material = material;
  const hemi = new HemisphericLight("ambient", Vector3.Up(), scene);
  const point = new PointLight("point", Vector3.Zero(), scene);
  const sun = new DirectionalLight("sun", Vector3.Down(), scene);
  sun.renderPriority = 1; sun.setEnabled(false);
  if (initial === "hemi") point.setEnabled(false); else hemi.setEnabled(false);
  const stable = new StableLightState(scene); stable.update();
  await material.forceCompilationAsync(mesh);
  const sub = mesh.subMeshes[0];
  const ready = () => { scene.incrementRenderId(); return material.isReadyForSubMesh(mesh, sub, false); };
  assert.equal(ready(), true);
  const oldEffect = sub.effect!;
  let release!: () => void;
  const blocked = new Promise<void>(yes => { release = yes; });
  const originalCreate = engine.createEffect;
  engine.createEffect = function(this: NullEngine, shader, optionsOrAttributes, ...rest) {
    const options = optionsOrAttributes as IEffectCreationOptions;
    return Reflect.apply(originalCreate, this, [shader, { ...options,
      extraInitializationsAsync: async () => { await blocked; await options.extraInitializationsAsync?.(); },
    }, ...rest]);
  } as typeof engine.createEffect;
  const bindSizes = () => {
    const sizes = new Map<string, number>();
    BindLights(scene, mesh, { bindUniformBuffer(buffer: { capacity: number }, name: string) {
      sizes.set(name, buffer.capacity);
    } } as unknown as Effect, false, material.maxSimultaneousLights);
    return sizes;
  };
  const change = (next: "sun" | "point" = "sun") => {
    (next === "sun" ? sun : point).setEnabled(true); stable.update();
    assert.ok(sub.materialDefines);
    assert.equal(sub.materialDefines._areLightsDisposed, false, "addition + stable reorder is not native light disposal");
  };
  const settle = async () => { release(); for (let i = 0; i < 30; i++) { if (ready()) return; await setImmediate(); } assert.fail("new effect did not settle"); };
  return { engine, scene, mesh, material, sub, oldEffect, hemi, point, sun, ready, change, bindSizes, settle, release,
    dispose() { release(); engine.createEffect = originalCreate; stable.dispose(); scene.dispose(); engine.dispose(); } };
}

for (const kind of ["standard", "pbr"] as const) {
  test(`RED mechanism: actual ${kind} ready main effect keeps HEMI96 while current slot binds sun80`, async () => {
    const f = await fixture(kind);
    try {
      assert.match(f.oldEffect.defines, /#define HEMILIGHT0/); assert.equal(f.bindSizes().get("Light0"), 96);
      f.change();
      assert.equal(f.ready(), true); assert.equal(f.sub.effect, f.oldEffect);
      assert.match(f.sub.effect!.defines, /#define HEMILIGHT0/);
      assert.equal(f.bindSizes().get("Light0"), 80, "actual DirectionalLight UBO binding against old HEMI ABI");
    } finally { f.dispose(); }
  });
  test(`startup protection rejects actual ${kind} main draw while replacement is pending`, async () => {
    const f = await fixture(kind), lease = guard(f.scene);
    try {
      f.change();
      assert.equal(f.ready(), false, "pending replacement must not authorize a main draw with the old ABI");
      await f.settle(); assert.match(f.sub.effect!.defines, /#define DIRLIGHT0/);
    } finally { lease.dispose(); f.dispose(); }
  });
  test(`actual ${kind} POINT96 to DIR80 blocks until the real new effect is ready`, async () => {
    const f = await fixture(kind, "point"), lease = guard(f.scene);
    try {
      assert.match(f.oldEffect.defines, /#define POINTLIGHT0/); assert.equal(f.bindSizes().get("Light0"), 96);
      f.change(); assert.equal(f.ready(), false); assert.notEqual(f.sub.effect, f.oldEffect);
      await f.settle(); assert.match(f.sub.effect!.defines, /#define DIRLIGHT0/); assert.equal(f.bindSizes().get("Light0"), 80);
      assert.equal(f.material.allowShaderHotSwapping, true);
    } finally { lease.dispose(); f.dispose(); }
  });
  test(`actual frozen ${kind} dirty transition bypasses same-render shortcuts without unfreezing`, async () => {
    const f = await fixture(kind), lease = guard(f.scene);
    try {
      f.material.freeze(); assert.equal(f.ready(), true);
      const renderId = f.scene.getRenderId();
      // StableLightState deliberately never sorts a frozen owner's light list.
      // A genuine native removal/addition still changes its slot0 type.
      f.hemi.setEnabled(false); f.sun.setEnabled(true);
      assert.equal(f.material.isReadyForSubMesh(f.mesh, f.sub, false), false);
      assert.equal(f.scene.getRenderId(), renderId);
      assert.equal(f.material.isFrozen, true); assert.equal(f.material.allowShaderHotSwapping, true);
      assert.equal(f.material.checkReadyOnEveryCall, false);
      await f.settle(); assert.match(f.sub.effect!.defines, /#define DIRLIGHT0/); assert.equal(f.material.isFrozen, true);
    } finally { lease.dispose(); f.dispose(); }
  });
  test(`actual ${kind} same-size HEMI96 to POINT96 still requires the matching type`, async () => {
    const f = await fixture(kind), lease = guard(f.scene);
    try {
      assert.equal(f.bindSizes().get("Light0"), 96); f.change("point");
      assert.equal(f.ready(), false); assert.equal(f.bindSizes().get("Light0"), 96);
      await f.settle(); assert.match(f.sub.effect!.defines, /#define POINTLIGHT0/);
    } finally { lease.dispose(); f.dispose(); }
  });
}

test("call-scoped policy restores exceptions and preserves policy changes between calls", () => {
  const engine = new NullEngine(), scene = new Scene(engine), material = new StandardMaterial("policy", scene);
  const mesh = MeshBuilder.CreateBox("mesh", {}, scene), sub = mesh.subMeshes[0]; mesh.material = material;
  const failure = new Error("native readiness"); let mode = "throw", every: boolean[] = [];
  const native = function(this: StandardMaterial) {
    assert.equal(this.allowShaderHotSwapping, false); every.push(this.checkReadyOnEveryCall);
    if (mode === "throw") throw failure;
    if (mode === "external") this.allowShaderHotSwapping = true;
    return true;
  };
  material.isReadyForSubMesh = native;
  const lease = guard(scene);
  try {
    assert.throws(() => material.isReadyForSubMesh(mesh, sub, false), error => error === failure);
    assert.equal(material.allowShaderHotSwapping, true); assert.equal(material.checkReadyOnEveryCall, false);
    material.allowShaderHotSwapping = false; mode = "return"; material.isReadyForSubMesh(mesh, sub, false);
    assert.equal(material.allowShaderHotSwapping, false);
    mode = "external"; material.isReadyForSubMesh(mesh, sub, false); assert.equal(material.allowShaderHotSwapping, true);
    assert.deepEqual(every, [true, true, true]);
  } finally { lease.dispose(); assert.equal(material.isReadyForSubMesh, native); scene.dispose(); engine.dispose(); }
});

test("unchanged ready material retains its same-render cached native fast path", async () => {
  const f = await fixture("standard"); const seen: boolean[] = [];
  const native = f.material.isReadyForSubMesh;
  f.material.isReadyForSubMesh = function(...args) { seen.push(this.checkReadyOnEveryCall); return native.apply(this, args); };
  const lease = guard(f.scene);
  try {
    assert.equal(f.material.isReadyForSubMesh(f.mesh, f.sub, false), true);
    assert.deepEqual(seen, [false]);
    f.change(); assert.equal(f.material.isReadyForSubMesh(f.mesh, f.sub, false), false);
    assert.deepEqual(seen, [false, true]);
  } finally { lease.dispose(); f.dispose(); }
});

test("new same-task and container MultiMaterial children are covered before deferred added events", () => {
  const engine = new NullEngine(), scene = new Scene(engine), lease = guard(scene);
  try {
    const immediate = new StandardMaterial("same-task", scene);
    assert.equal(Object.hasOwn(immediate, "isReadyForSubMesh"), true);
    let child!: PBRMaterial;
    (scene as any)._blockEntityCollection = true;
    try { child = new PBRMaterial("container", scene); } finally { (scene as any)._blockEntityCollection = false; }
    assert.equal(scene.materials.includes(child), false);
    assert.equal(Object.hasOwn(child, "isReadyForSubMesh"), true, "synchronous add hook also covers blocked collection");
    const multi = new MultiMaterial("multi", scene); multi.subMaterials = [child, immediate];
    const mesh = MeshBuilder.CreateBox("receiver", {}, scene); mesh.material = multi;
    lease.prepareFrame(); child.dispose(); lease.prepareFrame();
    assert.equal(Object.hasOwn(child, "isReadyForSubMesh"), false, "disposed material hook released");
  } finally { lease.dispose(); scene.dispose(); engine.dispose(); }
});

test("authoritative mesh/Multi scan captures preexisting unregistered materials and preserves later ownership", () => {
  const engine = new NullEngine(), scene = new Scene(engine);
  const child = new StandardMaterial("detached shared", scene); scene.removeMaterial(child);
  const multi = new MultiMaterial("multi", scene); multi.subMaterials = [child];
  scene.removeMultiMaterial(multi);
  const mesh = MeshBuilder.CreateBox("receiver", {}, scene); mesh.material = multi;
  const native = child.isReadyForSubMesh, add = scene.addMaterial, lease = guard(scene);
  try {
    assert.notEqual(child.isReadyForSubMesh, native);
    assert.throws(() => guard(scene), /already has an owner/);
    const later = () => true; child.isReadyForSubMesh = later;
    assert.throws(() => lease.prepareFrame(), /ownership changed/);
    lease.dispose(); assert.equal(child.isReadyForSubMesh, later); assert.equal(scene.addMaterial, add);
  } finally { lease.dispose(); scene.dispose(); engine.dispose(); }
});

test("abort, scene disposal and inert WebGL leave no methods or persistent policy behind", () => {
  const engine = new NullEngine(), scene = new Scene(engine), material = new PBRMaterial("pbr", scene);
  const native = material.isReadyForSubMesh, add = scene.addMaterial;
  const inert = new StartupMaterialReadiness(scene); assert.equal(material.isReadyForSubMesh, native); inert.dispose();
  const signal = new AbortController(), lease = guard(scene, signal.signal);
  assert.notEqual(material.isReadyForSubMesh, native); signal.abort();
  assert.equal(material.isReadyForSubMesh, native); assert.equal(scene.addMaterial, add);
  assert.equal(material.allowShaderHotSwapping, true); assert.equal(material.checkReadyOnEveryCall, false);
  lease.dispose(); const next = guard(scene); scene.dispose(); assert.equal(scene.addMaterial, add); next.dispose(); engine.dispose();
});

test("real cleanup faults remain observable after safe lifecycle disposal", () => {
  for (const target of ["scene", "material"] as const) {
    const engine = new NullEngine(), scene = new Scene(engine), material = new StandardMaterial("owned", scene);
    const lease = guard(scene);
    try {
      if (target === "scene") Object.defineProperty(scene, "addMaterial", { value: scene.addMaterial, configurable: false, writable: false });
      else Object.defineProperty(material, "isReadyForSubMesh", { value: material.isReadyForSubMesh, configurable: false, writable: false });
      assert.doesNotThrow(() => lease.dispose(), "observer disposal does not throw into event dispatch");
      assert.throws(() => lease.assertHealthy(), /Cannot restore startup material method/);
      lease.dispose();
      assert.throws(() => lease.assertHealthy(), /Cannot restore startup material method/);
    } finally { scene.dispose(); engine.dispose(); }
  }
});
