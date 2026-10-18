import { Camera } from "@babylonjs/core/Cameras/camera";
import type { BoundingSphere } from "@babylonjs/core/Culling/boundingSphere";
import { Constants } from "@babylonjs/core/Engines/constants";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { InstancedMesh } from "@babylonjs/core/Meshes/instancedMesh";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import type { SubMesh } from "@babylonjs/core/Meshes/subMesh";
import type { Scene } from "@babylonjs/core/scene";

/** Read only the public native LOD contract. Calling getLOD while sorting is
 * unsafe: it also pre-activates meshes and can reset the current instance batch.
 * Babylon 9.30's distance/screen thresholds and delayed-source fallback are
 * verified against real getLOD selections by the dispatch regression tests.
 */
export function readNativeLod(
  source: Mesh,
  camera: Camera,
  sphere: BoundingSphere,
): Mesh | null {
  const levels = source.getLODLevels();
  if (!levels.length) return source;
  const center = sphere.centerWorld,
    eye = camera.globalPosition;
  const dx = center.x - eye.x,
    dy = center.y - eye.y,
    dz = center.z - eye.z;
  const distance =
    camera.mode === Camera.ORTHOGRAPHIC_CAMERA
      ? camera.minZ
      : Math.sqrt(dx * dx + dy * dy + dz * dz);
  const coverage = source.useLODScreenCoverage;
  const value = coverage
    ? (((sphere.radiusWorld * camera.minZ) / distance) ** 2 * Math.PI) /
      camera.screenArea
    : distance;
  for (const level of levels) {
    if (
      coverage
        ? value < level.distanceOrScreenCoverage
        : value > level.distanceOrScreenCoverage
    ) {
      if (
        level.mesh?.delayLoadState === Constants.DELAYLOADSTATE_NOTLOADED ||
        level.mesh?.delayLoadState === Constants.DELAYLOADSTATE_LOADING
      )
        return source;
      return level.mesh;
    }
  }
  return source;
}

const materialTie = (a: SubMesh, b: SubMesh) =>
  (a.getMaterial(false)?.uniqueId ?? -1) -
    (b.getMaterial(false)?.uniqueId ?? -1) ||
  a.getRenderingMesh().uniqueId - b.getRenderingMesh().uniqueId ||
  a.materialIndex - b.materialIndex ||
  a.indexStart - b.indexStart;

/** Sky remains first. Other opaque draws go near to far, using the closest
 * actually active instance belonging to each native LOD draw group. No private
 * renderer fields, mesh/world changes or alpha/transparent ordering changes.
 */
export function createSkyFirstOpaqueComparator(
  scene: Scene,
  sky: AbstractMesh,
) {
  let renderId = -1;
  let previousCamera: Camera | null = null;
  const groupDistances = new Map<AbstractMesh, number>();
  const subMeshDistances = new Map<SubMesh, number>();
  let supported = true;
  let evaluatedFrame = -1;
  const evaluated = scene.onAfterActiveMeshesEvaluationObservable.add(() => {
    evaluatedFrame = scene.getFrameId();
  });
  scene.onDisposeObservable.addOnce(() => {
    scene.onAfterActiveMeshesEvaluationObservable.remove(evaluated);
    groupDistances.clear();
    subMeshDistances.clear();
  });

  const distanceSquared = (sphere: BoundingSphere, camera: Camera) => {
    const c = sphere.centerWorld,
      p = camera.globalPosition;
    const distance = (c.x - p.x) ** 2 + (c.y - p.y) ** 2 + (c.z - p.z) ** 2;
    return Number.isFinite(distance) ? distance : Infinity;
  };
  const include = (mesh: AbstractMesh, distance: number) => {
    groupDistances.set(
      mesh,
      Math.min(groupDistances.get(mesh) ?? Infinity, distance),
    );
  };
  const refresh = (camera: Camera) => {
    renderId = scene.getRenderId();
    previousCamera = camera;
    groupDistances.clear();
    subMeshDistances.clear();
    // Arbitrary selectors and frozen render queues can use a choice other than
    // current native thresholds. Keep safe material/geometry ordering there.
    supported =
      !scene.customLODSelector && evaluatedFrame === scene.getFrameId();
    if (!supported) return;
    const active = scene.getActiveMeshes();
    for (let i = 0; i < active.length; i++) {
      const mesh = active.data[i];
      if (
        mesh.isDisposed() ||
        !mesh.isEnabled() ||
        !mesh.isVisible ||
        mesh.visibility <= 0 ||
        (mesh.layerMask & camera.layerMask) === 0
      )
        continue;
      const sphere = mesh.getBoundingInfo().boundingSphere;
      if (mesh instanceof InstancedMesh) {
        const selected = readNativeLod(mesh.sourceMesh, camera, sphere);
        if (!selected) continue;
        // Negative determinant instances use Babylon's regular-mesh fallback
        // instead of the hardware group. Do not infer its dispatch privately.
        if (
          mesh.getWorldMatrix().determinant() >= 0 !==
          selected.getWorldMatrix().determinant() >= 0
        ) {
          supported = false;
          groupDistances.clear();
          return;
        }
        include(selected, distanceSquared(sphere, camera));
      } else if (mesh instanceof Mesh) {
        const selected = readNativeLod(mesh, camera, sphere);
        if (selected && (selected !== mesh || groupDistances.has(selected)))
          include(selected, distanceSquared(sphere, camera));
      }
    }
    // A visible master can share its own draw with its instances. It may have
    // appeared before them in the active list, so add that contribution last.
    for (let i = 0; i < active.length; i++) {
      const mesh = active.data[i];
      if (
        mesh instanceof Mesh &&
        !(mesh instanceof InstancedMesh) &&
        groupDistances.has(mesh)
      )
        include(
          mesh,
          distanceSquared(mesh.getBoundingInfo().boundingSphere, camera),
        );
    }
  };
  const distance = (subMesh: SubMesh, camera: Camera) => {
    const group = groupDistances.get(subMesh.getRenderingMesh());
    if (group !== undefined) return group;
    let value = subMeshDistances.get(subMesh);
    if (value === undefined) {
      value = distanceSquared(subMesh.getBoundingInfo().boundingSphere, camera);
      subMeshDistances.set(subMesh, value);
    }
    return value;
  };

  return (a: SubMesh, b: SubMesh) => {
    const skyA = a.getMesh() === sky,
      skyB = b.getMesh() === sky;
    if (skyA !== skyB) return skyA ? -1 : 1;
    const camera = scene.activeCamera;
    if (!camera) return materialTie(a, b);
    if (scene.getRenderId() !== renderId || camera !== previousCamera)
      refresh(camera);
    if (!supported) return materialTie(a, b);
    const aDistance = distance(a, camera),
      bDistance = distance(b, camera);
    return aDistance < bDistance
      ? -1
      : aDistance > bDistance
        ? 1
        : materialTie(a, b);
  };
}
