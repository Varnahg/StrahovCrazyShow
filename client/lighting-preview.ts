import { getMoonIllumination, getTimes } from "suncalc";
import { dateKey } from "../shared/events";
import { moonState, STRAHOV_LOCATION, sunState } from "../shared/weather";

const HOUR = 3_600_000,
  DAY = 24 * HOUR,
  RAD = Math.PI / 180;

export const LIGHTING_PREVIEWS = {
  real: "Skutečný čas na Strahově",
  day: "Denní náhled · demo",
  "golden-hour": "Zlatá hodina · demo",
  "blue-hour": "Modrá hodina · demo",
  night: "Noční náhled · demo",
  "full-moon": "Úplňková noc · demo",
} as const;
export type LightingPreviewMode = keyof typeof LIGHTING_PREVIEWS;
export type LightingPreviewSelection = {
  mode: LightingPreviewMode;
  instant: number | null;
};

export function isLightingPreviewMode(
  value: string,
): value is LightingPreviewMode {
  return Object.hasOwn(LIGHTING_PREVIEWS, value);
}

/** Solve the descending crossing in today's Prague solar day, independent of
 * the browser timezone. Never mutate SunCalc's global custom-time registry. */
function eveningAltitude(day: string, altitude: number) {
  let before = getTimes(
    new Date(day + "T12:00:00Z"),
    STRAHOV_LOCATION.latitude,
    STRAHOV_LOCATION.longitude,
  ).solarNoon.getTime();
  let after = before + 12 * HOUR;
  for (let i = 0; i < 24; i++) {
    const middle = (before + after) / 2;
    if (sunState(middle).altitude > altitude) before = middle;
    else after = middle;
  }
  return Math.round((before + after) / 2);
}

/** Find a near-full night close to the next phase crossing, with the actual Moon
 * above 10 degrees and Sun below -12. Prague's summer full Moon is too low for a
 * 15-degree cut; the exact full-phase instant itself can occur in broad daylight.
 * Sources: installed SunCalc 2.1.1 README/types and github.com/mourner/suncalc,
 * checked 2026-10-12. Returned time is a simulated UTC instant, not a forecast. */
function fullMoonNight(now: number) {
  let before = now;
  let previousPhase = getMoonIllumination(new Date(before)).phase;
  let fullMoon: number | null = null;
  for (let day = 1; day <= 33; day++) {
    let after = now + day * DAY;
    const phase = getMoonIllumination(new Date(after)).phase;
    if (previousPhase < 0.5 && phase >= 0.5) {
      for (let i = 0; i < 22; i++) {
        const middle = (before + after) / 2;
        if (getMoonIllumination(new Date(middle)).phase < 0.5) before = middle;
        else after = middle;
      }
      fullMoon = (before + after) / 2;
      break;
    }
    before = after;
    previousPhase = phase;
  }
  if (fullMoon === null) return null;
  let best: number | null = null,
    score = -Infinity;
  for (let at = fullMoon - DAY; at <= fullMoon + DAY; at += HOUR / 6) {
    if (at < now || sunState(at).altitude > -12 * RAD) continue;
    const moon = moonState(at);
    if (moon.altitude < 10 * RAD || moon.fraction < 0.985) continue;
    // Prefer a high visible Moon on the nearest night, not a daylight syzygy or
    // the horizon. This selection score is UI art direction, not astronomy.
    const candidate =
      moon.altitude - (Math.abs(at - fullMoon) / DAY) * 10 * RAD;
    if (candidate > score) {
      best = at;
      score = candidate;
    }
  }
  return best === null ? null : Math.round(best);
}

/** Called on explicit selection only; React stores this result and the renderer
 * consumes the same instant. No astronomy search runs on frames/HUD rerenders. */
export function selectLightingPreview(
  mode: LightingPreviewMode,
  now = Date.now(),
): LightingPreviewSelection {
  if (mode === "real" || !Number.isFinite(now))
    return { mode: "real", instant: null };
  const day = dateKey(now);
  const instant =
    mode === "day" || mode === "night"
      ? // Preserve the original demo's 10:00Z / 22:00Z anchors on the Prague date.
        Date.parse(day + (mode === "day" ? "T10:00:00Z" : "T22:00:00Z"))
      : mode === "golden-hour"
        ? eveningAltitude(day, 3 * RAD)
        : mode === "blue-hour"
          ? eveningAltitude(day, -6 * RAD)
          : fullMoonNight(now);
  return instant === null ? { mode: "real", instant: null } : { mode, instant };
}
