import { getPosition, getMoonPosition, getMoonIllumination } from "suncalc";
export const STRAHOV_LOCATION = { latitude: 50.08065, longitude: 14.39175 };
const RAD = Math.PI / 180;
export type PrecipitationType =
  "none" | "rain" | "snow" | "mixed" | "freezing-rain" | "hail" | "unknown";
export const WMO_CONDITIONS = {
  0: "clear",
  1: "mainly-clear",
  2: "partly-cloudy",
  3: "overcast",
  45: "fog",
  48: "rime-fog",
  51: "drizzle",
  53: "drizzle",
  55: "drizzle",
  56: "freezing-drizzle",
  57: "freezing-drizzle",
  61: "rain",
  63: "rain",
  65: "rain",
  66: "freezing-rain",
  67: "freezing-rain",
  71: "snow",
  73: "snow",
  75: "snow",
  77: "snow-grains",
  80: "rain-showers",
  81: "rain-showers",
  82: "rain-showers",
  85: "snow-showers",
  86: "snow-showers",
  95: "thunderstorm",
  97: "thunderstorm",
  96: "thunderstorm-hail",
  99: "thunderstorm-hail",
} as const;
export type WeatherCondition =
  (typeof WMO_CONDITIONS)[keyof typeof WMO_CONDITIONS] | "unknown";
/** Open-Meteo's documented WMO subset; unknown codes never mean clear weather. */
export function weatherConditionFromCode(
  code: number | undefined,
): WeatherCondition {
  return code !== undefined && Object.hasOwn(WMO_CONDITIONS, code)
    ? WMO_CONDITIONS[code as keyof typeof WMO_CONDITIONS]
    : "unknown";
}
export type StationReading = {
  label: string;
  /** Sanitized published text including units/time; not reclassified as a sensor. */
  value: string;
  kind: "surface" | "derived" | "daily" | "indoor";
};
export type WeatherFieldSource = {
  kind: "station" | "model";
  source: string;
  /** UTC measurement time, or model validity time; not the model run time. */
  observedAt: number;
  stale: boolean;
};
export type WeatherSupplement =
  | "humidity"
  | "windGust"
  | "visibility"
  | "snowfall"
  | "liquidPrecipitation"
  | "precipitationType"
  | "weatherCode"
  | "dewPoint"
  | "pressure"
  | "solarRadiation"
  | "rainToday"
  | "stationReadings";
/** A bounded clock skew is allowed; missing/nonfinite/future times cannot
 * compete with a real historical snapshot during cache arbitration. */
export function isWeatherTimeAdmissible(
  observedAt: number | null | undefined,
  now: number,
): observedAt is number {
  return (
    observedAt != null && Number.isFinite(observedAt) &&
    Number.isFinite(now) && observedAt <= now + 5 * 60000
  );
}
export function isWeatherStale(
  observedAt: number | null | undefined,
  kind: "station" | "model",
  now: number,
) {
  return (
    !isWeatherTimeAdmissible(observedAt, now) ||
    now - observedAt > (kind === "station" ? 30 : 60) * 60000
  );
}
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
  /** The owner of temperature/wind/rain; model supplements retain their own sources. */
  sourceKind?: "station" | "model";
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
  dewPoint?: number;
  pressure?: number;
  solarRadiation?: number;
  rainToday?: number;
  /** Entire published station table; daily maxima are never current gusts. */
  stationReadings?: StationReading[];
  stationForecastIcon?: string;
  /** Published astronomical calculation, not a meteorological sensor. Its UTC
   * belongs to the station page, never to a renderer's time-preview override. */
  stationAstronomy?: {
    publishedAt: number;
    source: string;
    kind: "calculation";
    moonPhaseLabel: string;
    illuminatedPercent?: number;
    waxing?: boolean;
  };
  visibility?: number;
  /** Model snowfall intensity, cm/h. A station rain gauge is not a snow sensor. */
  snowfall?: number;
  /** Model rain + showers, mm/h; does not override the station's rain gauge. */
  liquidPrecipitation?: number;
  /** Model phase estimate, never inferred only from ground-level temperature. */
  precipitationType?: PrecipitationType;
  /** Model WMO condition, including fog/thunder; never a station observation. */
  weatherCode?: number;
  /** Render-only scenario. Keep the real snapshot/cache separately. */
  preview?: { id: string; label: string };
  fieldSources?: Partial<Record<WeatherSupplement, WeatherFieldSource>>;
};
/** The browser must age retained data even when it can no longer reach the server.
 * A failed refresh retains values and their origins, but cannot certify freshness.
 * Use wall-clock UTC, never the scene's time-preview override. */
