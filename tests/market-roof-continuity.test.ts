import test from "node:test";
import assert from "node:assert/strict";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Ray } from "@babylonjs/core/Culling/ray";
import RAPIER from "@dimforge/rapier3d-compat";
import { BUILDINGS } from "../shared/world";
import { buildingBaseHeight } from "../shared/terrain";
import { buildCampusExteriorPlan } from "../shared/campus-exterior";
import { Simulation, initPhysics } from "../shared/simulation";
import {
  architectureEdges,
  buildArchitectureReality,
} from "../client/architecture-reality";
import { createCampusExterior } from "../client/campus-exterior";

const shop = BUILDINGS.find((building) => building.id === "7645350")!;
const wallTop = buildingBaseHeight(shop.points) + shop.height;

test("market roof and both facade LODs meet at the canonical wall top on the sloping source ring", () => {
  const plan = buildCampusExteriorPlan();
  const oldGap =
    buildingBaseHeight(plan.shopRoof.points) + shop.height + 0.025 - wallTop;
  assert.ok(
    oldGap > 0.33 && oldGap < 0.35,
    "fixture retains the reported 34 cm gap",
  );
  assert.equal(plan.shopRoof.y, wallTop);
  assert.deepEqual(plan.shopRoof.points, shop.points.slice(0, -1));
  const roof = plan.parts.find(
    (part) => part.group === "market-roof" && part.material === "roof",
  )!;
  assert.deepEqual(roof.positions, plan.twoSidedRoofCollision.positions);
  const engine = new NullEngine(),
    scene = new Scene(engine);
  scene.useRightHandedSystem = true;
  const facade = buildArchitectureReality({
    scene,
    buildings: [shop],
    baseElevation: () => buildingBaseHeight(shop.points),
  });
  const exterior = createCampusExterior(scene, plan);
  try {
    const roofMesh = exterior.meshes.find(
      (mesh) =>
        mesh.metadata.exteriorGroup === "market-roof" &&
        mesh.material?.name === "campus-exterior:roof",
    )!;
    roofMesh.computeWorldMatrix(true);
    for (const lod of ["near", "far"] as const) {
      facade.update(
        lod === "near" ? { x: 130.63, z: -53.46 } : { x: 400, z: 300 },
      );
      const walls = scene.meshes.filter(
        (mesh) =>
          mesh.metadata?.sourcePack === "architecture-reality" &&
          mesh.metadata.lod === lod &&
          mesh.isEnabled(),
      );
      assert.ok(walls.length > 0);
      for (const edge of architectureEdges(shop.points).filter(
        (edge) => edge.length > 5,
      )) {
        const x = (edge.a[0] + edge.b[0]) / 2,
          z = (edge.a[1] + edge.b[1]) / 2;
        // A ray just below the visible roof must meet the wall, not see through
        // a gap to the opposite facade/trees as in the gameplay report.
        const ray = new Ray(
          new Vector3(x + edge.nx, wallTop - 0.01, z + edge.nz),
          new Vector3(-edge.nx, 0, -edge.nz),
          1.1,
        );
        assert.ok(
          walls.some((mesh) => {
            mesh.computeWorldMatrix(true);
            return mesh.intersects(ray).hit;
          }),
          `${lod} wall/roof joint at ${x},${z}`,
        );
        const down = new Ray(
          new Vector3(x - edge.nx * 0.5, wallTop + 0.5, z - edge.nz * 0.5),
          new Vector3(0, -1, 0),
          0.6,
        );
        const hit = roofMesh.intersects(down);
        assert.ok(
          hit.hit && Math.abs(hit.pickedPoint!.y - wallTop) < 1e-5,
          `${lod} roof height`,
        );
      }
    }
    const seam = plan.parts.find(
      (part) => part.group === "market-roof" && part.material === "roofSeam",
    )!;
    const ys = seam.positions.filter((_, index) => index % 3 === 1);
    assert.ok(
      Math.abs(Math.min(...ys) - wallTop) < 1e-8,
      "flashing rests on the roof rather than floating above it",
    );
  } finally {
    facade.dispose();
    exterior.dispose();
    scene.dispose();
    engine.dispose();
  }
});

test("real Rapier market roof uses the same canonical wall-top height from both sides", async () => {
  await initPhysics();
  const sim = new Simulation();
  try {
    for (const direction of [-1, 1]) {
      const hit = sim.world.castRay(
        new RAPIER.Ray(
          { x: 114, y: wallTop - direction * 0.5, z: -63 },
          { x: 0, y: direction, z: 0 },
        ),
        0.6,
        true,
      );
      assert.ok(
        hit && Math.abs(hit.timeOfImpact - 0.5) < 1e-5,
        `roof direction ${direction}`,
      );
    }
  } finally {
    sim.dispose();
  }
});
