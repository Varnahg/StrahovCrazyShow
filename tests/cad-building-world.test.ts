import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { LoadAssetContainerAsync } from "@babylonjs/core/Loading/sceneLoader";
import { VertexBuffer } from "@babylonjs/core/Buffers/buffer";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import RAPIER from "@dimforge/rapier3d-compat";
import { loadCadBuildings } from "../client/cad-buildings";
import { CAD_BUILDINGS, CAD_TERRAIN_CUTOUTS, cadCollisionParts, cadZoneAt, hasCadBuilding, CAD_B6_ENTRY, cadDoorPosition, cadB6EntranceHeight } from "../shared/cad-buildings";
import { cadLocalToWorld, cadPolygonContainsXZ, cadSurfaceHeightAtXZ } from "../shared/cad-building-geometry";
import { initPhysics, Simulation, CHARACTER_RADIUS, CHARACTER_HALF_HEIGHT } from "../shared/simulation";
import { createTerrainTiles, terrainMeshData, terrainCollisionData, groundHeight, drapeTriangles } from "../shared/terrain";
import { BUILDINGS, GROUND_RECTS, TERRAIN_COVERAGE } from "../shared/world";
import { buildLandmarkPlan } from "../shared/landmark-reality";

const building = CAD_BUILDINGS[0];
const sha = (path: string) => createHash("sha256").update(readFileSync(path)).digest("hex");

for (const building of CAD_BUILDINGS) {
test(`${building.id} site, native GLB a konstrukční data mají přesnou společnou identitu`, () => {
  assert.equal(building.site.sourceCollisionSha256, sha(`shared/data/cad-buildings/${building.id}.json`));
  assert.equal(building.glbSha256, sha(`public/models/cad-buildings/${building.id}.glb`));
  assert.equal(building.site.sourceBlendSha256, sha(`assets/blender/cad-buildings/${building.id}.blend`));
  for (const polygon of [...building.site.terrainCutouts, ...building.site.supportSurfaces, ...building.site.coverSurfaces])
    for (const ring of polygon.loops) for (const point of ring)
      assert.ok(point.length === 2 && point.every(Number.isFinite));
  assert.ok(building.url.endsWith(building.glbSha256));
  assert.ok(hasCadBuilding(building.osmId));
  const plan = buildLandmarkPlan({ buildings: BUILDINGS.filter(item => !hasCadBuilding(item.id)) });
  assert.equal(plan.b1Roof, undefined);
  assert.ok(plan.parts.every(part => part.group !== "b1"));
  assert.ok(plan.parts.some(part => part.group === "stadium"));
});

test(`skutečný ${building.id} GLB v Babylonu má stejnou transformovanou obálku každé kolizní části`, async () => {
  const engine = new NullEngine(), scene = new Scene(engine); scene.useRightHandedSystem = true;
  try {
    const bytes = readFileSync(`public/models/cad-buildings/${building.id}.glb`);
    const controller = await loadCadBuildings(scene, [building], {
      loadContainer: () => LoadAssetContainerAsync(new Uint8Array(bytes), scene, { pluginExtension: ".glb" }),
    });
    const gltf = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString());
    assert.equal(controller.stats.meshes, gltf.meshes.reduce((sum: number, mesh: { primitives: unknown[] }) => sum + mesh.primitives.length, 0));
    for (const part of cadCollisionParts().filter(part => part.buildingId === building.id)) {
      const node = scene.getNodeByName(part.id); assert.ok(node, part.id);
      const sourceMesh = scene.getMeshByName(part.id);
      const meshes = node.getChildMeshes(false).filter(mesh => mesh.getTotalVertices() > 0);
      if (sourceMesh?.getTotalVertices()) meshes.unshift(sourceMesh);
      assert.ok(meshes.length, part.id);
      // Babylon's transformed local AABB includes empty corners of irregular
      // floor batches. Compare the actual rendered vertices, not that bound.
      const input = new Vector3(), output = new Vector3();
      const minimum = [Infinity, Infinity, Infinity], maximum = [-Infinity, -Infinity, -Infinity];
      for (const mesh of meshes) {
        const vertices = mesh.getVerticesData(VertexBuffer.PositionKind); assert.ok(vertices);
        const matrix = mesh.computeWorldMatrix(true);
        for (let i = 0; i < vertices.length; i += 3) {
          input.set(vertices[i], vertices[i + 1], vertices[i + 2]);
          Vector3.TransformCoordinatesToRef(input, matrix, output);
          for (const [axis, value] of [output.x, output.y, output.z].entries()) {
            minimum[axis] = Math.min(minimum[axis], value); maximum[axis] = Math.max(maximum[axis], value);
          }
        }
      }
      for (const [axis, key] of ["x", "y", "z"].entries()) {
        let low = Infinity, high = -Infinity;
        for (let i = axis; i < part.positions.length; i += 3) {
          low = Math.min(low, part.positions[i]); high = Math.max(high, part.positions[i]);
        }
        assert.ok(Math.abs(minimum[axis] - low) < 0.001, `${part.id}/${key}/min: ${minimum[axis]} vs ${low}`);
        assert.ok(Math.abs(maximum[axis] - high) < 0.001, `${part.id}/${key}/max: ${maximum[axis]} vs ${high}`);
      }
    }
    controller.dispose(); assert.equal(scene.meshes.length, 0);
  } finally { scene.dispose(); engine.dispose(); }
});
}

