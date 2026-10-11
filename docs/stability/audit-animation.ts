/** CPU/transform audit only. Run: pnpm exec tsx docs/stability/audit-animation.ts */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { cpus, totalmem } from "node:os";
import { fileURLToPath } from "node:url";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { UniversalCamera } from "@babylonjs/core/Cameras/universalCamera";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { AvatarAnimator } from "../../client/animation";
import {
  AvatarPrimitivePool,
  createAvatarRig,
} from "../../client/avatar-renderer";
import { DEFAULT_AVATAR } from "../../shared/types";

function stats(samples: number[]) {
  const sorted = [...samples].sort((a, b) => a - b);
  const percentile = (value: number) =>
    sorted[Math.floor((sorted.length - 1) * value)];
  return {
    meanMs: samples.reduce((a, b) => a + b, 0) / samples.length,
    p95Ms: percentile(0.95),
    p99Ms: percentile(0.99),
    maximumMs: sorted.at(-1),
  };
}

function audit(count: number) {
  const engine = new NullEngine({
    renderWidth: 1280,
    renderHeight: 720,
    textureSize: 128,
    deterministicLockstep: false,
    lockstepMaxSteps: 4,
  });
  const scene = new Scene(engine);
  const camera = new UniversalCamera("audit", new Vector3(0, 6, -25), scene);
  camera.setTarget(new Vector3(0, 1, 0));
  scene.activeCamera = camera;
  const pool = new AvatarPrimitivePool(scene);
  const entities = Array.from({ length: count }, (_, i) => {
    const rig = createAvatarRig(
      scene,
      { ...DEFAULT_AVATAR, preset: i % 6 },
      pool,
      "audit " + i,
    );
    return { rig, animation: new AvatarAnimator(rig) };
  });
  const animationTimes: number[] = [];
  const traversalTimes: number[] = [];
  let maximumRootTranslationError = 0;
  for (let frame = 0; frame < 1080; frame++) {
    const time = frame / 60;
    const start = performance.now();
    entities.forEach(({ rig, animation }, i) => {
      const speed = [0, 1.8, 4.6, 7][i % 4];
      const radius = 6 + (i % 4);
      const angle = (time * speed) / radius + i * 0.2;
      const x = Math.cos(angle) * radius + (i % 10) * 1.1;
      const z = Math.sin(angle) * radius + Math.floor(i / 10) * 1.1;
      rig.root.position.set(x, 0, z);
      animation.update(
        {
          position: rig.root.position,
          yaw: -angle,
          emote: i % 7 === 0 ? "👋" : "",
        },
        1 / 60,
      );
      maximumRootTranslationError = Math.max(
        maximumRootTranslationError,
        Math.hypot(
          rig.root.position.x - x,
          rig.root.position.z - z,
          rig.root.position.y,
        ),
      );
    });
    const afterAnimation = performance.now();
    scene.render();
    const afterTraversal = performance.now();
    if (frame >= 180) {
      animationTimes.push(afterAnimation - start);
      traversalTimes.push(afterTraversal - afterAnimation);
    }
  }
  const result = {
    avatarCount: count,
    warmupFrames: 180,
    measuredFrames: 900,
    fixedAnimationDt: 1 / 60,
    animatorWithPositionAssignment: stats(animationTimes),
    nullEngineSceneRenderCpu: stats(traversalTimes),
    maximumRootTranslationError,
    note: "Synthetic render rigs, no network/physics/HUD/GPU. NullEngine has no GPU work; these are CPU component costs, not game FPS.",
  };
  for (const { rig } of entities) rig.root.dispose();
  pool.dispose();
  scene.dispose();
  engine.dispose();
  return result;
}

const sources = [
  "../../client/animation.ts",
  "../../client/labels.ts",
  "../../client/avatar-renderer.ts",
];
const result = {
  recordedAt: new Date().toISOString(),
  userTimezone: "Europe/Prague",
  runtime: process.version,
  cpu: cpus()[0]?.model,
  logicalCpus: cpus().length,
  totalMemoryGiB: totalmem() / 1024 ** 3,
  renderer: "Babylon.js 9.30.0 NullEngine (no GPU)",
  sourceSha256: Object.fromEntries(
    sources.map((source) => [
      source.replace("../../", ""),
      createHash("sha256")
        .update(readFileSync(new URL(source, import.meta.url)))
        .digest("hex"),
    ]),
  ),
  scenarios: [1, 30, 100].map(audit),
};
const output = fileURLToPath(new URL("animation-audit.json", import.meta.url));
writeFileSync(output, JSON.stringify(result, null, 2) + "\n");
console.log(JSON.stringify(result, null, 2));
