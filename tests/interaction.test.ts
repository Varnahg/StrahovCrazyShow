import { test } from "node:test";
import assert from "node:assert/strict";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { UniversalCamera } from "@babylonjs/core/Cameras/universalCamera";
import { Matrix, Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Viewport } from "@babylonjs/core/Maths/math.viewport";
import { Ray } from "@babylonjs/core/Culling/ray";
import {
  capsuleRayDistance,
  pickWorldTarget,
  clusterMapPlaces,
  worldKeyboardAllowed,
  textEntryTarget,
  pointerOrbits,
  type PickTarget,
} from "../client/interaction";
test("short left click selects while dragging either main button orbits, middle button stays free", () => {
  assert.equal(pointerOrbits(0, 0), false);
  assert.equal(pointerOrbits(0, 5), false);
  assert.equal(pointerOrbits(0, 5.01), true);
  assert.equal(pointerOrbits(2, 0), true);
  assert.equal(pointerOrbits(2, 50), true);
  assert.equal(pointerOrbits(1, 50), false);
});

test("left-click ray selects rendered avatar across camera rotations and render resolutions", () => {
  const engine = new NullEngine(),
    scene = new Scene(engine);
  scene.useRightHandedSystem = true;
  const camera = new UniversalCamera("interaction-test", Vector3.Zero(), scene);
  const target: PickTarget = {
    kind: "player",
    id: "actual-avatar",
    feet: { x: 2, y: 3, z: -4 },
    height: 1.74,
    radius: 0.38,
  };
  const center = new Vector3(2, 3.9, -4);
  for (const [width, height] of [
    [800, 600],
    [1476, 830],
    [1920, 1080],
  ])
    for (let yaw = 0; yaw < Math.PI * 2; yaw += Math.PI / 8) {
      camera.position = center.add(
        new Vector3(-Math.sin(yaw) * 9, 3, -Math.cos(yaw) * 9),
      );
      camera.setTarget(center);
      const view = camera.getViewMatrix(true),
        projection = camera.getProjectionMatrix(true);
      const projected = Vector3.Project(
        center,
        Matrix.Identity(),
        view.multiply(projection),
        new Viewport(0, 0, width, height),
      );
      const css = { width: 1920, height: 1080 },
        client = {
          x: (projected.x / width) * css.width,
          y: (projected.y / height) * css.height,
        };
      const ray = Ray.CreateNew(
        (client.x * width) / css.width,
        (client.y * height) / css.height,
        width,
        height,
        Matrix.Identity(),
        view,
        projection,
      );
      assert.deepEqual(
        pickWorldTarget(ray.origin, ray.direction, [target], () => true),
        { kind: "player", id: target.id },
      );
    }
  scene.dispose();
  engine.dispose();
});
test("selection uses nearest visible capsule, has a distance limit and cannot select through a wall", () => {
  const make = (id: string, z: number): PickTarget => ({
    kind: "player",
    id,
    feet: { x: 0, y: 0, z },
    height: 1.8,
    radius: 0.35,
  });
  const origin = { x: 0, y: 1, z: 0 },
    direction = { x: 0, y: 0, z: 1 };
  assert.deepEqual(
    pickWorldTarget(
      origin,
      direction,
      [make("far", 12), make("near", 5)],
      () => true,
    ),
    { kind: "player", id: "near" },
  );
  assert.equal(
    pickWorldTarget(
      origin,
      direction,
      [make("behind-wall", 12)],
      (p) => p.z < 6,
    ),
    null,
  );
  assert.equal(
    pickWorldTarget(origin, direction, [make("too-far", 70)], () => true),
    null,
  );
  assert.equal(
    pickWorldTarget(origin, direction, [make("behind-camera", -5)], () => true),
    null,
  );
  assert.ok(
    Number.isFinite(
      capsuleRayDistance(
        { x: 0, y: 3, z: 5 },
        { x: 0, y: -1, z: 0 },
        make("head", 5),
      ),
    ),
  );
});
test("typing, modals and map keyboard focus suppress walking, while a free canvas accepts it", () => {
  for (const context of [
    { textEntry: true, modal: false, mapFocused: false },
    { textEntry: false, modal: true, mapFocused: false },
    { textEntry: false, modal: false, mapFocused: true },
  ])
    assert.equal(worldKeyboardAllowed(context), false);
  assert.equal(
    worldKeyboardAllowed({ textEntry: false, modal: false, mapFocused: false }),
    true,
  );
  assert.equal(
    textEntryTarget({ closest: () => ({}) } as unknown as EventTarget),
    true,
  );
  assert.equal(
    textEntryTarget({ closest: () => null } as unknown as EventTarget),
    false,
  );
  assert.equal(textEntryTarget(null), false);
});
test("co-located projects remain accessible as one cluster at every scale", () => {
  const places = [
    { id: "b6", name: "B6", x: 0, z: 0 },
    { id: "music", name: "Hudebna", x: 0, z: 0 },
    { id: "laundry", name: "Prádelna", x: 1, z: 1 },
    { id: "rko", name: "R-ko", x: 150, z: 100 },
  ];
  for (const scale of [0.3, 1, 8]) {
    const clusters = clusterMapPlaces(places, scale);
    assert.deepEqual(
      clusters.flatMap((c) => c.places.map((p) => p.id)).sort(),
      places.map((p) => p.id).sort(),
    );
    assert.equal(
      clusters.find((c) => c.places.some((p) => p.id === "music"))?.places
        .length,
      3,
    );
  }
  assert.equal(
    clusterMapPlaces(places, 40).find((c) =>
      c.places.some((p) => p.id === "music"),
    )?.places.length,
    2,
  );
});
