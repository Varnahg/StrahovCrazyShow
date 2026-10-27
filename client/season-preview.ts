import type { TreeSeasonSource } from "../shared/tree-season";
import { isLightingPreviewMode, selectLightingPreview, type LightingPreviewSelection } from "./lighting-preview";

export const SEASON_PREVIEWS = {
  real: "Skutečné datum · regionální model",
  spring: "Jaro · DEMO", summer: "Léto · DEMO", autumn: "Podzim · DEMO", winter: "Zima · DEMO",
} as const;
export type SeasonPreviewMode = keyof typeof SEASON_PREVIEWS;
export type SeasonPreviewSelection = Readonly<{
  mode: SeasonPreviewMode;
  instant: number | null;
  source: TreeSeasonSource;
  lighting: LightingPreviewSelection;
}>;
const anchors = { spring: [3, 20], summer: [6, 15], autumn: [9, 20], winter: [0, 15] } as const;
const validInstant = (at: number) => Number.isFinite(at) && Math.abs(at) <= 8.64e15;
const liveSelection = (): SeasonPreviewSelection => ({ mode: "real", instant: null, source: "regional-model", lighting: { mode: "real", instant: null } });
export function isSeasonPreviewMode(value: string): value is SeasonPreviewMode {
  return Object.hasOwn(SEASON_PREVIEWS, value);
}

/** Explicit UI selection only. Set the date before resolving the existing
 * solar/lunar preset; never force a full Moon onto a different calendar date.
 * The returned single instant goes to astronomy AND the regional season model.
 * No weather values or station timestamps are accepted/mutated by this helper. */
export function selectSeasonPreview(mode: SeasonPreviewMode, lighting: LightingPreviewSelection, now = Date.now()): SeasonPreviewSelection {
  if (!isSeasonPreviewMode(mode) || !validInstant(now) || !isLightingPreviewMode(lighting.mode) ||
      (lighting.instant !== null && !validInstant(lighting.instant)) || (lighting.mode === "real") !== (lighting.instant === null))
    return liveSelection();
  if (mode === "real") return { mode, instant: lighting.instant,
    source: lighting.instant === null ? "regional-model" : "demo", lighting };
  const base = new Date(now), [month, day] = anchors[mode];
  // Set the day and month together: neither the current day31 nor leap day can
  // overflow into the next month. UTC time of day remains untouched.
  base.setUTCFullYear(base.getUTCFullYear(), month, day);
  const date = base.getTime();
  if (!validInstant(date)) return liveSelection();
  // The existing lighting solver parses a four-digit civil-year ISO string.
  // Do not reinterpret e.g. year0099 as1999 or pass an expanded year to it.
  if (lighting.mode !== "real" && (base.getUTCFullYear() < 1000 || base.getUTCFullYear() > 9999)) return liveSelection();
  const selected = lighting.mode === "real" ? lighting : selectLightingPreview(lighting.mode, date);
  if (selected.instant !== null && !validInstant(selected.instant)) return liveSelection();
  return { mode, instant: selected.instant ?? date, source: "demo", lighting: selected };
}
