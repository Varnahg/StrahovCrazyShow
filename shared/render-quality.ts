/** Render-only budgets. They never change collisions, presence or server ticks. */
export type RenderQuality = "low" | "medium" | "high";
export type RenderQualityMode = "auto" | "ultra" | "custom" | RenderQuality;
export type RenderTargetFps = 60 | 120 | 144;

export type RenderBudget = Readonly<{
  architectureDetailMetres: number;
  avatarNearMetres: number;
  avatarMediumMetres: number;
  grassRangeMetres: number;
  grassTiles: number;
  grassDensity: number;
  b6PropRadiusMetres: number;
  shadowMapSize: number;
  postProcesses: boolean;
}>;

/** Match the existing facade, avatar, grass, B6 and cinematic controllers. */
export const RENDER_BUDGETS: Readonly<Record<RenderQuality, RenderBudget>> =
  Object.freeze({
    low: Object.freeze({
      architectureDetailMetres: 55,
      avatarNearMetres: 10,
      avatarMediumMetres: 36,
      grassRangeMetres: 35,
      grassTiles: 16,
      grassDensity: 0.375,
      b6PropRadiusMetres: 13,
      shadowMapSize: 512,
      postProcesses: false,
    }),
    medium: Object.freeze({
      architectureDetailMetres: 76,
      avatarNearMetres: 15,
      avatarMediumMetres: 60,
      grassRangeMetres: 45,
      grassTiles: 24,
      grassDensity: 0.65,
      b6PropRadiusMetres: 18,
      shadowMapSize: 1024,
      postProcesses: true,
    }),
    high: Object.freeze({
      architectureDetailMetres: 100,
      avatarNearMetres: 22,
      avatarMediumMetres: 90,
      grassRangeMetres: 60,
      grassTiles: 32,
      grassDensity: 1,
      b6PropRadiusMetres: 24,
      shadowMapSize: 2048,
      postProcesses: true,
    }),
  });

/** Scale is CSS pixels / backbuffer pixels, not a percentage or device DPR. */
export const MANUAL_HARDWARE_SCALING: Readonly<Record<RenderQuality, number>> =
  Object.freeze({
    low: 1.3,
    medium: 1,
    high: 1,
  });

export function isRenderQualityMode(
  value: unknown,
): value is RenderQualityMode {
  return (
    value === "auto" ||
    value === "ultra" ||
    value === "custom" ||
    value === "low" ||
    value === "medium" ||
    value === "high"
  );
}

export function isRenderTargetFps(value: unknown): value is RenderTargetFps {
  return value === 60 || value === 120 || value === 144;
}

export function renderBudget(quality: string): RenderBudget {
  return RENDER_BUDGETS[
    quality === "high" ? "high" : quality === "medium" ? "medium" : "low"
  ];
}

export type VisualFeatures = Readonly<{
  shadows: boolean;
  clouds: boolean;
  groundVegetation: boolean;
  trees: "normal" | "far-only";
  postProcesses: boolean;
}>;
export type RenderPresetMode = Exclude<RenderQualityMode, "custom">;
export type RenderPreferences = Readonly<
  | { version: 2; mode: RenderPresetMode; targetFps: RenderTargetFps }
  | { version: 2; mode: "custom"; targetFps: RenderTargetFps; quality: RenderQuality; renderScale: number; features: VisualFeatures }
>;
export type EffectiveVisualSettings = Readonly<{
  mode: RenderQualityMode;
  quality: RenderQuality;
  targetFps: RenderTargetFps;
  hardwareScaling: number;
  renderScale: number;
  features: VisualFeatures;
  budgets: RenderBudget;
}>;
export type GraphicsApplicationState = Readonly<{
  applying: boolean;
  phase: "preparing" | "restoring" | null;
  error: string | null;
  restartRequired: boolean;
}>;

