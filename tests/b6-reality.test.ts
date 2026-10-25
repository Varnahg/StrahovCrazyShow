import test from "node:test";
import type { PointLight } from "@babylonjs/core/Lights/pointLight";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import RAPIER from "@dimforge/rapier3d-compat";
import { Actor, initPhysics, Simulation } from "../shared/simulation";
import {
  B6_LAYOUT,
  B6_REALITY_BOXES,
  B6_ROOM_AREAS,
  b6EntranceHeight,
  B6_STAIR_MESHES,
  B6_STAIR_CORES,
  b6StairRoute,
  B6_ENTRY_PACK,
} from "../shared/b6-interior";
import { B6_PROP_COLLISIONS, B6_ASSET_MANIFEST } from "../shared/b6-props";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { Ray } from "@babylonjs/core/Culling/ray";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { FreeCamera } from "@babylonjs/core/Cameras/freeCamera";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { B6RealityController, createB6StairMeshes, createB6BoxFaceParts } from "../client/b6-reality";
import { b6AuthoredStairPixels } from "../shared/b6-stair-materials";
import {groundHeight} from "../shared/terrain";
import {cadZoneAt} from "../shared/cad-buildings";
import {cadEntranceTour} from "./helpers/cad-entrance-tour";
import {B6_FACADE_PLAN} from "../shared/b6-facade-plan";
import {b6ExteriorEdges,planFacadeOpenings} from "../client/architecture-reality";
await initPhysics();
const idle = { x: 0, z: 0, yaw: 0, jump: false, seq: 0 };

function probe(withProps = true) {
  const world = new RAPIER.World({ x: 0, y: -18, z: 0 });
  world.timestep = 1 / 60;
  const kinds = new Map<number, string>();
  for (const box of [
    ...B6_REALITY_BOXES,
    ...(withProps ? B6_PROP_COLLISIONS : []),
  ]) {
    const collider = world.createCollider(
      RAPIER.ColliderDesc.cuboid(box.w / 2, box.h / 2, box.d / 2)
        .setTranslation(box.x, box.y + B6_LAYOUT.foundationOffset, box.z)
        .setRotation({
          x: 0,
          y: Math.sin((box.yaw ?? 0) / 2),
          z: 0,
          w: Math.cos((box.yaw ?? 0) / 2),
        }),
    );
    kinds.set(collider.handle, "kind" in box ? box.kind : "prop");
  }
  for (const mesh of B6_STAIR_MESHES) world.createCollider(
    RAPIER.ColliderDesc.trimesh(Float32Array.from(mesh.positions),Uint32Array.from(mesh.indices),RAPIER.TriMeshFlags.FIX_INTERNAL_EDGES)
      .setTranslation(0,B6_LAYOUT.foundationOffset,0),
  );
  world.createCollider(
    RAPIER.ColliderDesc.cuboid(20, 0.15, 60).setTranslation(-27, -0.15, -55),
  );
  world.createCollider(
    RAPIER.ColliderDesc.cuboid(3.5, 0.15, 11.1).setTranslation(-3.5, -0.15, -88.9),
  );
  const simulation = {
    world,
    walkingColliders: new Set<number>(),
    groundColliders: new Set<number>(),
  } as unknown as Simulation;
  const actor = new Actor(simulation, "route", { ...B6_LAYOUT.outsideSpawn, y: 0.9 });
  actor.setPosition = () => assert.fail("continuous B6 route cannot teleport");
  world.step();
  return { world, actor, kinds, simulation };
}

test("B6 calibrated bay family records illustrative counts, uncertainty and shared window pitch", () => {
  assert.ok(Math.abs(B6_LAYOUT.roomPitch - 3.1818181818) < 1e-8);
  assert.equal(B6_LAYOUT.dimensionsMeasured, false);
  for (let level = 0; level <= 5; level++) {
    assert.equal(
      B6_ROOM_AREAS.filter(
        (area) => area.level === level && area.kind === "bedroom",
      ).length,
      35,
    );
    assert.equal(
      B6_ROOM_AREAS.filter(
        (area) => area.level === level && area.kind === "bathroom",
      ).length,
      2,
    );
  }
  assert.ok(
    B6_ROOM_AREAS.every(
      (area) => area.measured === false && area.numberIsIllustrative,
    ),
  );
  const eastWindows = B6_REALITY_BOXES.filter(
    (box) => box.level === 0 && box.kind === "glass" && box.x === 16,
  );
  assert.equal(eastWindows.length, 22);
  eastWindows.forEach((window, index) =>
    assert.ok(
      Math.abs(window.z - (-90 + (index + 0.5) * B6_LAYOUT.roomPitch)) < 1e-8,
    ),
  );
});

