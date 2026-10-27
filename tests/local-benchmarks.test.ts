import test from "node:test";
import assert from "node:assert/strict";
import { createServer, request } from "node:http";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { createLocalBenchmarkHandler } from "../server/local-benchmarks";
import { projectLocalBenchmark } from "../shared/local-benchmark";
import { terrainReviewIdentity, TERRAIN_REVIEW_PRESETS } from "../client/terrain-review";
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

test("projection retains exact bounded terrain review evidence across both UI and server passes, never source prose", () => {
  for (const preset of Object.values(TERRAIN_REVIEW_PRESETS)) {
    const identity = terrainReviewIdentity(preset)!;
    const raw = { ...sample(), avatars: 1, terrainReview: { ...identity, source: "private source filename", nickname: "private", nested: { path: "private" } } };
    const browser = projectLocalBenchmark(raw), server = projectLocalBenchmark(browser);
    const expected = { version: 1, id: preset.id, scope: "static-guest-start", spawnXZ: [...preset.spawnXZ], lookAtXZ: [...preset.lookAtXZ],
      ...(preset.targetHeight===undefined?{}:{targetHeight:preset.targetHeight}),...(preset.sourceTreeId===undefined?{}:{sourceTreeId:preset.sourceTreeId}) };
    assert.deepEqual(browser.terrainReview, expected);
    assert.deepEqual(server, browser, "second privacy projection must be idempotent");
    assert.deepEqual(Object.keys(server.terrainReview), Object.keys(expected));
    assert.ok(!JSON.stringify(server.terrainReview).includes("private"));
    raw.terrainReview.spawnXZ[0] = 999;
    assert.deepEqual(server.terrainReview, expected, "neither projection retains incoming coordinate arrays");
    browser.terrainReview.lookAtXZ[0] = 999;
    assert.deepEqual(server.terrainReview, expected, "server record is detached from the UI projection too");
  }
  assert.equal(Object.hasOwn(projectLocalBenchmark(sample()), "terrainReview"), false);
  assert.equal(projectLocalBenchmark({ ...sample(), terrainReview: null }).terrainReview, null);
});

test("projection preserves bounded actual tree metrics, pilot and one season sample without private metadata",()=>{
  const metrics={legacyTreeInstances:108,rankEnabledTreeInstances:2,treeDetailCacheEntries:12,treeDetailCacheBytes:52000000,treeDetailReservedBytes:2000000,treePilotGeometryBytes:95000000,treePilotSourceBytes:86372932,treePilotSeasonBytes:12000000,treeTextureSourceBytes:13744668,treeFetchedBytes:189000000,treeFetchRequests:25};
  for(const source of ["regional-model","demo"])for(const treePilot of ["own","mtree"]){
    const raw={...sample(),avatars:1,terrainReview:terrainReviewIdentity(TERRAIN_REVIEW_PRESETS["b5-tree-near"]),treePilot,treeSeason:{sampledAt:Date.UTC(2028,1,29,12),source,phaseDay:59.84,revision:123,groups:{private:"drop"},name:"private"},renderCost:{vegetation:{...metrics,sourceTreeIds:["private"],textureUrl:"private",loadError:"private"}}};
    const result=projectLocalBenchmark(raw);assert.deepEqual(result.renderCost.vegetation,metrics);assert.equal(result.treePilot,treePilot);
    assert.deepEqual(result.treeSeason,{sampledAt:Date.UTC(2028,1,29,12),source,phaseDay:59.84});assert.equal(JSON.stringify(result).includes("private"),false);
    assert.deepEqual(projectLocalBenchmark(result),result);
  }
  for(const key of Object.keys(metrics))for(const bad of [-1,NaN,Infinity,1e12+1])assert.throws(()=>projectLocalBenchmark({...sample(),renderCost:{vegetation:{[key]:bad}}}));
  for(const treePilot of [null,"baseline","own-broadleaf","constructor","http://example.com/private",{},1])assert.throws(()=>projectLocalBenchmark({...sample(),treePilot}));
  for(const treeSeason of [null,{}, {sampledAt:"2026-10-25T10:00:00Z",source:"demo",phaseDay:100},
    {sampledAt:NaN,source:"demo",phaseDay:100},{sampledAt:8.64e15+1,source:"demo",phaseDay:100},{sampledAt:.5,source:"demo",phaseDay:100},
    {sampledAt:0,source:"station",phaseDay:100},{sampledAt:0,source:"demo",phaseDay:-1},{sampledAt:0,source:"demo",phaseDay:365},{sampledAt:0,source:"demo",phaseDay:NaN}])assert.throws(()=>projectLocalBenchmark({...sample(),treeSeason}));
  const base=projectLocalBenchmark(sample());assert.equal(Object.hasOwn(base,"treeSeason"),false);assert.equal(Object.hasOwn(base,"treePilot"),false);
  assert.throws(()=>projectLocalBenchmark({...sample(),avatars:1,treePilot:"own"}),/static review/);
  assert.throws(()=>projectLocalBenchmark({...sample(),avatars:1,terrainReview:null,treePilot:"mtree"}),/static review/);
});

