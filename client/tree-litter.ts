import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { Material } from "@babylonjs/core/Materials/material";
import type { BaseTexture } from "@babylonjs/core/Materials/Textures/baseTexture";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import type { Scene } from "@babylonjs/core/scene";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { BUILDINGS, MAP, BOUNDS } from "../shared/world";
import { groundHeight, groundNormal } from "../shared/terrain";
import { placementClassifier, sampleHash } from "../shared/vegetation";
import { TREE_FAMILIES, phenologyForTree, type TreeFamily, type TreeSeasonState, type TreePhenology } from "../shared/tree-season";
import components from "../shared/data/tree-leaf-components.json";
import { createTreeSeasonGeometryPlan, applyTreeSeasonGeometry, type TreeSeasonGeometryPlan } from "./tree-season-geometry";
import { TreeSeasonMaterialPlugin, setTreeSeasonMaterialState } from "./tree-season-material";

export type TreeLitterSource = Readonly<{ id: string; x: number; z: number; crownRadius: number; family: TreeFamily; seed: number }>;
export type TreeLitterInput = { time: number; quality: string; player: { x: number; y: number; z: number }; season?: TreeSeasonState };
export const TREE_LITTER_LIMITS = Object.freeze({
  low: Object.freeze({ patches: 3, items: 128, triangles: 512, range: 16 }),
  medium: Object.freeze({ patches: 5, items: 384, triangles: 1536, range: 24 }),
  high: Object.freeze({ patches: 8, items: 768, triangles: 3072, range: 32 }),
});
export const TREE_LITTER_CACHE_LIMIT = 16, TREE_LITTER_PATCH_ITEMS = 192, TREE_LITTER_LIFT = .006;
type Kind = "leaf" | "twig";
type Source = TreeLitterSource & { empty: boolean; capacity?: number; distance: number; amount: number };
type Patch = { source: Source; mesh: Mesh; plan: TreeSeasonGeometryPlan; items: number; wanted: number; used: number; bytes: number };
type Part = { u0: number; v0: number; u1: number; v1: number; width: number; height: number; id: string };
export type TreeLitterStats = {
  ready: boolean; preparing: boolean; activePatches: number; activeItems: number; triangles: number;
  cachedPatches: number; cacheBytes: number; generatedPatches: number; pendingPatches: number; supportsTwigs: boolean;
};
const dead: TreePhenology = Object.freeze({ leafAmount: 0, maturity: 1, senescence: 1, litterPotential: 1 });
const noop = () => {};
const CORNERS = [[-.5, -.5], [.5, -.5], [.5, .5], [-.5, .5], [0, 0]] as const;
const sameSource = (a: TreeLitterSource, b: TreeLitterSource) => a.id === b.id && a.x === b.x && a.z === b.z && a.crownRadius === b.crownRadius && a.family === b.family && a.seed === b.seed;
const kindFor = (family: TreeFamily): Kind => family === "deciduous-broadleaf" ? "leaf" : "twig";
const patchRadius = (source: TreeLitterSource) => Math.min(3.5, source.crownRadius * .85);
const patchTarget = (source: TreeLitterSource) => Math.min(TREE_LITTER_PATCH_ITEMS, Math.ceil(Math.PI * patchRadius(source) ** 2 * 6));
const distanceSquared = (a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }) =>
  (a.x - b.x) ** 2 + (a.y - b.y) ** 2 + (a.z - b.z) ** 2;

function atlasParts(kind: Kind): Part[] {
  const atlas = components.atlases.find(a => a.id === (kind === "leaf" ? "LeafSet024" : "fir_tree_01"))!;
  return atlas.parts.filter(p => kind === "leaf" || p.id === "upper-single-twig" || p.id === "middle-left-twig").map(part => {
    const component = atlas.components.find(c => c.id === part.componentId)!;
    const [u0, bottom, u1, top] = component.uvBoundsBlender;
    // Direct Texture(invertY=false) uses the original top-left image convention.
    const v0 = 1 - top, v1 = 1 - bottom;
    const scale = kind === "leaf" ? .4 : .07 / Math.hypot(part.axisTipUvBlender[0] - part.attachmentUvBlender[0], part.axisTipUvBlender[1] - part.attachmentUvBlender[1]);
    return { id: part.id, u0, v0, u1, v1, width: (u1 - u0) * scale, height: (v1 - v0) * scale };
  });
}
const parts = { leaf: atlasParts("leaf"), twig: atlasParts("twig") };

