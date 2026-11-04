/** QA-only original-call ownership. No Babylon API/readiness/GPU calls. */
const object=value=>value!==null&&(typeof value==='object'||typeof value==='function');
const data=(target,key)=>object(target)?Object.getOwnPropertyDescriptor(target,key)?.value:undefined;
const integer=value=>Number.isSafeInteger(value)&&value>=0?value:null;
const flag=value=>typeof value==='boolean'?Number(value):-1;
const mapEntries=Map.prototype.entries,mapNext=Object.getPrototypeOf(new Map().entries()).next;
function method(target,key){for(let item=target;object(item);item=Object.getPrototypeOf(item)){
  const descriptor=Object.getOwnPropertyDescriptor(item,key);if(descriptor)return 'value'in descriptor&&typeof descriptor.value==='function'?descriptor.value:undefined;
}}
export function readMaterialFor(mesh,sub,pass,onUnknown=()=>{},onLegacy=()=>{}){
  const info=data(mesh,'_internalAbstractMeshDataInfo');
  let material=data(data(info,'_materialForRenderPass'),pass)??data(info,'_material'),materials=data(material,'_subMaterials');
  if(materials===undefined&&object(material)){
    const legacy=Object.getOwnPropertyDescriptor(material,'subMaterials');
    if(legacy&&'value'in legacy){materials=legacy.value;onLegacy();}
    else for(let item=material;object(item);item=Object.getPrototypeOf(item)){
      if(Object.getOwnPropertyDescriptor(item,'subMaterials')){onUnknown();return;}
    }
  }
  if(materials!==undefined){if(!Array.isArray(materials)){onUnknown();return;}material=data(materials,data(sub,'materialIndex'));}
  return material;
}
/** Exact equality IDs retain bounded strings privately; only fixed flags export. */
export function createDepthInputProjection(){
  const strings=new Map();let overflow=0,unavailable=0;
  const flags=new Set(['DEPTHPREPASS','ALPHATEST','INSTANCES','THIN_INSTANCES','NORMAL','UV1','UV2','FOG','NUM_BONE_INFLUENCERS','NUM_MORPH_INFLUENCERS',
    'SM_FLOAT','SM_ESM','SM_DEPTHTEXTURE','SM_USEDISTANCE','SM_SOFTTRANSPARENTSHADOW','SM_NORMALBIAS','SM_DIRECTIONINLIGHTDATA','SM_DEPTHCLAMP',
    ...Array.from({length:4},(_,i)=>['LIGHT','POINTLIGHT','SPOTLIGHT','HEMILIGHT','DIRLIGHT','SHADOW','SHADOWPCF','SHADOWPCSS','SHADOWESM','SHADOWCUBE','SHADOWLOWQUALITY'].map(x=>x+i)).flat()]);
  return{
    project(text){
      if(typeof text!=='string'){unavailable++;return{id:null,chars:null,flags:null};}
      if(text.length>8192){overflow++;return{id:null,chars:text.length,flags:null};}
      let id=strings.get(text);if(!id){if(strings.size>=32){overflow++;return{id:null,chars:text.length,flags:null};}id=strings.size+1;strings.set(text,id);}
      const selected=[];for(const line of text.split('\n')){const match=/^\s*#define\s+(\w+)(?:\s+([^\r\n]*?))?\s*$/.exec(line);if(match&&flags.has(match[1])){const value=match[2]??'';if(value.length<=32&&/^(?:-?\d+(?:\.\d+)?|true|false)?$/.test(value))selected.push([match[1],value]);}}
      return{id,chars:text.length,flags:selected};
    },
    stats:()=>({entries:strings.size,overflow,unavailable,maxEntries:32,maxCodeUnits:8192}),
    clear(){strings.clear();},
  };
}
export function observeShaderLifetime(game,options={}){
  if(options.enabled!==true)return undefined;
  let gameRef=game,engine=data(game,'engine'),scene=data(game,'scene'),callbacks=options,active=true,sealed;
  const limits=options.limits,Weak=options.WeakRef??globalThis.WeakRef;
  const issues={observerErrors:0,overflow:0,unknown:0,foreign:0,restoreConflicts:0,restoreFailures:0,unexpectedReceiver:0};
  const availability={createEffect:'unavailable',releaseEffect:'unavailable',camera:'unavailable',generatorRegistry:'unavailable',weakCleanup:typeof Weak==='function'?'available':'unavailable'};
  const stats={scopedCreateReturns:0,unscopedCreateReturns:0,createWithModules:0,createWithoutModules:0,releaseCalls:0,untrackedReleaseCalls:0,releaseWithoutModules:0,cacheReleaseSame:0,cacheReleaseOther:0,cacheReleaseMissing:0,cacheReleaseUnknown:0,bridgeInstalled:0,bridgeBound:0,lateCompiledDisposed:0,generatorRegistrations:0,shadowRegistrations:0,registrationScans:0};
  const hooks=new Map(),registered=new WeakMap(),effectRecords=new WeakMap(),identities=new WeakMap(),contexts=new WeakMap(),scopes=[],rows=new Map(),owners=new Map();
  const criticalHooks=[];
  let nextHook=0,nextEffect=0,nextID=0,nextContext=0,nextOwner=0,nextRow=0, inputRows=0;
  const inputProjection=createDepthInputProjection(),mapGet=Map.prototype.get;
  const get=(map,key)=>{try{return mapGet.call(map,key);}catch{return undefined;}};
  const now=()=>{const value=callbacks?.now?.();return Number.isFinite(value)?value:null;};
  const safe=fn=>{try{return fn();}catch{issues.observerErrors++;}};
  const live=()=>{if(!active)return false;try{
    if(callbacks?.valid?.()!==false){for(const id of criticalHooks){const hook=hooks.get(id),target=hook?.ref.deref();
      if(!target||Object.getOwnPropertyDescriptor(target,hook.key)?.value!==hook.wrapperRef.deref()){issues.foreign++;observer.dispose();return false;}}
      return true;}
  }catch{issues.observerErrors++;}observer.dispose();return false;};
  const identity=value=>{if(!object(value))return 0;let id=identities.get(value);if(!id){id=++nextID;identities.set(value,id);}return id;};
  const stage=()=>callbacks?.stage?.()==='submitted-frame'?0:1;
  const readFlags=effect=>{const text=data(effect,'defines');if(typeof text!=='string'||text.length>limits.meshScan)return[-1,-1];
    return ['INSTANCES','THIN_INSTANCES'].map(name=>Number(new RegExp('(?:^|\\n)\\s*#define\\s+'+name+'(?:\\s|$)').test(text)));
  };
  const restore=id=>{
    const hook=hooks.get(id);if(!hook)return;hooks.delete(id);
    const target=hook.ref.deref();if(!target)return;
    registered.get(target)?.delete(hook.key);
    try{if(Object.getOwnPropertyDescriptor(target,hook.key)?.value!==hook.wrapperRef.deref()){issues.restoreConflicts++;return;}
      if(hook.own){const previous=hook.previous.deref();if(!previous){issues.restoreFailures++;return;}Object.defineProperty(target,hook.key,{...hook.own,value:previous});}
      else if(!Reflect.deleteProperty(target,hook.key))issues.restoreFailures++;
    }catch{issues.restoreFailures++;}
  };
  const owned=(id,receiver)=>{
    const hook=hooks.get(id);if(!hook||hook.ref.deref()!==receiver||Object.getOwnPropertyDescriptor(receiver,hook.key)?.value!==hook.wrapperRef.deref()){issues.foreign++;return false;}return true;
  };
  const install=(target,key,wrap)=>{
    if(!object(target))return 0;
    const existing=registered.get(target)?.get(key);if(existing){
      if(Object.getOwnPropertyDescriptor(target,key)?.value===hooks.get(existing)?.wrapperRef.deref())return existing;
      issues.foreign++;return 0;
    }
    if(hooks.size>=limits.effects){issues.overflow++;return 0;}
    const original=method(target,key),own=Object.getOwnPropertyDescriptor(target,key);if(!original){issues.unknown++;return 0;}
    const ref=new Weak(target),id=++nextHook,wrapper=wrap(original,ref,id);
    try{Object.defineProperty(target,key,own?{...own,value:wrapper}:{value:wrapper,configurable:true,writable:true,enumerable:false});
      hooks.set(id,{ref,key,own:own?{configurable:own.configurable,enumerable:own.enumerable,writable:own.writable}:undefined,
        previous:own?new Weak(original):undefined,wrapperRef:new Weak(wrapper)});
      let table=registered.get(target);if(!table){table=new Map();registered.set(target,table);}table.set(key,id);return id;
    }catch{issues.unknown++;return 0;}
  };
  const dropRow=id=>{
    const row=rows.get(id);if(!row)return;rows.delete(id);
    const owner=owners.get(row.ownerKey);owner?.rows.delete(id);if(owner?.rows.size===0)owners.delete(row.ownerKey);
    const effect=row.ref.deref(),record=effect&&effectRecords.get(effect);record?.rows.delete(id);
    if(record?.rows.size===0&&record.bridge){restore(record.bridge);record.bridge=0;}
  };
  const victim=collection=>{let selected;for(const item of collection){if(!selected||item.priority>selected.priority)selected=item;}return selected;};
  const metadata=(kind,mesh,sub,material,generator,pass,useInstances)=>{
    const storage=data(mesh,'_instanceDataStorage'),per=data(storage,'useMonoDataStorageRenderPass')===true?data(storage,'dataStorageRenderPass'):data(data(storage,'renderPasses'),pass);
    const batch=(data(storage,'isFrozen')===true?data(per,'previousBatch'):undefined)??data(per,'batchCache');
    const visible=data(data(batch,'visibleInstances'),data(sub,'_id'));
    const [baseInstances,baseThin]=readFlags(data(data(data(sub,'_drawWrappers'),pass),'effect'));
    return {kind,meshID:identity(mesh),subMeshID:identity(sub),materialID:identity(material),generatorID:identity(generator),passID:integer(pass)??-1,useInstances:flag(useInstances),
      meshName:callbacks?.name?.(data(mesh,'name'))??null,materialName:callbacks?.name?.(data(material,'name'))??null,
      regularInstances:Array.isArray(data(mesh,'instances'))?data(mesh,'instances').length:null,thinInstances:integer(data(data(mesh,'_thinInstanceDataStorage'),'instancesCount')),
      cachedVisibleBatchCount:visible===null?null:Array.isArray(visible)?visible.length:-1,baseInstances,baseThin};
  };
  const ownerKey=meta=>[meta.kind,meta.meshID,meta.subMeshID,meta.materialID,meta.generatorID,meta.passID,meta.useInstances].join(':');
  const offer=(effect,record,meta)=>{
    const key=ownerKey(meta),priority=stage();let owner=owners.get(key);
    if(!owner&&owners.size>=limits.meshes){
      const old=victim(owners.values());issues.overflow++;if(!old||old.priority<priority)return;
      for(const id of [...old.rows])dropRow(id);
    }
    owner=owners.get(key);if(!owner){owner={id:++nextOwner,key,meta,priority,rows:new Set()};owners.set(key,owner);}else owner.priority=Math.min(owner.priority,priority);
    for(const id of record.rows){const row=rows.get(id);if(row?.ownerKey===key){row.creates++;row.priority=Math.min(row.priority,priority);return row;}}
    if(rows.size>=limits.links){const old=victim(rows.values());issues.overflow++;if(!old||old.priority<priority){if(!owner.rows.size)owners.delete(key);return;}
      dropRow(old.id);if(!owners.has(key))owners.set(key,owner);
    }
    const programInputs=meta.programInputs?(inputRows++<8?meta.programInputs:(issues.overflow++,null)):null;
    const row={programInputs,releaseScope:null,id:++nextRow,ownerKey:key,ownerID:owner.id,effectID:record.id,ref:new Weak(effect),priority,creates:1,createdAtMs:now(),contextID:0,vertexModuleID:0,fragmentModuleID:0,lastBindAtMs:null,bindKind:null,releases:0,releasedAtMs:null,disposedAtBind:-1,instances:-1,thin:-1,releaseCacheIdentity:-1,releasedRefCount:null};
    rows.set(row.id,row);owner.rows.add(row.id);record.rows.add(row.id);return row;
  };
  const bind=(effect,record,context,kind)=>{
    const pair=data(context,'stages'),v=callbacks?.moduleID?.(data(data(pair,'vertexStage'),'module'))??0,f=callbacks?.moduleID?.(data(data(pair,'fragmentStage'),'module'))??0;
    if(!v&&!f)return false;
    let contextID=contexts.get(context);if(!contextID){if(nextContext>=limits.effects){issues.overflow++;return false;}contextID=++nextContext;contexts.set(context,contextID);}
    const [instances,thin]=readFlags(effect),disposed=flag(data(effect,'_isDisposed'));
    for(const id of record.rows){const row=rows.get(id);if(!row)continue;
      Object.assign(row,{contextID,vertexModuleID:v,fragmentModuleID:f,lastBindAtMs:now(),bindKind:kind,disposedAtBind:disposed,instances,thin});
      if(callbacks?.isFinalModule?.(v)||callbacks?.isFinalModule?.(f)){row.priority=0;const owner=owners.get(row.ownerKey);if(owner)owner.priority=0;}
    }
    if(kind==='compiled'&&v&&f){stats.bridgeBound++;if(disposed===1)stats.lateCompiledDisposed++;}
    return !!(v&&f);
  };
  const bridge=(effect,record)=>{
    if(record.bridge||!record.rows.size)return;
    record.bridge=install(effect,'_onRenderingStateCompiled',(original,ref,id)=>function(...args){
      if(live())safe(()=>{if(this===ref.deref()&&owned(id,this)&&bind(this,record,args[0],'compiled')){restore(id);record.bridge=0;}});
      return Reflect.apply(original,this,args);
    });
    if(record.bridge)stats.bridgeInstalled++;else issues.unknown++;
    effect=undefined;
  };
  const track=(effect,meta)=>{
    const {readInputs,...plain}=meta;
    if(readInputs)plain.programInputs=safe(()=>readInputs());
    meta=plain;
    if(!object(effect)){issues.unknown++;return;}
    let record=effectRecords.get(effect);if(!record){if(nextEffect>=limits.effects){issues.overflow++;return;}record={id:++nextEffect,rows:new Set(),bridge:0};effectRecords.set(effect,record);}
    const row=offer(effect,record,meta);if(!row)return;
    if(bind(effect,record,data(effect,'_pipelineContext'),'create'))stats.createWithModules++;
    else{stats.createWithoutModules++;bridge(effect,record);}
  };
  const scope=(meta,original,receiver,args)=>{
    if(scopes.length>=32){issues.overflow++;return Reflect.apply(original,receiver,args);}
    scopes.push(meta);try{return Reflect.apply(original,receiver,args);}finally{scopes.pop();}
  };
  const shadowScope=(shadow,sub,generator,pass,useInstances,kind)=>{
    const mesh=data(sub,'_renderingMesh')??data(sub,'_mesh'),material=data(shadow,'_baseMaterial')??readMaterialFor(mesh,sub,pass,()=>issues.unknown++);
    return metadata(kind,mesh,sub,material,generator,pass,useInstances);
  };
  const registerShadow=shadow=>{
    if(!object(shadow)||data(shadow,'_scene')!==scene)return;
    const existed=registered.get(shadow)?.has('_makeEffect');
    const installed=install(shadow,'_makeEffect',(original,ref,id)=>function(...args){
      if(!live()||!safe(()=>this===ref.deref()&&owned(id,this)))return Reflect.apply(original,this,args);
      const outer=scopes.at(-1),meta=safe(()=>shadowScope(this,args[0],args[2],args[3],outer?.useInstances===0?false:outer?.useInstances===1?true:undefined,'shadow-derived'));
      if(meta&&meta.meshName==='tree__ipr-crown-047__lod0__leaves')meta.readInputs=()=>{
        const pair=get(data(this,'_subMeshToEffect'),args[0]),base=data(pair,0),sub=args[0],material=data(this,'_baseMaterial');
        const entries=get(data(data(this,'_subMeshToDepthWrapper'),'mm'),sub),entry=get(entries,args[2]);
        const values=args[1];let incoming;
        if(Array.isArray(values)&&values.length<=256){const lines=[];for(let i=0;i<values.length;i++){const value=data(values,i);if(typeof value!=='string')break;lines.push(value);}if(lines.length===values.length)incoming=lines.join('\n');}
        const generator=args[2],light=data(generator,'_light'),lightMeta=data(light,'metadata');
        const wrapper=data(data(sub,'_drawWrappers'),args[3]),defines=data(wrapper,'defines');
        return{originalEffectID:identity(base),originalContextID:identity(data(base,'_pipelineContext')),originalPassID:integer(data(pair,1)),originalReady:flag(data(base,'_isReady')),originalDisposed:flag(data(base,'_isDisposed')),
          entryID:identity(entry),previousDepthEffectID:identity(data(data(entry,'mainDrawWrapper'),'effect')),originalDefines:inputProjection.project(data(base,'defines')),incomingDepthDefines:inputProjection.project(incoming),previousDepthDefines:inputProjection.project(data(entry,'depthDefines')),
          generatorOwner:{simulatedVehicleLight:flag(data(lightMeta,'simulatedVehicleLight')),localFlashlight:flag(data(lightMeta,'localFlashlight')),filter:integer(data(generator,'_filter'))},
          colorWrite:flag(data(engine,'_colorWrite')),sceneRenderID:integer(data(scene,'_renderId')),subDefinesRenderID:integer(data(defines,'_renderId')),subAreLightsDirty:flag(data(defines,'_areLightsDirty')),materialHotSwapping:flag(data(material,'_hotSwapping'))};
      };
      return meta?scope(meta,original,this,args):Reflect.apply(original,this,args);
    });if(installed&&!existed)stats.shadowRegistrations++;
  };
  const registerGenerator=generator=>{
    if(!object(generator)||data(generator,'_scene')!==scene)return;
    const existed=registered.get(generator)?.has('isReady');
    const installed=install(generator,'isReady',(original,ref,id)=>function(...args){
      if(!live()||!safe(()=>this===ref.deref()&&owned(id,this)))return Reflect.apply(original,this,args);
      const meta=safe(()=>{const pass=data(engine,'currentRenderPassId');
        const sub=args[0],mesh=data(sub,'_renderingMesh')??data(sub,'_mesh'),material=readMaterialFor(mesh,sub,pass,()=>issues.unknown++);
        registerShadow(data(material,'shadowDepthWrapper'));return metadata('shadow-base',mesh,sub,material,this,pass,args[1]);});
      return meta?scope(meta,original,this,args):Reflect.apply(original,this,args);
    });if(installed&&!existed)stats.generatorRegistrations++;
  };
  const observer={
    refresh(){
      if(!live())return;
      safe(()=>{stats.registrationScans++;const lights=data(scene,'lights');
        if(!Array.isArray(lights)){availability.generatorRegistry='unknown';issues.unknown++;return;}
        availability.generatorRegistry='available';let entries=0;
        if(lights.length>limits.meshScan)issues.overflow++;
        for(let index=0;index<Math.min(lights.length,limits.meshScan);index++){
          const map=data(data(lights,index),'_shadowGenerators');if(map===null||map===undefined)continue;
          let iterator;try{iterator=mapEntries.call(map);}catch{issues.unknown++;continue;}
          for(;;){const next=mapNext.call(iterator);if(next.done)break;if(entries++>=limits.meshScan){issues.overflow++;return;}registerGenerator(next.value[1]);}
        }
      });
    },
    ownerCount:()=>owners.size,linkCount:()=>rows.size,
    snapshot(){
      const target=sealed?.target??callbacks?.finalModules?.()??[],linked=new Set();
      for(const row of rows.values()){if(row.vertexModuleID)linked.add(row.vertexModuleID);if(row.fragmentModuleID)linked.add(row.fragmentModuleID);}
      const coverage={finalModules:target.length,linkedFinalModules:target.filter(id=>linked.has(id)).length,unresolvedOwnerLinks:[...rows.values()].filter(row=>!row.vertexModuleID||!row.fragmentModuleID).length};coverage.unlinkedFinalModules=coverage.finalModules-coverage.linkedFinalModules;
      return {enabled:true,active,evidenceComplete:Object.values(availability).every(value=>value==='installed'||value==='available')&&Object.values(issues).every(value=>value===0)&&coverage.unlinkedFinalModules===0&&coverage.unresolvedOwnerLinks===0&&stats.unscopedCreateReturns===0,
        availability:{...availability},issues:{...issues},stats:{...stats},coverage,
        limits:{owners:limits.meshes,links:limits.links,effectIdentities:limits.effects,weakHooks:limits.effects,registrationEntries:limits.meshScan,defineCodeUnits:limits.meshScan},
        owners:[...owners.values()].map(owner=>{const {programInputs,...meta}=owner.meta;return{id:owner.id,...meta};}),
        depthInputProjection:sealed?.depthInputProjection??inputProjection.stats(),
        programInputs:[...rows.values()].filter(row=>row.programInputs).map(row=>({effectID:row.effectID,vertexModuleID:row.vertexModuleID,fragmentModuleID:row.fragmentModuleID,releaseScope:row.releaseScope,...row.programInputs})),
        releaseCacheIdentityCodes:{unknown:-1,missingOrFalsy:0,sameEffect:1,otherTruthyEntry:2},
        linkColumns:['ownerID','effectID','contextID','vertexModuleID','fragmentModuleID','createdAtMs','lastBindAtMs','bindKind','creates','releases','releasedAtMs','disposedAtBind','instances','thin','releaseCacheIdentity','releasedRefCount'],
        links:[...rows.values()].map(row=>[row.ownerID,row.effectID,row.contextID,row.vertexModuleID,row.fragmentModuleID,row.createdAtMs,row.lastBindAtMs,row.bindKind,row.creates,row.releases,row.releasedAtMs,row.disposedAtBind,row.instances,row.thin,row.releaseCacheIdentity,row.releasedRefCount]),
        scope:'Original scoped calls only; shared owner/link budgets with terminal map. Unknown contexts are not absent owners. Effect/context IDs local to lifetime. No strong Effect/resource retention, new Promise/await/GPU/readiness calls, source/defines exports or frame snapshots.'};
    },
    dispose(){if(!active)return;sealed={target:safe(()=>callbacks?.finalModules?.())??[],depthInputProjection:inputProjection.stats()};inputProjection.clear();active=false;
      for(const id of [...hooks.keys()].reverse())restore(id);
      scopes.length=0;gameRef=engine=scene=callbacks=undefined;
    },
  };
  if(typeof Weak!=='function'){issues.unknown++;observer.dispose();return observer;}
  safe(()=>{
    const createHook=install(engine,'createEffect',(original,ref)=>function(...args){
      if(!live())return Reflect.apply(original,this,args);
      const result=Reflect.apply(original,this,args);
      if(!active||!live())return result;
      if(this!==ref.deref()){issues.unexpectedReceiver++;return result;}
      const meta=scopes.at(-1);if(meta){stats.scopedCreateReturns++;safe(()=>track(result,meta.kind==='camera'
        ?{...meta,passID:integer(data(engine,'currentRenderPassId'))??-1}:meta));}else stats.unscopedCreateReturns++;
      return result;
    });availability.createEffect=createHook?'installed':'unavailable';if(createHook)criticalHooks.push(createHook);
    const releaseHook=install(engine,'_releaseEffect',(original,ref)=>function(...args){
      if(live()&&this===ref.deref())safe(()=>{const effect=args[0],record=effectRecords.get(effect),key=data(effect,'_key'),cache=data(engine,'_compiledEffects');
        let cacheCode=-1;if(typeof key==='string'&&object(cache)){const slot=Object.getOwnPropertyDescriptor(cache,key);
          if(!slot)cacheCode=0;else if('value'in slot)cacheCode=!slot.value?0:slot.value===effect?1:2;}
        stats[['cacheReleaseMissing','cacheReleaseSame','cacheReleaseOther'][cacheCode]??'cacheReleaseUnknown']++;
        if(record){stats.releaseCalls++;
        if(!bind(args[0],record,data(args[0],'_pipelineContext'),'release'))stats.releaseWithoutModules++;
        for(const id of record.rows){const row=rows.get(id);if(row){row.releaseScope=scopes.at(-1)?.kind??null;row.releases++;row.releasedAtMs=now();row.releaseCacheIdentity=cacheCode;row.releasedRefCount=integer(data(effect,'_refCount'));}}
      }else stats.untrackedReleaseCalls++;});
      return Reflect.apply(original,this,args);
    });availability.releaseEffect=releaseHook?'installed':'unavailable';if(releaseHook)criticalHooks.push(releaseHook);
    const cameraHook=install(gameRef,'isMeshReadyForCamera',(original,ref)=>function(...args){
      if(!live()||this!==ref.deref())return Reflect.apply(original,this,args);
      const meta=safe(()=>metadata('camera',args[0],undefined,undefined,undefined,data(engine,'currentRenderPassId'),undefined));
      return meta?scope(meta,original,this,args):Reflect.apply(original,this,args);
    });availability.camera=cameraHook?'installed':'unavailable';if(cameraHook)criticalHooks.push(cameraHook);
    observer.refresh();
  });
  return observer;
}
