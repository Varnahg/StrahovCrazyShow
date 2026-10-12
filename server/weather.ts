import {
  isWeatherStale,
  ageWeatherSnapshot as ageWeather,
  parseStation,
  STRAHOV_LOCATION,
  type PrecipitationType,
  type Weather,
  type WeatherFieldSource,
  type WeatherSupplement,
} from "../shared/weather";

const STATION_URL = "https://weather.sh.cvut.cz/weather/";
// Representative levels for Open-Meteo's <3 km, 3–8 km and >8 km cloud bands.
const CLOUD_LEVELS = { low: "850hPa", mid: "500hPa", high: "300hPa" } as const;
const SUPPLEMENTS: readonly WeatherSupplement[] = [
  "windGust",
  "humidity",
  "visibility",
  "snowfall",
  "liquidPrecipitation",
  "precipitationType",
];
const MODEL_URL =
  `https://api.open-meteo.com/v1/forecast?latitude=${STRAHOV_LOCATION.latitude}&longitude=${STRAHOV_LOCATION.longitude}&current=` +
  [
    "temperature_2m",
    "precipitation",
    "rain",
    "showers",
    "snowfall",
    "weather_code",
    "cloud_cover",
    "cloud_cover_low",
    "cloud_cover_mid",
    "cloud_cover_high",
    "wind_speed_10m",
    "wind_direction_10m",
    ...Object.values(CLOUD_LEVELS).flatMap((level) => [
      "wind_speed_" + level,
      "wind_direction_" + level,
    ]),
    "wind_gusts_10m",
    "relative_humidity_2m",
    "visibility",
  ].join(",") +
  "&wind_speed_unit=ms&temperature_unit=celsius&precipitation_unit=mm&timeformat=unixtime";

