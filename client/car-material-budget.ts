import type { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";

/** The glTF loader enables CLEARCOAT even when its optional factor defaults to
 * zero. At exactly zero, Babylon's coat radiance/direct terms are multiplied by
 * zero, F0 remapping is mixed with weight zero and base conservation is one.
 * Remove only that dormant shader branch; retain every nonzero coat and texture.
 */
export function disableZeroWeightCarClearCoat(material: PBRMaterial) {
  const coat = material.clearCoat;
  if (
    !coat.isEnabled ||
    coat.intensity !== 0 ||
    coat.texture ||
    coat.textureRoughness ||
    coat.bumpTexture ||
    coat.tintTexture
  )
    return false;
  coat.isEnabled = false;
  material.metadata = {
    ...material.metadata,
    zeroWeightClearCoatDisabled: true,
  };
  return true;
}
