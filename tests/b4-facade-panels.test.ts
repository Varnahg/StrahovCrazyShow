import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";

type Opening = { u: number; v: number; w: number; h: number };
type Face = { id: string; width: number; height: number; openings: Opening[] };
type Geometry = {
  positions: number[];
  normals: number[];
  uvs: number[];
  indices: number[];
};
type Kit = {
  level: string;
  sourcePlanSha256: string;
  faces: Record<
    string,
    {
      width: number;
      height: number;
      openingCount: number;
      parts: { materialRole: string; geometry: Geometry }[];
    }
  >;
};
const sourcePath = "shared/data/b4-facade-plan.json";
const sourceBytes = readFileSync(sourcePath);
const plan = JSON.parse(sourceBytes.toString()) as { faces: Face[] };
const near = JSON.parse(
  readFileSync("shared/data/b4-panel-kit.json", "utf8"),
) as Kit;
const highest = JSON.parse(
  readFileSync("assets/blender/b4-panel-kit/highest-geometry.json", "utf8"),
) as Kit;
type V3 = [number, number, number];
const p = (g: Geometry, i: number): V3 =>
  g.positions.slice(i * 3, i * 3 + 3) as V3;
const minus = (a: V3, b: V3): V3 => a.map((v, i) => v - b[i]) as V3;
const cross = (a: V3, b: V3): V3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const dot = (a: V3, b: V3) => a.reduce((v, n, i) => v + n * b[i], 0);

function intersections(g: Geometry, x: number, y: number) {
  const result: number[] = [];
  for (let i = 0; i < g.indices.length; i += 3) {
    const [a, b, c] = g.indices.slice(i, i + 3).map((id) => p(g, id));
    const determinant =
      (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1]);
    if (Math.abs(determinant) < 1e-12) continue;
    const u =
      ((b[1] - c[1]) * (x - c[0]) + (c[0] - b[0]) * (y - c[1])) / determinant;
    const v =
      ((c[1] - a[1]) * (x - c[0]) + (a[0] - c[0]) * (y - c[1])) / determinant;
    if (u >= -1e-7 && v >= -1e-7 && u + v <= 1 + 1e-7)
      result.push(u * a[2] + v * b[2] + (1 - u - v) * c[2]);
  }
  return result;
}

test("B4 panel geometry is bound to the exact three-face source plan", () => {
  const hash = createHash("sha256").update(sourceBytes).digest("hex");
  assert.equal(plan.faces.length, 3);
  for (const kit of [near, highest]) {
    assert.equal(kit.sourcePlanSha256, hash);
    assert.deepEqual(
      Object.keys(kit.faces).sort(),
      plan.faces.map((f) => f.id).sort(),
    );
    for (const face of plan.faces) {
      const output = kit.faces[face.id];
      assert.equal(output.width, face.width);
      assert.equal(output.height, face.height);
      assert.equal(output.openingCount, face.openings.length);
      assert.equal(output.parts.length, 1);
      assert.equal(output.parts[0].materialRole, "greyPanel");
    }
  }
});

test("both Blender LODs leave every authoritative opening clear instead of overlaying opaque walls", () => {
  for (const kit of [near, highest])
    for (const face of plan.faces) {
      const geometry = kit.faces[face.id].parts[0].geometry;
      for (const opening of face.openings) {
        for (const tx of [0.13, 0.5, 0.87])
          for (const ty of [0.13, 0.5, 0.87]) {
            assert.equal(
              intersections(
                geometry,
                opening.u + opening.w * tx,
                opening.v + opening.h * ty,
              ).length,
              0,
              `${kit.level} ${face.id} blocked opening`,
            );
          }
        const x = opening.u - 0.035,
          y = opening.v + opening.h * 0.431;
        if (
          x > 0 &&
          !face.openings.some(
            (o) => x > o.u && x < o.u + o.w && y > o.v && y < o.v + o.h,
          )
        ) {
          const hits = intersections(geometry, x, y);
          assert.ok(
            hits.some((z) => z > -0.008),
            `${kit.level} missing adjacent front wall`,
          );
          assert.ok(
            hits.some((z) => Math.abs(z + 0.02) < 1e-7),
            `${kit.level} missing adjacent shell back`,
          );
        }
      }
    }
});

