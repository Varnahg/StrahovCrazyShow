import "./render-shaders";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import { Matrix, Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Plane } from "@babylonjs/core/Maths/math.plane";
import { Frustum } from "@babylonjs/core/Maths/math.frustum";
import type { Scene } from "@babylonjs/core/scene";
import type { Observer } from "@babylonjs/core/Misc/observable";
import { groundHeight } from "../shared/terrain";
import {
  createPhotoGrassPlacement,
  type PhotoGrassTile,
} from "./photo-grass-placement";
import {
  projectedLeafLevel,
  grassRootId,
  grassRootSeed,
  grassFocusDistance,
  CANDIDATE_GRASS_LIMITS,
  CANDIDATE_LOD_TRIANGLES,
  CANDIDATE_LOD_LEAVES,
  GRASS_LEVELS,
  type CandidateQuality,
  type CandidateLevel,
} from "./photo-grass-budget";
import {
  acquireGrassResources,
  type GrassResources,
  type RenderPack,
} from "./photo-grass-resources";
import {
  createPhotoGrassWindState,
  type PhotoGrassWindState,
} from "./photo-grass-wind";
import { PhotoGrassBatch, type GrassRootState } from "./photo-grass-batch";
import { PhotoGrassPreparation } from "./photo-grass-preparation";
import type { SourceGrassRecipe } from "./photo-grass-source-material";
import { grassVisibility, setGrassVisibility } from "./photo-grass-transition";
import {
  GRASS_CACHE_TILES,
  GRASS_PREPARATION,
  GrassSelectionHeap,
} from "./photo-grass-selection";

type RootCandidate = {
  id: number;
  tile: PhotoGrassTile | null;
  index: number;
  x: number;
  y: number;
  z: number;
  score: number;
  seed: number;
  level: CandidateLevel;
};
type TileRequest = { x: number; y: number; z: number };
export type PhotoGrassStats = {
  representation: "photographic-short-lawn";
  draws: number;
  triangles: number;
  instances: number;
  submittedLeaves: number;
  activeTiles: number;
  cachedTiles: number;
  textureResolution: number;
  textureHeight: number;
  triangleLimit: number;
  drawLimit: number;
  allocatedInstanceBytes: number;
  transitionRoots: number;
  ready: boolean;
  preparing: boolean;
  pendingTiles: number;
};
const qualityKey = (quality: string): CandidateQuality =>
  quality === "high" ? "high" : quality === "low" ? "low" : "medium";
const resourceRoot = "/models/vegetation/grass/",
  textureRoot = "/textures/vegetation/grass/";

/** Three fixed LOD batches, world-stable roots and a strict submitted-triangle
 * budget including departing roots. Terrain tiles are placement-cache units,
 * never draw units or the visible edge of the lawn. */
