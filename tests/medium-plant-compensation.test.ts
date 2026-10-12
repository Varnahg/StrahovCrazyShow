import test from "node:test";
import assert from "node:assert/strict";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Game } from "../client/game";
import {
  AvatarPrimitivePool,
  createAvatarRig,
} from "../client/avatar-renderer";
import { AvatarAnimator } from "../client/animation";
import { AvatarLodController } from "../client/avatar-lod";
import { applyAvatarPreset } from "../client/avatar-presets";
import { DEFAULT_AVATAR } from "../shared/types";
import { createGroundTurnClip } from "./helpers/ground-turn-fixture";

function fixture(
  preset = 0,
  floor: (x: number, z: number, y: number) => number | undefined = () => 0,
) {
  const engine = new NullEngine(),
    scene = new Scene(engine),
    pool = new AvatarPrimitivePool(scene);
  const config = applyAvatarPreset(preset, DEFAULT_AVATAR),
    rig = createAvatarRig(scene, config, pool);
  const animation = new AvatarAnimator(rig),
    lod = new AvatarLodController(scene, pool, rig, config);
  const avatar = Object.assign(rig, {
    animation,
    lod,
    target: {
      id: "remote",
      yaw: 0,
      emote: "",
      vehicle: false,
      grounded: true as boolean | undefined,
    },
  });
  const counts = {
    queries: 0,
    updates: 0,
    calls: 0,
    compensated: 0,
    forced: 0,
    elapsed: 0,
  };
  let pendingForced = false;
  const originalUpdate = animation.update.bind(animation),
    originalCompensate = animation.compensatePlantedFeet.bind(animation);
  animation.update = (state, dt) => {
    counts.updates++;
    counts.elapsed += dt;
    const forced = pendingForced,
      queries = counts.queries;
    pendingForced = false;
    originalUpdate(state, dt);
    if (forced) {
      counts.forced++;
      assert.equal(
        counts.queries,
        queries,
        "forced grounded pose cannot add terrain queries",
      );
    }
  };
  animation.compensatePlantedFeet = (position) => {
    counts.calls++;
    const beforeQueries = counts.queries,
      phase = animation.phase,
      speed = animation.speed;
    const contacts = JSON.stringify(animation.contacts);
    const result = originalCompensate(position);
    assert.equal(
      counts.queries,
      beforeQueries,
      "compensation cannot query terrain",
    );
    assert.equal(animation.phase, phase);
    assert.equal(animation.speed, speed);
    assert.equal(
      JSON.stringify(animation.contacts),
      contacts,
      "held supports and gait state must not change",
    );
    if (result === "compensated") counts.compensated++;
    pendingForced = result === "unreachable";
    return result;
  };
  const game = Object.assign(Object.create(Game.prototype), {
    localId: "local",
    quality: "low",
    flashlightOn: false,
    camera: { position: new Vector3() },
    actor: { grounded: true },
    sim: {
      floorHeight(x: number, z: number, y: number) {
        counts.queries++;
        return floor(x, z, y);
      },
    },
    contactShadows: { set() {} },
  });
  return {
    engine,
    scene,
    pool,
    rig,
    avatar,
    animation,
    lod,
    counts,
    originalCompensate,
    update(position: Vector3, dt: number, distance = 20, visible = true) {
      game.camera.position.copyFrom(position).z += distance;
      game.updateAvatarPresentation("remote", avatar, position, dt, visible);
    },
    dispose() {
      lod.dispose();
      rig.root.dispose();
      pool.dispose();
      scene.dispose();
      engine.dispose();
    },
  };
}

