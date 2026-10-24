/** The diagnostic observer must never replace the original startup rejection.
 * No renderer/readiness call is made here. onTerminal runs before UI teardown. */
export async function observeOperation(operation, { onBegin, onTerminal, onObserverError = () => {} }) {
  const safely = callback => {
    try { callback(); } catch (error) { try { onObserverError(error); } catch {} }
  };
  safely(onBegin);
  let value;
  try { value = await operation(); }
  catch (error) {
    safely(() => onTerminal('rejected', error));
    throw error;
  }
  safely(() => onTerminal('resolved'));
  return value;
}

// Result-only QA evidence. No stages, resource objects or caller strings escape.
const QUALITY_LIMIT = 16;
const MISSING = Symbol('missing own data');
const NATIVE_PROMISE = Promise;
const NATIVE_THEN = Promise.prototype.then;
const NATIVE_SPECIES = Object.getOwnPropertyDescriptor(Promise, Symbol.species);
const STATUSES = ['complete', 'timeout', 'disposed', 'failed'];
const FAILURE_STEPS = ['apply', 'meshes', 'check', 'effects', 'render', 'restore', 'cleanup', 'lifecycle'];
function ownData(value, key) {
  try {
    const descriptor = value != null && Object.getOwnPropertyDescriptor(value, key);
    return descriptor && Object.hasOwn(descriptor, 'value') ? descriptor.value : MISSING;
  } catch { return MISSING; }
}
function arrayLength(value) {
  try {
    const length = Array.isArray(value) ? ownData(value, 'length') : MISSING;
    return Number.isSafeInteger(length) && length >= 0 ? length : null;
  } catch { return null; }
}
const unavailable = reason => ({ available: false, reason });
export const STAGE_LIMITS = Object.freeze({ passes: 16, rows: 304, bytes: 256 * 1024 });
const INVALID = Symbol('invalid own data');
const STAGE_NAMES = ['vehicle-0','vehicle-1','vehicle-2','vehicle-keyed-0','vehicle-keyed-1','vehicle-keyed-2',
  'current-off','current-on','night-0-off','night-0-on','night-1-off','night-1-on','night-2-off','night-2-on',
  'day-0-off','day-0-on','day-1-off','day-1-on','restore'];
const QUALITY_NAMES = ['low','medium','high'];
const RESTART_NAMES = ['quality','timeOverride','profile','weather','meshes','materials','car','parkedCar','carDisposed',
  'parkedCarDisposed','vegetation','grassResources','startupView','presentationCoverage','revision-length'];
const STAGE_REASONS = ['no-result','stages-unavailable','not-observed','original-rejected','not-installed','projection-error',
  'owner-identity-unavailable','missing-method','unsupported-promise','non-native-promise','observer-unavailable'];
const MAP_REASONS = ['valid','qualities-unavailable','invalid-quality-layout','pass-limit','stage-total-mismatch','pass-quality-mismatch','truncated'];
const finiteTime = x => typeof x === 'number' && Number.isFinite(x) && x >= 0;
const finiteCount = x => Number.isSafeInteger(x) && x >= 0;
const stageUnavailable = reason => ({ schemaVersion: 1, available: false, reason });
function stageData(object, key) {
  try {
    const d = object != null && Object.getOwnPropertyDescriptor(object, key);
    return !d ? MISSING : Object.hasOwn(d, 'value') ? d.value : INVALID;
  } catch { return INVALID; }
}
function mappingReason(mapping, stageCount, rows, truncated) {
  if (mapping.passCount === null) return mapping.reason === 'qualities-unavailable' ? 'qualities-unavailable' : 'invalid-quality-layout';
  if (mapping.passCount > STAGE_LIMITS.passes) return 'pass-limit';
  if (mapping.qualities.length !== mapping.passCount || mapping.stageCounts.length !== mapping.passCount ||
      mapping.qualities.some(x => !QUALITY_NAMES.includes(x)) || mapping.stageCounts.some(x => !finiteCount(x) || x > 19)) return 'invalid-quality-layout';
  if (mapping.stageCounts.reduce((a,b)=>a+b,0) !== stageCount) return 'stage-total-mismatch';
  let pass = 0, end = mapping.stageCounts[0] ?? 0;
  for (const row of rows) {
    while (pass < mapping.passCount && row.index >= end) end += mapping.stageCounts[++pass] ?? 0;
    if (row.passQuality !== mapping.qualities[pass]) return 'pass-quality-mismatch';
  }
  return truncated ? 'truncated' : 'valid';
}

