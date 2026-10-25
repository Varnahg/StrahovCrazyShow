import test from "node:test";
import surveyedTrees from "../shared/data/surveyed-trees.json";
import treeReconstruction from "../shared/data/tree-reconstruction.json";
import b6TreePlacement from "../shared/data/cad-buildings/b06-tree-placement.json";
import assert from "node:assert/strict";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { VegetationController } from "../client/vegetation";
import { BUILDINGS, BOUNDS, MAP, TREES } from "../shared/world";
import { isStreetSurface } from "../shared/streets";
import {
  LANDCOVER,
  createMappedTrees,
  createGrassPatches,
  grassSurface,
  grassForbiddenSurface,
  grassLod,
  placementClassifier,
  pointInPolygon,
  segmentDistance,
  windEnvelope,
  treeTrunkCollision,
  surfaceElevation,
  type LandcoverArea,
} from "../shared/vegetation";

test("natural grass excludes artificial turf, sand, tartan and unknown pitches", () => {
  const area = (kind: string, surface: string | null): LandcoverArea => ({
    osmId: "test",
    kind,
    surface,
    points: [
      [0, 0],
      [1, 0],
      [1, 1],
    ],
    source: "fixture",
  });
  assert.equal(grassSurface(area("grass", null)), true);
  assert.equal(grassSurface(area("pitch", "grass")), true);
  for (const surface of ["artificial_turf", "sand", "tartan", "clay", null]) {
    assert.equal(grassSurface(area("pitch", surface)), false);
    assert.equal(grassForbiddenSurface(area("pitch", surface)), true);
  }
  assert.equal(grassSurface(area("park", null)), false);
  assert.equal(grassSurface(area("forest", null)), false);
  assert.ok(
    surfaceElevation(area("grass", null)) >
      surfaceElevation(area("park", null)),
  );
  assert.ok(
    surfaceElevation(area("pitch", "sand")) >
      surfaceElevation(area("grass", null)),
  );
  assert.ok(surfaceElevation(area("pitch", "tartan")) < 0.02);
});

test("mapped grass clumps avoid actual building footprints and rendered path widths", () => {
  const classifier = placementClassifier(BUILDINGS, MAP.paths);
  const patches = createGrassPatches(BOUNDS, BUILDINGS, MAP.paths);
  assert.ok(patches.length > 20);
  for (const patch of patches) {
    assert.ok(patch.points.length > 0 && patch.points.length <= 256);
    for (const point of patch.points) {
      const x = patch.x + point.x,
        z = patch.z + point.z;
      assert.equal(classifier.grass(x, z), true);
      assert.equal(isStreetSurface(x, z, 0.35), false);
      assert.ok(
        !BUILDINGS.some((building) => pointInPolygon(x, z, building.points)),
      );
      assert.ok(
        LANDCOVER.areas.some(
          (area) => grassSurface(area) && pointInPolygon(x, z, area.points),
        ),
      );
      assert.ok(
        !LANDCOVER.areas.some(
          (area) =>
            grassForbiddenSurface(area) && pointInPolygon(x, z, area.points),
        ),
      );
    }
  }
  assert.equal(segmentDistance(3, 1, [0, 0], [6, 0]), 1);
});

test("tree coordinates preserve OSM nodes and audited orthophoto crown centres without random relocation", () => {
  const recreated = createMappedTrees(BOUNDS, BUILDINGS, MAP.paths);
  assert.deepEqual(TREES, recreated);
  assert.ok(TREES.some((tree) => tree.provenance === "mapped-osm-node"));
  assert.ok(
    TREES.some(
      (tree) => tree.provenance === "reference-interpreted-not-surveyed",
    ),
  );
  for (const tree of TREES) {
    if (tree.provenance === "mapped-osm-node") {
      const source = LANDCOVER.trees.find((node) => node.osmId === tree.osmId)!;
      assert.equal(source.x, tree.x);
      assert.equal(source.z, tree.z);
    } else {
      const source =
        surveyedTrees.trees.find((t) => t.id === tree.osmId) ??
        treeReconstruction.additionalPlacements.find(
          (t) => t.osmId === tree.osmId,
        )!;
      assert.ok(source);
      const corrected = tree.osmId === b6TreePlacement.treeId;
      assert.equal(tree.x, corrected ? b6TreePlacement.position.x : source.x);
      assert.equal(tree.z, corrected ? b6TreePlacement.position.z : source.z);
      assert.equal(tree.positionUncertaintyMetres, corrected ? b6TreePlacement.positionUncertaintyMetres : 2.5);
      assert.equal(tree.placementSource, corrected ? b6TreePlacement.id : undefined);
    }
    assert.ok(
      tree.x >= BOUNDS.minX &&
        tree.x <= BOUNDS.maxX &&
        tree.z >= BOUNDS.minZ &&
        tree.z <= BOUNDS.maxZ,
    );
    assert.ok(tree.size >= 5 && tree.size <= 15);
  }
});

