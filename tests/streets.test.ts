import { test } from "node:test";
import assert from "node:assert/strict";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import map from "../shared/data/map.json";
import transit from "../shared/data/transit.json";
import groundFixture from "./fixtures/static-ground-source.json";
import {
  STREETS,
  STREET_FEATURES,
  STREET_SURFACES,
  LAMP_PLACEMENTS,
  STREET_COLLISIONS,
  CROSSING_MARKINGS,
  streetSurfaceAt,
  streetPolygonContains,
  nearestStreet,
  isCalibratedRoadFootprint,
  CALIBRATED_ROAD_FEATURES,
} from "../shared/streets";
import { streetVertexData, buildStreets } from "../client/streets-renderer";
import { staticChunkSource } from "../client/static-submesh-chunks";
const buildingBounds = map.buildings.map((building) => ({
  building,
  minX: Math.min(...building.points.map((p) => p[0])),
  maxX: Math.max(...building.points.map((p) => p[0])),
  minZ: Math.min(...building.points.map((p) => p[1])),
  maxZ: Math.max(...building.points.map((p) => p[1])),
}));
// fetch-streets.py exports millimetre coordinates and a 25 mm building apron;
// fetch-map.mjs exports building coordinates to centimetres. Account only for
// those documented source precisions, not a gameplay-sized gap tolerance.
const STREET_QUANTUM = 0.001,
  MAP_QUANTUM = 0.01;
const MATERIAL_ROUNDING_ERROR = Math.SQRT2 * STREET_QUANTUM;
const BUILDING_CUTOUT_APRON =
  0.025 + (Math.SQRT2 * (MAP_QUANTUM + STREET_QUANTUM)) / 2;
function boundaryDistance(
  x: number,
  z: number,
  rings: readonly (readonly number[][])[],
) {
  let nearest = Infinity;
  for (const ring of rings)
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i],
        b = ring[(i + 1) % ring.length],
        dx = b[0] - a[0],
        dz = b[1] - a[1];
      const t = Math.max(
        0,
        Math.min(
          1,
          ((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz || 1),
        ),
      );
      nearest = Math.min(
        nearest,
        Math.hypot(x - a[0] - dx * t, z - a[1] - dz * t),
      );
    }
  return nearest;
}

test("source tags retain named streets, a real width, underground exclusion and separate sidewalks", () => {
  assert.equal(STREETS.origin.lat, map.origin.lat);
  assert.equal(STREETS.origin.lon, map.origin.lon);
  assert.match(STREETS.sourceSha256, /^[a-f0-9]{64}$/);
  const jezdecka = STREET_FEATURES.find((f) => f.tags.name === "Jezdecká")!;
  assert.equal(jezdecka.width, 9);
  assert.equal(jezdecka.tags.sidewalk, "no");
  assert.match(jezdecka.widthProvenance, /^osm-width-tag/);
  assert(STREET_FEATURES.some((f) => f.tags.name === "Olympijská"));
  assert(STREET_FEATURES.some((f) => f.tags.name === "Chaloupeckého"));
  assert(
    STREET_FEATURES.some(
      (f) => f.kind === "sidewalk" && f.tags.footway === "sidewalk",
    ),
  );
  assert(STREETS.excludedWays.some((f) => f.tags.name === "Strahovský tunel"));
  assert(!STREET_FEATURES.some((f) => f.tags.tunnel === "yes"));
});

