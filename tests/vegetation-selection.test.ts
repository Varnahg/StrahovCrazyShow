import test from "node:test";
import assert from "node:assert/strict";
import { GrassPatchSelection } from "../client/vegetation-selection";
import { createGrassPatches, grassLod } from "../shared/vegetation";
import { BOUNDS, BUILDINGS, MAP } from "../shared/world";

// Independent original implementation: preserve exact Math.hypot, strict range,
// stable authored ordering and preference for the previously visible tiles.
function original(
  positions: readonly { x: number; z: number }[],
  previous: ReadonlySet<number>,
  x: number,
  z: number,
  range: number,
  limit: number,
) {
  return positions
    .map((patch, index) => ({
      index,
      distance: Math.hypot(patch.x - x, patch.z - z),
    }))
    .filter((p) => p.distance < range + 11.4)
    .sort(
      (a, b) =>
        a.distance * (previous.has(a.index) ? 0.85 : 1) -
        b.distance * (previous.has(b.index) ? 0.85 : 1),
    )
    .slice(0, limit)
    .map((p) => p.index);
}

test("reused grass selection preserves all mapped tiles across movement, quality changes and stationary frames", () => {
  const positions = createGrassPatches(BOUNDS, BUILDINGS, MAP.paths);
  const selection = new GrassPatchSelection(positions);
  let previous = new Set<number>();
  for (let frame = 0; frame < 1800; frame++) {
    // Mix standing, driving and walking; revisit distant negative grid cells.
    const step = Math.floor(frame / 3);
    const x = Math.sin(step * 0.027) * 430 - 20;
    const z = Math.sin(step * 0.043) * 270 + 30;
    const budget = grassLod(
      ["low", "medium", "high"][Math.floor(frame / 91) % 3],
    );
    const expected = original(
      positions,
      previous,
      x,
      z,
      budget.range,
      budget.tiles,
    );
    selection.update(x, z, budget.range, budget.tiles);
    assert.deepEqual(
      [...selection.selected].sort((a, b) => a - b),
      [...expected].sort((a, b) => a - b),
    );
    for (let i = 0; i < positions.length; i++)
      assert.equal(selection.isSelected(i), expected.includes(i));
    previous = new Set(expected);
  }
});

test("grass selection preserves strict range and stable ties, reuses results, and invalidates both quality dimensions", () => {
  const positions = [
    { x: 0, z: 11.4 }, // Strictly outside a zero-range selection.
    { x: -1, z: 0 },
    { x: 1, z: 0 },
    { x: 0, z: -1 },
    { x: 0, z: 1 },
  ];
  const selection = new GrassPatchSelection(positions);
  const storage = selection.selected;
  assert.equal(selection.update(0, 0, 0, 2), true);
  assert.deepEqual(selection.selected, [1, 2]);
  assert.equal(selection.update(0, 0, 0, 2), false);
  assert.equal(selection.selected, storage);
  assert.equal(selection.update(0, 0, 0, 4), true);
  assert.deepEqual(selection.selected, [1, 2, 3, 4]);
  assert.equal(selection.update(0, 0, 1, 5), true);
  assert.deepEqual(selection.selected, [1, 2, 3, 4, 0]);
  assert.equal(selection.update(100, 100, 1, 5), true);
  assert.deepEqual(selection.selected, []);
  assert.ok(positions.every((_, index) => !selection.isSelected(index)));
});
