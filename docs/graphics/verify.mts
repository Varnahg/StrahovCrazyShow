/** Geometry-only smoke test. No screenshot or GPU/FPS claim. */
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { applyArtLighting } from "../../client/art-lighting";
import {
  buildWorld,
  type WorldBuildContext,
} from "../../client/world-renderer";
import assert from "node:assert/strict";
import earcut from "earcut";

// DynamicTexture's canvas calls are deliberately stubbed: this check verifies
// resulting scene geometry and materials, not visual correctness of the atlas.
(globalThis as any).OffscreenCanvas = class {
  width: number;
  height: number;
  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
  }
  getContext() {
    const gradient = () => ({ addColorStop() {} });
    return {
      fillRect() {},
      clearRect() {},
      createLinearGradient: gradient,
      createRadialGradient: gradient,
      canvas: this,
    };
  }
};
const engine = new NullEngine();
const scene = new Scene(engine);
scene.useRightHandedSystem = true;
const materials = new Map<string, StandardMaterial>();
const context: WorldBuildContext = {
  scene,
  staticMeshes: new Map(),
  huntMeshes: [],
  clouds: [],
  lights: [],
  label() {},
  mat(hex) {
    if (!materials.has(hex)) {
      const material = new StandardMaterial("m" + hex, scene);
      material.diffuseColor = Color3.FromHexString(hex);
      materials.set(hex, material);
    }
    return materials.get(hex)!;
  },
  box(name, x, y, z, w, h, d, color, grouped = true, yaw = 0) {
    const mesh = MeshBuilder.CreateBox(
      name,
      { width: w, height: h, depth: d },
      scene,
    );
    mesh.position.set(x, y, z);
    mesh.rotation.y = yaw;
    mesh.material = context.mat(color);
    if (grouped) {
      const group = context.staticMeshes.get(mesh.material) ?? [];
      group.push(mesh);
      context.staticMeshes.set(mesh.material, group);
    }
    return mesh;
  },
  sphere(name, x, y, z, size, color) {
    const mesh = MeshBuilder.CreateSphere(
      name,
      { diameter: size, segments: 6 },
      scene,
    );
    mesh.position.set(x, y, z);
    mesh.material = context.mat(color);
    return mesh;
  },
  polygonBuilding(points, height, color) {
    const positions: number[] = [],
      indices: number[] = [];
    for (let i = 1; i < points.length; i++) {
      const [x, z] = points[i - 1],
        [nx, nz] = points[i],
        start = positions.length / 3;
      positions.push(x, 0, z, nx, 0, nz, nx, height, nz, x, height, z);
      indices.push(start, start + 1, start + 2, start, start + 2, start + 3);
    }
    const flat = points.slice(0, -1).flat(),
      start = positions.length / 3;
    for (let i = 0; i < flat.length; i += 2)
      positions.push(flat[i], height, flat[i + 1]);
    indices.push(...earcut(flat).map((index) => index + start));
    const data = new VertexData();
    data.positions = positions;
    data.indices = indices;
    const normals: number[] = [];
    VertexData.ComputeNormals(positions, indices, normals);
    data.normals = normals;
    data.uvs = Array((positions.length / 3) * 2).fill(0);
    const mesh = new Mesh("building", scene);
    data.applyToMesh(mesh);
    mesh.material = context.mat(color);
    mesh.freezeWorldMatrix();
    return mesh;
  },
};
buildWorld(context);
const cloudTriangles = context.clouds.reduce(
  (sum, mesh) => sum + mesh.getTotalIndices() / 3,
  0,
);
assert.equal(context.clouds.length, 24);
assert.ok(cloudTriangles <= 1000);
assert.equal(context.lights.filter((light) => light.intensity > 0).length, 0);
assert.ok(
  scene.meshes.every((mesh) => Number.isFinite(mesh.getTotalIndices())),
);
const result = {
  checkedAt: new Date().toISOString(),
  renderer: "NullEngine geometry inspection; no GPU",
  worldMeshes: scene.meshes.length,
  worldTriangles: scene.meshes.reduce(
    (sum, mesh) => sum + mesh.getTotalIndices() / 3,
    0,
  ),
  materials: scene.materials.length,
  cloudMeshes: context.clouds.length,
  cloudTriangles,
  initialDynamicLamps: context.lights.filter((light) => light.intensity > 0)
    .length,
  limitations:
    "Excludes avatars/car/sky shader/rain; not a rendered visual check or FPS measurement.",
};
console.log(JSON.stringify(result, null, 2));
const lighting = {
  ...context,
  sun: new DirectionalLight("sun", new Vector3(0, -1, 0), scene),
  ambient: new HemisphericLight("ambient", new Vector3(0, 1, 0), scene),
  lamps: context.mat("#f7d590"), quality: "low",
};
const night = {
  sun: { x: 0, y: -.5, z: .8, altitude: -.6, daylight: 0 },
  moon: { x: .2, y: .5, z: .8, altitude: .6 },
  player: { x: 20, y: 1, z: 2 }, dt: 1 / 60,
};
applyArtLighting(lighting, night);
assert.equal(context.lights.filter((light) => light.isEnabled()).length, 0);
assert.equal(scene.getMeshByName("atmosphere backdrop")?.getTotalIndices(), 36);
lighting.quality = "medium";
for (let i = 0; i < 40; i++) applyArtLighting(lighting, night);
assert.ok(context.lights.filter((light) => light.isEnabled()).length <= 2);
assert.ok(lighting.sun.direction.y < 0);
console.log("Lighting controller initializes; low has 0 dynamic lamps, medium <= 2; sky has 12 triangles.");
scene.dispose();
engine.dispose();
