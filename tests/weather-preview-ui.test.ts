import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { Script } from "node:vm";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import {
  WEATHER_SCENARIOS,
  isWeatherScenarioId,
  createWeatherScenario,
} from "../shared/weather-scenarios";
import { messages } from "../client/i18n-messages";

const source = ts.createSourceFile(
  "ui.tsx",
  readFileSync(new URL("../client/ui.tsx", import.meta.url), "utf8"),
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.TSX,
);
function find<T extends ts.Node>(predicate: (node: ts.Node) => node is T): T {
  let found: T | undefined;
  const visit = (node: ts.Node) => {
    if (predicate(node)) found = node;
    ts.forEachChild(node, visit);
  };
  visit(source);
  assert.ok(found);
  return found;
}
const declaration = (name: string) =>
  find(
    (n): n is ts.VariableDeclaration =>
      ts.isVariableDeclaration(n) && n.name.getText(source) === name,
  );
const preview = find(
  (n): n is ts.FunctionDeclaration =>
    ts.isFunctionDeclaration(n) && n.name?.text === "WeatherPreviewControls",
);
const descriptions = declaration("WEATHER_PREVIEW_DESCRIPTIONS");
const javascript = (text: string) =>
  ts.transpileModule(text, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.CommonJS,
      jsx: ts.JsxEmit.React,
    },
  }).outputText;
function controls(locale: "cs" | "en") {
  const localize = (key: string) =>
    locale === "en" ? ((messages as Record<string, string>)[key] ?? key) : key;
  return new Script(
    javascript(
      `const ${descriptions.getText(source)};${preview.getText(source)};({WeatherPreviewControls,WEATHER_PREVIEW_DESCRIPTIONS});`,
    ),
  ).runInNewContext({
    exports: {},
    React,
    WEATHER_SCENARIOS,
    isWeatherScenarioId,
    t: localize,
    localizeText: localize,
  }) as {
    WeatherPreviewControls: (props: {
      selected: string | null;
      onChange: (id: string | null) => void;
    }) => React.ReactElement;
    WEATHER_PREVIEW_DESCRIPTIONS: Record<string, string>;
  };
}
function elements(root: React.ReactNode): React.ReactElement<any>[] {
  if (!React.isValidElement(root)) return [];
  return [
    root,
    ...React.Children.toArray(
      (root.props as { children?: React.ReactNode }).children,
    ).flatMap(elements),
  ];
}

test("actual preview selector renders every supported condition in both locales with DEMO and a real-weather exit", () => {
  for (const locale of ["cs", "en"] as const) {
    const {
      WeatherPreviewControls: Component,
      WEATHER_PREVIEW_DESCRIPTIONS: copy,
    } = controls(locale);
    for (const scenario of WEATHER_SCENARIOS) {
      assert.ok((messages as Record<string, string>)[scenario.label]);
      assert.ok((messages as Record<string, string>)[copy[scenario.id]]);
      const rendered = renderToStaticMarkup(
        React.createElement(Component, {
          selected: scenario.id,
          onChange: () => {},
        }),
      );
      assert.ok(rendered.includes("DEMO"));
      assert.ok(rendered.includes(`value="${scenario.id}" selected=""`));
      assert.ok(
        rendered.includes(
          locale === "cs" ? "Vrátit skutečné počasí" : "Return to real weather",
        ),
      );
    }
    const real = renderToStaticMarkup(
      React.createElement(Component, { selected: null, onChange: () => {} }),
    );
    assert.ok(!real.includes("DEMO"));
    assert.ok(real.includes('value="real" selected=""'));
  }
});

test("actual selector handlers accept only declared scenarios and both exits restore real weather", () => {
  const { WeatherPreviewControls: Component } = controls("cs"),
    changes: (string | null)[] = [];
  const tree = Component({
      selected: "fog",
      onChange: (id) => changes.push(id),
    }),
    nodes = elements(tree);
  const select = nodes.find((n) => n.type === "select")!,
    button = nodes.find((n) => n.type === "button")!;
  select.props.onChange({ target: { value: "hail" } });
  select.props.onChange({ target: { value: "unknown-injected-mode" } });
  select.props.onChange({ target: { value: "real" } });
  button.props.onClick();
  assert.deepEqual(changes, ["hail", null, null]);
});

