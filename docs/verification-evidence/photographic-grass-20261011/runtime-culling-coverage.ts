import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import { UniversalCamera } from "@babylonjs/core/Cameras/universalCamera";
import { Matrix, Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Frustum } from "@babylonjs/core/Maths/math.frustum";
import { PhotographicGrass } from "../../../client/photographic-grass";
import { acquireGrassResources } from "../../../client/photo-grass-resources";
import { groundHeight } from "../../../shared/terrain";

const pack = JSON.parse(
  readFileSync("public/models/vegetation/grass/geometry.json", "utf8"),
);
const recipe = JSON.parse(
  readFileSync("public/models/vegetation/grass/material.json", "utf8"),
);
const scenarios = [];
for (const bearing of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
  const engine = new NullEngine({
    renderWidth: 1280,
    renderHeight: 720,
    textureSize: 512,
    deterministicLockstep: false,
    lockstepMaxSteps: 4,
  });
  const scene = new Scene(engine);
  scene.useRightHandedSystem = true;
  const x = 110.52774810791016,
    z = 33.884925842285156,
    y = groundHeight(x, z);
  const camera = new UniversalCamera(
    "diagnostic at reported position",
    new Vector3(x, y + 1.65, z),
    scene,
  );
  camera.minZ = 0.05;
  camera.fov = 0.8;
  camera.setTarget(
    new Vector3(x + Math.sin(bearing) * 2, y, z + Math.cos(bearing) * 2),
  );
  scene.render();
  const resources = acquireGrassResources(
    scene,
    pack,
    recipe,
    1024,
    () => new Texture(null, scene),
  );
  const grass = new PhotographicGrass(scene, pack, recipe, resources);
  grass.update({ time: 1, quality: "medium", wind: { x: 0, z: 0 } });
  grass.update({ time: 1.3, quality: "medium", wind: { x: 0, z: 0 } });
  const transform = camera
    .getViewMatrix()
    .multiply(camera.getProjectionMatrix());
  const planes = Frustum.GetPlanes(transform),
    tiles = [];
  for (const mesh of scene.meshes.filter(
    (mesh) => mesh.isEnabled() && mesh.metadata?.photographicGrass,
  )) {
    const level = mesh.metadata.sourceLevel,
      g = pack.levels[level],
      count = (mesh as any).thinInstanceCount;
    const matrices = (mesh as any).thinInstanceGetWorldMatrices() as Matrix[];
    let above = 0,
      total = 0,
      minClearance = Infinity,
      maxClearance = -Infinity,
      sumHorizontalArea = 0;
    for (let i = 0; i < count; i++) {
      const final = matrices[i].multiply(mesh.getWorldMatrix());
      for (let p = 0; p < g.positions.length; p += 3) {
        const world = Vector3.TransformCoordinates(
            Vector3.FromArray(g.positions, p),
            final,
          ),
          clearance = world.y - groundHeight(world.x, world.z);
        if (clearance > 0) above++;
        total++;
        minClearance = Math.min(minClearance, clearance);
        maxClearance = Math.max(maxClearance, clearance);
      }
      for (let j = 0; j < g.indices.length; j += 3) {
        const a = Vector3.TransformCoordinates(
            Vector3.FromArray(g.positions, g.indices[j] * 3),
            final,
          ),
          b = Vector3.TransformCoordinates(
            Vector3.FromArray(g.positions, g.indices[j + 1] * 3),
            final,
          ),
          c = Vector3.TransformCoordinates(
            Vector3.FromArray(g.positions, g.indices[j + 2] * 3),
            final,
          );
        sumHorizontalArea +=
          Math.abs((b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x)) / 2;
      }
    }
    tiles.push({
      id: mesh.metadata.tile,
      level,
      instances: count,
      triangles: g.triangles * count,
      visibility: mesh.metadata.photoGrassVisibility,
      inNativeFrustum: mesh.isInFrustum(planes),
      verticesAboveSharedTerrain: above,
      totalVertices: total,
      minClearance,
      maxClearance,
      horizontalTriangleAreaSum: sumHorizontalArea,
    });
  }
  scenarios.push({
    bearingRadians: bearing,
    camera: camera.position.asArray(),
    stats: { ...grass.stats },
    tiles,
  });
  grass.dispose();
  scene.dispose();
  engine.dispose();
}
const paths = [
  "client/photographic-grass.ts",
  "client/photo-grass-transition.ts",
  "client/photo-grass-wind.ts",
  "client/photo-grass-resources.ts",
  "client/photo-grass-budget.ts",
  "client/photo-grass-placement.ts",
  "client/photo-grass-source-material.ts",
  "tests/photo-grass.test.ts",
  "docs/verification-evidence/photographic-grass-20261011/runtime-culling-coverage.ts",
  "public/models/vegetation/grass/geometry.json",
  "public/models/vegetation/grass/material.json",
];
const sourceHashes = Object.fromEntries(
  paths.map((path) => [
    path,
    createHash("sha256").update(readFileSync(path)).digest("hex"),
  ]),
);
const report = {
  timestamp: new Date().toISOString(),
  kind: "CPU native Babylon transform and coverage diagnostic, not a GPU/FPS or rendered-alpha test",
  sourceHashes,
  assumptions:
    "User location copied from root DOM. Four diagnostic bearings with eye 1.65m above shared terrain and target two horizontal metres away on terrain; these are not a reconstructed screenshot camera.",
  coverageCaveat:
    "Horizontal triangle area sums are conservative upper bounds to geometric overhead coverage within each 1m² tile, not a measured alpha-mask union. Overlap and transparent pixels can only reduce union. Ground material may still fill remaining pixels. Wind omitted.",
  scenarios,
};
writeFileSync(
  "docs/verification-evidence/photographic-grass-20261011/runtime-culling-coverage-20261012.json",
  JSON.stringify(report, null, 2) + "\n",
);
console.log(
  JSON.stringify(
    scenarios.map((s) => ({
      bearing: s.bearingRadians,
      stats: s.stats,
      culled: s.tiles.filter((t) => !t.inNativeFrustum).length,
      above:
        s.tiles.reduce((n, t) => n + t.verticesAboveSharedTerrain, 0) /
        s.tiles.reduce((n, t) => n + t.totalVertices, 0),
      horizontalAreaRange: [
        Math.min(...s.tiles.map((t) => t.horizontalTriangleAreaSum)),
        Math.max(...s.tiles.map((t) => t.horizontalTriangleAreaSum)),
      ],
    })),
    null,
    2,
  ),
);
