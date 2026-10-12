import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import kit from "../shared/data/building-window-kit.json";

type Primitive = (typeof kit.primitives)[keyof typeof kit.primitives];
type V3 = [number, number, number];
const vec = (values: number[], i: number): V3 =>
  values.slice(i * 3, i * 3 + 3) as V3;
const sub = (a: V3, b: V3): V3 => a.map((v, i) => v - b[i]) as V3;
const dot = (a: V3, b: V3) => a.reduce((v, x, i) => v + x * b[i], 0);
const cross = (a: V3, b: V3): V3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];

function resized(
  part: Primitive,
  width: number,
  height: number,
  depth: number,
) {
  return part.positions.map(
    (v, i) =>
      v +
      part.resizeWeights[i] *
        [
          width - part.nominalWidth,
          height - part.nominalHeight,
          kit.nominal.depth - depth,
        ][i % 3],
  );
}

test("Blender kit retains valid evaluated faces, metric UVs and finite unit normals", () => {
  assert.equal(kit.schemaVersion, 1);
  assert.equal(kit.level, "near");
  assert.deepEqual(Object.keys(kit.primitives).sort(), [
    "gasket",
    "mullion",
    "outerFrame",
    "reveal",
    "sash",
    "sill",
    "transom",
  ]);
  for (const [name, part] of Object.entries(kit.primitives)) {
    assert.equal(part.positions.length, part.normals.length, name);
    assert.equal(part.positions.length, part.resizeWeights.length, name);
    assert.equal(part.uvs.length / 2, part.positions.length / 3, name);
    assert.equal(part.indices.length / 3, part.triangles, name);
    assert.ok(
      [...part.positions, ...part.normals, ...part.uvs].every(Number.isFinite),
      name,
    );
    assert.ok(
      part.resizeWeights.every((v) => v === 0 || v === 1),
      name,
    );
    for (let i = 0; i < part.normals.length / 3; i++)
      assert.ok(Math.abs(Math.hypot(...vec(part.normals, i)) - 1) < 2e-6, name);
    for (let i = 0; i < part.indices.length; i += 3) {
      const ids = part.indices.slice(i, i + 3),
        [a, b, c] = ids.map((id) => vec(part.positions, id));
      const normal = cross(sub(b, a), sub(c, a));
      assert.ok(
        Math.hypot(...normal) > 1e-12,
        `${name} degenerate triangle ${i / 3}`,
      );
      for (const id of ids)
        assert.ok(
          dot(normal, vec(part.normals, id)) >= -1e-10,
          `${name} opposed normal`,
        );
    }
  }
  assert.equal(kit.nominal.glassZ, -0.182);
  assert.ok(kit.primitives.sill.bounds.max[2] > 0.075);
  assert.ok(kit.primitives.sill.bounds.min[1] < -0.065);
  assert.ok(
    kit.primitives.sash.bounds.max[2] > kit.primitives.gasket.bounds.max[2],
  );
});

test("actual exported corner weights preserve millimetre profiles across real opening sizes", () => {
  for (const [name, part] of Object.entries(kit.primitives)) {
    for (const [width, height, depth] of [
      [0.62, 0.68, 0.2],
      [2.18, 1.5, 0.18],
      [6.3, 1.6, 0.18],
    ]) {
      const w = name === "mullion" ? part.nominalWidth : width;
      const h =
        name === "transom" || name === "sill" ? part.nominalHeight : height;
      const p = resized(part, w, h, depth);
      for (let i = 0; i < p.length; i++) {
        const axis = i % 3;
        // Distance from the corresponding construction edge must remain exact.
        if (axis === 0)
          assert.ok(
            Math.abs(
              p[i] -
                part.resizeWeights[i] * w -
                (part.positions[i] - part.resizeWeights[i] * part.nominalWidth),
            ) < 1e-10,
          );
        if (axis === 1)
          assert.ok(
            Math.abs(
              p[i] -
                part.resizeWeights[i] * h -
                (part.positions[i] -
                  part.resizeWeights[i] * part.nominalHeight),
            ) < 1e-10,
          );
      }
      for (let i = 0; i < part.indices.length; i += 3) {
        const [a, b, c] = part.indices.slice(i, i + 3).map((id) => vec(p, id));
        assert.ok(
          Math.hypot(...cross(sub(b, a), sub(c, a))) > 1e-12,
          `${name} resized face collapsed`,
        );
      }
    }
  }
  // No full-window geometry is smuggled into the glass or runtime night masks.
  assert.ok(
    !Object.values(kit.primitives).some((p) => String(p.role) === "glass"),
  );
  assert.equal(kit.construction.mullionWidth, 0.036);
  assert.equal(kit.construction.outerFrameWidth, 0.045);
});