test("twelve inferred north entrance risers use the same analytic NPC height and landing", () => {
  const steps = B6_REALITY_BOXES.filter(
    (box) => box.kind === "stair" && box.x === B6_LAYOUT.entry.x && box.z < B6_LAYOUT.entry.stepsToZ,
  );
  assert.equal(steps.length, 12);
  for (const step of steps)
    assert.ok(
      Math.abs(
        b6EntranceHeight(step.x, step.z)! -
          (step.y + step.h / 2 + B6_LAYOUT.foundationOffset),
      ) < 1e-8,
    );
  assert.equal(b6EntranceHeight(B6_LAYOUT.entry.x, -77.5), B6_LAYOUT.foundationOffset);
  assert.equal(b6EntranceHeight(B6_LAYOUT.entry.x, -82.1), undefined);
  assert.equal(b6EntranceHeight(-7, -79), undefined);
  assert.equal(b6EntranceHeight(B6_LAYOUT.entry.x, -77.5, 4), 4);
});

test("photographic B6 pack remains continuously walkable from outside steps to first floor with all prop collisions", () => {
  const { world, actor } = probe(true);
  try {
    for (let tick = 0; tick < 30; tick++) {
      actor.step(idle);
      world.step();
    }
    for (const [x, z] of [...B6_LAYOUT.approachRoute, ...B6_LAYOUT.serviceRoute]) {
      let reached = false;
      for (let tick = 0; tick < 900; tick++) {
        const dx = x - actor.position.x,
          dz = z - actor.position.z,
          distance = Math.hypot(dx, dz);
        if (distance < 0.13) {
          reached = true;
          break;
        }
        actor.step({ ...idle, x: dx / distance, z: dz / distance });
        world.step();
        assert.ok(
          actor.position.y > 0.65,
          "no fall through approach, lobby or stairs",
        );
      }
      assert.ok(
        reached,
        `blocked before ${x},${z}: ${JSON.stringify(actor.position)}`,
      );
    }
    assert.ok(
      actor.position.y > B6_LAYOUT.foundationOffset + 3.65,
      "must reach first floor through entrance and stairs",
    );
  } finally {
    world.free();
  }
});

test("B6 north door is physically open and the former west entry is solid", () => {
  const { world, kinds } = probe(false);
  try {
    const y = B6_LAYOUT.foundationOffset + 1.2;
    const north = world.castRay(
      new RAPIER.Ray({ x: B6_LAYOUT.entry.x, y, z: B6_LAYOUT.entry.z - 0.5 }, { x: 0, y: 0, z: 1 }),
      1,
      true,
    );
    assert.equal(north, null, "north aperture must not contain wall/glass/plinth collisions");
    const west = world.castRay(
      new RAPIER.Ray({ x: -9, y, z: -73 }, { x: 1, y: 0, z: 0 }),
      3,
      true,
    );
    assert.ok(west, "old west entry must close");
    assert.equal(kinds.get(west.collider.handle), "glass","the former west door is closed by the now source-supported stair glazing, never an open passage");
  } finally {
    world.free();
  }
});

