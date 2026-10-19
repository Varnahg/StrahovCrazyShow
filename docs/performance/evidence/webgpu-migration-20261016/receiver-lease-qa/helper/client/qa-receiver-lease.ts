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
import type { Node } from "@babylonjs/core/node";
import { CampusSurfaceArtPlugin } from "./cinematic-art";

type LitMaterial = StandardMaterial | PBRMaterial;
export type LeaseInvalidation = "topology" | "material" | "bounds-transform" | "geometry" | "animation-deformation" | "caps" | "light-membership" | "light-configuration" | "masks-lists";
export interface VehicleLeaseOptions { kind: "vehicle"; range: 32; movementReserveMetres: number }
interface Receiver { mesh: Mesh; minX: number; minY: number; minZ: number; maxX: number; maxY: number; maxZ: number }
const MARGIN = 0.05;
// Same conservative stock/plugin proof as rejected18701037; only its repeated
// eligibility/bounds work moves to explicit invalidation, not every draw.
function knownMaterial(material: Material | null): material is LitMaterial {
  if (!material || material.isFrozen || (material.constructor !== StandardMaterial && material.constructor !== PBRMaterial)) return false;
  const resolver: unknown = (material as { customShaderNameResolve?: unknown }).customShaderNameResolve;
  if (resolver != null) return false;
  const lit = material as LitMaterial;
  if (lit.disableLighting || (lit instanceof PBRMaterial && lit.debugMode !== 0)) return false;
  for (const plugin of lit.pluginManager?._plugins ?? []) {
    if (plugin === lit.detailMap || ("decalMap" in lit && plugin === lit.decalMap) || plugin.constructor === CampusSurfaceArtPlugin) continue;
    if (lit instanceof PBRMaterial && (plugin === lit.clearCoat || plugin === lit.iridescence || plugin === lit.anisotropy || plugin === lit.brdf || plugin === lit.sheen || plugin === lit.subSurface)) continue;
    return false;
  }
  return true;
}

/** QA only. The caller MUST invalidate every listed mutation before its final
 * pre-draw gate; arbitrary unreported material/transform/script mutations are
 * unsupported. Default bypass preserves the entire existing startup/prewarm. */
export class CarReceiverLeaseLight extends SpotLight {
  private excluded = new Set<AbstractMesh>();
  private pending = new Set<AbstractMesh>();
  private output: AbstractMesh[] = [];
  private records: Receiver[] = [];
  private animatedTargets = new Set<unknown>();
  private options?: Readonly<VehicleLeaseOptions>;
  private policyEnabled = false;
  private receiversDisposed = false;
  private rebuild = true;
  private leaseValid = false;
  private anchor = { x: 0, y: 0, z: 0 };
  private readonly removed;
  readonly receiverStats = { rebuilds: 0, fullMeshVisits: 0, refreshes: 0, recordVisits: 0, steadyGates: 0,
    offGates: 0, invalidations: 0, membershipChanges: 0, errors: 0, eligible: 0, excluded: 0, lastInvalidation: "initial" };

