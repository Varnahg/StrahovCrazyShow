import test from "node:test";
import assert from "node:assert/strict";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { InstancedMesh } from "@babylonjs/core/Meshes/instancedMesh";
import "@babylonjs/core/Meshes/instancedMesh";
import { createCarWheelUpdater } from "../client/assets";
import { ContactShadows } from "../client/contact-shadows";
import { writeQuaternion, writeVector3 } from "../client/transform-updates";
import { VEHICLE_WHEELS, type VehicleState } from "../shared/vehicle";
import { groundHeight } from "../shared/terrain";
import { groundRotation } from "../shared/terrain-entities";

function fixture() {
  const engine = new NullEngine(),
    scene = new Scene(engine);
  return {
    engine,
    scene,
    dispose() {
      scene.dispose();
      engine.dispose();
    },
  };
}
function evaluate(scene: Scene) {
  scene.incrementRenderId();
  // Real Babylon lazy world/bounds path, without shaders or GPU rendering.
  for (const mesh of scene.meshes)
    if (mesh.isEnabled()) mesh.computeWorldMatrix();
}
function snapshot(scene: Scene) {
  return scene.meshes
    .filter((mesh) => mesh.isEnabled())
    .map((mesh) => ({
      name: mesh.name,
      world: Array.from(mesh.getWorldMatrix().asArray()),
      min: mesh.getBoundingInfo().boundingBox.minimumWorld.asArray(),
      max: mesh.getBoundingInfo().boundingBox.maximumWorld.asArray(),
    }));
}
function state(): VehicleState {
  const position = { x: 110, y: 1.2, z: 12 };
  const rotation = Quaternion.RotationYawPitchRoll(0.3, 0.08, -0.1);
  return {
    id: "test car",
    driverId: null,
    parked: true,
    position,
    rotation,
    parking: { position: { ...position }, rotation: rotation.clone() },
    linvel: { x: 0, y: 0, z: 0 },
    angvel: { x: 0, y: 0, z: 0 },
    steering: 0,
    wheelSpin: [0, 0, 0, 0],
    wheelSuspension: [0.2, 0.3, 0.4, 0.5],
    wheelContact: [false, false, false, false],
    force: { x: 0, y: 0, z: 0 },
    torque: { x: 0, y: 0, z: 0 },
    sleeping: true,
  };
}
function rig(scene: Scene, name: string) {
  const root = new TransformNode(name, scene);
  const body = MeshBuilder.CreateBox(
    name + " body",
    { width: 2, height: 1, depth: 4 },
    scene,
  );
  body.parent = root;
  const wheels = VEHICLE_WHEELS.map((point, i) => {
    const pivot = new TransformNode(name + " wheel " + i, scene);
    pivot.parent = root;
    pivot.position.set(point.x, point.y, point.z);
    const mesh = MeshBuilder.CreateBox(
      name + " tyre " + i,
      { width: 0.3, height: 0.68, depth: 0.68 },
      scene,
    );
    mesh.parent = pivot;
    return pivot;
  });
  return { root, wheels };
}
function originalWheels(
  groups: readonly TransformNode[][],
  input: VehicleState,
) {
  for (let i = 0; i < 4; i++)
    for (const group of groups) {
      const wheel = group[i];
      const suspension =
        input.parked && !input.wheelContact[i]
          ? 0.32
          : (input.wheelSuspension[i] ?? 0.32);
      wheel.position.y = VEHICLE_WHEELS[i].y - suspension;
      wheel.rotationQuaternion = Quaternion.RotationAxis(
        Vector3.Up(),
        i < 2 ? input.steering : 0,
      ).multiply(
        Quaternion.RotationAxis(Vector3.Right(), input.wheelSpin[i] ?? 0),
      );
    }
}

test("exact transform writers preserve signed zero, tiny motion, Euler reset and quaternion ownership", () => {
  const context = fixture();
  const node = new TransformNode("node", context.scene);
  const source = Quaternion.Identity();
  try {
    assert.equal(writeVector3(node.position, 0, 0, 0), false);
    assert.equal(writeVector3(node.position, -0, 0, 0), true);
    assert.ok(Object.is(node.position.x, -0));
    assert.equal(writeVector3(node.position, 1e-14, 0, 0), true);
    assert.equal(node.position.x, 1e-14);
    assert.equal(writeQuaternion(node, source), true);
    const owned = node.rotationQuaternion!;
    assert.notEqual(owned, source);
    assert.equal(writeQuaternion(node, source), false);
    source.y = 1e-14;
    assert.equal(writeQuaternion(node, source), true);
    assert.equal(node.rotationQuaternion, owned);
    assert.equal(owned.y, 1e-14);
    node.rotation.x = 0.6;
    assert.equal(writeQuaternion(node, source), true);
    assert.deepEqual(node.rotation.asArray(), [0, 0, 0]);
    node.rotationQuaternion = null;
    assert.equal(writeQuaternion(node, source), true);
    assert.notEqual(node.rotationQuaternion, owned);
  } finally {
    context.dispose();
  }
});

