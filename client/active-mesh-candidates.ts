import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import type { Observer } from "@babylonjs/core/Misc/observable";
import type { Scene } from "@babylonjs/core/scene";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { MultiMaterial } from "@babylonjs/core/Materials/multiMaterial";
import type { Material } from "@babylonjs/core/Materials/material";
import type {} from "@babylonjs/core/Materials/materialPluginManager.types";

type CandidateProvider = Scene["getActiveMeshCandidates"];
type BypassReason =
  | "disabled"
  | "unattested"
  | "outside-evaluation"
  | "camera"
  | "frustum"
  | "clipping"
  | "selector"
  | "provider"
  | "disposed"
  | null;
export type EnabledMeshCandidateOptions = {
  earlyStaticFrustum?: boolean;
  /** Explicit owner attestation of immutable, CPU-bounded, nondeforming
   * authored geometry. Frozen alone is not an attestation. Unknown assets,
   * custom vertex plugins and wind must return false. Runtime guards still apply. */
  isStaticMesh?: (mesh: Mesh) => boolean;
};
const finiteVector = (value: { x: number; y: number; z: number }) =>
  Number.isFinite(value.x) &&
  Number.isFinite(value.y) &&
  Number.isFinite(value.z);

function rigidMaterial(material: Material | null, depth = 0): boolean {
  if (!material || depth > 4) return false;
  if (material instanceof MultiMaterial) {
    if (!material.subMaterials.length) return false;
    for (const part of material.subMaterials)
      if (!rigidMaterial(part, depth + 1)) return false;
    return true;
  }
  const kind = material.getClassName();
  return (
    (kind === "StandardMaterial" || kind === "PBRMaterial") &&
    !material.pluginManager?.getPlugin("StrahovCleanTreeWind")
  );
}

/** These checks intentionally cost more than an unsafe "frozen => static"
 * shortcut. An owner must A/B the entire provider before enabling it in play. */
function safeStaticBounds(mesh: Mesh) {
  if (
    mesh.constructor !== Mesh ||
    !mesh.isWorldMatrixFrozen ||
    // Babylon 9.30's typed Node.isSynchronized (marked @internal upstream)
    // checks local transforms plus dirty/versioned parents without computing
    // matrices. Regression tests pin this dependency; no private fields read.
    !mesh.isSynchronized() ||
    mesh.isBlocked ||
    !mesh.isVisible ||
    mesh.visibility <= 0 ||
    mesh.scaling.hasAZeroComponent ||
    mesh.alwaysSelectAsActiveMesh ||
    mesh.isAnInstance ||
    mesh.hasInstances ||
    mesh.hasThinInstances ||
    mesh.getLODLevels().length ||
    mesh.skeleton ||
    mesh.morphTargetManager ||
    mesh.bakedVertexAnimationManager ||
    mesh.billboardMode ||
    mesh.infiniteDistance ||
    mesh.actionManager ||
    mesh.animations.length ||
    mesh.doNotSyncBoundingInfo ||
    !mesh.hasBoundingInfo ||
    mesh.metadata?.vegetation ||
    !rigidMaterial(mesh.material)
  )
    return null;
  const geometry = mesh.geometry,
    positions = mesh.getVertexBuffer("position");
  if (
    !geometry ||
    !geometry.isReady() ||
    geometry.meshes.length !== 1 ||
    !positions ||
    positions.isUpdatable()
  )
    return null;
  // Read the current bounding object every time, not cached bounds. Babylon's
  // getter synchronizes dirty bounds to the already frozen cached world matrix;
  // no forced transform or readiness/material/shader evaluation is performed.
  const bounds = mesh.getBoundingInfo(),
    box = bounds.boundingBox,
    sphere = bounds.boundingSphere,
    boundsMatrix = box.getWorldMatrix();
  if (
    !boundsMatrix ||
    !boundsMatrix.equals(mesh.worldMatrixFromCache) ||
    bounds.isLocked ||
    !finiteVector(box.minimumWorld) ||
    !finiteVector(box.maximumWorld) ||
    !finiteVector(sphere.centerWorld) ||
    !Number.isFinite(sphere.radiusWorld) ||
    sphere.radiusWorld < 0 ||
    box.minimumWorld.x > box.maximumWorld.x ||
    box.minimumWorld.y > box.maximumWorld.y ||
    box.minimumWorld.z > box.maximumWorld.z
  )
    return null;
  return bounds;
}

