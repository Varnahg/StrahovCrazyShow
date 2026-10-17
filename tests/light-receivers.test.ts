import test, { type TestContext } from "node:test";
import assert from "node:assert/strict";
import { setImmediate } from "node:timers/promises";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { FreeCamera } from "@babylonjs/core/Cameras/freeCamera";
import { Vector3, Matrix } from "@babylonjs/core/Maths/math.vector";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { Light } from "@babylonjs/core/Lights/light";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { MultiMaterial } from "@babylonjs/core/Materials/multiMaterial";
import { MaterialPluginBase } from "@babylonjs/core/Materials/materialPluginBase";
import { BoundingInfo } from "@babylonjs/core/Culling/boundingInfo";
import { Skeleton } from "@babylonjs/core/Bones/skeleton";
import { MorphTargetManager } from "@babylonjs/core/Morph/morphTargetManager";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import "@babylonjs/core/Meshes/thinInstanceMesh";
import "@babylonjs/core/Meshes/instancedMesh";
import { Animation } from "@babylonjs/core/Animations/animation";
import "@babylonjs/core/Animations/animatable";
import { AnimationGroup } from "@babylonjs/core/Animations/animationGroup";
import { TorchReceiverLight } from "../client/light-receivers";

function fixture(t: TestContext, kind: "standard" | "pbr" = "standard") {
  const engine = new NullEngine(), scene = new Scene(engine);
  new FreeCamera("observer", new Vector3(0, 2, -4), scene);
  const light = new TorchReceiverLight("local player · flashlight", Vector3.Zero(), Vector3.Forward(), 0.72, 64, scene);
  light.falloffType = Light.FALLOFF_STANDARD;
  light.range = 24;
  light.metadata = { localFlashlight: true };
  light.setEnabled(false);
  const ambient = new HemisphericLight("ambient", Vector3.Up(), scene);
  const material = kind === "pbr" ? new PBRMaterial("shared", scene) : new StandardMaterial("shared", scene);
  const mesh = (name: string, x: number, width = 1, updatable = false) => {
    const value = MeshBuilder.CreateBox(name, { width, height: 1, depth: 1, updatable }, scene);
    value.position.x = x; value.material = material; value.metadata = { artStatic: true };
    value.computeWorldMatrix(true);
    return value;
  };
  const near = mesh("near receiver", 10), far = mesh("far receiver", 100);
  const refresh = () => { light.refreshReceivers(); return light.takeChangedReceivers(); };
  t.after(() => { light.dispose(); scene.dispose(); engine.dispose(); });
  return { engine, scene, light, ambient, material, mesh, near, far, refresh };
}

test("range rejects only the entire known static receiver outside STANDARD24m", (t) => {
  const f = fixture(t);
  const edge = f.mesh("range edge", 24.5);
  const margin = f.mesh("numerical margin", 24.53);
  const outside = f.mesh("fully outside", 24.56);
  const large = f.mesh("large intersecting receiver", 70, 100);
  f.light.refreshReceivers();
  f.light.setEnabled(true);
  for (const kept of [f.near, edge, margin, large])
    assert.ok(kept.lightSources.includes(f.light), kept.name);
  for (const excluded of [f.far, outside])
    assert.ok(!excluded.lightSources.includes(f.light), excluded.name);
  assert.equal(f.light.getClassName(), "SpotLight");
  assert.equal(f.light.getTypeID(), 2);
  assert.equal(f.light.range, 24);
});

test("moving torch or static parent is reflected before the next draw without a timer", (t) => {
  const f = fixture(t), moving = f.mesh("moved static", 50);
  const parent = new TransformNode("parent", f.scene);
  moving.parent = parent;
  f.refresh(); f.light.setEnabled(true);
  assert.ok(!moving.lightSources.includes(f.light));
  f.light.position.x = 40;
  assert.ok(f.refresh().includes(moving));
  assert.ok(moving.lightSources.includes(f.light));
  parent.position.x = 100;
  assert.ok(f.refresh().includes(moving));
  assert.ok(!moving.lightSources.includes(f.light));
  // Nonuniform transformed bounds are checked as a world AABB, not an
  // underestimated sphere; no bounding-box center-only distance test.
  parent.scaling.set(6, 1, 1); parent.position.x = -250;
  f.refresh();
  assert.ok(moving.lightSources.includes(f.light));
});

