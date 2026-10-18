import { Matrix } from "@babylonjs/core/Maths/math.vector";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import { PhotoGrassBatch } from "./photo-grass-batch";
import type { GrassResources } from "./photo-grass-resources";
import { createPhotoGrassWindState } from "./photo-grass-wind";

/** One retained, normally disabled draw owner. Releasing it immediately after
 * warming would release its last Effect at Babylon's deferred end-frame cleanup. */
export class PhotoGrassPreparation {
  private batch?: PhotoGrassBatch;
  private activation = 0;
  private disposed = false;

  constructor(resources: GrassResources) {
    let created: Mesh | undefined;
    let batch: PhotoGrassBatch | undefined;
    try {
      batch = new PhotoGrassBatch("far", {
        ...resources,
        clone(level, name) {
          return (created = resources.clone(level, name));
        },
      });
      // Thin buffers live on Geometry. A shared clone would replace the live
      // lawn's world/fade buffers even though its roots remain unchanged.
      batch.mesh.makeGeometryUnique();
      batch.mesh.name = "photographic lawn · shader preparation";
      batch.mesh.metadata = {
        ...batch.mesh.metadata,
        photoGrassPreparation: true,
        photoGrassWind: createPhotoGrassWindState(),
      };
      batch.mesh.alwaysSelectAsActiveMesh = true;
      batch.add(
        {
          id: -1, tileId: "shader-preparation", x: 0, y: 0, z: 0,
          seed: 0.5, level: "far", slot: -1,
          fade: { from: 0, to: 0, startedAt: 0 },
        },
        Float32Array.from(Matrix.Identity().asArray()), 0, 0, 0,
      );
      batch.flush();
      batch.mesh.setEnabled(false);
      this.batch = batch;
    } catch (error) {
      // Also covers failure inside PhotoGrassBatch's constructor after clone.
      try {
        if (batch) batch.dispose();
        else created?.dispose(false, false);
      } finally {
        throw error;
      }
    }
  }

  begin(): () => void {
    const batch = this.batch;
    if (this.disposed || !batch || batch.mesh.isDisposed())
      throw new Error("Photographic grass preparation was disposed");
    const activation = ++this.activation;
    batch.mesh.setEnabled(true);
    return () => {
      if (this.disposed || this.activation !== activation) return;
      this.activation++;
      if (!batch.mesh.isDisposed()) batch.mesh.setEnabled(false);
    };
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.activation++;
    const batch = this.batch;
    this.batch = undefined;
    batch?.dispose();
  }
}
