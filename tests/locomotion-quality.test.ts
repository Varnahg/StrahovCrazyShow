import test from "node:test";
import assert from "node:assert/strict";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { VertexBuffer } from "@babylonjs/core/Buffers/buffer";
import {
  AvatarPrimitivePool,
  createAvatarRig,
} from "../client/avatar-renderer";
import { AvatarAnimator } from "../client/animation";
import { AvatarLodController } from "../client/avatar-lod";
import { DEFAULT_AVATAR } from "../shared/types";

function setup(preset = 0) {
  const engine = new NullEngine(),
    scene = new Scene(engine),
    pool = new AvatarPrimitivePool(scene),
    rig = createAvatarRig(scene, { ...DEFAULT_AVATAR, preset }, pool),
    animation = new AvatarAnimator(rig);
  scene.useRightHandedSystem = true;
  return {
    rig,
    animation,
    scene,
    pool,
    dispose() {
      rig.root.dispose();
      pool.dispose();
      scene.dispose();
      engine.dispose();
    },
  };
}
const range = (s: number[]) => Math.max(...s) - Math.min(...s);

test("real near/medium ankle transforms remain continuous through starting and stopping at different stride phases", () => {
  for (const fps of [30, 60, 144])
    for (const speed of [1.8, 4.6, 7])
      for (const stopAt of [2.1, 2.35, 2.6]) {
        const c = setup(speed === 7 ? 2 : 0);
        const lod = new AvatarLodController(
          c.scene,
          c.pool,
          c.rig,
          DEFAULT_AVATAR,
        );
        let z = 0,
          maximumVerticalSpeed = 0,
          maximumSupportError = 0;
        const previous = [new Vector3(), new Vector3()];
        for (let frame = 0; frame <= fps * 4; frame++) {
          const time = frame / fps;
          const moving =
            (time >= 0.5 && time < stopAt) ||
            (time >= stopAt + 0.15 && time < 3.25);
          if (moving) z += speed / fps;
          c.rig.root.position.set(0, 0, z);
          lod.update({
            distance: time < 1.5 ? 0 : 20,
            quality: "low",
            position: c.rig.root.position,
            yaw: 0,
          });
          c.animation.update(
            {
              position: c.rig.root.position,
              yaw: 0,
              grounded: true,
              groundHeight: () => 0,
            },
            1 / fps,
          );
          for (const [side, foot] of [
            c.rig.leftFoot,
            c.rig.rightFoot,
          ].entries()) {
            foot.computeWorldMatrix(true);
            const actual = foot.getAbsolutePosition();
            if (frame)
              maximumVerticalSpeed = Math.max(
                maximumVerticalSpeed,
                Math.abs(actual.y - previous[side].y) * fps,
              );
            previous[side].copyFrom(actual);
            const contact = side
              ? c.animation.contacts.right
              : c.animation.contacts.left;
            if (contact.planted)
              maximumSupportError = Math.max(
                maximumSupportError,
                Math.hypot(
                  actual.x - contact.target.x,
                  actual.y - contact.target.y,
                  actual.z - contact.target.z,
                ),
              );
          }
          assert.equal(c.rig.root.position.y, 0);
        }
        // A continuity bound, not a claim of measured human biomechanics. The
        // previous 144Hz start/stop jumped at 18.3/15.3m/s; smaller dt must not
        // amplify a fixed one-frame teleport. Existing stricter steady-state
        // sole, support and head tests remain unchanged.
        assert.ok(
          maximumVerticalSpeed < 5,
          `${speed}m/s, ${fps}Hz, stop ${stopAt}: ankle discontinuity ${maximumVerticalSpeed}m/s`,
        );
        assert.ok(
          maximumSupportError < 0.003,
          `stance ankle failed to reach support: ${maximumSupportError}m`,
        );
        assert.equal(lod.level, "medium");
        assert.ok(c.rig.skinnedBody!.medium.every((mesh) => mesh.isEnabled()));
        assert.equal(c.animation.gait, "idle");
        c.dispose();
      }
});

