import { SceneLoader } from "@babylonjs/core/Loading/sceneLoader";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { PBRBaseSimpleMaterial } from "@babylonjs/core/Materials/PBR/pbrBaseSimpleMaterial";
import type { Material } from "@babylonjs/core/Materials/material";
import type { Observable } from "@babylonjs/core/Misc/observable";
import type { Scene } from "@babylonjs/core/scene";
import {
  GLTFFileLoader,
  GLTFLoaderState,
} from "@babylonjs/loaders/glTF/glTFFileLoader";

type BudgetMaterial = StandardMaterial | PBRMaterial | PBRBaseSimpleMaterial;
type Declaration = {
  mode: "automatic" | "fixed";
  budget: number;
  lastApplied: number;
  pendingInflation: number | null;
};
type MaterialEntry = { declaration: Declaration | null; detach(): void };
type Owner = {
  begin(watch: PluginWatch): void;
  finish(watch: PluginWatch, failed: boolean): void;
  ready(): void;
  material(material: Material): void;
  skipped(): void;
  restoreFailed(): void;
};
type PluginMethod =
  | "loadFile"
  | "directLoad"
  | "importMeshAsync"
  | "loadAsync"
  | "loadAssetContainerAsync";
type LoaderMethod = (this: GLTFFileLoader, ...args: any[]) => any;
type PluginWatch = {
  plugin: GLTFFileLoader;
  active: boolean;
  owner: Owner | null;
  detach: (() => void)[];
  restore: (() => void)[];
};

const owners = new Map<Scene, Owner>();
const watches = new Set<PluginWatch>();
const pluginWatches = new WeakMap<GLTFFileLoader, PluginWatch>();
// Weak declarations survive temporary AssetContainer removal/guard recreation
// without retaining a material or its scene after its real owner releases it.
const declarations = new WeakMap<Material, Declaration>();
let detachActivation: (() => void) | null = null;
const observe = <T>(
  observable: Observable<T>,
  callback: (value: T) => void,
) => {
  const observer = observable.add(callback);
  return () => {
    observable.remove(observer);
  };
};
const validBudget = (value: number) =>
  Number.isSafeInteger(value) && value >= 0;
function supported(material: Material): material is BudgetMaterial {
  return (
    material instanceof StandardMaterial ||
    material instanceof PBRMaterial ||
    material instanceof PBRBaseSimpleMaterial
  );
}

export const GLTF_LIGHT_BUDGET_SCOPE = {
  automatic:
    "a captured Babylon standard default4 is an automatic floor: max(captured baseline, currently enabled scene lights), an upper bound on normal mesh.lightSources",
  fixed:
    "captured nondefault budgets and explicit declareBudget values retain their exact owner cap; declareBudget is required for intentional default4 or an owner write indistinguishable from a simultaneous loader inflation",
  inflation:
    "only while this scene has an identified active glTF load, recognize its exact Math.max(lastApplied, scene.lights.length) upward rewrite; independent cap changes become fixed owner declarations",
  timing:
    "public loader materialLoaded captures before inflation; READY/terminal repair plus scene.beforeRender cover frames interleaved during awaited onReady extensions; no readiness/render calls",
  bridge:
    "one temporary per-instance bridge forwards public scene-loader entrypoints with identical this/args/return; identifies empty loads without private loader fields; original own/inherited descriptors restored only while still owned",
  coverage:
    "install before loaders; frozen/unsupported materials and unwrappable plugin entrypoints are explicit skips; already inflated unknown initial budgets are not guessed back to4",
  steady:
    "beforeRender scans light counts, sweeps materials only during active loads or topology/count changes, and retries deferred materials; explicit update always sweeps; idle owner cap writes are observed before the next controlled budget change",
} as const;

function closeWatch(watch: PluginWatch, failed = false) {
  if (!watch.active) return;
  watch.active = false;
  const owner = watch.owner;
  // Repair while the owner still knows this was an active loader, then forget
  // the ownership before any late callback retained elsewhere can execute.
  owner?.finish(watch, failed);
  watch.owner = null;
  for (const detach of watch.detach) detach();
  for (const restore of watch.restore) {
    try {
      restore();
    } catch {
      owner?.restoreFailed();
    }
  }
  watch.detach.length = watch.restore.length = 0;
  watches.delete(watch);
}
function identify(watch: PluginWatch, scene: Scene) {
  if (!watch.active) return;
  const owner = owners.get(scene);
  if (!owner || (watch.owner && watch.owner !== owner)) {
    closeWatch(watch);
    return;
  }
  if (!watch.owner) {
    watch.owner = owner;
    owner.begin(watch);
  }
}