/** One bounded copy of existing result scalars. No raw object enumeration,
 * getter, shader/resource string, readiness call or original result reference. */
export function projectPreparationStages(value) {
  if (value == null || (typeof value !== 'object' && typeof value !== 'function')) return stageUnavailable('no-result');
  const stages = stageData(value, 'stages'), stageCount = arrayLength(stages);
  if (stageCount === null) return stageUnavailable('stages-unavailable');
  let invalidFields = 0;
  const scalar = (object,key,valid) => { const x = stageData(object,key); if (valid(x)) return x; invalidFields++; return null; };
  const status = scalar(value,'status',x=>STATUSES.includes(x));
  const failureStep = scalar(value,'failureStep',x=>x===null||FAILURE_STEPS.includes(x));
  const rawQualities = stageData(value,'qualities'), passCount = arrayLength(rawQualities);
  const mapping = { valid: false, reason: rawQualities === MISSING ? 'qualities-unavailable' : 'invalid-quality-layout',
    passCount, qualities: [], stageCounts: [] };
  if (rawQualities !== MISSING && passCount === null) invalidFields++;
  for (let i=0;i<Math.min(passCount ?? 0,STAGE_LIMITS.passes);i++) {
    const q=stageData(rawQualities,String(i));
    mapping.qualities.push(scalar(q,'quality',x=>QUALITY_NAMES.includes(x)));
    mapping.stageCounts.push(scalar(q,'stageCount',x=>finiteCount(x)&&x<=19));
  }
  const out = { schemaVersion:1, available:true, status, failureStep, stageCount, capturedCount:0, truncated:false,
    byteLimited:false, valid:false, invalidFields:0, restartReasonsScope:'game-revision-whitelist', mapping, rows:[] };
  // Reserve a fixed header allowance. All exported text is closed ASCII and
  // the at-most16-pass header is under4096 bytes, including final flags.
  let bytes=4096;
  for(let i=0;i<Math.min(stageCount,STAGE_LIMITS.rows);i++) {
    const before=invalidFields, input=stageData(stages,String(i));
    const passQuality=stageData(input,'passQuality');
    const quality = passQuality === MISSING && rawQualities === MISSING ? null : scalar(input,'passQuality',x=>QUALITY_NAMES.includes(x));
    const row={index:i,passIndex:null,passQuality:quality,stage:scalar(input,'stage',x=>STAGE_NAMES.includes(x))};
    for(const key of ['elapsedMs','activeElapsedMs','pausedMs']) row[key]=scalar(input,key,finiteTime);
    for(const key of ['tickCount','checks','renders','restarts']) row[key]=scalar(input,key,finiteCount);
    row.cpu={}; const cpu=stageData(input,'cpu');
    for(const key of ['apply','checkBatch','render']) {
      const source=stageData(cpu,key);
      row.cpu[key]={calls:scalar(source,'calls',finiteCount),totalMs:scalar(source,'totalMs',finiteTime),maxMs:scalar(source,'maxMs',finiteTime)};
    }
    const gap=stageData(input,'rafGap');
    row.rafGap={count:scalar(gap,'count',finiteCount),totalMs:scalar(gap,'totalMs',finiteTime),maxMs:scalar(gap,'maxMs',finiteTime)};
    row.restartReasons={}; const reasons=stageData(input,'restartReasons');
    if(!reasons || typeof reasons!=='object' || reasons===INVALID) invalidFields++;
    else for(const key of RESTART_NAMES) {
      const count=stageData(reasons,key);
      if(count===MISSING)continue;
      if(finiteCount(count)) row.restartReasons[key]=count;
      else {row.restartReasons[key]=null;invalidFields++;}
    }
    row.invalidFields=invalidFields-before;row.valid=row.invalidFields===0;
    const length=JSON.stringify(row).length+1;
    if(bytes+length>STAGE_LIMITS.bytes){invalidFields=before;out.byteLimited=true;break;}
    bytes+=length;out.rows.push(row);
  }
  out.capturedCount=out.rows.length;out.truncated=out.capturedCount<stageCount;
  mapping.reason=mappingReason(mapping,stageCount,out.rows,out.truncated);mapping.valid=mapping.reason==='valid';
  if(mapping.valid){let pass=0,end=mapping.stageCounts[0]??0;for(const row of out.rows){while(row.index>=end)end+=mapping.stageCounts[++pass]??0;row.passIndex=pass;}}
  out.invalidFields=invalidFields;out.valid=invalidFields===0;
  return out;
}

