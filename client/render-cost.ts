import type { Scene } from "@babylonjs/core/scene";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { InstancedMesh } from "@babylonjs/core/Meshes/instancedMesh";
import { MultiMaterial } from "@babylonjs/core/Materials/multiMaterial";
import type { Material } from "@babylonjs/core/Materials/material";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";

const technicalName = (value: string) => value.slice(0, 96);

/** Technical source identity only; no matrix, bounds, readiness or shader work. */
export function renderMeshIdentity(mesh: AbstractMesh) {
  let source = "unclassified";
  let node: typeof mesh.parent = mesh;
  for (let depth = 0; node && depth < 8; depth++, node = node.parent) {
    const tag = node.metadata?.sourcePack ?? node.metadata?.vegetation;
    if (typeof tag === "string" && tag) {
      source = technicalName(tag);
      break;
    }
  }
  return {
    meshId: mesh.uniqueId,
    name: technicalName(mesh.name),
    source,
    kind: mesh.getClassName(),
    sourceMesh:
      mesh instanceof InstancedMesh
        ? technicalName(mesh.sourceMesh.name)
        : null,
  };
}

type LightGroup = {
  materialId: number;
  name: string;
  kind: string;
  maxSimultaneousLights: number | null;
  enabledMeshes: number;
  activeMeshes: number;
  minEnabledLightSources: number | null;
  maxEnabledLightSources: number | null;
  enabledLightSourcesHistogram: Record<string, number>;
};
const materialBudget = (material: Material) => {
  const value = (material as Material & { maxSimultaneousLights?: number })
    .maxSimultaneousLights;
  return typeof value === "number" && Number.isFinite(value) ? value : null;
};
function declaredMaterials(mesh: AbstractMesh): Material[] {
  const material = mesh.material;
  if (!material) return [];
  if (!(material instanceof MultiMaterial)) return [material];
  const selected = new Set<Material>();
  for (const sub of mesh.subMeshes ?? []) {
    const child = material.subMaterials[sub.materialIndex];
    if (child) selected.add(child);
  }
  // Deliberately do not call SubMesh.getMaterial(): in Babylon9.30 it can
  // reset draw caches. This is declared inventory, not a draw-event trace.
  return [...selected];
}

/** On-demand structural inventory, never FPS/GPU timing or a shader-count claim.
 * Registered totals deliberately include disabled LODs; enabled totals do not. */
