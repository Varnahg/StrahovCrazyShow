import type { Weather } from "./weather";

/** Authored QA conditions, never measurements or a forecast. Select once in
 * the UI and keep the live weather snapshot/cache untouched underneath. */
const definitions = [
  {
    id: "clear",
    label: "Jasno",
    description: "Čistá obloha, kotouče a den/noc.",
    values: { cloud: 0, weatherCode: 0 },
  },
  {
    id: "mainly-clear",
    label: "Skoro jasno",
    description: "Ojedinělé mraky a jejich drift.",
    values: { cloud: 0.15, weatherCode: 1 },
  },
  {
    id: "partly-cloudy",
    label: "Polojasno",
    description: "Tři vrstvy mraků, zakrytí Slunce a Měsíce.",
    values: {
      cloud: 0.5,
      weatherCode: 2,
      cloudLayers: { low: 0.38, mid: 0.22, high: 0.16 },
    },
  },
  {
    id: "cloud-breaks",
    label: "Mraky přes Slunce a Měsíc",
    description:
      "DEMO shodné masky kotouče a světla; nízké mraky proudí 35 m/s od západu, povrchový vítr zůstává 3 m/s.",
    values: {
      cloud: 0.5,
      weatherCode: 2,
      cloudLayers: { low: 0.5, mid: 0, high: 0 },
      cloudWinds: {
        low: { speed: 35, direction: 270 },
        mid: { speed: 15, direction: 270 },
        high: { speed: 25, direction: 270 },
      },
    },
  },
  {
    id: "overcast",
    label: "Zataženo",
    description: "Souvislá nízká oblačnost a rozptýlené světlo.",
    values: {
      cloud: 1,
      weatherCode: 3,
      cloudLayers: { low: 1, mid: 0.8, high: 0.3 },
    },
  },
  {
    id: "haze",
    label: "Opar",
    description: "Omezená dohlednost 5 km, bez důkazu mlhy z vlhkosti.",
    values: { cloud: 0.2, visibility: 5000 },
  },
  {
    id: "fog",
    label: "Mlha",
    description: "Dohlednost 400 m; útlum krajiny i oblohy.",
    values: { cloud: 0.75, visibility: 400, humidity: 98, weatherCode: 45 },
  },
  {
    id: "rime-fog",
    label: "Námrazová mlha",
    description:
      "Dohlednost 150 m. Usazování námrazy na povrchy není simulováno.",
    values: {
      temperature: -3,
      cloud: 0.9,
      visibility: 150,
      humidity: 99,
      weatherCode: 48,
    },
  },
  {
    id: "drizzle",
    label: "Mrholení",
    description: "Drobné pomalé kapky, intenzita 0,2 mm/h.",
    values: {
      cloud: 0.9,
      rain: 0.2,
      precipitationType: "rain",
      weatherCode: 51,
      visibility: 6000,
    },
  },
  {
    id: "dense-drizzle",
    label: "Husté mrholení",
    description: "Stejná rodina kapek s intenzitou 0,8 mm/h.",
    values: {
      cloud: 1,
      rain: 0.8,
      precipitationType: "rain",
      weatherCode: 55,
      visibility: 3000,
    },
  },
  {
    id: "rain-light",
    label: "Slabý déšť",
    description: "Řídké dešťové stopy při 1 mm/h.",
    values: {
      cloud: 0.75,
      rain: 1,
      precipitationType: "rain",
      weatherCode: 61,
      visibility: 10000,
    },
  },
  {
    id: "rain",
    label: "Déšť",
    description: "Střední intenzita 4 mm/h.",
    values: {
      cloud: 0.9,
      rain: 4,
      precipitationType: "rain",
      weatherCode: 63,
      visibility: 6000,
    },
  },
  {
    id: "rain-heavy",
    label: "Silný déšť",
    description: "Husté stopy při 12 mm/h a kratší dohlednost.",
    values: {
      cloud: 1,
      rain: 12,
      precipitationType: "rain",
      weatherCode: 65,
      visibility: 2500,
    },
  },
  {
    id: "showers",
    label: "Přeháňky",
    description: "Kapky pod roztrhanými mraky; 8 mm/h.",
    values: {
      cloud: 0.7,
      rain: 8,
      precipitationType: "rain",
      weatherCode: 81,
      visibility: 7000,
      cloudLayers: { low: 0.7, mid: 0.25, high: 0.1 },
    },
  },
  {
    id: "freezing-drizzle",
    label: "Mrznoucí mrholení",
    description: "Kapalné drobné kapky při −2 °C; bez okamžitého ledu na zemi.",
    values: {
      temperature: -2,
      cloud: 0.95,
      rain: 0.3,
      precipitationType: "freezing-rain",
      weatherCode: 56,
      visibility: 4000,
    },
  },
  {
    id: "freezing-rain",
    label: "Mrznoucí déšť",
    description:
      "Kapalné dešťové stopy. Skupenství není odvozeno pouze z teploty.",
    values: {
      temperature: -2,
      cloud: 1,
      rain: 3,
      precipitationType: "freezing-rain",
      weatherCode: 67,
      visibility: 3500,
    },
  },
  {
    id: "snow-light",
    label: "Slabé sněžení",
    description: "Pomalé vločky, 0,3 cm/h; bez sněhové pokrývky.",
    values: {
      temperature: -1,
      cloud: 0.75,
      rain: 0.4,
      snowfall: 0.3,
      precipitationType: "snow",
      weatherCode: 71,
      visibility: 6000,
    },
  },
  {
    id: "snow",
    label: "Sněžení",
    description: "Pomalé vločky unášené větrem, 1 cm/h.",
    values: {
      temperature: -2,
      cloud: 0.9,
      rain: 1.4,
      snowfall: 1,
      precipitationType: "snow",
      weatherCode: 73,
      visibility: 3000,
    },
  },
  {
    id: "snow-heavy",
    label: "Silné sněžení",
    description: "Husté vločky, 3 cm/h a dohlednost 800 m.",
    values: {
      temperature: -3,
      cloud: 1,
      rain: 4.3,
      snowfall: 3,
      precipitationType: "snow",
      weatherCode: 75,
      visibility: 800,
    },
  },
  {
    id: "snow-grains",
    label: "Sněhová zrna",
    description:
      "Jemné pevné srážky; stejná lehká částicová reprezentace jako sníh.",
    values: {
      temperature: -4,
      cloud: 0.95,
      rain: 0.3,
      snowfall: 0.2,
      precipitationType: "snow",
      weatherCode: 77,
      visibility: 4000,
    },
  },
  {
    id: "snow-showers",
    label: "Sněhové přeháňky",
    description: "Vločky pod roztrhanými mraky, 1,5 cm/h.",
    values: {
      temperature: 0,
      cloud: 0.7,
      rain: 2.1,
      snowfall: 1.5,
      precipitationType: "snow",
      weatherCode: 86,
      visibility: 2000,
    },
  },
  {
    id: "mixed",
    label: "Déšť se sněhem",
    description: "Společně padající kapalné stopy a pomalé vločky.",
    values: {
      temperature: 1,
      cloud: 0.95,
      rain: 2,
      snowfall: 0.5,
      liquidPrecipitation: 1.3,
      precipitationType: "mixed",
      visibility: 3000,
    },
  },
  {
    id: "thunderstorm",
    label: "Bouřka",
    description:
      "Tmavé mraky, silné srážky a vítr; blesky bez polohových dat se nevymýšlejí.",
    values: {
      cloud: 1,
      rain: 16,
      wind: 10,
      windGust: 20,
      precipitationType: "rain",
      weatherCode: 95,
      visibility: 2000,
    },
  },
  {
    id: "hail",
    label: "Bouřka s kroupami",
    description:
      "Rychlé krátké ledové částice; nesimulují se nárazy ani nános.",
    values: {
      temperature: 8,
      cloud: 1,
      rain: 10,
      wind: 8,
      precipitationType: "hail",
      weatherCode: 99,
      visibility: 3000,
    },
  },
  {
    id: "wind",
    label: "Silný vítr",
    description: "Západní vítr 15 m/s a oddělené proudění ve výšce.",
    values: {
      cloud: 0.5,
      wind: 15,
      windGust: 24,
      windDirection: 270,
      cloudWinds: {
        low: { speed: 22, direction: 270 },
        mid: { speed: 32, direction: 250 },
        high: { speed: 45, direction: 230 },
      },
    },
  },
  {
    id: "unknown-precipitation",
    label: "Neznámé srážky",
    description:
      "Naměřená intenzita bez známé fáze má orientační dešťový vzhled.",
    values: { cloud: 0.8, rain: 2, precipitationType: "unknown" },
  },
] as const satisfies readonly {
  id: string;
  label: string;
  description: string;
  values: Partial<Weather>;
}[];

