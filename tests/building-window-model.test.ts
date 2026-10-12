import test from "node:test";
import assert from "node:assert/strict";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import {
  BUILDING_WINDOW_KIT,
  appendBuildingDetailGeometry,
  createBuildingWindowModelCache,
  resizeWindowPrimitive,
  transformWindowNormal,
  type WindowModelGeometry,
} from "../client/building-window-model";
import {
  architectureEdges,
  planFacadeOpenings,
  b6ExteriorEdges,
} from "../client/architecture-reality";
import { BUILDINGS, buildingArchitecture } from "../shared/world";
import evidence from "../shared/data/facade-reality.json";

function auditGeometry(
  geometry: WindowModelGeometry,
  label: string,
  minimumNormalDot = 0.93,
) {
  const { positions, normals, uvs, indices } = geometry;
  assert.equal(normals.length, positions.length, label);
  assert.equal(uvs.length, (positions.length / 3) * 2, label);
  assert.ok(
    positions.every(Number.isFinite) && normals.every(Number.isFinite),
    label,
  );
  for (let i = 0; i < indices.length; i += 3) {
    const a = Vector3.FromArray(positions, indices[i] * 3),
      b = Vector3.FromArray(positions, indices[i + 1] * 3),
      c = Vector3.FromArray(positions, indices[i + 2] * 3),
      ab = b.subtract(a),
      ac = c.subtract(a),
      face = Vector3.Cross(ab, ac);
    assert.ok(
      face.lengthSquared() > 1e-18,
      `${label}: nondegenerate triangle ${i / 3}`,
    );
    face.normalize();
    for (const vertex of indices.slice(i, i + 3)) {
      const normal = Vector3.FromArray(normals, vertex * 3);
      assert.ok(Math.abs(normal.length() - 1) < 2e-6, `${label}: unit normal`);
      assert.ok(
        Vector3.Dot(face, normal) > minimumNormalDot,
        `${label}: winding/shading normal`,
      );
    }
    const ai = indices[i] * 2,
      bi = indices[i + 1] * 2,
      ci = indices[i + 2] * 2;
    const du1 = uvs[bi] - uvs[ai],
      dv1 = uvs[bi + 1] - uvs[ai + 1],
      du2 = uvs[ci] - uvs[ai],
      dv2 = uvs[ci + 1] - uvs[ai + 1],
      det = du1 * dv2 - du2 * dv1;
    assert.ok(Math.abs(det) > 1e-12, `${label}: UV tangent area`);
    const tangent = ab
      .scale(dv2)
      .subtract(ac.scale(dv1))
      .scale(1 / det)
      .normalize();
    assert.ok(
      Math.abs(Vector3.Dot(tangent, face)) < 1e-4,
      `${label}: geometric tangent`,
    );
  }
}

test("runtime window kit retains evaluated Blender profiles and valid authored topology", () => {
  assert.equal(BUILDING_WINDOW_KIT.schemaVersion, 1);
  assert.equal(BUILDING_WINDOW_KIT.level, "near");
  assert.deepEqual(Object.keys(BUILDING_WINDOW_KIT.primitives).sort(), [
    "gasket",
    "mullion",
    "outerFrame",
    "reveal",
    "sash",
    "sill",
    "transom",
  ]);
  for (const [name, primitive] of Object.entries(
    BUILDING_WINDOW_KIT.primitives,
  )) {
    assert.equal(primitive.positions.length, primitive.resizeWeights.length);
    assert.ok(
      primitive.resizeWeights.every((weight) => weight === 0 || weight === 1),
    );
    auditGeometry(primitive, name);
  }
});

test("normal transport uses inverse transpose under nonuniform stretch and shear", () => {
  const diagonal = transformWindowNormal(
    [1, 1, 1],
    [2, 0, 0, 0, 0.5, 0, 0, 0, 1],
  );
  const expected = new Vector3(0.5, 2, 1).normalize();
  assert.ok(Vector3.Distance(Vector3.FromArray(diagonal), expected) < 1e-12);
  const shear = transformWindowNormal(
    [0, 0, 1],
    [2, 0, 0, 0, 0.5, 0, 0.3, 0, 1],
  );
  assert.ok(
    Math.abs(Vector3.Dot(Vector3.FromArray(shear), new Vector3(2, 0, 0.3))) <
      1e-12,
  );
});

test("wide and narrow window resizing preserves millimetre profiles, indices and split normals", () => {
  const primitive = BUILDING_WINDOW_KIT.primitives.outerFrame;
  const original = structuredClone(primitive);
  for (const [width, height, depth] of [
    [4.4, 1.2, 0.2],
    [0.65, 0.28, 0.2],
    [2.18, 1.5, 0.18],
  ]) {
    const resized = resizeWindowPrimitive(primitive, width, height, depth);
    assert.equal(
      resized.indices,
      primitive.indices,
      "topology is not recreated as runtime boxes",
    );
    for (let i = 0; i < primitive.positions.length; i += 3) {
      const rightAnchored = primitive.resizeWeights[i] === 1,
        oldInset = rightAnchored
          ? primitive.nominalWidth - primitive.positions[i]
          : primitive.positions[i],
        newInset = rightAnchored
          ? width - resized.positions[i]
          : resized.positions[i];
      assert.ok(
        Math.abs(oldInset - newInset) < 1e-12,
        "fixed frame profile width",
      );
    }
    auditGeometry(resized, `frame ${width}x${height}`);
  }
  assert.deepEqual(primitive, original, "source Blender geometry is immutable");
});

