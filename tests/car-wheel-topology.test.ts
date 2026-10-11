import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { LoadAssetContainerAsync } from "@babylonjs/core/Loading/sceneLoader";
import "@babylonjs/loaders/glTF";
import { parseGlb } from "../scripts/car-glb-reader.mjs";
import manifest from "../shared/data/assets/vehicles-manifest.json";

const assets = "assets/blender/vehicles/innerscene-hatchback/";
const hash = (value: string | Uint8Array) =>
  createHash("sha256").update(value).digest("hex");
const current = (level: string) =>
  parseGlb(
    readFileSync("public/models/vehicles/campus-hatchback-" + level + ".glb"),
  );
const bodySignature = (model: ReturnType<typeof parseGlb>, mesh: number) =>
  model.json.meshes[mesh].primitives.map((p: any) =>
    hash(
      JSON.stringify({
        material: p.material,
        attributes: Object.fromEntries(
          Object.entries(p.attributes).map(([k, id]) => [
            k,
            model.accessor(id as number),
          ]),
        ),
        indices: model.accessor(p.indices),
      }),
    ),
  );

test("immutable source and accepted repaired near/master retain their reviewed hashes", () => {
  for (const [file, sha] of [
    [
      assets + "original-source.glb",
      "107410e01453abbce452fabbe6d51436fb98a0920672643a893263a8861873d7",
    ],
    [
      assets + "campus-hatchback-master.blend",
      "903eaf0fcfaa7a4ef1ce15a89435e3e4186db8190907e0099b5be7f52e44e83f",
    ],
    [
      "public/models/vehicles/campus-hatchback-near.glb",
      "7491240d9c5acc10375a394bc9b56a02f314da749dfb63e397506d90ae33c853",
    ],
  ])
    assert.equal(hash(readFileSync(file)), sha);
});

test("medium/far retain every frozen J body attribute, PBR material, node/pivot and embedded image", () => {
  for (const level of ["medium", "far"]) {
    const before = parseGlb(
        readFileSync(assets + "lod-baseline-j/" + level + ".glb"),
      ),
      after = current(level);
    assert.deepEqual(after.json.nodes, before.json.nodes);
    assert.deepEqual(after.json.materials, before.json.materials);
    assert.deepEqual(after.json.textures, before.json.textures);
    assert.deepEqual(after.json.samplers, before.json.samplers);
    const images = (model: ReturnType<typeof parseGlb>) =>
      model.json.images.map((i: any) => {
        const v = model.json.bufferViews[i.bufferView];
        return hash(
          model.bin.subarray(
            v.byteOffset ?? 0,
            (v.byteOffset ?? 0) + v.byteLength,
          ),
        );
      });
    assert.deepEqual(images(after), images(before));
    for (const node of after.json.nodes)
      if (node.name.startsWith("Body:"))
        assert.deepEqual(
          bodySignature(after, node.mesh),
          bodySignature(before, node.mesh),
          level + " " + node.name,
        );
  }
});

test("all 32 actual exported wheel parts have closed, consistently wound topology and no degenerate triangles", () => {
  let parts = 0;
  for (const level of ["medium", "far"]) {
    const model = current(level);
    for (const node of model.json.nodes) {
      if (!node.name.startsWith("Wheel")) continue;
      parts++;
      for (const primitive of model.json.meshes[node.mesh].primitives) {
        const positions = model.accessor(primitive.attributes.POSITION),
          normals = model.accessor(primitive.attributes.NORMAL),
          uv = model.accessor(primitive.attributes.TEXCOORD_0),
          indices = model.accessor(primitive.indices).flat();
        assert.ok(
          [...positions, ...normals, ...uv].every((row) =>
            row.every(Number.isFinite),
          ),
        );
        assert.ok(normals.every((n) => Math.abs(Math.hypot(...n) - 1) < 1e-4));
        const weld = positions.map((p) =>
            p.map((v) => Math.round(v * 1e6)).join(","),
          ),
          edges = new Map<string, { count: number; direction: number }>();
        for (let t = 0; t < indices.length; t += 3) {
          const ids = indices.slice(t, t + 3);
          assert.ok(
            ids.every(
              (i) => Number.isInteger(i) && i >= 0 && i < positions.length,
            ),
          );
          const [a, b, c] = ids.map((i) => positions[i]),
            u = b.map((v, i) => v - a[i]),
            v = c.map((x, i) => x - a[i]),
            cross = [
              u[1] * v[2] - u[2] * v[1],
              u[2] * v[0] - u[0] * v[2],
              u[0] * v[1] - u[1] * v[0],
            ];
          assert.ok(
            Math.hypot(...cross) > 1e-12,
            level + " " + node.name + " triangle " + t / 3,
          );
          for (let e = 0; e < 3; e++) {
            const a = weld[ids[e]],
              b = weld[ids[(e + 1) % 3]],
              key = a < b ? a + "|" + b : b + "|" + a,
              edge = edges.get(key) ?? { count: 0, direction: 0 };
            edge.count++;
            edge.direction += a < b ? 1 : -1;
            edges.set(key, edge);
          }
        }
        let invalid = 0;
        for (const edge of edges.values())
          if (edge.count !== 2 || edge.direction !== 0) invalid++;
        assert.equal(
          invalid,
          0,
          level + " " + node.name + " boundary/nonmanifold/orientation edges",
        );
      }
    }
  }
  assert.equal(parts, 32);
});

test("source weld preserves every corner UV and avoids all export-time geometry repairs", () => {
  const audit = JSON.parse(
    readFileSync(assets + "wheel-weld-audit.json", "utf8"),
  );
  assert.equal(audit.sourceUnchanged, true);
  assert.equal(audit.levels.length, 2);
  for (const level of audit.levels) {
    assert.equal(level.parts.length, 16);
    for (const part of level.parts) {
      assert.equal(part.beforeLoopUVSha256, part.afterWeldLoopUVSha256);
      assert.ok(part.weldMaximumNearestSourceMetres <= 1e-6);
      assert.equal(part.welded.boundaryEdges, 0);
      assert.equal(part.after.boundaryEdges, 0);
      assert.equal(part.validateChanged, false);
      assert.equal(part.matrixUnchanged, true);
    }
  }
});

test("real Babylon GLB importer loads all three levels and independent wheel nodes with current manifest sizes", async () => {
  const engine = new NullEngine(),
    scene = new Scene(engine);
  scene.useRightHandedSystem = true;
  scene.useDelayedTextureLoading = true;
  try {
    for (const definition of manifest.lods) {
      const data = readFileSync("public" + definition.url);
      assert.equal(data.length, definition.bytes);
      assert.equal(hash(data), definition.sha256);
      const container = await LoadAssetContainerAsync(
        new Uint8Array(data),
        scene,
        {
          pluginExtension: ".glb",
          name: "closed-wheel-" + definition.level + ".glb",
        },
      );
      try {
        const meshes = container.meshes.filter((m) => m.getTotalVertices() > 0);
        assert.equal(meshes.length, 26);
        assert.equal(
          meshes.reduce((s, m) => s + m.getTotalIndices() / 3, 0),
          definition.triangles,
        );
        assert.equal(
          meshes.filter((m) => m.name.startsWith("Wheel")).length,
          16,
        );
        assert.ok(
          meshes.every((m) =>
            m.getVerticesData("position")!.every(Number.isFinite),
          ),
        );
      } finally {
        container.dispose();
      }
    }
  } finally {
    scene.dispose();
    engine.dispose();
  }
});