test("window openings are physically glazed and the interior renderer does not paint opaque walls over them", () => {
  const { world, kinds } = probe(false);
  const window = B6_REALITY_BOXES.find(
    (box) =>
      box.level === 0 && box.kind === "glass" && box.x === 0 && box.d > 2,
  )!;
  const height = window.y + B6_LAYOUT.foundationOffset;
  const hit = world.castRay(
    new RAPIER.Ray({ x: 2, y: height, z: window.z }, { x: -1, y: 0, z: 0 }),
    3,
    true,
  );
  assert.ok(hit);
  assert.equal(kinds.get(hit.collider.handle), "glass");
  world.free();
  const engine = new NullEngine(),
    scene = new Scene(engine),
    controller = new B6RealityController(scene);
  const plateMesh = scene.meshes.find((mesh) =>
    mesh.name.includes("room plaques 0"),
  )!;
  assert.ok(plateMesh);
  const plateUVs = plateMesh.getVerticesData("uv")!;
  const vCoordinates = Array.from(plateUVs).filter(
    (_, index) => index % 2 === 1,
  );
  assert.ok(
    Math.min(...vCoordinates) >= 0.375,
    "room plates must crop cells rather than squeezing the whole atlas onto every door",
  );
  const ray = new Ray(
    new Vector3(2, height, window.z),
    new Vector3(-1, 0, 0),
    3,
  );
  assert.ok(
    scene.meshes
      .filter((mesh) => mesh.metadata?.b6Reality)
      .every((mesh) => !mesh.intersects(ray).hit),
    "opaque render geometry must leave the window opening clear",
  );
  controller.dispose();
  scene.dispose();
  engine.dispose();
});

test("east rooms beside both plan-derived stair cores retain the continuous flat main corridor on all six floors", () => {
  const { world, simulation } = probe(true);
  try {
    const rooms = B6_ROOM_AREAS.filter(
      (area) => area.side === "east" && [3,4,5,16,17,18,19].includes(area.index),
    );
    assert.equal(rooms.length, 42);
    for (const room of rooms) {
      const actor = new Actor(simulation, "gallery:" + room.id, {
        x: 9.2,
        y: B6_LAYOUT.foundationOffset + room.level * 3 + 1,
        z: room.door.z,
      });
      actor.setPosition = () =>
        assert.fail("gallery door access cannot teleport");
      for (let tick = 0; tick < 90; tick++) {
        actor.step({ ...idle, x: 1 });
        world.step();
      }
      assert.ok(
        actor.position.x > 11.05,
        `${room.id} door blocked: ${JSON.stringify(actor.position)}`,
      );
      assert.ok(
        actor.position.y > B6_LAYOUT.foundationOffset + room.level * 3 + 0.7,
        `${room.id} approach fell into the stair opening`,
      );
    }
  } finally {
    world.free();
  }
});

test("both schematic dogleg cores continuously climb two floors and descend without jumping or teleporting", () => {
  for (const core of B6_STAIR_CORES) {
    const {world,simulation} = probe(true);
    try {
      const route = b6StairRoute(core.id);
      const actor = new Actor(simulation, "two-floors:"+core.id,{x:route[0][0],y:B6_LAYOUT.foundationOffset+0.9,z:route[0][1]});
      actor.setPosition=()=>assert.fail("dogleg route cannot teleport");
      for(let tick=0;tick<30;tick++){actor.step(idle);world.step();}
      const walk = (path:[number,number][]) => {
        for(const [x,z] of path) {
          let reached=false;
          for(let tick=0;tick<600;tick++) {
            const dx=x-actor.position.x,dz=z-actor.position.z,distance=Math.hypot(dx,dz);
            if(distance<0.13){reached=true;break;}
            actor.step({...idle,x:dx/distance,z:dz/distance});world.step();
            assert.ok(actor.position.y>B6_LAYOUT.foundationOffset+0.65,"no fall through stair landings");
          }
          assert.ok(reached,`${core.id} blocked before ${x},${z}: ${JSON.stringify(actor.position)}`);
        }
      };
      for(let floor=1;floor<=2;floor++) {
        walk(route);
        assert.ok(Math.abs(actor.position.y-(B6_LAYOUT.foundationOffset+floor*3+0.82))<0.05,`${core.id} floor ${floor} was not reached`);
      }
      for(let floor=1;floor>=0;floor--) {
        walk([...route].reverse());
        for(let tick=0;tick<12;tick++){actor.step(idle);world.step();}
        assert.ok(Math.abs(actor.position.y-(B6_LAYOUT.foundationOffset+floor*3+0.82))<0.05,`${core.id} descent to ${floor} was not reached`);
      }
    } finally { world.free(); }
  }
});

