import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash,randomBytes} from 'node:crypto';
// @ts-expect-error Pure JavaScript authoring helper.
import {densityRatio,metricGroups,selectPopulation,assignRanks,pruneAxes,fitToExistingBank,orientationChannels} from '../scripts/trees-20261026-catalog-export/population.mjs';
// @ts-expect-error Pure catalogue assembly.
import {assembleManifest,validateNativePackage} from '../scripts/trees-20261026-catalog-export/publish.mjs';
// @ts-expect-error Pure bounded cleanup admission; no files are removed here.
import {cleanupPlan,compactSource} from '../scripts/trees-20261026-catalog-export/cleanup.mjs';
// @ts-expect-error Explicit source-boundary marker control.
import {setPause} from '../scripts/trees-20261026-catalog-export/control.mjs';
// @ts-expect-error Owned authoring root, not a guessed working directory.
import {ROOT,verifiedCompletion} from '../scripts/trees-20261026-catalog-export/io.mjs';
// @ts-expect-error Pure unique source-byte budget accounting.
import {uniqueBytes} from '../scripts/trees-20261026-catalog-export/progress.mjs';
// @ts-expect-error Existing binary placement writer.
import {placementBytes} from '../scripts/trees-20261026-r6-far/publish.mjs';
import {decodeTreeClusterGeometry} from '../client/tree-cluster-geometry';
import {parseTreeClusterBank} from '../shared/tree-cluster-types';

