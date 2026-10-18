import { Camera } from "@babylonjs/core/Cameras/camera";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { AvatarRig } from "./avatar-renderer";

/** Loading-stage scope only. Keeps the actual perspective camera and pass.
 * Uses authored conservative bounds, never bind-pose bounds or cached rigs.
 */
export class AvatarPreparationFarPlane {
  private originalMaxZ: number | undefined;

  constructor(private readonly camera: Camera) {}

  restore() {
    if (this.originalMaxZ === undefined) return;
    this.camera.maxZ = this.originalMaxZ;
    this.originalMaxZ = undefined;
  }

  apply(avatars: Iterable<Pick<AvatarRig, "root">>) {
    this.restore();
    const camera = this.camera, scene = camera.getScene();
    const near = camera.minZ, fullFar = camera.maxZ;
    if (scene.isDisposed || scene.activeCamera !== camera ||
      camera.mode !== Camera.PERSPECTIVE_CAMERA ||
      !Number.isFinite(near) || !Number.isFinite(fullFar) ||
      near <= 0 || fullFar <= near) return;

    const view = camera.getViewMatrix();
    for (const value of view.m) if (!Number.isFinite(value)) return;
    const attached = new Set(scene.meshes), point = Vector3.Zero();
    let maximumDepth = -Infinity, corners = 0;
    for (const { root } of avatars) {
      if (root.isDisposed() || root.getScene() !== scene || !root.isEnabled()) continue;
      for (const mesh of root.getChildMeshes(false)) {
        // LOD-detached children remain under the rig; only attached renderable
        // pieces participate. Do not frustum-cull: retain distant avatars too.
        if (!attached.has(mesh) || mesh.isDisposed() || !mesh.isEnabled() ||
          !mesh.isVisible || mesh.visibility <= 0 ||
          !(mesh.layerMask & camera.layerMask)) continue;
        mesh.computeWorldMatrix(true);
        for (const corner of mesh.getBoundingInfo().boundingBox.vectorsWorld) {
          Vector3.TransformCoordinatesToRef(corner, view, point);
          const depth = scene.useRightHandedSystem ? -point.z : point.z;
          if (!Number.isFinite(point.x) || !Number.isFinite(point.y) || !Number.isFinite(depth)) return;
          maximumDepth = Math.max(maximumDepth, depth);
          corners++;
        }
      }
    }
    // Empty/invalid/behind-camera envelopes retain full readiness and view.
    // The original near distance supplies the same reserve as the CPU proof.
    const far = Math.min(fullFar, maximumDepth + near);
    if (!corners || !Number.isFinite(far) || far <= near || far >= fullFar) return;
    this.originalMaxZ = fullFar;
    camera.maxZ = far;
  }
}
