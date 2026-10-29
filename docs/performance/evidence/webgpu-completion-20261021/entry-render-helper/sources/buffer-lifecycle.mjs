import { Mesh } from '@babylonjs/core/Meshes/mesh.js';
import { WebGPUBufferManager } from '@babylonjs/core/Engines/WebGPU/webgpuBufferManager.js';
import { BUFFER_LIMITS,BUFFER_EVENTS,bufferTechnicalName,bufferFailureTarget } from './buffer-lifecycle-core.mjs';
const object=v=>v!==null&&(typeof v==='object'||typeof v==='function');
const data=(v,k)=>object(v)?Object.getOwnPropertyDescriptor(v,k)?.value:undefined;
const integer=v=>Number.isSafeInteger(v)&&v>=0?v:null;
const flag=v=>typeof v==='boolean'?Number(v):-1;
const method=(target,key)=>{for(let p=target;object(p);p=Object.getPrototypeOf(p)){
  const d=Object.getOwnPropertyDescriptor(p,key);if(d)return 'value'in d&&typeof d.value==='function'?d.value:undefined;
}};
const nativeUpdate=Mesh.prototype._updateInstancedBuffers;
const managerMethods=['createBuffer','releaseBuffer','destroyDeferredBuffers'];
const managerExpected=Object.fromEntries(managerMethods.map(key=>[key,WebGPUBufferManager.prototype[key]]));
/** Original native methods only. Context/bundle identities are NOT encoded GPU-resource observations. */
export function observeBufferLifecycle(game,options={}){
  if(options.enabled!==true)return undefined;
  let gameRef=game,scene=data(game,'scene'),engine=data(game,'engine'),manager=data(engine,'_bufferManager'),device=data(engine,'_device'),callbacks=options,active=true,sealed,detachAdded;
  const limits={...BUFFER_LIMITS};for(const key of Object.keys(limits))if(Number.isSafeInteger(options.limits?.[key]))limits[key]=Math.max(1,Math.min(limits[key],options.limits[key]));
  const generation=data(data(game,'renderHealth'),'generation'),Weak=options.WeakRef??globalThis.WeakRef;
  const identities=new WeakMap(),dbRecords=new WeakMap(),rawRecords=new WeakMap(),resources=new Map(),owners=new Map(),ownerByID=new Map(),hooks=new Map(),registered=new WeakMap(),meshes=new WeakSet(),scopes=[];
  const events=[],issues={observerErrors:0,unsupported:0,foreign:0,restoreConflicts:0,restoreFailures:0,scopeOverflow:0,hookOverflow:0};
  const history={eventEvictions:0,resourceEvictions:0,ownerEvictions:0,ownerLinkOverflow:0,firstRetainedSequence:1};
  const stats={eligibleMeshes:0,meshRegistrations:0,foreignMeshes:0,unknownMeshMethods:0,instanceCalls:0,instanceThrows:0,allocations:0,unselectedAllocations:0,untrackedReleases:0,untrackedDeferred:0,releases:0,destroyCalls:0,destroyReturned:0,destroyThrows:0,deferredSweeps:0,deferredThrows:0,initialMatrixBuffers:0,replacements:0,sameBundleAcrossReplacement:0};
  const availability={manager:'unavailable',sceneAdded:'unavailable',fatal:'unavailable',dispose:'unavailable',weakCleanup:typeof Weak==='function'?'available':'unavailable'};
  let nextIdentity=0,nextResource=0,nextOwner=0,nextHook=0,sequence=0;
  const now=()=>{try{const n=callbacks?.now?.()??performance.now();if(Number.isFinite(n)&&n>=0)return n;}catch{}issues.observerErrors++;return null;};
  const frame=()=>integer(data(engine,'_frameId'));
  const safe=fn=>{try{return fn();}catch{issues.observerErrors++;}};
  const id=value=>{if(!object(value))return 0;let n=identities.get(value);if(!n){n=++nextIdentity;identities.set(value,n);}return n;};
  const context=()=>{const dc=data(engine,'_currentDrawContext'),material=data(engine,'_currentMaterialContext');
    return {drawContextID:id(dc),bundleID:id(data(dc,'fastBundle')),dirty:flag(data(dc,'_isDirty')),materialDirty:flag(data(material,'isDirty'))};};
  const failureTarget=message=>{
    const direct=bufferFailureTarget(message);if(direct)return{value:direct,source:'handler-argument'};
    const health=data(gameRef,'renderHealth'),errors=data(health,'firstErrors');
    // Game converts the original GPU detail to friendly UI text. recordFault
    // already published at most five own error records before its callback.
    if(Array.isArray(errors))for(let index=Math.min(errors.length,5)-1;index>=0;index--){
      const fault=data(errors,String(index));if(data(fault,'generation')!==generation)continue;
      const value=bufferFailureTarget(data(fault,'message'));if(value)return{value,source:'render-health-first-errors'};
    }
    return{value:null,source:'unavailable'};
  };
  const emit=(event,row,owner,extra={})=>{
    const value=[++sequence,now(),frame(),BUFFER_EVENTS[event],row?.id??0,owner?.id??0,extra.subMeshID??0,extra.passID??-1,
      extra.drawContextID??0,extra.bundleID??0,extra.relatedResourceID??0,extra.refBefore??null,extra.refAfter??null,extra.outcome??-1,extra.dirty??-1,extra.materialDirty??-1];
    if(events.length>=limits.events){const old=events.shift();history.eventEvictions++;const r=resources.get(old[4]);if(r)r.eventsEvicted++;}
    events.push(value);history.firstRetainedSequence=events[0]?.[0]??sequence+1;if(row){row.lastSequence=sequence;row.lastSeenAtMs=value[1];}
  };
  const restore=hookID=>{
    const h=hooks.get(hookID);if(!h)return;hooks.delete(hookID);const target=h.target.deref();if(!target)return;
    registered.get(target)?.delete(h.key);
    try{if(Object.getOwnPropertyDescriptor(target,h.key)?.value!==h.wrapper.deref()){issues.restoreConflicts++;return;}
      if(h.own){const old=h.previous.deref();if(!old){issues.restoreFailures++;return;}Object.defineProperty(target,h.key,{...h.own,value:old});}
      else if(!Reflect.deleteProperty(target,h.key))issues.restoreFailures++;
    }catch{issues.restoreFailures++;}
  };
  const install=(target,key,wrap,expected)=>{
    if(!object(target))return 0;const table=registered.get(target),known=table?.get(key);
    if(known){if(Object.getOwnPropertyDescriptor(target,key)?.value===hooks.get(known)?.wrapper.deref())return known;issues.foreign++;return 0;}
    if(hooks.size>=limits.hooks){issues.hookOverflow++;return 0;}
    const original=method(target,key),own=Object.getOwnPropertyDescriptor(target,key);if(!original||expected&&original!==expected){issues.unsupported++;return 0;}
    const ref=new Weak(target),hookID=++nextHook,wrapper=wrap(original,ref,hookID);
    try{Object.defineProperty(target,key,own?{...own,value:wrapper}:{value:wrapper,configurable:true,writable:true,enumerable:false});
      hooks.set(hookID,{target:ref,key,wrapper:new Weak(wrapper),own:own?{writable:own.writable,configurable:own.configurable,enumerable:own.enumerable}:undefined,previous:own?new Weak(original):undefined});
      let owned=registered.get(target);if(!owned){owned=new Map();registered.set(target,owned);}owned.set(key,hookID);return hookID;
    }catch{issues.unsupported++;return 0;}
  };
  const own=(hookID,receiver)=>{const h=hooks.get(hookID);if(!h||h.target.deref()!==receiver||Object.getOwnPropertyDescriptor(receiver,h.key)?.value!==h.wrapper.deref()){issues.foreign++;return false;}return true;};
  const live=()=>{
    if(!active)return false;
    if(data(engine,'_device')!==device||data(manager,'_device')!==device){close('device-changed');return false;}
    if(data(gameRef,'scene')!==scene||data(scene,'_engine')!==engine||data(gameRef,'disposed')===true||data(engine,'_isDisposed')===true||data(data(gameRef,'renderHealth'),'generation')!==generation||callbacks?.isRetired?.()===true){close('owner-retired');return false;}
    return true;
  };
  const evictResource=()=>{
    let old;for(const r of resources.values())if(!old||r.destroyCalls>0&&old.destroyCalls===0)old=r;
    if(!old)return;resources.delete(old.id);history.resourceEvictions++;if(old.destroyHook)restore(old.destroyHook);
  };
  const trackData=(db,usage,created=false)=>{
    if(!object(db))return;const engineID=integer(data(db,'engineId'));
    if(engineID!==null&&engineID!==integer(data(engine,'uniqueId'))){issues.foreign++;return;}
    const raw=data(db,'_buffer'),dataBufferID=integer(data(db,'uniqueId'));if(!object(raw)||dataBufferID===null){issues.unsupported++;return;}
    const known=dbRecords.get(db);let row=resources.get(known);if(row)return row;
    if(resources.size>=limits.resources)evictResource();
    row={id:++nextResource,engineID,dataBufferID,rawID:id(raw),bytes:integer(data(db,'capacity')),usage:integer(usage),creationObserved:created,createdAtMs:created?now():null,
      firstSeenFrame:frame(),lastSeenAtMs:now(),lastRefs:integer(data(db,'references')),ownerIDs:[],matrixRoles:[],releases:0,queuedFrame:null,destroyCalls:0,destroyReturned:0,destroyThrows:0,destroyFrame:null,
      destroyHook:0,destroyHookAvailable:false,eventsEvicted:0,ownerRecordsEvicted:0,lastSequence:0,reintroduced:known!==undefined};
    resources.set(row.id,row);dbRecords.set(db,row.id);rawRecords.set(raw,row.id);
    row.destroyHook=install(raw,'destroy',(original,ref,hookID)=>function(...args){
      if(!safe(()=>live()&&own(hookID,this)))return Reflect.apply(original,this,args);
      const r=resources.get(row.id);if(r){r.destroyCalls++;r.destroyFrame=frame();stats.destroyCalls++;safe(()=>emit('destroyBefore',r));}
      try{const result=Reflect.apply(original,this,args);if(active&&r){r.destroyReturned++;stats.destroyReturned++;safe(()=>emit('destroyReturned',r));}return result;}
      catch(error){if(active&&r){r.destroyThrows++;stats.destroyThrows++;safe(()=>emit('destroyThrew',r));}throw error;}
    });row.destroyHookAvailable=!!row.destroyHook;
    if(created)emit('allocation',row);return row;
  };
  const rowFor=value=>resources.get(dbRecords.get(value)??rawRecords.get(value));
  const ownerFor=(mesh,sub,pass,role)=>{
    const key=[id(mesh),pass,role].join(':');let owner=owners.get(key);if(owner)return owner;
    if(owners.size>=limits.owners){const oldest=owners.keys().next().value;ownerByID.delete(owners.get(oldest).id);owners.delete(oldest);history.ownerEvictions++;}
    owner={id:++nextOwner,meshID:id(mesh),meshUniqueID:integer(data(mesh,'uniqueId')),meshName:bufferTechnicalName(data(mesh,'name')),passID:pass,role,
      lastSubMeshID:id(sub),subMeshIndex:integer(data(sub,'_id'))};owners.set(key,owner);ownerByID.set(owner.id,owner);return owner;
  };
  const matrixState=(mesh,sub,batch,phase)=>{
    const storage=data(batch,'parent'),pass=integer(data(engine,'currentRenderPassId'))??-1,c=context();
    const result={...c,passID:pass,subMeshID:id(sub),roles:[]};
    for(const [role,key]of [[1,'instancesBuffer'],[2,'instancesPreviousBuffer']]){
      const db=data(data(storage,key),'_buffer');let row=object(db)?trackData(db,undefined):undefined;
      const owner=row?ownerFor(mesh,sub,pass,role):undefined;
      if(row&&owner){
        if(row.ownerIDs.some(key=>!ownerByID.has(key))){const retained=row.ownerIDs.filter(key=>ownerByID.has(key));row.ownerRecordsEvicted+=row.ownerIDs.length-retained.length;row.ownerIDs=retained;}
        if(!row.ownerIDs.includes(owner.id)){if(row.ownerIDs.length<limits.ownerLinks)row.ownerIDs.push(owner.id);else history.ownerLinkOverflow++;}
        if(!row.matrixRoles.includes(role))row.matrixRoles.push(role);
        owner.lastSubMeshID=id(sub);owner.subMeshIndex=integer(data(sub,'_id'));row.lastRefs=integer(data(db,'references'));
        row.lastMatrixFrame=frame();row.lastDrawContextID=c.drawContextID;row.lastBundleID=c.bundleID;
        if(owner.lastResourceID!==row.id||owner.lastDrawContextID!==c.drawContextID||owner.lastBundleID!==c.bundleID){
          emit(phase,row,owner,{...c,passID:pass,subMeshID:id(sub)});
          owner.lastResourceID=row.id;owner.lastDrawContextID=c.drawContextID;owner.lastBundleID=c.bundleID;
        }
      }
      result.roles.push({rowID:row?.id??0,ownerID:owner?.id??0});
    }return result;
  };
  const registerMesh=mesh=>{
    if(!(mesh instanceof Mesh)||data(mesh,'_scene')!==scene){stats.foreignMeshes++;return;}
    if(meshes.has(mesh))return;meshes.add(mesh);stats.eligibleMeshes++;
    if(stats.meshRegistrations>=limits.meshHooks){issues.hookOverflow++;return;}
    if(method(mesh,'_updateInstancedBuffers')!==nativeUpdate){stats.unknownMeshMethods++;return;}
    if(install(mesh,'_updateInstancedBuffers',(original,ref,hookID)=>function(...args){
      if(!safe(()=>live()&&this===ref.deref()&&own(hookID,this)&&data(this,'_scene')===scene))return Reflect.apply(original,this,args);
      if(scopes.length>=limits.scope){issues.scopeOverflow++;return Reflect.apply(original,this,args);}
      const before=safe(()=>matrixState(this,args[0],args[1],'matrixBefore'));scopes.push(before);stats.instanceCalls++;
      try{return Reflect.apply(original,this,args);}catch(error){stats.instanceThrows++;throw error;}
      finally{
        if(active)safe(()=>{const after=matrixState(this,args[0],args[1],'matrixAfter');
          for(let index=0;index<after.roles.length;index++){
            const a=before?.roles[index],b=after.roles[index],row=resources.get(b.rowID),owner=ownerByID.get(b.ownerID);
            if(a?.rowID!==b.rowID){if(!a?.rowID&&b.rowID)stats.initialMatrixBuffers++;else stats.replacements++;
              const same=!!a?.rowID&&!!b.rowID&&!!before?.bundleID&&before.bundleID===after.bundleID&&before.drawContextID===after.drawContextID;if(same)stats.sameBundleAcrossReplacement++;
              emit('replacement',row,owner,{...after,relatedResourceID:a?.rowID??0,outcome:Number(same)});
            }
            if(row){row.lastDrawContextID=after.drawContextID;row.lastBundleID=after.bundleID;}
          }
        });scopes.pop();
      }
    },nativeUpdate))stats.meshRegistrations++;
  };
  const snapshot=()=>{
    if(sealed?.trace)return structuredClone(sealed.trace);
    const target=sealed?.target??null,row=target&&[...resources.values()].find(r=>r.dataBufferID===target.dataBufferID&&r.engineID===target.engineID);
    const ownerRows=[...owners.values()].map(o=>({...o}));
    const exportRows=[...resources.values()].map(({destroyHook,...r})=>({...r,ownerIDs:[...r.ownerIDs],matrixRoles:[...r.matrixRoles]}));
    return {schemaVersion:1,enabled:true,active,reason:sealed?.reason??null,atMs:sealed?sealed.atMs:now(),limits:{...limits},availability:{...availability},issues:{...issues},history:{...history},stats:{...stats},
      coverage:{selection:'Observed native regular matrix buffers at any size plus manager-created2048B Vertex|Storage candidates; generic owner unknown',encodedResourcesObserved:false,wholeSessionHistory:false,
        resourceRows:resources.size,ownerRows:owners.size,creationBeforeInstallMayBeMissing:true},
      targetSource:sealed?.targetSource??null,target:target?{...target,retained:!!row,resourceID:row?.id??null,ownerObserved:!!row?.matrixRoles.length,ownerRecordsRetained:row?!row.ownerRecordsEvicted&&row.ownerIDs.every(key=>ownerRows.some(o=>o.id===key)):false,
        actualDestroyCallObserved:!!row?.destroyCalls,retainedEventsComplete:!!row&&!row.eventsEvicted&&!row.reintroduced}:null,
      resources:exportRows,owners:ownerRows,eventCodes:{...BUFFER_EVENTS},
      eventColumns:['sequence','atMs','frame','event','resourceID','ownerID','subMeshID','passID','drawContextID','bundleID','relatedResourceID','refBefore','refAfter','outcome','drawContextDirty','materialDirty'],events:events.map(row=>[...row]),
      roleCodes:{currentMatrix:1,previousMatrix:2},scope:'Actual identities and native storage ownership only. Bundle resource membership unobserved; same bundle after replacement is a discriminator, not encoded-buffer proof.'};
  };
  function close(reason,message){
    if(!active)return;const target=reason==='renderer-failure'?safe(()=>failureTarget(message)):undefined;
    sealed={reason,atMs:safe(now)??null,target:target?.value??null,targetSource:target?.source??'unavailable'};active=false;
    safe(()=>callbacks?.signal?.removeEventListener('abort',aborted));safe(()=>detachAdded?.());detachAdded=undefined;
    for(const key of [...hooks.keys()].reverse())restore(key);scopes.length=0;
    const notify=callbacks?.onTerminal;const trace=safe(snapshot);if(trace)sealed.trace=trace;callbacks=gameRef=engine=scene=manager=device=undefined;
    if(trace&&notify)safe(()=>notify(trace));
  }
  const aborted=()=>close('aborted');
  const observer={snapshot,dispose:reason=>close(reason??'owner-stopped')};
  if(typeof Weak!=='function'){issues.unsupported++;close('unsupported');return observer;}
  try{
    if(callbacks.signal?.aborted){close('aborted');return observer;}
    if(!object(scene)||data(scene,'_engine')!==engine||data(engine,'_isWebGPU')!==true||data(manager,'_engine')!==engine||data(manager,'_device')!==device||!object(device)){
      issues.unsupported++;close('unsupported');return observer;
    }
    const create=install(manager,'createBuffer',(original,ref,hookID)=>function(...args){
      if(!safe(()=>live()&&own(hookID,this)))return Reflect.apply(original,this,args);
      const result=Reflect.apply(original,this,args);if(active)safe(()=>{const usage=integer(args[1]),bytes=integer(data(result,'capacity'));
        if(bytes===2048&&usage!==null&&(usage&32)!==0&&(usage&128)!==0){stats.allocations++;trackData(result,usage,true);}else stats.unselectedAllocations++;
      });return result;
    },managerExpected.createBuffer);
    const release=install(manager,'releaseBuffer',(original,ref,hookID)=>function(...args){
      if(!safe(()=>live()&&own(hookID,this)))return Reflect.apply(original,this,args);
      const row=rowFor(args[0]),before=integer(data(args[0],'references'));
      const result=Reflect.apply(original,this,args);if(active)safe(()=>{if(row){stats.releases++;row.releases++;row.lastRefs=integer(data(args[0],'references'));if(result===true)row.queuedFrame=frame();
        emit('release',row,undefined,{refBefore:before,refAfter:row.lastRefs,outcome:flag(result),...(scopes.at(-1)??{})});
      }else stats.untrackedReleases++;});return result;
    },managerExpected.releaseBuffer);
    const deferred=install(manager,'destroyDeferredBuffers',(original,ref,hookID)=>function(...args){
      if(!safe(()=>live()&&own(hookID,this)))return Reflect.apply(original,this,args);
      let selected=0;
      safe(()=>{stats.deferredSweeps++;const list=data(this,'_deferredReleaseBuffers');if(!Array.isArray(list)){issues.unsupported++;return;}
        for(const raw of list){const row=rowFor(raw);if(row){selected++;emit('deferredBefore',row);}else stats.untrackedDeferred++;}
      });
      try{const result=Reflect.apply(original,this,args);if(active&&selected)safe(()=>emit('deferredReturned'));return result;}
      catch(error){if(active)stats.deferredThrows++;throw error;}
    },managerExpected.destroyDeferredBuffers);
    availability.manager=create&&release&&deferred?'installed':'partial';
    availability.fatal=install(gameRef,'handleRendererFailure',(original,ref,hookID)=>function(...args){if(safe(()=>live()&&own(hookID,this)))close('renderer-failure',args[0]);return Reflect.apply(original,this,args);})?'installed':'unavailable';
    availability.dispose=install(gameRef,'dispose',(original,ref,hookID)=>function(...args){if(safe(()=>live()&&own(hookID,this)))close('dispose-before-original');return Reflect.apply(original,this,args);})?'installed':'unavailable';
    const initial=data(scene,'meshes');if(Array.isArray(initial)){for(const mesh of initial.slice(0,limits.meshHooks))safe(()=>registerMesh(mesh));if(initial.length>limits.meshHooks)issues.hookOverflow++;}else issues.unsupported++;
    const added=data(scene,'onNewMeshAddedObservable');if(added&&typeof added.add==='function'){
      const observerAdded=added.add(mesh=>{if(safe(live))safe(()=>registerMesh(mesh));});detachAdded=()=>added.remove(observerAdded);availability.sceneAdded='installed';
    }else issues.unsupported++;
    callbacks.signal?.addEventListener('abort',aborted,{once:true});if(callbacks.signal?.aborted)close('aborted');
  }catch{issues.observerErrors++;close('observer-install-failed');}
  return observer;
}
