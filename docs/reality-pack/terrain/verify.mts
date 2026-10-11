import fs from "node:fs";
import crypto from "node:crypto";
import RAPIER from "@dimforge/rapier3d-compat";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { GROUND_RECTS } from "../../../shared/world";
import {
  TERRAIN,
  createTerrainTiles,
  terrainMeshData,
  terrainCollisionData,
  groundHeight,
  REALITY_GROUND,
} from "../../../shared/terrain";
import { buildStreets } from "../../../client/streets-renderer";
import { buildLandcover } from "../../../client/vegetation";
const files = [
  "shared/terrain.ts",
  "shared/data/terrain-grid.json",
  "shared/data/reality-ground.json",
  "shared/streets.ts",
  "client/terrain-renderer.ts",
  "client/streets-renderer.ts",
  "client/vegetation.ts",
  "tests/terrain.test.ts",
  "tests/streets.test.ts",
  "tests/vegetation.test.ts",
];
const hashes = Object.fromEntries(
  files.map((file) => [
    file,
    crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex"),
  ]),
);
const coverage = { minX: -152, maxX: 352, minZ: -172, maxZ: 136 };
const tiles = createTerrainTiles(GROUND_RECTS, coverage),
  mesh = terrainMeshData(tiles),
  collision = terrainCollisionData(tiles);
await RAPIER.init();
const world = new RAPIER.World({ x: 0, y: -18, z: 0 });
world.createCollider(
  RAPIER.ColliderDesc.trimesh(
    collision.vertices,
    collision.indices,
    RAPIER.TriMeshFlags.FIX_INTERNAL_EDGES,
  ),
);
world.step();
let probes = 0,
  maxError = 0,
  basementProbes = 0;
for (let x = -149.13; x < 350; x += 7.17)
  for (let z = -169.17; z < 134; z += 7.13) {
    const inside =
      (x > 0 && x < 16 && z > -90 && z < -20) ||
      (x > -7 && x < 0 && z > -76 && z < -70);
    const hit = world.castRay(
      new RAPIER.Ray({ x, y: 80, z }, { x: 0, y: -1, z: 0 }),
      160,
      true,
    );
    if (inside) {
      if (hit) throw new Error("Closed B6 basement");
      basementProbes++;
      continue;
    }
    if (!hit) throw new Error("Ground gap");
    maxError = Math.max(
      maxError,
      Math.abs(80 - hit.timeOfImpact - groundHeight(x, z)),
    );
    probes++;
  }
world.free();
const engine = new NullEngine(),
  scene = new Scene(engine);
scene.useRightHandedSystem = true;
const street = buildStreets({ scene, lights: [] });
const streetTriangles = street.meshes.reduce(
  (sum, m) => sum + m.getTotalIndices() / 3,
  0,
);
buildLandcover(scene);
const cover = scene.meshes.filter(
  (m) => m.metadata?.vegetation === "mapped-surface",
) as Mesh[];
const audit = {
  checkedAt: new Date().toISOString(),
  scope: "Geometry/physics audit; NullEngine is NOT a GPU/FPS result",
  sourceHashes: hashes,
  sourceData: {
    provider: TERRAIN.source.provider,
    referenceBpv: TERRAIN.reference.absoluteHeight,
    grid: TERRAIN.grid,
    tifSha256: TERRAIN.source.tifSha256,
    rangeBpv: TERRAIN.statistics,
  },
  terrain: {
    coverage,
    tiles: tiles.length,
    clippedTiles: tiles.filter((t) => t.mesh).length,
    vertices: mesh.positions.length / 3,
    triangles: mesh.indices.length / 3,
    physicsRaycasts: probes,
    basementExclusionProbes: basementProbes,
    maxRayHeightErrorMetres: maxError,
  },
  roads: {
    meshes: street.meshes.length,
    triangles: streetTriangles,
    lamps: street.lamps,
    crossings: street.crossings,
  },
  landcover: {
    meshes: cover.length,
    triangles: cover.reduce((sum, m) => sum + m.getTotalIndices() / 3, 0),
  },
  photoPack: {
    captureDate: REALITY_GROUND.source.captureDate,
    additionalAsphaltFillArea: REALITY_GROUND.surfaces[0].additionalFillArea,
    paintLines: REALITY_GROUND.paintLines.length,
    representativeParkingSlots: REALITY_GROUND.parkingSlots.length,
    logoPoints: REALITY_GROUND.paint[0].points,
  },
  browserVerification: {
    url: "http://127.0.0.1:5173/docs/reality-pack/terrain/preview.html",
    screenshots: ["browser-parking.jpg", "browser-terrain.jpg"],
    photoClick: { x: 105.1, z: 0.1, heightBpv: 323.34 },
    note: "Actual Chromium WebGL preview, normal north-up orientation, readable non-inverted authored lettering; test tab closed to release GPU. Full game performance is a separate root audit.",
  },
};
fs.writeFileSync(
  new URL("./audit.json", import.meta.url),
  JSON.stringify(audit, null, 2),
);
console.log(JSON.stringify(audit, null, 2));
scene.dispose();
engine.dispose();
