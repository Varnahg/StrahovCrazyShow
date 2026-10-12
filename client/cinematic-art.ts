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
  /** Linear-space mean of the unchanged source albedo, sampled on an 8px grid.
   * Detail contrast is an art choice; this mean is not a measured campus colour. */
  sourceMean: readonly [number, number, number];
  nearDetail: number;
  farDetail: number;
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
    normalStrength: 0.26,
    specularIntensity: 0.67,
    sourceMean: [0.092028, 0.082484, 0.06154],
    nearDetail: 0.9,
    farDetail: 0.64,
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
    sourceMean: [0.490326, 0.490326, 0.490326],
    nearDetail: 0.94,
    farDetail: 0.82,
  },
  plaster: {
    tint: [0.98, 0.965, 0.91],
    saturation: 0.9,
    // The generic source already contains broad colour mottling. Keep it quiet
    // while allowing its existing fine relief to respond to the campus light.
    variation: 0,
    coarseMetres: 15,
    fineMetres: 4.8,
    roughnessVariation: 0,
    normalStrength: 0.32,
    specularIntensity: 0.43,
    sourceMean: [0.687218, 0.661026, 0.638101],
    nearDetail: 0.68,
    farDetail: 0.52,
  },
  grass: {
    tint: [0.94, 0.9, 0.76],
    saturation: 0.81,
    variation: 0.2,
    coarseMetres: 16,
    fineMetres: 3.7,
    roughnessVariation: 0.015,
    normalStrength: 0.28,
    specularIntensity: 0.27,
    sourceMean: [0.057231, 0.10811, 0.018593],
    nearDetail: 0.8,
    farDetail: 0.55,
  },
  paving: {
    tint: [0.96, 0.95, 0.9],
    saturation: 0.88,
    variation: 0.065,
    coarseMetres: 14,
    fineMetres: 3.8,
    roughnessVariation: 0.025,
    normalStrength: 0.35,
    specularIntensity: 0.53,
    sourceMean: [0.216666, 0.219948, 0.200163],
    nearDetail: 0.88,
    farDetail: 0.76,
  },
  sett: {
    tint: [0.94, 0.95, 0.93],
    saturation: 0.85,
    variation: 0.07,
    coarseMetres: 13,
    fineMetres: 3.4,
    roughnessVariation: 0.03,
    normalStrength: 0.4,
    specularIntensity: 0.58,
    sourceMean: [0.299795, 0.31009, 0.247003],
    nearDetail: 0.88,
    farDetail: 0.76,
  },
  gravel: {
    tint: [0.95, 0.93, 0.86],
    saturation: 0.85,
    variation: 0.095,
    coarseMetres: 11,
    fineMetres: 3.5,
    roughnessVariation: 0.025,
    normalStrength: 0.29,
    specularIntensity: 0.35,
    sourceMean: [0.262178, 0.240306, 0.19394],
    nearDetail: 0.82,
    farDetail: 0.64,
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

const DETAIL_CODE = `
  vec3 campusEyeOffset=vEyePosition.xyz-vPositionW;
  float campusDetailFade=smoothstep(campusArtSettings.w*campusArtSettings.w,
    16.0*campusArtSettings.z*campusArtSettings.z,dot(campusEyeOffset,campusEyeOffset));
  float campusDetail=mix(campusArtDetail.w,campusArtResponse.x,campusDetailFade);
  // Retain the material factor, including rain darkening. Authored joints use
  // detail=1 and are never pulled to a different source map's mean.
  surfaceAlbedo=mix(campusArtDetail.rgb*vAlbedoColor.rgb,surfaceAlbedo,campusDetail);
  float campusArtLuma=dot(surfaceAlbedo,vec3(0.2126,0.7152,0.0722));
  surfaceAlbedo=mix(vec3(campusArtLuma),surfaceAlbedo,campusArtSettings.x);
`;

// Immutable shader recipes are shared by material instances. Surfaces without
// artistic variation do not execute unused noise/hash or roughness arithmetic.
const DETAIL_ONLY_CODE = Object.freeze({
  CUSTOM_FRAGMENT_BEFORE_LIGHTS: DETAIL_CODE,
});
const VARIED_SURFACE_CODE = Object.freeze({
  CUSTOM_FRAGMENT_DEFINITIONS: DEFINITIONS,
  CUSTOM_FRAGMENT_BEFORE_LIGHTS: `
    // A small Y contribution avoids horizontal stripes on vertical walls.
    vec2 campusArtPosition=vPositionW.xz+vPositionW.y*vec2(0.37,0.23);
    // One noise octave (four hashes); mipmaps still select texture detail.
    campusArtVariation=campusArtNoise(campusArtPosition/campusArtSettings.z);
    ${DETAIL_CODE}
    surfaceAlbedo*=1.0+(campusArtVariation-0.5)*campusArtSettings.y;
  `,
  CUSTOM_FRAGMENT_UPDATE_METALLICROUGHNESS: `
    metallicRoughness.g=clamp(metallicRoughness.g+
      (campusArtVariation-0.5)*campusArtResponse.y,0.045,1.0);
  `,
});

/** No new texture samples, lights, meshes, displacement, animation or draw calls.
 * World coordinates keep joins stable across independently modelled objects.
 * Macro changes are visibly artistic, not an invented georeferenced patch map. */
export class CampusSurfaceArtPlugin extends MaterialPluginBase {
  constructor(
    material: PBRMaterial,
    readonly art: CampusSurfaceArt,
    private preserveAuthoredDetail = false,
  ) {
    super(material, "CampusSurfaceArt", 190, {}, true, true);
    this.doNotSerialize = true;
    material.metadata = {
      ...material.metadata,
      campusArtDirection: true,
      macroVariationProvenance:
        art.variation || art.roughnessVariation
          ? "bounded artistic surface variation; not surveyed stains or repairs"
          : "no added macro albedo or roughness variation; unchanged source maps",
      originalTextureChannelsUnmodified: true,
      addedArtDrawCalls: 0,
      surfaceDetailProvenance:
        "source-albedo linear mean sampled 2026-10-11; artistic detail compression, not campus colour measurement",
      surfaceDetailPreserved: preserveAuthoredDetail,
      surfaceNormalStrength: art.normalStrength,
    };
  }

  override isCompatible(language: ShaderLanguage) {
    return language === ShaderLanguage.GLSL;
  }

  override getUniforms() {
    return {
      ubo: [
        { name: "campusArtSettings", size: 4, type: "vec4" },
        { name: "campusArtDetail", size: 4, type: "vec4" },
        { name: "campusArtResponse", size: 2, type: "vec2" },
      ],
      fragment:
        "uniform vec4 campusArtSettings;\nuniform vec4 campusArtDetail;\nuniform vec2 campusArtResponse;",
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
    buffer.updateFloat4(
      "campusArtDetail",
      this.art.sourceMean[0],
      this.art.sourceMean[1],
      this.art.sourceMean[2],
      this.preserveAuthoredDetail ? 1 : this.art.nearDetail,
    );
    buffer.updateFloat2(
      "campusArtResponse",
      this.preserveAuthoredDetail ? 1 : this.art.farDetail,
      this.art.roughnessVariation,
    );
  }

  override getCustomCode(type: string, language = ShaderLanguage.GLSL) {
    if (type !== "fragment" || language !== ShaderLanguage.GLSL) return null;
    // Babylon discovers injection points from the base constructor before the
    // derived art field is initialized. Register the complete hook set then;
    // actual shader injection uses the fully initialized material recipe.
    return this.art?.variation === 0 && this.art.roughnessVariation === 0
      ? DETAIL_ONLY_CODE
      : VARIED_SURFACE_CODE;
  }
}
