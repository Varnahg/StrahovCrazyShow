import test from "node:test";
import assert from "node:assert/strict";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { AvatarAnimator } from "../client/animation";
import {
  AvatarPrimitivePool,
  createAvatarRig,
} from "../client/avatar-renderer";
import { DEFAULT_AVATAR } from "../shared/types";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { Material } from "@babylonjs/core/Materials/material";
import { VertexBuffer } from "@babylonjs/core/Buffers/buffer";
import type { InstancedMesh } from "@babylonjs/core/Meshes/instancedMesh";
import { applyAvatarPreset } from "../client/avatar-presets";
import { irisLandmarks } from "../client/avatar-eyes";
import characterGeometry from "../client/data/character-geometry.json";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";

function setup() {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  const pool = new AvatarPrimitivePool(scene);
  const rig = createAvatarRig(scene, DEFAULT_AVATAR, pool);
  const animation = new AvatarAnimator(rig);
  return {
    rig,
    animation,
    dispose() {
      rig.root.dispose();
      pool.dispose();
      scene.dispose();
      engine.dispose();
    },
  };
}

function travel(fps: number, speed: number, seconds = 4) {
  const context = setup();
  const position = { x: 0, y: 0, z: 0 };
  context.animation.update({ position, yaw: 0 }, 1 / fps);
  for (let i = 1; i <= fps * seconds; i++) {
    position.z = (i * speed) / fps;
    context.rig.root.position.set(position.x, position.y, position.z);
    context.animation.update({ position, yaw: 0 }, 1 / fps);
  }
  return { ...context, position };
}

test("flashlight carries the right forearm forward without changing leg IK and releases it in a vehicle", () => {
  const ordinary = setup(),
    carrying = setup();
  for (let frame = 0; frame < 180; frame++) {
    const position = { x: 0, y: 0, z: (frame * 4.6) / 60 };
    for (const c of [ordinary, carrying])
      c.rig.root.position.copyFromFloats(position.x, position.y, position.z);
    ordinary.animation.update({ position, yaw: 0 }, 1 / 60);
    carrying.animation.update({ position, yaw: 0, flashlight: true }, 1 / 60);
    assert.equal(carrying.animation.phase, ordinary.animation.phase);
    assert.equal(
      carrying.rig.leftKnee.rotation.x,
      ordinary.rig.leftKnee.rotation.x,
    );
    assert.equal(
      carrying.rig.rightKnee.rotation.x,
      ordinary.rig.rightKnee.rotation.x,
    );
  }
  carrying.rig.rightElbow.computeWorldMatrix(true);
  const direction = Vector3.TransformNormal(
    new Vector3(0, -1, 0),
    carrying.rig.rightElbow.getWorldMatrix(),
  ).normalize();
  assert.ok(direction.z > 0.98, `grip axis must face forward: ${direction}`);
  assert.ok(Math.abs(carrying.rig.rightArm.rotation.x + 0.42) < 1e-6);
  for (let frame = 0; frame < 120; frame++)
    carrying.animation.update(
      {
        position: carrying.rig.root.position,
        yaw: 0,
        flashlight: true,
        vehicle: true,
      },
      1 / 60,
    );
  assert.ok(Math.abs(carrying.rig.rightArm.rotation.x) < 1e-6);
  ordinary.dispose();
  carrying.dispose();
});

test("real rig walks, runs and sprints from measured travel at 30/60/144 FPS", () => {
  for (const [speed, gait] of [
    [1.8, "walk"],
    [4.6, "run"],
    [7, "sprint"],
  ] as const) {
    const cases = [30, 60, 144].map((fps) => travel(fps, speed));
    for (const context of cases) {
      assert.equal(context.animation.gait, gait);
      assert.ok(Math.abs(context.animation.speed - speed) < 1e-6);
      assert.ok(Number.isFinite(context.rig.left.rotation.x));
      assert.ok(context.rig.leftKnee.rotation.x > 0);
      assert.ok(context.rig.rightKnee.rotation.x > 0);
      assert.ok(
        context.rig.arm.rotation.x + context.rig.rightArm.rotation.x > 0,
        "shoulders extend slightly behind the torso so flexed elbows do not hold both hands forward",
      );
    }
    // The stride length ramps with measured speed, rather than with frame count.
    const phases = cases.map((context) => context.animation.phase);
    const phaseDifference = (a: number, b: number) =>
      Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));
    assert.ok(phaseDifference(phases[0], phases[2]) < 0.15);
    for (const context of cases) context.dispose();
  }
});

