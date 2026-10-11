import test from "node:test";
import assert from "node:assert/strict";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import RAPIER from "@dimforge/rapier3d-compat";
import landcover from "../shared/data/landcover.json";
import map from "../shared/data/map.json";
import { groundHeight } from "../shared/terrain";
import {
  buildCampusExteriorPlan,
  CAMPUS_COURTS,
  NORTH_COURT_STYLE,
  exteriorPathClearance,
} from "../shared/campus-exterior";
import { createCampusExterior } from "../client/campus-exterior";
const plan = buildCampusExteriorPlan();

test("court overlays retain all six real OSM footprints and the two photographed blue insets", () => {
  assert.deepEqual(
    CAMPUS_COURTS.map((c) => c.osmId),
    ["41833989", "41833990", "108568385", "108568430", "293949918", "293949920"],
  );
  for (const court of CAMPUS_COURTS)
    assert.deepEqual(
      court.points,
      landcover.areas.find((a) => a.osmId === court.osmId)!.points.slice(0, -1),
    );
  assert.equal(CAMPUS_COURTS.filter((c) => c.blueInset).length, 2);
  assert.equal(
    CAMPUS_COURTS[3].sourceSport,
    "tennis",
    "red court must not be incorrectly asserted as a basketball court",
  );
  const beach = CAMPUS_COURTS[4];
  assert.ok(beach.width > 15 && beach.width < 16);
  assert.ok(beach.length > 22 && beach.length < 24);
});
test("paint and colored surfaces lie on the exact current DEM triangles rather than bridging slopes", () => {
  for (const part of plan.parts.filter(
    (p) => !["fence", "paint", "roof", "roofSeam"].includes(p.material),
  )) {
    for (let i = 0; i < part.positions.length; i += 3) {
      const [x, y, z] = part.positions.slice(i, i + 3);
      const difference = y - groundHeight(x, z);
      assert.ok(difference >= 0.0269 && difference <= 0.0341);
    }
  }
  const roof = map.buildings.find((b) => b.id === plan.shopRoof.buildingId)!;
  assert.deepEqual(plan.shopRoof.points, roof.points.slice(0, -1));
  assert.equal(roof.tags["building:levels"], "1");
});