test("vehicle world matrices and bounds match original writes while stationary recomputes disappear and moving poses remain exact", () => {
  const before = fixture(),
    after = fixture();
  const a = [rig(before.scene, "driving"), rig(before.scene, "parked")];
  const b = [rig(after.scene, "driving"), rig(after.scene, "parked")];
  let oldEvents = 0,
    newEvents = 0,
    disposed = false;
  for (const node of [...before.scene.transformNodes, ...before.scene.meshes])
    node.onAfterWorldMatrixUpdateObservable.add(() => oldEvents++);
  for (const node of [...after.scene.transformNodes, ...after.scene.meshes])
    node.onAfterWorldMatrixUpdateObservable.add(() => newEvents++);
  const update = createCarWheelUpdater(
    b[0].wheels,
    b[1].wheels,
    () => disposed,
  );
  const input = state(),
    offset = Vector3.Zero();
  function step(driving: boolean) {
    for (const pair of [a, b]) {
      pair[0].root.setEnabled(driving);
      pair[1].root.setEnabled(!driving);
    }
    for (const entry of a) {
      entry.root.position.copyFromFloats(
        input.position.x,
        input.position.y,
        input.position.z,
      );
      entry.root.rotationQuaternion = new Quaternion(
        input.rotation.x,
        input.rotation.y,
        input.rotation.z,
        input.rotation.w,
      );
    }
    if (driving) {
      a[0].root.position.addInPlace(offset);
      a[1].root.position.copyFrom(a[0].root.position);
    }
    for (const entry of b) {
      writeVector3(
        entry.root.position,
        driving ? input.position.x + offset.x : input.position.x,
        driving ? input.position.y + offset.y : input.position.y,
        driving ? input.position.z + offset.z : input.position.z,
      );
      writeQuaternion(entry.root, input.rotation);
    }
    originalWheels(
      a.map((r) => r.wheels),
      input,
    );
    update(input);
    evaluate(before.scene);
    evaluate(after.scene);
    assert.deepEqual(snapshot(after.scene), snapshot(before.scene));
    for (let r = 0; r < 2; r++)
      for (let i = 0; i < 4; i++) {
        assert.deepEqual(
          b[r].wheels[i].position.asArray(),
          a[r].wheels[i].position.asArray(),
        );
        assert.deepEqual(
          b[r].wheels[i].rotationQuaternion!.asArray(),
          a[r].wheels[i].rotationQuaternion!.asArray(),
        );
      }
  }
  try {
    step(false);
    const identities = b.flatMap((r) => [
      r.root.rotationQuaternion,
      ...r.wheels.map((w) => w.rotationQuaternion),
    ]);
    oldEvents = newEvents = 0;
    for (let i = 0; i < 240; i++) step(false);
    const stationary = {
      frames: 240,
      originalRecomputes: oldEvents,
      candidateRecomputes: newEvents,
    };
    assert.ok(oldEvents > 0);
    assert.equal(newEvents, 0);
    b.flatMap((r) => [
      r.root.rotationQuaternion,
      ...r.wheels.map((w) => w.rotationQuaternion),
    ]).forEach((rotation, index) => assert.equal(rotation, identities[index]));
    assert.ok(b[0].root.rotationQuaternion !== b[1].root.rotationQuaternion);
    oldEvents = newEvents = 0;
    input.parked = false;
    offset.set(0.12, -0.01, 0.04);
    for (let i = 0; i < 120; i++) {
      input.position.x += 0.031;
      input.position.y += Math.sin(i * 0.1) * 0.001;
      input.steering = Math.sin(i * 0.03) * 0.4;
      input.wheelSpin = [i * 0.04, -i * 0.03, i * 0.041, -i * 0.031];
      input.wheelSuspension = [0.31 + Math.sin(i * 0.1) * 0.06, 0.4, 0.28, 0.3];
      step(true);
    }
    const moving = {
      frames: 120,
      originalRecomputes: oldEvents,
      candidateRecomputes: newEvents,
    };
    assert.ok(newEvents > 0);
    input.parked = true;
    input.wheelContact = [true, false, true, false];
    input.wheelSuspension = [0.1, 0.2];
    input.wheelSpin = [1e-14];
    step(false);
    // Cached values cannot suppress restoration of an externally changed pivot.
    b[1].wheels[0].rotationQuaternion = Quaternion.Identity();
    b[1].wheels[0].rotation.x = 0.9;
    step(false);
    // Replacing a wheel at identical angles must still populate its local pose.
    b[0].wheels[0].dispose();
    b[0].wheels[0] = new TransformNode("replacement wheel", after.scene);
    update(input);
    assert.deepEqual(
      b[0].wheels[0].rotationQuaternion!.asArray(),
      a[0].wheels[0].rotationQuaternion!.asArray(),
    );
    const saved = b[0].wheels[0].rotationQuaternion!.clone();
    disposed = true;
    input.steering = 1;
    update(input);
    assert.deepEqual(
      b[0].wheels[0].rotationQuaternion!.asArray(),
      saved.asArray(),
    );
    console.log(
      "Transform recompute evidence",
      JSON.stringify({
        scope:
          "Real Babylon world-matrix observer events, not GPU/FPS or CPU timing",
        stationary,
        moving,
      }),
    );
  } finally {
    before.dispose();
    after.dispose();
  }
});