test("stopping against an obstacle settles both limbs without root bob or time-driven steps", () => {
  const context = travel(60, 4.6);
  const phaseAtStop = context.animation.phase;
  context.rig.root.position.set(5, 2, 8);
  for (let i = 0; i < 180; i++)
    context.animation.update({ position: context.position, yaw: 0 }, 1 / 60);
  assert.equal(context.animation.gait, "idle");
  assert.equal(context.animation.phase, phaseAtStop);
  assert.ok(Math.abs(context.rig.left.rotation.x) < 0.2);
  assert.ok(context.rig.leftKnee.rotation.x > 0.1);
  assert.ok(Math.abs(context.rig.rightArm.rotation.x) < 1e-8);
  assert.deepEqual(context.rig.root.position.asArray(), [5, 2, 8]);
  const settled = context.rig.left.rotation.x;
  for (let i = 0; i < 60; i++)
    context.animation.update({ position: context.position, yaw: 0 }, 1 / 60);
  assert.ok(Math.abs(context.rig.left.rotation.x - settled) < 1e-8);
  context.dispose();
});

test("a one-frame interpolation gap preserves the distance-driven gait instead of restarting a step", () => {
  const c = travel(60, 4.6, 2.2);
  const before = c.animation.phase;
  c.animation.update({ position: c.position, yaw: 0 }, 1 / 60);
  assert.equal(c.animation.phase, before);
  c.position.z += 4.6 / 60;
  c.rig.root.position.z = c.position.z;
  c.animation.update({ position: c.position, yaw: 0 }, 1 / 60);
  const delta = Math.atan2(
    Math.sin(c.animation.phase - before),
    Math.cos(c.animation.phase - before),
  );
  assert.ok(delta > 0 && delta < 0.3);
  c.dispose();
});

test("body rotation takes the shortest path across the minus-pi/plus-pi seam", () => {
  const context = setup();
  const position = { x: 0, y: 0, z: 0 };
  context.animation.update({ position, yaw: Math.PI - 0.04 }, 1 / 60);
  const initial = context.rig.root.rotation.y;
  context.animation.update({ position, yaw: -Math.PI + 0.04 }, 1 / 60);
  assert.ok(context.rig.root.rotation.y > initial);
  assert.ok(context.rig.root.rotation.y - initial < 0.08);
  for (let i = 0; i < 60; i++)
    context.animation.update({ position, yaw: -Math.PI + 0.04 }, 1 / 60);
  assert.ok(Math.abs(context.rig.root.rotation.y - (Math.PI + 0.04)) < 1e-7);
  context.dispose();
});

test("gestures remain in the shoulders and smoothly return both arms to idle", () => {
  const context = setup();
  const position = { x: 0, y: 0, z: 0 };
  context.rig.root.position.set(8, 1, -6);
  for (const emote of ["👋", "❤️", "🎉", "👍"]) {
    for (let i = 0; i < 120; i++)
      context.animation.update({ position, yaw: 0.3, emote }, 1 / 60);
    assert.deepEqual(context.rig.root.position.asArray(), [8, 1, -6]);
    assert.equal(context.rig.root.rotation.x, 0);
    assert.equal(context.rig.root.rotation.z, 0);
    assert.ok(Math.abs(context.rig.root.rotation.y - 0.3) < 1e-8);
    assert.equal(context.animation.phase, 0);
    for (let i = 0; i < 180; i++)
      context.animation.update({ position, yaw: 0.3 }, 1 / 60);
    assert.ok(Math.abs(context.rig.arm.rotation.x) < 1e-10);
    assert.ok(Math.abs(context.rig.arm.rotation.z + 0.04) < 1e-10);
    assert.ok(Math.abs(context.rig.rightArm.rotation.x) < 1e-10);
  }
  context.dispose();
});

test("teleports, sleeping tabs and vehicle transitions cannot become a rapid stride", () => {
  const context = travel(60, 7);
  context.position.z += 100;
  context.animation.update({ position: context.position, yaw: 0 }, 1 / 60);
  assert.equal(context.animation.phase, 0);
  assert.equal(context.animation.gait, "idle");
  context.animation.update(
    { position: context.position, yaw: 0, vehicle: true, emote: "🎉" },
    1 / 60,
  );
  assert.ok(Math.abs(context.rig.left.rotation.x) < 0.2);
  assert.equal(context.rig.arm.rotation.x, 0);
  context.position.z += 0.05;
  context.animation.update(
    { position: context.position, yaw: 0, vehicle: false },
    2,
  );
  assert.equal(context.animation.phase, 0);
  assert.equal(context.animation.gait, "idle");
  const yaw = context.rig.root.rotation.y;
  context.animation.update({ position: context.position, yaw: NaN }, 1 / 60);
  assert.equal(context.rig.root.rotation.y, yaw);
  context.dispose();
});

