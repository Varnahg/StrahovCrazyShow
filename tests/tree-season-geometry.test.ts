import test from "node:test";
import assert from "node:assert/strict";
import { setImmediate as turn } from "node:timers/promises";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData";
import { FreeCamera } from "@babylonjs/core/Cameras/freeCamera";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";
import { ShadowGenerator } from "@babylonjs/core/Lights/Shadows/shadowGenerator";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { createTreeSeasonGeometryPlan, treeSeasonIndexCount, applyTreeSeasonGeometry } from "../client/tree-season-geometry";

function source(ranks = [65534, 1, 32768]) {
  const positions: number[] = [], colors: number[] = [], indices: number[] = [];
  ranks.forEach((rank, component) => {
    positions.push(component - 1, 0, 0, component, 0, 0, component, 1, 0, component - 1, 1, 0);
    for (let i = 0; i < 4; i++) colors.push(1, 1, 1, Math.fround(rank / 65535));
    const start = component * 4; indices.push(start, start + 1, start + 2, start, start + 2, start + 3);
  });
  return { positions: Float32Array.from(positions), colors: Float32Array.from(colors), indices: Uint16Array.from(indices) };
}

test("stable prefix preserves full leaf components, source arrays and exact rank boundaries", () => {
  const data = source(), copy = structuredClone(data), plan = createTreeSeasonGeometryPlan(data.indices, data.colors);
  assert.deepEqual(data, copy); assert.notEqual(plan.indices, data.indices);
  assert.deepEqual([...plan.ranks], [1, 32768, 65534]); assert.deepEqual([...plan.indexEnds], [6, 12, 18]);
  assert.deepEqual([...plan.indices], [...data.indices.slice(6, 12), ...data.indices.slice(12), ...data.indices.slice(0, 6)]);
  assert.equal(treeSeasonIndexCount(plan, 0), 0); assert.equal(treeSeasonIndexCount(plan, 1), 18);
  for (const [rank, count] of [[1, 6], [32768, 12], [65534, 18]]) {
    assert.equal(treeSeasonIndexCount(plan, (rank - .1) / 65535), count - 6);
    assert.equal(treeSeasonIndexCount(plan, (rank + .1) / 65535), count);
  }
  for (let step = 0; step <= 1000; step++) assert.equal(treeSeasonIndexCount(plan, step / 1000) % 6, 0);
  const equal = source([30000, 1, 30000]), tied = createTreeSeasonGeometryPlan(equal.indices, equal.colors);
  assert.deepEqual([...tied.indices.slice(6)], [...equal.indices.slice(0, 6), ...equal.indices.slice(12)], "ties retain original winding/order");
  assert.equal(treeSeasonIndexCount(createTreeSeasonGeometryPlan([], []), 1), 0);
});

test("invalid ranks/RGB/triangles are rejected and uint32 source width is retained", () => {
  const data = source();
  for (const alpha of [0, 1, NaN, Infinity, -.1, .5]) {
    const colors = data.colors.slice(); colors[3] = alpha;
    assert.throws(() => createTreeSeasonGeometryPlan(data.indices, colors), RangeError);
  }
  const rgb = data.colors.slice(); rgb[0] = .9;
  assert.throws(() => createTreeSeasonGeometryPlan(data.indices, rgb), RangeError);
  for (const indices of [[-1, 1, 2], [0, 1, 99], [.5, 1, 2], [NaN, 1, 2], [0, 1], [0, 1, 4]])
    assert.throws(() => createTreeSeasonGeometryPlan(indices, data.colors), RangeError);
  assert.throws(() => createTreeSeasonGeometryPlan(data.indices, data.colors.slice(1)), RangeError);
  const plan = createTreeSeasonGeometryPlan(Uint32Array.from(data.indices), data.colors);
  assert.ok(plan.indices instanceof Uint32Array);
  for (const amount of [NaN, Infinity, -.1, 1.1]) assert.throws(() => treeSeasonIndexCount(plan, amount), RangeError);
});

