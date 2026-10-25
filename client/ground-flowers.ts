import "./render-shaders";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData";
import { Matrix, Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Frustum } from "@babylonjs/core/Maths/math.frustum";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import type { Scene } from "@babylonjs/core/scene";
import type { Observer } from "@babylonjs/core/Misc/observable";
import type { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { Material } from "@babylonjs/core/Materials/material";
import type { SourceGrassMaps } from "./photo-grass-source-material";
import { PhotoGrassBatch, type GrassRootState } from "./photo-grass-batch";
import { createPhotoGrassWindState } from "./photo-grass-wind";
import { grassVisibility, setGrassVisibility } from "./photo-grass-transition";
import { CANDIDATE_GRASS_LIMITS, grassFocusDistance, type CandidateQuality } from "./photo-grass-budget";
import { createGroundFlowerPlacement, type FlowerPlacement } from "./ground-flower-placement";
import { createGroundFlowerMaterial } from "./ground-flower-material";
import { VegetationViewStability, VEGETATION_TRANSLATION_GUARD } from "./vegetation-view-stability";

export type FlowerLevel = "near" | "far";
export type FlowerGeometry = { positions: number[]; normals: number[]; uvs: number[]; indices: number[]; triangles: number };
export type FlowerPack = {
  schemaVersion: number; runtimeGeometryId: string; height: number; radius: number; headDiameter: number;
  textureWidth: number; textureHeight: number;
  textures: Record<keyof SourceGrassMaps, { file: string; bytes: number; sha256: string; gamma: boolean }>;
  levels: Record<FlowerLevel, FlowerGeometry>;
};
export const FLOWER_LIMITS = {
  low: { triangles: 1200, roots: 32 }, medium: { triangles: 2400, roots: 64 }, high: { triangles: 4800, roots: 96 },
} as const;
type Demand = { placement: FlowerPlacement; level: FlowerLevel; distance: number };
type LoadTexture = (channel: keyof SourceGrassMaps, entry: FlowerPack["textures"][keyof SourceGrassMaps]) => { texture: Texture; ready: Promise<void> };

export function projectedFlowerLevel(diameter: number, distance: number, renderHeight: number, fov: number, previous?: FlowerLevel): FlowerLevel | null {
  if (!(distance > 0 && diameter > 0 && renderHeight > 0 && fov > 0 && fov < Math.PI)) return null;
  const pixels = diameter * renderHeight / (2 * Math.tan(fov / 2) * distance);
  return pixels >= (previous === "near" ? 5 : 6) ? "near" : pixels >= 0.75 ? "far" : null;
}
export function validateFlowerPack(pack: FlowerPack) {
  if (pack.schemaVersion !== 1 || !/^[a-f0-9]{64}$/.test(pack.runtimeGeometryId) ||
      !(pack.height > 0 && pack.height < 0.3 && pack.radius > 0 && pack.radius < 0.25 && pack.headDiameter > 0 && pack.headDiameter < 0.08) ||
      pack.textureWidth !== 1024 || pack.textureHeight !== 1024) throw Error("Invalid bounded flower pack");
  for (const level of ["near", "far"] as const) {
    const g = pack.levels[level];
    if (!g || g.positions.length % 3 || g.normals.length !== g.positions.length || g.uvs.length * 3 !== g.positions.length * 2 ||
        g.indices.length !== g.triangles * 3 || !Number.isInteger(g.triangles) || g.triangles <= 0 || g.triangles > (level === "near" ? 128 : 32) ||
        ![...g.positions, ...g.normals, ...g.uvs].every(Number.isFinite) ||
        !g.indices.every(i => Number.isInteger(i) && i >= 0 && i < g.positions.length / 3)) throw Error("Invalid flower " + level + " geometry");
    for (let i = 0; i < g.positions.length; i += 3)
      if (Math.hypot(g.positions[i], g.positions[i + 2]) > pack.radius + 1e-6 || g.positions[i + 1] > pack.height + 1e-6 || g.positions[i + 1] < -.01)
        throw Error("Flower geometry exceeds its declared placement/bounds");
  }
  for (const channel of ["albedo", "alpha", "normal", "arm"] as const) {
    const entry = pack.textures[channel];
    if (!entry || !/^[a-z0-9_-]+\.(jpg|png)$/.test(entry.file) || !/^[a-f0-9]{64}$/.test(entry.sha256) ||
        entry.gamma !== (channel === "albedo")) throw Error("Invalid flower texture " + channel);
  }
}

/** Two fixed draw owners. Every live/departing root is counted, including a
 * quality reduction; PhotographicGrass subtracts this cost from its own cap. */
export class GroundFlowers {
  readonly revision = {};
  submissionRevision = 0;
  readonly stats = { draws: 0, triangles: 0, instances: 0, cachedTiles: 0, allocatedInstanceBytes: 0, preparing: false, ready: false };
  readonly ready: Promise<void>;
  private wind = createPhotoGrassWindState();
  private textures: Texture[] = [];
  private sources = new Map<FlowerLevel, Mesh>();
  private batches = new Map<FlowerLevel, PhotoGrassBatch>();
  private material!: PBRMaterial;
  private roots = new Map<number, GrassRootState>();
  private pool: GrassRootState[] = [];
  private wanted = new Map<number, Demand>();
  private demands: Demand[] = [];
  private records: Demand[] = [];
  private prune: GrassRootState[] = [];
  private placement: ReturnType<typeof createGroundFlowerPlacement>;
  private transform = Matrix.Identity();
  private viewStability = new VegetationViewStability();
  private planes = Frustum.GetPlanes(Matrix.Identity());
  private point = Vector3.Zero();
  private lastQuality = "";
  private lastTime = 0;
  private lastSelection = -Infinity;
  private helper?: PhotoGrassBatch;
  private preparationGeneration = 0;
  private observer: Observer<Scene> | null = null;
  private disposed = false;
  constructor(private scene: Scene, readonly pack: FlowerPack, loadTexture?: LoadTexture, placement?: ReturnType<typeof createGroundFlowerPlacement>) {
    validateFlowerPack(pack);
    this.placement = placement ?? createGroundFlowerPlacement(pack.radius);
    const pending: Promise<void>[] = [], maps = {} as SourceGrassMaps;
    try {
      for (const channel of ["albedo", "alpha", "normal", "arm"] as const) {
        const entry = pack.textures[channel];
        let value: { texture: Texture; ready: Promise<void> };
        if (loadTexture) value = loadTexture(channel, entry);
        else {
          let resolve!: () => void, reject!: (error: Error) => void;
          const ready = new Promise<void>((yes, no) => { resolve = yes; reject = no; });
          const texture = new Texture("/textures/vegetation/flowers/" + entry.file, scene, false, false, Texture.TRILINEAR_SAMPLINGMODE,
            resolve, message => reject(Error(message || entry.file)));
          texture.onDisposeObservable.addOnce(() => reject(Error("Flower texture disposed during loading")));
          value = { texture, ready };
        }
        value.texture.gammaSpace = entry.gamma; value.texture.wrapU = value.texture.wrapV = Texture.CLAMP_ADDRESSMODE;
        value.texture.anisotropicFilteringLevel = 4;
        maps[channel] = value.texture; this.textures.push(value.texture); pending.push(value.ready);
      }
      this.material = createGroundFlowerMaterial(scene, maps, this.wind, pack.height);
      for (const level of ["near", "far"] as const) {
        const mesh = new Mesh("yellow flower source " + level, scene), data = new VertexData(), g = pack.levels[level];
        this.sources.set(level, mesh);
        data.positions = g.positions; data.normals = g.normals; data.uvs = g.uvs; data.indices = g.indices; data.applyToMesh(mesh);
        mesh.material = this.material;
        // Blender -> (x,z,-y) preserves winding. RH Mesh's default is clockwise;
        // an explicit CCW front keeps two-sided lighting on the photographed face.
        mesh.sideOrientation = Material.CounterClockWiseSideOrientation;
        mesh.isVisible = false; mesh.isPickable = false;
        mesh.metadata = { vegetation: "flowers", shadowCaster: false, depthCaster: false };
        this.batches.set(level, this.batch(level));
      }
      this.ready = Promise.all(pending).then(() => { if (!this.disposed) this.stats.ready = true; });
      void this.ready.catch(() => {});
      this.observer = scene.onDisposeObservable.addOnce(() => this.dispose());
    } catch (error) { void Promise.allSettled(pending); this.dispose(); throw error; }
  }
  static async load(scene: Scene) {
    const abort = new AbortController(), observer = scene.onDisposeObservable.addOnce(() => abort.abort());
    let controller: GroundFlowers | undefined;
    try {
      const response = await fetch("/models/vegetation/flowers/geometry.json", { signal: abort.signal });
      if (!response.ok) throw Error("Flower geometry HTTP " + response.status);
      const pack = await response.json();
      if (scene.isDisposed) throw Error("Flower scene disposed during geometry load");
      controller = new GroundFlowers(scene, pack); await controller.ready;
      if (scene.isDisposed) throw Error("Flower scene disposed during texture load");
      return controller;
    } catch (error) { controller?.dispose(); throw error; }
    finally { scene.onDisposeObservable.remove(observer); }
  }
  private batch(level: FlowerLevel, preparation = false) {
    let created: Mesh | undefined;
    try {
      return new PhotoGrassBatch(level, { clone: (_level, name) => {
        const mesh = created = this.sources.get(level)!.clone(name, null, true)!;
        mesh.makeGeometryUnique(); mesh.isVisible = true; mesh.metadata = { ...mesh.metadata, photoGrassWind: this.wind };
        return mesh;
      } }, { maximumRoots: preparation ? 1 : FLOWER_LIMITS.high.roots, name: preparation ? "yellow flower preparation" : "sparse yellow flowers",
        metadata: { vegetation: "flowers", photographicGrass: false, groundFlowers: true, measuredSpecies: false } });
    } catch (error) { created?.dispose(false, false); throw error; }
  }
  beginPreparation(): () => void {
    if (this.disposed) throw Error("Flowers disposed before preparation");
    if (!this.helper) {
      const helper = this.batch("far", true); this.helper = helper;
      helper.mesh.metadata = { ...helper.mesh.metadata, flowerPreparation: true, photoGrassWind: createPhotoGrassWindState() };
      helper.mesh.alwaysSelectAsActiveMesh = true;
      helper.add({ id: -1, tileId: "flower-preparation", x: 0, y: 0, z: 0, level: "far", slot: -1, seed: .5,
        fade: { from: 0, to: 0, startedAt: 0 } }, Float32Array.from(Matrix.Identity().asArray()), 0, 0, 0);
      helper.flush();
    }
    const generation = ++this.preparationGeneration; this.helper.mesh.setEnabled(true);
    return () => { if (!this.disposed && generation === this.preparationGeneration) { this.preparationGeneration++; this.helper!.mesh.setEnabled(false); } };
  }
  update(input: { time: number; quality: CandidateQuality; wind: { x: number; z: number }; focus?: { x: number; y: number; z: number } }) {
    if (this.disposed || !this.stats.ready || !this.scene.activeCamera) return;
    const camera = this.scene.activeCamera, view = camera.getViewMatrix(), projection = camera.getProjectionMatrix();
    const width = this.scene.getEngine().getRenderWidth(), height = this.scene.getEngine().getRenderHeight();
    const eye = camera.globalPosition, rawFocus = input.focus ?? eye, time = Number.isFinite(input.time) ? input.time : 0;
    if (![eye.x, eye.y, eye.z, rawFocus.x, rawFocus.z].every(Number.isFinite)) return;
    // Normal orbit/follow is <=18m. Clamp this working capsule to keep debug or
    // detached cameras from requesting a strip across the whole world.
    const dx = rawFocus.x - eye.x, dz = rawFocus.z - eye.z, scale = Math.min(1, 18 / (Math.hypot(dx, dz) || 1));
    const focusX = eye.x + dx * scale, focusZ = eye.z + dz * scale;
    if (time < this.lastTime) for (const root of this.roots.values()) { root.fade.startedAt += time - this.lastTime; this.batches.get(root.level as FlowerLevel)!.updateFade(root); }
    this.lastTime = time;
    const quality = input.quality, limits = FLOWER_LIMITS[quality], range = CANDIDATE_GRASS_LIMITS[quality].range;
    this.wind.time = time;
    this.wind.windX = Number.isFinite(input.wind.x) ? Math.max(-16, Math.min(16, input.wind.x)) : 0;
    this.wind.windZ = Number.isFinite(input.wind.z) ? Math.max(-16, Math.min(16, input.wind.z)) : 0;
    this.wind.viewerX = eye.x; this.wind.viewerY = eye.y; this.wind.viewerZ = eye.z;
    this.wind.focusX = focusX; this.wind.focusZ = focusZ;
    this.wind.fadeStart = CANDIDATE_GRASS_LIMITS[quality].fadeStart; this.wind.fadeEnd = range;
    if (quality !== this.lastQuality || time - this.lastSelection >= .15 || time < this.lastSelection) {
      const viewChanged = quality !== this.lastQuality || this.viewStability.changed(view, projection, eye, focusX, focusZ, width, height, camera.fov);
      if (viewChanged) {
        view.multiplyToRef(projection, this.transform);
        Frustum.GetPlanesToRef(this.transform, this.planes);
        this.viewStability.accept(view, projection, eye, focusX, focusZ, width, height, camera.fov);
        this.select(eye, focusX, focusZ, range, height, camera.fov, quality, time);
        this.viewStability.complete();
      }
      this.lastSelection = time; this.lastQuality = quality;
    }
    for (const root of this.roots.values()) if (root.fade.to === 0 && grassVisibility(root.fade, time) <= 0) this.remove(root);
    // Immediate cap on downgrade; departing roots also occupy budget.
    if (this.stats.triangles > limits.triangles || this.roots.size > limits.roots) {
      this.prune.push(...this.roots.values());
      const wanted = (root: GrassRootState) => this.wanted.get(root.id)?.level === root.level ? 1 : 0;
      this.prune.sort((a, b) => wanted(a) - wanted(b) ||
        Math.hypot(b.x - eye.x, b.y - eye.y, b.z - eye.z) - Math.hypot(a.x - eye.x, a.y - eye.y, a.z - eye.z));
      for (const root of this.prune) {
        if (this.stats.triangles <= limits.triangles && this.roots.size <= limits.roots) break;
        this.remove(root);
      }
      this.prune.length = 0;
    }
    for (const demand of this.demands) {
      const p = demand.placement, cost = this.pack.levels[demand.level].triangles;
      if (this.roots.has(p.id) || this.roots.size >= limits.roots || this.stats.triangles + cost > limits.triangles) continue;
      const root = this.pool.pop() ?? { id: 0, tileId: "", x: 0, y: 0, z: 0, seed: 0, level: "far", slot: -1, fade: { from: 0, to: 0, startedAt: 0 } };
      root.id = p.id; root.tileId = p.tileId; root.x = p.x; root.y = p.y; root.z = p.z; root.seed = p.seed; root.level = demand.level;
      root.fade.from = 0; root.fade.to = 1; root.fade.startedAt = time;
      this.roots.set(root.id, root); this.batches.get(demand.level)!.add(root, p.matrix, 0, 0, 0); this.stats.triangles += cost;
      this.submissionRevision++;
    }
    for (const batch of this.batches.values()) batch.flush();
    this.stats.instances = this.roots.size; this.stats.cachedTiles = this.placement.size;
    this.stats.draws = 0; this.stats.allocatedInstanceBytes = 0; this.stats.preparing = false;
    for (const batch of this.batches.values()) { if (batch.roots.length) this.stats.draws++; this.stats.allocatedInstanceBytes += batch.allocatedBytes;
      if (batch.roots.some(root => grassVisibility(root.fade, time) !== root.fade.to)) this.stats.preparing = true; }
  }
  private select(eye: Vector3, fx: number, fz: number, range: number, renderHeight: number, fov: number, quality: CandidateQuality, time: number) {
    this.demands.length = 0; this.wanted.clear(); let used = 0, cells = 0;
    // The source rotates about the root. Include the offset of this sphere's
    // centre and the same 2cm wind allowance as PhotoGrassBatch's renderer bounds.
    const radius = Math.hypot(this.pack.radius, this.pack.height) + this.pack.height / 2 + .02;
    range += VEGETATION_TRANSLATION_GUARD;
    cellLoop: for (let x = Math.floor(Math.min(eye.x, fx) - range); x <= Math.floor(Math.max(eye.x, fx) + range); x++)
      for (let z = Math.floor(Math.min(eye.z, fz) - range); z <= Math.floor(Math.max(eye.z, fz) + range); z++) {
        if (++cells > 1536) break cellLoop;
        if (grassFocusDistance(x + .5, z + .5, eye.x, eye.z, fx, fz) > range + .8) continue;
        const p = this.placement.candidate(x, z); if (!p || grassFocusDistance(p.x, p.z, eye.x, eye.z, fx, fz) >= range) continue;
        this.point.set(p.x, p.y + this.pack.height / 2, p.z);
        if (this.planes.some(plane => plane.dotCoordinate(this.point) < -radius - VEGETATION_TRANSLATION_GUARD)) continue;
        this.viewStability.includeBounds(this.point.x, this.point.y, this.point.z, radius);
        const distance = Math.hypot(p.x - eye.x, p.y - eye.y, p.z - eye.z);
        const level = projectedFlowerLevel(this.pack.headDiameter, distance, renderHeight, fov, this.roots.get(p.id)?.level as FlowerLevel | undefined);
        if (!level) continue;
        const demand = this.records[used] ?? (this.records[used] = { placement: p, level, distance });
        demand.placement = p; demand.level = level; demand.distance = distance; this.demands.push(demand); used++;
      }
    this.demands.sort((a, b) => a.distance - b.distance || a.placement.id - b.placement.id);
    let cost = 0, retained = 0;
    for (const demand of this.demands) {
      const next = this.pack.levels[demand.level].triangles;
      if (retained >= FLOWER_LIMITS[quality].roots || cost + next > FLOWER_LIMITS[quality].triangles) continue;
      this.demands[retained++] = demand; this.wanted.set(demand.placement.id, demand); cost += next;
    }
    this.demands.length = retained;
    for (const root of this.roots.values()) {
      const target = this.wanted.get(root.id)?.level === root.level ? 1 : 0;
      if (target !== root.fade.to) { setGrassVisibility(root.fade, target, time); this.batches.get(root.level as FlowerLevel)!.updateFade(root); }
    }
  }
  private remove(root: GrassRootState) {
    this.batches.get(root.level as FlowerLevel)!.remove(root); this.roots.delete(root.id);
    this.stats.triangles -= this.pack.levels[root.level as FlowerLevel].triangles; this.pool.push(root);
    this.submissionRevision++;
  }
  dispose() {
    if (this.disposed) return; this.disposed = true; this.preparationGeneration++;
    if (this.observer) this.scene.onDisposeObservable.remove(this.observer); this.observer = null;
    this.helper?.dispose(); this.helper = undefined;
    for (const batch of this.batches.values()) batch.dispose(); this.batches.clear();
    for (const mesh of this.sources.values()) mesh.dispose(false, false); this.sources.clear();
    this.material?.dispose(false, false); for (const texture of this.textures) texture.dispose(); this.textures.length = 0;
    this.roots.clear(); this.pool.length = this.prune.length = 0; this.wanted.clear(); this.demands.length = this.records.length = 0; this.placement.dispose();
    Object.assign(this.stats, { draws: 0, triangles: 0, instances: 0, cachedTiles: 0, allocatedInstanceBytes: 0, preparing: false, ready: false });
  }
}
