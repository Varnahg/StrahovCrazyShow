/** Rebased ee3c3280 donor: selected synchronous CPU wall time only. */
export const ROUTINE_LIMITS = Object.freeze({ routines: 8, frames: 8, stack: 32, callsPerFrame: 100000, phaseEvents: 128, renderers: 64 });
export const ROUTINE_PHASES = Object.freeze(['active', 'main', 'rtt', 'other']);
export const ROUTINE_IDS = Object.freeze(['scene.getActiveMeshCandidates', 'Scene._activeMesh', 'TransformNode.computeWorldMatrix', 'Mesh.getLOD',
  'PBRBaseMaterial.isReadyForSubMesh', 'StandardMaterial.isReadyForSubMesh', 'PBRBaseMaterial.bindForSubMesh', 'StandardMaterial.bindForSubMesh']);
export const ROUTINE_SCOPE = Object.freeze({
  clock: 'performance.now synchronous CPU wall time; includes observer overhead/GC/scheduling, not GPU execution',
  frames: 'at most eight original actualScene.render calls with native _frameId progress; no additional render/readiness calls',
  phases: 'innermost public active/main/ObjectRenderer init-finish scope, otherwise other; scopes may nest',
  nesting: 'inclusive times overlap; selfSelected subtracts selected children only, not all children or whole-frame CPU',
  residual: 'unselected culling/reset/sort/engine/custom material work remains unassigned; no measured3ms saving or FPS A/B',
});
const owners = new WeakMap();
const emptyRows = ids => ids.flatMap(id => ROUTINE_PHASES.map(phase => ({ id, phase, calls: 0, inclusiveMs: 0, selfSelectedMs: 0, falseReturns: 0, throws: 0 })));
const sameFlags = (a, b) => a.configurable === b.configurable && a.enumerable === b.enumerable && a.writable === b.writable;

export class RoutineCallProfile {
  hooks = []; frame = undefined; disposed = false; errors = 0; restoreConflicts = 0;
  constructor(targets, { now = () => performance.now(), phase = () => 'other' } = {}) {
    if (!Array.isArray(targets) || targets.length > ROUTINE_LIMITS.routines) throw new RangeError('At most eight selected routines');
    this.ids = targets.map(target => target.id); this.now = now; this.phase = phase;
    const ids = new Set();
    // Validate the entire transaction before its first mutation.
    const validated = targets.map(({ id, target, key, accepts = () => true, expected }, index) => {
      if (!id || ids.has(id) || targets.slice(0, index).some(other => other.target === target && other.key === key)) throw new TypeError('Unique routine IDs/methods required');
      ids.add(id);
      const descriptor = Object.getOwnPropertyDescriptor(target, key);
      if (!descriptor || !('value' in descriptor) || typeof descriptor.value !== 'function' || (!descriptor.configurable && !descriptor.writable) ||
          (expected !== undefined && descriptor.value !== expected) || owners.get(target)?.has(key)) throw new TypeError('Unsupported/drift/owned routine: ' + id);
      return { target, key, descriptor, accepts };
    });
    try {
      validated.forEach(({ target, key, descriptor, accepts }, index) => {
        const profile = this, original = descriptor.value;
        const wrapper = function (...args) { return profile.invoke(index, original, this, args, accepts); };
        const hook = { target, key, descriptor, wrapper }; this.hooks.push(hook);
        const keys = owners.get(target) ?? new Map(); keys.set(key, this); owners.set(target, keys);
        Object.defineProperty(target, key, { ...descriptor, value: wrapper });
      });
    } catch (error) { this.dispose(); throw error; }
  }
  fail(frame) { frame.errors++; this.errors++; }
  clock(frame) {
    try { const value = this.now(); if (Number.isFinite(value)) return value; } catch { /* Keep original result/throw. */ }
    this.fail(frame);
  }
  invoke(index, original, receiver, args, accepts) {
    const frame = this.frame;
    // No clock, phase inspection or counters for foreign receivers or idle frames.
    if (!frame || this.disposed) return Reflect.apply(original, receiver, args);
    let accepted;
    try { accepted = accepts(receiver); } catch { this.fail(frame); }
    if (!accepted) return Reflect.apply(original, receiver, args);
    if (frame.calls++ >= ROUTINE_LIMITS.callsPerFrame) { frame.callsSkipped++; return Reflect.apply(original, receiver, args); }
    let phase;
    try { phase = ROUTINE_PHASES.indexOf(this.phase()); } catch { phase = -1; }
    if (phase < 0) { this.fail(frame); phase = 3; }
    const row = frame.rows[index * 4 + phase]; row.calls++;
    if (frame.stack.length >= ROUTINE_LIMITS.stack) { frame.depthSkipped++; return Reflect.apply(original, receiver, args); }
    const start = this.clock(frame);
    if (start === undefined) return Reflect.apply(original, receiver, args);
    const node = { childMs: 0 }; frame.stack.push(node);
    let returned = false, result;
    try { result = Reflect.apply(original, receiver, args); returned = true; return result; }
    finally {
      if (this.frame === frame && !this.disposed) {
        if (returned && result === false) row.falseReturns++;
        if (!returned) row.throws++;
        frame.stack.pop(); const end = this.clock(frame);
        if (end !== undefined) {
          if (end < start || end - start < node.childMs) this.fail(frame);
          const elapsed = Math.max(0, end - start);
          row.inclusiveMs += elapsed; row.selfSelectedMs += Math.max(0, elapsed - node.childMs);
          const parent = frame.stack.at(-1); if (parent) parent.childMs += elapsed;
        }
      }
    }
  }
  beginFrame(frameId) {
    if (this.disposed) return;
    if (this.frame?.stack.length) this.fail(this.frame);
    this.frame = { frameId, rows: emptyRows(this.ids), errors: 0, depthSkipped: 0, callsSkipped: 0, calls: 0, stack: [] };
  }
  endFrame() {
    const frame = this.frame; this.frame = undefined;
    if (!frame) return null;
    if (frame.stack.length) this.fail(frame);
    return { frameId: frame.frameId, rows: frame.rows.map(row => ({ ...row })), errors: frame.errors, depthSkipped: frame.depthSkipped, callsSkipped: frame.callsSkipped };
  }
  dispose() {
    if (!this.disposed) {
      this.disposed = true;
      if (this.frame?.stack.length) this.fail(this.frame);
      this.frame = undefined;
      for (const hook of this.hooks.slice().reverse()) {
        try {
          const current = Object.getOwnPropertyDescriptor(hook.target, hook.key);
          if (current?.value === hook.wrapper && sameFlags(current, hook.descriptor)) Object.defineProperty(hook.target, hook.key, hook.descriptor);
          else if (current?.value !== hook.descriptor.value || !sameFlags(current, hook.descriptor)) this.restoreConflicts++;
        } catch { this.errors++; this.restoreConflicts++; }
        const keys = owners.get(hook.target); if (keys?.get(hook.key) === this) keys.delete(hook.key);
      }
      this.hooks.length = 0;
    }
    return { errors: this.errors, restoreConflicts: this.restoreConflicts };
  }
}

