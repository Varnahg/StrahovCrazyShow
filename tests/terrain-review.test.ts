import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { Script } from "node:vm";
import ts from "typescript";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import RAPIER from "@dimforge/rapier3d-compat";
import { Actor, initPhysics, CHARACTER_RADIUS, CHARACTER_HALF_HEIGHT, type Simulation } from "../shared/simulation";
import { FIXED_DT } from "../shared/netcode";
import { textEntryTarget, worldKeyboardAllowed } from "../client/interaction";
import { clampOrbitPitch } from "../client/camera-look";
import { grassFocusDistance } from "../client/photo-grass-budget";
import { treeDetailForProjection } from "../client/tree-renderer";
import { resolveTerrainReview, resolveTreePilot, terrainReviewPose, terrainReviewIdentity, TERRAIN_REVIEW_PRESETS } from "../client/terrain-review";
import { BOUNDS, BUILDINGS, TREES, GROUND_RECTS } from "../shared/world";
import { groundHeight, createTerrainTiles, terrainCollisionData } from "../shared/terrain";
import { pointInPolygon, treeTrunkCollision, treeDetailLevel } from "../shared/vegetation";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { FreeCamera } from "@babylonjs/core/Cameras/freeCamera";
import { Matrix } from "@babylonjs/core/Maths/math.vector";
import { Viewport } from "@babylonjs/core/Maths/math.viewport";
import { STADIUM_PLAN } from "../shared/landmark-reality";
import { readGameSource } from "./helpers/game-source";

const { source, selectMembers } = readGameSource();
const methods = selectMembers(["createStartupActor", "prepareTerrainReviewCamera", "updateCameraFollow", "footFirstPerson",
  "interpolateLocalPosition", "interpolationAlpha", "keyDown", "pointerDown", "moveCamera", "wheel", "lock", "interact", "requestRespawn", "previewTransit"]);
const js = (code: string) => ts.transpileModule(code, { compilerOptions: {
  target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React,
} }).outputText;
const make = new Script(`(function(env) {
  const { window, resolveTerrainReview, terrainReviewPose, terrainReviewIdentity, sessionDiagnostics,
    CHARACTER_RADIUS, CHARACTER_HALF_HEIGHT, Vector3, clampOrbitPitch, FIXED_DT, textEntryTarget, worldKeyboardAllowed } = env;
  ${js(`class TerrainGame { ${methods.map(n => n.getText(source)).join("\n")} }`)}
  return TerrainGame;
})`).runInThisContext();

function fixture(id = "b6-rear-path", height = (x: number, z: number) => 10 + x * .01 + z * .02) {
  const events: unknown[] = [], starts: unknown[] = [];
  const Game = make({ window: { location: { hostname: "localhost", search: `?terrainReview=${id}` } },
    resolveTerrainReview, terrainReviewPose, terrainReviewIdentity, Vector3, clampOrbitPitch, FIXED_DT,
    CHARACTER_RADIUS, CHARACTER_HALF_HEIGHT, textEntryTarget, worldKeyboardAllowed,
    sessionDiagnostics: { event: (...args: unknown[]) => events.push(args) } });
  let target: Vector3 | undefined;
  const game = Object.assign(new Game(), {
    network: false, ready: true, accumulator: 0, localId: "guest", keys: new Set(["KeyW"]),
    localPlayer: { x: 110, y: 0, z: 12 }, previousPosition: new Vector3(110, 0, 12), visualOffset: new Vector3(1, 2, 3),
    avatars: new Map([["guest", { eyeHeight: 1.7 }]]), canvas: { dataset: {} },
    camera: { position: Vector3.Zero(), fov: .85, setTarget: (v: Vector3) => { target = v; } },
    sim: { surfaceHeight: height, add(id: string, position: { x: number; y: number; z: number }) {
      starts.push({ id, position: { ...position } });
      return { position: { ...position }, yaw: 0, vehicle: false, controller: { offset: () => .02 } };
    } },
  });
  return { game, starts, events, target: () => target!, height };
}

