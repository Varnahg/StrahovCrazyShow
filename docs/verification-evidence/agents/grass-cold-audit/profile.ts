/** CPU-only repeatable real grass-controller workload. Run baseline and candidate
 * in separate processes with exclusive heavy-validation ownership. */
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import { UniversalCamera } from "@babylonjs/core/Cameras/universalCamera";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { PhotographicGrass } from "../../../../client/photographic-grass";
import { acquireGrassResources } from "../../../../client/photo-grass-resources";
import { groundHeight } from "../../../../shared/terrain";

const sha = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
const paths = ["client/photographic-grass.ts", "client/photo-grass-placement.ts", "client/photo-grass-budget.ts", "client/photo-grass-batch.ts", "client/photo-grass-resources.ts", "shared/vegetation.ts", "shared/terrain.ts", "tests/photo-grass.test.ts"];
const sourceHashes = Object.fromEntries(paths.map(path => [path, sha(readFileSync(path))]));
const engine = new NullEngine({ renderWidth: 1280, renderHeight: 720, textureSize: 512, deterministicLockstep: false, lockstepMaxSteps: 4 });
const scene = new Scene(engine);
scene.useRightHandedSystem = true;
const x = 110.5, z = 34.5;
const camera = new UniversalCamera("grass CPU workload", new Vector3(x, groundHeight(x, z) + 1.7, z), scene);
camera.minZ = 0.05;
camera.fov = 0.8;
camera.setTarget(new Vector3(x, groundHeight(x, z), z + 3));
scene.render();
const pack = JSON.parse(readFileSync("public/models/vegetation/grass/geometry.json", "utf8"));
const recipe = JSON.parse(readFileSync("public/models/vegetation/grass/material.json", "utf8"));
const resources = acquireGrassResources(scene, pack, recipe, 1024, () => new Texture(null, scene));
const grass = new PhotographicGrass(scene, pack, recipe, resources);
const stages: object[] = [];
let frame = 0;
try {
  for (const [name, quality, count] of [["cold-medium", "medium", 180], ["warm-movement", "medium", 120], ["quality-high", "high", 180], ["quality-low", "low", 120], ["teleport-medium", "medium", 180]] as const) {
    const samples: object[] = [], times: number[] = [];
    for (let i = 0; i < count; i++, frame++) {
      const px = name === "warm-movement" ? x + i * 0.02 : name === "teleport-medium" ? 333.5 : name === "cold-medium" ? x : x + 2.38;
      const pz = name === "teleport-medium" ? -109.5 : z;
      camera.position.set(px, groundHeight(px, pz) + 1.7, pz);
      camera.setTarget(new Vector3(px, groundHeight(px, pz), pz + 3));
      const started = performance.now();
      grass.update({ time: 1 + frame / 60, quality, wind: { x: 3, z: 0 } });
      const ms = performance.now() - started;
      times.push(ms);
      samples.push({ frame: i, ms, instances: grass.stats.instances, triangles: grass.stats.triangles, cachedTiles: grass.stats.cachedTiles });
    }
    const sorted = [...times].sort((a, b) => a - b);
    const roots = [...(grass as any).roots.values()].map((r: any) => [r.id, r.level, r.x, r.y, r.z]).sort((a, b) => Number(a[0]) - Number(b[0]));
    stages.push({ name, quality, frames: count, totalMs: times.reduce((a, b) => a + b, 0), firstMs: times[0], maxMs: sorted.at(-1), p95Ms: sorted[Math.ceil(sorted.length * 0.95) - 1], p99Ms: sorted[Math.ceil(sorted.length * 0.99) - 1], rootHash: sha(JSON.stringify(roots)), finalStats: { ...grass.stats }, samples });
  }
} finally {
  grass.dispose();
  scene.dispose();
  engine.dispose();
}
const result = { kind: "CPU grass update only; NullEngine excludes GPU/FPS", gitHead: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(), sourceHashes, renderWidth: 1280, renderHeight: 720, cameraFov: 0.8, stages };
if (process.argv[2]) writeFileSync(process.argv[2], JSON.stringify(result, null, 2) + "\n");
console.log(JSON.stringify({ ...result, stages: stages.map(({ samples, ...stage }: any) => stage) }, null, 2));
