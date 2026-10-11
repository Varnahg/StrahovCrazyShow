import test from "node:test";
import assert from "node:assert/strict";
import { createServer, request } from "node:http";
import { mkdtemp, readdir, readFile, rm, access } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { createLocalBenchmarkHandler } from "../server/local-benchmarks";
import { projectLocalBenchmark } from "../shared/local-benchmark";
const origin = "http://127.0.0.1:4179",
  snapshot = "a".repeat(64);
function sample() {
  return {
    sourceSnapshotId: snapshot,
    durationSeconds: 10.03,
    frames: 600,
    averageFps: 59.9,
    p95FrameMs: 19.03,
    p99FrameMs: 24.07,
    renderErrorCount: 0,
    assetLoadErrorCount: 0,
    avatars: 30,
    viewport: { width: 1920, height: 1080 },
    renderResolution: { width: 1476, height: 830 },
    quality: "low",
    gpu: {
      renderer: "Fixture GeForce adapter",
      vendor: "Fixture vendor",
      classification: "dedicated",
      webglVersion: 2,
      warnings: ["not stored"],
    },
    avatarLod: { near: 1, medium: 5, far: 24 },
    frameWork: { cpuMs: 8.555, gpuMs: null },
    frameBreakdownMs: { simulation: 2.51, environment: 0.39, render: 5.2 },
    rendering: {
      mode: "auto",
      quality: "low",
      targetFps: 60,
      effectiveTargetFps: 59.9,
      presentationHz: null,
      hardwareScaling: 1.3,
      renderScale: 1 / 1.3,
      budgets: {
        grassDensity: 0.375,
        shadowMapSize: 512,
        postProcesses: false,
      },
    },
    renderCost: {
      inventory: {
        registeredMeshes: 2726,
        uniqueGeometryTriangles: 844905.6667,
        enabledTreeMeshesByLod: [2, 10, 205],
        enabledMeshCountsByMaterialClass: { PBRMaterial: 918 },
      },
      vegetation: {
        pendingTreeLoads: 0,
        treeDetailCounts: [1, 5, 103],
        loadError: "private/path",
      },
    },
  };
}

