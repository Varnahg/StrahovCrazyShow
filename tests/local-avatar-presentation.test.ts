import test from "node:test";
import assert from "node:assert/strict";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { UniversalCamera } from "@babylonjs/core/Cameras/universalCamera";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Game } from "../client/game";
import {
  LocalAvatarPresentation,
  type LocalAvatarView,
} from "../client/local-avatar-presentation";
import {
  AvatarPrimitivePool,
  createAvatarRig,
} from "../client/avatar-renderer";
import { AvatarLodController } from "../client/avatar-lod";
import { AvatarAnimator } from "../client/animation";
import { applyAvatarPreset } from "../client/avatar-presets";
import { PlayerFlashlight } from "../client/flashlight";
import { DEFAULT_AVATAR } from "../shared/types";
import { Simulation, initPhysics } from "../shared/simulation";
import { stepRigidWorld } from "../shared/physics-step";
import { movementFromKeys } from "../shared/controls";
import { SPAWN } from "../shared/world";

const view = (distance: number): LocalAvatarView => ({
  camera: { x: 0, y: 1.5, z: distance },
  feet: { x: 0, y: 0, z: 0 },
  bodyHeight: 1.8,
  bodyWidthScale: 1,
  nearPlane: 0.08,
  firstPerson: false,
  vehicle: false,
});

test("body envelope covers every azimuth and near plane, with stable exit hysteresis", () => {
  for (const angle of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
    const presentation = new LocalAvatarPresentation();
    const input = view(0);
    input.camera.x = Math.sin(angle) * 0.62;
    input.camera.z = Math.cos(angle) * 0.62;
    const state = presentation.update(input);
    assert.equal(state.visible, false);
    assert.equal(state.cameraLight, true);
    for (let i = 0; i < 60; i++) {
      assert.equal(presentation.update(view(i % 2 ? 0.64 : 0.84)), state);
      assert.equal(state.visible, false);
      assert.equal(state.resetAnimation, false);
    }
    assert.equal(presentation.update(view(0.9)).visible, true);
    assert.equal(state.resetAnimation, true);
    presentation.update(view(0.9));
    assert.equal(state.resetAnimation, false);
  }
  // Distance is to the body, not just horizontal distance: an overhead view
  // remains visible; a lens intersecting the head does not.
  const presentation = new LocalAvatarPresentation();
  assert.equal(
    presentation.update({ ...view(0), camera: { x: 0, y: 3, z: 0 } }).visible,
    true,
  );
  assert.equal(
    presentation.update({ ...view(0), camera: { x: 0, y: 1.9, z: 0 } }).visible,
    false,
  );
});

function sceneFixture(t: import("node:test").TestContext) {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  scene.useRightHandedSystem = true;
  const camera = new UniversalCamera(
    "actual camera",
    new Vector3(SPAWN.x, SPAWN.y + 3, SPAWN.z + 8),
    scene,
  );
  camera.minZ = 0.08;
  t.after(() => {
    scene.dispose();
    engine.dispose();
  });
  return { scene, camera };
}

