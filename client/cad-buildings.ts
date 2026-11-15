import { LoadAssetContainerAsync } from "@babylonjs/core/Loading/sceneLoader";
import type { AssetContainer } from "@babylonjs/core/assetContainer";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import type { Scene } from "@babylonjs/core/scene";
import type { CadDoorDefinition, CadDoorState } from "../shared/cad-doors";
import { createCadDoorRenderer } from "./cad-doors";
import "@babylonjs/loaders/glTF";
import type { CadPlacement, CadBuildingSite, CadPoint3 } from "../shared/cad-building-geometry";
import { cadEntryZones, cadDoorVisibilityGroup, configureCadWindowGlass, createCadInteriorVisibility } from "./cad-interior-visibility";
import surfaceRepair from "../shared/data/assets/cad-surface-repair-20261114.json";
import { assetSha256 } from "./asset-sha256";
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
  model?: { interactiveDoors?: CadDoorDefinition[] };
  site?: CadBuildingSite;
};

type ContainerLoader = (url: string, scene: Scene) => Promise<AssetContainer>;
async function loadPinnedRender(scene: Scene, url: string, pin: { bytes: number; sha256: string }, signal?: AbortSignal) {
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error(`Načtení renderu budovy selhalo (${response.status}).`);
  const buffer = await response.arrayBuffer();
  if (buffer.byteLength !== pin.bytes || await assetSha256(buffer, signal) !== pin.sha256)
    throw new Error("Render budovy neodpovídá vydané geometrii.");
  return LoadAssetContainerAsync(new Uint8Array(buffer), scene, { pluginExtension: ".glb", name: url.split("?")[0].split("/").at(-1) });
}
export type CadBuildingsController = {
  readonly stats: { buildings: number; meshes: number; materials: number };
  readonly visibility: readonly ReturnType<typeof createCadInteriorVisibility>["stats"][];
  updateVisibility(camera: CadPoint3): void;
  setDoorStates(states: readonly Pick<CadDoorState, "id" | "open">[]): void;
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
  const doors: ReturnType<typeof createCadDoorRenderer>[] = [];
  const interiors: ReturnType<typeof createCadInteriorVisibility>[] = [];
  const roots = new Set<TransformNode>();
  const stats = { buildings: 0, meshes: 0, materials: 0 };
  let disposed = false;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    options.signal?.removeEventListener("abort", dispose);
    scene.onDisposeObservable.remove(sceneObserver);
    for (const interior of interiors) interior.dispose();
    interiors.length = 0;
    for (const renderer of doors) renderer.dispose();
    doors.length = 0;
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
      const repair = surfaceRepair[asset.id as keyof typeof surfaceRepair];
      const render = repair?.nativeSha256 === asset.glbSha256 ? repair : undefined;
      const renderUrl = render ? `${render.url}?v=${render.sha256}` : asset.url;
      const container = render && !options.loadContainer
        ? await loadPinnedRender(scene, renderUrl, render, options.signal)
        : await load(renderUrl, scene);
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
          renderGlbSha256: render?.sha256 ?? asset.glbSha256,
          shadowCaster: true,
        };
        mesh.computeWorldMatrix(true);
      }
      const visibilitySite = asset.id === "b06" ? asset.site : undefined;
      for (const material of container.materials) {
        material.metadata = {
          ...material.metadata,
          sourcePack: "cad-buildings",
          buildingId: asset.id,
          sourceGlbSha256: asset.glbSha256,
          renderGlbSha256: render?.sha256 ?? asset.glbSha256,
        };
        if (visibilitySite) configureCadWindowGlass(material);
      }
      const definitions = asset.model?.interactiveDoors ?? [];
      const zones = visibilitySite ? cadEntryZones(visibilitySite, definitions) : [];
      let renderer: ReturnType<typeof createCadDoorRenderer> | undefined;
      if (definitions.length) {
        renderer = createCadDoorRenderer(scene, pivot, meshes, definitions,
          visibilitySite ? door => cadDoorVisibilityGroup(zones, door) : undefined);
        doors.push(renderer);
      }
      if (visibilitySite)
        interiors.push(createCadInteriorVisibility(pivot, meshes, visibilitySite, asset.placement, zones, renderer?.meshes ?? []));
      assertActive();
      stats.buildings++;
      stats.meshes += meshes.length;
      stats.materials += container.materials.length;
    }
    return { stats, dispose, visibility: interiors.map(interior => interior.stats),
      updateVisibility(camera) {
        for (const interior of interiors) interior.update(camera);
      }, setDoorStates(states) {
      if (disposed) return;
      for (const renderer of doors) renderer.setStates(states);
      for (const interior of interiors) interior.setDoorStates(states);
    } };
  } catch (error) {
    dispose();
    throw error;
  }
}
