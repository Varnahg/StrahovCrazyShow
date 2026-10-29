/** Event-specific contract. The existing diagnostics wire schema stays version 1. */
export const PLAYTEST_DIARY_VERSION = 1 as const;
export const PLAYTEST_LIMITS = Object.freeze({
  poseIntervalMs: 100,
  windowMs: 1000,
  inputWindowSamples: 64,
  poseWindowSamples: 16,
  incidentBeforeMs: 2000,
  incidentAfterMs: 2000,
  incidentBeforeFrames: 512,
  incidentAfterFrames: 512,
  incidentChunkFrames: 8,
  incidentTriggers: 8,
  incidentCooldownMs: 1000,
  pendingActions: 32,
  // Leave room for the diagnostics record envelope and its sanitizer bounds.
  eventDataBytes: 24 * 1024,
});

export type PlaytestIdentity = {
  diaryVersion: typeof PLAYTEST_DIARY_VERSION;
  sessionId: string;
  runId: string;
  gameInstanceId: string;
};
export type PlaytestRefs = {
  connectionId: string | null;
  scenarioId: string | null;
  scenarioVersion: string | null;
  stepId: string | null;
  actionId?: string;
  incidentId?: string;
};
export type PlaytestSourceIdentity = {
  sourceSnapshotId: string | null;
  sourceSnapshotScope: string;
  sourceId: string | null;
  gitHead: string | null;
  assetSnapshotId: string | null;
  assetSnapshotScope: string;
};
export type PlaytestLightingMode =
  "real" | "day" | "golden-hour" | "blue-hour" | "night" | "full-moon";
export type PlaytestCapturePhase = "off-before" | "on" | "off-after";
export type PlaytestVec3 = { x: number; y: number; z: number };
/** Explicit render-relevant fields. This is not the entire provider response. */
export type PlaytestWeatherSnapshot = {
  temperature?: number | null;
  wind?: number;
  windDirection?: number;
  rain?: number;
  cloud?: number;
  observedAt?: number | null;
  fetchedAt?: number;
  source?: string;
  sourceKind?: "station" | "model";
  stale?: boolean;
  status?: "live" | "fallback" | "unavailable";
  cloudSource?: string;
  cloudObservedAt?: number | null;
  cloudStale?: boolean;
  cloudWindSource?: string;
  cloudLayers?: { low: number; mid: number; high: number };
  cloudWinds?: { low: { speed: number; direction: number }; mid: { speed: number; direction: number }; high: { speed: number; direction: number } };
  windGust?: number;
  humidity?: number;
  visibility?: number;
  snowfall?: number;
  liquidPrecipitation?: number;
  precipitationType?: "none" | "rain" | "snow" | "mixed" | "freezing-rain" | "hail" | "unknown";
};
export type PlaytestEnvironment = {
  url: string;
  userAgent: string;
  gpu: { renderer: string; vendor: string; webglVersion: number | null };
};
export type PlaytestFrameSample = {
  frameId: number;
  frameStartedAtMs: number;
  renderCompletedAtMs: number;
  /** The interval preceding this frame, not this frame's render CPU work. */
  frameMs: number;
  utcMs: number;
  position: PlaytestVec3;
  actorYaw: number;
  speed: number;
  vehicle: boolean;
  renderPosition: PlaytestVec3;
  camera: {
    position: PlaytestVec3;
    yaw: number;
    pitch: number;
    firstPerson: boolean;
    fov: number;
    viewMatrix: number[];
    projectionMatrix: number[];
  };
  rendering: {
    qualityMode: "auto" | "low" | "medium" | "high";
    quality: "low" | "medium" | "high";
    hardwareScaling: number;
    cssWidth: number;
    cssHeight: number;
    renderWidth: number;
    renderHeight: number;
    dpr: number;
  };
  lighting: { mode: PlaytestLightingMode; instantUtcMs: number };
  flashlight: boolean;
  zone: string;
  scene?: {
    weather: PlaytestWeatherSnapshot | null;
    avatarCount: number;
    uiModal: boolean;
    renderErrors: number;
    assetErrors: number;
  };
};
export type PlaytestInputSample = {
  atMs: number;
  frameId: number | null;
  execution: "prediction" | "reconciliation" | "offline";
  source: "input" | "missing" | "mode-mismatch";
  inputEpoch: number | null;
  inputSeq: number;
  simulationTick: number | null;
  simulationUtcMs: number;
  x: number;
  z: number;
  yaw: number;
  jump: boolean;
  run: boolean;
  vehicle: boolean;
};
export type PlaytestRunInfo = {
  clockOriginUtcMs: number;
  source: PlaytestSourceIdentity;
  captureMode: "off" | "checkpoints" | "incident";
  environment?: PlaytestEnvironment;
};
export type PlaytestStep = {
  scenarioId: string;
  scenarioVersion: string;
  stepId: string;
  stationId: string;
  trial: {
    lightingMode: PlaytestLightingMode;
    lightingInstant: number | null;
    view: "first" | "third" | "vehicle";
    qualityMode: "auto" | "low" | "medium" | "high";
    quality: "low" | "medium" | "high";
  };
  traversal: "normal-input" | "teleport" | "unknown";
};
/** Deliberately a small flat technical state, never arbitrary UI/user content. */
export type PlaytestActionState = {
  vehicle?: boolean;
  flashlight?: boolean;
  firstPerson?: boolean;
  ready?: boolean;
  respawnPending?: boolean;
  quality?: "low" | "medium" | "high";
  qualityMode?: "auto" | "low" | "medium" | "high";
  lightingMode?: PlaytestLightingMode;
  distance?: number;
};
export type PlaytestActionRequest = {
  action: string;
  origin: "keyboard" | "hud" | "scenario" | "system";
  atMs: number;
  frameId: number | null;
  phase?: PlaytestCapturePhase;
  before?: PlaytestActionState;
};
export type PlaytestActionResult = {
  status: "applied" | "rejected" | "cancelled";
  reason?: string;
  atMs: number;
  frameId: number | null;
  after?: PlaytestActionState;
};
export type PlaytestIncidentTrigger = {
  kind: "frame-hitch" | "correction" | "manual" | "error";
  atMs: number;
  frameId: number | null;
  actionId?: string;
  reason?: string;
  durationMs?: number;
  correctionMetres?: number;
};