test("stair render buffers preserve every physical source vertex and expose upward treads with continuous soffits", () => {
  const engine=new NullEngine(),scene=new Scene(engine);
  scene.useRightHandedSystem=true;
  const rendered=createB6StairMeshes(scene);
  try {
    assert.equal(rendered.length,19,"three material batches per level plus one independent exterior handrail batch");
    for(const mesh of rendered) {
      const sources=B6_STAIR_MESHES.filter(source=>mesh.metadata.sourceIds.includes(source.id));
      const positions=mesh.getVerticesData("position")!,normals=mesh.getVerticesData("normal")!,indices=mesh.getIndices()!;
      assert.equal(positions.length,sources.reduce((sum,source)=>sum+source.positions.length,0));
      let offset=0,indexOffset=0;
      for(const source of sources) {
        source.positions.forEach((value,index)=>assert.ok(Math.abs(positions[offset+index]-(value+(index%3===1?B6_LAYOUT.foundationOffset:0)))<1e-5));
        for(let i=0;i<source.indices.length;i+=3) {
          assert.deepEqual(Array.from(indices.slice(indexOffset+i,indexOffset+i+3)),[source.indices[i]+offset/3,source.indices[i+2]+offset/3,source.indices[i+1]+offset/3]);
        }
        offset+=source.positions.length; indexOffset+=source.indices.length;
      }
      if(mesh.name.endsWith("terrazzo-tread"))
        for(let i=1;i<normals.length;i+=3) assert.ok(normals[i]>0.999,"tread normals must face up");
      if(mesh.name.endsWith("painted-concrete")) assert.ok(Array.from(normals).some((value,index)=>index%3===1&&value<-.8),"sloped soffit must face down");
    }
    for(const source of B6_STAIR_MESHES) for(let i=0;i<source.indices.length;i+=3) {
      const [a,b,c]=source.indices.slice(i,i+3).map(index=>source.positions.slice(index*3,index*3+3));
      const ab=b.map((value,j)=>value-a[j]),ac=c.map((value,j)=>value-a[j]);
      assert.ok(Math.hypot(ab[1]*ac[2]-ab[2]*ac[1],ab[2]*ac[0]-ab[0]*ac[2],ab[0]*ac[1]-ab[1]*ac[0])>1e-9,"no degenerate stair triangles");
    }
    assert.notDeepEqual(b6AuthoredStairPixels("striped-corridor",32),b6AuthoredStairPixels("terrazzo-tread",32));
  } finally {
    const materials=new Set(rendered.map(mesh=>mesh.material));
    rendered.forEach(mesh=>mesh.dispose()); materials.forEach(material=>material?.dispose(false,true));
    scene.dispose();engine.dispose();
  }
});

test("floor finishes use only upward faces and original floor triangles become smooth painted ceilings without duplicate shells",()=>{
  const floors=B6_REALITY_BOXES.filter(box=>box.kind==="floor");
  for(const box of floors){
    const parts=createB6BoxFaceParts(box);
    assert.equal(parts.reduce((sum,part)=>sum+part.data.indices.length/3,0),12,"each original floor triangle appears exactly once");
    assert.equal(parts.reduce((sum,part)=>sum+part.data.positions.length/3,0),24,"no second ceiling geometry");
    assert.equal(parts.find(part=>part.surface==="top")!.data.indices.length,6);
    assert.equal(parts.find(part=>part.surface==="underside")!.data.indices.length,6);
    assert.equal(parts.find(part=>part.surface==="sides")!.data.indices.length,24);
    for(const part of parts)for(let i=0;i<part.data.positions.length;i+=3){
      const [x,y,z]=part.data.positions.slice(i,i+3),ny=part.data.normals[i+1];
      assert.ok(Math.abs(Math.abs(x-box.x)-box.w/2)<1e-8);
      assert.ok(Math.abs(Math.abs(y-B6_LAYOUT.foundationOffset-box.y)-box.h/2)<1e-8,"ceiling vertices stay on the same physical box faces");
      assert.ok(Math.abs(Math.abs(z-box.z)-box.d/2)<1e-8);
      assert.equal(ny,part.surface==="top"?1:part.surface==="underside"?-1:0);
    }
  }
  const engine=new NullEngine(),scene=new Scene(engine),controller=new B6RealityController(scene);
  try{
    const finishMeshes=scene.meshes.filter(mesh=>{
      const material=mesh.material as {albedoTexture?:{url?:string}};
      return /\/(striped-corridor|stair-terrazzo|tile|vinyl)-authored\.png$/.test(material?.albedoTexture?.url??"");
    });
    assert.ok(finishMeshes.length>20,"actual controller's floor and tread buffers are inspected");
    for(const mesh of finishMeshes){
      const normals=mesh.getVerticesData("normal")!;
      for(let i=1;i<normals.length;i+=3)assert.ok(normals[i]>.999,`${mesh.name} must not tile a ceiling or slab edge`);
    }
    const ceilings=scene.meshes.filter(mesh=>mesh.material?.name==="b6 stair:painted-concrete");
    assert.ok(ceilings.some(mesh=>Array.from(mesh.getVerticesData("normal")!).some((value,index)=>index%3===1&&value<-.999)),"controller has real downward smooth ceiling faces");
    for(const mesh of ceilings)assert.equal((mesh.material as PBRMaterial).albedoTexture,null);
  }finally{controller.dispose();scene.dispose();engine.dispose();}
});

