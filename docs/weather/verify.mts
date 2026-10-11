import { writeFile } from "node:fs/promises";
import { getWeather } from "../../server/weather";
import {
  moonState,
  sunState,
  windVector,
  STRAHOV_LOCATION,
} from "../../shared/weather";

const measuredAt = Date.now();
const weather = await getWeather();
const report = {
  verifiedAt: new Date(measuredAt).toISOString(),
  location: STRAHOV_LOCATION,
  actualWeatherResponse: weather,
  surfaceDrift: windVector(weather.wind, weather.windDirection),
  modelCloudDrift: weather.cloudWinds
    ? Object.fromEntries(
        Object.entries(weather.cloudWinds).map(([layer, wind]) => [
          layer,
          windVector(wind.speed, wind.direction),
        ]),
      )
    : null,
  astronomySamples: [
    "2026-06-21T11:00:00Z",
    "2026-12-21T11:00:00Z",
    "2026-10-10T15:50:00Z",
    "2026-10-18T16:12:00Z",
    "2026-10-26T04:12:00Z",
  ].map((stamp) => ({
    instant: stamp,
    sun: sunState(Date.parse(stamp)),
    moon: moonState(Date.parse(stamp)),
  })),
  gpuRenderingVerified: false,
  note: "Live upstream/weather-parser smoke check. GPU appearance and FPS require integrated browser verification; cloud geometry is illustrative.",
};
await writeFile(
  new URL("./audit.json", import.meta.url),
  JSON.stringify(report, null, 2) + "\n",
);
console.log(
  JSON.stringify(
    {
      status: weather.status,
      source: weather.source,
      stale: weather.stale,
      observedAt: weather.observedAt,
      cloudSource: weather.cloudSource,
      wind: weather.wind,
      cloudWinds: weather.cloudWinds,
    },
    null,
    2,
  ),
);
