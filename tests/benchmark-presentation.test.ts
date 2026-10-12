import test from "node:test";
import assert from "node:assert/strict";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import {
  benchmarkPresentation,
  createBenchmarkDownloads,
  type BenchmarkDownloadHost,
} from "../client/benchmark-presentation";
import { captureModelReview } from "../client/model-review";

test("visible benchmark keeps raw frame samples and counters without serializing the model inventory", () => {
  const frames = [16.1, 17.2, 59.8];
  const result = {
    sourceSnapshotId: "a".repeat(64),
    frameIntervalsMs: frames,
    averageFps: 32.2,
    viewport: { width: 1280, height: 720 },
    renderCost: {
      vegetation: { photographicGrass: { draws: 12, triangles: 140000 } },
    },
    modelReview: Array.from({ length: 15000 }, (_, i) => ({
      name: `mesh-${i}`,
      worldMatrix: Array(16).fill(1),
    })),
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
  assert.equal(
    JSON.stringify(result),
    complete,
    "full export/local result must remain unchanged",
  );
});

test("capturing model diagnostics does not force transforms or alter cached render bounds", () => {
  const engine = new NullEngine(),
    scene = new Scene(engine);
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
    assert.deepEqual(
      mesh.getBoundingInfo().boundingBox.minimumWorld.asArray(),
      before,
    );
    assert.equal(
      mesh.position.x,
      11,
      "the intended next pose is not modified either",
    );
  } finally {
    scene.dispose();
    engine.dispose();
  }
});

function downloadsFixture(
  failure?: "create" | "click" | "remove" | "schedule",
) {
  const blobs = new Map<string, Blob>();
  const timers = new Map<number, { callback: () => void; delay: number }>();
  const revoked: string[] = [];
  const cancelled: number[] = [];
  const links: {
    url: string;
    filename: string;
    clicks: number;
    removed: boolean;
  }[] = [];
  let nextUrl = 0,
    nextTimer = 0;
  const host: BenchmarkDownloadHost = {
    createUrl(blob) {
      const url = `blob:test-${++nextUrl}`;
      blobs.set(url, blob);
      return url;
    },
    revokeUrl: (url) => {
      revoked.push(url);
    },
    createLink(url, filename) {
      if (failure === "create") throw new Error("create failed");
      const link = { url, filename, clicks: 0, removed: false };
      links.push(link);
      return {
        click() {
          link.clicks++;
          if (failure === "click") throw new Error("click failed");
        },
        remove() {
          link.removed = true;
          if (failure === "remove") throw new Error("remove failed");
        },
      };
    },
    schedule(callback, delay) {
      if (failure === "schedule") throw new Error("schedule failed");
      const timer = ++nextTimer;
      timers.set(timer, { callback, delay });
      return timer;
    },
    cancel(timer) {
      cancelled.push(timer);
      timers.delete(timer);
    },
  };
  return {
    manager: createBenchmarkDownloads(host),
    blobs,
    timers,
    revoked,
    cancelled,
    links,
  };
}

test("full download includes the unmodified inventory and all frame samples, then releases its URL after delay", async () => {
  const fixture = downloadsFixture();
  const result = {
    date: "2026-10-12T00:30:00.000Z",
    frameIntervalsMs: [16, 55, 17],
    modelReview: [{ name: "inventory-mesh", worldBounds: { min: [1, 2, 3] } }],
  };
  fixture.manager.download(result);
  assert.equal(fixture.links.length, 1);
  assert.equal(fixture.links[0].clicks, 1);
  assert.equal(fixture.links[0].removed, true);
  assert.equal(
    fixture.links[0].filename,
    "strahov-benchmark-2026-10-12T00-30-00.000Z.json",
  );
  const blob = fixture.blobs.get(fixture.links[0].url)!;
  assert.equal(blob.type, "application/json");
  assert.deepEqual(JSON.parse(await blob.text()), result);
  assert.deepEqual(
    fixture.revoked,
    [],
    "do not revoke before the browser consumes the click",
  );
  const timer = [...fixture.timers.values()][0];
  assert.equal(timer.delay, 1000);
  timer.callback();
  assert.deepEqual(fixture.revoked, [fixture.links[0].url]);
  fixture.manager.dispose();
  assert.deepEqual(
    fixture.cancelled,
    [],
    "completed timer is no longer retained",
  );
  assert.equal(fixture.revoked.length, 1);
});

for (const failure of ["create", "click", "remove", "schedule"] as const) {
  test(`download ${failure} failure immediately releases the Blob URL and attempts anchor cleanup`, () => {
    const fixture = downloadsFixture(failure);
    assert.throws(
      () => fixture.manager.download({ date: "2026-10-12" }),
      new RegExp(`${failure} failed`),
    );
    assert.deepEqual(fixture.revoked, ["blob:test-1"]);
    assert.equal(fixture.timers.size, 0);
    for (const link of fixture.links) assert.equal(link.removed, true);
    fixture.manager.dispose();
    assert.equal(fixture.revoked.length, 1);
  });
}

test("unmount cleanup cancels and revokes every pending download and can safely run twice", () => {
  const fixture = downloadsFixture();
  fixture.manager.download({ date: "first" });
  fixture.manager.download({ date: "second" });
  assert.equal(fixture.timers.size, 2);
  fixture.manager.dispose();
  assert.equal(fixture.timers.size, 0);
  assert.deepEqual(fixture.cancelled, [1, 2]);
  assert.deepEqual(fixture.revoked, ["blob:test-1", "blob:test-2"]);
  fixture.manager.dispose();
  assert.equal(fixture.revoked.length, 2);
  // React development effect replay can clean up and set up the same instance.
  fixture.manager.download({ date: "after-effect-replay" });
  assert.equal(fixture.timers.size, 1);
  fixture.manager.dispose();
  assert.deepEqual(fixture.revoked, [
    "blob:test-1",
    "blob:test-2",
    "blob:test-3",
  ]);
});

test("serialization failure creates no download resources", () => {
  const fixture = downloadsFixture();
  const circular: { date: string; self?: unknown } = { date: "2026-10-12" };
  circular.self = circular;
  assert.throws(() => fixture.manager.download(circular));
  assert.equal(fixture.blobs.size, 0);
  assert.equal(fixture.links.length, 0);
  assert.equal(fixture.timers.size, 0);
});
