import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { InstancedMesh } from "@babylonjs/core/Meshes/instancedMesh";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import type { Material } from "@babylonjs/core/Materials/material";
import type { Scene } from "@babylonjs/core/scene";

type Lease = {
  mesh: AbstractMesh;
  source: Mesh;
  parent: AbstractMesh["parent"];
  attachment?: { attached: boolean };
  flag: boolean;
  registered: boolean;
  registrationOwned: boolean;
  enabledOwned: boolean;
  writingEnabled: boolean;
  detach?: () => void;
};

/** Temporary main-pass draw coverage of declared, existing world receivers.
 * No proxy, transform, material, geometry, camera or light is changed. */
export class AuthoredLightPreparation {
  private generation = 0;
  private disposed = false;
  private stop?: () => void;
  /** Concrete startup mutation ownership, including synchronous release handoff. */
  private readonly leases = new Map<AbstractMesh, Lease>();
  readonly selection = { selected: 0, unsupported: 0 };

  constructor(private readonly scene: Scene) {}

  begin(): () => void {
    const previous = this.stop;
    previous?.();
    // A callback from that release can install a newer request. Do not replace
    // it again after returning to the older begin call.
    if (this.stop && this.stop !== previous) return () => {};
    if (this.disposed || this.scene.isDisposed) return () => {};
    const generation = ++this.generation, changed: Lease[] = [];
    const records = new Map<AbstractMesh, Lease>();
    let active = true, writingRegistration: AbstractMesh | undefined;
    let detachRemoved: (() => void) | undefined;
    const current = () => active && this.generation === generation && !this.disposed && !this.scene.isDisposed;
    const release = () => {
      if (!active) return;
      active = false;
      if (this.stop === release) { this.stop = undefined; this.generation++; }
      let hasError = false, failure: unknown;
      const attempt = (work: () => void) => { try { work(); } catch (error) { if (!hasError) { hasError = true; failure = error; } } };
      attempt(() => detachRemoved?.()); detachRemoved = undefined;
      for (const lease of changed.splice(0)) {
        attempt(() => lease.detach?.()); lease.detach = undefined;
        const mesh = lease.mesh, owns = () => this.leases.get(mesh) === lease;
        if (!mesh.isDisposed()) {
          // Transfer the original baseline if begin reenters from any setter.
          // No old write may run after a newer concrete lease claimed this mesh.
          if (owns() && lease.flag && mesh.alwaysSelectAsActiveMesh === true) {
            lease.flag = false;
            attempt(() => { mesh.alwaysSelectAsActiveMesh = false; });
          }
          const sameOwner = () => owns() && mesh.parent === lease.parent &&
            (!(mesh instanceof InstancedMesh) || mesh.sourceMesh === lease.source) &&
            !lease.parent?.isDisposed() && !lease.source.isDisposed() && !mesh.isDisposed();
          const takenOver = () => lease.attachment?.attached === true;
          const oneRegistration = () => this.scene.meshes.indexOf(mesh) !== -1 &&
            this.scene.meshes.indexOf(mesh) === this.scene.meshes.lastIndexOf(mesh);
          if (sameOwner() && !takenOver() && lease.enabledOwned &&
              (lease.registered || (lease.registrationOwned && oneRegistration())) && mesh.isEnabled(false) === true) {
            lease.enabledOwned = false;
            attempt(() => mesh.setEnabled(false));
          }
          // The native setter above dispatches observers synchronously. A new
          // lease or actual B6 controller takeover must be checked afterwards.
          if (sameOwner() && !takenOver() && lease.registrationOwned && oneRegistration() && !this.scene.isDisposed) {
            lease.registrationOwned = false;
            attempt(() => { this.scene.removeMesh(mesh); });
          }
        }
        if (owns()) this.leases.delete(mesh);
      }
      records.clear();
      if (hasError) throw failure;
    };
    this.stop = release;
    this.selection.selected = this.selection.unsupported = 0;
    const seen = new Map<Material, Set<string>>(), nodes = [...this.scene.meshes];
    const camera = this.scene.activeCamera;
    const engine = this.scene.getEngine();
    const pass = camera?.renderPassId ?? engine.currentRenderPassId;
    const drawable = (node: AbstractMesh) => !node.isDisposed() && node.isVisible && node.visibility > 0 &&
      !node.scaling.hasAZeroComponent && (!camera || !!(node.layerMask & camera.layerMask));
    const acquire = (mesh: AbstractMesh, source: Mesh, attachment?: Lease["attachment"]) => {
      const registered = this.scene.meshes.includes(mesh), previous = this.leases.get(mesh);
      const previousOwner = previous?.source === source && previous.parent === mesh.parent ? previous : undefined;
      const takenOver = attachment?.attached === true;
      const registrationOwned = !takenOver && registered && previousOwner?.registrationOwned === true;
      const lease: Lease = { mesh, source, parent: mesh.parent, attachment,
        flag: !mesh.alwaysSelectAsActiveMesh || previousOwner?.flag === true,
        registered: registrationOwned ? previousOwner!.registered : registered,
        registrationOwned, enabledOwned: !takenOver && previousOwner?.enabledOwned === true, writingEnabled: false };
      changed.push(lease); records.set(mesh, lease); this.leases.set(mesh, lease);
      this.selection.selected++;
      if (lease.flag && !mesh.alwaysSelectAsActiveMesh) mesh.alwaysSelectAsActiveMesh = true;
      if (!current()) return;
      if (!registered) {
        lease.registrationOwned = true; writingRegistration = mesh;
        try { this.scene.addMesh(mesh); } finally { writingRegistration = undefined; }
        if (!current()) return;
        if (!this.scene.meshes.includes(mesh)) throw new Error("Declared receiver could not enter the main-pass Scene");
      }
      const enable = !mesh.isEnabled(false);
      if (enable || lease.enabledOwned) {
        lease.enabledOwned = true;
        const observer = mesh.onEnabledStateChangedObservable.add(value => {
          // A prior notification can still be dispatching while a reentrant
          // begin installs this observer. Ignore an outer stale true/false.
          if (!lease.writingEnabled && value === false && mesh.isEnabled(false) === false) lease.enabledOwned = false;
        });
        lease.detach = () => mesh.onEnabledStateChangedObservable.remove(observer);
        if (enable) {
          lease.writingEnabled = true;
          try { mesh.setEnabled(true); } finally { lease.writingEnabled = false; }
        }
      }
      if (current() && (!mesh.isEnabled() || !this.scene.meshes.includes(mesh)))
        throw new Error("Declared receiver changed during acquisition");
    };
    try {
      const observer = this.scene.onMeshRemovedObservable.add(mesh => {
        if (writingRegistration !== mesh && !this.scene.meshes.includes(mesh)) { const lease = records.get(mesh); if (lease) lease.registrationOwned = false; }
      });
      detachRemoved = () => this.scene.onMeshRemovedObservable.remove(observer);
      for (const node of nodes) {
        if (!current()) break;
        const declaration = node.metadata?.authoredLightReceiver;
        const instanced = declaration === "b6-prop-source" || declaration === "road-sign-face";
        const declared = instanced || declaration === "stadium-glass";
        const pack = node.metadata?.sourcePack;
        if (!declared && pack !== "architecture-reality" && pack !== "outdoor-artifacts") continue;
        if (node.isDisposed() || !node.isEnabled()) continue;
        if (!instanced && !drawable(node)) continue;
        const material = node.getMaterialForRenderPass(pass) ?? node.material;
        if (declared) { if (!(material instanceof PBRMaterial)) { this.selection.unsupported++; continue; } }
        else if (pack === "architecture-reality") {
          if (!(material instanceof StandardMaterial) || material.metadata?.exteriorOnlyGlass !== true) continue;
        } else if (!(material instanceof PBRMaterial) || material.metadata?.sourcePack !== "outdoor-artifacts") continue;
        if (!(node instanceof Mesh) || node.getClassName() !== "Mesh" || !node.geometry ||
            node.skeleton || node.morphTargetManager || node.bakedVertexAnimationManager || node.hasThinInstances ||
            node.getLODLevels().length || (!instanced && node.instances.length) ||
            (instanced && !engine.getCaps().instancedArrays) ||
            (instanced && node.instancedBuffers && Object.keys(node.instancedBuffers).length)) {
          this.selection.unsupported++; continue;
        }
        // Native instance draws add world-matrix buffers to the mesh overlay,
        // including the per-pass WebGPU path. Compare the source geometry ABI.
        const attributes = node.getVerticesDataKinds(true).sort().map(kind => {
          const buffer = node.getVertexBuffer(kind, true)!;
          return [kind, buffer.getSize(), buffer.type, buffer.normalized, buffer.byteStride, buffer.byteOffset, buffer.getInstanceDivisor()];
        });
        if (attributes.some(attribute => attribute[6] !== 0)) { this.selection.unsupported++; continue; }
        const sign = node.computeWorldMatrix().determinant() < 0;
        let candidate: AbstractMesh = node;
        let attachment: Lease["attachment"];
        if (instanced) {
          const found = node.instances.find(instance => {
            if (!(instance instanceof InstancedMesh) || instance.getScene() !== this.scene ||
                instance.sourceMesh !== node || !drawable(instance) || instance.parent?.isEnabled() === false ||
                (instance.computeWorldMatrix().determinant() < 0) !== sign ||
                (instance.getMaterialForRenderPass(pass) && instance.getMaterialForRenderPass(pass) !== material)) return false;
            const registered = this.scene.meshes.includes(instance), producer = instance.metadata?.b6PreparationAttachment;
            if (declaration === "b6-prop-source") {
              const previous = this.leases.get(instance);
              const pendingBorrow = previous?.source === node && previous.parent === instance.parent && previous.registrationOwned && registered;
              if (typeof producer?.attached !== "boolean" ||
                  (producer.attached ? !registered || !instance.isEnabled(false) :
                    (registered && !pendingBorrow) || (instance.isEnabled(false) && !pendingBorrow))) return false;
              attachment = producer;
              return true;
            }
            return registered && instance.isEnabled();
          });
          if (!found) { this.selection.unsupported++; continue; }
          candidate = found;
        }
        const layout = JSON.stringify([attributes, node.receiveShadows, node.useVertexColors, node.hasVertexAlpha,
          node.applyFog, node.sideOrientation, node.nonUniformScaling, node.visibility, node.isUnIndexed, sign,
          node.geometry.getIndexBuffer()?.is32Bits ?? false, node.lightSources.map(light => light.uniqueId),
          // New source groups keep actual geometry/source identity and draw mode.
          // Old architecture/outdoor deduplication retains its original meaning.
          declared ? [node.uniqueId, node.geometry.uniqueId, instanced] : null]);
        let layouts = seen.get(material);
        if (!layouts) { layouts = new Set(); seen.set(material, layouts); }
        if (layouts.has(layout)) continue;
        layouts.add(layout);
        acquire(candidate, node, attachment);
      }
      return release;
    } catch (error) {
      try { release(); } finally { throw error; }
    } finally { seen.clear(); nodes.length = 0; }
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.stop?.();
  }
}
