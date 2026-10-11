import {PBRMaterial} from "@babylonjs/core/Materials/PBR/pbrMaterial";
import {Color3} from "@babylonjs/core/Maths/math.color";
import type {Texture} from "@babylonjs/core/Materials/Textures/texture";

export type SourceGrassMaps={albedo:Texture;alpha:Texture;normal:Texture;arm:Texture};
export type SourceGrassRecipe={translucency:number;normalStrength:number;babylonSpecularIntensity:number;babylonMetallicF0Factor:number};
/** A single source-material transfer shared by canonical preview meshes and
 * loader reference. Maps are owned/shared by the caller, never duplicated. */
export function configureSourceGrassMaterial(material:PBRMaterial,maps:SourceGrassMaps,recipe:SourceGrassRecipe|null,mode:string){
 const author=mode==="author-material"&&!!recipe,translucent=author||mode==="author-translucency";
 maps.alpha.getAlphaFromRGB=true;maps.alpha.gammaSpace=false;maps.normal.gammaSpace=false;maps.arm.gammaSpace=false;if(recipe)maps.normal.level=recipe.normalStrength;
 material.albedoTexture=maps.albedo;material.opacityTexture=maps.alpha;material.bumpTexture=mode==="no-normal"?null:maps.normal;material.metallicTexture=mode==="no-arm"?null:maps.arm;
 material.albedoColor=Color3.White();material.emissiveColor.setAll(0);material.useAlphaFromAlbedoTexture=false;
 material.transparencyMode=PBRMaterial.PBRMATERIAL_ALPHATEST;material.alphaCutOff=.45;material.backFaceCulling=false;material.twoSidedLighting=true;
 material.invertNormalMapX=false;material.invertNormalMapY=true;
 material.useRoughnessFromMetallicTextureAlpha=false;material.useRoughnessFromMetallicTextureGreen=true;material.useMetallnessFromMetallicTextureBlue=true;
 material.useAmbientOcclusionFromMetallicTextureRed=mode!=="no-arm"&&!author;
 material.metallic=0;material.roughness=1;material.specularIntensity=author?recipe.babylonSpecularIntensity:.4;material.metallicF0Factor=author?recipe.babylonMetallicF0Factor:1;material.forceIrradianceInFragment=author;
 material.unlit=mode==="unlit";
 material.subSurface.isTranslucencyEnabled=translucent;material.subSurface.translucencyIntensity=recipe?.translucency??.3;
 // Babylon's useAlbedoToTintTranslucency affects IBL only. Its direct
 // diffuseTransmissionBase otherwise remains white: supply the same original
 // photographic map to the transmittance BRDF and avoid tinting IBL twice.
 material.subSurface.translucencyColorTexture=translucent?maps.albedo:null;
 material.subSurface.translucencyColor=Color3.White();material.subSurface.tintColor=Color3.White();material.subSurface.useAlbedoToTintTranslucency=false;
 material.subSurface.minimumThickness=0;material.subSurface.maximumThickness=.001;
}
