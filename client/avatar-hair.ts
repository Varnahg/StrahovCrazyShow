import { BoundingInfo } from "@babylonjs/core/Culling/boundingInfo";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { MaterialPluginBase } from "@babylonjs/core/Materials/materialPluginBase";
import { ShaderLanguage } from "@babylonjs/core/Materials/shaderLanguage";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import type { Scene } from "@babylonjs/core/scene";
import type { AvatarConfig } from "../shared/types";
import type { AvatarMeshFactory, AvatarRig } from "./avatar-renderer";
import { avatarFaceWidth } from "./avatar-eyes";
import hair from "./data/student-hair.json";
import calibration from "./data/student-hair-calibration.json";

export type StudentHairStyle = "short02" | "short04";
export type StudentHairSurface = `strands-${StudentHairStyle}`;
export type StudentHairForm =
  `strands-${StudentHairStyle}-${"plain" | "glasses"}-${"near" | "medium"}`;
export type StudentHairTextures = { albedo: Texture; normal?: Texture };
type HairLevel = "near" | "medium";
const bounds = new Map<string, { minimum: Vector3; maximum: Vector3 }>();

/** Two individually fitted short cuts; other preset identities stay distinct. */
export function studentHairStyle(preset: number): StudentHairStyle | undefined {
  return preset === 0 ? "short02" : preset === 3 ? "short04" : undefined;
}

export function isStudentHairForm(shape: string): shape is StudentHairForm {
  return shape.startsWith("strands-");
}

export function studentHairGeometry(shape: StudentHairForm) {
  const [, style, fit, level] = shape.split("-") as [
    string,
    StudentHairStyle,
    "plain" | "glasses",
    HairLevel,
  ];
  return hair.styles[style][fit][level];
}

function boundsFor(style: StudentHairStyle, glasses: boolean) {
  const fit = glasses ? "glasses" : "plain",
    key = `${style}:${fit}`;
  let value = bounds.get(key);
  if (value) return value;
  const minimum = new Vector3(Infinity, Infinity, Infinity),
    maximum = new Vector3(-Infinity, -Infinity, -Infinity);
  for (const level of ["near", "medium"] as const) {
    const positions = hair.styles[style][fit][level].positions;
    for (let i = 0; i < positions.length; i += 3) {
      minimum.x = Math.min(minimum.x, positions[i]);
      maximum.x = Math.max(maximum.x, positions[i]);
      minimum.y = Math.min(minimum.y, positions[i + 1]);
      maximum.y = Math.max(maximum.y, positions[i + 1]);
      minimum.z = Math.min(minimum.z, positions[i + 2]);
      maximum.z = Math.max(maximum.z, positions[i + 2]);
    }
  }
  value = { minimum, maximum };
  bounds.set(key, value);
  return value;
}

/** Creates the final hair directly; no hidden old cap is made in the rig path.
 * All buffers and colour materials use the existing AvatarPrimitivePool. */
export function createStudentHair(
  rig: AvatarRig,
  config: AvatarConfig,
  factory: AvatarMeshFactory,
) {
  const style = studentHairStyle(config.preset);
  if (!style || !factory.form) return;
  const fit = config.glasses ? "glasses" : "plain",
    bound = boundsFor(style, config.glasses);
  for (const level of ["near", "medium"] as const) {
    // Short04 has identical reviewed near/medium arrays. Share its source too.
    const geometryLevel = style === "short04" ? "near" : level;
    const mesh = factory.form(
      `strands-${style}-${fit}-${geometryLevel}`,
      `${rig.root.name} ${style} ${level} hair`,
      config.hair,
      `strands-${style}`,
    );
    mesh.parent = rig.head;
    mesh.scaling.set(avatarFaceWidth(config), 0.235, 0.195);
    mesh.setBoundingInfo(
      new BoundingInfo(bound.minimum.clone(), bound.maximum.clone()),
    );
    mesh.metadata = {
      avatarBodyLod: level,
      avatarDetail: "silhouette",
      avatarHair: true,
      characterSurface: `strands-${style}`,
      hairStyle: style,
      hairFit: fit,
      source: "MakeHuman system hair; derived CG ear and glasses clearances",
      sourceLicense: "CC0-1.0",
    };
    mesh.setEnabled(level === "near");
  }
  rig.bodyHeight =
    (rig.measurements.hipHeight +
      rig.torso.position.y +
      rig.head.position.y +
      bound.maximum.y * 0.235) *
    rig.root.scaling.y;
}