test("B4 surfaces retain valid real depth, exact projected coverage and geometric normals", () => {
  for (const kit of [near, highest])
    for (const face of plan.faces) {
      const g = kit.faces[face.id].parts[0].geometry;
      assert.equal(g.positions.length, g.normals.length);
      assert.equal(g.uvs.length, (g.positions.length / 3) * 2);
      assert.ok(
        [...g.positions, ...g.normals, ...g.uvs].every(Number.isFinite),
      );
      let positiveArea = 0,
        negativeArea = 0;
      for (let i = 0; i < g.indices.length; i += 3) {
        const ids = g.indices.slice(i, i + 3),
          [a, b, c] = ids.map((id) => p(g, id));
        const normal = cross(minus(b, a), minus(c, a)),
          length = Math.hypot(...normal);
        assert.ok(length > 1e-12, `${face.id} zero-area triangle`);
        if (normal[2] > 0) positiveArea += normal[2] / 2;
        else negativeArea -= normal[2] / 2;
        for (const id of ids) {
          const authored = g.normals.slice(id * 3, id * 3 + 3) as V3;
          assert.ok(Math.abs(Math.hypot(...authored) - 1) < 2e-6);
          assert.ok(
            dot(normal, authored) / length > 0.999,
            `${face.id} smoothing changes a planar construction face`,
          );
        }
      }
      const expected =
        face.width * face.height -
        face.openings.reduce((sum, o) => sum + o.w * o.h, 0);
      assert.ok(
        Math.abs(positiveArea - expected) < 1e-4,
        `${face.id} front area ${positiveArea}/${expected}`,
      );
      assert.ok(
        Math.abs(negativeArea - expected) < 1e-4,
        `${face.id} back area ${negativeArea}/${expected}`,
      );
      const zs = g.positions.filter((_, i) => i % 3 === 2);
      for (const [axis, maximum] of [
        [0, face.width],
        [1, face.height],
      ] as const) {
        const values = g.positions.filter((_, i) => i % 3 === axis);
        assert.ok(Math.abs(Math.min(...values)) < 2e-6);
        assert.ok(
          Math.abs(Math.max(...values) - maximum) < 2e-6,
          `${face.id} wall extends past the canonical edge or height`,
        );
      }
      assert.ok(Math.min(...zs) >= -0.02000001 && Math.max(...zs) <= 1e-8);
      assert.ok(
        zs.some((z) => z < -0.0059 && z > -0.0061),
        "joints must have real 6mm depth",
      );
      assert.ok(
        zs.some((z) => Math.abs(z) < 1e-8),
        "panel faces remain at shared facade plane",
      );
    }
});

test("B4 Blender master was actually reopened and all delivered geometry matches its audit", () => {
  const audit = JSON.parse(
    readFileSync(
      "docs/reality-pack/b4-facade-panels-20261012/blender-export-audit.json",
      "utf8",
    ),
  );
  assert.equal(audit.nativeReopenPassed, true);
  assert.equal(audit.gpuRender, false);
  assert.equal(audit.cpuThreads, 2);
  assert.equal(Object.keys(audit.nativeReopenGeometry).length, 6);
  for (const result of Object.values(audit.nativeReopenGeometry) as {
    exactGeometryMatch: boolean;
    geometrySha256: string;
  }[]) {
    assert.equal(result.exactGeometryMatch, true);
    assert.match(result.geometrySha256, /^[0-9a-f]{64}$/);
  }
  for (const file of audit.files) {
    const bytes = readFileSync(file.path);
    assert.equal(bytes.length, file.bytes, file.path);
    assert.equal(
      createHash("sha256").update(bytes).digest("hex"),
      file.sha256,
      file.path,
    );
  }
  for (const level of ["near", "highest"])
    for (const result of Object.values(audit.levels[level]) as {
      boundaryEdges: number;
      nonManifoldEdges: number;
      degenerateTriangles: number;
    }[]) {
      assert.equal(result.boundaryEdges, 0);
      assert.equal(result.nonManifoldEdges, 0);
      assert.equal(result.degenerateTriangles, 0);
    }
});

function readGlb(path: string) {
  const bytes = readFileSync(path),
    jsonLength = bytes.readUInt32LE(12);
  assert.equal(bytes.readUInt32LE(0), 0x46546c67);
  const document = JSON.parse(bytes.subarray(20, 20 + jsonLength).toString());
  const binary = bytes.subarray(28 + jsonLength);
  const accessor = (id: number): number[] => {
    const a = document.accessors[id],
      view = document.bufferViews[a.bufferView];
    const count = (
      { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 } as Record<string, number>
    )[a.type];
    const size = (
      { 5121: 1, 5123: 2, 5125: 4, 5126: 4 } as Record<number, number>
    )[a.componentType];
    assert.ok(count && size);
    const start = (view.byteOffset ?? 0) + (a.byteOffset ?? 0),
      result = [];
    for (let i = 0; i < a.count; i++)
      for (let j = 0; j < count; j++) {
        const at = start + i * (view.byteStride ?? count * size) + j * size;
        result.push(
          a.componentType === 5126
            ? binary.readFloatLE(at)
            : a.componentType === 5125
              ? binary.readUInt32LE(at)
              : a.componentType === 5123
                ? binary.readUInt16LE(at)
                : binary.readUInt8(at),
        );
      }
    return result;
  };
  return { document, accessor };
}

