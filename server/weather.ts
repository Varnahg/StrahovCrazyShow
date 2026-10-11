import { parseStation, type Weather } from "../shared/weather";

const STATION_URL = "https://weather.sh.cvut.cz/weather/";
const MODEL_URL =
  "https://api.open-meteo.com/v1/forecast?latitude=50.08065&longitude=14.39175&current=" +
  [
    "temperature_2m",
    "precipitation",
    "snowfall",
    "cloud_cover",
    "cloud_cover_low",
    "cloud_cover_mid",
    "cloud_cover_high",
    "wind_speed_10m",
    "wind_direction_10m",
    "wind_speed_850hPa",
    "wind_direction_850hPa",
    "wind_speed_700hPa",
    "wind_direction_700hPa",
    "wind_speed_500hPa",
    "wind_direction_500hPa",
    "wind_gusts_10m",
    "relative_humidity_2m",
    "visibility",
  ].join(",") +
  "&wind_speed_unit=ms&timeformat=unixtime";

function finite(value: unknown, min: number, max: number): number | undefined {
  return typeof value === "number" &&
    Number.isFinite(value) &&
    value >= min &&
    value <= max
    ? value
    : undefined;
}

/** Open-Meteo 'current' is a model, and precipitation is an interval sum, not mm/h. */
export function parseModelWeather(data: unknown, now = Date.now()): Weather {
  if (!data || typeof data !== "object")
    throw new Error("Počasí: chybí modelová odpověď.");
  const { current: raw, current_units: units } = data as Record<string, any>;
  if (!raw || typeof raw !== "object")
    throw new Error("Počasí: chybí aktuální modelová data.");
  if (units && (units.wind_speed_10m !== "m/s" || units.precipitation !== "mm"))
    throw new Error("Počasí: neočekávané jednotky modelu.");
  const temperature = finite(raw.temperature_2m, -80, 65),
    wind = finite(raw.wind_speed_10m, 0, 100),
    windDirection = finite(raw.wind_direction_10m, 0, 360),
    precipitation = finite(raw.precipitation, 0, 500),
    interval = finite(raw.interval, 1, 3600),
    cloud = finite(raw.cloud_cover, 0, 100),
    time = finite(raw.time, 0, 1e11);
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
  const observedAt = time! * 1000;
  const cloudLayers = {
    low: (finite(raw.cloud_cover_low, 0, 100) ?? cloud!) / 100,
    mid: (finite(raw.cloud_cover_mid, 0, 100) ?? 0) / 100,
    high: (finite(raw.cloud_cover_high, 0, 100) ?? 0) / 100,
  };
  const aloft = (level: string) => ({
    speed: finite(raw["wind_speed_" + level], 0, 100) ?? wind!,
    direction: finite(raw["wind_direction_" + level], 0, 360) ?? windDirection!,
  });
  const aloftComplete = ["850hPa", "700hPa", "500hPa"].every(
    (level) =>
      finite(raw["wind_speed_" + level], 0, 100) !== undefined &&
      finite(raw["wind_direction_" + level], 0, 360) !== undefined,
  );
  const stale = now - observedAt > 3600000 || observedAt > now + 5 * 60000;
  return {
    temperature: temperature!,
    wind: wind!,
    windDirection: windDirection!,
    rain: (precipitation! * 3600) / interval!,
    cloud: cloud! / 100,
    observedAt,
    fetchedAt: now,
    source: "Open-Meteo · model (stanice nedostupná nebo zastaralá)",
    cloudSource:
      "Open-Meteo · modelová oblačnost" + (stale ? " · zastaralá" : ""),
    cloudObservedAt: observedAt,
    cloudStale: stale,
    cloudLayers,
    cloudWinds: {
      low: aloft("850hPa"),
      mid: aloft("700hPa"),
      high: aloft("500hPa"),
    },
    cloudWindSource: aloftComplete
      ? "Open-Meteo · modelový vítr 850/700/500 hPa"
      : "Open-Meteo · neúplné proudění doplněné povrchovým větrem (orientační)",
    windGust: finite(raw.wind_gusts_10m, 0, 100),
    humidity: finite(raw.relative_humidity_2m, 0, 100),
    visibility: finite(raw.visibility, 0, 200000),
    snowfall: ((finite(raw.snowfall, 0, 100) ?? 0) * 3600) / interval!,
    status: "fallback",
    stale,
  };
}

/** A fresh station owns surface variables; only labelled model fields are merged. */
export function selectWeather(
  station: Weather | null,
  model: Weather | null,
  previous: Weather,
  now: number,
): Weather {
  if (station && !station.stale) {
    if (model && !model.stale)
      return {
        ...station,
        cloud: model.cloud,
        cloudSource: model.cloudSource,
        cloudObservedAt: model.cloudObservedAt,
        cloudStale: false,
        cloudLayers: model.cloudLayers,
        cloudWinds: model.cloudWinds,
        cloudWindSource: model.cloudWindSource,
        visibility: model.visibility,
        // Keep the station's measured temperature, wind and precipitation intact.
      };
    return station;
  }
  if (model && !model.stale) return model;
  if (
    station &&
    (!model || (station.observedAt ?? 0) >= (model.observedAt ?? 0))
  )
    return {
      ...station,
      source: "Meteostanice Silicon Hill · poslední zastaralé měření",
      status: "fallback",
      stale: true,
    };
  if (model) return model;
  return {
    ...previous,
    fetchedAt: now,
    stale: true,
    cloudStale: true,
    status: previous.observedAt ? "fallback" : "unavailable",
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
    const now = clock();
    if (now - cached.fetchedAt < (options.cacheForMs ?? 5 * 60000))
      return cached;
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
      cached = selectWeather(
        results[0].status === "fulfilled" ? results[0].value : null,
        results[1].status === "fulfilled" ? results[1].value : null,
        cached,
        clock(),
      );
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
