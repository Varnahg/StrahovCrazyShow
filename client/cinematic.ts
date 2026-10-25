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
import type { Scene } from "@babylonjs/core/scene";
import type { BaseTexture } from "@babylonjs/core/Materials/Textures/baseTexture";
import type { Camera } from "@babylonjs/core/Cameras/camera";
import type { PostProcess } from "@babylonjs/core/PostProcesses/postProcess";
import type { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import type { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import type { Vec3 } from "../shared/types";
import { renderBudget } from "../shared/render-quality";
import {
  configureCampusGrade,
  campusExposure,
  installCampusBloomExtraction,
} from "./cinematic-art";
import { installStaticSubmeshShadowCull } from "./static-submesh-shadows";
import { SkyReflectionSampler } from "./sky-reflection";
export { skyReflectionData } from "./sky-reflection";

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
  cloudOcclusionApplied = false,
) {
  const lunar = source === "moon";
  const elevation = smooth(0.006, 0.065, -directionY);
  const direct = smooth(lunar ? 0.001 : 0.008, lunar ? 0.012 : 0.16, intensity);
  // The live key already contains the visible cloud-mask transmission. Other
  // callers retain the coverage fallback; keySource alone cannot imply this.
  const cloudContrast = cloudOcclusionApplied ? 1 : 1 - smooth(0.2, 1, cloud);
  const weather = cloudContrast * (1 - clamp(rain / 8) * 0.35);
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

type WindowSkyReflectionOwnership = {
  reflection?: FresnelParameters;
  opacity?: FresnelParameters;
};

function configureWindowSkyReflection(
  material: StandardMaterial,
  environment: BaseTexture,
): WindowSkyReflectionOwnership | undefined {
  if (!isCampusWindow(material)) return;
  material.reflectionTexture = environment;
  const reflection = new FresnelParameters({
    leftColor: new Color3(0.68, 0.7, 0.72),
    rightColor: new Color3(0.04, 0.04, 0.04),
    power: 5,
    bias: 0,
  });
  material.reflectionFresnelParameters = reflection;
  // Exterior-only windows keep their opaque authored room mask. Reflection
  // adds no transparent pass or view into buildings without an interior.
  let opacity: FresnelParameters | undefined;
  if (material.metadata.block === 6) {
    opacity = new FresnelParameters({
      leftColor: new Color3(0.45, 0.45, 0.45),
      rightColor: Color3.Black(),
      power: 5,
      bias: 0,
    });
    material.opacityFresnelParameters = opacity;
  }
  material.roughness = material.metadata.windowStyle === "clear" ? 0.04 : 0.1;
  if (material.metadata.nightWindows && material.emissiveTexture)
    material.useEmissiveAsIllumination = true;
  // Babylon's equality setter can retain an equivalent pre-existing object.
  // Only the exact newly accepted reference belongs to this configuration.
  return {
    reflection:
      material.reflectionFresnelParameters === reflection
        ? reflection
        : undefined,
    opacity:
      material.opacityFresnelParameters === opacity ? opacity : undefined,
  };
}

export function applyWindowSkyReflection(
  material: StandardMaterial,
  environment: BaseTexture,
) {
  return configureWindowSkyReflection(material, environment) !== undefined;
}

function releaseWindowSkyReflection(
  material: StandardMaterial,
  environment: BaseTexture,
  ownership: WindowSkyReflectionOwnership,
) {
  // A replacement texture transfers the reflection setup to its external owner.
  if (material.reflectionTexture !== environment) return;
  material.reflectionTexture = null;
  let detached = false;
  if (
    ownership.reflection &&
    material.reflectionFresnelParameters === ownership.reflection
  ) {
    // The 9.30 accessor is typed nonnullable, but its runtime supports null.
    // Mutating isEnabled (even through a disabled constructor) dirties every
    // material in every engine and changes any external user of the object.
    material.reflectionFresnelParameters = null!;
    detached = true;
  }
  if (
    ownership.opacity &&
    material.opacityFresnelParameters === ownership.opacity
  ) {
    material.opacityFresnelParameters = null!;
    detached = true;
  }
  // StandardMaterial 9.30 leaves old Fresnel defines after the last null detach.
  // Reset this material's wrappers once, also for frozen live-scene materials.
  if (detached) material.resetDrawCache();
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
  /** True only when direct-light intensity already includes the current
   * visible cloud mask. Omission preserves the coverage-based fallback. */
  cloudOcclusionApplied?: boolean;
  /** Precipitation in mm/h, as reported by the shared weather state. */
  rain?: number;
  avatars?: Iterable<{
    root: TransformNode;
    target: { id: string; vehicle: boolean };
  }>;
  localId?: string;
};

export type BloomDiagnostics = {
  status: "captured" | "incomplete" | "timeout" | "disposed" | "no-pipeline";
  backend: "webgl" | "webgpu";
  startedAt: number;
  frameId: number | null;
  renderSize: { width: number; height: number };
  sceneSource?: Record<string, unknown>;
  passes: {
    name: string;
    before?: Record<string, unknown>;
    after?: Record<string, unknown>;
  }[];
};

/** Only reads the already bound READ framebuffer. Restrict formats/types and
 * pack state before touching readPixels; no temporary GL bindings or errors
 * are used to probe driver support. Explicit QA only, never a render update. */
export function readBoundBloomPixels(
  gl: WebGL2RenderingContext,
  width: number,
  height: number,
) {
  const format = gl.getParameter(gl.IMPLEMENTATION_COLOR_READ_FORMAT) as number;
  const type = gl.getParameter(gl.IMPLEMENTATION_COLOR_READ_TYPE) as number;
  const result: {
    format: number;
    type: number;
    skipped?: string;
    samples: { uv: number[]; xy: number[]; rgba: (number | string)[] }[];
  } = { format, type, samples: [] };
  if (
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width < 1 ||
    height < 1
  ) {
    result.skipped = "no positive target dimensions";
    return result;
  }
  if (
    gl.getParameter(gl.READ_FRAMEBUFFER_BINDING) !==
    gl.getParameter(gl.DRAW_FRAMEBUFFER_BINDING)
  ) {
    result.skipped =
      "READ and DRAW framebuffer differ; no binding changes permitted";
    return result;
  }
  if (
    gl.checkFramebufferStatus(gl.READ_FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE
  ) {
    result.skipped = "READ framebuffer incomplete";
    return result;
  }
  if (
    gl.getParameter(gl.READ_FRAMEBUFFER_BINDING) !== null &&
    gl.getParameter(gl.SAMPLES) > 0
  ) {
    result.skipped =
      "multisampled offscreen READ framebuffer requires resolve; no state changes permitted";
    return result;
  }
  if (
    gl.getParameter(gl.PIXEL_PACK_BUFFER_BINDING) !== null ||
    gl.getParameter(gl.PACK_ROW_LENGTH) !== 0 ||
    gl.getParameter(gl.PACK_SKIP_PIXELS) !== 0 ||
    gl.getParameter(gl.PACK_SKIP_ROWS) !== 0
  ) {
    result.skipped = "non-default pack/PBO state; no state changes permitted";
    return result;
  }
  if (
    format !== gl.RGBA ||
    (type !== gl.UNSIGNED_BYTE && type !== gl.FLOAT && type !== gl.HALF_FLOAT)
  ) {
    result.skipped =
      "implementation read format/type outside verified RGBA byte/float/half-float set";
    return result;
  }
  const pixels =
    type === gl.FLOAT
      ? new Float32Array(4)
      : type === gl.HALF_FLOAT
        ? new Uint16Array(4)
        : new Uint8Array(4);
  const decode = (value: number) => {
    if (type === gl.UNSIGNED_BYTE) return value / 255;
    if (type === gl.FLOAT) return value;
    const sign = value & 0x8000 ? -1 : 1,
      exponent = (value >> 10) & 31,
      mantissa = value & 1023;
    return exponent === 31
      ? mantissa
        ? NaN
        : sign * Infinity
      : exponent === 0
        ? sign * 2 ** -14 * (mantissa / 1024)
        : sign * 2 ** (exponent - 15) * (1 + mantissa / 1024);
  };
  for (const v of [0.9, 0.7, 0.5])
    for (const u of [0.1, 0.3, 0.5, 0.7, 0.9]) {
      const x = Math.min(width - 1, Math.floor(width * u)),
        y = Math.min(height - 1, Math.floor(height * v));
      gl.readPixels(x, y, 1, 1, format, type, pixels);
      result.samples.push({
        uv: [u, v],
        xy: [x, y],
        rgba: Array.from(pixels, (value) => {
          const decoded = decode(value);
          return Number.isFinite(decoded) ? decoded : String(decoded);
        }),
      });
    }
  return result;
}

/** Read-only pin-9.30 diagnostics. Opaque GL handles become capture-local IDs;
 * no activeTexture/bindFramebuffer/viewport calls and no retained GPU objects. */
function readPostProcessDiagnostics(
  post: PostProcess,
  scene: Scene,
  identify: (value: object | null | undefined) => string | null,
) {
  const engine = scene.getEngine();
  const internals = engine as unknown as {
    _gl?: WebGL2RenderingContext;
    _currentRenderTarget?: DiagnosticTarget;
    _boundTexturesCache?: Record<number, DiagnosticTexture | null>;
  };
  type DiagnosticTexture = {
    uniqueId?: number;
    label?: string;
    width?: number;
    height?: number;
    type?: number;
    getEngine?: () => unknown;
  };
  type DiagnosticTarget = {
    width?: number;
    height?: number;
    _engine?: unknown;
    _framebuffer?: object;
    _MSAAFramebuffer?: object;
    texture?: DiagnosticTexture;
  };
  const internalPost = post as unknown as {
    _options: number | { width?: number; height?: number };
    _scaleRatio?: { x: number; y: number };
    _outputTexture?: DiagnosticTarget;
  };
  const texture = (value?: DiagnosticTexture | null) =>
    value
      ? {
          id: value.uniqueId ?? null,
          label: value.label ?? null,
          width: value.width ?? null,
          height: value.height ?? null,
          type: value.type ?? null,
          ownerEngine: value.getEngine?.() === engine,
        }
      : null;
  const target = (value?: DiagnosticTarget | null) =>
    value
      ? {
          width: value.width ?? null,
          height: value.height ?? null,
          ownerEngine: value._engine === engine,
          framebuffer: identify(value._framebuffer),
          msaaFramebuffer: identify(value._MSAAFramebuffer),
          texture: texture(value.texture),
        }
      : null;
  const effect = post.getEffect();
  const expectedProgram = (
    effect?.getPipelineContext() as unknown as { program?: WebGLProgram } | null
  )?.program;
  const vertex = effect?.vertexSourceCode ?? "";
  const result: Record<string, unknown> = {
    width: post.width,
    height: post.height,
    options:
      typeof internalPost._options === "number"
        ? internalPost._options
        : { ...internalPost._options },
    scaleRatio: internalPost._scaleRatio
      ? [internalPost._scaleRatio.x, internalPost._scaleRatio.y]
      : null,
    enablePixelPerfectMode: post.enablePixelPerfectMode,
    forceFullscreenViewport: post.forceFullscreenViewport,
    adaptScaleToCurrentViewport: post.adaptScaleToCurrentViewport,
    alwaysForcePOT: post.alwaysForcePOT,
    autoClear: post.autoClear,
    alphaMode: post.alphaMode,
    externalTextureSamplerBinding: post.externalTextureSamplerBinding,
    input: target(post.inputTexture as unknown as DiagnosticTarget),
    output: target(internalPost._outputTexture),
    engineTarget: target(internals._currentRenderTarget),
    effectId: effect?.uniqueId ?? null,
    expectedProgram: identify(expectedProgram),
    vertexShader: { length: vertex.length, tail: vertex.slice(-8192) },
  };
  const gl = internals._gl;
  if (!gl || engine.isWebGPU) return result;
  try {
    const program = gl.getParameter(gl.CURRENT_PROGRAM) as WebGLProgram | null;
    result.gl = {
      viewport: Array.from(gl.getParameter(gl.VIEWPORT) as Int32Array),
      scissorEnabled: gl.getParameter(gl.SCISSOR_TEST) as boolean,
      scissorBox: Array.from(gl.getParameter(gl.SCISSOR_BOX) as Int32Array),
      framebuffer: identify(gl.getParameter(gl.FRAMEBUFFER_BINDING)),
      program: identify(program),
      matchesExpectedProgram: program === expectedProgram,
      activeTexture: gl.getParameter(gl.ACTIVE_TEXTURE) as number,
      activeTexture2D: identify(gl.getParameter(gl.TEXTURE_BINDING_2D)),
      depthTest: gl.getParameter(gl.DEPTH_TEST),
      stencilTest: gl.getParameter(gl.STENCIL_TEST),
      colorWriteMask: Array.from(
        gl.getParameter(gl.COLOR_WRITEMASK) as boolean[],
      ),
      blendEnabled: gl.getParameter(gl.BLEND),
      blendSrcRgb: gl.getParameter(gl.BLEND_SRC_RGB),
      blendDstRgb: gl.getParameter(gl.BLEND_DST_RGB),
      blendSrcAlpha: gl.getParameter(gl.BLEND_SRC_ALPHA),
      blendDstAlpha: gl.getParameter(gl.BLEND_DST_ALPHA),
      blendEquationRgb: gl.getParameter(gl.BLEND_EQUATION_RGB),
      blendEquationAlpha: gl.getParameter(gl.BLEND_EQUATION_ALPHA),
    };
    const scale = effect?.getUniform("scale");
    result.boundScale =
      program && program === expectedProgram && scale
        ? Array.from(gl.getUniform(program, scale) as Float32Array)
        : null;
    result.boundUniforms = Object.fromEntries(
      ["delta", "threshold", "exposure", "bloomWeight"].map((name) => {
        const location = effect?.getUniform(name);
        const value =
          program && program === expectedProgram && location
            ? gl.getUniform(program, location)
            : null;
        return [
          name,
          ArrayBuffer.isView(value)
            ? Array.from(value as unknown as ArrayLike<number>)
            : value,
        ];
      }),
    );
    result.samplers =
      effect
        ?.getSamplers()
        .slice(0, 8)
        .map((name) => {
          const location = effect.getUniform(name);
          const unit =
            program && program === expectedProgram && location
              ? (gl.getUniform(program, location) as number)
              : null;
          return {
            name,
            unit,
            cachedTexture:
              unit === null
                ? null
                : texture(internals._boundTexturesCache?.[unit]),
          };
        }) ?? [];
    const position = effect?.getAttributeLocationByName("position") ?? -1;
    result.positionAttribute =
      position < 0
        ? null
        : {
            location: position,
            buffer: identify(
              gl.getVertexAttrib(
                position,
                gl.VERTEX_ATTRIB_ARRAY_BUFFER_BINDING,
              ),
            ),
            size: gl.getVertexAttrib(position, gl.VERTEX_ATTRIB_ARRAY_SIZE),
            stride: gl.getVertexAttrib(position, gl.VERTEX_ATTRIB_ARRAY_STRIDE),
            offset: gl.getVertexAttribOffset(
              position,
              gl.VERTEX_ATTRIB_ARRAY_POINTER,
            ),
            divisor: gl.getVertexAttrib(
              position,
              gl.VERTEX_ATTRIB_ARRAY_DIVISOR,
            ),
          };
    const quad = (
      scene.postProcessManager as unknown as {
        _vertexBuffers: Record<
          string,
          {
            getData(): ArrayLike<number> | null;
            getBuffer(): { underlyingResource?: object } | null;
          }
        >;
      }
    )._vertexBuffers?.position;
    const cpuData = quad?.getData();
    const arrayBuffer = gl.getParameter(
      gl.ARRAY_BUFFER_BINDING,
    ) as WebGLBuffer | null;
    const positionBuffer =
      position < 0
        ? null
        : (gl.getVertexAttrib(
            position,
            gl.VERTEX_ATTRIB_ARRAY_BUFFER_BINDING,
          ) as WebGLBuffer | null);
    const vertexRead: Record<string, unknown> = {
      expectedCpu: cpuData
        ? Array.from(
            { length: Math.min(8, cpuData.length) },
            (_, index) => cpuData[index],
          )
        : null,
      expectedBuffer: identify(quad?.getBuffer()?.underlyingResource),
      arrayBuffer: identify(arrayBuffer),
      positionBuffer: identify(positionBuffer),
    };
    if (
      arrayBuffer &&
      arrayBuffer === positionBuffer &&
      gl.getBufferParameter(gl.ARRAY_BUFFER, gl.BUFFER_SIZE) >= 32
    ) {
      const data = new Float32Array(8);
      gl.getBufferSubData(gl.ARRAY_BUFFER, 0, data);
      vertexRead.actualGpu = Array.from(data);
    } else
      vertexRead.skipped =
        "current ARRAY_BUFFER is not the position buffer or has fewer than 32 bytes";
    result.quad = vertexRead;
    const output = internalPost._outputTexture;
    result.pixels = readBoundBloomPixels(
      gl,
      output?.width ?? engine.getRenderWidth(true),
      output?.height ?? engine.getRenderHeight(true),
    );
  } catch (error) {
    result.readError = String(error).slice(0, 240);
  }
  return result;
}

/** Real cast shadows, restrained highlights and reflection of the current sky.
 * It does not move astronomical bodies or simulate weather independently. */
export class CinematicAtmosphere {
  private pipeline?: DefaultRenderingPipeline;
  private diagnosticBloom: boolean | undefined;
  private diagnosticCapture?: Promise<BloomDiagnostics>;
  private cancelDiagnosticCapture?: () => void;
  /** Ephemeral loopback QA control. It never changes saved quality preferences. */
  setDiagnosticBloom(enabled: boolean) {
    this.diagnosticBloom = enabled;
    if (this.pipeline) this.pipeline.bloomEnabled = enabled;
  }
  /** Explicit loopback QA action: observe one naturally rendered frame, then
   * detach every observer. Never submits/skips a frame or modifies GL state. */
  captureDiagnostics(
    options: { timeoutMs?: number } = {},
  ): Promise<BloomDiagnostics> {
    if (this.diagnosticCapture) return this.diagnosticCapture;
    const engine = this.scene.getEngine();
    const posts = this.camera._postProcesses
      .filter((post): post is PostProcess => post !== null)
      .slice(0, 8);
    const report: BloomDiagnostics = {
      status:
        this.disposed || this.scene.isDisposed ? "disposed" : "no-pipeline",
      backend: engine.isWebGPU ? "webgpu" : "webgl",
      startedAt: Date.now(),
      frameId: null,
      renderSize: {
        width: engine.getRenderWidth(),
        height: engine.getRenderHeight(),
      },
      passes: posts.map((post) => ({ name: post.name })),
    };
    if (report.status === "disposed" || !posts.length)
      return Promise.resolve(report);
    const handles = new WeakMap<object, string>();
    let handleCount = 0;
    const identify = (value: object | null | undefined) => {
      if (!value) return null;
      let id = handles.get(value);
      if (!id) {
        id = `handle-${++handleCount}`;
        handles.set(value, id);
      }
      return id;
    };
    let finish!: (status: BloomDiagnostics["status"]) => void;
    const capture = new Promise<BloomDiagnostics>((resolve) => {
      const cleanup: (() => void)[] = [];
      let active = false,
        completed = false;
      finish = (status) => {
        if (completed) return;
        completed = true;
        for (const remove of cleanup) remove();
        report.status = status;
        resolve(report);
      };
      const beforeScene = this.scene.onBeforeRenderObservable.add(() => {
        if (active) return;
        active = true;
        report.frameId = this.scene.getFrameId();
      });
      cleanup.push(() =>
        this.scene.onBeforeRenderObservable.remove(beforeScene),
      );
      const sceneSource = this.scene.onAfterDrawPhaseObservable.add(() => {
        if (
          !active ||
          report.sceneSource ||
          this.scene.activeCamera !== this.camera
        )
          return;
        try {
          const sourceEngine = engine as unknown as {
            _gl?: WebGL2RenderingContext;
            _currentRenderTarget?: {
              width: number;
              height: number;
              _engine?: unknown;
              texture?: { uniqueId: number };
            };
          };
          const gl = sourceEngine._gl,
            target = sourceEngine._currentRenderTarget;
          const width = target?.width ?? engine.getRenderWidth(true),
            height = target?.height ?? engine.getRenderHeight(true);
          report.sceneSource = {
            width,
            height,
            ownerEngine: target?._engine === engine,
            textureId: target?.texture?.uniqueId ?? null,
            matchesFirstInput:
              !!target && (target as unknown) === posts[0].inputTexture,
            framebuffer: gl
              ? identify(gl.getParameter(gl.FRAMEBUFFER_BINDING))
              : null,
            pixels:
              gl && !engine.isWebGPU
                ? readBoundBloomPixels(gl, width, height)
                : { skipped: "WebGPU readback is not part of this diagnostic" },
          };
        } catch (error) {
          report.sceneSource = { readError: String(error).slice(0, 240) };
        }
      });
      cleanup.push(() =>
        this.scene.onAfterDrawPhaseObservable.remove(sceneSource),
      );
      posts.forEach((post, index) => {
        const capturePass = (phase: "before" | "after") => {
          if (!active || report.passes[index][phase]) return;
          try {
            report.passes[index][phase] = readPostProcessDiagnostics(
              post,
              this.scene,
              identify,
            );
          } catch (error) {
            report.passes[index][phase] = {
              readError: String(error).slice(0, 240),
            };
          }
        };
        const before = post.onBeforeRenderObservable.add(() => {
          capturePass("before");
        });
        const after = post.onAfterRenderObservable.add(() => {
          capturePass("after");
        });
        cleanup.push(() => {
          post.onBeforeRenderObservable.remove(before);
          post.onAfterRenderObservable.remove(after);
        });
      });
      const afterScene = this.scene.onAfterRenderObservable.add(() => {
        if (active)
          finish(
            report.sceneSource &&
              !report.sceneSource.readError &&
              report.passes.every(
                (pass) =>
                  pass.before &&
                  pass.after &&
                  !pass.before.readError &&
                  !pass.after.readError,
              )
              ? "captured"
              : "incomplete",
          );
      });
      cleanup.push(() => this.scene.onAfterRenderObservable.remove(afterScene));
      const disposed = this.scene.onDisposeObservable.add(() =>
        finish("disposed"),
      );
      cleanup.push(() => this.scene.onDisposeObservable.remove(disposed));
      const timeoutMs = Number.isFinite(options.timeoutMs)
        ? Math.max(1, Math.min(5000, options.timeoutMs!))
        : 2500;
      const timer = setTimeout(() => finish("timeout"), timeoutMs);
      cleanup.push(() => clearTimeout(timer));
    });
    this.cancelDiagnosticCapture = () => finish("disposed");
    this.diagnosticCapture = capture;
    void capture.then(() => {
      if (this.diagnosticCapture === capture) {
        this.diagnosticCapture = undefined;
        this.cancelDiagnosticCapture = undefined;
      }
    });
    return capture;
  }
  private shadow: ShadowGenerator;
  private environment: RawCubeTexture;
  private readonly reflection = new SkyReflectionSampler();
  private quality = "";
  private timer = 1;
  private environmentTimer = 10;
  private lastSky = new Color3(-1, -1, -1);
  private lastHorizon = new Color3(-1, -1, -1);
  private wrappers = new Map<ShaderMaterial, ShadowDepthWrapper>();
  private readonly glass = new Map<
    StandardMaterial,
    WindowSkyReflectionOwnership
  >();
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
    this.lastSky.set(
      this.scene.clearColor.r,
      this.scene.clearColor.g,
      this.scene.clearColor.b,
    );
    this.lastHorizon.copyFrom(this.scene.fogColor);
    return this.reflection.update(this.lastSky, this.lastHorizon);
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
      // The default pipeline keeps its BloomEffect private. Identify only the
      // extractor newly constructed by this owner in the public engine list.
      const engine = this.scene.getEngine();
      const existingPostProcesses = new Set(engine.postProcesses);
      this.pipeline = new DefaultRenderingPipeline(
        "cinematic campus",
        true,
        this.scene,
        [this.camera],
        false,
      );
      this.pipeline.imageProcessingEnabled = false;
      // A recreated Babylon 9.30 pipeline initially assumes image processing
      // is enabled, even if the previous one already disabled scene config.
      // In that case the setter has no notification; synchronize its public
      // configuration observable before preparing the chain (no extra build).
      const imageProcessing = this.scene.imageProcessingConfiguration;
      if (this.pipeline.imageProcessingEnabled !== imageProcessing.isEnabled)
        imageProcessing.onUpdateParameters.notifyObservers(imageProcessing);
      this.pipeline.fxaaEnabled = true;
      this.pipeline.bloomEnabled = true;
      this.pipeline.bloomScale = 0.5;
      this.pipeline.bloomKernel = 32;
      this.pipeline.bloomThreshold = 0.96;
      this.pipeline.bloomWeight = 0.1;
      const extractors = engine.postProcesses.filter(post =>
        !existingPostProcesses.has(post) && post.getEffectName() === "extractHighlights");
      if (extractors.length !== 1)
        throw new Error("Expected one owned Babylon 9.30 bloom extractor before preparation.");
      installCampusBloomExtraction(extractors[0]);
      // Compile/attach the final chain once, rather than rebuilding for each
      // option above. Retain automatic updates after this initial transaction.
      this.pipeline.prepare();
      this.pipeline.automaticBuild = true;
    }
    this.scene.imageProcessingConfiguration.applyByPostProcess = false;
  }

  private configureGlass() {
    for (const material of this.pendingGlass) {
      this.stats.glassVisits++;
      if (!(material instanceof StandardMaterial) || this.glass.has(material))
        continue;
      // Sky reflection is strongest at grazing angles. Opacity Fresnel adds only
      // at the edges, keeping the outward view through clear B6 panes usable.
      const ownership = configureWindowSkyReflection(
        material,
        this.environment,
      );
      // Keep alpha, diffuse blinds/curtains and the independently controlled warm
      // emissive occupancy mask exactly as the architecture producer authored.
      if (ownership) this.glass.set(material, ownership);
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
      input.cloudOcclusionApplied,
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
      if (
        this.diagnosticBloom !== undefined &&
        this.pipeline.bloomEnabled !== this.diagnosticBloom
      )
        this.pipeline.bloomEnabled = this.diagnosticBloom;
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
    this.cancelDiagnosticCapture?.();
    this.scene.onNewMaterialAddedObservable.remove(this.addedMaterial);
    this.scene.onMaterialRemovedObservable.remove(this.removedMaterial);
    this.pendingGlass.clear();
    this.pipeline?.dispose();
    this.shadow.dispose();
    for (const material of this.wrappers.keys())
      this.releaseShadowWrapper(material);
    for (const [material, ownership] of this.glass)
      releaseWindowSkyReflection(material, this.environment, ownership);
    this.glass.clear();
    this.sun.shadowEnabled = false;
    if (this.scene.environmentTexture === this.environment)
      this.scene.environmentTexture = null;
    this.environment.dispose();
  }
}