/** Borrowed maps, owned geometry/materials. Input changes only through setTrees;
 * no controller clock/weather fetch, per-frame scatter or texture creation. */
export class TreeLitter {
  readonly stats: TreeLitterStats;
  private readonly materials = new Map<Kind, PBRMaterial>();
  private readonly maps: BaseTexture[] = [];
  private readonly releases: (() => void)[] = [];
  private readonly cache = new Map<string, Patch>();
  private readonly helpers: Mesh[] = [];
  private readonly token = {};
  private readonly allowed = placementClassifier(BUILDINGS, MAP.paths).tree;
  private readonly candidates: Source[] = [];
  private sources: Source[] = [];
  private sourceRevision = 0;
  private selectedRevision = -1;
  private seasonRevision: number | undefined;
  private lastSelection = -Infinity;
  private lastQuality = "";
  private lastPlayer = Vector3.Zero();
  private lastEye = Vector3.Zero();
  private generation = 0;
  private preparationActive = false;
  private used = 0;
  private disposed = false;
  constructor(private readonly scene: Scene, sources: { leafMaterial: PBRMaterial; twigMaterial?: PBRMaterial }) {
    this.stats = { ready: false, preparing: false, activePatches: 0, activeItems: 0, triangles: 0,
      cachedPatches: 0, cacheBytes: 0, generatedPatches: 0, pendingPatches: 0, supportsTwigs: !!sources.twigMaterial };
    try {
      this.materials.set("leaf", this.material(sources.leafMaterial, "leaf"));
      if (sources.twigMaterial) this.materials.set("twig", this.material(sources.twigMaterial, "twig"));
      for (const kind of this.materials.keys()) {
        const helper = this.geometry(kind, undefined, true)!;
        helper.mesh.metadata.litterPreparation = true; helper.mesh.alwaysSelectAsActiveMesh = true;
        this.helpers.push(helper.mesh);
      }
      const observer = scene.onDisposeObservable.addOnce(() => this.dispose());
      this.releases.push(() => scene.onDisposeObservable.remove(observer));
      this.stats.ready = this.mapsReady();
    } catch (error) { this.dispose(); throw error; }
  }
  get preparationRevision(): object | undefined { return this.disposed ? undefined : this.token; }
  private material(source: PBRMaterial, kind: Kind) {
    if (source.getScene() !== this.scene || !this.scene.materials.includes(source) || !source.albedoTexture || (!source.opacityTexture && !source.albedoTexture.hasAlpha))
      throw Error("Tree litter requires a live same-scene source with albedo/opacity");
    for (const texture of [source.albedoTexture, source.opacityTexture, source.bumpTexture, source.metallicTexture])
      if (texture && (!(texture instanceof Texture) || texture.invertY || texture.coordinatesIndex !== 0 || texture.uScale !== 1 || texture.vScale !== 1 || texture.uOffset !== 0 || texture.vOffset !== 0 || texture.uAng !== 0 || texture.vAng !== 0 || texture.wAng !== 0))
        throw Error("Tree litter requires direct top-left atlas textures without UV transforms");
    const material = new PBRMaterial("borrowed photographic tree litter " + kind, this.scene);
    // Register before further construction so partial failure is owned.
    this.materials.set(kind, material);
    material.albedoTexture = source.albedoTexture; material.opacityTexture = source.opacityTexture;
    material.bumpTexture = source.bumpTexture; material.metallicTexture = source.metallicTexture;
    material.metallic = 0; material.roughness = 1; material.alpha = 1;
    material.useRoughnessFromMetallicTextureAlpha = source.useRoughnessFromMetallicTextureAlpha;
    material.useRoughnessFromMetallicTextureGreen = source.useRoughnessFromMetallicTextureGreen;
    material.useMetallnessFromMetallicTextureBlue = source.useMetallnessFromMetallicTextureBlue;
    material.useAmbientOcclusionFromMetallicTextureRed = source.useAmbientOcclusionFromMetallicTextureRed;
    material.invertNormalMapX = source.invertNormalMapX; material.invertNormalMapY = source.invertNormalMapY;
    material.transparencyMode = PBRMaterial.PBRMATERIAL_ALPHATEST; material.alphaCutOff = source.alphaCutOff;
    material.backFaceCulling = false; material.twoSidedLighting = true;
    material.metadata = { treeLitter: true, sourceMaterial: source.name, sourcePixelsModified: false, borrowedTextures: true };
    new TreeSeasonMaterialPlugin(material);
    const sourceObserver = source.onDisposeObservable.addOnce(() => this.dispose());
    this.releases.push(() => source.onDisposeObservable.remove(sourceObserver));
    for (const texture of [source.albedoTexture, source.opacityTexture, source.bumpTexture, source.metallicTexture]) if (texture && !this.maps.includes(texture)) {
      this.maps.push(texture);
      const observer = texture.onDisposeObservable.addOnce(() => this.dispose());
      this.releases.push(() => texture.onDisposeObservable.remove(observer));
    }
    return material;
  }
  private mapsReady() { for (const texture of this.maps) if (!texture.isReady()) return false; return true; }
  setTrees(sources: readonly TreeLitterSource[]) {
    if (this.disposed) return;
    if (sources.length > 512) throw new RangeError("Tree litter source limit exceeded");
    const ids = new Set<string>();
    for (const source of sources) {
      if (typeof source.id !== "string" || !source.id || ids.has(source.id) || !TREE_FAMILIES.includes(source.family) ||
          !Number.isFinite(source.x + source.z + source.crownRadius + source.seed) || source.crownRadius <= 0 || source.crownRadius > 64)
        throw new RangeError("Invalid tree litter source");
      ids.add(source.id);
    }
    const next = sources.map(source => {
      const previous = this.sources.find(s => s.id === source.id);
      return previous && sameSource(previous, source) ? previous : { ...source, empty: false, distance: 0, amount: 0 };
    });
    if (next.length === this.sources.length && next.every((source, i) => source === this.sources[i])) return;
    for (const [id, patch] of this.cache) if (!next.includes(patch.source)) { patch.mesh.dispose(false, false); this.cache.delete(id); }
    this.sources = next; this.sourceRevision++;
    this.refreshStats(); this.stats.pendingPatches = 0; this.stats.preparing = !this.stats.ready;
  }
  private pointAllowed(x: number, z: number) {
    return x >= BOUNDS.minX && x <= BOUNDS.maxX && z >= BOUNDS.minZ && z <= BOUNDS.maxZ && this.allowed(x, z);
  }
  private geometry(kind: Kind, source?: Source, preparation = false): Patch | undefined {
    const radius = source ? patchRadius(source) : 0;
    const target = preparation ? 1 : patchTarget(source!);
    const positions: number[] = [], normals: number[] = [], uv: number[] = [], colors: number[] = [], indices: number[] = [];
    const points = new Float64Array(10);
    let count = 0;
    for (let attempt = 0; attempt < target * 4 && count < target; attempt++) {
      const seed = Math.imul(source?.seed ?? 13, 0x45d9f3b) ^ Math.imul(attempt + 1, 0x27d4eb2d);
      const angle = sampleHash(seed) * Math.PI * 2, distance = radius * Math.sqrt(sampleHash(seed + 1));
      const x = (source?.x ?? 0) + Math.cos(angle) * distance, z = (source?.z ?? 0) + Math.sin(angle) * distance;
      const part = parts[kind][Math.floor(sampleHash(seed + 2) * parts[kind].length)], yaw = sampleHash(seed + 3) * Math.PI * 2;
      const scale = kind === "twig" ? .65 + sampleHash(seed + 4) * .7 : 1;
      const width = part.width * scale, height = part.height * scale, cos = Math.cos(yaw), sin = Math.sin(yaw);
      let valid = true;
      for (let i = 0; i < CORNERS.length; i++) {
        const [u, v] = CORNERS[i], px = x + cos * u * width - sin * v * height, pz = z + sin * u * width + cos * v * height;
        points[i * 2] = px; points[i * 2 + 1] = pz;
        if (!preparation && (!this.pointAllowed(px, pz) || Math.hypot(px - source!.x, pz - source!.z) > source!.crownRadius)) valid = false;
      }
      if (!preparation && valid) for (let i = 0; i < 4; i++) {
        const next = (i + 1) % 4;
        if (!this.pointAllowed((points[i * 2] + points[next * 2]) / 2, (points[i * 2 + 1] + points[next * 2 + 1]) / 2)) valid = false;
      }
      if (!valid) continue;
      const offset = count * 5, lift = TREE_LITTER_LIFT + sampleHash(seed + 5) * .002;
      for (let i = 0; i < 5; i++) {
        const px = points[i * 2], pz = points[i * 2 + 1], n = preparation ? { x: 0, y: 1, z: 0 } : groundNormal(px, pz);
        positions.push(px, (preparation ? 0 : groundHeight(px, pz)) + lift, pz); normals.push(n.x, n.y, n.z);
        uv.push(part.u0 + (CORNERS[i][0] + .5) * (part.u1 - part.u0), part.v0 + (CORNERS[i][1] + .5) * (part.v1 - part.v0));
        colors.push(1, 1, 1, .5);
      }
      for (let corner = 0; corner < 4; corner++) indices.push(offset + 4, offset + (corner + 1) % 4, offset + corner);
      count++;
    }
    if (!count) return;
    for (let item = 0; item < count; item++) for (let v = 0; v < 5; v++) colors[(item * 5 + v) * 4 + 3] = Math.round((item + .5) / count * 65535) / 65535;
    const mesh = new Mesh(preparation ? "tree litter preparation " + kind : "tree litter " + source!.id, this.scene);
    try {
      mesh.setEnabled(false);
      const data = new VertexData(); data.positions = Float32Array.from(positions); data.normals = Float32Array.from(normals); data.uvs = Float32Array.from(uv); data.colors = Float32Array.from(colors);
      const plan = createTreeSeasonGeometryPlan(Uint16Array.from(indices), data.colors); data.indices = plan.indices; data.applyToMesh(mesh);
      mesh.material = this.materials.get(kind)!; mesh.sideOrientation = Material.CounterClockWiseSideOrientation;
      mesh.hasVertexAlpha = false; mesh.isPickable = false; mesh.receiveShadows = true;
      mesh.metadata = { vegetation: "tree-litter", treeLitter: true, sourceTreeId: source?.id, sourceFamily: source?.family,
        kind, modelledDensity: true, shadowCaster: false, depthCaster: false, terrainDraped: !preparation, uvOrigin: "top-left", componentCount: count };
      // This is a DEAD material treatment, not a reclassification of the live
      // evergreen source; sourceFamily above retains the actual canopy family.
      setTreeSeasonMaterialState(mesh, kind === "leaf" ? "deciduous-broadleaf" : "deciduous-conifer", dead);
      mesh.computeWorldMatrix(true); mesh.freezeWorldMatrix(); applyTreeSeasonGeometry(mesh, plan, 1);
      const bytes = data.positions.byteLength + data.normals.byteLength + data.uvs.byteLength + data.colors.byteLength + plan.indices.byteLength + plan.ranks.byteLength + plan.indexEnds.byteLength;
      return { source: source!, mesh, plan, items: count, wanted: 0, used: 0, bytes };
    } catch (error) { mesh.dispose(false, false); throw error; }
  }
  update(input: TreeLitterInput) {
    if (this.disposed || this.scene.isDisposed) return;
    this.anchorPreparation();
    const camera = this.scene.activeCamera; camera?.getViewMatrix();
    const eye = camera?.globalPosition ?? input.player;
    if (!Number.isFinite(input.time + input.player.x + input.player.y + input.player.z + eye.x + eye.y + eye.z)) return;
    this.stats.ready = this.mapsReady();
    if (!this.stats.ready) { this.stats.preparing = true; return; }
    const quality = input.quality === "high" ? "high" : input.quality === "low" ? "low" : "medium", limit = TREE_LITTER_LIMITS[quality];
    const hard = this.sourceRevision !== this.selectedRevision || quality !== this.lastQuality || input.season?.revision !== this.seasonRevision;
    const moved = distanceSquared(this.lastPlayer, input.player) > .25 ** 2 || distanceSquared(this.lastEye, eye) > .25 ** 2;
    if (!hard && (input.time >= this.lastSelection && input.time - this.lastSelection < .25 || !moved && !this.stats.pendingPatches)) return;
    this.lastSelection = input.time; this.lastQuality = quality; this.seasonRevision = input.season?.revision; this.selectedRevision = this.sourceRevision;
    this.lastPlayer.copyFromFloats(input.player.x, input.player.y, input.player.z); this.lastEye.copyFromFloats(eye.x, eye.y, eye.z);
    this.candidates.length = 0;
    const dx = input.player.x - eye.x, dz = input.player.z - eye.z, length = dx * dx + dz * dz;
    for (const source of this.sources) {
      if (source.empty || source.family === "reference-bare" || !this.materials.has(kindFor(source.family)) || !input.season) continue;
      const t = length > 1e-8 ? Math.max(0, Math.min(1, ((source.x - eye.x) * dx + (source.z - eye.z) * dz) / length)) : 0;
      source.distance = Math.max(0, Math.hypot(source.x - eye.x - t * dx, source.z - eye.z - t * dz) - patchRadius(source));
      source.amount = phenologyForTree(input.season, source.family, source.seed).litterPotential * input.season.ground.litterRetention;
      // A tiny positive model value cannot display one component. Do not keep
      // building/evicting zero-prefix meshes while a stationary scene waits.
      if (source.distance <= limit.range + .25 && Math.floor((source.capacity ?? patchTarget(source)) * source.amount) > 0) this.candidates.push(source);
    }
    this.candidates.sort((a, b) => a.distance - b.distance || a.id.localeCompare(b.id));
    for (const patch of this.cache.values()) patch.wanted = 0;
    let available = limit.items, active = 0, created = false, pending = 0;
    for (const source of this.candidates) {
      if (!available || active >= limit.patches) break;
      let patch = this.cache.get(source.id);
      if (!patch) {
        if (created) { pending++; continue; }
        if (this.cache.size >= TREE_LITTER_CACHE_LIMIT) {
          let oldest: Patch | undefined;
          for (const entry of this.cache.values()) if (!entry.wanted && (!oldest || entry.used < oldest.used)) oldest = entry;
          if (!oldest) { pending++; continue; }
          oldest.mesh.dispose(false, false); this.cache.delete(oldest.source.id);
        }
        patch = this.geometry(kindFor(source.family), source); created = true; this.stats.generatedPatches++;
        source.capacity = patch?.items ?? 0;
        if (!patch) { source.empty = true; continue; }
        this.cache.set(source.id, patch);
      }
      patch.wanted = Math.min(available, Math.floor(patch.items * source.amount));
      if (patch.wanted) { available -= patch.wanted; active++; patch.used = ++this.used; }
    }
    for (const patch of this.cache.values()) {
      const count = applyTreeSeasonGeometry(patch.mesh, patch.plan, patch.wanted / patch.items);
      const enabled = count > 0; if (patch.mesh.isEnabled() !== enabled) patch.mesh.setEnabled(enabled);
    }
    this.refreshStats(); this.stats.pendingPatches = pending; this.stats.preparing = pending > 0;
  }
  private refreshStats() {
    this.stats.activePatches = this.stats.activeItems = this.stats.triangles = this.stats.cacheBytes = 0;
    for (const patch of this.cache.values()) {
      if (patch.mesh.isEnabled()) { this.stats.activePatches++; this.stats.activeItems += patch.mesh.subMeshes[0].indexCount / 12; this.stats.triangles += patch.mesh.subMeshes[0].indexCount / 3; }
      this.stats.cacheBytes += patch.bytes;
    }
    this.stats.cachedPatches = this.cache.size;
  }
  beginPreparation(): () => void {
    if (this.disposed) return noop;
    const generation = ++this.generation; this.preparationActive = true;
    this.anchorPreparation();
    for (const helper of this.helpers) helper.setEnabled(true);
    return () => { if (!this.disposed && generation === this.generation) { this.generation++; this.preparationActive = false; for (const helper of this.helpers) helper.setEnabled(false); } };
  }
  private anchorPreparation() {
    if (!this.preparationActive) return;
    const camera = this.scene.activeCamera;
    if (!camera) return;
    const v = camera.getViewMatrix().m, eye = camera.globalPosition;
    const distance = Math.max(1.2, camera.minZ * 4), scale = (this.scene.useRightHandedSystem ? -1 : 1) * distance / (Math.hypot(v[2], v[6], v[10]) || 1);
    const x = eye.x + v[2] * scale, y = eye.y + v[6] * scale - .1, z = eye.z + v[10] * scale;
    for (const helper of this.helpers) if (helper.position.x !== x || helper.position.y !== y || helper.position.z !== z) {
      helper.unfreezeWorldMatrix(); helper.position.set(x, y, z); helper.computeWorldMatrix(true); helper.freezeWorldMatrix();
    }
  }
  dispose() {
    if (this.disposed) return; this.disposed = true; this.generation++; this.preparationActive = false;
    for (const release of this.releases) release(); this.releases.length = 0;
    for (const patch of this.cache.values()) patch.mesh.dispose(false, false); this.cache.clear();
    for (const helper of this.helpers) helper.dispose(false, false); this.helpers.length = 0;
    for (const material of this.materials.values()) material.dispose(false, false); this.materials.clear();
    this.maps.length = this.sources.length = this.candidates.length = 0;
    Object.assign(this.stats, { ready: false, preparing: false, activePatches: 0, activeItems: 0, triangles: 0, cachedPatches: 0, cacheBytes: 0, pendingPatches: 0 });
  }
}
