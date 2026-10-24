import test from "node:test";
import assert from "node:assert/strict";
import RAPIER from "@dimforge/rapier3d-compat";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { VertexBuffer } from "@babylonjs/core/Buffers/buffer";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Simulation, initPhysics } from "../shared/simulation";
import { buildingRoofGeometry } from "../shared/building-roofs";
import { BUILDINGS, buildingArchitecture } from "../shared/world";
import { buildingBaseHeight } from "../shared/terrain";
import {
  LANDMARK_BUILDING_REPLACEMENTS,
  buildLandmarkPlan,
  STADIUM_PLAN,
} from "../shared/landmark-reality";
import { buildCampusExteriorPlan } from "../shared/campus-exterior";
import { buildArchitectureReality } from "../client/architecture-reality";
import { CAD_BUILDINGS } from "../shared/cad-buildings";
import { cadWorldToLocal, cadSurfaceHeightAtXZ } from "../shared/cad-building-geometry";
await initPhysics();
const building = BUILDINGS.find((b) => b.id === "53921692")!;
const baseY = buildingBaseHeight(building.points);
const roof = buildingRoofGeometry(building, baseY)!;
const incident = { x: 154.1723175048828, z: -125.22493743896484 };

test("B1 and market roof collision streams exactly reuse their visible triangles", () => {
  const landmarks = buildLandmarkPlan(),
    exterior = buildCampusExteriorPlan();
  for (const [plan, group] of [
    [landmarks, "b1"],
    [exterior, "market-roof"],
  ] as const) {
    const rendered = plan.parts.find(
      (p) => p.group === group && p.material === "roof",
    )!;
    const collision = plan.twoSidedRoofCollision;
    assert.ok(collision.indices.length > 0);
    for (const attribute of ["positions", "indices", "normals", "uvs"] as const)
      assert.deepEqual(
        collision[attribute],
        rendered[attribute],
        `${group} ${attribute}`,
      );
  }
});

test("actual B1 and market roofs stop the chassis from above and below without filling B1 courtyards or stadium", () => {
  const sim = new Simulation(),
    landmarks = buildLandmarkPlan(),
    exterior = buildCampusExteriorPlan();
  try {
    const b1 = CAD_BUILDINGS.find((building) => building.id === "b01")!;
    const local = cadWorldToLocal({ x: -87, y: 0, z: 80 }, b1.placement);
    const heights = (surfaces: typeof b1.site.supportSurfaces) => surfaces
      .filter((surface) => surface.floor === "n04" && surface.role === "slab")
      .map((surface) => cadSurfaceHeightAtXZ(surface, local.x, local.z))
      .filter((height): height is number => height !== undefined)
      .map((height) => height + b1.placement.translation.y);
    const top = Math.max(...heights(b1.site.supportSurfaces));
    const underside = Math.min(...heights(b1.site.coverSurfaces));
    assert.ok(Number.isFinite(top) && Number.isFinite(underside) && top > underside,
      "native CAD roof has distinct upper and lower construction faces");
    for (const point of [
      { id: "b1", x: -87, z: 80, top, underside },
      { id: "market", x: 114, z: -63, top: exterior.shopRoof.y, underside: exterior.shopRoof.y },
    ]) {
      for (const direction of [-1, 1]) {
        const surfaceY = direction < 0 ? point.top : point.underside;
        const origin = { x: point.x, y: surfaceY - direction * 0.5, z: point.z };
        const rayHit = sim.world.castRay(
          new RAPIER.Ray(origin, { x: 0, y: direction, z: 0 }),
          1,
          true,
        );
        assert.ok(
          rayHit && Math.abs(rayHit.timeOfImpact - 0.5) < 1e-5,
          `${point.id} roof ray ${direction}`,
        );
        sim.car.reset(
          { x: point.x, y: surfaceY - direction * 2, z: point.z },
          0,
        );
        sim.car.unpark("roof-probe");
        sim.car.body.setLinvel(
          { x: 0, y: direction < 0 ? -8 : 25, z: 0 },
          true,
        );
        let maximumTop = -Infinity;
        for (let i = 0; i < 60; i++) {
          sim.tick(0);
          maximumTop = Math.max(maximumTop, sim.car.position.y + 1.56);
        }
        if (direction < 0)
          assert.ok(
            sim.car.position.y > surfaceY - 0.1,
            `${point.id} fell through top`,
          );
        else
          assert.ok(
            maximumTop < surfaceY + 0.08,
            `${point.id} penetrated underside`,
          );
      }
    }
    for (const x of [-104, -68]) {
      assert.equal(
        sim.world.castRay(
          new RAPIER.Ray(
            { x, y: top + 1, z: 80 },
            { x: 0, y: -1, z: 0 },
          ),
          2,
          true,
        ),
        null,
        `B1 courtyard ${x} must remain open`,
      );
    }
    assert.equal(
      sim.world.castRay(
        new RAPIER.Ray(
          { ...STADIUM_PLAN.center, y: landmarks.stadium.baseY + 50 },
          { x: 0, y: -1, z: 0 },
        ),
        50,
        true,
        undefined,
        undefined,
        undefined,
        undefined,
        (c) => !sim.groundColliders.has(c.handle),
      ),
      null,
      "no roof collider over the open playing field",
    );
  } finally {
    sim.dispose();
  }
});