test("actual UI selection/startup keeps live provider data untouched and applies the retained preview to a late Game", () => {
  const selection = declaration("changeWeatherPreview").initializer!,
    publish = declaration("publish").initializer!;
  const initial = Object.freeze({
    source: "station",
    temperature: 10,
    observedAt: 100,
    stale: false,
  });
  const weatherRef = { current: initial as object },
    weatherPreviewRef = { current: null as string | null };
  let selected: string | null = null,
    published: object = initial;
  const calls: unknown[] = [];
  const game = {
    current: null as null | {
      setWeather: (w: object) => void;
      setWeatherPreview: (id: string | null) => void;
    },
  };
  const choose = new Script(
    javascript(`const choose=${selection.getText(source)};choose;`),
  ).runInNewContext({
    weatherPreviewRef,
    setWeatherPreview: (id: string | null) => (selected = id),
    game,
  });
  choose("fog");
  assert.equal(weatherPreviewRef.current, "fog");
  assert.equal(selected, "fog");
  assert.equal(weatherRef.current, initial);
  const g = {
    setWeather: (w: object) => calls.push(["live", w]),
    setWeatherPreview: (id: string | null) => calls.push(["preview", id]),
  };
  game.current = g;
  const startPreview = find(
    (n): n is ts.ExpressionStatement =>
      ts.isExpressionStatement(n) &&
      n.getText(source) === "g.setWeatherPreview(weatherPreviewRef.current);",
  );
  new Script(javascript(startPreview.getText(source))).runInNewContext({
    g,
    weatherPreviewRef,
  });
  assert.deepEqual(calls, [["preview", "fog"]]);
  const publishLive = new Script(
    javascript(`const publish=${publish.getText(source)};publish;`),
  ).runInNewContext({
    cancelled: false,
    setWeather: (w: object) => (published = w),
    weatherRef,
    game,
  });
  const updated = Object.freeze({
    source: "station-new",
    temperature: 12,
    observedAt: 200,
    stale: false,
  });
  publishLive(updated);
  assert.equal(published, updated);
  assert.equal(weatherRef.current, updated);
  assert.equal(weatherPreviewRef.current, "fog");
  choose(null);
  assert.equal(weatherRef.current, updated);
  assert.equal(updated.observedAt, 200);
  assert.equal(weatherPreviewRef.current, null);
  assert.deepEqual(calls.at(-1), ["preview", null]);
});

test("persistent weather badge exits preview while the HUD still receives the actual provider object", () => {
  const button = find(
    (n): n is ts.JsxElement =>
      ts.isJsxElement(n) &&
      n.openingElement.tagName.getText(source) === "button" &&
      n.getText(source).includes("previewWeatherLabel"),
  );
  const changes: unknown[] = [];
  const element = new Script(
    javascript(`const element=(${button.getText(source)});element;`),
  ).runInNewContext({
    React,
    t: (s: string) => s,
    localizeText: (s: string) => s,
    previewWeatherLabel: "Mlha",
    changeWeatherPreview: (id: unknown) => changes.push(id),
  });
  assert.ok(renderToStaticMarkup(element).includes("DEMO"));
  element.props.onClick();
  assert.deepEqual(changes, [null]);
  const hud = find(
    (n): n is ts.JsxSelfClosingElement =>
      ts.isJsxSelfClosingElement(n) &&
      n.tagName.getText(source) === "HudWeather",
  );
  const weather = hud.attributes.properties.find(
    (n) => ts.isJsxAttribute(n) && n.name.getText(source) === "weather",
  ) as ts.JsxAttribute;
  assert.equal(
    (weather.initializer as ts.JsxExpression).expression?.getText(source),
    "weather",
  );
});

test("actual Game weather methods keep the live snapshot while the selected DEMO controls effective rendering", () => {
  const gameSource = ts.createSourceFile(
    "game.ts",
    readFileSync(new URL("../client/game.ts", import.meta.url), "utf8"),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  const gameClass = gameSource.statements.find(
    (n) => ts.isClassDeclaration(n) && n.name?.text === "Game",
  ) as ts.ClassDeclaration;
  const members = gameClass.members.filter(
    (n) =>
      n.name &&
      ["setWeather", "setWeatherPreview", "effectiveWeather"].includes(
        n.name.getText(gameSource),
      ),
  );
  assert.equal(members.length, 3);
  const WeatherGame = new Script(
    javascript(
      `class WeatherGame{${members.map((n) => n.getText(gameSource)).join("\n")}};WeatherGame;`,
    ),
  ).runInNewContext({ createWeatherScenario });
  const game = new WeatherGame(),
    live = Object.freeze({
      source: "station",
      temperature: 3,
      observedAt: 100,
      stale: false,
    });
  game.setWeather(live);
  assert.equal(game.effectiveWeather, live);
  for (const scenario of WEATHER_SCENARIOS) {
    game.setWeatherPreview(scenario.id);
    assert.equal(game.weather, live);
    assert.equal(game.effectiveWeather.preview.id, scenario.id);
    assert.equal(game.effectiveWeather.observedAt, null);
    assert.match(game.effectiveWeather.source, /^DEMO/);
  }
  const refreshed = Object.freeze({
    source: "station",
    temperature: 7,
    observedAt: 200,
    stale: false,
  });
  game.setWeather(refreshed);
  assert.equal(game.weather, refreshed);
  assert.notEqual(game.effectiveWeather, refreshed);
  game.setWeatherPreview(null);
  assert.equal(game.effectiveWeather, refreshed);
  assert.equal(live.observedAt, 100);
});
