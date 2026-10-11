import test from "node:test";
import assert from "node:assert/strict";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { Matrix, Vector3 } from "@babylonjs/core/Maths/math.vector";
import { VertexBuffer } from "@babylonjs/core/Buffers/buffer";
import {
  AvatarPrimitivePool,
  createAvatarRig,
} from "../client/avatar-renderer";
import { AvatarAnimator } from "../client/animation";
import { AvatarLodController } from "../client/avatar-lod";
import { applyAvatarPreset } from "../client/avatar-presets";
import { DEFAULT_AVATAR } from "../shared/types";
import {
  createJumpClip,
  sampleJumpClip,
  type JumpClipOptions,
} from "./helpers/jump-animation-fixture";

function rigFixture(preset: number) {
  const engine = new NullEngine(),
    scene = new Scene(engine),
    pool = new AvatarPrimitivePool(scene),
    config = applyAvatarPreset(preset, DEFAULT_AVATAR);
  const rig = createAvatarRig(scene, config, pool),
    animation = new AvatarAnimator(rig),
    lod = new AvatarLodController(scene, pool, rig, config);
  return {
    rig,
    animation,
    lod,
    dispose() {
      lod.dispose();
      rig.root.dispose();
      pool.dispose();
      scene.dispose();
      engine.dispose();
    },
  };
}