function triangleKeys(positions: number[], indices: number[]) {
  const keys = [];
  for (let i = 0; i < indices.length; i += 3) {
    const corners = indices.slice(i, i + 3).map((id) =>
      positions
        .slice(id * 3, id * 3 + 3)
        .map((v) => Math.round(v * 1e5))
        .join(","),
    );
    keys.push(
      [0, 1, 2]
        .map((n) => [...corners.slice(n), ...corners.slice(0, n)].join("/"))
        .sort()[0],
    );
  }
  return keys.sort();
}

function assertPortableAttributes(
  source: Geometry,
  actual: Geometry,
  label: string,
) {
  // A position may legitimately have several hard-edge normals and UV seams.
  // Match its complete corner tuple instead of assuming exporter vertex order.
  const key = (values: number[], id: number) =>
    values
      .slice(id * 3, id * 3 + 3)
      .map((v) => Math.round(v * 1e5))
      .join(",");
  const candidates = new Map<string, number[]>();
  // Blender 5.2's bundled io_scene_gltf2 rounds corner normals to four decimals
  // (ROUNDING_DIGIT in io/com/constants.py), then normalizes in float32.
  // Compare that defined portable representation, retaining the strict error.
  const portableNormals = source.normals.slice();
  const exporterRound = (value: number) => {
    // NumPy applies float32 multiplication and ties-to-even rounding; JavaScript
    // Math.round alone differs exactly at e.g. the authored 0.94865 normal.
    const scaled = Math.fround(Math.fround(value) * 1e4);
    const lower = Math.floor(scaled);
    const rounded =
      scaled - lower === 0.5 ? lower + Math.abs(lower % 2) : Math.round(scaled);
    return Math.fround(rounded / 1e4);
  };
  for (let id = 0; id < source.positions.length / 3; id++) {
    const position = key(source.positions, id);
    const ids = candidates.get(position) ?? [];
    ids.push(id);
    candidates.set(position, ids);
    const rounded = source.normals.slice(id * 3, id * 3 + 3).map(exporterRound);
    const length = Math.hypot(...rounded);
    rounded.forEach((v, axis) => {
      portableNormals[id * 3 + axis] = v / length;
    });
  }
  assert.equal(actual.normals.length, actual.positions.length, label);
  assert.equal(actual.uvs.length, (actual.positions.length / 3) * 2, label);
  for (let id = 0; id < actual.positions.length / 3; id++) {
    const normal = actual.normals.slice(id * 3, id * 3 + 3);
    assert.ok(
      Math.abs(Math.hypot(...normal) - 1) < 2e-6,
      `${label} unit normal`,
    );
    const matches = candidates.get(key(actual.positions, id)) ?? [];
    assert.ok(
      matches.some(
        (candidate) =>
          [0, 1, 2].every(
            (axis) =>
              Math.abs(
                actual.positions[id * 3 + axis] -
                  source.positions[candidate * 3 + axis],
              ) < 2e-6 &&
              Math.abs(
                actual.normals[id * 3 + axis] -
                  portableNormals[candidate * 3 + axis],
              ) < 2e-6,
          ) &&
          Math.abs(actual.uvs[id * 2] - source.uvs[candidate * 2]) < 2e-6 &&
          // Blender's glTF exporter converts the texture V origin, not metre scale.
          Math.abs(
            actual.uvs[id * 2 + 1] - (1 - source.uvs[candidate * 2 + 1]),
          ) < 2e-6,
      ),
      `${label} unmatched exported normal/UV at vertex ${id}`,
    );
  }
}

test("B4 portable GLBs contain the same authored near/highest wall triangles as the runtime contract", () => {
  for (const kit of [near, highest]) {
    const glb = readGlb(
      `public/models/architecture/b4-facade/b4-facade-panels-${kit.level}.glb`,
    );
    const found = new Set<string>();
    for (const node of glb.document.nodes) {
      const id = node.extras?.faceId as string | undefined;
      if (!id || node.mesh === undefined) continue;
      found.add(id);
      const parts = glb.document.meshes[node.mesh].primitives;
      assert.equal(parts.length, 1);
      const primitive = parts[0],
        source = kit.faces[id].parts[0].geometry;
      assert.deepEqual(
        triangleKeys(
          glb.accessor(primitive.attributes.POSITION),
          glb.accessor(primitive.indices),
        ),
        triangleKeys(source.positions, source.indices),
        `${kit.level} ${id}`,
      );
      assert.ok(
        primitive.attributes.NORMAL !== undefined &&
          primitive.attributes.TEXCOORD_0 !== undefined,
      );
      assertPortableAttributes(
        source,
        {
          positions: glb.accessor(primitive.attributes.POSITION),
          normals: glb.accessor(primitive.attributes.NORMAL),
          uvs: glb.accessor(primitive.attributes.TEXCOORD_0),
          indices: glb.accessor(primitive.indices),
        },
        `${kit.level} ${id}`,
      );
    }
    assert.deepEqual([...found].sort(), Object.keys(kit.faces).sort());
  }
});
