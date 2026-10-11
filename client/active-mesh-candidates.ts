import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import type { Observer } from "@babylonjs/core/Misc/observable";
import type { Scene } from "@babylonjs/core/scene";

type CandidateProvider = Scene["getActiveMeshCandidates"];

/** Removes only effectively disabled nodes that native Scene evaluation would
 * skip. Visibility, frustum, readiness, instances and LOD stay Babylon's job.
 * Pass the known default provider captured directly after constructing Scene;
 * an already replaced provider is deliberately left alone.
 */
export class EnabledMeshCandidates {
  private readonly observers = new Map<AbstractMesh, Observer<boolean>>();
  private readonly candidates = { data: [] as AbstractMesh[], length: 0 };
  private readonly detachScene: (() => void)[] = [];
  private sourceLength = -1;
  private dirty = true;
  private disposed = false;
  private readonly invalidate = () => {
    this.dirty = true;
  };

  constructor(
    private readonly scene: Scene,
    private readonly defaultProvider: CandidateProvider,
  ) {
    if (scene.getActiveMeshCandidates !== defaultProvider) return;
    const source = defaultProvider.call(scene);
    if (source.data !== scene.meshes || source.length !== scene.meshes.length)
      return;
    const added = scene.onNewMeshAddedObservable.add((mesh) => {
      // Babylon defers added notifications. Removal/disposal can precede them.
      if (!this.disposed && scene.meshes.includes(mesh)) {
        this.track(mesh);
        this.invalidate();
      }
    });
    const removed = scene.onMeshRemovedObservable.add((mesh) => {
      this.untrack(mesh);
      this.invalidate();
    });
    const disposed = scene.onDisposeObservable.add(() => this.dispose());
    this.detachScene.push(
      () => scene.onNewMeshAddedObservable.remove(added),
      () => scene.onMeshRemovedObservable.remove(removed),
      () => scene.onDisposeObservable.remove(disposed),
    );
    for (const mesh of scene.meshes) this.track(mesh);
    scene.getActiveMeshCandidates = this.provide;
  }

  private track(mesh: AbstractMesh) {
    if (this.observers.has(mesh)) return;
    const observer = mesh.onEffectiveEnabledStateChangedObservable.add(
      this.invalidate,
    );
    this.observers.set(mesh, observer);
  }

  private untrack(mesh: AbstractMesh) {
    const observer = this.observers.get(mesh);
    if (!observer) return;
    mesh.onEffectiveEnabledStateChangedObservable.remove(observer);
    this.observers.delete(mesh);
  }

  private readonly provide: CandidateProvider = () => {
    const source = this.defaultProvider.call(this.scene);
    // Unknown candidate policies are not cached or narrowed. Retained references
    // to this callback also remain safe after its owner is disposed.
    if (
      this.disposed ||
      source.data !== this.scene.meshes ||
      source.length !== this.scene.meshes.length
    ) {
      this.dirty = true;
      return source;
    }
    // Newly constructed meshes must be seen in this JS task, before Babylon's
    // deferred onNewMeshAddedObservable. A same-length remove/add marks dirty
    // synchronously through onMeshRemovedObservable.
    if (this.dirty || this.sourceLength !== source.length) {
      this.candidates.length = 0;
      for (let i = 0; i < source.length; i++) {
        const mesh = source.data[i];
        this.track(mesh);
        if (mesh.isEnabled())
          this.candidates.data[this.candidates.length++] = mesh;
      }
      this.candidates.data.length = this.candidates.length;
      this.sourceLength = source.length;
      this.dirty = false;
    }
    return this.candidates;
  };

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    // Do not replace an octree/custom provider installed by a later owner.
    if (this.scene.getActiveMeshCandidates === this.provide)
      this.scene.getActiveMeshCandidates = this.defaultProvider;
    for (const detach of this.detachScene) detach();
    this.detachScene.length = 0;
    for (const mesh of this.observers.keys()) this.untrack(mesh);
    this.candidates.data.length = this.candidates.length = 0;
  }
}