test("original Blender sanitary/reception assets exist with conservative shared collision envelopes", () => {
  for (const id of [
    "door-open",
    "reception-counter",
    "sink",
    "toilet",
    "shower",
    "stair-rail",
  ]) {
    const asset = B6_ASSET_MANIFEST.assets.find((asset) => asset.id === id)!;
    assert.ok(asset);
    assert.ok(existsSync("public" + asset.url));
    assert.ok(existsSync(asset.sourceBlend));
    assert.ok(asset.triangleCount < 1500);
    const bytes = readFileSync("public" + asset.url);
    assert.equal(bytes.toString("ascii", 0, 4), "glTF");
    assert.equal(asset.currentB6Confirmed, false);
  }
  assert.ok(B6_PROP_COLLISIONS.length > 100);
  assert.ok(
    B6_PROP_COLLISIONS.every(
      (box) =>
        [box.x, box.y, box.z, box.w, box.h, box.d].every(Number.isFinite) &&
        box.w > 0 &&
        box.h > 0 &&
        box.d > 0,
    ),
  );
});

test("opaque B6 construction detaches beyond facade LOD, restores conservatively near the building, and disposes materials/textures", () => {
  const engine = new NullEngine(),
    scene = new Scene(engine),
    controller = new B6RealityController(scene);
  controller.update({ player: { x: 300, y: 1.7, z: -55 }, quality: "low" });
  assert.equal(controller.stats.activeMeshes, 0);
  assert.equal(scene.meshes.length, 0);
  controller.update({ player: { x: 8, y: 1.7, z: -55 }, quality: "low" });
  assert.ok(
    controller.stats.activeMeshes > 0 && controller.stats.activeMeshes <= controller.stats.structuralMeshes,
  );
  controller.dispose();
  assert.equal(scene.meshes.length, 0);
  assert.equal(scene.materials.length, 0);
  scene.dispose();
  engine.dispose();
});

