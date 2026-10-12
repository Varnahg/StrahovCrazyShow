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
  constructor(
    readonly level: CandidateLevel,
    resources: GrassResources,
  ) {
    this.mesh = resources.clone(
      level,
      "photographic lawn · " + level + " batch",
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
    const maximum = Math.floor(
      CANDIDATE_GRASS_LIMITS.high.triangles /
        CANDIDATE_LOD_TRIANGLES[this.level],
    );
    const capacity = Math.min(maximum, Math.max(64, count, this.capacity * 2));
    if (capacity < count)
      throw Error("Photographic grass batch exceeds the hard root capacity");
    const matrices = new Float32Array(capacity * 16),
      fades = new Float32Array(capacity * 4);
    matrices.set(this.matrices);
    fades.set(this.fades);
    this.matrices = matrices;
    this.fades = fades;
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
    }
    this.matrixDirty = this.fadeDirty = true;
  }
  flush() {
    if (!this.rebound && !this.matrixDirty && !this.fadeDirty) return;
    if (this.rebound) {
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
    if (this.matrixDirty) {
      // Keep Babylon's public CPU snapshot consistent with the same buffers.
      // BufferUpdated alone does not refresh its cached Matrix[] (9.30).
      const snapshots = this.mesh.thinInstanceGetWorldMatrices();
      snapshots.length = this.roots.length;
      let minX = Infinity,
        minY = Infinity,
        minZ = Infinity,
        maxX = -Infinity,
        maxY = -Infinity,
        maxZ = -Infinity;
      for (let i = 0; i < this.roots.length; i++) {
        snapshots[i] ??= Matrix.Identity();
        Matrix.FromArrayToRef(this.matrices, i * 16, snapshots[i]);
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
    this.matrixDirty = this.fadeDirty = false;
  }
  get allocatedBytes() {
    return this.matrices.byteLength + this.fades.byteLength;
  }
  dispose() {
    this.mesh.dispose(false, false);
    this.roots.length = 0;
    this.matrices = new Float32Array(0);
    this.fades = new Float32Array(0);
    this.capacity = 0;
  }
}
