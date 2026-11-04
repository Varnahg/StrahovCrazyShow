import fs from 'node:fs';
const base='.cache/webgpu-completion-20261021/entry-effect-cost/helper/v20/';
function edit(file,fn){fs.writeFileSync(base+file,fn(fs.readFileSync(base+file,'utf8')));}
function replace(s,a,b){if(s.split(a).length!==2)throw Error('Exact edit '+a.slice(0,100));return s.replace(a,b);}
const extraReasons=['deadline','clock-error','foreign-prepare','foreign-render','foreign-routine','frame-correlation','original-render-threw','original-prepare-threw','prepare-reentry','standby-overflow','installation-failed','factory-error','routine-incomplete','routine-rejected','waiter-restore-failed','no-native-frame-progress','owner-stopped','external-dispose','late-owner','routine-rejected','scene-disposed'];
edit('entry-effect-guard.mjs',s=>s.replace("'observer-error']);","'observer-error',"+[...new Set(extraReasons)].map(x=>JSON.stringify(x)).join(',')+"]);"));
let trigger=fs.readFileSync(base+'entry-routine-cost.mjs','utf8');
trigger="import { inspectEffectGuard, validateGuardFailure, validateGuardSample, closed, GUARD_CODES, SAMPLE_KEYS } from './entry-effect-guard.mjs';\nimport { validateEntryTrigger, ENTRY_ROUTINE_SCOPE } from './entry-routine-cost.mjs';\n"+trigger;
trigger=trigger.slice(0,trigger.indexOf('\nexport function validateEntryTrigger('));
trigger=trigger.replaceAll('ENTRY_ROUTINE_SCOPE','ENTRY_EFFECT_TRIGGER_SCOPE').replace('validateEntryTrigger, ENTRY_EFFECT_TRIGGER_SCOPE','validateEntryTrigger, ENTRY_ROUTINE_SCOPE');
trigger=replace(trigger,'export function captureEntryRoutineCost','export function captureEntryEffectTrigger');
trigger=replace(trigger,"export const ENTRY_EFFECT_TRIGGER_SCOPE = 'First observed accepted foot-to-vehicle at outer prepare; restore waiter then synchronously install original8 routine capture. Install time is not Scene start; selected wall times include instrument overhead, never GPU/FPS/coldness proof.';","export const ENTRY_EFFECT_TRIGGER_SCOPE = 'Accepted foot-to-vehicle; idle admission and synchronous install, then eight consecutive original renders permitting pending preparation and shader-validation activity. Diagnostic completion is not renderer health/FPS/async acceptance.';");
trigger=replace(trigger,"const pendingClear = health => { const p = data(health, 'pendingByKind'); return data(p, 'preparation') === 0 && data(p, 'shader-validation') === 0; };",'');
trigger=replace(trigger,'profileOwner: null, timer: null, detach: null };','profileOwner: null, timer: null, detach: null, signal };');
trigger=replace(trigger,'let installed, inside = 0, installing = true','state.rendererId=rendererId;state.generation=generation;\n  let installed, inside = 0, installing = true');
trigger=replace(trigger,'const meta = { schemaVersion: 1','const meta = { schemaVersion: 2');
trigger=replace(trigger,'installedWaiterHooks: 0, remainingWaiterHooks: 0 };','installedWaiterHooks: 0, remainingWaiterHooks: 0, firstFailure:null, pendingAtTerminal:null };');
const hStart=trigger.indexOf('  function healthCurrent() {'),hEnd=trigger.indexOf('  function check(at) {',hStart);
trigger=trigger.slice(0,hStart)+trigger.slice(hEnd);
trigger=replace(trigger,'function check(at) {',"function check(at,boundary='before-render',requireIdle=false) {");
trigger=replace(trigger,"if (!healthCurrent() || (phase === 'capturing' && state.actor.vehicle !== true)) { stop('retired', at); return false; }",`const inspected=inspectEffectGuard(state,{source:'trigger',boundary,atMs:at,allowPending:phase==='capturing'&&meta.captureInstalledAtMs!==null&&!requireIdle,requireVehicle:phase==='capturing'});
      if(inspected.failure){meta.firstFailure??=inspected.failure;stop('retired',at);return false;}`);