test("north B6 tennis replacement has source red core, disjoint green runoff and merged white line geometry on its canonical terrain",()=>{
  const parts=plan.parts.filter(part=>part.asset.sourceId==="293949920"),court=CAMPUS_COURTS.find(court=>court.osmId==="293949920")!;
  assert.deepEqual(parts.map(part=>part.material).sort(),["courtGreen","courtRed","paint"]);
  assert.ok(court.width>17&&court.width<18&&court.length>36&&court.length<37,"short/long local axes must not swap on the east-west oriented court");
  const area=(points:number[][])=>Math.abs(points.reduce((sum,p,index)=>{const q=points[(index+1)%points.length];return sum+p[0]*q[1]-p[1]*q[0];},0))/2;
  let colouredArea=0;const exact=new Set<string>();
  for(const part of parts)for(let i=0;i<part.indices.length;i+=3){
    const p=part.indices.slice(i,i+3).map(index=>part.positions.slice(index*3,index*3+3)),signature=p.map(v=>v.map(n=>n.toFixed(7)).join(',')).sort().join('|');
    assert.ok(!exact.has(signature),'no exact opaque duplicate triangles');exact.add(signature);
    const x=p.reduce((sum,v)=>sum+v[0],0)/3,z=p.reduce((sum,v)=>sum+v[2],0)/3,y=p.reduce((sum,v)=>sum+v[1],0)/3;
    assert.ok(Math.abs(y-groundHeight(x,z)-(part.material==="paint"?.041:.027))<1e-6);
    if(part.material!=="paint")colouredArea+=area(p.map(v=>[v[0],v[2]]));
  }
  assert.ok(Math.abs(colouredArea-area(court.points))<1e-5,`red/green footprint area: render=${colouredArea}, source=${area(court.points)}, difference=${colouredArea-area(court.points)}`);
  assert.equal(NORTH_COURT_STYLE.measured,false);assert.equal(NORTH_COURT_STYLE.sourceSurfaceTagRetained,'clay');
  assert.equal(plan.gates.filter(gate=>gate.courtId===court.osmId).length,0,'no guessed north gate');
  assert.equal(plan.fences.filter(fence=>fence.courtId===court.osmId).length,0,'no unmeasured north fence collider');
});
test("fences preserve existing pedestrian widths plus capsule clearance and expose eight honest adaptation gates", () => {
  assert.equal(plan.gates.length, 8);
  for (const gate of plan.gates) {
    assert.equal(gate.provenance, "game-access-adaptation-not-surveyed");
    assert.ok(gate.width >= 2.6);
  }
  for (const fence of plan.fences) {
    const length = Math.hypot(fence.b[0] - fence.a[0], fence.b[1] - fence.a[1]);
    for (let t = 0; t <= 1; t += 0.1 / length) {
      const p: [number, number] = [
        fence.a[0] + (fence.b[0] - fence.a[0]) * t,
        fence.a[1] + (fence.b[1] - fence.a[1]) * t,
      ];
      assert.ok(
        exteriorPathClearance(p) > 0.64,
        "source pedestrian path must not be narrowed by a guessed fence",
      );
    }
  }
});
test("all exterior triangles are finite, bounded, valid and budgeted separately from the unchanged finest source plan", () => {
  for (const p of [...plan.parts, plan.collision]) {
    assert.ok(p.positions.every(Number.isFinite));
    assert.equal(p.normals.length, p.positions.length);
    assert.equal(p.uvs.length, (p.positions.length / 3) * 2);
    assert.ok(
      p.indices.every(
        (i) => Number.isInteger(i) && i >= 0 && i < p.positions.length / 3,
      ),
    );
  }
  // Source objects retain independent editable meshes/LOD; batching remains
  // bounded within each court rather than merging five unrelated locations.
  assert.ok(plan.parts.length <= CAMPUS_COURTS.length * 6 + 2);
  const original=plan.parts.filter(p=>p.asset.sourceId!=="293949920"),north=plan.parts.filter(p=>p.asset.sourceId==="293949920");
  assert.ok(original.reduce((s, p) => s + p.indices.length / 3, 0) < 9500);
  assert.ok(north.reduce((s,p)=>s+p.indices.length/3,0)<3500,"new source-based north court remains bounded independently of the unchanged original pack");
  assert.ok(
    original
      .filter((p) => p.lod === "both")
      .reduce((s, p) => s + p.indices.length / 3, 0) < 2400,
  );
  assert.equal(plan.collision.indices.length / 3, plan.fences.length * 2);
});
test("opaque batched renderer switches detail without decimating or mutating its source geometry", () => {
  const engine = new NullEngine(),
    scene = new Scene(engine);
  scene.useRightHandedSystem = true;
  const before = JSON.stringify(plan),
    c = createCampusExterior(scene, plan);
  assert.ok(
    c.meshes
      .filter((m) => m.metadata.lod === "near")
      .every((m) => !m.isEnabled()),
  );
  c.update(0, 12, "low");
  assert.ok(c.stats.detail);
  assert.ok(c.meshes.every((m) => m.material!.alpha === 1));
  c.update(440, 340, "low");
  assert.ok(!c.stats.detail);
  assert.ok(
    c.meshes
      .filter((m) => m.metadata.lod === "near")
      .every((m) => !m.isEnabled()),
  );
  assert.equal(JSON.stringify(plan), before);
  c.dispose();
  assert.equal(scene.meshes.length, 0);
  assert.equal(scene.materials.length, 0);
  scene.dispose();
  engine.dispose();
});
test("Rapier capsule passes every open gate and is stopped by the identical shared visible fence boundary", async () => {
  await RAPIER.init();
  const world = new RAPIER.World({ x: 0, y: 0, z: 0 });
  world.createCollider(
    RAPIER.ColliderDesc.trimesh(
      new Float32Array(plan.collision.positions),
      new Uint32Array(plan.collision.indices),
      RAPIER.TriMeshFlags.FIX_INTERNAL_EDGES,
    ),
  );
  const move = (a: [number, number], b: [number, number]) => {
    const x = (a[0] + b[0]) / 2,
      z = (a[1] + b[1]) / 2,
      dx = b[0] - a[0],
      dz = b[1] - a[1],
      len = Math.hypot(dx, dz),
      nx = -dz / len,
      nz = dx / len;
    const body = world.createRigidBody(
      RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(
        x - nx * 2,
        groundHeight(x, z) + 0.83,
        z - nz * 2,
      ),
    );
    const shape = world.createCollider(
        RAPIER.ColliderDesc.capsule(0.38, 0.42),
        body,
      ),
      controller = world.createCharacterController(0.01);
    for (let tick = 0; tick < 120; tick++) {
      controller.computeColliderMovement(shape, {
        x: nx * 0.04,
        y: 0,
        z: nz * 0.04,
      });
      const p = body.translation(),
        m = controller.computedMovement();
      body.setNextKinematicTranslation({
        x: p.x + m.x,
        y: p.y + m.y,
        z: p.z + m.z,
      });
      world.step();
    }
    const p = body.translation(),
      cross = (p.x - x) * nx + (p.z - z) * nz;
    world.removeCharacterController(controller);
    world.removeRigidBody(body);
    return cross;
  };
  for (const gate of plan.gates)
    assert.ok(
      move(gate.a, gate.b) > 1.8,
      `gate ${gate.courtId} must be physically passable`,
    );
  for (const f of plan.fences.filter(
    (f) => Math.hypot(f.b[0] - f.a[0], f.b[1] - f.a[1]) > 8,
  ))
    assert.ok(
      move(f.a, f.b) < -0.4,
      `fence ${f.courtId} must stop the capsule`,
    );
  world.free();
});
