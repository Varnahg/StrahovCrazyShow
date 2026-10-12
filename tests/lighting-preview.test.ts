import test from "node:test";
import assert from "node:assert/strict";
import { getMoonIllumination, getMoonPosition, getPosition } from "suncalc";
import {
  LIGHTING_PREVIEWS,
  isLightingPreviewMode,
  selectLightingPreview,
} from "../client/lighting-preview";
import { STRAHOV_LOCATION } from "../shared/weather";
import { messages } from "../client/i18n-messages";

const { latitude, longitude } = STRAHOV_LOCATION;
const solarAltitude = (at: number) =>
  getPosition(new Date(at), latitude, longitude).altitude;
const day = 86_400_000;
const pragueDate = new Intl.DateTimeFormat("sv-SE", {
  timeZone: "Europe/Prague",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

test("real time remains the default/null and day/night preserve their Prague-date UTC anchors", () => {
  const now = Date.parse("2026-10-12T23:30:00Z");
  assert.deepEqual(selectLightingPreview("real", now), {
    mode: "real",
    instant: null,
  });
  assert.deepEqual(selectLightingPreview("day", now), {
    mode: "day",
    instant: Date.parse("2026-10-13T10:00:00Z"),
  });
  assert.deepEqual(selectLightingPreview("night", now), {
    mode: "night",
    instant: Date.parse("2026-10-13T22:00:00Z"),
  });
  assert.deepEqual(selectLightingPreview("full-moon", Number.NaN), {
    mode: "real",
    instant: null,
  });
  assert.equal(isLightingPreviewMode("toString"), false);
  assert.equal(isLightingPreviewMode("weather"), false);
  for (const mode of Object.keys(LIGHTING_PREVIEWS))
    assert.equal(isLightingPreviewMode(mode), true);
});

test("golden and blue presets solve actual descending solar altitude throughout seasons and Prague DST boundaries", () => {
  for (const date of [
    "2026-01-01",
    "2026-03-29",
    "2026-06-21",
    "2026-09-23",
    "2026-10-25",
    "2026-12-21",
  ]) {
    const now = Date.parse(date + "T00:30:00Z");
    for (const [mode, target] of [
      ["golden-hour", 3],
      ["blue-hour", -6],
    ] as const) {
      const selected = selectLightingPreview(mode, now);
      assert.equal(selected.mode, mode);
      const at = selected.instant!;
      assert.equal(pragueDate.format(at), pragueDate.format(now));
      assert.ok(
        Math.abs(solarAltitude(at) - target) < 0.001,
        date + " " + mode,
      );
      assert.ok(
        solarAltitude(at - 60_000) > target,
        "must be the evening crossing",
      );
      assert.ok(
        solarAltitude(at + 60_000) < target,
        "must be the evening crossing",
      );
    }
    assert.ok(
      selectLightingPreview("golden-hour", now).instant! <
        selectLightingPreview("blue-hour", now).instant!,
    );
  }
});

test("near-next-full Moon previews retain a real lit lunar phase above the dark Prague horizon", () => {
  for (const date of [
    "2026-01-01",
    "2026-03-01",
    "2026-05-15",
    "2026-06-15",
    "2026-08-01",
    "2026-10-12",
    "2026-12-01",
  ]) {
    const now = Date.parse(date + "T12:00:00Z");
    const selected = selectLightingPreview("full-moon", now);
    assert.equal(selected.mode, "full-moon", date);
    const at = selected.instant!;
    assert.ok(at >= now && at < now + 34 * day, date + ": next lunar cycle");
    const moon = getMoonPosition(new Date(at), latitude, longitude);
    const illumination = getMoonIllumination(new Date(at));
    assert.ok(moon.altitude >= 10, date + ": Moon must clear the horizon");
    assert.ok(
      solarAltitude(at) <= -12,
      date + ": avoid daylight full-phase instants",
    );
    assert.ok(
      illumination.fraction >= 0.985,
      date + ": actual near-full phase",
    );
    assert.ok(Math.abs(illumination.phase - 0.5) < 0.04, date);
  }
});

test("preview results are independent of the device timezone and labels stay explicitly simulated in both locales", () => {
  const original = process.env.TZ;
  const at = Date.parse("2026-10-24T23:30:00Z");
  try {
    for (const mode of ["golden-hour", "blue-hour", "full-moon"] as const) {
      process.env.TZ = "Pacific/Honolulu";
      const west = selectLightingPreview(mode, at);
      process.env.TZ = "Asia/Tokyo";
      assert.deepEqual(selectLightingPreview(mode, at), west);
    }
  } finally {
    if (original === undefined) delete process.env.TZ;
    else process.env.TZ = original;
  }
  for (const [mode, label] of Object.entries(LIGHTING_PREVIEWS)) {
    assert.ok(messages[label]);
    if (mode !== "real") {
      assert.ok(label.includes("demo"));
      assert.ok(messages[label].includes("demo"));
    }
  }
});
