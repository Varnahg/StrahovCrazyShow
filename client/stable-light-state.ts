import type { Scene } from "@babylonjs/core/scene";
import type { Light } from "@babylonjs/core/Lights/light";
import { SpotLight } from "@babylonjs/core/Lights/spotLight";
import { ShadowGenerator } from "@babylonjs/core/Lights/Shadows/shadowGenerator";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import type { Material } from "@babylonjs/core/Materials/material";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { PBRBaseSimpleMaterial } from "@babylonjs/core/Materials/PBR/pbrBaseSimpleMaterial";
import { MultiMaterial } from "@babylonjs/core/Materials/multiMaterial";
import { GetSupportedSimultaneousLights } from "@babylonjs/core/Materials/materialHelper.functions";
import type { Observer } from "@babylonjs/core/Misc/observable";

const supportedLightClasses = new Set([
  "PointLight",
  "DirectionalLight",
  "SpotLight",
  "HemisphericLight",
]);

// Never reorder a truncated list: that could select a different lamp. Unknown
// custom shaders and null MultiMaterial slots have no proven cap contract.
function materialLightCap(material: Material | null, depth = 0): number | null {
  // Frozen materials can keep their existing compiled slot defines even after
  // a dirty notification; leave their bindings in the original order.
  if (material?.isFrozen) return null;
  if (
    material instanceof StandardMaterial ||
    material instanceof PBRMaterial ||
    material instanceof PBRBaseSimpleMaterial
  )
    return material.maxSimultaneousLights;
  if (
    !(material instanceof MultiMaterial) ||
    depth > 8 ||
    !material.subMaterials.length
  )
    return null;
  let cap = Infinity;
  for (const part of material.subMaterials) {
    const partCap = materialLightCap(part, depth + 1);
    if (partCap === null) return null;
    cap = Math.min(cap, partCap);
  }
  return cap;
}

/**
 * Babylon 9.30 appends enabled lights to mesh.lightSources. A street lamp swap
 * can therefore permute POINT/DIR/SPOT shader slots even with the same lighting
 * composition. Keep their order independent of the history of those swaps.
 *
 * Call once after all light/shadow updates and before scene.render(). No light
 * is added, removed, enabled or muted here. This does not precompile shaders.
 */
export class StableLightState {
  private previous = new Map<Light, string>();
  private current = new Map<Light, string>();
  private ranks = new Map<Light, number>();
  private pendingMeshes = new Set<AbstractMesh>();
  private lightObservers = new Map<Light, Observer<boolean>>();
  private membershipChanged = false;
  private meshCount = -1;
  private topologyChanged = false;
  private disposed = false;
  private readonly added: Observer<AbstractMesh>;
  private readonly removed: Observer<AbstractMesh>;
  private readonly lightRemoved: Observer<Light>;
  readonly stats = { revisions: 0, visits: 0, sorts: 0, skipped: 0 };

  constructor(private readonly scene: Scene) {
    this.added = scene.onNewMeshAddedObservable.add((mesh) => {
      if (!this.disposed && !mesh.isDisposed()) this.pendingMeshes.add(mesh);
    });
    this.removed = scene.onMeshRemovedObservable.add((mesh) => {
      this.pendingMeshes.delete(mesh);
      // Also catches same-count replacement before Babylon's deferred add event.
      this.topologyChanged = true;
    });
    this.lightRemoved = scene.onLightRemovedObservable.add((light) => {
      const observer = this.lightObservers.get(light);
      if (observer)
        light.onEffectiveEnabledStateChangedObservable.remove(observer);
      this.lightObservers.delete(light);
      this.membershipChanged = true;
    });
  }

  /** Queue membership changes that do not change a light's shader signature.
   * Consume before update/render; the existing Set deduplicates receivers. */
  markMeshesDirty(meshes: Iterable<AbstractMesh>): void {
    if (this.disposed || this.scene.isDisposed) return;
    for (const mesh of meshes) {
      // An iterable may release its owner while advancing to the next item.
      if (this.disposed || this.scene.isDisposed) return;
      if (!mesh.isDisposed() && mesh.getScene() === this.scene)
        this.pendingMeshes.add(mesh);
    }
  }

