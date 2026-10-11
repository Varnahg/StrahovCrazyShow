import { MaterialPluginBase } from "@babylonjs/core/Materials/materialPluginBase";
import { ShaderLanguage } from "@babylonjs/core/Materials/shaderLanguage";
import { ColorCurves } from "@babylonjs/core/Materials/colorCurves";
import type { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import type { UniformBuffer } from "@babylonjs/core/Materials/uniformBuffer";
import type { ImageProcessingConfiguration } from "@babylonjs/core/Materials/imageProcessingConfiguration";

/** Art direction, not a survey of stains, repairs or surface reflectance.
 * The existing CC0 maps supply aggregate/joints. These bounded variations only
 * prevent a kilometre of ground from looking like one perfectly even swatch. */
export type CampusSurfaceArt = Readonly<{
  tint: readonly [number, number, number];
  saturation: number;
  variation: number;
  coarseMetres: number;
  fineMetres: number;
  roughnessVariation: number;
  normalStrength: number;
  specularIntensity: number;
}>;

const ART: Readonly<Record<string, CampusSurfaceArt>> = {
  // Cool the olive bias of the generic source. Keep pavement clearly darker
  // than concrete; do not paste aerial shadows, vehicles or road repairs here.
  asphalt: {
    tint: [0.85, 0.89, 0.94],
    saturation: 0.62,
    variation: 0.13,
    coarseMetres: 17,
    fineMetres: 4.5,
    roughnessVariation: 0.055,
    normalStrength: 0.32,
    specularIntensity: 0.67,
  },
  concrete: {
    tint: [0.83, 0.84, 0.79],
    saturation: 0.86,
    variation: 0.07,
    coarseMetres: 12,
    fineMetres: 3.2,
    roughnessVariation: 0.025,
    normalStrength: 0.27,
    specularIntensity: 0.52,
  },
  plaster: {
    tint: [0.98, 0.965, 0.91],
    saturation: 0.9,
    variation: 0.035,
    coarseMetres: 15,
    fineMetres: 4.8,
    roughnessVariation: 0.012,
    normalStrength: 0.18,
    specularIntensity: 0.43,
  },
  grass: {
    tint: [0.94, 0.9, 0.76],
    saturation: 0.81,
    variation: 0.2,
    coarseMetres: 16,
    fineMetres: 3.7,
    roughnessVariation: 0.015,
    normalStrength: 0.4,
    specularIntensity: 0.27,
  },
  paving: {
    tint: [0.96, 0.95, 0.9],
    saturation: 0.88,
    variation: 0.065,
    coarseMetres: 14,
    fineMetres: 3.8,
    roughnessVariation: 0.025,
    normalStrength: 0.43,
    specularIntensity: 0.53,
  },
  sett: {
    tint: [0.94, 0.95, 0.93],
    saturation: 0.85,
    variation: 0.07,
    coarseMetres: 13,
    fineMetres: 3.4,
    roughnessVariation: 0.03,
    normalStrength: 0.48,
    specularIntensity: 0.58,
  },
  gravel: {
    tint: [0.95, 0.93, 0.86],
    saturation: 0.85,
    variation: 0.095,
    coarseMetres: 11,
    fineMetres: 3.5,
    roughnessVariation: 0.025,
    normalStrength: 0.35,
    specularIntensity: 0.35,
  },
};

export function campusSurfaceArt(kind: string): CampusSurfaceArt | undefined {
  return ART[kind];
}

/** Shared low/medium/high grade. It is applied by Standard/PBR image processing
 * once, not as an additional fullscreen pass or a LUT texture. Custom sky and
 * leaf shaders keep their authored sky palette and are not gamma-processed twice. */
export function configureCampusGrade(config: ImageProcessingConfiguration) {
  const curves = new ColorCurves();
  curves.globalSaturation = -6;
  curves.highlightsHue = 38;
  curves.highlightsDensity = 8;
  curves.highlightsSaturation = -3;
  curves.shadowsHue = 216;
  curves.shadowsDensity = 7;
  curves.shadowsSaturation = -4;
  config.colorCurves = curves;
  config.colorCurvesEnabled = true;
  config.contrast = 1.09;
}

export function campusExposure(daylight: number) {
  const day = Math.max(
    0,
    Math.min(1, Number.isFinite(daylight) ? daylight : 0),
  );
  // Keep practical room lights warm and readable without a magical night sun.
  return 1.08 + (1 - day) * 0.1;
}

const DEFINITIONS = `
float campusArtVariation = 0.5;
float campusArtHash(vec2 p) {
  vec3 q = fract(vec3(p.x,p.y,p.x+p.y)*vec3(0.1031,0.11369,0.13787));
  q += dot(q,q.yzx+19.19);
  return fract((q.x+q.y)*q.z);
}
float campusArtNoise(vec2 p) {
  vec2 cell=floor(p), f=fract(p);
  f=f*f*(3.0-2.0*f);
  return mix(mix(campusArtHash(cell),campusArtHash(cell+vec2(1.0,0.0)),f.x),
    mix(campusArtHash(cell+vec2(0.0,1.0)),campusArtHash(cell+vec2(1.0,1.0)),f.x),f.y);
}
`;

/** No new texture samples, lights, meshes, displacement, animation or draw calls.
 * World coordinates keep joins stable across independently modelled objects.
 * Macro changes are visibly artistic, not an invented georeferenced patch map. */
export class CampusSurfaceArtPlugin extends MaterialPluginBase {
  constructor(
    material: PBRMaterial,
    readonly art: CampusSurfaceArt,
  ) {
    super(material, "CampusSurfaceArt", 190, {}, true, true);
    this.doNotSerialize = true;
    material.metadata = {
      ...material.metadata,
      campusArtDirection: true,
      macroVariationProvenance:
        "bounded artistic surface variation; not surveyed stains or repairs",
      originalTextureChannelsUnmodified: true,
      addedArtDrawCalls: 0,
    };
  }

  override isCompatible(language: ShaderLanguage) {
    return language === ShaderLanguage.GLSL;
  }

  override getUniforms() {
    return {
      ubo: [
        { name: "campusArtSettings", size: 4, type: "vec4" },
        { name: "campusArtRoughness", size: 1, type: "float" },
      ],
      fragment:
        "uniform vec4 campusArtSettings;\nuniform float campusArtRoughness;",
    };
  }

  override bindForSubMesh(buffer: UniformBuffer) {
    buffer.updateFloat4(
      "campusArtSettings",
      this.art.saturation,
      this.art.variation,
      this.art.coarseMetres,
      this.art.fineMetres,
    );
    buffer.updateFloat("campusArtRoughness", this.art.roughnessVariation);
  }

  override getCustomCode(type: string, language = ShaderLanguage.GLSL) {
    if (type !== "fragment" || language !== ShaderLanguage.GLSL) return null;
    return {
      CUSTOM_FRAGMENT_DEFINITIONS: DEFINITIONS,
      CUSTOM_FRAGMENT_BEFORE_LIGHTS: `
        // A small Y contribution avoids horizontal stripes on vertical walls.
        vec2 campusArtPosition=vPositionW.xz+vPositionW.y*vec2(0.37,0.23);
        campusArtVariation=0.72*campusArtNoise(campusArtPosition/campusArtSettings.z)
          +0.28*campusArtNoise(campusArtPosition/campusArtSettings.w+vec2(37.2,19.6));
        float campusArtLuma=dot(surfaceAlbedo,vec3(0.2126,0.7152,0.0722));
        surfaceAlbedo=mix(vec3(campusArtLuma),surfaceAlbedo,campusArtSettings.x);
        surfaceAlbedo*=1.0+(campusArtVariation-0.5)*campusArtSettings.y;
      `,
      CUSTOM_FRAGMENT_UPDATE_METALLICROUGHNESS: `
        metallicRoughness.g=clamp(metallicRoughness.g+
          (campusArtVariation-0.5)*campusArtRoughness,0.045,1.0);
      `,
    };
  }
}
