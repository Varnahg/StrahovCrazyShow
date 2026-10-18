/** Render-only budgets. They never change collisions, presence or server ticks. */
export type RenderQuality = "low" | "medium" | "high";
export type RenderQualityMode = "auto" | RenderQuality;
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
