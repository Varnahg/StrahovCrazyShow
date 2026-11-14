import assert from "node:assert/strict";
import { mkdir, realpath, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { LoadAssetContainerAsync } from "@babylonjs/core/Loading/sceneLoader";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { buildWorld, type WorldBuildContext } from "../../../client/world-renderer";
import { loadCadBuildings } from "../../../client/cad-buildings";
import { CAD_BUILDINGS } from "../../../shared/cad-buildings";
import release from "../../../shared/data/assets/geometry-release-20261111.json";
import { BUILDINGS, TERRAIN_COVERAGE } from "../../../shared/world";
import { buildingRoofGeometry } from "../../../shared/building-roofs";
import { buildingBaseHeight, drapeTriangles } from "../../../shared/terrain";
import type { TransformNode } from "@babylonjs/core/Meshes/transformNode";

const qa = await realpath(".cache/geometry-release-20261111");
assert.match(qa, /^D:[\\/]/i);
const out = join(qa, "map-clipping-20261114");
await mkdir(out, { recursive: true });
const engine = new NullEngine();
const scene = new Scene(engine);
scene.useRightHandedSystem = true;
const materials = new Map<string, StandardMaterial>();
const unused = () => { throw new Error("Unexpected legacy world factory"); };
const context: WorldBuildContext = {
  scene, box: unused, sphere: unused, polygonBuilding: unused, label() {},
  mat(hex) {
    let mat = materials.get(hex);
    if (!mat) {
      mat = new StandardMaterial(`m${hex}`, scene);
      mat.diffuseColor = Color3.FromHexString(hex);
      materials.set(hex, mat);
    }
    return mat;
  },
  staticMeshes: new Map(), huntMeshes: [], clouds: [], lights: [],
};

try {
  const world = buildWorld(context);
  const cadBytes: Record<string, { path: string; sha256: string }> = {};
  const cadPath = (asset: typeof CAD_BUILDINGS[number]) => asset.id === "b06"
    ? release.b06.url : asset.url.split("?")[0];
  const cad = await loadCadBuildings(scene, CAD_BUILDINGS, {
    async loadContainer(url) {
      const source = url.split("?")[0];
      const asset = CAD_BUILDINGS.find((entry) => cadPath(entry) === source);
      assert.ok(asset, source);
      const bytes = await readFile(`public${source}`);
      const sha256 = createHash("sha256").update(bytes).digest("hex");
      assert.equal(sha256, asset.id === "b06" ? release.b06.sha256 : asset.glbSha256);
      cadBytes[asset.id] = { path: source, sha256 };
      return LoadAssetContainerAsync(new Uint8Array(bytes), scene, { pluginExtension: ".glb" });
    },
  });
  const metadata = [];
  const chunks: Buffer[] = [];
  const delta = new Vector3(2, 1, -3);
  let count = 0;
  const assetRoots = scene.transformNodes.filter((node) => node.metadata?.worldAsset);
  const pivots = new Map<string, { vertices: number; baseline: number; translation: number }>();
  for (const root of assetRoots) {
    const baseline = root.position.clone();
    const meshes = root.getChildMeshes().filter((mesh) => mesh.getTotalVertices() > 0);
    const matrices = meshes.map((mesh) => mesh.computeWorldMatrix(true).clone());
    root.position.addInPlace(delta);
    root.computeWorldMatrix(true);
    const result = { vertices: 0, baseline: 0, translation: 0 };
    for (const [index, mesh] of meshes.entries()) {
      const positions = mesh.getVerticesData("position")!;
      const moved = mesh.computeWorldMatrix(true);
      const expected = new Vector3(), actual = new Vector3(), local = new Vector3();
      for (let i = 0; i < positions.length; i += 3) {
        local.set(positions[i], positions[i + 1], positions[i + 2]);
        Vector3.TransformCoordinatesToRef(local, matrices[index], expected);
        Vector3.TransformCoordinatesToRef(local, moved, actual);
        result.vertices++;
        if (!mesh.metadata?.cadBuilding && !mesh.metadata?.artifactId)
          result.baseline = Math.max(result.baseline, Vector3.Distance(local, expected));
        actual.subtractInPlace(expected).subtractInPlace(delta);
        result.translation = Math.max(result.translation, actual.length());
      }
    }
    root.position.copyFrom(baseline);
    root.computeWorldMatrix(true);
    pivots.set(root.metadata.key, result);
  }
  for (const mesh of scene.meshes) {
    const positions = mesh.getVerticesData("position"), indices = mesh.getIndices();
    if (!positions?.length || !indices?.length || !mesh.material) continue;
    const normals = mesh.getVerticesData("normal"), uv = mesh.getVerticesData("uv");
    const material = mesh.material;
    let root: TransformNode | null = mesh;
    while (root && !root.metadata?.worldAsset) root = root.parent as TransformNode | null;
    const source = root?.metadata?.key ?? mesh.metadata?.assetKey ?? null;
    const lod = mesh.metadata?.lod ?? "both";
    const matrix = mesh.computeWorldMatrix(true);
    const vertices = new Float64Array(positions.length);
    const point = new Vector3();
    for (let i = 0; i < positions.length; i += 3) {
      point.set(positions[i], positions[i + 1], positions[i + 2]);
      Vector3.TransformCoordinatesToRef(point, matrix, point);
      vertices.set(point.asArray(), i);
    }
    const data = Buffer.allocUnsafe(indices.length / 3 * 44);
    let uvZero = 0, uvInvalid = 0, normalInvalid = 0;
    for (let i = 0; i < indices.length; i += 3) {
      const a = indices[i], b = indices[i + 1], c = indices[i + 2];
      const start = i / 3 * 44;
      for (const [vertex, index] of [a, b, c].entries())
        for (let axis = 0; axis < 3; axis++)
          data.writeFloatLE(vertices[index * 3 + axis], start + (vertex * 3 + axis) * 4);
      data.writeUInt32LE(metadata.length, start + 36);
      data.writeUInt32LE(i / 3, start + 40);
      if (uv) {
        const u = [uv[2*a], uv[2*b], uv[2*c]], v = [uv[2*a+1], uv[2*b+1], uv[2*c+1]];
        if (![...u, ...v].every(Number.isFinite)) uvInvalid++;
        else if (Math.abs((u[1]-u[0])*(v[2]-v[0])-(u[2]-u[0])*(v[1]-v[0])) <= 1e-13) uvZero++;
      }
      if (normals && ![a,b,c].every((j) => Number.isFinite(normals[3*j]+normals[3*j+1]+normals[3*j+2]))) normalInvalid++;
    }
    const side = material.sideOrientation ?? mesh.sideOrientation;
    metadata.push({ name: mesh.name, source, lod, material: material.name,
      side, cullBackFaces: material.cullBackFaces, alpha: material.alpha, cull: material.backFaceCulling,
      blended: Boolean(material.disableDepthWrite || material.needAlphaBlendingForMesh(mesh)),
      alphaTest: Boolean(material.needAlphaTestingForMesh(mesh)), enabledAtBuild: mesh.isEnabled(),
      zOffset: material.zOffset, zOffsetUnits: material.zOffsetUnits, triangles: indices.length / 3,
      uv: !!uv, uvZero, uvInvalid, normalInvalid });
    chunks.push(data);
    count += indices.length / 3;
  }
  const terrainHits = BUILDINGS.flatMap((building) => {
    if (CAD_BUILDINGS.some((cadAsset) => cadAsset.osmId === building.id)) return [];
    const roof = buildingRoofGeometry(building, buildingBaseHeight(building.points));
    if (!roof) return [];
    const { minX, maxX, minZ, maxZ } = TERRAIN_COVERAGE;
    const vertices = drapeTriangles(roof.points, roof.triangles).positions;
    let max = 0;
    let point: number[] = [];
    for (let i = 0; i < vertices.length; i += 3) {
      const [x, y, z] = vertices.slice(i, i + 3);
      if (x < minX || x > maxX || z < minZ || z > maxZ || y - roof.y <= max) continue;
      max = y - roof.y;
      point = [x, y, z];
    }
    return max > 0 ? [{ id: building.id, name: building.name, depth: max, point }] : [];
  });
  const roofUv = BUILDINGS.flatMap((building) => {
    if (CAD_BUILDINGS.some((cadAsset) => cadAsset.osmId === building.id)) return [];
    const roof = buildingRoofGeometry(building, buildingBaseHeight(building.points));
    if (!roof) return [];
    let mismatched = 0;
    for (let i = 0; i < roof.triangles.length; i += 3) {
      const [a, b, c] = roof.triangles.slice(i, i + 3).map((k) => roof.points[k]);
      if (Math.hypot(b[0] - c[0], b[1] - a[1]) > 1e-7) mismatched++;
    }
    return mismatched ? [{ id: building.id, name: building.name, triangles: mismatched }] : [];
  });
  const manifest = { sourceCommit: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
    triangleCount: count, metadata, pivots: Object.fromEntries(pivots), terrainHits, roofUv, cadBytes,
    architecture: world.architecture?.metrics, cad: cad.stats };
  await writeFile(join(out, "meshes.json"), JSON.stringify(manifest));
  await writeFile(join(out, "triangles.bin"), Buffer.concat(chunks));
  console.log(JSON.stringify({ out, triangles: count, meshes: metadata.length, pivots: pivots.size, cad: cad.stats, roofHits: terrainHits.length }));
} finally {
  scene.dispose();
  engine.dispose();
}