test("articulated knees/elbows/ankles preserve human proportions and closed shared silhouettes", () => {
  const context = setup();
  const { rig } = context;
  assert.equal(rig.leftKnee.parent, rig.left);
  assert.equal(rig.leftFoot.parent, rig.leftKnee);
  assert.equal(rig.leftElbow.parent, rig.arm);
  assert.equal(rig.head.parent, rig.torso);
  const head = rig.head
    .getChildMeshes()
    .find((mesh) => mesh.name.endsWith(" face"))!;
  const headHeight = head.scaling.y * rig.root.scaling.y;
  const fullHeight =
    (rig.measurements.hipHeight +
      rig.torso.position.y +
      rig.head.position.y +
      head.scaling.y / 2) *
    rig.root.scaling.y;
  assert.ok(fullHeight / headHeight >= 7 && fullHeight / headHeight < 7.5);
  const shared =
    head as import("@babylonjs/core/Meshes/instancedMesh").InstancedMesh;
  const indices = shared.sourceMesh.getIndices()!;
  const positions = shared.sourceMesh.getVerticesData(
    VertexBuffer.PositionKind,
  )!;
  const vertexKey = (index: number) =>
    [...positions.slice(index * 3, index * 3 + 3)]
      .map((v) => v.toFixed(6))
      .join(",");
  const edges = new Map<string, number>();
  for (let i = 0; i < indices.length; i += 3)
    for (const [a, b] of [
      [indices[i], indices[i + 1]],
      [indices[i + 1], indices[i + 2]],
      [indices[i + 2], indices[i]],
    ]) {
      // The source UV seam duplicates vertices. Test the welded surface,
      // including the derived closed neck cap, rather than buffer indices.
      const av = vertexKey(a),
        bv = vertexKey(b);
      const edge = av < bv ? `${av}:${bv}` : `${bv}:${av}`;
      edges.set(edge, (edges.get(edge) ?? 0) + 1);
    }
  assert.ok([...edges.values()].every((count) => count === 2));
  context.dispose();
});

test("planted feet stay at their world anchors while knees bend and the body moves", () => {
  for (const speed of [1.8, 4.6, 7]) {
    const context = setup();
    const position = { x: 0, y: 0, z: 0 };
    context.animation.update({ position, yaw: 0 }, 1 / 60);
    let samples = 0,
      maximumError = 0,
      maximumKnee = 0;
    for (let frame = 1; frame <= 360; frame++) {
      position.z = (frame * speed) / 60;
      context.rig.root.position.set(position.x, position.y, position.z);
      context.animation.update({ position, yaw: 0 }, 1 / 60);
      context.rig.root.computeWorldMatrix(true);
      for (const [contact, foot, knee] of [
        [
          context.animation.contacts.left,
          context.rig.leftFoot,
          context.rig.leftKnee,
        ],
        [
          context.animation.contacts.right,
          context.rig.rightFoot,
          context.rig.rightKnee,
        ],
      ] as const) {
        foot.computeWorldMatrix(true);
        if (frame > 60 && contact.planted) {
          const actual = foot.getAbsolutePosition();
          const error = Math.hypot(
            actual.x - contact.anchor.x,
            actual.y - contact.anchor.y,
            actual.z - contact.anchor.z,
          );
          maximumError = Math.max(maximumError, error);
          samples++;
        }
        maximumKnee = Math.max(maximumKnee, knee.rotation.x);
      }
    }
    assert.ok(samples > 100);
    assert.ok(
      maximumError < 0.012,
      `speed ${speed}: planted ankle error ${maximumError}m`,
    );
    assert.ok(maximumKnee > 0.8);
    context.dispose();
  }
});

test("jump folds knees and returns to stable grounded contact without moving the root", () => {
  const context = setup();
  const position = { x: 0, y: 0, z: 0 };
  context.animation.update({ position, yaw: 0 }, 1 / 60);
  const idleKnee = context.rig.leftKnee.rotation.x;
  for (let i = 0; i < 30; i++)
    context.animation.update({ position, yaw: 0, grounded: false }, 1 / 60);
  assert.ok(context.rig.leftKnee.rotation.x > idleKnee + 0.5);
  assert.equal(context.animation.contacts.left.planted, false);
  for (let i = 0; i < 120; i++)
    context.animation.update({ position, yaw: 0, grounded: true }, 1 / 60);
  assert.equal(context.animation.contacts.left.planted, true);
  assert.ok(Math.abs(context.rig.leftKnee.rotation.x - idleKnee) < 1e-7);
  assert.deepEqual(context.rig.root.position.asArray(), [0, 0, 0]);
  context.dispose();
});

