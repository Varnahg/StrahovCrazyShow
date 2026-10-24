/** Explicit post-ready diagnostics; only primitive compiler inputs leave this hook. */
export const PIPELINE_INPUT_LIMITS = Object.freeze({ milliseconds: 30000, calls: 32, callBytes: 512 * 1024, totalBytes: 4 * 1024 * 1024, windows: 4, flags: 128 });
export const PIPELINE_INPUT_SCOPE = 'Original post-ready _preparePipelineContextAsync inputs only. Hashes/fixed shader families/selected defines, no shader/key/name text or owner inference. Settlement wall latency is not GPU time.';
const NativePromise = Promise, nativeThen = Promise.prototype.then, species = Object.getOwnPropertyDescriptor(Promise, Symbol.species);
const owners = new WeakMap(), attempts = new WeakMap(), encoder = new TextEncoder();
const object = value => value !== null && (typeof value === 'object' || typeof value === 'function');
const data = (value, key) => object(value) ? Object.getOwnPropertyDescriptor(value, key)?.value : undefined;
const descriptor = (value, key) => { for (let item = value; object(item); item = Object.getPrototypeOf(item)) { const d = Object.getOwnPropertyDescriptor(item, key); if (d) return d; } };
const same = (a,b) => !!a === !!b && (!a || ['value','get','set','writable','configurable','enumerable'].every(key => a[key] === b[key]));
const finite = value => typeof value === 'number' && Number.isFinite(value) && value >= 0;
const integer = value => Number.isSafeInteger(value) && value >= 0;
const nativePromise = value => {
  if (!object(value) || Object.getPrototypeOf(value) !== NativePromise.prototype) return false;
  const constructor = Object.getOwnPropertyDescriptor(value, 'constructor'), current = Object.getOwnPropertyDescriptor(NativePromise, Symbol.species);
  return (!constructor || (Object.hasOwn(constructor,'value') && constructor.value === NativePromise)) && data(NativePromise.prototype,'constructor') === NativePromise && same(current,species);
};
const counters = () => ({ syncThrows:0, rejections:0, unsupportedPromises:0, badArgs:0, callOverflow:0, byteOverflow:0, projectionLimited:0, hashErrors:0, observerErrors:0, foreignCalls:0, restoreConflicts:0 });
const families = new Set(['pbr','default','shadowMap','depth','clearQuad','particles','gpuRenderParticles','color','background','sky','cell','water']);
const allowedFlag = name => /^(?:DEPTHPREPASS|ALPHATEST|INSTANCES|THIN_INSTANCES|NORMAL|TANGENT|UV[12]|FOG|NUM_BONE_INFLUENCERS|NUM_MORPH_INFLUENCERS|LIGHTCOUNT|MAXLIGHTCOUNT|SM_(?:FLOAT|ESM|DEPTHTEXTURE|USEDISTANCE|SOFTTRANSPARENTSHADOW|NORMALBIAS|DIRECTIONINLIGHTDATA|DEPTHCLAMP)|(?:LIGHT|POINTLIGHT|SPOTLIGHT|HEMILIGHT|DIRLIGHT|SHADOW|SHADOWPCF|SHADOWPCSS|SHADOWESM|SHADOWCUBE|SHADOWLOWQUALITY|SHADOWMEDIUMQUALITY)[0-3])$/.test(name);
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
  if (!classes || !methods || !(game instanceof classes.Game) || !(game.scene instanceof classes.Scene) || !(game.engine instanceof classes.WebGPUEngine)) throw Error('Pipeline input singleton mismatch');
  const state={game,actor:game.actor,scene:game.scene,engine:game.engine,health:game.renderHealth,profile:game.compilationProfile,device:game.engine._device,startup:game.startupAbort,isCurrent,active:true,timer:null,detach:[],wrapper:null};
  const own=Object.getOwnPropertyDescriptor(state.engine,'_preparePipelineContextAsync'), original=own?.value;
  const generation=data(state.health,'generation'), rendererId=data(state.health,'rendererId'), used=attempts.get(game)??0;
  if (typeof original!=='function' || !Object.hasOwn(own,'value') || (!own.writable&&!own.configurable) || owners.has(state.engine) || used>=4 ||
      descriptor(Object.getPrototypeOf(state.engine),'_preparePipelineContextAsync')?.value!==methods.preparePipeline || descriptor(state.scene,'render')?.value!==methods.render ||
      Object.getOwnPropertyDescriptor(state.profile??{},'inspectShader') || Object.getOwnPropertyDescriptor(state.game.gltfLightBudget??{},'prepareFrame') || !object(state.device) ||
      !integer(generation)||generation<1||!integer(rendererId)||rendererId<1 || data(data(state.profile,'hooks'),'engine._preparePipelineContextAsync')!=='installed') throw Error('Pipeline input native method/profile/window ownership');
  const meta={schemaVersion:1,scope:PIPELINE_INPUT_SCOPE,limits:PIPELINE_INPUT_LIMITS,active:true,completed:false,reason:null,windowIndex:used+1,rendererId,generation,
    armedAtMs:null,deadlineAtMs:null,endedAtMs:null,calls:0,totalInputBytes:0,pendingOriginal:0,pendingHashes:0,counts:counters(),records:[]};
  let lastClock=-Infinity, installed, sealed, installing=true, contexts=new WeakMap(),nextContext=0;
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
    if(installed){try{if(same(Object.getOwnPropertyDescriptor(state.engine,'_preparePipelineContextAsync'),installed))Object.defineProperty(state.engine,'_preparePipelineContextAsync',own);else meta.counts.restoreConflicts++;}catch{meta.counts.restoreConflicts++;}installed=null;}
    if(state.timer!==null){try{clearTimer(state.timer);}catch{meta.counts.observerErrors++;}}
    for(const detach of state.detach.splice(0)){try{detach();}catch{meta.counts.observerErrors++;}}
    meta.completed=reason==='deadline'&&meta.endedAtMs>=meta.deadlineAtMs&&!meta.pendingOriginal&&!meta.pendingHashes&&Object.values(meta.counts).every(value=>value===0)&&meta.records.every(row=>row.outcome==='fulfilled'&&Object.values(row.inputs??{}).every(input=>input.sha256!==null));
    if(owners.get(state.engine)===owner)owners.delete(state.engine);
    state.game=state.actor=state.scene=state.engine=state.health=state.profile=state.device=state.startup=state.isCurrent=state.wrapper=null;state.timer=null;contexts=null;game=null;seal();
  }
  function reaction(promise,fulfilled,rejected) {
    if(!nativePromise(promise))return false;
    Reflect.apply(nativeThen,promise,[value=>{try{fulfilled(value);}catch{if(state.active){meta.counts.observerErrors++;stop('observer-error');}}},error=>{try{rejected(error);}catch{if(state.active){meta.counts.observerErrors++;stop('observer-error');}}}]);return true;
  }
  function hash(input,bytes) {
    if(!state.active)return;
    meta.pendingHashes++;
    try {
      const promise=digest(bytes);
      if(!reaction(promise,value=>{if(!state.active||!check(clock()))return;meta.pendingHashes--;if(!(value instanceof ArrayBuffer)||value.byteLength!==32){meta.counts.hashErrors++;return;}input.sha256=hex(value);},()=>{if(!state.active||!check(clock()))return;meta.pendingHashes--;meta.counts.hashErrors++;})&&state.active){meta.pendingHashes--;meta.counts.hashErrors++;}
    } catch {if(state.active){meta.pendingHashes--;meta.counts.hashErrors++;}}
  }
  function capture(args,at) {
    if(++meta.calls>32){meta.counts.callOverflow++;stop('call-budget',at);return;}
    const row={id:meta.calls,contextID:0,atMs:at,createAsRaw:null,inputStatus:'bad-args',inputs:null,families:null,selectedDefines:null,outcome:'calling',settledAtMs:null,latencyMs:null};meta.records.push(row);
    const context=args[0],name=data(context,'_name'),texts=[args[1],args[2],args[7],name];
    if(!object(context)||typeof args[3]!=='boolean'||texts.some(text=>typeof text!=='string')){meta.counts.badArgs++;return row;}
    if(texts.reduce((n,text)=>n+text.length,0)>PIPELINE_INPUT_LIMITS.callBytes){meta.counts.byteOverflow++;row.inputStatus='byte-limit';stop('byte-budget',at);return;}
    const size=texts.reduce((n,text)=>n+utf8Length(text),0);
    if(size>PIPELINE_INPUT_LIMITS.callBytes||meta.totalInputBytes+size>PIPELINE_INPUT_LIMITS.totalBytes){meta.counts.byteOverflow++;row.inputStatus='byte-limit';stop('byte-budget',at);return;}
    const bytes=texts.map(text=>encoder.encode(text));
    meta.totalInputBytes+=size;row.createAsRaw=args[3];row.inputStatus='captured';row.inputs=Object.fromEntries(['vertex','fragment','defines','contextName'].map((key,i)=>[key,textRow(texts[i],bytes[i])]));
    row.families={vertex:family(texts[0],'vertex'),fragment:family(texts[1],'fragment')};row.selectedDefines=flags(texts[2]);if(row.selectedDefines.truncated||row.selectedDefines.withheld)meta.counts.projectionLimited++;
    let id=contexts.get(context);if(!id){id=++nextContext;contexts.set(context,id);}row.contextID=id;
    for(let i=0;i<4;i++)hash(row.inputs[['vertex','fragment','defines','contextName'][i]],bytes[i]);return row;
  }
  function observeResult(row,result) {
    if(!state.active||!row)return;
    row.outcome='pending';
    meta.pendingOriginal++;
    const settled=outcome=>{if(!state.active||!check(clock()))return;meta.pendingOriginal--;row.outcome=outcome;row.settledAtMs=lastClock;row.latencyMs=lastClock-row.atMs;if(outcome==='rejected')meta.counts.rejections++;};
    try{if(!reaction(result,()=>settled('fulfilled'),()=>settled('rejected'))){meta.pendingOriginal--;row.outcome='unsupported';meta.counts.unsupportedPromises++;}}
    catch{meta.pendingOriginal--;row.outcome='unsupported';meta.counts.unsupportedPromises++;}
  }
  const wrapper=function(){
    if(!state.active||this!==state.engine){if(state.active)meta.counts.foreignCalls++;return Reflect.apply(original,this,arguments);}
    let row;try{const at=clock();if(check(at))row=capture(arguments,at);}catch{meta.counts.observerErrors++;}
    let result,threw=true;
    try{result=Reflect.apply(original,this,arguments);threw=false;return result;}
    catch(error){if(state.active&&row){row.outcome='threw';row.settledAtMs=clock();row.latencyMs=row.settledAtMs===null?null:row.settledAtMs-row.atMs;meta.counts.syncThrows++;}throw error;}
    finally{if(!threw){try{observeResult(row,result);if(state.active)check(clock());}catch{meta.counts.observerErrors++;}}}
  };
  try {
    meta.armedAtMs=clock();meta.deadlineAtMs=meta.armedAtMs===null?null:meta.armedAtMs+30000;
    if(!check(meta.armedAtMs))return owner;
    const pending=data(state.health,'pendingByKind');if(data(pending,'preparation')!==0||data(pending,'shader-validation')!==0)throw Error('Arm requires settled ready health');
    attempts.set(game,used+1);installed={...own,value:wrapper};Object.defineProperty(state.engine,'_preparePipelineContextAsync',installed);state.wrapper=wrapper;owners.set(state.engine,owner);
    const aborted=()=>stop('aborted');for(const s of [signal,state.startup?.signal].filter(Boolean)){state.detach.push(()=>s.removeEventListener('abort',aborted));s.addEventListener('abort',aborted,{once:true});if(!state.active)return owner;}
    const observer=state.scene.onDisposeObservable.add(()=>stop('scene-disposed'));if(!state.active){observer.remove(true);return owner;}state.detach.push(()=>observer.remove(true));
    const at=clock();if(!check(at))return owner;const timer=setTimer(()=>{try{if(current())stop('deadline');else stop('retired');}catch{meta.counts.observerErrors++;stop('observer-error');}},meta.deadlineAtMs-at);if(!state.active){clearTimer(timer);return owner;}state.timer=timer;check(clock());
  }catch{meta.counts.observerErrors++;stop('installation-failed');}finally{installing=false;seal();}
  return owner;
}

