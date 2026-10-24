import test from "node:test";
import assert from "node:assert/strict";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import {
  B1_OSM_ID,
  B1_RENDER_HEIGHT,
  LANDMARK_BUILDING_REPLACEMENTS,
  buildLandmarkPlan,
  landmarkBuildingHeight,
  mappedDormEntrances,
  STADIUM_PLAN,
  ringRayDistance,
} from "../shared/landmark-reality";
import { buildLandmarkReality } from "../client/landmark-reality";
import map from "../shared/data/map.json";
import type { Building } from "../shared/types";
import {
  Simulation,
  initPhysics,
  CHARACTER_HALF_HEIGHT,
  CHARACTER_RADIUS,
} from "../shared/simulation";
import { groundHeight } from "../shared/terrain";

const buildings = map.buildings as unknown as Building[];
const plan = buildLandmarkPlan({
  buildings,
  baseElevation: () => 0,
  stadiumBaseY: 0,
});

test("B1 keeps the full original Z footprint and three documented storeys instead of OSM's single-storey default", () => {
  const source = buildings.find((b) => b.id === B1_OSM_ID)!;
  assert.equal(landmarkBuildingHeight(source), B1_RENDER_HEIGHT);
  assert.ok(B1_RENDER_HEIGHT >= 9 && B1_RENDER_HEIGHT <= 11);
  assert.ok(LANDMARK_BUILDING_REPLACEMENTS.has(source.id));
  assert.deepEqual(plan.b1Roof!.points, source.points.slice(0, -1));
  assert.equal(plan.b1Roof!.height, B1_RENDER_HEIGHT);
  const p = plan.parts
    .filter((p) => p.group === "b1")
    .flatMap((p) => p.positions);
  assert.ok(p.length > 0);
  assert.ok(
    Math.abs(Math.min(...p.filter((_, i) => i % 3 === 0)) + 113.45) <= 0.121,
    "only photographed cornice depth may extend the original footprint",
  );
  assert.equal(Math.max(...p.filter((_, i) => i % 3 === 1)), B1_RENDER_HEIGHT);
  assert.equal(landmarkBuildingHeight({ id: "other", height: 18 }), 18);
});

test("common reception entrances use the mapped western projections, preserving separate B6 and special blocks", () => {
  const entries = mappedDormEntrances(buildings, () => 0);
  assert.deepEqual(
    entries.map((e) => e.block).sort((a, b) => a - b),
    [2, 3, 4, 5, 7, 8, 9, 10],
  );
  assert.ok(
    entries.every((e) => e.nz < -0.8 && e.steps === 12 && e.rise === 1.8),
  );
  assert.ok(!entries.some((e) => [1, 6, 11, 12].includes(e.block)));
  const b7 = entries.find((e) => e.block === 7)!;
  assert.ok(Math.hypot(b7.x - 47.06, b7.z + 78.4) < 0.1);
  assert.ok(
    Math.hypot(b7.x - 68.3, b7.z + 31.5) > 40,
    "main reception must not move to the club 007 entrance",
  );
});

test("the canopy, door and twelve stair levels share one coherent landing elevation", () => {
  for (const entry of plan.entrances) {
    const boxes = plan.boxes.filter((b) => b.group === `entry-${entry.block}`);
    const steps = boxes.filter((b) => b.material === "concrete" && b.d < 0.4);
    assert.equal(steps.length, 12);
    const tops = steps.map((b) => b.y + b.h / 2).sort((a, b) => a - b);
    tops.forEach((top, i) =>
      assert.ok(Math.abs(top - entry.baseY - (i + 1) * 0.15) < 1e-8),
    );
    const door = boxes.find((b) => b.material === "glass")!;
    assert.ok(Math.abs(door.y - door.h / 2 - entry.baseY - entry.rise) < 1e-8);
    const roof = boxes.find((b) => b.material === "metal" && b.w > 3)!;
    assert.ok(roof.y - roof.h / 2 - door.y - door.h / 2 > 0.15);
    assert.ok(steps.every((b) => b.collision));
  }
});

test("stadium ray sections retain the mapped open bowl with exterior beyond the field edge", () => {
  for (let i = 0; i < 720; i++) {
    const a = (i * Math.PI * 2) / 720;
    const inner = ringRayDistance(
      STADIUM_PLAN.inner,
      STADIUM_PLAN.center.x,
      STADIUM_PLAN.center.z,
      a,
    );
    const outer = ringRayDistance(
      STADIUM_PLAN.outer,
      STADIUM_PLAN.center.x,
      STADIUM_PLAN.center.z,
      a,
    );
    assert.ok(Number.isFinite(inner) && Number.isFinite(outer));
    assert.ok(outer > inner + 8);
  }
  assert.equal(plan.stadium.rows, 0);
  assert.equal(STADIUM_PLAN.interiorMode, "closed-exterior-silhouette");
  assert.ok(
    plan.parts.some(
      (p) => p.group === "stadium" && p.material === "stadium-glass",
    ),
  );
  // Every stadium triangle is outside the central playing area. A prior
  // full-polygon roof would violate this even if the outside looked plausible.
  for (const part of plan.parts.filter((p) => p.group === "stadium"))
    for (let i = 0; i < part.indices.length; i += 3) {
      const ids = part.indices.slice(i, i + 3),
        x = ids.reduce((s, j) => s + part.positions[j * 3], 0) / 3,
        z = ids.reduce((s, j) => s + part.positions[j * 3 + 2], 0) / 3;
      const dx = x - STADIUM_PLAN.center.x,
        dz = z - STADIUM_PLAN.center.z;
      const inner = ringRayDistance(
        STADIUM_PLAN.inner,
        STADIUM_PLAN.center.x,
        STADIUM_PLAN.center.z,
        Math.atan2(dz, dx),
      );
      assert.ok(
        Math.hypot(dx, dz) >= inner - 0.3,
        "stadium triangle must not roof over its playing field (0.3 m allows projecting edge trims)",
      );
    }
});

