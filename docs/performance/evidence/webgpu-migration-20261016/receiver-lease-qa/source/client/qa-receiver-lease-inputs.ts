import type { Scene } from "@babylonjs/core/scene";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import type { Light } from "@babylonjs/core/Lights/light";
import type { SpotLight } from "@babylonjs/core/Lights/spotLight";
import type { Observer } from "@babylonjs/core/Misc/observable";
import type { GltfLightBudget } from "./gltf-light-budget";
import { CarReceiverLeaseLight } from "./qa-receiver-lease";

/** Copied QA only. Current immutable world owners plus observed material,
 * light and loader/cap changes; not a generic mutable scene optimization. */
export class ReceiverLeaseInputs {
  private readonly meshes = new Map<AbstractMesh, Observer<AbstractMesh>>();
  private readonly lights = new Map<Light, Observer<boolean>>();
  private readonly addedMesh: Observer<AbstractMesh>;
  private readonly removedMesh: Observer<AbstractMesh>;
  private readonly addedLight: Observer<Light>;
  private readonly removedLight: Observer<Light>;
  private disposed = false;
  private active = false;
  private lastWrites = -1;
  private lastOwnerChanges = -1;
  private lastWriteErrors = -1;
  private lastLoaderStarts = -1;
  private lastInvalidBudgetVisits = -1;
  private lastQuality = "";
  readonly stats = { gates: 0, suspensions: 0, capInvalidations: 0,
    materialInvalidations: 0, topologyInvalidations: 0, lightInvalidations: 0 };

  static create(scene: Scene, light: SpotLight | undefined, budget: GltfLightBudget) {
    return light instanceof CarReceiverLeaseLight
      ? new ReceiverLeaseInputs(scene, light, budget) : undefined;
  }

  constructor(private readonly scene: Scene, readonly light: CarReceiverLeaseLight,
    private readonly budget: Pick<GltfLightBudget, "stats">) {
    this.addedMesh = scene.onNewMeshAddedObservable.add(mesh => {
      this.watchMesh(mesh); this.invalidateTopology();
    });
    this.removedMesh = scene.onMeshRemovedObservable.add(mesh => {
      const observer = this.meshes.get(mesh);
      if (observer) mesh.onMaterialChangedObservable.remove(observer);
      this.meshes.delete(mesh); this.invalidateTopology();
    });
    this.addedLight = scene.onNewLightAddedObservable.add(light => {
      this.watchLight(light); this.invalidateLights();
    });
    this.removedLight = scene.onLightRemovedObservable.add(light => {
      const observer = this.lights.get(light);
      if (observer) light.onEffectiveEnabledStateChangedObservable.remove(observer);
      this.lights.delete(light); this.invalidateLights();
    });
    for (const mesh of scene.meshes) this.watchMesh(mesh);
    for (const light of scene.lights) this.watchLight(light);
    // Called only after the original full world/material preparation. It
    // computes eligibility/bounds while policy is still OFF, without changing
    // any original prewarm membership or shader coverage.
    light.prepareStaticReceivers();
  }

  private watchMesh(mesh: AbstractMesh) {
    if (this.disposed || mesh.isDisposed() || this.meshes.has(mesh)) return;
    this.meshes.set(mesh, mesh.onMaterialChangedObservable.add(() => {
      if (this.disposed) return;
      this.stats.materialInvalidations++; this.light.invalidate("material");
    }));
  }
  private watchLight(light: Light) {
    // Its pre-ON hook already builds the intended counterfactual filter.
    // Invalidating it here would defeat that filter during Light.setEnabled.
    if (this.disposed || light === this.light || this.lights.has(light)) return;
    this.lights.set(light, light.onEffectiveEnabledStateChangedObservable.add(() => this.invalidateLights()));
  }
  private invalidateTopology() {
    if (this.disposed) return;
    this.stats.topologyInvalidations++; this.light.invalidate("topology");
  }
  private invalidateLights() {
    if (this.disposed) return;
    this.stats.lightInvalidations++; this.light.invalidate("light-membership");
  }

  /** Caller must finish budget.prepareFrame and all lighting updates first. */
  prepareFrame(quality: string, preparationActive = false): readonly AbstractMesh[] {
    if (this.disposed || this.scene.isDisposed) return [];
    this.stats.gates++;
    const s = this.budget.stats;
    const invalid = this.lastInvalidBudgetVisits >= 0 &&
      s.invalidBudgetVisits !== this.lastInvalidBudgetVisits;
    const changed = s.writes !== this.lastWrites || s.ownerChanges !== this.lastOwnerChanges ||
      s.writeErrors !== this.lastWriteErrors || s.loaderStarts !== this.lastLoaderStarts ||
      quality !== this.lastQuality;
    this.lastWrites = s.writes; this.lastOwnerChanges = s.ownerChanges;
    this.lastWriteErrors = s.writeErrors; this.lastLoaderStarts = s.loaderStarts;
    this.lastInvalidBudgetVisits = s.invalidBudgetVisits; this.lastQuality = quality;
    const active = !preparationActive && s.activeLoaders === 0 && !invalid;
    if (active !== this.active) {
      this.active = active;
      if (!active) this.stats.suspensions++;
      this.light.setPolicyEnabled(active);
    }
    if (changed) { this.stats.capInvalidations++; this.light.invalidate("caps"); }
    return this.light.prepareReceivers();
  }

  snapshot() {
    return { controller: { ...this.stats }, light: { ...this.light.receiverStats } };
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.scene.onNewMeshAddedObservable.remove(this.addedMesh);
    this.scene.onMeshRemovedObservable.remove(this.removedMesh);
    this.scene.onNewLightAddedObservable.remove(this.addedLight);
    this.scene.onLightRemovedObservable.remove(this.removedLight);
    for (const [mesh, observer] of this.meshes) mesh.onMaterialChangedObservable.remove(observer);
    for (const [light, observer] of this.lights) light.onEffectiveEnabledStateChangedObservable.remove(observer);
    this.meshes.clear(); this.lights.clear();
    this.light.setPolicyEnabled(false);
  }
}
