import test from "node:test";
import assert from "node:assert/strict";
import parameters from "../shared/data/tree-phenology.json";
import { getTreeSeasonState, phenologyForTree, TREE_FAMILIES, TREE_SEASON_CACHE_LIMIT, type TreeFamily } from "../shared/tree-season";

const DAY = 86_400_000, MINUTE = 60_000;
const fields = ["leafAmount", "maturity", "senescence", "litterPotential"] as const;
const at = (month: number, day = 15, year = 2026) => Date.UTC(year, month - 1, day, 12);
const group = (month: number, family: TreeFamily = "deciduous-broadleaf") => getTreeSeasonState(at(month)).groups[family];

test("four families preserve leafless/evergreen structure and separate autumn colour from leaf loss", () => {
  for (const family of ["deciduous-broadleaf", "deciduous-conifer"] as const) {
    assert.equal(group(1, family).leafAmount, 0);
    assert.equal(group(7, family).leafAmount, 1);
    assert.equal(group(7, family).maturity, 1);
    assert.equal(group(7, family).senescence, 0);
    const spring = getTreeSeasonState(at(4, 20)).groups[family];
    assert.ok(spring.leafAmount > .1 && spring.leafAmount < 1);
    assert.ok(spring.maturity < 1);
  }
  const earlyAutumn = getTreeSeasonState(at(9, 25)).groups["deciduous-broadleaf"];
  assert.ok(earlyAutumn.senescence > .1 && earlyAutumn.senescence < .5);
  assert.ok(earlyAutumn.leafAmount > .95, "colour change cannot be synonymous with drop");
  const autumn = getTreeSeasonState(at(10, 25));
  assert.ok(autumn.groups["deciduous-broadleaf"].leafAmount < autumn.groups["deciduous-conifer"].leafAmount);
  for (let day = 0; day < 366; day++) {
    const state = getTreeSeasonState(Date.UTC(2028, 0, 1) + day * DAY);
    assert.equal(state.groups["evergreen-conifer"].leafAmount, 1);
    assert.ok(state.groups["evergreen-conifer"].maturity >= .82);
    assert.ok(state.groups["evergreen-conifer"].senescence <= .08);
    assert.deepEqual(state.groups["reference-bare"], { leafAmount: 0, maturity: 0, senescence: 0, litterPotential: 0 });
  }
});

test("the full Gregorian cycle is finite/bounded and has no midnight or year-wrap jump", () => {
  let previous = getTreeSeasonState(Date.UTC(2027, 11, 31, 23));
  for (let hour = 0; hour <= 366 * 24; hour++) {
    const state = getTreeSeasonState(Date.UTC(2028, 0, 1) + hour * 3_600_000);
    for (const family of TREE_FAMILIES) for (const field of fields) {
      const value = state.groups[family][field];
      assert.ok(Number.isFinite(value) && value >= 0 && value <= 1, family + "/" + field);
      assert.ok(Math.abs(value - previous.groups[family][field]) < .01, family + "/" + field + " hourly continuity");
    }
    for (const field of ["flowerBloom", "litterRetention"] as const) {
      assert.ok(state.ground[field] >= 0 && state.ground[field] <= 1);
      assert.ok(Math.abs(state.ground[field] - previous.ground[field]) < .01);
    }
    previous = state;
  }
});