export function captureRenderCostInventory(
  scene: Scene,
  { detailLimit = 512 }: { detailLimit?: number } = {},
) {
  const limit = Number.isFinite(detailLimit)
    ? Math.max(0, Math.min(2048, Math.floor(detailLimit)))
    : 512;
  const geometries = new Map<number, number>();
  const activeMaterials = new Set<number>();
  const lightAssignments = new Set<string>();
  let enabled = 0,
    hidden = 0,
    instances = 0,
    potentialTriangles = 0;
  const byMaterialClass: Record<string, number> = {};
  const treeLods = [0, 0, 0];
  const active = scene.getActiveMeshes();
  const activeSet = new Set(active.data.slice(0, active.length));
  const activeStats = {
    geometryMeshes: 0,
    frozenWorldMatrices: 0,
    potentialSubmeshes: 0,
    regularInstances: 0,
    sourceMeshesWithInstances: 0,
    meshesWithThinInstances: 0,
    thinInstances: 0,
    skinnedMeshes: 0,
    morphMeshes: 0,
    nativeLodSources: 0,
  };
  const activeClasses: Record<string, number> = {};
  const activeDetails: (ReturnType<typeof renderMeshIdentity> & {
    frozenWorldMatrix: boolean;
    potentialSubmeshes: number;
    indices: number;
    regularInstance: boolean;
    thinInstances: number;
    nativeLodLevels: number;
    material: string | null;
    materialClass: string | null;
  })[] = [];
  const budgets = new Map<number, LightGroup>();
  const budgetGroup = (material: Material) => {
    let group = budgets.get(material.uniqueId);
    if (!group) {
      group = {
        materialId: material.uniqueId,
        name: technicalName(material.name),
        kind: material.getClassName(),
        maxSimultaneousLights: materialBudget(material),
        enabledMeshes: 0,
        activeMeshes: 0,
        minEnabledLightSources: null,
        maxEnabledLightSources: null,
        enabledLightSourcesHistogram: {},
      };
      budgets.set(material.uniqueId, group);
    }
    return group;
  };
  for (const material of [...scene.materials, ...scene.multiMaterials])
    budgetGroup(material);
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
    const isActive = activeSet.has(mesh);
    if (isActive) {
      const regularInstance = mesh instanceof InstancedMesh;
      const thinInstances =
        mesh instanceof Mesh && mesh.hasThinInstances
          ? mesh.thinInstanceCount
          : 0;
      const lod = mesh instanceof Mesh ? mesh.getLODLevels().length : 0;
      activeStats.geometryMeshes++;
      activeStats.frozenWorldMatrices += Number(mesh.isWorldMatrixFrozen);
      activeStats.potentialSubmeshes += mesh.subMeshes?.length ?? 0;
      activeStats.regularInstances += Number(regularInstance);
      activeStats.sourceMeshesWithInstances += Number(mesh.hasInstances);
      activeStats.meshesWithThinInstances += Number(thinInstances > 0);
      activeStats.thinInstances += thinInstances;
      activeStats.skinnedMeshes += Number(!!mesh.skeleton);
      activeStats.morphMeshes += Number(!!mesh.morphTargetManager);
      activeStats.nativeLodSources += Number(lod > 0);
      const kind = mesh.material?.getClassName() ?? "none";
      activeClasses[kind] = (activeClasses[kind] ?? 0) + 1;
      if (activeDetails.length < limit)
        activeDetails.push({
          ...renderMeshIdentity(mesh),
          frozenWorldMatrix: mesh.isWorldMatrixFrozen,
          potentialSubmeshes: mesh.subMeshes?.length ?? 0,
          indices: mesh.getTotalIndices(),
          regularInstance,
          thinInstances,
          nativeLodLevels: lod,
          material: mesh.material ? technicalName(mesh.material.name) : null,
          materialClass: mesh.material?.getClassName() ?? null,
        });
    }
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
      for (const assigned of declaredMaterials(mesh)) {
        const group = budgetGroup(assigned);
        group.enabledMeshes++;
        group.activeMeshes += Number(isActive);
        group.minEnabledLightSources = Math.min(
          group.minEnabledLightSources ?? lights.length,
          lights.length,
        );
        group.maxEnabledLightSources = Math.max(
          group.maxEnabledLightSources ?? lights.length,
          lights.length,
        );
        group.enabledLightSourcesHistogram[lights.length] =
          (group.enabledLightSourcesHistogram[lights.length] ?? 0) + 1;
      }
    }
  }
  const budgetHistogram: Record<string, number> = {};
  let minBudget: number | null = null,
    maxBudget: number | null = null,
    knownBudgets = 0;
  for (const group of budgets.values()) {
    const cap = group.maxSimultaneousLights;
    budgetHistogram[cap === null ? "unavailable" : String(cap)] =
      (budgetHistogram[cap === null ? "unavailable" : String(cap)] ?? 0) + 1;
    if (cap !== null) {
      knownBudgets++;
      minBudget = Math.min(minBudget ?? cap, cap);
      maxBudget = Math.max(maxBudget ?? cap, cap);
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
    triangleEstimateScope:
      "legacy index-count / 3 estimates; mixed non-triangle topology, instancing and multiple render passes are not a verified triangle count",
    registeredMaterials: scene.materials.length,
    enabledDistinctMaterials: activeMaterials.size,
    enabledMeshCountsByMaterialClass: byMaterialClass,
    materialLightAssignmentGroups: lightAssignments.size,
    lights: scene.lights.length,
    enabledLights: scene.lights.filter((light) => light.isEnabled()).length,
    enabledTreeMeshesByLod: treeLods,
    active: {
      ...activeStats,
      declaredMaterialClasses: activeClasses,
      meshes: activeDetails,
      detailsOmitted: activeStats.geometryMeshes - activeDetails.length,
      scope:
        "membership in the last Scene active-mesh list; potential submeshes and declared materials are not actual submissions or effective native-LOD materials; no transform/readiness evaluation",
    },
    maxSimultaneousLights: {
      min: minBudget,
      max: maxBudget,
      materialsWithBudget: knownBudgets,
      materialsWithoutBudget: budgets.size - knownBudgets,
      histogram: budgetHistogram,
      scope:
        "current declared material caps across registered materials and encountered assignments, including disabled geometry; never inferred from fixtures or enabled-light count",
    },
    materialLightGroups: [...budgets.values()].slice(0, limit),
    materialLightGroupsOmitted: Math.max(0, budgets.size - limit),
    materialLightScope:
      "per declared material, counts of actually enabled entries in enabled-visible meshes' lightSources; activeMeshes adds sampled active-list membership; counts are not GPU fragment-light cost or material-bind/draw counts",
  };
}