const LOW_FEATURES: VisualFeatures = Object.freeze({ shadows: true, clouds: true, groundVegetation: true, trees: "normal", postProcesses: false });
const FULL_FEATURES: VisualFeatures = Object.freeze({ ...LOW_FEATURES, postProcesses: true });
const ULTRA_FEATURES: VisualFeatures = Object.freeze({ shadows: false, clouds: false, groundVegetation: false, trees: "far-only", postProcesses: false });
export function isRenderQuality(value: unknown): value is RenderQuality {
  return value === "low" || value === "medium" || value === "high";
}
function own(value: unknown, key: string): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  return descriptor && "value" in descriptor ? descriptor.value : undefined;
}
function readFeatures(value: unknown): VisualFeatures | undefined {
  const shadows = own(value, "shadows"), clouds = own(value, "clouds"), groundVegetation = own(value, "groundVegetation"),
    trees = own(value, "trees"), postProcesses = own(value, "postProcesses");
  if (typeof shadows !== "boolean" || typeof clouds !== "boolean" || typeof groundVegetation !== "boolean" ||
    (trees !== "normal" && trees !== "far-only") || typeof postProcesses !== "boolean") return undefined;
  return Object.freeze({ shadows, clouds, groundVegetation, trees, postProcesses });
}
/** Preset selection deliberately resets manual overrides. */
export function createRenderPreferences(mode: RenderQualityMode = "auto", targetFps: RenderTargetFps = 60): RenderPreferences {
  const target = isRenderTargetFps(targetFps) ? targetFps : 60;
  if (mode === "custom") return Object.freeze({ version: 2, mode, targetFps: target, quality: "low", renderScale: 1 / MANUAL_HARDWARE_SCALING.low, features: LOW_FEATURES });
  return Object.freeze({ version: 2, mode: isRenderQualityMode(mode) ? mode : "auto", targetFps: target });
}
/** Reads both historical {mode,targetFps} and v2. Malformed custom values never enable arbitrary effects. */
export function parseRenderPreferences(value: unknown): RenderPreferences {
  const mode = own(value, "mode"), version = own(value, "version"), rawTarget = own(value, "targetFps");
  const target = isRenderTargetFps(rawTarget) ? rawTarget : 60;
  if (version === undefined) return createRenderPreferences(mode === "auto" || isRenderQuality(mode) ? mode : "auto", target);
  if (version !== 2 || !isRenderQualityMode(mode)) return createRenderPreferences("auto", target);
  if (mode !== "custom") return createRenderPreferences(mode, target);
  const quality = own(value, "quality"), renderScale = own(value, "renderScale"), features = readFeatures(own(value, "features"));
  if (!isRenderQuality(quality) || typeof renderScale !== "number" || !Number.isFinite(renderScale) || renderScale < .5 || renderScale > 1 || !features)
    return createRenderPreferences("auto", target);
  return Object.freeze({ version: 2, mode, targetFps: target, quality, renderScale, features });
}
/** Resolve once on a configuration/statistics revision, not on every frame. */
export function resolveVisualSettings(
  preferences: RenderPreferences,
  adaptive?: Readonly<{ quality: RenderQuality; hardwareScaling: number }>,
): EffectiveVisualSettings {
  const quality = preferences.mode === "custom" ? preferences.quality : preferences.mode === "ultra" ? "low" :
    preferences.mode === "auto" ? adaptive?.quality ?? "medium" : preferences.mode;
  const hardwareScaling = preferences.mode === "custom" ? 1 / preferences.renderScale : preferences.mode === "ultra" ? 2 :
    preferences.mode === "auto" ? Math.max(1, Math.min(2, Number.isFinite(adaptive?.hardwareScaling) ? adaptive!.hardwareScaling : 1)) : MANUAL_HARDWARE_SCALING[quality];
  const features = preferences.mode === "custom" ? preferences.features : preferences.mode === "ultra" ? ULTRA_FEATURES : quality === "low" ? LOW_FEATURES : FULL_FEATURES;
  const budget = RENDER_BUDGETS[quality];
  return Object.freeze({ mode: preferences.mode, quality, targetFps: preferences.targetFps, hardwareScaling, renderScale: 1 / hardwareScaling,
    features, budgets: features.postProcesses === budget.postProcesses ? budget : Object.freeze({ ...budget, postProcesses: features.postProcesses }) });
}
export function toCustomRenderPreferences(effective: EffectiveVisualSettings, targetFps: RenderTargetFps = effective.targetFps): RenderPreferences & { mode: "custom" } {
  return Object.freeze({ version: 2, mode: "custom", targetFps, quality: effective.quality, renderScale: effective.renderScale,
    features: Object.freeze({ ...effective.features }) });
}
export function sameRenderPreferences(a: RenderPreferences, b: RenderPreferences): boolean {
  if (a.mode !== b.mode || a.targetFps !== b.targetFps) return false;
  if (a.mode !== "custom" || b.mode !== "custom") return true;
  return a.quality === b.quality && a.renderScale === b.renderScale &&
    a.features.shadows === b.features.shadows && a.features.clouds === b.features.clouds &&
    a.features.groundVegetation === b.features.groundVegetation && a.features.trees === b.features.trees &&
    a.features.postProcesses === b.features.postProcesses;
}
