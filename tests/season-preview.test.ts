import test from "node:test";
import assert from "node:assert/strict";
import { getMoonIllumination, getPosition } from "suncalc";
import { SEASON_PREVIEWS, selectSeasonPreview, isSeasonPreviewMode } from "../client/season-preview";
import { selectLightingPreview, type LightingPreviewMode } from "../client/lighting-preview";
import { getTreeSeasonState } from "../shared/tree-season";
import { STRAHOV_LOCATION } from "../shared/weather";

const now = Date.parse("2026-10-25T09:23:14.123Z"), real = { mode: "real" as const, instant: null };
test("real date preserves selected lighting, and every fixed instant remains explicitly DEMO", () => {
  const live = selectSeasonPreview("real", real, now);
  assert.equal(live.instant, null); assert.equal(live.source, "regional-model"); assert.equal(live.lighting, real);
  const moon = selectLightingPreview("full-moon", now), preview = selectSeasonPreview("real", moon, now);
  assert.equal(preview.instant, moon.instant); assert.equal(preview.lighting, moon); assert.equal(preview.source, "demo");
  for (const [mode, label] of Object.entries(SEASON_PREVIEWS)) {
    assert.equal(isSeasonPreviewMode(mode), true);
    if (mode !== "real") assert.match(label, /DEMO/);
  }
  for (const invalid of ["toString", "constructor", "snow", "__proto__"]) assert.equal(isSeasonPreviewMode(invalid), false);
});

test("season date keeps UTC time of day and cannot overflow on day31 or leap day", () => {
  for (const input of [now, Date.parse("2028-02-29T23:30:45.678Z"), Date.parse("2026-12-31T23:59:59.999Z")]) {
    for (const [mode, month, day] of [["spring", 3, 20], ["summer", 6, 15], ["autumn", 9, 20], ["winter", 0, 15]] as const) {
      const selected = selectSeasonPreview(mode, real, input), date = new Date(selected.instant!), original = new Date(input);
      assert.equal(date.getUTCFullYear(), original.getUTCFullYear()); assert.equal(date.getUTCMonth(), month); assert.equal(date.getUTCDate(), day);
      assert.equal(date.toISOString().slice(11), original.toISOString().slice(11));
      assert.equal(selected.source, "demo"); assert.equal(selected.lighting, real);
      assert.equal(getTreeSeasonState(selected.instant!, selected.source).source, "demo");
    }
  }
});

test("lighting is solved AFTER the seasonal date and the exact returned instant drives astronomy and phenology", () => {
  for (const season of ["spring", "summer", "autumn", "winter"] as const) {
    const anchor = selectSeasonPreview(season, real, now).instant!;
    for (const lighting of ["day", "night", "golden-hour", "blue-hour", "full-moon"] as LightingPreviewMode[]) {
      const previous = selectLightingPreview(lighting, now), selected = selectSeasonPreview(season, previous, now);
      const expected = selectLightingPreview(lighting, anchor);
      assert.deepEqual(selected.lighting, expected); assert.equal(selected.instant, expected.instant ?? anchor);
      assert.equal(selected.source, "demo");
      const state = getTreeSeasonState(selected.instant!, selected.source);
      assert.ok(selected.instant! - state.sampledAt >= 0 && selected.instant! - state.sampledAt < 60000);
      if (lighting === "full-moon") assert.ok(getMoonIllumination(new Date(selected.instant!)).fraction >= .985);
      if (lighting === "golden-hour" || lighting === "blue-hour") {
        const altitude = getPosition(new Date(selected.instant!), STRAHOV_LOCATION.latitude, STRAHOV_LOCATION.longitude).altitude;
        assert.ok(Math.abs(altitude - (lighting === "golden-hour" ? 3 : -6)) < .001);
      }
    }
  }
});

test("preview selection is timezone-independent and invalid inputs safely return live time", () => {
  const old = process.env.TZ;
  try {
    process.env.TZ = "Pacific/Honolulu";
    const selected = selectSeasonPreview("summer", selectLightingPreview("golden-hour", now), now);
    process.env.TZ = "Asia/Tokyo";
    assert.deepEqual(selectSeasonPreview("summer", selectLightingPreview("golden-hour", now), now), selected);
  } finally { if (old === undefined) delete process.env.TZ; else process.env.TZ = old; }
  for (const instant of [NaN, Infinity, 8.64e15 + 1]) assert.deepEqual(selectSeasonPreview("spring", real, instant),
    { mode: "real", instant: null, source: "regional-model", lighting: real });
  assert.equal(selectSeasonPreview("bad" as never, real, now).instant, null);
  assert.equal(selectSeasonPreview("spring", { mode: "night", instant: NaN }, now).instant, null);
  assert.equal(selectSeasonPreview("spring", { mode: "night", instant: null }, now).instant, null);
  assert.equal(selectSeasonPreview("spring", { mode: "real", instant: now }, now).instant, null);
  const day = selectLightingPreview("day", now);
  for (const input of [-8.64e15, 8.64e15, Date.parse("0099-01-01T00:00:00Z")])
    assert.equal(selectSeasonPreview("spring", day, input).instant, null, "unsupported lighting calendar must not change the year silently");
});

test("season round trips compose from the retained base lighting selection without losing its real date", () => {
  const base = Object.freeze(selectLightingPreview("day", now));
  const autumn = selectSeasonPreview("autumn", base, now), summer = selectSeasonPreview("summer", base, now);
  assert.notEqual(autumn.instant, base.instant); assert.notEqual(summer.instant, base.instant);
  assert.equal(base.instant, Date.parse("2026-10-25T10:00:00Z"));
  const restored = selectSeasonPreview("real", base, now);
  assert.equal(restored.instant, base.instant); assert.equal(restored.lighting, base); assert.equal(restored.source, "demo");
});
