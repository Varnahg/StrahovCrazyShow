import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData";
import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector";
import { BoundingInfo } from "@babylonjs/core/Culling/boundingInfo";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { Camera } from "@babylonjs/core/Cameras/camera";
import { Material } from "@babylonjs/core/Materials/material";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import type { Scene } from "@babylonjs/core/scene";
import type { AssetContainer } from "@babylonjs/core/assetContainer";
import type { ShadowDepthWrapper } from "@babylonjs/core/Materials/shadowDepthWrapper";
import { TREES } from "../shared/world";
import { treeDetailLevel, treeTrunkCollision } from "../shared/vegetation";
import { groundHeight } from "../shared/terrain";
import type { Vec3 } from "../shared/types";
import { phenologyForTree, type TreeFamily, type TreePhenology, type TreeSeasonState } from "../shared/tree-season";
import { parseLegacyTreeManifest, parseTreePilotManifest, treeAssetUrl, type LegacyTreeManifest, type TreeAssetFile, type TreePilotOptions, type TreePilotManifest, type TreeMaterialKey, type TreePrototype, type TreeLod, type TreeLodProfile } from "../shared/tree-asset-types";
import { grassFocusDistance } from "./photo-grass-budget";
import sourceMaterials from "../shared/data/assets/tree-materials-manifest.json";
import bark from "../shared/data/assets/tree-bark-material.json";
import { TreeAssetLoader, decodeTreeRuntimeChunk, decodeTreePrototype, treePrototypeFoliageRanks, uniqueTreeSourceBytes } from "./tree-asset-loader";
import { parseTreeClusterBank, type TreeClusterBank } from "../shared/tree-cluster-types";
import { decodeTreeClusterGeometry } from "./tree-cluster-geometry";
import { applyTreeCrownShading, configureTreeMaterial } from "./tree-appearance";
import { TreeWindPlugin, type TreeWindState } from "./tree-wind";
import { createWebGpuShadowDepthWrapper } from "./webgpu-shadow-readiness";
import { createTreeSeasonGeometryPlan, applyTreeSeasonGeometry, type TreeSeasonGeometryPlan } from "./tree-season-geometry";
import { TreeSeasonMaterialPlugin, setTreeSeasonMaterialState } from "./tree-season-material";

export const TREE_DETAIL_CACHE_LIMIT = 32;
export const TREE_DETAIL_BYTES_LIMIT = 64 * 1024 * 1024;
// V2 admits whole GLBs; v3 FAR GLBs; v4 also bank JSON, placements and atlas maps.
// These immutable source bytes are not expanded geometry bytes or total VRAM.
export const TREE_PILOT_BYTES_LIMIT = 96 * 1024 * 1024;
const fullLeaf: TreePhenology = Object.freeze({ leafAmount: 1, maturity: 1, senescence: 0, litterPotential: 0 });
const referenceFocalPixels = 720 / (2 * Math.tan(.85 / 2));
/** Curved individual leaves remain the hero LOD. Only an audited full LOD1
 * may replace it sooner; historical sparse LODs retain their original policy. */
export function treeDetailForProjection(distance: number, quality: string, profile?: TreeLodProfile, projectionScale = 1): TreeLod {
  if (profile !== "full-coverage") return treeDetailLevel(distance, quality);
  const scale = Number.isFinite(projectionScale) && projectionScale > 0 ? projectionScale : 1;
  const normalized = distance / scale, near = quality === "high" ? 12 : quality === "medium" ? 8 : 6;
  return normalized < near ? 0 : treeDetailLevel(normalized, quality) === 2 ? 2 : 1;
}
type TreeGroup = { id: string; x: number; z: number; root: TransformNode; lods: Mesh[][]; active: number; desired: number; family: TreeFamily; seed: number; pilot: boolean; lodProfile?: TreeLodProfile; phenology?: TreePhenology; stream?: { id: string; prototype: TreePrototype } };
type PilotParts = (ReturnType<typeof decodeTreePrototype>[number] & { clusterKey?: string })[];
type ClusterBankEntry = { key: string; file: TreeAssetFile; bank: TreeClusterBank };
type ClusterTextureEntry = { file: TreeAssetFile; pending: Promise<Texture>; texture?: Texture };
type ClusterStage = {
  banks: Map<string, ClusterBankEntry>; materials: Map<string, PBRMaterial>;
  textures: Map<string, ClusterTextureEntry>; committed: boolean;
};
const assetKey = (file: TreeAssetFile) => `${file.url}:${file.bytes}:${file.sha256}`;
type PilotBytes = { source: number; sourceFiles?: readonly TreeAssetFile[]; geometry: number; season: number };
export type TreeRenderStats = {
  treePilot?: "own" | "mtree";
  treeSeason?: { sampledAt: number; source: "regional-model" | "demo"; phaseDay: number };
  treeInstances: number; uniqueTreeModels?: number; treeDetailCounts?: [number, number, number];
  activeTreeTriangles?: number; loadedTreeMeshes?: number; pendingTreeLoads?: number; bootstrapBytes?: number; loadError?: string;
  legacyTreeInstances?: number; rankEnabledTreeInstances?: number; treeDetailCacheEntries?: number;
  treeDetailCacheBytes?: number; treeDetailReservedBytes?: number; treePilotGeometryBytes?: number;
  treePilotSourceBytes?: number; treePilotSeasonBytes?: number;
  treeTextureSourceBytes?: number; treeFetchedBytes?: number; treeFetchRequests?: number;
};
export type TreeRenderInput = { time: number; quality: string; player: Vec3; wind: { x: number; z: number; speed: number }; season?: TreeSeasonState };

/** Authored buffers are local in all LODs. Discard the historical v1 node
 * translation and bind every late mesh to the same current source root. */
export function attachAuthoredTreeMesh(mesh: Mesh, root: TransformNode) {
  mesh.unfreezeWorldMatrix(); mesh.parent = root; mesh.rotationQuaternion = Quaternion.Identity();
  mesh.rotation.setAll(0); mesh.scaling.setAll(1); mesh.position.setAll(0);
  mesh.computeWorldMatrix(true); mesh.refreshBoundingInfo(); mesh.freezeWorldMatrix();
}
function padWindBounds(mesh: Mesh) {
  const box = mesh.getBoundingInfo().boundingBox;
  mesh.setBoundingInfo(new BoundingInfo(box.minimum.subtract(new Vector3(.1, 0, .1)), box.maximum.add(new Vector3(.1, 0, .1))));
  mesh.getBoundingInfo().update(mesh.getWorldMatrix());
}