test("real KCC parked-car obstruction preserves the collision-safe camera and restores the avatar after retreat", async (t) => {
  await initPhysics();
  const sim = new Simulation();
  t.after(() => sim.dispose());
  const actor = sim.add("camera-proof");
  const { camera, scene } = sceneFixture(t);
  const baseline = new UniversalCamera(
    "pre-fix camera",
    camera.position.clone(),
    scene,
  );
  const game = Object.assign(Object.create(Game.prototype), {
    sim,
    actor,
    camera,
    cameraArm: 8,
    firstPerson: false,
    yaw: Math.PI,
    pitch: 0.28,
    distance: 8,
    vehicleCameraSnap: false,
  });
  const presentation = new LocalAvatarPresentation();
  let baselineArm = 8,
    transitions = 0,
    wasVisible = true;
  for (let tick = 0; tick < 555; tick++) {
    // Match Game's alpha=0 rendered position: previous physics position, then
    // current physics flags. No teleport or direct manipulation of the car.
    const previous = { ...actor.position };
    actor.step({
      seq: tick + 1,
      ...movementFromKeys(tick < 45 ? 0 : tick < 315 ? -1 : 1, 0, Math.PI),
      yaw: Math.PI,
      jump: false,
      run: false,
    });
    stepRigidWorld(sim.world);
    const position = new Vector3(previous.x, previous.y, previous.z);
    const carBefore = sim.car.capture();
    const actorBefore = { ...actor.position };
    game.updateCameraFollow(position, 1.63, 1 / 60);
    // Independent frozen pre-fix follow equations, including Babylon setTarget.
    const target = position.add(new Vector3(0, 0.6, 0));
    let desired = target.add(
      new Vector3(-Math.sin(Math.PI) * 8, 3.12, -Math.cos(Math.PI) * 8),
    );
    const direction = desired.subtract(target).normalize();
    const length = sim.cameraDistance(target, desired, actor);
    baselineArm =
      length < baselineArm
        ? length
        : baselineArm + (length - baselineArm) * (1 - Math.exp(-5 / 60));
    desired = target.add(direction.scale(baselineArm));
    baseline.position = Vector3.Lerp(
      baseline.position,
      desired,
      1 - Math.exp(-12 / 60),
    );
    const safe = sim.cameraDistance(target, baseline.position, actor);
    const delta = baseline.position.subtract(target);
    if (safe < delta.length() - 0.005)
      baseline.position = target.add(delta.normalize().scale(safe));
    baseline.setTarget(target);
    assert.ok(Vector3.Distance(camera.position, baseline.position) < 1e-10);
    assert.deepEqual(sim.car.capture(), carBefore);
    assert.deepEqual({ ...actor.position }, actorBefore);
    assert.equal(game.firstPerson, false);
    assert.equal(game.footFirstPerson, false);
    assert.ok(
      sim.cameraDistance(target, camera.position, actor) >=
        Vector3.Distance(target, camera.position) - 0.0051,
    );
    const state = presentation.update({
      ...view(0),
      camera: camera.position,
      feet: position.add(new Vector3(0, -0.8, 0)),
    });
    if (state.visible !== wasVisible) transitions++;
    wasVisible = state.visible;
    if (tick === 314) {
      assert.ok(Math.abs(actor.position.x - 110.071907) < 0.01);
      assert.ok(Math.abs(actor.position.z - 13.786036) < 0.01);
      assert.ok(Vector3.Distance(camera.position, target) < 0.22);
      assert.equal(
        state.visible,
        false,
        "legacy Game would still show the torso here",
      );
      assert.equal(state.cameraLight, true);
    }
  }
  assert.equal(wasVisible, true);
  assert.equal(
    transitions,
    2,
    "one hide entering obstruction, one reveal after retreat",
  );
});

