import { SpotLight } from "@babylonjs/core/Lights/spotLight";
import { Light } from "@babylonjs/core/Lights/light";
import { ShadowGenerator } from "@babylonjs/core/Lights/Shadows/shadowGenerator";
import { shadowCasterKind, shadowBoundsIntersectFrustum } from "./cinematic";
import { Vector3, Matrix } from "@babylonjs/core/Maths/math.vector";
import { Frustum } from "@babylonjs/core/Maths/math.frustum";
import { ShaderMaterial } from "@babylonjs/core/Materials/shaderMaterial";
import { ShadowDepthWrapper } from "@babylonjs/core/Materials/shadowDepthWrapper";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import type { RenderTargetTexture } from "@babylonjs/core/Materials/Textures/renderTargetTexture";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import type { Scene } from "@babylonjs/core/scene";
import type { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import manifest from "../shared/data/assets/vehicles-manifest.json";
import { installStaticSubmeshShadowCull } from "./static-submesh-shadows";

/** A bounded combined low beam for the one shared drivable vehicle. Lens glow
 * remains per model. These artistic units are not measured vehicle photometry.
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
  private customRenderList: RenderTargetTexture["getCustomRenderList"] = null;
  constructor(private scene: Scene) {
    for (const point of manifest.lights.frontCentres)
      this.origin.addInPlace(Vector3.FromArray(point));
    this.origin.scaleInPlace(1 / manifest.lights.frontCentres.length);
    this.origin.z += 0.025;
    this.light = new SpotLight(
      "shared car · simulated low beam",
      Vector3.Zero(),
      Vector3.Forward(),
      0.8,
      2,
      scene,
    );
    this.light.diffuse = Color3.FromHexString("#fff2d4");
    this.light.falloffType = Light.FALLOFF_STANDARD;
    this.light.range = 32;
    this.light.renderPriority = 10;
    this.light.intensity = 0;
    this.light.setEnabled(false);
    this.light.shadowEnabled = false;
    this.light.shadowMinZ = 0.1;
    this.light.shadowMaxZ = 32;
    this.light.metadata = {
      simulatedVehicleLight: true,
      assetId: manifest.assetId,
      intensityUnits: "artist units, not measured luminous flux",
      combinedHeadlamps: true,
    };
  }
  update(
    root: TransformNode,
    night: number,
    driving: boolean,
    quality = "medium",
  ) {
    if (this.disposed) return;
    const strength = Number.isFinite(night)
      ? Math.max(0, Math.min(1, night))
      : 0;
    const resolvedQuality =
      quality === "high" ? "high" : quality === "medium" ? "medium" : "low";
    const active = driving && strength > 0.1;
    if (this.light.isEnabled(false) !== active) this.light.setEnabled(active);
    this.light.intensity = active ? strength * 1.6 : 0;
    this.light.shadowEnabled = active && resolvedQuality !== "low";
    if (!active) {
      this.lastSelection = -Infinity;
      return;
    }
    const world = root.computeWorldMatrix(true);
    Vector3.TransformCoordinatesToRef(this.origin, world, this.light.position);
    Vector3.TransformNormalToRef(this.direction, world, this.light.direction);
    this.light.direction.normalize();
    if (!this.light.shadowEnabled) {
      this.lastSelection = -Infinity;
      return;
    }
    if (!this.shadow) {
      this.shadow = new ShadowGenerator(
        resolvedQuality === "high" ? 512 : 256,
        this.light,
      );
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
    const now = performance.now();
    if (resolvedQuality !== this.shadowQuality) {
      this.shadow.mapSize = resolvedQuality === "high" ? 512 : 256;
      this.shadowQuality = resolvedQuality;
      this.lastSelection = -Infinity;
    }
    // Resizing recreates the render target; retain the same draw-time filter.
    const shadowMap = this.shadow.getShadowMap()!;
    if (shadowMap.getCustomRenderList !== this.customRenderList)
      shadowMap.getCustomRenderList = this.customRenderList;
    if (
      now - this.lastSelection > 250 ||
      this.scene.meshes.length !== this.lastMeshCount ||
      Vector3.DistanceSquared(this.lastPosition, this.light.position) > 4
    ) {
      this.lastSelection = now;
      this.lastPosition.copyFrom(this.light.position);
      this.lastMeshCount = this.scene.meshes.length;
      const map = this.shadow.getShadowMap()!;
      map.renderList = this.scene.meshes.filter((mesh) => {
        if (
          mesh.isDisposed() ||
          !mesh.getTotalVertices() ||
          mesh.metadata?.depthCaster === false ||
          mesh.metadata?.shadowCaster === false ||
          mesh.infiniteDistance
        )
          return false;
        mesh.computeWorldMatrix(!mesh.isSynchronized());
        const sphere = mesh.getBoundingInfo().boundingSphere;
        return (
          Vector3.Distance(sphere.centerWorld, this.light.position) -
            sphere.radiusWorld <
          36
        );
      });
    }
  }
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
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