test("contact shadow terrain/airborne poses, visibility and replacement match original matrices and retain idle bounds", () => {
  const before = fixture(),
    after = fixture();
  const source = MeshBuilder.CreateGround(
    "contact source",
    { width: 1, height: 1 },
    before.scene,
  );
  source.isVisible = false;
  const old = source.createInstance("contact subject");
  old.isVisible = true;
  const shadows = new ContactShadows(after.scene);
  const feet = { x: 110, y: groundHeight(110, 12), z: 12 };
  let width = 0.95,
    depth = 0.65,
    yaw = 0.5,
    visible = true;
  let originalEvents = 0,
    candidateEvents = 0;
  old.onAfterWorldMatrixUpdateObservable.add(() => originalEvents++);
  function step() {
    old.position.set(feet.x, feet.y + 0.006, feet.z);
    old.scaling.set(width, 1, depth);
    if (Math.abs(feet.y - groundHeight(feet.x, feet.z)) < 0.25) {
      const q = groundRotation(feet.x, feet.z, yaw, depth, width);
      old.rotationQuaternion = new Quaternion(q.x, q.y, q.z, q.w);
    } else old.rotationQuaternion = Quaternion.RotationAxis(Vector3.Up(), yaw);
    old.setEnabled(visible);
    shadows.set("subject", feet, width, depth, yaw, visible);
    evaluate(before.scene);
    evaluate(after.scene);
    assert.deepEqual(snapshot(after.scene), snapshot(before.scene));
  }
  try {
    step();
    const current = after.scene.getMeshByName(
      "contact subject",
    ) as InstancedMesh;
    current.onAfterWorldMatrixUpdateObservable.add(() => candidateEvents++);
    const owned = current.rotationQuaternion;
    originalEvents = candidateEvents = 0;
    for (let i = 0; i < 240; i++) step();
    assert.equal(candidateEvents, 0);
    assert.ok(originalEvents > 0);
    assert.equal(current.rotationQuaternion, owned);
    console.log(
      "Contact recompute evidence",
      JSON.stringify({
        frames: 240,
        originalRecomputes: originalEvents,
        candidateRecomputes: candidateEvents,
        scope: "Native observer count, not FPS",
      }),
    );
    feet.x += 0.1;
    feet.z += 0.3;
    feet.y = groundHeight(feet.x, feet.z);
    yaw += 0.1;
    step();
    feet.y += 2;
    width = 2.3;
    depth = 3.8;
    step();
    visible = false;
    feet.x += 0.05;
    step();
    visible = true;
    step();
    current.position.x += 10;
    current.scaling.y = 3;
    current.rotationQuaternion = Quaternion.Identity();
    step();
    shadows.remove("subject");
    assert.equal(current.isDisposed(), true);
    step();
    assert.notEqual(after.scene.getMeshByName("contact subject"), current);
    shadows.dispose();
    assert.equal(after.scene.meshes.length, 0);
  } finally {
    shadows.dispose();
    before.dispose();
    after.dispose();
  }
});
