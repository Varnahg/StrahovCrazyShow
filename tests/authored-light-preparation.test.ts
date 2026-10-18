import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { FreeCamera } from "@babylonjs/core/Cameras/freeCamera";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder";
import "@babylonjs/core/Meshes/instancedMesh";
import "@babylonjs/core/Meshes/thinInstanceMesh";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { MultiMaterial } from "@babylonjs/core/Materials/multiMaterial";
import type { Material } from "@babylonjs/core/Materials/material";
import { Skeleton } from "@babylonjs/core/Bones/skeleton";
import { MorphTargetManager } from "@babylonjs/core/Morph/morphTargetManager";
import { BakedVertexAnimationManager } from "@babylonjs/core/BakedVertexAnimation/bakedVertexAnimationManager";
import { PointLight } from "@babylonjs/core/Lights/pointLight";
import { VertexBuffer } from "@babylonjs/core/Buffers/buffer";
import { AuthoredLightPreparation } from "../client/authored-light-preparation";

function fixture(t: TestContext) {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  const camera = new FreeCamera("camera", new Vector3(0, 1, -5), scene);
  scene.activeCamera = camera;
  const helpers: AuthoredLightPreparation[] = [];
  const glass = new StandardMaterial("arbitrary label", scene);
  glass.metadata = { exteriorOnlyGlass: true };
  const outdoor = new PBRMaterial("unrelated label", scene);
  outdoor.metadata = { sourcePack: "outdoor-artifacts" };
  const box = (material: Material = glass, pack = "architecture-reality") => {
    const mesh = CreateBox("unrelated mesh label", {}, scene);
    mesh.material = material;
    mesh.metadata = { sourcePack: pack };
    mesh.computeWorldMatrix(true);
    return mesh;
  };
  const helper = () => {
    const value = new AuthoredLightPreparation(scene);
    helpers.push(value);
    return value;
  };
  t.after(() => {
    try { for (const value of helpers) value.dispose(); }
    finally { scene.dispose(); engine.dispose(); }
  });
  return { engine, scene, camera, glass, outdoor, box, helper };
}

test("selection uses real source/material metadata and leaves resources and unrelated flags intact", t => {
  const f = fixture(t), glass = f.box(), outdoor = f.box(f.outdoor, "outdoor-artifacts");
  const unrelated = f.box(); unrelated.metadata = { sourcePack: "elsewhere" };
  const transparent = new StandardMaterial("reality glass 0 0", f.scene);
  transparent.metadata = { block: 6, exteriorOnlyGlass: false };
  const roomGlass = f.box(transparent);
  const wrongOutdoor = f.box(f.glass, "outdoor-artifacts");
  const resources = [f.scene.meshes.length, f.scene.materials.length, f.scene.geometries.length];
  const helper = f.helper(), stop = helper.begin();
  assert.equal(helper.selection.selected, 2);
  assert.equal(glass.alwaysSelectAsActiveMesh, true);
  assert.equal(outdoor.alwaysSelectAsActiveMesh, true);
  for (const mesh of [unrelated, roomGlass, wrongOutdoor]) assert.equal(mesh.alwaysSelectAsActiveMesh, false);
  assert.deepEqual([f.scene.meshes.length, f.scene.materials.length, f.scene.geometries.length], resources);
  stop();
  assert.equal(glass.alwaysSelectAsActiveMesh, false);
  assert.equal(outdoor.alwaysSelectAsActiveMesh, false);
});

test("camera-masked and degenerate candidates cannot hide a drawable representative", t => {
  const f = fixture(t);
  const masked = f.box(); masked.layerMask = 0;
  const zero = f.box(); zero.scaling.x = 0; zero.computeWorldMatrix(true);
  const drawable = f.box();
  const helper = f.helper(), stop = helper.begin();
  assert.equal(drawable.alwaysSelectAsActiveMesh, true);
  assert.equal(masked.alwaysSelectAsActiveMesh, false);
  assert.equal(zero.alwaysSelectAsActiveMesh, false);
  assert.equal(helper.selection.selected, 1);
  stop();
});