test("render i fyzika odstraní stejné CAD půdorysy z terénu i drapovaných povrchů", () => {
  const tiles = createTerrainTiles(GROUND_RECTS, TERRAIN_COVERAGE);
  const visual = terrainMeshData(tiles), physical = terrainCollisionData(tiles);
  assert.equal(visual.positions.length, physical.vertices.length);
  assert.equal(visual.indices.length, physical.indices.length);
  const cutouts = CAD_TERRAIN_CUTOUTS.map(polygon => {
    const points = polygon.loops.flat();
    return { ...polygon, bounds: {
      minX: Math.min(...points.map(p => p[0])), maxX: Math.max(...points.map(p => p[0])),
      minZ: Math.min(...points.map(p => p[1])), maxZ: Math.max(...points.map(p => p[1])),
    }, sourcePartIds: [] };
  });
  const check = (data: { positions: number[]; indices: number[] }) => {
    for (let i = 0; i < data.indices.length; i += 3) {
      let x = 0, z = 0;
      for (const index of data.indices.slice(i, i + 3)) {
        x += data.positions[index * 3] / 3; z += data.positions[index * 3 + 2] / 3;
      }
      assert.ok(!cutouts.some(cutout => cadPolygonContainsXZ(cutout, x, z)), `Zem uvnitř CAD: ${x},${z}`);
    }
  };
  check(visual);
  const x = building.placement.translation.x, z = building.placement.translation.z;
  check(drapeTriangles([[x - 45, z - 45], [x + 45, z - 45], [x + 45, z + 45], [x - 45, z + 45]], [0, 1, 2, 0, 2, 3], 0.02));
  for (let i = 0; i < visual.indices.length; i += 3) {
    assert.equal(physical.indices[i], visual.indices[i]);
    assert.equal(physical.indices[i + 1], visual.indices[i + 2]);
    assert.equal(physical.indices[i + 2], visual.indices[i + 1]);
  }
});

test("B1 interiér a střecha se rozlišují z native podlah a skutečného zakrytí", () => {
  const room = cadLocalToWorld({ x: -(735.462 - 731), y: 2.85 + 0.82, z: -(249.737 - 250) }, building.placement);
  assert.equal(cadZoneAt(room), "b01:n02");
  const roof = cadLocalToWorld({ x: 0, y: 9 + 0.82, z: 0 }, building.placement);
  assert.equal(cadZoneAt(roof), undefined);
  assert.equal(cadZoneAt({ x: 0, y: groundHeight(0, 0) + 0.82, z: 0 }), undefined);
});

