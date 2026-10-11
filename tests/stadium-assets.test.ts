import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { parseGlb } from "../scripts/car-glb-reader.mjs";
import manifest from "../public/models/landmarks/manifest.json";
import { buildLandmarkPlan } from "../shared/landmark-reality";
const sha = (bytes: Uint8Array) =>
  createHash("sha256").update(bytes).digest("hex");

test("stadium archives match the current shared exterior geometry and keep actual tinted COLOR_0", () => {
  assert.equal(
    manifest.sourceGeometrySha256,
    sha(readFileSync("docs/reality-pack/landmarks/geometry-source.json")),
  );
  const plan = buildLandmarkPlan();
  for (const far of [false, true]) {
    const id = "great-strahov-stadium" + (far ? "-far" : ""),
      entry = manifest.modules.find((m) => m.id === id)!;
    const bytes = readFileSync("public/models/landmarks/" + id + ".glb"),
      glb = parseGlb(bytes);
    assert.equal(sha(bytes), entry.sha256);
    const expected = plan.parts
      .filter((p) => p.group === "stadium" && p.lod !== (far ? "near" : "far"))
      .reduce((n, p) => n + p.indices.length / 3, 0);
    assert.equal(entry.triangles, expected);
    const actual = glb.json.meshes
      .flatMap((m: any) => m.primitives)
      .reduce(
        (n: number, p: any) => n + glb.json.accessors[p.indices].count / 3,
        0,
      );
    assert.equal(actual, expected);
    const root = glb.json.nodes.find((n: any) => n.name === id)!;
    assert.equal(root.extras.modelScope, "exterior-only");
    assert.equal(root.extras.interiorPubliclyAccessible, false);
    const node = glb.json.nodes.find((n: any) =>
      n.name.startsWith("stadium-glass "),
    );
    const primitive = glb.json.meshes[node.mesh].primitives[0],
      color = primitive.attributes.COLOR_0;
    assert.ok(
      color !== undefined,
      "default white COLOR_0 must not hide the original tint in COLOR_1",
    );
    assert.equal(primitive.attributes.COLOR_1, undefined);
    const values = glb.accessor(color).flat();
    assert.ok(
      values.some((v) => v < 0.99) && values.every((v) => v >= 0 && v <= 1),
    );
    const pbr = glb.json.materials[primitive.material].pbrMetallicRoughness;
    assert.ok(
      pbr.baseColorFactor &&
        pbr.baseColorFactor[0] < pbr.baseColorFactor[1] &&
        pbr.baseColorFactor[1] < pbr.baseColorFactor[2],
      "blue-grey material factor must survive Blender's multiply-node export",
    );
    assert.ok(
      glb.json.materials.every(
        (m: any) => (m.alphaMode ?? "OPAQUE") === "OPAQUE",
      ),
      "no new transparent passes",
    );
  }
});