  private signature(light: Light) {
    const type = light.getTypeID();
    if (
      type < 0 ||
      type > 3 ||
      !supportedLightClasses.has(light.getClassName())
    )
      return "unsupported";
    const generator =
      light.getShadowGenerator(this.scene.activeCamera) ??
      light.getShadowGenerator();
    if (
      generator &&
      (!(generator instanceof ShadowGenerator) ||
        generator.getClassName() !== "ShadowGenerator")
    )
      return "unsupported";
    const shadows = Boolean(
      this.scene.shadowsEnabled &&
      light.shadowEnabled &&
      generator?.getShadowMap()?.renderList?.length,
    );
    const projected =
      light instanceof SpotLight && Boolean(light.projectionTexture?.isReady());
    const ies =
      light instanceof SpotLight && Boolean(light.iesProfileTexture?.isReady());
    // All fields here influence per-slot shader defines. Position/intensity and
    // colour are uniforms, so moving lamps do not invalidate a stable order.
    return `${type}|${light.falloffType}|${light.lightmapMode}|${Number(shadows)}|${shadows ? generator!.filter : 0}|${shadows ? generator!.filteringQuality : 0}|${Number(projected)}|${Number(ies)}|${light.renderPriority}`;
  }

  update() {
    if (this.disposed || this.scene.isDisposed) return;
    this.current.clear();
    let changed = this.membershipChanged;
    this.membershipChanged = false;
    for (const light of this.scene.lights) {
      if (!this.lightObservers.has(light)) {
        this.lightObservers.set(
          light,
          light.onEffectiveEnabledStateChangedObservable.add(() => {
            this.membershipChanged = true;
          }),
        );
      }
      if (!light.isEnabled()) continue;
      const signature = this.signature(light);
      this.current.set(light, signature);
      if (this.previous.get(light) !== signature) changed = true;
    }
    changed ||= this.previous.size !== this.current.size;
    if (changed) {
      const ordered = [...this.current.keys()].sort(
        (a, b) =>
          b.renderPriority - a.renderPriority ||
          this.current.get(a)!.localeCompare(this.current.get(b)!) ||
          a.uniqueId - b.uniqueId,
      );
      this.ranks.clear();
      for (let i = 0; i < ordered.length; i++) this.ranks.set(ordered[i], i);
      this.stats.revisions++;
    }
    if (
      changed ||
      this.meshCount !== this.scene.meshes.length ||
      this.topologyChanged
    ) {
      for (const mesh of this.scene.meshes) this.stabilize(mesh);
      this.meshCount = this.scene.meshes.length;
      this.topologyChanged = false;
    } else {
      for (const mesh of this.pendingMeshes) this.stabilize(mesh);
    }
    this.pendingMeshes.clear();
    const reusable = this.previous;
    this.previous = this.current;
    this.current = reusable;
  }

  private stabilize(mesh: AbstractMesh) {
    if (mesh.isDisposed()) return;
    this.stats.visits++;
    const lights = mesh.lightSources;
    if (lights.length < 2) return;
    const cap = materialLightCap(mesh.material);
    if (
      cap === null ||
      !Number.isFinite(cap) ||
      cap < 1 ||
      lights.length > GetSupportedSimultaneousLights(this.scene, cap) ||
      lights.some(
        (light) =>
          !this.ranks.has(light) || this.current.get(light) === "unsupported",
      )
    ) {
      this.stats.skipped++;
      return;
    }
    let ordered = true;
    for (let i = 1; i < lights.length; i++) {
      if (this.ranks.get(lights[i - 1])! > this.ranks.get(lights[i])!) {
        ordered = false;
        break;
      }
    }
    if (ordered) return;
    lights.sort((a, b) => this.ranks.get(a)! - this.ranks.get(b)!);
    // Reordering does not invoke Babylon's membership setter. Its cached slot
    // defines must follow the new order, including on a newly created mesh.
    mesh._markSubMeshesAsLightDirty();
    this.stats.sorts++;
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.scene.onNewMeshAddedObservable.remove(this.added);
    this.scene.onMeshRemovedObservable.remove(this.removed);
    this.scene.onLightRemovedObservable.remove(this.lightRemoved);
    this.previous.clear();
    this.current.clear();
    this.ranks.clear();
    this.pendingMeshes.clear();
    for (const [light, observer] of this.lightObservers)
      light.onEffectiveEnabledStateChangedObservable.remove(observer);
    this.lightObservers.clear();
  }
}
