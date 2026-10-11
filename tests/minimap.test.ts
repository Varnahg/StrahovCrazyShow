import test from "node:test";
import assert from "node:assert/strict";
import { BOUNDS } from "../shared/world";
import {
  clampMapCamera,
  fitMapScale,
  mapEdgeIndicator,
  mapHeading,
  mapToScreen,
  panMapBy,
  screenToMap,
  zoomMapAt,
  type MapCamera,
} from "../client/minimap-math";

const viewport = { width: 232, height: 186 };
const near = (a: number, b: number, epsilon = 1e-8) =>
  assert.ok(Math.abs(a - b) < epsilon, `${a} differs from ${b}`);

test("north and heading-up maps project Strahov coordinates without mirroring at every facing", () => {
  for (let i = 0; i < 32; i++) {
    const yaw = (i * Math.PI) / 16;
    const camera: MapCamera = {
      x: 22,
      z: -14,
      scale: 1.75,
      rotation: -mapHeading(yaw),
    };
    const forward = { x: 22 + 30 * Math.sin(yaw), z: -14 + 30 * Math.cos(yaw) };
    const screen = mapToScreen(forward, camera, viewport);
    near(screen.x, viewport.width / 2);
    near(screen.y, viewport.height / 2 - 30 * camera.scale);
    const restored = screenToMap(screen, camera, viewport);
    near(restored.x, forward.x);
    near(restored.z, forward.z);
  }
  const north: MapCamera = { x: 22, z: -14, scale: 1, rotation: 0 };
  assert.ok(
    mapToScreen({ x: 32, z: -14 }, north, viewport).x > viewport.width / 2,
  );
  assert.ok(
    mapToScreen({ x: 22, z: -24 }, north, viewport).y < viewport.height / 2,
  );
});

test("wheel zoom keeps the exact world point under the pointer across rotations", () => {
  const anchor = { x: 56, y: 42 };
  for (const rotation of [0, 0.4, Math.PI / 2, Math.PI, -1.8]) {
    const original = { x: 130, z: 12, scale: 0.75, rotation };
    const location = screenToMap(anchor, original, viewport);
    const next = zoomMapAt(original, anchor, 2.8, viewport);
    const projected = mapToScreen(location, next, viewport);
    near(projected.x, anchor.x);
    near(projected.y, anchor.y);
    const restored = zoomMapAt(next, anchor, original.scale, viewport);
    near(restored.x, original.x);
    near(restored.z, original.z);
  }
});

test("dragging moves mapped points with the pointer, including a rotated map", () => {
  for (const rotation of [0, 0.8, Math.PI / 2, Math.PI]) {
    const camera = { x: 50, z: -20, scale: 2.25, rotation };
    const point = { x: 68.3, z: -31.5 },
      before = mapToScreen(point, camera, viewport);
    const next = panMapBy(camera, 31, -19),
      after = mapToScreen(point, next, viewport);
    near(after.x - before.x, 31);
    near(after.y - before.y, -19);
  }
});

test("bounded map cameras keep every viewport corner inside the actual expanding world", () => {
  for (const bounds of [
    BOUNDS,
    { minX: -500, maxX: 440, minZ: -270, maxZ: 340 },
  ]) {
    const fit = fitMapScale(bounds, viewport);
    const overview = clampMapCamera(
      { x: 10000, z: -10000, scale: fit, rotation: 0 },
      bounds,
      viewport,
    );
    near(overview.x, (bounds.minX + bounds.maxX) / 2);
    near(overview.z, (bounds.minZ + bounds.maxZ) / 2);
    for (const rotation of [0, 0.5, 1.5, 3]) {
      const close = clampMapCamera(
        { x: 10000, z: -10000, scale: 3, rotation },
        bounds,
        viewport,
      );
      for (const x of [0, viewport.width])
        for (const y of [0, viewport.height]) {
          const p = screenToMap({ x, y }, close, viewport);
          assert.ok(p.x >= bounds.minX - 1e-8 && p.x <= bounds.maxX + 1e-8);
          assert.ok(p.z >= bounds.minZ - 1e-8 && p.z <= bounds.maxZ + 1e-8);
        }
    }
  }
});

test("offscreen objective indicators preserve direction and remain accessible inside the map", () => {
  for (const point of [
    { x: -200, y: 20 },
    { x: 800, y: 500 },
    { x: 30, y: -500 },
    { x: 20, y: 500 },
  ]) {
    const edge = mapEdgeIndicator(point, viewport);
    assert.equal(edge.offscreen, true);
    assert.ok(edge.x >= 15 && edge.x <= viewport.width - 15);
    assert.ok(edge.y >= 15 && edge.y <= viewport.height - 15);
    const desired = {
        x: point.x - viewport.width / 2,
        y: point.y - viewport.height / 2,
      },
      actual = {
        x: edge.x - viewport.width / 2,
        y: edge.y - viewport.height / 2,
      };
    near(desired.x * actual.y - desired.y * actual.x, 0, 1e-7);
    assert.ok(desired.x * actual.x + desired.y * actual.y > 0);
  }
  assert.deepEqual(mapEdgeIndicator({ x: 80, y: 60 }, viewport), {
    x: 80,
    y: 60,
    offscreen: false,
    angle:
      (Math.atan2(60 - viewport.height / 2, 80 - viewport.width / 2) * 180) /
        Math.PI +
      90,
  });
});
