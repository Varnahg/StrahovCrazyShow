import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import type { Scene } from "@babylonjs/core/scene";
import { configureSourceGrassMaterial, type SourceGrassMaps } from "./photo-grass-source-material";
import { PhotoGrassWind, type PhotoGrassWindState } from "./photo-grass-wind";

/** Original photographed atlas, lit alpha-test. Material transfer and bending
 * are explicit art parameters; no new shadow caster or emissive flower. */
export function createGroundFlowerMaterial(scene: Scene, maps: SourceGrassMaps, wind: PhotoGrassWindState, height: number) {
  const material = new PBRMaterial("sparse photographic yellow flowers", scene);
  configureSourceGrassMaterial(material, maps, {
    translucency: 0.18, normalStrength: 1, babylonSpecularIntensity: 0.35, babylonMetallicF0Factor: 1,
  }, "author-material");
  material.metadata = { vegetation: "flowers", photographicSource: "https://polyhaven.com/a/dandelion_01",
    sourcePixelsModified: false, measuredSpecies: false };
  new PhotoGrassWind(material, wind, { height, strength: 0.00065 });
  return material;
}