test("projection bounds elevated crown identity and rejects arbitrary tree identifiers",()=>{
  const identity=terrainReviewIdentity(TERRAIN_REVIEW_PRESETS["b5-tree-near"])!;
  for(const targetHeight of [-.01,100.01,NaN,Infinity,"7",null])assert.throws(()=>projectLocalBenchmark({...sample(),avatars:1,terrainReview:{...identity,targetHeight}}));
  for(const sourceTreeId of ["private","constructor","ipr-crown-999",null,42])assert.throws(()=>projectLocalBenchmark({...sample(),avatars:1,terrainReview:{...identity,sourceTreeId}}));
  for(const targetHeight of [0,100])assert.equal(projectLocalBenchmark({...sample(),avatars:1,terrainReview:{...identity,targetHeight}}).terrainReview.targetHeight,targetHeight);
});

test("projection rejects malformed or falsely multiplayer terrain review claims", () => {
  const identity = terrainReviewIdentity(TERRAIN_REVIEW_PRESETS["b6-rear-path"])!;
  for (const invalid of [false, [], {}, { ...identity, id: "unknown" }, { ...identity, id: "constructor" },
    { ...identity, id: "__proto__" }, { ...identity, version: "1" }, { ...identity, version: 2 },
    { ...identity, scope: "multiplayer" }, { ...identity, spawnXZ: [0] }, { ...identity, lookAtXZ: [0, 1, 2] },
    { ...identity, spawnXZ: new Array(2) }, { ...identity, spawnXZ: [NaN, 1] },
    { ...identity, spawnXZ: [0, Infinity] }, { ...identity, lookAtXZ: [-1000001, 0] },
    { ...identity, lookAtXZ: [0, 1000001] }, { ...identity, spawnXZ: ["36", -64] }]) {
    assert.throws(() => projectLocalBenchmark({ ...sample(), avatars: 1, terrainReview: invalid }));
  }
  assert.throws(() => projectLocalBenchmark({ ...sample(), avatars: 4, terrainReview: identity }), /terrain review population/);
  assert.doesNotThrow(() => projectLocalBenchmark({ ...sample(), avatars: 1,
    terrainReview: { ...identity, spawnXZ: [-1e6, 1e6], lookAtXZ: [1e6, -1e6] } }));
});

test("projection accepts the actual positive integer avatar population including browser plus three SDK sessions", () => {
  for (const avatars of [1, 2, 3, 4, 29, 30, 31, 100, 101, 1000, 10000]) {
    const value = projectLocalBenchmark({ ...sample(), avatars, avatarLod: { near: avatars, medium: 0, far: 0 }, terrainReview: null });
    assert.equal(value.avatars, avatars);
    assert.equal(projectLocalBenchmark(value).avatars, avatars);
  }
  for (const avatars of [0, -1, .5, 1.5, 29.5, 10001, NaN, Infinity, -Infinity, "4", null, true, undefined]) {
    assert.throws(() => projectLocalBenchmark({ ...sample(), avatars }));
  }
});

test("projection keeps bounded actual litter cost and readiness without source metadata", () => {
  const litter = { activePatches: 3, activeItems: 128, triangles: 512, cachedPatches: 8,
    cacheBytes: 32000, generatedPatches: 10, pendingPatches: 0, ready: true, preparing: false, supportsTwigs: true };
  const raw = { ...sample(), renderCost: { vegetation: { treeLitter: { ...litter, privatePath: "private", sourceIds: ["private"] } } } };
  const browser = projectLocalBenchmark(raw), server = projectLocalBenchmark(browser);
  assert.deepEqual(server.renderCost.vegetation.treeLitter, litter);
  assert.deepEqual(server, browser);
  assert.ok(!JSON.stringify(server).includes("private"));
  assert.throws(() => projectLocalBenchmark({ ...raw, renderCost: { vegetation: { treeLitter: { ...litter, triangles: NaN } } } }));
  assert.throws(() => projectLocalBenchmark({ ...raw, renderCost: { vegetation: { treeLitter: { ...litter, ready: "yes" } } } }));
});

