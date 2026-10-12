import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { HudWeather } from "../client/hud-status";
import { WorldDock } from "../client/world-dock";
import { setLocale } from "../client/i18n";
import type { Weather } from "../shared/weather";

const sample: Weather = {
  temperature: 12,
  wind: 2,
  windDirection: 90,
  rain: 0,
  cloud: 0.3,
  observedAt: 1_000,
  fetchedAt: 1_000,
  source: "Meteostanice Silicon Hill",
  cloudSource: "Open-Meteo · modelová oblačnost",
  stale: false,
  status: "live",
};

test("weather HUD distinguishes station/model and stale/unavailable data in both languages", () => {
  for (const [locale, expected] of [
    [
      "cs",
      [
        "stanice · čerstvá data",
        "stanice · starší data",
        "model počasí",
        "model · starší data",
        "data nedostupná",
        "načítám",
      ],
    ],
    [
      "en",
      [
        "station · fresh data",
        "station · stale data",
        "weather model",
        "model · stale data",
        "data unavailable",
        "loading",
      ],
    ],
  ] as const) {
    setLocale(locale);
    const variants: (Weather | null)[] = [
      sample,
      { ...sample, stale: true },
      { ...sample, status: "fallback" },
      { ...sample, status: "fallback", stale: true },
      { ...sample, status: "unavailable", stale: true, temperature: null },
      null,
    ];
    variants.forEach((weather, index) => {
      const html = renderToStaticMarkup(
        createElement(HudWeather, { weather, label: "12 °C" }),
      );
      assert.ok(html.includes(`<small>${expected[index]}</small>`), html);
      if (weather)
        assert.match(html, /title="[^"]*Silicon Hill[^"]*Open-Meteo/);
    });
  }
});

test("the real dock renders labelled native buttons, shortcut metadata, and accessible request count", () => {
  for (const locale of ["cs", "en"] as const) {
    setLocale(locale);
    const html = renderToStaticMarkup(
      createElement(WorldDock, {
        panel: "map",
        journalOpen: false,
        requestCount: 3,
        onToggle() {},
      }),
    );
    assert.equal((html.match(/<button /g) || []).length, 7);
    assert.equal((html.match(/aria-pressed="true"/g) || []).length, 1);
    assert.match(html, /aria-keyshortcuts="M"/);
    assert.match(html, /aria-keyshortcuts="J"/);
    assert.match(html, /aria-describedby="world-dock-help"/);
    assert.match(html, /id="world-dock-help"/);
    assert.match(html, /<b aria-hidden="true">3<\/b>/);
    assert.ok(
      html.includes(
        locale === "cs"
          ? 'aria-label="Lidé · žádosti o kontakt: 3"'
          : 'aria-label="People · contact requests: 3"',
      ),
    );
    assert.ok(
      html.includes(
        locale === "cs"
          ? "Kliknutím do hry pokračuješ."
          : "Click the game to continue.",
      ),
    );
  }
});