test("steady locomotion has a small continuous head excursion and lets both hands swing behind the torso at 30/60/144 Hz", () => {
  for (const speed of [1.8, 4.6, 7])
    for (const fps of [30, 60, 144]) {
      const c = setup(),
        heads: number[] = [],
        hands: [number[], number[]] = [[], []];
      let last = 0,
        maxVelocity = 0,
        phase = 0,
        cycles = 0;
      for (let i = 0; i <= fps * 5; i++) {
        c.rig.root.position.set(0, 0, (i * speed) / fps);
        c.animation.update(
          { position: c.rig.root.position, yaw: 0, grounded: true },
          1 / fps,
        );
        if (i <= fps) continue;
        c.rig.head.computeWorldMatrix(true);
        const head = c.rig.head.getAbsolutePosition().y;
        heads.push(head);
        if (last)
          maxVelocity = Math.max(maxVelocity, Math.abs(head - last) * fps);
        last = head;
        const delta = Math.atan2(
          Math.sin(c.animation.phase - phase),
          Math.cos(c.animation.phase - phase),
        );
        cycles += Math.max(0, delta) / (Math.PI * 2);
        phase = c.animation.phase;
        for (const [side, elbow] of [
          c.rig.leftElbow,
          c.rig.rightElbow,
        ].entries()) {
          elbow.computeWorldMatrix(true);
          hands[side].push(
            Vector3.TransformCoordinates(
              new Vector3(0, -0.275, 0),
              elbow.getWorldMatrix(),
            ).z - c.rig.root.position.z,
          );
        }
        assert.equal(
          c.rig.root.position.y,
          0,
          "animation must not move the physical root/camera",
        );
      }
      assert.ok(
        range(heads) > 0.015 && range(heads) < 0.065,
        `${speed}m/s at ${fps}Hz: head excursion ${range(heads)}m`,
      );
      assert.ok(
        maxVelocity < 1.1,
        `${speed}m/s at ${fps}Hz: head discontinuity ${maxVelocity}m/s`,
      );
      for (const hand of hands) {
        const mean = hand.reduce((s, v) => s + v, 0) / hand.length;
        assert.ok(
          Math.min(...hand) < -0.065,
          "a relaxed backswing must go behind the torso",
        );
        assert.ok(
          Math.max(...hand) < 0.35,
          "hands must not punch far forward during normal locomotion",
        );
        assert.ok(
          Math.abs(mean) < 0.11,
          `both hands held ahead: mean ${mean}m`,
        );
      }
      const stepsPerSecond = (cycles * 2) / 4;
      assert.ok(
        stepsPerSecond > 2 && stepsPerSecond < 4.2,
        `${speed}m/s: ${stepsPerSecond} steps/s`,
      );
      c.dispose();
    }
});

test("actual visible shoe vertices stay above flat roads, a 12% incline and 15/35cm stairs in both directions", () => {
  for (const kind of ["flat", "slope", "stairs"])
    for (const direction of [1, -1])
      for (const speed of [1.8, 4.6, 7]) {
        const c = setup(),
          floor = (_x: number, z: number) =>
            kind === "slope"
              ? 0.12 * z
              : kind === "stairs"
                ? 0.15 * Math.floor(z / 0.35)
                : 0;
        const shoes = c.rig.root
          .getChildMeshes()
          .filter((m) => m.name.endsWith(" sole"));
        assert.equal(shoes.length, 2);
        let minimum = Infinity,
          maxPlantedError = 0;
        for (let i = 0; i < 240; i++) {
          const z = 20 + (direction * i * speed) / 60,
            y = floor(0, z);
          c.rig.root.position.set(0, y, z);
          c.animation.update(
            {
              position: c.rig.root.position,
              yaw: direction > 0 ? 0 : Math.PI,
              grounded: true,
              groundHeight: floor,
            },
            1 / 60,
          );
          if (i < 60) continue;
          for (const [contact, foot] of [
            [c.animation.contacts.left, c.rig.leftFoot],
            [c.animation.contacts.right, c.rig.rightFoot],
          ] as const) {
            foot.computeWorldMatrix(true);
            if (contact.planted)
              maxPlantedError = Math.max(
                maxPlantedError,
                Vector3.Distance(
                  foot.getAbsolutePosition(),
                  new Vector3(
                    contact.anchor.x,
                    contact.anchor.y,
                    contact.anchor.z,
                  ),
                ),
              );
          }
          if (i % 3) continue;
          for (const shoe of shoes) {
            shoe.computeWorldMatrix(true);
            const points = shoe.getVerticesData(VertexBuffer.PositionKind)!;
            for (let j = 0; j < points.length; j += 3) {
              const actual = Vector3.TransformCoordinates(
                new Vector3(points[j], points[j + 1], points[j + 2]),
                shoe.getWorldMatrix(),
              );
              minimum = Math.min(minimum, actual.y - floor(actual.x, actual.z));
            }
          }
        }
        assert.ok(
          minimum > -0.003,
          `${kind}, dir ${direction}, speed ${speed}: visible sole penetrates ${minimum}m`,
        );
        assert.ok(
          maxPlantedError < 0.012,
          `${kind}, dir ${direction}, speed ${speed}: support error ${maxPlantedError}m`,
        );
        c.dispose();
      }
});