function finite(value: unknown, min: number, max: number): number | undefined {
  return typeof value === "number" &&
    Number.isFinite(value) &&
    value >= min &&
    value <= max
    ? value
    : undefined;
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

/** The air at 2 m cannot establish precipitation phase through the whole column. */
function modelPrecipitationType(
  code: number | undefined,
  precipitation: number,
  snowfall: number | undefined,
  liquid: number | undefined,
): PrecipitationType {
  if (code === 96 || code === 99) return "hail";
  if (code === 56 || code === 57 || code === 66 || code === 67)
    return "freezing-rain";
  if ((snowfall ?? 0) > 0 && (liquid ?? 0) > 0) return "mixed";
  if ((snowfall ?? 0) > 0 || [71, 73, 75, 77, 85, 86].includes(code ?? -1))
    return "snow";
  if (
    (liquid ?? 0) > 0 ||
    [51, 53, 55, 61, 63, 65, 80, 81, 82].includes(code ?? -1)
  )
    return "rain";
  if (precipitation === 0) return "none";
  // Explicit zero snowfall gives a liquid fallback, but missing snowfall does not.
  return snowfall === 0 ? "rain" : "unknown";
}

/** Open-Meteo 'current' is a model, and precipitation is an interval sum, not mm/h. */
export function parseModelWeather(data: unknown, now = Date.now()): Weather {
  const envelope = record(data),
    raw = record(envelope?.current),
    units = record(envelope?.current_units);
  if (!raw) throw new Error("Počasí: chybí aktuální modelová data.");
  if (
    !units ||
    units.wind_speed_10m !== "m/s" ||
    units.precipitation !== "mm" ||
    (units.temperature_2m !== undefined && units.temperature_2m !== "°C") ||
    (units.time !== undefined && units.time !== "unixtime") ||
    (units.interval !== undefined && units.interval !== "seconds")
  )
    throw new Error("Počasí: neočekávané jednotky modelu.");
  const read = (key: string, min: number, max: number, unit: string) =>
    units[key] !== undefined && units[key] !== unit
      ? undefined
      : finite(raw[key], min, max);
  const temperature = read("temperature_2m", -80, 65, "°C"),
    wind = read("wind_speed_10m", 0, 100, "m/s"),
    windDirection = read("wind_direction_10m", 0, 360, "°"),
    precipitation = read("precipitation", 0, 500, "mm"),
    interval = read("interval", 1, 3600, "seconds"),
    cloud = read("cloud_cover", 0, 100, "%"),
    time = read("time", 0, 1e11, "unixtime");
  if (
    [
      temperature,
      wind,
      windDirection,
      precipitation,
      interval,
      cloud,
      time,
    ].some((value) => value === undefined)
  )
    throw new Error("Počasí: neplatné hodnoty modelu.");
  const observedAt = time! * 1000,
    stale = isWeatherStale(observedAt, "model", now),
    rate = 3600 / interval!,
    snowAmount = read("snowfall", 0, 100, "cm"),
    rainAmount = read("rain", 0, 500, "mm"),
    showerAmount = read("showers", 0, 500, "mm"),
    liquidAmount =
      rainAmount !== undefined && showerAmount !== undefined
        ? rainAmount + showerAmount
        : undefined;
  const layers = {
    low: read("cloud_cover_low", 0, 100, "%"),
    mid: read("cloud_cover_mid", 0, 100, "%"),
    high: read("cloud_cover_high", 0, 100, "%"),
  };
  let aloftComplete = true;
  const aloft = (level: string) => {
    const speed = read("wind_speed_" + level, 0, 150, "m/s"),
      direction = read("wind_direction_" + level, 0, 360, "°");
    if (speed !== undefined && direction !== undefined)
      return { speed, direction };
    aloftComplete = false;
    // Keep each vector coherent; never combine aloft speed with surface direction.
    return { speed: wind!, direction: windDirection! };
  };
  const cloudWinds = {
    low: aloft(CLOUD_LEVELS.low),
    mid: aloft(CLOUD_LEVELS.mid),
    high: aloft(CLOUD_LEVELS.high),
  };
  const weather: Weather = {
    temperature: temperature!,
    wind: wind!,
    windDirection: windDirection!,
    rain: precipitation! * rate,
    cloud: cloud! / 100,
    observedAt,
    fetchedAt: now,
    sourceKind: "model",
    source: "Open-Meteo · model (stanice nedostupná nebo zastaralá)",
    cloudSource:
      "Open-Meteo · modelová oblačnost" +
      (Object.values(layers).some((value) => value === undefined)
        ? " · neúplné vrstvy odhadnuté z celku"
        : "") +
      (stale ? " · zastaralá" : ""),
    cloudObservedAt: observedAt,
    cloudStale: stale,
    cloudLayers: {
      low: (layers.low ?? cloud!) / 100,
      mid: (layers.mid ?? 0) / 100,
      high: (layers.high ?? 0) / 100,
    },
    cloudWinds,
    cloudWindSource: aloftComplete
      ? "Open-Meteo · modelový vítr 850/500/300 hPa"
      : "Open-Meteo · neúplné proudění doplněné povrchovým větrem (orientační)",
    windGust: read("wind_gusts_10m", 0, 150, "m/s"),
    humidity: read("relative_humidity_2m", 0, 100, "%"),
    visibility: read("visibility", 0, 200000, "m"),
    snowfall: snowAmount === undefined ? undefined : snowAmount * rate,
    liquidPrecipitation:
      liquidAmount === undefined ? undefined : liquidAmount * rate,
    precipitationType: modelPrecipitationType(
      read("weather_code", 0, 99, "wmo code"),
      precipitation!,
      snowAmount,
      liquidAmount,
    ),
    status: "fallback",
    stale,
  };
  const source: WeatherFieldSource = {
    kind: "model",
    source: "Open-Meteo · model",
    observedAt,
    stale,
  };
  weather.fieldSources = {};
  for (const field of SUPPLEMENTS)
    if (weather[field] !== undefined) weather.fieldSources[field] = source;
  return weather;
}

/** A fresh station owns surface variables; only labelled model fields are merged. */
export function selectWeather(
  station: Weather | null,
  model: Weather | null,
  previous: Weather,
  now: number,
): Weather {
  if (station) station = ageWeather(station, now);
  if (model) model = ageWeather(model, now);
  if (station && !station.stale) {
    if (!model || model.stale) return station;
    const combined: Weather = {
      ...station,
      cloud: model.cloud,
      cloudSource: model.cloudSource,
      cloudObservedAt: model.cloudObservedAt,
      cloudStale: false,
      cloudLayers: model.cloudLayers,
      cloudWinds: model.cloudWinds,
      cloudWindSource: model.cloudWindSource,
      windGust: model.windGust,
      humidity: station.humidity ?? model.humidity,
      visibility: model.visibility,
      snowfall: model.snowfall,
      liquidPrecipitation: model.liquidPrecipitation,
      precipitationType: model.precipitationType,
      fieldSources: { ...model.fieldSources, ...station.fieldSources },
    };
    // Gauge precipitation must not disappear because a model grid cell says dry.
    if (station.rain > 0 && combined.precipitationType === "none") {
      combined.precipitationType = "unknown";
      combined.fieldSources!.precipitationType = {
        kind: "station",
        source: "Skupenství neznámé · srážkoměr stanice, model udává sucho",
        observedAt: station.observedAt!,
        stale: false,
      };
    }
    return combined;
  }
  if (model && !model.stale) return model;
  // A newly fetched but old station page must not displace a newer cached model.
  const newest = [station, model, previous]
    .filter((item): item is Weather => item !== null)
    .reduce((best, item) =>
      (item.observedAt ?? -Infinity) > (best.observedAt ?? -Infinity)
        ? item
        : best,
    );
  const retained = ageWeather(newest, now, true);
  return {
    ...retained,
    ...(retained.sourceKind === "station"
      ? { source: "Meteostanice Silicon Hill · poslední zastaralé měření" }
      : {}),
    fetchedAt: now,
  };
}

export function createWeatherProvider(
  options: {
    fetch?: typeof fetch;
    now?: () => number;
    cacheForMs?: number;
  } = {},
) {
  const fetcher = options.fetch ?? fetch,
    clock = options.now ?? Date.now;
  let cached: Weather = {
    temperature: null,
    wind: 0,
    windDirection: 0,
    rain: 0,
    cloud: 0.4,
    observedAt: null,
    fetchedAt: -Infinity,
    source: "Počasí zatím nedostupné",
    cloudSource: "Demonstrační oblačnost",
    cloudObservedAt: null,
    cloudStale: true,
    stale: true,
    status: "unavailable",
  };
  let pending: Promise<Weather> | undefined;
  return async function getWeather(): Promise<Weather> {
    const now = clock(),
      cacheAge = now - cached.fetchedAt;
    if (cacheAge >= 0 && cacheAge < (options.cacheForMs ?? 5 * 60000)) {
      cached = ageWeather(cached, now);
      return cached;
    }
    if (pending) return pending;
    pending = (async () => {
      const results = await Promise.allSettled([
        fetcher(STATION_URL, { signal: AbortSignal.timeout(7000) }).then(
          async (r) => {
            if (!r.ok) throw new Error(String(r.status));
            return parseStation(
              new TextDecoder("windows-1250").decode(await r.arrayBuffer()),
              clock(),
            );
          },
        ),
        fetcher(MODEL_URL, { signal: AbortSignal.timeout(7000) }).then(
          async (r) => {
            if (!r.ok) throw new Error(String(r.status));
            return parseModelWeather(await r.json(), clock());
          },
        ),
      ]);
      const fetchedAt = clock();
      cached = {
        ...selectWeather(
          results[0].status === "fulfilled" ? results[0].value : null,
          results[1].status === "fulfilled" ? results[1].value : null,
          cached,
          fetchedAt,
        ),
        fetchedAt,
      };
      return cached;
    })();
    try {
      return await pending;
    } finally {
      pending = undefined;
    }
  };
}

export const getWeather = createWeatherProvider();
