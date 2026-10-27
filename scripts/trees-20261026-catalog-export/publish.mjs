import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {read,info,pinned,writeJson,loadRun,asset,prototypeId,parseArgs} from './io.mjs';

/** Atomic catalogue admission is independent of authoring IO. Partial or extra
 * source populations never become a runtime manifest. */
export function assembleManifest(catalog,entries,bank){
 const byId=new Map();for(const entry of entries){if(byId.has(entry.sourceTreeId))throw Error('Duplicate completed source');byId.set(entry.sourceTreeId,entry);}
 if(byId.size!==catalog.placements.length||catalog.count!==catalog.placements.length)throw Error('Incomplete source population');
 const prototypes={},placements=[],natives=[];
 for(const row of catalog.placements){
  const entry=byId.get(row.sourceTreeId);if(!entry||entry.prototypeId!==prototypeId(row)||JSON.stringify(entry.sourceRootXZ)!==JSON.stringify(row.sourceRootXZ)||entry.trunkRadius!==row.dimensions.trunkRadius)throw Error('Completed source/root/radius mismatch');
  const id=entry.prototypeId;if(prototypes[id]||entry.lods.length!==3||new Set(entry.lods.map(l=>l.url)).size!==3)throw Error('Invalid source LOD identity');
  prototypes[id]={sourceTreeId:row.sourceTreeId,family:row.family,nominalHeight:row.dimensions.height,nominalCrownDiameter:row.dimensions.crownDiameter,trunkRadius:row.dimensions.trunkRadius,lodProfile:'full-coverage',lods:entry.lods,...(entry.farCluster?{farCluster:entry.farCluster}:{})};
  placements.push({sourceTreeId:row.sourceTreeId,sourceRootXZ:row.sourceRootXZ,positionUncertaintyMetres:row.positionUncertaintyMetres,prototypeCandidates:[id],selectedPrototypeId:null});natives.push({sourceTreeId:row.sourceTreeId,...entry.native});
 }
 return {manifest:{version:4,units:'metres',rankEncoding:'uint16-normalized',banks:{'r6-leaf-bank':bank},prototypes,placements},nativeCatalog:natives};
}
function verifiedDescriptor(file){pinned({path:'public'+file.url,bytes:file.bytes,sha256:file.sha256});return structuredClone(file);}
/** The native deliverable must expose the same complete LODs as the runtime,
 * not merely point at an older source .blend with a sparse FAR. */
export function validateNativePackage(id,complete){
 if(!['ipr-crown-014','ipr-b6-north-conifer'].includes(id))return;
 const contents=complete.nativeContents,roles=lod=>(contents?.[lod]??[]).map(m=>m.role).sort().join(',');
 if(roles(0)!=='foliage,wood'||roles(1)!=='foliage,wood')throw Error('Native package lacks unchanged near/MID');
 if(id==='ipr-crown-014'){
  const proof=complete.b5Package;
  if(roles(2)!=='far-cards,foliage,wood'||!proof?.nearMidSourceUnchanged||!proof.farSourceUnchanged||!proof.materialGraphsUnchanged||!proof.sparseFarExcluded||proof.fullFarRankGroups!==16019||proof.exactRankGroups+proof.cardRankGroups!==16019)throw Error('B5 native package lacks accepted complete FAR');
  if(contents[2].find(m=>m.role==='foliage').rankGroups!==proof.exactRankGroups||contents[2].find(m=>m.role==='far-cards').rankGroups!==proof.cardRankGroups)throw Error('B5 native FAR rank inventory mismatch');
 }else if(roles(2)!=='foliage,wood'||!complete.fullSourceFar?.nearMidBytesUnchanged||!complete.fullSourceFar.nearMidNativeCornersUnchanged||!complete.fullSourceFar.nearMidNativeMaterialsUnchanged||complete.fullSourceFar.sourceParts!==18138||complete.fullSourceFar.farParts!==18138||contents[2].find(m=>m.role==='foliage').rankGroups!==18138)throw Error('North native package lacks complete source FAR');
}
export function completedEntries(run,rows=run.catalog.placements){
 const far=read('public/models/vegetation/seasonal-r6-far/pilot-manifest.json');
 return rows.map(row=>{
  const id=row.sourceTreeId,pid=prototypeId(row),base={sourceTreeId:id,prototypeId:pid,sourceRootXZ:row.sourceRootXZ,trunkRadius:row.dimensions.trunkRadius};
  const accepted=run.recipe.acceptedSources?.[id];
  const complete=accepted?JSON.parse(pinned(accepted)):read(`${run.cache}/${id}/complete.json`);if((!accepted&&complete.runId!==run.id)||complete.sourceTreeId!==id||complete.reopened!==true)throw Error('Invalid completion receipt');
  validateNativePackage(id,complete);
  pinned(complete.native);if(complete.materialLibrary)pinned(complete.materialLibrary);for(const dependency of complete.dependencies??[])pinned(dependency);
  const lods=complete.lods.map((file,lod)=>{pinned(file);return {...asset(file.path),meshNames:file.meshes.map(m=>m.name)};});
  let farCluster;
  if(row.family==='deciduous-broadleaf'){const directory=accepted?path.posix.dirname(accepted.path):`${run.cache}/${id}`;const f=complete.farClusterEvidence??read(directory+'/far-fit.json');if(f.bankSha256!==far.bank.sha256||f.runId!==complete.runId||f.sourceTreeId!==id)throw Error('FAR source/bank mismatch');pinned(f.file);farCluster={bankId:'r6-leaf-bank',placements:asset(f.file.path),groupCount:f.groupCount};}
  return {...base,lods,native:complete.native,...(farCluster?{farCluster}:{})};
 });
}
export function publishCatalog(run){
 const far=read('public/models/vegetation/seasonal-r6-far/pilot-manifest.json'),bank=verifiedDescriptor(far.bank),entries=completedEntries(run),out=assembleManifest(run.catalog,entries,bank);
 const resident=new Map(),add=f=>{const previous=resident.get(f.url);if(previous&&(previous.bytes!==f.bytes||previous.sha256!==f.sha256))throw Error('Conflicting shared asset descriptor');resident.set(f.url,f);};
 add(bank);for(const texture of Object.values(read('public'+bank.url).textures))add(verifiedDescriptor(texture));
 for(const e of entries){add(e.lods[2]);if(e.farCluster)add(e.farCluster.placements);}
 const residentSourceBytes=[...resident.values()].reduce((n,f)=>n+f.bytes,0);if(residentSourceBytes>96*1024*1024)throw Error('Completed catalogue exceeds current resident source-byte budget');
 const evidence={runId:run.id,sourceCount:entries.length,residentSourceBytes,uniqueResidentFiles:resident.size,sourceByteAccountingOnly:true,nativeCatalog:out.nativeCatalog};
 // All identities, complete receipts and asset bytes are checked before the
 // last atomic write exposes the complete catalogue. Explicit QA still owns use.
 writeJson(run.public+'/native-catalog.json',evidence);const result=writeJson(run.public+'/runtime-contract.json',out.manifest);writeJson(run.cache+'/published.json',{...evidence,manifest:result});return result;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){const a=parseArgs('--publish');if(!a.run)throw Error('Require --run');console.log(JSON.stringify(publishCatalog(loadRun(a.run))));}