test("joined pavement has upward triangle normals, preserves holes and avoids footprint interiors", () => {
  let triangles = 0,
    roundingSlivers = 0,
    maxSliverWidth = 0;
  for (const surface of STREET_SURFACES) {
    const data = streetVertexData(surface.polygons);
    const positions = data.positions as number[],
      indices = data.indices as number[];
    for (let i = 0; i < indices.length; i += 3) {
      const [a, b, c] = indices.slice(i, i + 3).map((n) => n * 3);
      const x = (positions[a] + positions[b] + positions[c]) / 3;
      const z = (positions[a + 2] + positions[b + 2] + positions[c + 2]) / 3;
      const crossY =
        (positions[b + 2] - positions[a + 2]) * (positions[c] - positions[a]) -
        (positions[b] - positions[a]) * (positions[c + 2] - positions[a + 2]);
      // Same clockwise winding as Babylon CreateGround, with explicit +Y normals.
      assert(crossY <= 1e-7);
      assert([a, b, c].every((index) => (data.normals![index + 1] ?? 0) > 0));
      assert(
        surface.polygons.some((polygon) =>
          streetPolygonContains(polygon, x, z),
        ),
        `triangle escaped its own ${surface.material} polygon or entered a hole at ${x},${z}`,
      );
      const mappedMaterial = streetSurfaceAt(x, z);
      assert(
        mappedMaterial,
        `rendered triangle has no indexed source surface at ${x},${z}`,
      );
      if (mappedMaterial !== surface.material) {
        const longestEdge = Math.max(
          Math.hypot(
            positions[a] - positions[b],
            positions[a + 2] - positions[b + 2],
          ),
          Math.hypot(
            positions[a] - positions[c],
            positions[a + 2] - positions[c + 2],
          ),
          Math.hypot(
            positions[b] - positions[c],
            positions[b + 2] - positions[c + 2],
          ),
        );
        const width = Math.abs(crossY) / longestEdge;
        const edgeDistance = Math.min(
          ...surface.polygons.map((p) =>
            boundaryDistance(x, z, [p.outer, ...p.holes]),
          ),
        );
        assert(
          width <= MATERIAL_ROUNDING_ERROR &&
            edgeDistance <= MATERIAL_ROUNDING_ERROR,
          `meaningful overlapping materials ${surface.material}/${mappedMaterial} at ${x},${z}; triangle width=${width},boundary=${edgeDistance}`,
        );
        roundingSlivers++;
        maxSliverWidth = Math.max(maxSliverWidth, width);
      }
      for (const bounds of buildingBounds) {
        if (
          x < bounds.minX ||
          x > bounds.maxX ||
          z < bounds.minZ ||
          z > bounds.maxZ
        )
          continue;
        const building = bounds.building;
        assert(
          !streetPolygonContains(
            {
              outer: building.points as [number, number][],
              holes: [],
              area: 0,
            },
            x,
            z,
          ),
          `pavement triangle inside building ${building.id}`,
        );
      }
      triangles++;
    }
  }
  assert(triangles > 1000);
  console.log("Fallback pavement precision audit", {
    triangles,
    roundingSlivers,
    maxSliverWidth,
    sourceCoordinateQuantum: STREET_QUANTUM,
  });
});

test("real shared junction nodes outside documented building cutouts have a continuous fallback rendered surface", () => {
  const nodes = new Map<string, { x: number; z: number; count: number }>();
  for (const feature of STREET_FEATURES) {
    feature.nodeIds.forEach((id, i) => {
      if (!feature.points[i]) return;
      const [x, z] = feature.points[i];
      if (
        x < STREETS.bounds.minX ||
        x > STREETS.bounds.maxX ||
        z < STREETS.bounds.minZ ||
        z > STREETS.bounds.maxZ
      )
        return;
      const entry = nodes.get(id);
      nodes.set(id, { x, z, count: (entry?.count ?? 0) + 1 });
    });
  }
  let checked = 0,
    apronMasked = 0;
  for (const node of nodes.values()) {
    if (node.count < 2) continue;
    // Entrances can terminate on a footprint boundary, intentionally cut out.
    const inBuilding = map.buildings.some((b) =>
      streetPolygonContains(
        { outer: b.points as [number, number][], holes: [], area: 0 },
        node.x,
        node.z,
      ),
    );
    if (inBuilding) continue;
    const inBuildingApron = buildingBounds.some(
      (bounds) =>
        node.x >= bounds.minX - BUILDING_CUTOUT_APRON &&
        node.x <= bounds.maxX + BUILDING_CUTOUT_APRON &&
        node.z >= bounds.minZ - BUILDING_CUTOUT_APRON &&
        node.z <= bounds.maxZ + BUILDING_CUTOUT_APRON &&
        boundaryDistance(node.x, node.z, [bounds.building.points]) <=
          BUILDING_CUTOUT_APRON,
    );
    if (!streetSurfaceAt(node.x, node.z) && inBuildingApron) {
      apronMasked++;
      continue;
    }
    assert(
      streetSurfaceAt(node.x, node.z),
      `surface gap at junction ${node.x},${node.z}`,
    );
    checked++;
  }
  assert(checked > 35);
  console.log("Fallback junction audit", {
    checked,
    apronMasked,
    maximumSourceApron: BUILDING_CUTOUT_APRON,
  });
});

