import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {encodeSeasonalGlb,verifySeasonalSplit} from '../tree-seasonal-stream.mjs';
import {packagePilot} from './package.mjs';
const sha=b=>createHash('sha256').update(b).digest('hex');
const cache='.cache/trees-r6-export-20261026';
const info=p=>{const b=fs.readFileSync(p);return{path:p,bytes:b.length,sha256:sha(b)}};
const pins={
 accepted:{path:'.cache/trees-r6-crown-20261026/artifact-manifest.json',sha256:'14c084ca29849eef593ff10e68ee70a9415992246c95b4a5b6f8c95671eea0a7'},
 whole:{path:'public/models/vegetation/seasonal-r5/runtime-contract.json',sha256:'e17bc7f691fb3b59ff119cdbb74671ea46b137bf8cba87b5570ef3e32d509db6'},
 streamed:{path:'public/models/vegetation/seasonal-r5-streamed/runtime-contract.json',sha256:'9dc0b48ada20c9662e30628f985555d7ea30ce2bdd7113bb63f7019217551535'},
};
function check(pin){const actual=info(pin.path);if(actual.sha256!==pin.sha256||(pin.bytes!==undefined&&pin.bytes!==actual.bytes))throw Error('Input changed: '+pin.path);return actual;}
function main(){
 if(process.argv.length!==3||process.argv[2]!=='--publish')throw Error('Explicit --publish required inside claimed export task');
 const inputs=Object.values(pins).map(check),accepted=JSON.parse(fs.readFileSync(pins.accepted.path));
 for(const file of accepted.files)check(file);
 const oldPlan=JSON.parse(fs.readFileSync('.cache/trees-r6-crown-20261026/plan.json'));for(const pin of Object.values(oldPlan.inputPins))check(pin);
 const native=JSON.parse(fs.readFileSync(cache+'/native-extraction.json'));
 for(const pin of [native.source,native.generator,native.geometryBin,native.geometryJson])check(pin);
 const wholeBytes=encodeSeasonalGlb(JSON.parse(fs.readFileSync(native.geometryJson.path)),fs.readFileSync(native.geometryBin.path));
 const r5Whole=JSON.parse(fs.readFileSync(pins.whole.path)),r5Streamed=JSON.parse(fs.readFileSync(pins.streamed.path));
 const result=packagePilot({wholeBytes,r5Whole,r5Streamed});
 const coniferWhole=r5Whole.prototypes['own-conifer'],coniferStreamed=r5Streamed.prototypes['own-conifer'];
 const coniferSource=check({path:'public'+coniferWhole.lods[0].url,bytes:coniferWhole.lods[0].bytes,sha256:coniferWhole.lods[0].sha256});inputs.push(coniferSource);
 const coniferBytes=fs.readFileSync(coniferSource.path),coniferChecks=[];
 for(const [lod,descriptor]of coniferStreamed.lods.entries()){
  const pin=check({path:'public'+descriptor.url,bytes:descriptor.bytes,sha256:descriptor.sha256});inputs.push(pin);
  coniferChecks.push({lod,...verifySeasonalSplit(coniferBytes,fs.readFileSync(pin.path),descriptor.meshNames)});
 }
 const output='public/models/vegetation/seasonal-r6',streamOutput='public/models/vegetation/seasonal-r6-streamed';
 fs.mkdirSync(output,{recursive:true});fs.mkdirSync(streamOutput,{recursive:true});
 fs.writeFileSync(output+'/own-broadleaf.glb',wholeBytes);
 for(const file of result.files)fs.writeFileSync('public'+file.url,file.bytes);
 // Contracts publish last, after complete model and split validation.
 fs.writeFileSync(output+'/runtime-contract.json',JSON.stringify(result.whole,null,2)+'\n');
 fs.writeFileSync(streamOutput+'/runtime-contract.json',JSON.stringify(result.streamed,null,2)+'\n');
 const evidence={version:1,sourceNative:native.source,nativeExtraction:info(cache+'/native-extraction.json'),sourceDelta:info('.cache/trees-r6-crown-20261026/source-delta.json'),
  inputs,whole:info(output+'/own-broadleaf.glb'),wholeContract:info(output+'/runtime-contract.json'),streamedContract:info(streamOutput+'/runtime-contract.json'),
  streamed:result.files.map(f=>({lod:f.lod,...info('public'+f.url)})),...result.audit,unchangedConiferAccessorChecks:coniferChecks,
  nativeNormalPolicy:native.normalPolicy,coordinateConversion:native.coordinateConversion,limitations:['R6 native crown accepted only as next game pilot.','FAR retains original sparse population; full-coverage refers to MID.','No full-game GPU or frame-rate evidence.']};
 fs.writeFileSync(output+'/export-evidence.json',JSON.stringify(evidence,null,2)+'\n');fs.writeFileSync(cache+'/export-evidence.json',JSON.stringify(evidence,null,2)+'\n');
 for(const pin of inputs)check(pin);for(const file of accepted.files)check(file);for(const pin of Object.values(oldPlan.inputPins))check(pin);
 console.log(JSON.stringify({whole:evidence.whole,streamed:evidence.streamed,splitAccessorComparisons:result.audit.splitAudits.reduce((n,r)=>n+r.accessorComparisons,0),coniferReferencesUnchanged:true},null,2));
}
main();