test("leaf flush/drop are monotone in their own windows, with independent retained litter and bloom hooks", () => {
  for (const family of ["deciduous-broadleaf", "deciduous-conifer"] as const) {
    let spring = 0, fall = 1;
    for (let day = 60; day <= 170; day++) {
      const value = getTreeSeasonState(Date.UTC(2026, 0, 1) + day * DAY).groups[family].leafAmount;
      assert.ok(value >= spring); spring = value;
    }
    for (let day = 240; day <= 360; day++) {
      const value = getTreeSeasonState(Date.UTC(2026, 0, 1) + day * DAY).groups[family].leafAmount;
      assert.ok(value <= fall); fall = value;
    }
  }
  const winter = getTreeSeasonState(at(1)), spring = getTreeSeasonState(at(4, 5)), summer = getTreeSeasonState(at(7));
  assert.equal(winter.groups["deciduous-broadleaf"].litterPotential, 1);
  assert.ok(winter.ground.litterRetention > .5);
  assert.equal(summer.groups["deciduous-broadleaf"].litterPotential, 0);
  assert.notEqual(spring.groups["deciduous-broadleaf"].litterPotential, 1 - spring.groups["deciduous-broadleaf"].leafAmount);
  assert.equal(winter.ground.flowerBloom, 0); assert.equal(summer.ground.flowerBloom, 0);
  assert.equal(getTreeSeasonState(at(5)).ground.flowerBloom, 1);
  assert.ok(getTreeSeasonState(at(9)).ground.flowerBloom > 0);
  assert.equal(winter.ground.provenance, "authored-seasonal-model");
});

test("minute samples are immutable/cache-bounded, source-aware and independent of call history", () => {
  const instant = at(4, 20), state = getTreeSeasonState(instant);
  assert.equal(state.sampledAt, instant);
  assert.equal(getTreeSeasonState(instant + MINUTE - 1), state);
  assert.equal(phenologyForTree(state, "deciduous-broadleaf", 0), state.groups["deciduous-broadleaf"]);
  const demo = getTreeSeasonState(instant, "demo");
  assert.notEqual(demo, state); assert.notEqual(demo.revision, state.revision);
  assert.deepEqual(demo.groups, state.groups); assert.equal(demo.source, "demo");
  assert.ok(Object.isFrozen(state) && Object.isFrozen(state.groups) && Object.isFrozen(state.ground));
  assert.throws(() => { (state.groups["deciduous-broadleaf"] as { leafAmount: number }).leafAmount = 4; }, TypeError);
  for (let i = 1; i <= TREE_SEASON_CACHE_LIMIT; i++) getTreeSeasonState(instant + i * MINUTE);
  const rebuilt = getTreeSeasonState(instant);
  assert.notEqual(rebuilt, state, "old minutes are evicted rather than retained forever");
  assert.deepEqual(rebuilt, state);
  assert.deepEqual(phenologyForTree(rebuilt, "deciduous-broadleaf", 23), phenologyForTree(state, "deciduous-broadleaf", 23));
});

test("seed variation is deterministic, bounded in space and uses a finite number of cached offsets", () => {
  const state = getTreeSeasonState(at(4, 20)), values = new Set();
  for (let seed = 0; seed < 2000; seed++) {
    const result = phenologyForTree(state, "deciduous-broadleaf", seed); values.add(result);
    assert.equal(result, phenologyForTree(state, "deciduous-broadleaf", seed));
    const lower = getTreeSeasonState(state.sampledAt - 4 * DAY).groups["deciduous-broadleaf"].leafAmount;
    const upper = getTreeSeasonState(state.sampledAt + 4 * DAY).groups["deciduous-broadleaf"].leafAmount;
    assert.ok(result.leafAmount >= lower - 1e-10 && result.leafAmount <= upper + 1e-10);
  }
  assert.equal(values.size, parameters.art.seedBuckets);
  assert.equal(phenologyForTree(state, "deciduous-broadleaf", -1), phenologyForTree(state, "deciduous-broadleaf", 0xffffffff));
  for (const family of TREE_FAMILIES) {
    const a = phenologyForTree(getTreeSeasonState(Date.UTC(2026, 11, 31, 23, 59)), family, 22);
    const b = phenologyForTree(getTreeSeasonState(Date.UTC(2027, 0, 1)), family, 22);
    for (const field of fields) assert.ok(Math.abs(a[field] - b[field]) < .001);
  }
});