test("only exact static loopback guest IDs are accepted, including duplicate/forged URL rejection", () => {
  for (const hostname of ["localhost", "127.0.0.1", "[::1]"]) for (const id of Object.keys(TERRAIN_REVIEW_PRESETS)) {
    assert.equal(resolveTerrainReview({ hostname, search: `?terrainReview=${id}` }, false)?.id, id);
    assert.equal(resolveTerrainReview({ hostname, search: `?terrainReview=${id}` }, true), null);
  }
  for (const search of ["", "?terrainReview=", "?terrainReview=unknown", "?terrainReview=__proto__", "?terrainReview=constructor",
    "?terrainReview=b6-rear-path&terrainReview=b6-rear-path", "?terrainReview=b6-rear-path%20", "?x=36&z=-64"]) {
    assert.equal(resolveTerrainReview({ hostname: "localhost", search }, false), null);
  }
  for (const hostname of ["example.com", "localhost.example", "192.168.1.1", "127.0.0.1.example", "0.0.0.0"]) {
    assert.equal(resolveTerrainReview({ hostname, search: "?terrainReview=b6-rear-path" }, false), null);
  }
});

test("tree pilot selection is a fixed immutable pair only behind a valid local static guest view",()=>{
  for(const hostname of ["localhost","127.0.0.1","[::1]"])for(const view of Object.keys(TERRAIN_REVIEW_PRESETS))for(const pilot of ["own","mtree"]){
    const location={hostname,search:`?terrainReview=${view}&treePilot=${pilot}`},result=resolveTreePilot(location,false)!;
    if(view==="small-tree-close") { assert.equal(result,undefined,"a two-source pilot cannot substitute the catalogue-only target"); continue; }
    assert.equal(result.manifestUrl,pilot==="own"?"/models/vegetation/seasonal-r6-far/runtime-contract.json":"/models/vegetation/seasonal-streamed/runtime-contract.json");
    assert.deepEqual(result.selections,{"ipr-crown-014":pilot+"-broadleaf","ipr-b6-north-conifer":pilot+"-conifer"});
    assert.equal(Object.isFrozen(result),true);assert.equal(Object.isFrozen(result.selections),true);
    assert.equal(resolveTreePilot(location,true),undefined);
    assert.equal(resolveTreePilot({...location,hostname:"example.com"},false),undefined);
  }
  for(const search of ["","?treePilot=own","?terrainReview=b5-tree-near","?terrainReview=b5-tree-near&treePilot=", "?terrainReview=unknown&treePilot=own", "?terrainReview=b5-tree-near&terrainReview=b5-tree-near&treePilot=own", ...["constructor","__proto__","Own","own%20","http://example.com/tree.glb","../own"].map(value=>"?terrainReview=b5-tree-near&treePilot="+value), "?terrainReview=b5-tree-near&treePilot=own&treePilot=mtree", "?terrainReview=b5-tree-near&treePilot=own&treePilot=own"])
    assert.equal(resolveTreePilot({hostname:"localhost",search},false),undefined,search);
  const injected={hostname:"localhost",search:"?terrainReview=b5-tree-near&treePilot=own&manifestUrl=https://example.com/private&sourceTreeId=other&x=999&z=999"};
  assert.deepEqual(resolveTreePilot(injected,false),resolveTreePilot({hostname:"localhost",search:"?terrainReview=b5-tree-near&treePilot=own"},false));
  assert.deepEqual(resolveTerrainReview(injected,false)?.spawnXZ,[-85,-61]);
});

const crownPresets=()=>Object.values(TERRAIN_REVIEW_PRESETS).filter(p=>p.sourceTreeId);
function edgeDistance(x:number,z:number,a:readonly number[],b:readonly number[]){
  const dx=b[0]-a[0],dz=b[1]-a[1],t=Math.max(0,Math.min(1,((x-a[0])*dx+(z-a[1])*dz)/(dx*dx+dz*dz||1)));
  return Math.hypot(x-a[0]-t*dx,z-a[1]-t*dz);
}

function segmentDistance(a:readonly number[],b:readonly number[],c:readonly number[],d:readonly number[]) {
  const rx=b[0]-a[0],rz=b[1]-a[1],sx=d[0]-c[0],sz=d[1]-c[1],cross=rx*sz-rz*sx;
  if(Math.abs(cross)>1e-9){const t=((c[0]-a[0])*sz-(c[1]-a[1])*sx)/cross,u=((c[0]-a[0])*rz-(c[1]-a[1])*rx)/cross;
    if(t>=0&&t<=1&&u>=0&&u<=1)return 0;}
  return Math.min(edgeDistance(a[0],a[1],c,d),edgeDistance(b[0],b[1],c,d),edgeDistance(c[0],c[1],a,b),edgeDistance(d[0],d[1],a,b));
}