export type WeatherScenarioId = (typeof definitions)[number]["id"];
export const WEATHER_SCENARIOS = definitions.map(
  ({ id, label, description }) => ({ id, label, description }),
);
const byId = new Map<WeatherScenarioId, (typeof definitions)[number]>(
  definitions.map((item) => [item.id, item]),
);

export function isWeatherScenarioId(value: string): value is WeatherScenarioId {
  return byId.has(value as WeatherScenarioId);
}

export function createWeatherScenario(
  id: WeatherScenarioId,
  now = Date.now(),
): Weather {
  const scenario = byId.get(id);
  if (!scenario) throw new Error("Neznámý demonstrační scénář počasí.");
  const weather: Weather = {
    temperature: 12,
    wind: 3,
    windDirection: 270,
    rain: 0,
    visibility: 40000,
    precipitationType: "none",
    snowfall: 0,
    ...scenario.values,
    observedAt: null,
    fetchedAt: now,
    stale: true,
    status: "unavailable",
    cloudObservedAt: null,
    cloudStale: true,
    source: "DEMO · " + scenario.label,
    cloudSource: "DEMO · výtvarný scénář oblačnosti",
    cloudWindSource: "DEMO · scénář proudění",
    preview: { id, label: "DEMO · " + scenario.label },
    fieldSources: {},
  };
  // Fresh mutable render values per selection; no shared cache or nested state.
  if (weather.cloudLayers) weather.cloudLayers = { ...weather.cloudLayers };
  if (weather.cloudWinds)
    weather.cloudWinds = {
      low: { ...weather.cloudWinds.low },
      mid: { ...weather.cloudWinds.mid },
      high: { ...weather.cloudWinds.high },
    };
  return weather;
}