export function ageWeatherSnapshot(
  weather: Weather,
  now: number,
  refreshFailed = false,
): Weather {
  const sourceKind =
    weather.sourceKind ??
    (weather.status === "live"
      ? "station"
      : weather.status === "fallback"
        ? "model"
        : undefined);
  const stale =
    refreshFailed ||
    weather.stale ||
    isWeatherStale(weather.observedAt, sourceKind ?? "model", now);
  const cloudStale =
    refreshFailed ||
    weather.cloudStale === true ||
    isWeatherStale(weather.cloudObservedAt, "model", now);
  let fieldSources = weather.fieldSources;
  for (const field of Object.keys(fieldSources ?? {}) as WeatherSupplement[]) {
    const source = fieldSources?.[field];
    if (
      source &&
      !source.stale &&
      (refreshFailed || isWeatherStale(source.observedAt, source.kind, now))
    ) {
      if (fieldSources === weather.fieldSources)
        fieldSources = { ...fieldSources };
      fieldSources![field] = { ...source, stale: true };
    }
  }
  const status = stale
    ? weather.observedAt == null
      ? "unavailable"
      : "fallback"
    : weather.status;
  if (
    stale === weather.stale &&
    cloudStale === weather.cloudStale &&
    status === weather.status &&
    sourceKind === weather.sourceKind &&
    fieldSources === weather.fieldSources
  )
    return weather;
  return { ...weather, sourceKind, stale, cloudStale, status, fieldSources };
}

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
const stationClockFormat = new Intl.DateTimeFormat("sv-SE", {
  timeZone: "Europe/Prague",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});