test("far crown view excludes the whole stadium, including the previously missed stand footprint",()=>{
  const p=TERRAIN_REVIEW_PRESETS["b5-tree-far"],outer=STADIUM_PLAN.outer;
  assert.equal(pointInPolygon(-180,30,outer),true,"the rejected GPU camera really was inside the canonical stadium");
  assert.equal(pointInPolygon(p.spawnXZ[0],p.spawnXZ[1],outer),false);
  const clearance=Math.min(...outer.map((v,i)=>segmentDistance(p.spawnXZ,p.lookAtXZ,v,outer[(i+1)%outer.length])));
  assert.ok(clearance>5,"the entire sightline needs room for the modeled stadium overhangs, not just a free spawn point");
  for(const building of BUILDINGS)assert.ok(Math.min(...building.points.map((v,i)=>segmentDistance(p.spawnXZ,p.lookAtXZ,v,building.points[(i+1)%building.points.length])))>1,building.id);
});
test("crown starts match shared source roots, avoid real world footprints/trunks and span all three LODs",()=>{
  const expectedLod={"b6-tree-near":0,"b5-tree-near":0,"b5-tree-mid":1,"b5-tree-far":2,"b5-tree-ground":0,"b5-tree-hero":0,"small-tree-close":0,"b6-tree-far-upper":2};
  for(const p of crownPresets()){
    const [x,z]=p.spawnXZ,tree=TREES.find(t=>t.osmId===p.sourceTreeId)!;assert.ok(tree);
    assert.deepEqual(p.lookAtXZ,[tree.x,tree.z]);assert.ok(p.targetHeight!>0&&p.targetHeight!<tree.reconstruction!.height);
    assert.ok(x>BOUNDS.minX+1&&x<BOUNDS.maxX-1&&z>BOUNDS.minZ+1&&z<BOUNDS.maxZ-1);
    for(const b of BUILDINGS){assert.equal(pointInPolygon(x,z,b.points),false,p.id+":"+b.id);
      assert.ok(Math.min(...b.points.map((v,i)=>edgeDistance(x,z,v,b.points[(i+1)%b.points.length])))>CHARACTER_RADIUS+1,p.id+":"+b.id+" edge");}
    for(const source of TREES){const trunk=treeTrunkCollision(source);assert.ok(Math.hypot(x-trunk.x,z-trunk.z)>trunk.radius+CHARACTER_RADIUS+1,p.id+":"+source.osmId);}
    for(const quality of ["low","medium","high"])assert.equal(treeDetailLevel(Math.hypot(tree.x-x,tree.z-z),quality),expectedLod[p.id as keyof typeof expectedLod],p.id+":"+quality);
  }
});

test("new inspection cameras exercise the actual full-coverage LOD policy at the measured viewport",()=>{
  const scale=650/720;
  for(const id of ["b5-tree-hero","small-tree-close"] as const){
    const p=TERRAIN_REVIEW_PRESETS[id],distance=Math.hypot(p.spawnXZ[0]-p.lookAtXZ[0],p.spawnXZ[1]-p.lookAtXZ[1]);
    assert.deepEqual(["low","medium","high"].map(q=>treeDetailForProjection(distance,q,"full-coverage",scale)),[1,0,0],id);
  }
  const old=TERRAIN_REVIEW_PRESETS["b5-tree-near"];
  assert.equal(treeDetailForProjection(Math.hypot(old.spawnXZ[0]-old.lookAtXZ[0],old.spawnXZ[1]-old.lookAtXZ[1]),"medium","full-coverage",scale),1,"historical near view is now MID; it cannot stand in for the hero check");
  const far=TERRAIN_REVIEW_PRESETS["b6-tree-far-upper"],distance=Math.hypot(far.spawnXZ[0]-far.lookAtXZ[0],far.spawnXZ[1]-far.lookAtXZ[1]);
  for(const quality of ["low","medium","high"])assert.equal(treeDetailForProjection(distance,quality,"full-coverage",1080/720),2,quality);
  assert.equal(resolveTreePilot({hostname:"localhost",search:"?terrainReview=small-tree-close&treePilot=own"},false),undefined);
});