trigger=replace(trigger,"state.active = false; meta.active = false; meta.reason = reason; meta.terminalAtMs = at === undefined ? clock() : at;",`const terminalTime=at===undefined?clock():at;
    const observed=inspectEffectGuard(state,{source:'trigger',boundary:'terminal',atMs:terminalTime,allowPending:true,requireVehicle:phase==='capturing'});
    meta.pendingAtTerminal=observed.sample;
    if(reason!=='complete')meta.firstFailure??=observed.failure??{source:'trigger',boundary:'terminal',code:GUARD_CODES.includes(reason)?reason:'observer-error',atMs:terminalTime,frameId:count(data(state.scene,'_frameId'))?data(state.scene,'_frameId'):null,...observed.sample};
    state.active = false; meta.active = false; meta.reason = reason; meta.terminalAtMs = terminalTime;`);
trigger=replace(trigger,"meta.complete = reason === 'complete' && !meta.errors", "meta.complete = reason === 'complete' && !meta.firstFailure && !meta.errors");
trigger=replace(trigger,'state.isCurrent = state.factory = state.profileOwner = state.detach = null; state.timer = null; game = null;','state.isCurrent = state.factory = state.profileOwner = state.detach = state.signal = null; state.timer = null; game = signal = expected = startCapture = now = setTimer = clearTimer = null;');
trigger=replace(trigger,'const at = clock(); if (!check(at)) return;','const at = clock(); if (!check(at,\'terminal\')) return;');
trigger=replace(trigger,'check(meta.captureInstalledAtMs);',"check(meta.captureInstalledAtMs,'installed',true);");
trigger=replace(trigger,'if (!check(meta.armedAtMs)) return owner;',"if (!check(meta.armedAtMs,'arm',true)) return owner;");
trigger=replace(trigger,'if (check(at)) {',"if (check(at,state.actor.vehicle===true?'trigger':'arm',true)) {");
trigger+=`
const baseKeys='schemaVersion,scope,limits,active,complete,reason,armedAtMs,deadlineAtMs,triggeredAtMs,captureInstalledAtMs,terminalAtMs,vehicleAtArm,vehicleAtTrigger,vehicleAtTerminal,sceneFrameIdAtTrigger,engineFrameIdAtTrigger,sceneFrameIdAtTerminal,engineFrameIdAtTerminal,rendererId,generation,standbyCalls,errors,restoreConflicts,installedWaiterHooks,remainingWaiterHooks'.split(',');
export function validateEntryEffectTrigger(value,profile){
  const p=closed(value,[...baseKeys,'firstFailure','pendingAtTerminal']);
  if(p.schemaVersion!==2||p.scope!==ENTRY_EFFECT_TRIGGER_SCOPE)throw Error('Effect trigger schema/scope');
  const original=Object.fromEntries(baseKeys.map(k=>[k,p[k]]));original.schemaVersion=1;original.scope=ENTRY_ROUTINE_SCOPE;validateEntryTrigger(original,profile);
  validateGuardFailure(p.firstFailure);const terminal=validateGuardSample(p.pendingAtTerminal);
  if(p.firstFailure&&p.firstFailure.source!=='trigger')throw Error('Effect trigger witness source');
  if(p.complete&&(p.firstFailure||!terminal.dataValid||terminal.identityMismatchMask||terminal.phase!=='ready'||terminal.errorCount))throw Error('Effect trigger false complete');
  if(p.firstFailure&&p.firstFailure.atMs!==null&&p.terminalAtMs!==null&&p.firstFailure.atMs>p.terminalAtMs)throw Error('Effect trigger witness time');
  return value;
}
`;
fs.writeFileSync(base+'entry-effect-trigger.mjs',trigger);
edit('entry-effect-cost.mjs',s=>{
 s="import { effectContext, inspectEffectGuard, GUARD_CODES, count, time } from './entry-effect-guard.mjs';\n"+s;
 s=replace(s,'const state={game,scene,engine,health:game.renderHealth,device:engine._device,startup:game.startupAbort,actor:game.actor,retired:isRetired,signal};game=null;isRetired=null;signal=null;',`const state={...effectContext(game,{signal,rendererId,generation}),retired:isRetired};
  const admission=inspectEffectGuard(state,{source:'adapter',boundary:'installed',allowPending:false});
  if(admission.failure)throw Error('Effect capture admission '+admission.failure.code);
  game=null;isRetired=null;signal=null;`);
 s=replace(s,'reason=null,sealed;','reason=null,sealed,firstFailure=null,pendingAtTerminal=null;');
 s=replace(s,'schemaVersion:1,scope:EFFECT_SCOPE','schemaVersion:2,scope:EFFECT_SCOPE');
 s=replace(s,"complete:closed&&reason==='complete'", "firstFailure,pendingAtTerminal,complete:closed&&reason==='complete'&&!firstFailure");
 s=replace(s,"function stop(why){if(closed)return;closed=true;reason=EFFECT_REASONS.includes(why)?why:'external-dispose';core?.dispose();",`function guardTime(){try{const at=(now??(()=>performance.now()))();return time(at)?at:null;}catch{return null;}}
  function stop(why){if(closed)return;
    const observed=inspectEffectGuard(state,{source:'adapter',boundary:'terminal',atMs:guardTime(),allowPending:true});pendingAtTerminal=observed.sample;
    if(why!=='complete')firstFailure??=observed.failure??{source:'adapter',boundary:'terminal',code:GUARD_CODES.includes(why)?why:'observer-error',atMs:guardTime(),frameId:count(state.scene?._frameId)?state.scene._frameId:null,...observed.sample};
    closed=true;reason=EFFECT_REASONS.includes(why)?why:'external-dispose';core?.dispose();`);
 s=replace(s,'state.game=state.scene=state.engine=state.health=state.device=state.startup=state.actor=state.retired=state.signal=null;','for(const key of Object.keys(state))state[key]=null;now=null;');
 const start=s.indexOf('    let retired;try{retired='),end=s.indexOf('    if(rendering)',start);
 s=s.slice(0,start)+`    try{if(state.retired()){stop('retired');return Reflect.apply(nativeRender,this,arguments);}}
    catch{phaseErrors++;stop('observer-error');return Reflect.apply(nativeRender,this,arguments);}
    const beforeGuard=inspectEffectGuard(state,{source:'adapter',boundary:'before-render',atMs:guardTime(),allowPending:true});
    if(beforeGuard.failure){firstFailure??=beforeGuard.failure;stop('retired');return Reflect.apply(nativeRender,this,arguments);}
`+s.slice(end);
 s=replace(s,'const f=core.endFrame(),after=state.scene._frameId;','const f=core.endFrame(),after=state.scene._frameId;const afterGuard=inspectEffectGuard(state,{source:\'adapter\',boundary:\'after-render\',atMs:guardTime(),allowPending:true});f.healthBefore=beforeGuard.sample;f.healthAfter=afterGuard.sample;');
 s=replace(s,"if(threw)stop('original-render-threw');else if(!f.progressed)","if(threw)stop('original-render-threw');else if(afterGuard.failure){firstFailure??=afterGuard.failure;stop('retired');}else if(!f.progressed)");
 return s;
});
edit('entry-effect-cost-core.mjs',s=>{
 s="import { validateGuardFailure, validateGuardSample } from './entry-effect-guard.mjs';\n"+s;
 s=replace(s,"'remainingRoutineHooks','active']);","'remainingRoutineHooks','active','firstFailure','pendingAtTerminal']);");
 s=replace(s,'if(p.schemaVersion!==1','if(p.schemaVersion!==2');
 s=replace(s,"'nativeFrameIdAfter','progressed','threw']);","'nativeFrameIdAfter','progressed','threw','healthBefore','healthAfter']);");
 s=replace(s,'const rs=array(f.rows,40);',`f.healthBefore=validateGuardSample(f.healthBefore);f.healthAfter=validateGuardSample(f.healthAfter);
    if(p.complete&&[f.healthBefore,f.healthAfter].some(h=>!h.dataValid||h.identityMismatchMask||h.phase!=='ready'||h.errorCount||h.rendererId!==p.rendererId||h.generation!==p.generation))throw Error('Effect unhealthy complete frame');
    const rs=array(f.rows,40);`);
 s=replace(s,"if(p.complete&&(frames.length!==8",`const terminal=validateGuardSample(p.pendingAtTerminal);validateGuardFailure(p.firstFailure);
  if(p.firstFailure&&p.firstFailure.source!=='adapter')throw Error('Effect profile witness source');
  if(p.complete&&(p.firstFailure||!terminal.dataValid||terminal.identityMismatchMask||terminal.phase!=='ready'||terminal.errorCount||terminal.rendererId!==p.rendererId||terminal.generation!==p.generation))throw Error('Effect unhealthy complete terminal');
  if(p.complete&&(frames.length!==8`);
 return s;
});
edit('qa-overlay.mjs',s=>{
 s="import { captureEntryEffectTrigger } from 'virtual:webgpu-completion-entry-effect-trigger';\n"+s;
 return replace(s,'entryEffectOwner = captureEntryRoutineCost(gameRef','entryEffectOwner = captureEntryEffectTrigger(gameRef');
});
edit('receipt.mjs',s=>{
 s="import { validateEntryEffectTrigger } from './entry-effect-trigger.mjs';\n"+s;
 return replace(s,'else{validateEntryTrigger(value.entryTrigger,value.entryEffectProfile);','else{validateEntryEffectTrigger(value.entryTrigger,value.entryEffectProfile);');
});
edit('harness.mjs',s=>{
 s=replace(s,"const entryEffectCore = await readFile(join(helperDirectory, 'entry-effect-cost-core.mjs'), 'utf8');",`const entryEffectGuard = await readFile(join(helperDirectory,'entry-effect-guard.mjs'),'utf8');
    const entryEffectTrigger = (await readFile(join(helperDirectory,'entry-effect-trigger.mjs'),'utf8')).replace("'./entry-effect-guard.mjs'","'virtual:webgpu-completion-entry-effect-guard'").replace("'./entry-routine-cost.mjs'","'virtual:webgpu-completion-entry-routine'");
    const entryEffectCore = (await readFile(join(helperDirectory, 'entry-effect-cost-core.mjs'), 'utf8')).replace("'./entry-effect-guard.mjs'","'virtual:webgpu-completion-entry-effect-guard'");`);
 s=replace(s,`.replace("'./entry-effect-cost-core.mjs'", "'virtual:webgpu-completion-entry-effect-core'");`,`.replace("'./entry-effect-cost-core.mjs'", "'virtual:webgpu-completion-entry-effect-core'").replace("'./entry-effect-guard.mjs'","'virtual:webgpu-completion-entry-effect-guard'");`);
 s=replace(s,"resolveId(id) {","resolveId(id) {\n          if (id === 'virtual:webgpu-completion-entry-effect-trigger') return '\\0virtual:webgpu-completion-entry-effect-trigger';\n          if (id === 'virtual:webgpu-completion-entry-effect-guard') return '\\0virtual:webgpu-completion-entry-effect-guard';");
 return replace(s,'load(id) {',"load(id) {\n          if (id === '\\0virtual:webgpu-completion-entry-effect-trigger') return entryEffectTrigger;\n          if (id === '\\0virtual:webgpu-completion-entry-effect-guard') return entryEffectGuard;");
});
edit('common.mjs',s=>replace(s,"'entry-effect-cost.test.mjs', 'README.md'","'entry-effect-cost.test.mjs', 'entry-effect-guard.mjs', 'entry-effect-trigger.mjs', 'pending-capture.test.mjs', 'README.md'"));
// Only metadata/import seams in copied fixtures follow the new pack. Original runtime modules remain exact.
for(const file of ['entry-render-cost.test.mjs','entry-routine-cost.test.mjs','pipeline-input-window.test.mjs','preparation-summary.test.mjs','entry-effect-cost.test.mjs'])edit(file,s=>s.replaceAll('files).length,39','files).length,42').replaceAll('files).length, 39','files).length, 42').replaceAll('sourceFiles.length,39','sourceFiles.length,42'));
edit('helper.test.mjs',s=>replace(s,"['entry-effects', 'entry-effect-cost.mjs']]","['entry-effects', 'entry-effect-cost.mjs'], ['entry-effect-trigger', 'entry-effect-trigger.mjs']]"));
edit('entry-effect-cost.test.mjs',s=>{
 s="import { captureEntryEffectTrigger, validateEntryEffectTrigger } from './entry-effect-trigger.mjs';\n"+s;
 // This file owns the new effect action; historical standalone waiter tests remain in the legacy file.
 s=s.replaceAll('captureEntryRoutineCost(f.game,f.options)','captureEntryEffectTrigger(f.game,f.options)').replaceAll('validateEntryTrigger(result.entryTrigger,result.routineProfile)','validateEntryEffectTrigger(result.entryTrigger,result.routineProfile)');
 s=replace(s,'captureEntryRoutineCost:(g,o)=>captureEntryRoutineCost(g,','captureEntryEffectTrigger:(g,o)=>captureEntryEffectTrigger(g,');
 s=replace(s,",pending:f=>f.game.renderHealth.pendingByKind.preparation++",'');
 // Reverse-to-donor metadata table tracks this copied pack count.
 s=s.replaceAll("files).length,39)","files).length,42)").replaceAll("files).length, 39'","files).length, 42'");
 return s;
});