// Transport validation reads descriptors into a closed scalar copy before any
// serialization. A hostile getter/toJSON cannot execute as validation work.
function closedData(value,keys) {
  if(!value||typeof value!=='object'||Array.isArray(value))throw Error('Stage object missing');
  const names=Reflect.ownKeys(value);
  if(names.length!==keys.length||names.some(k=>typeof k!=='string'||!keys.includes(k)))throw Error('Stage object fields');
  const copy={};for(const key of keys){const x=stageData(value,key);if(x===MISSING||x===INVALID)throw Error('Stage own data missing');copy[key]=x;}return copy;
}
function closedArray(value,max) {
  const n=arrayLength(value);if(n===null||n>max)throw Error('Stage array bounds');
  const keys=Reflect.ownKeys(value);if(keys.length!==n+1||keys.some(k=>k!=='length'&&(!/^(0|[1-9][0-9]*)$/.test(String(k))||Number(k)>=n)))throw Error('Stage array fields');
  const rows=[];for(let i=0;i<n;i++){const x=stageData(value,String(i));if(x===MISSING||x===INVALID)throw Error('Stage sparse/getter array');rows.push(x);}return rows;
}
export function validatePreparationStages(value) {
  if(stageData(value,'available')===false){const p=closedData(value,['schemaVersion','available','reason']);if(p.schemaVersion!==1||!STAGE_REASONS.includes(p.reason))throw Error('Stage unavailable schema');return value;}
  const p=closedData(value,['schemaVersion','available','status','failureStep','stageCount','capturedCount','truncated','byteLimited','valid','invalidFields','restartReasonsScope','mapping','rows']);
  if(p.schemaVersion!==1||p.available!==true||!finiteCount(p.stageCount)||!finiteCount(p.capturedCount)||p.capturedCount>STAGE_LIMITS.rows||
      p.restartReasonsScope!=='game-revision-whitelist'||typeof p.truncated!=='boolean'||typeof p.byteLimited!=='boolean'||
      !finiteCount(p.invalidFields)||p.valid!==(p.invalidFields===0)||!(p.status===null||STATUSES.includes(p.status))||
      !(p.failureStep===null||FAILURE_STEPS.includes(p.failureStep))||(p.status===null&&p.invalidFields===0))throw Error('Stage scalar schema');
  const m=closedData(p.mapping,['valid','reason','passCount','qualities','stageCounts']);
  if(typeof m.valid!=='boolean'||!MAP_REASONS.includes(m.reason)||!(m.passCount===null||finiteCount(m.passCount)))throw Error('Stage mapping schema');
  m.qualities=closedArray(m.qualities,STAGE_LIMITS.passes);m.stageCounts=closedArray(m.stageCounts,STAGE_LIMITS.passes);
  if(m.qualities.length!==Math.min(m.passCount??0,16)||m.stageCounts.length!==m.qualities.length||
      m.qualities.some(x=>x!==null&&!QUALITY_NAMES.includes(x))||m.stageCounts.some(x=>x!==null&&(!finiteCount(x)||x>19)))throw Error('Stage mapping bounds');
  p.rows=closedArray(p.rows,STAGE_LIMITS.rows).map((raw,index)=>{
    const r=closedData(raw,['index','passIndex','passQuality','stage','elapsedMs','activeElapsedMs','pausedMs','tickCount','checks','renders','restarts','cpu','rafGap','restartReasons','invalidFields','valid']);
    if(r.index!==index||!(r.passIndex===null||finiteCount(r.passIndex))||!(r.passQuality===null||QUALITY_NAMES.includes(r.passQuality))||!(r.stage===null||STAGE_NAMES.includes(r.stage))||
        !finiteCount(r.invalidFields)||r.valid!==(r.invalidFields===0))throw Error('Stage row schema');
    let invalid=0;const numeric=(x,valid)=>{if(x===null){invalid++;return;}if(!valid(x))throw Error('Stage numeric scalar');};
    for(const k of ['elapsedMs','activeElapsedMs','pausedMs'])numeric(r[k],finiteTime);
    for(const k of ['tickCount','checks','renders','restarts'])numeric(r[k],finiteCount);
    if(r.stage===null)invalid++;
    if(r.passQuality===null&&m.reason!=='qualities-unavailable')invalid++;
    r.cpu=closedData(r.cpu,['apply','checkBatch','render']);
    for(const k of ['apply','checkBatch','render']){const t=closedData(r.cpu[k],['calls','totalMs','maxMs']);numeric(t.calls,finiteCount);numeric(t.totalMs,finiteTime);numeric(t.maxMs,finiteTime);r.cpu[k]=t;}
    r.rafGap=closedData(r.rafGap,['count','totalMs','maxMs']);numeric(r.rafGap.count,finiteCount);numeric(r.rafGap.totalMs,finiteTime);numeric(r.rafGap.maxMs,finiteTime);
    const keys=Reflect.ownKeys(r.restartReasons??{});if(keys.length>15||keys.some(k=>!RESTART_NAMES.includes(k)))throw Error('Stage restart whitelist');
    r.restartReasons=closedData(r.restartReasons,keys);for(const x of Object.values(r.restartReasons))numeric(x,finiteCount);
    if(r.invalidFields<invalid)throw Error('Stage invalidity concealed');return r;
  });
  if(p.capturedCount!==p.rows.length||p.capturedCount>p.stageCount||p.truncated!==(p.capturedCount<p.stageCount)||
      (p.capturedCount<Math.min(p.stageCount,304)&&!p.byteLimited)||(p.byteLimited&&!p.truncated)||
      p.invalidFields<p.rows.reduce((n,r)=>n+r.invalidFields,0)+(p.status===null?1:0)+
        (m.passCount===null&&m.reason!=='qualities-unavailable'?1:0)+m.qualities.filter(x=>x===null).length+m.stageCounts.filter(x=>x===null).length)throw Error('Stage capture flags');
  const reason=mappingReason(m,p.stageCount,p.rows,p.truncated);if(m.reason!==reason||m.valid!==(reason==='valid'))throw Error('Stage mapping validity');
  let pass=0,end=m.stageCounts[0]??0;
  for(const r of p.rows){if(m.valid){while(r.index>=end)end+=m.stageCounts[++pass]??0;if(r.passIndex!==pass)throw Error('Stage pass index');}else if(r.passIndex!==null)throw Error('Invented stage pass index');}
  p.mapping=m;if(JSON.stringify(p).length>STAGE_LIMITS.bytes)throw Error('Stage JSON byte cap');return value;
}