export type PlaytestCaptureMetadata = PlaytestIdentity & {
  refs: PlaytestRefs;
  artifactId: string;
  requestId: string;
  reason: string;
  phase?: PlaytestCapturePhase;
  requestedAtMs: number;
  captureStartedAtMs: number;
  capturedAtMs: number;
  capturedAtUTC: string;
  frame: PlaytestFrameSample;
  source: PlaytestSourceIdentity;
  mimeType: "image/webp" | "image/png" | "image/jpeg";
  width: number;
  height: number;
  sourceWidth: number;
  sourceHeight: number;
  copyMs: number;
  burstId?: string;
  burstIndex?: number;
};
export type PlaytestArtifactReceipt = {
  artifactId: string;
  storageKey: string;
  sha256: string;
  bytes: number;
  savedAtUTC: string;
};

export const PLAYTEST_EVENT_KINDS = [
  "playtest-game-start", "playtest-game-end",
  "playtest-step-start", "playtest-step-end",
  "playtest-input-window", "playtest-pose-window",
  "playtest-action-request", "playtest-action-result",
  "playtest-incident-start", "playtest-incident-frames", "playtest-incident-end",
  "playtest-gap",
] as const;
export type PlaytestEventKind = (typeof PLAYTEST_EVENT_KINDS)[number];

// Read own data only. A diagnostic copy must not call accessors or retain live objects.
const own = (value: unknown, key: string): unknown => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return undefined;
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  return descriptor && "value" in descriptor ? descriptor.value : undefined;
};
const finite = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);
const nonnegative = (value: unknown): value is number => finite(value) && value >= 0;
const integer = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) >= 0;
export const isPlaytestId = (value: unknown): value is string =>
  typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(value);
