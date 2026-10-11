// Independent runtime-predicate audit; first generate the candidate with the
// sibling Python script. This never writes shared/ or changes source features.
import assert from "node:assert/strict";
import fs from "node:fs";
import crypto from "node:crypto";
import transit from "../shared/data/transit.json";
import {
  STREETS,
  STREET_FEATURES,
  streetPolygonContains,
  streetSurfaceAt,
  nearestStreet,
  CALIBRATED_ROAD_FEATURES,
  isCalibratedRoadFootprint,
  type StreetFeature,
  type StreetPolygon,
} from "../shared/streets";
const integrated = process.argv.includes("--integrated");
const candidate = integrated
  ? { features: [], additions: [] }
  : JSON.parse(
      fs.readFileSync(".cache/vanickova-calibration-candidate.json", "utf8"),
    );
let checked = 0,
  beforeOff = 0,
  afterOff = 0,
  beforeCorridor = 0,
  afterCorridor = 0,
  calibratedSamples = 0;
const features = candidate.features as StreetFeature[];
const failures: unknown[] = [];
for (const [shapeId, shape] of Object.entries(transit.shapes))
  for (let i = 1; i < shape.length; i++) {
    const a = shape[i - 1],
      b = shape[i];
    for (let t = 0; t <= 1; t += 0.1) {
      const x = a[0] + (b[0] - a[0]) * t,
        z = a[1] + (b[1] - a[1]) * t;
      if (
        x < STREETS.bounds.minX + 3 ||
        x > STREETS.bounds.maxX - 3 ||
        z < STREETS.bounds.minZ + 3 ||
        z > STREETS.bounds.maxZ - 3
      )
        continue;
      checked++;
      if (isCalibratedRoadFootprint(x, z)) calibratedSamples++;
      const old = streetSurfaceAt(x, z),
        newMaterial =
          old ??
          ((candidate.additions as StreetPolygon[]).some((p) =>
            streetPolygonContains(p, x, z),
          )
            ? "asphalt"
            : undefined);
      if (old !== "asphalt") beforeOff++;
      if (newMaterial !== "asphalt") {
        afterOff++;
        failures.push({ shapeId, x, z, issue: "material", newMaterial });
      }
      const nearest = nearestStreet(x, z, true)!;
      if (nearest.distance >= nearest.feature.width / 2 + 0.5) beforeCorridor++;
      let selected = {
        distance: nearest.distance,
        width: nearest.feature.width,
      };
      for (const feature of features)
        for (let j = 1; j < feature.points.length; j++) {
          const p = feature.points[j - 1],
            q = feature.points[j],
            dx = q[0] - p[0],
            dz = q[1] - p[1],
            length2 = dx * dx + dz * dz;
          const u = Math.max(
            0,
            Math.min(1, ((x - p[0]) * dx + (z - p[1]) * dz) / length2),
          );
          const distance = Math.hypot(x - p[0] - u * dx, z - p[1] - u * dz);
          if (distance < selected.distance)
            selected = { distance, width: feature.width };
        }
      if (selected.distance >= selected.width / 2 + 0.5) {
        afterCorridor++;
        failures.push({ shapeId, x, z, issue: "corridor", ...selected });
      }
    }
  }
const report = {
  checked,
  beforeOff,
  afterOff,
  beforeCorridor,
  afterCorridor,
  calibratedSamples,
  originalFeatures: STREET_FEATURES.filter(
    (feature) => !feature.interpretationId,
  ).length,
  interpretedFeatures: integrated
    ? CALIBRATED_ROAD_FEATURES.length
    : features.length,
  calibrationSha256: crypto
    .createHash("sha256")
    .update(fs.readFileSync("shared/data/road-calibration.json"))
    .digest("hex"),
  stagingSha256: integrated
    ? undefined
    : crypto
        .createHash("sha256")
        .update(fs.readFileSync(".cache/vanickova-calibration-candidate.json"))
        .digest("hex"),
  originalStreetsSha256: crypto
    .createHash("sha256")
    .update(fs.readFileSync("shared/data/streets.json"))
    .digest("hex"),
  assertions: integrated
    ? "Integrated production streetSurfaceAt/nearestStreet; original 0.1 PID sampling and campus clip; no candidate overlay in this audit."
    : "Original production streetSurfaceAt/streetPolygonContains/nearestStreet, unmodified 0.1 PID sampling and campus clip; candidate applied only in this process.",
  failures,
};
fs.writeFileSync(
  integrated
    ? "docs/reality-pack/roads/vanickova-integrated-audit.json"
    : "docs/reality-pack/roads/vanickova-typescript-audit.json",
  JSON.stringify(report, null, 2) + "\n",
);
console.log(report);
assert.equal(checked, 803);
assert.equal(afterOff, 0);
assert.equal(afterCorridor, 0);