/** Copies at most16 quality rows using only own data descriptors. Stage entries
 * are never read. Missing/invalid data stays null with explicit invalidity. */
export function projectPreparationSummary(value) {
  if (value == null || (typeof value !== 'object' && typeof value !== 'function'))
    return unavailable('no-result');
  let invalidFields = 0;
  const scalar = (object, key, valid) => {
    const value = ownData(object, key);
    if (valid(value)) return value;
    invalidFields++;
    return null;
  };
  const timing = value => typeof value === 'number' && Number.isFinite(value) && value >= 0;
  const count = value => Number.isSafeInteger(value) && value >= 0;
  const fields = object => ({
    status: scalar(object, 'status', value => STATUSES.includes(value)),
    elapsedMs: scalar(object, 'elapsedMs', timing),
    activeElapsedMs: scalar(object, 'activeElapsedMs', timing),
    pausedMs: scalar(object, 'pausedMs', timing),
    failureStep: scalar(object, 'failureStep', value => value === null || FAILURE_STEPS.includes(value)),
  });
  const result = { available: true, ...fields(value) };
  result.stageCount = arrayLength(ownData(value, 'stages'));
  if (result.stageCount === null) invalidFields++;
  const qualities = ownData(value, 'qualities');
  result.qualityCount = arrayLength(qualities);
  if (result.qualityCount === null) invalidFields++;
  result.qualitiesTruncated = result.qualityCount !== null && result.qualityCount > QUALITY_LIMIT;
  result.qualities = [];
  for (let index = 0; index < Math.min(result.qualityCount ?? 0, QUALITY_LIMIT); index++) {
    const before = invalidFields, row = ownData(qualities, String(index));
    const projected = {
      quality: scalar(row, 'quality', value => ['low', 'medium', 'high'].includes(value)),
      finalPass: scalar(row, 'finalPass', value => typeof value === 'boolean'),
      ...fields(row),
      stageCount: scalar(row, 'stageCount', count),
    };
    projected.valid = invalidFields === before;
    result.qualities.push(projected);
  }
  result.valid = invalidFields === 0;
  result.invalidFields = invalidFields;
  return result;
}