test("virtual camera projection preserves only finite bounded geometry metadata", () => {
  const matrix = Array.from({ length: 16 }, (_, i) => (i % 5 === 0 ? 1 : 0));
  const camera = {
    position: { x: 110, y: 1.4, z: 20 },
    fov: 0.8,
    minZ: 0.08,
    maxZ: 1000,
    viewMatrix: matrix,
    projectionMatrix: matrix,
    extra: "private",
  };
  const raw = {
    ...sample(),
    triangleCountScope: "all-render-passes",
    sceneView: {
      position: { x: 110, y: -2.3, z: 12 },
      yaw: Math.PI,
      pitch: 0.28,
      lightingInstant: 1791712800000,
      camera,
    },
  };
  const projected = projectLocalBenchmark(raw);
  assert.equal(projected.triangleCountScope, "all-render-passes");
  assert.deepEqual(projected.sceneView.camera.viewMatrix, matrix);
  assert.equal(projected.sceneView.camera.extra, undefined);
  assert.ok(!JSON.stringify(projected).includes("private"));
  for (const invalid of [
    { ...camera, viewMatrix: matrix.slice(1) },
    { ...camera, projectionMatrix: [NaN, ...matrix.slice(1)] },
    { ...camera, maxZ: 0.01 },
  ])
    assert.throws(() =>
      projectLocalBenchmark({
        ...raw,
        sceneView: { ...raw.sceneView, camera: invalid },
      }),
    );
});
async function fixture(
  t: import("node:test").TestContext,
  config: { env?: NodeJS.ProcessEnv; listenHost?: string } = {},
) {
  const directory = await mkdtemp(join(tmpdir(), "strahov-benchmark-"));
  let time = Date.parse("2026-10-11T10:00:00Z");
  const env = config.env ?? {
    STRAHOV_LOCAL_BENCHMARK_DIR: join(directory, "records"),
    STRAHOV_LOCAL_BENCHMARK_ORIGIN: origin,
    STRAHOV_SOURCE_SNAPSHOT_ID: snapshot,
  };
  const handler = createLocalBenchmarkHandler({
    env,
    listenHost: config.listenHost ?? "127.0.0.1",
    now: () => time,
  });
  const server = createServer((req, res) => {
    void handler(req, res).then((handled) => {
      if (!handled) res.writeHead(404).end();
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const base = `http://127.0.0.1:${address.port}`;
  t.after(async () => {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
    assert.ok(relative(tmpdir(), directory).startsWith("strahov-benchmark-"));
    await rm(directory, { recursive: true, force: true });
  });
  const post = (
    data: unknown = sample(),
    headers: Record<string, string> = {},
  ) =>
    fetch(base + "/api/diagnostics/benchmark", {
      method: "POST",
      headers: {
        Origin: origin,
        "Content-Type": "application/json",
        ...headers,
      },
      body: JSON.stringify(data),
    });
  return {
    base,
    post,
    env,
    directory,
    advance: () => (time += 60001),
    files: async () => readdir(join(directory, "records")).catch(() => []),
  };
}
test("collector is absent by default and fails closed for unsafe/incomplete configuration", async (t) => {
  for (const config of [
    { env: {} },
    {
      env: {
        STRAHOV_LOCAL_BENCHMARK_DIR: "relative",
        STRAHOV_LOCAL_BENCHMARK_ORIGIN: origin,
        STRAHOV_SOURCE_SNAPSHOT_ID: snapshot,
      },
    },
    {
      env: {
        STRAHOV_LOCAL_BENCHMARK_DIR: tmpdir(),
        STRAHOV_LOCAL_BENCHMARK_ORIGIN: origin,
        STRAHOV_SOURCE_SNAPSHOT_ID: "development",
      },
    },
    { listenHost: "0.0.0.0" },
    {
      env: {
        STRAHOV_LOCAL_BENCHMARK_DIR: tmpdir(),
        STRAHOV_LOCAL_BENCHMARK_ORIGIN: "https://foreign.example:4179",
        STRAHOV_SOURCE_SNAPSHOT_ID: snapshot,
      },
    },
  ]) {
    const f = await fixture(t, config);
    const response = await fetch(f.base + "/api/diagnostics/status", {
      headers: { Origin: origin },
    });
    assert.equal(response.status, 404);
    assert.equal(response.headers.get("access-control-allow-origin"), null);
    assert.equal((await f.post()).status, 404);
    assert.deepEqual(await f.files(), []);
  }
});
test("exact origin/preflight and same-origin browser GET Referer are handled before wildcard CORS", async (t) => {
  const f = await fixture(t);
  for (const bad of [
    "null",
    "http://foreign.example:4179",
    "http://127.0.0.1:5173",
  ]) {
    const r = await f.post(sample(), { Origin: bad });
    assert.equal(r.status, 403);
    assert.equal(r.headers.get("access-control-allow-origin"), null);
  }
  assert.equal((await fetch(f.base + "/api/diagnostics/status")).status, 403);
  const status = await fetch(f.base + "/api/diagnostics/status", {
    headers: { Referer: origin + "/" },
  });
  assert.equal(status.status, 200);
  assert.equal((await status.json()).sourceSnapshotId, snapshot);
  const options = await fetch(f.base + "/api/diagnostics/benchmark", {
    method: "OPTIONS",
    headers: { Origin: origin },
  });
  assert.equal(options.status, 204);
  assert.equal(options.headers.get("access-control-allow-origin"), origin);
});
test("atomic local record contains only whitelisted metrics and trusted metadata, never paths/identities", async (t) => {
  const f = await fixture(t);
  const raw = {
    ...sample(),
    date: "client clock",
    mode: "forged",
    receivedAtUTC: "forged",
    extra: { nickname: "private" },
  };
  const response = await f.post(raw);
  assert.equal(response.status, 201);
  assert.equal((await response.json()).saved, true);
  const files = await f.files();
  assert.equal(files.length, 1);
  assert.match(files[0], /^[a-f0-9-]{36}\.json$/);
  assert.ok(!files.some((name) => name.endsWith(".tmp")));
  const stored = JSON.parse(
    await readFile(join(f.directory, "records", files[0]), "utf8"),
  );
  assert.equal(stored.mode, "local-user-triggered-benchmark");
  assert.equal(stored.receivedAtUTC, "2026-10-11T10:00:00.000Z");
  assert.equal(stored.sourceSnapshotId, snapshot);
  assert.equal(stored.benchmark.frameWork.cpuMs, 8.555);
  assert.equal(stored.benchmark.rendering.budgets.grassDensity, 0.375);
  assert.equal(
    stored.benchmark.renderCost.inventory.uniqueGeometryTriangles,
    844905.6667,
  );
  const text = JSON.stringify(stored);
  for (const word of [
    "private",
    "warnings",
    "loadError",
    "extra",
    "client clock",
    "forged",
  ])
    assert.ok(!text.includes(word));
  const projected = projectLocalBenchmark({
    ...sample(),
    modelReview: [{ root: "player-id" }],
    nickname: "private",
    chat: "private",
    filename: "../../bad.json",
  });
  assert.ok(!JSON.stringify(projected).includes("private"));
  assert.equal(projected.modelReview, undefined);
  assert.equal(projected.filename, undefined);
});
test("stale/development/null sources and filename/path/personal payloads cannot write a record", async (t) => {
  const f = await fixture(t);
  for (const sourceSnapshotId of ["b".repeat(64), "development", null]) {
    f.advance();
    assert.equal((await f.post({ ...sample(), sourceSnapshotId })).status, 409);
  }
  for (const key of [
    "filename",
    "path",
    "directory",
    "modelReview",
    "playerId",
    "nickname",
    "chat",
  ]) {
    f.advance();
    assert.equal(
      (await f.post({ ...sample(), [key]: "../../outside.json" })).status,
      400,
    );
  }
  assert.deepEqual(await f.files(), []);
});
test("finite metrics, cohort 1/30, ten-second duration, JSON content type and 3/min limit are enforced", async (t) => {
  const f = await fixture(t);
  for (const changes of [
    { frames: 0 },
    { frames: 1.2 },
    { durationSeconds: 9.99 },
    { renderErrorCount: 1 },
    { renderErrorCount: undefined },
    { assetLoadErrorCount: 1 },
    { assetLoadErrorCount: undefined },
    { averageFps: NaN },
    { p95FrameMs: Infinity },
    { avatars: 29 },
    { avatars: 0 },
    { renderResolution: { width: 0, height: 1 } },
  ]) {
    f.advance();
    assert.equal((await f.post({ ...sample(), ...changes })).status, 400);
  }
  f.advance();
  assert.equal(
    (await f.post(sample(), { "Content-Type": "text/plain" })).status,
    415,
  );
  f.advance();
  for (let i = 0; i < 3; i++)
    assert.equal((await f.post({ ...sample(), avatars: 1 })).status, 201);
  assert.equal((await f.post()).status, 429);
  f.advance();
  assert.equal((await f.post()).status, 201);
});
test("256 KiB limit covers declared and chunked bodies without creating files", async (t) => {
  const f = await fixture(t),
    body = JSON.stringify({ ...sample(), extra: "x".repeat(256 * 1024) });
  assert.equal(
    (
      await fetch(f.base + "/api/diagnostics/benchmark", {
        method: "POST",
        headers: { Origin: origin, "Content-Type": "application/json" },
        body,
      })
    ).status,
    413,
  );
  f.advance();
  const status = await new Promise<number>((resolve, reject) => {
    const r = request(
      f.base + "/api/diagnostics/benchmark",
      {
        method: "POST",
        headers: {
          Origin: origin,
          "Content-Type": "application/json",
          "Transfer-Encoding": "chunked",
        },
      },
      (response) => {
        response.resume();
        response.on("end", () => resolve(response.statusCode!));
      },
    );
    r.on("error", reject);
    for (let i = 0; i < body.length; i += 8192)
      r.write(body.slice(i, i + 8192));
    r.end();
  });
  assert.equal(status, 413);
  assert.deepEqual(await f.files(), []);
});