test("B6 conifer correction retains its source model and all street/building rejection rules", () => {
  const {x,z}=b6TreePlacement.position, previous=b6TreePlacement.originalPosition;
  const classifier=placementClassifier(BUILDINGS,MAP.paths);
  assert.equal(classifier.tree(previous.x,previous.z),false);
  assert.equal(isStreetSurface(previous.x,previous.z),true);
  assert.equal(classifier.tree(x,z),true);
  assert.equal(isStreetSurface(x,z,.5),false);
  const tree=TREES.find(t=>t.osmId===b6TreePlacement.treeId)!;
  assert.ok(tree);assert.equal(TREES.filter(t=>t.osmId===tree.osmId).length,1);
  assert.equal(tree.reconstruction,treeReconstruction.trees.find(t=>t.id===tree.osmId));
  assert.deepEqual({x:treeTrunkCollision(tree).x,z:treeTrunkCollision(tree).z},{x,z});
  const building={...BUILDINGS[0],points:[[x-1,z-1],[x+1,z-1],[x+1,z+1],[x-1,z+1]] as [number,number][]};
  assert.ok(!createMappedTrees(BOUNDS,[...BUILDINGS,building],MAP.paths).some(t=>t.osmId===tree.osmId));
  const path={...MAP.paths[0],kind:'footway',points:[[x-4,z],[x+4,z]] as [number,number][]};
  assert.ok(!createMappedTrees(BOUNDS,BUILDINGS,[...MAP.paths,path]).some(t=>t.osmId===tree.osmId));
  const cropped={minX:x+1,maxX:x+2,minZ:z+1,maxZ:z+2};
  assert.ok(!createMappedTrees(cropped,BUILDINGS,MAP.paths).some(t=>t.osmId===tree.osmId));
});

test("wind is exactly still at zero, finite and capped in extreme weather", () => {
  for (const time of [0, 0.5, 10, 10000])
    for (const x of [-145, 0, 345]) {
      assert.equal(Math.abs(windEnvelope(time, x, 17, 0)), 0);
      assert.equal(Math.abs(windEnvelope(time, x, 17, -4)), 0);
      assert.ok(Number.isFinite(windEnvelope(time, x, 17, NaN)));
      assert.equal(
        windEnvelope(time, x, 17, 40),
        windEnvelope(time, x, 17, 16),
      );
    }
});

test("grass detail has hard distance/tile/density budgets without one mesh per blade", () => {
  const low = grassLod("low"),
    high = grassLod("high");
  assert.equal(low.range, 35);
  assert.equal(high.range, 60);
  assert.equal(low.tiles, 16);
  assert.equal(high.tiles, 32);
  const maximumClumps = high.tiles * 256;
  assert.equal(maximumClumps, 8192);
  assert.ok(low.density < high.density);
});

