import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import RAPIER from "@dimforge/rapier3d-compat";
import {
  applyPhotogrammetryGroundRepairs,
  groundRepairStats,
  getPhotogrammetryGroundPatchGeometry,
  PHOTOGRAMMETRY_GROUND_REPAIRS,
  isGroundRepairProtected,
} from "../shared/photogrammetry-ground";
import { sourceGroundHeight, groundHeight } from "../shared/terrain";
import { isStreetSurface, STREET_FEATURES } from "../shared/streets";
import {
  decodeI3SGeometry,
  photogrammetryPositions,
  type PhotogrammetryManifest,
} from "../shared/photogrammetry";
import rawManifest from "../shared/data/photogrammetry.json";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { buildPhotogrammetryGroundRepairs } from "../client/photogrammetry-ground";

const region = PHOTOGRAMMETRY_GROUND_REPAIRS.patches[0],
  center = {
    x: region.polygon.reduce((s, p) => s + p[0], 0) / 4,
    z: region.polygon.reduce((s, p) => s + p[1], 0) / 4,
  };
const noiseTriangle = (offset: number) =>
  new Float32Array([
    center.x - 0.12,
    sourceGroundHeight(center.x - 0.12, center.z - 0.12) + offset,
    center.z - 0.12,
    center.x + 0.12,
    sourceGroundHeight(center.x + 0.12, center.z - 0.12) + offset,
    center.z - 0.12,
    center.x,
    sourceGroundHeight(center.x, center.z + 0.12) + offset,
    center.z + 0.12,
  ]);

test("only an audited public footway ground interval is repaired; source arrays, XZ and UV stay untouched", () => {
  const source = noiseTriangle(0.2),
    before = new Float32Array(source),
    uv = new Float32Array([0.1, 0.2, 0.5, 0.7, 0.8, 0.9]),
    beforeUv = new Float32Array(uv),
    repaired = applyPhotogrammetryGroundRepairs(source);
  assert.deepEqual(source, before);
  assert.deepEqual(uv, beforeUv);
  assert.notEqual(source, repaired);
  for (let i = 0; i < source.length; i += 3) {
    assert.equal(repaired[i], source[i]);
    assert.equal(repaired[i + 2], source[i + 2]);
    assert(
      Math.abs(repaired[i + 1] - sourceGroundHeight(source[i], source[i + 2])) <
        1e-5,
    );
  }
  assert.equal(groundRepairStats(source, repaired).changedVertices, 3);
  assert(groundRepairStats(source, repaired).maxDeltaMetres <= 0.201);
  assert.deepEqual(applyPhotogrammetryGroundRepairs(source), repaired);
});

test("higher objects, vertical trunks and real curbs are not flattened; welded curb vertices remain continuous", () => {
  const roof = noiseTriangle(1.3);
  assert.deepEqual(applyPhotogrammetryGroundRepairs(roof), roof);
  const x = center.x,
    z = center.z,
    h = sourceGroundHeight(x, z),
    trunk = new Float32Array([x, h, z, x, h + 2, z, x + 0.1, h + 1, z + 0.1]);
  assert.deepEqual(applyPhotogrammetryGroundRepairs(trunk), trunk);
  const floor = noiseTriangle(0.15),
    curb = new Float32Array([
      floor[0],
      floor[1],
      floor[2],
      floor[0],
      floor[1] + 0.25,
      floor[2],
      floor[0] + 0.1,
      floor[1] + 0.25,
      floor[2],
    ]),
    joined = new Float32Array([...floor, ...curb]),
    fixed = applyPhotogrammetryGroundRepairs(joined);
  assert.equal(fixed[1], joined[1]);
  assert.equal(fixed[10], joined[10]);
  assert.deepEqual(fixed.slice(9), curb);
});

test("original old-spawn triangle 1056 is preserved as a possible actual court fence, not misclassified as a bad ground hump", () => {
  const manifest = rawManifest as unknown as PhotogrammetryManifest,
    node = manifest.nodes.find((n) => n.id === "1127320")!,
    bytes = readFileSync("public" + node.geometry),
    decoded = decodeI3SGeometry(bytes),
    source = photogrammetryPositions(decoded, node, manifest),
    triangle = source.slice(1056 * 9, 1057 * 9),
    fixed = applyPhotogrammetryGroundRepairs(source);
  assert.deepEqual(fixed.slice(1056 * 9, 1057 * 9), triangle);
  assert(isGroundRepairProtected(22, -14));
  assert(
    Math.max(triangle[1], triangle[4], triangle[7]) -
      Math.min(triangle[1], triangle[4], triangle[7]) >
      0.6,
  );
  assert.deepEqual(decoded.uvs, decodeI3SGeometry(bytes).uvs);
  const b6 = new Float32Array([-4.8, 0, -80, -4.6, 0, -80, -4.7, 0, -79.8]);
  assert.deepEqual(applyPhotogrammetryGroundRepairs(b6), b6);
  assert.notEqual(
    sourceGroundHeight(-4.85, -77.67),
    groundHeight(-4.85, -77.67),
    "fixture must distinguish original DMR from adapted B6 foundation",
  );
});