function wrapEntry(watch: PluginWatch, name: PluginMethod, sceneIndex: number) {
  const plugin = watch.plugin;
  const own = Object.getOwnPropertyDescriptor(plugin, name);
  let prototype: object | null = plugin;
  let descriptor = own;
  while (!descriptor && (prototype = Object.getPrototypeOf(prototype)))
    descriptor = Object.getOwnPropertyDescriptor(prototype, name);
  if (
    !descriptor ||
    typeof descriptor.value !== "function" ||
    (own && !own.configurable && !own.writable) ||
    (!own && !Object.isExtensible(plugin))
  )
    return false;
  const original = descriptor.value as LoaderMethod;
  const wrapper: LoaderMethod = function (...args) {
    if (watch.active) identify(watch, args[sceneIndex] as Scene);
    let result: any;
    try {
      result = original.apply(this, args);
    } catch (error) {
      closeWatch(watch, true);
      throw error;
    }
    // Side-channel rejection cleanup preserves the original Promise identity.
    // Success stays observed through COMPLETE for late extension/LOD assets.
    if (watch.active && result && typeof result.then === "function")
      void Promise.resolve(result).then(undefined, () =>
        closeWatch(watch, true),
      );
    return result;
  };
  try {
    Object.defineProperty(
      plugin,
      name,
      own
        ? { ...own, value: wrapper }
        : {
            configurable: true,
            writable: true,
            enumerable: false,
            value: wrapper,
          },
    );
  } catch {
    return false;
  }
  watch.restore.push(() => {
    if (Object.getOwnPropertyDescriptor(plugin, name)?.value !== wrapper)
      return;
    if (own) Object.defineProperty(plugin, name, own);
    else if (!Reflect.deleteProperty(plugin, name))
      throw new Error("Cannot restore glTF entrypoint");
  });
  return true;
}
function watchPlugin(plugin: GLTFFileLoader) {
  if (pluginWatches.get(plugin)?.active) return;
  const watch: PluginWatch = {
    plugin,
    active: true,
    owner: null,
    detach: [],
    restore: [],
  };
  pluginWatches.set(plugin, watch);
  watches.add(watch);
  for (const [name, sceneIndex] of [
    ["loadFile", 0],
    ["directLoad", 0],
    ["importMeshAsync", 1],
    ["loadAsync", 0],
    ["loadAssetContainerAsync", 0],
  ] as const) {
    if (!wrapEntry(watch, name, sceneIndex))
      for (const owner of owners.values()) owner.skipped();
  }
  watch.detach.push(
    observe(plugin.onMeshLoadedObservable, (mesh) =>
      identify(watch, mesh.getScene()),
    ),
    observe(plugin.onMaterialLoadedObservable, (material) => {
      identify(watch, material.getScene());
      watch.owner?.material(material);
    }),
    observe(plugin.onLoaderStateChangedObservable, (state) => {
      if (watch.active && state === GLTFLoaderState.READY) watch.owner?.ready();
    }),
    observe(plugin.onCompleteObservable, () => closeWatch(watch)),
    observe(plugin.onErrorObservable, () => closeWatch(watch, true)),
    observe(plugin.onDisposeObservable, () => closeWatch(watch)),
  );
}
function ensureActivation() {
  detachActivation ??= observe(
    SceneLoader.OnPluginActivatedObservable,
    (plugin) => {
      if (plugin instanceof GLTFFileLoader) watchPlugin(plugin);
    },
  );
}

/** Scene-owned repair of the documented Babylon9.30 glTF cap inflation.
 * Does not change light membership/order, patch prototypes or compile effects. */
export class GltfLightBudget {
  private readonly materials = new Map<BudgetMaterial, MaterialEntry>();
  private readonly deferredMaterials = new Set<BudgetMaterial>();
  private readonly activeLoads = new Set<PluginWatch>();
  private readonly detach: (() => void)[] = [];
  private readonly owner: Owner;
  private disposed = false;
  private materialCount = -1;
  private topologyChanged = true;
  private materialsChanged = false;
  private lightsChanged = false;
  readonly stats = {
    trackedMaterials: 0,
    activeLoaders: 0,
    loaderStarts: 0,
    loaderReady: 0,
    loaderFailures: 0,
    enabledLights: 0,
    registeredLights: 0,
    visits: 0,
    fullSweeps: 0,
    deferredPasses: 0,
    skippedFrames: 0,
    deferredMaterials: 0,
    writes: 0,
    inflationRepairs: 0,
    ownerChanges: 0,
    explicitDeclarations: 0,
    skippedFrozenVisits: 0,
    invalidBudgetVisits: 0,
    writeErrors: 0,
    unwrappedEntryPoints: 0,
    descriptorRestoreFailures: 0,
    lastInflatedBudget: null as number | null,
    lastRestoredBudget: null as number | null,
  };

