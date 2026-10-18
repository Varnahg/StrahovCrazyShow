import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import type { Material } from "@babylonjs/core/Materials/material";
import type { Scene } from "@babylonjs/core/scene";

/** Temporary main-pass visibility of authored non-instanced receivers only.
 * No geometry, light, camera or material is created or changed. Unsupported
 * instance/skinned/morph paths remain explicitly outside this narrow scope. */
export class AuthoredLightPreparation {
  private generation = 0;
  private disposed = false;
  private stop?: () => void;
  readonly selection = { selected: 0, unsupported: 0 };

  constructor(private readonly scene: Scene) {}

  begin(): () => void {
    this.stop?.();
    if (this.disposed || this.scene.isDisposed) return () => {};
    const generation = ++this.generation;
    const changed: Mesh[] = [];
    const release = () => {
      if (this.generation !== generation) return;
      this.generation++;
      this.stop = undefined;
      let hasError = false, failure: unknown;
      for (const mesh of changed.splice(0)) {
        try {
          // A later external false write wins. A true flag present before this
          // lease was never changed or added to this list in the first place.
          if (!mesh.isDisposed() && mesh.alwaysSelectAsActiveMesh === true)
            mesh.alwaysSelectAsActiveMesh = false;
        } catch (error) { if (!hasError) { hasError = true; failure = error; } }
      }
      if (hasError) throw failure;
    };
    this.stop = release;
    this.selection.selected = this.selection.unsupported = 0;
    const seen = new Map<Material, Set<string>>();
    const camera = this.scene.activeCamera;
    const pass = camera?.renderPassId ?? this.scene.getEngine().currentRenderPassId;
    try {
      for (const node of this.scene.meshes) {
        const pack = node.metadata?.sourcePack;
        if (pack !== "architecture-reality" && pack !== "outdoor-artifacts") continue;
        if (node.isDisposed() || !node.isEnabled() || !node.isVisible || node.visibility <= 0) continue;
        // alwaysSelect bypasses frustum culling only, not these actual draw gates.
        if (node.scaling.hasAZeroComponent || (camera && !(node.layerMask & camera.layerMask))) continue;
        const material = node.getMaterialForRenderPass(pass) ?? node.material;
        if (pack === "architecture-reality") {
          if (!(material instanceof StandardMaterial) || material.metadata?.exteriorOnlyGlass !== true) continue;
        } else if (!(material instanceof PBRMaterial) || material.metadata?.sourcePack !== "outdoor-artifacts") continue;
        if (!(node instanceof Mesh) || node.getClassName() !== "Mesh" || !node.geometry ||
            node.skeleton || node.morphTargetManager || node.bakedVertexAnimationManager ||
            node.hasThinInstances || node.instances.length) {
          this.selection.unsupported++; continue;
        }
        const attributes = node.getVerticesDataKinds().sort().map(kind => {
          const buffer = node.getVertexBuffer(kind)!;
          return [kind, buffer.getSize(), buffer.type, buffer.normalized, buffer.byteStride, buffer.byteOffset, buffer.getInstanceDivisor()];
        });
        if (attributes.some(attribute => attribute[6] !== 0)) {
          this.selection.unsupported++; continue;
        }
        const layout = JSON.stringify([attributes, node.receiveShadows, node.useVertexColors, node.hasVertexAlpha,
          node.applyFog, node.sideOrientation, node.nonUniformScaling, node.visibility, node.isUnIndexed,
          node.getWorldMatrix().determinant() < 0, node.geometry.getIndexBuffer()?.is32Bits ?? false,
          // Conservative identity/order coverage: equal material and buffers do
          // not imply equal shader slots when light membership differs by mesh.
          node.lightSources.map(light => light.uniqueId)]);
        let layouts = seen.get(material);
        if (!layouts) { layouts = new Set(); seen.set(material, layouts); }
        if (layouts.has(layout)) continue;
        layouts.add(layout);
        this.selection.selected++;
        if (!node.alwaysSelectAsActiveMesh) {
          changed.push(node);
          node.alwaysSelectAsActiveMesh = true;
        }
      }
      return release;
    } catch (error) {
      try { release(); } finally { throw error; }
    }
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.stop?.();
  }
}