test("source-proven pedestrian gap patches stay within existing street polygons and have identical render/collision heights", () => {
  const geometry = getPhotogrammetryGroundPatchGeometry();
  assert.equal(geometry.patchCount, 13);
  assert(geometry.areaSquareMetres > 60 && geometry.areaSquareMetres <= 96);
  assert(geometry.indices.length / 3 < 2000);
  assert(geometry.parts.length <= 4);
  for (const region of PHOTOGRAMMETRY_GROUND_REPAIRS.patches) {
    const way = STREET_FEATURES.find((f) => f.id === region.wayId)!;
    assert(way && ["footway", "sidewalk"].includes(way.kind));
    assert.equal(region.widthMetres, way.width);
    assert(region.sourceNodeIds.length);
  }
  for (let i = 0; i < geometry.positions.length; i += 3) {
    const x = geometry.positions[i],
      y = geometry.positions[i + 1],
      z = geometry.positions[i + 2];
    assert(Number.isFinite(x + y + z));
    assert(Math.abs(y - sourceGroundHeight(x, z)) < 1e-5);
    assert(!isGroundRepairProtected(x, z));
  }
  for (let i = 0; i < geometry.indices.length; i += 3) {
    const [a, b, c] = [
        geometry.indices[i] * 3,
        geometry.indices[i + 1] * 3,
        geometry.indices[i + 2] * 3,
      ],
      p = geometry.positions,
      x = (p[a] + p[b] + p[c]) / 3,
      z = (p[a + 2] + p[b + 2] + p[c + 2]) / 3,
      normalY =
        (p[b + 2] - p[a + 2]) * (p[c] - p[a]) -
        (p[b] - p[a]) * (p[c + 2] - p[a + 2]);
    assert(isStreetSurface(x, z));
    assert(normalY > 0);
  }
  console.log("Local derived ground repair geometry", {
    patches: geometry.patchCount,
    area: geometry.areaSquareMetres,
    triangles: geometry.indices.length / 3,
    batches: geometry.parts.length,
  });
});

test("real Rapier rays hit the very same small patch surface and not an invented global fallback plane", async () => {
  await RAPIER.init();
  const data = getPhotogrammetryGroundPatchGeometry(),
    world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
  world.createCollider(
    RAPIER.ColliderDesc.trimesh(
      data.positions,
      data.indices,
      RAPIER.TriMeshFlags.FIX_INTERNAL_EDGES,
    ),
  );
  world.step();
  try {
    for (let i = 0; i < data.indices.length; i += 21) {
      const ids = [
          data.indices[i],
          data.indices[i + 1],
          data.indices[i + 2],
        ].map((v) => v * 3),
        x = ids.reduce((s, v) => s + data.positions[v], 0) / 3,
        z = ids.reduce((s, v) => s + data.positions[v + 2], 0) / 3,
        y = sourceGroundHeight(x, z),
        hit = world.castRay(
          new RAPIER.Ray({ x, y: y + 2, z }, { x: 0, y: -1, z: 0 }),
          4,
          true,
        );
      assert(hit);
      assert(Math.abs(y + 2 - hit.timeOfImpact - y) < 0.0001);
    }
    assert.equal(
      world.castRay(
        new RAPIER.Ray({ x: 130, y: 30, z: 12 }, { x: 0, y: -1, z: 0 }),
        100,
        true,
      ),
      null,
    );
  } finally {
    world.free();
  }
});

test("derived patch renderer uses shared arrays and disposes its batches cleanly", () => {
  const engine = new NullEngine(),
    scene = new Scene(engine),
    controller = buildPhotogrammetryGroundRepairs(scene),
    data = getPhotogrammetryGroundPatchGeometry();
  assert.equal(controller.meshes.length, data.parts.length);
  assert(
    controller.meshes.every(
      (m) => m.metadata.depthCaster === false && m.metadata.derivedRepair,
    ),
  );
  controller.dispose();
  assert.equal(scene.meshes.length, 0);
  assert.equal(scene.materials.length, 0);
  scene.dispose();
  engine.dispose();
});