test("authored facial relief has outward normals and explicit Blender winding in either scene handedness", () => {
  for (const rightHanded of [false, true]) {
    const engine = new NullEngine(),
      scene = new Scene(engine);
    scene.useRightHandedSystem = rightHanded;
    const pool = new AvatarPrimitivePool(scene),
      rig = createAvatarRig(scene, DEFAULT_AVATAR, pool);
    const face = rig.head
      .getChildMeshes()
      .find((mesh) => mesh.name.endsWith(" face")) as InstancedMesh;
    assert.equal(
      face.sourceMesh.sideOrientation,
      Material.CounterClockWiseSideOrientation,
    );
    const positions = face.sourceMesh.getVerticesData(
      VertexBuffer.PositionKind,
    )!;
    const normals = face.sourceMesh.getVerticesData(VertexBuffer.NormalKind)!;
    assert.ok([...positions, ...normals].every(Number.isFinite));
    const front = Array.from(
      { length: positions.length / 3 },
      (_, i) => i,
    ).filter(
      (i) =>
        Math.abs(positions[i * 3]) < 0.025 &&
        positions[i * 3 + 2] > 0.6 &&
        Math.abs(positions[i * 3 + 1]) < 0.1,
    );
    assert.ok(front.length > 4);
    assert.ok(
      front.every((i) => normals[i * 3 + 2] > 0.6),
      "a backwards front surface renders a hollow mask",
    );
    assert.ok(
      Math.max(...front.map((i) => positions[i * 3 + 2])) > 0.57,
      "continuous mesh must include the nasal bridge/tip",
    );
    assert.equal(
      rig.head
        .getChildMeshes()
        .filter((mesh) => / nose (bridge|tip)$/.test(mesh.name)).length,
      0,
    );
    assert.ok(
      scene.meshes
        .filter((mesh) => mesh.isDescendantOf(rig.root) && mesh.isEnabled())
        .reduce(
          (triangles, mesh) => triangles + mesh.getTotalIndices() / 3,
          0,
        ) < 36000,
    );
    rig.root.dispose();
    pool.dispose();
    scene.dispose();
    engine.dispose();
  }
  for (const [name, form] of Object.entries(characterGeometry.forms)) {
    assert.equal(form.positions.length, form.normals.length, name);
    assert.equal(form.uvs.length / 2, form.positions.length / 3, name);
    assert.ok(
      form.indices.every(
        (index) => index >= 0 && index < form.positions.length / 3,
      ),
      name,
    );
    const edges = new Map<string, number>();
    for (let i = 0; i < form.indices.length; i += 3)
      for (const [a, b] of [
        [form.indices[i], form.indices[i + 1]],
        [form.indices[i + 1], form.indices[i + 2]],
        [form.indices[i + 2], form.indices[i]],
      ]) {
        const edge = a < b ? `${a}:${b}` : `${b}:${a}`;
        edges.set(edge, (edges.get(edge) ?? 0) + 1);
      }
    assert.ok(
      [...edges.values()].every((count) => count === 2),
      name + " must be closed rather than alpha cards or disconnected faces",
    );
  }
});

test("skin, cloth, hair and eyes have shared role-specific linear PBR materials without losing chosen colours", () => {
  const engine = new NullEngine(),
    scene = new Scene(engine),
    pool = new AvatarPrimitivePool(scene);
  const people = Array.from({ length: 12 }, (_, i) =>
    createAvatarRig(
      scene,
      applyAvatarPreset(i % 6, DEFAULT_AVATAR),
      pool,
      "material audit " + i,
    ),
  );
  const part = (index: number, suffix: string) =>
    people[index].root
      .getChildMeshes()
      .find((mesh) => mesh.name.endsWith(suffix)) as InstancedMesh;
  for (let i = 0; i < 6; i++) {
    const face = part(i, " face"),
      copy = part(i + 6, " face");
    assert.equal(face.sourceMesh, copy.sourceMesh);
    assert.equal(face.material, copy.material);
    assert.equal(
      face.sourceMesh.geometry,
      part((i + 1) % 6, " face").sourceMesh.geometry,
      "skin colours must not duplicate the GPU vertex buffers",
    );
    for (const [suffix, hex] of [
      [" face", applyAvatarPreset(i, DEFAULT_AVATAR).skin],
      [" clothed torso", applyAvatarPreset(i, DEFAULT_AVATAR).shirt],
      [" trouser waist", applyAvatarPreset(i, DEFAULT_AVATAR).trousers],
    ]) {
      const material = part(i, suffix).material;
      assert.ok(material instanceof PBRMaterial);
      const gamma = material.albedoColor.toGammaSpace().asArray();
      const chosen = hex
        .match(/[0-9a-f]{2}/gi)!
        .map((value) => parseInt(value, 16) / 255);
      assert.ok(gamma.every((v, j) => Math.abs(v - chosen[j]) < 1e-6));
      assert.equal(material.metallic, 0);
    }
    const eye = part(i, " anatomical eyes near").material as PBRMaterial;
    const cloth = part(i, " clothed torso").material as PBRMaterial;
    assert.ok(eye.roughness! < cloth.roughness!);
    assert.equal(
      part(i, " anatomical eyes medium").metadata.avatarBodyLod,
      "medium",
    );
    assert.equal(part(i, " face").metadata.avatarDetail, "silhouette");
  }
  assert.equal(
    scene.textures.filter((texture) => texture.name.startsWith("authored "))
      .length,
    2,
  );
  for (const rig of people) rig.root.dispose();
  pool.pruneUnused();
  assert.equal(
    scene.materials.filter((material) => material.name.startsWith("character "))
      .length,
    0,
  );
  pool.dispose();
  assert.equal(
    scene.textures.filter((texture) => texture.name.startsWith("authored "))
      .length,
    0,
  );
  scene.dispose();
  engine.dispose();
});