for (const building of CAD_BUILDINGS) {
test(`skutečná Simulation souvisle projde ${building.id} schodišťové trasy ve světovém umístění`, async () => {
  await initPhysics();
  const { routePath } = await import(new URL("../scripts/cad-buildings/verify_routes.mjs", import.meta.url).href);
  const { profileSettings } = await import(new URL("../scripts/cad-buildings/rapier_model.mjs", import.meta.url).href);
  const settings = profileSettings("current");
  assert.equal(CHARACTER_RADIUS, settings.radius); assert.equal(CHARACTER_HALF_HEIGHT, settings.halfHeight);
  assert.equal(2 * (CHARACTER_RADIUS + CHARACTER_HALF_HEIGHT), 1.6);
  const sim = new Simulation(), results: unknown[] = [], failures: string[] = [];
  const footOffset = CHARACTER_RADIUS + CHARACTER_HALF_HEIGHT;
  const idle = { x: 0, z: 0, yaw: 0, jump: false, seq: 0 };
  const groups = new Map<string, typeof building.model.stairs>();
  for (const flight of building.model.stairs) {
    const group = groups.get(flight.routeId) ?? []; group.push(flight); groups.set(flight.routeId, group);
  }
  const scene = { local: ([x, y]: number[]) => ({ x: -(y - building.model.cadOrigin[1]), z: -(x - building.model.cadOrigin[0]) }) };
  const actor = sim.add("cad-world-walker", { x: 0, y: 30, z: 0 });
  try {
    assert.equal(sim.buildingRoofColliders.has(building.osmId), false);
    for (const [id, flights] of groups) {
      flights.sort((a, b) => a.routeIndex - b.routeIndex);
      const local = routePath(scene, flights, flights[0].routeAccessPath ?? {}) as { x: number; z: number; floor: number | null }[];
      const forward = local.map(point => {
        const p = cadLocalToWorld({ x: point.x, y: point.floor ?? 0, z: point.z }, building.placement);
        return { x: p.x, z: p.z, floor: point.floor === null ? null : p.y };
      });
      for (const direction of ["up", "down"]) {
        const path = direction === "up" ? forward : [...forward].reverse(), start = path[0];
        assert.notEqual(start.floor, null);
        actor.resetOnFoot({ x: start.x, y: start.floor! + footOffset + 0.1, z: start.z });
        actor.setPosition = () => assert.fail("CAD continuous world traversal must not teleport or fall-recover");
        for (let i = 0; i < 80; i++) { actor.step(idle); sim.tick(0); }
        const setupError = actor.position.y - start.floor! - footOffset - 0.02;
        let passed = actor.grounded && Math.abs(setupError) < 0.1;
        const legs: unknown[] = [];
        for (const target of passed ? path.slice(1) : []) {
          const origin = actor.position;
          const budget = Math.ceil(Math.hypot(target.x - origin.x, target.z - origin.z) / 4.6 * 60) + 180;
          let reached = false;
          for (let frame = 0; frame < budget; frame++) {
            const p = actor.position, dx = target.x - p.x, dz = target.z - p.z, distance = Math.hypot(dx, dz);
            const scale = Math.max(distance, 0.08);
            actor.step({ ...idle, x: dx / scale, z: dz / scale, seq: frame + 1 }); sim.tick(0);
            const q = actor.position;
            if (Math.hypot(target.x - q.x, target.z - q.z) < 0.1 && actor.grounded &&
                (target.floor === null || Math.abs(q.y - target.floor - footOffset - 0.02) < 0.14)) {
              reached = true; break;
            }
          }
          legs.push({ target, reached, finish: { ...actor.position } });
          if (!reached) { passed = false; break; }
        }
        results.push({ id, direction, passed, setupError, legs });
        if (!passed) failures.push(`${id}:${direction}`);
      }
    }
    if (process.env.CAD_WORLD_PROOF) writeFileSync(process.env.CAD_WORLD_PROOF.replace(/\.json$/, `-${building.id}.json`), JSON.stringify({
      scope: "Actual full Simulation, CPU only; no GPU claim", modelSha256: building.site.sourceCollisionSha256,
      placement: building.placement, cases: results.length, failed: failures, results,
    }, null, 2));
    assert.ok(groups.size > 0);
    assert.equal(results.length, groups.size * 2);
    assert.deepEqual(failures, []);
  } finally { sim.dispose(); }
});

test(`${building.id} podmíněné průchody jednotlivě otevřenými dveřmi a ochrana pevných křídel ve skutečné Simulation`, async (t) => {
  await initPhysics();
  const { doorApproachGeometry, profileSettings, fixedOpeningSpec } = await import(new URL("../scripts/cad-buildings/rapier_model.mjs", import.meta.url).href);
  const { fixedOpeningCoverage } = await import(new URL("../scripts/cad-buildings/verify_doors.mjs", import.meta.url).href);
  const settings = profileSettings("current"), sim = new Simulation();
  const nativeScene = { settings, local: ([x, y]: number[]) => ({
    x: -(y - building.model.cadOrigin[1]), z: -(x - building.model.cadOrigin[0]),
  }) };
  const actor = sim.add("cad-exterior-door", { x: 0, y: 30, z: 0 });
  const idle = { x: 0, z: 0, yaw: 0, jump: false, seq: 0 };
  const results: {id:string;direction:number;passed:boolean;walkingPassed:boolean;[key:string]:unknown}[] = [], protections:unknown[] = [], failures: string[] = [];
  const definitions=new Map([...sim.doorPhysics.definitions.values()].filter(d=>d.definition.buildingId===building.id)
    .map(d=>[d.definition.sourceDoorId,d]));
  // These exact upward cases have a source-acknowledged 0.481m model height
  // discrepancy. Their walking failure stays explicit even if a real jump can
  // traverse the model; neither jumping nor conditional opening validates its
  // historical source height or proves an E interaction.
  const sourceHeightDiscrepancyIds=building.id==='b06'?[
    'n01-door-4D6C:0','n01-door-4D81:1','n01-door-4D8D:0',
    'n01-door-4DA1:1','n01-door-4DAE:0','n01-door-4DC3:1',
  ]:[];
  try {
    for(const definition of definitions.values())assert.equal(sim.doorPhysics.isOpen(definition.id),false,'Fresh Simulation must start with closed doors');
    for (const door of building.model.doors) {
      const approaches=doorApproachGeometry(nativeScene,door);
      const local = approaches.points as { x: number; z: number }[];
      const fixed=fixedOpeningSpec(door);
      if(fixed){
        const coverage=fixedOpeningCoverage({...nativeScene,model:building.model},door);
        for(const direction of [0,1]){
          const start=cadLocalToWorld({...local[direction],y:(door.bottom+door.top)/2},building.placement);
          const target=cadLocalToWorld({...local[1-direction],y:(door.bottom+door.top)/2},building.placement);
          const distance=Math.hypot(target.x-start.x,target.z-start.z);
          const hit=sim.world.castRayAndGetNormal(new RAPIER.Ray(start,{x:(target.x-start.x)/distance,y:0,z:(target.z-start.z)/distance}),
            distance,false,undefined,undefined,actor.collider,actor.body,c=>!sim.walkingColliders.has(c.handle));
          const passed=coverage.passed&&!!hit&&Math.abs(hit.timeOfImpact-approaches.distances[direction])<=.021;
          protections.push({id:door.id,direction,category:fixed.category,coverage,hitDistance:hit?.timeOfImpact??null,passed});
          if(!passed)failures.push(`${door.id}:${direction}:unprotected-fixed-opening`);
        }
        continue;
      }
      const definition=definitions.get(door.id);
      // Conditional geometry setup for this independent case only. This is not
      // an E request and deliberately makes no range/LOS/occupied-sweep claim.
      if(definition){sim.doorPhysics.apply(definition.id,true);assert.equal(sim.doorPhysics.isOpen(definition.id),true);}
      const exteriorThreshold = local.some(p => !building.site.supportSurfaces.some(surface => {
        const height = cadSurfaceHeightAtXZ(surface, p.x, p.z);
        return height !== undefined && Math.abs(height - door.bottom) < .25;
      }));
      const points = local.map(p => {
        const world = cadLocalToWorld({ ...p, y: door.bottom }, building.placement);
        const ray = new RAPIER.Ray({ ...world, y: world.y + 0.6 }, { x: 0, y: -1, z: 0 });
        const hit = sim.world.castRayAndGetNormal(ray, 1.2, true, undefined, undefined, undefined, undefined,
          collider => !sim.walkingColliders.has(collider.handle));
        if (!hit || hit.normal.y <= 0.5) return { ...world, floor: null };
        const surfaceY = ray.origin.y - hit.timeOfImpact;
        // The capsule's rounded end rests above the center-ray height near
        // a stair nose. Measure that support with the actual actor shape.
        const castY = surfaceY + CHARACTER_RADIUS + CHARACTER_HALF_HEIGHT + 0.42;
        const support = sim.world.castShape({ ...world, y: castY }, { x: 0, y: 0, z: 0, w: 1 },
          { x: 0, y: -1, z: 0 }, new RAPIER.Capsule(CHARACTER_HALF_HEIGHT, CHARACTER_RADIUS),
          0.02, 0.8, true, undefined, undefined, undefined, undefined,
          collider => !sim.walkingColliders.has(collider.handle));
        const capsuleFloor = support && support.normal1.y > 0.5
          ? castY - support.time_of_impact - CHARACTER_RADIUS - CHARACTER_HALF_HEIGHT - 0.02 : surfaceY;
        return { ...world, surfaceY, floor: capsuleFloor };
      });
      for (const direction of [0, 1]) {
        const start = points[direction], target = points[1 - direction];
        let passed = false, walkingPassed=false, setupError: number | null = null, traversal: "walk" | "jump" = "walk";
        if (start.floor !== null && target.floor !== null) {
          actor.resetOnFoot({ x: start.x, z: start.z, y: start.floor + 0.9 });
          actor.setPosition = () => assert.fail("Door traversal must not teleport");
          for (let i = 0; i < 80; i++) { actor.step(idle); sim.tick(0); }
          setupError = actor.position.y - start.floor - 0.82;
          if (actor.grounded && Math.abs(setupError) < 0.1) {
            const budget = Math.ceil(Math.hypot(target.x - start.x, target.z - start.z) / 4.6 * 60) + 180;
            for (let i = 0; i < budget; i++) {
              const p = actor.position, dx = target.x - p.x, dz = target.z - p.z;
              const scale = Math.max(Math.hypot(dx, dz), 0.08);
              actor.step({ ...idle, x: dx / scale, z: dz / scale, seq: i + 1 }); sim.tick(0);
              const q = actor.position;
              if (actor.grounded && Math.hypot(q.x - target.x, q.z - target.z) < 0.1 && Math.abs(q.y - target.floor - 0.82) < 0.14) {
                passed = true; break;
              }
            }
            walkingPassed=passed;
            if (!passed && target.floor - start.floor > .22 && target.floor - start.floor < 1 &&
                (door.outsideTraversalStatus === "requires-native-jump-validation" || exteriorThreshold)) {
              // The source-derived terrace is lower than this openable
              // doorway. Exercise the real jump without moving the threshold,
              // increasing autostep, or resetting the actor at the obstacle.
              traversal = "jump";
              for (let i = 0; i < 180; i++) {
                const p = actor.position, dx = target.x - p.x, dz = target.z - p.z;
                const scale = Math.max(Math.hypot(dx, dz), 0.08);
                actor.step({ ...idle, x: dx / scale, z: dz / scale, jump: i < 8, seq: budget + i + 1 }); sim.tick(0);
                const q = actor.position;
                if (actor.grounded && Math.hypot(q.x - target.x, q.z - target.z) < 0.1 && Math.abs(q.y - target.floor - 0.82) < 0.14) {
                  passed = true; break;
                }
              }
            }
          }
        }
        results.push({ id: door.id, direction, passed, walkingPassed, traversal, sourceBottom: door.bottom, points, setupError, finish: { ...actor.position },
          doorPhysicsId:definition?.id??null,stateAssumption:definition?'single-interactive-open':'static-opening',actorInteractionsVerified:false });
        if (!passed) failures.push(`${door.id}:${direction}`);
      }
      if(definition)sim.doorPhysics.apply(definition.id,false);
    }
    const sourceHeightDiscrepancies=sourceHeightDiscrepancyIds.map(id=>{
      const row=results.find(r=>`${r.id}:${r.direction}`===id);
      assert.ok(row,'Every known source-height case must actually execute');
      assert.equal(row.walkingPassed,false,'Changed source height requires investigation and retirement of the old limitation');
      assert.equal(row.traversal,'jump');assert.equal(row.passed,true,'Actual held jump must still cross the current model');
      return {id,walkingPassed:row.walkingPassed,actualTraversal:row.traversal,actualPassed:row.passed,sourceHeightResolved:false,
        reason:'Native source annotation retains an unresolved 0.481m terrace/mezzanine height discrepancy'};
    });
    const proof = process.env.CAD_DOOR_PROOF ?? process.env.CAD_EXTERIOR_PROOF;
    if (proof) writeFileSync(proof.replace(/\.json$/, `-${building.id}.json`), JSON.stringify({
      modelSha256: building.site.sourceCollisionSha256, placement: building.placement,
      status:failures.length||sourceHeightDiscrepancies.length?'partial':'conditional-pass',physicalStatus:failures.length?'partial':'conditional-pass',actorInteractionsVerified:false,initialDoorState:'closed-default',
      sourceHeightDiscrepancies,walkingFailures:results.filter(r=>!r.walkingPassed).map(r=>`${r.id}:${r.direction}`),
      scope:'Conditional single-leaf-open geometry, actual full Simulation; no E interaction or source-height acceptance',
      cases: results.length, protectedCases:protections.length, failures, results, protections }, null, 2));
    assert.equal(results.length, building.model.doors.filter(door => !fixedOpeningSpec(door)).length * 2);
    assert.equal(protections.length,building.model.doors.filter(door=>fixedOpeningSpec(door)).length*2);
    assert.deepEqual(failures,[],'Every movable direction and fixed-panel protection must pass its actual physical check');
    if(sourceHeightDiscrepancies.length)t.diagnostic('PARTIAL source acceptance: six B6 rear directions fail walking and pass only a real jump; the 0.481m source-height discrepancy remains unresolved. All physical checks are conditional on the tested leaf being open.');
  } finally { sim.dispose(); }
});
}