test("local CPU and AA diagnostics whitelist numeric stages and real context attributes", () => {
  const context = {
    requestedAntialias: true,
    actualAntialias: true,
    defaultFramebuffer: true,
    sampleBuffers: 1,
    samples: 4,
    private: "drop",
  };
  const raw = {
    ...sample(),
    gpu: { ...sample().gpu, context },
    engineCpuBreakdownMs: {
      activeMeshes: 2.5,
      mainDraw: 3.2,
      renderTargets: 1.1,
      private: "drop",
    },
  };
  const projected = projectLocalBenchmark(raw);
  assert.deepEqual(projected.engineCpuBreakdownMs, {
    activeMeshes: 2.5,
    mainDraw: 3.2,
    renderTargets: 1.1,
  });
  assert.equal(projected.gpu.context.samples, 4);
  assert.equal(projected.gpu.context.private, undefined);
  assert.ok(!JSON.stringify(projected).includes("drop"));
  assert.throws(() =>
    projectLocalBenchmark({
      ...raw,
      engineCpuBreakdownMs: { activeMeshes: NaN },
    }),
  );
  assert.throws(() =>
    projectLocalBenchmark({
      ...raw,
      gpu: { ...raw.gpu, context: { ...context, samples: -1 } },
    }),
  );
  assert.throws(() =>
    projectLocalBenchmark({
      ...raw,
      gpu: { ...raw.gpu, context: { ...context, samples: 1.5 } },
    }),
  );
  assert.throws(() =>
    projectLocalBenchmark({
      ...raw,
      gpu: { ...raw.gpu, context: { ...context, defaultFramebuffer: false } },
    }),
  );
});

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

function sceneViewSample() {
  const matrix = Array.from({ length: 16 }, (_, i) => (i % 5 === 0 ? 1 : 0));
  return {
    position: { x: 1, y: 2, z: 3 },
    yaw: 0,
    pitch: 0,
    lightingInstant: 0,
    camera: {
      position: { x: 4, y: 5, z: 6 },
      fov: 0.8,
      minZ: 0.1,
      maxZ: 1000,
      viewMatrix: matrix,
      projectionMatrix: matrix,
    },
  };
}

test("projection preserves diagnostic key order, nullable fields and optional-block truthiness", () => {
  const projected = projectLocalBenchmark({
    ...sample(),
    gpu: {
      ...sample().gpu,
      version: "Fixture version",
      context: {
        requestedAntialias: true,
        actualAntialias: null,
        defaultFramebuffer: false,
        sampleBuffers: null,
        samples: null,
      },
      requestedPowerPreference: "unknown",
    },
    triangles: 100,
    drawCalls: 10,
    grassClumps: 0,
    triangleCountScope: "all-render-passes",
    ambient: { cars: 3, passengers: 2, buses: 1, private: "drop" },
    sceneView: sceneViewSample(),
    engineCpuBreakdownMs: { renderTargets: 3, mainDraw: 2, activeMeshes: 1 },
    renderCost: {
      ...sample().renderCost,
      shadows: { glassVisits: 2, shadowCasters: 1, private: "drop" },
      surfaces: { materialUpdates: 3, meshVisits: 1, conversionPasses: 2 },
    },
  });
  for (const [value, keys] of [
    [
      projected,
      [
        "sourceSnapshotId",
        "durationSeconds",
        "frames",
        "averageFps",
        "p95FrameMs",
        "p99FrameMs",
        "renderErrorCount",
        "assetLoadErrorCount",
        "avatars",
        "viewport",
        "renderResolution",
        "quality",
        "gpu",
        "avatarLod",
        "triangles",
        "drawCalls",
        "grassClumps",
        "triangleCountScope",
        "ambient",
        "sceneView",
        "frameWork",
        "engineCpuBreakdownMs",
        "frameBreakdownMs",
        "rendering",
        "renderCost",
      ],
    ],
    [
      projected.gpu,
      [
        "renderer",
        "vendor",
        "classification",
        "version",
        "context",
        "webglVersion",
        "requestedPowerPreference",
      ],
    ],
    [
      projected.gpu.context,
      [
        "requestedAntialias",
        "actualAntialias",
        "defaultFramebuffer",
        "sampleBuffers",
        "samples",
      ],
    ],
    [projected.ambient, ["buses", "passengers", "cars"]],
    [
      projected.sceneView,
      ["position", "yaw", "pitch", "lightingInstant", "camera"],
    ],
    [
      projected.sceneView.camera,
      ["position", "fov", "minZ", "maxZ", "viewMatrix", "projectionMatrix"],
    ],
    [projected.renderCost, ["inventory", "shadows", "surfaces", "vegetation"]],
    [
      projected.renderCost.inventory,
      [
        "registeredMeshes",
        "uniqueGeometryTriangles",
        "enabledMeshCountsByMaterialClass",
        "enabledTreeMeshesByLod",
      ],
    ],
    [projected.renderCost.shadows, ["shadowCasters", "glassVisits"]],
    [
      projected.renderCost.surfaces,
      ["meshVisits", "conversionPasses", "materialUpdates"],
    ],
  ] as const)
    assert.deepEqual(Object.keys(value), keys);
  assert.deepEqual(projected.frameWork, { cpuMs: 8.555, gpuMs: null });
  assert.equal(projected.gpu.context.actualAntialias, null);
  assert.equal(projected.gpu.context.samples, null);
  assert.ok(!JSON.stringify(projected).includes("drop"));

  for (const absent of [undefined, null, false, 0, ""]) {
    const skipped = projectLocalBenchmark({
      ...sample(),
      avatarLod: absent,
      ambient: absent,
      sceneView: absent,
      renderCost: absent,
    });
    for (const key of ["avatarLod", "ambient", "sceneView", "renderCost"])
      assert.equal(Object.hasOwn(skipped, key), false);
  }
  const explicit = projectLocalBenchmark({
    ...sample(),
    gpu: {
      ...sample().gpu,
      version: "",
      context: undefined,
      webglVersion: null,
    },
  });
  assert.equal(explicit.gpu.version, "");
  assert.equal(explicit.gpu.webglVersion, null);
  assert.equal(Object.hasOwn(explicit.gpu, "context"), false);
  assert.throws(
    () =>
      projectLocalBenchmark({
        ...sample(),
        gpu: { ...sample().gpu, context: null },
      }),
    { message: "object" },
  );
});

