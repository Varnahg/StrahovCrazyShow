import { validateStartupStageRoutines } from './startup-stage-routines.mjs';
import { validatePipelineInputs } from './pipeline-input-window.mjs';
import { open, readFile, mkdir, lstat, link, unlink } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { sha256 } from './common.mjs';
import { validateRoutineProfile } from './routine-cost-core.mjs';
import { validateEntryRenderProfile } from './entry-render-cost.mjs';
import { validateEntryTrigger } from './entry-routine-cost.mjs';
import { validateBufferTrace } from './buffer-lifecycle-core.mjs';
import { validatePreparationStages } from './startup-observer.mjs';

export const MAX_RECEIPT_BYTES = 2 * 1024 * 1024;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function validateReceipt(value, identity) {
  if (!value || value.schemaVersion !== 1 || !uuid.test(value.attemptId ?? '') ||
      value.buildId !== identity.buildId || value.sourceSnapshotId !== identity.sourceSnapshotId ||
      value.helperSha256 !== identity.helperSha256 || !['startup', 'benchmark', 'state', 'routine-cost','buffer-lifecycle','vehicle-entry-cost','pipeline-inputs'].includes(value.kind) ||
      !['plain', 'diagnostic'].includes(value.mode)) throw new Error('Receipt identity/schema mismatch');
  if (typeof identity.lifecycleControls !== 'boolean' || value.lifecycleControls !== identity.lifecycleControls ||
      (identity.lifecycleControls && value.mode !== 'diagnostic')) throw new Error('Receipt lifecycle-controls identity mismatch');
  if((value.startupRoutines!==undefined||identity.startupRoutines!=null)&&value.startupRoutines!==(identity.startupRoutines??null))throw Error('Startup routine identity mismatch');
  if(value.startupStageRoutines!==undefined){if(value.kind!=='startup'||value.mode!=='diagnostic'||!identity.startupRoutines)throw Error('Startup routine kind/flag mismatch');validateStartupStageRoutines(value.startupStageRoutines,identity.startupRoutines);}
  if (value.pipelineInputs !== undefined && value.kind !== 'pipeline-inputs') throw new Error('Pipeline inputs kind mismatch');
  if (value.entryTrigger !== undefined && value.kind !== 'routine-cost') throw new Error('Entry trigger kind mismatch');
  if (value.preparationStages !== undefined) {
    if(value.kind!=='startup')throw new Error('Preparation stages kind mismatch');
    validatePreparationStages(value.preparationStages);
  }
  if (value.lifecycleControl !== undefined) {
    const control = value.lifecycleControl;
    if (!identity.lifecycleControls || value.kind !== 'state' || !control ||
        Object.keys(control).sort().join(',') !== 'action,attempted,generation,outcome,rendererId' ||
        control.action !== 'destroy-own-device' || control.attempted !== true || !['returned', 'threw'].includes(control.outcome) ||
        !Number.isSafeInteger(control.rendererId) || control.rendererId < 1 || !Number.isSafeInteger(control.generation) || control.generation < 1)
      throw new Error('Lifecycle action scalar evidence invalid');
  }
  if (identity.clock && value.clockConfigId !== identity.clock.configId) throw new Error('Receipt clock config mismatch');
  if (!Number.isFinite(value.atMs) || value.atMs < 0 || !Number.isFinite(value.timeOrigin))
    throw new Error('Receipt clock missing');
  if (!Array.isArray(value.observerErrors) || value.observerErrors.length > 16) throw new Error('Observer error bounds');
  if (value.kind === 'startup' && (!['resolved', 'rejected'].includes(value.outcome) ||
      !Array.isArray(value.samples) || value.samples.length > 181 || !value.terminal))
    throw new Error('Startup evidence missing');
  if (value.kind === 'state' && (!value.state || !value.compilation)) throw new Error('State evidence missing');
  if(value.kind==='buffer-lifecycle'){
    if(identity.bufferLifecycle!==true||value.bufferLifecycle!==true||value.mode!=='diagnostic'||!value.bufferTrace||value.bufferTrace.active!==false)throw new Error('Buffer lifecycle diagnostic identity/evidence missing');
    validateBufferTrace(value.bufferTrace);
  }
  if (value.kind === 'pipeline-inputs') {
    const allowed = new Set('schemaVersion,label,sourceSnapshotId,helperSha256,loading,clock,weather,startupLatency,shaderAttribution,routineCost,bufferLifecycle,lifecycleControls,dependencies,buildId,attemptId,ownerId,kind,mode,atMs,timeOrigin,capturedAtUTC,userAgent,observerErrors,clockConfigId,completed,before,after,pipelineInputs,validationErrors,scope,failure'.split(','));
    if (Object.keys(value).some(key => !allowed.has(key)) || identity.routineCost !== true || value.routineCost !== true || value.mode !== 'diagnostic' ||
        !value.before || !value.after || !Array.isArray(value.validationErrors) || value.validationErrors.length > 16 || typeof value.completed !== 'boolean') throw new Error('Pipeline inputs diagnostic evidence missing');
    if (value.pipelineInputs === null) { if (value.completed || !value.failure || !value.validationErrors.length) throw new Error('Pipeline input refusal missing'); }
    else {
      validatePipelineInputs(value.pipelineInputs); if (value.completed !== value.pipelineInputs.completed) throw new Error('Pipeline input completion differs');
      if(value.completed)for(const state of [value.before,value.after])if(state.ready!==true||state.disposed!==false||state.health?.valid!==true||state.health.rendererId!==value.pipelineInputs.rendererId||state.health.generation!==value.pipelineInputs.generation||state.health.errorCount!==0||state.health.pendingOperations!==0)throw new Error('Pipeline input completed renderer/health mismatch');
    }
  }
  if (value.kind === 'vehicle-entry-cost') {
    if (identity.routineCost !== true || value.routineCost !== true || value.mode !== 'diagnostic' || !value.before || !value.after ||
        !Array.isArray(value.validationErrors) || value.validationErrors.length > 16 || typeof value.completed !== 'boolean') throw new Error('Entry diagnostic identity/evidence missing');
    if (value.entryProfile) validateEntryRenderProfile(value.entryProfile);
    if (value.completed && value.entryProfile?.complete !== true) throw new Error('Entry completion missing');
  }
  if (value.kind === 'routine-cost') {
    if (identity.routineCost !== true || value.routineCost !== true || value.mode !== 'diagnostic' || !value.before || !value.after ||
        !Array.isArray(value.validationErrors) || typeof value.completed !== 'boolean') throw new Error('Routine diagnostic identity/evidence missing');
    if (value.routineProfile) validateRoutineProfile(value.routineProfile);
    if (value.completed && value.routineProfile?.complete !== true) throw new Error('Routine completion missing');
    if (value.entryTrigger !== undefined) {
      if (value.entryTrigger === null) {
        if (value.completed || !value.failure || !value.validationErrors.length) throw new Error('Entry trigger refusal missing');
      } else {
        validateEntryTrigger(value.entryTrigger, value.routineProfile);
        if (value.completed !== value.entryTrigger.complete) throw new Error('Entry trigger completion differs');
      }
    }
  }
  if (value.kind === 'benchmark') {
    if (!Array.isArray(value.rawGameFrameMs) || !Array.isArray(value.rawRafFrameMs) ||
        value.rawGameFrameMs.length > 20000 || value.rawRafFrameMs.length > 20000 ||
        [...value.rawGameFrameMs, ...value.rawRafFrameMs].some(x => !Number.isFinite(x) || x < 0) ||
        !Array.isArray(value.validationErrors) || !value.before || !value.after)
      throw new Error('Benchmark frame/evidence bounds');
    // Failed attempts are intentionally accepted as durable evidence. A valid
    // performance sample additionally requires all client gates and raw checks.
    if (value.completed === true && (!value.benchmark || value.benchmark.frames !== value.rawGameFrameMs.length))
      throw new Error('Completed benchmark frame count mismatch');
  }
  return value;
}
export async function saveReceipt(directory, bytes, identity) {
  if (!Buffer.isBuffer(bytes) || bytes.length > MAX_RECEIPT_BYTES) throw new Error('Receipt too large');
  const value = validateReceipt(JSON.parse(bytes.toString('utf8')), identity);
  await mkdir(directory, { recursive: true });
  const path = join(directory, value.attemptId + '.json'), digest = sha256(bytes);
  // Publish only complete fsynced bytes. Exclusive link is atomic, never
  // overwrites a target and also permits simultaneous exact retry requests.
  const stage = join(directory, '.' + value.attemptId + '-' + randomUUID() + '.stage');
  const handle = await open(stage, 'wx');
  let repeated = false;
  try {
    try { await handle.writeFile(bytes); await handle.sync(); } finally { await handle.close(); }
    try { await link(stage, path); }
    catch (error) {
      if (error.code !== 'EEXIST') throw error;
      const stat = await lstat(path);
      if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('Unsafe existing receipt');
      if (!(await readFile(path)).equals(bytes)) throw new Error('Receipt ID conflict; original preserved');
      repeated = true;
    }
  } finally { await unlink(stage); }
  return { persisted: true, repeated, attemptId: value.attemptId, sha256: digest, bytes: bytes.length };
}
export function authorizeReceiptRequest(req, origin) {
  return ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress) &&
    req.headers.host === new URL(origin).host && req.method === 'POST' && req.headers.origin === origin &&
    /^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(req.headers['content-type'] ?? '');
}
