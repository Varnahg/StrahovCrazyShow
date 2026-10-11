import test from "node:test";
import assert from "node:assert/strict";
import RAPIER from "@dimforge/rapier3d-compat";
import earcut from "earcut";
import { GROUND_RECTS } from "../shared/world";
import { B6_LAYOUT } from "../shared/b6-interior";
import { STREET_SURFACES, streetSurfaceAt } from "../shared/streets";
import {
  TERRAIN,
  TERRAIN_REFERENCE_BPV,
  groundHeight,
  sourceGroundHeight,
  groundNormal,
  createTerrainTiles,
  terrainMeshData,
  drapeTriangles,
  REALITY_GROUND,
  PARKING_SLOTS,
  isRealityGroundSurface,
  terrainCollisionData,
  type GroundPoint,
} from "../shared/terrain";

const coverage = { minX: -152, maxX: 352, minZ: -172, maxZ: 136 };

test("terrain contains georeferenced public F32 DMR5G samples and explicit B6 adaptation", () => {
  assert.equal(TERRAIN.grid.step, 4);
  assert.equal(
    TERRAIN.heights.length,
    TERRAIN.grid.columns * TERRAIN.grid.rows,
  );
  assert.equal(
    TERRAIN.source.heightCRS,
    "Baltic 1957 / Bpv, EPSG vertical 8357",
  );
  assert.equal(TERRAIN.source.license, "CC BY 4.0");
  assert.match(TERRAIN.source.tifSha256, /^[a-f0-9]{64}$/);
  assert(TERRAIN.statistics.maxAbsolute - TERRAIN.statistics.minAbsolute > 25);
  assert(
    Math.abs(
      sourceGroundHeight(-7, -73) +
        TERRAIN_REFERENCE_BPV -
        TERRAIN.reference.absoluteHeight,
    ) < 0.12,
  );
  assert.equal(groundHeight(-7, -73), 0);
  assert.equal(groundHeight(8, -55), 0);
  assert.notEqual(groundHeight(320, 80), 0);
  for (const [x, z] of [
    [22, -14],
    [180, 15],
    [320, 80],
    [-140, -150],
  ]) {
    const normal = groundNormal(x, z);
    assert(Math.abs(Math.hypot(normal.x, normal.y, normal.z) - 1) < 1e-8);
    assert(normal.y > 0);
  }
});

test("real Rapier collision mesh agrees with rendering and interpolation without closing B6 basement", async () => {
  await RAPIER.init();
  const tiles = createTerrainTiles(GROUND_RECTS, coverage);
  const mesh = terrainMeshData(tiles);
  const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
  const collision = terrainCollisionData(tiles);
  world.createCollider(
    RAPIER.ColliderDesc.trimesh(
      collision.vertices,
      collision.indices,
      RAPIER.TriMeshFlags.FIX_INTERNAL_EDGES,
    ),
  );
  world.step();
  let probes = 0;
  for (let x = -149.13; x < 350; x += 7.17)
    for (let z = -169.17; z < 134; z += 7.13) {
      const inBounds = (b: {
        minX: number;
        maxX: number;
        minZ: number;
        maxZ: number;
      }) => x > b.minX && x < b.maxX && z > b.minZ && z < b.maxZ;
      const insideMain = inBounds(B6_LAYOUT.bounds);
      const insideWest = inBounds(B6_LAYOUT.lobby);
      const ray = new RAPIER.Ray({ x, y: 80, z }, { x: 0, y: -1, z: 0 });
      const hit = world.castRay(ray, 160, true);
      if (insideMain || insideWest) {
        assert.equal(hit, null, `basement incorrectly closed at ${x},${z}`);
        continue;
      }
      assert(hit, `ground gap at ${x},${z}`);
      assert(
        Math.abs(80 - hit.timeOfImpact - groundHeight(x, z)) < 0.00015,
        `height mismatch ${x},${z}`,
      );
      probes++;
    }
  assert(probes > 2500);
  for (let i = 0; i < mesh.positions.length; i += 3)
    assert(
      Math.abs(
        mesh.positions[i + 1] -
          groundHeight(mesh.positions[i], mesh.positions[i + 2]),
      ) < 0.00001,
    );
  for (let i = 0; i < mesh.indices.length; i += 3) {
    const [a, b, c] = mesh.indices.slice(i, i + 3).map((value) => value * 3);
    const crossY =
      (mesh.positions[b + 2] - mesh.positions[a + 2]) *
        (mesh.positions[c] - mesh.positions[a]) -
      (mesh.positions[b] - mesh.positions[a]) *
        (mesh.positions[c + 2] - mesh.positions[a + 2]);
    assert(crossY < 0, "ground winding differs from Babylon native ground");
  }
  world.free();
});

