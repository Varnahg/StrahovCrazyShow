import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {fitAxes} from '../trees-20261026-catalog/fit.mjs';
import {densityRatio,metricGroups,selectPopulation,assignRanks,pruneAxes} from './population.mjs';
import {ROOT,CACHE,read,info,pinned,sha,writeJson,writeImmutable,loadRun,selectedRows,prototypeId,parseArgs} from './io.mjs';
export const FIXED_PINS=Object.freeze([
 {path:'.cache/trees-catalog-20261026/source-plan.json',bytes:365824,sha256:'97010582490d8c469d595543651eae3299741bcc4e8d67ee2cc4304f78d4db1d'},
 {path:'public/models/vegetation/seasonal-r6-far/bank-source.json',bytes:544094,sha256:'df10633f0329e73162ddbe5fc47cbfc3183be68712f6eba2ca6d431bf03130e3'},
 {path:'public/models/vegetation/seasonal-r6-far/bank.json',bytes:474603,sha256:'b6bd3a93c859b566b9fb18963441eee646389c9800242b4038e3c11a7f5339aa'},
 {path:'.cache/trees-pilot-20261025/r4-optimized/models/pilot-manifest.json',bytes:61059816,sha256:'8dc3f4554dc729d7baa67a54a5c78e7d524b0888d8ebdbe60fbae5ccf283f2f6'},
 {path:'assets/blender/vegetation/seasonal-r6-crown/r6-b5-crown-three-lods.blend',bytes:118879646,sha256:'1c212a55abf286894c874cd1da1b8f20b0ba30a59d02317c4180ba4580ce596c'},
 {path:'assets/blender/vegetation/seasonal-r6-far/r6-b5-far-candidate.blend',bytes:49255099,sha256:'3c4f7b9dd938f589f19a4e82949ee6c7141f53d719d74ff12cf0075c19422240'},
]);
// Explicit coordinator acceptance of these unchanged selected native outputs.
// They are not regenerated for the broadleaf orientation correction.
export const ACCEPTED_SOURCES=Object.freeze({
 'ipr-b6-north-conifer':{path:'.cache/trees-catalog-export-20261026/runs/d9b9b4518aad4eab/ipr-b6-north-conifer/complete.json',bytes:5105,sha256:'60c88494885dc098b1cb7d88d66e165e0c1496b2939cdbdd0f9cc664f40818a8'},
 'ipr-crown-014':{path:'.cache/trees-catalog-export-20261026/runs/7c98b4b39684797d/ipr-crown-014/complete.json',bytes:7938,sha256:'7bdfd3be84af429f3bb6079af918b047d9695a224fc943805223a91c8a4cf7ec'},
 '4314257232':{path:'.cache/trees-catalog-export-20261026/runs/7a24e4627ac58dcc/4314257232/complete.json',bytes:6893,sha256:'cb661f9b2b5d4c63e7e74d8498cab0c520c6f619325fe88d35fe2ac8c2151697'},
 'ipr-crown-074':{path:'.cache/trees-catalog-export-20261026/runs/7a24e4627ac58dcc/ipr-crown-074/complete.json',bytes:6973,sha256:'5f6fc5c7540ced06bc515cdbbb6ea6a8adc8d10502cb5a23a62b8877353c9a83'},
 'ipr-b6-south-conifer':{path:'.cache/trees-catalog-export-20261026/runs/8b60d5845e72d3b0/ipr-b6-south-conifer/complete.json',bytes:7023,sha256:'5b492196e33d0fc15512851d43d6fdc10a65668f4a87b97012fef5c66a94499e'},
 'ipr-b6-north-bare':{path:'.cache/trees-catalog-export-20261026/runs/9181e80f6beaf299/ipr-b6-north-bare/complete.json',bytes:3699,sha256:'8d2425fc0a703fa9da38d525d5374621b675aea3d29895f4ce2ae6921fd141dc'},
});
export function createRun(){
 FIXED_PINS.forEach(pinned);const catalog=read(FIXED_PINS[0].path),bank=read(FIXED_PINS[2].path);
 const acceptedEvidence=[];
 for(const [id,pin]of Object.entries(ACCEPTED_SOURCES)){
  const complete=JSON.parse(pinned(pin));if(complete.sourceTreeId!==id||complete.reopened!==true)throw Error('Invalid accepted source receipt');pinned(complete.native);if(complete.materialLibrary)pinned(complete.materialLibrary);for(const file of complete.lods)pinned(file);
  if(catalog.placements.find(p=>p.sourceTreeId===id).family==='deciduous-broadleaf'){
   const file=path.posix.dirname(pin.path)+'/far-fit.json',fit=complete.farClusterEvidence??read(file);if(fit.runId!==complete.runId||fit.sourceTreeId!==id||fit.bankSha256!==FIXED_PINS[2].sha256)throw Error('Accepted FAR evidence mismatch');pinned(fit.file);if(!complete.farClusterEvidence)acceptedEvidence.push(info(file));
  }
 }
 Object.values(catalog.axisSources).forEach(pinned);catalog.sourceFiles.forEach(pinned);
 const paths=[...Object.values(catalog.axisSources).map(s=>s.path),'shared/data/tree-leaf-components.json','shared/data/assets/tree-materials-manifest.json','shared/data/assets/tree-bark-material.json',
 'assets/blender/vegetation/strahov-individual-trees.blend','assets/blender/vegetation/seasonal-r5/r5-full-coverage-pilots.blend','assets/blender/vegetation/seasonal-r6-crown/r6-b5-crown-three-lods.blend',
 'public/models/vegetation/seasonal-r6-streamed/runtime-contract.json','public/models/vegetation/seasonal-r6-far/pilot-manifest.json'];
 for(const p of Object.values(bank.textures))paths.push('public'+p.url);
 const materials=read('shared/data/assets/tree-materials-manifest.json'),bark=read('shared/data/assets/tree-bark-material.json');
 for(const a of materials.assets)for(const m of Object.values(a.maps))paths.push(m.runtimePath??('public'+m.url));
 for(const m of Object.values(bark.channels))paths.push('public'+m.url);
 const code=fs.readdirSync(path.join(ROOT,'scripts/trees-20261026-catalog-export')).filter(n=>/\.(mjs|py)$/.test(n)).map(n=>info('scripts/trees-20261026-catalog-export/'+n));
 for(const p of ['scripts/trees-20261026-catalog/catalog.mjs','scripts/trees-20261026-catalog/fit.mjs','scripts/trees-20261026-r6-far/fit.mjs','scripts/trees-20261026-r6-far/publish.mjs','scripts/tree-seasonal-stream.mjs'])code.push(info(p));
 const inputs=[...FIXED_PINS,...Object.values(ACCEPTED_SOURCES),...acceptedEvidence,...catalog.sourceFiles,...[...new Set(paths)].sort().map(info)],recipe={inputs,code,acceptedSources:ACCEPTED_SOURCES,policy:{density:'source-area scale pairs; spatial whole groups; no forced minimum',maximumPartsPerGroup:6,maximumGroupSpanMetres:.39,bankScale:1,broadleafOrientation:'accepted golden-angle progression with independent avalanche jitter/roll'}};
 const id=sha(Buffer.from(JSON.stringify(recipe))).slice(0,16),run={version:1,id,recipe,catalog,cache:`${CACHE}/runs/${id}`,native:`assets/blender/vegetation/seasonal-catalog/${id}`,public:`public/models/vegetation/seasonal-catalog/${id}`};
 writeJson(run.cache+'/run.json',run);
 for(const pin of code)writeImmutable(run.cache+'/source-code/'+pin.path,fs.readFileSync(path.join(ROOT,pin.path)));
 for(const file of ['tests/tree-catalog-export.test.ts'])writeImmutable(run.cache+'/source-code/'+file,fs.readFileSync(path.join(ROOT,file)));
 return run;
}
export function prepareSource(run,row){
 const id=row.sourceTreeId,pid=prototypeId(row),deriveNorthConiferFar=id==='ipr-b6-north-conifer',packageAcceptedB5=id==='ipr-crown-014',reuse=!!run.recipe.acceptedSources?.[id];
 let axes=[],groups=[],audit={};
 if(row.foliage&&!reuse&&!deriveNorthConiferFar&&!packageAcceptedB5){
  const source=read(run.catalog.axisSources[row.authoringSource].path),fit=fitAxes(source.axes,row.axisFit);
  const atlas=read('shared/data/tree-leaf-components.json').atlases.find(a=>a.id===(row.family==='evergreen-conifer'?'fir_tree_01':'LeafSet024'));
  const candidates=metricGroups(fit.axes,{family:row.family,seed:row.seed,partIds:atlas.parts.map(p=>p.id)});
  const ratio=densityRatio(row.axisFit),baseline=82100;
  // Reference full B5 part population; conifer remains metrical without an
  // unverified broadleaf-area baseline. Only broadleaf uses this density cap.
  const budget=row.family==='deciduous-broadleaf'?Math.max(1,Math.round(baseline*ratio)):candidates.reduce((n,g)=>n+g.parts.length,0);
  const selected=selectPopulation(candidates,budget,row.seed);groups=assignRanks(selected.groups,row.seed);axes=pruneAxes(fit.axes,groups);
  audit={fit:fit.audit,density:{...selected.audit,areaScaleRatio:ratio,interpretation:'authored canopy density, not measured foliage'},branchesBefore:fit.axes.length,branchesAfter:axes.length};
 }
 const prepared={version:1,runId:run.id,source:row,prototypeId:pid,reuseAcceptedPilot:reuse,deriveNorthConiferFar,packageAcceptedB5,axes,groups,audit};
 writeJson(`${run.cache}/${id}/prepared.json`,prepared);return prepared;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 if(process.argv[2]==='--create-run'){if(process.argv.length!==3)throw Error('No extra create-run arguments');const r=createRun();console.log(JSON.stringify({run:r.cache+'/run.json',id:r.id}));}
 else {const a=parseArgs('--prepare');if(!a.run||!a.id)throw Error('Require --run and --id');const run=loadRun(a.run);for(const row of selectedRows(run,a.id)){const r=prepareSource(run,row);console.log(JSON.stringify({id:row.sourceTreeId,reuse:r.reuseAcceptedPilot,parts:r.groups.reduce((n,g)=>n+g.parts.length,0),branches:r.axes.length}));}}
}