const HAIR_TINT_GLSL = Object.freeze({
  CUSTOM_FRAGMENT_UPDATE_ALBEDO: `
        #ifdef ALBEDO
        vec3 studentHairSource = albedoTexture.rgb;
        #ifdef GAMMAALBEDO
        studentHairSource = toLinearSpace(studentHairSource);
        #endif
        float studentHairShade = clamp(dot(studentHairSource, vec3(0.2126, 0.7152, 0.0722)) * albedoInfos.y, 0.45, 1.55);
        surfaceAlbedo = min(vec3(1.0), vAlbedoColor.rgb * studentHairShade);
        #endif
      `,
});

// UPDATE_ALBEDO is inside albedoOpacityBlock, not main. Its source sample and
// colour/level parameters are local; no new texture sample or uniform is needed.
const HAIR_TINT_WGSL = Object.freeze({
  CUSTOM_FRAGMENT_UPDATE_ALBEDO: `
        #ifdef ALBEDO
        var studentHairSource = albedoTexture.rgb;
        #ifdef GAMMAALBEDO
        studentHairSource = toLinearSpaceVec3(studentHairSource);
        #endif
        let studentHairShade = clamp(dot(studentHairSource, vec3f(0.2126, 0.7152, 0.0722)) * albedoInfos.y, 0.45, 1.55);
        surfaceAlbedo = min(vec3f(1.0), vAlbedoColor.rgb * studentHairShade);
        #endif
      `,
});

/** Single atlas sample, original alpha, no texture rewrite or per-frame state.
 * Neutralise only the source's baked hue before applying the chosen hair colour.
 * Relative light/dark strand contrast is an explicit artistic interpretation. */
export class StudentHairTintPlugin extends MaterialPluginBase {
  constructor(material: PBRMaterial) {
    super(material, "StrahovStudentHairTint", 230, {}, true, true);
    this.doNotSerialize = true;
  }
  override isCompatible(language: ShaderLanguage) {
    return language === ShaderLanguage.GLSL || language === ShaderLanguage.WGSL;
  }
  override getCustomCode(
    type: string,
    language = ShaderLanguage.GLSL,
  ): Record<string, string> | null {
    if (type !== "fragment" || !this.isCompatible(language)) return null;
    return language === ShaderLanguage.WGSL ? HAIR_TINT_WGSL : HAIR_TINT_GLSL;
  }
}

export function createStudentHairTextures(
  scene: Scene,
  style: StudentHairStyle,
): StudentHairTextures {
  const albedo = new Texture(
    `/models/characters/student-hair/${style}/diffuse.png`,
    scene,
    false,
    true,
    Texture.TRILINEAR_SAMPLINGMODE,
  );
  albedo.gammaSpace = true;
  albedo.hasAlpha = true;
  // Reuse the existing texture-level uniform: both hairstyles share identical
  // shader code/effect keys, while their measured source brightness can differ.
  albedo.level = calibration.styles[style].luminanceScale;
  const normal =
    style === "short02"
      ? new Texture(
          `/models/characters/student-hair/${style}/normal.png`,
          scene,
          false,
          true,
          Texture.TRILINEAR_SAMPLINGMODE,
        )
      : undefined;
  if (normal) {
    normal.gammaSpace = false;
    normal.level = 0.4;
  }
  return { albedo, normal };
}

export function configureStudentHairMaterial(
  material: PBRMaterial,
  style: StudentHairStyle,
  textures: StudentHairTextures,
) {
  material.albedoTexture = textures.albedo;
  material.bumpTexture = textures.normal ?? null;
  material.useAlphaFromAlbedoTexture = true;
  material.transparencyMode = PBRMaterial.PBRMATERIAL_ALPHATEST;
  material.alphaCutOff = 0.42;
  material.forceDepthWrite = true;
  material.backFaceCulling = false;
  material.twoSidedLighting = true;
  material.metallic = 0;
  material.roughness = 0.76;
  material.environmentIntensity = 0.65;
  material.metadata = {
    ...material.metadata,
    hairStyle: style,
    sourceLicense: "CC0-1.0",
    originalAtlasAlpha: true,
    hairTint: "source-relative-luminance",
  };
  new StudentHairTintPlugin(material);
}
