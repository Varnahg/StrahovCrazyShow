import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { Script } from "node:vm";
import ts from "typescript";
import RAPIER from "@dimforge/rapier3d-compat";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { DEFAULT_ORBIT_PITCH, clampOrbitPitch } from "../client/camera-look";
import { DEFAULT_ORBIT_DISTANCE, orbitCameraTarget, orbitCameraDesired } from "../client/camera-orbit";
import { B6_LAYOUT, B6_REALITY_BOXES, B6_STAIR_MESHES } from "../shared/b6-interior";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
function method(file: string, name: string) {
  const ast = ts.createSourceFile(file, read(file), ts.ScriptTarget.Latest, true);
  const cls = ast.statements.find(ts.isClassDeclaration)!;
  return cls.members.find(n => n.name?.getText(ast) === name)!.getText(ast);
}
function compile(code: string, env: Record<string, unknown>, result: string) {
  const js = ts.transpileModule(code, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  return new Script(`(function(env){const {${Object.keys(env)}}=env;${js};return ${result};})`).runInThisContext()(env);
}
const currentMethod = method("../client/game.ts", "updateCameraFollow");
const baselineMethod = read("./fixtures/camera-follow-before-orbit.ts.txt");

// Counting arithmetic adapter: compares the exact old/new method bodies,
// including state and allocations, without initializing the full Game world.
let allocations = 0;
class Vec {
  constructor(public x = 0, public y = 0, public z = 0) { allocations++; }
  add(v: Vec) { return new Vec(this.x + v.x, this.y + v.y, this.z + v.z); }
  subtract(v: Vec) { return new Vec(this.x - v.x, this.y - v.y, this.z - v.z); }
  scale(n: number) { return new Vec(this.x * n, this.y * n, this.z * n); }
  length() { return Math.hypot(this.x, this.y, this.z); }
  normalize() { const n = this.length(); if (n) { this.x /= n; this.y /= n; this.z /= n; } return this; }
  copyFrom(v: Vec) { this.x = v.x; this.y = v.y; this.z = v.z; return this; }
  static Lerp(a: Vec, b: Vec, n: number) { return new Vec(a.x + (b.x - a.x) * n, a.y + (b.y - a.y) * n, a.z + (b.z - a.z) * n); }
}
const helperAst = ts.createSourceFile("camera-orbit.ts", read("../client/camera-orbit.ts"), ts.ScriptTarget.Latest, true);
const helperCode = helperAst.statements.filter(ts.isFunctionDeclaration).map(n => n.getText(helperAst).replace(/^export /, "")).join("\n");
const countingHelpers = compile(helperCode, { Vector3: Vec }, "{orbitCameraTarget,orbitCameraDesired}");
const ownerClass = (body: string) => compile(`class Owner {get footFirstPerson(){return this.firstPerson && !this.actor.vehicle;} ${body}}`,
  { Vector3: Vec, clampOrbitPitch, ...countingHelpers }, "Owner");
const Before = ownerClass(baselineMethod), After = ownerClass(currentMethod);

test("shared orbit extraction preserves actual prior follow outputs, collision queries, state and allocation counts", () => {
  let cases = 0;
  for (const vehicle of [false, true]) for (const firstPerson of [false, true])
    for (const snap of [false, true]) for (const pitch of [-8, .28, 8, NaN])
      for (const clip of [Infinity, .8]) for (const arm of [.4, 10]) {
        const run = (Ctor: any) => {
          const queries: number[][] = [];
          const camera = { position: new Vec(6, 4, -11), target: [] as number[], setTarget(v: Vec) { this.target = [v.x, v.y, v.z]; } };
          const actor = Object.freeze({ vehicle });
          const owner = Object.assign(new Ctor(), { camera, actor, firstPerson, yaw: .73, pitch, distance: 8, cameraArm: arm, vehicleCameraSnap: snap,
            sim: { cameraDistance(a: Vec, b: Vec, input: unknown) {
              assert.equal(input, actor); queries.push([a.x, a.y, a.z, b.x, b.y, b.z]);
              return Math.min(clip, Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z));
            } } });
          const pos = new Vec(2, 3, -6); allocations = 0;
          for (const dt of [0, 1 / 60, .1]) owner.updateCameraFollow(pos, 1.63, dt);
          return { position: [camera.position.x, camera.position.y, camera.position.z], target: camera.target,
            pitch: owner.pitch, arm: owner.cameraArm, snap: owner.vehicleCameraSnap, queries, allocations };
        };
        assert.deepEqual(run(After), run(Before)); cases++;
      }
  assert.equal(cases, 128);
});

test("shared defaults and real Rapier entry clip reproduce the source-derived bounded B6 camera", async () => {
  assert.equal(DEFAULT_ORBIT_DISTANCE, 8); assert.equal(DEFAULT_ORBIT_PITCH, .28);
  await RAPIER.init();
  const world = new RAPIER.World({ x: 0, y: 0, z: 0 });
  try {
    const Queries = compile(`class Queries {${method("../shared/simulation.ts", "solid")} ${method("../shared/simulation.ts", "cameraDistance")}}`, { RAPIER }, "Queries");
    const sim = Object.assign(new Queries(), { world, walkingColliders: new Set(), car: {} });
    const entry = B6_LAYOUT.entry;
    const boxes = B6_REALITY_BOXES.filter(b => b.role === "exterior-entry" || b.kind === "stair" && b.x === entry.x && b.z >= entry.stepsFromZ && b.z <= entry.landingMaxZ);
    for (const b of boxes) sim.solid(b.x, b.y + B6_LAYOUT.foundationOffset, b.z, b.w, b.h, b.d, b.yaw);
    for (const m of B6_STAIR_MESHES.filter(m => m.exteriorEntry && m.collides && m.indices.length))
      world.createCollider(RAPIER.ColliderDesc.trimesh(Float32Array.from(m.positions), Uint32Array.from(m.indices), RAPIER.TriMeshFlags.FIX_INTERNAL_EDGES).setTranslation(0, B6_LAYOUT.foundationOffset, 0));
    world.step(); // Initialize only this isolated static broadphase.
    const body = new Vector3(entry.x, B6_LAYOUT.foundationOffset + .8, entry.landingMaxZ);
    const route = B6_LAYOUT.approachRoute.at(-1)!;
    const target = orbitCameraTarget(body, false);
    const desired = orbitCameraDesired(target, Math.atan2(route[0] - body.x, route[1] - body.z), DEFAULT_ORBIT_PITCH, DEFAULT_ORBIT_DISTANCE);
    const distance = sim.cameraDistance(target, desired, { vehicle: false });
    const camera = target.add(desired.subtract(target).normalize().scale(distance));
    assert.equal(world.colliders.len(), 57);
    assert.ok(Math.abs(distance - 2.5018939685821535) < 1e-6);
    assert.ok(Vector3.Distance(camera, new Vector3(-4.85, 4.109051355767259, -79.28090091222374)) < 1e-6);
  } finally { world.free(); }
});
