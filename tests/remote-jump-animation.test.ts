import test from "node:test";
import assert from "node:assert/strict";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { VertexBuffer } from "@babylonjs/core/Buffers/buffer";
import { Game } from "../client/game";
import { AvatarAnimator, type AvatarAnimationState } from "../client/animation";
import { AvatarLodController } from "../client/avatar-lod";
import {
  AvatarPrimitivePool,
  createAvatarRig,
} from "../client/avatar-renderer";
import { applyAvatarPreset } from "../client/avatar-presets";
import { DEFAULT_AVATAR } from "../shared/types";
import { SnapshotBuffer } from "../shared/netcode";
import { createJumpClip } from "./helpers/jump-animation-fixture";
import {
  REMOTE_JUMP_EPOCH,
  REMOTE_JUMP_ID,
  remoteJumpStream,
} from "./helpers/remote-jump-fixture";

test("remote contact interpolation is exact at endpoints and conservative only inside a known transition", () => {
  const states = [true, false, undefined] as const;
  for (const a of states)
    for (const b of states) {
      const snapshots = new SnapshotBuffer();
      for (const [time, y, grounded] of [
        [0, 1, a],
        [50, 2, b],
      ] as const) {
        const row: unknown[] = ["remote", 0, y, 0, 0, 0, 0, 0, "outside"];
        if (grounded !== undefined) row.push(grounded);
        snapshots.push(
          { time: REMOTE_JUMP_EPOCH + time, tick: time, rows: [row] },
          REMOTE_JUMP_EPOCH + time,
        );
      }
      for (const fraction of [0, 0.25, 0.75, 1]) {
        const sample = snapshots.sample(
          "remote",
          REMOTE_JUMP_EPOCH + 100 + fraction * 50,
        )!;
        const expected =
          fraction === 0
            ? a
            : fraction === 1
              ? b
              : a === undefined || b === undefined
                ? undefined
                : a && b;
        assert.equal(sample.y, 1 + fraction);
        assert.equal(sample.grounded, expected, `${a}→${b} @${fraction}`);
      }
    }
});

