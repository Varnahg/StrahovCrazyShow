/** Explicit post-ready diagnostics; only primitive compiler inputs leave this hook. */
export const PIPELINE_INPUT_LIMITS = Object.freeze({ milliseconds: 30000, calls: 32, callBytes: 512 * 1024, totalBytes: 4 * 1024 * 1024, windows: 4, flags: 128 });
export const PIPELINE_INPUT_SCOPE = 'Original post-ready compiler inputs and positive exact PBR-caller/current-local-shadow-slot context links only. Hashes/fixed roles, no raw names or inferred draw/source ownership. Settlement wall latency is not GPU time.';
export const PIPELINE_OWNER_LIMITS = Object.freeze({ callers:4096,links:64,localMeshes:128,subMeshes:32,passes:4,nameChars:512,nameBytes:262144,identities:32768,counter:1000000 });
const NativePromise = Promise, nativeThen = Promise.prototype.then, species = Object.getOwnPropertyDescriptor(Promise, Symbol.species);
const owners = new WeakMap(), pbrOwners=new WeakMap(), attempts = new WeakMap(), encoder = new TextEncoder();
const object = value => value !== null && (typeof value === 'object' || typeof value === 'function');
const data = (value, key) => object(value) ? Object.getOwnPropertyDescriptor(value, key)?.value : undefined;
const descriptor = (value, key) => { for (let item = value; object(item); item = Object.getPrototypeOf(item)) { const d = Object.getOwnPropertyDescriptor(item, key); if (d) return d; } };
const same = (a,b) => !!a === !!b && (!a || ['value','get','set','writable','configurable','enumerable'].every(key => a[key] === b[key]));
function restoreOwned(target,key,installed,previous){try{const current=Object.getOwnPropertyDescriptor(target,key);if(same(current,installed)){Object.defineProperty(target,key,previous);return 0;}return same(current,previous)?0:1;}catch{return 1;}}
const finite = value => typeof value === 'number' && Number.isFinite(value) && value >= 0;
const integer = value => Number.isSafeInteger(value) && value >= 0;
const alive=value=>data(value,'_isDisposed')===false||data(data(value,'_nodeDataStorage'),'_isDisposed')===false;
const bool=value=>typeof value==='boolean'?Number(value):-1;
const ownerRoles=new Set(['unknown','local-skinned-near','local-skinned-medium','local-garment-near','local-garment-medium','b6-interior-detail','b6-exterior-entry','b6-opaque-envelope','b6-other','road-sign-child','skinned-anatomy']);
const ownerStats=()=>({calls:0,nullReturns:0,unsupportedReturns:0,throws:0,stored:0,missingContextAtReturn:0,outsideWindowContextAtReturn:0,omitted:0,collected:0,disposed:0,unregisteredMaterials:0,ambiguousContexts:0,linkOverflow:0,nameLimited:0,nameBytes:0,pendingNames:0,hashErrors:0,errors:0,counterLimited:0});
const nativePromise = value => {
  if (!object(value) || Object.getPrototypeOf(value) !== NativePromise.prototype) return false;
  const constructor = Object.getOwnPropertyDescriptor(value, 'constructor'), current = Object.getOwnPropertyDescriptor(NativePromise, Symbol.species);
  return (!constructor || (Object.hasOwn(constructor,'value') && constructor.value === NativePromise)) && data(NativePromise.prototype,'constructor') === NativePromise && same(current,species);
};
const counters = () => ({ syncThrows:0, rejections:0, unsupportedPromises:0, badArgs:0, callOverflow:0, byteOverflow:0, projectionLimited:0, hashErrors:0, observerErrors:0, foreignCalls:0, restoreConflicts:0 });
const families = new Set(['pbr','default','shadowMap','depth','clearQuad','particles','gpuRenderParticles','color','background','sky','cell','water']);
const allowedFlag = name => typeof name==='string' && /^(?:DEPTHPREPASS|ALPHATEST|INSTANCES|THIN_INSTANCES|NORMAL|TANGENT|UV[12]|FOG|NUM_BONE_INFLUENCERS|NUM_MORPH_INFLUENCERS|LIGHTCOUNT|MAXLIGHTCOUNT|SM_(?:FLOAT|ESM|DEPTHTEXTURE|USEDISTANCE|SOFTTRANSPARENTSHADOW|NORMALBIAS|DIRECTIONINLIGHTDATA|DEPTHCLAMP)|(?:LIGHT|POINTLIGHT|SPOTLIGHT|HEMILIGHT|DIRLIGHT|SHADOW|SHADOWPCF|SHADOWPCSS|SHADOWESM|SHADOWCUBE|SHADOWLOWQUALITY|SHADOWMEDIUMQUALITY)[0-3])$/.test(name);
function family(text, role) {
  const markers = text.matchAll(/^(?:\/\/)?#define SHADER_NAME (vertex|fragment):([^\r\n]+)\r?\n/gm);
  const found=markers.next().value;
  if (!found || found[1] !== role || !markers.next().done) return 'unknown';
  return families.has(found[2]) ? found[2] : /^[a-f\d]{8}-[a-f\d-]{27,}$/i.test(found[2]) ? 'generated-token' : 'other';
}
function flags(text) {
  const result = [], lines = text.split(/\r?\n/); let withheld = 0, truncated = false;
  for (const line of lines) {
    const match = /^\s*#define\s+([A-Z][A-Z0-9_]*)(?:\s+([^\r\n]*?))?\s*$/.exec(line);
    if (!match || !allowedFlag(match[1])) continue;
    const value = match[2] ?? '';
    if (value.length > 32 || !/^(?:-?\d+(?:\.\d+)?|true|false)?$/.test(value)) { withheld++; continue; }
    if (result.length < PIPELINE_INPUT_LIMITS.flags) result.push([match[1],value]); else truncated = true;
  }
  return { flags: result, withheld, truncated };
}
const textRow = (text, bytes) => ({ chars:text.length,bytes:bytes.length,sha256:null });
const hex = bytes => Array.from(new Uint8Array(bytes),byte=>byte.toString(16).padStart(2,'0')).join('');
// The externally retained passthrough and the terminal evidence owner must not
// share an environment containing the original production profile/engine.
function originalHook(original, dispatch) {
  let observer=dispatch;
  return { wrapper:function(){return observer?observer(this,arguments,original):Reflect.apply(original,this,arguments);},retire(){observer=null;} };
}
function utf8Length(text) {
  let bytes=0;
  for(let i=0;i<text.length;i++){const c=text.charCodeAt(i);if(c<128)bytes++;else if(c<2048)bytes+=2;else if(c>=0xd800&&c<=0xdbff&&text.charCodeAt(i+1)>=0xdc00&&text.charCodeAt(i+1)<=0xdfff){bytes+=4;i++;}else bytes+=3;}
  return bytes;
}

/** No hook, timer, expected-class or Game access at all while disabled. */
export function capturePipelineInputs(game, { enabled=false, expected, signal, isCurrent=()=>true,
  now=()=>performance.now(), setTimer=setTimeout, clearTimer=clearTimeout,
  digest=bytes=>crypto.subtle.digest('SHA-256',bytes) } = {}) {
  if (!enabled) return undefined;
  const classes=expected?.classes, methods=expected?.methods;
  if (!classes || !methods || !(game instanceof classes.Game) || !(game.scene instanceof classes.Scene) || !(game.engine instanceof classes.WebGPUEngine)||typeof classes.PBRBaseMaterial!=='function') throw Error('Pipeline input singleton mismatch');
  const state={game,actor:game.actor,scene:game.scene,engine:game.engine,health:game.renderHealth,profile:game.compilationProfile,device:game.engine._device,startup:game.startupAbort,isCurrent,active:true,timer:null,detach:[],wrapper:null};
  let own=Object.getOwnPropertyDescriptor(state.engine,'_preparePipelineContextAsync'), original=own?.value,hook;
  const pbrPrototype=classes.PBRBaseMaterial.prototype;
  let pbrOwn=Object.getOwnPropertyDescriptor(pbrPrototype,'_prepareEffect'),pbrOriginal=pbrOwn?.value,pbrHook,pbrInstalled;
  const generation=data(state.health,'generation'), rendererId=data(state.health,'rendererId'), used=attempts.get(game)??0;
  if (typeof original!=='function' || !Object.hasOwn(own,'value') || (!own.writable&&!own.configurable) || owners.has(state.engine) || used>=4 ||
      descriptor(Object.getPrototypeOf(state.engine),'_preparePipelineContextAsync')?.value!==methods.preparePipeline || descriptor(state.scene,'render')?.value!==methods.render ||
      Object.getOwnPropertyDescriptor(state.profile??{},'inspectShader') || Object.getOwnPropertyDescriptor(state.game.gltfLightBudget??{},'prepareFrame') || !object(state.device) ||
      !integer(generation)||generation<1||!integer(rendererId)||rendererId<1 || data(data(state.profile,'hooks'),'engine._preparePipelineContextAsync')!=='installed'||pbrOriginal!==methods.prepareEffect||typeof pbrOriginal!=='function'||(!pbrOwn.configurable&&!pbrOwn.writable)||pbrOwners.has(pbrPrototype)) throw Error('Pipeline input native method/profile/window ownership');
  const meta={schemaVersion:1,scope:PIPELINE_INPUT_SCOPE,limits:PIPELINE_INPUT_LIMITS,active:true,completed:false,reason:null,windowIndex:used+1,rendererId,generation,
    armedAtMs:null,deadlineAtMs:null,endedAtMs:null,healthAtEnd:null,calls:0,totalInputBytes:0,pendingOriginal:0,pendingHashes:0,counts:counters(),records:[],
    ownership:{schemaVersion:1,limits:PIPELINE_OWNER_LIMITS,complete:false,localStatus:'unavailable',lastProjectionAtMs:null,unlinkedRecords:0,stats:ownerStats()}};
  let lastClock=-Infinity, installed, sealed, installing=true, contexts=new WeakMap(),nextContext=0;
  let contextRows=new WeakMap(),recordContexts=new Map(),callerRows=[],seenCallers=new WeakMap(),ids=new WeakMap(),nextID=0,linkKeys=new Map(),localMembers=new WeakMap(),localRigRef,localBodyRef,localRootRef;
  let resolveDone;const done=new NativePromise(resolve=>{resolveDone=resolve;});
  const owner={done,snapshot:()=>sealed??structuredClone(meta),dispose:why=>stop(why??'disposed')};
  function clock(){try{const at=now();if(finite(at)&&at>=lastClock){lastClock=at;return at;}}catch{}meta.counts.observerErrors++;return null;}
  function current() {
    return state.isCurrent() && state.game.ready===true && !state.game.disposed && !state.game.rendererFailed && !state.scene.isDisposed && !state.engine.isDisposed &&
      state.game.actor===state.actor && state.game.scene===state.scene && state.game.engine===state.engine && state.scene._engine===state.engine && state.engine._device===state.device &&
      state.game.renderHealth===state.health && state.game.compilationProfile===state.profile && data(state.profile,'engine')===state.engine && data(state.profile,'device')===state.device &&
      data(state.profile,'active')===true && data(state.profile,'generation')===generation && data(state.health,'generation')===generation && data(state.health,'rendererId')===rendererId &&
      data(state.health,'phase')==='ready' && data(state.health,'errorCount')===0 && state.game.startupAbort===state.startup && !state.startup?.signal.aborted && !signal?.aborted &&
      !state.game.benchmark && !state.game.preparingRenderQuality && !state.game.startupPresentationLease && descriptor(state.scene,'render')?.value===methods.render &&
      descriptor(Object.getPrototypeOf(state.engine),'_preparePipelineContextAsync')?.value===methods.preparePipeline &&
      (!pbrInstalled||same(Object.getOwnPropertyDescriptor(pbrPrototype,'_prepareEffect'),pbrInstalled))&&
      !Object.getOwnPropertyDescriptor(state.profile,'inspectShader') && !Object.getOwnPropertyDescriptor(state.game.gltfLightBudget??{},'prepareFrame');
  }
  function check(at) {
    if (!state.active) return false;
    try {
      if (at===null) { stop('clock-error',at);return false; }
      if (meta.deadlineAtMs!==null&&at>=meta.deadlineAtMs) { stop('deadline',at);return false; }
      if (!current()) { stop('retired',at);return false; }
      if (installed&&!same(Object.getOwnPropertyDescriptor(state.engine,'_preparePipelineContextAsync'),installed)) { stop('foreign-method',at);return false; }
      return true;
    } catch { meta.counts.observerErrors++;stop('observer-error',at);return false; }
  }
  function seal(){if(!state.active&&!installing&&!sealed){sealed=structuredClone(meta);resolveDone(sealed);}}
  function stop(reason,at) {
    if(!state.active)return;
    if(reason==='deadline'){try{if(!current())reason='retired';}catch{meta.counts.observerErrors++;reason='observer-error';}}
    state.active=false;meta.active=false;meta.reason=reason;meta.endedAtMs=at===undefined?clock():at;
    try{const pending=data(state.health,'pendingByKind'),scalar=value=>integer(value)?value:null;meta.healthAtEnd={errors:scalar(data(state.health,'errorCount')),pendingPreparation:scalar(data(pending,'preparation')),pendingShaderValidation:scalar(data(pending,'shader-validation'))};}catch{meta.counts.observerErrors++;}
    if(installed){meta.counts.restoreConflicts+=restoreOwned(state.engine,'_preparePipelineContextAsync',installed,own);installed=null;}
    if(pbrInstalled){meta.counts.restoreConflicts+=restoreOwned(pbrPrototype,'_prepareEffect',pbrInstalled,pbrOwn);pbrInstalled=null;}
    hook?.retire();hook=null;own=null;original=null;
    pbrHook?.retire();pbrHook=null;pbrOwn=null;pbrOriginal=null;if(pbrOwners.get(pbrPrototype)===owner)pbrOwners.delete(pbrPrototype);
    if(state.timer!==null){try{clearTimer(state.timer);}catch{meta.counts.observerErrors++;}}
    for(const detach of state.detach.splice(0)){try{detach();}catch{meta.counts.observerErrors++;}}
    meta.ownership.unlinkedRecords=meta.records.filter(row=>!row.owners.length).length;
    meta.ownership.complete=!meta.ownership.unlinkedRecords&&!meta.ownership.stats.pendingNames&&!['unsupportedReturns','throws','omitted','collected','disposed','ambiguousContexts','linkOverflow','nameLimited','hashErrors','errors','counterLimited'].some(key=>meta.ownership.stats[key])&&meta.records.every(row=>row.owners.every(link=>Object.values(link.names).every(name=>name===null||!!name.sha256)));
    meta.completed=reason==='deadline'&&meta.endedAtMs>=meta.deadlineAtMs&&meta.healthAtEnd!==null&&Object.values(meta.healthAtEnd).every(value=>value===0)&&!meta.pendingOriginal&&!meta.pendingHashes&&!meta.ownership.stats.pendingNames&&Object.values(meta.counts).every(value=>value===0)&&meta.records.every(row=>row.outcome==='fulfilled'&&Object.values(row.inputs??{}).every(input=>input.sha256!==null));
    if(owners.get(state.engine)===owner)owners.delete(state.engine);
    state.game=state.actor=state.scene=state.engine=state.health=state.profile=state.device=state.startup=state.isCurrent=state.wrapper=null;state.timer=null;contexts=contextRows=recordContexts=callerRows=seenCallers=ids=linkKeys=localMembers=localRigRef=localBodyRef=localRootRef=null;game=null;
    expected=isCurrent=signal=now=digest=setTimer=clearTimer=null;seal();
  }
  function reaction(promise,fulfilled,rejected) {
    if(!nativePromise(promise))return false;
    Reflect.apply(nativeThen,promise,[value=>{try{fulfilled(value);}catch{if(state.active){meta.counts.observerErrors++;stop('observer-error');}}},error=>{try{rejected(error);}catch{if(state.active){meta.counts.observerErrors++;stop('observer-error');}}}]);return true;
  }
  function hash(input,bytes,name=false) {
    if(!state.active)return;
    const counter=name?meta.ownership.stats:meta,key=name?'pendingNames':'pendingHashes',errors=name?meta.ownership.stats:meta.counts;counter[key]++;
    try {
      const promise=digest(bytes);
      if(!reaction(promise,value=>{if(!state.active||!check(clock()))return;counter[key]--;if(!(value instanceof ArrayBuffer)||value.byteLength!==32){errors.hashErrors++;return;}input.sha256=hex(value);},()=>{if(!state.active||!check(clock()))return;counter[key]--;errors.hashErrors++;})&&state.active){counter[key]--;errors.hashErrors++;}
    } catch {if(state.active){counter[key]--;errors.hashErrors++;}}
  }
  function bump(key){const stats=meta.ownership.stats;if(stats[key]<PIPELINE_OWNER_LIMITS.counter)stats[key]++;else stats.counterLimited=1;}
  function identity(value){if(!object(value))return 0;let id=ids.get(value);if(!id){if(nextID>=PIPELINE_OWNER_LIMITS.identities){bump('omitted');return 0;}id=++nextID;ids.set(value,id);}return id;}
  function currentRig(){try{const map=data(state.game,'avatars'),local=data(state.game,'localId');if(!(map instanceof Map)||typeof local!=='string')return;return Reflect.apply(Map.prototype.get,map,[local]);}catch{return;}}
  function seedLocal(){const rig=currentRig(),body=data(rig,'skinnedBody'),root=data(rig,'root');if(!object(rig)||!object(body)||!object(root)||!alive(root))return;let count=0;for(const level of['near','medium']){const list=data(body,level);if(!Array.isArray(list)||list.length>128)return;count+=list.length;if(count>128)return;for(let i=0;i<list.length;i++){const mesh=data(list,i);if(!object(mesh))return;localMembers.set(mesh,level);}}localRigRef=new WeakRef(rig);localBodyRef=new WeakRef(body);localRootRef=new WeakRef(root);meta.ownership.localStatus='seeded';}
  function localCurrent(){const rig=currentRig();if(!localRigRef){meta.ownership.localStatus='unavailable';return;}if(rig!==localRigRef.deref()||data(rig,'skinnedBody')!==localBodyRef?.deref()||data(rig,'root')!==localRootRef?.deref()||!alive(data(rig,'root'))){meta.ownership.localStatus='replaced';return;}return rig;}
  function materialCurrent(material){const index=data(material,'_indexInSceneMaterialArray');return data(material,'_scene')===state.scene&&integer(index)&&Array.isArray(data(state.scene,'materials'))&&data(data(state.scene,'materials'),index)===material;}
  function role(mesh){
    const metadata=data(mesh,'metadata'),level=localMembers.get(mesh);
    if(level&&localCurrent())return 'local-'+(data(metadata,'studentGarment')===true?'garment-':'skinned-')+level;
    if(data(metadata,'b6Reality')===true){const group=data(metadata,'visibilityGroup');return ['interior-detail','exterior-entry','opaque-envelope'].includes(group)?'b6-'+group:'b6-other';}
    if(data(data(data(mesh,'_parentNode'),'metadata'),'roadSign')===true)return 'road-sign-child';
    return data(metadata,'skinnedAnatomy')===true?'skinned-anatomy':'unknown';
  }
  const className=(value)=>typeof classes.InstancedMesh==='function'&&value instanceof classes.InstancedMesh?'InstancedMesh':typeof classes.Mesh==='function'&&value instanceof classes.Mesh?'Mesh':'other';
  function nameProjection(value){
    if(typeof value!=='string')return null;
    if(value.length>512){bump('nameLimited');return null;}
    const length=utf8Length(value);if(meta.ownership.stats.nameBytes+length>262144){bump('nameLimited');return null;}
    if(!check(clock()))return null;
    const bytes=encoder.encode(value),result=textRow(value,bytes);meta.ownership.stats.nameBytes+=bytes.length;hash(result,bytes,true);return result;
  }
  function rowFor(context){const rows=contextRows.get(context);if(rows?.length!==1){if(rows?.length>1)bump('ambiguousContexts');return;}return rows[0];}
  function link(row,entry,timing,kind='pbr-caller'){
    if(!state.active)return;const at=clock();if(!check(at))return;
    const effect=entry.effect.deref(),mesh=entry.mesh.deref(),material=entry.material?.deref(),rendering=entry.rendering?.deref();
    if(!effect||!mesh||!rendering||(entry.material&&!material)){bump('collected');return;}
    if(!alive(effect)||!alive(mesh)||!alive(rendering)||data(mesh,'_scene')!==state.scene||data(rendering,'_scene')!==state.scene){bump('disposed');return;}
    if(material&&data(material,'_scene')!==state.scene){bump('disposed');return;}
    const context=data(effect,'_pipelineContext');if(!object(context)||rowFor(context)!==row)return;
    if(kind==='local-shadow-slot'&&!localCurrent())return;
    const meshID=identity(mesh),materialID=identity(material),renderingMeshID=identity(rendering),effectID=identity(effect),key=[kind,meshID,renderingMeshID,materialID,entry.passID,entry.useInstances].join(':');if(!meshID||!effectID)return;
    let keys=linkKeys.get(row.id);if(!keys){keys=new Set();linkKeys.set(row.id,keys);}if(keys.has(key))return;
    if(row.owners.length>=64){bump('linkOverflow');return;}keys.add(key);
    const alpha=data(material,'_alpha'),transparency=data(material,'_transparencyMode'),metadata=data(mesh,'metadata');
    const materialRegistration=!material?'unavailable':materialCurrent(material)?'registered':'unregistered-or-unknown';if(materialRegistration==='unregistered-or-unknown')bump('unregisteredMaterials');
    const item={kind,association:timing,associationAtMs:at,callerID:entry.id,meshID,renderingMeshID,materialID,effectID,passID:entry.passID,useInstances:entry.useInstances,materialRegistration,
      materialRelation:kind==='pbr-caller'?'pbr-receiver':'mesh-material-slot',meshClass:className(mesh),renderingClass:className(rendering),role:role(mesh),renderingRole:role(rendering),
      alpha:finite(alpha)&&alpha<=1?alpha:null,transparencyMode:integer(transparency)&&transparency<=3?transparency:null,
      characterSurface:['skin','cloth','denim'].includes(data(metadata,'characterSurface'))?data(metadata,'characterSurface'):'unknown',
      avatarBodyLod:['near','medium'].includes(data(metadata,'avatarBodyLod'))?data(metadata,'avatarBodyLod'):'unknown',names:{mesh:null,material:null,parent:null}};
    row.owners.push(item);for(const[name,value]of[['mesh',data(mesh,'name')],['material',data(material,'name')],['parent',data(data(mesh,'_parentNode'),'name')]]){if(!state.active)break;item.names[name]=nameProjection(value);}
  }
  function associateKnown(row,timing){if(!state.active)return;const context=recordContexts.get(row.id)?.deref();if(!context||rowFor(context)!==row)return;for(const entry of callerRows){if(!state.active)break;const effect=entry.effect.deref();if(effect&&data(effect,'_pipelineContext')===context)link(row,entry,timing);}}
  function localMaterial(mesh,sub,pass){const info=data(mesh,'_internalAbstractMeshDataInfo');let material=data(data(info,'_materialForRenderPass'),pass)??data(info,'_material');const list=data(material,'_subMaterials');if(Array.isArray(list))material=data(list,data(sub,'materialIndex'));return material;}
  function projectLocal(row){
    if(!state.active||!check(clock()))return;const rig=localCurrent();if(!rig)return;const body=data(rig,'skinnedBody'),beam=data(data(state.game,'flashlight'),'beam'),shadow=data(beam,'shadow'),target=data(shadow,'_shadowMap'),renderer=data(target,'_objectRenderer'),passes=data(renderer,'_renderPassIds');
    if(typeof classes.ShadowGenerator!=='function'||!(shadow instanceof classes.ShadowGenerator)||data(shadow,'_scene')!==state.scene||data(shadow,'_light')!==data(beam,'light')||data(renderer,'_scene')!==state.scene||!Array.isArray(passes)||!passes.length||passes.length>4){meta.ownership.localStatus='pass-unavailable';return;}
    const passIDs=passes.map((_,i)=>data(passes,i));if(passIDs.some(pass=>!integer(pass)||pass>1000000)){meta.ownership.localStatus='pass-unavailable';return;}
    const context=recordContexts.get(row.id)?.deref();if(!context||rowFor(context)!==row)return;let count=0;meta.ownership.localStatus='available';meta.ownership.lastProjectionAtMs=lastClock;
    for(const level of['near','medium']){const meshes=data(body,level);if(!Array.isArray(meshes)||meshes.length>128||count+meshes.length>128){meta.ownership.localStatus='array-limit';bump('omitted');return;}count+=meshes.length;
      for(let i=0;i<meshes.length;i++){if(!state.active)return;const mesh=data(meshes,i);if(localMembers.get(mesh)!==level){meta.ownership.localStatus='changed';bump('omitted');continue;}const subs=data(mesh,'subMeshes');if(!Array.isArray(subs)||subs.length>32){bump('omitted');continue;}
        for(let j=0;j<subs.length;j++){const sub=data(subs,j);if(data(sub,'_mesh')!==mesh){bump('omitted');continue;}const wrappers=data(sub,'_drawWrappers');if(!Array.isArray(wrappers))continue;
          for(const pass of passIDs){const wrapper=data(wrappers,pass),effect=data(wrapper,'effect');if(object(effect)&&data(effect,'_pipelineContext')===context){const material=localMaterial(mesh,sub,pass);link(row,{id:0,effect:new WeakRef(effect),mesh:new WeakRef(mesh),rendering:new WeakRef(mesh),material:object(material)?new WeakRef(material):undefined,passID:pass,useInstances:bool(data(wrapper,'_wasPreviouslyUsingInstances'))},'original-settlement','local-shadow-slot');}}
        }
      }
    }
  }
  const pbrDispatch=function(receiver,args,callOriginal){
    if(!state.active)return Reflect.apply(callOriginal,receiver,args);let local=false;try{local=receiver instanceof classes.PBRBaseMaterial&&data(receiver,'_scene')===state.scene;}catch{return Reflect.apply(callOriginal,receiver,args);}if(!local)return Reflect.apply(callOriginal,receiver,args);
    if(!same(Object.getOwnPropertyDescriptor(pbrPrototype,'_prepareEffect'),pbrInstalled)){stop('foreign-method',clock());return Reflect.apply(callOriginal,receiver,args);}
    if(!check(clock()))return Reflect.apply(callOriginal,receiver,args);
    bump('calls');const pass=data(state.engine,'currentRenderPassId');let result;
    try{result=Reflect.apply(callOriginal,receiver,args);}catch(error){if(state.active)bump('throws');throw error;}
    if(!state.active)return result;if(result===null){bump('nullReturns');return result;}
    if(typeof classes.Effect!=='function'||!(result instanceof classes.Effect)||!object(args[0])){bump('unsupportedReturns');return result;}
    try{if(!check(clock()))return result;if(callerRows.length>=4096){bump('omitted');return result;}const mesh=args[0],rendering=object(args[1])?args[1]:mesh,passID=integer(pass)&&pass<=1000000?pass:-1,useInstances=bool(args[5]),key=[identity(mesh),identity(rendering),identity(receiver),passID,useInstances].join(':');let keys=seenCallers.get(result);if(!keys){keys=new Set();seenCallers.set(result,keys);}if(keys.has(key))return result;
      keys.add(key);const entry={id:callerRows.length+1,effect:new WeakRef(result),mesh:new WeakRef(mesh),rendering:new WeakRef(rendering),material:new WeakRef(receiver),passID,useInstances};callerRows.push(entry);meta.ownership.stats.stored=callerRows.length;const context=data(result,'_pipelineContext');if(object(context)){const row=rowFor(context);if(row)link(row,entry,'return');else bump('outsideWindowContextAtReturn');}else bump('missingContextAtReturn');
    }catch{bump('errors');}return result;
  };
  function capture(args,at) {
    if(++meta.calls>32){meta.counts.callOverflow++;stop('call-budget',at);return;}
    const row={id:meta.calls,contextID:0,atMs:at,createAsRaw:null,inputStatus:'bad-args',inputs:null,families:null,selectedDefines:null,outcome:'calling',settledAtMs:null,latencyMs:null,owners:[]};meta.records.push(row);
    const context=args[0],name=data(context,'_name'),texts=[args[1],args[2],args[7],name];
    if(!object(context)||typeof args[3]!=='boolean'||texts.some(text=>typeof text!=='string')){meta.counts.badArgs++;return row;}
    if(texts.reduce((n,text)=>n+text.length,0)>PIPELINE_INPUT_LIMITS.callBytes){meta.counts.byteOverflow++;row.inputStatus='byte-limit';stop('byte-budget',at);return;}
    const size=texts.reduce((n,text)=>n+utf8Length(text),0);
    if(size>PIPELINE_INPUT_LIMITS.callBytes||meta.totalInputBytes+size>PIPELINE_INPUT_LIMITS.totalBytes){meta.counts.byteOverflow++;row.inputStatus='byte-limit';stop('byte-budget',at);return;}
    const bytes=texts.map(text=>encoder.encode(text));
    meta.totalInputBytes+=size;row.createAsRaw=args[3];row.inputStatus='captured';row.inputs=Object.fromEntries(['vertex','fragment','defines','contextName'].map((key,i)=>[key,textRow(texts[i],bytes[i])]));
    row.families={vertex:family(texts[0],'vertex'),fragment:family(texts[1],'fragment')};row.selectedDefines=flags(texts[2]);if(row.selectedDefines.truncated||row.selectedDefines.withheld)meta.counts.projectionLimited++;
    let id=contexts.get(context);if(!id){id=++nextContext;contexts.set(context,id);}row.contextID=id;recordContexts.set(row.id,new WeakRef(context));const previous=contextRows.get(context)??[];previous.push(row);contextRows.set(context,previous);
    for(let i=0;i<4;i++)hash(row.inputs[['vertex','fragment','defines','contextName'][i]],bytes[i]);return row;
  }
  function observeResult(row,result) {
    if(!state.active||!row)return;
    row.outcome='pending';
    meta.pendingOriginal++;
    const settled=outcome=>{if(!state.active||!check(clock()))return;meta.pendingOriginal--;row.outcome=outcome;row.settledAtMs=lastClock;row.latencyMs=lastClock-row.atMs;if(outcome==='rejected')meta.counts.rejections++;try{associateKnown(row,'original-settlement');if(state.active)projectLocal(row);}catch{if(state.active)bump('errors');}};
    try{if(!reaction(result,()=>settled('fulfilled'),()=>settled('rejected'))){meta.pendingOriginal--;row.outcome='unsupported';meta.counts.unsupportedPromises++;}}
    catch{meta.pendingOriginal--;row.outcome='unsupported';meta.counts.unsupportedPromises++;}
  }
  const dispatch=function(receiver,args,callOriginal){
    if(!state.active||receiver!==state.engine){if(state.active)meta.counts.foreignCalls++;return Reflect.apply(callOriginal,receiver,args);}
    let row;try{const at=clock();if(check(at))row=capture(args,at);}catch{meta.counts.observerErrors++;}
    let result,threw=true;
    try{result=Reflect.apply(callOriginal,receiver,args);threw=false;return result;}
    catch(error){if(state.active&&row){row.outcome='threw';row.settledAtMs=clock();row.latencyMs=row.settledAtMs===null?null:row.settledAtMs-row.atMs;meta.counts.syncThrows++;}throw error;}
    finally{if(!threw){try{observeResult(row,result);if(state.active)check(clock());}catch{meta.counts.observerErrors++;}}}
  };
  try {
    meta.armedAtMs=clock();meta.deadlineAtMs=meta.armedAtMs===null?null:meta.armedAtMs+30000;
    if(!check(meta.armedAtMs))return owner;
    const pending=data(state.health,'pendingByKind');if(data(pending,'preparation')!==0||data(pending,'shader-validation')!==0)throw Error('Arm requires settled ready health');
    attempts.set(game,used+1);seedLocal();hook=originalHook(original,dispatch);pbrHook=originalHook(pbrOriginal,pbrDispatch);installed={...own,value:hook.wrapper};Object.defineProperty(state.engine,'_preparePipelineContextAsync',installed);state.wrapper=hook.wrapper;pbrInstalled={...pbrOwn,value:pbrHook.wrapper};Object.defineProperty(pbrPrototype,'_prepareEffect',pbrInstalled);owners.set(state.engine,owner);pbrOwners.set(pbrPrototype,owner);
    const aborted=()=>stop('aborted');for(const s of [signal,state.startup?.signal].filter(Boolean)){state.detach.push(()=>s.removeEventListener('abort',aborted));s.addEventListener('abort',aborted,{once:true});if(!state.active)return owner;}
    const observer=state.scene.onDisposeObservable.add(()=>stop('scene-disposed'));if(!state.active){observer.remove(true);return owner;}state.detach.push(()=>observer.remove(true));
    const at=clock();if(!check(at))return owner;let lateTimerClear=clearTimer;const timer=setTimer(()=>{try{if(current())stop('deadline');else stop('retired');}catch{if(state.active){meta.counts.observerErrors++;stop('observer-error');}}},meta.deadlineAtMs-at);if(!state.active){lateTimerClear(timer);lateTimerClear=null;return owner;}lateTimerClear=null;state.timer=timer;check(clock());
  }catch{meta.counts.observerErrors++;stop('installation-failed');}finally{installing=false;seal();}
  return owner;
}

const exact=(value,keys)=>object(value)&&Object.keys(value).sort().join(',')===keys.split(',').sort().join(',');
/** Transport validation deliberately admits truthful failed/partial windows. */
export function validatePipelineInputs(value){
  if(!exact(value,'schemaVersion,scope,limits,active,completed,reason,windowIndex,rendererId,generation,armedAtMs,deadlineAtMs,endedAtMs,healthAtEnd,calls,totalInputBytes,pendingOriginal,pendingHashes,counts,records,ownership')||value.schemaVersion!==1||value.scope!==PIPELINE_INPUT_SCOPE||JSON.stringify(value.limits)!==JSON.stringify(PIPELINE_INPUT_LIMITS)||value.active!==false||typeof value.completed!=='boolean'||typeof value.reason!=='string'||value.reason.length>40||
    ['windowIndex','rendererId','generation','calls','totalInputBytes','pendingOriginal','pendingHashes'].some(k=>!integer(value[k]))||value.windowIndex<1||value.windowIndex>4||value.rendererId<1||value.generation<1||value.calls>33||value.totalInputBytes>4194304||value.pendingOriginal>32||value.pendingHashes>128||
    ['armedAtMs','endedAtMs'].some(k=>value[k]!==null&&!finite(value[k]))||(value.endedAtMs!==null&&value.armedAtMs!==null&&value.endedAtMs<value.armedAtMs)||value.deadlineAtMs!==(value.armedAtMs===null?null:value.armedAtMs+30000)||!exact(value.counts,Object.keys(counters()).join(','))||Object.values(value.counts).some(n=>!integer(n))||!Array.isArray(value.records)||value.records.length!==Math.min(value.calls,32)||
    (value.healthAtEnd!==null&&(!exact(value.healthAtEnd,'errors,pendingPreparation,pendingShaderValidation')||Object.values(value.healthAtEnd).some(n=>n!==null&&!integer(n)))))throw Error('Pipeline input identity/bounds');
  let totalBytes=0;
  for(const[rowIndex,row]of value.records.entries()){
    if(!exact(row,'id,contextID,atMs,createAsRaw,inputStatus,inputs,families,selectedDefines,outcome,settledAtMs,latencyMs,owners')||row.id!==rowIndex+1||!integer(row.contextID)||row.contextID>32||!finite(row.atMs)||row.atMs<value.armedAtMs||row.atMs>=value.deadlineAtMs||!['captured','bad-args','byte-limit'].includes(row.inputStatus)||![null,true,false].includes(row.createAsRaw)||!['calling','pending','fulfilled','rejected','threw','unsupported'].includes(row.outcome)||['settledAtMs','latencyMs'].some(k=>row[k]!==null&&!finite(row[k]))||
      ((row.settledAtMs===null)!==(row.latencyMs===null))||(row.settledAtMs!==null&&(row.settledAtMs<row.atMs||row.latencyMs!==row.settledAtMs-row.atMs)))throw Error('Pipeline input record bounds');
    if(['fulfilled','rejected'].includes(row.outcome)&&(!finite(row.settledAtMs)||!finite(row.latencyMs)||row.settledAtMs>=value.deadlineAtMs||(value.endedAtMs!==null&&row.settledAtMs>value.endedAtMs)))throw Error('Pipeline settlement clock bounds');
    if(row.inputStatus==='captured'){
      if(!exact(row.inputs,'vertex,fragment,defines,contextName')||!exact(row.families,'vertex,fragment')||Object.values(row.families).some(f=>!families.has(f)&&!['unknown','other','generated-token'].includes(f))||!exact(row.selectedDefines,'flags,withheld,truncated')||!Array.isArray(row.selectedDefines.flags)||row.selectedDefines.flags.length>128||!integer(row.selectedDefines.withheld)||typeof row.selectedDefines.truncated!=='boolean')throw Error('Pipeline input projection schema');
      if(row.contextID<1||typeof row.createAsRaw!=='boolean')throw Error('Pipeline captured context identity');
      let bytes=0;for(const input of Object.values(row.inputs)){if(!exact(input,'chars,bytes,sha256')||!integer(input.chars)||!integer(input.bytes)||input.chars>input.bytes||input.bytes>524288||(input.sha256!==null&&(typeof input.sha256!=='string'||!/^[a-f0-9]{64}$/.test(input.sha256))))throw Error('Pipeline input hash bounds');bytes+=input.bytes;}if(bytes>524288)throw Error('Pipeline per-call bytes');totalBytes+=bytes;
      for(const pair of row.selectedDefines.flags)if(!Array.isArray(pair)||pair.length!==2||!allowedFlag(pair[0])||typeof pair[1]!=='string'||pair[1].length>32||!/^(?:-?\d+(?:\.\d+)?|true|false)?$/.test(pair[1]))throw Error('Pipeline input flag bounds');
    }else if(row.inputs!==null||row.families!==null||row.selectedDefines!==null)throw Error('Pipeline input unavailable projection');
  }
  if(totalBytes!==value.totalInputBytes)throw Error('Pipeline total bytes mismatch');
  const projection=value.ownership;
  if(!exact(projection,'schemaVersion,limits,complete,localStatus,lastProjectionAtMs,unlinkedRecords,stats')||projection.schemaVersion!==1||JSON.stringify(projection.limits)!==JSON.stringify(PIPELINE_OWNER_LIMITS)||typeof projection.complete!=='boolean'||!['unavailable','seeded','replaced','pass-unavailable','available','array-limit','changed'].includes(projection.localStatus)||
    (projection.lastProjectionAtMs!==null&&(!finite(projection.lastProjectionAtMs)||projection.lastProjectionAtMs<value.armedAtMs||projection.lastProjectionAtMs>=value.deadlineAtMs||(value.endedAtMs!==null&&projection.lastProjectionAtMs>value.endedAtMs)))||!exact(projection.stats,Object.keys(ownerStats()).join(','))||Object.values(projection.stats).some(n=>!integer(n)||n>1000000)||projection.stats.stored>4096||projection.stats.nameBytes>262144||projection.stats.pendingNames>6144||projection.unlinkedRecords!==value.records.filter(row=>!row.owners?.length).length)throw Error('Pipeline owner projection bounds');
  for(const row of value.records){if(!Array.isArray(row.owners)||row.owners.length>64)throw Error('Pipeline owner link bounds');const keys=new Set();for(const link of row.owners){
    if(!exact(link,'kind,association,associationAtMs,callerID,meshID,renderingMeshID,materialID,effectID,passID,useInstances,materialRegistration,materialRelation,meshClass,renderingClass,role,renderingRole,alpha,transparencyMode,characterSurface,avatarBodyLod,names')||!['pbr-caller','local-shadow-slot'].includes(link.kind)||!['return','original-settlement'].includes(link.association)||!finite(link.associationAtMs)||link.associationAtMs<row.atMs||link.associationAtMs>=value.deadlineAtMs||(value.endedAtMs!==null&&link.associationAtMs>value.endedAtMs)||
      ['callerID','meshID','renderingMeshID','materialID','effectID'].some(k=>!integer(link[k]))||link.callerID>4096||link.meshID<1||link.effectID<1||['meshID','renderingMeshID','materialID','effectID'].some(k=>link[k]>32768)||!integer(link.passID+1)||link.passID>1000000||![-1,0,1].includes(link.useInstances)||
      !['registered','unregistered-or-unknown','unavailable'].includes(link.materialRegistration)||link.materialRelation!==(link.kind==='pbr-caller'?'pbr-receiver':'mesh-material-slot')||(link.kind==='pbr-caller'&&(link.callerID<1||link.materialID<1))||(link.kind==='local-shadow-slot'&&(link.callerID!==0||link.association!=='original-settlement'||!link.role.startsWith('local-')||link.passID<0))||
      !['Mesh','InstancedMesh','other'].includes(link.meshClass)||!['Mesh','InstancedMesh','other'].includes(link.renderingClass)||!ownerRoles.has(link.role)||!ownerRoles.has(link.renderingRole)||(link.alpha!==null&&(!finite(link.alpha)||link.alpha>1))||(link.transparencyMode!==null&&(!integer(link.transparencyMode)||link.transparencyMode>3))||!['unknown','skin','cloth','denim'].includes(link.characterSurface)||!['unknown','near','medium'].includes(link.avatarBodyLod)||!exact(link.names,'mesh,material,parent'))throw Error('Pipeline owner link schema');
    const key=[link.kind,link.meshID,link.renderingMeshID,link.materialID,link.passID,link.useInstances].join(':');if(keys.has(key))throw Error('Duplicate pipeline owner link');keys.add(key);
    for(const name of Object.values(link.names))if(name!==null&&(!exact(name,'chars,bytes,sha256')||!integer(name.chars)||!integer(name.bytes)||name.chars>512||name.bytes<name.chars||name.bytes>1536||(name.sha256!==null&&(typeof name.sha256!=='string'||!/^[a-f0-9]{64}$/.test(name.sha256)))))throw Error('Pipeline owner name privacy/bounds');
  }}
  if(projection.complete&&(projection.unlinkedRecords||['pendingNames','unsupportedReturns','throws','omitted','collected','disposed','ambiguousContexts','linkOverflow','nameLimited','hashErrors','errors','counterLimited'].some(key=>projection.stats[key])||value.records.some(row=>row.owners.some(link=>Object.values(link.names).some(name=>name!==null&&!name.sha256)))))throw Error('Pipeline false owner completeness');
  if(value.completed&&(value.reason!=='deadline'||value.endedAtMs===null||value.deadlineAtMs===null||value.endedAtMs<value.deadlineAtMs||value.healthAtEnd===null||Object.values(value.healthAtEnd).some(n=>n!==0)||value.pendingOriginal||value.pendingHashes||projection.stats.pendingNames||Object.values(value.counts).some(Boolean)||value.records.some(row=>row.inputStatus!=='captured'||row.outcome!=='fulfilled'||Object.values(row.inputs).some(input=>!input.sha256))))throw Error('Pipeline input false completion');
  return value;
}
