import { LoadAssetContainerAsync } from "@babylonjs/core/Loading/sceneLoader";
import type { AssetContainer } from "@babylonjs/core/assetContainer";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import type { Scene } from "@babylonjs/core/scene";
import "@babylonjs/loaders/glTF";
import type { CadPlacement } from "../shared/cad-building-geometry";
import type { WorldAssetIdentity } from "../shared/world-asset-identity";
import {
  attachWorldAssetNode,
  disposeEmptyWorldAssetRoots,
  getWorldAssetRoot,
} from "./world-asset-identity";

export type CadBuildingAsset = {
  id: string;
  identity: WorldAssetIdentity;
  url: string;
  glbSha256: string;
  sourceRecipeSha256: string;
  placement: CadPlacement;
};

type ContainerLoader = (url: string, scene: Scene) => Promise<AssetContainer>;
export type CadBuildingsController = {
  readonly stats: { buildings: number; meshes: number; materials: number };
  dispose(): void;
};

/** Each scene owns its imported model, materials and source-identity pivot.
 * The caller awaits this critical asset before allowing gameplay to start. */
export async function loadCadBuildings(
  scene: Scene,
  assets: readonly CadBuildingAsset[],
  options: { signal?: AbortSignal; loadContainer?: ContainerLoader } = {},
): Promise<CadBuildingsController> {
  if (!scene.useRightHandedSystem)
    throw new Error("CAD model vyžaduje pravotočivou scénu hry.");
  const containers: AssetContainer[] = [];
  const pivots: TransformNode[] = [];
  const roots = new Set<TransformNode>();
  const stats = { buildings: 0, meshes: 0, materials: 0 };
  let disposed = false;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    options.signal?.removeEventListener("abort", dispose);
    scene.onDisposeObservable.remove(sceneObserver);
    for (const container of containers) container.dispose();
    for (const pivot of pivots) if (!pivot.isDisposed()) pivot.dispose(false, false);
    disposeEmptyWorldAssetRoots(roots);
    containers.length = pivots.length = 0;
    roots.clear();
  };
  const sceneObserver = scene.onDisposeObservable.add(dispose);
  options.signal?.addEventListener("abort", dispose, { once: true });
  const assertActive = () => {
    if (disposed || scene.isDisposed || options.signal?.aborted)
      throw new Error("Načítání CAD budov bylo zrušeno.");
  };
  const load = options.loadContainer ?? LoadAssetContainerAsync;
  try {
    assertActive();
    for (const asset of assets) {
      const container = await load(asset.url, scene);
      if (disposed || scene.isDisposed || options.signal?.aborted) {
        container.dispose();
        assertActive();
      }
      containers.push(container);
      const nodes = [...container.transformNodes, ...container.meshes];
      const sourceRoot = nodes.find((node) => node.name === asset.identity.key);
      const extras = sourceRoot?.metadata?.gltf?.extras;
      if (
        extras?.buildingId !== asset.id ||
        extras?.sourceRecipeSha256 !== asset.sourceRecipeSha256
      )
        throw new Error(`CAD model ${asset.id} nemá očekávanou identitu a původ.`);
      const importedRoots = nodes.filter((node) => !node.parent);
      const meshes = container.meshes.filter((mesh) => mesh.getTotalVertices() > 0);
      if (!importedRoots.length || !meshes.length)
        throw new Error(`CAD model ${asset.id} neobsahuje stavební geometrii.`);
      const pivot = new TransformNode(`cad-building:${asset.id}`, scene);
      pivots.push(pivot);
      const { x, y, z } = asset.placement.translation;
      pivot.position.set(x, y, z);
      pivot.rotation.y = asset.placement.yaw;
      // Keep the native glTF hierarchy and local transforms intact. In an RH
      // scene these are the same local coordinates as the collision export.
      container.addAllToScene();
      for (const node of importedRoots) node.parent = pivot;
      const root = getWorldAssetRoot(scene, asset.identity, asset.placement.translation);
      roots.add(root);
      attachWorldAssetNode(pivot, root);
      for (const mesh of meshes) {
        mesh.receiveShadows = true;
        mesh.isPickable = false;
        mesh.metadata = {
          ...mesh.metadata,
          cadBuilding: asset.id,
          assetKey: asset.identity.key,
          sourceId: asset.identity.sourceId,
          sourceGlbSha256: asset.glbSha256,
          shadowCaster: true,
        };
        mesh.computeWorldMatrix(true);
      }
      for (const material of container.materials)
        material.metadata = {
          ...material.metadata,
          sourcePack: "cad-buildings",
          buildingId: asset.id,
          sourceGlbSha256: asset.glbSha256,
        };
      assertActive();
      stats.buildings++;
      stats.meshes += meshes.length;
      stats.materials += container.materials.length;
    }
    return { stats, dispose };
  } catch (error) {
    dispose();
    throw error;
  }
}