test("shared Geometry clones draw independent prefixes after winter→compute→move→summer with full bounds", async () => {
  const engine = new NullEngine(), scene = new Scene(engine); scene.useRightHandedSystem = true;
  const camera = new FreeCamera("fixed tree view", new Vector3(110, 1, 8), scene); camera.setTarget(new Vector3(110, 1, 12));
  const data = source(), plan = createTreeSeasonGeometryPlan(data.indices, data.colors);
  const prototype = new Mesh("immutable prototype", scene), vertex = new VertexData();
  vertex.positions = data.positions; vertex.colors = data.colors; vertex.indices = plan.indices; vertex.applyToMesh(prototype);
  const material = new StandardMaterial("leaf IO fixture", scene); material.disableLighting = true; material.backFaceCulling = false; prototype.material = material;
  const winter = prototype.clone("winter owner")!, summer = prototype.clone("summer owner")!;
  prototype.setEnabled(false); winter.position.set(110, 0, 12); summer.position.set(110, 0, 12);
  const uploaded = prototype.geometry!.getIndexBuffer();
  const light = new DirectionalLight("fixed tree sun", new Vector3(0, -1, 1), scene); light.position.set(110, 5, 6);
  const shadow = new ShadowGenerator(64, light); shadow.addShadowCaster(winter); shadow.addShadowCaster(summer);
  const shadowPass = shadow.getShadowMap()!.renderPassId;
  let drawn: { pass: number; count: number }[] = []; const draw = engine.drawElementsType.bind(engine);
  engine.drawElementsType = (...args: Parameters<NullEngine["drawElementsType"]>) => { drawn.push({ pass: engine.currentRenderPassId, count: args[2] }); return draw(...args); };
  try {
    assert.equal(applyTreeSeasonGeometry(winter, plan, 0), 0); winter.setEnabled(false);
    assert.equal(applyTreeSeasonGeometry(summer, plan, 1), 18);
    const localBounds = winter.subMeshes[0].getBoundingInfo()!;
    for (let i = 0; i < 4; i++) { winter.computeWorldMatrix(true); scene.render(); await turn(); }
    winter.refreshBoundingInfo(); // Deliberately exercise Babylon's zero-range refresh.
    winter.position.x += .3;
    assert.equal(applyTreeSeasonGeometry(winter, plan, .5), 6); winter.setEnabled(true);
    assert.equal(winter.subMeshes[0].getBoundingInfo(), localBounds);
    assert.equal(localBounds.boundingBox.minimum.x, -1); assert.equal(localBounds.boundingBox.maximum.x, 2);
    assert.ok(localBounds.boundingBox.minimumWorld.x > 109);
    drawn = []; for (let i = 0; i < 6; i++) { scene.render(); await turn(); }
    for (const shadowDraw of [false, true]) {
      const counts = drawn.filter(draw => (draw.pass === shadowPass) === shadowDraw).map(draw => draw.count);
      assert.ok(counts.includes(6) && counts.includes(18), JSON.stringify({ shadowDraw, shadowPass, drawn }));
    }
    assert.equal(winter.geometry, summer.geometry); assert.equal(winter.geometry, prototype.geometry);
    assert.equal(prototype.geometry!.getIndexBuffer(), uploaded, "no seasonal upload/replacement");
    assert.equal(winter.hasVertexAlpha, false); assert.equal(summer.hasVertexAlpha, false); assert.equal(material.alpha, 1);
    assert.deepEqual([...prototype.getIndices()!], [...plan.indices]);
    for (let i = 0; i < 100; i++) assert.equal(applyTreeSeasonGeometry(winter, plan, .5), 6);
    assert.equal(winter.subMeshes[0].getBoundingInfo(), localBounds);
    winter.dispose(); assert.throws(() => applyTreeSeasonGeometry(winter, plan, 1), RangeError);
    assert.equal(summer.isDisposed(), false);
  } finally { scene.dispose(); engine.dispose(); }
});
