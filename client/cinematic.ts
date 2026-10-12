import { DefaultRenderingPipeline } from "@babylonjs/core/PostProcesses/RenderPipeline/Pipelines/defaultRenderingPipeline";
// Own the scene extension used below; glTF may register it later, but a render
// loop can start before asynchronous model loading has completed.
import "@babylonjs/core/PostProcesses/RenderPipeline/postProcessRenderPipelineManagerSceneComponent";
import { ShadowGenerator } from "@babylonjs/core/Lights/Shadows/shadowGenerator";
import { ShadowDepthWrapper } from "@babylonjs/core/Materials/shadowDepthWrapper";
import { ImageProcessingConfiguration } from "@babylonjs/core/Materials/imageProcessingConfiguration";
import { RawCubeTexture } from "@babylonjs/core/Materials/Textures/rawCubeTexture";
import "@babylonjs/core/Materials/Textures/baseTexture.polynomial";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import { Constants } from "@babylonjs/core/Engines/constants";
import { ShaderMaterial } from "@babylonjs/core/Materials/shaderMaterial";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { FresnelParameters } from "@babylonjs/core/Materials/fresnelParameters";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Vector3, Matrix } from "@babylonjs/core/Maths/math.vector";
import { Frustum } from "@babylonjs/core/Maths/math.frustum";
import type { Plane } from "@babylonjs/core/Maths/math.plane";
import type { Observer } from "@babylonjs/core/Misc/observable";
import type { Material } from "@babylonjs/core/Materials/material";
import type { RenderTargetTexture } from "@babylonjs/core/Materials/Textures/renderTargetTexture";
import {
  SphericalHarmonics,
  SphericalPolynomial,
} from "@babylonjs/core/Maths/sphericalPolynomial";
import type { Scene } from "@babylonjs/core/scene";
import type { BaseTexture } from "@babylonjs/core/Materials/Textures/baseTexture";
import type { Camera } from "@babylonjs/core/Cameras/camera";
import type { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import type { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import type { Vec3 } from "../shared/types";
import { renderBudget } from "../shared/render-quality";
import { configureCampusGrade, campusExposure } from "./cinematic-art";
import { installStaticSubmeshShadowCull } from "./static-submesh-shadows";

const clamp = (value: number) =>
  Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
const SHADOW_SPAN = 72;
const smooth = (from: number, to: number, value: number) => {
  const t = clamp((value - from) / (to - from));
  return t * t * (3 - 2 * t);
};

export type CelestialShadowSource = "sun" | "moon" | "none";

/** Direct-light occlusion, not ambient darkness or a measured optical model.
 * The selected light already carries phase, distance and atmospheric extinction.
 * In particular, weak crescents must not inherit a daytime shadow silhouette. */
export function campusShadowResponse(
  source: CelestialShadowSource,
  directionY: number,
  intensity: number,
  cloud: number,
  rain = 0,
) {
  const lunar = source === "moon";
  const elevation = smooth(0.006, 0.065, -directionY);
  const direct = smooth(lunar ? 0.001 : 0.008, lunar ? 0.012 : 0.16, intensity);
  const weather = (1 - smooth(0.2, 1, cloud)) * (1 - clamp(rain / 8) * 0.35);
  const strength =
    source === "none"
      ? 0
      : (lunar ? 0.82 : 0.88) * elevation * direct * weather;
  return {
    enabled: strength > 0.008,
    strength,
    // Babylon calls light leakage "darkness": 0 occludes, 1 is fully lit.
    darkness: 1 - strength,
  };
}

/** A small nocturnal halo keeps warm practical lights legible without raising
 * scene exposure. Bloom remains absent at low quality and never lights surfaces. */
export function campusBloomResponse(daylight: number, rain = 0) {
  const night = 1 - clamp(daylight);
  return {
    threshold: 0.96 - night * 0.08,
    weight: 0.1 + night * 0.02 + clamp(rain / 8) * night * 0.01,
  };
}

/** The cube already contains the current sky radiance. This multiplier must
 * not impose a daytime HDR fill when the sun and moon are below the horizon. */
export function campusEnvironmentIntensity(daylight: number) {
  return 0.04 + 0.61 * clamp(daylight);
}

/** One exposure/IBL path for the live scene and deterministic scene-state QA.
 * Artistic exposure is bounded; it is not an illuminance value in lux. */
export function applyCampusSkyIntensity(scene: Scene, daylight: number) {
  scene.imageProcessingConfiguration.exposure = campusExposure(clamp(daylight));
  scene.environmentIntensity = campusEnvironmentIntensity(daylight);
}

/** CPU integration of the authored sky avoids a GPU readback or a foreign HDR
 * landscape. Inputs are display-space palette colours; stored data are linear. */
export function skyReflectionData(
  topDisplay: Color3,
  horizonDisplay: Color3,
  size = 32,
) {
  const top = topDisplay.toLinearSpace(),
    horizon = horizonDisplay.toLinearSpace();
  const directions = [
    (u: number, v: number) => new Vector3(1, v, -u),
    (u: number, v: number) => new Vector3(-1, v, u),
    (u: number, v: number) => new Vector3(u, 1, -v),
    (u: number, v: number) => new Vector3(u, -1, v),
    (u: number, v: number) => new Vector3(u, v, 1),
    (u: number, v: number) => new Vector3(-u, v, -1),
  ];
  const harmonics = new SphericalHarmonics();
  const color = Color3.Black();
  const faces = directions.map((direction) => {
    const data = new Uint8Array(size * size * 4);
    for (let y = 0; y < size; y++)
      for (let x = 0; x < size; x++) {
        const u = ((x + 0.5) * 2) / size - 1,
          v = 1 - ((y + 0.5) * 2) / size;
        const d = direction(u, v).normalize();
        const elevation = d.y,
          t = Math.max(0, elevation);
        Color3.LerpToRef(horizon, top, t, color);
        if (elevation < 0) color.scaleInPlace(0.24);
        const i = (y * size + x) * 4;
        data[i] = Math.round(clamp(color.r) * 255);
        data[i + 1] = Math.round(clamp(color.g) * 255);
        data[i + 2] = Math.round(clamp(color.b) * 255);
        data[i + 3] = 255;
        harmonics.addLight(
          d,
          color,
          4 / (size * size * (1 + u * u + v * v) ** 1.5),
        );
      }
    return data;
  });
  harmonics.convertIncidentRadianceToIrradiance();
  harmonics.convertIrradianceToLambertianRadiance();
  return { faces, polynomial: SphericalPolynomial.FromHarmonics(harmonics) };
}

/** Snap the light's two transverse axes, without snapping the player or camera. */
export function snappedShadowFocus(
  player: Vec3,
  lightDirection: Vec3,
  mapSize: number,
) {
  return writeSnappedShadowFocus(player, lightDirection, mapSize, {
    focus: Vector3.Zero(),
    direction: Vector3.Zero(),
    texel: 0,
  });
}

type ShadowFocus = { focus: Vector3; direction: Vector3; texel: number };

/** The render loop owns one result; snapping does not allocate vectors/frame. */
function writeSnappedShadowFocus(
  player: Vec3,
  lightDirection: Vec3,
  mapSize: number,
  result: ShadowFocus,
) {
  const { focus, direction } = result;
  focus.set(player.x, player.y + 3, player.z);
  direction.copyFromFloats(
    lightDirection.x,
    lightDirection.y,
    lightDirection.z,
  );
  const length = direction.lengthSquared();
  if (!Number.isFinite(length) || length < 1e-12) direction.set(0, -1, 0);
  direction.normalize();
  // The celestial zenith needs a non-parallel reference axis.
  const zenith = Math.abs(direction.y) > 0.98;
  let rx = zenith ? -direction.y : direction.z,
    ry = zenith ? direction.x : 0,
    rz = zenith ? 0 : -direction.x;
  const inverseRightLength = 1 / Math.hypot(rx, ry, rz);
  rx *= inverseRightLength;
  ry *= inverseRightLength;
  rz *= inverseRightLength;
  const ux = direction.y * rz - direction.z * ry,
    uy = direction.z * rx - direction.x * rz,
    uz = direction.x * ry - direction.y * rx;
  const texel = SHADOW_SPAN / Math.max(1, mapSize);
  const rightOffset = focus.x * rx + focus.y * ry + focus.z * rz,
    upOffset = focus.x * ux + focus.y * uy + focus.z * uz;
  const snapRight = Math.round(rightOffset / texel) * texel - rightOffset,
    snapUp = Math.round(upOffset / texel) * texel - upOffset;
  focus.set(
    focus.x + rx * snapRight + ux * snapUp,
    focus.y + ry * snapRight + uy * snapUp,
    focus.z + rz * snapRight + uz * snapUp,
  );
  result.texel = texel;
  return result;
}

/** Explicit producer metadata takes precedence over the safe opaque fallback. */
export function shadowCasterKind(
  mesh: AbstractMesh,
): false | "opaque" | "alpha-test" {
  return casterKind(mesh, true);
}

function casterKind(
  mesh: AbstractMesh,
  activeOnly: boolean,
): false | "opaque" | "alpha-test" {
  if (
    mesh.isDisposed() ||
    (activeOnly &&
      (!mesh.isEnabled() || !mesh.isVisible || mesh.visibility < 0.5)) ||
    !mesh.material
  )
    return false;
  const metadata = mesh.metadata ?? {};
  if (
    metadata.depthCaster === false ||
    metadata.shadowCaster === false ||
    mesh.infiniteDistance
  )
    return false;
  if (mesh.material.alpha < 0.98 || mesh.material.disableDepthWrite)
    return false;
  if (metadata.depthCaster === "alpha-test")
    return mesh.material.needAlphaTestingForMesh(mesh) ? "alpha-test" : false;
  // Never let an arbitrary custom sky/cloud/grass shader become a solid caster.
  if (mesh.material instanceof ShaderMaterial) return false;
  if (metadata.depthCaster === "opaque") return "opaque";
  const bounds = mesh.getBoundingInfo().boundingBox;
  return bounds.maximumWorld.y - bounds.minimumWorld.y > 0.12
    ? "opaque"
    : false;
}

/** Reject only an AABB wholly outside a shadow-camera plane. Crossing boxes
 * remain casters even when their centre lies outside; wind gets a safe margin. */
export function shadowBoundsIntersectFrustum(
  min: Vec3,
  max: Vec3,
  planes: readonly Plane[],
  padding = 0,
) {
  for (const plane of planes) {
    const n = plane.normal;
    if (
      n.x * (n.x >= 0 ? max.x : min.x) +
        n.y * (n.y >= 0 ? max.y : min.y) +
        n.z * (n.z >= 0 ? max.z : min.z) +
        plane.d <
      -padding
    )
      return false;
  }
  return true;
}

export function solarShadowsEnabled(
  daylight: number,
  directionY: number,
  intensity: number,
) {
  return clamp(daylight) > 0.08 && directionY < -0.015 && intensity > 0.04;
}

function isCampusWindow(material: StandardMaterial) {
  return (
    (material.metadata?.realityGlass === true &&
      material.metadata.block === 6) ||
    material.metadata?.exteriorOnlyGlass === true
  );
}

export function applyWindowSkyReflection(
  material: StandardMaterial,
  environment: BaseTexture,
) {
  if (!isCampusWindow(material)) return false;
  material.reflectionTexture = environment;
  material.reflectionFresnelParameters = new FresnelParameters({
    leftColor: new Color3(0.68, 0.7, 0.72),
    rightColor: new Color3(0.04, 0.04, 0.04),
    power: 5,
    bias: 0,
  });
  // Exterior-only windows keep their opaque authored room mask. Reflection
  // adds no transparent pass or view into buildings without an interior.
  if (material.metadata.block === 6)
    material.opacityFresnelParameters = new FresnelParameters({
      leftColor: new Color3(0.45, 0.45, 0.45),
      rightColor: Color3.Black(),
      power: 5,
      bias: 0,
    });
  material.roughness = material.metadata.windowStyle === "clear" ? 0.04 : 0.1;
  if (material.metadata.nightWindows && material.emissiveTexture)
    material.useEmissiveAsIllumination = true;
  return true;
}

type AtmosphereInput = {
  dt: number;
  player: Vec3;
  quality: string;
  cloud: number;
  daylight: number;
  /** Same celestial source selected by art-lighting for this directional light.
   * Omission preserves the legacy solar-only scene fixtures. */
  keySource?: CelestialShadowSource;
  /** Precipitation in mm/h, as reported by the shared weather state. */
  rain?: number;
  avatars?: Iterable<{
    root: TransformNode;
    target: { id: string; vehicle: boolean };
  }>;
  localId?: string;
};

/** Real cast shadows, restrained highlights and reflection of the current sky.
 * It does not move astronomical bodies or simulate weather independently. */
export class CinematicAtmosphere {
  private pipeline?: DefaultRenderingPipeline;
  private shadow: ShadowGenerator;
  private environment: RawCubeTexture;
  private quality = "";
  private timer = 1;
  private environmentTimer = 10;
  private lastSky = new Color3(-1, -1, -1);
  private lastHorizon = new Color3(-1, -1, -1);
  private wrappers = new Map<ShaderMaterial, ShadowDepthWrapper>();
  private glass = new Set<StandardMaterial>();
  private pendingGlass = new Set<Material>();
  private addedMaterial: Observer<Material>;
  private removedMaterial: Observer<Material>;
  private shadowMap?: RenderTargetTexture;
  private shadowPlanes = Frustum.GetPlanes(Matrix.Identity());
  private visibleCasters: AbstractMesh[] = [];
  private shadowsEnabled = false;
  private shadowSource: CelestialShadowSource = "none";
  private shadowFocus: ShadowFocus = {
    focus: Vector3.Zero(),
    direction: Vector3.Zero(),
    texel: 0,
  };
  private disposed = false;
  readonly stats = {
    shadowCasters: 0,
    alphaCasters: 0,
    glassMaterials: 0,
    skyUpdates: 0,
    shadowMapSize: 512,
    shadowCandidates: 0,
    shadowFrustumRejected: 0,
    shadowInactiveRejected: 0,
    selectionMeshVisits: 0,
    glassVisits: 0,
    shadowSource: "none" as CelestialShadowSource,
    shadowStrength: 0,
    shadowDarkness: 1,
    bloomThreshold: 0,
    bloomWeight: 0,
  };

  constructor(
    private scene: Scene,
    private camera: Camera,
    private sun: DirectionalLight,
  ) {
    const config = scene.imageProcessingConfiguration;
    config.toneMappingEnabled = true;
    config.toneMappingType = ImageProcessingConfiguration.TONEMAPPING_ACES;
    applyCampusSkyIntensity(scene, 0);
    configureCampusGrade(config);
    // The custom sky/foliage shaders already emit display colours. Standard/PBR
    // materials perform their own image processing: no second gamma over all.
    config.applyByPostProcess = false;
    const sky = this.reflectionData();
    this.environment = new RawCubeTexture(
      scene,
      sky.faces,
      32,
      Constants.TEXTUREFORMAT_RGBA,
      Constants.TEXTURETYPE_UNSIGNED_BYTE,
      true,
      false,
      Texture.TRILINEAR_SAMPLINGMODE,
    );
    this.environment.name = "weather-matched authored sky reflection";
    this.environment.gammaSpace = false;
    this.environment.sphericalPolynomial = sky.polynomial;
    scene.environmentTexture = this.environment;
    scene.environmentIntensity = campusEnvironmentIntensity(0);
    this.shadow = new ShadowGenerator(512, sun);
    installStaticSubmeshShadowCull(
      this.shadow,
      shadowBoundsIntersectFrustum,
      0.05,
    );
    this.shadow.usePercentageCloserFiltering = true;
    this.shadow.filteringQuality = ShadowGenerator.QUALITY_LOW;
    this.shadow.bias = 0.00022;
    this.shadow.normalBias = 0.024;
    this.shadow.frustumEdgeFalloff = 0.15;
    this.shadow.transparencyShadow = false;
    sun.shadowFrustumSize = SHADOW_SPAN;
    sun.shadowMinZ = 0.1;
    sun.shadowMaxZ = 180;
    sun.autoCalcShadowZBounds = false;
    sun.autoUpdateExtends = false;
    this.addedMaterial = scene.onNewMaterialAddedObservable.add((material) => {
      if (!this.disposed) this.pendingGlass.add(material);
    });
    this.removedMaterial = scene.onMaterialRemovedObservable.add((material) => {
      this.pendingGlass.delete(material);
      this.glass.delete(material as StandardMaterial);
      this.releaseShadowWrapper(material);
    });
    for (const material of scene.materials) this.pendingGlass.add(material);
    this.bindShadowMap();
  }

  private bindShadowMap() {
    const map = this.shadow.getShadowMap();
    if (!map || this.shadowMap === map) return;
    this.shadowMap = map;
    if (map) {
      map.renderParticles = false;
      map.renderSprites = false;
      // Babylon's explicit render list does not frustum-cull. This callback is
      // called after the generator updates the real light view/projection, both
      // during readiness and the draw pass. It also avoids observing/mutating
      // the renderList array every frame (which may dirty all scene lights).
      map.getCustomRenderList = (_pass, candidates, length) => {
        this.visibleCasters.length = 0;
        this.stats.shadowFrustumRejected = 0;
        this.stats.shadowInactiveRejected = 0;
        if (!this.shadowsEnabled || !candidates) return this.visibleCasters;
        Frustum.GetPlanesToRef(
          this.shadow.getTransformMatrix(),
          this.shadowPlanes,
        );
        let alpha = 0;
        for (let i = 0; i < length; i++) {
          const mesh = candidates[i];
          const kind = shadowCasterKind(mesh);
          if (!kind) {
            this.stats.shadowInactiveRejected++;
            continue;
          }
          mesh.computeWorldMatrix();
          const bounds = mesh.getBoundingInfo().boundingBox;
          // Include normal/depth shadow bias at the clip edge. Clean tree shader
          // displacement is 16 * .77 * .008 < .1m; .5m additionally covers the
          // older wind foliage shader conservatively.
          if (
            !shadowBoundsIntersectFrustum(
              bounds.minimumWorld,
              bounds.maximumWorld,
              this.shadowPlanes,
              0.05 + (mesh.metadata?.windDeformed ? 0.5 : 0),
            )
          ) {
            this.stats.shadowFrustumRejected++;
            continue;
          }
          if (kind === "alpha-test") {
            if (this.quality === "low") continue;
            if (
              mesh.material instanceof ShaderMaterial &&
              mesh.metadata?.windDeformed
            ) {
              let wrapper = this.wrappers.get(mesh.material);
              if (!wrapper) {
                wrapper = new ShadowDepthWrapper(mesh.material, this.scene, {
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
            }
            alpha++;
          }
          this.visibleCasters.push(mesh);
        }
        this.stats.shadowCasters = this.visibleCasters.length;
        this.stats.alphaCasters = alpha;
        return this.visibleCasters;
      };
    }
  }

  private reflectionData() {
    const top = new Color3(
      this.scene.clearColor.r,
      this.scene.clearColor.g,
      this.scene.clearColor.b,
    );
    this.lastSky.copyFrom(top);
    this.lastHorizon.copyFrom(this.scene.fogColor);
    return skyReflectionData(top, this.scene.fogColor);
  }

  private configure(quality: string) {
    this.quality = quality;
    const budget = renderBudget(quality),
      size = budget.shadowMapSize;
    if (this.shadow.mapSize !== size) this.shadow.mapSize = size;
    this.bindShadowMap();
    this.stats.shadowMapSize = size;
    this.shadow.filteringQuality =
      quality === "high"
        ? ShadowGenerator.QUALITY_MEDIUM
        : ShadowGenerator.QUALITY_LOW;
    if (!budget.postProcesses) {
      this.pipeline?.dispose();
      this.pipeline = undefined;
    } else if (!this.pipeline) {
      this.pipeline = new DefaultRenderingPipeline(
        "cinematic campus",
        true,
        this.scene,
        [this.camera],
      );
      this.pipeline.imageProcessingEnabled = false;
      this.pipeline.fxaaEnabled = true;
      this.pipeline.bloomEnabled = true;
      this.pipeline.bloomScale = 0.5;
      this.pipeline.bloomKernel = 32;
      this.pipeline.bloomThreshold = 0.96;
      this.pipeline.bloomWeight = 0.1;
    }
    this.scene.imageProcessingConfiguration.applyByPostProcess = false;
  }

  private configureGlass() {
    for (const material of this.pendingGlass) {
      this.stats.glassVisits++;
      if (
        !(material instanceof StandardMaterial) ||
        !isCampusWindow(material) ||
        this.glass.has(material)
      )
        continue;
      // Sky reflection is strongest at grazing angles. Opacity Fresnel adds only
      // at the edges, keeping the outward view through clear B6 panes usable.
      applyWindowSkyReflection(material, this.environment);
      // Keep alpha, diffuse blinds/curtains and the independently controlled warm
      // emissive occupancy mask exactly as the architecture producer authored.
      this.glass.add(material);
    }
    this.pendingGlass.clear();
    this.stats.glassMaterials = this.glass.size;
  }

  private releaseShadowWrapper(material: Material) {
    if (!(material instanceof ShaderMaterial)) return;
    const wrapper = this.wrappers.get(material);
    if (!wrapper) return;
    if (material.shadowDepthWrapper === wrapper)
      material.shadowDepthWrapper = null;
    wrapper.dispose();
    this.wrappers.delete(material);
  }

  private selectCasters(input: AtmosphereInput) {
    const map = this.shadow.getShadowMap();
    if (!map) return;
    const avatarMeshes = new Set<AbstractMesh>();
    const ownMeshes = new Set<AbstractMesh>();
    for (const avatar of input.avatars ?? []) {
      for (const mesh of avatar.root.getChildMeshes()) {
        avatarMeshes.add(mesh);
        if (
          avatar.target.id === input.localId &&
          !avatar.target.vehicle &&
          avatar.root.isEnabled()
        )
          ownMeshes.add(mesh);
      }
    }
    const casters: AbstractMesh[] = [];
    for (const mesh of this.scene.meshes) {
      this.stats.selectionMeshVisits++;
      if (mesh.isDisposed()) continue;
      mesh.receiveShadows = mesh.metadata?.receiveShadows !== false;
      if (avatarMeshes.has(mesh) && !ownMeshes.has(mesh)) continue;
      // Retain inactive LODs as candidates: a tree/car/avatar can become enabled
      // between the 0.4s broad-phase updates. The draw-time filter tests its
      // current state, never submitting hidden LODs or delaying a new one.
      mesh.computeWorldMatrix();
      const kind = casterKind(mesh, false);
      if (!kind) continue;
      if (kind === "alpha-test") {
        // Wind-deformed alpha geometry uses exactly its visible vertex shader
        // and leaf discard. It never casts the silhouette of a solid leaf card.
        if (input.quality === "low") continue;
      }
      const b = mesh.getBoundingInfo().boundingBox,
        min = b.minimumWorld,
        max = b.maximumWorld;
      const distance = Math.hypot(
        Math.max(min.x - input.player.x, 0, input.player.x - max.x),
        Math.max(min.z - input.player.z, 0, input.player.z - max.z),
      );
      if (distance > 85) continue;
      casters.push(mesh);
    }
    map.renderList = casters;
    this.stats.shadowCandidates = casters.length;
  }

  update(input: AtmosphereInput) {
    if (this.disposed || this.scene.isDisposed) return;
    const dt = Math.max(
      0,
      Math.min(0.1, Number.isFinite(input.dt) ? input.dt : 0),
    );
    const qualityChanged = input.quality !== this.quality;
    if (qualityChanged) this.configure(input.quality);
    const daylight = clamp(input.daylight);
    applyCampusSkyIntensity(this.scene, daylight);
    const source =
      input.keySource ??
      (solarShadowsEnabled(daylight, this.sun.direction.y, this.sun.intensity)
        ? "sun"
        : "none");
    const response = campusShadowResponse(
      source,
      this.sun.direction.y,
      this.sun.intensity,
      input.cloud,
      input.rain,
    );
    this.shadow.setDarkness(response.darkness);
    const shadows = response.enabled && this.sun.isEnabled();
    const shadowsStarted =
      shadows && (!this.shadowsEnabled || this.shadowSource !== source);
    this.shadowsEnabled = shadows;
    this.shadowSource = shadows ? source : "none";
    this.stats.shadowSource = this.shadowSource;
    this.stats.shadowStrength = shadows ? response.strength : 0;
    this.stats.shadowDarkness = response.darkness;
    this.sun.shadowEnabled = shadows;
    if (shadows) {
      const { focus, direction } = writeSnappedShadowFocus(
        input.player,
        this.sun.direction,
        this.shadow.mapSize,
        this.shadowFocus,
      );
      this.sun.position.set(
        focus.x - direction.x * 80,
        focus.y - direction.y * 80,
        focus.z - direction.z * 80,
      );
    } else {
      this.stats.shadowCasters = this.stats.alphaCasters = 0;
    }
    if (this.pipeline) {
      const bloom = campusBloomResponse(daylight, input.rain);
      this.pipeline.bloomThreshold = bloom.threshold;
      this.pipeline.bloomWeight = bloom.weight;
      this.stats.bloomThreshold = bloom.threshold;
      this.stats.bloomWeight = bloom.weight;
    } else this.stats.bloomThreshold = this.stats.bloomWeight = 0;
    this.timer += dt;
    if (this.timer > 0.4 || qualityChanged || shadowsStarted) {
      this.timer = 0;
      this.configureGlass();
      if (shadows) this.selectCasters(input);
    }
    this.environmentTimer += dt;
    const top = this.scene.clearColor;
    const delta = Math.max(
      Math.abs(this.lastSky.r - top.r),
      Math.abs(this.lastSky.g - top.g),
      Math.abs(this.lastSky.b - top.b),
      Math.abs(this.lastHorizon.r - this.scene.fogColor.r),
      Math.abs(this.lastHorizon.g - this.scene.fogColor.g),
      Math.abs(this.lastHorizon.b - this.scene.fogColor.b),
    );
    // A preview/time change must not leave a daytime IBL cube on a night scene
    // for two seconds. Ordinary slow celestial motion keeps the cheap cadence.
    if ((this.environmentTimer >= 2 || delta > 0.08) && delta > 0.002) {
      this.environmentTimer = 0;
      const sky = this.reflectionData();
      this.environment.update(
        sky.faces,
        Constants.TEXTUREFORMAT_RGBA,
        Constants.TEXTURETYPE_UNSIGNED_BYTE,
        false,
      );
      this.environment.sphericalPolynomial = sky.polynomial;
      this.stats.skyUpdates++;
    }
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.scene.onNewMaterialAddedObservable.remove(this.addedMaterial);
    this.scene.onMaterialRemovedObservable.remove(this.removedMaterial);
    this.pendingGlass.clear();
    this.pipeline?.dispose();
    this.shadow.dispose();
    for (const material of this.wrappers.keys())
      this.releaseShadowWrapper(material);
    for (const material of this.glass)
      if (material.reflectionTexture === this.environment) {
        material.reflectionTexture = null;
        material.reflectionFresnelParameters.isEnabled = false;
        if (material.opacityFresnelParameters)
          material.opacityFresnelParameters.isEnabled = false;
      }
    this.glass.clear();
    this.sun.shadowEnabled = false;
    if (this.scene.environmentTexture === this.environment)
      this.scene.environmentTexture = null;
    this.environment.dispose();
  }
}