test("runtime grass tiles share one geometry and obey actual low/high active instance budgets", () => {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  const controller = new VegetationController(scene);
  const tiles = scene.meshes.filter(
    (mesh) => mesh.metadata?.vegetation === "grass",
  );
  assert.equal(tiles.length, controller.stats.grassTiles);
  // The world grew to 940×610 m. Registered tiles are one per populated 16 m
  // source cell, while rendering still has the independent 16/32 tile budget.
  const tileMetres = 16,
    columns =
      Math.ceil(BOUNDS.maxX / tileMetres) -
      Math.floor(BOUNDS.minX / tileMetres),
    rows =
      Math.ceil(BOUNDS.maxZ / tileMetres) -
      Math.floor(BOUNDS.minZ / tileMetres);
  assert.ok(
    tiles.length > 0 && tiles.length <= columns * rows,
    "registered grass cannot exceed the actual world grid",
  );
  assert.equal(
    new Set(tiles.map((mesh) => mesh.metadata.tile)).size,
    tiles.length,
    "only one mesh per mapped cell",
  );
  for (const mesh of tiles) {
    const [x, z] = String(mesh.metadata.tile).split(":").map(Number);
    assert.ok(
      Number.isInteger(x / tileMetres) && Number.isInteger(z / tileMetres),
    );
    assert.ok(
      x >= Math.floor(BOUNDS.minX / tileMetres) * tileMetres &&
        x < BOUNDS.maxX &&
        z >= Math.floor(BOUNDS.minZ / tileMetres) * tileMetres &&
        z < BOUNDS.maxZ,
    );
    assert.equal(mesh.position.x, x + tileMetres / 2);
    assert.equal(mesh.position.z, z + tileMetres / 2);
    assert.equal(
      mesh.isEnabled(),
      false,
      "precomputed distant grass must start disabled",
    );
  }
  assert.ok(
    controller.stats.grassClumps <= tiles.length * 256,
    "source matrix buffers remain capped per populated cell",
  );
  assert.equal(
    new Set(
      tiles.map(
        (mesh) => (mesh as import("@babylonjs/core/Meshes/mesh").Mesh).geometry,
      ),
    ).size,
    1,
  );
  const state = {
    dt: 1 / 60,
    time: 0,
    wind: { x: 1, z: 0, speed: 0 },
    daylight: 0.8,
    player: { x: 110, y: 0, z: 80 },
    quality: "low",
  };
  const master = Array.from(tiles[0].getVerticesData("position")!);
  const bounds = tiles.map((mesh) => ({
    min: mesh.getBoundingInfo().boundingBox.minimum.asArray(),
    max: mesh.getBoundingInfo().boundingBox.maximum.asArray(),
  }));
  controller.update(state);
  assert.equal(tiles[0].getTotalIndices() / 3, 16);
  assert.ok(
    controller.stats.visibleGrassTiles > 0 &&
      controller.stats.visibleGrassTiles <= 16,
  );
  assert.ok(controller.stats.visibleGrassClumps <= 16 * 96);
  controller.update({ ...state, quality: "high", time: 1 });
  assert.equal(tiles[0].getTotalIndices() / 3, 64);
  assert.deepEqual(Array.from(tiles[0].getVerticesData("position")!), master);
  assert.deepEqual(
    tiles.map((mesh) => ({
      min: mesh.getBoundingInfo().boundingBox.minimum.asArray(),
      max: mesh.getBoundingInfo().boundingBox.maximum.asArray(),
    })),
    bounds,
    "quality changes must retain conservative full-master wind bounds",
  );
  assert.ok(controller.stats.visibleGrassTiles <= 32);
  assert.ok(controller.stats.visibleGrassClumps <= 32 * 256);
  assert.equal(
    tiles.filter((mesh) => mesh.isEnabled()).length,
    controller.stats.visibleGrassTiles,
  );
  for (const player of [
    { x: 110, y: 0, z: 12 },
    { x: -410, y: 0, z: 120 },
    { x: -282, y: 0, z: 274 },
    { x: 10000, y: 0, z: 10000 },
  ])
    for (const quality of ["low", "high"]) {
      state.time += 1;
      const lod = grassLod(quality);
      controller.update({ ...state, player, quality });
      const enabled = tiles.filter((mesh) => mesh.isEnabled());
      assert.equal(enabled.length, controller.stats.visibleGrassTiles);
      assert.ok(enabled.length <= lod.tiles);
      assert.ok(
        controller.stats.visibleGrassClumps <=
          lod.tiles * Math.floor(256 * lod.density),
      );
      assert.equal(
        enabled.reduce(
          (sum, mesh) =>
            sum +
            (mesh as import("@babylonjs/core/Meshes/mesh").Mesh)
              .thinInstanceCount,
          0,
        ),
        controller.stats.visibleGrassClumps,
      );
    }
  assert.equal(
    controller.stats.visibleGrassTiles,
    0,
    "an out-of-world observer must not activate the distant bank",
  );
  console.log("Expanded vegetation bank and active budgets", {
    worldAreaSquareMetres:
      (BOUNDS.maxX - BOUNDS.minX) * (BOUNDS.maxZ - BOUNDS.minZ),
    possibleGridCells: columns * rows,
    registeredTiles: tiles.length,
    grassClumps: controller.stats.grassClumps,
    estimatedMatrixBytes: controller.stats.grassClumps * 16 * 4,
    lowActiveTiles: grassLod("low").tiles,
    highActiveTiles: grassLod("high").tiles,
  });
  controller.dispose();
  assert.equal(scene.meshes.length, 0);
  scene.dispose();
  engine.dispose();
});