test("actual right-handed camera projection centers each elevated crown target at both avatar eye heights",()=>{
  const engine=new NullEngine({renderWidth:1280,renderHeight:720,textureSize:1,deterministicLockstep:false,lockstepMaxSteps:4}),scene=new Scene(engine);scene.useRightHandedSystem=true;
  try {for(const p of crownPresets())for(const eyeHeight of [1.35,1.85]){
    const pose=terrainReviewPose(p,groundHeight,eyeHeight),camera=new FreeCamera(p.id,new Vector3(pose.position.x,groundHeight(...p.spawnXZ)+eyeHeight,pose.position.z),scene);camera.fov=.85;
    camera.setTarget(camera.position.add(new Vector3(Math.sin(pose.yaw),-pose.pitch,Math.cos(pose.yaw))));
    const target=new Vector3(p.lookAtXZ[0],groundHeight(...p.lookAtXZ)+p.targetHeight!,p.lookAtXZ[1]);
    const projected=Vector3.Project(target,Matrix.Identity(),camera.getViewMatrix().multiply(camera.getProjectionMatrix()),new Viewport(0,0,1280,720));
    assert.ok(Math.abs(projected.x-640)<.01&&Math.abs(projected.y-360)<.01,p.id+":"+projected.asArray());assert.ok(projected.z>0&&projected.z<1);
    camera.dispose();
  }}finally{scene.dispose();engine.dispose();}
  for(const targetHeight of [-1,101,NaN,Infinity])assert.throws(()=>terrainReviewPose({...TERRAIN_REVIEW_PRESETS["b5-tree-near"],targetHeight},groundHeight),/pose\/support/);
});

test("each crown Actor settles on the actual local draped terrain without movement input or recovery",async()=>{
  await initPhysics();
  for(const preset of crownPresets()){
    const [x,z]=preset.spawnXZ,world=new RAPIER.World({x:0,y:-18,z:0});world.timestep=FIXED_DT;
    const terrain=terrainCollisionData(createTerrainTiles(GROUND_RECTS,{minX:x-2,maxX:x+2,minZ:z-2,maxZ:z+2}));
    const floor=world.createCollider(RAPIER.ColliderDesc.trimesh(terrain.vertices,terrain.indices,RAPIER.TriMeshFlags.FIX_INTERNAL_EDGES));
    for(const source of TREES){const trunk=treeTrunkCollision(source);world.createCollider(RAPIER.ColliderDesc.cylinder(trunk.height/2,trunk.radius).setTranslation(trunk.x,groundHeight(trunk.x,trunk.z)+trunk.height/2,trunk.z));}
    const f=fixture(preset.id,groundHeight),g=f.game;
    const sim={world,walkingColliders:new Set<number>(),groundColliders:new Set([floor.handle]),surfaceHeight:groundHeight,
      add(id:string,p:{x:number;y:number;z:number}){return new Actor(sim as unknown as Simulation,id,p);}};
    g.sim=sim;
    try {g.createStartupActor();const actor:Actor=g.actor;actor.setPosition=()=>{throw Error("Unexpected crown QA recovery/teleport");};
      for(let i=0;i<120;i++){actor.step({x:0,z:0,yaw:g.yaw,jump:false,seq:i},FIXED_DT);world.step();}
      assert.ok(actor.grounded,preset.id+":"+JSON.stringify({position:actor.position,ground:groundHeight(actor.position.x,actor.position.z),vertical:actor.vertical}));assert.ok(Math.abs(actor.position.x-x)<.005&&Math.abs(actor.position.z-z)<.005,preset.id+":"+JSON.stringify(actor.position));
      assert.ok(Math.abs(actor.position.y-groundHeight(actor.position.x,actor.position.z)-.82)<.015,preset.id+":"+JSON.stringify({position:actor.position,ground:groundHeight(actor.position.x,actor.position.z)}));
    }finally{world.free();}
  }
});