/** Observe only this Game's original method result. The single native.then side
 * reaction never replaces its Promise/return, receiver, args or thrown value.
 * Cleanup drops owner refs and restores only our own instance descriptor. */
export function observePreparationResult(game, { signal, startupSignal, isCurrent, onObserverError } = {}) {
  const state = { game, signals: [signal, startupSignal].filter(Boolean), isCurrent, onObserverError, active: true,
    summary: unavailable('not-observed'), stages: stageUnavailable('not-observed'), restore: null, abort: null,
    health: ownData(game, 'renderHealth'), scene: ownData(game, 'scene'), engine: ownData(game, 'engine'),
    startupAbort: ownData(game, 'startupAbort'), wrapper: null };
  const generation = ownData(state.health, 'generation'), rendererId = ownData(state.health, 'rendererId');
  const report = error => { try { state.onObserverError?.(error); } catch {} };
  const dispose = () => {
    if (!state.active) return;
    state.active = false;
    for (const signal of state.signals) {
      try { signal.removeEventListener('abort', state.abort); } catch (error) { report(error); }
    }
    try { state.restore?.(); } catch (error) { report(error); }
    state.restore = state.abort = state.game = state.isCurrent = state.onObserverError = null;
    state.health = state.scene = state.engine = state.startupAbort = state.wrapper = null;
    state.signals = [];
    // Neither dispose nor returned accessors retain the argument Game binding.
    game = null;
  };
  const current = receiver => {
    try {
      if (!state.active || receiver !== state.game) return false;
      if (state.signals.some(signal => signal.aborted) || state.isCurrent?.() === false || ownData(state.game, 'disposed') === true ||
          ownData(state.game, 'renderHealth') !== state.health || ownData(state.game, 'scene') !== state.scene ||
          ownData(state.game, 'engine') !== state.engine || ownData(state.health, 'generation') !== generation ||
          ownData(state.health, 'rendererId') !== rendererId || ownData(state.game, 'startupAbort') !== state.startupAbort ||
          (state.wrapper && ownData(state.game, 'prepareLighting') !== state.wrapper)) {
        dispose(); return false;
      }
      return true;
    } catch (error) { report(error); dispose(); return false; }
  };
  const fail = reason => { state.summary=unavailable(reason);state.stages=stageUnavailable(reason); };
  const fulfilled = value => {
    if (!current(state.game)) return;
    let summary,stages;
    try { summary=projectPreparationSummary(value); }
    catch(error){summary=unavailable('projection-error');report(error);}
    try { stages=projectPreparationStages(value); }
    catch(error){stages=stageUnavailable('projection-error');report(error);}
    if(current(state.game)){state.summary=summary;state.stages=stages;}
  };
  const rejected = () => { if (current(state.game))fail('original-rejected'); };
  const owner = { snapshot: () => state.summary, stagesSnapshot: () => state.stages, dispose };
  try {
    if (!Number.isSafeInteger(generation) || generation < 1 || !Number.isSafeInteger(rendererId) || rendererId < 1 ||
        state.scene === MISSING || state.engine === MISSING) {
      fail('owner-identity-unavailable'); dispose(); return owner;
    }
    if (!current(game)) return owner;
    const own = Object.getOwnPropertyDescriptor(game, 'prepareLighting');
    let descriptor = own, prototype = Object.getPrototypeOf(game);
    while (!descriptor && prototype) {
      descriptor = Object.getOwnPropertyDescriptor(prototype, 'prepareLighting');
      prototype = Object.getPrototypeOf(prototype);
    }
    const original = descriptor && Object.hasOwn(descriptor, 'value') ? descriptor.value : undefined;
    if (typeof original !== 'function') {
      fail('missing-method'); dispose(); return owner;
    }
    const wrapper = function () {
      const observe = current(this);
      // Deliberately outside diagnostic catch: exact original synchronous throw.
      const result = Reflect.apply(original, this, arguments);
      if (observe && current(this)) {
        try {
          // Native.then consults constructor/@@species. Refuse exotic promises
          // without invoking their accessors/constructors as diagnostic work.
          const constructor = result != null && Object.getOwnPropertyDescriptor(result, 'constructor');
          const species = Object.getOwnPropertyDescriptor(NATIVE_PROMISE, Symbol.species);
          if (Object.getPrototypeOf(result) !== NATIVE_PROMISE.prototype ||
              (constructor && (!Object.hasOwn(constructor, 'value') || constructor.value !== NATIVE_PROMISE)) ||
              ownData(NATIVE_PROMISE.prototype, 'constructor') !== NATIVE_PROMISE ||
              species?.get !== NATIVE_SPECIES?.get || species?.set !== NATIVE_SPECIES?.set ||
              species?.value !== NATIVE_SPECIES?.value) {
            fail('unsupported-promise');
          } else Reflect.apply(NATIVE_THEN, result, [fulfilled, rejected]);
        }
        catch (error) { fail('non-native-promise'); report(error); }
      }
      return result;
    };
    Object.defineProperty(game, 'prepareLighting', own ? { ...own, value: wrapper } :
      { configurable: true, writable: true, enumerable: false, value: wrapper });
    state.wrapper = wrapper;
    state.restore = () => {
      if (ownData(state.game, 'prepareLighting') !== wrapper) return;
      if (own) Object.defineProperty(state.game, 'prepareLighting', own);
      else delete state.game.prepareLighting;
    };
    state.abort = dispose;
    for (const signal of state.signals) signal.addEventListener('abort', state.abort, { once: true });
    if (state.signals.some(signal => signal.aborted)) dispose();
  } catch (error) { fail('observer-unavailable'); report(error); dispose(); }
  return owner;
}