export function validateRoutineProfile(value) {
  const count = number => Number.isSafeInteger(number) && number >= 0;
  if (!value || value.schemaVersion !== 1 || !Array.isArray(value.frames) || value.frames.length > 8 || typeof value.complete !== 'boolean' || value.active !== false ||
      JSON.stringify(value.targets) !== JSON.stringify(ROUTINE_IDS) || ['errors', 'phaseErrors', 'restoreConflicts'].some(key => !count(value[key]))) throw new Error('Routine profile bounds');
  for (const frame of value.frames) {
    if (!Array.isArray(frame.rows) || frame.rows.length !== 32 || !count(frame.frameId) || !count(frame.nativeFrameIdAfter) ||
        typeof frame.progressed !== 'boolean' || typeof frame.threw !== 'boolean' || ['errors', 'depthSkipped', 'callsSkipped'].some(key => !count(frame[key]))) throw new Error('Routine row bounds');
    for (let index = 0; index < frame.rows.length; index++) {
      const row = frame.rows[index];
      if (row.id !== ROUTINE_IDS[Math.floor(index / 4)] || row.phase !== ROUTINE_PHASES[index % 4] ||
          ['calls', 'falseReturns', 'throws'].some(key => !count(row[key]) || row[key] > ROUTINE_LIMITS.callsPerFrame) ||
          ['inclusiveMs', 'selfSelectedMs'].some(key => !Number.isFinite(row[key]) || row[key] < 0) || row.selfSelectedMs > row.inclusiveMs ||
          row.falseReturns + row.throws > row.calls) throw new Error('Routine row identity/number');
    }
  }
  if (value.complete && (value.frames.length !== 8 || value.reason !== 'complete' || value.errors || value.phaseErrors || value.restoreConflicts ||
      value.frames.some(frame => !frame.progressed || frame.nativeFrameIdAfter !== frame.frameId + 1 || frame.threw || frame.errors || frame.depthSkipped || frame.callsSkipped))) throw new Error('Incomplete routine frames');
  return value;
}