const text = (value: unknown, maximum = 256): value is string =>
  typeof value === "string" && value.length <= maximum;
const nullableId = (value: unknown): value is string | null => value === null || isPlaytestId(value);
const quality = (value: unknown): value is "low" | "medium" | "high" =>
  value === "low" || value === "medium" || value === "high";
const qualityMode = (value: unknown): value is "auto" | "low" | "medium" | "high" => value === "auto" || quality(value);
const lightingMode = (value: unknown): value is PlaytestLightingMode =>
  ["real", "day", "golden-hour", "blue-hour", "night", "full-moon"].includes(value as string);
export const isPlaytestCapturePhase = (value: unknown): value is PlaytestCapturePhase =>
  value === "off-before" || value === "on" || value === "off-after";
const vector = (value: unknown): PlaytestVec3 | null => {
  const x = own(value, "x"), y = own(value, "y"), z = own(value, "z");
  return finite(x) && finite(y) && finite(z) ? { x, y, z } : null;
};
const matrix = (value: unknown): number[] | null => {
  if (!Array.isArray(value) || value.length !== 16) return null;
  const copy: number[] = [];
  for (let i = 0; i < 16; i++) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(i));
    if (!descriptor || !("value" in descriptor) || !finite(descriptor.value)) return null;
    copy.push(descriptor.value);
  }
  return copy;
};

export function copyPlaytestIdentity(value: unknown): PlaytestIdentity | null {
  try {
    const sessionId = own(value, "sessionId"), runId = own(value, "runId"), gameInstanceId = own(value, "gameInstanceId");
    return own(value, "diaryVersion") === 1 && isPlaytestId(sessionId) && isPlaytestId(runId) && isPlaytestId(gameInstanceId)
      ? { diaryVersion: 1, sessionId, runId, gameInstanceId } : null;
  } catch { return null; }
}
export function copyPlaytestRefs(value: unknown): PlaytestRefs | null {
  try {
    const connectionId = own(value, "connectionId"), scenarioId = own(value, "scenarioId"), scenarioVersion = own(value, "scenarioVersion"), stepId = own(value, "stepId");
    const actionId = own(value, "actionId"), incidentId = own(value, "incidentId");
    if (![connectionId, scenarioId, scenarioVersion, stepId].every(nullableId) ||
      (actionId !== undefined && !isPlaytestId(actionId)) || (incidentId !== undefined && !isPlaytestId(incidentId))) return null;
    return { connectionId: connectionId as string | null, scenarioId: scenarioId as string | null,
      scenarioVersion: scenarioVersion as string | null, stepId: stepId as string | null,
      ...(actionId === undefined ? {} : { actionId: actionId as string }),
      ...(incidentId === undefined ? {} : { incidentId: incidentId as string }) };
  } catch { return null; }
}
export function copyPlaytestSourceIdentity(value: unknown): PlaytestSourceIdentity | null {
  try {
    const sourceSnapshotId = own(value, "sourceSnapshotId"), sourceId = own(value, "sourceId"), gitHead = own(value, "gitHead"), assetSnapshotId = own(value, "assetSnapshotId");
    const sourceSnapshotScope = own(value, "sourceSnapshotScope"), assetSnapshotScope = own(value, "assetSnapshotScope");
    if (![sourceSnapshotId, sourceId, gitHead, assetSnapshotId].every(nullableId) || !text(sourceSnapshotScope) || !text(assetSnapshotScope)) return null;
    return { sourceSnapshotId: sourceSnapshotId as string | null, sourceId: sourceId as string | null,
      gitHead: gitHead as string | null, assetSnapshotId: assetSnapshotId as string | null, sourceSnapshotScope, assetSnapshotScope };
  } catch { return null; }
}

