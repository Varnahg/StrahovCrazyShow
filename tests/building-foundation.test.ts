import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { FreeCamera } from "@babylonjs/core/Cameras/freeCamera";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { buildingFoundationData } from "../client/terrain-renderer";
import { architectureEdges } from "../client/architecture-reality";
import { BUILDINGS, blockNumber } from "../shared/world";
import {
  buildingBaseHeight,
  groundHeight,
  type GroundPoint,
} from "../shared/terrain";
import { B6_LAYOUT } from "../shared/b6-interior";

function verifyOutsideFaces(points: GroundPoint[], baseY: number) {
  const engine = new NullEngine(),
    scene = new Scene(engine);
  scene.useRightHandedSystem = true;
  try {
    const camera = new FreeCamera("outside foundation", Vector3.Zero(), scene);
    camera.minZ = 0.08;
    camera.maxZ = 700;
    const nativeMesh = new Mesh("native foundation orientation", scene);
    const material = new StandardMaterial(
      "opaque single sided foundation",
      scene,
    );
    nativeMesh.material = material;
    // These public native defaults bind clockwise front faces with back culling.
    assert.equal(nativeMesh.sideOrientation, 0);
    assert.equal(material.sideOrientation, null);
    assert.equal(material.backFaceCulling, true);
    assert.equal(material.cullBackFaces, true);
    const original = structuredClone(points);
    const data = buildingFoundationData(points, baseY);
    const edges = architectureEdges(points);
    assert.deepEqual(points, original, "the source footprint must not mutate");
    assert(data.indices.length > 0);
    for (let i = 0; i < data.indices.length; i += 3) {
      const triangle = data.indices
        .slice(i, i + 3)
        .map((index) => Vector3.FromArray(data.positions, index * 3));
      const centre = triangle[0]
        .add(triangle[1])
        .add(triangle[2])
        .scale(1 / 3);
      const edge = edges.find((e) => {
        const x = centre.x - e.a[0],
          z = centre.z - e.a[1],
          along = x * e.tx + z * e.tz;
        return (
          along >= -1e-6 &&
          along <= e.length + 1e-6 &&
          Math.abs(x * e.nx + z * e.nz) < 1e-6
        );
      });
      assert(edge, "every skirt triangle stays on the original perimeter");
      const normal = Vector3.FromArray(data.normals, data.indices[i] * 3);
      assert(
        normal.x * edge.nx + normal.z * edge.nz > 0.999999,
        "normal points to the exterior",
      );
      assert.equal(
        normal.y,
        0,
        "the skirt has no horizontal bottom or top face",
      );
      for (const p of triangle) {
        const lower = Math.min(baseY - 0.05, groundHeight(p.x, p.z) - 0.15);
        assert(
          Math.abs(p.y - baseY) < 1e-9 || Math.abs(p.y - lower) < 1e-9,
          "only the original foundation anchor and sampled lower boundary are used",
        );
      }
      camera.position.copyFrom(
        centre.add(new Vector3(edge.nx * 5, 0, edge.nz * 5)),
      );
      camera.setTarget(centre);
      const vp = camera
        .getViewMatrix(true)
        .multiply(camera.getProjectionMatrix(true));
      const projected = triangle.map((p) =>
        Vector3.TransformCoordinates(p, vp),
      );
      const [a, b, c] = projected;
      const signedArea = (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
      assert(
        signedArea < -1e-10,
        "public RH camera sees a native clockwise front face from outside",
      );
    }
    return data;
  } finally {
    scene.dispose();
    engine.dispose();
  }
}

test("foundation stays opaque from outside for either open or closed footprint winding", () => {
  const ring: GroundPoint[] = [
    [30, 40],
    [46, 40],
    [46, 63],
    [30, 63],
  ];
  for (const points of [
    ring,
    [...ring].reverse(),
    [...ring, ring[0]],
    [...ring, ring[0]].reverse(),
  ])
    verifyOutsideFaces(points, 4);
});

test("actual B3/B4/B5/B6/B8/B10 skirts retain terrain boundary and outward RH front faces", () => {
  const blocks = new Set([3, 4, 5, 6, 8, 10]),
    found = new Set<number>();
  for (const building of BUILDINGS) {
    const block = blockNumber(building.name);
    if (typeof block !== "number" || !blocks.has(block)) continue;
    found.add(block);
    verifyOutsideFaces(
      building.points,
      block === 6
        ? B6_LAYOUT.foundationOffset
        : buildingBaseHeight(building.points),
    );
  }
  assert.deepEqual(found, blocks);
});

test("all archived foundation GLBs retain outward normals and standard glTF CCW faces", () => {
  const manifest = JSON.parse(
    readFileSync("public/models/buildings/manifest.json", "utf8"),
  );
  let foundations = 0,
    triangles = 0;
  for (const model of manifest.models) {
    const building = BUILDINGS.find((b) => b.id === model.identity.sourceId);
    const bytes = readFileSync("public" + model.url);
    const length = bytes.readUInt32LE(12),
      spec = JSON.parse(bytes.subarray(20, 20 + length).toString("utf8"));
    const mesh = spec.meshes.find((m: { name: string }) =>
      m.name.startsWith("building foundation "),
    );
    if (!mesh) continue;
    assert(building, model.id);
    foundations++;
    const edges = architectureEdges(building.points);
    const read = (id: number): number[] => {
      const accessor = spec.accessors[id],
        view = spec.bufferViews[accessor.bufferView];
      const width = accessor.type === "VEC3" ? 3 : 1,
        componentBytes = accessor.componentType === 5123 ? 2 : 4;
      const offset =
          20 + length + 8 + (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0),
        values: number[] = [];
      for (let row = 0; row < accessor.count; row++)
        for (let axis = 0; axis < width; axis++) {
          const at =
            offset +
            row * (view.byteStride ?? width * componentBytes) +
            axis * componentBytes;
          values.push(
            accessor.componentType === 5126
              ? bytes.readFloatLE(at)
              : componentBytes === 2
                ? bytes.readUInt16LE(at)
                : bytes.readUInt32LE(at),
          );
        }
      return values;
    };
    for (const primitive of mesh.primitives) {
      const positions = read(primitive.attributes.POSITION),
        normals = read(primitive.attributes.NORMAL),
        indices = read(primitive.indices);
      for (let i = 0; i < indices.length; i += 3) {
        const p = indices
          .slice(i, i + 3)
          .map((index) => Vector3.FromArray(positions, index * 3));
        const normal = Vector3.FromArray(normals, indices[i] * 3);
        assert(
          Vector3.Dot(
            Vector3.Cross(p[1].subtract(p[0]), p[2].subtract(p[0])),
            normal,
          ) > 0,
          model.id + ": glTF front face disagrees with its normal",
        );
        const centre = p[0]
          .add(p[1])
          .add(p[2])
          .scale(1 / 3);
        centre.x += model.origin.x;
        centre.z += model.origin.z;
        const edge = edges.find((e) => {
          const x = centre.x - e.a[0],
            z = centre.z - e.a[1],
            along = x * e.tx + z * e.tz;
          return (
            along >= -0.0001 &&
            along <= e.length + 0.0001 &&
            Math.abs(x * e.nx + z * e.nz) < 0.0001
          );
        });
        assert(edge, model.id + ": exported skirt left its source perimeter");
        assert(
          normal.x * edge.nx + normal.z * edge.nz > 0.9999,
          model.id +
            ": archived foundation points inward " +
            JSON.stringify({
              centre: centre.asArray(),
              normal: normal.asArray(),
              edge,
            }),
        );
        triangles++;
      }
    }
  }
  assert.equal(foundations, 120);
  assert(triangles > 1000);
});
