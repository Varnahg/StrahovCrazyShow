import { getPosition, getMoonPosition, getMoonIllumination } from "suncalc";
export const STRAHOV_LOCATION = { latitude: 50.08065, longitude: 14.39175 };
const RAD = Math.PI / 180;
export type Weather = {
  temperature: number | null;
  wind: number;
  windDirection: number;
  rain: number;
  cloud: number;
  observedAt: number | null;
  fetchedAt: number;
  source: string;
  cloudSource: string;
  stale: boolean;
  status: "live" | "fallback" | "unavailable";
  /** Modelled data has its own timestamp: it is not a station observation. */
  cloudObservedAt?: number | null;
  cloudStale?: boolean;
  cloudLayers?: { low: number; mid: number; high: number };
  /** Wind aloft from model pressure levels, in m/s and meteorological FROM degrees. */
  cloudWinds?: {
    low: { speed: number; direction: number };
    mid: { speed: number; direction: number };
    high: { speed: number; direction: number };
  };
  cloudWindSource?: string;
  windGust?: number;
  humidity?: number;
  visibility?: number;
  /** Model snowfall intensity, cm/h. A station rain gauge is not a snow sensor. */
  snowfall?: number;
};
/** Our map is x=east, z=south; astronomical azimuth is clockwise from north. */
export function horizontalDirection(
  azimuthDegrees: number,
  altitudeDegrees = 0,
) {
  const azimuth = azimuthDegrees * RAD,
    altitude = altitudeDegrees * RAD,
    horizontal = Math.cos(altitude);
  return {
    x: Math.sin(azimuth) * horizontal,
    y: Math.sin(altitude),
    z: -Math.cos(azimuth) * horizontal,
  };
}
/** Wind bearing names the direction it comes FROM, so motion points opposite. */
export function windVector(speed: number, fromDegrees: number) {
  const safeSpeed = Number.isFinite(speed)
    ? Math.max(0, Math.min(100, speed))
    : 0;
  const direction = horizontalDirection(
    Number.isFinite(fromDegrees) ? fromDegrees : 0,
  );
  return { x: -direction.x * safeSpeed, z: -direction.z * safeSpeed };
}
export function sunState(time = Date.now()) {
  const sun = getPosition(
    new Date(time),
    STRAHOV_LOCATION.latitude,
    STRAHOV_LOCATION.longitude,
  );
  const altitude = (sun.altitude * Math.PI) / 180,
    azimuth = (sun.azimuth * Math.PI) / 180;
  const daylight = Math.max(0, Math.min(1, (altitude + 0.12) / 0.35));
  return {
    altitude,
    azimuth,
    daylight,
    angularDiameter: 0.533 * RAD,
    ...horizontalDirection(sun.azimuth, sun.altitude),
  };
}
export function moonState(time = Date.now()) {
  const date = new Date(time),
    moon = getMoonPosition(
      date,
      STRAHOV_LOCATION.latitude,
      STRAHOV_LOCATION.longitude,
    ),
    illumination = getMoonIllumination(date),
    altitude = (moon.altitude * Math.PI) / 180,
    azimuth = (moon.azimuth * Math.PI) / 180;
  return {
    altitude,
    azimuth,
    distance: moon.distance,
    phase: illumination.phase,
    fraction: illumination.fraction,
    waxing: illumination.waxing,
    /** Zenith-relative bright-limb tilt, anticlockwise, radians (SunCalc2 degrees converted). */
    brightLimbAngle: (illumination.angle - moon.parallacticAngle) * RAD,
    parallacticAngle: moon.parallacticAngle * RAD,
    angularDiameter: 2 * Math.asin(1737.4 / moon.distance),
    ...horizontalDirection(moon.azimuth, moon.altitude),
  };
}
/** Disambiguate the repeated autumn hour by proximity to the observation fetch. */
export function pragueStationInstant(
  stamp: string,
  now: number,
): number | null {
  const nominal = Date.parse(stamp.replace(" ", "T") + "Z");
  if (!Number.isFinite(nominal)) return null;
  const format = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Prague",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  const candidates = [1, 2]
    .map((offset) => nominal - offset * 3600000)
    .filter((instant) => format.format(instant) === stamp);
  candidates.sort((a, b) => Math.abs(a - now) - Math.abs(b - now));
  return candidates[0] ?? null;
}
export function parseStation(html: string, now = Date.now()): Weather {
  const decoded = html
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replaceAll("&nbsp;", " ");
  const rows = [...decoded.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].map((m) =>
    m[1].replace(/<[^>]*>/g, " ").replace(/\s+/g, " "),
  );
  const read = (label: string) => {
    const row = rows.find((r) => r.includes(label));
    const match = row
      ?.slice(row.indexOf(label) + label.length)
      .match(/(-?\d+(?:[.,]\d+)?)/);
    return match ? Number(match[1].replace(",", ".")) : null;
  };
  const stamp = decoded.match(/\b(20\d\d-\d\d-\d\d) (\d\d:\d\d:\d\d)\b/);
  const observedAt = stamp
    ? pragueStationInstant(stamp[1] + " " + stamp[2], now)
    : null;
  const temperature = read("Teplota:"),
    wind = read("Charakter větru:"),
    rain = read("Intenzita deště:");
  if (
    temperature === null ||
    temperature < -80 ||
    temperature > 65 ||
    !observedAt ||
    wind === null ||
    wind < 0 ||
    wind > 100 ||
    rain === null ||
    rain < 0 ||
    rain > 500
  )
    throw new Error("Stanice neobsahuje čitelné měření a čas.");
  const cloud = decoded.includes("fc-icon-partlycloudy")
    ? 0.45
    : decoded.includes("fc-icon-cloudy")
      ? 0.9
      : 0.2;
  const compass = [
    "N",
    "NNE",
    "NE",
    "ENE",
    "E",
    "ESE",
    "SE",
    "SSE",
    "S",
    "SSW",
    "SW",
    "WSW",
    "W",
    "WNW",
    "NW",
    "NNW",
  ];
  const windRow =
    rows
      .find((r) => r.includes("Charakter větru:"))
      ?.split("Charakter větru:")[1] || "";
  const direction = windRow.match(
    /\b(NNE|ENE|ESE|SSE|SSW|WSW|WNW|NNW|NE|SE|SW|NW|N|E|S|W)\b/,
  )?.[1];
  if (wind > 0 && !direction)
    throw new Error("Stanice neobsahuje čitelný směr větru.");
  return {
    temperature,
    wind,
    windDirection: direction ? compass.indexOf(direction) * 22.5 : 0,
    rain,
    cloud,
    observedAt,
    fetchedAt: now,
    source: "Meteostanice Silicon Hill",
    cloudSource: "Orientační ikona předpovědi stanice",
    stale: now - observedAt > 30 * 60000 || observedAt > now + 5 * 60000,
    status: "live",
    humidity: read("Relativní vlhkost:") ?? undefined,
    cloudObservedAt: null,
    cloudStale: true,
    cloudWindSource: "Povrchový vítr stanice · přibližný drift mraků",
  };
}