test("unknown, mutable, frozen, deformed and instanced receivers keep native membership", (t) => {
  const f = fixture(t);
  const kept: Mesh[] = [];
  const dynamic = f.mesh("untagged", 100); dynamic.metadata = {}; kept.push(dynamic);
  const mutable = f.mesh("updatable geometry", 100, 1, true); kept.push(mutable);
  const wind = f.mesh("wind", 100); wind.metadata.windDeformed = true; kept.push(wind);
  const animated = f.mesh("animated", 100);
  animated.animations.push(new Animation("move", "position.x", 30, Animation.ANIMATIONTYPE_FLOAT)); kept.push(animated);
  const animatedChild = f.mesh("animated ancestor", 100); animatedChild.parent = animated; kept.push(animatedChild);
  const skeleton = f.mesh("skinned", 100); skeleton.skeleton = new Skeleton("rig", "rig", f.scene); kept.push(skeleton);
  const morph = f.mesh("morph", 100); morph.morphTargetManager = new MorphTargetManager(f.scene); kept.push(morph);
  const billboard = f.mesh("billboard", 100); billboard.billboardMode = 7; kept.push(billboard);
  const locked = f.mesh("locked bounds", 100); locked.getBoundingInfo().isLocked = true; kept.push(locked);
  const unsynced = f.mesh("unsynced bounds", 100); unsynced.doNotSyncBoundingInfo = true; kept.push(unsynced);
  const invalid = f.mesh("invalid bounds", 100);
  invalid.setBoundingInfo(new BoundingInfo(new Vector3(NaN, 0, 0), new Vector3(NaN, 1, 1))); kept.push(invalid);
  const instanced = f.mesh("instance source", 100); const instance = instanced.createInstance("regular instance"); kept.push(instanced);
  f.engine.getCaps().instancedArrays = true;
  const thin = f.mesh("thin source", 100); thin.thinInstanceAdd(Matrix.Identity());
  assert.ok(thin.hasThinInstances, "fixture creates an actual thin instance"); kept.push(thin);
  const frozen = f.mesh("frozen material", 100); frozen.material = new StandardMaterial("frozen", f.scene); frozen.material.freeze(); kept.push(frozen);
  const multi = f.mesh("multi material", 100); multi.material = new MultiMaterial("multi", f.scene); kept.push(multi);
  const custom = f.mesh("unknown shader resolver", 100); custom.material = new StandardMaterial("custom", f.scene);
  custom.material.customShaderNameResolve = (name) => name; kept.push(custom);
  const unknownPlugin = f.mesh("unknown plugin", 100); unknownPlugin.material = new PBRMaterial("plugin material", f.scene);
  new MaterialPluginBase(unknownPlugin.material, "UnknownVertexPolicy", 250, {}, true, true); kept.push(unknownPlugin);
  f.refresh(); f.light.setEnabled(true);
  for (const value of kept) assert.ok(value.lightSources.includes(f.light), value.name);
  assert.ok(instance.lightSources.includes(f.light), "regular instances share source membership");
  assert.ok(!f.far.lightSources.includes(f.light), "negative controls did not disable the safe branch");
});

test("later instance, frozen policy or unknown bounds readmit an earlier excluded source", (t) => {
  const f = fixture(t);
  f.refresh(); f.light.setEnabled(true);
  assert.ok(!f.far.lightSources.includes(f.light));
  const instance = f.far.createInstance("late instance");
  f.refresh();
  assert.ok(instance.lightSources.includes(f.light));
  instance.dispose(); f.refresh();
  assert.ok(!f.far.lightSources.includes(f.light));
  f.material.freeze(); f.refresh();
  assert.ok(f.far.lightSources.includes(f.light));
});

test("frozen world bounds follow the same retained transform as drawing and refresh after unfreeze", (t) => {
  const f = fixture(t);
  f.far.freezeWorldMatrix();
  f.refresh(); f.light.setEnabled(true);
  f.far.position.x = 1;
  f.refresh();
  assert.ok(!f.far.lightSources.includes(f.light), "a frozen transform still draws at the original far position");
  f.far.unfreezeWorldMatrix(); f.refresh();
  assert.ok(f.far.lightSources.includes(f.light));
});

