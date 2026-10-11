/** Privacy projection used before HTTP and again before disk. No identities,
 * chat, modelReview, arbitrary map keys, filenames or client timestamps survive. */
const object = (value: unknown): Record<string, any> => {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("object");
  return value as Record<string, any>;
};
const number = (value: unknown, min = 0, max = 1e12) => {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < min ||
    value > max
  )
    throw new Error("number");
  return value;
};
const text = (value: unknown) => {
  if (
    typeof value !== "string" ||
    value.length > 512 ||
    /[\u0000-\u001f]/.test(value)
  )
    throw new Error("text");
  return value;
};
const choice = (value: unknown, choices: readonly unknown[]) => {
  if (!choices.includes(value)) throw new Error("choice");
  return value;
};
const fields = (value: unknown, keys: readonly string[], nullable = false) => {
  const raw = object(value),
    result: Record<string, number | null> = {};
  for (const key of keys)
    if (raw[key] !== undefined)
      result[key] = nullable && raw[key] === null ? null : number(raw[key]);
  return result;
};
const triple = (value: unknown) => {
  if (!Array.isArray(value) || value.length !== 3) throw new Error("triple");
  return value.map((v) => number(v));
};
export function projectLocalBenchmark(value: unknown) {
  const raw = object(value);
  if (
    typeof raw.sourceSnapshotId !== "string" ||
    !/^[a-f0-9]{64}$/.test(raw.sourceSnapshotId)
  )
    throw new Error("source");
  const dimensions = (value: unknown) => {
    const size = object(value),
      width = number(size.width, 1, 32768),
      height = number(size.height, 1, 32768);
    if (!Number.isInteger(width) || !Number.isInteger(height))
      throw new Error("dimensions");
    return { width, height };
  };
  const frames = number(raw.frames, 1, 1e8);
  if (!Number.isInteger(frames)) throw new Error("frames");
  const result: Record<string, any> = {
    sourceSnapshotId: raw.sourceSnapshotId,
    durationSeconds: number(raw.durationSeconds, 10, 1200),
    frames,
    averageFps: number(raw.averageFps, 0, 10000),
    p95FrameMs: number(raw.p95FrameMs, 0, 1200000),
    p99FrameMs: number(raw.p99FrameMs, 0, 1200000),
    // A partly missing scene can produce deceptively good FPS. Such a run
    // remains visible in the browser but is never accepted as performance proof.
    renderErrorCount: number(raw.renderErrorCount, 0, 0),
    assetLoadErrorCount: number(raw.assetLoadErrorCount, 0, 0),
    avatars: choice(raw.avatars, [1, 30]),
    viewport: dimensions(raw.viewport),
    renderResolution: dimensions(raw.renderResolution),
    quality: choice(raw.quality, ["low", "medium", "high"]),
  };
  const gpu = object(raw.gpu);
  result.gpu = {
    renderer: text(gpu.renderer),
    vendor: text(gpu.vendor),
    classification: choice(gpu.classification, [
      "integrated",
      "dedicated",
      "software",
      "unknown",
    ]),
  };
  if (gpu.version !== undefined) result.gpu.version = text(gpu.version);
  if (gpu.context !== undefined) {
    const context = object(gpu.context);
    const sampleCount = (value: unknown, maximum: number) => {
      if (value === null) return null;
      const count = number(value, 0, maximum);
      if (!Number.isInteger(count)) throw new Error("sample count");
      return count;
    };
    result.gpu.context = {
      requestedAntialias: choice(context.requestedAntialias, [
        true,
        false,
        null,
      ]),
      actualAntialias: choice(context.actualAntialias, [true, false, null]),
      defaultFramebuffer: choice(context.defaultFramebuffer, [
        true,
        false,
        null,
      ]),
      sampleBuffers: sampleCount(context.sampleBuffers, 1),
      samples: sampleCount(context.samples, 64),
    };
    if (
      context.defaultFramebuffer !== true &&
      (context.sampleBuffers !== null || context.samples !== null)
    )
      throw new Error("offscreen sample count");
  }
  if (gpu.webglVersion !== undefined)
    result.gpu.webglVersion = choice(gpu.webglVersion, [1, 2, null]);
  if (gpu.requestedPowerPreference !== undefined)
    result.gpu.requestedPowerPreference = choice(gpu.requestedPowerPreference, [
      "default",
      "high-performance",
      "low-power",
      "unknown",
    ]);
  if (raw.avatarLod)
    result.avatarLod = fields(raw.avatarLod, ["near", "medium", "far"]);
  for (const key of ["triangles", "drawCalls", "grassClumps"])
    if (raw[key] !== undefined) result[key] = number(raw[key]);
  if (raw.triangleCountScope !== undefined)
    result.triangleCountScope = choice(raw.triangleCountScope, [
      "all-render-passes",
    ]);
  if (raw.ambient)
    result.ambient = fields(raw.ambient, ["buses", "passengers", "cars"]);
  if (raw.sceneView) {
    const view = object(raw.sceneView),
      p = object(view.position);
    result.sceneView = {
      position: {
        x: number(p.x, -1e6, 1e6),
        y: number(p.y, -1e6, 1e6),
        z: number(p.z, -1e6, 1e6),
      },
      yaw: number(view.yaw, -1e6, 1e6),
      pitch: number(view.pitch, -1e6, 1e6),
      lightingInstant: number(view.lightingInstant, 0, 8640000000000000),
    };
    if (view.camera !== undefined) {
      const camera = object(view.camera),
        position = object(camera.position);
      const matrix = (value: unknown) => {
        if (!Array.isArray(value) || value.length !== 16)
          throw new Error("camera matrix");
        return value.map((v) => number(v, -1e8, 1e8));
      };
      result.sceneView.camera = {
        position: {
          x: number(position.x, -1e6, 1e6),
          y: number(position.y, -1e6, 1e6),
          z: number(position.z, -1e6, 1e6),
        },
        fov: number(camera.fov, 0.001, Math.PI),
        minZ: number(camera.minZ, 0.001, 1e6),
        maxZ: number(camera.maxZ, 0.001, 1e6),
        viewMatrix: matrix(camera.viewMatrix),
        projectionMatrix: matrix(camera.projectionMatrix),
      };
      if (result.sceneView.camera.maxZ <= result.sceneView.camera.minZ)
        throw new Error("camera clip planes");
    }
  }
  if (raw.frameWork)
    result.frameWork = fields(raw.frameWork, ["cpuMs", "gpuMs"], true);
  // Exact numeric whitelist; no renderer names, paths or arbitrary stage keys.
  if (raw.engineCpuBreakdownMs)
    result.engineCpuBreakdownMs = fields(raw.engineCpuBreakdownMs, [
      "activeMeshes",
      "mainDraw",
      "renderTargets",
    ]);
  if (raw.frameBreakdownMs)
    result.frameBreakdownMs = fields(raw.frameBreakdownMs, [
      "simulation",
      "world",
      "avatarsAndCamera",
      "environment",
      "render",
      "labels",
      "sky",
      "vegetation",
      "transit",
      "artLighting",
      "surfaces",
      "cinematic",
    ]);
  if (raw.rendering) {
    const rendering = object(raw.rendering);
    result.rendering = fields(
      rendering,
      [
        "targetFps",
        "effectiveTargetFps",
        "presentationHz",
        "hardwareScaling",
        "renderScale",
        "revision",
      ],
      true,
    );
    if (rendering.mode !== undefined)
      result.rendering.mode = choice(rendering.mode, [
        "auto",
        "low",
        "medium",
        "high",
      ]);
    if (rendering.quality !== undefined)
      result.rendering.quality = choice(rendering.quality, [
        "low",
        "medium",
        "high",
      ]);
    if (rendering.budgets) {
      result.rendering.budgets = fields(rendering.budgets, [
        "architectureDetailMetres",
        "avatarNearMetres",
        "avatarMediumMetres",
        "grassRangeMetres",
        "grassTiles",
        "grassDensity",
        "b6PropRadiusMetres",
        "shadowMapSize",
      ]);
      if (typeof rendering.budgets.postProcesses !== "boolean")
        throw new Error("postProcesses");
      result.rendering.budgets.postProcesses = rendering.budgets.postProcesses;
    }
    if (rendering.statistics)
      result.rendering.statistics = fields(
        rendering.statistics,
        [
          "durationMs",
          "samples",
          "averageFps",
          "medianFrameMs",
          "p95FrameMs",
          "p99FrameMs",
          "slowFrameFraction",
          "averageCpuFrameMs",
          "averageGpuFrameMs",
        ],
        true,
      );
  }
  if (raw.renderCost) {
    const cost = object(raw.renderCost);
    result.renderCost = {};
    const keys: Record<string, string[]> = {
      inventory: [
        "registeredMeshes",
        "enabledVisibleGeometryMeshes",
        "hiddenGeometryMeshes",
        "enabledRegularInstances",
        "uniqueGeometries",
        "uniqueGeometryTriangles",
        "enabledPotentialTriangles",
        "registeredMaterials",
        "enabledDistinctMaterials",
        "materialLightAssignmentGroups",
        "lights",
        "enabledLights",
      ],
      shadows: [
        "shadowCasters",
        "alphaCasters",
        "glassMaterials",
        "skyUpdates",
        "shadowMapSize",
        "shadowCandidates",
        "shadowFrustumRejected",
        "shadowInactiveRejected",
        "selectionMeshVisits",
        "glassVisits",
      ],
      surfaces: ["meshVisits", "conversionPasses", "materialUpdates"],
      vegetation: [
        "treeInstances",
        "mappedTrees",
        "inferredTrees",
        "photoInterpretedTrees",
        "grassTiles",
        "grassClumps",
        "visibleGrassTiles",
        "visibleGrassClumps",
        "uniqueTreeModels",
        "loadedTreeMeshes",
        "bootstrapBytes",
        "activeTreeTriangles",
        "pendingTreeLoads",
      ],
    };
    for (const [group, names] of Object.entries(keys))
      if (cost[group]) result.renderCost[group] = fields(cost[group], names);
    if (cost.inventory?.enabledMeshCountsByMaterialClass)
      result.renderCost.inventory.enabledMeshCountsByMaterialClass = fields(
        cost.inventory.enabledMeshCountsByMaterialClass,
        ["PBRMaterial", "StandardMaterial", "ShaderMaterial", "MultiMaterial"],
      );
    if (cost.inventory?.enabledTreeMeshesByLod)
      result.renderCost.inventory.enabledTreeMeshesByLod = triple(
        cost.inventory.enabledTreeMeshesByLod,
      );
    if (cost.vegetation?.treeDetailCounts)
      result.renderCost.vegetation.treeDetailCounts = triple(
        cost.vegetation.treeDetailCounts,
      );
  }
  return result;
}