test("actual 30Hz medium poses retain fixed planted targets through 60/144Hz KCC root updates", async () => {
  const clip = await createGroundTurnClip("reverse", true),
    reports = [];
  try {
    for (const hz of [60, 144])
      for (const preset of [0, 2]) {
        const pair = [];
        for (const enabled of [false, true]) {
          const f = fixture(preset, clip.floorHeight);
          if (!enabled) f.animation.compensatePlantedFeet = () => "skipped";
          let peakBetween = 0,
            peakPose = 0,
            peakSwingDelta = 0,
            groundedSamples = 0;
          let worst: unknown;
          const priorFeet = [Vector3.Zero(), Vector3.Zero()];
          try {
            for (let tick = 1; tick <= 5 * hz; tick++) {
              const frame = clip.sample(tick / hz),
                p = new Vector3(
                  frame.position.x,
                  frame.position.y,
                  frame.position.z,
                );
              Object.assign(f.avatar.target, {
                yaw: frame.yaw,
                grounded: frame.grounded,
              });
              const updates = f.counts.updates;
              f.update(p, 1 / hz);
              const posed = f.counts.updates > updates;
              f.rig.root.computeWorldMatrix(true);
              const inverse = f.rig.root.getWorldMatrix().clone().invert();
              for (const [side, hip, knee, foot, contact] of [
                [
                  0,
                  f.rig.left,
                  f.rig.leftKnee,
                  f.rig.leftFoot,
                  f.animation.contacts.left,
                ],
                [
                  1,
                  f.rig.right,
                  f.rig.rightKnee,
                  f.rig.rightFoot,
                  f.animation.contacts.right,
                ],
              ] as const) {
                const local = [hip, knee, foot].map((node) => {
                  node.computeWorldMatrix(true);
                  return Vector3.TransformCoordinates(
                    node.getAbsolutePosition(),
                    inverse,
                  );
                });
                const actual = foot.getAbsolutePosition();
                assert.ok(
                  Math.abs(
                    Vector3.Distance(local[0], local[1]) -
                      f.rig.measurements.thigh,
                  ) < 3e-5,
                );
                assert.ok(
                  Math.abs(
                    Vector3.Distance(local[1], local[2]) -
                      f.rig.measurements.shin,
                  ) < 3e-5,
                );
                assert.ok(local[0].y - local[2].y > 0.18);
                if (tick / hz > 0.75) {
                  if (contact.planted && frame.grounded) {
                    groundedSamples++;
                    const error = Math.hypot(
                      actual.x - contact.target.x,
                      actual.y - contact.target.y,
                      actual.z - contact.target.z,
                    );
                    if (posed) peakPose = Math.max(peakPose, error);
                    else if (error > peakBetween) {
                      peakBetween = error;
                      worst = {
                        time: tick / hz,
                        side,
                        root: p.asArray(),
                        previous: [
                          Reflect.get(f.animation, "previousX"),
                          Reflect.get(f.animation, "previousY"),
                          Reflect.get(f.animation, "previousZ"),
                        ],
                        air: Reflect.get(f.animation, "air"),
                        wasAirborne: Reflect.get(f.animation, "wasAirborne"),
                        hips: f.rig.hips.position.y,
                        contacts: structuredClone(f.animation.contacts),
                        measurements: f.rig.measurements,
                      };
                    }
                  } else
                    peakSwingDelta = Math.max(
                      peakSwingDelta,
                      Vector3.Distance(actual, priorFeet[side]),
                    );
                }
                priorFeet[side].copyFrom(actual);
              }
              assert.deepEqual(f.rig.root.position.asArray(), p.asArray());
            }
            assert.ok(groundedSamples > 20);
            assert.ok(peakPose < 0.0001);
            if (enabled) {
              assert.ok(
                peakBetween < 0.0001,
                `held support error ${peakBetween}: ${JSON.stringify(worst)}`,
              );
              assert.ok(f.counts.compensated > 20);
            } else
              assert.ok(
                peakBetween > 0.1,
                "baseline must reproduce the existing medium support defect",
              );
            const remainder = f.lod.flushAnimationDelta();
            assert.ok(
              Math.abs(f.counts.elapsed + remainder - 5) < 1e-9,
              "consume exactly the accumulated five seconds",
            );
            assert.equal(
              f.lod.flushAnimationDelta(),
              0,
              "flushed time is not reused",
            );
            pair.push({
              enabled,
              peakBetween,
              peakPose,
              peakSwingDelta,
              counts: { ...f.counts },
            });
          } finally {
            f.dispose();
          }
        }
        assert.ok(
          pair[1].counts.updates >= pair[0].counts.updates &&
            pair[1].counts.updates <=
              pair[0].counts.updates + pair[1].counts.forced,
          "only explicit unreachable supports permit an early pose",
        );
        assert.equal(
          pair[0].counts.queries,
          pair[1].counts.queries,
          "no additional floor queries",
        );
        // Separate open case: plant compensation must not be reported as a fix
        // for the unplanted foot's rapid sprint reversal.
        assert.ok(pair[1].peakSwingDelta > 0.25);
        reports.push({ hz, preset, pair });
      }
  } finally {
    clip.dispose();
  }
  console.log("Medium planted support", JSON.stringify(reports));
});

