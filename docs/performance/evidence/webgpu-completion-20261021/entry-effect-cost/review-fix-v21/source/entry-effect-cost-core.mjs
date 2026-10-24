import { validateGuardFailure, validateGuardSample } from './entry-effect-guard.mjs';
/** Fixed ten-routine diagnostic; independent of the immutable eight-routine schema. */
export const EFFECT_LIMITS = Object.freeze({ routines: 10, frames: 8, stack: 32, callsPerFrame: 100000, phaseEvents: 128, renderers: 64, bytes: 256*1024 });
export const EFFECT_REASONS = Object.freeze(['complete','disposed','owner-stopped','external-dispose','aborted','observer-error','retired','foreign-routine','original-render-threw','no-native-frame-progress','installation-failed',
  'clock-error','deadline','foreign-prepare','foreign-render','routine-rejected','routine-incomplete','waiter-restore-failed','late-owner','factory-error','original-prepare-threw','prepare-reentry','standby-overflow','invalid-vehicle']);
export const EFFECT_PHASES = Object.freeze(['active', 'main', 'rtt', 'other']);
export const EFFECT_IDS = Object.freeze(['scene.getActiveMeshCandidates', 'Scene._activeMesh', 'TransformNode.computeWorldMatrix', 'Mesh.getLOD',
  'PBRBaseMaterial.isReadyForSubMesh', 'StandardMaterial.isReadyForSubMesh', 'PBRBaseMaterial.bindForSubMesh', 'StandardMaterial.bindForSubMesh',
  'PBRBaseMaterial._prepareEffect', 'engine.createEffect']);
export const EFFECT_SCOPE = Object.freeze({
  activity: 'Idle admission; after synchronous accepted install, both pending kinds are observed activity. Eight-frame diagnostic completion does not assert renderer health or asynchronous completion.',
  clock: 'Selected synchronous wall time including observer/JIT/GC/scheduling, not GPU execution.',
  nesting: 'One shared ten-target stack; selfSelected subtracts selected children only. Inclusive rows overlap.',
  engine: 'Own engine createEffect only under a selected own-scene material readiness or PBR prepare ancestor. No cache/key inspection or hit/miss claim.',
  residual: 'PBR prepare includes defines/ABI/serialization; readiness residual includes unselected notifications/hot-swap/setEffect. Standard internals are not explained by PBR.',
});
const owners = new WeakMap();
const flags = (a,b) => !!a === !!b && (!a || ['value','get','set','writable','configurable','enumerable'].every(k => a[k] === b[k]));
const rows = () => EFFECT_IDS.flatMap(id => EFFECT_PHASES.map(phase => ({ id, phase, calls: 0, inclusiveMs: 0, selfSelectedMs: 0, falseReturns: 0, nullReturns: 0, throws: 0 })));
// A retained native wrapper must not retain the constructor's validated target
// transaction, which also contains the Scene-owned candidate function.
function methodWrapper(profile,index,original,accepts){return function(){return profile.invoke(index,original,this,arguments,accepts);};}