test("disabled, invisible and parent-disabled objects are never activated", t => {
  const f = fixture(t), disabled = f.box(), hidden = f.box(), transparent = f.box(), child = f.box();
  disabled.setEnabled(false); hidden.isVisible = false; transparent.visibility = 0;
  child.parent = disabled;
  const helper = f.helper(); helper.begin();
  assert.equal(helper.selection.selected, 0);
  for (const mesh of [disabled, hidden, transparent, child]) assert.equal(mesh.alwaysSelectAsActiveMesh, false);
  assert.equal(disabled.isEnabled(), false);
});

test("deduplication keeps material identities, vertex attributes and shadow inputs distinct", t => {
  const f = fixture(t), first = f.box(), duplicate = f.box(), colors = f.box(), shadow = f.box(), other = f.box();
  colors.setVerticesData("color", new Float32Array(colors.getTotalVertices() * 4).fill(1), false, 4);
  shadow.receiveShadows = true;
  other.material = f.glass.clone("same response, independent owner");
  const helper = f.helper(), stop = helper.begin();
  assert.equal(helper.selection.selected, 4);
  for (const mesh of [first, colors, shadow, other]) assert.equal(mesh.alwaysSelectAsActiveMesh, true);
  assert.equal(duplicate.alwaysSelectAsActiveMesh, false);
  stop();
});

test("same material/layout with distinct actual light membership is not collapsed", t => {
  const f = fixture(t), first = f.box(), second = f.box();
  const point = new PointLight("one receiver only", new Vector3(0, 3, 0), f.scene);
  point.includedOnlyMeshes = [first];
  assert.ok(first.lightSources.includes(point));
  assert.ok(!second.lightSources.includes(point));
  const helper = f.helper(), stop = helper.begin();
  assert.equal(helper.selection.selected, 2);
  assert.equal(first.alwaysSelectAsActiveMesh, true);
  assert.equal(second.alwaysSelectAsActiveMesh, true);
  stop();
});

test("real regular/thin instances and instanced vertex attributes are explicitly unsupported", t => {
  const f = fixture(t), source = f.box(), thin = f.box(), attribute = f.box();
  f.engine.getCaps().instancedArrays = true;
  const instance = source.createInstance("instance"); instance.metadata = { sourcePack: "architecture-reality" };
  thin.thinInstanceAddSelf(false);
  attribute.setVerticesBuffer(new VertexBuffer(f.engine, new Float32Array([1, 2, 3, 4]), "customInstance", false, false, 4, true));
  const helper = f.helper(); helper.begin();
  assert.equal(helper.selection.selected, 0);
  assert.ok(helper.selection.unsupported >= 3);
  for (const mesh of [source, thin, attribute, instance]) assert.equal(mesh.alwaysSelectAsActiveMesh, false);
});

test("skinned, morph and baked-animation meshes remain explicitly outside the scope", t => {
  const f = fixture(t), skinned = f.box(), morph = f.box(), baked = f.box();
  skinned.skeleton = new Skeleton("skeleton", "skeleton", f.scene);
  morph.morphTargetManager = new MorphTargetManager(f.scene);
  baked.bakedVertexAnimationManager = new BakedVertexAnimationManager(f.scene);
  const helper = f.helper(); helper.begin();
  assert.equal(helper.selection.selected, 0);
  assert.equal(helper.selection.unsupported, 3);
});

test("the active camera render-pass material controls eligibility", t => {
  const f = fixture(t), excluded = f.box(), included = f.box();
  const unrelated = new StandardMaterial("unrelated", f.scene);
  excluded.setMaterialForRenderPass(f.camera.renderPassId, unrelated);
  included.material = unrelated;
  included.setMaterialForRenderPass(f.camera.renderPassId, f.glass);
  const helper = f.helper(), release = helper.begin();
  assert.equal(helper.selection.selected, 1);
  assert.equal(excluded.alwaysSelectAsActiveMesh, false);
  assert.equal(included.alwaysSelectAsActiveMesh, true);
  release();
});