test("walking around B6 only resynchronizes scene lighting when crossing its interior boundary", (t) => {
  const engine = new NullEngine(),
    scene = new Scene(engine),
    controller = new B6RealityController(scene),
    unrelatedMesh = new Mesh("outside lighting probe", scene);
  const light = scene.lights.find(
    (candidate) => candidate.name === "b6 nearest corridor fixture fill",
  )! as PointLight;
  // This observes Babylon's real per-mesh resync, retaining its implementation.
  // An unchanged Light.setEnabled call would still visit this unrelated mesh.
  const resync = t.mock.method(unrelatedMesh, "_resyncLightSource");
  const enable = t.mock.method(light, "setEnabled");
  const outsideX = B6_LAYOUT.bounds.maxX + 4;
  const walk = (x: number) => {
    for (let step = 0; step < 10; step++)
      controller.update({
        player: {
          x,
          y: B6_LAYOUT.foundationOffset + 0.82,
          z: -55 + step * 0.4,
        },
        quality: "low",
      });
  };
  try {
    walk(outsideX);
    assert.equal(controller.interiorLightEnabled, false);
    assert.equal(unrelatedMesh.lightSources.includes(light), false);
    assert.equal(
      resync.mock.callCount(),
      0,
      "outdoor movement does not scan scene lighting",
    );

    controller.update({
      player: { x: 8, y: B6_LAYOUT.foundationOffset + 0.82, z: -55 },
      quality: "low",
    });
    assert.equal(controller.interiorLightEnabled, true);
    assert.equal(unrelatedMesh.lightSources.includes(light), true);
    assert.equal(light.intensity, 0.65);
    assert.equal(enable.mock.callCount(), 1);
    // A real transition can invoke multiple native scans (own + parent state).
    const entryScans = resync.mock.callCount();
    assert.ok(entryScans > 0, "entry synchronizes real scene light membership");
    walk(8);
    assert.equal(resync.mock.callCount(), entryScans);
    assert.equal(enable.mock.callCount(), 1);

    controller.update({
      player: { x: 8, y: B6_LAYOUT.foundationOffset + 3.82, z: -50 },
      quality: "high",
      floor: 1,
    });
    assert.equal(light.intensity, 0.9);
    assert.equal(light.position.y, B6_LAYOUT.foundationOffset + 3 + 2.35);
    assert.equal(
      resync.mock.callCount(),
      entryScans,
      "floor, intensity and position update without a membership scan",
    );

    controller.update({
      player: { x: outsideX, y: B6_LAYOUT.foundationOffset + 0.82, z: -55 },
      quality: "low",
    });
    const exitScans = resync.mock.callCount();
    assert.ok(exitScans > entryScans, "exit removes real scene light membership");
    walk(outsideX);
    assert.equal(controller.interiorLightEnabled, false);
    assert.equal(unrelatedMesh.lightSources.includes(light), false);
    assert.equal(resync.mock.callCount(), exitScans);
    assert.equal(enable.mock.callCount(), 2);
  } finally {
    controller.dispose();
    scene.dispose();
    engine.dispose();
  }
});

test("exterior B6 entry stays visible from the north approach at every quality before and after actual GLB loading and root attachment",async()=>{
  const engine=new NullEngine(),scene=new Scene(engine);
  scene.useRightHandedSystem=true;
  const camera=new FreeCamera("approach test",new Vector3(-4.85,1.7,-110),scene);
  camera.setTarget(new Vector3(-4.85,2,-77));
  const controller=new B6RealityController(scene,{assetSource:url=>new Uint8Array(readFileSync("public"+url))});
  const entryMeshes=scene.meshes.filter(mesh=>mesh.metadata?.visibilityGroup==="exterior-entry");
  const stepMeshes=entryMeshes.filter(mesh=>mesh.material?.name==="b6:concrete stair treads");
  assert.equal(stepMeshes.length,1,"13 source-defined exterior step boxes share one independently visible batch");
  assert.equal(stepMeshes[0].getTotalIndices()/3,13*12);
  const route=[-110,-90,-85,-82,-77.6,-82,-85,-90,-110];
  const check=()=>{
    for(const quality of ["low","medium","high"])
      for(const z of route){
        controller.update({player:{x:B6_LAYOUT.entry.x,y:(b6EntranceHeight(B6_LAYOUT.entry.x,z)??0)+.82,z},quality});
        for(const mesh of entryMeshes){
          assert.ok(scene.meshes.includes(mesh)&&mesh.isEnabled()&&mesh.isVisible,`${quality} entry popped at z=${z}`);
          assert.equal(mesh.visibility,1);
          assert.equal(mesh.material!.alpha,mesh.material!.metadata?.intentionalEntryGlass ? 0.28 : 1);
          assert.equal(mesh.metadata.interiorFloorCull,false);
        }
      }
  };
  let renderTimer:ReturnType<typeof setInterval>|undefined;
  try{
    check();
    const root=new TransformNode("B6 independently editable test root",scene);
    root.position.set(8,B6_LAYOUT.foundationOffset,-55);
    root.metadata={key:"building:osm:way:53929071",sourceId:"53929071"};
    controller.attachToBuilding(root);
    const before=entryMeshes[0].getBoundingInfo().boundingBox.minimumWorld.clone();
    check();
    const fixed={player:{x:8,y:B6_LAYOUT.foundationOffset+.82,z:-55},quality:"low"};
    controller.update(fixed);
    renderTimer=setInterval(()=>scene.render(),16);
    await controller.loadProps();
    assert.deepEqual(controller.stats.errors,[],"actual authored GLBs must decode");
    assert.equal(controller.stats.loadedAssets,B6_ASSET_MANIFEST.assets.length);
    controller.update(fixed);
    assert.ok(scene.meshes.some(mesh=>mesh.metadata?.visibilityGroup==="interior-detail"&&mesh.metadata?.sourceId&&mesh.isEnabled()),"post-load props must activate after warmup even at the unchanged position");
    check();
    assert.ok(Vector3.Distance(before,entryMeshes[0].getBoundingInfo().boundingBox.minimumWorld)<1e-5,"attachment must preserve entry world geometry");
    assert.ok(scene.meshes.filter(mesh=>mesh.metadata?.visibilityGroup==="opaque-envelope").every(mesh=>mesh.isEnabled()),"outside floor−1 cannot hide upper opaque floors/roof");
  }finally{if(renderTimer)clearInterval(renderTimer);controller.dispose();scene.dispose();engine.dispose();}
});

