import { SpotLight } from "@babylonjs/core/Lights/spotLight";
import { Light } from "@babylonjs/core/Lights/light";
import { ShadowGenerator } from "@babylonjs/core/Lights/Shadows/shadowGenerator";
import { shadowCasterKind, shadowBoundsIntersectFrustum } from "./cinematic";
import { Vector3, Matrix } from "@babylonjs/core/Maths/math.vector";
import { Frustum } from "@babylonjs/core/Maths/math.frustum";
import { ShaderMaterial } from "@babylonjs/core/Materials/shaderMaterial";
import { ShadowDepthWrapper } from "@babylonjs/core/Materials/shadowDepthWrapper";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import type { RenderTargetTexture } from "@babylonjs/core/Materials/Textures/renderTargetTexture";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import type { Scene } from "@babylonjs/core/scene";
import type { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import manifest from "../shared/data/assets/vehicles-manifest.json";
import { installStaticSubmeshShadowCull } from "./static-submesh-shadows";

type BeamQuality = "low" | "medium" | "high";
const shadowMapSize = (quality: BeamQuality) =>
  quality === "high" ? 512 : quality === "medium" ? 256 : 128;
const beamQuality = (quality: string): BeamQuality => quality === "high" ? "high" : quality === "medium" ? "medium" : "low";
export type LocalShadowPreparationStatus = "ready" | "pending" | "unsupported" | "unavailable";
type LocalShadowWork = {
  owner: TransformNode;
  quality: BeamQuality;
  entries: { mesh: Mesh; material: PBRMaterial; geometry: Mesh["geometry"]; skeleton: Mesh["skeleton"]; sub: Mesh["subMeshes"][number]; ready: boolean }[];
  generator?: ShadowGenerator;
  map?: RenderTargetTexture;
  pass?: number;
  filter?: number;
  normalBias?: boolean;
  batches: number;
  running: boolean;
  worldPrepared: boolean;
  status: LocalShadowPreparationStatus;
};

/** Bounded spotlight and shared shadow lifecycle for the car or local torch.
 * These artistic units are not measured photometry. Only one is used by the
 * local player at a time; parked cars and remote avatars do not add spotlights.
 */
export class VehicleLighting {
  readonly light: SpotLight;
  private origin = Vector3.Zero();
  private direction = new Vector3(0, -0.1, 1).normalize();
  private shadow?: ShadowGenerator;
  private lastSelection = -Infinity;
  private shadowQuality = "";
  private lastPosition = new Vector3(Infinity, Infinity, Infinity);
  private lastMeshCount = -1;
  private shadowPlanes = Frustum.GetPlanes(Matrix.Identity());
  private visibleCasters: AbstractMesh[] = [];
  private wrappers = new Map<ShaderMaterial, ShadowDepthWrapper>();
  private disposed = false;
  private configuringShadow = false;
  private preparingLocalShadow = false;
  private localShadowWork?: LocalShadowWork;
  private customRenderList: RenderTargetTexture["getCustomRenderList"] = null;
  constructor(
    private scene: Scene,
    private readonly kind: "vehicle" | "player" = "vehicle",
  ) {
    for (const point of manifest.lights.frontCentres)
      this.origin.addInPlace(Vector3.FromArray(point));
    this.origin.scaleInPlace(1 / manifest.lights.frontCentres.length);
    this.origin.z += 0.025;
    this.light = new SpotLight(
      kind === "vehicle"
        ? "shared car · simulated low beam"
        : "local player · flashlight",
      Vector3.Zero(),
      Vector3.Forward(),
      kind === "vehicle" ? 0.8 : 0.72,
      // Standard attenuation has a hard outer cutoff. A narrow smooth core
      // fades the torch to <2% before that edge; preserve the car's low beam.
      kind === "vehicle" ? 2 : 64,
      scene,
    );
    this.light.diffuse = Color3.FromHexString("#fff2d4");
    this.light.falloffType = Light.FALLOFF_STANDARD;
    this.light.range = kind === "vehicle" ? 32 : 24;
    this.light.renderPriority = 10;
    this.light.intensity = 0;
    this.light.setEnabled(false);
    this.light.shadowEnabled = false;
    this.light.shadowMinZ = 0.1;
    this.light.shadowMaxZ = this.light.range;
    this.light.metadata = {
      simulatedVehicleLight: kind === "vehicle",
      assetId: kind === "vehicle" ? manifest.assetId : undefined,
      intensityUnits: "artist units, not measured luminous flux",
      combinedHeadlamps: kind === "vehicle",
      localFlashlight: kind === "player",
    };
  }
  update(
    root: TransformNode,
    night: number,
    driving: boolean,
    quality = "medium",
  ) {
    if (!this.disposed && driving && night > 0.1) {
      const world = root.computeWorldMatrix(true);
      Vector3.TransformCoordinatesToRef(
        this.origin,
        world,
        this.light.position,
      );
      Vector3.TransformNormalToRef(this.direction, world, this.light.direction);
      this.light.direction.normalize();
    }
    this.updateBeam(night, driving, quality);
  }
  /** Already computed socket/camera pose: no temporary transform node or matrix. */
  updateFromPose(
    position: Vector3,
    direction: Vector3,
    enabled: boolean,
    quality = "medium",
  ) {
    if (!this.disposed && enabled) {
      this.light.position.copyFrom(position);
      this.light.direction.copyFrom(direction).normalize();
    }
    this.updateBeam(1, enabled, quality);
  }
  /** Shader preparation for the actual local opaque skinned body only. This
   * never lights the beam, submits a frame or borrows a world/caster list. */
  prepareLocalShadow(owner: TransformNode | undefined, meshes: readonly Mesh[] | undefined, quality: string): LocalShadowPreparationStatus {
    if (this.disposed || this.scene.isDisposed || this.kind !== "player" || !owner || owner.isDisposed() || owner.getScene() !== this.scene || !meshes) {
      this.localShadowWork = undefined;
      return "unavailable";
    }
    if (this.configuringShadow) { this.localShadowWork = undefined; return "unavailable"; }
    if (this.shadow && this.light.getShadowGenerator() !== this.shadow) { this.localShadowWork = undefined; return "unavailable"; }
    if (!this.localMeshesSupported(owner, meshes)) { this.localShadowWork = undefined; return "unsupported"; }
    const resolved = beamQuality(quality), current = this.localShadowWork;
    let work: LocalShadowWork;
    if (current && this.localInputsMatch(current, owner, meshes, resolved) && this.localTargetMatches(current)) {
      if (current.running) return "pending";
      if (current.status !== "pending") return current.status;
      work = current;
    } else {
      work = { owner, quality: resolved, entries: meshes.map(mesh => ({ mesh, material: mesh.material as PBRMaterial,
        geometry: mesh.geometry, skeleton: mesh.skeleton, sub: mesh.subMeshes[0], ready: false })),
        batches: 0, running: false, worldPrepared: false, status: "pending" };
      this.localShadowWork = work;
      const engine = this.scene.getEngine(), previousPass = engine.currentRenderPassId;
      try {
        const map = this.configureShadow(resolved);
        if (this.localShadowWork !== work || this.disposed) return this.retireLocalShadow(work);
        this.setLocalShadowTarget(work, map);
        if (!map || !work.generator || this.light.getShadowGenerator() !== work.generator) return work.status = "unavailable";
      } catch (error) {
        if (this.localShadowWork === work) { this.setLocalShadowTarget(work, this.shadow?.getShadowMap() ?? undefined); work.status = "unavailable"; }
        throw error;
      } finally { engine.currentRenderPassId = previousPass; }
    }
    if (!this.ownsLocalShadow(work, owner, meshes, resolved)) return this.retireLocalShadow(work);
    // A native callback may replace the owner, but cannot recursively spend a
    // second batch inside this update. The newer work runs on the next update.
    if (this.preparingLocalShadow) return "pending";
    if (work.batches >= 32) return work.status = "unavailable";
    const engine = this.scene.getEngine(), previousPass = engine.currentRenderPassId;
    this.preparingLocalShadow = true; work.running = true; work.batches++;
    try {
      if (!work.worldPrepared) {
        for (const entry of work.entries) {
          entry.mesh.computeWorldMatrix(!entry.mesh.isSynchronized());
          if (!this.ownsLocalShadow(work, owner, meshes, resolved)) return this.retireLocalShadow(work);
        }
        work.worldPrepared = true;
      }
      engine.currentRenderPassId = work.pass!;
      for (const entry of work.entries) {
        if (entry.ready) continue;
        const override = entry.mesh.getMaterialForRenderPass(work.pass!);
        if (override && override !== entry.material) return work.status = "unsupported";
        const ready = work.generator!.isReady(entry.sub, false, false);
        if (!this.ownsLocalShadow(work, owner, meshes, resolved) || engine.currentRenderPassId !== work.pass) return this.retireLocalShadow(work);
        entry.ready = ready;
      }
      if (work.entries.every(entry => entry.ready)) work.status = "ready";
      else if (work.batches === 32) work.status = "unavailable";
      return work.status;
    } catch (error) {
      if (this.localShadowWork === work) work.status = "unavailable";
      throw error;
    } finally {
      engine.currentRenderPassId = previousPass;
      work.running = false;
      this.preparingLocalShadow = false;
      if (this.localShadowWork === work && (this.disposed || this.scene.isDisposed || owner.isDisposed())) this.localShadowWork = undefined;
    }
  }
  private retireLocalShadow(work: LocalShadowWork): LocalShadowPreparationStatus {
    if (this.localShadowWork === work) this.localShadowWork = undefined;
    return "unavailable";
  }
  private setLocalShadowTarget(work: LocalShadowWork, map: RenderTargetTexture | undefined) {
    work.generator = this.shadow; work.map = map; work.pass = map?.renderPassId;
    work.filter = work.generator?.filter; work.normalBias = !!work.generator?.normalBias;
  }
  private localMeshesSupported(owner: TransformNode, meshes: readonly Mesh[]) {
    if (meshes.length !== 3) return false;
    for (let i = 0; i < 3; i++) {
      const mesh = meshes[i];
      if (!(mesh instanceof Mesh) || mesh.getScene() !== this.scene || mesh.isDisposed() || mesh.parent !== owner ||
          !mesh.geometry || !mesh.skeleton || !mesh.useBones || !mesh.computeBonesUsingShaders || mesh.numBoneInfluencers !== 4 || mesh.metadata?.avatarBodyLod !== "near" ||
          mesh.metadata?.skinnedAnatomy !== true || mesh.instances.length || mesh.hasThinInstances || mesh.morphTargetManager || mesh.subMeshes.length !== 1) return false;
      for (let j = 0; j < i; j++) if (meshes[j] === mesh) return false;
      const material = mesh.material;
      if (!(material instanceof PBRMaterial) || material.shadowDepthWrapper || material.needAlphaTestingForMesh(mesh) || material.needAlphaBlendingForMesh(mesh)) return false;
      const pass = this.shadow?.getShadowMap()?.renderPassId;
      const override = pass === undefined ? undefined : mesh.getMaterialForRenderPass(pass);
      if (override && override !== material) return false;
    }
    return true;
  }
  private localInputsMatch(work: LocalShadowWork, owner: TransformNode, meshes: readonly Mesh[], quality: BeamQuality) {
    if (work.owner !== owner || work.quality !== quality) return false;
    for (let i = 0; i < 3; i++) {
      const entry = work.entries[i], mesh = meshes[i];
      if (entry.mesh !== mesh || entry.material !== mesh.material || entry.geometry !== mesh.geometry || entry.skeleton !== mesh.skeleton || entry.sub !== mesh.subMeshes[0]) return false;
    }
    return true;
  }
  private localTargetMatches(work: LocalShadowWork) {
    return work.generator === this.shadow && work.map === (this.shadow?.getShadowMap() ?? undefined) && work.pass === work.map?.renderPassId &&
      work.filter === work.generator?.filter && work.normalBias === !!work.generator?.normalBias;
  }
  private ownsLocalShadow(work: LocalShadowWork, owner: TransformNode, meshes: readonly Mesh[], quality: BeamQuality) {
    return this.localShadowWork === work && !this.disposed && !this.scene.isDisposed && !owner.isDisposed() &&
      this.localMeshesSupported(owner, meshes) && this.localInputsMatch(work, owner, meshes, quality) && this.localTargetMatches(work) && this.light.getShadowGenerator() === work.generator;
  }
  private updateBeam(night: number, driving: boolean, quality: string) {
    if (this.disposed) return;
    const strength = Number.isFinite(night)
      ? Math.max(0, Math.min(1, night))
      : 0;
    const resolvedQuality = beamQuality(quality);
    const active = driving && strength > 0.1;
    if (this.light.isEnabled(false) !== active) this.light.setEnabled(active);
    this.light.intensity = active ? strength * 1.6 : 0;
    if (!active) {
      // Babylon excludes disabled lights from both material light slots and
      // shadow collection. Retain the configured shadow mode while off: also
      // changing shadowEnabled needlessly dirties every affected mesh on the
      // next activation, although the same shader/map can be used again.
      this.lastSelection = -Infinity;
      return;
    }
    // The close-range torch retains a small occlusion map even on low.
    this.light.shadowEnabled =
      this.kind === "player" || resolvedQuality !== "low";
    if (!this.light.shadowEnabled) {
      this.lastSelection = -Infinity;
      return;
    }
    const now = performance.now();
    const shadowMap = this.configureShadow(resolvedQuality);
    if (!shadowMap) return;
    if (
      now - this.lastSelection > 250 ||
      this.scene.meshes.length !== this.lastMeshCount ||
      Vector3.DistanceSquared(this.lastPosition, this.light.position) > 4
    ) {
      this.lastSelection = now;
      this.lastPosition.copyFrom(this.light.position);
      this.lastMeshCount = this.scene.meshes.length;
      const candidates = shadowMap.renderList ?? (shadowMap.renderList = []);
      let count = 0;
      for (const mesh of this.scene.meshes) {
        if (
          mesh.isDisposed() ||
          !mesh.getTotalVertices() ||
          mesh.metadata?.depthCaster === false ||
          mesh.metadata?.shadowCaster === false ||
          mesh.infiniteDistance
        )
          continue;
        mesh.computeWorldMatrix(!mesh.isSynchronized());
        const sphere = mesh.getBoundingInfo().boundingSphere;
        const reach = this.light.range + 4 + sphere.radiusWorld;
        if (
          !(
            Vector3.DistanceSquared(sphere.centerWorld, this.light.position) <
            reach * reach
          )
        )
          continue;
        // Babylon observes renderList mutators to dirty shadow defines when
        // the list becomes empty/nonempty. Preserve that notification once,
        // while reusing the same array for ordinary broad-phase refreshes.
        if (candidates.length === 0) candidates.push(mesh);
        else candidates[count] = mesh;
        count++;
      }
      if (count === 0 && candidates.length > 0) {
        candidates.length = 1;
        candidates.pop();
      } else candidates.length = count;
    }
  }
  private configureShadow(resolvedQuality: BeamQuality) {
    if (this.disposed || this.configuringShadow) return;
    this.configuringShadow = true;
    try {
      if (!this.shadow) {
        const created = new ShadowGenerator(shadowMapSize(resolvedQuality), this.light);
        if (this.disposed) { created.dispose(); return; }
        this.shadow = created;
        installStaticSubmeshShadowCull(
          this.shadow,
          shadowBoundsIntersectFrustum,
          0.02,
        );
        this.shadowQuality = resolvedQuality;
        this.shadow.usePercentageCloserFiltering = true;
        this.shadow.filteringQuality = ShadowGenerator.QUALITY_LOW;
        this.shadow.bias = 0.0007;
        this.shadow.normalBias = 0.015;
        this.customRenderList = (_pass, candidates, length) => {
          this.visibleCasters.length = 0;
          if (
            this.disposed ||
            !this.light.shadowEnabled ||
            !this.light.isEnabled() ||
            !candidates
          )
            return this.visibleCasters;
          Frustum.GetPlanesToRef(
            this.shadow!.getTransformMatrix(),
            this.shadowPlanes,
          );
          for (let i = 0; i < length; i++) {
            const mesh = candidates[i];
            if (!shadowCasterKind(mesh)) continue;
            // A new/moved mesh may share Babylon's current render id before the
            // main pass; force only unsynchronised transforms, not frozen scenery.
            mesh.computeWorldMatrix(!mesh.isSynchronized());
            const bounds = mesh.getBoundingInfo().boundingBox;
            if (
              !shadowBoundsIntersectFrustum(
                bounds.minimumWorld,
                bounds.maximumWorld,
                this.shadowPlanes,
                0.02 + (mesh.metadata?.windDeformed ? 0.5 : 0),
              )
            )
              continue;
            if (
              mesh.material instanceof ShaderMaterial &&
              mesh.metadata?.windDeformed &&
              !mesh.material.shadowDepthWrapper
            ) {
              const wrapper = new ShadowDepthWrapper(mesh.material, this.scene, {
                remappedVariables: [
                  "worldPos",
                  "worldPosition",
                  "vNormalW",
                  "vNormal",
                ],
              });
              mesh.material.shadowDepthWrapper = wrapper;
              this.wrappers.set(mesh.material, wrapper);
            }
            this.visibleCasters.push(mesh);
          }
          return this.visibleCasters;
        };
      }
      if (resolvedQuality !== this.shadowQuality) {
        this.shadow.mapSize = shadowMapSize(resolvedQuality);
        this.shadowQuality = resolvedQuality;
        this.lastSelection = -Infinity;
      }
      // Resizing recreates the render target; retain the same draw-time filter.
      const shadowMap = this.shadow.getShadowMap();
      if (!shadowMap) return;
      if (shadowMap.getCustomRenderList !== this.customRenderList)
        shadowMap.getCustomRenderList = this.customRenderList;
      return shadowMap;
    } finally { this.configuringShadow = false; }
  }
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.localShadowWork = undefined;
    this.shadow?.dispose();
    for (const [material, wrapper] of this.wrappers) {
      if (material.shadowDepthWrapper === wrapper)
        material.shadowDepthWrapper = null;
      wrapper.dispose();
    }
    this.wrappers.clear();
    this.visibleCasters.length = 0;
    this.light.dispose();
  }
}