  constructor(...args: ConstructorParameters<typeof SpotLight>) {
    super(...args);
    this.removed = this.getScene().onMeshRemovedObservable.add(mesh => {
      const wasExcluded = this.excluded.delete(mesh);
      this.pending.delete(mesh);
      if (this.records.length) this.records = this.records.filter(record => record.mesh !== mesh);
      this.receiverStats.eligible = this.records.length;
      this.receiverStats.excluded = this.excluded.size;
      const index = this.output.indexOf(mesh); if (index >= 0) this.output.splice(index, 1);
      if (wasExcluded && !mesh.isDisposed() && !this.receiversDisposed) mesh._resyncLightSource(this);
      this.invalidate("topology");
    });
  }
  configureStockVehicleLease(options: VehicleLeaseOptions) {
    if (options.kind !== "vehicle" || options.range !== 32 || !Number.isFinite(options.movementReserveMetres) || options.movementReserveMetres <= 0)
      throw new TypeError("Only stock32m vehicle lease with a positive movement reserve is supported");
    this.options = Object.freeze({ ...options });
    this.invalidate("light-configuration");
  }
  setPolicyEnabled(enabled: boolean) {
    if (this.receiversDisposed || this.policyEnabled === enabled) return;
    this.policyEnabled = enabled;
    this.leaseValid = false;
    if (!enabled) this.clearExclusions();
  }
  /** Optional explicit preparation after final world/material construction while
   * policy is bypassed. It changes no lighting/variants and moves eligibility
   * cost outside gameplay. Later invalidations can still require rebuilding. */
  prepareStaticReceivers() {
    if (this.receiversDisposed || this.getScene().isDisposed) return;
    if (this.policyEnabled) throw new Error("Prepare static receivers only during explicit policy bypass");
    this.rebuildRecords();
    this.leaseValid=false;
  }
  invalidate(reason: LeaseInvalidation) {
    if (this.receiversDisposed) return;
    this.receiverStats.invalidations++;
    this.receiverStats.lastInvalidation = reason;
    this.leaseValid = false;
    if (reason === "topology" || reason === "material" || reason === "bounds-transform" || reason === "geometry" || reason === "animation-deformation") this.rebuild = true;
  }
  override canAffectMesh(mesh: AbstractMesh) {
    return super.canAffectMesh(mesh) && !this.excluded?.has(mesh);
  }
  override setEnabled(enabled: boolean) {
    // Stock VehicleLighting places the beam before activation. Constructor
    // virtual calls see policyEnabled undefined and retain native behavior.
    if (enabled && this.policyEnabled === true) this.ensureReceivers(true);
    super.setEnabled(enabled);
    if (!enabled) this.leaseValid = false;
  }
  private supported() {
    const scene = this.getScene();
    return !!this.options && !scene.isDisposed && scene.lightsEnabled && this.parent === null &&
      this.falloffType === Light.FALLOFF_STANDARD && this.range === this.options.range &&
      this.lightmapMode === Light.LIGHTMAP_DEFAULT && this.metadata?.simulatedVehicleLight === true &&
      !this.projectionTexture && !this.iesProfileTexture && this.canAffectMesh === CarReceiverLeaseLight.prototype.canAffectMesh &&
      Number.isFinite(this.position.x) && Number.isFinite(this.position.y) && Number.isFinite(this.position.z);
  }
  private setExcluded(mesh: AbstractMesh, excluded: boolean) {
    if (excluded === this.excluded.has(mesh)) return;
    if (excluded) this.excluded.add(mesh); else this.excluded.delete(mesh);
    if (!mesh.isDisposed()) { mesh._resyncLightSource(this); this.pending.add(mesh); }
    this.receiverStats.membershipChanges++;
    this.receiverStats.excluded = this.excluded.size;
  }
  private clearExclusions() {
    for (const mesh of this.excluded) this.setExcluded(mesh, false);
  }
  private capture(mesh: AbstractMesh): Receiver | undefined {
    if (!(mesh instanceof Mesh) || mesh.getClassName() !== "Mesh" || mesh.isDisposed() ||
        mesh.isAnInstance || mesh.hasInstances || mesh.hasThinInstances || mesh.skeleton || mesh.morphTargetManager ||
        mesh.bakedVertexAnimationManager || mesh.infiniteDistance || mesh.billboardMode !== 0 || mesh.doNotSyncBoundingInfo ||
        mesh.metadata?.windDeformed || !(mesh.metadata?.artStatic === true || mesh.metadata?.sourcePack === "architecture-reality") ||
        !knownMaterial(mesh.material)) return undefined;
    const positions = mesh.getVertexBuffer(VertexBuffer.PositionKind);
    if (!positions || positions.isUpdatable()) return undefined;
    for (let node: Node | null = mesh; node; node = node.parent) {
      if (node.animations.length || this.animatedTargets.has(node)) return undefined;
      if (node instanceof TransformNode && (this.animatedTargets.has(node.position) || this.animatedTargets.has(node.rotation) ||
          this.animatedTargets.has(node.rotationQuaternion) || this.animatedTargets.has(node.scaling))) return undefined;
    }
    mesh.computeWorldMatrix(!mesh.isSynchronized());
    const bounds = mesh.getBoundingInfo(); if (bounds.isLocked) return undefined;
    const min = bounds.boundingBox.minimumWorld, max = bounds.boundingBox.maximumWorld;
    if (![min.x,min.y,min.z,max.x,max.y,max.z].every(Number.isFinite) || min.x > max.x || min.y > max.y || min.z > max.z) return undefined;
    return { mesh, minX: min.x, minY: min.y, minZ: min.z, maxX: max.x, maxY: max.y, maxZ: max.z };
  }
  private rebuildRecords() {
    this.records.length = 0;
    this.animatedTargets.clear();
    try {
      for (const animation of this.getScene().animatables) {
        this.animatedTargets.add(animation.target);
        for (const runtime of animation.getAnimations()) {
          const target: unknown = runtime.target;
          if (Array.isArray(target)) for (const item of target) this.animatedTargets.add(item); else this.animatedTargets.add(target);
        }
      }
      const eligible = new Set<AbstractMesh>();
      for (const mesh of this.getScene().meshes) {
        this.receiverStats.fullMeshVisits++;
        const record = this.capture(mesh);
        if (record) { this.records.push(record); eligible.add(mesh); }
      }
      for (const mesh of this.excluded) if (!eligible.has(mesh)) this.setExcluded(mesh, false);
      this.rebuild = false;
      this.receiverStats.rebuilds++;
      this.receiverStats.eligible = this.records.length;
    } finally { this.animatedTargets.clear(); }
  }
  private canExclude(record: Receiver) {
    const mesh = record.mesh;
    if (!super.canAffectMesh(mesh)) return false;
    const cap = (mesh.material as LitMaterial).maxSimultaneousLights;
    const supported = GetSupportedSimultaneousLights(this.getScene(), cap);
    if (!Number.isSafeInteger(cap) || cap < 1 || !Number.isSafeInteger(supported) || supported < 1) return false;
    let counterfactual = 1;
    for (const light of mesh.lightSources) if (light !== this) counterfactual++;
    if (counterfactual > supported) return false;
    const x = Math.max(record.minX - this.anchor.x, 0, this.anchor.x - record.maxX);
    const y = Math.max(record.minY - this.anchor.y, 0, this.anchor.y - record.maxY);
    const z = Math.max(record.minZ - this.anchor.z, 0, this.anchor.z - record.maxZ);
    const distanceSquared = x*x + y*y + z*z;
    const reach = this.options!.range + this.options!.movementReserveMetres + MARGIN;
    return Number.isFinite(distanceSquared) && distanceSquared > reach*reach;
  }
  private ensureReceivers(active: boolean) {
    if (this.receiversDisposed) return;
    if (!this.policyEnabled || !this.supported()) { this.clearExclusions(); this.leaseValid = false; return; }
    if (!active) { this.leaseValid = false; this.receiverStats.offGates++; return; }
    const dx = this.position.x-this.anchor.x, dy = this.position.y-this.anchor.y, dz = this.position.z-this.anchor.z;
    if (this.leaseValid && dx*dx+dy*dy+dz*dz <= this.options!.movementReserveMetres**2) {
      this.receiverStats.steadyGates++; return;
    }
    try {
      if (this.rebuild) this.rebuildRecords();
      this.anchor.x=this.position.x; this.anchor.y=this.position.y; this.anchor.z=this.position.z;
      for (const record of this.records) { this.receiverStats.recordVisits++; this.setExcluded(record.mesh, this.canExclude(record)); }
      this.leaseValid = true; this.receiverStats.refreshes++;
    } catch (error) {
      this.receiverStats.errors++; this.clearExclusions(); this.leaseValid = false; this.rebuild = true;
      throw error;
    }
  }
  /** Call after all mutations/gltf cap repair, before stable ordering and draw.
   * Output is reused; consume synchronously. setEnabled pre-ON retains changes. */
  prepareReceivers(active = this.isEnabled()): readonly AbstractMesh[] {
    this.ensureReceivers(active);
    this.output.length = 0;
    for (const mesh of this.pending) this.output.push(mesh);
    this.pending.clear();
    return this.output;
  }
  override dispose() {
    if (this.receiversDisposed) return;
    this.receiversDisposed = true;
    this.getScene().onMeshRemovedObservable.remove(this.removed);
    this.excluded.clear(); this.pending.clear(); this.output.length=0; this.records.length=0; this.animatedTargets.clear();
    this.receiverStats.eligible=0; this.receiverStats.excluded=0;
    super.dispose();
  }
}