test("native B6 entry label, annotated door and NPC height use actual model support", () => {
  assert.deepEqual(cadDoorPosition("b06", "n01-door-12E1"), {x:CAD_B6_ENTRY.x,y:CAD_B6_ENTRY.y,z:CAD_B6_ENTRY.z});
  assert.ok(Math.abs(CAD_B6_ENTRY.y - 2.1962777093118495) < 1e-8);
  assert.equal(CAD_B6_ENTRY.treads.length, 11);
  for (const p of CAD_B6_ENTRY.treads) assert.ok(Math.abs(cadB6EntranceHeight(p.x, p.z)! - p.y) < 1e-5);
  assert.equal(cadB6EntranceHeight(100, 100), undefined);
});

test("reference photogrammetry mode retains its B6 interior where the source scan is cut out", async () => {
  await initPhysics();
  const sim = new Simulation({positions: new Float32Array([1000,0,1000,1001,0,1000,1000,0,1001]), indices: new Uint32Array([0,2,1])});
  try {
    sim.world.step();
    const hit = sim.world.castRay(new RAPIER.Ray({x:8,y:2.2,z:-55},{x:0,y:-1,z:0}), .7, true);
    assert.ok(hit, "Reference B6 cutout must retain a floor");
    assert.ok(Math.abs(2.2 - hit.timeOfImpact - 1.8) < .001);
  } finally {sim.dispose();}
});