export function copyPlaytestEnvironment(value: unknown): PlaytestEnvironment | null {
  try {
    const url = own(value, "url"), userAgent = own(value, "userAgent"), gpu = own(value, "gpu");
    const renderer = own(gpu, "renderer"), vendor = own(gpu, "vendor"), webglVersion = own(gpu, "webglVersion");
    if (!text(url, 2048) || !text(userAgent, 512) || !text(renderer, 256) || !text(vendor, 256) || !(webglVersion === null || webglVersion === 1 || webglVersion === 2)) return null;
    const parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
    return { url: `${parsed.protocol}//${parsed.host}${parsed.pathname}`, userAgent, gpu: { renderer, vendor, webglVersion } };
  } catch { return null; }
}
function copyWeather(value: unknown): PlaytestWeatherSnapshot | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const result: Record<string, unknown> = {};
  for (const key of ["temperature", "wind", "windDirection", "rain", "cloud", "observedAt", "fetchedAt", "cloudObservedAt", "windGust", "humidity", "visibility", "snowfall", "liquidPrecipitation"]) {
    const current = own(value, key);
    if (current === undefined) continue;
    if (!finite(current) && !(current === null && ["temperature", "observedAt", "cloudObservedAt"].includes(key))) return null;
    result[key] = current;
  }
  for (const key of ["source", "cloudSource", "cloudWindSource"]) {
    const current = own(value, key);
    if (current !== undefined) { if (!text(current, 256)) return null; result[key] = current; }
  }
  for (const key of ["stale", "cloudStale"]) {
    const current = own(value, key);
    if (current !== undefined) { if (typeof current !== "boolean") return null; result[key] = current; }
  }
  for (const [key, allowed] of [["sourceKind", ["station", "model"]], ["status", ["live", "fallback", "unavailable"]], ["precipitationType", ["none", "rain", "snow", "mixed", "freezing-rain", "hail", "unknown"]]] as const) {
    const current = own(value, key);
    if (current !== undefined) { if (!(allowed as readonly unknown[]).includes(current)) return null; result[key] = current; }
  }
  for (const key of ["cloudLayers", "cloudWinds"]) {
    const current = own(value, key);
    if (current === undefined) continue;
    const layers: Record<string, unknown> = {};
    for (const layer of ["low", "mid", "high"]) {
      const data = own(current, layer);
      if (key === "cloudLayers") { if (!finite(data)) return null; layers[layer] = data; }
      else {
        const speed = own(data, "speed"), direction = own(data, "direction");
        if (!finite(speed) || !finite(direction)) return null;
        layers[layer] = { speed, direction };
      }
    }
    result[key] = layers;
  }
  return result as PlaytestWeatherSnapshot;
}
function copyScene(value: unknown): PlaytestFrameSample["scene"] | null {
  const weather = own(value, "weather"), avatarCount = own(value, "avatarCount"), uiModal = own(value, "uiModal"), renderErrors = own(value, "renderErrors"), assetErrors = own(value, "assetErrors");
  const weatherCopy = weather === null ? null : copyWeather(weather);
  if ((weather !== null && weatherCopy === null) || !integer(avatarCount) || typeof uiModal !== "boolean" || !integer(renderErrors) || !integer(assetErrors)) return null;
  return { weather: weatherCopy, avatarCount, uiModal, renderErrors, assetErrors };
}