test("visible landmark solids and Rapier collision triangles come from one finite bounded plan", () => {
  for (const part of [...plan.parts, plan.collision]) {
    assert.ok(part.positions.every(Number.isFinite));
    assert.ok(
      part.indices.every((i) => i >= 0 && i < part.positions.length / 3),
    );
    assert.equal(part.normals.length, part.positions.length);
    assert.equal(part.uvs.length, (part.positions.length / 3) * 2);
  }
  assert.ok(plan.collision.indices.length / 3 < 30000);
  // No separate B1 collision overlay: the root world uses its original OSM
  // footprint with this module's shared height override.
  assert.ok(plan.parts.some((p) => p.group === "b1"));
  assert.ok(
    plan.boxes
      .filter((b) => b.group === "stadium")
      .every((b) => b.material !== "glass"),
  );
});

test("landmark component switches geometric tiers using the shared quality radius and disposes every mesh", () => {
  const engine = new NullEngine(),
    scene = new Scene(engine);
  scene.useRightHandedSystem = true;
  const controller = buildLandmarkReality({ scene, plan });
  const near = controller.meshes.filter(
    (m) => m.metadata.landmark === "stadium" && m.metadata.lod === "near",
  );
  const far = controller.meshes.filter(
    (m) => m.metadata.landmark === "stadium" && m.metadata.lod === "far",
  );
  controller.update({ x: 1000, z: 1000 }, "low");
  assert.ok(
    near.every((m) => !m.isEnabled()) && far.every((m) => m.isEnabled()),
  );
  controller.update({ x: 22, z: -14 }, "low");
  assert.ok(
    near.every((m) => !m.isEnabled()),
    "campus spawn is 150 m from the stand, despite falling inside its circumscribed circle",
  );
  controller.update({ x: -140, z: 0 }, "high");
  assert.ok(
    near.every((m) => m.isEnabled()) && far.every((m) => !m.isEnabled()),
  );
  assert.equal(controller.metrics.commonEntrances, 8);
  controller.dispose();
  assert.equal(scene.meshes.length, 0);
  assert.equal(scene.materials.length, 0);
  scene.dispose();
  engine.dispose();
});

test("the actual game capsule continuously climbs B2's twelve exterior steps on the DEM and stops at its closed door", async () => {
  await initPhysics();
  const sim = new Simulation(),
    real = buildLandmarkPlan(),
    entry = real.entrances.find((e) => e.block === 2)!;
  const x = entry.x + entry.nx * 6,
    z = entry.z + entry.nz * 6;
  const actor = sim.add("landmark-entry-audit", {
    x,
    y: groundHeight(x, z) + 0.92,
    z,
  });
  const idle = { x: 0, z: 0, yaw: 0, jump: false, seq: 0 };
  for (let i = 0; i < 40; i++) {
    actor.step(idle);
    sim.tick(0);
  }
  actor.setPosition = () =>
    assert.fail("continuous entry audit may not teleport or fall-recover");
  let maxStep = 0,
    lastY = actor.position.y;
  for (let i = 0; i < 160; i++) {
    actor.step({ ...idle, x: -entry.nx, z: -entry.nz, seq: i + 1 });
    sim.tick(0);
    const p = actor.position;
    maxStep = Math.max(maxStep, p.y - lastY);
    lastY = p.y;
    assert.ok(p.y > groundHeight(p.x, p.z) - 0.2);
  }
  const end = actor.position,
    outward = (end.x - entry.x) * entry.nx + (end.z - entry.z) * entry.nz;
  assert.ok(
    outward < 1.1 && outward > 0.15,
    `closed mapped facade must stop the capsule at the top landing, got ${outward}`,
  );
  const feet = end.y - CHARACTER_HALF_HEIGHT - CHARACTER_RADIUS;
  assert.ok(
    Math.abs(feet - entry.baseY - entry.rise) < 0.1,
    `landing feet ${feet} vs ${entry.baseY + entry.rise}`,
  );
  assert.ok(maxStep < 0.25, "no sudden teleport-like vertical step");
  sim.dispose();
});

test("stadium glass producer declares exact near/far PBR receivers without changing tier visibility, alpha or geometry",()=>{
  const engine=new NullEngine(),scene=new Scene(engine),controller=buildLandmarkReality({scene,plan});
  try{
    const receivers=controller.meshes.filter(mesh=>mesh.metadata.authoredLightReceiver==="stadium-glass");assert.ok(receivers.length>=2);
    assert.deepEqual(new Set(receivers.map(mesh=>mesh.metadata.lod)),new Set(["near","far"]));
    for(const mesh of receivers){assert.equal(mesh.metadata.landmark,"stadium");assert.equal(mesh.metadata.sourcePack,"landmark-reality");assert.equal(mesh.material!.metadata.authoredLightReceiver,"stadium-glass");assert.equal(mesh.material!.metadata.landmarkGlass,true);assert.equal(mesh.material!.alpha,1);assert.equal(mesh.metadata.depthCaster,false);assert.ok(mesh.getTotalIndices()>0);assert.equal(mesh.isEnabled(),mesh.metadata.lod==="far");}
    for(const mesh of controller.meshes.filter(mesh=>!receivers.includes(mesh)))assert.equal(mesh.metadata.authoredLightReceiver,undefined);
  }finally{controller.dispose();scene.dispose();engine.dispose();}
});
