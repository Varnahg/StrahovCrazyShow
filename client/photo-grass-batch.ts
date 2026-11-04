import "@babylonjs/core/Meshes/thinInstanceMesh";
import { BoundingInfo } from "@babylonjs/core/Culling/boundingInfo";
import { Matrix, Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { GrassResources } from "./photo-grass-resources";
import type { GrassFade } from "./photo-grass-transition";
import {
  CANDIDATE_GRASS_LIMITS,
  CANDIDATE_LOD_TRIANGLES,
  type CandidateLevel,
} from "./photo-grass-budget";

export type GrassRootState = {
  id: number;
  tileId: string;
  x: number;
  y: number;
  z: number;
  seed: number;
  level: CandidateLevel;
  slot: number;
  fade: GrassFade;
};
/** One geometry/material draw for an entire LOD. Compact removal moves matrix
 * and fade attributes together; root identity never depends on its slot. */
export class PhotoGrassBatch {
  readonly mesh: Mesh;
  readonly roots: GrassRootState[] = [];
  private matrices = new Float32Array(0);
  private fades = new Float32Array(0);
  private capacity = 0;
  private matrixDirty = false;
  private fadeDirty = false;
  private rebound = false;
  private sourceRadius: number;
  private dirtySlots = new Uint32Array(0);
  private dirtyFlags = new Uint8Array(0);
  private dirtyCount = 0;
  private snapshotCache?: Matrix[];
  private snapshotCount = 0;
  constructor(
    readonly level: CandidateLevel,
    resources: Pick<GrassResources, "clone">,
    private options: { maximumRoots?: number; name?: string; metadata?: Record<string, unknown> } = {},
  ) {
    this.mesh = resources.clone(
      level,
      (options.name ?? "photographic lawn") + " · " + level + " batch",
    );
    this.mesh.metadata = {
      ...this.mesh.metadata,
      vegetation: "grass",
      photographicGrass: true,
      sourceLevel: level,
      worldStableRoots: true,
      terrainAnchored: true,
      osmMapped: true,
      shadowCaster: false,
      depthCaster: false,
      ...options.metadata,
    };
    this.sourceRadius =
      Math.max(
        ...this.mesh
          .getBoundingInfo()
          .boundingBox.vectors.map((point) => point.length()),
      ) + 0.02;
    // Bounds below use exactly the submitted root centres and a conservative
    // rotated source radius. Avoid Babylon scanning unused buffer capacity.
    this.mesh.doNotSyncBoundingInfo = true;
    this.mesh.computeWorldMatrix(true);
    this.mesh.freezeWorldMatrix();
    this.mesh.setEnabled(false);
  }
  reserve(count: number) {
    if (count <= this.capacity) return;
    const maximum = this.options.maximumRoots ?? Math.floor(
      CANDIDATE_GRASS_LIMITS.high.triangles /
        CANDIDATE_LOD_TRIANGLES[this.level],
    );
    const capacity = Math.min(maximum, Math.max(64, count, this.capacity * 2));
    if (capacity < count)
      throw Error("Photographic grass batch exceeds the hard root capacity");
    const matrices = new Float32Array(capacity * 16),
      fades = new Float32Array(capacity * 4),
      dirtySlots = new Uint32Array(capacity),
      dirtyFlags = new Uint8Array(capacity);
    matrices.set(this.matrices);
    fades.set(this.fades);
    dirtySlots.set(this.dirtySlots);
    dirtyFlags.set(this.dirtyFlags);
    this.matrices = matrices;
    this.fades = fades;
    this.dirtySlots = dirtySlots;
    this.dirtyFlags = dirtyFlags;
    this.capacity = capacity;
    this.rebound = true;
  }
  add(
    root: GrassRootState,
    source: Float32Array,
    sourceOffset: number,
    tileX: number,
    tileZ: number,
  ) {
    this.reserve(this.roots.length + 1);
    root.slot = this.roots.length;
    this.roots.push(root);
    const offset = root.slot * 16;
    for (let i = 0; i < 16; i++)
      this.matrices[offset + i] = source[sourceOffset + i];
    this.matrices[offset + 12] += tileX;
    this.matrices[offset + 14] += tileZ;
    this.updateFade(root);
    this.markMatrixSlot(root.slot);
    this.matrixDirty = true;
  }
  updateFade(root: GrassRootState) {
    const offset = root.slot * 4;
    this.fades[offset] = root.fade.from;
    this.fades[offset + 1] = root.fade.to;
    this.fades[offset + 2] = root.fade.startedAt;
    this.fades[offset + 3] = root.seed;
    this.fadeDirty = true;
  }
  remove(root: GrassRootState) {
    const last = this.roots.pop()!;
    if (last !== root) {
      this.roots[root.slot] = last;
      this.matrices.copyWithin(
        root.slot * 16,
        last.slot * 16,
        last.slot * 16 + 16,
      );
      this.fades.copyWithin(root.slot * 4, last.slot * 4, last.slot * 4 + 4);
      last.slot = root.slot;
      this.markMatrixSlot(root.slot);
    }
    this.matrixDirty = this.fadeDirty = true;
  }
  private markMatrixSlot(slot: number) {
    // A pending rebind lets Babylon reconstruct every snapshot. Otherwise keep
    // numerical slots deduplicated until flush succeeds, even after tail reuse.
    if (this.rebound || this.dirtyFlags[slot]) return;
    this.dirtyFlags[slot] = 1;
    this.dirtySlots[this.dirtyCount++] = slot;
  }
  private syncSnapshots(rebound: boolean) {
    const snapshots = this.mesh.thinInstanceGetWorldMatrices();
    // Our rebind reset Babylon's cache, so the getter just converted the active
    // prefix. An unexpected cache can predate queued edits: rebuild that one.
    if (!rebound) {
      const rebuild = snapshots !== this.snapshotCache ||
        snapshots.length !== this.snapshotCount;
      const count = rebuild ? this.roots.length : this.dirtyCount;
      for (let i = 0; i < count; i++) {
        const slot = rebuild ? i : this.dirtySlots[i];
        if (slot >= this.roots.length) continue;
        snapshots[slot] ??= Matrix.Identity();
        Matrix.FromArrayToRef(this.matrices, slot * 16, snapshots[slot]);
      }
    }
    snapshots.length = this.roots.length;
    return snapshots;
  }
  flush() {
    if (!this.rebound && !this.matrixDirty && !this.fadeDirty) return;
    this.flushPending();
  }
  /** Keep the common idle guard small, independent of snapshot bookkeeping. */
  private flushPending() {
    const rebound = this.rebound;
    if (rebound) {
      // reserve()+flush() alone must not retain the invalidated native cache.
      this.snapshotCache = undefined;
      this.snapshotCount = 0;
      this.mesh.thinInstanceSetBuffer("matrix", this.matrices, 16, false);
      this.mesh.thinInstanceSetBuffer("photoGrassFade", this.fades, 4, false);
      this.rebound = false;
      this.mesh.thinInstanceCount = this.roots.length;
    } else {
      // updateDirectly reads the current instance count; set it before upload,
      // otherwise newly appended matrices never reach the GPU this frame.
      this.mesh.thinInstanceCount = this.roots.length;
      if (this.matrixDirty) this.mesh.thinInstanceBufferUpdated("matrix");
      if (this.fadeDirty) this.mesh.thinInstanceBufferUpdated("photoGrassFade");
    }
    this.mesh.setEnabled(this.roots.length > 0);
    let snapshots: Matrix[] | undefined;
    if (this.matrixDirty) {
      // Keep Babylon's public CPU snapshot consistent with the same buffers.
      // BufferUpdated alone does not refresh its cached Matrix[] (9.30).
      snapshots = this.syncSnapshots(rebound);
      let minX = Infinity,
        minY = Infinity,
        minZ = Infinity,
        maxX = -Infinity,
        maxY = -Infinity,
        maxZ = -Infinity;
      for (let i = 0; i < this.roots.length; i++) {
        const root = this.roots[i];
        minX = Math.min(minX, root.x);
        minY = Math.min(minY, root.y);
        minZ = Math.min(minZ, root.z);
        maxX = Math.max(maxX, root.x);
        maxY = Math.max(maxY, root.y);
        maxZ = Math.max(maxZ, root.z);
      }
      if (this.roots.length) {
        const r = this.sourceRadius;
        this.mesh.setBoundingInfo(
          new BoundingInfo(
            new Vector3(minX - r, minY - r, minZ - r),
            new Vector3(maxX + r, maxY + r, maxZ + r),
            this.mesh.getWorldMatrix(),
          ),
        );
      }
    }
    // Commit cache ownership and clear pending slots only after all work above
    // succeeds. A failed upload/bounds update can therefore be retried safely.
    if (snapshots) {
      this.snapshotCache = snapshots;
      this.snapshotCount = this.roots.length;
      for (let i = 0; i < this.dirtyCount; i++)
        this.dirtyFlags[this.dirtySlots[i]] = 0;
      this.dirtyCount = 0;
    }
    this.matrixDirty = this.fadeDirty = false;
  }
  get allocatedBytes() {
    return this.matrices.byteLength + this.fades.byteLength +
      this.dirtySlots.byteLength + this.dirtyFlags.byteLength;
  }
  dispose() {
    this.mesh.dispose(false, false);
    this.roots.length = 0;
    this.matrices = new Float32Array(0);
    this.fades = new Float32Array(0);
    this.dirtySlots = new Uint32Array(0);
    this.dirtyFlags = new Uint8Array(0);
    this.dirtyCount = this.snapshotCount = 0;
    this.snapshotCache = undefined;
    this.capacity = 0;
  }
}
