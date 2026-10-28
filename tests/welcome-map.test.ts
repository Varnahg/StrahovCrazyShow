import test from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import map from "../shared/data/map.json";
import streets from "../shared/data/streets.json";
import catalog from "../shared/data/building-catalog.json";
import { WelcomeMap } from "../client/welcome-map";
import {
  WELCOME_MAP_GEOMETRY,
  WELCOME_MAP_ROTATION,
  rotateWelcomeMapPoint,
  welcomeMapRingPath,
} from "../client/welcome-map-geometry";

const b6 = map.buildings.find((building) => building.id === "53929071")!;
const stadium = catalog.landmarks.find(
  (landmark) => landmark.id === "great-strahov-stadium",
)!;
const area = (points: readonly (readonly number[])[]) =>
  points.reduce((sum, point, i) => {
    const next = points[(i + 1) % points.length];
    return sum + point[0] * next[1] - next[0] * point[1];
  }, 0) / 2;
const coordinates = (path: string) =>
  [...path.matchAll(/(-?[\d.]+),(-?[\d.]+)/g)].map((match) => [
    Number(match[1]),
    Number(match[2]),
  ]);
const subpathCount = (path: string) => (path.match(/Z/g) ?? []).length;

test("the native B6 long edge becomes vertical with one campus rotation", () => {
  assert.ok(
    Math.abs((WELCOME_MAP_ROTATION * 180) / Math.PI - 1.690770010257384) <
      1e-12,
  );
  const start = rotateWelcomeMapPoint(b6.points[12]);
  const end = rotateWelcomeMapPoint(b6.points[13]);
  assert.ok(Math.abs(end[0] - start[0]) < 1e-12);
  assert.ok(end[1] > start[1]);
});

test("the common transform preserves footprint areas and cross-feature distances", () => {
  for (const building of map.buildings) {
    const rotated = building.points.map(rotateWelcomeMapPoint);
    assert.ok(Math.abs(area(rotated) - area(building.points)) < 1e-7);
    const reference = b6.points[0];
    const rotatedReference = rotateWelcomeMapPoint(reference);
    for (const [i, point] of building.points.entries()) {
      const originalDistance = Math.hypot(
        point[0] - reference[0],
        point[1] - reference[1],
      );
      const rotatedDistance = Math.hypot(
        rotated[i][0] - rotatedReference[0],
        rotated[i][1] - rotatedReference[1],
      );
      assert.ok(Math.abs(originalDistance - rotatedDistance) < 1e-10);
    }
  }
});

test("every source vertex survives path serialization within a millimetre", () => {
  const rings = [
    ...map.buildings.map((building) => building.points),
    ...streets.surfaces.flatMap((surface) =>
      surface.polygons.flatMap((polygon) => [polygon.outer, ...polygon.holes]),
    ),
    ...stadium.outerRings,
    ...stadium.innerRings,
  ];
  for (const ring of rings) {
    const points = coordinates(welcomeMapRingPath(ring));
    assert.equal(points.length, ring.length);
    for (const [i, point] of ring.entries()) {
      const exact = rotateWelcomeMapPoint(point);
      assert.ok(
        Math.hypot(points[i][0] - exact[0], points[i][1] - exact[1]) < 0.001,
      );
    }
  }
});

test("cached paths retain closed street holes, the stadium interior and all buildings", () => {
  assert.equal(WELCOME_MAP_GEOMETRY.roads.length, 4);
  assert.equal(
    WELCOME_MAP_GEOMETRY.roads.reduce(
      (sum, road) => sum + subpathCount(road.path),
      0,
    ),
    148 + 79,
  );
  assert.equal(subpathCount(WELCOME_MAP_GEOMETRY.stadium), 2);
  assert.equal(
    subpathCount(WELCOME_MAP_GEOMETRY.buildings) +
      subpathCount(WELCOME_MAP_GEOMETRY.dormitories),
    143,
  );
  const buildings =
    WELCOME_MAP_GEOMETRY.buildings + WELCOME_MAP_GEOMETRY.dormitories;
  assert.equal(
    coordinates(buildings).length,
    map.buildings.reduce((sum, building) => sum + building.points.length, 0),
  );
  for (const ring of buildings.match(/M[^Z]+Z/g) ?? []) {
    assert.ok(
      area(coordinates(ring)) >= 0,
      "overlapping buildings add their fill",
    );
  }
  const clockwise = [
    [0, 0],
    [0, 2],
    [3, 2],
    [3, 0],
  ];
  const original = structuredClone(clockwise);
  welcomeMapRingPath(clockwise, true);
  assert.deepEqual(
    clockwise,
    original,
    "winding normalization must not mutate input",
  );
});

test("the cached SVG scales without distortion and exposes no interactive content", () => {
  const first = WelcomeMap();
  assert.equal(
    WelcomeMap(),
    first,
    "the static SVG tree is reused across parent updates",
  );
  const markup = renderToStaticMarkup(createElement(WelcomeMap));
  assert.match(markup, /viewBox="-610 -310 980 610"/);
  assert.match(markup, /preserveAspectRatio="xMidYMid slice"/);
  assert.match(markup, /aria-hidden="true"/);
  assert.match(markup, /focusable="false"/);
  assert.match(markup, /pointer-events="none"/);
  assert.equal((markup.match(/<path /g) ?? []).length, 7);
  assert.equal((markup.match(/fill-rule="evenodd"/g) ?? []).length, 5);
  assert.doesNotMatch(markup, /<(?:text|title|a|image|foreignObject|canvas)\b/);
  assert.doesNotMatch(markup, /(?:tabindex|role=|\bon\w+=|NaN|Infinity)/i);
  assert.match(markup, /home-map-roads roads/);
  assert.match(
    markup,
    /home-map-buildings buildings home-map-dormitories dormitories/,
  );
  assert.match(markup, /home-map-stadium stadium/);
});

test("the local Manrope binary and its redistribution documents are present", () => {
  const font = readFileSync(
    new URL("../public/fonts/manrope/Manrope-Variable.ttf", import.meta.url),
  );
  assert.equal(
    font.readUInt32BE(0),
    0x00010000,
    "the asset is an original TrueType font",
  );
  assert.equal(font.length, 164700);
  const license = readFileSync(
    new URL("../public/fonts/manrope/OFL.txt", import.meta.url),
    "utf8",
  );
  assert.match(license, /SIL OPEN FONT LICENSE Version 1\.1/);
  const fontlog = readFileSync(
    new URL("../public/fonts/manrope/FONTLOG.txt", import.meta.url),
    "utf8",
  );
  assert.match(fontlog, /Manrope/);
});
