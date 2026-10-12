import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import type { Scene } from "@babylonjs/core/scene";
import { B4_FACADE_PLAN } from "../shared/b4-facade-plan";

/** Neutral panel cladding, with no claim about its material composition.
 * Exact sRGB decoding and roughness match the existing Blender panel master.
 * The scene supplies its weather-dependent sky; there is no emissive fill,
 * texture override, observer or per-frame material work. */
export function createB4PanelMaterial(scene: Scene) {
  const source = B4_FACADE_PLAN.material;
  const material = new PBRMaterial("reality B4 grey facade panels", scene);
  material.albedoColor = Color3.FromHexString(
    source.neutralShadeHex,
  ).toLinearSpace(true);
  material.metallic = 0;
  material.roughness = 0.84;
  material.environmentIntensity = 0.7;
  material.alpha = 1;
  material.transparencyMode = PBRMaterial.PBRMATERIAL_OPAQUE;
  material.backFaceCulling = true;
  material.metadata = {
    physicallyBased: true,
    sourcePlan: "shared/data/b4-facade-plan.json",
    sourceColorSRGB: source.neutralShadeHex,
    sourceColorSpace: "sRGB decoded once with the exact transfer function",
    sourceMaterialDescription: source.description,
    sourceShadeStatus: source.shadeStatus,
    materialComposition: "unknown",
  };
  return material;
}