test("all six hairstyles leave both pupils visible and expose a stable first-person eye height", () => {
  const engine = new NullEngine(),
    scene = new Scene(engine),
    pool = new AvatarPrimitivePool(scene);
  const frontDepth = (mesh: InstancedMesh, x: number, y: number) => {
    const positions = mesh.sourceMesh.getVerticesData(
      VertexBuffer.PositionKind,
    )!;
    const indices = mesh.sourceMesh.getIndices()!;
    const px = (x - mesh.position.x) / mesh.scaling.x,
      py = (y - mesh.position.y) / mesh.scaling.y;
    let maximum = -Infinity;
    for (let i = 0; i < indices.length; i += 3) {
      const ai = indices[i] * 3,
        bi = indices[i + 1] * 3,
        ci = indices[i + 2] * 3;
      const ax = positions[ai],
        ay = positions[ai + 1],
        bx = positions[bi],
        by = positions[bi + 1],
        cx = positions[ci],
        cy = positions[ci + 1];
      const denominator = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy);
      if (Math.abs(denominator) < 1e-12) continue;
      const a = ((by - cy) * (px - cx) + (cx - bx) * (py - cy)) / denominator;
      const b = ((cy - ay) * (px - cx) + (ax - cx) * (py - cy)) / denominator;
      if (a < -1e-6 || b < -1e-6 || a + b > 1 + 1e-6) continue;
      maximum = Math.max(
        maximum,
        (a * positions[ai + 2] +
          b * positions[bi + 2] +
          (1 - a - b) * positions[ci + 2]) *
          mesh.scaling.z +
          mesh.position.z,
      );
    }
    return maximum;
  };
  for (let preset = 0; preset < 6; preset++) {
    const rig = createAvatarRig(
      scene,
      applyAvatarPreset(preset, DEFAULT_AVATAR),
      pool,
      "visibility " + preset,
    );
    const hair = rig.head
      .getChildMeshes()
      .find((mesh) => mesh.name.endsWith(" hair")) as InstancedMesh;
    const pupils = irisLandmarks(
      "near",
      applyAvatarPreset(preset, DEFAULT_AVATAR),
    );
    assert.equal(pupils.length, 2);
    // Alpha-tested card pupils have a dedicated atlas-aware ray regression.
    for (const { point } of pupils)
      if (!hair.metadata?.avatarHair)
        assert.ok(
          frontDepth(hair, point[0], point[1]) < point[2],
          "preset " + preset + " hair must not cover a pupil in front view",
        );
    assert.ok(rig.eyeHeight > 1.53 && rig.eyeHeight < 1.72);
    assert.ok(
      rig.bodyHeight - rig.eyeHeight > 0.08 &&
        rig.bodyHeight - rig.eyeHeight < 0.17,
    );
    const eyeHeight = rig.eyeHeight,
      animator = new AvatarAnimator(rig);
    for (let frame = 0; frame < 120; frame++)
      animator.update(
        { position: { x: 0, y: 0, z: 0 }, yaw: 0, emote: "👋" },
        1 / 60,
      );
    assert.equal(
      rig.eyeHeight,
      eyeHeight,
      "camera height must not inherit gesture/head animation",
    );
    rig.root.dispose();
  }
  pool.dispose();
  scene.dispose();
  engine.dispose();
});
