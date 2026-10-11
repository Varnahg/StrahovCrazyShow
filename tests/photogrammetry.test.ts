import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import { createHash } from "node:crypto";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import { createPhotogrammetryMaterial } from "../client/photogrammetry";
import raw from "../shared/data/photogrammetry.json";
import {
  decodeI3SGeometry,
  photogrammetryCoverage,
  photogrammetryEvictableNodes,
  photogrammetryIndex,
  photogrammetryNodeCenter,
  photogrammetryPositions,
  photogrammetryVisibleNodes,
  photogrammetryWantedNodes,
  partitionPhotogrammetryTriangles,
  type PhotogrammetryManifest,
  type PhotogrammetryNode,
} from "../shared/photogrammetry";

const manifest = raw as PhotogrammetryManifest;
const index = photogrammetryIndex(manifest);
const sourceFile = (path: string) =>
  new URL(`../public${path}`, import.meta.url);
const sha = (buffer: Uint8Array) =>
  createHash("sha256").update(buffer).digest("hex");
const fixture = () => {
  const buffer = new ArrayBuffer(8 + 3 * 20 + 16);
  const view = new DataView(buffer);
  view.setUint32(0, 3, true);
  view.setUint32(4, 1, true);
  [0, 0, 0, 1, 0, 0, 0, 1, 0].forEach((v, i) =>
    view.setFloat32(8 + i * 4, v, true),
  );
  [0.125, 0.25, 0.875, 0.25, 0.125, 0.75].forEach((v, i) =>
    view.setFloat32(44 + i * 4, v, true),
  );
  view.setBigUint64(68, 9_007_199_254_740_993n, true);
  view.setUint32(76, 0, true);
  view.setUint32(80, 0, true);
  return buffer;
};

test("the actual IPR archive retains every declared original and the complete finest source", () => {
  assert.equal(manifest.provider, "IPR Praha");
  assert.equal(manifest.license, "CC BY");
  assert.equal(manifest.capture, "summer 2023");
  assert.equal(manifest.highestDetailLevel, 16);
  assert.equal(manifest.leafCount, 2588);
  assert.equal(manifest.nodes.length, 3518);
  const finest = manifest.nodes.filter((node) => node.level === 16);
  assert.equal(finest.length, manifest.leafCount);
  assert.equal(
    finest.reduce((sum, node) => sum + node.triangles, 0),
    3_955_667,
  );
  for (const node of manifest.nodes) {
    assert.equal(
      statSync(sourceFile(node.geometry)).size,
      node.geometryBytes,
      node.id,
    );
    assert.equal(
      statSync(sourceFile(node.texture)).size,
      node.textureBytes,
      node.id,
    );
  }
  assert.deepEqual(manifest.bounds, {
    minX: -500,
    maxX: 440,
    minZ: -270,
    maxZ: 340,
  });
});

test("I3S decoder preserves position, UV order, winding and full UInt64 feature IDs", () => {
  // Deliberately use an unaligned view to also exercise Node Buffer slices.
  const source = new Uint8Array(fixture());
  const padded = new Uint8Array(source.length + 1);
  padded.set(source, 1);
  const decoded = decodeI3SGeometry(padded.subarray(1));
  assert.deepEqual([...decoded.positions], [0, 0, 0, 1, 0, 0, 0, 1, 0]);
  assert.deepEqual([...decoded.uvs], [0.125, 0.25, 0.875, 0.25, 0.125, 0.75]);
  assert.deepEqual([...decoded.indices], [0, 1, 2]);
  assert.deepEqual(decoded.featureIds, [9_007_199_254_740_993n]);
  assert.deepEqual(decoded.faceRanges, [[0, 0]]);
});

test("I3S decoder rejects truncated, nonfinite or incompatible buffers", () => {
  assert.throws(() => decodeI3SGeometry(new ArrayBuffer(7)), /header/);
  assert.throws(() => decodeI3SGeometry(fixture().slice(0, 83)), /length/);
  const badCount = fixture();
  new DataView(badCount).setUint32(0, 4, true);
  assert.throws(() => decodeI3SGeometry(badCount), /triangle soup/);
  const badPosition = fixture();
  new DataView(badPosition).setFloat32(8, NaN, true);
  assert.throws(() => decodeI3SGeometry(badPosition), /Nonfinite/);
  const badFeature = fixture();
  new DataView(badFeature).setUint32(80, 1, true);
  assert.throws(() => decodeI3SGeometry(badFeature), /face range/);
});