test("Game gates compensation away from near, far, hidden, unknown and vehicle states", () => {
  const f = fixture();
  const p = new Vector3(0, 0, 0);
  try {
    for (let i = 0; i < 20; i++) f.update(p, 1 / 144, 3);
    assert.equal(f.counts.calls, 0, "near keeps its original update path");
    f.update(p, 1 / 144, 20);
    assert.equal(f.lod.level, "medium");
    assert.equal(f.counts.calls, 1);
    const calls = f.counts.calls;
    f.avatar.target.grounded = false;
    f.update(p, 1 / 144, 20);
    assert.equal(f.counts.calls, calls);
    f.avatar.target.grounded = undefined;
    f.update(p, 1 / 144, 20);
    assert.equal(f.counts.calls, calls);
    f.avatar.target.grounded = true;
    f.update(p, 1 / 144, 20, false);
    assert.equal(f.counts.calls, calls);
    f.avatar.target.vehicle = true;
    f.update(p, 1 / 144, 20, true);
    assert.equal(f.counts.calls, calls);
    f.avatar.target.vehicle = false;
    f.update(p, 1 / 144, 80, true);
    assert.equal(f.lod.level, "far");
    assert.equal(f.counts.calls, calls);
    f.update(p, 1 / 144, 20, true);
    assert.equal(f.lod.level, "medium");
    assert.equal(
      f.originalCompensate(p),
      "skipped",
      "far→articulated reset invalidates old supports",
    );
    for (let i = 0; i < 10; i++) f.update(p, 1 / 144, 20, true);
    assert.equal(f.originalCompensate(p), "compensated");
  } finally {
    f.dispose();
  }
});

test("support compensation reuses state, respects reset/air/reach and has no post-disposal work", () => {
  const f = fixture();
  const p = new Vector3();
  try {
    assert.equal(f.originalCompensate(p), "skipped", "uninitialized rig");
    f.animation.update({ position: p, yaw: 0, grounded: true }, 1 / 60);
    const state = Reflect.get(f.animation, "compensationState");
    const meshes = f.scene.meshes.length,
      materials = f.scene.materials.length;
    for (let i = 0; i < 80; i++)
      assert.equal(f.originalCompensate(p), "compensated");
    assert.equal(Reflect.get(f.animation, "compensationState"), state);
    assert.equal(state.groundHeight, undefined);
    assert.equal(state.touchdownGroundHeight, undefined);
    assert.equal(f.scene.meshes.length, meshes);
    assert.equal(f.scene.materials.length, materials);
    const hip = f.rig.hips.position.y,
      rotation = f.rig.left.rotationQuaternion!.asArray();
    p.x = 1.8;
    f.rig.root.position.copyFrom(p);
    assert.equal(
      f.originalCompensate(p),
      "unreachable",
      "unreachable old support cannot stretch a leg",
    );
    assert.equal(f.rig.hips.position.y, hip);
    assert.deepEqual(f.rig.left.rotationQuaternion!.asArray(), rotation);
    p.x = 20;
    f.rig.root.position.copyFrom(p);
    assert.equal(f.originalCompensate(p), "skipped", "teleport");
    f.animation.update({ position: p, yaw: 0, grounded: true }, 1 / 60);
    assert.equal(
      f.originalCompensate(p),
      "compensated",
      "complete update resets at teleport destination",
    );
    f.animation.reset();
    assert.equal(
      f.originalCompensate(p),
      "skipped",
      "respawn/reset invalidates old supports",
    );
    f.animation.update({ position: p, yaw: 0, grounded: false }, 1 / 60);
    assert.equal(f.originalCompensate(p), "skipped", "air state is untouched");
    f.rig.root.dispose();
    assert.equal(f.originalCompensate(p), "skipped", "disposed rig");
  } finally {
    f.dispose();
  }
});

test("native medium flush consumes only accrued time and leaves ordinary cadence and inactive LODs alone", () => {
  const f = fixture(),
    position = new Vector3(),
    step = 1 / 144;
  const at = (distance: number, visible = true) =>
    f.lod.update({ distance, visible, quality: "low", position, yaw: 0 });
  try {
    at(20);
    assert.equal(f.lod.animationDelta(step), 0);
    assert.equal(f.lod.flushAnimationDelta(), step);
    assert.equal(f.lod.flushAnimationDelta(), 0);
    for (let i = 0; i < 4; i++) assert.equal(f.lod.animationDelta(step), 0);
    assert.equal(f.lod.animationDelta(step), step * 5);
    assert.equal(f.lod.flushAnimationDelta(), 0);
    f.lod.animationDelta(step);
    at(80);
    assert.equal(f.lod.flushAnimationDelta(), 0);
    at(20);
    f.lod.animationDelta(step);
    at(20, false);
    assert.equal(f.lod.flushAnimationDelta(), 0);
    at(3);
    assert.equal(f.lod.animationDelta(step), step);
    assert.equal(f.lod.flushAnimationDelta(), 0);
    at(20);
    f.lod.animationDelta(step);
    f.lod.dispose();
    assert.equal(f.lod.flushAnimationDelta(), 0);
  } finally {
    f.dispose();
  }
});