test("native local LOD removes and restores every preset once, with no hidden-frame candidate churn", (t) => {
  const { scene, camera } = sceneFixture(t);
  const pool = new AvatarPrimitivePool(scene);
  t.after(() => pool.dispose());
  for (let preset = 0; preset < 6; preset++) {
    const config = applyAvatarPreset(preset, DEFAULT_AVATAR);
    const rig = createAvatarRig(scene, config, pool);
    const lod = new AvatarLodController(scene, pool, rig, config);
    const animation = new AvatarAnimator(rig);
    const avatar = Object.assign(rig, {
      lod,
      animation,
      target: { yaw: 0, emote: "", vehicle: false },
    });
    let resets = 0;
    const originalReset = animation.reset.bind(animation);
    animation.reset = () => {
      resets++;
      originalReset();
    };
    let enabledChanges = 0,
      additions = 0,
      removals = 0;
    rig.root.onEnabledStateChangedObservable.add(() => enabledChanges++);
    const add = scene.onNewMeshAddedObservable.add(() => additions++);
    const remove = scene.onMeshRemovedObservable.add(() => removals++);
    let shadowVisible = false;
    const game = Object.assign(Object.create(Game.prototype), {
      localId: "self",
      camera,
      quality: "medium",
      flashlightOn: false,
      actor: { grounded: true },
      sim: { floorHeight: () => 0 },
      contactShadows: {
        set(...args: unknown[]) {
          shadowVisible = args.at(-1) as boolean;
        },
      },
    });
    const presentation = new LocalAvatarPresentation();
    const apply = (distance: number) => {
      camera.position.set(0, 1.5, distance);
      const state = presentation.update({
        ...view(distance),
        bodyHeight: rig.bodyHeight,
        bodyWidthScale: rig.measurements.legSpacing / 0.105,
      });
      game.updateAvatarPresentation(
        "self",
        avatar,
        Vector3.Zero(),
        1 / 60,
        state.visible,
        state.resetAnimation,
      );
      return state;
    };
    apply(4);
    const initial = scene.meshes.filter((mesh) =>
      mesh.isDescendantOf(rig.root),
    );
    assert.ok(initial.length > 0);
    apply(0.2);
    assert.equal(shadowVisible, false);
    assert.equal(rig.root.isEnabled(), false);
    const hiddenCounts = [enabledChanges, additions, removals];
    for (let tick = 0; tick < 120; tick++) apply(0.2);
    assert.deepEqual([enabledChanges, additions, removals], hiddenCounts);
    assert.equal(resets, 0);
    assert.equal(
      scene.meshes.filter((mesh) => mesh.isDescendantOf(rig.root)).length,
      0,
    );
    assert.equal(apply(4).resetAnimation, true);
    assert.equal(resets, 1);
    assert.equal(shadowVisible, true);
    assert.equal(enabledChanges, 2);
    assert.deepEqual(
      new Set(scene.meshes.filter((mesh) => mesh.isDescendantOf(rig.root))),
      new Set(initial),
    );
    apply(4);
    assert.equal(resets, 1);
    scene.onNewMeshAddedObservable.remove(add);
    scene.onMeshRemovedObservable.remove(remove);
    rig.root.dispose();
  }
});

test("obstruction uses existing camera flashlight while saved first-person and vehicle modes remain independent", (t) => {
  const { scene, camera } = sceneFixture(t);
  const pool = new AvatarPrimitivePool(scene);
  const rig = createAvatarRig(
    scene,
    applyAvatarPreset(0, DEFAULT_AVATAR),
    pool,
  );
  const torch = new PlayerFlashlight(scene);
  t.after(() => {
    torch.dispose();
    rig.root.dispose();
    pool.dispose();
  });
  const presentation = new LocalAvatarPresentation();
  torch.update(rig, camera, true, false, "low");
  const body = scene.getMeshByName("torch casing")!;
  const input = view(0.2);
  let state = presentation.update(input);
  rig.root.setEnabled(state.visible);
  torch.update(rig, camera, true, state.cameraLight, "low");
  assert.equal(input.firstPerson, false);
  assert.equal(body.isEnabled(false), false);
  assert.equal(torch.beam.light.isEnabled(), true);
  assert.ok(Vector3.Distance(torch.beam.light.position, camera.position) < 0.3);
  state = presentation.update({ ...view(4), vehicle: true, firstPerson: true });
  assert.equal(state.visible, false);
  assert.equal(state.cameraLight, false);
  torch.update(rig, camera, false, state.cameraLight, "low");
  assert.equal(torch.beam.light.isEnabled(), false);
  state = presentation.update({ ...view(4), firstPerson: true });
  assert.equal(state.visible, false);
  assert.equal(state.cameraLight, true);
  state = presentation.update(view(4));
  rig.root.setEnabled(state.visible);
  torch.update(rig, camera, true, state.cameraLight, "low");
  assert.equal(body.isEnabled(), true);
  assert.equal(state.resetAnimation, true);
});
