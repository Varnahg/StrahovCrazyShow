import test from "node:test";
import assert from "node:assert/strict";
import { Matrix, Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Viewport } from "@babylonjs/core/Maths/math.viewport";
import { Frustum } from "@babylonjs/core/Maths/math.frustum";
import { VegetationViewStability, VEGETATION_PIXEL_TOLERANCE, VEGETATION_TRANSLATION_GUARD } from "../client/vegetation-view-stability";

const width = 1280, height = 720, fov = .85;
const projection = () => Matrix.PerspectiveFovRH(fov, width / height, .08, 1100);
function accepted(depth = 2) {
  const gate = new VegetationViewStability(), view = Matrix.Identity(), p = projection(), eye = Vector3.Zero();
  gate.accept(view, p, eye, 0, 0, width, height, fov);
  gate.includeBounds(0, 0, -depth - .1, .1); gate.complete();
  return { gate, view, p, eye };
}

test("translation tolerance is pixel-bounded and accumulated from the accepted snapshot", () => {
  const { gate, p } = accepted();
  const pose = (x: number) => gate.changed(Matrix.Translation(-x, 0, 0), p, new Vector3(x, 0, 0), x, 0, width, height, fov);
  assert.equal(pose(.0001), false);
  assert.equal(pose(.0002), false);
  assert.equal(pose(.0007), true, "small steps cannot silently move the accepted anchor");
  gate.accept(Matrix.Translation(-.0007, 0, 0), p, new Vector3(.0007, 0, 0), .0007, 0, width, height, fov);
  gate.includeBounds(0, 0, -2.1, .1); gate.complete();
  assert.equal(pose(.0008), false);
  const far = accepted(100);
  assert.equal(far.gate.changed(Matrix.Translation(-.0019, 0, 0), far.p, new Vector3(.0019, 0, 0), 0, 0, width, height, fov), false);
  assert.equal(far.gate.changed(Matrix.Translation(-.0021, 0, 0), far.p, new Vector3(.0021, 0, 0), 0, 0, width, height, fov), true);
});

test("rotation, projection, FOV, resolution, unknown depth and unsupported projection never use an epsilon", () => {
  const { gate, p, eye, view } = accepted();
  assert.equal(gate.changed(Matrix.RotationY(1e-7), p, eye, 0, 0, width, height, fov), true);
  assert.equal(gate.changed(view, Matrix.PerspectiveFovRH(fov, width / height, .081, 1100), eye, 0, 0, width, height, fov), true);
  assert.equal(gate.changed(view, p, eye, 0, 0, width, height, fov + 1e-8), true);
  assert.equal(gate.changed(view, p, eye, 0, 0, width + 1, height, fov), true);
  assert.equal(gate.changed(view, p, eye, 0, 0, width, height + 1, fov), true);
  assert.equal(gate.changed(view, p, eye, .003, 0, width, height, fov), true, "focus has its own accumulated guard");
  gate.accept(view, p, eye, 0, 0, width, height, fov);
  assert.equal(gate.changed(Matrix.Translation(-.000001, 0, 0), p, new Vector3(.000001, 0, 0), 0, 0, width, height, fov), true);
  gate.includeBounds(0, 0, -.1, .2); gate.complete();
  assert.equal(gate.minimumDepth, 0);
  assert.equal(gate.changed(Matrix.Translation(-.000001, 0, 0), p, new Vector3(.000001, 0, 0), 0, 0, width, height, fov), true);
  const ortho = Matrix.Identity(); Matrix.OrthoOffCenterRHToRef(-2, 2, -1.5, 1.5, .08, 1100, ortho);
  gate.accept(view, ortho, eye, 0, 0, width, height, fov); gate.includeBounds(0, 0, -2, .1); gate.complete();
  assert.equal(gate.changed(Matrix.Translation(-.000001, 0, 0), ortho, new Vector3(.000001, 0, 0), 0, 0, width, height, fov), true);
  gate.reset(); assert.equal(gate.changed(view, p, eye, 0, 0, width, height, fov), true);
});