function glb(path: string) {
  const buffer = readFileSync(path);
  assert.equal(buffer.readUInt32LE(0), 0x46546c67);
  const jsonLength = buffer.readUInt32LE(12);
  const data = JSON.parse(buffer.subarray(20, 20 + jsonLength).toString());
  const binary = buffer.subarray(20 + jsonLength + 8);
  function accessor(index: number): number[] {
    const a = data.accessors[index],
      view = data.bufferViews[a.bufferView];
    const components = (
      { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 } as Record<string, number>
    )[a.type];
    const componentBytes = (
      { 5121: 1, 5123: 2, 5125: 4, 5126: 4 } as Record<number, number>
    )[a.componentType];
    assert.ok(components && componentBytes);
    const start = (view.byteOffset ?? 0) + (a.byteOffset ?? 0);
    const values = [];
    for (let i = 0; i < a.count; i++)
      for (let c = 0; c < components; c++) {
        const offset =
          start +
          i * (view.byteStride ?? components * componentBytes) +
          c * componentBytes;
        values.push(
          a.componentType === 5126
            ? binary.readFloatLE(offset)
            : a.componentType === 5125
              ? binary.readUInt32LE(offset)
              : a.componentType === 5123
                ? binary.readUInt16LE(offset)
                : binary.readUInt8(offset),
        );
      }
    return values;
  }
  return { data, accessor };
}

function triangleSignatures(positions: number[], indices: number[]) {
  const result = [];
  for (let i = 0; i < indices.length; i += 3) {
    const vertices = indices.slice(i, i + 3).map((id) =>
      vec(positions, id)
        .map((v) => Math.round(v * 1e5))
        .join(","),
    );
    // Cyclic rotation is allowed; reversal (wrong winding) is not.
    result.push(
      [0, 1, 2]
        .map((n) => [...vertices.slice(n), ...vertices.slice(0, n)].join("/"))
        .sort()[0],
    );
  }
  return result.sort();
}

test("portable GLB contains the same Blender triangles as runtime JSON, not replacement shapes", () => {
  for (const level of ["near", "highest"]) {
    const source =
      level === "near"
        ? kit
        : JSON.parse(
            readFileSync(
              "assets/blender/building-window-kit/highest-geometry.json",
              "utf8",
            ),
          );
    const parsed = glb(
      `public/models/building-window-kit/window-kit-profiles-${level}.glb`,
    );
    const found = new Set<string>();
    for (const node of parsed.data.nodes) {
      const id = node.extras?.sourcePrimitive as
        keyof typeof kit.primitives | undefined;
      if (!id || node.mesh === undefined) continue;
      found.add(id);
      const primitives = parsed.data.meshes[node.mesh].primitives;
      assert.equal(primitives.length, 1, id);
      const p = primitives[0];
      const positions = parsed.accessor(p.attributes.POSITION),
        indices = parsed.accessor(p.indices);
      assert.deepEqual(
        triangleSignatures(positions, indices),
        triangleSignatures(
          source.primitives[id].positions,
          source.primitives[id].indices,
        ),
        `${level} ${id}`,
      );
      assert.equal(
        parsed.accessor(p.attributes.TEXCOORD_0).length,
        (positions.length / 3) * 2,
      );
      assert.equal(
        parsed.accessor(p.attributes.NORMAL).length,
        positions.length,
      );
      assert.equal(
        parsed.data.materials[p.material].name,
        "window-profile:" + kit.primitives[id].role,
      );
    }
    assert.deepEqual([...found].sort(), Object.keys(kit.primitives).sort());
  }
});

test("highest editable master and all delivered evaluated exports match reopened audit", () => {
  const audit = JSON.parse(
    readFileSync(
      "docs/reality-pack/building-window-kit-20261012/blender-export-audit.json",
      "utf8",
    ),
  );
  assert.equal(audit.reopenPassed, true);
  assert.equal(audit.gpuRender, false);
  assert.equal(audit.cpuThreads, 2);
  for (const file of audit.files) {
    const bytes = readFileSync(file.path);
    assert.equal(bytes.length, file.bytes, file.path);
    assert.equal(
      createHash("sha256").update(bytes).digest("hex"),
      file.sha256,
      file.path,
    );
  }
  const highest = JSON.parse(
    readFileSync(
      "assets/blender/building-window-kit/highest-geometry.json",
      "utf8",
    ),
  );
  assert.ok(highest.totalPrimitiveTriangles > kit.totalPrimitiveTriangles);
  assert.ok(
    kit.totalPrimitiveTriangles < 350,
    "secondary sub-mm bevel loops must not enter every runtime window",
  );
  assert.equal(
    highest.construction.dimensionsStatus,
    "architectural-game-estimate-not-survey",
  );
  assert.ok(
    highest.sources.some(
      (s: { id: string }) => s.id === "ctu-exteriors-2024-3",
    ),
  );
  assert.ok(highest.sources.some((s: { id: string }) => s.id === "b12-2009"));
  for (const [data, budget] of [
    [kit, 500],
    [highest, 1500],
  ] as const) {
    const p = data.primitives;
    const fourPane =
      p.outerFrame.triangles +
      p.reveal.triangles +
      p.sill.triangles +
      4 * (p.sash.triangles + p.gasket.triangles) +
      3 * p.mullion.triangles;
    assert.ok(
      fourPane <= budget,
      `${data.level} four-pane budget ${fourPane}/${budget}`,
    );
  }
});
