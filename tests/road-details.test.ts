import { test } from "node:test";
import assert from "node:assert/strict";
import {
  crossingHasMarkings,
  CROSSING_MARKINGS,
  streetSurfaceAt,
  STREET_SURFACE_Y,
} from "../shared/streets";
import { buildRoadDetailPlan } from "../shared/road-details";
import { roadPaintVertexData } from "../client/road-details";
import { groundHeight } from "../shared/terrain";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { UniversalCamera } from "@babylonjs/core/Cameras/universalCamera";
import { Viewport } from "@babylonjs/core/Maths/math.viewport";
import { VertexBuffer } from "@babylonjs/core/Buffers/buffer";
import { buildRoadDetails } from "../client/road-details";
import { STREET_FEATURES, nearestStreet } from "../shared/streets";

test("Legacy marked crossing at Koleje Strahov is rendered; explicit no remains unmarked", () => {
  assert.equal(crossingHasMarkings({ crossing: "uncontrolled" }), true);
  assert.equal(
    crossingHasMarkings({
      crossing: "uncontrolled",
      "crossing:markings": "no",
    }),
    false,
  );
  assert.equal(crossingHasMarkings({ crossing: "unmarked" }), false);
  assert.equal(crossingHasMarkings({}), false);
  assert.ok(CROSSING_MARKINGS.some((c) => c.id === "54283786"));
  assert.ok(!CROSSING_MARKINGS.some((c) => c.id === "60794713"));
});
test("Photo-informed Vanickova paint follows source roads and shared physical terrain", () => {
  const plan = buildRoadDetailPlan();
  assert.ok(plan.paint.some((p) => p.kind === "bicycle"));
  assert.ok(plan.paint.some((p) => p.kind === "line"));
  assert.equal(new Set(plan.paint.map((p) => p.id)).size, plan.paint.length);
  for (const p of plan.paint)
    for (const [x, z] of p.points)
      assert.equal(streetSurfaceAt(x, z), "asphalt", p.id);
  const data = roadPaintVertexData(plan.paint);
  assert.ok(data.indices.length > 0);
  for (let i = 0; i < data.positions.length; i += 3) {
    const [x, y, z] = data.positions.slice(i, i + 3);
    assert.ok(
      Math.abs(y - groundHeight(x, z) - STREET_SURFACE_Y - 0.006) < 1e-8,
    );
    assert.equal(streetSurfaceAt(x, z), "asphalt");
  }
  assert.ok(
    data.uvs.every((v) => Number.isFinite(v) && v >= -1e-6 && v <= 1 + 1e-6),
  );
});
test("Signs retain independent IDs and source uncertainty instead of claiming surveyed poles", () => {
  const { signs } = buildRoadDetailPlan();
  assert.equal(new Set(signs.map((s) => s.id)).size, signs.length);
  for (const sign of signs) {
    assert.ok(sign.source.startsWith("https://"));
    assert.ok(sign.uncertaintyMetres > 0);
    assert.ok(Number.isFinite(sign.yaw));
  }
  assert.ok(
    signs.some(
      (s) => s.id === "road-sign:stop:U981Z1P" && s.name === "Koleje Strahov",
    ),
  );
  assert.equal(signs.filter((s) => s.kind === "crossing").length, 2);
  assert.ok(signs.some((s) => s.kind === "parking"));
});

test("Opposing bicycle lanes put their glyph V=1 at their own forward end", () => {
  const bikes = buildRoadDetailPlan().paint.filter((p) => p.kind === "bicycle");
  assert.deepEqual([...new Set(bikes.map((p) => p.laneSide))].sort(), [-1, 1]);
  for (const bike of bikes) {
    const feature = STREET_FEATURES.find((f) => f.id === bike.sourceWay)!;
    const segment = Number(bike.id.split(":")[2]);
    const a = feature.points[segment - 1],
      b = feature.points[segment];
    const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const direction =
      ((b[0] - a[0]) * bike.forward[0] + (b[1] - a[1]) * bike.forward[1]) /
      length;
    assert.ok(Math.abs(direction - bike.laneSide) < 1e-12, bike.id);
    const data = roadPaintVertexData([bike]);
    const projected = data.positions
      .filter((_, i) => i % 3 === 0)
      .map(
        (x, i) =>
          x * bike.forward[0] + data.positions[i * 3 + 2] * bike.forward[1],
      );
    for (let i = 0; i < projected.length; i++)
      for (let j = i + 1; j < projected.length; j++) {
        // Increasing V must mean forward in this lane, including the reverse lane.
        const dv = data.uvs[j * 2 + 1] - data.uvs[i * 2 + 1];
        if (Math.abs(dv) > 1e-8)
          assert.ok((projected[j] - projected[i]) * dv > 0, bike.id);
      }
  }
});