test("source-backed preset coordinates stay immutable and captured identity stays detached", () => {
  assert.deepEqual(Object.values(TERRAIN_REVIEW_PRESETS).slice(0,4).map(p => [p.id, p.spawnXZ, p.lookAtXZ]), [
    ["b6-rear-path", [36, -64], [29.24, -64]], ["b6-front-lawn", [-14, -64], [-13, -59]],
    ["osm-grass-control", [-103, -65], [-100, -60]], ["b6-far-context", [40, -75], [28, -32]],
  ]);
  const p = TERRAIN_REVIEW_PRESETS["b6-rear-path"], record = terrainReviewIdentity(p)!;
  assert.equal(record.scope, "static-guest-start"); assert.match(record.source, /25920436/);
  record.spawnXZ[0] = 999; assert.equal(p.spawnXZ[0], 36);
  assert.equal(Reflect.set(p.spawnXZ, "0", 999), false, "preset coordinates cannot be changed at runtime");
  assert.equal(terrainReviewIdentity(null), null);
  for(const p of Object.values(TERRAIN_REVIEW_PRESETS).slice(0,4))assert.equal(p.targetHeight,undefined,"the four original target elevations stay byte-for-byte compatible");
});

test("pose uses real ground at both ends and first-person slope, rejects nonfinite support", () => {
  const p = TERRAIN_REVIEW_PRESETS["b6-rear-path"], ground = (x: number) => x * .1;
  const pose = terrainReviewPose(p, ground, 1.72);
  assert.equal(pose.position.y, 4.6); assert.equal(pose.yaw, -Math.PI / 2);
  assert.ok(Math.abs(pose.pitch - (3.6 + 1.72 - 2.974) / 6.76) < 1e-12);
  for (const bad of [NaN, Infinity, -Infinity]) assert.throws(() => terrainReviewPose(p, () => bad), /pose\/support/);
  assert.throws(() => terrainReviewPose(p, ground, 0), /pose\/support/);
});

test("actual Game startup, interpolation and follow camera stay at the same preset, including a different avatar height", () => {
  for (const id of Object.keys(TERRAIN_REVIEW_PRESETS)) {
    const f = fixture(id), g = f.game; g.createStartupActor(); g.prepareTerrainReviewCamera();
    const initial = { ...g.actor.position };
    assert.equal(f.starts.length, 1); assert.deepEqual(g.previousPosition.asArray(), [initial.x, initial.y, initial.z]);
    assert.deepEqual(g.visualOffset.asArray(), [0, 0, 0]); assert.equal(g.keys.size, 0);
    assert.deepEqual(g.interpolateLocalPosition(initial).asArray(), [initial.x, initial.y, initial.z]);
    // Present an ordinary settled Actor pose. No world/camera focus override.
    const settled = new Vector3(initial.x, f.height(initial.x, initial.z) + .82, initial.z);
    g.updateCameraFollow(settled, 1.7, FIXED_DT);
    assert.equal(g.camera.fov, .85); assert.equal(g.camera.position.x, initial.x); assert.equal(g.camera.position.z, initial.z);
    assert.ok(Math.abs(g.camera.position.y - f.height(initial.x, initial.z) - 1.72) < 1e-12);
    const direction = f.target().subtract(g.camera.position), p = g.terrainReview;
    const dx = p.lookAtXZ[0] - initial.x, dz = p.lookAtXZ[1] - initial.z, distance = Math.hypot(dx, dz);
    assert.ok(Math.abs(direction.x - dx / distance) < 1e-12); assert.ok(Math.abs(direction.z - dz / distance) < 1e-12);
    assert.ok(Math.abs(g.camera.position.y + direction.y * distance - f.height(p.lookAtXZ[0], p.lookAtXZ[1]) - (p.targetHeight ?? .05)) < 1e-12);
    assert.equal(grassFocusDistance(initial.x, initial.z, g.camera.position.x, g.camera.position.z, initial.x, initial.z), 0);
    if (id === "b6-far-context") assert.ok(grassFocusDistance(p.lookAtXZ[0], p.lookAtXZ[1], initial.x, initial.z, initial.x, initial.z) > 40,
      "distant lookAt never becomes the player's grass focus");
  }
});

