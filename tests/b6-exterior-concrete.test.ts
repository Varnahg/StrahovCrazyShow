import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {createHash} from "node:crypto";
import {NullEngine} from "@babylonjs/core/Engines/nullEngine";
import {Scene} from "@babylonjs/core/scene";
import {Color3} from "@babylonjs/core/Maths/math.color";
import {PBRMaterial} from "@babylonjs/core/Materials/PBR/pbrMaterial";
import {Texture} from "@babylonjs/core/Materials/Textures/texture";
import {B6RealityController} from "../client/b6-reality";
import {createB6ExteriorConcreteMaterial} from "../client/b6-exterior-concrete";
import {B6_EXTERIOR_CONCRETE_MATERIAL as style} from "../shared/b6-stair-materials";

test("exterior tread material uses original CC0 channels, linear tint and metre-correct UVs in the actual controller",()=>{
  const engine=new NullEngine(),scene=new Scene(engine),controller=new B6RealityController(scene);
  try{
    const meshes=scene.meshes.filter(m=>m.material?.name===style.name);
    assert.equal(meshes.length,1);
    const material=meshes[0].material as PBRMaterial;
    assert.ok(material.albedoColor.equalsWithEpsilon(Color3.FromHexString(style.colorSRGB).toLinearSpace(),1e-9));
    assert.ok(material.albedoColor.r<.5,"sRGB tint must not be interpreted as a much brighter linear factor");
    assert.equal(material.alpha,1);assert.equal(material.transparencyMode,PBRMaterial.PBRMATERIAL_OPAQUE);
    assert.equal(material.backFaceCulling,true);assert.equal(material.metallic,0);
    assert.equal(material.useMetallnessFromMetallicTextureBlue,false);
    assert.equal(material.useRoughnessFromMetallicTextureGreen,true);
    assert.equal(material.useRoughnessFromMetallicTextureAlpha,false);
    assert.equal(material.useAmbientOcclusionFromMetallicTextureRed,false);
    for(const[channel,texture]of [["color",material.albedoTexture],["normalgl",material.bumpTexture],["roughness",material.metallicTexture]]as const){
      assert.ok(texture instanceof Texture);assert.equal(texture.gammaSpace,channel==="color");
      assert.equal(texture.uScale,1.28/1.1);assert.equal(texture.vScale,1.28/.55);
      const original=style.family.channels[channel];
      assert.equal(createHash("sha256").update(readFileSync("public"+original.url)).digest("hex"),original.sha256);
    }
    assert.equal(material.bumpTexture!.level,.27);assert.equal(style.measured,false);
    assert.equal(meshes[0].getTotalIndices()/3,156,"material replaces the thirteen actual source boxes without overlays");
    const archive=createB6ExteriorConcreteMaterial(scene,false);
    assert.deepEqual(archive.albedoColor.asArray(),material.albedoColor.asArray());
    assert.deepEqual(archive.metadata,material.metadata);
    assert.equal(archive.albedoTexture,null,"archive factory links original channels from metadata, without NullEngine image decoding");
    archive.dispose();
    assert.equal(controller.interiorLightEnabled,false);
    controller.update({player:{x:8,y:2.62,z:-55},quality:"medium"});
    assert.equal(controller.interiorLightEnabled,true);
    const fill=scene.lights.find(light=>light.metadata?.inferredCorridorFill)!;
    fill.intensity=0;assert.equal(controller.interiorLightEnabled,false,"zero intensity cannot reserve a real shared light slot");
    controller.update({player:{x:8,y:2.62,z:-54},quality:"medium"});
    assert.equal(controller.interiorLightEnabled,true);
    controller.update({player:{x:-4.85,y:.82,z:-110},quality:"medium"});
    assert.equal(controller.interiorLightEnabled,false);
  }finally{controller.dispose();scene.dispose();engine.dispose();}
});