test("real 20Hz jump snapshots drive near/medium animation and shadows through delayed 60Hz presentation", async () => {
  const reports = [];
  for (const scenario of [
    { mode: "standing", preset: 0, distance: 3, jitterMs: [0] },
    { mode: "run", preset: 2, distance: 20, jitterMs: [0, 22, -12, 8] },
    { mode: "run", preset: 3, distance: 3, jitterMs: [0, 140, 140, 0, 0] },
  ] as const) {
    const clip = await createJumpClip({ mode: scenario.mode });
    const engine = new NullEngine(),
      scene = new Scene(engine),
      pool = new AvatarPrimitivePool(scene);
    const config = applyAvatarPreset(scenario.preset, DEFAULT_AVATAR);
    const rig = createAvatarRig(scene, config, pool),
      lod = new AvatarLodController(scene, pool, rig, config),
      animation = new AvatarAnimator(rig);
    const avatar = Object.assign(rig, {
      lod,
      animation,
      target: {
        id: REMOTE_JUMP_ID,
        yaw: 0,
        emote: "",
        vehicle: false,
        grounded: undefined as boolean | undefined,
      },
    });
    const stream = remoteJumpStream(clip, { jitterMs: [...scenario.jitterMs] });
    let shadowVisible = false,
      queries = 0,
      animations = 0,
      airborneFrames = 0,
      landings = 0,
      foldSamples = 0;
    let lastAnimatedGrounded: boolean | undefined,
      latestState: AvatarAnimationState | undefined;
    let cachedFloorQuery: AvatarAnimationState["groundHeight"];
    const originalUpdate = animation.update.bind(animation);
    animation.update = (state, dt) => {
      animations++;
      latestState = state;
      const query = state.groundHeight ?? state.touchdownGroundHeight;
      if (query) {
        cachedFloorQuery ??= query;
        assert.equal(
          query,
          cachedFloorQuery,
          "reuse one avatar-owned live-root query across gait frames",
        );
      }
      originalUpdate(state, dt);
    };
    const game = Object.assign(Object.create(Game.prototype), {
      localId: "local",
      quality: "low",
      flashlightOn: false,
      camera: { position: Vector3.Zero() },
      actor: { grounded: true },
      sim: {
        floorHeight(x: number, z: number, y: number) {
          queries++;
          return clip.floorHeight(x, z, y);
        },
      },
      contactShadows: {
        set(...args: unknown[]) {
          shadowVisible = args.at(-1) as boolean;
        },
      },
    });
    let minimumHipToAnkle = Infinity,
      maximumLandingSoleGap = -Infinity,
      minimumLandingSoleGap = Infinity;
    try {
      for (let tick = 1; tick <= 300; tick++) {
        const pose = stream.sample(tick / 60);
        if (!pose) continue;
        Object.assign(avatar.target, pose);
        const feet = new Vector3(pose.x, pose.y - 0.8, pose.z);
        game.camera.position.copyFrom(feet).z += scenario.distance;
        const before = animations,
          queriesBefore = queries;
        game.updateAvatarPresentation(
          REMOTE_JUMP_ID,
          avatar,
          feet,
          1 / 60,
          true,
        );
        assert.equal(
          shadowVisible,
          pose.grounded === true,
          "shadow cannot claim contact during interpolated flight",
        );
        if (pose.grounded !== false && lastAnimatedGrounded !== false)
          assert.equal(
            queries,
            queriesBefore,
            "remote grounded gait must not introduce terrain IK rays",
          );
        if (animations === before) continue;
        assert.equal(
          latestState!.grounded,
          pose.grounded,
          "animation and position consume the same sampled packet",
        );
        if (pose.grounded === false) {
          airborneFrames++;
          assert.equal(animation.contacts.left.planted, false);
          assert.equal(animation.contacts.right.planted, false);
          assert.ok(
            queries - queriesBefore <= 1,
            "flight uses at most one descent-floor query, not full remote IK",
          );
        }
        const landing =
          lastAnimatedGrounded === false &&
          pose.grounded === true &&
          tick / 60 > 1;
        lastAnimatedGrounded = pose.grounded;
        rig.root.computeWorldMatrix(true);
        const inverse = rig.root.getWorldMatrix().clone().invert();
        for (const [hip, knee, foot] of [
          [rig.left, rig.leftKnee, rig.leftFoot],
          [rig.right, rig.rightKnee, rig.rightFoot],
        ]) {
          const local = [hip, knee, foot].map((node) => {
            node.computeWorldMatrix(true);
            return Vector3.TransformCoordinates(
              node.getAbsolutePosition(),
              inverse,
            );
          });
          minimumHipToAnkle = Math.min(
            minimumHipToAnkle,
            local[0].y - local[2].y,
          );
          assert.ok(
            local[0].y - local[2].y > 0.18,
            "network jump cannot invert the legs",
          );
          if (
            pose.grounded === false &&
            feet.y > clip.frames[clip.apex].position.y - 0.03
          ) {
            assert.ok(
              local[2].y > 0.1,
              "authoritative flight must visibly fold the legs near the apex",
            );
            foldSamples++;
          }
          assert.ok(
            Math.abs(
              Vector3.Distance(local[0], local[1]) - rig.measurements.thigh,
            ) < 3e-5,
          );
          assert.ok(
            Math.abs(
              Vector3.Distance(local[1], local[2]) - rig.measurements.shin,
            ) < 3e-5,
          );
          const thigh = local[1].subtract(local[0]),
            shin = local[2].subtract(local[1]);
          assert.ok(
            thigh.y * shin.z - thigh.z * shin.y >= -3e-6,
            "knee hinge cannot reverse",
          );
          if (landing) {
            let soleGap = Infinity;
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
                const floor = clip.floorHeight(point.x, point.z, feet.y);
                if (floor !== undefined)
                  soleGap = Math.min(soleGap, point.y - floor);
              }
            }
            minimumLandingSoleGap = Math.min(minimumLandingSoleGap, soleGap);
            maximumLandingSoleGap = Math.max(maximumLandingSoleGap, soleGap);
            assert.ok(
              soleGap >= -0.005 && soleGap < 0.025,
              `first animated landing sole gap ${JSON.stringify({ soleGap, scenario, tick, feet: feet.asArray(), floor: clip.floorHeight(feet.x, feet.z, feet.y), contact: foot === rig.leftFoot ? animation.contacts.left : animation.contacts.right })}`,
            );
          }
        }
        if (landing) landings++;
      }
      assert.ok(airborneFrames > 8);
      assert.ok(foldSamples > 0);
      assert.equal(landings, 1);
      assert.equal(stream.delivered, 90);
      assert.equal(lod.level, scenario.distance === 20 ? "medium" : "near");
      assert.equal(animation.gait, "idle");
      reports.push({
        ...scenario,
        animations,
        airborneFrames,
        landings,
        foldSamples,
        queries,
        minimumHipToAnkle,
        minimumLandingSoleGap,
        maximumLandingSoleGap,
      });
    } finally {
      rig.root.dispose();
      pool.dispose();
      scene.dispose();
      engine.dispose();
      clip.dispose();
    }
  }
  console.log("Remote jump 20Hz→60Hz", JSON.stringify(reports));
});