test("OSM53921692 previously missed roof ray and car now collide at the exact rendered roof", () => {
  const sim = new Simulation();
  try {
    const ray = new RAPIER.Ray(
      { ...incident, y: roof.y + 5 },
      { x: 0, y: -1, z: 0 },
    );
    const collider = sim.buildingRoofColliders.get(building.id)!;
    const hit = sim.world.castRayAndGetNormal(ray, 20, true)!;
    assert.equal(hit.collider.handle, collider.handle);
    assert.ok(Math.abs(ray.origin.y - hit.timeOfImpact - roof.y) < 1e-5);
    const below = collider.castRayAndGetNormal(
      new RAPIER.Ray({ ...incident, y: roof.y - 0.5 }, { x: 0, y: 1, z: 0 }),
      1,
      true,
    )!;
    assert.ok(Math.abs(below.timeOfImpact - 0.5) < 1e-5);
    sim.car.reset({ ...incident, y: roof.y + 2 }, 0);
    sim.car.unpark("roof-probe");
    sim.car.body.setLinvel({ x: 0, y: -8, z: 0 }, true);
    for (let i = 0; i < 90; i++) sim.tick(0);
    assert.ok(
      sim.car.position.y > roof.y - 0.1,
      `car entered building: ${sim.car.position.y}`,
    );
    const after = { ...sim.car.position };
    sim.world.removeCollider(collider, true);
    sim.world.propagateModifiedBodyPositionsToColliders();
    sim.car.reset({ ...incident, y: roof.y + 2 }, 0);
    sim.car.body.setLinvel({ x: 0, y: -8, z: 0 }, true);
    for (let i = 0; i < 90; i++) sim.tick(0);
    assert.ok(
      sim.car.position.y + 1.56 < roof.y,
      "removing only the previously missing roof reproduces the fall-through",
    );
    console.log("OSM53921692 roof reproduction", {
      sourceHeight: building.height,
      baseY,
      roofY: roof.y,
      beforeWithoutRoof: { ...sim.car.position },
      afterWithRoof: after,
    });
  } finally {
    sim.dispose();
  }
});

test("shared roof remains two-sided for the chassis and blocks an oblique upward approach", () => {
  for (const [horizontal, vertical] of [
    [0, 25],
    [5, 25],
    [5, 300],
  ]) {
    const sim = new Simulation();
    try {
      sim.car.reset({ ...incident, y: roof.y - 2 }, 0);
      sim.car.unpark("under-roof");
      sim.car.body.setLinvel({ x: horizontal, y: vertical, z: 0 }, true);
      let maxY = -Infinity;
      for (let i = 0; i < 25; i++) {
        sim.tick(0);
        maxY = Math.max(maxY, sim.car.position.y + 1.56);
      }
      assert.ok(
        maxY < roof.y + 0.08,
        `underside penetration ${maxY - roof.y}m`,
      );
    } finally {
      sim.dispose();
    }
  }
});

