import assert from "node:assert/strict";
import test from "node:test";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { Ray } from "@babylonjs/core/Culling/ray";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { architectureEdges, buildArchitectureReality } from "../client/architecture-reality";
import { buildLandmarkPlan, STADIUM_PLAN } from "../shared/landmark-reality";
import { buildingBaseHeight, groundHeight } from "../shared/terrain";
import { BUILDINGS } from "../shared/world";
import { buildingRoofGeometry } from "../shared/building-roofs";
import { hasCadBuilding } from "../shared/cad-buildings";

test("each procedural roof uses the same world-space UV at shared vertices in both LODs", () => {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  scene.useRightHandedSystem = true;
  const buildings = BUILDINGS.filter((building) => !hasCadBuilding(building.id) && buildingRoofGeometry(building, 0));
  const architecture = buildArchitectureReality({ scene, buildings });
  try {
    const roofs = scene.meshes.filter((mesh) => mesh.material?.name === "reality flat weathered roof");
    assert.equal(roofs.length, buildings.length * 2);
    for (const roof of roofs) {
      const positions = roof.getVerticesData("position")!;
      const uv = roof.getVerticesData("uv")!;
      for (const index of roof.getIndices()!) {
        assert.ok(Math.abs(uv[index * 2] - positions[index * 3] / 4) < 1e-6, roof.name);
        assert.ok(Math.abs(uv[index * 2 + 1] - positions[index * 3 + 2] / 4) < 1e-6, roof.name);
      }
    }
  } finally {
    architecture.dispose();
    scene.dispose();
    engine.dispose();
  }
});

test("menza near and far use masonry under the shortened opening, with one wall owner", () => {
  const building = BUILDINGS.find((b) => b.id === "8111356")!;
  const base = buildingBaseHeight(building.points);
  const edge = architectureEdges(building.points).find((e) => e.nz < -0.8 && e.length > 35)!;
  const engine = new NullEngine();
  const scene = new Scene(engine);
  scene.useRightHandedSystem = true;
  const architecture = buildArchitectureReality({ scene, buildings: [building], baseElevation: () => base });
  try {
    for (const lod of ["near", "far"]) {
      const meshes = scene.meshes.filter((mesh) => mesh.metadata?.lod === lod);
      const hitsAt = (u: number, v: number) => {
        const x = edge.a[0] + edge.tx * u, z = edge.a[1] + edge.tz * u;
        const ray = new Ray(new Vector3(x + edge.nx * 0.4, base + v, z + edge.nz * 0.4),
          new Vector3(-edge.nx, 0, -edge.nz), 0.65);
        return meshes.filter((mesh) => mesh.intersects(ray).hit).map((mesh) => mesh.material!.name);
      };
      const bayCentre = 1.59;
      assert.ok(groundHeight(edge.a[0] + edge.tx * bayCentre, edge.a[1] + edge.tz * bayCentre) > base + 0.8);
      assert.deepEqual(hitsAt(bayCentre, 0.8), ["reality menza tile"], `${lod} has masonry behind the slope`);
      assert.match(hitsAt(bayCentre, 1.9).join(","), /^reality glass [^,]+$/, `${lod} keeps visible glazing without a backing wall`);
      assert.match(hitsAt(23, 0.75).join(","), /^reality glass [^,]+$/, `${lod} retains an unaffected low window`);
      assert.deepEqual(hitsAt(23, 0.2), ["reality concrete plinth"], `${lod} plinth is a continuous material boundary`);
      assert.deepEqual(hitsAt(edge.length * 0.3, 8), ["reality entrance galvanized frame"]);
      assert.deepEqual(hitsAt(edge.length * 0.9, 8), ["reality menza tile"]);
    }
  } finally {
    architecture.dispose();
    scene.dispose();
    engine.dispose();
  }
});

test("each entrance has one exposed stair shell while its collision boxes bridge the seams", () => {
  const plan = buildLandmarkPlan({ buildings: BUILDINGS, stadiumBaseY: 0 });
  for (const entry of plan.entrances) {
    const group = `entry-${entry.block}`;
    const concrete = plan.parts.find((p) => p.group === group && p.material === "concrete")!;
    const steps = plan.boxes.filter((b) => b.group === group && b.material === "concrete" && b.d < 0.4);
    assert.equal(steps.length, entry.steps);
    assert.ok(steps.every((s) => s.collision && s.d > 0.29));
    const walkable: [number, number][] = [];
    for (let i = 0; i < concrete.positions.length; i += 12) {
      // The covered side has exactly one owner, the pale screen.
      const covered = concrete.normals[i] * entry.nz - concrete.normals[i + 2] * entry.nx;
      assert.ok(covered < 0.99, group);
      if (concrete.normals[i + 1] < 0.999) continue;
      const depths = Array.from({ length: 4 }, (_, k) => {
        const j = i + k * 3;
        return (concrete.positions[j] - entry.x) * entry.nx +
          (concrete.positions[j + 2] - entry.z) * entry.nz;
      });
      walkable.push([Math.min(...depths), Math.max(...depths)]);
    }
    walkable.sort(([a], [b]) => a - b);
    assert.equal(walkable.length, entry.steps + 1);
    for (let i = 1; i < walkable.length; i++)
      assert.ok(Math.abs(walkable[i][0] - walkable[i - 1][1]) < 1e-9, `${group} tread boundary ${i}`);
  }
  const seats = plan.parts.find((p) => p.group === "stadium" && p.material === "seat")!;
  for (let i = 1; i < seats.positions.length; i += 3)
    assert.ok(seats.positions[i] < STADIUM_PLAN.upperHeight, "the seat mesh never occupies the parapet top plane");
});