test("UTC/leap-century and Date boundary handling do not depend on device timezone or years0..99 remapping", () => {
  const old = process.env.TZ, instant = Date.parse("2028-02-29T23:59:20Z");
  try {
    process.env.TZ = "Pacific/Honolulu"; const west = getTreeSeasonState(instant);
    for (let i = 1; i <= TREE_SEASON_CACHE_LIMIT; i++) getTreeSeasonState(instant + i * MINUTE);
    process.env.TZ = "Asia/Tokyo"; assert.deepEqual(getTreeSeasonState(instant), west);
  } finally { if (old === undefined) delete process.env.TZ; else process.env.TZ = old; }
  for (const year of [0, 99, 1900, 2000, 2026, 2028, 2100, 2400]) {
    const date = new Date(0); date.setUTCFullYear(year, 0, 1); date.setUTCHours(0, 0, 0, 0);
    const start = getTreeSeasonState(date.getTime());
    assert.equal(start.year, year); assert.equal(start.phaseDay, 0);
    date.setUTCFullYear(year, 2, 1);
    const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
    assert.ok(Math.abs(getTreeSeasonState(date.getTime()).phaseDay - (leap ? 60 * 365 / 366 : 59)) < 1e-10);
  }
  for (const instant of [-8.64e15, -1, 0, 8.64e15]) {
    const state = getTreeSeasonState(instant); assert.ok(state.phaseDay >= 0 && state.phaseDay < 365);
    for (const family of TREE_FAMILIES) for (const value of Object.values(state.groups[family])) assert.ok(Number.isFinite(value));
  }
});

test("invalid input never silently substitutes current weather or current clock", t => {
  t.mock.method(Date, "now", () => { throw Error("clock must not be consulted"); });
  for (const instant of [NaN, Infinity, -Infinity, 8.64e15 + 1, -8.64e15 - 1]) assert.throws(() => getTreeSeasonState(instant), RangeError);
  assert.throws(() => getTreeSeasonState(at(5), "measured-station" as never), RangeError);
  const state = getTreeSeasonState(at(5));
  assert.throws(() => phenologyForTree(state, "oak" as never, 1), RangeError);
  assert.throws(() => phenologyForTree(state, "deciduous-broadleaf", NaN), RangeError);
  assert.throws(() => phenologyForTree({ ...state }, "deciduous-broadleaf", 1), RangeError);
});

test("versioned parameters reproduce equal-weight regional medians and preserve source uncertainty/licence", () => {
  const evidence = parameters.evidence;
  assert.equal(evidence.license, "CC-BY-4.0"); assert.equal(evidence.files.length, 8);
  assert.match(evidence.method, /444 means phase did not occur/);
  assert.match(evidence.method, /No missing-value imputation/);
  assert.equal(evidence.stationMetadata.length, 11);
  for (const file of evidence.files) { assert.match(file.url, /^https:\/\/opendata\.chmi\.cz\//); assert.match(file.sha256, /^[a-f0-9]{64}$/); assert.ok(file.bytes > 1000); }
  for (const [family, anchors] of Object.entries(parameters.anchors)) for (const [phase, value] of Object.entries(anchors)) {
    const summaries = evidence.summaries.filter(s => s.phase === phase &&
      (family === "deciduous-conifer" ? s.species === "Modrin_opadavy" : s.species !== "Modrin_opadavy"));
    const values = summaries.map(s => s.medianPhase).sort((a, b) => a - b);
    const expected = Math.round((values[Math.floor((values.length - 1) / 2)] + values[Math.ceil((values.length - 1) / 2)]) / 2 * 10) / 10;
    assert.equal(value, expected);
    for (const summary of summaries) {
      assert.equal(summary.records, summary.valid + summary.nonOccurrence444 + summary.otherMissing);
      assert.ok(summary.minPhase >= 0 && summary.maxPhase < 365 && summary.valid > 0);
    }
  }
});