export class EffectCallProfile {
  hooks = []; frame; disposed = false; errors = 0; restoreConflicts = 0;
  constructor(targets, { now = () => performance.now(), phase = () => 'other' } = {}) {
    if (!Array.isArray(targets) || targets.length !== 10 || targets.some((t,i) => t.id !== EFFECT_IDS[i])) throw Error('Exact ten effect targets required');
    this.now = now; this.phase = phase;
    const checked = targets.map(({target,key,expected,accepts = () => true,allowInherited=false}, i) => {
      const descriptor = Object.getOwnPropertyDescriptor(target,key);
      let resolved=descriptor,prototype=Object.getPrototypeOf(target);
      while(!resolved&&prototype){resolved=Object.getOwnPropertyDescriptor(prototype,key);prototype=Object.getPrototypeOf(prototype);}
      if ((!descriptor&&(!allowInherited||!Object.isExtensible(target))) || !resolved || !Object.hasOwn(resolved,'value') || typeof resolved.value !== 'function' ||
          (descriptor&&!descriptor.configurable&&!descriptor.writable) || resolved.value !== expected || owners.get(target)?.has(key) ||
          targets.slice(0,i).some(t=>t.target===target && t.key===key)) throw Error('Effect native descriptor drift/ownership: '+EFFECT_IDS[i]);
      return {target,key,descriptor,original:resolved.value,accepts};
    });
    try {
      checked.forEach(({target,key,descriptor,original,accepts}, index) => {
        const wrapper=methodWrapper(this,index,original,accepts);
        this.hooks.push({target,key,descriptor,wrapper});
        const keys=owners.get(target)??new Map();keys.set(key,this);owners.set(target,keys);
        Object.defineProperty(target,key,{...(descriptor??{configurable:true,writable:true,enumerable:false}),value:wrapper});
      });
    } catch(error) { this.dispose(); throw error; }
  }
  fail(frame) { frame.errors++;this.errors++; }
  clock(frame) { try { const t=this.now();if(typeof t==='number'&&Number.isFinite(t)&&t>=0)return t; }catch{} this.fail(frame); }
  invoke(index, original, receiver, args, accepts) {
    const frame=this.frame;
    if (!frame || this.disposed) return Reflect.apply(original,receiver,args);
    let accepted=false;try{accepted=accepts(receiver,args);}catch{this.fail(frame);}
    if(index===9) accepted=accepted && frame.foreignMaterialDepth===0 && frame.stack.some(n=>n.index===4||n.index===5||n.index===8);
    if(!accepted){
      // A foreign material nested in a callback cannot borrow an outer own
      // material's engine association. No diagnostic clock/row for passthrough.
      const barrier=index===4||index===5||index===8;
      if(barrier)frame.foreignMaterialDepth++;
      try{return Reflect.apply(original,receiver,args);}finally{if(barrier)frame.foreignMaterialDepth--;}
    }
    if(frame.calls++>=EFFECT_LIMITS.callsPerFrame){frame.callsSkipped++;return Reflect.apply(original,receiver,args);}
    let phase;try{phase=EFFECT_PHASES.indexOf(this.phase());}catch{phase=-1;}
    if(phase<0){this.fail(frame);phase=3;}
    const row=frame.rows[index*4+phase];row.calls++;
    if(frame.stack.length>=EFFECT_LIMITS.stack){frame.depthSkipped++;return Reflect.apply(original,receiver,args);}
    const start=this.clock(frame);if(start===undefined)return Reflect.apply(original,receiver,args);
    const node={index,childMs:0};frame.stack.push(node);let returned=false,result;
    try{result=Reflect.apply(original,receiver,args);returned=true;return result;}
    finally{if(this.frame===frame&&!this.disposed){
      if(!returned)row.throws++;else if(result===false)row.falseReturns++;else if(result===null)row.nullReturns++;
      frame.stack.pop();const end=this.clock(frame);
      if(end!==undefined){if(end<start||end-start<node.childMs)this.fail(frame);const elapsed=Math.max(0,end-start);
        row.inclusiveMs+=elapsed;row.selfSelectedMs+=Math.max(0,elapsed-node.childMs);const parent=frame.stack.at(-1);if(parent)parent.childMs+=elapsed;}
    }}
  }
  beginFrame(frameId) {
    if(this.disposed)return;
    if(this.frame?.stack.length)this.fail(this.frame);
    this.frame={frameId,rows:rows(),errors:0,depthSkipped:0,callsSkipped:0,calls:0,stack:[],foreignMaterialDepth:0};
  }
  ownsHooks() {
    if(this.disposed)return false;
    try{return this.hooks.every(h=>flags(Object.getOwnPropertyDescriptor(h.target,h.key),{...(h.descriptor??{configurable:true,writable:true,enumerable:false}),value:h.wrapper}));}
    catch{return false;}
  }
  endFrame() {
    const f=this.frame;this.frame=undefined;if(!f)return null;
    if(f.stack.length||f.foreignMaterialDepth)this.fail(f);
    return {frameId:f.frameId,rows:f.rows,errors:f.errors,depthSkipped:f.depthSkipped,callsSkipped:f.callsSkipped};
  }
  dispose() {
    if(this.disposed)return;
    this.disposed=true;if(this.frame?.stack.length)this.fail(this.frame);this.frame=undefined;
    for(const h of this.hooks.slice().reverse()){
      try{const d=Object.getOwnPropertyDescriptor(h.target,h.key);
        if(flags(d,{...(h.descriptor??{configurable:true,writable:true,enumerable:false}),value:h.wrapper})){
          if(h.descriptor)Object.defineProperty(h.target,h.key,h.descriptor);else delete h.target[h.key];
        }
        else if(!flags(d,h.descriptor))this.restoreConflicts++;
      }catch{this.errors++;this.restoreConflicts++;}
      const keys=owners.get(h.target);if(keys?.get(h.key)===this)keys.delete(h.key);
    }
    this.hooks.length=0;this.now=this.phase=null;
  }
}

const invalid=Symbol('invalid');
function data(o,k){try{const d=o&&Object.getOwnPropertyDescriptor(o,k);return d&&Object.hasOwn(d,'value')?d.value:invalid;}catch{return invalid;}}
function exact(o,keys){if(!o||typeof o!=='object'||Array.isArray(o))throw Error('Effect object');const proto=Object.getPrototypeOf(o);if(proto!==Object.prototype&&proto!==null)throw Error('Effect object prototype');const names=Reflect.ownKeys(o);
  if(names.length!==keys.length||names.some(k=>!keys.includes(k)))throw Error('Effect closed fields');
  const r={};for(const k of keys){const v=data(o,k);if(v===invalid)throw Error('Effect own data');r[k]=v;}return r;}
function array(o,max){const n=data(o,'length');if(!Array.isArray(o)||!Number.isSafeInteger(n)||n<0||n>max)throw Error('Effect array bounds');
  const proto=Object.getPrototypeOf(o);if(proto!==Array.prototype&&proto!==null)throw Error('Effect array prototype');
  const keys=Reflect.ownKeys(o);if(keys.length!==n+1)throw Error('Effect sparse/extra array');const a=[];
  for(let i=0;i<n;i++){const v=data(o,String(i));if(v===invalid)throw Error('Effect array own data');a.push(v);}return a;}