test("native CAD B6 portal preserves continuous arrival, E opening, return and closed-leaf blocking",()=>{
  const simulation=new Simulation(),actor=simulation.add("covered-entry",{x:B6_LAYOUT.entry.x,y:groundHeight(B6_LAYOUT.entry.x,-110)+.9,z:-110});
  actor.setPosition=()=>assert.fail("covered entry walk must not teleport");
  const tour=cadEntranceTour(simulation,actor);
  const approach:[number,number][]=[[-4.85,-100],[-4.85,-90],[-4.85,-85],...tour.stairs];
  try{
    for(let n=0;n<30;n++)tour.step();
    tour.walk(approach);
    tour.blockedByClosedLeaf();
    tour.request(true);
    tour.walk([tour.inside]);
    assert.equal(cadZoneAt(actor.position),"b06:n01");
    tour.walk([tour.outside]);
    tour.request(false);
    tour.blockedByClosedLeaf();
    tour.walk([...approach].reverse());
    tour.walk([[-4.85,-110]]);
    assert.ok(Math.abs(actor.position.y-(groundHeight(actor.position.x,actor.position.z)+.82))<.06,"returned to actual outdoor terrain");
    assert.equal(B6_ENTRY_PACK.measured,false);
    assert.ok(B6_ENTRY_PACK.boxes.find(box=>box.material==="entry-metal"&&box.h===.18)!.y-.09>2.4,"canopy clear height remains above standing head on upper landing");
  }finally{tour.dispose();simulation.dispose();}
});

test("opaque upper B6 rooms and roof survive an outside ground-level observer without filling legitimate glass openings",()=>{
  const engine=new NullEngine(),scene=new Scene(engine),controller=new B6RealityController(scene);
  try{
    controller.update({player:{x:B6_LAYOUT.entry.x,y:.82,z:-90},quality:"low"});
    const opaque=scene.meshes.filter(mesh=>mesh.metadata?.visibilityGroup==="opaque-envelope");
    assert.ok(opaque.length>30&&opaque.every(mesh=>mesh.isEnabled()));
    for(const mesh of opaque){assert.equal(mesh.material!.alpha,1);assert.equal(mesh.material!.backFaceCulling,true);assert.equal(mesh.visibility,1);assert.equal(mesh.material!.needAlphaBlending(),false);}
    const window=B6_REALITY_BOXES.find(box=>box.kind==="glass"&&box.level===3&&box.x===0&&box.d>2)!;
    const ray=new Ray(new Vector3(-2,window.y+B6_LAYOUT.foundationOffset,window.z+.85),new Vector3(1,0,0),18);
    assert.ok(opaque.every(mesh=>!mesh.intersects(new Ray(ray.origin,ray.direction,2.5)).hit),"existing upper window stays physically open for the facade glass");
    assert.ok(opaque.some(mesh=>mesh.intersects(ray).hit),"upper room walls must block a view through the whole house after passing the real window");
    const roofRay=new Ray(new Vector3(8,30,-55),new Vector3(0,-1,0),12);
    assert.ok(opaque.some(mesh=>mesh.intersects(roofRay).hit),"the B6 roof must not depend on the observer's interior floor");
  }finally{controller.dispose();scene.dispose();engine.dispose();}
});

