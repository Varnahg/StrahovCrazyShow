import test from "node:test";
import assert from "node:assert/strict";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Ray } from "@babylonjs/core/Culling/ray";
import { BUILDINGS } from "../shared/world";
import {
  architectureEdges,
  planFacadeOpenings,
  buildArchitectureReality,
} from "../client/architecture-reality";
import { FACADE_DEPTH, metricFacadeFrame } from "../client/architecture-depth";
import { shadowCasterKind } from "../client/cinematic";

test("sill and jamb UVs use physical lengths with unit geometric normals", () => {
  const slope = metricFacadeFrame(
    [0, 0, 0],
    [2, 0, 0],
    [2, 0.04, -0.26],
    [0, 1, 0],
  );
  assert.ok(slope.normal[1] > 0.98 && slope.normal[2] > 0.15);
  assert.ok(Math.abs(Math.hypot(...slope.normal) - 1) < 1e-12);
  assert.ok(Math.abs(slope.uv[3] * 3 - Math.hypot(0.04, 0.26)) < 1e-12);
  const jamb = metricFacadeFrame(
    [0, 0, 0],
    [0, 1.5, 0],
    [0, 1.5, -0.18],
    [1, 0, 0],
  );
  assert.deepEqual(jamb.normal, [1, -0, -0]);
  assert.equal(jamb.uv[2] * 3, 1.5);
  assert.equal(jamb.uv[3] * 3, 0.18);
});

test("real near geometry has outward nonzero normals, valid tangent frames and closed frame returns", () => {
  const engine = new NullEngine(),
    scene = new Scene(engine);
  scene.useRightHandedSystem = true;
  const building = BUILDINGS.find((b) => b.id === "53921168")!;
  const original = structuredClone(building);
  const reality = buildArchitectureReality({ scene, buildings: [building] });
  reality.update(
    { x: building.points[0][0], z: building.points[0][1] },
    "high",
  );
  try {
    const meshes = scene.meshes.filter(
      (mesh): mesh is Mesh =>
        mesh instanceof Mesh && mesh.metadata?.lod === "near",
    );
    let diagonalNormals = 0,
      checkedTriangles = 0;
    for (const mesh of meshes.filter(
      (mesh) => !mesh.material!.name.includes("roof"),
    )) {
      const positions = mesh.getVerticesData("position")!,
        normals = mesh.getVerticesData("normal")!,
        uv = mesh.getVerticesData("uv")!,
        indices = mesh.getIndices()!;
      mesh.computeWorldMatrix(true);
      assert.equal(mesh.sideOrientation, 1, "RH winding remains explicit");
      assert.equal(
        shadowCasterKind(mesh),
        "opaque",
        "added details participate in the existing building shadow batch",
      );
      assert.notEqual(
        mesh.metadata.receiveShadows,
        false,
        "cinematic receiver selection must retain the building",
      );
      for (let i = 0; i < indices.length; i += 3) {
        const ai = indices[i],
          bi = indices[i + 1],
          ci = indices[i + 2];
        const a = Vector3.FromArray(positions, ai * 3),
          b = Vector3.FromArray(positions, bi * 3),
          c = Vector3.FromArray(positions, ci * 3);
        const n = Vector3.FromArray(normals, ai * 3);
        assert.ok(Math.abs(n.length() - 1) < 1e-5);
        const ab = b.subtract(a),
          ac = c.subtract(a),
          actual = Vector3.Cross(ab, ac).normalize();
        // Blender's shallow divider bevel has deliberately smoothed split
        // normals; the flat wall/reveal/sill faces retain geometric normals.
        const authoredFrame = mesh.material!.name.includes("brown timber");
        assert.ok(
          Vector3.Dot(actual, n) > (authoredFrame ? 0.94 : 0.999),
          `${mesh.name} wrong geometric normal`,
        );
        const du1 = uv[bi * 2] - uv[ai * 2],
          dv1 = uv[bi * 2 + 1] - uv[ai * 2 + 1];
        const du2 = uv[ci * 2] - uv[ai * 2],
          dv2 = uv[ci * 2 + 1] - uv[ai * 2 + 1];
        const determinant = du1 * dv2 - du2 * dv1;
        assert.ok(
          Math.abs(determinant) > 1e-10,
          `${mesh.name} collapsed UV tangent basis`,
        );
        const tangent = ab
          .scale(dv2)
          .subtract(ac.scale(dv1))
          .scale(1 / determinant)
          .normalize();
        const bitangent = ac
          .scale(du1)
          .subtract(ab.scale(du2))
          .scale(1 / determinant)
          .normalize();
        assert.ok(
          Math.abs(Vector3.Dot(actual, tangent)) < 0.002 &&
            Math.abs(Vector3.Dot(actual, bitangent)) < 0.002,
        );
        const shadingTangent = tangent
          .subtract(n.scale(Vector3.Dot(n, tangent)))
          .normalize();
        assert.ok(Math.abs(Vector3.Dot(n, shadingTangent)) < 1e-5);
        assert.ok(Vector3.Cross(n, shadingTangent).lengthSquared() > 0.99);
        if (Math.abs(n.y) > 0.1 && Math.abs(n.y) < 0.95) diagonalNormals++;
        checkedTriangles++;
      }
    }
    assert.ok(
      checkedTriangles > 1000 && diagonalNormals > 100,
      "actual beveled aperture faces are present",
    );
    const edge = architectureEdges(building.points).find((e) => e.long)!;
    const opening = planFacadeOpenings(edge, building.height, "low")[0];
    const depth = 0.18,
      frameWidth = 0.045;
    const right = opening.u + opening.w - frameWidth;
    const front = -depth + FACADE_DEPTH.frameFront;
    const u = right - 0.002 - 0.25 * (0.5 - front);
    const origin = new Vector3(
      edge.a[0] + edge.tx * u + edge.nx * 0.5,
      opening.v + opening.h * 0.4,
      edge.a[1] + edge.tz * u + edge.nz * 0.5,
    );
    const direction = new Vector3(
      edge.tx * 0.25 - edge.nx,
      0,
      edge.tz * 0.25 - edge.nz,
    ).normalize();
    const frame = meshes.find((mesh) =>
      mesh.material!.name.includes("brown timber"),
    )!;
    const hit = frame.intersects(new Ray(origin, direction, 1));
    assert.ok(
      hit.hit,
      "oblique ray must meet the frame's physical inner return",
    );
    const p = hit.pickedPoint!;
    const hitDepth = (p.x - edge.a[0]) * edge.nx + (p.z - edge.a[1]) * edge.nz;
    assert.ok(
      // The modeled inner bevel now precedes the vertical return; both must
      // remain inside the physical frame section in front of the glass.
      hitDepth < front + 0.003 && hitDepth > -depth + FACADE_DEPTH.glassBack,
      `return depth ${hitDepth}`,
    );
    assert.deepEqual(
      building,
      original,
      "the source footprint/height are untouched",
    );
    const count = scene.meshes.length;
    reality.update({ x: 1000, z: 1000 });
    assert.ok(meshes.every((mesh) => !mesh.isEnabled()));
    reality.update({ x: building.points[0][0], z: building.points[0][1] });
    assert.equal(scene.meshes.length, count, "LOD reuses the same meshes");
  } finally {
    reality.dispose();
    assert.equal(scene.meshes.length, 0);
    assert.equal(scene.transformNodes.length, 0);
    scene.dispose();
    engine.dispose();
  }
});
