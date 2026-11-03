import type { Scene } from "@babylonjs/core/scene";
import type { Material } from "@babylonjs/core/Materials/material";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { PBRBaseMaterial } from "@babylonjs/core/Materials/PBR/pbrBaseMaterial";
import { MultiMaterial } from "@babylonjs/core/Materials/multiMaterial";
import type { Observer } from "@babylonjs/core/Misc/observable";
import type { SubMesh } from "@babylonjs/core/Meshes/subMesh";

type LitMaterial = StandardMaterial | PBRBaseMaterial;
type Method = (this: any, ...args: any[]) => any;
type Hook = { target: object; key: string; original: Method; own?: PropertyDescriptor; wrapper: Method };
type Record = { hook: Hook; observer: Observer<Material> };
const owners = new WeakMap<Scene, StartupMaterialReadiness>();
function dataMethod(target: object, key: string): Method | undefined {
  for (let object: object | null = target; object; object = Object.getPrototypeOf(object)) {
    const descriptor = Object.getOwnPropertyDescriptor(object, key);
    if (descriptor) return "value" in descriptor && typeof descriptor.value === "function" ? descriptor.value : undefined;
  }
  return undefined;
}
function install(target: object, key: string, wrap: (original: Method) => Method): Hook {
  const own = Object.getOwnPropertyDescriptor(target, key), original = dataMethod(target, key);
  if (!original || own && !own.configurable && (!("value" in own) || !own.writable)) throw new Error("Cannot lease startup material method: " + key);
  const wrapper = wrap(original);
  Object.defineProperty(target, key, own ? { ...own, value: wrapper } : { value: wrapper, writable: true, configurable: true });
  return { target, key, original, own, wrapper };
}
function restore(hook: Hook) {
  if (Object.getOwnPropertyDescriptor(hook.target, hook.key)?.value !== hook.wrapper) return;
  if (hook.own) Object.defineProperty(hook.target, hook.key, hook.own);
  else if (!Reflect.deleteProperty(hook.target, hook.key)) throw new Error("Cannot restore startup material method: " + hook.key);
}

/** Force a plain native boolean only for this synchronous readiness call.
 * A different value/descriptor installed by a callback remains its owner's. */
function policy(material: LitMaterial, key: "allowShaderHotSwapping" | "checkReadyOnEveryCall", value: boolean) {
  const original = Object.getOwnPropertyDescriptor(material, key);
  if (!original || !("value" in original) || typeof original.value !== "boolean" || !original.writable)
    throw new Error("Unsupported startup material policy: " + key);
  if (original.value === value) return () => {};
  material[key] = value;
  return () => {
    const current = Object.getOwnPropertyDescriptor(material, key);
    if (current && "value" in current && current.value === value &&
        current.writable === original.writable && current.configurable === original.configurable && current.enumerable === original.enumerable)
      Object.defineProperty(material, key, original);
  };
}

/** Startup-only per-instance readiness ownership. The loading cover must remain
 * until the existing mesh/effect/pipeline/health and submitted-frame gates pass.
 * No shader/UBO/light binding is changed and no global prototype is patched. */
export class StartupMaterialReadiness {
  private readonly materials = new Map<LitMaterial, Record>();
  private readonly seen = new Set<Material>();
  private readonly retired = new WeakSet<Material>();
  private readonly detach: (() => void)[] = [];
  private addHook?: Hook;
  private disposed = false;
  private readonly inert: boolean;
  private fault: unknown;
  private hasFault = false;

  constructor(private readonly scene: Scene, options: { signal?: AbortSignal } = {}) {
    this.inert = scene.getEngine().isWebGPU !== true;
    if (options.signal?.aborted || scene.isDisposed) { this.disposed = true; return; }
    if (this.inert) return;
    if (owners.has(scene)) throw new Error("Startup material readiness already has an owner");
    try {
      const owner = this;
      // Babylon's material-added observable is deferred. This method runs in
      // Material's constructor after its policy/scene/observables are ready,
      // also for AssetContainer's blocked entity collection path.
      this.addHook = install(scene, "addMaterial", original => function(this: Scene, material: Material, ...args: any[]) {
        const result = original.call(this, material, ...args);
        if (this === scene && !owner.disposed) owner.capture(material);
        return result;
      });
      owners.set(scene, this);
      const observer = scene.onDisposeObservable.add(() => this.dispose());
      this.detach.push(() => scene.onDisposeObservable.remove(observer));
      if (options.signal) {
        const abort = () => this.dispose(); options.signal.addEventListener("abort", abort, { once: true });
        this.detach.push(() => options.signal!.removeEventListener("abort", abort));
      }
      this.prepareFrame();
      if (options.signal?.aborted) this.dispose();
    } catch (error) { this.dispose(); throw error; }
  }

