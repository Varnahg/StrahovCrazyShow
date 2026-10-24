/** Closed scalar liveness evidence. Pending is activity after admission, not identity. */
export const GUARD_SOURCES=Object.freeze(['trigger','adapter']);
export const GUARD_BOUNDARIES=Object.freeze(['arm','trigger','installed','before-render','after-render','terminal']);
export const GUARD_IDENTITIES=Object.freeze(['current','actor','scene','engine','device','health','budget','stable','startup','renderer','generation']);
export const GUARD_CODES=Object.freeze(['invalid-data',...GUARD_IDENTITIES.map(k=>'identity-'+k),'aborted','disposed','game-not-ready','health-phase','health-error','pending-admission','benchmark','quality-preparation','presentation-lease','vehicle','observer-error','invalid-vehicle',"deadline","clock-error","foreign-prepare","foreign-render","foreign-routine","frame-correlation","original-render-threw","original-prepare-threw","prepare-reentry","standby-overflow","installation-failed","factory-error","routine-incomplete","routine-rejected","waiter-restore-failed","no-native-frame-progress","owner-stopped","external-dispose","late-owner","scene-disposed"]);
export const SAMPLE_KEYS=Object.freeze(['rendererId','generation','phase','errorCount','pendingPreparation','pendingShaderValidation','identityMismatchMask','dataValid']);
export const FAILURE_KEYS=Object.freeze(['source','boundary','code','atMs','frameId',...SAMPLE_KEYS]);
export const count=x=>Number.isSafeInteger(x)&&x>=0;
export const time=x=>typeof x==='number'&&Number.isFinite(x)&&x>=0;
const invalid=Symbol('invalid');
export function own(o,k){try{if(o==null)return undefined;const d=Object.getOwnPropertyDescriptor(o,k);return !d?undefined:Object.hasOwn(d,'value')?d.value:invalid;}catch{return invalid;}}
export function closed(o,keys){if(!o||typeof o!=='object'||Array.isArray(o)||![Object.prototype,null].includes(Object.getPrototypeOf(o)))throw Error('Effect closed object');
  const names=Reflect.ownKeys(o);if(names.length!==keys.length||names.some(k=>!keys.includes(k)))throw Error('Effect closed fields');const r={};
  for(const k of keys){const d=Object.getOwnPropertyDescriptor(o,k);if(!d||!Object.hasOwn(d,'value'))throw Error('Effect own data');r[k]=d.value;}return r;}
const phases=['preparing','ready','invalid','restart-required','disposed'];
export function validateGuardSample(value){const p=closed(value,SAMPLE_KEYS);
  if(typeof p.dataValid!=='boolean'||!count(p.identityMismatchMask)||p.identityMismatchMask>=2**GUARD_IDENTITIES.length||
    ![null,...phases].includes(p.phase)||['rendererId','generation','errorCount','pendingPreparation','pendingShaderValidation'].some(k=>p[k]!==null&&!count(p[k])))throw Error('Effect guard sample');
  if(p.dataValid&&(!p.rendererId||!p.generation||p.phase===null||['errorCount','pendingPreparation','pendingShaderValidation'].some(k=>p[k]===null)))throw Error('Effect guard valid data');return p;}
export function validateGuardFailure(value){if(value===null)return null;const p=closed(value,FAILURE_KEYS);validateGuardSample(Object.fromEntries(SAMPLE_KEYS.map(k=>[k,p[k]])));
  if(!GUARD_SOURCES.includes(p.source)||!GUARD_BOUNDARIES.includes(p.boundary)||!GUARD_CODES.includes(p.code)||!(p.atMs===null||time(p.atMs))||!(p.frameId===null||count(p.frameId)))throw Error('Effect guard witness');return p;}
export function effectContext(game,{isCurrent=()=>true,signal,rendererId,generation}={}){const health=own(game,'renderHealth');return{game,scene:own(game,'scene'),engine:own(game,'engine'),health,actor:own(game,'actor'),budget:own(game,'gltfLightBudget'),stable:own(game,'stableLights'),startup:own(game,'startupAbort'),device:own(own(game,'engine'),'_device'),isCurrent,signal,rendererId:rendererId??own(health,'rendererId'),generation:generation??own(health,'generation')};}
export function inspectEffectGuard(s,{source,boundary,atMs=null,allowPending=false,requireVehicle=false}={}){
  const p=own(s.health,'pendingByKind'),raw={rendererId:own(s.health,'rendererId'),generation:own(s.health,'generation'),phase:own(s.health,'phase'),errorCount:own(s.health,'errorCount'),pendingPreparation:own(p,'preparation'),pendingShaderValidation:own(p,'shader-validation')};
  let mask=0,observerError=false,current=false;
  try{current=s.isCurrent()===true;}catch{observerError=true;}
  const same=[current,own(s.game,'actor')===s.actor,own(s.game,'scene')===s.scene,own(s.game,'engine')===s.engine&&own(s.scene,'_engine')===s.engine,own(s.engine,'_device')===s.device,own(s.game,'renderHealth')===s.health,own(s.game,'gltfLightBudget')===s.budget,own(s.game,'stableLights')===s.stable,own(s.game,'startupAbort')===s.startup,raw.rendererId===s.rendererId,raw.generation===s.generation];
  same.forEach((v,i)=>{if(!v)mask|=2**i;});
  const dataValid=count(raw.rendererId)&&raw.rendererId>0&&count(raw.generation)&&raw.generation>0&&phases.includes(raw.phase)&&['errorCount','pendingPreparation','pendingShaderValidation'].every(k=>count(raw[k]));
  const sample={...Object.fromEntries(Object.entries(raw).map(([k,v])=>[k,k==='phase'?(phases.includes(v)?v:null):(count(v)?v:null)])),identityMismatchMask:mask,dataValid};
  let code=null;
  const flags=['disposed','ready','rendererFailed','benchmark','preparingRenderQuality','startupPresentationLease'].map(k=>own(s.game,k));
  if(!dataValid||p===invalid||flags.includes(invalid)||[own(s.scene,'_isDisposed'),own(s.engine,'_isDisposed')].includes(invalid))code='invalid-data';
  else if(observerError)code='observer-error';
  else if(mask)code='identity-'+GUARD_IDENTITIES[same.findIndex(v=>!v)];
  else{try{if(s.signal?.aborted||s.startup?.signal.aborted)code='aborted';}catch{code='invalid-data';}
    if(!code){if(flags[0]||own(s.scene,'_isDisposed')||own(s.engine,'_isDisposed'))code='disposed';else if(flags[1]!==true||flags[2])code='game-not-ready';
      else if(raw.errorCount)code='health-error';else if(raw.phase!=='ready')code='health-phase';else if(!allowPending&&(raw.pendingPreparation||raw.pendingShaderValidation))code='pending-admission';
      else if(flags[3])code='benchmark';else if(flags[4])code='quality-preparation';else if(flags[5])code='presentation-lease';else if(requireVehicle&&own(s.actor,'vehicle')!==true)code='vehicle';}}
  const frame=own(s.scene,'_frameId');
  return{sample,failure:code?{source,boundary,code,atMs:time(atMs)?atMs:null,frameId:count(frame)?frame:null,...sample}:null};
}