const exact=(value,keys)=>object(value)&&Object.keys(value).sort().join(',')===keys.split(',').sort().join(',');
/** Transport validation deliberately admits truthful failed/partial windows. */
export function validatePipelineInputs(value){
  if(!exact(value,'schemaVersion,scope,limits,active,completed,reason,windowIndex,rendererId,generation,armedAtMs,deadlineAtMs,endedAtMs,calls,totalInputBytes,pendingOriginal,pendingHashes,counts,records')||value.schemaVersion!==1||value.scope!==PIPELINE_INPUT_SCOPE||JSON.stringify(value.limits)!==JSON.stringify(PIPELINE_INPUT_LIMITS)||value.active!==false||typeof value.completed!=='boolean'||typeof value.reason!=='string'||value.reason.length>40||
    ['windowIndex','rendererId','generation','calls','totalInputBytes','pendingOriginal','pendingHashes'].some(k=>!integer(value[k]))||value.windowIndex<1||value.windowIndex>4||value.rendererId<1||value.generation<1||value.calls>33||value.totalInputBytes>4194304||value.pendingOriginal>32||value.pendingHashes>128||
    ['armedAtMs','endedAtMs'].some(k=>value[k]!==null&&!finite(value[k]))||value.deadlineAtMs!==(value.armedAtMs===null?null:value.armedAtMs+30000)||!exact(value.counts,Object.keys(counters()).join(','))||Object.values(value.counts).some(n=>!integer(n))||!Array.isArray(value.records)||value.records.length>32||value.records.length>value.calls)throw Error('Pipeline input identity/bounds');
  let totalBytes=0;
  for(const[rowIndex,row]of value.records.entries()){
    if(!exact(row,'id,contextID,atMs,createAsRaw,inputStatus,inputs,families,selectedDefines,outcome,settledAtMs,latencyMs')||row.id!==rowIndex+1||!integer(row.contextID)||row.contextID>32||!finite(row.atMs)||row.atMs<value.armedAtMs||row.atMs>=value.deadlineAtMs||!['captured','bad-args','byte-limit'].includes(row.inputStatus)||![null,true,false].includes(row.createAsRaw)||!['calling','pending','fulfilled','rejected','threw','unsupported'].includes(row.outcome)||['settledAtMs','latencyMs'].some(k=>row[k]!==null&&!finite(row[k]))||
      ((row.settledAtMs===null)!==(row.latencyMs===null))||(row.settledAtMs!==null&&(row.settledAtMs<row.atMs||row.latencyMs!==row.settledAtMs-row.atMs)))throw Error('Pipeline input record bounds');
    if(row.inputStatus==='captured'){
      if(!exact(row.inputs,'vertex,fragment,defines,contextName')||!exact(row.families,'vertex,fragment')||Object.values(row.families).some(f=>!families.has(f)&&!['unknown','other','generated-token'].includes(f))||!exact(row.selectedDefines,'flags,withheld,truncated')||!Array.isArray(row.selectedDefines.flags)||row.selectedDefines.flags.length>128||!integer(row.selectedDefines.withheld)||typeof row.selectedDefines.truncated!=='boolean')throw Error('Pipeline input projection schema');
      let bytes=0;for(const input of Object.values(row.inputs)){if(!exact(input,'chars,bytes,sha256')||!integer(input.chars)||!integer(input.bytes)||input.chars>input.bytes||input.bytes>524288||(input.sha256!==null&&!/^[a-f0-9]{64}$/.test(input.sha256)))throw Error('Pipeline input hash bounds');bytes+=input.bytes;}if(bytes>524288)throw Error('Pipeline per-call bytes');totalBytes+=bytes;
      for(const pair of row.selectedDefines.flags)if(!Array.isArray(pair)||pair.length!==2||!allowedFlag(pair[0])||typeof pair[1]!=='string'||pair[1].length>32||!/^(?:-?\d+(?:\.\d+)?|true|false)?$/.test(pair[1]))throw Error('Pipeline input flag bounds');
    }else if(row.inputs!==null||row.families!==null||row.selectedDefines!==null)throw Error('Pipeline input unavailable projection');
  }
  if(totalBytes!==value.totalInputBytes)throw Error('Pipeline total bytes mismatch');
  if(value.completed&&(value.reason!=='deadline'||value.endedAtMs<value.deadlineAtMs||value.pendingOriginal||value.pendingHashes||Object.values(value.counts).some(Boolean)||value.records.some(row=>row.inputStatus!=='captured'||row.outcome!=='fulfilled'||Object.values(row.inputs).some(input=>!input.sha256))))throw Error('Pipeline input false completion');
  return value;
}