test("projection reports the original first validation error when several blocks are invalid", () => {
  const base = sample(),
    view = sceneViewSample(),
    context = {
      requestedAntialias: true,
      actualAntialias: false,
      defaultFramebuffer: true,
      sampleBuffers: 1,
      samples: 4,
    };
  const cases: [Record<string, unknown>, string][] = [
    [{ sourceSnapshotId: "bad", frames: 1.5 }, "source"],
    [{ frames: 1.5, durationSeconds: 0 }, "frames"],
    [{ durationSeconds: 0, gpu: null }, "number"],
    [{ viewport: { width: 1.5, height: NaN } }, "number"],
    [{ viewport: { width: 1.5, height: 1 }, gpu: null }, "dimensions"],
    [{ gpu: { ...base.gpu, renderer: 1, classification: "bad" } }, "text"],
    [{ gpu: { ...base.gpu, version: 1, context: [] } }, "text"],
    [
      {
        gpu: {
          ...base.gpu,
          context: { ...context, samples: 1.5 },
          webglVersion: 3,
        },
      },
      "sample count",
    ],
    [
      {
        gpu: {
          ...base.gpu,
          context: { ...context, defaultFramebuffer: false },
          webglVersion: 3,
        },
      },
      "offscreen sample count",
    ],
    [{ avatarLod: true, triangles: -1 }, "object"],
    [{ sceneView: { ...view, position: {} }, frameWork: true }, "number"],
    [
      {
        sceneView: {
          ...view,
          camera: { ...view.camera, position: null, fov: 0 },
        },
      },
      "object",
    ],
    [
      {
        sceneView: {
          ...view,
          camera: { ...view.camera, viewMatrix: [], maxZ: 0.01 },
        },
      },
      "camera matrix",
    ],
    [
      {
        sceneView: { ...view, camera: { ...view.camera, maxZ: 0.01 } },
        renderCost: true,
      },
      "camera clip planes",
    ],
    [
      {
        rendering: { ...base.rendering, budgets: {} },
        renderCost: { vegetation: { treeDetailCounts: [] } },
      },
      "postProcesses",
    ],
    [
      {
        renderCost: {
          inventory: { registeredMeshes: -1, enabledTreeMeshesByLod: [] },
        },
      },
      "number",
    ],
    [
      {
        renderCost: {
          inventory: {
            enabledMeshCountsByMaterialClass: { PBRMaterial: -1 },
            enabledTreeMeshesByLod: [],
          },
        },
      },
      "number",
    ],
    [
      {
        renderCost: {
          inventory: { enabledTreeMeshesByLod: [] },
          vegetation: { treeDetailCounts: [-1, 0, 0] },
        },
      },
      "triple",
    ],
  ];
  for (const [changes, message] of cases)
    assert.throws(() => projectLocalBenchmark({ ...base, ...changes }), {
      message,
    });
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
    avatars: 1,
    avatarLod: { near: 1, medium: 0, far: 0 },
    terrainReview: { ...terrainReviewIdentity(TERRAIN_REVIEW_PRESETS["b6-rear-path"]), source: "private source path" },
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
  assert.deepEqual(stored.benchmark.terrainReview, {
    version: 1, id: "b6-rear-path", scope: "static-guest-start", spawnXZ: [36, -64], lookAtXZ: [29.24, -64],
  });
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
test("finite metrics, bounded integer population, ten-second duration, JSON content type and 3/min limit are enforced", async (t) => {
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
    { avatars: 29.5 },
    { avatars: 10001 },
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
  f.advance();
  assert.equal((await f.post({ ...sample(), avatars: 4, avatarLod: { near: 4, medium: 0, far: 0 } })).status, 201);
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
