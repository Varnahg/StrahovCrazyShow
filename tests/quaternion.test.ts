import test from "node:test";
import assert from "node:assert/strict";
import {
  multiplyQuaternions,
  rotateQuaternionVector,
} from "../shared/quaternion";
import { rotateGroundVector } from "../shared/terrain-entities";
import { rotateVehicleVector } from "../shared/vehicle";

for (const rotate of [
  rotateQuaternionVector,
  rotateGroundVector,
  rotateVehicleVector,
]) {
  test(`${rotate.name} preserves identity, zero quaternion and input ownership`, () => {
    const vector = Object.freeze({ x: 1, y: 2, z: 3 });
    for (const w of [0, 1]) {
      const rotation = Object.freeze({ x: 0, y: 0, z: 0, w });
      const result = rotate(rotation, vector);
      assert.deepEqual(result, vector);
      assert.notEqual(result, vector);
      assert.notEqual(result, rotate(rotation, vector));
      assert.deepEqual(rotation, { x: 0, y: 0, z: 0, w });
    }
  });

  test(`${rotate.name} follows the existing positive axis convention`, () => {
    const vector = { x: 1, y: 2, z: 3 };
    assert.deepEqual(rotate({ x: 1, y: 0, z: 0, w: 0 }, vector), {
      x: 1, y: -2, z: -3,
    });
    assert.deepEqual(rotate({ x: 0, y: 1, z: 0, w: 0 }, vector), {
      x: -1, y: 2, z: -3,
    });
    assert.deepEqual(rotate({ x: 0, y: 0, z: 1, w: 0 }, vector), {
      x: -1, y: -2, z: 3,
    });
  });

  test(`${rotate.name} keeps non-unit and non-finite component behavior`, () => {
    const rotation = Object.freeze({ x: 0, y: 1, z: 0, w: 1 });
    const vector = Object.freeze({ x: 1, y: 2, z: 3 });
    // Normalizing this quaternion would instead produce (3, 2, -1).
    assert.deepEqual(rotate(rotation, vector), { x: 5, y: 2, z: -5 });
    assert.ok(
      Object.values(rotate({ x: 0, y: 0, z: 0, w: Infinity }, vector))
        .every(Number.isNaN),
    );
    assert.ok(
      Object.values(rotate({ x: NaN, y: 0, z: 0, w: 1 }, vector))
        .every(Number.isNaN),
    );
  });
}

test("quaternion product preserves Hamilton order, magnitude and input ownership", () => {
  const x = Object.freeze({ x: 1, y: 0, z: 0, w: 0 });
  const y = Object.freeze({ x: 0, y: 1, z: 0, w: 0 });
  assert.deepEqual(multiplyQuaternions(x, y), { x: 0, y: 0, z: 1, w: 0 });
  assert.deepEqual(multiplyQuaternions(y, x), { x: 0, y: 0, z: -1, w: 0 });
  const rotation = Object.freeze({ x: 2, y: 3, z: 5, w: 7 });
  const identity = Object.freeze({ x: 0, y: 0, z: 0, w: 1 });
  const result = multiplyQuaternions(rotation, identity);
  assert.deepEqual(result, rotation);
  assert.deepEqual(multiplyQuaternions(identity, rotation), rotation);
  assert.notEqual(result, rotation);
  assert.notEqual(result, multiplyQuaternions(rotation, identity));
  assert.deepEqual(multiplyQuaternions({ x: 0, y: 0, z: 0, w: 2 }, rotation), {
    x: 4, y: 6, z: 10, w: 14,
  });
});

test("composed unit rotations apply the right operand first", () => {
  const x = { x: Math.SQRT1_2, y: 0, z: 0, w: Math.SQRT1_2 };
  const y = { x: 0, y: Math.SQRT1_2, z: 0, w: Math.SQRT1_2 };
  const vector = { x: 1, y: 2, z: 3 };
  const composed = rotateQuaternionVector(multiplyQuaternions(y, x), vector);
  const sequential = rotateQuaternionVector(y, rotateQuaternionVector(x, vector));
  const expected = { x: 2, y: -3, z: -1 };
  for (const axis of ["x", "y", "z"] as const) {
    assert.ok(Math.abs(composed[axis] - expected[axis]) < 1e-12);
    assert.ok(Math.abs(composed[axis] - sequential[axis]) < 1e-12);
  }
});

test("quaternion product propagates non-finite components without validation", () => {
  const result = multiplyQuaternions(
    { x: 0, y: 0, z: 0, w: Infinity },
    { x: 0, y: 0, z: 0, w: 1 },
  );
  assert.ok([result.x, result.y, result.z].every(Number.isNaN));
  assert.equal(result.w, Infinity);
});
