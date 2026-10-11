import test from "node:test";
import assert from "node:assert/strict";
import { TRANSIT_FEED, TRANSIT_NAVIGATION } from "../shared/transit";
import { STREET_FEATURES } from "../shared/streets";
import {
  auditNorthPassengerNavigation,
  northEntries,
  walkNorthEntranceApproaches,
  type NavigationAuditInput,
} from "./helpers/transit-route-audit";

test("passenger paths include every actual north-facing B2–10 destination and avoid source buildings and current fixed props", async () => {
  assert.equal(TRANSIT_NAVIGATION.schemaVersion, 2);
  assert.equal(TRANSIT_NAVIGATION.destinations.length, 9);
  assert.equal(TRANSIT_NAVIGATION.journeys.length, 18);
  for (const entry of northEntries())
    assert.deepEqual(
      TRANSIT_NAVIGATION.journeys
        .filter((j) => j.buildingId === entry.buildingId)
        .map((j) => j.stopId)
        .sort(),
      ["U981Z1P", "U981Z2P"],
    );
  for (const journey of (TRANSIT_NAVIGATION as NavigationAuditInput).journeys) {
    const stop = TRANSIT_FEED.stops[journey.stopId];
    assert(stop && stop.name === "Koleje Strahov");
    assert.deepEqual(journey.points[0], [stop.x, stop.z]);
    assert(
      Number.isFinite(journey.startConnector) && journey.startConnector! <= 10,
    );
    assert(
      Number.isFinite(journey.endConnector) && journey.endConnector! <= 10,
    );
    assert(journey.sourceWayIds && journey.sourceWayIds.length > 0);
    for (const id of journey.sourceWayIds) {
      const feature = STREET_FEATURES.find((f) => f.id === id);
      assert(feature, `Unknown passenger way ${id}`);
      assert.notEqual(feature.kind, "road");
    }
  }
  const result = await auditNorthPassengerNavigation(TRANSIT_NAVIGATION);
  assert.deepEqual(result.issues, []);
  assert(result.samples > 12000);
  console.log("North passenger route audit", result);
});

test("all nine north-facing passenger approaches climb actual shared stair colliders continuously and match NPC tread heights", async () => {
  const results = await walkNorthEntranceApproaches(TRANSIT_NAVIGATION);
  assert.equal(results.length, 9);
  console.log("North entrance KCC walks", results);
});
