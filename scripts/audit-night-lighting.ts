import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { sunState, moonState, STRAHOV_LOCATION } from "../shared/weather";
import { sampleArtLighting } from "../client/art-lighting";
import { campusEnvironmentIntensity } from "../client/cinematic";
import { campusExposure } from "../client/cinematic-art";
import { LAMP_PLACEMENTS, PHOTO_LAMPS } from "../shared/streets";

const files = [
  "shared/weather.ts",
  "client/art-lighting.ts",
  "client/sky-weather.ts",
  "client/cinematic.ts",
  "client/cinematic-art.ts",
  "client/render-shaders.ts",
  "tests/night-lighting.test.ts",
  "tests/photo-lamps.test.ts",
  "docs/reality-pack/art-style-preview.ts",
  "docs/reality-pack/art-style-preview.html",
  "scripts/audit-night-lighting.ts",
  "shared/streets.ts",
  "shared/data/photo-lamps.json",
  "client/streets-renderer.ts",
  "assets/reference/lighting/central-parking-ortho-2024.jpg",
  "assets/reference/lighting/central-parking-ortho-2024.json",
];
const sources = Object.fromEntries(
  await Promise.all(
    files.map(async (path) => [
      path,
      createHash("sha256")
        .update(await readFile(path))
        .digest("hex"),
    ]),
  ),
);
const samples = ["2026-10-11T00:00:00Z", "2026-10-11T10:00:00Z"].flatMap(
  (utc) => {
    const instant = Date.parse(utc),
      sun = sunState(instant),
      moon = moonState(instant);
    return [0, 1].map((cloud) => {
      const lighting = sampleArtLighting(
        sun.altitude,
        cloud,
        0,
        moon.altitude,
        moon.fraction,
      );
      return {
        utc,
        prague: new Intl.DateTimeFormat("en-GB", {
          timeZone: "Europe/Prague",
          dateStyle: "short",
          timeStyle: "short",
        }).format(instant),
        cloud,
        sun: {
          altitudeDegrees: (sun.altitude * 180) / Math.PI,
          daylight: sun.daylight,
        },
        moon: {
          altitudeDegrees: (moon.altitude * 180) / Math.PI,
          fraction: moon.fraction,
        },
        lighting: {
          sunlight: lighting.sunlight,
          moonlight: lighting.moonlight,
          ambientIntensity: lighting.ambientIntensity,
          cloudEmission: lighting.cloudEmission,
          surfaceIllumination: lighting.surfaceIllumination,
          skyTopDisplayRgb: lighting.top.asArray(),
          skyHorizonDisplayRgb: lighting.horizon.asArray(),
          exposure: campusExposure(sun.daylight),
          environmentIntensity: campusEnvironmentIntensity(sun.daylight),
        },
      };
    });
  },
);
const report = {
  capturedAt: new Date().toISOString(),
  location: STRAHOV_LOCATION,
  scope:
    "deterministic astronomy and lighting-state audit, not GPU/FPS measurement",
  units:
    "altitudes degrees; lighting, exposure and emissions are bounded art units, not calibrated lux or lumens",
  simulation:
    "Room occupancy/emissive windows and local practical lighting are simulated; no real room-use information.",
  references: [
    {
      title:
        "SunCalc 2.1.1: altitude in degrees and azimuth clockwise from north",
      url: "https://github.com/mourner/suncalc#sun-position",
    },
    {
      title: "USNO: new moon 2026-10-10 15:50 UTC",
      url: "https://aa.usno.navy.mil/calculated/moon/phases?date=2026-10-01&format=p&nump=6",
    },
    {
      title: "NOAA: astronomical twilight at -18 degrees",
      url: "https://gml.noaa.gov/grad/solcalc/glossary.html",
    },
    {
      title: "Babylon PBR: direct/environment/emissive contributions",
      url: "https://doc.babylonjs.com/features/featuresDeepDive/materials/using/masterPBR/",
    },
  ],
  sourceSha256: sources,
  practicalLights: {
    mappedOsmCount: LAMP_PLACEMENTS.filter(
      (lamp) => lamp.provenance === "mapped-osm-node",
    ).length,
    interpretedPhotoCount: PHOTO_LAMPS.placements.length,
    simultaneousLightBudget: { low: 1, medium: 2, high: 2 },
    falloff:
      "Babylon Light.FALLOFF_STANDARD; bounded artistic range22m, not measured lumens",
    photoPlacements: PHOTO_LAMPS.placements,
    spawn: { x: 110, z: 12 },
    closestToSpawn: LAMP_PLACEMENTS.map((lamp) => ({
      id: lamp.id,
      x: lamp.x,
      z: lamp.z,
      range: lamp.lightRangeMetres,
      horizontalDistance: Math.hypot(lamp.x - 110, lamp.z - 12),
    }))
      .sort((a, b) => a.horizontalDistance - b.horizontalDistance)
      .slice(0, 3),
  },
  samples,
};
await mkdir("docs/weather", { recursive: true });
await writeFile(
  "docs/weather/night-lighting-audit.json",
  JSON.stringify(report, null, 2) + "\n",
);
console.log(
  JSON.stringify(
    {
      output: "docs/weather/night-lighting-audit.json",
      samples: report.samples,
    },
    null,
    2,
  ),
);
