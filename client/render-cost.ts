import type { Scene } from "@babylonjs/core/scene";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { InstancedMesh } from "@babylonjs/core/Meshes/instancedMesh";

/** On-demand structural inventory, never FPS/GPU timing or a shader-count claim.
 * Registered totals deliberately include disabled LODs; enabled totals do not. */
export function captureRenderCostInventory(scene: Scene) {
  const geometries = new Map<number, number>();
  const activeMaterials = new Set<number>();
  const lightAssignments = new Set<string>();
  let enabled = 0,
    hidden = 0,
    instances = 0,
    potentialTriangles = 0;
  const byMaterialClass: Record<string, number> = {};
  const treeLods = [0, 0, 0];
  for (const mesh of scene.meshes) {
    if (mesh.isDisposed() || !mesh.getTotalVertices()) continue;
    const geometry =
      mesh instanceof InstancedMesh
        ? mesh.sourceMesh.geometry
        : mesh instanceof Mesh
          ? mesh.geometry
          : undefined;
    if (geometry)
      geometries.set(geometry.uniqueId, geometry.getTotalIndices() / 3);
    if (!mesh.isEnabled() || !mesh.isVisible || mesh.visibility <= 0) {
      hidden++;
      continue;
    }
    enabled++;
    if (mesh instanceof InstancedMesh) instances++;
    const count =
      mesh instanceof Mesh && mesh.hasThinInstances
        ? mesh.thinInstanceCount
        : 1;
    potentialTriangles += (mesh.getTotalIndices() / 3) * count;
    if (mesh.metadata?.vegetation === "tree")
      treeLods[mesh.metadata.detailLevel]++;
    const material = mesh.material;
    if (material) {
      activeMaterials.add(material.uniqueId);
      const kind = material.getClassName();
      byMaterialClass[kind] = (byMaterialClass[kind] ?? 0) + 1;
      const lights = mesh.lightSources
        .filter((light) => light.isEnabled())
        .map((light) => light.uniqueId)
        .sort((a, b) => a - b);
      lightAssignments.add(
        `${material.uniqueId}:${mesh.receiveShadows}:${lights.join(",")}`,
      );
    }
  }
  return {
    registeredMeshes: scene.meshes.length,
    enabledVisibleGeometryMeshes: enabled,
    hiddenGeometryMeshes: hidden,
    enabledRegularInstances: instances,
    uniqueGeometries: geometries.size,
    uniqueGeometryTriangles: [...geometries.values()].reduce(
      (a, b) => a + b,
      0,
    ),
    enabledPotentialTriangles: potentialTriangles,
    registeredMaterials: scene.materials.length,
    enabledDistinctMaterials: activeMaterials.size,
    enabledMeshCountsByMaterialClass: byMaterialClass,
    materialLightAssignmentGroups: lightAssignments.size,
    lights: scene.lights.length,
    enabledLights: scene.lights.filter((light) => light.isEnabled()).length,
    enabledTreeMeshesByLod: treeLods,
  };
}