test("actual QA handlers cannot move, orbit, enter vehicles, respawn or use transit preview", () => {
  const f = fixture(), g = f.game; g.createStartupActor(); const before = { ...g.actor.position }, yaw = g.yaw, pitch = g.pitch;
  for (const code of ["KeyW", "KeyA", "KeyS", "KeyD", "ArrowUp", "Space", "KeyV", "KeyE", "KeyR"]) {
    g.keyDown({ code, target: null, repeat: false, defaultPrevented: false, preventDefault() {} });
  }
  g.pointerDown({ button: 0 }); g.moveCamera({ movementX: 90, movementY: 50 }); g.wheel({ deltaY: 900 }); g.lock();
  g.interact(); assert.equal(g.requestRespawn(), false); assert.equal(g.previewTransit(), null);
  assert.equal(g.keys.size, 0); assert.equal(g.yaw, yaw); assert.equal(g.pitch, pitch);
  assert.deepEqual(g.actor.position, before); assert.equal(f.starts.length, 1);
  assert.equal(f.events.length, 1, "only explicit startup identity is emitted");
  g.terrainReview = null;
  g.keyDown({ code: "KeyW", target: null, repeat: false, defaultPrevented: false, preventDefault() {} });
  assert.equal(g.keys.has("KeyW"), true, "ordinary game controls remain enabled");
});

test("the actual HUD badge identifies only the active guest Game, not a later multiplayer or empty lifecycle", () => {
  const code = readFileSync(new URL("../client/ui.tsx", import.meta.url), "utf8");
  const ui = ts.createSourceFile("ui.tsx", code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let expression: ts.JsxExpression | undefined;
  function visit(n: ts.Node) {
    if (ts.isJsxExpression(n) && n.expression?.getText(ui).startsWith('mode === "guest" && game.current?.terrainReview')) expression = n;
    ts.forEachChild(n, visit);
  }
  visit(ui); assert.ok(expression?.expression);
  const render = new Script(js(`result = (${expression.expression.getText(ui)});`));
  for (const mode of ["guest", "multi"]) for (const active of [true, false]) {
    const env = { mode, game: { current: active ? { terrainReview: TERRAIN_REVIEW_PRESETS["b6-rear-path"] } : null },
      CLIENT_BUILD_ID: "b".repeat(64), feedbackLocale: "cs", result: undefined as any,
      React: { createElement: (tag: string, props: Record<string, unknown>, ...children: unknown[]) => ({ tag, props, children }) } };
    render.runInNewContext(env);
    if (mode === "guest" && active) {
      assert.equal(env.result.props["data-terrain-review"], "b6-rear-path");
      assert.equal(env.result.props["data-client-build-id"], "b".repeat(64));
      assert.match(env.result.children.join(""), /QA.*pevný pohled/);
    } else assert.ok(!env.result);
  }
});

test("a small real Actor fixture settles at the QA start through idle physics without recovery or hidden movement", async () => {
  await initPhysics();
  const world = new RAPIER.World({ x: 0, y: -18, z: 0 }); world.timestep = FIXED_DT;
  const floor = world.createCollider(RAPIER.ColliderDesc.cuboid(5, .1, 5).setTranslation(36, 39.9, -64));
  const f = fixture("b6-rear-path", () => 40), g = f.game;
  const sim = { world, walkingColliders: new Set<number>(), groundColliders: new Set([floor.handle]), surfaceHeight: () => 40,
    add(id: string, p: { x: number; y: number; z: number }) { return new Actor(sim as unknown as Simulation, id, p); } };
  g.sim = sim;
  try {
    g.createStartupActor(); const actor: Actor = g.actor;
    actor.setPosition = () => { throw Error("Unexpected QA recovery/teleport"); };
    for (let i = 0; i < 90; i++) { actor.step({ x: 0, z: 0, yaw: g.yaw, jump: false, seq: i }, FIXED_DT); world.step(); }
    assert.ok(actor.grounded); assert.ok(Math.abs(actor.position.y - 40.8201) < .001);
    assert.equal(actor.position.x, 36); assert.equal(actor.position.z, -64);
    const capsule = actor.collider.shape; assert.ok(capsule instanceof RAPIER.Capsule);
    assert.equal(capsule.radius, .25); assert.equal(capsule.halfHeight, .55);
  } finally { world.free(); }
});