test("Actual separate sign meshes stand on terrain and plate front stays outside its opaque back", () => {
  const engine = new NullEngine(),
    scene = new Scene(engine);
  scene.useRightHandedSystem = true;
  const built = buildRoadDetails(scene);
  for (const sign of built.signs) {
    const plate = scene.getMeshByName(sign.id + ":plate")!,
      back = scene.getMeshByName(sign.id + ":back")!,
      pole = scene.getMeshByName(sign.id + ":pole")!;
    assert.ok(plate && back && pole, sign.id);
    plate.computeWorldMatrix(true);
    back.computeWorldMatrix(true);
    pole.computeWorldMatrix(true);
    assert.ok(
      Math.abs(
        pole.getBoundingInfo().boundingBox.minimumWorld.y -
          groundHeight(sign.x, sign.z),
      ) < 1e-6,
      sign.id,
    );
    const normal = Vector3.TransformNormal(
      new Vector3(0, 0, -1),
      plate.getWorldMatrix(),
    ).normalize();
    const gap =
      Vector3.Dot(
        plate.getAbsolutePosition().subtract(back.getAbsolutePosition()),
        normal,
      ) - 0.0125;
    // Public world matrices use Float32 at coordinates up to 280 m; allow 20 µm.
    assert.ok(Math.abs(gap - 0.001) < 2e-5, sign.id);
    assert.equal(plate.material!.backFaceCulling, true, sign.id);
    if (sign.kind === "parking") {
      const road = nearestStreet(sign.x, sign.z, true)!;
      assert.ok(
        Vector3.Dot(normal, new Vector3(road.x - sign.x, 0, road.z - sign.z)) >
          0,
        "parking P faces the road",
      );
    }
  }
  scene.dispose();
  engine.dispose();
});

test("Right-handed camera reads sign UVs left to right and pole stays behind the opaque plate", () => {
  const engine = new NullEngine(),
    scene = new Scene(engine);
  scene.useRightHandedSystem = true;
  const camera = new UniversalCamera(
    "sign projection camera",
    Vector3.Zero(),
    scene,
  );
  const { signs } = buildRoadDetails(scene);
  const viewport = new Viewport(0, 0, 1280, 720);
  for (const sign of signs) {
    const plate = scene.getMeshByName(sign.id + ":plate")!;
    const pole = scene.getMeshByName(sign.id + ":pole")!;
    plate.computeWorldMatrix(true);
    pole.computeWorldMatrix(true);
    const origin = plate.getAbsolutePosition();
    const normal = Vector3.TransformNormal(
      Vector3.FromArray(plate.getVerticesData(VertexBuffer.NormalKind)!, 0),
      plate.getWorldMatrix(),
    ).normalize();
    camera.position.copyFrom(origin.add(normal.scale(3.3)));
    camera.setTarget(origin);
    camera.getViewMatrix(true);
    camera.getProjectionMatrix(true);
    const positions = plate.getVerticesData(VertexBuffer.PositionKind)!;
    const uvs = plate.getVerticesData(VertexBuffer.UVKind)!;
    const projected = Array.from(
      { length: positions.length / 3 },
      (_, index) => ({
        u: uvs[index * 2],
        v: uvs[index * 2 + 1],
        screen: Vector3.Project(
          Vector3.FromArray(positions, index * 3),
          plate.getWorldMatrix(),
          camera.getTransformationMatrix(),
          viewport,
        ),
      }),
    );
    for (const v of [0, 1]) {
      const left = projected.find((p) => p.v === v && p.u === 0)!;
      const right = projected.find((p) => p.v === v && p.u === 1)!;
      assert.ok(
        left.screen.x < right.screen.x,
        `${sign.id}: glyph U must increase screen-right`,
      );
    }
    for (const u of [0, 1]) {
      const top = projected.find((p) => p.u === u && p.v === 1)!;
      const bottom = projected.find((p) => p.u === u && p.v === 0)!;
      assert.ok(
        top.screen.y < bottom.screen.y,
        `${sign.id}: Canvas upload remains upright`,
      );
    }
    const polePositions = pole.getVerticesData(VertexBuffer.PositionKind)!;
    for (let index = 0; index < polePositions.length; index += 3) {
      const vertex = Vector3.TransformCoordinates(
        Vector3.FromArray(polePositions, index),
        pole.getWorldMatrix(),
      );
      assert.ok(
        Vector3.Dot(vertex.subtract(origin), normal) < -0.02,
        `${sign.id}: the whole post stays behind the plate`,
      );
    }
  }
  scene.dispose();
  engine.dispose();
});