test("registered direct animation and PBR debug material retain native membership", (t) => {
  const f = fixture(t, "pbr");
  const move = new Animation("move", "position.x", 30, Animation.ANIMATIONTYPE_FLOAT);
  move.setKeys([{ frame: 0, value: 100 }, { frame: 1, value: 1 }]);
  const animation = f.scene.beginDirectAnimation(f.far, [move], 0, 1, true);
  assert.ok(f.scene.getAnimatableByTarget(f.far) === animation && animation, "fixture registers a real animatable");
  assert.equal(f.far.animations.length, 0, "direct animation is not represented by node.animations");
  f.refresh(); f.light.setEnabled(true);
  assert.ok(f.far.lightSources.includes(f.light));
  animation.stop(); f.refresh();
  assert.ok(!f.far.lightSources.includes(f.light));
  const vectorMove = new Animation("vector move", "x", 30, Animation.ANIMATIONTYPE_FLOAT);
  vectorMove.setKeys([{ frame: 0, value: 100 }, { frame: 1, value: 1 }]);
  const group = new AnimationGroup("direct vector target", f.scene);
  group.addTargetedAnimation(vectorMove, f.far.position); group.start(true);
  assert.ok(f.scene.getAnimatableByTarget(f.far.position), "group animates the vector independently of its mesh");
  f.refresh(); assert.ok(f.far.lightSources.includes(f.light));
  assert.equal(Reflect.get(f.light, "animatedTargets").size, 0, "animation target scratch set retains no rigs between refreshes");
  group.stop(); group.dispose(); f.refresh();
  assert.ok(!f.far.lightSources.includes(f.light));
  (f.material as PBRMaterial).debugMode = 20; f.refresh();
  assert.ok(f.far.lightSources.includes(f.light));
});

test("counterfactual material and device caps prevent promoting an omitted other light", (t) => {
  const f = fixture(t);
  f.material.maxSimultaneousLights = 1;
  f.refresh(); f.light.setEnabled(true);
  assert.ok(f.far.lightSources.includes(f.light));
  f.material.maxSimultaneousLights = 4; f.refresh();
  assert.ok(!f.far.lightSources.includes(f.light));
  f.material.maxSimultaneousLights = 1; f.refresh();
  assert.ok(f.far.lightSources.includes(f.light), "cap shrink restores original membership");
  f.material.maxSimultaneousLights = 8;
  f.engine.getCaps().maxUniformBuffersPerShaderStage = 5; f.refresh();
  assert.ok(f.far.lightSources.includes(f.light), "one supported light is a truncated counterfactual");
  f.engine.getCaps().maxUniformBuffersPerShaderStage = 12; f.refresh();
  assert.ok(!f.far.lightSources.includes(f.light));
  f.material.maxSimultaneousLights = NaN; f.refresh();
  assert.ok(f.far.lightSources.includes(f.light));
});

test("caller inclusions exclusions and layer masks retain their identity and precedence", (t) => {
  const f = fixture(t);
  const excluded = [f.near], included = [f.near, f.far];
  f.light.excludedMeshes = excluded; f.light.includedOnlyMeshes = included;
  const push = excluded.push, splice = excluded.splice;
  f.refresh(); f.light.setEnabled(true);
  assert.ok(!f.near.lightSources.includes(f.light));
  assert.ok(!f.far.lightSources.includes(f.light));
  excluded.push(f.far);
  f.light.position.x = 100; f.refresh();
  assert.ok(!f.far.lightSources.includes(f.light), "caller exclusion survives our readmission");
  excluded.splice(excluded.indexOf(f.far), 1); f.refresh();
  assert.ok(f.far.lightSources.includes(f.light));
  f.light.includeOnlyWithLayerMask = 2; f.far.layerMask = 1; f.refresh();
  assert.ok(!f.far.lightSources.includes(f.light));
  f.light.includeOnlyWithLayerMask = 0; f.light.excludeWithLayerMask = 1; f.refresh();
  assert.ok(!f.far.lightSources.includes(f.light));
  assert.equal(f.light.excludedMeshes, excluded); assert.equal(f.light.includedOnlyMeshes, included);
  assert.equal(excluded.push, push); assert.equal(excluded.splice, splice);
  assert.equal(excluded.length, 1);
  assert.ok(excluded[0] === f.near);
});