export function pragueStationInstant(
  stamp: string,
  now: number,
): number | null {
  const nominal = Date.parse(stamp.replace(" ", "T") + "Z");
  if (!Number.isFinite(nominal)) return null;
  const candidates = [1, 2]
    .map((offset) => nominal - offset * 3600000)
    .filter((instant) => stationClockFormat.format(instant) === stamp);
  candidates.sort((a, b) => Math.abs(a - now) - Math.abs(b - now));
  return candidates[0] ?? null;
}
export function parseStation(html: string, now = Date.now()): Weather {
  const decoded = html
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replaceAll("&nbsp;", " ");
  const text = (value: string) =>
    value.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  type Section = "outdoor" | "indoor";
  const headings = [...decoded.matchAll(/<(h[1-6]|strong|b)\b[^>]*>([\s\S]*?)<\/\1>/gi)].flatMap(match => {
    const label = text(match[2]).toLowerCase();
    const section: Section | null = label === "serverovna" ? "indoor" : label === "aktuální podmínky" ? "outdoor" : null;
    return section ? [{ index: match.index!, section }] : [];
  });
  let section: Section = "outdoor";
  let headingIndex = 0;
  // The real wview page has nested tables and a daily-rain row without <tr>.
  // Keep each leaf cell's published section: the server-room temperature must
  // never become an outdoor reading when the outdoor sensor row is missing.
  const cells = [
    ...decoded.matchAll(/<td\b[^>]*>((?:(?!<td\b)[\s\S])*?)<\/td>/gi),
  ].map(match => {
    while (headingIndex < headings.length && headings[headingIndex].index < match.index!) {
      section = headings[headingIndex++].section;
    }
    return { text: text(match[1]), section };
  });
  const rows = cells.flatMap((cell, index) =>
    cell.text.endsWith(":") && cells[index + 1]?.text && cells[index + 1].section === cell.section
      ? [{ label: cell.text, value: cells[index + 1].text, section: cell.section }]
      : [],
  );
  const outdoorValues = new Map<string, string | undefined>();
  for (const row of rows) {
    if (row.section === "outdoor")
      outdoorValues.set(row.label, outdoorValues.has(row.label) ? undefined : row.value);
  }
  // Repeated outdoor labels are ambiguous, not a reason to choose by order.
  const value = (label: string) => outdoorValues.get(label);
  const read = (label: string) => {
    const match = value(label)?.match(/(-?\d+(?:[.,]\d+)?)/);
    return match ? Number(match[1].replace(",", ".")) : null;
  };
  const optional = (label: string, min: number, max: number) => {
    const number = read(label);
    return number !== null && number >= min && number <= max
      ? number
      : undefined;
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
  const stationForecastIcon = decoded.match(/\bfc-icon-([a-z0-9-]+)/i)?.[1];
  const cloud = decoded.includes("fc-icon-partlycloudy")
    ? 0.45
    : decoded.includes("fc-icon-cloudy")
      ? 0.9
      : decoded.includes("fc-icon-sunny")
        ? 0.2
        : 0.4;
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
  const windRow = value("Charakter větru:") ?? "";
  const direction = windRow.match(
    /\b(NNE|ENE|ESE|SSE|SSW|WSW|WNW|NNW|NE|SE|SW|NW|N|E|S|W)\b/,
  )?.[1];
  if (wind > 0 && !direction)
    throw new Error("Stanice neobsahuje čitelný směr větru.");
  const stale = isWeatherStale(observedAt, "station", now);
  const moonPhaseLabel = decoded
    .match(/Fáze měsíce:\s*([^<\r\n]+)/i)?.[1]
    .trim();
  const moonPercent = Number(
    moonPhaseLabel?.match(/(\d+(?:[.,]\d+)?)\s*%/)?.[1].replace(",", "."),
  );
  const stationReadings: StationReading[] = rows.map(({ label, value, section }) => ({
    label,
    value,
    kind:
      section === "indoor"
        ? "indoor"
        : /\((?:maximum|minimum)\)|Dnešní|Dnes vál|Nejvyšší|Storm Total/.test(
              label,
            )
          ? "daily"
          : /Wind Chill|Heat Index|Rosný bod|Hustota|Základna|Výpar|Odhad/.test(
                label,
              )
            ? "derived"
            : "surface",
  }));
  const weather: Weather = {
    temperature,
    wind,
    windDirection: direction ? compass.indexOf(direction) * 22.5 : 0,
    rain,
    cloud,
    observedAt,
    fetchedAt: now,
    source:
      "Meteostanice Silicon Hill" +
      (stale ? " · poslední zastaralé měření" : ""),
    sourceKind: "station",
    cloudSource: "Orientační ikona předpovědi stanice",
    stale,
    status: stale ? "fallback" : "live",
    humidity: optional("Relativní vlhkost:", 0, 100),
    dewPoint: optional("Rosný bod:", -100, 65),
    pressure: optional("Tlak vzduchu:", 800, 1150),
    solarRadiation: optional("Intenzita slunečního záření:", 0, 1600),
    rainToday: optional("Dnešní srážky:", 0, 2000),
    stationReadings,
    stationForecastIcon,
    stationAstronomy: moonPhaseLabel
      ? {
          publishedAt: observedAt,
          source:
            "Meteostanice Silicon Hill · publikovaný astronomický výpočet",
          kind: "calculation",
          moonPhaseLabel,
          illuminatedPercent:
            Number.isFinite(moonPercent) &&
            moonPercent >= 0 &&
            moonPercent <= 100
              ? moonPercent
              : undefined,
          waxing: /Dorůstá/i.test(moonPhaseLabel)
            ? true
            : /Ubývá/i.test(moonPhaseLabel)
              ? false
              : undefined,
        }
      : undefined,
    fieldSources: {},
    cloudObservedAt: null,
    cloudStale: true,
    cloudWindSource: "Povrchový vítr stanice · přibližný drift mraků",
  };
  for (const field of [
    "humidity",
    "dewPoint",
    "pressure",
    "solarRadiation",
    "rainToday",
    "stationReadings",
  ] as const)
    if (weather[field] !== undefined)
      weather.fieldSources![field] = {
        kind: "station",
        source: "Meteostanice Silicon Hill",
        observedAt,
        stale,
      };
  return weather;
}
