/** Read the actual serialized glTF material, not only the source recipe. */
import {readFileSync,writeFileSync} from "node:fs";
import {createHash} from "node:crypto";
import assert from "node:assert/strict";
import {Color3} from "@babylonjs/core/Maths/math.color";
import {B6_EXTERIOR_CONCRETE_MATERIAL as style} from "../shared/b6-stair-materials";
const file="public/models/buildings/osm-way-53929071.glb",bytes=readFileSync(file);
const gltf=JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)).toString("utf8"));
const matches=gltf.materials.filter((m:{name:string})=>m.name===style.name);
assert.equal(matches.length,1);
const material=matches[0],pbr=material.pbrMetallicRoughness;
const expected=[...Color3.FromHexString(style.colorSRGB).toLinearSpace().asArray(),1];
for(let i=0;i<4;i++)assert.ok(Math.abs(pbr.baseColorFactor[i]-expected[i])<1e-7,"serialized GLB lost its linear tint");
assert.equal(pbr.metallicFactor,0);assert.equal(pbr.roughnessFactor,1);
assert.equal(material.doubleSided,false);assert.equal(material.alphaMode??"OPAQUE","OPAQUE");
assert.ok(Math.abs(material.normalTexture.scale-style.normalStrength)<1e-7);
const textureAudits=[];
for(const[channel,info]of [["color",pbr.baseColorTexture],["normalgl",material.normalTexture],["roughness",pbr.metallicRoughnessTexture]]as const){
  assert.ok(info);
  const transform=info.extensions.KHR_texture_transform;
  assert.ok(Math.abs(transform.scale[0]-1.28/1.1)<1e-6&&Math.abs(transform.scale[1]-1.28/.55)<1e-6);
  // glTF's vertical UV orientation is flipped from Blender, so its generated
  // offset is 1-vScale. This retains the same metre-sized original repeat.
  assert.ok(Math.abs(transform.offset[1]-(1-transform.scale[1]))<1e-6);
  const image=gltf.images[gltf.textures[info.index].source],path="public/models/buildings/"+image.uri;
  const sha=createHash("sha256").update(readFileSync(path)).digest("hex");
  if(channel!=="roughness")assert.equal(sha,style.family.channels[channel].sha256,"original CC0 channel bytes changed");
  textureAudits.push({channel,image:path,sha256:sha,uvScale:transform.scale,gltfVerticalUVOffset:transform.offset[1],originalBytesPreserved:channel!=="roughness",note:channel==="roughness"?"Blender packs source grayscale into glTF green channel; original JPEG remains immutable":"original CC0 bytes"});
}
const audit={status:"passed",file,glbSha256:createHash("sha256").update(bytes).digest("hex"),source:style.source,license:style.license,classification:style.classification,measured:false,tintSRGB:style.colorSRGB,tintLinear:expected,repeatMetres:[style.metresPerRepeat,style.metresPerRepeatV],roughnessFactor:pbr.roughnessFactor,metallicFactor:pbr.metallicFactor,normalStrength:material.normalTexture.scale,opaque:true,backfaceCulling:true,textures:textureAudits,geometryMutated:false};
writeFileSync("docs/reality-pack/separate-assets/b6-exterior-concrete-audit.json",JSON.stringify(audit,null,2)+"\n");
console.log(JSON.stringify(audit));