test("missing contacts retain the height-following fallback and far proxies add no animation or floor queries", async () => {
  const clip = await createJumpClip({ mode: "run" });
  try {
    for (const far of [false, true]) {
      const engine = new NullEngine(),
        scene = new Scene(engine),
        pool = new AvatarPrimitivePool(scene);
      const config = applyAvatarPreset(far ? 4 : 1, DEFAULT_AVATAR);
      const rig = createAvatarRig(scene, config, pool),
        lod = new AvatarLodController(scene, pool, rig, config),
        animation = new AvatarAnimator(rig);
      const avatar = Object.assign(rig, {
        lod,
        animation,
        target: { id: REMOTE_JUMP_ID, yaw: 0, emote: "", vehicle: false },
      });
      const stream = remoteJumpStream(clip, {
        omitGrounded: !far,
        latencyMs: 90,
        jitterMs: [0, 15, -10],
      });
      let animations = 0,
        shadows = 0;
      const original = animation.update.bind(animation);
      animation.update = (state, dt) => {
        animations++;
        assert.equal(state.grounded, undefined);
        assert.equal(state.groundHeight, undefined);
        assert.equal(state.touchdownGroundHeight, undefined);
        original(state, dt);
      };
      const game = Object.assign(Object.create(Game.prototype), {
        localId: "local",
        quality: "low",
        flashlightOn: false,
        camera: { position: Vector3.Zero() },
        actor: { grounded: true },
        sim: {
          floorHeight() {
            assert.fail("unknown/far pose must not perform terrain queries");
          },
        },
        contactShadows: {
          set(...args: unknown[]) {
            if (args.at(-1)) shadows++;
          },
        },
      });
      try {
        let minimumRoot = Infinity,
          maximumRoot = -Infinity;
        for (let tick = 1; tick <= 300; tick++) {
          const pose = stream.sample(tick / 60);
          if (!pose) continue;
          Object.assign(avatar.target, pose);
          const feet = new Vector3(pose.x, pose.y - 0.8, pose.z);
          game.camera.position.copyFrom(feet).z += far ? 80 : 3;
          game.updateAvatarPresentation(
            REMOTE_JUMP_ID,
            avatar,
            feet,
            1 / 60,
            true,
          );
          assert.deepEqual(rig.root.position.asArray(), feet.asArray());
          minimumRoot = Math.min(minimumRoot, feet.y);
          maximumRoot = Math.max(maximumRoot, feet.y);
          if (!far) {
            rig.hips.computeWorldMatrix(true);
            for (const foot of [rig.leftFoot, rig.rightFoot]) {
              foot.computeWorldMatrix(true);
              assert.ok(
                foot.getAbsolutePosition().y <
                  rig.hips.getAbsolutePosition().y - 0.18,
              );
            }
          }
        }
        assert.ok(
          maximumRoot - minimumRoot > 0.5,
          "the received root genuinely rises and falls",
        );
        assert.equal(lod.level, far ? "far" : "near");
        assert.equal(
          Object.hasOwn(avatar, "floorQuery"),
          false,
          "unknown/far avatars allocate no floor callback",
        );
        assert.equal(
          shadows,
          0,
          "unknown contact is not proof of supporting ground",
        );
        assert.equal(far ? animations === 0 : animations > 250, true);
      } finally {
        rig.root.dispose();
        pool.dispose();
        scene.dispose();
        engine.dispose();
      }
    }
  } finally {
    clip.dispose();
  }
});