export class PhotographicGrass {
  // Live counters retain identity. Completed benchmarks copy these through the
  // benchmark snapshot boundary; a later frame/dispose never mutates the export.
  readonly stats: PhotoGrassStats = {
    representation: "photographic-short-lawn",
    draws: 0,
    triangles: 0,
    instances: 0,
    submittedLeaves: 0,
    activeTiles: 0,
    cachedTiles: 0,
    textureResolution: 1024,
    textureHeight: 512,
    triangleLimit: 140000,
    drawLimit: 12,
    allocatedInstanceBytes: 0,
    transitionRoots: 0,
    ready: false,
    preparing: false,
    pendingTiles: 0,
  };
  // The current high third-person view must fit before historical tiles evict;
  // otherwise cached-only selection would endlessly regenerate a static view.
  private placement = createPhotoGrassPlacement(GRASS_CACHE_TILES);
  private batches = new Map<CandidateLevel, PhotoGrassBatch>();
  private roots = new Map<number, GrassRootState>();
  private transitions = new Set<GrassRootState>();
  private freeRoots: GrassRootState[] = [];
  private records: RootCandidate[] = [];
  private workRecords: RootCandidate[] = [];
  private candidates = new GrassSelectionHeap<RootCandidate>();
  private selected: RootCandidate[] = [];
  private nextSelected: RootCandidate[] = [];
  private wanted = new Map<number, RootCandidate>();
  private nextWanted = new Map<number, RootCandidate>();
  private preparation?: Generator<number, void>;
  private preparationEye = Vector3.Zero();
  private preparationFocus = Vector3.Zero();
  private preparationView = Matrix.Identity();
  private tileRequests = new Map<string, TileRequest>();
  private tilePreparation?: {
    request: TileRequest;
    work: Generator<void, PhotoGrassTile | undefined>;
  };
  private tileRevision = 0;
  private selectionRevision = -1;
  private preferredLevels = new Map<number, CandidateLevel>();
  private preferredRoots = new Set<number>();
  private lastFov = 0;
  private vacancyCursor = 0;
  private activeTiles = new Set<string>();
  private pruneRoots: GrassRootState[] = [];
  private planes = Array.from({ length: 6 }, () => new Plane(0, 0, 0, 0));
  private transform = Matrix.Identity();
  private lastTransform = Matrix.Zero();
  private point = Vector3.Zero();
  private lastUpdate = -Infinity;
  private lastTime = 0;
  private lastFocusX = Infinity;
  private lastFocusZ = Infinity;
  private lastHeight = 0;
  private previousQuality = "";
  private submittedTriangles = 0;
  private statsDirty = true;
  private allocationDirty = false;
  private disposed = false;
  private resources?: GrassResources;
  private shaderPreparation?: PhotoGrassPreparation;
  private wind: PhotoGrassWindState = createPhotoGrassWindState();
  private disposeObserver: Observer<Scene> | null = null;
  private pendingResources = new Set<GrassResources>();

