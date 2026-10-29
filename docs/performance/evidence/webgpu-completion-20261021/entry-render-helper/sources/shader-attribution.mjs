/** Build-only diagnostic. Observe existing profiler jobs, never request GPU work. */
import { observeShaderLifetime, readMaterialFor } from './shader-lifetime.mjs';
/** One diagnostic-only post-ready window. Never increases observer bounds. */
export function createShaderAttributionWindow(game, options = {}) {
  let gameRef=game, current, used=false, disposed=false;
  const setTimer=options.setTimer??setTimeout,clearTimer=options.clearTimer??clearTimeout;
  const now=options.now??(()=>performance.now()), observe=options.observe??observeShaderAttribution;
  const live=()=>!disposed&&!options.signal?.aborted&&!options.isRetired?.()&&gameRef?.disposed!==true;
  const report=error=>{try{options.onError?.(error);}catch{ /* observer error reporting cannot leak */ }};
  const onAbort=()=>api.dispose();
  const api={
    begin(){
      if(!live()||used)throw Error('Shader window retired or already used');
      const before=options.snapshot(),startedAtMs=now();
      const owner=observe(gameRef,{enabled:true,signal:options.signal,isRetired:()=>!live()});
      if(!owner){throw Error('Shader attribution unavailable');}
      used=true;current={owner,before,startedAtMs,timer:undefined};
      try{current.timer=setTimer(()=>{void api.finish('deadline').catch(report);},30000);}
      catch(error){current=undefined;owner.dispose();throw error;}
      return{startedAtMs,deadlineMs:30000};
    },
    async finish(reason='explicit'){
      if(!live()||!current)throw Error('No active shader window');
      const owned=current;current=undefined;clearTimer(owned.timer);owned.owner.dispose();
      const result={reason,startedAtMs:owned.startedAtMs,endedAtMs:now(),before:owned.before,
        shaderAttribution:owned.owner.snapshot(),scope:'One post-ready diagnostic window; original shader jobs only. Not an FPS sample.'};
      await options.onComplete(result);return result;
    },
    dispose(){
      if(disposed)return;disposed=true;const owned=current;current=undefined;
      if(owned){clearTimer(owned.timer);owned.owner.dispose();}
      options.signal?.removeEventListener('abort',onAbort);gameRef=undefined;
    },
  };
  if(options.signal?.aborted)api.dispose();else options.signal?.addEventListener('abort',onAbort,{once:true});
  return api;
}
export const ATTRIBUTION_LIMITS = Object.freeze({ jobs: 4096, modules: 4096, effects: 2048, meshes: 512, links: 1024, meshScan: 8192, instanceScan: 8192, stages: 24 });
const owners = new WeakMap(), nativeThen = Promise.prototype.then;
const nativeMapGet=Map.prototype.get,nativeMapEntries=Map.prototype.entries;
const nativeMapNext=Object.getPrototypeOf(new Map().entries()).next;
const object = value => value !== null && (typeof value === 'object' || typeof value === 'function');
const data = (target, key) => object(target) ? Object.getOwnPropertyDescriptor(target, key)?.value : undefined;
const finite = value => Number.isFinite(value) ? value : null;
const integer = value => Number.isSafeInteger(value) && value >= 0 ? value : null;
const bool = value => typeof value === 'boolean' ? Number(value) : -1;
function method(target, name) {
  for (let cursor = target; object(cursor); cursor = Object.getPrototypeOf(cursor)) {
    const descriptor = Object.getOwnPropertyDescriptor(cursor, name);
    if (descriptor) return 'value' in descriptor && typeof descriptor.value === 'function' ? descriptor.value : undefined;
  }
}
const stageName = value => typeof value === 'string' && /^(unassigned|overflow|construction|assets|restore|submitted-frame|ready|current-(on|off)|(night-[012]|day-[01])-(on|off)|vehicle-(keyed-)?[012])$/.test(value) ? value : 'unknown';
function technicalName(value) {
  if (typeof value !== 'string' || value.length > 96 || /avatar|player|student|@|https?:|token|secret|authorization/i.test(value)) return null;
  const clean = value.replace(/[a-f0-9]{8}-[a-f0-9-]{27,}/gi, '<id>');
  return /^(b6|campus|ground|world|photo|tree|grass|sky|car|vehicle|floor|road|window|wall|lamp|terrain|shadow|street|m#|clear|default|pbr|__root__)/i.test(clean) && /^[a-z0-9 _.:#<>/\[\]-]+$/i.test(clean) ? clean : null;
}
/** Existing inventory metadata only. Shader/define text and define names omitted. */
export function projectShaderInventory(value) {
  if (!value || data(value, 'enabled') !== true) return null;
  const result = { enabled: true, source: 'Existing compilationProfile inventory; scalar projection without shader text or define names' };
  for (const key of ['calls','rawKnown','rawRepeated','bodyKnown','bodyRepeated','descriptorUnknown','bodyUnknown','limited','rawHashConflicts','bodyHashConflicts','unrecognizedPrefix','stageOverflow','ambiguousBodies','evidenceTruncated','retainedEntries','retainedCodeUnits','released','cpuTotalMs','cpuMaxMs','rawDuplicateGroups','bodyDuplicateGroups','exportTruncated']) {
    const item = data(value, key); if (typeof item === 'boolean' || Number.isFinite(item)) result[key] = item;
  }
  const limits = data(value, 'limits'); result.limits = {};
  for (const key of ['maxEntries','maxCodeUnits','maxStages','maxRows']) if (Number.isFinite(data(limits,key))) result.limits[key] = data(limits,key);
  const stages = data(value, 'stages'); result.stages = Array.isArray(stages) ? stages.slice(0,24).map(row => {
    const item = { name: stageName(data(row,'name')) };
    for (const key of ['calls','rawKnown','rawRepeated','bodyKnown','bodyRepeated','descriptorUnknown','bodyUnknown','limited']) if (Number.isFinite(data(row,key))) item[key] = data(row,key);
    return item;
  }) : [];
  for (const name of ['rawDuplicates','bodyDuplicates']) {
    const rows = data(value,name); result[name] = Array.isArray(rows) ? rows.slice(0,16).map(row => {
      const item = {};
      for (const key of ['id','chars','calls','vertex','fragment','unknown','variants']) if (Number.isFinite(data(row,key))) item[key] = data(row,key);
      const fingerprint = data(row,'fingerprint'); if (typeof fingerprint === 'string' && /^[a-f0-9]{8}$/.test(fingerprint)) item.fingerprint = fingerprint;
      const counts = data(row,'stages'); item.stages = Array.isArray(counts) ? counts.slice(0,24).map(finite) : [];
      return item;
    }) : [];
  }
  result.projectionTruncated = (Array.isArray(stages) && stages.length > 24) || ['rawDuplicates','bodyDuplicates'].some(key => Array.isArray(data(value,key)) && data(value,key).length > 16);
  return result;
}
export function observeShaderAttribution(game, options = {}) {
  if (options.enabled !== true) return undefined;
  const limits = Object.fromEntries(Object.entries(ATTRIBUTION_LIMITS).map(([key,max]) => [key, Math.min(max, Math.max(1, Math.floor(options.limits?.[key] ?? max) || 1))]));
  const issues = { observerErrors:0, overflow:0, traceOverflow:0, mappingOverflow:0, mappingErrors:0, unknownRole:0, unknownStage:0, unmatchedJobs:0, unsupportedPromise:0, ownerChanged:0, unexpectedReceivers:0, restoreConflicts:0, restoreFailures:0, contract:0 };
  const hooks=[], jobs=[], modules=[], stages=['unobserved-before-start'], stack=[];
  let moduleIDs = new WeakMap(), profile, engine, device, generation, currentStage=0, active=true, registered=false, sealed,lifetime;
  const finalModuleIDs=new Set();
  let gameRef=game, signal=options.signal, retired=options.isRetired;
  const token={}, now=options.now ?? (() => performance.now()), availability={ inspectShader:'unavailable',observe:'unavailable',setStage:'unavailable' };
  const readNow = () => { try { const value=now(); if (Number.isFinite(value)&&value>=0) return value; } catch { issues.observerErrors++; } return null; };
  const safe = callback => { try { return callback(); } catch { issues.observerErrors++; } };
  const traceOverflow=()=>{issues.overflow++;issues.traceOverflow++;};
  const moduleID = value => {
    if (!object(value)) { issues.contract++; return 0; }
    let id=moduleIDs.get(value); if (id) return id;
    if (modules.length>=limits.modules) { traceOverflow(); return 0; }
    id=modules.length+1; moduleIDs.set(value,id); modules.push([id,0,0]); return id;
  };
  const stage = value => {
    const name=stageName(value); if (name==='unknown') issues.unknownStage++;
    let id=stages.indexOf(name); if(id>=0) return id;
    if(stages.length>=limits.stages) { traceOverflow(); return 0; }
    stages.push(name); return stages.length-1;
  };
  function passiveMapping() {
    const linkLimit=Math.max(0,limits.links-(lifetime?.linkCount()??0)),meshLimit=Math.max(0,limits.meshes-(lifetime?.ownerCount()??0));
    const result={ effectColumns:['effectID','pipelineContextID','vertexModuleID','fragmentModuleID','disposedFlag','readyFlag'],effects:[],meshes:[],links:[],cacheEntries:0,meshEntries:0,meshesScanned:0,instancesScanned:0,unobservedEffects:0,unknownSlots:0,redactedNames:0,shadowEntriesScanned:0,shadowSubMeshLookups:0,shadowOwnerMismatches:0,legacySubMaterialSlots:0,
      selection:'Pending original jobs first, then submitted-frame, then completed history; bounded candidate links and one bounded mesh scan' };
    const effectIDs=new WeakMap(), contextIDs=new WeakMap(), unobserved=new WeakSet(), materialIDs=new WeakMap();
    const meshIDs=new WeakMap(), generatorIDs=new WeakMap(),shadowIDs=new WeakMap(),pendingModules=new Set(), finalModules=new Set(), candidates=[[],[],[]], cachedEffects=[[],[],[]],linkedModules=new Set();
    let candidateCount=0;
    const overflow=()=>{issues.overflow++;issues.mappingOverflow++;};
    for(const job of jobs) { if(job[1] && job[7]===0) pendingModules.add(job[1]); if(job[1] && stages[job[3]]==='submitted-frame') finalModules.add(job[1]); }
    result.pendingModuleCoverage={observed:pendingModules.size,linked:0,unlinked:pendingModules.size};
    let nextContext=0,nextMaterial=0,nextGenerator=0,nextShadow=0;
    const pairFor = effect => {
      if(!object(effect)) return;
      const context=data(effect,'_pipelineContext'), pair=data(context,'stages');
      const vertex=data(data(pair,'vertexStage'),'module'), fragment=data(data(pair,'fragmentStage'),'module');
      const v=object(vertex)?moduleIDs.get(vertex)??0:0, f=object(fragment)?moduleIDs.get(fragment)??0:0;
      if(!v&&!f) { if(!unobserved.has(effect)) { unobserved.add(effect); result.unobservedEffects++; } return; }
      return {context,v,f,priority:pendingModules.has(v)||pendingModules.has(f)?0:finalModules.has(v)||finalModules.has(f)?1:2};
    };
    const effectRow = effect => {
      const existing=object(effect)?effectIDs.get(effect):0; if(existing) return existing;
      const pair=pairFor(effect); if(!pair) return 0;
      if(result.effects.length>=limits.effects) { overflow(); return 0; }
      const {context,v,f}=pair;
      let cid=contextIDs.get(context); if(!cid) { cid=++nextContext; contextIDs.set(context,cid); }
      const id=result.effects.length+1; effectIDs.set(effect,id);
      result.effects.push([id,cid,v,f,bool(data(effect,'_isDisposed')),bool(data(effect,'_isReady'))]); return id;
    };
    const cache=data(engine,'_compiledEffects');
    if(!object(cache) || ![null,Object.prototype].includes(Object.getPrototypeOf(cache))) result.unknownSlots++;
    else for(const key in cache) { if(!Object.hasOwn(cache,key)) continue; if(result.cacheEntries>=limits.meshScan) { overflow(); break; }
      result.cacheEntries++; const effect=data(cache,key),pair=pairFor(effect); if(pair) cachedEffects[pair.priority].push(effect); }
    const meshes=data(data(gameRef,'scene'),'meshes');
    if(!Array.isArray(meshes)) { result.unknownSlots++; for(const group of cachedEffects) for(const effect of group) effectRow(effect); return result; }
    result.meshEntries=meshes.length;
    const countInstances = mesh => {
      const instances=data(mesh,'instances'); if(!Array.isArray(instances)) return [null,0,0,0];
      let yes=0,no=0,unknown=0;
      for(let ii=0;ii<instances.length;ii++) {
        const instance=data(instances,ii);
        if(result.instancesScanned>=limits.instanceScan) { overflow(); unknown+=instances.length-yes-no-unknown; break; }
        result.instancesScanned++;
        const visible=data(data(instance,'_nodeDataStorage'),'_isVisible'); if(visible===true) yes++; else if(visible===false) no++; else unknown++;
      }
      return [instances.length,yes,no,unknown];
    };
    const materialFor=(mesh,sub,pass)=>{
      return readMaterialFor(mesh,sub,pass,()=>result.unknownSlots++,()=>result.legacySubMaterialSlots++);
    };
    const offer=candidate=>{
      const pair=pairFor(candidate.effect);if(!pair)return;
      const priority=pair.priority;
      if(candidateCount>=linkLimit){
        overflow();let replace=-1;
        for(let tier=candidates.length-1;tier>priority;tier--)if(candidates[tier].length){replace=tier;break;}
        if(replace<0)return;candidates[replace].pop();candidateCount--;
      }
      candidates[priority].push(candidate);candidateCount++;
    };
    const mapGet=(map,key)=>{try{return nativeMapGet.call(map,key);}catch{result.unknownSlots++;}};
    const aliases=wrappers=>{
      const entries=[];if(!Array.isArray(wrappers)){result.unknownSlots++;return entries;}
      let seen=0;for(const key in wrappers){
        if(!Object.hasOwn(wrappers,key)||!/^\d+$/.test(key))continue;
        if(seen++>=32){overflow();break;}entries.push([Number(key),data(wrappers,key)]);
      }return entries;
    };
    const shadowLinks=(mesh,sub,si,material)=>{
      const shadow=data(material,'shadowDepthWrapper');if(!object(shadow))return;
      result.shadowSubMeshLookups++;
      const owner=data(shadow,'_baseMaterial');if(!object(owner))result.unknownSlots++;else if(owner!==material)result.shadowOwnerMismatches++;
      const base=mapGet(data(shadow,'_subMeshToEffect'),sub);
      if(base!==undefined){
        if(!Array.isArray(base)){result.unknownSlots++;}
        else offer({mesh,sub,si,pass:integer(data(base,1))??-1,effect:data(base,0),material,sourceKind:'shadow-original-base',shadow});
      }
      const generators=mapGet(data(data(shadow,'_subMeshToDepthWrapper'),'mm'),sub);
      if(generators===undefined)return;
      let iterator;try{iterator=nativeMapEntries.call(generators);}catch{result.unknownSlots++;return;}
      for(;;){
        let next;try{next=nativeMapNext.call(iterator);}catch{result.unknownSlots++;return;}
        if(next.done)break;
        if(result.shadowEntriesScanned>=limits.meshScan){overflow();break;}result.shadowEntriesScanned++;
        const [generator,entry]=next.value,main=data(entry,'mainDrawWrapper');
        if(!object(entry)||!object(main)){result.unknownSlots++;continue;}
        const grouped=[{wrapper:main,pass:-1,aliasPassIDs:[],sourceKind:'shadow-main'}];
        for(const [pass,wrapper]of aliases(data(entry,'drawWrapper'))){
          if(!object(wrapper))continue;
          let item=grouped.find(row=>row.wrapper===wrapper);
          if(!item){item={wrapper,pass,aliasPassIDs:[],sourceKind:'shadow-pass-alias'};grouped.push(item);}
          if(item.pass<0)item.pass=pass;item.aliasPassIDs.push(pass);
        }
        for(const item of grouped)offer({...item,mesh,sub,si,effect:data(item.wrapper,'effect'),material,shadow,generator});
      }
    };
    for(let mi=0;mi<Math.min(meshes.length,limits.meshScan);mi++) {
      result.meshesScanned++;
      const mesh=data(meshes,mi), subs=data(mesh,'subMeshes'); if(!Array.isArray(subs)) continue;
      if(subs.length>64) overflow();
      for(let si=0;si<Math.min(subs.length,64);si++) {
        const sub=data(subs,si), wrappers=data(sub,'_drawWrappers'), entries=[];
        const override=data(sub,'_mainDrawWrapperOverride'); if(object(override)) entries.push([-1,override]);
        entries.push(...aliases(wrappers));
        const shadowMaterials=new Set([materialFor(mesh,sub,-1)]);
        for(const [pass,wrapper] of entries) {
          const material=materialFor(mesh,sub,pass);shadowMaterials.add(material);
          offer({mesh,sub,si,pass,wrapper,effect:data(wrapper,'effect'),material,sourceKind:pass===-1?'submesh-main':'submesh-pass'});
        }
        const perPass=data(data(mesh,'_internalAbstractMeshDataInfo'),'_materialForRenderPass');
        if(Array.isArray(perPass))for(const [pass]of aliases(perPass))shadowMaterials.add(materialFor(mesh,sub,pass));
        else if(perPass!==undefined&&perPass!==null)result.unknownSlots++;
        for(const material of shadowMaterials)shadowLinks(mesh,sub,si,material);
      }
    }
    if(meshes.length>limits.meshScan) overflow();
    for(const group of candidates) for(const {mesh,sub,si,pass,wrapper,effect,material,sourceKind,shadow,generator,aliasPassIDs} of group) {
          let meshID=meshIDs.get(mesh)??0;
          if(!meshID) {
            if(result.meshes.length>=meshLimit) { overflow(); continue; }
            meshID=result.meshes.length+1; meshIDs.set(mesh,meshID); const counts=countInstances(mesh);
            const local=data(mesh,'_nodeDataStorage'), name=technicalName(data(mesh,'name')); if(name===null) result.redactedNames++;
            result.meshes.push({ id:meshID,name,regularInstances:counts[0],localVisibleInstances:counts[1],localHiddenInstances:counts[2],unknownInstances:counts[3],
              localVisible:bool(data(local,'_isVisible')),localEnabled:bool(data(local,'_isEnabled')),parentEnabled:bool(data(local,'_isParentEnabled')),
              thinInstances:integer(data(data(mesh,'_thinInstanceDataStorage'),'instancesCount')) });
          }
          const eid=effectRow(effect); if(!eid) continue;
          let materialID=0; if(object(material)) {
            materialID=materialIDs.get(material)??0;
            if(!materialID) { materialID=++nextMaterial; materialIDs.set(material,materialID); }
          }
          const storage=data(mesh,'_instanceDataStorage'), per=data(storage,'useMonoDataStorageRenderPass')===true ? data(storage,'dataStorageRenderPass') : data(data(storage,'renderPasses'),pass);
          const batch=(data(storage,'isFrozen')===true ? data(per,'previousBatch') : undefined) ?? data(per,'batchCache');
          const visible=data(data(batch,'visibleInstances'),data(sub,'_id')??si);
          const visibleCount=visible===null ? null : Array.isArray(visible)?visible.length:-1;
          let generatorID=0,shadowWrapperID=0;
          if(object(generator)){generatorID=generatorIDs.get(generator)??0;if(!generatorID){generatorID=++nextGenerator;generatorIDs.set(generator,generatorID);}}
          if(object(shadow)){shadowWrapperID=shadowIDs.get(shadow)??0;if(!shadowWrapperID){shadowWrapperID=++nextShadow;shadowIDs.set(shadow,shadowWrapperID);}}
          const pair=pairFor(effect);if(pair){if(pair.v)linkedModules.add(pair.v);if(pair.f)linkedModules.add(pair.f);}
          result.links.push({ meshID,subMeshIndex:si,passID:pass,effectID:eid,materialID,materialName:technicalName(data(material,'name')),sourceKind,
            ...(shadow?{shadowWrapperID,generatorID,aliasPassIDs:aliasPassIDs??[],shadowDisposed:bool(data(shadow,'_depthDisposed')),shadowOwnerMatches:object(data(shadow,'_baseMaterial'))?Number(data(shadow,'_baseMaterial')===material):-1}:{}),
            previouslyUsingInstances:bool(data(wrapper,'_wasPreviouslyUsingInstances')),cachedVisibleBatchCount:visibleCount,
            cachedHardwareInstancing:bool(data(data(batch,'hardwareInstancedRendering'),data(sub,'_id')??si)) });
    }
    for(const group of cachedEffects) for(const effect of group) effectRow(effect);
    result.pendingModuleCoverage={observed:pendingModules.size,linked:[...pendingModules].filter(id=>linkedModules.has(id)).length};
    result.pendingModuleCoverage.unlinked=result.pendingModuleCoverage.observed-result.pendingModuleCoverage.linked;
    return result;
  }
  const restore = hook => { try {
    if(Object.getOwnPropertyDescriptor(hook.target,hook.name)?.value!==hook.wrapper) { issues.restoreConflicts++; return; }
    if(hook.own) Object.defineProperty(hook.target,hook.name,hook.own); else if(!Reflect.deleteProperty(hook.target,hook.name)) issues.restoreFailures++;
  } catch { issues.restoreFailures++; } };
  const onAbort=()=>observer.dispose();
  const observer={
    snapshot() {
      const evidence=sealed ?? { stoppedAtMs:null,mapping:null };
      const installed=Object.values(availability).every(v=>v==='installed');
      const lifetimeEvidence=lifetime?.snapshot()??null;
      return { enabled:true,active,evidenceValid:installed&&Object.values(issues).every(v=>v===0)&&(active||evidence.mapping?.boundedScanComplete===true)&&(!lifetimeEvidence||lifetimeEvidence.evidenceComplete),
        jobTraceComplete:installed&&Object.entries(issues).every(([key,value])=>['overflow','mappingOverflow','mappingErrors'].includes(key)||value===0),
        limits:{...limits},availability:{...availability},issues:{...issues},generation:integer(generation),stages:[...stages],moduleColumns:['moduleID','roleBits','inspectionCalls'],modules:modules.map(row=>[...row]),jobs:jobs.map(row=>[...row]),
        jobColumns:['jobID','moduleID','role','stageID','profileGeneration','startedAtMs','settledAtMs','outcome'],
        roleCodes:{unknown:0,vertex:1,fragment:2,bothModuleRoles:3},flagCodes:{unknown:-1,false:0,true:1},outcomeCodes:{pendingAtStop:0,fulfilled:1,rejected:2,synchronousObserveThrow:3,unsupportedPromise:4},
        stoppedAtMs:evidence.stoppedAtMs,mapping:evidence.mapping?structuredClone(evidence.mapping):null,lifetime:lifetimeEvidence,
        scope:'Observed original validated shader Promise jobs only. IDs are local technical identities. Terminal mapping reads current data slots; last cached batches are not new visibility/readiness evaluation. Missing earlier/retired modules stay unobserved. No shader text/defines/GPU objects, new getCompilationInfo/render/await or whole-scene dump.' };
    },
    dispose() {
      if(!active) return;
      if(profile && (data(profile,'active')!==true || data(profile,'generation')!==generation || data(engine,'_device')!==device)) issues.ownerChanged++;
      active=false;lifetime?.dispose();sealed={stoppedAtMs:readNow(),mapping:null};
      try{sealed.mapping=passiveMapping();}catch{issues.mappingErrors++;}
      if(sealed.mapping) sealed.mapping.boundedScanComplete=sealed.mapping.unknownSlots===0&&issues.mappingOverflow===0;
      safe(()=>signal?.removeEventListener('abort',onAbort));
      for(const hook of hooks.splice(0).reverse()) restore(hook);
      if(registered&&owners.get(profile)===token) owners.delete(profile);
      registered=false; profile=engine=device=gameRef=signal=retired=moduleIDs=undefined;
    },
  };
  const live=()=>{
    try {
      if(!signal?.aborted&&!retired?.()&&data(gameRef,'disposed')!==true&&data(engine,'_isDisposed')!==true&&
        data(profile,'active')===true&&data(profile,'generation')===generation&&data(profile,'engine')===engine&&data(profile,'device')===device&&
        data(engine,'_device')===device&&hooks.every(h=>Object.getOwnPropertyDescriptor(h.target,h.name)?.value===h.wrapper)) return true;
      issues.ownerChanged++;
    } catch { issues.observerErrors++; }
    observer.dispose(); return false;
  };
  const install=(name,wrap)=>{
    const original=method(profile,name),own=Object.getOwnPropertyDescriptor(profile,name);
    if(typeof original!=='function') { availability[name]='unknown-contract'; issues.contract++; return; }
    const wrapper=wrap(original);
    try { Object.defineProperty(profile,name,own?{...own,value:wrapper}:{value:wrapper,configurable:true,writable:true,enumerable:false});
      hooks.push({target:profile,name,own,wrapper}); availability[name]='installed';
    } catch { availability[name]='install-failed'; issues.contract++; }
  };
  try {
    profile=data(game,'compilationProfile'); engine=data(game,'engine'); device=data(engine,'_device'); generation=data(profile,'generation');
    if(signal?.aborted||retired?.()||!object(profile)||!object(engine)||data(engine,'_isWebGPU')!==true||!object(device)||
      data(profile,'active')!==true||!Number.isSafeInteger(generation)||data(profile,'engine')!==engine||data(profile,'device')!==device||
      !object(data(data(profile,'metrics'),'shaderValidation'))) { issues.contract++; observer.dispose(); return observer; }
    if(owners.has(profile)) { issues.contract++; observer.dispose(); return observer; }
    owners.set(profile,token); registered=true;
    install('setStage',original=>function(...args){
      if(!active||!live()) return Reflect.apply(original,this,args);
      if(this!==profile) { issues.unexpectedReceivers++; return Reflect.apply(original,this,args); }
      const result=Reflect.apply(original,this,args); safe(()=>{ currentStage=stage(args[0]);lifetime?.refresh(); }); return result;
    });
    install('inspectShader',original=>function(...args){
      if(!active||!live()) return Reflect.apply(original,this,args);
      if(this!==profile) { issues.unexpectedReceivers++; return Reflect.apply(original,this,args); }
      let info; safe(()=>{ const id=moduleID(args[0]),role=args[1]==='vertex'?1:args[1]==='fragment'?2:0;
        if(!role) issues.unknownRole++; if(id) { modules[id-1][1]|=role; modules[id-1][2]++;if(stages[currentStage]==='submitted-frame')finalModuleIDs.add(id); } info={id,role,pushed:false}; if(stack.length<32) { stack.push(info); info.pushed=true; } else traceOverflow(); });
      try { return Reflect.apply(original,this,args); } finally { if(info?.pushed) stack.pop(); }
    });
    install('observe',original=>function(...args){
      if(!active||!live()||args[1]!=='shaderValidation') return Reflect.apply(original,this,args);
      if(this!==profile) { issues.unexpectedReceivers++; return Reflect.apply(original,this,args); }
      let index=-1; safe(()=>{
        const info=stack.at(-1); if(!info) issues.unmatchedJobs++;
        if(jobs.length>=limits.jobs) { traceOverflow(); return; }
        index=jobs.length; jobs.push([index+1,info?.id??0,info?.role??0,currentStage,args[3]===generation?generation:null,finite(args[4]),null,0]);
        if(args[3]!==generation || args[2]!==data(data(profile,'metrics'),'shaderValidation')) issues.contract++;
      });
      let result;
      try { result=Reflect.apply(original,this,args); }
      catch(error) { if(index>=0&&active) { jobs[index][6]=readNow(); jobs[index][7]=3; } throw error; }
      if(index>=0&&active) safe(()=>{
        const settle=outcome=>{ if(active && live()) { jobs[index][6]=readNow(); jobs[index][7]=outcome; } };
        try { nativeThen.call(args[0],()=>settle(1),()=>settle(2)); }
        catch { issues.unsupportedPromise++; jobs[index][7]=4; }
      });
      return result;
    });
    if(Object.values(availability).some(value=>value!=='installed')) { observer.dispose(); return observer; }
    lifetime=observeShaderLifetime(game,{enabled:true,limits,now:readNow,name:technicalName,valid:()=>active&&live(),stage:()=>stages[currentStage],
      moduleID:module=>object(module)?moduleIDs?.get(module)??0:0,isFinalModule:id=>finalModuleIDs.has(id),finalModules:()=>[...finalModuleIDs]});
    signal?.addEventListener('abort',onAbort,{once:true});
    if(signal?.aborted||retired?.()) observer.dispose();
  } catch { issues.observerErrors++; observer.dispose(); }
  return observer;
}