/** Fixed-size projection suitable for the per-frame ring and capture metadata. */
export function copyPlaytestFrameSample(value: unknown): PlaytestFrameSample | null {
  try {
    const frameId = own(value, "frameId"), frameStartedAtMs = own(value, "frameStartedAtMs"), renderCompletedAtMs = own(value, "renderCompletedAtMs"), frameMs = own(value, "frameMs"), utcMs = own(value, "utcMs");
    const position = vector(own(value, "position")), renderPosition = vector(own(value, "renderPosition"));
    const actorYaw = own(value, "actorYaw"), speed = own(value, "speed"), vehicle = own(value, "vehicle"), flashlight = own(value, "flashlight"), zone = own(value, "zone");
    const camera = own(value, "camera"), cameraPosition = vector(own(camera, "position"));
    const yaw = own(camera, "yaw"), pitch = own(camera, "pitch"), fov = own(camera, "fov"), firstPerson = own(camera, "firstPerson");
    const viewMatrix = matrix(own(camera, "viewMatrix")), projectionMatrix = matrix(own(camera, "projectionMatrix"));
    const rendering = own(value, "rendering"), q = own(rendering, "quality"), qm = own(rendering, "qualityMode");
    const hardwareScaling = own(rendering, "hardwareScaling"), cssWidth = own(rendering, "cssWidth"), cssHeight = own(rendering, "cssHeight"), renderWidth = own(rendering, "renderWidth"), renderHeight = own(rendering, "renderHeight"), dpr = own(rendering, "dpr");
    const lighting = own(value, "lighting"), mode = own(lighting, "mode"), instantUtcMs = own(lighting, "instantUtcMs");
    const rawScene = own(value, "scene"), scene = rawScene === undefined ? undefined : copyScene(rawScene);
    if (!integer(frameId) || !nonnegative(frameStartedAtMs) || !nonnegative(renderCompletedAtMs) || renderCompletedAtMs < frameStartedAtMs || !nonnegative(frameMs) || !nonnegative(utcMs) ||
      !position || !renderPosition || !finite(actorYaw) || !finite(speed) || typeof vehicle !== "boolean" || typeof flashlight !== "boolean" || !text(zone, 128) ||
      !cameraPosition || !finite(yaw) || !finite(pitch) || !finite(fov) || fov <= 0 || typeof firstPerson !== "boolean" || !viewMatrix || !projectionMatrix ||
      !quality(q) || !qualityMode(qm) || !finite(hardwareScaling) || hardwareScaling <= 0 || !nonnegative(cssWidth) || !nonnegative(cssHeight) || !integer(renderWidth) || !integer(renderHeight) || !finite(dpr) || dpr <= 0 ||
      !lightingMode(mode) || !nonnegative(instantUtcMs) || scene === null) return null;
    return { frameId, frameStartedAtMs, renderCompletedAtMs, frameMs, utcMs, position, actorYaw, speed, vehicle, renderPosition,
      camera: { position: cameraPosition, yaw, pitch, firstPerson, fov, viewMatrix, projectionMatrix },
      rendering: { qualityMode: qm, quality: q, hardwareScaling, cssWidth, cssHeight, renderWidth, renderHeight, dpr },
      lighting: { mode, instantUtcMs }, flashlight, zone, ...(scene === undefined ? {} : { scene }) };
  } catch { return null; }
}

export function copyPlaytestInputSample(value: unknown): PlaytestInputSample | null {
  try {
    const atMs = own(value, "atMs"), frameId = own(value, "frameId"), inputEpoch = own(value, "inputEpoch"), inputSeq = own(value, "inputSeq"), simulationTick = own(value, "simulationTick"), simulationUtcMs = own(value, "simulationUtcMs");
    const execution = own(value, "execution"), source = own(value, "source"), x = own(value, "x"), z = own(value, "z"), yaw = own(value, "yaw"), jump = own(value, "jump"), run = own(value, "run"), vehicle = own(value, "vehicle");
    if (!nonnegative(atMs) || !(frameId === null || integer(frameId)) || !(inputEpoch === null || integer(inputEpoch)) || !integer(inputSeq) || !(simulationTick === null || integer(simulationTick)) || !nonnegative(simulationUtcMs) ||
      !["prediction", "reconciliation", "offline"].includes(execution as string) || !["input", "missing", "mode-mismatch"].includes(source as string) ||
      !finite(x) || !finite(z) || Math.abs(x) > 1 || Math.abs(z) > 1 || !finite(yaw) || typeof jump !== "boolean" || typeof run !== "boolean" || typeof vehicle !== "boolean" ||
      (execution === "offline" ? inputEpoch !== null : inputEpoch === null)) return null;
    return { atMs, frameId, inputEpoch, inputSeq, simulationTick, simulationUtcMs, execution: execution as PlaytestInputSample["execution"], source: source as PlaytestInputSample["source"], x, z, yaw, jump, run, vehicle };
  } catch { return null; }
}