test("each existing facade typology adapts without inverted triangles or collapsed UVs", () => {
  const cache = createBuildingWindowModelCache(),
    seen = new Set<string>();
  for (const building of BUILDINGS) {
    const catalog = buildingArchitecture(building),
      block = catalog?.block;
    const type =
      evidence.phenotypes.find((p) => p.osmId === building.id)?.type ??
      (catalog?.kind === "dormitory" ? "standard" : "unknown");
    const edges =
      block === 6 ? b6ExteriorEdges() : architectureEdges(building.points);
    for (const edge of edges)
      for (const opening of planFacadeOpenings(
        edge,
        building.height,
        type,
        block,
      )) {
        const shape = {
          ...opening,
          depth: opening.style === "room" ? 0.18 : 0.2,
        };
        const key = [
          shape.w,
          shape.h,
          shape.panes,
          shape.transom,
          shape.depth,
        ].join("/");
        const parts = cache.get(shape);
        assert.equal(
          cache.get(shape),
          parts,
          "one prepared shape reused across buildings",
        );
        if (seen.has(key)) continue;
        seen.add(key);
        const cells = opening.panes * (opening.transom === undefined ? 1 : 2);
        assert.equal(
          parts.filter((part) => part.role === "gasket").length,
          cells,
        );
        for (const part of parts) auditGeometry(part, `${key} ${part.role}`);
      }
  }
  assert.ok(seen.size > 10);
  assert.equal(cache.size, seen.size);
  cache.clear();
  assert.equal(cache.size, 0, "no lifetime cache of every static window");
});

test("world placement keeps winding and TBN for both polygon orientations and rotated facades", () => {
  const part = resizeWindowPrimitive(
    BUILDING_WINDOW_KIT.primitives.reveal,
    1.12,
    1.95,
    0.2,
  );
  for (const angle of [0, 0.7, Math.PI / 2, Math.PI])
    for (const side of [-1, 1]) {
      const tx = Math.cos(angle),
        tz = Math.sin(angle),
        nx = tz * side,
        nz = -tx * side;
      const batch = {
        positions: [],
        normals: [],
        uvs: [],
        indices: [],
      } as WindowModelGeometry;
      appendBuildingDetailGeometry(batch, part, {
        x: 12,
        y: 2.3,
        z: -7,
        tx,
        tz,
        nx,
        nz,
      });
      auditGeometry(batch, `world ${angle} ${side}`);
      for (let i = 0; i < batch.positions.length; i += 3) {
        const dx = batch.positions[i] - 12,
          dz = batch.positions[i + 2] + 7;
        assert.ok(Math.abs(dx * tx + dz * tz - part.positions[i]) < 1e-12);
        assert.ok(Math.abs(dx * nx + dz * nz - part.positions[i + 2]) < 1e-12);
      }
    }
});

test("resized reveal keeps metric plaster UV lengths instead of stretching the source texture", () => {
  const primitive = BUILDING_WINDOW_KIT.primitives.reveal;
  const resized = resizeWindowPrimitive(primitive, 4.4, 1.2, 0.2);
  let verticalEdges = 0;
  for (let i = 0; i < resized.indices.length; i += 3)
    for (let edge = 0; edge < 3; edge++) {
      const a = resized.indices[i + edge],
        b = resized.indices[i + ((edge + 1) % 3)];
      const delta = Vector3.FromArray(resized.positions, b * 3).subtract(
        Vector3.FromArray(resized.positions, a * 3),
      );
      if (
        Math.abs(delta.x) > 1e-7 ||
        Math.abs(delta.z) > 1e-7 ||
        Math.abs(delta.y) < 0.5
      )
        continue;
      const uvLength = Math.hypot(
        resized.uvs[b * 2] - resized.uvs[a * 2],
        resized.uvs[b * 2 + 1] - resized.uvs[a * 2 + 1],
      );
      assert.ok(Math.abs(uvLength - Math.abs(delta.y)) < 1e-6);
      verticalEdges++;
    }
  assert.ok(verticalEdges > 4);
  const batch: WindowModelGeometry = {
    positions: [],
    normals: [],
    uvs: [],
    indices: [],
  };
  appendBuildingDetailGeometry(
    batch,
    resized,
    { x: 0, y: 0, z: 0, tx: 1, tz: 0, nx: 0, nz: 1 },
    undefined,
    3,
  );
  assert.ok(
    batch.uvs.every(
      (value, index) => Math.abs(value * 3 - resized.uvs[index]) < 1e-12,
    ),
  );
});

test("gasket tint shares the frame batch and backfills uncoloured geometry", () => {
  const geometry = resizeWindowPrimitive(
    BUILDING_WINDOW_KIT.primitives.outerFrame,
    2.18,
    1.5,
  );
  const placement = { x: 0, y: 0, z: 0, tx: 1, tz: 0, nx: 0, nz: 1 };
  const batch = {
    positions: [],
    normals: [],
    uvs: [],
    indices: [],
    colors: undefined,
  } as WindowModelGeometry & { colors?: number[] };
  appendBuildingDetailGeometry(batch, geometry, placement);
  assert.equal(batch.colors, undefined);
  const originalVertices = batch.positions.length / 3;
  appendBuildingDetailGeometry(batch, geometry, placement, [0.22, 0.24, 0.22]);
  appendBuildingDetailGeometry(batch, geometry, placement);
  assert.equal(batch.colors!.length, (batch.positions.length / 3) * 4);
  assert.ok(
    batch.colors!.slice(0, originalVertices * 4).every((value) => value === 1),
  );
  assert.deepEqual(
    batch.colors!.slice(originalVertices * 4, originalVertices * 4 + 4),
    [0.22, 0.24, 0.22, 1],
  );
  assert.deepEqual(batch.colors!.slice(-4), [1, 1, 1, 1]);
});
