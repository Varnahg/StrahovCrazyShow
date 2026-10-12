import test from "node:test";
import assert from "node:assert/strict";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { Ray } from "@babylonjs/core/Culling/ray";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import type { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { surfaceTexturePlan } from "../client/surface-pack";
import {
  architectureEdges,
  planFacadeOpenings,
  b6ExteriorEdges,
  buildArchitectureReality,
  LANDMARK_ENTRANCES,
  B6_ENTRY_REFERENCE,
} from "../client/architecture-reality";
import { BUILDINGS } from "../shared/world";
import { B6_LAYOUT } from "../shared/b6-interior";

test("headless architecture retains the browser texture recipe without changing fallback colours or loading images", () => {
  const engine = new NullEngine(),
    scene = new Scene(engine);
  const architecture = buildArchitectureReality({ scene, buildings: [] });
  try {
    for (const [name, kind, strength, fallback] of [
      ["brown timber frames", "wood", 0.1, "#5e4737"],
      ["flat weathered roof", "roof", 0.1, "#737974"],
      ["menza tile", "tile", 0.13, "#cfbf89"],
      ["aged pale plaster", "plaster", 0.12, "#d9d7c9"],
      ["board concrete", "concrete", 0.23, "#92958b"],
    ] as const) {
      const material = scene.materials.find(
        (m) => m.name === `reality ${name}`,
      ) as StandardMaterial;
      assert.ok(material);
      assert.equal(
        material.metadata.authoredArchitectureTexture,
        `/models/architecture/textures/${kind}-color.png`,
      );
      assert.equal(
        material.metadata.authoredArchitectureNormal,
        `/models/architecture/textures/${kind}-normal.png`,
      );
      assert.equal(
        material.metadata.authoredArchitectureNormalStrength,
        strength,
      );
      assert.deepEqual(
        material.diffuseColor.asArray(),
        Color3.FromHexString(fallback).asArray(),
      );
      assert.equal(material.diffuseTexture, null);
      assert.equal(material.bumpTexture, null);
      if (kind === "plaster" || kind === "concrete")
        assert.ok(
          surfaceTexturePlan(material.metadata),
          "physical surface recipe remains available to override the authored fallback",
        );
      else assert.equal(surfaceTexturePlan(material.metadata), null);
    }
    for (const name of ["B4 grey facade panels", "B4 dark window frames"])
      assert.equal(
        scene.materials.find((m) => m.name === `reality ${name}`)!.metadata
          ?.authoredArchitectureTexture,
        undefined,
      );
    assert.equal(
      scene.textures.length,
      0,
      "NullEngine does not request authored PNGs",
    );
  } finally {
    architecture.dispose();
    scene.dispose();
    engine.dispose();
  }
});

test("photo interpreted window pitch fits every original edge and retains outward normals", () => {
  for (const building of BUILDINGS) {
    for (const edge of architectureEdges(building.points)) {
      assert.ok(Math.abs(Math.hypot(edge.nx, edge.nz) - 1) < 1e-8);
      for (const w of planFacadeOpenings(edge, building.height, "standard")) {
        assert.ok(w.u >= 0 && w.u + w.w <= edge.length);
        assert.ok(w.v >= 0 && w.v + w.h <= building.height);
      }
    }
  }
  const long = architectureEdges([
    [0, 0],
    [16, 0],
    [16, 70],
    [0, 70],
    [0, 0],
  ]).find((e) => e.long)!;
  const windows = planFacadeOpenings(long, 18, "standard");
  assert.equal(windows.filter((w) => w.v < 3).length, 22);
  assert.ok(windows.every((w) => w.panes === 4));
});

test("B6 north end preserves broad blank piers and sparse core openings", () => {
  const north = b6ExteriorEdges().find((e) => e.nz < -0.8 && e.length > 9)!;
  const windows = planFacadeOpenings(north, 18, "standard", 6);
  assert.equal(windows.filter((w) => w.style === "small").length, 12);
  assert.equal(windows.filter((w) => w.style === "stair").length, 5);
  assert.ok(
    windows
      .filter((w) => w.style === "small")
      .every((w) => w.u < north.length * 0.35),
  );
});

test("B12 three levels retain narrow transom windows, B1 and shops have no dorm grid", () => {
  const edge = architectureEdges([
    [0, 0],
    [16, 0],
    [16, 70],
    [0, 70],
    [0, 0],
  ]).find((e) => e.long)!;
  const low = planFacadeOpenings(edge, 9, "low");
  assert.equal(new Set(low.map((w) => w.v)).size, 3);
  assert.ok(low.every((w) => w.w <= 1.12 && w.transom === 0.55));
  assert.equal(planFacadeOpenings(edge, 3, "administration").length, 0);
  assert.equal(
    planFacadeOpenings({ ...edge, nx: -1 }, 3, "commercial").length,
    0,
  );
  assert.ok(
    planFacadeOpenings(edge, 3, "commercial").every((w) => w.style === "small"),
  );
});

test("007 doorway is at southeast club, reception and R-ko POI retain explicit uncertainty", () => {
  const seven = LANDMARK_ENTRANCES.find((p) => p.id === "seven-club")!;
  assert.ok(seven.x > 65 && seven.z > -40 && seven.z < -20);
  assert.equal(seven.uncertaintyMetres, 4);
  assert.equal(
    LANDMARK_ENTRANCES.find((p) => p.id === "rko")!.confidence,
    "osm-business-poi-not-door",
  );
});

test("architecture batches remain bounded", () => {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  scene.useRightHandedSystem = true;
  const reality = buildArchitectureReality({ scene });
  const transparentB6 = scene.materials.filter((m) => m.metadata?.realityGlass);
  assert.equal(transparentB6.length, 6);
  assert.ok(
    transparentB6.every(
      (m) => m.metadata.block === 6 && m.alpha > 0 && m.alpha < 1,
    ),
  );
  assert.ok(
    scene.materials
      .filter(
        (m) => m.name.startsWith("reality glass ") && !m.metadata?.realityGlass,
      )
      .every((m) => m.alpha === 1),
  );
  assert.ok(reality.metrics.windows > 1500);
  // Modeled Blender profiles replace flat strips. The existing per-building
  // distance LOD still bounds visible geometry; this is a topology ceiling,
  // not a claim that the full scene meets the GPU/FPS target.
  assert.ok(reality.metrics.detailTriangles < 1400000);
  assert.ok(
    reality.metrics.farTriangles < BUILDINGS.length * 150,
    JSON.stringify(reality.metrics),
  );
  const meshes = scene.meshes.filter((m) => m.name.startsWith("reality "));
  // Preserve the former 650 / 40 buildings budget after expanding the map.
  assert.ok(
    meshes.length < BUILDINGS.length * 16.25,
    `Architecture meshes: ${meshes.length}; buildings: ${BUILDINGS.length}`,
  );
  for (const mesh of meshes) {
    const positions = mesh.getVerticesData("position");
    if (!positions) continue;
    for (let i = 0; i < positions.length; i += 3)
      assert.ok(
        Number.isFinite(positions[i]) &&
          Number.isFinite(positions[i + 1]) &&
          Number.isFinite(positions[i + 2]),
      );
    const indices = mesh.getIndices()!;
    for (let i = 0; i < indices.length; i += 3) {
      const a = Vector3.FromArray(positions, indices[i] * 3),
        b = Vector3.FromArray(positions, indices[i + 1] * 3),
        c = Vector3.FromArray(positions, indices[i + 2] * 3);
      assert.ok(
        Vector3.Cross(b.subtract(a), c.subtract(a)).lengthSquared() > 1e-16,
        "authored facades/roofs must not contain zero-area triangles",
      );
    }
  }
  console.log("Reality geometry audit", reality.metrics, {
    meshes: meshes.length,
  });
  reality.dispose();
  scene.dispose();
  engine.dispose();
});

test("B6 north reception shell preserves the canonical opening and closes the former west entry", () => {
  const engine = new NullEngine(),
    scene = new Scene(engine);
  scene.useRightHandedSystem = true;
  const reality = buildArchitectureReality({
    scene,
    baseElevation: (_x, _z, building) =>
      building.id === "53929071" ? B6_LAYOUT.foundationOffset : 0,
  });
  reality.update({ x: B6_LAYOUT.entry.x, z: B6_LAYOUT.entry.z }, "low");
  const b6 = scene.meshes.filter((m) =>
    m.name.startsWith("reality 53929071 near"),
  );
  const northEdge = b6ExteriorEdges().find(
    (e) => e.nz < -0.8 && e.a[0] < 0 && e.b[0] <= 0,
  )!;
  assert.ok(northEdge);
  assert.ok(Math.abs(northEdge.a[1] - (B6_LAYOUT.lobby.minZ - 0.175)) < 1e-8);
  assert.equal(B6_ENTRY_REFERENCE.modelDoor.x, B6_LAYOUT.entry.x);
  assert.equal(B6_ENTRY_REFERENCE.modelDoor.z, B6_LAYOUT.entry.z);
  assert.equal(
    B6_ENTRY_REFERENCE.modelFoundationOffset,
    B6_LAYOUT.foundationOffset,
  );
  assert.ok(
    Math.abs(
      B6_ENTRY_REFERENCE.passage.fromX -
        (B6_LAYOUT.entry.x - B6_LAYOUT.entry.width / 2),
    ) < 1e-8,
  );
  assert.ok(
    Math.abs(
      B6_ENTRY_REFERENCE.passage.toX -
        (B6_LAYOUT.entry.x + B6_LAYOUT.entry.width / 2),
    ) < 1e-8,
  );
  for (const x of [
    B6_LAYOUT.entry.x - 0.7,
    B6_LAYOUT.entry.x,
    B6_LAYOUT.entry.x + 0.7,
  ]) {
    const ray = new Ray(
      new Vector3(x, B6_LAYOUT.foundationOffset + 1.2, B6_LAYOUT.entry.z - 1),
      new Vector3(0, 0, 1),
      2,
    );
    assert.ok(
      b6.every((mesh) => !mesh.intersects(ray).hit),
      "North reception aperture must not be covered by opaque facade/glass/sign geometry",
    );
  }
  const westRay = new Ray(
    new Vector3(-9, B6_LAYOUT.foundationOffset + 1.2, -73),
    new Vector3(1, 0, 0),
    3,
  );
  assert.ok(
    b6.some((mesh) => mesh.intersects(westRay).hit),
    "Former west opening must be a rendered solid facade",
  );
  reality.dispose();
  scene.dispose();
  engine.dispose();
});
