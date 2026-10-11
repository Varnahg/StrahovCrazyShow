import {PBRMaterial} from "@babylonjs/core/Materials/PBR/pbrMaterial";
import {Texture} from "@babylonjs/core/Materials/Textures/texture";
import {Color3} from "@babylonjs/core/Maths/math.color";
import type {Scene} from "@babylonjs/core/scene";
import {B6_EXTERIOR_CONCRETE_MATERIAL as style} from "../shared/b6-stair-materials";

/** Shared runtime/archive material; no texture baking or overlay geometry. */
export function createB6ExteriorConcreteMaterial(scene:Scene,loadTextures=true){
  const material=new PBRMaterial(style.name,scene);
  material.albedoColor=Color3.FromHexString(style.colorSRGB).toLinearSpace();
  material.roughness=style.roughness;
  material.metallic=style.metallic;
  material.specularIntensity=style.specularIntensity;
  material.environmentIntensity=style.environmentIntensity;
  material.alpha=1;
  material.transparencyMode=PBRMaterial.PBRMATERIAL_OPAQUE;
  material.backFaceCulling=true;
  material.enableSpecularAntiAliasing=true;
  material.metadata={
    surfaceKind:"concrete",uvMetresPerRepeat:style.sourceUVMetresPerRepeat,
    preserveSurfaceTint:true,surfaceNormalStrength:style.normalStrength,
    sourceRecipe:style,sourceColorSpace:"sRGB converted to linear albedo factor",
    physicallyBased:true,dimensionsMeasured:false,
  };
  const texture=(url:string,gamma:boolean)=>{
    const result=new Texture(url,scene,false,false,Texture.TRILINEAR_SAMPLINGMODE);
    result.gammaSpace=gamma;
    result.uScale=style.sourceUVMetresPerRepeat/style.metresPerRepeat;
    result.vScale=style.sourceUVMetresPerRepeat/style.metresPerRepeatV;
    result.wrapU=result.wrapV=Texture.WRAP_ADDRESSMODE;
    result.anisotropicFilteringLevel=4;
    return result;
  };
  if(loadTextures){
    material.albedoTexture=texture(style.family.channels.color.url,true);
    material.bumpTexture=texture(style.family.channels.normalgl.url,false);
    material.bumpTexture.level=style.normalStrength;
    material.metallicTexture=texture(style.family.channels.roughness.url,false);
  }
  // These are original grayscale roughness bytes, not packed ORM channels.
  material.useRoughnessFromMetallicTextureAlpha=false;
  material.useRoughnessFromMetallicTextureGreen=true;
  material.useMetallnessFromMetallicTextureBlue=false;
  material.useAmbientOcclusionFromMetallicTextureRed=false;
  return material;
}