function axes(){return [
 {id:0,parent:null,attachmentT:0,depth:0,points:[[0,0,0],[0,0,4]],radii:[.3,.1]},
 {id:1,parent:0,attachmentT:.5,depth:1,points:[[0,0,2],[1,0,3]],radii:[.1,.03]},
 {id:2,parent:1,attachmentT:1,depth:2,points:[[1,0,3],[2,0,4]],radii:[.03,.01]},
 {id:3,parent:2,attachmentT:1,depth:3,points:[[2,0,4],[2.5,0,4]],radii:[.01,.001]},
 {id:4,parent:3,attachmentT:1,depth:4,points:[[2.5,0,4],[2.501,0,4]],radii:[.001,.0001]},
 {id:5,parent:2,attachmentT:.5,depth:3,points:[[1.5,0,3.5],[1.5,.5,3.5]],radii:[.005,.001]},
];}
test('area density keeps tall crowns distinct from plan-area-only scaling',()=>{
 const source={height:10,crownDiameter:10,crownMinorRatio:1};
 assert.equal(densityRatio({source,target:source}),1);
 assert.equal(densityRatio({source,target:{height:5,crownDiameter:5,crownMinorRatio:1}}),.25);
 assert.ok(densityRatio({source,target:{height:20,crownDiameter:5,crownMinorRatio:1}})>.5);
});
test('resident accounting counts shared immutable files once and rejects alias conflicts',()=>{
 const file={path:'public/shared-bank.json',bytes:120,sha256:'a'.repeat(64)},other={path:'public/source-far.glb',bytes:900,sha256:'b'.repeat(64)};
 assert.equal(uniqueBytes([file,{...file},other]).bytes,1020);
 assert.throws(()=>uniqueBytes([file,{...file,sha256:'c'.repeat(64)}]),/Conflicting/);
});
test('adjacent leaves retain accepted golden-angle progression and independent bounded roll',()=>{
 const channels=Array.from({length:6},(_,i)=>orientationChannels(3035206842,4978,i));
 const angles=channels.map((c:any)=>c.componentOrdinal*2.399963+c.angularJitter*.4);
 for(let i=1;i<angles.length;i++)assert.ok(angles[i]-angles[i-1]>1.999&&angles[i]-angles[i-1]<2.801);
 assert.ok(channels.every((c:any)=>c.angularJitter>=0&&c.angularJitter<=1&&c.independentRoll>=0&&c.independentRoll<=1));
 assert.ok(channels.some((c:any)=>Math.abs(c.angularJitter-c.independentRoll)>.2));
 assert.deepEqual(orientationChannels(3035206842,4978,3),channels[3]);
});
test('metric source groups do not force leaves onto sub-spacing twigs and preserve support IDs',()=>{
 const input=axes(),copy=structuredClone(input),groups=metricGroups(input,{family:'deciduous-broadleaf',seed:42,partIds:['a','b','c']});
 assert.ok(groups.length);assert.ok(groups.every((g:any)=>g.parts.length<=6));assert.ok(groups.every((g:any)=>g.parts.every((p:any)=>p.branchId!==4)));
 assert.deepEqual(metricGroups([...input].reverse(),{family:'deciduous-broadleaf',seed:42,partIds:['a','b','c']}),groups);assert.deepEqual(input,copy);
 const pruned=pruneAxes(input,groups.filter((g:any)=>g.branchId===3));
 assert.deepEqual(pruned.map((b:any)=>b.id),[0,1,2,3]);assert.throws(()=>pruneAxes(input,[{parts:[{branchId:999}]}]),/supporting branch/);
});
test('bounded spatial selection preserves extrema and whole groups deterministically',()=>{
 const groups=Array.from({length:100},(_,i)=>({id:String(i),anchor:[i%10,Math.floor(i/10),i%3],branchId:3,parts:Array.from({length:2},(_,j)=>({sourcePartIndex:i*2+j,branchId:3}))}));
 const result=selectPopulation(groups,40,93),again=selectPopulation([...groups].reverse(),40,93);
 assert.deepEqual(result,again);assert.ok(result.audit.selectedParts<=40);assert.ok(result.groups.every((g:any)=>g.parts.length===2));
 for(let k=0;k<3;k++){assert.equal(Math.min(...result.groups.map((g:any)=>g.anchor[k])),Math.min(...groups.map(g=>g.anchor[k])));assert.equal(Math.max(...result.groups.map((g:any)=>g.anchor[k])),Math.max(...groups.map(g=>g.anchor[k])));}
 const ranked=assignRanks(result.groups,93);assert.equal(new Set(ranked.map((g:any)=>g.rank)).size,ranked.length);assert.equal(ranked[0].rank,1);assert.equal(ranked.at(-1).rank,65534);
});
test('frozen medoids are rigidly reused or exact-fallback; no scale or new prototype',()=>{
 const points=[[0,0,0],[0,1,0],[1,0,0],[1,1,0]],parts=[{partId:'a',sourcePartIndex:0}],sourceBank={coordinateSpace:'root-local-blender-z-up',fit:{scale:1,maximumError:.15,rmsError:.07},prototypes:[{id:0,anchor:[.5,.5,0],parts,points}]};
 const target=[{rank:12,anchor:[4,5,6],parts,points:points.map(([x,y,z])=>[4-(y-.5),5+(x-.5),6+z])},
  {rank:30,anchor:[0,0,0],parts:[{partId:'unrepresented',sourcePartIndex:1}],points}];
 const before=structuredClone(sourceBank),placements=fitToExistingBank(target,sourceBank);
 assert.equal(placements[0].prototype,0);assert.equal(placements[0].exact,false);assert.ok(placements[0].maximumError<1e-8);assert.equal(placements[1].exact,true);assert.equal(placements[1].prototype,null);assert.deepEqual(sourceBank,before);
 const scaled=fitToExistingBank([{...target[0],anchor:[0,0,0],points:points.map(p=>p.map(n=>n*3))}],sourceBank);assert.equal(scaled[0].exact,true);
 const texture={url:'/textures/trees/test.png',bytes:1,sha256:'a'.repeat(64)};
 const bank=parseTreeClusterBank({version:1,coordinateSpace:'gltf-y-up',units:'metres',prototypes:[{id:0,cards:[{positions:[0,0,0,1,0,0,1,1,0,0,1,0],normals:[0,0,1,0,0,1,0,0,1,0,0,1],uvs:[0,0,1,0,1,1,0,1]}]}],textures:{color:texture,opacity:texture,normalGL:texture,roughness:texture}});
 const raw=placementBytes(placements),buffer=Uint8Array.from(raw).buffer;
 const decoded=decodeTreeClusterGeometry(buffer,bank,{groupCount:2,exactRanks:[30]});assert.equal(decoded.positions.length,12);
 assert.throws(()=>decodeTreeClusterGeometry(buffer,bank,{groupCount:2,exactRanks:[]}),/missing/);
});
test('catalogue admission rejects partial population and wrong shared collision identity',()=>{
 const row={sourceTreeId:'source-a',sourceRootXZ:[1,2],positionUncertaintyMetres:2,family:'reference-bare',dimensions:{height:12,crownDiameter:7.5,trunkRadius:.38}};
 const bank={url:'/models/vegetation/bank.json',bytes:1,sha256:'a'.repeat(64)},file={bytes:1,sha256:'b'.repeat(64)};
 const entry={sourceTreeId:'source-a',prototypeId:'catalog-source-a',sourceRootXZ:[1,2],trunkRadius:.38,native:{path:'source.blend'},lods:[0,1,2].map(lod=>({...file,url:`/models/vegetation/source-a-${lod}.glb`,meshNames:[`catalog-source-a__lod${lod}__wood`]}))};
 const catalogue={count:1,placements:[row]},result=assembleManifest(catalogue,[entry],bank);
 assert.equal(result.manifest.version,4);assert.equal(result.manifest.placements[0].sourceTreeId,'source-a');assert.equal(result.manifest.prototypes['catalog-source-a'].family,'reference-bare');
 assert.throws(()=>assembleManifest(catalogue,[],bank),/Incomplete/);assert.throws(()=>assembleManifest(catalogue,[{...entry,trunkRadius:.4}],bank),/radius/);assert.throws(()=>assembleManifest(catalogue,[entry,entry],bank),/Duplicate/);
});
test('B5 native deliverable rejects the old sparse FAR source and requires complete native LODs',()=>{
 const detail=[{role:'wood',rankGroups:0},{role:'foliage',rankGroups:16019}];
 const old={nativeContents:{0:detail,1:detail,2:[{role:'wood',rankGroups:0},{role:'foliage',rankGroups:3214}]}};
 assert.throws(()=>validateNativePackage('ipr-crown-014',old),/complete FAR/);
 const complete={nativeContents:{0:detail,1:detail,2:[{role:'wood',rankGroups:0},{role:'foliage',rankGroups:72},{role:'far-cards',rankGroups:15947}]},b5Package:{nearMidSourceUnchanged:true,farSourceUnchanged:true,materialGraphsUnchanged:true,sparseFarExcluded:true,fullFarRankGroups:16019,exactRankGroups:72,cardRankGroups:15947}};
 assert.doesNotThrow(()=>validateNativePackage('ipr-crown-014',complete));
 assert.throws(()=>validateNativePackage('ipr-crown-014',{...complete,nativeContents:{...complete.nativeContents,0:[]}}),/near\/MID/);
 assert.throws(()=>validateNativePackage('ipr-crown-014',{...complete,b5Package:{...complete.b5Package,cardRankGroups:15946}}),/complete FAR/);
});
test('transient cleanup cannot consume evidence runs, authoritative assets or escaped paths',()=>{
 const id='new-source',run={id:'0123456789abcdef',cache:'.cache/trees-catalog-export-20261026/runs/0123456789abcdef',catalog:{placements:[{sourceTreeId:id}]}};
 const complete={runId:run.id,sourceTreeId:id,reopened:true,intermediates:[{path:run.cache+'/'+id+'/base.blend',bytes:12,sha256:'a'.repeat(64)}]};
 assert.deepEqual(cleanupPlan(run,id,complete),complete.intermediates);
 assert.throws(()=>cleanupPlan(run,id,{...complete,reopened:false}),/verified/);
 assert.throws(()=>cleanupPlan(run,id,{...complete,intermediates:[{...complete.intermediates[0],path:'assets/blender/vegetation/seasonal-catalog/model.blend'}]}),/member/);
 assert.throws(()=>cleanupPlan(run,id,{...complete,intermediates:[{...complete.intermediates[0],path:run.cache+'/'+id+'/../other/base.blend'}]}),/member/);
 assert.throws(()=>cleanupPlan({...run,id:'7a24e4627ac58dcc',cache:'.cache/trees-catalog-export-20261026/runs/7a24e4627ac58dcc'},id,complete),/protected/);
 assert.throws(()=>cleanupPlan({...run,cache:'.cache/foreign'},id,complete),/scope/);
});
test('verified compact/resume keeps native assets, fails before deletion on corruption, and pauses only by marker',()=>{
 const runId=randomBytes(8).toString('hex'),id='tiny-cleanup-fixture',cache='.cache/trees-catalog-export-20261026/runs/'+runId;
 const run={id:runId,cache,catalog:{placements:[{sourceTreeId:id}]}};
 const absolute=path.resolve(ROOT,cache),tree=path.join(absolute,id),authoritative=path.join(tree,'authoritative');
 assert.ok(absolute.startsWith(path.resolve(ROOT,'.cache/trees-catalog-export-20261026/runs')+path.sep));assert.equal(fs.existsSync(absolute),false);
 fs.mkdirSync(authoritative,{recursive:true});
 const pin=(relative:string,body:string)=>{const bytes=Buffer.from(body);fs.writeFileSync(path.join(ROOT,relative),bytes,{flag:'wx'});return {path:relative,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')};};
 const dir=cache+'/'+id;
 try{
  const native=pin(dir+'/authoritative/model.blend','native fixture'),library=pin(dir+'/authoritative/materials.blend','packed photos fixture'),lod=pin(dir+'/authoritative/lod.glb','runtime geometry fixture');
  const a=pin(dir+'/prepared.json','reconstructable source arrays'),b=pin(dir+'/base.blend','reconstructable source base');
  const complete={runId,sourceTreeId:id,reopened:true,native,materialLibrary:library,lods:[lod],intermediates:[a,b]};fs.writeFileSync(path.join(tree,'complete.json'),JSON.stringify(complete));
  fs.writeFileSync(path.join(ROOT,b.path),'corrupted intermediate');assert.throws(()=>compactSource(run,id),/Changed pinned/);assert.equal(fs.existsSync(path.join(ROOT,a.path)),true,'entire delete set must validate before first unlink');
  fs.writeFileSync(path.join(ROOT,b.path),'reconstructable source base');fs.unlinkSync(path.join(ROOT,a.path)); // Interrupted previous cleanup already removed this member.
  const report=compactSource(run,id);assert.equal(report.plannedFiles,2);assert.equal(report.alreadyMissingFiles,1);assert.equal(report.alreadyMissingBytes,a.bytes);assert.equal(report.removedNowFiles,1);assert.equal(report.removedNowBytes,b.bytes);assert.equal(report.confirmedAbsentFiles,2);assert.equal(report.authoritativeAssetsPreserved,true);
  assert.equal(fs.existsSync(path.join(ROOT,a.path)),false);assert.equal(fs.existsSync(path.join(ROOT,b.path)),false);assert.deepEqual(verifiedCompletion(run,id),complete);assert.deepEqual(compactSource(run,id),report);
  setPause(run,true);assert.equal(fs.existsSync(path.join(absolute,'pause.request')),true);assert.deepEqual(verifiedCompletion(run,id),complete);
  setPause(run,false);assert.equal(fs.existsSync(path.join(absolute,'pause.request')),false);assert.equal(fs.readdirSync(absolute).filter(n=>n.startsWith('pause-resumed-')).length,1);
 }finally{
  // Only explicitly created fixture files; no recursive delete or guessed path.
  for(const name of ['model.blend','materials.blend','lod.glb'])if(fs.existsSync(path.join(authoritative,name)))fs.unlinkSync(path.join(authoritative,name));
  fs.rmdirSync(authoritative);
  for(const name of ['prepared.json','base.blend','complete.json','compact-plan.json','compacted.json'])if(fs.existsSync(path.join(tree,name)))fs.unlinkSync(path.join(tree,name));
  fs.rmdirSync(tree);
  for(const name of fs.readdirSync(absolute)){assert.ok(name==='pause.request'||/^pause-resumed-\d+\.txt$/.test(name));fs.unlinkSync(path.join(absolute,name));}
  fs.rmdirSync(absolute);
 }
});
