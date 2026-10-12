import type { Vec3 } from "../shared/types";
import type { Weather } from "../shared/weather";
type Precipitation = Pick<Weather, "rain"> &
  Pick<Partial<Weather>, "snowfall" | "precipitationType">;
const clamp = (v: number) =>
  Math.min(1, Math.max(0, Number.isFinite(v) ? v : 0));
/** Model type, never temperature alone. Unclassified station precipitation
 * uses rain streaks as an illustrative rendering fallback. */
export function precipitationAppearance(weather: Precipitation) {
  const type = weather.precipitationType;
  const snowFraction =
    type === "snow"
      ? 1
      : type === "mixed"
        ? 0.5
        : type === "rain" || type === "freezing-rain" || type === "hail"
          ? 0
          : (weather.snowfall ?? 0) > 0.005
            ? 0.5
            : 0;
  const intensity = Math.max(0, weather.rain, (weather.snowfall ?? 0) * 2);
  return {
    snowFraction,
    density: intensity <= 0.005 ? 0 : clamp(0.08 + Math.sqrt(intensity / 12)),
  };
}
/** Reuses the fixed line buffer; inactive particles have zero length. Reset
 * whole segments together so wrapping cannot produce screen-long flashes. */
export function updateRainSegments(
  lines: Vec3[][],
  dt: number,
  weather: Precipitation,
  wind = { x: 0, z: 0 },
  time = 0,
) {
  const { snowFraction, density } = precipitationAppearance(weather);
  const count = Math.ceil(lines.length * density);
  const step = Math.min(0.1, Math.max(0, dt));
  for (let i = 0; i < lines.length; i++) {
    const [top, bottom] = lines[i];
    const snow = (i * 0.61803398875) % 1 < snowFraction;
    const speed = snow ? 1.2 + (i % 7) * 0.16 : 11 + (i % 5) * 0.7;
    const length = snow ? 0.045 + (i % 3) * 0.014 : 0.32 + (i % 4) * 0.11;
    const driftX =
      wind.x * (snow ? 0.8 : 0.55) +
      (snow ? Math.sin(time * 1.6 + i) * 0.6 : 0);
    const driftZ =
      wind.z * (snow ? 0.8 : 0.55) +
      (snow ? Math.cos(time * 1.3 + i) * 0.6 : 0);
    top.y -= step * speed;
    top.x += driftX * step;
    top.z += driftZ * step;
    if (top.y < -1) top.y += 18;
    top.x = ((((top.x + 18) % 36) + 36) % 36) - 18;
    top.z = ((((top.z + 18) % 36) + 36) % 36) - 18;
    const streak = i < count ? length : 0;
    bottom.x = top.x + (driftX * streak) / speed;
    bottom.y = top.y - streak;
    bottom.z = top.z + (driftZ * streak) / speed;
  }
}