test("PID route samples inside expanded campus stay aligned with fallback Vaníčkova pavement", () => {
  let checked = 0,
    calibrated = 0;
  for (const [shapeId, shape] of Object.entries(transit.shapes))
    for (let i = 1; i < shape.length; i++) {
      const a = shape[i - 1],
        b = shape[i];
      for (let t = 0; t <= 1; t += 0.1) {
        const x = a[0] + (b[0] - a[0]) * t,
          z = a[1] + (b[1] - a[1]) * t;
        if (
          x < STREETS.bounds.minX + 3 ||
          x > STREETS.bounds.maxX - 3 ||
          z < STREETS.bounds.minZ + 3 ||
          z > STREETS.bounds.maxZ - 3
        )
          continue;
        const nearest = nearestStreet(x, z, true)!;
        if (isCalibratedRoadFootprint(x, z)) {
          assert(
            CALIBRATED_ROAD_FEATURES.some(
              (feature) => feature.id === nearest.feature.id,
            ),
            `PID ${shapeId} must use the photo-interpreted local corridor at ${x},${z}`,
          );
          assert.equal(
            nearest.feature.widthProvenance,
            "ipr-2024-photo-cross-section-interpreted-not-measured",
          );
          calibrated++;
        }
        assert(
          nearest.distance < nearest.feature.width / 2 + 0.5,
          `PID ${shapeId} outside fallback road ${nearest.feature.id} at ${x},${z}: distance=${nearest.distance},width=${nearest.feature.width},widthSource=${nearest.feature.widthProvenance}`,
        );
        assert.equal(
          streetSurfaceAt(x, z),
          "asphalt",
          `PID ${shapeId} misses fallback asphalt at ${x},${z}; road=${nearest.feature.id},distance=${nearest.distance},width=${nearest.feature.width},widthSource=${nearest.feature.widthProvenance}`,
        );
        checked++;
      }
    }
  assert(checked > 60);
  assert(calibrated > 100);
});

test("mapped and photo-interpreted lamps share exact pole/base collisions and unmarked crossings gain no zebra", () => {
  assert.equal(
    LAMP_PLACEMENTS.filter((lamp) => lamp.provenance === "mapped-osm-node")
      .length,
    36,
  );
  assert.equal(
    LAMP_PLACEMENTS.filter(
      (lamp) => lamp.provenance === "reference-interpreted-not-surveyed",
    ).length,
    2,
  );
  assert.equal(STREET_COLLISIONS.length, LAMP_PLACEMENTS.length * 2);
  assert(
    CROSSING_MARKINGS.every(
      (crossing) => crossing.tags["crossing:markings"] !== "no",
    ),
  );
  const engine = new NullEngine();
  const scene = new Scene(engine);
  scene.useRightHandedSystem = true;
  const lights: import("@babylonjs/core/Lights/pointLight").PointLight[] = [];
  const result = buildStreets({ scene, lights });
  assert.equal(lights.length, LAMP_PLACEMENTS.length);
  assert.deepEqual(
    result.meshes.map((m) => m.name).sort(),
    [
      "mapped-surfaces:asphalt",
      "mapped-surfaces:sett",
      "mapped-surfaces:paving",
      "mapped-surfaces:gravel",
      "mapped-surfaces:soil",
      "mapped-flush-material-joints",
      "mapped-lamp-pools",
      "mapped-lamp-lenses",
      "mapped-lamp-fixtures",
      "mapped-crossing-markings",
    ].sort(),
  );
  const originalGravel = STREET_SURFACES.find(
    (surface) => surface.material === "gravel",
  )!;
  const split = groundFixture.terrain20261025.soilSplit;
  const polygonIndices = split
    .flatMap((entry) => entry.sourcePolygonIndices)
    .sort((a, b) => a - b);
  assert.deepEqual(
    polygonIndices,
    originalGravel.polygons.map((_, index) => index),
    "every original gravel polygon belongs to exactly one new material group",
  );
  for (const entry of split) {
    const mesh = result.meshes.find(
      (candidate) => candidate.name === entry.name,
    )!;
    const canonical = streetVertexData(
      entry.sourcePolygonIndices.map((index) => originalGravel.polygons[index]),
    );
    assert.equal(mesh.getTotalVertices(), entry.vertices);
    assert.equal(mesh.getTotalIndices() / 3, entry.triangles);
    for (const [kind, values] of [
      ["position", canonical.positions],
      ["normal", canonical.normals],
      ["uv", canonical.uvs],
    ] as const)
      assert.deepEqual(
        new Float32Array(mesh.getVerticesData(kind)!),
        new Float32Array(values!),
        entry.name + " exact source " + kind,
      );
    assert.deepEqual(
      staticChunkSource(mesh)!.indices,
      new Uint32Array(canonical.indices!),
      entry.name + " source triangles and winding",
    );
  }
  assert.equal(result.crossings, CROSSING_MARKINGS.length);
  // Four explicitly marked nodes plus two legacy uncontrolled nodes; the OSM
  // definition of uncontrolled includes road paint. Explicit no stays absent.
  assert.equal(result.crossings, 6);
  assert(CROSSING_MARKINGS.some((crossing) => crossing.id === "54283786"));
  assert(!CROSSING_MARKINGS.some((crossing) => crossing.id === "60794713"));
  assert.equal(result.transitions, 819); // One new flush joint where the source-informed B6 connector joins its mapped footway.
  assert(result.meshes.every((m) => !m.isPickable));
  scene.dispose();
  engine.dispose();
});
