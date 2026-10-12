import test from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  readFileSync,
  existsSync,
  unlinkSync,
  rmdirSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Matrix, Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector";
import {
  ARCHIVE_COORDINATE_STEP,
  bakeBuildingArchiveGeometry,
  writeBuildingArchive,
  verifyBuildingArchiveAttributes,
} from "../scripts/building-archive-transfer";

test("building archive preserves physical normals under nonuniform scale and reflection", () => {
  const normal = Vector3.Cross(
    new Vector3(1, 0, 1),
    new Vector3(0, 1, 1),
  ).normalize();
  const data = {
    positions: [0, 0, 0, 1, 0, 1, 0, 1, 1],
    normals: [...normal.asArray(), ...normal.asArray(), ...normal.asArray()],
    indices: [0, 2, 1],
    uvs: [0, 0, 1, 0, 0, 1],
    colors: [1, 1, 1, 1, 0.22, 0.24, 0.22, 1, 1, 1, 1, 1],
  };
  const original = JSON.stringify(data),
    origin = { x: 100, y: 30, z: -70 };
  for (const sx of [2, -2]) {
    const world = Matrix.Compose(
      new Vector3(sx, 3, 0.5),
      Quaternion.FromEulerAngles(0.2, 0.7, -0.1),
      new Vector3(111.234567, 31.000001, -75.987654),
    );
    const result = bakeBuildingArchiveGeometry(data, world, origin);
    assert.deepEqual(result.uvs, data.uvs);
    assert.deepEqual(result.colors, data.colors);
    assert.ok(
      result.maxCoordinateRoundingErrorMetres <=
        ARCHIVE_COORDINATE_STEP / 2 + 1e-12,
    );
    const [a, b, c] = result.indices.map((index) =>
      Vector3.FromArray(result.positions, index * 3),
    );
    const faceNormal = Vector3.Cross(b.subtract(a), c.subtract(a)).normalize();
    for (let i = 0; i < result.normals.length; i += 3)
      assert.ok(
        Vector3.Dot(
          faceNormal,
          Vector3.FromArray(result.normals, i).normalize(),
        ) >
          1 - 1e-6,
      );
    const oldIncorrectNormal = Vector3.TransformNormal(
      normal,
      world,
    ).normalize();
    assert.ok(
      Math.abs(Vector3.Dot(oldIncorrectNormal, faceNormal)) < 0.8,
      "fixture detects the old forward-normal transform",
    );
    for (let i = 0; i < data.positions.length; i += 3) {
      const expected = Vector3.TransformCoordinates(
        Vector3.FromArray(data.positions, i),
        world,
      ).subtract(new Vector3(origin.x, origin.y, origin.z));
      assert.ok(
        expected.subtract(Vector3.FromArray(result.positions, i)).length() <
          0.000001,
      );
    }
  }
  assert.equal(JSON.stringify(data), original);
});

test("streamed building archive is valid and a failed export preserves the previous file", () => {
  const folder = mkdtempSync(join(tmpdir(), "strahov-building-archive-")),
    path = join(folder, "source-plan.json");
  try {
    const models = [
      { identity: { sourceId: "one" }, colors: [0.22, 0.24, 0.22, 1] },
      { identity: { sourceId: "two" }, positions: [0, 1, 2] },
    ];
    const result = writeBuildingArchive(
      path,
      { schemaVersion: 2, coordinateStepMetres: ARCHIVE_COORDINATE_STEP },
      models.values(),
    );
    assert.equal(result.models, 2);
    const bytes = readFileSync(path);
    assert.equal(result.bytes, bytes.length);
    assert.deepEqual(JSON.parse(bytes.toString()), {
      schemaVersion: 2,
      coordinateStepMetres: ARCHIVE_COORDINATE_STEP,
      models,
    });
    function* fails() {
      yield models[0];
      throw new Error("input interrupted");
    }
    assert.throws(
      () => writeBuildingArchive(path, {}, fails()),
      /input interrupted/,
    );
    assert.deepEqual(readFileSync(path), bytes);
    assert.equal(existsSync(path + ".writing"), false);
    assert.throws(
      () => writeBuildingArchive(path, {}, [undefined]),
      /not JSON serializable/,
    );
    assert.deepEqual(readFileSync(path), bytes);
    writeBuildingArchive(path, {}, []);
    assert.deepEqual(JSON.parse(readFileSync(path, "utf8")), { models: [] });
  } finally {
    if (existsSync(path)) unlinkSync(path);
    if (existsSync(path + ".writing")) unlinkSync(path + ".writing");
    rmdirSync(folder);
  }
});

test("archive attribute audit detects erased bevel normals, gasket colours and UV seams", () => {
  const source = {
    name: "window hard edge",
    positions: [0.1, 0, 0, 0.1, 0, 0],
    normals: [1, 0, 0, 0, 1, 0],
    uvs: [0, 0.25, 0.5, 0.75],
    colors: [0.22, 0.24, 0.22, 1, 1, 1, 1, 1],
  };
  const exported = {
    positions: [
      [Math.fround(0.1), 0, 0],
      [Math.fround(0.1), 0, 0],
    ],
    normals: [
      [0, 1, 0],
      [1, 0, 0],
    ],
    uvs: [
      [0.5, 0.25],
      [0, 0.75],
    ],
    colors: [
      [1, 1, 1, 1],
      [56 / 255, 61 / 255, 56 / 255, 1],
    ],
  };
  assert.equal(
    verifyBuildingArchiveAttributes(source, exported).coloredVertices,
    2,
  );
  assert.throws(
    () =>
      verifyBuildingArchiveAttributes(source, {
        ...exported,
        normals: [
          [0, 1, 0],
          [0, 1, 0],
        ],
      }),
    /changed/,
  );
  assert.throws(
    () =>
      verifyBuildingArchiveAttributes(source, {
        ...exported,
        colors: [
          [1, 1, 1, 1],
          [1, 1, 1, 1],
        ],
      }),
    /changed/,
  );
  assert.throws(
    () =>
      verifyBuildingArchiveAttributes(source, {
        ...exported,
        uvs: [
          [0.5, 0.75],
          [0, 0.25],
        ],
      }),
    /changed/,
  );
  assert.throws(
    () =>
      verifyBuildingArchiveAttributes(source, {
        ...exported,
        colors: undefined,
      }),
    /lost vertex attributes/,
  );
});
