import { MaterialPluginBase } from "@babylonjs/core/Materials/materialPluginBase";
import { ShaderLanguage } from "@babylonjs/core/Materials/shaderLanguage";
import type { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import type { UniformBuffer } from "@babylonjs/core/Materials/uniformBuffer";
import type { AbstractEngine } from "@babylonjs/core/Engines/abstractEngine";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import type { SubMesh } from "@babylonjs/core/Meshes/subMesh";
import type { Scene } from "@babylonjs/core/scene";
import { TREE_FAMILIES, type TreeFamily, type TreePhenology } from "../shared/tree-season";

export type TreeSeasonMaterialState = { family: TreeFamily; phenology: TreePhenology };
export type TreeSeasonMaterialOptions = {
  /** Only for materials without a source-coloured direct transmission map. */
  tintDirectTranslucency?: boolean;
};
const owners = new WeakMap<AbstractMesh, TreeSeasonMaterialState>();
const neutral = { maturity: 1, senescence: 0, leafAmount: 1, litterPotential: 0 };
const safe = (value: number, fallback: number) => Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : fallback;
// Babylon 9.30 applies useAlbedoToTintTranslucency only to IBL irradiance.
// Direct transmission is accumulated after diffuse albedo multiplication, so
// tint that contribution exactly once. Keep identical source for both owners;
// the stable define separates their actual Effect cache identities.
const directTransmissionCode = {
  "!diffuseTransmissionBase\\s*\\+=\\s*info\\.diffuseTransmission\\s*\\*\\s*shadow\\s*;": `
    #ifdef STRAHOV_TREE_DIRECT_TRANSLUCENCY_TINT
    diffuseTransmissionBase+=info.diffuseTransmission*surfaceAlbedo*shadow;
    #else
    $0
    #endif`,
};

/** Update one clone's uniform owner; never mutate a shared material's alpha or
 * shader defines. Raw COLOR_0.a remains rank metadata, not vertex transparency. */
export function setTreeSeasonMaterialState(mesh: AbstractMesh, family: TreeFamily, phenology: TreePhenology) {
  if (!TREE_FAMILIES.includes(family)) throw new RangeError("Unknown tree material family");
  mesh.hasVertexAlpha = false;
  let state = owners.get(mesh);
  if (state) { state.family = family; state.phenology = phenology; }
  else { state = { family, phenology }; owners.set(mesh, state); }
  // Babylon Mesh.clone shares ordinary metadata by reference. Give each new
  // uniform owner its own shallow envelope, retaining other source metadata.
  if (mesh.metadata?.treeSeason !== state) mesh.metadata = { ...mesh.metadata, treeSeason: state };
}

/** Model-driven PBR colour only. Texture luminance/veins, normal/roughness and
 * source alpha remain; actual leaf removal belongs to the index prefix. */
export class TreeSeasonMaterialPlugin extends MaterialPluginBase {
  constructor(material: PBRMaterial, options: TreeSeasonMaterialOptions = {}) {
    super(material, "StrahovTreeSeason", 230, {
      STRAHOV_TREE_SEASON: true,
      STRAHOV_TREE_DIRECT_TRANSLUCENCY_TINT: options.tintDirectTranslucency === true,
    }, true, false);
    this.doNotSerialize = true; this.registerForExtraEvents = true; this._enable(true);
  }
  override getClassName() { return "TreeSeasonMaterialPlugin"; }
  override isCompatible(language: ShaderLanguage) { return language === ShaderLanguage.GLSL || language === ShaderLanguage.WGSL; }
  override getUniforms(language = ShaderLanguage.GLSL) {
    return { ubo: [{ name: "treeSeason", size: 3, type: "vec3" }],
      fragment: language === ShaderLanguage.GLSL ? "uniform vec3 treeSeason;" : undefined };
  }
  override hardBindForSubMesh(buffer: UniformBuffer, _scene: Scene, _engine: AbstractEngine, subMesh: SubMesh) {
    const owner = subMesh.getRenderingMesh().metadata?.treeSeason as TreeSeasonMaterialState | undefined;
    const state = owner?.phenology ?? neutral;
    const deciduous = owner?.family === "deciduous-broadleaf" || owner?.family === "deciduous-conifer";
    buffer.updateFloat3("treeSeason", safe(state.maturity, 1), safe(state.senescence, 0), deciduous ? 1 : 0);
  }
  override getCustomCode(type: string, language = ShaderLanguage.GLSL): Record<string, string> | null {
    if (!this.isCompatible(language)) return null;
    if (type === "vertex") return language === ShaderLanguage.GLSL ? {
      CUSTOM_VERTEX_DEFINITIONS: "varying float vTreeSeasonRank;",
      CUSTOM_VERTEX_MAIN_END: `
        #ifdef VERTEXCOLOR
        vTreeSeasonRank=color.a;
        #else
        vTreeSeasonRank=0.5;
        #endif`,
    } : {
      CUSTOM_VERTEX_DEFINITIONS: "varying vTreeSeasonRank: f32;",
      CUSTOM_VERTEX_MAIN_END: `
        #ifdef VERTEXCOLOR
        vertexOutputs.vTreeSeasonRank=vertexInputs.color.a;
        #else
        vertexOutputs.vTreeSeasonRank=0.5;
        #endif`,
    };
    if (type !== "fragment") return null;
    return language === ShaderLanguage.GLSL ? {
      ...directTransmissionCode,
      CUSTOM_FRAGMENT_DEFINITIONS: "varying float vTreeSeasonRank;",
      CUSTOM_FRAGMENT_UPDATE_ALBEDO: `
        float treeRank=clamp(vTreeSeasonRank,0.0,1.0);
        float treeAutumn=treeSeason.z*smoothstep(0.08+treeRank*0.22,0.78+treeRank*0.22,treeSeason.y);
        vec3 treeWarm=mix(vec3(1.0,0.48,0.06),vec3(0.48,0.16,0.035),treeRank);
        float treeLuma=dot(surfaceAlbedo,vec3(0.2126,0.7152,0.0722));
        treeWarm*=treeLuma/max(dot(treeWarm,vec3(0.2126,0.7152,0.0722)),0.001);
        surfaceAlbedo=mix(surfaceAlbedo,treeWarm,treeAutumn*0.88);
        surfaceAlbedo*=mix(1.04,1.0,treeSeason.x);`,
    } : {
      ...directTransmissionCode,
      CUSTOM_FRAGMENT_DEFINITIONS: "varying vTreeSeasonRank: f32;",
      CUSTOM_FRAGMENT_UPDATE_ALBEDO: `
        let treeRank=clamp(fragmentInputs.vTreeSeasonRank,0.0,1.0);
        let treeAutumn=uniforms.treeSeason.z*smoothstep(0.08+treeRank*0.22,0.78+treeRank*0.22,uniforms.treeSeason.y);
        var treeWarm=mix(vec3f(1.0,0.48,0.06),vec3f(0.48,0.16,0.035),treeRank);
        let treeLuma=dot(surfaceAlbedo,vec3f(0.2126,0.7152,0.0722));
        treeWarm*=treeLuma/max(dot(treeWarm,vec3f(0.2126,0.7152,0.0722)),0.001);
        surfaceAlbedo=mix(surfaceAlbedo,treeWarm,treeAutumn*0.88);
        surfaceAlbedo*=mix(1.04,1.0,uniforms.treeSeason.x);`,
    };
  }
}