test("roof rays follow the real slanted outline and its small recesses, with no generic caps on replacements", () => {
  const sim = new Simulation();
  try {
    const collider = sim.buildingRoofColliders.get(building.id)!;
    const inside = (x: number, z: number) => {
      let result = false;
      for (
        let i = 0, j = roof.points.length - 1;
        i < roof.points.length;
        j = i++
      ) {
        const [ax, az] = roof.points[i],
          [bx, bz] = roof.points[j];
        if (az > z !== bz > z && x < ((bx - ax) * (z - az)) / (bz - az) + ax)
          result = !result;
      }
      return result;
    };
    for (let i = 0; i < roof.points.length; i++) {
      const [ax, az] = roof.points[i],
        [bx, bz] = roof.points[(i + 1) % roof.points.length],
        length = Math.hypot(bx - ax, bz - az);
      for (const side of [-1, 1]) {
        const x = (ax + bx) / 2 + ((bz - az) / length) * side * 0.02,
          z = (az + bz) / 2 - ((bx - ax) / length) * side * 0.02;
        for (const direction of [-1, 1]) {
          const hit = collider.castRay(
            new RAPIER.Ray(
              { x, y: roof.y - direction, z },
              { x: 0, y: direction, z: 0 },
            ),
            2,
            true,
          );
          assert.equal(
            hit >= 0,
            inside(x, z),
            `edge ${i}, side ${side}, direction ${direction}`,
          );
        }
      }
    }
    for (const b of BUILDINGS) {
      assert.equal(
        sim.buildingRoofColliders.has(b.id),
        !!buildingRoofGeometry(b, buildingBaseHeight(b.points))?.indices.length,
        b.id,
      );
    }
  } finally {
    sim.dispose();
  }
});

test("shared polygon keeps rendered triangles/UV order and rejects B6, market and landmark replacements", () => {
  const engine = new NullEngine(),
    scene = new Scene(engine);
  const plan = buildArchitectureReality({
    scene,
    buildings: [building],
    baseElevation: () => baseY,
  });
  try {
    const roofMesh = scene.meshes.find(
      (m) =>
        m.name.includes(building.id) &&
        m.name.includes("near") &&
        m.material?.name === "reality flat weathered roof",
    )!;
    assert.ok(roofMesh);
    const expectedUvs: number[] = [];
    for (let i = 0; i < roof.triangles.length; i += 3) {
      const a = roof.points[roof.triangles[i]],
        c = roof.points[roof.triangles[i + 2]];
      expectedUvs.push(
        a[0] / 4,
        a[1] / 4,
        c[0] / 4,
        a[1] / 4,
        c[0] / 4,
        c[1] / 4,
        a[0] / 4,
        c[1] / 4,
      );
    }
    const uvs = roofMesh.getVerticesData(VertexBuffer.UVKind)!;
    assert.equal(uvs.length, expectedUvs.length);
    assert.ok(
      expectedUvs.every((v, i) => Math.abs(v - uvs[i]) < 1e-5),
      "preserves the prior raw earcut UV corner order",
    );
    const positions = roofMesh.getVerticesData(VertexBuffer.PositionKind)!;
    const indices = Array.from(roofMesh.getIndices()!);
    const world = roofMesh.computeWorldMatrix(true);
    const key = (values: number[]) =>
      values.map((v) => Math.round(v * 1e4)).join(",");
    const rendered = [];
    for (let i = 0; i < indices.length; i += 3)
      rendered.push(
        indices
          .slice(i, i + 3)
          .map((id) =>
            key(
              Vector3.TransformCoordinates(
                Vector3.FromArray(positions, id * 3),
                world,
              ).asArray(),
            ),
          )
          .sort()
          .join("|"),
      );
    const collision = [];
    for (let i = 0; i < roof.indices.length; i += 3)
      collision.push(
        roof.indices
          .slice(i, i + 3)
          .map((id) => key(roof.positions.slice(id * 3, id * 3 + 3)))
          .sort()
          .join("|"),
      );
    assert.deepEqual(rendered.sort(), collision.sort());
    for (const b of BUILDINGS.filter(
      (b) =>
        buildingArchitecture(b)?.block === 6 ||
        b.id === "7645350" ||
        LANDMARK_BUILDING_REPLACEMENTS.has(b.id),
    ))
      assert.equal(
        buildingRoofGeometry(b, buildingBaseHeight(b.points)),
        null,
        b.id,
      );
  } finally {
    plan.dispose();
    scene.dispose();
    engine.dispose();
  }
});
