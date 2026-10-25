import { MaterialPluginBase } from "@babylonjs/core/Materials/materialPluginBase";
import { ShaderLanguage } from "@babylonjs/core/Materials/shaderLanguage";
import { Constants } from "@babylonjs/core/Engines/constants";
import type { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import type { Texture } from "@babylonjs/core/Materials/Textures/texture";
import type { BaseTexture } from "@babylonjs/core/Materials/Textures/baseTexture";
import type { UniformBuffer } from "@babylonjs/core/Materials/uniformBuffer";
import { GROUND_DIRT_SEGMENTS } from "../shared/ground-cover";
import { campusSurfaceArt } from "./cinematic-art";

const GRASS_ART = campusSurfaceArt("grass")!;

export const GROUND_SOIL_RESPONSE = Object.freeze({
  tint: [1.15, 1.1, 0.96] as const,
  normalStrength: 0.33,
  specularIntensity: 0.28,
  darken: 0.18,
  smooth: 0.23,
});
type Maps = { color: Texture; normal: Texture; roughness: Texture };
export type GroundBlendSource = {
  maps: Maps;
  repeat: number;
  tint: readonly number[];
  normalStrength: number;
  darken: number;
  smooth: number;
};
const number = (value: number) => value.toFixed(6);

function field(language: ShaderLanguage) {
  const wgsl = language === ShaderLanguage.WGSL;
  const statements = GROUND_DIRT_SEGMENTS.map(({ a, b, radius }, i) =>
    wgsl
      ? `
  let a${i}=vec2f(${number(a[0])},${number(a[1])}); let d${i}=vec2f(${number(b[0] - a[0])},${number(b[1] - a[1])});
  let t${i}=clamp(dot(p-a${i},d${i})/dot(d${i},d${i}),0.0,1.0);
  wear=max(wear,1.0-smoothstep(${number(radius * 0.65)},${number(radius + 0.65)}+.25*variation,length(p-a${i}-d${i}*t${i})));`
      : `
  vec2 a${i}=vec2(${number(a[0])},${number(a[1])}),d${i}=vec2(${number(b[0] - a[0])},${number(b[1] - a[1])});
  float t${i}=clamp(dot(p-a${i},d${i})/dot(d${i},d${i}),0.0,1.0);
  wear=max(wear,1.0-smoothstep(${number(radius * 0.65)},${number(radius + 0.65)}+.25*variation,length(p-a${i}-d${i}*t${i})));`,
  ).join("");
  return wgsl
    ? `
fn groundHash(p:vec2i)->f32 { var h=bitcast<u32>(p.x)*374761393u+bitcast<u32>(p.y)*668265263u; h=(h^(h>>13u))*1274126177u; return f32(h^(h>>16u))/4294967296.0; }
fn groundNoise(p:vec2f)->f32 { let c=vec2i(floor(p)); var f=fract(p); f=f*f*(vec2f(3.0)-2.0*f); return mix(mix(groundHash(c),groundHash(c+vec2i(1,0)),f.x),mix(groundHash(c+vec2i(0,1)),groundHash(c+vec2i(1,1)),f.x),f.y); }
fn groundField(p:vec2f)->vec2f { let variation=.65*groundNoise(p/8.0)+.35*groundNoise(p/1.7); var wear=0.0; ${statements} return vec2f(variation,wear); }
fn groundLawn(c:vec3f,v:f32)->vec3f { return mix(c,c*vec3f(1.09,.96,.74),.3*(1.0-v))*(.88+.24*v); }
fn groundSoil(c:vec3f,v:f32)->vec3f { return c*(.94+.12*v); }
fn groundCompressGrass(c:vec3f,factor:vec3f,detail:f32)->vec3f {
  let bounded=mix(uniforms.groundGrassMean.rgb*factor,c,detail);
  let luma=dot(bounded,vec3f(.2126,.7152,.0722));
  return mix(vec3f(luma),bounded,uniforms.groundGrassMean.w);
}
`
    : `
float groundHash(ivec2 p) { uint h=uint(p.x)*374761393u+uint(p.y)*668265263u; h=(h^(h>>13u))*1274126177u; return float(h^(h>>16u))/4294967296.0; }
float groundNoise(vec2 p) { ivec2 c=ivec2(floor(p)); vec2 f=fract(p); f=f*f*(vec2(3.0)-2.0*f); return mix(mix(groundHash(c),groundHash(c+ivec2(1,0)),f.x),mix(groundHash(c+ivec2(0,1)),groundHash(c+ivec2(1,1)),f.x),f.y); }
vec2 groundField(vec2 p) { float variation=.65*groundNoise(p/8.0)+.35*groundNoise(p/1.7),wear=0.0; ${statements} return vec2(variation,wear); }
vec3 groundLawn(vec3 c,float v) { return mix(c,c*vec3(1.09,.96,.74),.3*(1.0-v))*(.88+.24*v); }
vec3 groundSoil(vec3 c,float v) { return c*(.94+.12*v); }
vec3 groundCompressGrass(vec3 c,vec3 factor,float detail) {
  vec3 bounded=mix(groundGrassMean.rgb*factor,c,detail);
  float luma=dot(bounded,vec3(.2126,.7152,.0722));
  return mix(vec3(luma),bounded,groundGrassMean.w);
}
`;
}
function shader(language: ShaderLanguage) {
  const wgsl = language === ShaderLanguage.WGSL;
  return Object.freeze(
    wgsl
      ? {
          CUSTOM_FRAGMENT_DEFINITIONS: `${field(language)}
var groundOtherAlbedoSampler:sampler; var groundOtherAlbedo:texture_2d<f32>;
var groundOtherNormalSampler:sampler; var groundOtherNormal:texture_2d<f32>;
var groundOtherRoughnessSampler:sampler; var groundOtherRoughness:texture_2d<f32>;
var<private> groundBlend:f32=0.0; var<private> groundMixedRoughness:f32=1.0;`,
          CUSTOM_FRAGMENT_BEFORE_LIGHTS: `
  let groundValue=groundField(fragmentInputs.vPositionW.xz);
  let groundUV=fragmentInputs.vPositionW.xz/uniforms.groundCoverConfig.y;
  let groundEyeOffset=scene.vEyePosition.xyz-fragmentInputs.vPositionW;
  let groundDetail=mix(uniforms.groundGrassDetail.x,uniforms.groundGrassDetail.y,
    smoothstep(uniforms.groundGrassDetail.z,uniforms.groundGrassDetail.w,dot(groundEyeOffset,groundEyeOffset)));
  groundBlend=mix(groundValue.y,1.0-groundValue.y,uniforms.groundCoverConfig.x);
  let groundOtherFactor=uniforms.groundOtherTint.rgb*(1.0-uniforms.groundCoverConfig.w*uniforms.groundOtherResponse.x);
  let groundRaw=toLinearSpaceVec3(TEXRD(groundOtherAlbedo,groundOtherAlbedoSampler,groundUV).rgb)*groundOtherFactor;
  groundMixedRoughness=TEXRD(groundOtherRoughness,groundOtherRoughnessSampler,groundUV).r*(1.0-uniforms.groundCoverConfig.w*uniforms.groundOtherResponse.y);
  let groundOtherColor=mix(groundSoil(groundRaw,groundValue.x),groundLawn(groundCompressGrass(groundRaw,groundOtherFactor,groundDetail),groundValue.x),uniforms.groundCoverConfig.x);
  surfaceAlbedo=mix(mix(groundLawn(groundCompressGrass(surfaceAlbedo,uniforms.vAlbedoColor.rgb,groundDetail),groundValue.x),groundSoil(surfaceAlbedo,groundValue.x),uniforms.groundCoverConfig.x),groundOtherColor,groundBlend);
  #ifdef BUMP
  let groundNormalSample=TEXRD(groundOtherNormal,groundOtherNormalSampler,groundUV).xyz*2.0-vec3f(1.0);
  let groundTBN=cotangent_frame(geometricNormalW,fragmentInputs.vPositionW,groundUV,uniforms.vTangentSpaceParams);
  let groundOtherN=normalize(groundTBN*normalize(groundNormalSample*vec3f(uniforms.groundCoverConfig.z,uniforms.groundCoverConfig.z,1.0)));
  normalW=normalize(mix(normalW,groundOtherN,groundBlend));
  #endif`,
          CUSTOM_FRAGMENT_UPDATE_METALLICROUGHNESS:
            "metallicRoughness.g=mix(metallicRoughness.g,groundMixedRoughness,groundBlend);",
        }
      : {
          CUSTOM_FRAGMENT_DEFINITIONS: `${field(language)}
uniform sampler2D groundOtherAlbedo; uniform sampler2D groundOtherNormal; uniform sampler2D groundOtherRoughness;
float groundBlend=0.0; float groundMixedRoughness=1.0;`,
          CUSTOM_FRAGMENT_BEFORE_LIGHTS: `
  vec2 groundValue=groundField(vPositionW.xz),groundUV=vPositionW.xz/groundCoverConfig.y;
  vec3 groundEyeOffset=vEyePosition.xyz-vPositionW;
  float groundDetail=mix(groundGrassDetail.x,groundGrassDetail.y,
    smoothstep(groundGrassDetail.z,groundGrassDetail.w,dot(groundEyeOffset,groundEyeOffset)));
  groundBlend=mix(groundValue.y,1.0-groundValue.y,groundCoverConfig.x);
  vec3 groundOtherFactor=groundOtherTint.rgb*(1.0-groundCoverConfig.w*groundOtherResponse.x);
  vec3 groundRaw=toLinearSpace(TEXRD(groundOtherAlbedo,groundUV).rgb)*groundOtherFactor;
  groundMixedRoughness=TEXRD(groundOtherRoughness,groundUV).r*(1.0-groundCoverConfig.w*groundOtherResponse.y);
  vec3 groundOtherColor=mix(groundSoil(groundRaw,groundValue.x),groundLawn(groundCompressGrass(groundRaw,groundOtherFactor,groundDetail),groundValue.x),groundCoverConfig.x);
  surfaceAlbedo=mix(mix(groundLawn(groundCompressGrass(surfaceAlbedo,vAlbedoColor.rgb,groundDetail),groundValue.x),groundSoil(surfaceAlbedo,groundValue.x),groundCoverConfig.x),groundOtherColor,groundBlend);
  #ifdef BUMP
  vec3 groundNormalSample=TEXRD(groundOtherNormal,groundUV).xyz*2.0-vec3(1.0);
  mat3 groundTBN=cotangent_frame(geometricNormalW,vPositionW,groundUV,vTangentSpaceParams);
  vec3 groundOtherN=normalize(groundTBN*normalize(groundNormalSample*vec3(groundCoverConfig.z,groundCoverConfig.z,1.0)));
  normalW=normalize(mix(normalW,groundOtherN,groundBlend));
  #endif`,
          CUSTOM_FRAGMENT_UPDATE_METALLICROUGHNESS:
            "metallicRoughness.g=mix(metallicRoughness.g,groundMixedRoughness,groundBlend);",
        },
  );
}
const RECIPES = {
  glsl: shader(ShaderLanguage.GLSL),
  wgsl: shader(ShaderLanguage.WGSL),
};

/** Two real PBR surfaces share one world field; no extra mesh/alpha layer. */
export class GroundCoverMaterialPlugin extends MaterialPluginBase {
  override getClassName() {
    return "GroundCoverMaterialPlugin";
  }

  private wet = 0;
  private readonly textures: readonly Texture[];
  constructor(
    material: PBRMaterial,
    private readonly soilBase: boolean,
    private readonly other: GroundBlendSource,
  ) {
    super(material, "SourceGroundCover", 190, {}, true, true);
    this.doNotSerialize = true;
    // Same native sampling path for both families and every PBR channel.
    // Translation only preserves tangent normal orientation. No luminance
    // weighting: albedo/normal/roughness must use the same spatial weights.
    material.textureRepetitionMode = Constants.TEXTURE_REPETITION_HEX_TILING;
    material.textureRepetitionHexTilingParams = [0, 0, 7, 0.5];
    this.textures = [other.maps.color, other.maps.normal, other.maps.roughness];
    material.metadata = {
      ...material.metadata,
      groundCover: "source-field-v1",
      groundCoverBase: soilBase ? "soil" : "grass",
      sourcePixelsUnchanged: true,
      groundHeightChanged: false,
      groundSampling: "native-hex-translation-shared-channel-weights",
      groundTextureFetches: 18,
      groundGrassDetailBasis:
        "original CampusSurfaceArt source mean, distance contrast and saturation restored before grass/soil mixing",
      groundVariationBasis:
        "deterministic artistic lawn/wear variation; dirt axes from archived OSM tags",
    };
  }
  setWetness(wet: number) {
    this.wet = Math.max(0, Math.min(1, Number.isFinite(wet) ? wet : 0));
  }
  override isCompatible(language: ShaderLanguage) {
    return language === ShaderLanguage.GLSL || language === ShaderLanguage.WGSL;
  }
  override getSamplers(samplers: string[]) {
    samplers.push(
      "groundOtherAlbedo",
      "groundOtherNormal",
      "groundOtherRoughness",
    );
  }
  override getActiveTextures(textures: BaseTexture[]) {
    textures.push(...this.textures);
  }
  override hasTexture(texture: BaseTexture) {
    return this.textures.includes(texture as Texture);
  }
  override isReadyForSubMesh() {
    for (const texture of this.textures)
      if (!texture.isReadyOrNotBlocking()) return false;
    return true;
  }
  override getUniforms(language = ShaderLanguage.GLSL) {
    return {
      ubo: [
        { name: "groundCoverConfig", size: 4, type: "vec4" },
        { name: "groundOtherTint", size: 3, type: "vec3" },
        { name: "groundOtherResponse", size: 2, type: "vec2" },
        { name: "groundGrassMean", size: 4, type: "vec4" },
        { name: "groundGrassDetail", size: 4, type: "vec4" },
      ],
      fragment:
        language === ShaderLanguage.GLSL
          ? "uniform vec4 groundCoverConfig; uniform vec3 groundOtherTint; uniform vec2 groundOtherResponse; uniform vec4 groundGrassMean; uniform vec4 groundGrassDetail;"
          : undefined,
    };
  }
  override bindForSubMesh(buffer: UniformBuffer) {
    buffer.updateFloat4(
      "groundCoverConfig",
      Number(this.soilBase),
      this.other.repeat,
      this.other.normalStrength,
      this.wet,
    );
    buffer.updateFloat3(
      "groundOtherTint",
      this.other.tint[0],
      this.other.tint[1],
      this.other.tint[2],
    );
    buffer.updateFloat2(
      "groundOtherResponse",
      this.other.darken,
      this.other.smooth,
    );
    buffer.updateFloat4(
      "groundGrassMean",
      ...GRASS_ART.sourceMean,
      GRASS_ART.saturation,
    );
    buffer.updateFloat4(
      "groundGrassDetail",
      GRASS_ART.nearDetail,
      GRASS_ART.farDetail,
      GRASS_ART.fineMetres ** 2,
      16 * GRASS_ART.coarseMetres ** 2,
    );
    buffer.setTexture("groundOtherAlbedo", this.other.maps.color);
    buffer.setTexture("groundOtherNormal", this.other.maps.normal);
    buffer.setTexture("groundOtherRoughness", this.other.maps.roughness);
  }
  override getCustomCode(type: string, language = ShaderLanguage.GLSL) {
    return type !== "fragment"
      ? null
      : language === ShaderLanguage.WGSL
        ? RECIPES.wgsl
        : RECIPES.glsl;
  }
}
