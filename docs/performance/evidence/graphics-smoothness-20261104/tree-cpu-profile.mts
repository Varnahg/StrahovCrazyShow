import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {NullEngine} from '@babylonjs/core/Engines/nullEngine';
import {Scene} from '@babylonjs/core/scene';
import {PBRMaterial} from '@babylonjs/core/Materials/PBR/pbrMaterial';
import {parseTreePilotManifest} from '../../../../shared/tree-asset-types';
import {decodeTreePrototype} from '../../../../client/tree-asset-loader';
import {createTreeSeasonGeometryPlan} from '../../../../client/tree-season-geometry';
import {TreeRenderer} from '../../../../client/tree-renderer';
const sha=(b:Uint8Array)=>createHash('sha256').update(b).digest('hex');
const descriptor=JSON.parse(await readFile('shared/data/assets/tree-catalog.json','utf8'));
const manifestBytes=await readFile('public'+descriptor.url);if(sha(manifestBytes)!==descriptor.sha256)throw Error('Manifest checksum');
const manifest=parseTreePilotManifest(JSON.parse(manifestBytes.toString('utf8')));
const output=process.argv[2];if(!output)throw Error('Expected unique output path');
const results=[];
for(const [id,lod] of [['ipr-crown-032',1],['ipr-crown-033',1],['ipr-crown-032',2]] as const){
 const entry=Object.entries(manifest.prototypes).find(([k,p])=>k===id||p.sourceTreeId===id);if(!entry)throw Error(id);
 const [prototypeId,prototype]=entry,asset=prototype.lods[lod],bytes=await readFile('public'+asset.url);
 if(sha(bytes)!==asset.sha256||bytes.length!==asset.bytes)throw Error('Asset checksum '+id);
 const buffer=bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.length) as ArrayBuffer;
 const samples=[];
 for(let pass=0;pass<8;pass++){
  (globalThis as any).gc?.();
  const engine=new NullEngine({renderWidth:1280,renderHeight:720,textureSize:1,deterministicLockstep:false,lockstepMaxSteps:4});
  const scene=new Scene(engine);scene.useRightHandedSystem=true;const renderer=new TreeRenderer(scene),r=renderer as any;
  for(const key of ['Bark012','LeafSet024','fir_tree_01'])r.materials.set(key,new PBRMaterial(key,scene));
  const group=r.createGroup(prototype.sourceTreeId);
  try{
   let at=performance.now();const parts=decodeTreePrototype(buffer,prototypeId,prototype,lod);const decodeMs=performance.now()-at;
   at=performance.now();const plans=parts.filter(p=>p.colors).map(p=>createTreeSeasonGeometryPlan(p.indices,p.colors!));const standaloneSeasonMs=performance.now()-at;
   at=performance.now();const meshes=r.createPilotMeshes(group,parts);const createMeshesIncludingSeasonMs=performance.now()-at;
   const value={pass,cold:pass===0,decodeMs,standaloneSeasonMs,createMeshesIncludingSeasonMs,postFetchCpuMs:decodeMs+createMeshesIncludingSeasonMs,vertices:parts.map(p=>p.positions.length/3),triangles:parts.map(p=>p.indices.length/3),planHashes:plans.map(p=>sha(new Uint8Array(p.indices.buffer,p.indices.byteOffset,p.indices.byteLength)))};
   samples.push(value);for(const m of meshes)m.dispose(false,false);
  } finally {group.root.dispose();renderer.dispose();scene.dispose();engine.dispose();}
 }
 // Separate instrumented diagnostic. Nested sort wall is not added to plan wall.
 const parts=decodeTreePrototype(buffer,prototypeId,prototype,lod);const sort=Uint32Array.prototype.sort;let sortMs=0,calls=0,items=0;
 try {Uint32Array.prototype.sort=function(compare){const at=performance.now();try{return sort.call(this,compare);}finally{sortMs+=performance.now()-at;calls++;items+=this.length;}};
 const at=performance.now();for(const p of parts)if(p.colors)createTreeSeasonGeometryPlan(p.indices,p.colors);results.push({id,prototypeId,lod,bytes:bytes.length,sha256:asset.sha256,samples,instrumented:{seasonMs:performance.now()-at,sortMs,calls,items}});
 }finally{Uint32Array.prototype.sort=sort;}
}
const files=['client/tree-asset-loader.ts','client/tree-season-geometry.ts','client/tree-renderer.ts','tests/tree-season-geometry.test.ts','pnpm-lock.yaml'];
const result={at:new Date().toISOString(),node:process.version,root:process.cwd(),method:'Production GLB bytes and production decode/season/createPilotMeshes in Node NullEngine; GPU upload and browser frame time not measured. Read/GC/material setup outside intervals. Season scope nested in mesh scope; total only decode+mesh.',sources:Object.fromEntries(await Promise.all(files.map(async p=>[p,sha(await readFile(p))]))),results};
await writeFile(resolve(output),JSON.stringify(result,null,2)+'\n',{flag:'wx'});
const median=(a:number[])=>a.sort((a,b)=>a-b)[Math.floor(a.length/2)];console.log(JSON.stringify(results.map(r=>({id:r.id,lod:r.lod,median:Object.fromEntries(['decodeMs','standaloneSeasonMs','createMeshesIncludingSeasonMs','postFetchCpuMs'].map(k=>[k,median(r.samples.slice(1).map(s=>(s as any)[k]))])),instrumented:r.instrumented})),null,2));