/** By default removes only effectively disabled nodes native evaluation skips.
 * The optional static prefilter uses the same current native frustum and order.
 * Pass the known default provider captured directly after constructing Scene;
 * an already replaced provider is deliberately left alone.
 */
export class EnabledMeshCandidates {
  private readonly observers = new Map<AbstractMesh, Observer<boolean>>();
  private readonly candidates = { data: [] as AbstractMesh[], length: 0 };
  private readonly visibleCandidates = {
    data: [] as AbstractMesh[],
    length: 0,
  };
  private readonly detachScene: (() => void)[] = [];
  private readonly isStaticMesh?: (mesh: Mesh) => boolean;
  private earlyStaticFrustum = false;
  private evaluationReady = false;
  private evaluationCamera: Scene["activeCamera"] = null;
  private evaluationPlanes: Scene["frustumPlanes"] | null = null;
  private evaluationRevision = -1;
  private evaluationRenderId = -1;
  readonly stats = {
    staticFrustumEnabled: false,
    queries: 0,
    rebuilds: 0,
    renderEvaluations: 0,
    attestationErrors: 0,
    sourceCandidates: 0,
    enabledCandidates: 0,
    outputCandidates: 0,
    staticTests: 0,
    staticRejected: 0,
    unsafeStatic: 0,
    bypassReason: "disabled" as BypassReason,
    lastRenderSource: 0,
    lastRenderEnabled: 0,
    lastRenderOutput: 0,
    lastRenderTests: 0,
    lastRenderRejected: 0,
    lastRenderUnsafe: 0,
    lastRenderBypassReason: "not-rendered" as BypassReason | "not-rendered",
  };
  private sourceLength = -1;
  private dirty = true;
  private disposed = false;
  private readonly invalidate = () => {
    this.dirty = true;
  };

  constructor(
    private readonly scene: Scene,
    private readonly defaultProvider: CandidateProvider,
    options: EnabledMeshCandidateOptions = {},
  ) {
    this.isStaticMesh = options.isStaticMesh;
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
    const beforeEvaluation = scene.onBeforeActiveMeshesEvaluationObservable.add(
      () => {
        if (this.disposed) return;
        // Scene._renderForCamera updates its transform/frustum before this event.
        // Consume this permit once; a later diagnostic query must not use stale
        // planes, or replace statistics from the actual native evaluation.
        this.evaluationReady = true;
        this.evaluationCamera = scene.activeCamera;
        this.evaluationPlanes = scene.frustumPlanes;
        this.evaluationRevision = scene.getTransformMatrix().updateFlag;
        this.evaluationRenderId = scene.getRenderId();
      },
    );
    const afterEvaluation = scene.onAfterActiveMeshesEvaluationObservable.add(
      () => {
        this.evaluationReady = false;
      },
    );
    this.detachScene.push(
      () => scene.onNewMeshAddedObservable.remove(added),
      () => scene.onMeshRemovedObservable.remove(removed),
      () => scene.onDisposeObservable.remove(disposed),
      () =>
        scene.onBeforeActiveMeshesEvaluationObservable.remove(beforeEvaluation),
      () =>
        scene.onAfterActiveMeshesEvaluationObservable.remove(afterEvaluation),
    );
    for (const mesh of scene.meshes) this.track(mesh);
    scene.getActiveMeshCandidates = this.provide;
    this.setStaticFrustumEnabled(options.earlyStaticFrustum === true);
  }

  /** A/B switch; a provider created without explicit attestation cannot enable. */
  setStaticFrustumEnabled(enabled: boolean) {
    this.earlyStaticFrustum =
      enabled &&
      !!this.isStaticMesh &&
      !this.disposed &&
      this.scene.getActiveMeshCandidates === this.provide;
    this.stats.staticFrustumEnabled = this.earlyStaticFrustum;
    return this.earlyStaticFrustum;
  }

