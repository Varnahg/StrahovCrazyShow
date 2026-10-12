import test from "node:test";
import assert from "node:assert/strict";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { benchmarkPresentation } from "../client/benchmark-presentation";
import { captureModelReview } from "../client/model-review";

test("visible benchmark keeps raw frame samples and counters without serializing the model inventory", () => {
  const frames = [16.1, 17.2, 59.8];
  const result = {
    sourceSnapshotId: "a".repeat(64),
    frameIntervalsMs: frames,
    averageFps: 32.2,
    viewport: { width: 1280, height: 720 },
    renderCost: { vegetation: { photographicGrass: { draws: 12, triangles: 140000 } } },
    modelReview: Array.from({ length: 15000 }, (_, i) => ({ name: `mesh-${i}`, worldMatrix: Array(16).fill(1) })),
  };
  const complete = JSON.stringify(result);
  const summary = benchmarkPresentation(result);
  const visible = JSON.stringify(summary);
  assert.ok(visible.length < 1500);
  assert.ok(complete.length > 500000);
  assert.equal(summary.frameIntervalsMs, frames);
  assert.equal(summary.renderCost, result.renderCost);
  assert.equal(summary.modelReviewSummary.meshCount, 15000);
  assert.equal(summary.sourceSnapshotId, result.sourceSnapshotId);
  assert.equal(JSON.stringify(result), complete, "full export/local result must remain unchanged");
});

test("capturing model diagnostics does not force transforms or alter cached render bounds", () => {
  const engine = new NullEngine(), scene = new Scene(engine);
  try {
    const mesh = MeshBuilder.CreateBox("observed", {}, scene);
    mesh.position.x = 7;
    mesh.computeWorldMatrix(true);
    const before = mesh.getBoundingInfo().boundingBox.minimumWorld.asArray();
    let updates = 0;
    mesh.onAfterWorldMatrixUpdateObservable.add(() => updates++);
    mesh.position.x = 11;
    const rows = captureModelReview(scene);
    assert.equal(updates, 0, "inventory must not evaluate pending transforms");
    assert.deepEqual(rows[0].worldBounds.min, before);
    assert.deepEqual(mesh.getBoundingInfo().boundingBox.minimumWorld.asArray(), before);
    assert.equal(mesh.position.x, 11, "the intended next pose is not modified either");
  } finally { scene.dispose(); engine.dispose(); }
});
