import { Simulation, initPhysics, CHARACTER_HALF_HEIGHT, CHARACTER_RADIUS } from "../../shared/simulation";
import { stepRigidWorld } from "../../shared/physics-step";
import { FIXED_DT } from "../../shared/netcode";
import { SPAWN } from "../../shared/world";
import { B6_LAYOUT } from "../../shared/b6-interior";
import type { Vec3 } from "../../shared/types";

export type JumpClipFrame = {
  time: number;
  position: Vec3;
  yaw: number;
  grounded: boolean;
  vertical: number;
  jumpInput: boolean;
};
export type JumpClipOptions = {
  mode?: "standing" | "run" | "sprint" | "stairs";
  jumpTick?: number;
  turnAtTakeOff?: boolean;
  repeated?: boolean;
};
export type JumpClip = {
  frames: JumpClipFrame[];
  takeoff: number;
  apex: number;
  landing: number;
  floorHeight: (x: number, z: number, footY: number) => number | undefined;
  dispose: () => void;
};

/** Explicit legacy B6 context, still used by photogrammetry gameplay. This
 * small synthetic OUTSIDE plane meets the existing photo approach repair;
 * it never fills the basement or replaces any B6 room/stair collider.
 * Current CAD building coverage belongs to cad-building-world.test.ts. */
export function legacyB6Simulation() {
  return new Simulation({
    positions: new Float32Array([-8, -.16, -87, -2, -.16, -87, -8, -.16, -82.1, -2, -.16, -82.1]),
    indices: new Uint32Array([0, 2, 1, 1, 2, 3]),
  });
}

/** Browser-compatible fixture: original Actor/KCC, one initial placement only.
 * Each sample is captured AFTER step+world advance, so position and flags have
 * the same timestamp. No animation code changes or drives this trajectory. */
export async function createJumpClip(
  options: JumpClipOptions = {},
): Promise<JumpClip> {
  await initPhysics();
  const mode = options.mode ?? "run",
    sim = mode === "stairs" ? legacyB6Simulation() : new Simulation(),
    jumpTick = options.jumpTick ?? 94;
  const start =
    mode === "stairs"
      ? {
          x: B6_LAYOUT.approachRoute[0][0],
          z: B6_LAYOUT.approachRoute[0][1] - 1,
          y: 0,
        }
      : { ...SPAWN };
  if (mode === "stairs") start.y = sim.surfaceHeight(start.x, start.z) + 1;
  const actor = sim.add("actual jump QA", start),
    frames: JumpClipFrame[] = [];
  let disposed = false;
  for (let tick = 0; tick < 270; tick++) {
    const moving = mode !== "standing" && tick >= 50 && tick < 210;
    const direction = mode === "stairs" ? 0 : Math.PI / 2;
    const yaw =
      direction + (options.turnAtTakeOff && tick >= jumpTick ? Math.PI / 2 : 0);
    const jump =
      tick === jumpTick || (!!options.repeated && tick === jumpTick + 72);
    actor.step({
      seq: tick + 1,
      x: moving ? Math.sin(yaw) : 0,
      z: moving ? Math.cos(yaw) : 0,
      yaw,
      run: mode === "sprint",
      jump,
    });
    stepRigidWorld(sim.world);
    const p = actor.position;
    frames.push({
      time: (tick + 1) * FIXED_DT,
      position: { x: p.x, y: p.y - CHARACTER_HALF_HEIGHT - CHARACTER_RADIUS, z: p.z },
      yaw: actor.yaw,
      grounded: actor.grounded,
      vertical: actor.vertical,
      jumpInput: jump,
    });
  }
  const takeoff = frames.findIndex(
    (frame, i) => i >= jumpTick && !frame.grounded,
  );
  if (takeoff < 0) {
    sim.dispose();
    throw new Error("Recorded KCC clip never left the ground");
  }
  let landing = frames.findIndex((frame, i) => i > takeoff && frame.grounded);
  if (landing < 0) landing = frames.length - 1;
  let apex = takeoff;
  for (let i = takeoff; i <= landing; i++)
    if (frames[i].position.y > frames[apex].position.y) apex = i;
  return {
    frames,
    takeoff,
    apex,
    landing,
    floorHeight: (x, z, footY) => sim.floorHeight(x, z, footY, actor),
    dispose() {
      if (disposed) return;
      disposed = true;
      sim.dispose();
    },
  };
}

/** Interpolate only within an aligned pair. An interval touching an airborne
 * endpoint remains airborne until the exact grounded endpoint is reached. */
export function sampleJumpClip(clip: JumpClip, time: number): JumpClipFrame {
  const at = Math.max(0, Math.min(clip.frames.length - 1, time / FIXED_DT - 1));
  const index = Math.floor(at),
    a = clip.frames[index],
    b = clip.frames[Math.min(index + 1, clip.frames.length - 1)],
    t = at - index;
  const mix = (x: number, y: number) => x + (y - x) * t;
  return {
    ...a,
    time,
    position: {
      x: mix(a.position.x, b.position.x),
      y: mix(a.position.y, b.position.y),
      z: mix(a.position.z, b.position.z),
    },
    yaw:
      a.yaw + Math.atan2(Math.sin(b.yaw - a.yaw), Math.cos(b.yaw - a.yaw)) * t,
    grounded: t === 0 ? a.grounded : a.grounded && b.grounded,
    vertical: mix(a.vertical, b.vertical),
  };
}
