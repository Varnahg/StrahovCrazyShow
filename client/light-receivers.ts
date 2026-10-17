import { SpotLight } from "@babylonjs/core/Lights/spotLight";
import { Light } from "@babylonjs/core/Lights/light";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { VertexBuffer } from "@babylonjs/core/Buffers/buffer";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { GetSupportedSimultaneousLights } from "@babylonjs/core/Materials/materialHelper.functions";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import type { Material } from "@babylonjs/core/Materials/material";
import type { Observer } from "@babylonjs/core/Misc/observable";
import type { Node } from "@babylonjs/core/node";
import { CampusSurfaceArtPlugin } from "./cinematic-art";

const RANGE_MARGIN_METRES = 0.05;
type LitMaterial = StandardMaterial | PBRMaterial;

/** These pinned built-in plugins, and our fragment-only surface art, do not
 * move geometry or replace the stock per-light contribution calculation. */
function knownMaterial(material: Material | null): material is LitMaterial {
  if (!material || material.isFrozen ||
      (material.constructor !== StandardMaterial && material.constructor !== PBRMaterial)) return false;
  // Pinned declarations say this hook is required, while stock runtime has
  // undefined. Do not let that declaration narrow the normal material to never.
  const resolver: unknown = (material as { customShaderNameResolve?: unknown }).customShaderNameResolve;
  if (resolver != null) return false;
  const lit = material as LitMaterial;
  if (lit.disableLighting || (lit instanceof PBRMaterial && lit.debugMode !== 0)) return false;
  for (const plugin of lit.pluginManager?._plugins ?? []) {
    if (plugin === lit.detailMap || ("decalMap" in lit && plugin === lit.decalMap) ||
        plugin.constructor === CampusSurfaceArtPlugin) continue;
    if (lit instanceof PBRMaterial && (plugin === lit.clearCoat || plugin === lit.iridescence ||
        plugin === lit.anisotropy || plugin === lit.brdf || plugin === lit.sheen || plugin === lit.subSurface)) continue;
    return false;
  }
  return true;
}

/** Local player-only light. The inherited SpotLight class name, light type,
 * shader, masks and caller-owned inclusion/exclusion arrays are unchanged.
 * Scene serialization/cloning does not carry this runtime-only policy. */
export class TorchReceiverLight extends SpotLight {
  // Light's super constructor may call canAffectMesh before field initialization.
  private rangeExcluded = new Set<AbstractMesh>();
  private pendingChanges = new Set<AbstractMesh>();
  private changedBuffer: AbstractMesh[] = [];
  private animatedTargets = new Set<unknown>();
  private receiversDisposed = false;
  private readonly removedObserver: Observer<AbstractMesh>;

  constructor(...args: ConstructorParameters<typeof SpotLight>) {
    super(...args);
    this.removedObserver = this.getScene().onMeshRemovedObservable.add((mesh) => {
      // A mesh can be detached without disposal and later reattached elsewhere.
      if (this.rangeExcluded.delete(mesh) && !mesh.isDisposed() && !this.receiversDisposed)
        mesh._resyncLightSource(this);
      this.pendingChanges.delete(mesh);
      const index = this.changedBuffer.indexOf(mesh);
      if (index >= 0) this.changedBuffer.splice(index, 1);
    });
  }

  override canAffectMesh(mesh: AbstractMesh): boolean {
    return super.canAffectMesh(mesh) && !this.rangeExcluded?.has(mesh);
  }

  /** Refresh synchronously before ON and again after all pose/light/cap changes,
   * before the caller canonicalizes light slots and renders. No stale interval. */
  refreshReceivers(): void {
    if (this.receiversDisposed) return;
    const scene = this.getScene();
    this.animatedTargets.clear();
    try {
      for (const animation of scene.animatables) {
        this.animatedTargets.add(animation.target);
        for (const runtime of animation.getAnimations()) {
          const target: unknown = runtime.target;
          if (Array.isArray(target)) for (const item of target) this.animatedTargets.add(item);
          else this.animatedTargets.add(target);
        }
      }
      const supported = !scene.isDisposed && scene.lightsEnabled && this.parent === null &&
        this.falloffType === Light.FALLOFF_STANDARD && this.range === 24 &&
        this.lightmapMode === Light.LIGHTMAP_DEFAULT &&
        this.metadata?.localFlashlight === true && !this.projectionTexture && !this.iesProfileTexture &&
        this.canAffectMesh === TorchReceiverLight.prototype.canAffectMesh &&
        Number.isFinite(this.position.x) && Number.isFinite(this.position.y) && Number.isFinite(this.position.z);
      for (const mesh of scene.meshes) {
        const excluded = supported && this.canExclude(mesh);
        if (excluded === this.rangeExcluded.has(mesh)) continue;
        if (excluded) this.rangeExcluded.add(mesh);
        else this.rangeExcluded.delete(mesh);
        // Pinned resync is a no-op if membership has not changed; it dirties only
        // this mesh when it actually adds/removes the one local torch.
        mesh._resyncLightSource(this);
        this.pendingChanges.add(mesh);
      }
    } finally {
      // Targets are needed only during this pass. In particular, an OFF period
      // must not retain disposed rigs through a previous animation snapshot.
      this.animatedTargets.clear();
    }
  }