test("aligned real KCC jump poses keep pelvis and leg chains anatomical from the first take-off frame through landing", async () => {
  const cases: [JumpClipOptions, number, number][] = [
    [{ mode: "standing" }, 0, 60],
    [{ mode: "run", jumpTick: 94 }, 0, 60],
    [{ mode: "run", jumpTick: 108, turnAtTakeOff: true }, 3, 144],
    [{ mode: "sprint", jumpTick: 87, repeated: true }, 2, 30],
    [{ mode: "stairs", jumpTick: 86 }, 0, 60],
  ];
  const reports = [];
  for (const [options, preset, hz] of cases) {
    const clip = await createJumpClip(options),
      c = rigFixture(preset);
    let minimumPelvis = Infinity,
      minimumHipToAnkle = Infinity,
      airFrames = 0,
      maximumSupportError = 0,
      maximumRelativeFootSpeed = 0,
      maximumJumpFootSpeed = 0,
      touchdowns = 0,
      wasGrounded = true;
    const previousFeet = [Vector3.Zero(), Vector3.Zero()];
    const inverseRoot = Matrix.Identity();
    try {
      assert.ok(clip.takeoff >= 0 && clip.landing > clip.takeoff);
      assert.ok(
        clip.frames[clip.apex].position.y -
          clip.frames[clip.takeoff - 1].position.y >
          0.35,
        "clip must genuinely jump",
      );
      for (let i = 1; i <= Math.floor(clip.frames.at(-1)!.time * hz); i++) {
        const frame = sampleJumpClip(clip, i / hz),
          root = frame.position;
        const touchdown =
          frame.grounded &&
          !wasGrounded &&
          frame.time >= clip.frames[clip.takeoff].time;
        wasGrounded = frame.grounded;
        c.rig.root.position.set(root.x, root.y, root.z);
        c.lod.update({
          distance: hz === 30 ? 20 : 0,
          quality: "low",
          position: root,
          yaw: frame.yaw,
        });
        c.animation.update(
          { ...frame, groundHeight: (x, z) => clip.floorHeight(x, z, root.y) },
          1 / hz,
        );
        c.rig.root.computeWorldMatrix(true).invertToRef(inverseRoot);
        if (frame.time < 0.75) continue;
        minimumPelvis = Math.min(minimumPelvis, c.rig.hips.position.y);
        assert.ok(
          (frame.grounded || c.rig.hips.position.y > 0.57) &&
            c.rig.hips.position.y < 1.1,
          `pelvis escaped rig at ${JSON.stringify({ options, hz, time: frame.time, hips: c.rig.hips.position.y })}`,
        );
        for (const [side, hip, knee, foot, contact] of [
          [
            0,
            c.rig.left,
            c.rig.leftKnee,
            c.rig.leftFoot,
            c.animation.contacts.left,
          ],
          [
            1,
            c.rig.right,
            c.rig.rightKnee,
            c.rig.rightFoot,
            c.animation.contacts.right,
          ],
        ] as const) {
          const local = [hip, knee, foot].map((node) => {
            node.computeWorldMatrix(true);
            return Vector3.TransformCoordinates(
              node.getAbsolutePosition(),
              inverseRoot,
            );
          });
          assert.ok(
            Math.abs(
              Vector3.Distance(local[0], local[1]) - c.rig.measurements.thigh,
            ) < 3e-5,
          );
          assert.ok(
            Math.abs(
              Vector3.Distance(local[1], local[2]) - c.rig.measurements.shin,
            ) < 3e-5,
          );
          minimumHipToAnkle = Math.min(
            minimumHipToAnkle,
            local[0].y - local[2].y,
          );
          assert.ok(
            local[2].y < local[0].y - 0.18,
            `ankle rose above pelvis at ${JSON.stringify({ options, hz, time: frame.time, local })}`,
          );
          const thigh = local[1].subtract(local[0]),
            shin = local[2].subtract(local[1]);
          assert.ok(
            thigh.y * shin.z - thigh.z * shin.y >= -3e-6,
            `knee hinge reversed: ${JSON.stringify({ options, hz, time: frame.time, local })}`,
          );
          for (const node of [hip, foot])
            assert.ok(Math.abs(node.rotationQuaternion!.length() - 1) < 1e-6);
          if (i > hz) {
            const velocity =
              Vector3.Distance(local[2], previousFeet[side]) * hz;
            maximumRelativeFootSpeed = Math.max(
              maximumRelativeFootSpeed,
              velocity,
            );
            if (
              frame.time >= clip.frames[clip.takeoff].time - 1 / hz &&
              frame.time <= clip.frames[clip.landing].time + 0.2
            )
              maximumJumpFootSpeed = Math.max(maximumJumpFootSpeed, velocity);
          }
          previousFeet[side].copyFrom(local[2]);
          if (!frame.grounded)
            assert.equal(
              contact.planted,
              false,
              "airborne first frame cannot retain ground support",
            );
          if (
            frame.grounded &&
            frame.time >= clip.frames[clip.landing].time &&
            contact.planted
          ) {
            const p = foot.getAbsolutePosition();
            maximumSupportError = Math.max(
              maximumSupportError,
              Math.hypot(
                p.x - contact.target.x,
                p.y - contact.target.y,
                p.z - contact.target.z,
              ),
            );
          }
          if (touchdown) {
            let minimumSoleGap = Infinity;
            for (const mesh of foot
              .getChildMeshes()
              .filter((mesh) => mesh.isEnabled())) {
              mesh.computeWorldMatrix(true);
              const positions = mesh.getVerticesData(
                VertexBuffer.PositionKind,
              )!;
              for (let v = 0; v < positions.length; v += 3) {
                const point = Vector3.TransformCoordinates(
                  Vector3.FromArray(positions, v),
                  mesh.getWorldMatrix(),
                );
                const floor = clip.floorHeight(point.x, point.z, root.y);
                if (floor !== undefined)
                  minimumSoleGap = Math.min(minimumSoleGap, point.y - floor);
              }
            }
            assert.ok(
              minimumSoleGap >= -0.003 && minimumSoleGap < 0.02,
              `first grounded visible shoe must contact ground: ${JSON.stringify({ options, hz, time: frame.time, side, minimumSoleGap })}`,
            );
          }
        }
        if (touchdown) touchdowns++;
        if (!frame.grounded) airFrames++;
        assert.deepEqual(c.rig.root.position.asArray(), [
          root.x,
          root.y,
          root.z,
        ]);
      }
      assert.ok(airFrames > hz * 0.25);
      assert.ok(touchdowns > 0);
      assert.ok(
        maximumJumpFootSpeed < 16,
        `jump/landing pose teleport: ${maximumJumpFootSpeed}m/s`,
      );
      assert.ok(
        maximumSupportError < 0.003,
        `landing support mismatch ${maximumSupportError}`,
      );
      assert.equal(c.animation.gait, "idle");
      reports.push({
        options,
        preset,
        hz,
        minimumPelvis,
        minimumHipToAnkle,
        maximumSupportError,
        maximumRelativeFootSpeed,
        maximumJumpFootSpeed,
        touchdowns,
      });
      if (options.mode === "run" && hz === 60) {
        // Game renders the prior/interpolated position while grounded reflects
        // the latest physics tick. Keep this presentation contract separate
        // from the aligned reference above, especially at takeoff/touchdown.
        c.animation.reset();
        for (let i = 1; i < clip.frames.length; i++) {
          const state = clip.frames[i],
            position = clip.frames[i - 1].position;
          c.rig.root.position.set(position.x, position.y, position.z);
          c.animation.update(
            {
              ...state,
              position,
              groundHeight: (x, z) => clip.floorHeight(x, z, position.y),
            },
            1 / 60,
          );
          if (i < 45) continue;
          c.rig.hips.computeWorldMatrix(true);
          for (const foot of [c.rig.leftFoot, c.rig.rightFoot]) {
            foot.computeWorldMatrix(true);
            assert.ok(
              foot.getAbsolutePosition().y <
                c.rig.hips.getAbsolutePosition().y - 0.15,
            );
          }
        }
      }
    } finally {
      c.dispose();
      clip.dispose();
    }
  }
  console.log("Aligned real jump FK", JSON.stringify(reports));
});

test("remote interpolated height without grounded/floor information cannot pin pelvis to an obsolete ground plane", async () => {
  const clip = await createJumpClip({ mode: "run", jumpTick: 94 }),
    c = rigFixture(3);
  let minimum = Infinity;
  try {
    for (const frame of clip.frames) {
      c.rig.root.position.set(
        frame.position.x,
        frame.position.y,
        frame.position.z,
      );
      c.animation.update({ position: frame.position, yaw: frame.yaw }, 1 / 60);
      if (frame.time < 0.75) continue;
      minimum = Math.min(minimum, c.rig.hips.position.y);
      assert.ok(
        c.rig.hips.position.y > 0.57,
        "unknown grounding must not pin body to the old height",
      );
      for (const foot of [c.rig.leftFoot, c.rig.rightFoot]) {
        foot.computeWorldMatrix(true);
        c.rig.hips.computeWorldMatrix(true);
        assert.ok(
          foot.getAbsolutePosition().y <
            c.rig.hips.getAbsolutePosition().y - 0.15,
        );
      }
    }
    assert.ok(minimum > 0.57);
  } finally {
    c.dispose();
    clip.dispose();
  }
});
