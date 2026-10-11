import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { AvatarAnimator } from "../../../client/animation";
import {
  AvatarPrimitivePool,
  createAvatarRig,
} from "../../../client/avatar-renderer";
import { DEFAULT_AVATAR } from "../../../shared/types";
import { writeFileSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { AvatarAnimator as O2Animator } from "./animation-o2";
const baseline = process.argv.includes("--baseline");
const Animator = baseline ? O2Animator : AvatarAnimator;
const results = [];
for (const fps of [30, 60, 144])
  for (const speed of [1.8, 4.6, 7]) {
    const engine = new NullEngine(),
      scene = new Scene(engine),
      pool = new AvatarPrimitivePool(scene),
      rig = createAvatarRig(scene, DEFAULT_AVATAR, pool),
      anim = new Animator(rig);
    let z = 0,
      previous: any,
      start = 0,
      stop = 0,
      steady = 0,
      detail: any;
    for (let i = 0; i < fps * 6; i++) {
      const moving = i >= fps && i < fps * 3;
      z += moving ? speed / fps : 0;
      rig.root.position.set(0, 0, z);
      anim.update(
        {
          position: rig.root.position,
          yaw: 0,
          grounded: true,
          groundHeight: () => 0,
        },
        1 / fps,
      );
      const curr = [rig.leftFoot, rig.rightFoot].map((foot) => {
        foot.computeWorldMatrix(true);
        return foot.getAbsolutePosition().clone();
      });
      if (previous)
        for (let side = 0; side < 2; side++) {
          const v = Math.abs(curr[side].y - previous[side].y) * fps;
          if (i >= fps && i < fps * 1.5) start = Math.max(start, v);
          if (i >= fps * 1.5 && i < fps * 3) steady = Math.max(steady, v);
          if (i >= fps * 3 && v > stop) {
            stop = v;
            detail = {
              i,
              t: i / fps,
              phase: anim.phase,
              side,
              from: previous[side].asArray(),
              to: curr[side].asArray(),
            };
          }
        }
      previous = curr;
    }
    results.push({
      fps,
      speed,
      startMaxVerticalSpeed: start,
      steadyMaxVerticalSpeed: steady,
      stopMaxVerticalSpeed: stop,
      detail,
    });
    rig.root.dispose();
    pool.dispose();
    scene.dispose();
    engine.dispose();
  }
const source = baseline
  ? "docs/characters/locomotion-study/animation-o2.ts"
  : "client/animation.ts";
const report = {
  source,
  sourceSha256: createHash("sha256").update(readFileSync(source)).digest("hex"),
  note: "CPU FK transforms only. fps means fixed animation update Hz, not measured GPU/game FPS. Prescribed motion: idle 1s, constant travel 2s, stop 3s, actual floor query and production rig. Baseline has only relocated type imports.",
  scenarios: results,
};
writeFileSync(process.argv[2], JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify(results.map(({ detail, ...summary }) => summary)));