test("accepted motion stays below quarter pixel under actual Babylon projection including oblique screen edges", () => {
  for (const renderHeight of [288, 720, 2160]) for (const angle of [.3, .85, 1.2]) for (const depth of [.2, 2, 10])
    for (const offCentre of [false, true]) {
      const renderWidth = renderHeight * 16 / 9;
      const values = Array.from(Matrix.PerspectiveFovRH(angle, renderWidth / renderHeight, .08, 1100).m);
      if (offCentre) { values[8] = .25; values[9] = -.125; }
      const p = Matrix.FromArray(values), gate = new VegetationViewStability(), before = Matrix.Identity(), origin = Vector3.Zero();
      const focal = Math.max(renderWidth * Math.abs(p.m[0]), renderHeight * Math.abs(p.m[5])) / 2;
      const step = Math.min(.0015, VEGETATION_PIXEL_TOLERANCE * depth / (4 * (focal + renderWidth)));
      const eye = new Vector3(step * .5, -step * .3, step * .2), after = Matrix.Translation(-eye.x, -eye.y, -eye.z);
      gate.accept(before, p, origin, 0, 0, renderWidth, renderHeight, angle);
      gate.includeBounds(0, 0, -depth - .1, .1); gate.complete();
      assert.equal(gate.changed(after, p, eye, 0, 0, renderWidth, renderHeight, angle), false);
      const viewport = new Viewport(0, 0, renderWidth, renderHeight), transformed = after.multiply(p);
      for (const nx of [-1, -.5, 0, .5, 1]) for (const ny of [-1, 0, 1]) for (const distance of [depth, depth * 2, depth * 10]) {
        const point = new Vector3((nx + p.m[8]) * distance / p.m[0], (ny + p.m[9]) * distance / p.m[5], -distance);
        const a = Vector3.Project(point, Matrix.Identity(), p, viewport), b = Vector3.Project(point, Matrix.Identity(), transformed, viewport);
        assert.ok(Math.hypot(b.x - a.x, b.y - a.y) <= VEGETATION_PIXEL_TOLERANCE,
          JSON.stringify({ renderHeight, angle, depth, offCentre, a, b }));
      }
    }
});

test("selection guard retains a point entering the true frustum during held translation", () => {
  const p = projection(), gate = new VegetationViewStability(), before = Matrix.Identity(), depth = 2;
  const point = new Vector3((1 + .05 / (width / 2)) * depth / p.m[0], 0, -depth);
  const oldPlanes = Frustum.GetPlanes(p);
  assert.ok(oldPlanes.some(plane => plane.dotCoordinate(point) < 0));
  assert.ok(oldPlanes.every(plane => plane.dotCoordinate(point) >= -VEGETATION_TRANSLATION_GUARD));
  gate.accept(before, p, Vector3.Zero(), 0, 0, width, height, fov); gate.includeBounds(point.x, point.y, point.z, 0); gate.complete();
  const eye = new Vector3(.0002, 0, 0), after = Matrix.Translation(-eye.x, 0, 0);
  assert.equal(gate.changed(after, p, eye, 0, 0, width, height, fov), false);
  assert.ok(Frustum.GetPlanes(after.multiply(p)).every(plane => plane.dotCoordinate(point) >= 0));
});

test("float32 view translation and focus are checked independently of unchanged eye fields", () => {
  const { gate, view, p, eye } = accepted();
  assert.equal(gate.changed(Matrix.Translation(-.001, 0, 0), p, eye, 0, 0, width, height, fov), true);
  assert.equal(gate.changed(view, p, eye, .001, 0, width, height, fov), true);
  assert.equal(gate.changed(view, p, new Vector3(NaN, 0, 0), 0, 0, width, height, fov), true);
});