  private capture(material: Material | null | undefined) {
    if (!material || this.disposed || this.retired.has(material) || material.getScene() !== this.scene) return;
    if (this.seen.has(material)) return;
    this.seen.add(material);
    if (material instanceof MultiMaterial) {
      for (const child of material.subMaterials) this.capture(child);
      return;
    }
    if (!(material instanceof StandardMaterial || material instanceof PBRBaseMaterial)) return;
    const existing = this.materials.get(material);
    if (existing) {
      if (Object.getOwnPropertyDescriptor(material, "isReadyForSubMesh")?.value !== existing.hook.wrapper)
        throw new Error("Startup material readiness ownership changed");
      return;
    }
    const owner = this;
    const hook = install(material, "isReadyForSubMesh", original => function(this: LitMaterial, ...args: any[]) {
      if (owner.disposed || this !== material) return original.apply(this, args);
      const sub = args[1] as SubMesh | undefined;
      const dirty = !sub?.materialDefines || sub.materialDefines.isDirty;
      const mustCheck = dirty || !sub?.effect?.isReady();
      const restoreHot = policy(material, "allowShaderHotSwapping", false);
      let restoreEvery: (() => void) | undefined;
      try {
        // Keep the cached same-render fast path for unchanged ready material.
        // Dirty/pending state must bypass PushMaterial's render-id shortcut.
        if (mustCheck) restoreEvery = policy(material, "checkReadyOnEveryCall", true);
        // Public markDirty clears frozen _wasPreviouslyReady without changing
        // checkReadyOnlyOnce/isFrozen or forcing unrelated define categories.
        if (material.isFrozen && dirty) material.markDirty();
        return original.apply(this, args);
      } finally { try { restoreEvery?.(); } finally { restoreHot(); } }
    });
    const observer = material.onDisposeObservable.add(() => this.remove(material));
    this.materials.set(material, { hook, observer });
  }

  /** Authoritative pre-draw scan covers container/shared materials absent from
   * scene.materials and MultiMaterial children, without relying on counts/events. */
  prepareFrame(): void {
    this.assertHealthy();
    if (this.disposed || this.inert) return;
    if (this.scene.isDisposed) { this.dispose(); return; }
    try {
      if (this.addHook && Object.getOwnPropertyDescriptor(this.scene, "addMaterial")?.value !== this.addHook.wrapper)
        throw new Error("Startup scene material hook ownership changed");
      this.seen.clear();
      for (const material of this.scene.materials) this.capture(material);
      for (const material of this.scene.multiMaterials) this.capture(material);
      for (const mesh of this.scene.meshes) this.capture(mesh.material);
      this.seen.clear();
    } catch (error) { this.recordFault(error); throw error; }
  }

  private recordFault(error: unknown) {
    if (!this.hasFault) { this.hasFault = true; this.fault = error; }
  }
  /** Lifecycle observers remain exception-safe; the startup owner must check
   * restoration before publishing ready, including after dispose(). */
  assertHealthy(): void {
    if (this.hasFault) throw this.fault;
  }

  private remove(material: LitMaterial) {
    this.retired.add(material); this.seen.delete(material);
    const record = this.materials.get(material); if (!record) return;
    this.materials.delete(material);
    material.onDisposeObservable.remove(record.observer);
    try { restore(record.hook); } catch (error) { this.recordFault(error); }
  }
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const detach of this.detach.splice(0)) try { detach(); } catch (error) { this.recordFault(error); }
    for (const material of this.materials.keys()) this.remove(material);
    this.seen.clear();
    if (this.addHook) { try { restore(this.addHook); } catch (error) { this.recordFault(error); } this.addHook = undefined; }
    if (owners.get(this.scene) === this) owners.delete(this.scene);
  }
}