test("missing geometry and MultiMaterial are not advertised as covered", t => {
  const f = fixture(t), empty = new Mesh("empty", f.scene), multi = f.box();
  empty.material = f.glass; empty.metadata = { sourcePack: "architecture-reality" };
  multi.material = new MultiMaterial("container", f.scene);
  const helper = f.helper(); helper.begin();
  assert.equal(helper.selection.selected, 0);
  assert.equal(helper.selection.unsupported, 1);
  assert.equal(empty.alwaysSelectAsActiveMesh, false);
});

test("prior true flags and external false writes survive release and repeated disposal", t => {
  const f = fixture(t), prior = f.box(), owned = f.box(); owned.receiveShadows = true;
  prior.alwaysSelectAsActiveMesh = true;
  const helper = f.helper(), stop = helper.begin();
  owned.alwaysSelectAsActiveMesh = false;
  stop(); stop(); helper.dispose(); helper.dispose();
  assert.equal(prior.alwaysSelectAsActiveMesh, true);
  assert.equal(owned.alwaysSelectAsActiveMesh, false);
  helper.begin();
  assert.equal(owned.alwaysSelectAsActiveMesh, false);
});

test("a stale release cannot disable a newer activation of the same helper", t => {
  const f = fixture(t), mesh = f.box(), helper = f.helper();
  const old = helper.begin(), latest = helper.begin();
  old(); assert.equal(mesh.alwaysSelectAsActiveMesh, true);
  latest(); assert.equal(mesh.alwaysSelectAsActiveMesh, false);
});

test("LOD and same-count replacement are selected anew without touching disposed predecessors", t => {
  const f = fixture(t), oldMesh = f.box(), next = f.box(), helper = f.helper();
  next.setEnabled(false);
  const first = helper.begin(); assert.equal(oldMesh.alwaysSelectAsActiveMesh, true);
  oldMesh.setEnabled(false); next.setEnabled(true);
  const second = helper.begin();
  assert.equal(oldMesh.alwaysSelectAsActiveMesh, false);
  assert.equal(next.alwaysSelectAsActiveMesh, true);
  oldMesh.dispose(); const replacement = f.box(); replacement.receiveShadows = true;
  first(); assert.equal(next.alwaysSelectAsActiveMesh, true); assert.equal(replacement.alwaysSelectAsActiveMesh, false);
  second(); const third = helper.begin();
  assert.equal(replacement.alwaysSelectAsActiveMesh, true);
  third(); assert.equal(replacement.alwaysSelectAsActiveMesh, false);
});

test("partial selection failure rolls back earlier flags and preserves the original exception", t => {
  const f = fixture(t), first = f.box(), failing = f.box(), helper = f.helper();
  const failure = new Error("inspection failed");
  const getKinds = failing.getVerticesDataKinds;
  failing.getVerticesDataKinds = () => { throw failure; };
  assert.throws(() => helper.begin(), error => error === failure);
  assert.equal(first.alwaysSelectAsActiveMesh, false);
  failing.getVerticesDataKinds = getKinds;
  const release = helper.begin(); assert.equal(first.alwaysSelectAsActiveMesh, true); release();
});

test("cleanup continues after one flag setter fails and retains its exact exception", t => {
  const f = fixture(t), first = f.box(), second = f.box(); second.receiveShadows = true;
  const helper = f.helper(), release = helper.begin(), failure = new Error("restore failed");
  Object.defineProperty(first, "alwaysSelectAsActiveMesh", { configurable: true, get: () => true, set() { throw failure; } });
  assert.throws(release, error => error === failure);
  assert.equal(second.alwaysSelectAsActiveMesh, false);
  Object.defineProperty(first, "alwaysSelectAsActiveMesh", { configurable: true, writable: true, value: false });
  helper.dispose();
});

test("scene disposal during a lease is safe and releases the helper lifecycle", t => {
  const f = fixture(t), mesh = f.box(), helper = f.helper(), release = helper.begin();
  f.scene.dispose();
  assert.equal(mesh.isDisposed(), true);
  assert.doesNotThrow(release);
  assert.doesNotThrow(() => helper.dispose());
});