  private canExclude(mesh: AbstractMesh): boolean {
    if (!(mesh instanceof Mesh) || mesh.getClassName() !== "Mesh" || mesh.isDisposed() ||
        mesh.isAnInstance || mesh.hasInstances || mesh.hasThinInstances || mesh.skeleton ||
        mesh.morphTargetManager || mesh.bakedVertexAnimationManager || mesh.infiniteDistance ||
        mesh.billboardMode !== 0 || mesh.doNotSyncBoundingInfo || mesh.metadata?.windDeformed ||
        !(mesh.metadata?.artStatic === true || mesh.metadata?.sourcePack === "architecture-reality") ||
        !super.canAffectMesh(mesh) || !knownMaterial(mesh.material)) return false;
    const positions = mesh.getVertexBuffer(VertexBuffer.PositionKind);
    if (!positions || positions.isUpdatable()) return false;
    // Scene animation runs inside render(), after the owner's final gate.
    // A tagged mesh or ancestor with animation therefore is not a static proof.
    for (let node: Node | null = mesh; node; node = node.parent) {
      if (node.animations.length || this.animatedTargets.has(node)) return false;
      if (node instanceof TransformNode && (this.animatedTargets.has(node.position) ||
          this.animatedTargets.has(node.rotation) || this.animatedTargets.has(node.rotationQuaternion) ||
          this.animatedTargets.has(node.scaling))) return false;
    }
    const cap = mesh.material.maxSimultaneousLights;
    const supported = GetSupportedSimultaneousLights(this.getScene(), cap);
    if (!Number.isSafeInteger(cap) || cap < 1 || !Number.isSafeInteger(supported) || supported < 1) return false;
    // Count the unfiltered counterfactual list, including this torch even if
    // it is currently OFF or already excluded by us. Never promote a light
    // which the original material/device cap would have dropped.
    let count = 1;
    for (const light of mesh.lightSources) if (light !== this) count++;
    if (count > supported) return false;
    mesh.computeWorldMatrix(!mesh.isSynchronized());
    const bounds = mesh.getBoundingInfo();
    if (bounds.isLocked) return false;
    const min = bounds.boundingBox.minimumWorld, max = bounds.boundingBox.maximumWorld;
    if (!Number.isFinite(min.x) || !Number.isFinite(min.y) || !Number.isFinite(min.z) ||
        !Number.isFinite(max.x) || !Number.isFinite(max.y) || !Number.isFinite(max.z) ||
        min.x > max.x || min.y > max.y || min.z > max.z) return false;
    const x = Math.max(min.x - this.position.x, 0, this.position.x - max.x);
    const y = Math.max(min.y - this.position.y, 0, this.position.y - max.y);
    const z = Math.max(min.z - this.position.z, 0, this.position.z - max.z);
    const distanceSquared = x * x + y * y + z * z;
    const reach = this.range + RANGE_MARGIN_METRES;
    return Number.isFinite(distanceSquared) && distanceSquared > reach * reach;
  }

  /** Reused output, valid until the next call. Consume synchronously; internal
   * pre-ON refreshes accumulate here instead of losing changes before sorting. */
  takeChangedReceivers(): readonly AbstractMesh[] {
    this.changedBuffer.length = 0;
    for (const mesh of this.pendingChanges) this.changedBuffer.push(mesh);
    this.pendingChanges.clear();
    return this.changedBuffer;
  }

  override dispose(): void {
    if (this.receiversDisposed) return;
    this.receiversDisposed = true;
    this.getScene().onMeshRemovedObservable.remove(this.removedObserver);
    this.rangeExcluded.clear();
    this.animatedTargets.clear();
    this.pendingChanges.clear();
    this.changedBuffer.length = 0;
    // Light.dispose removes this light from every mesh; no temporary readmission.
    super.dispose();
  }
}