  private bypassReason(inEvaluation: boolean): BypassReason {
    if (!this.earlyStaticFrustum)
      return this.isStaticMesh ? "disabled" : "unattested";
    if (!inEvaluation) return "outside-evaluation";
    const camera = this.scene.activeCamera;
    if (
      !camera ||
      camera !== this.evaluationCamera ||
      camera.isRigCamera ||
      camera.cameraRigMode ||
      camera.outputRenderTarget ||
      (this.scene.activeCameras?.length ?? 0) > 1
    )
      return "camera";
    if (this.scene.skipFrustumClipping) return "clipping";
    // Babylon declares this optional runtime hook as a nonnullable function.
    const customLOD = this.scene.customLODSelector as
      Scene["customLODSelector"] | undefined;
    if (customLOD) return "selector";
    const planes = this.scene.frustumPlanes;
    if (
      !planes ||
      planes.length !== 6 ||
      planes !== this.evaluationPlanes ||
      this.scene.getRenderId() !== this.evaluationRenderId ||
      this.scene.getTransformMatrix().updateFlag !== this.evaluationRevision ||
      planes.some(
        (plane) =>
          !finiteVector(plane.normal) ||
          !Number.isFinite(plane.d) ||
          plane.normal.lengthSquared() <= 0,
      )
    )
      return "frustum";
    return null;
  }

  private report(result: ReturnType<CandidateProvider>, inEvaluation: boolean) {
    this.stats.outputCandidates = result.length;
    if (inEvaluation) {
      this.stats.renderEvaluations++;
      this.stats.lastRenderSource = this.stats.sourceCandidates;
      this.stats.lastRenderEnabled = this.stats.enabledCandidates;
      this.stats.lastRenderOutput = result.length;
      this.stats.lastRenderTests = this.stats.staticTests;
      this.stats.lastRenderRejected = this.stats.staticRejected;
      this.stats.lastRenderUnsafe = this.stats.unsafeStatic;
      this.stats.lastRenderBypassReason = this.stats.bypassReason;
    }
    return result;
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
    const inEvaluation = this.evaluationReady;
    this.evaluationReady = false;
    this.stats.queries++;
    const source = this.defaultProvider.call(this.scene);
    this.stats.sourceCandidates = source.length;
    this.stats.staticTests =
      this.stats.staticRejected =
      this.stats.unsafeStatic =
        0;
    // Unknown candidate policies are not cached or narrowed. Retained references
    // to this callback also remain safe after its owner is disposed.
    if (
      this.disposed ||
      this.scene.getActiveMeshCandidates !== this.provide ||
      source.data !== this.scene.meshes ||
      source.length !== this.scene.meshes.length
    ) {
      this.dirty = true;
      this.stats.enabledCandidates = source.length;
      this.stats.bypassReason = this.disposed ? "disposed" : "provider";
      return this.report(source, inEvaluation);
    }
    // Newly constructed meshes must be seen in this JS task, before Babylon's
    // deferred onNewMeshAddedObservable. A same-length remove/add marks dirty
    // synchronously through onMeshRemovedObservable.
    if (this.dirty || this.sourceLength !== source.length) {
      this.stats.rebuilds++;
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
    this.stats.enabledCandidates = this.candidates.length;
    this.stats.bypassReason = this.bypassReason(inEvaluation);
    if (this.stats.bypassReason)
      return this.report(this.candidates, inEvaluation);
    const output = this.visibleCandidates;
    output.length = 0;
    for (let index = 0; index < this.candidates.length; index++) {
      const mesh = this.candidates.data[index];
      let attested = false;
      if (mesh instanceof Mesh) {
        try {
          attested = this.isStaticMesh!(mesh);
        } catch {
          this.stats.attestationErrors++;
        }
      }
      if (attested && mesh instanceof Mesh) {
        const bounds = safeStaticBounds(mesh);
        if (bounds) {
          this.stats.staticTests++;
          if (
            !bounds.isInFrustum(this.scene.frustumPlanes, mesh.cullingStrategy)
          ) {
            this.stats.staticRejected++;
            continue;
          }
        } else this.stats.unsafeStatic++;
      }
      output.data[output.length++] = mesh;
    }
    output.data.length = output.length;
    return this.report(output, inEvaluation);
  };

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.earlyStaticFrustum = this.stats.staticFrustumEnabled = false;
    this.evaluationReady = false;
    this.evaluationCamera = null;
    this.evaluationPlanes = null;
    // Do not replace an octree/custom provider installed by a later owner.
    if (this.scene.getActiveMeshCandidates === this.provide)
      this.scene.getActiveMeshCandidates = this.defaultProvider;
    for (const detach of this.detachScene) detach();
    this.detachScene.length = 0;
    for (const mesh of this.observers.keys()) this.untrack(mesh);
    this.candidates.data.length = this.candidates.length = 0;
    this.visibleCandidates.data.length = this.visibleCandidates.length = 0;
  }
}
