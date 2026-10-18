// Copied QA instrumentation: measures selected nested synchronous wall time.
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial.pure";
import { PBRBaseMaterial } from "@babylonjs/core/Materials/PBR/pbrBaseMaterial.pure";
import { MaterialDefines } from "@babylonjs/core/Materials/materialDefines";
import { WebGPUEngine } from "@babylonjs/core/Engines/webgpuEngine.pure";
import { WebGPUCacheBindGroups } from "@babylonjs/core/Engines/WebGPU/webgpuCacheBindGroups";

export interface RoutineTarget { id: string; target: object; key: PropertyKey }
export interface RoutineRow { id: string; calls: number; inclusiveMs: number; selfSelectedMs: number }
export interface RoutineSnapshot {
  rows: RoutineRow[]; errors: number; depthSkipped: number; restoreConflicts: number;
}
interface Frame {
  rows: RoutineRow[]; errors: number; depthSkipped: number;
  stack: { childMs: number }[];
}
interface Installed {
  target: object; key: PropertyKey; descriptor: PropertyDescriptor;
  wrapper: (...args: unknown[]) => unknown;
}

export class RoutineCallProfile {
  private readonly hooks: Installed[] = [];
  private readonly ids: string[];
  private frame?: Frame;
  private disposed = false;
  private errors = 0;
  private restoreConflicts = 0;

  constructor(targets: readonly RoutineTarget[], private readonly now: () => number = () => performance.now()) {
    if (targets.length > 8) throw new RangeError("At most eight selected routines");
    this.ids = targets.map(target => target.id);
    const uniqueIds = new Set<string>();
    // Validate every descriptor before the first prototype mutation.
    const validated = targets.map(({ id, target, key }, index) => {
      if (!id || uniqueIds.has(id)) throw new TypeError("Routine IDs must be unique and nonempty");
      uniqueIds.add(id);
      if (targets.slice(0, index).some(other => other.target === target && other.key === key))
        throw new TypeError("A method may be selected only once");
      const descriptor = Object.getOwnPropertyDescriptor(target, key);
      if (!descriptor || !("value" in descriptor) || typeof descriptor.value !== "function" ||
          (!descriptor.configurable && !descriptor.writable))
        throw new TypeError(`Selected routine ${id} is not a replaceable own method`);
      return { id, target, key, descriptor };
    });
    try {
      validated.forEach(({ target, key, descriptor }, index) => {
        const profile = this, original = descriptor.value;
        const wrapper = function (this: unknown, ...args: unknown[]) {
          return profile.invoke(index, original, this, args);
        };
        const hook = { target, key, descriptor, wrapper };
        // Keep this entry before defineProperty, so a throwing proxy that did
        // apply the descriptor still gets a rollback attempt.
        this.hooks.push(hook);
        Object.defineProperty(target, key, { ...descriptor, value: wrapper });
      });
    } catch (error) {
      this.dispose();
      throw error;
    }
  }

  private emptyFrame(): Frame {
    return { rows: this.ids.map(id => ({ id, calls: 0, inclusiveMs: 0, selfSelectedMs: 0 })),
      errors: 0, depthSkipped: 0, stack: [] };
  }
  private fail(frame: Frame) { frame.errors++; this.errors++; }
  private readClock(frame: Frame): number | undefined {
    try {
      const value = this.now();
      if (Number.isFinite(value)) return value;
    } catch { /* Instrumentation must never replace the original throw. */ }
    this.fail(frame);
    return undefined;
  }
  private invoke(index: number, original: (...args: unknown[]) => unknown, receiver: unknown, args: unknown[]) {
    const frame = this.frame;
    if (!frame || this.disposed) return Reflect.apply(original, receiver, args);
    const row = frame.rows[index];
    row.calls++;
    if (frame.stack.length >= 32) {
      frame.depthSkipped++;
      return Reflect.apply(original, receiver, args);
    }
    const start = this.readClock(frame);
    if (start === undefined) return Reflect.apply(original, receiver, args);
    const node = { childMs: 0 };
    frame.stack.push(node);
    try { return Reflect.apply(original, receiver, args); }
    finally {
      // An original call may dispose this profiler or begin another frame.
      // Its stale finally must neither clock nor mutate that newer generation.
      if (this.frame === frame && !this.disposed) {
        frame.stack.pop();
        const end = this.readClock(frame);
        if (end !== undefined) {
          if (end < start || end - start < node.childMs) this.fail(frame);
          const elapsed = Math.max(0, end - start);
          row.inclusiveMs += elapsed;
          row.selfSelectedMs += Math.max(0, elapsed - node.childMs);
          const parent = frame.stack[frame.stack.length - 1];
          if (parent) parent.childMs += elapsed;
        }
      }
    }
  }
  beginFrame() {
    if (this.disposed) return;
    if (this.frame?.stack.length) this.fail(this.frame);
    this.frame = this.emptyFrame();
  }
  endFrame(): RoutineSnapshot {
    const frame = this.frame ?? this.emptyFrame();
    this.frame = undefined;
    if (frame.stack.length) this.fail(frame);
    return { rows: frame.rows.map(row => ({ ...row })), errors: frame.errors,
      depthSkipped: frame.depthSkipped, restoreConflicts: this.restoreConflicts };
  }
  dispose(): { errors: number; restoreConflicts: number } {
    if (!this.disposed) {
      this.disposed = true;
      if (this.frame?.stack.length) this.fail(this.frame);
      this.frame = undefined;
      for (const hook of this.hooks.slice().reverse()) {
        try {
          const current = Object.getOwnPropertyDescriptor(hook.target, hook.key);
          if (current?.value !== hook.wrapper) {
            // A failed defineProperty that left the original unchanged needs
            // no restoration; any different replacement belongs to someone else.
            if (!current || current.value !== hook.descriptor.value) this.restoreConflicts++;
            continue;
          }
          if (current.configurable !== hook.descriptor.configurable ||
              current.enumerable !== hook.descriptor.enumerable ||
              current.writable !== hook.descriptor.writable) {
            this.restoreConflicts++;
            continue;
          }
          Object.defineProperty(hook.target, hook.key, hook.descriptor);
        } catch { this.errors++; this.restoreConflicts++; }
      }
      this.hooks.length = 0;
    }
    return { errors: this.errors, restoreConflicts: this.restoreConflicts };
  }
}

export function createMaterialRoutineProfile() {
  return new RoutineCallProfile([
    { id: "StandardMaterial.isReadyForSubMesh", target: StandardMaterial.prototype, key: "isReadyForSubMesh" },
    { id: "PBRBaseMaterial.isReadyForSubMesh", target: PBRBaseMaterial.prototype, key: "isReadyForSubMesh" },
    { id: "PBRBaseMaterial._prepareEffect", target: PBRBaseMaterial.prototype, key: "_prepareEffect" },
    { id: "PBRBaseMaterial._prepareDefines", target: PBRBaseMaterial.prototype, key: "_prepareDefines" },
    { id: "MaterialDefines._SerializeForEngine", target: MaterialDefines, key: "_SerializeForEngine" },
    { id: "WebGPUEngine.createEffect", target: WebGPUEngine.prototype, key: "createEffect" },
    { id: "WebGPUEngine.updateUniformBuffer", target: WebGPUEngine.prototype, key: "updateUniformBuffer" },
    { id: "WebGPUCacheBindGroups.getBindGroups", target: WebGPUCacheBindGroups.prototype, key: "getBindGroups" },
  ]);
}
