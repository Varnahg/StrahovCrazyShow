import {readFileSync} from 'node:fs';
const source=JSON.parse(readFileSync('assets/blender/buildings/source-plan.json','utf8'));
const model=source.models.find(m=>m.identity.sourceId==='7645350');
const part=model.parts.find(p=>p.name==='reality 7645350 near reality entrance galvanized frame');
const bytes=readFileSync('public/models/buildings/osm-way-7645350.glb');
const length=bytes.readUInt32LE(12), gltf=JSON.parse(bytes.subarray(20,20+length)),bin=bytes.subarray(28+length);
const node=gltf.nodes.find(n=>n.extras?.sourcePartName===part.name),primitive=gltf.meshes[node.mesh].primitives[0];
function attribute(id,i){const a=gltf.accessors[id],v=gltf.bufferViews[a.bufferView],width={VEC2:2,VEC3:3,VEC4:4}[a.type],size={5121:1,5123:2,5126:4}[a.componentType],offset=(v.byteOffset??0)+(a.byteOffset??0)+i*(v.byteStride??width*size);return Array.from({length:width},(_,j)=>{const at=offset+j*size,n=a.componentType===5126?bin.readFloatLE(at):a.componentType===5123?bin.readUInt16LE(at):bin.readUInt8(at);return a.normalized?n/(a.componentType===5121?255:65535):n;});}
const i=55,p=attribute(primitive.attributes.POSITION,i),n=attribute(primitive.attributes.NORMAL,i),uv=attribute(primitive.attributes.TEXCOORD_0,i),color=attribute(primitive.attributes.COLOR_0,i),candidates=[];
let nearest=Infinity,nearestIndex=-1;
for(let j=0;j<part.positions.length;j+=3){const dist=Math.hypot(...p.map((v,k)=>v-part.positions[j+k]));if(dist<nearest){nearest=dist;nearestIndex=j/3;}if(dist<0.000002)candidates.push({index:j/3,dist,position:part.positions.slice(j,j+3),floatPosition:part.positions.slice(j,j+3).map(Math.fround),normal:part.normals.slice(j,j+3),uv:part.uvs.slice(j/3*2,j/3*2+2),color:part.colors.slice(j/3*4,j/3*4+4)});}
console.log(JSON.stringify({part:part.name,vertex:i,p,n,uv,color,nearest,nearestIndex,candidates},null,2));