test("draped actual street and parking triangles preserve area and follow terrain inside triangles", () => {
  let inputArea = 0,
    outputArea = 0,
    triangles = 0;
  for (const surface of STREET_SURFACES)
    for (const polygon of surface.polygons) {
      const points = [...polygon.outer] as GroundPoint[],
        holes: number[] = [];
      for (const ring of polygon.holes) {
        holes.push(points.length);
        points.push(...ring);
      }
      const input = earcut(points.flat(), holes, 2);
      for (let i = 0; i < input.length; i += 3) {
        const [a, b, c] = input.slice(i, i + 3).map((v) => points[v]);
        inputArea +=
          Math.abs(
            (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]),
          ) / 2;
      }
      const output = drapeTriangles(points, input, 0.018);
      for (let i = 0; i < output.indices.length; i += 3) {
        const [a, b, c] = output.indices.slice(i, i + 3).map((v) => v * 3),
          p = output.positions;
        const area =
          Math.abs(
            (p[b] - p[a]) * (p[c + 2] - p[a + 2]) -
              (p[b + 2] - p[a + 2]) * (p[c] - p[a]),
          ) / 2;
        outputArea += area;
        const x = (p[a] + p[b] + p[c]) / 3,
          z = (p[a + 2] + p[b + 2] + p[c + 2]) / 3,
          y = (p[a + 1] + p[b + 1] + p[c + 1]) / 3;
        assert(
          Math.abs(y - groundHeight(x, z) - 0.018) < 0.00001,
          `draped triangle cuts terrain at ${x},${z}`,
        );
        triangles++;
      }
    }
  assert(triangles > 3000);
  // Map coverage extends a little beyond gameplay but remains inside the DEM.
  assert(Math.abs(inputArea - outputArea) / inputArea < 0.001);
});

test("central asphalt, Silicon Hill paint and representative parking are tied to the actual ortho", () => {
  assert.equal(REALITY_GROUND.source.captureDate, "2024-06-08");
  assert.match(REALITY_GROUND.source.orthoSha256, /^[a-f0-9]{64}$/);
  const paint = REALITY_GROUND.paint[0];
  assert.equal(paint.text, "Silicon Hill");
  assert(paint.points.every(([x, z]) => isRealityGroundSurface(x, z)));
  assert.equal(PARKING_SLOTS.length, 24);
  for (const bay of PARKING_SLOTS) {
    assert(isRealityGroundSurface(bay.x, bay.z));
    assert.equal(streetSurfaceAt(bay.x, bay.z), "asphalt");
    assert.match(bay.occupancy, /simulation-only/);
  }
});

test("a real Rapier character crosses the central court and mesh seams, then rests without a height oscillation", async () => {
  await RAPIER.init();
  const world = new RAPIER.World({ x: 0, y: -18, z: 0 });
  world.timestep = 1 / 60;
  const collision = terrainCollisionData(
    createTerrainTiles(GROUND_RECTS, coverage),
  );
  world.createCollider(
    RAPIER.ColliderDesc.trimesh(
      collision.vertices,
      collision.indices,
      RAPIER.TriMeshFlags.FIX_INTERNAL_EDGES,
    ),
  );
  const start = { x: 80, y: groundHeight(80, 0) + 0.83, z: 0 };
  const body = world.createRigidBody(
    RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(
      start.x,
      start.y,
      start.z,
    ),
  );
  const capsule = world.createCollider(
    RAPIER.ColliderDesc.capsule(0.38, 0.42),
    body,
  );
  const controller = world.createCharacterController(0.01);
  controller.enableAutostep(0.22, 0.15, false);
  controller.enableSnapToGround(0.25);
  let vertical = 0,
    minimumClearance = Infinity;
  for (let tick = 0; tick < 1440; tick++) {
    vertical -= 18 / 60;
    controller.computeColliderMovement(capsule, {
      x: 4.6 / 60,
      y: vertical / 60,
      z: 0,
    });
    const movement = controller.computedMovement(),
      p = body.translation();
    body.setNextKinematicTranslation({
      x: p.x + movement.x,
      y: p.y + movement.y,
      z: p.z + movement.z,
    });
    if (controller.computedGrounded()) vertical = 0;
    world.step();
    const current = body.translation();
    minimumClearance = Math.min(
      minimumClearance,
      current.y - groundHeight(current.x, current.z),
    );
    assert(
      current.y > groundHeight(current.x, current.z) + 0.7,
      `capsule penetrated terrain at tick ${tick}`,
    );
  }
  assert(
    body.translation().x > 189,
    "character did not traverse the real central court",
  );
  assert(minimumClearance > 0.78);
  const resting: number[] = [];
  for (let tick = 0; tick < 300; tick++) {
    controller.computeColliderMovement(capsule, { x: 0, y: -18 / 3600, z: 0 });
    const p = body.translation(),
      m = controller.computedMovement();
    body.setNextKinematicTranslation({
      x: p.x + m.x,
      y: p.y + m.y,
      z: p.z + m.z,
    });
    world.step();
    if (tick > 50) resting.push(body.translation().y);
  }
  assert(
    Math.max(...resting) - Math.min(...resting) < 0.003,
    "terrain contact oscillated more than 3mm",
  );
  world.free();
});