test("bedrooms beside both service cores have actual opaque and physical closing side partitions",()=>{
  const {world}=probe(true),engine=new NullEngine(),scene=new Scene(engine),controller=new B6RealityController(scene);
  try{
    for(const core of B6_STAIR_CORES)for(let level=0;level<=5;level++){
      const boundary=-20-Math.min(...core.sourceBayIndices)*B6_LAYOUT.roomPitch;
      const origin={x:3,y:B6_LAYOUT.foundationOffset+level*3+1.2,z:boundary-.8};
      const hit=world.castRay(new RAPIER.Ray(origin,{x:0,y:0,z:1}),1.2,true);
      assert.ok(hit,`${core.id} level${level} must not expose the bed room through a missing service-side wall`);
      controller.update({player:{...origin,y:origin.y-.38},quality:"low",floor:level});
      const ray=new Ray(new Vector3(origin.x,origin.y,origin.z),new Vector3(0,0,1),1.2);
      assert.ok(scene.meshes.some(mesh=>mesh.metadata?.visibilityGroup==="opaque-envelope"&&mesh.isEnabled()&&mesh.intersects(ray).hit),`${core.id} actual render must close the same room boundary`);
    }
  }finally{world.free();controller.dispose();scene.dispose();engine.dispose();}
});

test("B6 source-supported north small windows and west stair glazing share exact facade/collider openings while room pitch stays explicit",()=>{
  const edges=b6ExteriorEdges();
  for(let level=0;level<=5;level++){
    const north=B6_REALITY_BOXES.filter(box=>box.kind==="glass"&&box.level===level&&box.x===0&&box.z<B6_LAYOUT.lobby.minZ);
    assert.equal(north.length,4);
    assert.ok(north.every(box=>Math.abs(box.d-B6_FACADE_PLAN.northSmall.width)<1e-8&&box.h===B6_FACADE_PLAN.northSmall.height));
    const band=B6_REALITY_BOXES.find(box=>box.kind==="glass"&&box.level===level&&box.x===B6_LAYOUT.lobby.minX)!;
    assert.equal(band.d,B6_FACADE_PLAN.receptionWestBand.width);
    const edge=edges.find(edge=>edge.nx<-.8&&edge.a[0]<-6.5)!;
    const opening=planFacadeOpenings(edge,18,"standard",6).find(opening=>Math.abs(opening.v-(level*3+B6_FACADE_PLAN.receptionWestBand.sill))<1e-8)!;
    assert.equal(opening.w,band.d);assert.equal(opening.h,band.h);
    assert.ok(Math.abs(edge.a[1]+edge.tz*(opening.u+opening.w/2)-band.z)<1e-8);
  }
  const roofs=B6_REALITY_BOXES.filter(box=>box.role==="roof-detail");
  assert.equal(roofs.length,2);
  for(const roof of roofs)assert.ok(Math.abs(roof.y-roof.h/2-18.125)<1e-8,"source-derived rooftop detail must sit on the current roof, never float at an old datum");
  assert.equal(B6_LAYOUT.roomPitch,70/22);
  assert.equal(B6_LAYOUT.foundationOffset,1.8);
  assert.equal(B6_FACADE_PLAN.measured,false);
});

test("canonical structural mesh factory omits only duplicate outer facade faces and preserves inner walls and entry frontage",()=>{
  const wall=B6_REALITY_BOXES.find(box=>box.kind==="wall"&&box.role==="shell"&&box.x===0&&box.w===.35)!;
  const parts=createB6BoxFaceParts(wall),data=parts[0].data;
  assert.equal(data.indices.length/3,10,"exactly two coincident outer-face triangles are removed");
  assert.ok(data.normals.filter((_,i)=>i%3===0).every(nx=>nx>=0),"west exterior face is owned by architecture");
  assert.ok(data.normals.filter((_,i)=>i%3===0).some(nx=>nx===1),"inner side of wall thickness remains rendered");
  const entry=B6_REALITY_BOXES.find(box=>box.role==="shell"&&box.level===0&&box.z===B6_LAYOUT.lobby.minZ&&box.d===.3)!;
  assert.equal(createB6BoxFaceParts(entry).reduce((sum,part)=>sum+part.data.indices.length/3,0),12,"lower north reception frontage remains interior-owned");
});