/** Owns tree lifetime only. Grass/landcover never enter this cache. */
export class TreeRenderer {
  readonly stats: TreeRenderStats;
  private readonly loader = new TreeAssetLoader();
  private treeContainer?: AssetContainer;
  private treeRuntime?: LegacyTreeManifest;
  private treeGroups: TreeGroup[] = [];
  private trees: Mesh[] = [];
  private sharedTreeMaterials: PBRMaterial[] = [];
  private readonly materials = new Map<TreeMaterialKey, PBRMaterial>();
  private readonly clusterBanks = new Map<string, ClusterBankEntry>();
  private readonly clusterMaterials = new Map<string, PBRMaterial>();
  private readonly clusterTextures = new Map<string, { file: TreeAssetFile; texture: Texture }>();
  private readonly textureSources = new Map<string, TreeAssetFile>();
  private readonly textures = new Set<Texture>();
  private readonly treeShadows: ShadowDepthWrapper[] = [];
  private readonly treeWind: TreeWindState = { time: 0, x: 0, z: 0 };
  private readonly plans = new WeakMap<Mesh, TreeSeasonGeometryPlan>();
  private readonly loadingTrees = new Set<string>();
  private readonly loadingPilots = new Set<string>();
  private readonly failedTrees = new Set<string>();
  private readonly detailCache = new Map<string, number>();
  private readonly detailBytes = new Map<string, number>();
  private readonly reservations = new Map<string, number>();
  private readonly pilotBytes = new Map<string, PilotBytes>();
  private pilotMetricsDirty = true;
  private readonly player = Vector3.Zero();
  private readonly selectionEye = Vector3.Zero();
  private season?: TreeSeasonState;
  private lastSelection = -Infinity;
  private previousQuality = "";
  private revision = 0;
  private loaded?: Promise<void>;
  private selections: Readonly<Record<string, string>>;
  private disposed = false;
  constructor(private readonly scene: Scene, private readonly options: { treePilot?: TreePilotOptions; treeCatalog?: TreeAssetFile; stats?: TreeRenderStats } = {}) {
    this.stats = options.stats ?? { treeInstances: 0 };
    this.selections = Object.freeze({ ...options.treePilot?.selections });
  }
  load() { return this.loaded ??= this.loadAll(); }
  /** Borrowed immutable texture owners. The caller must dispose its derived
   * materials before this renderer; merely reading never initiates new IO. */
  get litterMaterials() {
    const leafMaterial = this.materials.get("LeafSet024");
    if (!this.alive() || !leafMaterial) return undefined;
    return { leafMaterial, twigMaterial: this.materials.get("fir_tree_01") };
  }
  litterSources() {
    return this.treeGroups.map(group => {
      const source = TREES.find(tree => tree.osmId === group.id)!;
      return { id: group.id, x: group.x, z: group.z,
        crownRadius: (source.reconstruction?.crownDiameter ?? source.crownDiameter ?? source.size) / 2,
        family: group.family, seed: group.seed };
    });
  }
  private alive() { return !this.disposed && !this.scene.isDisposed; }
  private error(error: unknown) { if (this.alive()) this.stats.loadError = error instanceof Error ? error.message : String(error); }
  private createGroup(id: string): TreeGroup {
    const tree = TREES.find(t => t.osmId === id)!;
    const root = new TransformNode("Native source tree " + id, this.scene);
    root.position.set(tree.x, groundHeight(tree.x, tree.z), tree.z);
    root.metadata = { sourceTreeId: id, independentlyAuthored: true, terrainAnchored: true, provenance: tree.provenance };
    let seed = 0; for (const c of id) seed = (seed * 31 + c.charCodeAt(0)) >>> 0;
    const appearance = tree.reconstruction?.appearance;
    return { id, x: tree.x, z: tree.z, root, lods: [[], [], []], active: 2, desired: 2, family: appearance === "conifer" ? "evergreen-conifer" : appearance === "bare" ? "reference-bare" : "deciduous-broadleaf", seed, pilot: false };
  }
  private configureFoliage(material: PBRMaterial, tintDirectTranslucency = false) {
    material.alpha = 1;
    new TreeWindPlugin(material, this.treeWind);
    new TreeSeasonMaterialPlugin(material, { tintDirectTranslucency });
    const wrapper = createWebGpuShadowDepthWrapper(material, this.scene);
    material.shadowDepthWrapper = wrapper; this.treeShadows.push(wrapper);
  }
  private describe(mesh: Mesh, group: TreeGroup, lod: number, foliage: boolean, pilot = false) {
    const source = TREES.find(t => t.osmId === group.id)!;
    mesh.isVisible = true; mesh.isPickable = false; mesh.receiveShadows = true; mesh.hasVertexAlpha = false;
    mesh.metadata = { vegetation: "tree", provenance: source.provenance, osmId: group.id, terrainAnchored: true, sourceTreeModel: group.id, detailLevel: lod, appearance: source.reconstruction?.appearance, shadowCaster: true, depthCaster: foliage ? "alpha-test" : "opaque", windDeformed: foliage, treeRole: foliage ? "foliage" : "wood", ...(pilot ? { treeNormalSource: "authored-local", rankEnabled: foliage } : {}) };
    if (!pilot) applyTreeCrownShading(mesh, source.reconstruction);
    mesh.setEnabled(false); attachAuthoredTreeMesh(mesh, group.root);
    if (foliage) padWindBounds(mesh);
  }
  private validatePilot(manifest: TreePilotManifest, selections: Readonly<Record<string, string>>) {
    const ids = Object.keys(selections);
    if (!ids.length || ids.length > TREES.length) throw Error("Pilot requires explicit existing source selections");
    const validateSource = (id: string, prototypeId: string) => {
      const placement = manifest.placements.find(p => p.sourceTreeId === id), source = TREES.find(t => t.osmId === id), p = manifest.prototypes[prototypeId];
      if (!source || !placement || !p || !placement.prototypeCandidates.includes(prototypeId) || p.sourceTreeId !== id || Math.abs(placement.sourceRootXZ[0] - source.x) > .001 || Math.abs(placement.sourceRootXZ[1] - source.z) > .001 || Math.abs(p.trunkRadius - treeTrunkCollision(source).radius) > .001) throw Error("Pilot source root/trunk/candidate mismatch: " + id);
    };
    for (const id of ids) validateSource(id, selections[id]);
    if (manifest.version !== 2) {
      if (manifest.placements.length > TREES.length) throw Error("Streamed tree population exceeds known catalogue");
      for (const [prototypeId, prototype] of Object.entries(manifest.prototypes)) validateSource(prototype.sourceTreeId, prototypeId);
    }
    const files = ids.flatMap(id => {
      const p = manifest.prototypes[selections[id]];
      return [p.lods[manifest.version === 2 ? 0 : 2], ...(p.farCluster ? [p.farCluster.placements, manifest.banks![p.farCluster.bankId]] : [])];
    });
    const bytes = uniqueTreeSourceBytes(files);
    if (bytes > TREE_PILOT_BYTES_LIMIT) throw Error("Pilot geometry exceeds byte budget");
    return ids;
  }
  private catalogSelections(manifest: TreePilotManifest): Readonly<Record<string, string>> {
    if (manifest.version === 2 || manifest.placements.length !== TREES.length || Object.keys(manifest.prototypes).length !== TREES.length)
      throw Error("Tree catalog requires every known source exactly once in a streamed manifest");
    const placements = new Map(manifest.placements.map(placement => [placement.sourceTreeId, placement]));
    const selections: Record<string, string> = Object.create(null);
    for (const source of TREES) {
      const placement = placements.get(source.osmId);
      if (!placement || placement.prototypeCandidates.length !== 1) throw Error("Tree catalog source has no unambiguous prototype: " + source.osmId);
      selections[source.osmId] = placement.prototypeCandidates[0];
    }
    // Parsed candidates already bind prototype/source identity. Reuse all root,
    // collider, known-population and byte-budget checks before publishing this map.
    this.validatePilot(manifest, selections);
    return Object.freeze(selections);
  }
  private async loadAll() {
    let pilot: TreePilotManifest | undefined, ids: string[] = [];
    try {
      if (this.options.treePilot && this.options.treeCatalog) throw Error("Tree pilot and complete catalog options are mutually exclusive");
      if (this.options.treeCatalog) {
        pilot = parseTreePilotManifest(await this.loader.jsonAsset(this.options.treeCatalog));
        this.selections = this.catalogSelections(pilot);
        ids = Object.keys(this.selections);
      } else if (this.options.treePilot) {
        pilot = parseTreePilotManifest(await this.loader.json(treeAssetUrl(this.options.treePilot.manifestUrl)));
        ids = this.validatePilot(pilot, this.selections);
      }
    } catch (error) { this.error(error); pilot = undefined; }
    if (!this.alive()) return;
    // A complete explicit population can omit v1. Today's two-source
    // pilot deliberately retains the measured legacy bootstrap cost.
    const allReplaced = ids.length === TREES.length;
    if (allReplaced) this.stats.bootstrapBytes = 0;
    try { if (!allReplaced) await this.loadLegacy(); }
    catch (error) { this.error(error); this.clearMeshes(); }
    if (pilot && this.alive()) {
      try { await this.loadPilot(pilot, ids); }
      catch (error) {
        this.error(error); this.clearPilotMaterials();
        if (allReplaced && this.alive()) {
          this.clearMeshes();
          try { await this.loadLegacy(); } catch (fallback) { this.error(fallback); this.clearMeshes(); }
        }
      }
    }
    if (this.alive()) { this.applyVisibility(); this.metrics(); }
  }
  private async loadLegacy() {
    const manifest = parseLegacyTreeManifest(await this.loader.json("/models/vegetation/runtime/manifest.json"));
    if (TREES.some(t => !manifest.trees[t.osmId])) throw Error("Legacy manifest missing source tree");
    const container = await this.loader.importLegacy(this.scene, { url: manifest.bootstrap, bytes: manifest.bootstrapBytes, sha256: manifest.bootstrapSha256 }, { materialNames: manifest.materialNames, treeIds: TREES.map(t => t.osmId) });
    if (!this.alive()) { container.dispose(); return; }
    this.treeContainer = container; this.treeRuntime = manifest;
    // Check the complete imported identities/materials before making anything visible.
    this.sharedTreeMaterials = manifest.materialNames.map(name => {
      const material = container.materials.find(m => m.name === name);
      if (!(material instanceof PBRMaterial)) throw Error("Missing shared tree material " + name); return material;
    });
    const meshes = container.meshes.filter((m): m is Mesh => m instanceof Mesh && m.getTotalVertices() > 0);
    for (const source of TREES) if (!meshes.some(m => m.name === `tree__${source.osmId}__lod2__bark`)) throw Error("Legacy bootstrap lacks source wood: " + source.osmId);
    container.addAllToScene();
    for (const material of this.sharedTreeMaterials) if (configureTreeMaterial(material)) this.configureFoliage(material);
    this.treeGroups = TREES.map(t => this.createGroup(t.osmId));
    for (const mesh of meshes) {
      const match = /^tree__(.+)__lod2__(bark|leaves)$/.exec(mesh.name), group = this.treeGroups.find(g => g.id === match?.[1]);
      if (!match || !group) { mesh.setEnabled(false); continue; }
      this.describe(mesh, group, 2, match[2] === "leaves"); group.lods[2].push(mesh); this.trees.push(mesh);
    }
    this.stats.bootstrapBytes = manifest.bootstrapBytes;
    this.applyVisibility();
  }
  private async texture(file: TreeAssetFile, gammaSpace: boolean) {
    const bytes = await this.loader.asset(file);
    if (!this.alive()) throw new DOMException("Tree texture disposed", "AbortError");
    // Already fetched bytes prevent a second unabortable URL request.
    return new Promise<Texture>((resolve, reject) => {
      let texture: Texture | undefined, settled = false;
      const cleanup = () => this.loader.signal.removeEventListener("abort", abort);
      const fail = (error: unknown) => { if (settled) return; settled = true; cleanup(); texture?.dispose(); if (texture) this.textures.delete(texture); reject(error); };
      const abort = () => fail(new DOMException("Tree texture disposed", "AbortError"));
      this.loader.signal.addEventListener("abort", abort, { once: true });
      const done = () => { if (settled) return; if (!this.alive()) { abort(); return; } settled = true; cleanup(); resolve(texture!); };
      try {
        texture = new Texture("data:" + file.url, this.scene, { buffer: bytes, deleteBuffer: true, invertY: false, samplingMode: Texture.TRILINEAR_SAMPLINGMODE, mimeType: file.url.endsWith(".png") ? "image/png" : "image/jpeg", onLoad: () => queueMicrotask(done), onError: (message, exception) => queueMicrotask(() => fail(exception ?? Error(message))) });
        texture.gammaSpace = gammaSpace; texture.anisotropicFilteringLevel = 4; this.textures.add(texture);
        if (texture.isReady()) queueMicrotask(done);
      } catch (error) { fail(error); }
    });
  }
  private async pilotMaterial(key: TreeMaterialKey) {
    const existing = this.materials.get(key); if (existing) return existing;
    if (key === "Bark012") {
      const bark = this.sharedTreeMaterials.find(m => m.name.includes("Bark012"));
      if (bark) { this.materials.set(key, bark); return bark; }
    }
    const source = sourceMaterials.assets.find(a => a.id === key);
    const maps = source ? source.maps : { color: bark.channels.color, normalGL: bark.channels.normalgl, roughness: bark.channels.roughness, opacity: undefined };
    const material = await this.materialFromMaps("CC0 source tree " + key, maps, key !== "Bark012",
      { sourcePixelsModified: false, treeNormalSource: "authored-local", materialKey: key, source: source?.source ?? bark.source, license: "CC0-1.0" });
    // Stejná kalibrace jako native katalog materials.py. Banková mapa má tento
    // účinek již zapečený a nastavuje vlastní level v clusterMaterial.
    material.bumpTexture!.level = .45;
    this.materials.set(key, material);
    this.recordTextureSources(Object.values(maps).filter((file): file is TreeAssetFile => !!file));
    return material;
  }
  private recordTextureSources(files: readonly TreeAssetFile[]) {
    const bytes = uniqueTreeSourceBytes([...this.textureSources.values(), ...files]);
    for (const file of files) this.textureSources.set(file.url, file);
    this.stats.treeTextureSourceBytes = bytes;
  }
  private disposeMaterial(material: PBRMaterial) {
    const wrapper = material.shadowDepthWrapper;
    if (wrapper) { wrapper.dispose(); const index = this.treeShadows.indexOf(wrapper); if (index >= 0) this.treeShadows.splice(index, 1); }
    material.dispose(false, false);
  }
  private async materialFromMaps(name: string, maps: Readonly<Record<string, TreeAssetFile | undefined>>, foliage: boolean,
    metadata: Record<string, unknown>, load: (file: TreeAssetFile, gamma: boolean, semantic: string) => Promise<Texture> =
      (file, gamma) => this.texture(file, gamma), cleanupFailure = true) {
    const entries = Object.entries(maps).filter((entry): entry is [string, TreeAssetFile] => !!entry[1]);
    const results = await Promise.allSettled(entries.map(async ([semantic, file]) => [semantic, await load(file, semantic === "color", semantic)] as const));
    const failure = results.find(result => result.status === "rejected");
    if (failure?.status === "rejected") {
      if (cleanupFailure) for (const result of results) if (result.status === "fulfilled") { result.value[1].dispose(); this.textures.delete(result.value[1]); }
      throw failure.reason;
    }
    const loaded = results.map(result => (result as PromiseFulfilledResult<readonly [string, Texture]>).value);
    if (!this.alive()) throw new DOMException("Tree material disposed", "AbortError");
    const textures = new Map(loaded), material = new PBRMaterial(name, this.scene);
    try {
    material.alpha = 1; material.metallic = 0; material.roughness = 1;
    material.albedoTexture = textures.get("color")!; material.bumpTexture = textures.get("normalGL")!;
    material.metallicTexture = textures.get("roughness")!;
    material.useRoughnessFromMetallicTextureAlpha = false; material.useRoughnessFromMetallicTextureGreen = true; material.useMetallnessFromMetallicTextureBlue = false;
    material.invertNormalMapX = !this.scene.useRightHandedSystem; material.invertNormalMapY = this.scene.useRightHandedSystem;
    if (foliage) {
      material.opacityTexture = textures.get("opacity")!; material.opacityTexture.getAlphaFromRGB = true;
      material.transparencyMode = PBRMaterial.PBRMATERIAL_ALPHATEST; material.alphaCutOff = .5;
      material.backFaceCulling = false; material.twoSidedLighting = true;
      material.subSurface.isTranslucencyEnabled = true; material.subSurface.translucencyIntensity = .12;
      material.subSurface.useAlbedoToTintTranslucency = true; material.subSurface.minimumThickness = 0; material.subSurface.maximumThickness = .001;
      this.configureFoliage(material, true);
    }
    material.metadata = metadata;
    return material;
    } catch (error) {
      this.disposeMaterial(material);
      if (cleanupFailure) for (const [, texture] of loaded) { texture.dispose(); this.textures.delete(texture); }
      throw error;
    }
  }
  private async loadPilot(manifest: TreePilotManifest, ids: string[]) {
    for (const id of ids) this.loadingPilots.add(id);
    const stage: ClusterStage = { banks: new Map(), materials: new Map(), textures: new Map(), committed: false };
    try { await this.loadPilotGeometry(manifest, ids, stage); }
    finally {
      if (!stage.committed) {
        for (const material of stage.materials.values()) this.disposeMaterial(material);
        const results = await Promise.allSettled([...stage.textures.values()].map(entry => entry.pending));
        for (const result of results) if (result.status === "fulfilled") { result.value.dispose(); this.textures.delete(result.value); }
      }
      for (const id of ids) this.loadingPilots.delete(id);
    }
  }
  private async prepareClusterBanks(manifest: TreePilotManifest, ids: string[], stage: ClusterStage) {
    const selected = ids.map(id => manifest.prototypes[this.selections[id]]);
    const banks = new Map<string, ClusterBankEntry>(), files: TreeAssetFile[] = [];
    if (manifest.version !== 4) return banks;
    for (const prototype of selected) {
      files.push(prototype.lods[2]);
      const cluster = prototype.farCluster;
      if (!cluster) continue;
      const file = manifest.banks![cluster.bankId], key = assetKey(file);
      let entry = this.clusterBanks.get(key) ?? stage.banks.get(key);
      if (!entry) {
        entry = { key, file, bank: parseTreeClusterBank(await this.loader.jsonAsset(file)) };
        if (!this.alive()) throw new DOMException("Tree bank disposed", "AbortError");
        stage.banks.set(key, entry);
      }
      banks.set(cluster.bankId, entry);
      files.push(file, cluster.placements, ...Object.values(entry.bank.textures));
    }
    if (uniqueTreeSourceBytes(files) > TREE_PILOT_BYTES_LIMIT) throw Error("Tree FAR bank/assets exceed byte budget");
    return banks;
  }
  private clusterTexture(file: TreeAssetFile, gamma: boolean, level: number, stage: ClusterStage) {
    const key = assetKey(file) + ":" + gamma + ":" + level;
    const existing = this.clusterTextures.get(key);
    if (existing) return Promise.resolve(existing.texture);
    const pending = stage.textures.get(key); if (pending) return pending.pending;
    const entry: ClusterTextureEntry = {
      file, pending: this.texture(file, gamma).then(texture => { texture.level = level; entry.texture = texture; return texture; }),
    };
    stage.textures.set(key, entry); return entry.pending;
  }
  private async clusterMaterial(entry: ClusterBankEntry, stage: ClusterStage) {
    if (this.clusterMaterials.has(entry.key) || stage.materials.has(entry.key)) return;
    const material = await this.materialFromMaps("Authored FAR tree " + entry.key, entry.bank.textures, true,
      { treeNormalSource: "authored-local", sourcePixelsModified: true, treeClusterBank: entry.file.url },
      (file, gamma, semantic) => this.clusterTexture(file, gamma, semantic === "normalGL" ? entry.bank.normalMapStrength : 1, stage), false);
    material.alphaCutOff = entry.bank.alphaCutoff;
    material.bumpTexture!.level = entry.bank.normalMapStrength;
    stage.materials.set(entry.key, material);
  }
  private async loadPilotGeometry(manifest: TreePilotManifest, ids: string[], stage: ClusterStage) {
    const selections = this.selections;
    const banks = manifest.version === 4 ? await this.prepareClusterBanks(manifest, ids, stage) : new Map<string, ClusterBankEntry>();
    // Validate the admitted initial set before allocating meshes. V3/v4 never
    // fetches near/mid here, and even a complete far population uses two workers.
    const decode = async (id: string) => {
      const prototypeId = selections[id], prototype = manifest.prototypes[prototypeId];
      const file = prototype.lods[manifest.version === 2 ? 0 : 2];
      const buffer = await this.loader.asset(file);
      if (!this.alive()) throw new DOMException("Tree pilot disposed", "AbortError");
      const parts: PilotParts = decodeTreePrototype(buffer, prototypeId, prototype, manifest.version === 2 ? undefined : 2);
      let sourceBytes = file.bytes;
      const sourceFiles = [file as TreeAssetFile];
      if (prototype.farCluster) {
        const cluster = prototype.farCluster, entry = banks.get(cluster.bankId)!;
        const placementBytes = await this.loader.asset(cluster.placements);
        if (!this.alive()) throw new DOMException("Tree clusters disposed", "AbortError");
        const geometry = decodeTreeClusterGeometry(placementBytes, entry.bank,
          { groupCount: cluster.groupCount, exactRanks: treePrototypeFoliageRanks(parts) });
        sourceBytes += placementBytes.byteLength;
        sourceFiles.push(cluster.placements);
        if (geometry.indices.length) parts.push({ ...geometry, name: prototypeId + "__lod2__cluster-foliage", lod: 2, role: "foliage",
          materialKey: prototype.family === "evergreen-conifer" ? "fir_tree_01" : "LeafSet024", clusterKey: entry.key });
      }
      return { id, prototypeId, prototype, parts, sourceBytes, sourceFiles };
    };
    const decoded: Awaited<ReturnType<typeof decode>>[] = [];
    if (manifest.version === 2) decoded.push(...await Promise.all(ids.map(decode)));
    else {
      let next = 0, failed = false, failure: unknown;
      await Promise.all([0, 1].map(async () => {
        while (next < ids.length && !failed) {
          const id = ids[next++];
          try { decoded.push(await decode(id)); } catch (error) { failed = true; failure = error; }
        }
      }));
      if (failed) throw failure;
    }
    if (!this.alive()) return;
    const materialKeys = new Set(decoded.flatMap(d => d.parts.filter(p => !p.clusterKey).map(p => p.materialKey)));
    // A valid far LOD may contain wood only. Preload its declared detail leaf
    // pool too, so later geometry never introduces unowned material/texture IO.
    if (manifest.version !== 2) for (const { prototype } of decoded) {
      if (prototype.lods.some(lod => lod.meshNames.some(name => name.endsWith("__foliage")))) materialKeys.add(prototype.family === "evergreen-conifer" ? "fir_tree_01" : "LeafSet024");
    }
    for (const key of materialKeys) await this.pilotMaterial(key);
    const usedBanks = new Set(decoded.flatMap(d => d.parts.flatMap(p => p.clusterKey ? [p.clusterKey] : [])));
    for (const entry of banks.values()) if (usedBanks.has(entry.key)) await this.clusterMaterial(entry, stage);
    if (!this.alive()) return;
    uniqueTreeSourceBytes([...this.textureSources.values(), ...[...stage.textures.values()].map(entry => entry.file)]);
    const staged: { group: TreeGroup; meshes: Mesh[]; fresh: boolean; item: typeof decoded[number] }[] = [];
    try {
      for (const item of decoded) {
        const { id, parts } = item;
        const old = this.treeGroups.find(g => g.id === id), group = old ?? this.createGroup(id), meshes: Mesh[] = [];
        staged.push({ group, meshes, fresh: !old, item });
        meshes.push(...this.createPilotMeshes(group, parts, stage.materials));
      }
    } catch (error) { for (const { group, meshes, fresh } of staged) { for (const mesh of meshes) mesh.dispose(false, false); if (fresh) group.root.dispose(); } throw error; }
    // Commit the complete replacement, then apply the latest state before enable.
    for (const { group, meshes, fresh, item } of staged) {
      for (const old of group.lods.flat()) old.dispose(false, false);
      for (const lod of [0, 1]) {
        const key = group.id + ":" + lod;
        this.detailCache.delete(key); this.detailBytes.delete(key); this.failedTrees.delete(key); this.pilotBytes.delete(key);
      }
      this.pilotBytes.delete(group.id + ":all");
      group.lods = [0, 1, 2].map(lod => meshes.filter(m => m.metadata.detailLevel === lod)); group.family = item.prototype.family; group.pilot = true; group.lodProfile = item.prototype.lodProfile; group.phenology = undefined;
      group.stream = manifest.version !== 2 ? { id: item.prototypeId, prototype: item.prototype } : undefined;
      this.pilotBytes.set(group.id + ":" + (manifest.version !== 2 ? 2 : "all"), this.measurePilot(item.parts, meshes, item.sourceBytes, item.sourceFiles));
      if (fresh) this.treeGroups.push(group);
      this.trees = this.trees.filter(m => !m.isDisposed()); this.trees.push(...meshes);
    }
    for (const [key, value] of stage.banks) this.clusterBanks.set(key, value);
    for (const [key, value] of stage.materials) this.clusterMaterials.set(key, value);
    for (const [key, value] of stage.textures) this.clusterTextures.set(key, { file: value.file, texture: value.texture! });
    this.recordTextureSources([...stage.textures.values()].map(value => value.file));
    stage.committed = true;
    this.pilotMetricsDirty = true;
    this.updatePilotMetrics();
    // Evidence names only the exact committed two-source comparison, never a
    // query parameter whose loading failed or a partially replaced population.
    const variant = ids.length === 2 && ids.includes("ipr-crown-014") && ids.includes("ipr-b6-north-conifer")
      ? (["own", "mtree"] as const).find(name => selections["ipr-crown-014"] === name + "-broadleaf" &&
        selections["ipr-b6-north-conifer"] === name + "-conifer") : undefined;
    this.stats.treePilot = variant;
    this.applyVisibility();
  }
  /** One constructor path preserves winding, local normals, root ownership and
   * partial-allocation cleanup for both bootstrap and streamed geometry. */
  private createPilotMeshes(group: TreeGroup, parts: PilotParts, stagedMaterials?: Map<string, PBRMaterial>) {
    const meshes: Mesh[] = [];
    try {
      for (const part of parts) {
        const mesh = new Mesh(part.name, this.scene); meshes.push(mesh);
        mesh.sideOrientation = this.scene.useRightHandedSystem ? Material.CounterClockWiseSideOrientation : Material.ClockWiseSideOrientation;
        const data = new VertexData(); data.positions = part.positions; data.normals = part.normals; data.uvs = part.uvs; data.colors = part.colors ?? null;
        const plan = part.colors ? createTreeSeasonGeometryPlan(part.indices, part.colors) : undefined;
        data.indices = plan?.indices ?? part.indices; data.applyToMesh(mesh);
        if (plan) this.plans.set(mesh, plan);
        mesh.material = part.clusterKey ? stagedMaterials?.get(part.clusterKey) ?? this.clusterMaterials.get(part.clusterKey)! : this.materials.get(part.materialKey)!;
        if (!mesh.material) throw Error("Tree material owner missing");
        this.describe(mesh, group, part.lod, part.role === "foliage", true);
        if (part.clusterKey) mesh.metadata.treeClusterBank = part.clusterKey;
      }
      return meshes;
    } catch (error) { for (const mesh of meshes) mesh.dispose(false, false); throw error; }
  }
  private measurePilot(parts: PilotParts, meshes: Mesh[], source: number, sourceFiles?: readonly TreeAssetFile[]): PilotBytes {
    return { source, sourceFiles,
      geometry: parts.reduce((sum, p) => sum + p.positions.byteLength + p.normals.byteLength + p.uvs.byteLength + p.indices.byteLength + (p.colors?.byteLength ?? 0), 0),
      season: meshes.reduce((sum, mesh) => { const plan = this.plans.get(mesh); return sum + (plan ? plan.indices.byteLength + plan.ranks.byteLength + plan.indexEnds.byteLength : 0); }, 0) };
  }
  private updatePilotMetrics() {
    if (!this.pilotMetricsDirty) return;
    let source = 0, geometry = 0, season = 0;
    const files = [...this.clusterBanks.values()].map(entry => entry.file);
    for (const entry of this.pilotBytes.values()) {
      if (entry.sourceFiles) files.push(...entry.sourceFiles); else source += entry.source;
      geometry += entry.geometry; season += entry.season;
    }
    source += uniqueTreeSourceBytes(files);
    this.stats.treePilotSourceBytes = source; this.stats.treePilotGeometryBytes = geometry; this.stats.treePilotSeasonBytes = season;
    this.pilotMetricsDirty = false;
  }
  setTreeTransform(id: string, position: Vec3, yaw = 0) {
    if (![position.x, position.y, position.z, yaw].every(Number.isFinite)) return false;
    const tree = this.treeGroups.find(t => t.id === id); if (!tree) return false;
    tree.root.position.set(position.x, position.y, position.z); tree.root.rotation.y = yaw; tree.x = position.x; tree.z = position.z;
    return this.refreshTreeTransform(id);
  }
  refreshTreeTransform(id: string) {
    const tree = this.treeGroups.find(t => t.id === id); if (!tree) return false;
    tree.root.computeWorldMatrix(true);
    for (const mesh of tree.lods.flat()) { mesh.unfreezeWorldMatrix(); mesh.computeWorldMatrix(true); mesh.refreshBoundingInfo(); if (mesh.metadata?.windDeformed) padWindBounds(mesh); mesh.freezeWorldMatrix(); }
    return true;
  }
  private bytes() { let n = 0; for (const b of this.detailBytes.values()) n += b; return n; }
  private reservedBytes() { let n = 0; for (const b of this.reservations.values()) n += b; return n; }
  private trimDetailCache(extraEntries = 0, extraBytes = 0) {
    const over = () => this.detailCache.size + this.reservations.size + extraEntries > TREE_DETAIL_CACHE_LIMIT || this.bytes() + this.reservedBytes() + extraBytes > TREE_DETAIL_BYTES_LIMIT;
    if (!over()) return;
    for (const [key] of [...this.detailCache].sort((a, b) => a[1] - b[1])) {
      if (!over()) break;
      const split = key.lastIndexOf(":"), id = key.slice(0, split), lod = Number(key.slice(split + 1)), tree = this.treeGroups.find(t => t.id === id);
      if (tree && (tree.active === lod || tree.desired === lod)) continue;
      if (tree) { for (const mesh of tree.lods[lod]) mesh.dispose(false, false); tree.lods[lod] = []; }
      this.detailCache.delete(key); this.detailBytes.delete(key); this.pilotBytes.delete(key);
      this.pilotMetricsDirty = true;
    }
    this.trees = this.trees.filter(m => !m.isDisposed()); this.metrics();
  }
  private detailDistance(tree: TreeGroup) {
    return tree.lodProfile === "full-coverage"
      ? grassFocusDistance(tree.x, tree.z, this.selectionEye.x, this.selectionEye.z, this.player.x, this.player.z)
      : Math.hypot(tree.x - this.player.x, tree.z - this.player.z);
  }
  private startDetailLoads() {
    if (!this.alive()) return;
    const candidates = this.treeGroups.filter(t => !this.loadingPilots.has(t.id) && (!t.pilot || t.stream) && t.desired < 2 && !t.lods[t.desired].length)
      .sort((a, b) => a.desired - b.desired || this.detailDistance(a) - this.detailDistance(b));
    for (const tree of candidates) {
      if (this.loadingTrees.size >= 2) break;
      if ([0, 1].some(lod => this.loadingTrees.has(tree.id + ":" + lod))) continue;
      // Prefer requested detail. A failed/oversized near file may still use mid.
      for (const lod of (tree.stream && tree.desired === 0 ? [0, 1] : [tree.desired]) as TreeLod[]) {
        const key = tree.id + ":" + lod, stream = tree.stream;
        const asset = stream?.prototype.lods[lod] ?? (!tree.pilot ? this.treeRuntime?.trees[tree.id]?.[lod] : undefined);
        if (!asset || tree.lods[lod].length || this.failedTrees.has(key)) continue;
        // V3 counts immutable source bytes. V1 retains its conservative extra
        // chunk allowance for derived crown normals; neither is total VRAM.
        const reservation = asset.bytes * (stream ? 1 : 2);
        if (reservation > TREE_DETAIL_BYTES_LIMIT) continue;
        this.trimDetailCache(1, reservation);
        if (this.detailCache.size + this.reservations.size >= TREE_DETAIL_CACHE_LIMIT || this.bytes() + this.reservedBytes() + reservation > TREE_DETAIL_BYTES_LIMIT) continue;
        this.loadingTrees.add(key); this.reservations.set(key, reservation);
        void this.loadDetail(tree, lod, asset, stream).catch(error => {
          if (this.currentDetail(tree, stream)) { this.failedTrees.add(key); this.error(error); }
        }).finally(() => {
          this.loadingTrees.delete(key); this.reservations.delete(key);
          this.metrics(); this.startDetailLoads();
        });
        break;
      }
    }
    this.metrics();
  }
  private currentDetail(tree: TreeGroup, stream: TreeGroup["stream"]) {
    return this.alive() && this.treeGroups.includes(tree) && tree.stream === stream && (!!stream || !tree.pilot);
  }
  private async loadDetail(tree: TreeGroup, lod: TreeLod, asset: TreeAssetFile, stream: TreeGroup["stream"]) {
    const buffer = await this.loader.asset(asset), key = tree.id + ":" + lod;
    if (!this.currentDetail(tree, stream)) return;
    let meshes: Mesh[], retainedBytes: number;
    if (stream) {
      const parts = decodeTreePrototype(buffer, stream.id, stream.prototype, lod);
      // All roles use the same preloaded pool as far. Detail does no texture IO.
      if (parts.some(part => !this.materials.has(part.materialKey))) throw Error("Streamed tree material missing from far pool");
      meshes = this.createPilotMeshes(tree, parts); retainedBytes = buffer.byteLength;
      this.pilotBytes.set(key, this.measurePilot(parts, meshes, retainedBytes, [asset]));
      this.pilotMetricsDirty = true;
    } else {
        const decoded = decodeTreeRuntimeChunk(buffer);
        if (decoded.id !== tree.id || decoded.lod !== lod || decoded.primitives.some((p: { material: number }) => !this.sharedTreeMaterials[p.material])) throw Error("Tree detail identity/material mismatch");
        meshes = [];
        try { for (const primitive of decoded.primitives) {
          const mesh = new Mesh(primitive.name, this.scene); meshes.push(mesh); const data = new VertexData();
          data.positions = primitive.positions; data.normals = primitive.normals; data.uvs = primitive.uvs; data.indices = primitive.indices; data.applyToMesh(mesh);
          mesh.material = this.sharedTreeMaterials[primitive.material]; this.describe(mesh, tree, lod, primitive.name.endsWith("__leaves"));
        } } catch (error) { for (const mesh of meshes) mesh.dispose(false, false); throw error; }
        retainedBytes = buffer.byteLength + decoded.primitives.reduce((n: number, p: { name: string; normals: Float32Array }) => n + (p.name.endsWith("__leaves") ? p.normals.byteLength : 0), 0);
    }
    // Transfer the reservation atomically so no admission counts it twice.
    this.reservations.delete(key); this.detailBytes.set(key, retainedBytes); this.detailCache.set(key, ++this.revision);
    tree.lods[lod] = meshes; this.trees.push(...meshes);
    this.applyVisibility();
  }
  private applyVisibility() {
    if (!this.alive()) return;
    const counts: [number, number, number] = [0, 0, 0]; let triangles = 0;
    for (const group of this.treeGroups) {
      const phenology = this.season ? phenologyForTree(this.season, group.family, group.seed) : fullLeaf;
      const lod = group.lods[group.desired].length ? group.desired : group.desired === 0 && group.lods[1].length ? 1 : 2;
      // Apply to disabled LODs too: late loads and LOD changes can never revive winter leaves.
      for (let level = 0; level < 3; level++) for (const mesh of group.lods[level]) {
        let visible = level === lod;
        if (mesh.metadata?.treeRole === "foliage") {
          setTreeSeasonMaterialState(mesh, group.family, phenology);
          const plan = this.plans.get(mesh), count = plan ? applyTreeSeasonGeometry(mesh, plan, phenology.leafAmount) : phenology.leafAmount === 0 ? 0 : mesh.getTotalIndices();
          visible &&= count > 0; if (visible) triangles += count / 3;
        } else if (visible) triangles += mesh.getTotalIndices() / 3;
        if (mesh.isEnabled() !== visible) mesh.setEnabled(visible);
      }
      group.active = lod; group.phenology = phenology; counts[lod]++;
      if ((!group.pilot || group.stream) && lod < 2) this.detailCache.set(group.id + ":" + lod, ++this.revision);
    }
    this.stats.treeDetailCounts = counts; this.stats.activeTreeTriangles = triangles;
  }
  update(input: TreeRenderInput) {
    if (!this.alive()) return;
    this.player.set(input.player.x, input.player.y, input.player.z);
    const length = Math.hypot(input.wind.x, input.wind.z), speed = Number.isFinite(input.wind.speed) ? Math.max(0, Math.min(16, input.wind.speed)) : 0;
    this.treeWind.time = Number.isFinite(input.time) ? input.time : 0;
    this.treeWind.x = length > 1e-6 ? input.wind.x / length * speed : 0; this.treeWind.z = length > 1e-6 ? input.wind.z / length * speed : 0;
    const seasonChanged = this.season !== input.season; this.season = input.season;
    if (seasonChanged) this.stats.treeSeason = input.season ? {
      sampledAt: input.season.sampledAt, source: input.season.source, phaseDay: input.season.phaseDay,
    } : undefined;
    const selection = input.time - this.lastSelection >= .15 || this.previousQuality !== input.quality || input.time < this.lastSelection;
    if (selection) {
      this.lastSelection = input.time; this.previousQuality = input.quality;
      const camera = this.scene.activeCamera;
      camera?.getViewMatrix();
      const eye = camera?.globalPosition ?? input.player;
      this.selectionEye.copyFromFloats(eye.x, eye.y, eye.z);
      const scale = camera?.mode === Camera.PERSPECTIVE_CAMERA
        ? Math.abs(camera.getProjectionMatrix().m[5]) * this.scene.getEngine().getRenderHeight() * camera.viewport.height / (2 * referenceFocalPixels) : 1;
      for (const tree of this.treeGroups) {
        // The same horizontal camera/player segment as grass protects third-
        // person close views. Ignoring height conservatively keeps more detail.
        tree.desired = treeDetailForProjection(this.detailDistance(tree), input.quality, tree.lodProfile, scale);
      }
    }
    if (selection || seasonChanged) this.applyVisibility();
    if (selection) { this.startDetailLoads(); this.trimDetailCache(); }
    this.metrics();
  }
  private metrics() {
    this.updatePilotMetrics();
    this.stats.treeInstances = this.treeGroups.length; this.stats.uniqueTreeModels = this.treeGroups.length;
    let rankEnabled = 0; for (const group of this.treeGroups) if (group.pilot) rankEnabled++;
    this.stats.legacyTreeInstances = this.treeGroups.length - rankEnabled; this.stats.rankEnabledTreeInstances = rankEnabled;
    this.stats.loadedTreeMeshes = this.trees.length; this.stats.pendingTreeLoads = Math.max(this.loadingTrees.size, this.loader.stats.pending);
    this.stats.treeDetailCacheEntries = this.detailCache.size; this.stats.treeDetailCacheBytes = this.bytes(); this.stats.treeDetailReservedBytes = this.reservedBytes();
    this.stats.treeFetchedBytes = this.loader.stats.bytesFetched; this.stats.treeFetchRequests = this.loader.stats.requests;
  }
  private clearMeshes() {
    for (const mesh of this.trees) if (!mesh.isDisposed()) mesh.dispose(false, false);
    for (const group of this.treeGroups) group.root.dispose();
    this.treeContainer?.dispose(); this.treeContainer = undefined; this.treeGroups = []; this.trees = [];
    this.detailCache.clear(); this.detailBytes.clear(); this.pilotBytes.clear(); this.treeRuntime = undefined; this.sharedTreeMaterials = [];
    this.pilotMetricsDirty = true;
    this.stats.treePilotGeometryBytes = 0; this.stats.treePilotSourceBytes = 0; this.stats.treePilotSeasonBytes = 0;
    this.stats.treePilot = undefined;
  }
  private clearPilotMaterials() {
    for (const material of new Set([...this.materials.values(), ...this.clusterMaterials.values()]))
      if (!this.sharedTreeMaterials.includes(material)) this.disposeMaterial(material);
    for (const texture of this.textures) texture.dispose(); this.textures.clear(); this.materials.clear();
    this.clusterBanks.clear(); this.clusterMaterials.clear(); this.clusterTextures.clear(); this.textureSources.clear();
    this.pilotMetricsDirty = true;
    this.stats.treeTextureSourceBytes = 0;
  }
  dispose() {
    if (this.disposed) return; this.disposed = true; this.loader.dispose();
    this.clearPilotMaterials();
    for (const wrapper of this.treeShadows) wrapper.dispose(); this.treeShadows.length = 0;
    this.clearMeshes();
    this.loadingTrees.clear(); this.loadingPilots.clear(); this.reservations.clear(); this.metrics();
  }
}
