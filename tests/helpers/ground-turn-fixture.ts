import { Simulation, initPhysics } from "../../shared/simulation";
import { stepRigidWorld } from "../../shared/physics-step";
import { FIXED_DT } from "../../shared/netcode";
import { SPAWN } from "../../shared/world";
import type { Vec3 } from "../../shared/types";

export type GroundTurnFrame = {
  time: number;
  position: Vec3;
  yaw: number;
  grounded: boolean;
};
export async function createGroundTurnClip(
  turn: "start" | "right-angle" | "reverse",
  sprint = false,
) {
  await initPhysics();
  const sim = new Simulation(),
    actor = sim.add("ground turn QA", { ...SPAWN });
  const frames: GroundTurnFrame[] = [];
  for (let tick = 0; tick < 300; tick++) {
    const moving = tick >= 50 && tick < 210;
    const yaw =
      tick < 110 || turn === "start"
        ? Math.PI / 2
        : turn === "right-angle"
          ? Math.PI
          : -Math.PI / 2;
    actor.step({
      x: moving ? Math.sin(yaw) : 0,
      z: moving ? Math.cos(yaw) : 0,
      yaw,
      jump: false,
      run: sprint,
      seq: tick + 1,
    });
    stepRigidWorld(sim.world);
    const position = actor.position;
    frames.push({
      time: (tick + 1) * FIXED_DT,
      position: { x: position.x, y: position.y - 0.8, z: position.z },
      yaw: actor.yaw,
      grounded: actor.grounded,
    });
  }
  let disposed = false;
  return {
    frames,
    floorHeight: (x: number, z: number, feetY: number) =>
      sim.floorHeight(x, z, feetY, actor),
    sample(time: number): GroundTurnFrame {
      const at = Math.max(0, Math.min(frames.length - 1, time / FIXED_DT - 1));
      const index = Math.floor(at),
        a = frames[index],
        b = frames[Math.min(index + 1, frames.length - 1)],
        t = at - index;
      return {
        time,
        position: {
          x: a.position.x + (b.position.x - a.position.x) * t,
          y: a.position.y + (b.position.y - a.position.y) * t,
          z: a.position.z + (b.position.z - a.position.z) * t,
        },
        yaw:
          a.yaw +
          Math.atan2(Math.sin(b.yaw - a.yaw), Math.cos(b.yaw - a.yaw)) * t,
        grounded: t === 0 ? a.grounded : a.grounded && b.grounded,
      };
    },
    dispose() {
      if (!disposed) {
        disposed = true;
        sim.dispose();
      }
    },
  };
}