test("detach, new topology and disposal release only owned membership and references", (t) => {
  const f = fixture(t);
  f.light.refreshReceivers();
  const first = f.light.takeChangedReceivers();
  assert.ok(first.includes(f.far));
  assert.equal(f.light.takeChangedReceivers(), first, "changed output buffer is reused");
  assert.equal(first.length, 0);
  f.light.setEnabled(true);
  f.scene.removeMesh(f.far);
  assert.equal(f.light.canAffectMesh(f.far), true, "detached receiver no longer remains in our set");
  f.far.position.x = 1; f.scene.addMesh(f.far); f.refresh();
  assert.ok(f.far.lightSources.includes(f.light));
  const late = f.mesh("late static", 200); f.refresh();
  assert.ok(!late.lightSources.includes(f.light));
  late.dispose();
  assert.equal(f.light.canAffectMesh(late), true, "disposed receiver reference was released");
  const foreign = f.light.excludedMeshes;
  f.light.dispose(); f.light.dispose(); f.refresh();
  assert.equal(f.light.excludedMeshes, foreign);
  assert.ok(!f.near.lightSources.includes(f.light));
  assert.ok(!f.scene.lights.includes(f.light));
  assert.equal(f.light.takeChangedReceivers().length, 0);
});

test("unproved light configuration removes the local optimization without changing native light policy", (t) => {
  const f = fixture(t);
  f.refresh(); f.light.setEnabled(true);
  f.light.falloffType = Light.FALLOFF_PHYSICAL; f.refresh();
  assert.ok(f.far.lightSources.includes(f.light));
  f.light.falloffType = Light.FALLOFF_STANDARD; f.light.range = 30; f.refresh();
  assert.ok(f.far.lightSources.includes(f.light));
  f.light.range = 24; f.refresh();
  assert.ok(!f.far.lightSources.includes(f.light));
  f.light.lightmapMode = Light.LIGHTMAP_SHADOWSONLY; f.refresh();
  assert.ok(f.far.lightSources.includes(f.light), "shadow-only lightmap is not a zero-contribution proof");
  f.light.lightmapMode = Light.LIGHTMAP_DEFAULT; f.refresh();
  assert.ok(!f.far.lightSources.includes(f.light));
  f.light.parent = new TransformNode("unexpected light parent", f.scene); f.refresh();
  assert.ok(f.far.lightSources.includes(f.light));
});

for (const kind of ["standard", "pbr"] as const)
  test(`actual shared ${kind} keeps the far Effect when torch toggles but prepares the near SPOT variant`, async (t) => {
    const f = fixture(t, kind);
    await f.material.forceCompilationAsync(f.far);
    await f.material.forceCompilationAsync(f.near);
    const ready = async (mesh: Mesh) => {
      for (let i = 0; i < 30; i++) {
        f.scene.incrementRenderId();
        if (f.material.isReadyForSubMesh(mesh, mesh.subMeshes![0], false) && mesh.subMeshes![0].effect?.isReady()) return;
        await setImmediate();
      }
      assert.fail("actual material did not become ready");
    };
    await ready(f.far); await ready(f.near);
    const beforeFar = f.far.subMeshes![0].effect!, beforeNear = f.near.subMeshes![0].effect!;
    f.refresh(); f.light.setEnabled(true);
    await ready(f.far); await ready(f.near);
    // A hot-swap may report its old effect while the requested one is pending.
    for (let i = 0; i < 30 && f.near.subMeshes![0].effect === beforeNear; i++) {
      await setImmediate(); await ready(f.near);
    }
    assert.ok(f.far.subMeshes![0].effect === beforeFar, "far Effect must retain identity");
    assert.ok(f.near.subMeshes![0].effect !== beforeNear, "near Effect must change for SPOTLIGHT");
    assert.doesNotMatch(f.far.subMeshes![0].effect!.defines, /#define SPOTLIGHT/);
    assert.match(f.near.subMeshes![0].effect!.defines, /#define SPOTLIGHT/);
    f.light.setEnabled(false); f.refresh(); await ready(f.far);
    assert.ok(f.far.subMeshes![0].effect === beforeFar, "OFF retains the far Effect");
    f.light.setEnabled(true); f.material.freeze(); f.refresh();
    for (let i = 0; i < 30; i++) {
      await ready(f.far);
      if (/#define SPOTLIGHT/.test(f.far.subMeshes![0].effect!.defines)) break;
      await setImmediate();
    }
    assert.ok(f.far.lightSources.includes(f.light));
    assert.match(f.far.subMeshes![0].effect!.defines, /#define SPOTLIGHT/,
      "freeze before final gate restores native membership and an actual ready variant");
  });
