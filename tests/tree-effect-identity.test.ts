import test from "node:test";
import assert from "node:assert/strict";
import { setImmediate as turn } from "node:timers/promises";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { FreeCamera } from "@babylonjs/core/Cameras/freeCamera";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { TreeWindPlugin } from "../client/tree-wind";
import { TreeSeasonMaterialPlugin } from "../client/tree-season-material";
import "../client/render-shaders";

class ProcessingEngine extends NullEngine {
  constructor() { super(); this._webGLVersion = 2; this._shaderPlatformName = "WEBGL2"; }
}
// Restore only the previous public default class/empty feature identity. Real
// engine caching, PBR preparation and source injection remain untouched.
class LegacyWind extends TreeWindPlugin { override getClassName() { return "MaterialPluginBase"; } override collectDefines() {} }
class LegacySeason extends TreeSeasonMaterialPlugin { override getClassName() { return "MaterialPluginBase"; } override collectDefines() {} }
type Kind = "wind" | "season" | "combined" | "pilot-combined";
async function owner(scene: Scene, kind: Kind, legacy = false) {
  const mesh = MeshBuilder.CreateBox(kind, {}, scene), material = new PBRMaterial(kind, scene); mesh.material = material;
  if (kind !== "season") new (legacy ? LegacyWind : TreeWindPlugin)(material, { time: 0, x: 1, z: 1 });
  if (kind !== "wind") new (legacy ? LegacySeason : TreeSeasonMaterialPlugin)(material, { tintDirectTranslucency: kind === "pilot-combined" });
  for (let i = 0; i < 60 && !material.isReadyForSubMesh(mesh, mesh.subMeshes[0], false); i++) await turn();
  const effect = mesh.subMeshes[0].effect!; assert.ok(effect?.isReady());
  return { mesh, material, effect, defines: mesh.subMeshes[0].materialDefines!.toString() };
}
const coreDefines = (defines: string) => defines.split("\n").filter(line => !/MATERIALPLUGIN_|STRAHOV_TREE_(WIND|SEASON|DIRECT_TRANSLUCENCY_TINT)/.test(line)).join("\n");

for (const first of ["wind", "season"] as const) {
  test(`default identity reproduces actual wrong Effect reuse (${first} first)`, async () => {
    const engine = new ProcessingEngine(), scene = new Scene(engine); new FreeCamera("fixed", new Vector3(0, 1, -3), scene);
    try {
      const a = await owner(scene, first, true), b = await owner(scene, first === "wind" ? "season" : "wind", true);
      assert.equal(a.defines, b.defines); assert.equal(a.effect, b.effect);
      assert.equal(b.effect.vertexSourceCode.includes("treeGust"), first === "wind");
      assert.equal(b.effect.fragmentSourceCode.includes("treeWarm"), first === "season");
    } finally { scene.dispose(); engine.dispose(); }
  });
  test(`production identity separates every tree combination and shares equal owners (${first} first)`, async () => {
    const engine = new ProcessingEngine(), scene = new Scene(engine); new FreeCamera("fixed", new Vector3(0, 1, -3), scene);
    try {
      const a = await owner(scene, first), b = await owner(scene, first === "wind" ? "season" : "wind"), combined = await owner(scene, "combined");
      assert.equal(coreDefines(a.defines), coreDefines(b.defines)); assert.equal(coreDefines(a.defines), coreDefines(combined.defines));
      assert.notEqual(a.effect, b.effect); assert.notEqual(combined.effect, a.effect); assert.notEqual(combined.effect, b.effect);
      assert.match(combined.effect.vertexSourceCode, /treeGust/); assert.match(combined.effect.fragmentSourceCode, /treeWarm/);
      assert.match(combined.defines, /^#define STRAHOV_TREE_WIND$/m); assert.match(combined.defines, /^#define STRAHOV_TREE_SEASON$/m);
      const repeated = await owner(scene, "combined");
      assert.equal(repeated.effect, combined.effect); assert.notEqual(repeated.material._uniformBuffer, combined.material._uniformBuffer);
    } finally { scene.dispose(); engine.dispose(); }
  });
}

for (const pilotFirst of [false, true]) {
  test(`direct transmission opt-in has a distinct real Effect and equal owners share it (pilot first: ${pilotFirst})`, async () => {
    const engine = new ProcessingEngine(), scene = new Scene(engine); new FreeCamera("fixed", new Vector3(0, 1, -3), scene);
    try {
      const first = await owner(scene, pilotFirst ? "pilot-combined" : "combined");
      const second = await owner(scene, pilotFirst ? "combined" : "pilot-combined");
      const pilot = pilotFirst ? first : second, legacy = pilotFirst ? second : first;
      assert.equal(coreDefines(pilot.defines), coreDefines(legacy.defines));
      assert.match(pilot.defines, /^#define STRAHOV_TREE_DIRECT_TRANSLUCENCY_TINT$/m);
      assert.doesNotMatch(legacy.defines, /^#define STRAHOV_TREE_DIRECT_TRANSLUCENCY_TINT$/m);
      assert.notEqual(pilot.effect, legacy.effect, "shader choice cannot inherit the first owner's program");
      for (const [kind, expected] of [["pilot-combined", pilot], ["combined", legacy]] as const) {
        const repeated = await owner(scene, kind);
        assert.equal(repeated.effect, expected.effect);
        assert.notEqual(repeated.material._uniformBuffer, expected.material._uniformBuffer);
      }
    } finally { scene.dispose(); engine.dispose(); }
  });
}