test("Mercator XY converts to physical metres while Bpv height remains unscaled", () => {
  const node = {
    center: [
      manifest.mercatorOrigin.x + 100,
      manifest.mercatorOrigin.y + 50,
      manifest.worldHeightReference + 20,
    ],
  };
  const center = photogrammetryNodeCenter(node, manifest);
  assert.ok(Math.abs(center.x - 100 * manifest.metresPerMercatorUnit) < 1e-9);
  assert.ok(Math.abs(center.z + 50 * manifest.metresPerMercatorUnit) < 1e-9);
  assert.equal(center.y, 20);
  const positions = photogrammetryPositions(
    { positions: new Float32Array([10, 5, 3]) },
    node,
    manifest,
  );
  assert.ok(
    Math.abs(positions[0] - 110 * manifest.metresPerMercatorUnit) < 1e-5,
  );
  assert.ok(
    Math.abs(positions[2] + 55 * manifest.metresPerMercatorUnit) < 1e-5,
  );
  assert.equal(positions[1], 23);
  const metricLocal = photogrammetryPositions(
    { positions: new Float32Array([10, 5, 3]) },
    node,
    { ...manifest, localPositionScale: 1 },
  );
  assert.ok(Math.abs(metricLocal[0] - center.x - 10) < 1e-5);
});

test("source east/north triangle retains its upward normal in the right-handed game", () => {
  const node = {
    center: [
      manifest.mercatorOrigin.x,
      manifest.mercatorOrigin.y,
      manifest.worldHeightReference,
    ],
  };
  const p = photogrammetryPositions(
    decodeI3SGeometry(fixture()),
    node,
    manifest,
  );
  const ab = [p[3] - p[0], p[4] - p[1], p[5] - p[2]];
  const ac = [p[6] - p[0], p[7] - p[1], p[8] - p[2]];
  const up = ab[2] * ac[0] - ab[0] * ac[2];
  assert.ok(
    up > 0,
    "determinant must remain positive; do not reverse source winding",
  );
});

test("original sampled geometry and JPEG hashes match every declared source level", () => {
  for (let level = 12; level <= 16; level++) {
    const node = manifest.nodes.find((node) => node.level === level)!;
    const geometry = readFileSync(sourceFile(node.geometry));
    const texture = readFileSync(sourceFile(node.texture));
    assert.equal(sha(geometry), node.geometrySha256);
    assert.equal(sha(texture), node.textureSha256);
    const decoded = decodeI3SGeometry(geometry);
    assert.equal(decoded.vertexCount, node.vertices);
    assert.equal(decoded.indices.length / 3, node.triangles);
    assert.equal(texture.readUInt16BE(0), 0xffd8, "original JPEG header");
    assert.ok(decoded.uvs.every((uv) => uv >= -0.0001 && uv <= 1.0001));
  }
});

test("the selected source forest reaches every finest tile exactly once", () => {
  const visited = new Set<string>();
  const visit = (node: PhotogrammetryNode) => {
    assert.ok(
      !visited.has(node.id),
      "a source node may not be drawn through two parents",
    );
    visited.add(node.id);
    node.children.forEach((id) => visit(index.nodes.get(id)!));
  };
  index.roots.forEach(visit);
  assert.equal(visited.size, manifest.nodes.length);
  const broken = structuredClone(manifest);
  broken.nodes[0].children = ["nonexistent"];
  assert.throws(
    () => photogrammetryIndex(broken),
    /Missing photogrammetry child/,
  );
});

test("all quality levels request original finest tiles at the player and retain coarser distant coverage", () => {
  for (const quality of ["low", "medium", "high"] as const) {
    for (const player of [
      { x: 8, z: -84 },
      { x: -137, z: -30 },
      { x: 110, z: -65 },
    ]) {
      const wanted = photogrammetryWantedNodes(
        manifest,
        index,
        player,
        quality,
      );
      assert.ok(index.roots.every((node) => wanted.has(node.id)));
      const finest = [...wanted].filter(
        (id) => index.nodes.get(id)!.level === 16,
      );
      assert.ok(finest.length > 0);
      assert.ok(
        finest.length < manifest.leafCount,
        "distance LOD must not upload the whole city",
      );
      for (const id of wanted) {
        const parent = index.nodes.get(id)!.parent;
        if (parent && index.nodes.has(parent)) assert.ok(wanted.has(parent));
      }
    }
  }
});

const tinyForest = () => {
  const make = (
    id: string,
    parent: string | undefined,
    children: string[],
  ) => ({ ...manifest.nodes[0], id, parent, children });
  return photogrammetryIndex({
    ...manifest,
    nodes: [
      make("p", undefined, ["a", "b"]),
      make("a", "p", ["a1", "a2"]),
      make("b", "p", []),
      make("a1", "a", []),
      make("a2", "a", []),
    ],
  });
};

test('cache pressure retains staged children until the original finest branch can become visible',()=>{
 const forest=tinyForest(),wanted=new Set(['p','a','b','a1','a2']);
 let resident=new Set(['p','a','b','a1']);
 const stagedVisible=photogrammetryVisibleNodes(forest,wanted,resident);
 assert.deepEqual(photogrammetryEvictableNodes(forest,wanted,resident,stagedVisible),[]);
 resident.add('a2');
 const completeVisible=photogrammetryVisibleNodes(forest,wanted,resident);
 assert.deepEqual([...completeVisible].sort(),['a1','a2','b']);
 assert.deepEqual(photogrammetryEvictableNodes(forest,wanted,resident,completeVisible),['a']);
 resident.delete('a');
 assert.deepEqual([...photogrammetryVisibleNodes(forest,wanted,resident)].sort(),['a1','a2','b']);
});

