import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import {
  ROAD_CALIBRATION,
  CALIBRATED_ROAD_FEATURES,
  STREETS,
  STREET_FEATURES,
  streetSurfaceAt,
  nearestStreet,
  isCalibratedRoadFootprint,
  B6_ENTRY_PAVING,
} from "../shared/streets";
import generated from "../shared/data/streets.json";

test("Vanickova photo correction retains raw OSM widths and independently attributed IPR geometry", () => {
  assert.equal(
    STREETS.sourceSha256,
    "7ff214452c91162fffc77809bd7c07f9511e694d2a7b48bc316d7b5865cedb62",
  );
  const original = STREET_FEATURES.find(
    (feature) => feature.id === "124071290",
  )!;
  assert.equal(original.width, 7);
  assert.equal(original.widthProvenance, "class-inferred-not-measured");
  const rawOsmFeatures=generated.features.filter(feature=>!feature.interpretationId);
  assert.equal(rawOsmFeatures.length,380,"the original downloaded OSM baseline stays intact");
  assert.deepEqual(STREET_FEATURES.filter(feature=>!feature.interpretationId&&feature.id!==B6_ENTRY_PAVING.id),rawOsmFeatures);
  assert.equal(STREET_FEATURES.length,generated.features.length+1);
  const connector=STREET_FEATURES.filter(feature=>feature.id===B6_ENTRY_PAVING.id);
  assert.equal(connector.length,1,"the separately attributed B6 approach occurs once");
  assert.equal(connector[0].kind,"footway");
  assert.deepEqual(connector[0].points,B6_ENTRY_PAVING.points);
  assert.deepEqual(connector[0].nodeIds,[],"photo-interpreted paving must not invent OSM node identities");
  assert.equal(connector[0].sourceOsmWayId,"25920440");
  assert.equal(connector[0].source,B6_ENTRY_PAVING.sourcePhotoUrl);
  assert.equal(connector[0].tags["source:geometry"],"photo-informed-native-entry-adaptation-not-surveyed");
  assert.equal(B6_ENTRY_PAVING.measured,false);
  assert.equal(CALIBRATED_ROAD_FEATURES.length, 14);
  assert.deepEqual(CALIBRATED_ROAD_FEATURES, ROAD_CALIBRATION.features);
  for (const feature of CALIBRATED_ROAD_FEATURES) {
    assert.equal(feature.sourceOsmWayId, "124071290");
    assert.equal(feature.kind, "road");
    assert.deepEqual(feature.nodeIds, []);
    assert.equal(
      feature.widthProvenance,
      "ipr-2024-photo-cross-section-interpreted-not-measured",
    );
    assert(feature.width >= 7.46 && feature.width <= 12.53);
    assert.match(feature.source, /^https:\/\/gs-pub\.praha\.eu\//);
  }
  assert.equal(
    ROAD_CALIBRATION.classification,
    "photo-interpreted-not-surveyed",
  );
  assert.equal(ROAD_CALIBRATION.estimatedBoundaryUncertaintyMetres, 0.3);
  assert.equal(ROAD_CALIBRATION.sources.length, 2);
  for (const source of ROAD_CALIBRATION.sources) {
    assert.equal(source.provider, "IPR Praha");
    assert.equal(source.captureDate, "2024-06-08");
    assert.match(source.sha256, /^[a-f0-9]{64}$/);
  }
  const digest = createHash("sha256")
    .update(
      readFileSync(
        new URL("../shared/data/road-calibration.json", import.meta.url),
      ),
    )
    .digest("hex");
  assert.equal(generated.roadCalibration.sha256, digest);
  assert.equal(generated.roadCalibration.rawOsmAndPidPreserved, true);
  assert.equal(generated.roadCalibration.license, "CC-BY-4.0");
});

test("both photographed sections use their actual footprint and local width, with no global road dilation", () => {
  const witnesses = [
    [-196.482, 233.995],
    [-166.629, 231.7016],
    [-135.0624, 221.3264],
  ];
  for (const [x, z] of witnesses) {
    assert(isCalibratedRoadFootprint(x, z));
    assert.equal(streetSurfaceAt(x, z), "asphalt");
    const road = nearestStreet(x, z, true)!;
    assert(road.feature.interpretationId);
    assert(road.distance < road.feature.width / 2 + 0.5);
  }
  assert.equal(isCalibratedRoadFootprint(-166.629, 217.7016), false);
  assert.equal(isCalibratedRoadFootprint(0, 0), false);
  const jezdecka = STREET_FEATURES.find(
    (feature) => feature.tags.name === "Jezdecká",
  )!;
  assert.equal(jezdecka.width, 9);
  assert.equal(
    jezdecka.widthProvenance,
    "osm-width-tag-not-independently-surveyed",
  );
});
