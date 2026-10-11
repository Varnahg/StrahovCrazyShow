import { test } from "node:test";
import assert from "node:assert/strict";
import { MAP } from "../shared/world";
import { createFixedCampusPropProbe } from "./helpers/transit-route-audit";
import {
  TRANSIT_FEED,
  TRANSIT_NAVIGATION,
  parseGtfsTime,
  pragueDate,
  serviceDayEpoch,
  serviceRuns,
  shiftServiceDate,
  sampleTrip,
  sampleTransit,
  passengerCount,
  sampleWalkingPath,
  passengerWalkingRoute,
  transitStatus,
} from "../shared/transit";

test("GTFS weekdays, bounded dates and additions/removals respect actual service dates", () => {
  const f = {
    calendar: {
      weekday: {
        start: "20261001",
        end: "20261031",
        week: [1, 1, 1, 1, 1, 0, 0],
      },
    },
    exceptions: [
      { service: "weekday", date: "20261012", type: 2 },
      { service: "weekday", date: "20261010", type: 1 },
    ],
  };
  assert.equal(serviceRuns(f, "weekday", "20261009"), true);
  assert.equal(serviceRuns(f, "weekday", "20261011"), false);
  assert.equal(serviceRuns(f, "weekday", "20261012"), false);
  assert.equal(serviceRuns(f, "weekday", "20261010"), true);
  assert.equal(serviceRuns(f, "weekday", "20260930"), false);
  assert.equal(serviceRuns(f, "missing", "20261010"), false);
});
test("GTFS clock uses Prague service noon minus 12 h across both DST boundaries and 24+ times", () => {
  assert.equal(
    new Date(serviceDayEpoch("20260329")).toISOString(),
    "2026-03-28T22:00:00.000Z",
  );
  assert.equal(
    new Date(serviceDayEpoch("20261025")).toISOString(),
    "2026-10-24T23:00:00.000Z",
  );
  assert.equal(parseGtfsTime("25:35:00"), 92100);
  assert.equal(
    new Date(
      serviceDayEpoch("20261010") + parseGtfsTime("25:35:00") * 1000,
    ).toISOString(),
    "2026-10-10T23:35:00.000Z",
  );
  assert.equal(pragueDate(Date.parse("2026-10-10T23:35:00Z")), "20261011");
  assert.equal(shiftServiceDate("20260329", -1), "20260328");
  assert.throws(() => parseGtfsTime("23:72:00"));
});
test("actual PID feed identifies both requested lines, directions and distinct stop positions", () => {
  for (const route of ["143", "149"]) {
    const trips = TRANSIT_FEED.trips.filter((t) => t.route === route);
    assert.ok(trips.length > 10);
    assert.deepEqual(
      [...new Set(trips.map((t) => t.direction))].sort(),
      [0, 1],
    );
    for (const trip of trips)
      assert.ok(TRANSIT_FEED.shapes[trip.shape].length > 3);
  }
  for (const direction of [0, 1]) {
    const trip = TRANSIT_FEED.trips.find(
      (t) => t.route === "143" && t.direction === direction,
    )!;
    const stop = trip.stops.find(
      (s) => TRANSIT_FEED.stops[s[0]].name === "Koleje Strahov",
    )!;
    const bus = sampleTrip(trip, stop[1])!;
    assert.ok(bus.doorsOpen);
    assert.equal(bus.stopId, stop[0]);
    assert.ok(
      direction === 0 ? Math.cos(bus.yaw) > 0.8 : Math.cos(bus.yaw) < -0.8,
    );
    assert.ok(
      Math.hypot(
        bus.position.x - TRANSIT_FEED.stops[stop[0]].x,
        bus.position.z - TRANSIT_FEED.stops[stop[0]].z,
      ) > 1,
      "vehicle must follow shape, not jump laterally to stop pole",
    );
  }
});
function inside(p: number[], poly: number[][]) {
  let hit = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i],
      b = poly[j];
    if (
      a[1] > p[1] !== b[1] > p[1] &&
      p[0] < ((b[0] - a[0]) * (p[1] - a[1])) / (b[1] - a[1]) + a[0]
    )
      hit = !hit;
  }
  return hit;
}
test("all baked passenger paths stay outside every OSM building, ending at their own threshold", () => {
  assert.ok(TRANSIT_NAVIGATION.journeys.length >= 12);
  for (const journey of TRANSIT_NAVIGATION.journeys) {
    const dest = TRANSIT_NAVIGATION.destinations.find(
      (d) => d.buildingId === journey.buildingId,
    )!;
    assert.deepEqual(
      journey.points.at(-1),
      dest.threshold.map((x) => Math.round(x * 1000) / 1000),
    );
    for (let distance = 0; distance < journey.length; distance += 0.8) {
      const p = sampleWalkingPath(
        journey.points as [number, number][],
        distance,
      ).position;
      assert.equal(
        MAP.buildings.some((b) => inside([p.x, p.z], b.points)),
        false,
        `${journey.stopId}/${dest.name} crosses a building at ${p.x},${p.z}`,
      );
    }
    const end = sampleWalkingPath(
      journey.points as [number, number][],
      journey.length + 1,
    );
    assert.equal(end.atEntrance, true);
  }
});
test("all bus shape segments avoid building footprints rather than cutting directly between stops", () => {
  for (const shape of Object.values(TRANSIT_FEED.shapes))
    for (let i = 1; i < shape.length; i++) {
      const a = shape[i - 1],
        b = shape[i],
        n = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]));
      for (let j = 0; j <= n; j++)
        assert.equal(
          MAP.buildings.some((building) =>
            inside(
              [a[0] + ((b[0] - a[0]) * j) / n, a[1] + ((b[1] - a[1]) * j) / n],
              building.points,
            ),
          ),
          false,
        );
    }
});
test("passenger door connectors start beside the bus and avoid actual current campus colliders", async () => {
  const props = await createFixedCampusPropProbe();
  try {
    const shapes = new Set<string>();
    for (const trip of TRANSIT_FEED.trips) {
      if (shapes.has(trip.shape)) continue;
      shapes.add(trip.shape);
      for (const stop of trip.stops)
        for (const journey of TRANSIT_NAVIGATION.journeys.filter(
          (j) => j.stopId === stop[0],
        )) {
          const route = passengerWalkingRoute(trip, stop, journey),
            bus = sampleTrip(trip, stop[1])!;
          assert.ok(
            Math.hypot(
              route.points[0][0] - bus.position.x,
              route.points[0][1] - bus.position.z,
            ) < 5.1,
          );
          for (let d = 0; d < route.length; d += 0.5) {
            const { position: p } = sampleWalkingPath(route.points, d);
            assert.equal(
              MAP.buildings.some((b) => inside([p.x, p.z], b.points)),
              false,
            );
            assert.equal(
              props.obstruction(p),
              undefined,
              `actual fixed object blocks bus-door route at ${p.x},${p.z}`,
            );
          }
        }
    }
  } finally {
    props.dispose();
  }
});
test("fictional passengers are repeatable, vary across arrivals and finish before removal", () => {
  const values = new Set<number>();
  let checked = false;
  for (const trip of TRANSIT_FEED.trips.filter((t) =>
    serviceRuns(TRANSIT_FEED, t.service, TRANSIT_FEED.start),
  )) {
    const stop = trip.stops.find((s) => s[0] === "U981Z1P");
    if (!stop) continue;
    const count = passengerCount(trip.id, TRANSIT_FEED.start, stop[0], stop[1]);
    values.add(count);
    assert.ok(count >= 0 && count <= 10);
    if (count && !checked) {
      const time = serviceDayEpoch(TRANSIT_FEED.start) + stop[1] * 1000 + 15000;
      const a = sampleTransit(time),
        b = sampleTransit(time);
      assert.deepEqual(a, b);
      assert.ok(a.passengers.some((p) => p.tripId === trip.id));
      const late = sampleTransit(time + 650000);
      assert.equal(
        late.passengers.some((p) => p.tripId === trip.id),
        false,
      );
      checked = true;
    }
  }
  assert.ok(values.size > 3);
  assert.ok(checked);
});
test("expired feed never silently repeats a typical timetable", () => {
  const now =
    serviceDayEpoch(shiftServiceDate(TRANSIT_FEED.end, 3)) + 12 * 3600000;
  assert.equal(transitStatus(now).state, "expired");
  const frame = sampleTransit(now);
  assert.equal(frame.buses.length, 0);
  assert.equal(frame.passengers.length, 0);
});
