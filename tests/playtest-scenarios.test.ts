import test from "node:test";
import assert from "node:assert/strict";
import {
  PLAYTEST_STATIONS, PLAYTEST_LIGHTING_MODES, PLAYTEST_CAPTURE_PHASES,
  PLAYTEST_SCENARIO_VERSION, createPlaytestMatrix, playtestStationReached,
} from "../shared/playtest-scenarios";
import { B6_LAYOUT } from "../shared/b6-interior";
import { b6StairRoute } from "../shared/b6-stairs";
import { COMMON_DORM_ENTRANCES } from "../shared/landmark-reality";
import { PLACES, SPAWN } from "../shared/world";
import { isPlaytestId } from "../shared/playtest-diary";

test("ten stations retain the existing source approaches and exclude invented interiors", () => {
  assert.equal(PLAYTEST_STATIONS.length, 10);
  assert.equal(new Set(PLAYTEST_STATIONS.map((station) => station.id)).size, 10);
  const at = (id: string) => PLAYTEST_STATIONS.find((station) => station.id === id)!;
  assert.deepEqual(at("spawn-parking").target, { x: SPAWN.x, z: SPAWN.z });
  for (const code of ["a", "b"]) {
    const place = PLACES.find((place) => place.id === "stadium191" + code)!;
    assert.deepEqual(at("stadium-191-" + code).target, { x: place.x, z: place.z });
  }
  assert.deepEqual(at("b6-entry").target, { x: B6_LAYOUT.approachRoute[0][0], z: B6_LAYOUT.approachRoute[0][1] });
  for (const [side, core] of [["north", "north-reception"], ["south", "south-service"]]) {
    const [x, z] = b6StairRoute(core)[0];
    assert.deepEqual(at(`b6-${side}-landing`).target, { x, z });
    assert.equal(at(`b6-${side}-landing`).heightBand?.min, B6_LAYOUT.foundationOffset + 3.3);
  }
  const b4 = COMMON_DORM_ENTRANCES.find((entry) => entry.block === 4)!;
  assert.deepEqual(at("b4-approach").target, { x: b4.x + b4.nx * 4.8, z: b4.z + b4.nz * 4.8 });
  for (const station of PLAYTEST_STATIONS) {
    assert.ok(station.source && station.provenance && station.checks.length);
    assert.ok(!station.id.includes("stadium-interior"));
  }
});

test("pilot and full coverage implement the accepted bounded matrix", () => {
  const pilot = createPlaytestMatrix("pilot"), full = createPlaytestMatrix("full");
  assert.equal(pilot.length, 20);
  assert.equal(full.length, 120);
  assert.equal(new Set(full.map((trial) => trial.id)).size, full.length);
  assert.deepEqual(new Set(full.map((trial) => trial.lightingMode)), new Set(PLAYTEST_LIGHTING_MODES));
  assert.deepEqual(PLAYTEST_CAPTURE_PHASES, ["off-before", "on", "off-after"]);
  assert.ok(pilot.every((trial) => ["day", "night"].includes(trial.lightingMode) && trial.view === "third" && trial.qualityMode === "medium"));
  assert.equal(full.filter((trial) => trial.view === "first").length, 24);
  assert.equal(full.filter((trial) => trial.qualityMode !== "medium").length, 36);
  assert.ok(full.every((trial) => trial.qualityMode !== "auto" && trial.traversal === "normal-input" && isPlaytestId(trial.id) && trial.scenarioVersion === PLAYTEST_SCENARIO_VERSION));
});

test("station arrival requires the correct B6 height and finite measured coordinates", () => {
  const landing = PLAYTEST_STATIONS.find((station) => station.id === "b6-north-landing")!;
  assert.equal(playtestStationReached(landing.id, { ...landing.target, y: B6_LAYOUT.foundationOffset + 0.82 }), false);
  assert.equal(playtestStationReached(landing.id, { ...landing.target, y: B6_LAYOUT.foundationOffset + 3.82 }), true);
  assert.equal(playtestStationReached(landing.id, { ...landing.target, y: NaN }), false);
  assert.equal(playtestStationReached("missing", { x: 0, y: 0, z: 0 }), false);
});