test("15cm capsule steps on known stairs are softened by the visual pelvis without moving the root", () => {
  for (const direction of [1, -1]) {
    const c = setup(),
      floor = (_x: number, z: number) => 0.15 * Math.floor(z / 0.35);
    let previousHead = 0,
      maximumDelta = 0;
    for (let i = 0; i < 240; i++) {
      const z = 20 + (direction * i * 1.8) / 60,
        y = floor(0, z);
      c.rig.root.position.set(0, y, z);
      c.animation.update(
        {
          position: c.rig.root.position,
          yaw: direction > 0 ? 0 : Math.PI,
          groundHeight: floor,
        },
        1 / 60,
      );
      c.rig.head.computeWorldMatrix(true);
      const h = c.rig.head.getAbsolutePosition().y;
      if (i > 60)
        maximumDelta = Math.max(maximumDelta, Math.abs(h - previousHead));
      previousHead = h;
      assert.equal(c.rig.root.position.y, y);
    }
    assert.ok(
      maximumDelta < 0.09,
      `15cm capsule steps became head jumps: direction ${direction}, ${maximumDelta}m`,
    );
    c.dispose();
  }
});

test("turning and stopping settle into a finite relaxed pose without residual stepping", () => {
  const c = setup();
  for (let i = 0; i < 360; i++) {
    const angle = (i / 60) * 0.7;
    c.rig.root.position.set(Math.sin(angle) * 2, 0, Math.cos(angle) * 2);
    c.animation.update(
      {
        position: c.rig.root.position,
        yaw: angle + Math.PI / 2,
        groundHeight: () => 0,
      },
      1 / 60,
    );
  }
  const phase = c.animation.phase,
    position = c.rig.root.position.clone();
  for (let i = 0; i < 240; i++)
    c.animation.update(
      { position, yaw: -Math.PI + 0.05, groundHeight: () => 0 },
      1 / 60,
    );
  assert.equal(c.animation.phase, phase);
  assert.equal(c.animation.gait, "idle");
  assert.ok(
    c.rig.root
      .getChildTransformNodes()
      .every((n) => n.position.asArray().every(Number.isFinite)),
  );
  assert.ok(
    Math.abs(c.rig.arm.rotation.x) < 0.001 &&
      Math.abs(c.rig.rightArm.rotation.x) < 0.001,
  );
  assert.ok(Math.abs(c.rig.leftElbow.rotation.x + 0.1) < 0.001);
  assert.deepEqual(c.rig.root.position.asArray(), position.asArray());
  c.dispose();
});

test("all six body builds clear a cross-slope and a kerb crossing the width of the shoe", () => {
  for (const preset of [0, 1, 2, 3, 4, 5])
    for (const kind of ["cross-slope", "kerb"]) {
      const c = setup(preset),
        floor = (x: number, z: number) =>
          kind === "cross-slope" ? 0.12 * x + 0.08 * z : x > 0.13 ? 0.15 : 0;
      const shoes = c.rig.root
        .getChildMeshes()
        .filter((m) => m.name.endsWith(" sole"));
      let minimum = Infinity;
      for (let i = 0; i < 180; i++) {
        const z = (i * 1.8) / 60;
        c.rig.root.position.set(0, floor(0, z), z);
        c.animation.update(
          { position: c.rig.root.position, yaw: 0, groundHeight: floor },
          1 / 60,
        );
        if (i < 60 || i % 3) continue;
        for (const shoe of shoes) {
          shoe.computeWorldMatrix(true);
          const points = shoe.getVerticesData(VertexBuffer.PositionKind)!;
          for (let j = 0; j < points.length; j += 3) {
            const actual = Vector3.TransformCoordinates(
              new Vector3(points[j], points[j + 1], points[j + 2]),
              shoe.getWorldMatrix(),
            );
            minimum = Math.min(minimum, actual.y - floor(actual.x, actual.z));
          }
        }
      }
      assert.ok(
        minimum > -0.003,
        `${kind}, preset ${preset}: visible sole penetrates ${minimum}m`,
      );
      c.dispose();
    }
});