  constructor(
    private scene: Scene,
    private pack: RenderPack,
    private recipe: SourceGrassRecipe,
    resources?: GrassResources,
  ) {
    if (resources) this.installResources(resources);
    this.disposeObserver = scene.onDisposeObservable.addOnce(() =>
      this.dispose(),
    );
  }
  static async load(scene: Scene) {
    const abort = new AbortController(),
      observer = scene.onDisposeObservable.addOnce(() => abort.abort());
    try {
      const [geometry, material] = await Promise.all(
        ["geometry.json", "material.json"].map(async (file) => {
          const response = await fetch(resourceRoot + file, {
            signal: abort.signal,
          });
          if (!response.ok)
            throw Error(
              "Photographic grass " + file + " HTTP " + response.status,
            );
          return response.json();
        }),
      );
      if (scene.isDisposed) throw Error("Grass scene disposed during loading");
      const controller = new PhotographicGrass(scene, geometry, material);
      try {
        await controller.loadResources();
        return controller;
      } catch (error) {
        controller.dispose();
        throw error;
      }
    } finally {
      scene.onDisposeObservable.remove(observer);
    }
  }
  private installResources(lease: GrassResources) {
    this.disposeShaderPreparation();
    for (const batch of this.batches.values()) batch.dispose();
    this.batches.clear();
    this.resources?.release();
    this.resources = lease;
    this.wind = lease.wind;
    this.roots.clear();
    this.transitions.clear();
    this.freeRoots.length = 0;
    this.selected.length = 0;
    this.wanted.clear();
    this.records.length = 0;
    this.cancelPreparation();
    this.cancelTilePreparation();
    this.workRecords.length = 0;
    this.submittedTriangles = 0;
    this.statsDirty = true;
    this.previousQuality = "";
    for (const level of GRASS_LEVELS)
      this.batches.set(level, new PhotoGrassBatch(level, lease));
    this.stats.textureResolution = lease.textureSize;
    this.stats.textureHeight = lease.textureHeight;
    this.stats.ready = true;
    this.lastUpdate = -Infinity;
  }
  /** Identity only for the bounded startup revision gate, never a frame scan. */
  get shaderPreparationRevision(): object | undefined {
    return this.resources;
  }
  beginShaderPreparation(): (() => void) | undefined {
    if (this.disposed || this.scene.isDisposed || !this.resources) return;
    this.shaderPreparation ??= new PhotoGrassPreparation(this.resources);
    return this.shaderPreparation.begin();
  }
  private disposeShaderPreparation() {
    const owned = this.shaderPreparation;
    this.shaderPreparation = undefined;
    owned?.dispose();
  }
  private async loadResources(_legacySize?: 1024 | 2048) {
    const lease = acquireGrassResources(
      this.scene,
      this.pack,
      this.recipe,
      1024,
      (channel, gamma) => {
        const entry = this.pack.textures.files[channel];
        if (!entry) throw Error("Missing photographic leaf texture " + channel);
        let resolve!: () => void, reject!: (error: Error) => void;
        const ready = new Promise<void>((yes, no) => {
          resolve = yes;
          reject = no;
        });
        const texture = new Texture(
          textureRoot + entry.file,
          this.scene,
          false,
          false,
          Texture.TRILINEAR_SAMPLINGMODE,
          resolve,
          (message) => reject(Error(message || entry.file)),
        );
        texture.gammaSpace = gamma;
        texture.anisotropicFilteringLevel = 4;
        texture.wrapU = texture.wrapV = Texture.CLAMP_ADDRESSMODE;
        texture.onDisposeObservable.addOnce(() =>
          reject(Error("Grass texture disposed during loading")),
        );
        return { texture, ready };
      },
    );
    this.pendingResources.add(lease);
    try {
      await lease.ready;
      if (this.disposed || this.scene.isDisposed) {
        lease.release();
        return;
      }
      this.installResources(lease);
    } catch (error) {
      lease.release();
      if (!this.disposed) throw error;
    } finally {
      this.pendingResources.delete(lease);
    }
  }
  update(input: {
    time: number;
    quality: string;
    wind: { x: number; z: number };
    focus?: { x: number; y: number; z: number };
  }) {
    if (this.disposed || !this.resources) return;
    const camera = this.scene.activeCamera;
    if (!camera) return;
    camera.getViewMatrix();
    const eye = camera.globalPosition,
      focus = input.focus ?? eye,
      quality = qualityKey(input.quality),
      limits = CANDIDATE_GRASS_LIMITS[quality],
      time = Number.isFinite(input.time) ? input.time : 0;
    if (time < this.lastTime) {
      for (const root of this.transitions) {
        root.fade.startedAt += time - this.lastTime;
        this.batches.get(root.level)!.updateFade(root);
      }
      this.lastUpdate = -Infinity;
      this.cancelPreparation();
    }
    this.lastTime = time;
    this.wind.time = time;
    this.wind.windX = Number.isFinite(input.wind.x) ? input.wind.x : 0;
    this.wind.windZ = Number.isFinite(input.wind.z) ? input.wind.z : 0;
    this.wind.viewerX = eye.x;
    this.wind.viewerY = eye.y;
    this.wind.viewerZ = eye.z;
    this.wind.focusX = focus.x;
    this.wind.focusZ = focus.z;
    this.wind.fadeStart = limits.fadeStart;
    this.wind.fadeEnd = limits.range;
    this.stats.triangleLimit = limits.triangles;
    this.stats.drawLimit = limits.draws;
    this.advanceTransitions(time);
    const qualityChanged = quality !== this.previousQuality;
    if (qualityChanged && this.submittedTriangles > limits.triangles) {
      this.pruneRoots.length = 0;
      for (const root of this.roots.values()) this.pruneRoots.push(root);
      this.pruneRoots.sort(
        (a, b) =>
          Math.hypot(b.x - eye.x, b.y - eye.y, b.z - eye.z) -
          Math.hypot(a.x - eye.x, a.y - eye.y, a.z - eye.z),
      );
      for (const root of this.pruneRoots) {
        if (this.submittedTriangles <= limits.triangles) break;
        this.removeRoot(root);
      }
      this.pruneRoots.length = 0;
    }
    if (this.preparation || qualityChanged || time - this.lastUpdate >= 0.15) {
      camera
        .getViewMatrix()
        .multiplyToRef(camera.getProjectionMatrix(), this.transform);
      const height = this.scene.getEngine().getRenderHeight();
      if (
        this.preparation &&
        this.preparationIsStale(qualityChanged, height, camera.fov, eye, focus)
      )
        this.cancelPreparation();
      const viewChanged =
        qualityChanged ||
        !this.lastTransform.equals(this.transform) ||
        this.lastHeight !== height ||
        this.lastFov !== camera.fov ||
        this.lastFocusX !== focus.x ||
        this.lastFocusZ !== focus.z;
      if (!this.preparation) this.lastUpdate = time;
      if (
        !this.preparation &&
        (viewChanged || this.selectionRevision !== this.tileRevision)
      ) {
        if (viewChanged) {
          this.tileRequests.clear();
          this.preferredLevels.clear();
          this.preferredRoots.clear();
          for (const root of this.roots.values()) {
            this.preferredLevels.set(root.id, root.level);
            if (root.fade.to === 1) this.preferredRoots.add(root.id);
          }
        }
        this.selectionRevision = this.tileRevision;
        this.lastTransform.copyFrom(this.transform);
        this.lastHeight = height;
        this.lastFov = camera.fov;
        this.lastFocusX = focus.x;
        this.lastFocusZ = focus.z;
        this.preparationEye.copyFrom(eye);
        this.preparationFocus.set(focus.x, 0, focus.z);
        this.preparationView.copyFrom(camera.getViewMatrix());
        Frustum.GetPlanesToRef(this.transform, this.planes);
        this.preparation = this.selectRoots(
          quality,
          height,
          camera.fov,
          this.preparationEye,
          this.preparationFocus,
        );
      }
      this.previousQuality = quality;
    }
    this.advancePreparation(time);
    this.advanceTilePreparation(eye, focus, limits.range);
    this.fillVacancies(time, limits.triangles);
    for (const batch of this.batches.values()) batch.flush();
    this.updateStats();
    this.stats.cachedTiles = this.placement.cacheSize;
    this.stats.pendingTiles =
      this.tileRequests.size + (this.tilePreparation ? 1 : 0);
    this.stats.preparing =
      !!this.preparation ||
      this.stats.pendingTiles > 0 ||
      this.allocationDirty ||
      this.selectionRevision !== this.tileRevision;
  }
  private preparationIsStale(
    qualityChanged: boolean,
    height: number,
    fov: number,
    eye: Vector3,
    focus: { x: number; z: number },
  ) {
    // Selection only scans cached roots; cold work has an independent queue.
    // Discarding an obsolete view therefore keeps all completed terrain work.
    const view = this.scene.activeCamera!.getViewMatrix().m,
      previous = this.preparationView.m;
    return (
      qualityChanged ||
      height !== this.lastHeight ||
      fov !== this.lastFov ||
      Vector3.DistanceSquared(eye, this.preparationEye) > 9 ||
      (focus.x - this.preparationFocus.x) ** 2 +
        (focus.z - this.preparationFocus.z) ** 2 >
        9 ||
      view[2] * previous[2] + view[6] * previous[6] + view[10] * previous[10] <
        0.866
    );
  }
  private advancePreparation(time: number) {
    if (!this.preparation) return;
    const deadline = performance.now() + GRASS_PREPARATION.milliseconds;
    for (let step = 0; step < GRASS_PREPARATION.steps; step++) {
      const result = this.preparation.next();
      if (result.done) {
        this.preparation = undefined;
        this.commitSelection(time);
        return;
      }
      if (performance.now() >= deadline) break;
    }
    this.stats.cachedTiles = this.placement.cacheSize;
  }
  private cancelTilePreparation() {
    this.tilePreparation?.work.return(undefined);
    this.tilePreparation = undefined;
    this.tileRequests.clear();
    this.preferredLevels.clear();
    this.preferredRoots.clear();
  }
  private advanceTilePreparation(
    eye: Vector3,
    focus: { x: number; z: number },
    range: number,
  ) {
    const facing = this.planes[0].normal,
      length = Math.hypot(facing.x, facing.z) || 1,
      hasFocus = (focus.x - eye.x) ** 2 + (focus.z - eye.z) ** 2 > 1,
      targetX = hasFocus ? focus.x : eye.x + (facing.x / length) * 4,
      targetZ = hasFocus ? focus.z : eye.z + (facing.z / length) * 4;
    const distance = (request: TileRequest) =>
      grassFocusDistance(
        request.x + 0.5,
        request.z + 0.5,
        eye.x,
        eye.z,
        focus.x,
        focus.z,
      );
    if (
      this.tilePreparation &&
      distance(this.tilePreparation.request) > range + 0.8
    ) {
      this.tilePreparation.work.return(undefined);
      this.tilePreparation = undefined;
    }
    const deadline = performance.now() + GRASS_PREPARATION.milliseconds;
    let completed = 0;
    for (let step = 0; step < GRASS_PREPARATION.steps; step++) {
      if (!this.tilePreparation) {
        let nearestId = "",
          nearest: TileRequest | undefined,
          nearestDistance = Infinity;
        for (const [id, request] of this.tileRequests) {
          const d = distance(request);
          if (
            d > range + 0.8 ||
            this.placement.cachedTile(request.x, request.z)
          ) {
            this.tileRequests.delete(id);
          } else {
            // First-person footprints directly below the eye are often outside
            // the image. Prepare visible foreground slightly ahead of motion;
            // third person prioritizes the supplied player's ground position.
            this.point.set(request.x + 0.5, request.y, request.z + 0.5);
            const fringe = this.planes.some(
                (plane) => plane.dotCoordinate(this.point) < 0,
              ),
              priority =
                Math.hypot(
                  request.x + 0.5 - targetX,
                  request.z + 0.5 - targetZ,
                ) + (fringe ? range * 2 : 0);
            if (priority < nearestDistance) {
              nearestId = id;
              nearest = request;
              nearestDistance = priority;
            }
          }
        }
        if (!nearest) return;
        this.tileRequests.delete(nearestId);
        this.tilePreparation = {
          request: nearest,
          work: this.placement.prepareTile(nearest.x, nearest.z),
        };
      }
      const result = this.tilePreparation.work.next();
      if (result.done) {
        this.tilePreparation = undefined;
        this.tileRevision++;
        if (++completed >= GRASS_PREPARATION.coldTiles) return;
      }
      if (performance.now() >= deadline) return;
    }
  }
  private cancelPreparation() {
    this.preparation?.return();
    this.preparation = undefined;
    this.candidates.clear();
    this.nextWanted.clear();
    this.nextSelected.length = 0;
    for (const record of this.workRecords) record.tile = null;
    this.lastTransform.reset();
  }
  private commitSelection(time: number) {
    [this.records, this.workRecords] = [this.workRecords, this.records];
    [this.selected, this.nextSelected] = [this.nextSelected, this.selected];
    [this.wanted, this.nextWanted] = [this.nextWanted, this.wanted];
    for (const record of this.workRecords) record.tile = null;
    this.nextSelected.length = 0;
    this.nextWanted.clear();
    this.allocationDirty = true;
    this.vacancyCursor = 0;
    this.statsDirty = true;
    for (const root of this.roots.values()) {
      const desired = this.wanted.get(root.id),
        target = desired?.level === root.level ? 1 : 0;
      this.point.set(root.x, root.y + 0.025, root.z);
      if (
        !desired &&
        this.planes.some((plane) => plane.dotCoordinate(this.point) < -0.16)
      ) {
        this.removeRoot(root);
        continue;
      }
      if (root.fade.to !== target) {
        setGrassVisibility(root.fade, target, time);
        this.batches.get(root.level)!.updateFade(root);
        this.transitions.add(root);
      }
    }
    this.advanceTransitions(time);
  }
  private *selectRoots(
    quality: CandidateQuality,
    height: number,
    fov: number,
    eye: Vector3,
    focus: { x: number; z: number },
  ) {
    this.nextWanted.clear();
    this.nextSelected.length = 0;
    this.candidates.clear();
    const range = CANDIDATE_GRASS_LIMITS[quality].range;
    const minX = Math.floor(Math.min(eye.x, focus.x) - range),
      maxX = Math.floor(Math.max(eye.x, focus.x) + range),
      minZ = Math.floor(Math.min(eye.z, focus.z) - range),
      maxZ = Math.floor(Math.max(eye.z, focus.z) + range);
    let used = 0;
    for (let x = minX; x <= maxX; x++)
      for (let z = minZ; z <= maxZ; z++) {
        if (
          !this.placement.mayContainGrass(x, z) ||
          grassFocusDistance(x + 0.5, z + 0.5, eye.x, eye.z, focus.x, focus.z) >
            range + 0.8
        ) {
          yield 0;
          continue;
        }
        this.point.set(x + 0.5, groundHeight(x + 0.5, z + 0.5) + 0.04, z + 0.5);
        if (
          this.planes.some((plane) => plane.dotCoordinate(this.point) < -0.95)
        ) {
          yield 0;
          continue;
        }
        const tile = this.placement.cachedTile(x, z);
        if (!tile) {
          const pending = this.tilePreparation?.request;
          if (pending?.x !== x || pending.z !== z)
            this.tileRequests.set(x + ":" + z, { x, y: this.point.y, z });
          yield 0;
          continue;
        }
        for (let index = 0; index < tile.count; index++) {
          const offset = index * 16,
            px = tile.x + tile.matrices[offset + 12],
            py = tile.matrices[offset + 13],
            pz = tile.z + tile.matrices[offset + 14];
          if (
            grassFocusDistance(px, pz, eye.x, eye.z, focus.x, focus.z) >= range
          )
            continue;
          this.point.set(px, py + 0.025, pz);
          if (
            this.planes.some((plane) => plane.dotCoordinate(this.point) < -0.16)
          )
            continue;
          const id = grassRootId(x, z, index),
            previousLevel = this.preferredLevels.get(id),
            distance = Math.hypot(px - eye.x, py - eye.y, pz - eye.z),
            level = projectedLeafLevel(distance, height, fov, previousLevel);
          if (!level) continue;
          const seed = grassRootSeed(id),
            score =
              distance *
              (0.72 + 0.56 * grassRootSeed(id + 0x6d2b79f5)) *
              (this.preferredRoots.has(id) ? 0.93 : 1);
          let candidate = this.workRecords[used];
          if (!candidate) {
            candidate = {
              id,
              tile,
              index,
              x: px,
              y: py,
              z: pz,
              level,
              seed,
              score,
            };
            this.workRecords.push(candidate);
          } else {
            candidate.id = id;
            candidate.tile = tile;
            candidate.index = index;
            candidate.x = px;
            candidate.y = py;
            candidate.z = pz;
            candidate.level = level;
            candidate.seed = seed;
            candidate.score = score;
          }
          this.candidates.push(candidate);
          used++;
        }
        yield 0;
      }
    let remaining = CANDIDATE_GRASS_LIMITS[quality].triangles,
      ranked = 0;
    while (this.candidates.length && remaining >= CANDIDATE_LOD_TRIANGLES.far) {
      const candidate = this.candidates.pop()!,
        cost = CANDIDATE_LOD_TRIANGLES[candidate.level];
      if (cost <= remaining) {
        remaining -= cost;
        this.nextSelected.push(candidate);
        this.nextWanted.set(candidate.id, candidate);
      } else candidate.tile = null;
      if (++ranked % GRASS_PREPARATION.rankedRootsPerStep === 0) yield 0;
    }
    // No remaining candidate can fit below the cheapest LOD's cost. Stop
    // ranking; release discarded tile references in the same bounded steps.
    this.candidates.clear();
    for (let i = 0; i < this.workRecords.length; i++) {
      const candidate = this.workRecords[i];
      if (i >= used || !this.nextWanted.has(candidate.id))
        candidate.tile = null;
      if ((i + 1) % GRASS_PREPARATION.rankedRootsPerStep === 0) yield 0;
    }
  }
  private fillVacancies(time: number, limit: number) {
    if (!this.allocationDirty) return;
    let additions = 0,
      checked = 0;
    while (
      this.vacancyCursor < this.selected.length &&
      additions < GRASS_PREPARATION.additions &&
      checked++ < GRASS_PREPARATION.allocationChecks
    ) {
      const candidate = this.selected[this.vacancyCursor++];
      if (this.roots.has(candidate.id) || !candidate.tile) continue;
      const cost = CANDIDATE_LOD_TRIANGLES[candidate.level];
      if (this.submittedTriangles + cost > limit) continue;
      const root = this.freeRoots.pop() ?? {
        id: 0,
        tileId: "",
        x: 0,
        y: 0,
        z: 0,
        seed: 0,
        level: "far",
        slot: 0,
        fade: { from: 0, to: 1, startedAt: 0 },
      };
      root.id = candidate.id;
      root.tileId = candidate.tile.id;
      root.x = candidate.x;
      root.y = candidate.y;
      root.z = candidate.z;
      root.seed = candidate.seed;
      root.level = candidate.level;
      root.fade.from = 0;
      root.fade.to = 1;
      root.fade.startedAt = time;
      this.batches
        .get(root.level)!
        .add(
          root,
          candidate.tile.matrices,
          candidate.index * 16,
          candidate.tile.x,
          candidate.tile.z,
        );
      this.roots.set(root.id, root);
      this.transitions.add(root);
      this.submittedTriangles += cost;
      this.statsDirty = true;
      additions++;
    }
    this.allocationDirty = this.vacancyCursor < this.selected.length;
  }
  private advanceTransitions(time: number) {
    for (const root of this.transitions) {
      const value = grassVisibility(root.fade, time);
      if (value === root.fade.to) {
        this.transitions.delete(root);
        this.statsDirty = true;
        if (root.fade.to === 0) this.removeRoot(root);
      }
    }
  }
  private removeRoot(root: GrassRootState) {
    this.allocationDirty = true;
    this.vacancyCursor = 0;
    this.transitions.delete(root);
    this.roots.delete(root.id);
    this.batches.get(root.level)!.remove(root);
    this.submittedTriangles -= CANDIDATE_LOD_TRIANGLES[root.level];
    this.freeRoots.push(root);
    this.statsDirty = true;
  }
  private updateStats() {
    if (!this.statsDirty) return;
    this.statsDirty = false;
    this.stats.draws = 0;
    this.stats.instances = 0;
    this.stats.submittedLeaves = 0;
    this.stats.allocatedInstanceBytes = 0;
    this.activeTiles.clear();
    for (const [level, batch] of this.batches) {
      const count = batch.roots.length;
      if (count) this.stats.draws++;
      this.stats.instances += count;
      this.stats.submittedLeaves += count * CANDIDATE_LOD_LEAVES[level];
      this.stats.allocatedInstanceBytes += batch.allocatedBytes;
      for (const root of batch.roots) this.activeTiles.add(root.tileId);
    }
    this.stats.triangles = this.submittedTriangles;
    this.stats.activeTiles = this.activeTiles.size;
    this.stats.cachedTiles = this.placement.cacheSize;
    this.stats.transitionRoots = this.transitions.size;
  }
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.disposeShaderPreparation();
    if (this.disposeObserver) {
      this.scene.onDisposeObservable.remove(this.disposeObserver);
      this.disposeObserver = null;
    }
    for (const lease of this.pendingResources) lease.release();
    this.pendingResources.clear();
    for (const batch of this.batches.values()) batch.dispose();
    this.batches.clear();
    this.resources?.release();
    this.resources = undefined;
    this.placement.dispose();
    this.cancelPreparation();
    this.cancelTilePreparation();
    this.roots.clear();
    this.transitions.clear();
    this.freeRoots.length = 0;
    this.records.length = 0;
    this.workRecords.length = 0;
    this.selected.length = 0;
    this.wanted.clear();
    this.activeTiles.clear();
    this.submittedTriangles = 0;
    this.statsDirty = true;
    this.updateStats();
    this.stats.ready = false;
    this.stats.preparing = false;
    this.stats.pendingTiles = 0;
  }
}
