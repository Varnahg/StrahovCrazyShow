import test from "node:test";
import assert from "node:assert/strict";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { Matrix, Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import {
  AvatarPrimitivePool,
  createAvatarRig,
} from "../client/avatar-renderer";
import { AvatarAnimator } from "../client/animation";
import { AvatarLodController } from "../client/avatar-lod";
import { applyAvatarPreset } from "../client/avatar-presets";
import { DEFAULT_AVATAR } from "../shared/types";
import { createGroundTurnClip } from "./helpers/ground-turn-fixture";

/** Independent TRS chain, not another read of Babylon's cached world matrix. */
function independentPosition(node: TransformNode) {
  let point = Vector3.Zero();
  for (
    let joint: TransformNode | null = node;
    joint;
    joint = joint.parent as TransformNode | null
  ) {
    const q =
      joint.rotationQuaternion ??
      Quaternion.RotationYawPitchRoll(
        joint.rotation.y,
        joint.rotation.x,
        joint.rotation.z,
      );
    point = Vector3.TransformCoordinates(
      point,
      Matrix.Compose(joint.scaling, q, joint.position),
    );
  }
  return point;
}

test("actual grounded starts and 90/180 degree KCC turns land where the visible swing arrived", async () => {
  const reports = [];
  for (const scenario of [
    { turn: "start", preset: 3, hz: 144, sprint: false },
    { turn: "right-angle", preset: 0, hz: 60, sprint: false },
    { turn: "reverse", preset: 2, hz: 30, sprint: true },
  ] as const) {
    const clip = await createGroundTurnClip(scenario.turn, scenario.sprint);
    const engine = new NullEngine(),
      scene = new Scene(engine),
      pool = new AvatarPrimitivePool(scene);
    const config = applyAvatarPreset(scenario.preset, DEFAULT_AVATAR);
    const rig = createAvatarRig(scene, config, pool),
      animator = new AvatarAnimator(rig),
      lod = new AvatarLodController(scene, pool, rig, config);
    const previous = [Vector3.Zero(), Vector3.Zero()],
      previousLocal = [Vector3.Zero(), Vector3.Zero()];
    const wasPlanted = [false, false],
      previousSupport = [Vector3.Zero(), Vector3.Zero()];
    let maximumWorldSpeed = 0,
      maximumRelativeSpeed = 0,
      maximumPlantDistance = 0,
      maximumSupportError = 0,
      maximumIndependentError = 0,
      plants = 0;
    try {
      for (let tick = 1; tick <= scenario.hz * 5; tick++) {
        const time = tick / scenario.hz,
          frame = clip.sample(time);
        rig.root.position.copyFromFloats(
          frame.position.x,
          frame.position.y,
          frame.position.z,
        );
        lod.update({
          distance: scenario.hz === 30 ? 20 : 3,
          quality: "low",
          position: frame.position,
          yaw: frame.yaw,
          visible: true,
        });
        animator.update(
          {
            ...frame,
            groundHeight: (x, z) => clip.floorHeight(x, z, frame.position.y),
          },
          1 / scenario.hz,
        );
        rig.root.computeWorldMatrix(true);
        const inverse = rig.root.getWorldMatrix().clone().invert();
        for (const [side, hip, knee, foot, contact] of [
          [0, rig.left, rig.leftKnee, rig.leftFoot, animator.contacts.left],
          [1, rig.right, rig.rightKnee, rig.rightFoot, animator.contacts.right],
        ] as const) {
          const nodes = [hip, knee, foot].map((node) => {
            node.computeWorldMatrix(true);
            return Vector3.TransformCoordinates(
              node.getAbsolutePosition(),
              inverse,
            );
          });
          const actual = foot.getAbsolutePosition();
          maximumIndependentError = Math.max(
            maximumIndependentError,
            Vector3.Distance(actual, independentPosition(foot)),
          );
          assert.ok(
            Math.abs(
              Vector3.Distance(nodes[0], nodes[1]) - rig.measurements.thigh,
            ) < 3e-5,
          );
          assert.ok(
            Math.abs(
              Vector3.Distance(nodes[1], nodes[2]) - rig.measurements.shin,
            ) < 3e-5,
          );
          assert.ok(
            nodes[0].y - nodes[2].y > 0.18,
            "ground turn cannot invert the leg",
          );
          const thigh = nodes[1].subtract(nodes[0]),
            shin = nodes[2].subtract(nodes[1]);
          assert.ok(
            thigh.y * shin.z - thigh.z * shin.y >= -3e-6,
            "knee hinge must remain anatomical",
          );
          if (time > 0.75) {
            const worldSpeed =
              Vector3.Distance(actual, previous[side]) * scenario.hz;
            maximumWorldSpeed = Math.max(maximumWorldSpeed, worldSpeed);
            maximumRelativeSpeed = Math.max(
              maximumRelativeSpeed,
              Vector3.Distance(nodes[2], previousLocal[side]) * scenario.hz,
            );
            if (contact.planted) {
              maximumSupportError = Math.max(
                maximumSupportError,
                Vector3.Distance(
                  actual,
                  Vector3.FromArray([
                    contact.target.x,
                    contact.target.y,
                    contact.target.z,
                  ]),
                ),
              );
              if (wasPlanted[side]) {
                // Active stance is exactly anchored. After input stops the
                // final idle settle follows micrometre KCC/root quantization.
                const tolerance = time <= 3.5 ? 1e-9 : 2e-5;
                assert.ok(
                  Math.hypot(
                    contact.support.x - previousSupport[side].x,
                    contact.support.z - previousSupport[side].z,
                  ) < tolerance,
                  `planted support changed ${JSON.stringify({ time, scenario, side, phase: contact.phase, previous: previousSupport[side].asArray(), support: contact.support, settle: contact.settleTime })}`,
                );
              } else {
                plants++;
                maximumPlantDistance = Math.max(
                  maximumPlantDistance,
                  Vector3.Distance(actual, previous[side]),
                );
              }
            }
          }
          previous[side].copyFrom(actual);
          previousLocal[side].copyFrom(nodes[2]);
          previousSupport[side].copyFromFloats(
            contact.support.x,
            contact.support.y,
            contact.support.z,
          );
          wasPlanted[side] = contact.planted;
        }
        assert.deepEqual(rig.root.position.asArray(), [
          frame.position.x,
          frame.position.y,
          frame.position.z,
        ]);
      }
      assert.ok(plants > 5);
      assert.ok(
        maximumPlantDistance < 0.12,
        `one-frame swing→support discontinuity: ${maximumPlantDistance}m ${scenario.turn}`,
      );
      assert.ok(
        maximumSupportError < 0.003,
        `unreachable supporting ankle: ${maximumSupportError}m ${scenario.turn}`,
      );
      assert.ok(maximumIndependentError < 2e-5);
      if (scenario.turn === "start") {
        assert.ok(
          maximumWorldSpeed < 16,
          `original pre-jump world ankle spike: ${maximumWorldSpeed}m/s`,
        );
        assert.ok(
          maximumRelativeSpeed < 10,
          `original pre-jump root-relative spike: ${maximumRelativeSpeed}m/s`,
        );
      }
      assert.equal(animator.gait, "idle");
      reports.push({
        ...scenario,
        maximumWorldSpeed,
        maximumRelativeSpeed,
        maximumPlantDistance,
        maximumSupportError,
        maximumIndependentError,
        plants,
      });
    } finally {
      lod.dispose();
      rig.root.dispose();
      pool.dispose();
      scene.dispose();
      engine.dispose();
      clip.dispose();
    }
  }
  console.log("Ground turn actual FK", JSON.stringify(reports));
});
