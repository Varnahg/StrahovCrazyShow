import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import map from "../shared/data/map.json";
import { B4_FACADE_PLAN, b4FacadePlan } from "../shared/b4-facade-plan";

const building = map.buildings.find((building) => building.id === B4_FACADE_PLAN.buildingId)!;
const close = (a: number[], b: number[]) => a.every((value, axis) => Math.abs(value - b[axis]) < 1e-8);

test("the three B4 anchors are actual consecutive OSM edges with unchanged metric dimensions", () => {
  assert.ok(building);
  assert.equal(building.height, B4_FACADE_PLAN.height);
  assert.deepEqual(B4_FACADE_PLAN.faces.map((face) => face.id), ["north-tower", "north-recess", "west-return"]);
  for (const face of B4_FACADE_PLAN.faces) {
    assert.ok(building.points.some((point, index) => close(point, face.anchor.a) && close(building.points[(index + 1) % building.points.length], face.anchor.b)), face.id);
    assert.equal(face.width, Math.hypot(face.anchor.b[0] - face.anchor.a[0], face.anchor.b[1] - face.anchor.a[1]));
    assert.deepEqual(face.edgeAnchor, [face.anchor.a, face.anchor.b]);
    assert.equal(face.material, "greyPanel");
    assert.equal(face.suppressGenericSign, true);
    assert.ok(face.openings.every((opening) => opening.u >= .1 && opening.u + opening.w < face.width - .1 && opening.v >= 0 && opening.v + opening.h < face.height - .2));
    assert.ok(face.joints.verticalU.every((u) => u > 0 && u < face.width));
    assert.ok(face.joints.horizontalY.every((v) => v > 0 && v < face.height));
  }
  assert.equal(B4_FACADE_PLAN.measured, false);
  assert.match(B4_FACADE_PLAN.material.description, /composition unknown/);
  assert.match(B4_FACADE_PLAN.material.shadeStatus, /artist setting/);
  assert.ok(B4_FACADE_PLAN.faces.every((face) => /unmeasured/.test(face.joints.status)));
  assert.equal(readFileSync("assets/blender/b4-facade/source-plan.json", "utf8"), readFileSync("shared/data/b4-facade-plan.json", "utf8"));
});

test("B4 photographed rows replace only their exact faces and retain the blank eastern north part", () => {
  const [tower, recess, west] = B4_FACADE_PLAN.faces;
  assert.equal(tower.openings.length, 12);
  assert.equal(west.openings.length, 18);
  assert.equal(recess.openings.length, 5);
  for (const face of [tower, west]) {
    const rows = new Set(face.openings.map((opening) => opening.v));
    assert.equal(rows.size, 6);
    assert.ok(face.openings.every((opening) => opening.w === .72 && opening.h === .78 && opening.style === "small" && opening.panes === 1));
  }
  assert.ok(recess.openings.every((opening) => opening.u === .12 && opening.w === 2.4 && opening.h === .66 && opening.style === "stair" && opening.v >= 3));
  assert.equal(recess.blankEasternPartOfNorthFace?.fromU, 2.52);
  assert.equal(recess.blankEasternPartOfNorthFace?.toU, recess.width);
  assert.equal(recess.groundEntry?.renderedOpening, false);
  assert.equal(recess.groundEntry?.collisionChange, false);
  assert.ok(B4_FACADE_PLAN.unplacedFacts.every((fact) => fact.metricPlacement === null));
  for (let index = 0; index < building.points.length - 1; index++) {
    const edge = { a: building.points[index], b: building.points[index + 1] };
    const exact = B4_FACADE_PLAN.faces.some((face) => close(face.anchor.a, edge.a) && close(face.anchor.b, edge.b));
    assert.equal(!!b4FacadePlan(edge, 18), exact);
  }
});

test("reversed edge traversal keeps identical world opening positions and cannot mutate source windows", () => {
  for (const face of B4_FACADE_PLAN.faces) {
    const forward = b4FacadePlan(face.anchor, 18)!;
    const reverse = b4FacadePlan({ a: face.anchor.b, b: face.anchor.a }, 18)!;
    assert.equal(forward.reversed, false);
    assert.equal(reverse.reversed, true);
    assert.deepEqual(reverse.anchor, face.anchor, "Blender geometry keeps canonical basis");
    for (let i = 0; i < forward.openings.length; i++) {
      const a = forward.openings[i], b = reverse.openings[i];
      assert.ok(Math.abs(a.u + a.w / 2 - (face.width - b.u - b.w / 2)) < 1e-12);
      assert.equal(a.v, b.v);
      assert.equal(a.style, b.style);
    }
    const originalU = face.openings[0].u;
    forward.openings[0].u = -999;
    assert.equal(face.openings[0].u, originalU);
    assert.equal(b4FacadePlan({ a: [face.anchor.a[0] + .02, face.anchor.a[1]], b: face.anchor.b }), undefined);
  }
});