  constructor(private readonly scene: Scene) {
    if (owners.has(scene))
      throw new Error("Scene already owns a glTF light budget guard");
    this.owner = {
      begin: (watch) => {
        // Independent owner changes BEFORE this load must not be mistaken for
        // its rewrite. Another already active load remains recognized here.
        this.update();
        this.activeLoads.add(watch);
        this.stats.activeLoaders = this.activeLoads.size;
        this.stats.loaderStarts++;
      },
      finish: (watch, failed) => {
        this.update();
        this.activeLoads.delete(watch);
        this.stats.activeLoaders = this.activeLoads.size;
        if (failed) this.stats.loaderFailures++;
      },
      ready: () => {
        this.stats.loaderReady++;
        this.update();
      },
      material: (material) => {
        this.capture(material);
      },
      skipped: () => {
        this.stats.unwrappedEntryPoints++;
      },
      restoreFailed: () => {
        this.stats.descriptorRestoreFailures++;
      },
    };
    owners.set(scene, this.owner);
    ensureActivation();
    this.detach.push(
      observe(scene.onNewMaterialAddedObservable, (material) => {
        if (scene.materials.includes(material)) this.capture(material);
      }),
      observe(scene.onMaterialRemovedObservable, (material) => {
        this.remove(material);
        this.topologyChanged = true;
      }),
      observe(scene.onLightRemovedObservable, () => {
        // Also catch same-count replacement before Babylon's deferred add event.
        this.lightsChanged = true;
      }),
      observe(scene.onBeforeRenderObservable, () => this.refresh(false)),
      observe(scene.onDisposeObservable, () => this.dispose()),
    );
    this.captureCurrent();
  }
  private captureCurrent() {
    for (const material of this.scene.materials) this.capture(material);
    this.materialCount = this.scene.materials.length;
    this.topologyChanged = false;
  }
  private capture(material: Material) {
    if (
      this.disposed ||
      this.scene.isDisposed ||
      material.getScene() !== this.scene ||
      !supported(material) ||
      this.materials.has(material)
    )
      return;
    const cap = material.maxSimultaneousLights;
    const declaration =
      declarations.get(material) ??
      (validBudget(cap) ? this.initialDeclaration(material, cap) : null);
    const detach = observe(material.onDisposeObservable, () =>
      this.remove(material),
    );
    this.materials.set(material, { declaration, detach });
    this.materialsChanged = true;
    this.stats.trackedMaterials = this.materials.size;
  }
  private initialDeclaration(
    material: BudgetMaterial,
    cap: number,
  ): Declaration {
    const declaration: Declaration = {
      budget: cap,
      mode: cap === 4 ? "automatic" : "fixed",
      lastApplied: cap,
      pendingInflation: null,
    };
    declarations.set(material, declaration);
    return declaration;
  }
  private remove(material: Material) {
    if (!supported(material)) return;
    const entry = this.materials.get(material);
    if (!entry) return;
    entry.detach();
    this.materials.delete(material);
    this.deferredMaterials.delete(material);
    this.stats.deferredMaterials = this.deferredMaterials.size;
    this.stats.trackedMaterials = this.materials.size;
  }
  /** Explicit owner intent, including a lower cap or intentional fixed4 when
   * more lights exist. Register concurrent ambiguous writes through this API. */
  declareBudget(material: Material, cap: number): boolean {
    if (
      this.disposed ||
      material.getScene() !== this.scene ||
      !supported(material) ||
      !validBudget(cap)
    )
      return false;
    this.capture(material);
    const entry = this.materials.get(material);
    if (!entry) return false;
    const declaration = (entry.declaration ??= this.initialDeclaration(
      material,
      cap,
    ));
    declaration.mode = "fixed";
    declaration.budget = cap;
    declaration.pendingInflation = null;
    // Record the observed value before a deferred explicit write. Otherwise an
    // unfreeze could misinterpret that old value as a new owner declaration.
    declaration.lastApplied = material.maxSimultaneousLights;
    this.stats.explicitDeclarations++;
    const applied =
      !material.isFrozen && this.write(material, declaration, cap);
    this.defer(material, !applied);
    return applied;
  }
  private write(
    material: BudgetMaterial,
    declaration: Declaration,
    target: number,
  ) {
    if (material.maxSimultaneousLights === target) {
      declaration.lastApplied = target;
      declaration.pendingInflation = null;
      return true;
    }
    try {
      material.maxSimultaneousLights = target;
      declaration.lastApplied = material.maxSimultaneousLights;
      if (declaration.lastApplied !== target) {
        this.stats.writeErrors++;
        return false;
      }
      this.stats.writes++;
      declaration.pendingInflation = null;
      return true;
    } catch {
      this.stats.writeErrors++;
      return false;
    }
  }
  update() {
    this.refresh(true);
  }
  private defer(material: BudgetMaterial, pending: boolean) {
    if (pending && !this.disposed && this.materials.has(material))
      this.deferredMaterials.add(material);
    else this.deferredMaterials.delete(material);
    this.stats.deferredMaterials = this.deferredMaterials.size;
  }
  private refresh(force: boolean) {
    if (this.disposed || this.scene.isDisposed) return;
    const topologyChanged =
      this.topologyChanged ||
      this.materialCount !== this.scene.materials.length;
    if (topologyChanged) this.captureCurrent();
    let enabled = 0;
    for (const light of this.scene.lights) if (light.isEnabled()) enabled++;
    const sweep =
      force ||
      topologyChanged ||
      this.activeLoads.size > 0 ||
      this.materialsChanged ||
      this.lightsChanged ||
      this.stats.enabledLights !== enabled ||
      this.stats.registeredLights !== this.scene.lights.length;
    this.stats.enabledLights = enabled;
    this.stats.registeredLights = this.scene.lights.length;
    if (sweep) {
      this.materialsChanged = this.lightsChanged = false;
      this.stats.fullSweeps++;
      for (const [material, entry] of this.materials)
        this.repair(material, entry, enabled);
    } else if (this.deferredMaterials.size) {
      this.stats.deferredPasses++;
      for (const material of this.deferredMaterials) {
        const entry = this.materials.get(material);
        if (entry) this.repair(material, entry, enabled);
        else this.defer(material, false);
      }
    } else {
      this.stats.skippedFrames++;
    }
  }
  private repair(
    material: BudgetMaterial,
    entry: MaterialEntry,
    enabled: number,
  ) {
    this.stats.visits++;
    const current = material.maxSimultaneousLights;
    if (!validBudget(current)) {
      this.stats.invalidBudgetVisits++;
      this.defer(material, true);
      return;
    }
    const declaration = (entry.declaration ??= this.initialDeclaration(
      material,
      current,
    ));
    const inflated =
      current === declaration.pendingInflation ||
      (this.activeLoads.size > 0 &&
        current > declaration.lastApplied &&
        current ===
          Math.max(declaration.lastApplied, this.scene.lights.length));
    // Remember evidence while frozen without touching the material. A later
    // unfreeze must not turn that known loader rewrite into an owner policy.
    if (inflated) declaration.pendingInflation = current;
    if (current !== declaration.lastApplied && !inflated) {
      declaration.mode = "fixed";
      declaration.budget = current;
      declaration.lastApplied = current;
      declaration.pendingInflation = null;
      this.stats.ownerChanges++;
    }
    const target =
      declaration.mode === "fixed"
        ? declaration.budget
        : Math.max(declaration.budget, enabled);
    if (material.isFrozen) {
      this.stats.skippedFrozenVisits++;
      this.defer(material, current !== target || inflated);
      return;
    }
    const applied = this.write(material, declaration, target);
    this.defer(material, !applied);
    if (applied && inflated && current !== target) {
      this.stats.inflationRepairs++;
      this.stats.lastInflatedBudget = current;
      this.stats.lastRestoredBudget = target;
    }
  }
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    owners.delete(this.scene);
    for (const watch of watches)
      if (watch.owner === this.owner) closeWatch(watch);
    for (const detach of this.detach) detach();
    this.detach.length = 0;
    for (const material of this.materials.keys()) this.remove(material);
    if (!owners.size) {
      detachActivation?.();
      detachActivation = null;
      for (const watch of watches) closeWatch(watch);
    }
  }
}
