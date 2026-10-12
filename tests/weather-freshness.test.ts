import test from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ageClientWeather } from "../client/weather-freshness";
import { HudWeather } from "../client/hud-status";
import { setLocale } from "../client/i18n";
import type { Weather } from "../shared/weather";

const now = Date.parse("2026-10-12T12:00:00Z");
function sample(): Weather {
  return {
    temperature: 4,
    wind: 2,
    windDirection: 90,
    rain: 1,
    cloud: 0.8,
    observedAt: now - 29 * 60000,
    fetchedAt: now,
    source: "Meteostanice Silicon Hill",
    sourceKind: "station",
    status: "live",
    stale: false,
    cloudSource: "Open-Meteo · modelová oblačnost",
    cloudObservedAt: now - 10 * 60000,
    cloudStale: false,
    humidity: 89,
    snowfall: 0.2,
    fieldSources: {
      humidity: {
        kind: "station",
        source: "Meteostanice Silicon Hill",
        observedAt: now - 29 * 60000,
        stale: false,
      },
      snowfall: {
        kind: "model",
        source: "Open-Meteo · model",
        observedAt: now - 10 * 60000,
        stale: false,
      },
    },
  };
}

test("client clock ages station and model separately without changing retained measurements", () => {
  const first = sample();
  assert.equal(ageClientWeather(first, now), first);
  const later = ageClientWeather(first, now + 2 * 60000);
  assert.equal(later.status, "fallback");
  assert.equal(later.stale, true);
  assert.equal(later.sourceKind, "station");
  assert.equal(later.cloudStale, false);
  assert.equal(later.fieldSources?.humidity?.stale, true);
  assert.equal(later.fieldSources?.snowfall?.stale, false);
  assert.equal(later.temperature, first.temperature);
  assert.equal(later.fetchedAt, first.fetchedAt);
  assert.equal(first.stale, false);
  assert.equal(first.fieldSources?.humidity?.stale, false);
  const oldModel = ageClientWeather(later, now + 51 * 60000);
  assert.equal(oldModel.cloudStale, true);
  assert.equal(oldModel.fieldSources?.snowfall?.stale, true);
});

test("failed refresh marks retained origins stale while a new response recovers normally", () => {
  const first = sample();
  const failed = ageClientWeather(first, now, true);
  assert.equal(failed.sourceKind, "station");
  assert.equal(failed.source, first.source);
  assert.equal(failed.stale, true);
  assert.equal(failed.cloudStale, true);
  assert.equal(failed.fieldSources?.humidity?.kind, "station");
  assert.equal(failed.fieldSources?.snowfall?.kind, "model");
  assert.equal(failed.fieldSources?.snowfall?.stale, true);
  assert.equal(ageClientWeather(failed, now), failed);
  const recovered = ageClientWeather(sample(), now);
  assert.equal(recovered.stale, false);
  assert.equal(recovered.fieldSources?.snowfall?.stale, false);
});

test("legacy live station keeps its inferred origin after client aging", () => {
  const legacy = sample();
  delete legacy.sourceKind;
  const aged = ageClientWeather(legacy, now + 2 * 60000);
  assert.equal(aged.sourceKind, "station");
  assert.equal(aged.status, "fallback");
  assert.equal(ageClientWeather(aged, now + 3 * 60000).sourceKind, "station");
});

test("HUD labels stale station fallback correctly and discloses old model clouds independently", () => {
  for (const [locale, expected] of [
    ["cs", "stanice · starší data"],
    ["en", "station · stale data"],
  ] as const) {
    setLocale(locale);
    const aged = ageClientWeather(sample(), now + 2 * 60000);
    const html = renderToStaticMarkup(
      createElement(HudWeather, { weather: aged, label: "4 °C" }),
    );
    assert.ok(html.includes(`<small>${expected}</small>`), html);
    const freshStationOldClouds = { ...sample(), cloudStale: true };
    const mixed = renderToStaticMarkup(
      createElement(HudWeather, {
        weather: freshStationOldClouds,
        label: "4 °C",
      }),
    );
    assert.ok(
      mixed.includes(
        locale === "cs" ? "stanice · čerstvá data" : "station · fresh data",
      ),
      mixed,
    );
    assert.ok(
      mixed.includes(
        locale === "cs" ? "model · starší data" : "model · stale data",
      ),
      mixed,
    );
  }
  setLocale("cs");
});
