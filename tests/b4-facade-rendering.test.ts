import test from "node:test";
import assert from "node:assert/strict";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { Ray } from "@babylonjs/core/Culling/ray";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { BUILDINGS } from "../shared/world";
import { B4_FACADE_PLAN, b4FacadePlan } from "../shared/b4-facade-plan";
import panels from "../shared/data/b4-panel-kit.json";
import { BUILDING_WINDOW_KIT } from "../client/building-window-model";
import {
  architectureEdges,
  buildArchitectureReality,
  planFacadeOpenings,
} from "../client/architecture-reality";

test("B4 source faces replace the wall geometry and retain the same openings in both LODs", () => {
  const building = BUILDINGS.find((b) => b.id === B4_FACADE_PLAN.buildingId)!;
  const original = structuredClone(building);
  const engine = new NullEngine(),
    scene = new Scene(engine);
  scene.useRightHandedSystem = true;
  const architecture = buildArchitectureReality({
    scene,
    buildings: [building],
  });
  architecture.update(
    { x: building.points[0][0], z: building.points[0][1] },
    "high",
  );
  try {
    const grey = scene.meshes.find(
      (mesh) =>
        mesh.name.includes(" near ") &&
        mesh.material?.name === "reality B4 grey facade panels",
    )!;
    assert.ok(grey);
    assert.ok(grey.material instanceof PBRMaterial);
    assert.equal(
      grey.material.albedoTexture,
      null,
      "no board-formed texture invented for the grey panel cladding",
    );
    const farGrey = scene.meshes.find(
      (mesh) =>
        mesh.name.includes(" far ") &&
        mesh.material?.name === grey.material!.name,
    )!;
    assert.ok(farGrey);
    assert.equal(
      farGrey.material,
      grey.material,
      "near and far share one weather-lit panel material",
    );
    const frameMaterial = scene.materials.find(
      (material) => material.name === "reality B4 dark window frames",
    ) as StandardMaterial;
    assert.ok(frameMaterial);
    assert.equal(
      frameMaterial.diffuseTexture,
      null,
      "dark photographed profiles do not establish wood grain or timber construction",
    );
    const sourceTriangles = Object.values(panels.faces).reduce(
      (total, face) =>
        total +
        face.parts.reduce(
          (count, part) => count + part.geometry.indices.length / 3,
          0,
        ),
      0,
    );
    const openingCount = B4_FACADE_PLAN.faces.reduce(
      (count, face) => count + face.openings.length,
      0,
    );
    assert.equal(openingCount, 35);
    assert.equal(
      grey.getTotalIndices() / 3,
      sourceTriangles +
        (openingCount * BUILDING_WINDOW_KIT.primitives.reveal.indices.length) /
          3,
      "one Blender wall plus each window reveal; no procedural wall overlay",
    );
    const nearWalls = scene.meshes.filter(
      (mesh) =>
        mesh.name.includes(" near ") &&
        /grey facade panels|board concrete|aged pale plaster/.test(
          mesh.material?.name ?? "",
        ),
    );
    const farGlass = scene.meshes.filter(
      (mesh) =>
        mesh.name.includes(" far ") &&
        mesh.material?.name.startsWith("reality glass "),
    );
    for (const mesh of [...nearWalls, ...farGlass])
      mesh.computeWorldMatrix(true);
    let matched = 0;
    for (const edge of architectureEdges(building.points)) {
      const face = b4FacadePlan(edge, building.height);
      if (!face) continue;
      matched++;
      assert.deepEqual(
        planFacadeOpenings(edge, building.height, "standard", 4),
        face.openings,
      );
      for (const opening of face.openings) {
        const u = opening.u + opening.w / 2;
        const ray = new Ray(
          new Vector3(
            edge.a[0] + edge.tx * u + edge.nx * 0.6,
            opening.v + opening.h / 2,
            edge.a[1] + edge.tz * u + edge.nz * 0.6,
          ),
          new Vector3(-edge.nx, 0, -edge.nz),
          0.95,
        );
        assert.ok(
          nearWalls.every((mesh) => !mesh.intersects(ray).hit),
          `${face.id} source opening is physically empty of wall geometry`,
        );
        assert.ok(
          farGlass.some((mesh) => mesh.intersects(ray).hit),
          `${face.id} far glazing follows the source opening`,
        );
      }
      if (face.id === "north-recess") {
        const u = 4.17,
          v = 4.15;
        const ray = new Ray(
          new Vector3(
            edge.a[0] + edge.tx * u + edge.nx * 0.6,
            v,
            edge.a[1] + edge.tz * u + edge.nz * 0.6,
          ),
          new Vector3(-edge.nx, 0, -edge.nz),
          0.95,
        );
        const hit = grey.intersects(ray);
        assert.ok(
          hit.hit,
          "eastern part of the north recess remains a solid panel",
        );
        const point = hit.pickedPoint!;
        const depth =
          (point.x - edge.a[0]) * edge.nx + (point.z - edge.a[1]) * edge.nz;
        assert.ok(
          depth > -0.025 && depth < 0.003,
          "the OSM recess receives no second artificial 23 cm core setback",
        );
      }
    }
    assert.equal(matched, 3);
    assert.ok(
      !scene.meshes.some(
        (mesh) => mesh.material?.name === "reality wall sign 4",
      ),
      "the unplaced projecting sign is not painted across the stair glazing",
    );
    assert.deepEqual(building, original, "OSM footprint and height unchanged");
    const count = scene.meshes.length;
    architecture.update({ x: 1000, z: 1000 });
    architecture.update({ x: building.points[0][0], z: building.points[0][1] });
    assert.equal(scene.meshes.length, count);
  } finally {
    architecture.dispose();
    assert.equal(scene.meshes.length, 0);
    assert.equal(scene.transformNodes.length, 0);
    scene.dispose();
    engine.dispose();
  }
});