test("a missing child or JPEG failure retains the parent without partial overlapping coverage", () => {
  const forest = tinyForest();
  const wanted = new Set(["p", "a", "b", "a1", "a2"]);
  assert.deepEqual(
    [...photogrammetryVisibleNodes(forest, wanted, new Set(["p", "a"]))],
    ["p"],
  );
  assert.deepEqual(
    [
      ...photogrammetryVisibleNodes(
        forest,
        wanted,
        new Set(["p", "a", "b", "a1"]),
      ),
    ],
    ["a", "b"],
  );
  assert.deepEqual(
    [
      ...photogrammetryVisibleNodes(
        forest,
        wanted,
        new Set(["p", "a", "b", "a1", "a2"]),
      ),
    ],
    ["a1", "a2", "b"],
  );
});

test("LRU-evicted hidden parents preserve complete descendant coverage until a coarser replacement arrives", () => {
  const forest = tinyForest();
  const ready = new Set(["p", "b", "a1", "a2"]);
  assert.ok(photogrammetryCoverage(forest, ready).has("a"));
  assert.deepEqual(
    [
      ...photogrammetryVisibleNodes(
        forest,
        new Set(["p", "a", "b", "a1", "a2"]),
        ready,
      ),
    ],
    ["a1", "a2", "b"],
  );
  // A distant-view request wants a and b, while a's texture reloads.
  assert.deepEqual(
    [...photogrammetryVisibleNodes(forest, new Set(["p", "a", "b"]), ready)],
    ["a1", "a2", "b"],
  );
  ready.add("a");
  assert.deepEqual(
    [...photogrammetryVisibleNodes(forest, new Set(["p", "a", "b"]), ready)],
    ["a", "b"],
  );
});

test("an interior source-region split preserves every retained vertex index and triangle winding", () => {
  const positions = new Float32Array([
    0, 0, 0, 1, 0, 0, 0, 0, -1, 5, 0, 0, 6, 0, 0, 5, 0, -1, 10, 0, 0, 11, 0, 0,
    10, 0, -1,
  ]);
  const before = positions.slice();
  const split = partitionPhotogrammetryTriangles(positions, manifest.nodes[0], {
    sourceRegion: (a) => (a.x < 2 ? "b6-shell" : undefined),
    excludeTriangle: (a) => a.x > 9,
  });
  assert.deepEqual(positions, before, "partitioning must not warp the survey");
  assert.deepEqual([...split.indices], [0, 1, 2, 3, 4, 5]);
  assert.deepEqual(split.ranges, [
    { region: "b6-shell", indexStart: 0, indexCount: 3 },
    { region: "", indexStart: 3, indexCount: 3 },
  ]);
});

test("the actual B6 source roof spans the surveyed seventy-metre slab in game coordinates", () => {
  const samples: Array<{ x: number; y: number; z: number }> = [];
  for (const node of manifest.nodes) {
    const center = photogrammetryNodeCenter(node, manifest);
    if (node.level !== 16 || Math.hypot(center.x - 8, center.z + 55) > 65)
      continue;
    const positions = photogrammetryPositions(
      decodeI3SGeometry(readFileSync(sourceFile(node.geometry))),
      node,
      manifest,
    );
    for (let i = 0; i < positions.length; i += 3) {
      const [x, y, z] = positions.subarray(i, i + 3);
      if (x > -3 && x < 17 && z > -91 && z < -19 && y > 17 && y < 23)
        samples.push({ x, y, z });
    }
  }
  assert.ok(
    samples.length > 1000,
    "real facade/roof vertices, not an invented box",
  );
  assert.ok(Math.min(...samples.map((p) => p.z)) < -89);
  assert.ok(Math.max(...samples.map((p) => p.z)) > -21);
  assert.ok(Math.min(...samples.map((p) => p.x)) < 1);
  assert.ok(Math.max(...samples.map((p) => p.x)) > 15);
});

test("PBR scan material preserves gamma atlas colors and explicitly describes baked daylight", () => {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  const texture = new Texture(null, scene, false, false);
  const material = createPhotogrammetryMaterial(scene, { id: "test" }, texture);
  assert.equal(material.albedoTexture, texture);
  assert.equal(texture.gammaSpace, true);
  assert.equal(material.metallic, 0);
  assert.equal(material.roughness, 1);
  assert.equal(material.backFaceCulling, false);
  assert.equal(material.unlit, true);
  assert.equal(material.metadata.bakedLighting, true);
  assert.equal(material.albedoColor.r, 1);
  material.dispose(false, false);
  texture.dispose();
  scene.dispose();
  engine.dispose();
});
