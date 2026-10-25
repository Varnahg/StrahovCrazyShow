import test from "node:test";
import assert from "node:assert/strict";
import { setImmediate as turn } from "node:timers/promises";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { FreeCamera } from "@babylonjs/core/Cameras/freeCamera";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import { GroundCoverMaterialPlugin } from "../client/ground-cover-material";
import { CampusSurfaceArtPlugin, campusSurfaceArt } from "../client/cinematic-art";
import "../client/render-shaders";

/** Only the driver/texture IO is NullEngine. Keep Babylon's real PBR effect
 * preparation, plugin manager, GLSL processing, UBO layout and Effect cache. */
class WebGL2ProcessingEngine extends NullEngine {
  programs = 0;
  constructor() {
    super({ renderWidth: 128, renderHeight: 128, textureSize: 1, deterministicLockstep: false, lockstepMaxSteps: 4 });
    this._webGLVersion = 2;
    this._shaderPlatformName = "WEBGL2";
    this.getCaps().standardDerivatives = true;
  }
  override createShaderProgram(...args: Parameters<NullEngine["createShaderProgram"]>) {
    this.programs++;
    return super.createShaderProgram(...args);
  }
}

// These subclasses restore only the pre-fix public plugin identity. They do
// not replace shaders, manufacture Effect objects or alter engine cache keys.
class LegacyGroundPlugin extends GroundCoverMaterialPlugin {
  override getClassName() { return "MaterialPluginBase"; }
}
class LegacyPavingPlugin extends CampusSurfaceArtPlugin {
  override getClassName() { return "MaterialPluginBase"; }
}
type Kind = "ground" | "paving";
const groundSamplers = ["groundOtherAlbedo", "groundOtherNormal", "groundOtherRoughness"];
const withoutPluginIdentity = (defines: string) => defines.split("\n")
  .filter(line => !/^#define MATERIALPLUGIN_\d+(?:\s|$)/.test(line)).join("\n");

function fixture(legacy: boolean) {
  const engine = new WebGL2ProcessingEngine(), scene = new Scene(engine);
  scene.useRightHandedSystem = true;
  new FreeCamera("effect identity camera", new Vector3(0, 2, 3), scene);
  new HemisphericLight("shared hemispheric light", Vector3.Up(), scene);
  const texture = (name: string, gamma: boolean) => {
    // NullEngine's real URL-texture IO adapter supplies ready InternalTextures;
    // its RawTexture path does not. No readiness/cache method is overridden.
    const map = new Texture("/fixture-effect-identity/" + name + ".png", scene, false, false);
    map.gammaSpace = gamma;
    return map;
  };
  const color = texture("color", true), normal = texture("normal", false), roughness = texture("roughness", false);
  const other = { maps: { color, normal, roughness }, repeat: 1.3, tint: [1.15, 1.1, .96], normalStrength: .33, darken: .18, smooth: .23 };
  let sequence = 0;
  function owner(kind: Kind, soilBase = false) {
    const material = new PBRMaterial(kind + ++sequence, scene);
    // Match the material flags that can enter the real PBR Effect cache key.
    material.albedoTexture = color; material.bumpTexture = normal; material.metallicTexture = roughness;
    material.metallic = 0; material.roughness = 1;
    material.useRoughnessFromMetallicTextureAlpha = false;
    material.useRoughnessFromMetallicTextureGreen = true;
    material.useMetallnessFromMetallicTextureBlue = false;
    material.useAmbientOcclusionFromMetallicTextureRed = false;
    const plugin = kind === "ground"
      ? new (legacy ? LegacyGroundPlugin : GroundCoverMaterialPlugin)(material, soilBase, other)
      : new (legacy ? LegacyPavingPlugin : CampusSurfaceArtPlugin)(material, campusSurfaceArt("paving")!);
    // Keep this AFTER plugin construction: future production HEX_TILING must
    // not make an identity test pass merely by adding a repetition define.
    material.textureRepetitionMode = 0;
    const mesh = MeshBuilder.CreateGround(material.name, { width: 1, height: 1 }, scene);
    mesh.material = material; mesh.computeWorldMatrix(true);
    return { material, mesh, plugin };
  }
  return { engine, scene, owner, dispose() { scene.dispose(); engine.dispose(); } };
}

async function prepare(owner: ReturnType<ReturnType<typeof fixture>["owner"]>) {
  const subMesh = owner.mesh.subMeshes[0];
  for (let attempt = 0; attempt < 80; attempt++) {
    if (owner.material.isReadyForSubMesh(owner.mesh, subMesh, false)) {
      const effect = subMesh.effect;
      assert.ok(effect);
      assert.ok(effect.isReady());
      const defines = subMesh.materialDefines!.toString();
      assert.equal(owner.material.textureRepetitionMode, 0);
      assert.match(defines, /^#define TEXTURE_REPETITION_MODE 0$/m);
      assert.match(defines, /^#define BUMP$/m);
      assert.match(defines, /^#define ALBEDO$/m);
      const fragment = effect.fragmentSourceCode;
      // NullEngine.getUniforms() returns [], so normal WebGL reflection prunes
      // getSamplers() to [] for every material. Inspect the real Effect's
      // original uniform/sampler names and emitted sampler declarations instead;
      // do not manufacture driver locations to make the test succeed.
      const samplers = [...fragment.matchAll(/\buniform\s+(?:(?:lowp|mediump|highp)\s+)?sampler2D\s+(\w+)\s*;/g)]
        .map(match => match[1]);
      return { effect, defines, samplers, uniformNames: effect.getUniformNames(), fragment };
    }
    await turn();
  }
  assert.fail("Actual PBR effect did not become ready in the bounded CPU fixture: " + JSON.stringify({
    textures: owner.material.getActiveTextures().map(texture => ({ name: texture.name, ready: texture.isReady() })),
    effectError: subMesh.effect?.getCompilationError(),
  }));
}

for (const first of ["ground", "paving"] as const) {
  const second: Kind = first === "ground" ? "paving" : "ground";
  test(`legacy default plugin identity reproduces the real cache collision (${first} first)`, async () => {
    const f = fixture(true);
    try {
      const aOwner = f.owner(first), a = await prepare(aOwner), programs = f.engine.programs;
      const bOwner = f.owner(second), b = await prepare(bOwner);
      assert.equal(aOwner.plugin.getClassName(), bOwner.plugin.getClassName());
      // Read each owner's own freshly prepared defines, not the shared Effect
      // defines twice. A different texture/light/repetition key invalidates the reproduction.
      assert.equal(a.defines, b.defines);
      assert.equal(a.effect, b.effect, "old public identity must reproduce the actual cache hit");
      assert.equal(f.engine.programs, programs, "second owner reused a compiled program");
      if (first === "ground") {
        assert.match(b.fragment, /groundField\(/);
        assert.match(b.fragment, /groundOtherAlbedo/);
        assert.ok(groundSamplers.every(name => b.samplers.includes(name)), "paving incorrectly inherits ground samplers");
        assert.ok(groundSamplers.every(name => b.uniformNames.includes(name)));
        assert.doesNotMatch(b.fragment, /campusArtSettings/);
      } else {
        assert.match(b.fragment, /campusArtSettings/);
        assert.doesNotMatch(b.fragment, /groundField\(|groundOtherAlbedo/);
        assert.ok(groundSamplers.every(name => !b.samplers.includes(name)), "ground incorrectly loses its samplers");
        assert.ok(groundSamplers.every(name => !b.uniformNames.includes(name)));
      }
    } finally { f.dispose(); }
  });

  test(`production plugin identity separates ground/paving but shares ground owners (${first} first)`, async () => {
    const f = fixture(false);
    try {
      const aOwner = f.owner(first), a = await prepare(aOwner);
      const bOwner = f.owner(second), b = await prepare(bOwner);
      assert.equal(withoutPluginIdentity(a.defines), withoutPluginIdentity(b.defines), "only plugin identity may distinguish this fixture");
      assert.notEqual(a.defines, b.defines);
      assert.notEqual(a.effect, b.effect);
      const ground = first === "ground" ? a : b, paving = first === "paving" ? a : b;
      assert.match(ground.fragment, /groundField\(/);
      assert.ok(groundSamplers.every(name => ground.samplers.includes(name)));
      assert.ok(groundSamplers.every(name => ground.uniformNames.includes(name)));
      assert.match(paving.fragment, /campusArtSettings/);
      assert.doesNotMatch(paving.fragment, /groundField\(|groundOtherAlbedo|groundOtherNormal|groundOtherRoughness/);
      assert.ok(groundSamplers.every(name => !paving.samplers.includes(name)));
      assert.ok(groundSamplers.every(name => !paving.uniformNames.includes(name)));
      const programs = f.engine.programs;
      const repeatedOwner = f.owner("ground", true), repeated = await prepare(repeatedOwner);
      assert.equal(repeated.defines, ground.defines);
      assert.equal(repeated.effect, ground.effect, "uniform-only grass/soil choice preserves real shader sharing");
      assert.equal(f.engine.programs, programs);
      assert.notEqual(repeatedOwner.material._uniformBuffer, (first === "ground" ? aOwner : bOwner).material._uniformBuffer);
    } finally { f.dispose(); }
  });
}