const count=x=>Number.isSafeInteger(x)&&x>=0;
export function validateEntryEffectProfile(value) {
  const p=exact(value,['schemaVersion','scope','limits','targets','engineOrigin','rendererId','generation','frames','complete','reason','errors','phaseErrors','restoreConflicts','installedRoutineHooks','remainingRoutineHooks','active','firstFailure','pendingAtTerminal']);
  if(p.schemaVersion!==2||!['webgpu-own','thinengine-inherited'].includes(p.engineOrigin)||!count(p.rendererId)||p.rendererId<1||!count(p.generation)||p.generation<1||p.active!==false||typeof p.complete!=='boolean'||
      !EFFECT_REASONS.includes(p.reason)||['errors','phaseErrors','restoreConflicts','installedRoutineHooks','remainingRoutineHooks'].some(k=>!count(p[k]))||p.installedRoutineHooks>10||p.remainingRoutineHooks>10)throw Error('Effect profile scalar');
  const scope=exact(p.scope,Object.keys(EFFECT_SCOPE)),limits=exact(p.limits,Object.keys(EFFECT_LIMITS));
  for(const[k,v]of Object.entries(EFFECT_SCOPE))if(scope[k]!==v)throw Error('Effect scope');
  for(const[k,v]of Object.entries(EFFECT_LIMITS))if(limits[k]!==v)throw Error('Effect limits');
  const targets=array(p.targets,10);if(targets.length!==10||targets.some((x,i)=>x!==EFFECT_IDS[i]))throw Error('Effect targets');
  const frames=array(p.frames,8);
  let previousAfter;const safeFrames=[];
  for(const raw of frames){const f=exact(raw,['frameId','rows','errors','depthSkipped','callsSkipped','nativeFrameIdAfter','progressed','threw','healthBefore','healthAfter']);
    if(['frameId','errors','depthSkipped','callsSkipped'].some(k=>!count(f[k]))||!(f.nativeFrameIdAfter===null||count(f.nativeFrameIdAfter))||typeof f.progressed!=='boolean'||typeof f.threw!=='boolean')throw Error('Effect frame');
    f.healthBefore=validateGuardSample(f.healthBefore);f.healthAfter=validateGuardSample(f.healthAfter);
    if(p.complete&&[f.healthBefore,f.healthAfter].some(h=>!h.dataValid||h.identityMismatchMask||h.phase!=='ready'||h.errorCount||h.rendererId!==p.rendererId||h.generation!==p.generation))throw Error('Effect unhealthy complete frame');
    const rs=array(f.rows,40);if(rs.length!==40)throw Error('Effect row count');
    const safeRows=[];
    for(let i=0;i<40;i++){const r=exact(rs[i],['id','phase','calls','inclusiveMs','selfSelectedMs','falseReturns','nullReturns','throws']);
      if(r.id!==EFFECT_IDS[Math.floor(i/4)]||r.phase!==EFFECT_PHASES[i%4]||['calls','falseReturns','nullReturns','throws'].some(k=>!count(r[k])||r[k]>EFFECT_LIMITS.callsPerFrame)||
          ['inclusiveMs','selfSelectedMs'].some(k=>typeof r[k]!=='number'||!Number.isFinite(r[k])||r[k]<0)||r.selfSelectedMs>r.inclusiveMs||r.falseReturns+r.nullReturns+r.throws>r.calls)throw Error('Effect row');safeRows.push(r);}
    if(p.complete&&(!f.progressed||f.nativeFrameIdAfter!==f.frameId+1||(previousAfter!==undefined&&f.frameId!==previousAfter)||f.threw||f.errors||f.depthSkipped||f.callsSkipped))throw Error('Effect incomplete frame');
    previousAfter=f.nativeFrameIdAfter;
    f.rows=safeRows;safeFrames.push(f);
  }
  const terminal=validateGuardSample(p.pendingAtTerminal);validateGuardFailure(p.firstFailure);
  if(p.firstFailure&&p.firstFailure.source!=='adapter')throw Error('Effect profile witness source');
  if(p.reason!=='complete'&&!p.firstFailure)throw Error('Effect profile missing failure witness');
  if(p.complete&&(p.firstFailure||!terminal.dataValid||terminal.identityMismatchMask||terminal.phase!=='ready'||terminal.errorCount||terminal.rendererId!==p.rendererId||terminal.generation!==p.generation))throw Error('Effect unhealthy complete terminal');
  if(p.complete&&(frames.length!==8||p.reason!=='complete'||p.errors||p.phaseErrors||p.restoreConflicts||p.remainingRoutineHooks||p.installedRoutineHooks!==10))throw Error('Effect incomplete profile');
  p.scope=scope;p.limits=limits;p.targets=targets;p.frames=safeFrames;
  if(JSON.stringify(p).length>EFFECT_LIMITS.bytes)throw Error('Effect byte bound');
  return value;
}
