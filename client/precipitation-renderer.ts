import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { VertexBuffer } from "@babylonjs/core/Buffers/buffer";
import { BoundingInfo } from "@babylonjs/core/Culling/boundingInfo";
import { ShaderMaterial } from "@babylonjs/core/Materials/shaderMaterial";
import { ShaderLanguage } from "@babylonjs/core/Materials/shaderLanguage";
import { Constants } from "@babylonjs/core/Engines/constants";
import {
  Vector2,
  Vector3,
  type Matrix,
} from "@babylonjs/core/Maths/math.vector";
import type { Scene } from "@babylonjs/core/scene";
import type { Observer } from "@babylonjs/core/Misc/observable";
import type { Vec3 } from "../shared/types";
import type { RenderQuality } from "../shared/render-quality";
import type { Weather } from "../shared/weather";
import { precipitationAppearance } from "./weather-particles";

/** Candidate visual budgets, not measured device limits or particle observations. */
export const PRECIPITATION_BUDGET = Object.freeze({
  low: 384,
  medium: 1024,
  high: 2048,
});
const CAPACITY = PRECIPITATION_BUDGET.high;
const RADIUS = 10,
  BOTTOM = -2,
  TOP = 10,
  HEIGHT = TOP - BOTTOM;
// All flutter/rotation frequencies are multiples of .05, so this wrap is continuous.
const MOTION_PERIOD = Math.PI * 40;
const MIN_CLIP_W = 0.05,
  MAX_PROJECTED_FLOW = 10000,
  MAX_STREAK_EXTENT = 0.75;
const finite = (n: number | undefined, fallback = 0) =>
  Number.isFinite(n) ? n! : fallback;
const clamp = (n: number, low = 0, high = 1) =>
  Math.min(high, Math.max(low, finite(n)));
const wrap = (n: number, low: number, size: number) =>
  ((((n - low) % size) + size) % size) + low;
type PrecipitationWeather = Parameters<typeof precipitationAppearance>[0] &
  Pick<Partial<Weather>, "visibility">;

export type PrecipitationFrame = Readonly<{
  dt: number;
  weather?: PrecipitationWeather;
  /** Already converted from meteorological FROM into world metres/second. */
  wind: Readonly<{ x: number; z: number }>;
  position: Readonly<Vec3>;
  quality: RenderQuality;
  illumination: number;
  /** The caller owns indoor/cover classification. Depth testing is not roof collision. */
  outside: boolean;
}>;

/** Reference of the shader's quotient derivative, returned in billboard view
 * units. Tests compare it with Babylon matrix projection of moving world points.
 * Ordinary perspective reduces to v.xy - center.xy * v.z / center.z. */
export function projectedPrecipitationVelocityToRef(
  center: Readonly<Vec3>,
  velocity: Readonly<Vec3>,
  projection: Matrix,
  out: Vector2,
) {
  out.set(0, 0);
  const m = projection.m;
  const w = center.x * m[3] + center.y * m[7] + center.z * m[11] + m[15];
  if (!(
    w > MIN_CLIP_W &&
    w < 1e6 &&
    Math.abs(m[0]) > 1e-5 &&
    Math.abs(m[0]) < 1e6 &&
    Math.abs(m[5]) > 1e-5 &&
    Math.abs(m[5]) < 1e6
  ))
    return false;
  const x = center.x * m[0] + center.y * m[4] + center.z * m[8] + m[12];
  const y = center.x * m[1] + center.y * m[5] + center.z * m[9] + m[13];
  const vx = velocity.x * m[0] + velocity.y * m[4] + velocity.z * m[8];
  const vy = velocity.x * m[1] + velocity.y * m[5] + velocity.z * m[9];
  const vw = velocity.x * m[3] + velocity.y * m[7] + velocity.z * m[11];
  const fx = (vx - x * (vw / w)) / m[0],
    fy = (vy - y * (vw / w)) / m[5];
  if (!(Math.hypot(fx, fy) < MAX_PROJECTED_FLOW)) return false;
  out.set(fx, fy);
  return true;
}

const glslVertex = `
precision highp float;
attribute vec3 position;
attribute vec2 uv;
attribute vec4 shape;
uniform mat4 worldView;
uniform mat4 view;
uniform mat4 projection;
uniform vec2 wind;
uniform float motionTime;
varying vec2 vCorner;
varying float vKind;
varying float vFade;
varying float vDistance;
void main() {
  vec2 corner = uv * 2.0 - 1.0;
  vec4 center = worldView * vec4(position, 1.0);
  vec4 clipCenter = projection * center;
  float projectionFade = clipCenter.w > ${MIN_CLIP_W} && clipCenter.w < 1000000.0 ? 1.0 : 0.0;
  vec2 offset = corner * shape.xy;
  if (shape.z == 1.0) {
    float phase = motionTime * .35 + shape.x * 991.0 + shape.w;
    offset.x *= .65 + .35 * abs(cos(motionTime * .65 + shape.w * 3.0));
    offset = vec2(offset.x*cos(phase)-offset.y*sin(phase), offset.x*sin(phase)+offset.y*cos(phase));
  } else if (shape.z == 0.0 || shape.z == 3.0) {
    vec3 velocity = vec3(wind.x*.55, -shape.w, wind.y*.55);
    vec4 clipVelocity = projection * (view * vec4(velocity, 0.0));
    vec2 projectionScale = vec2(projection[0][0], projection[1][1]);
    vec2 flow = vec2(0.0);
    if (projectionFade > .5 && all(greaterThan(abs(projectionScale),vec2(.00001))) && all(lessThan(abs(projectionScale),vec2(1000000.0)))) {
      flow = (clipVelocity.xy - clipCenter.xy * (clipVelocity.w / clipCenter.w)) / projectionScale;
    } else { projectionFade = 0.0; }
    float projected = length(flow);
    if (!(projected >= 0.0 && projected < ${MAX_PROJECTED_FLOW}.0)) { flow = vec2(0.0); projected = 0.0; projectionFade = 0.0; }
    vec2 tangent = projected > .0001 ? flow/projected : vec2(0.0, -1.0);
    float extent = min(${MAX_STREAK_EXTENT},max(shape.x, shape.y * projected / max(length(velocity), .0001)));
    offset = vec2(-tangent.y, tangent.x) * corner.x * shape.x + tangent * corner.y * extent;
  }
  float edge = min(min(${RADIUS}.0-abs(position.x), ${RADIUS}.0-abs(position.z)), min(position.y-(${BOTTOM}.0), ${TOP}.0-position.y));
  vDistance = length(center.xyz);
  vFade = projectionFade * smoothstep(0.0, 2.0, edge) * smoothstep(.6, 1.8, vDistance) * (1.0-smoothstep(18.0, 28.0, vDistance));
  vCorner = corner;
  vKind = shape.z;
  center.xy += offset;
  gl_Position = projection * center;
}`;
const glslFragment = `
precision highp float;
uniform float illumination;
uniform float extinction;
varying vec2 vCorner;
varying float vKind;
varying float vFade;
varying float vDistance;
void main() {
  float r2 = dot(vCorner, vCorner);
  float mask;
  float opacity;
  vec3 color;
  if (vKind == 1.0) {
    float contour = r2 + .16 * vCorner.x * (vCorner.x*vCorner.x-3.0*vCorner.y*vCorner.y);
    mask = 1.0-smoothstep(.10, 1.0, contour);
    opacity = .32 + .42*illumination;
    color = mix(vec3(.42,.45,.51), vec3(.96,.97,.99), illumination);
  } else if (vKind == 2.0) {
    mask = 1.0-smoothstep(.40, 1.0, r2);
    opacity = .38 + .42*illumination;
    float sheen = .72 + .28*max(0.0, 1.0-length(vCorner-vec2(-.25,.35)));
    color = mix(vec3(.40,.44,.49), vec3(.88,.94,1.0), illumination)*sheen;
  } else {
    mask = (1.0-smoothstep(.15,1.0,abs(vCorner.x))) * (1.0-smoothstep(.5,1.0,abs(vCorner.y)));
    opacity = .13 + .31*illumination;
    color = mix(vec3(.27,.32,.39), vec3(.65,.76,.87), illumination);
  }
  float alpha = mask * opacity * vFade * exp(-extinction*vDistance);
  if (alpha < .003) discard;
  gl_FragColor = vec4(color, alpha);
}`;
const wgslVertex = `
attribute position: vec3f;
attribute uv: vec2f;
attribute shape: vec4f;
uniform worldView: mat4x4f;
uniform view: mat4x4f;
uniform projection: mat4x4f;
uniform wind: vec2f;
uniform motionTime: f32;
varying vCorner: vec2f;
varying vKind: f32;
varying vFade: f32;
varying vDistance: f32;
@vertex
fn main(input: VertexInputs) -> FragmentInputs {
  let corner = vertexInputs.uv * 2.0 - 1.0;
  let shape = vertexInputs.shape;
  let position = vertexInputs.position;
  var center = uniforms.worldView * vec4f(position, 1.0);
  let clipCenter = uniforms.projection * center;
  var projectionFade = 0.0;
  if (clipCenter.w > ${MIN_CLIP_W} && clipCenter.w < 1000000.0) { projectionFade = 1.0; }
  var offset = corner * shape.xy;
  if (shape.z == 1.0) {
    let phase = uniforms.motionTime * .35 + shape.x * 991.0 + shape.w;
    offset.x *= .65 + .35 * abs(cos(uniforms.motionTime * .65 + shape.w * 3.0));
    offset = vec2f(offset.x*cos(phase)-offset.y*sin(phase), offset.x*sin(phase)+offset.y*cos(phase));
  } else if (shape.z == 0.0 || shape.z == 3.0) {
    let velocity = vec3f(uniforms.wind.x*.55, -shape.w, uniforms.wind.y*.55);
    let clipVelocity = uniforms.projection * (uniforms.view * vec4f(velocity, 0.0));
    let projectionScale = vec2f(uniforms.projection[0][0],uniforms.projection[1][1]);
    var flow = vec2f(0.0);
    if (projectionFade > .5 && all(abs(projectionScale)>vec2f(.00001)) && all(abs(projectionScale)<vec2f(1000000.0))) {
      flow = (clipVelocity.xy - clipCenter.xy * (clipVelocity.w / clipCenter.w)) / projectionScale;
    } else { projectionFade = 0.0; }
    var projected = length(flow);
    if (!(projected >= 0.0 && projected < ${MAX_PROJECTED_FLOW}.0)) { flow = vec2f(0.0); projected = 0.0; projectionFade = 0.0; }
    var tangent = vec2f(0.0,-1.0);
    if (projected > .0001) { tangent = flow/projected; }
    let extent = min(${MAX_STREAK_EXTENT},max(shape.x, shape.y * projected / max(length(velocity), .0001)));
    offset = vec2f(-tangent.y,tangent.x) * corner.x * shape.x + tangent * corner.y * extent;
  }
  let edge = min(min(${RADIUS}.0-abs(position.x), ${RADIUS}.0-abs(position.z)), min(position.y-(${BOTTOM}.0), ${TOP}.0-position.y));
  let distance = length(center.xyz);
  vertexOutputs.vDistance = distance;
  vertexOutputs.vFade = projectionFade * smoothstep(0.0,2.0,edge) * smoothstep(.6,1.8,distance) * (1.0-smoothstep(18.0,28.0,distance));
  vertexOutputs.vCorner = corner;
  vertexOutputs.vKind = shape.z;
  center = vec4f(center.xy + offset, center.zw);
  vertexOutputs.position = uniforms.projection * center;
}`;
const wgslFragment = `
uniform illumination: f32;
uniform extinction: f32;
varying vCorner: vec2f;
varying vKind: f32;
varying vFade: f32;
varying vDistance: f32;
@fragment
fn main(input: FragmentInputs) -> FragmentOutputs {
  let corner = fragmentInputs.vCorner;
  let kind = fragmentInputs.vKind;
  let r2 = dot(corner,corner);
  var mask: f32;
  var opacity: f32;
  var color: vec3f;
  if (kind == 1.0) {
    let contour = r2 + .16*corner.x*(corner.x*corner.x-3.0*corner.y*corner.y);
    mask = 1.0-smoothstep(.10,1.0,contour);
    opacity = .32 + .42*uniforms.illumination;
    color = mix(vec3f(.42,.45,.51),vec3f(.96,.97,.99),uniforms.illumination);
  } else if (kind == 2.0) {
    mask = 1.0-smoothstep(.40,1.0,r2);
    opacity = .38 + .42*uniforms.illumination;
    let sheen = .72 + .28*max(0.0,1.0-length(corner-vec2f(-.25,.35)));
    color = mix(vec3f(.40,.44,.49),vec3f(.88,.94,1.0),uniforms.illumination)*sheen;
  } else {
    mask = (1.0-smoothstep(.15,1.0,abs(corner.x))) * (1.0-smoothstep(.5,1.0,abs(corner.y)));
    opacity = .13 + .31*uniforms.illumination;
    color = mix(vec3f(.27,.32,.39),vec3f(.65,.76,.87),uniforms.illumination);
  }
  let alpha = mask*opacity*fragmentInputs.vFade*exp(-uniforms.extinction*fragmentInputs.vDistance);
  if (alpha < .003) { discard; }
  fragmentOutputs.color = vec4f(color,alpha);
}`;

/** Source strings also permit native interface verification without pretending CPU is GPU. */
export const PRECIPITATION_SHADERS = Object.freeze({
  glsl: Object.freeze({
    vertexSource: glslVertex,
    fragmentSource: glslFragment,
  }),
  wgsl: Object.freeze({
    vertexSource: wgslVertex,
    fragmentSource: wgslFragment,
  }),
});

export class PrecipitationRenderer {
  readonly mesh: Mesh;
  private readonly material: ShaderMaterial;
  private readonly positions = new Float32Array(CAPACITY * 12);
  private readonly shapes = new Float32Array(CAPACITY * 16);
  private readonly seeds = new Float32Array(CAPACITY * 3);
  private readonly wind = new Vector2();
  private readonly sceneDisposal: Observer<Scene>;
  private readonly weather: Parameters<typeof precipitationAppearance>[0] = {
    rain: 0,
  };
  private appearance = precipitationAppearance(this.weather);
  private disposed = false;
  private count = 0;
  private motionTime = 0;

  constructor(private readonly scene: Scene) {
    const uv = new Float32Array(CAPACITY * 8),
      indices = new Uint16Array(CAPACITY * 6);
    let random = 0x51a7c0de;
    const next = () => {
      random = (Math.imul(random, 1664525) + 1013904223) >>> 0;
      return random / 4294967296;
    };
    for (let i = 0; i < CAPACITY; i++) {
      this.seeds[i * 3] = (next() * 2 - 1) * RADIUS;
      this.seeds[i * 3 + 1] = BOTTOM + next() * HEIGHT;
      this.seeds[i * 3 + 2] = (next() * 2 - 1) * RADIUS;
      for (let v = 0; v < 4; v++) {
        uv[i * 8 + v * 2] = v === 1 || v === 2 ? 1 : 0;
        uv[i * 8 + v * 2 + 1] = v >= 2 ? 1 : 0;
      }
      indices.set(
        [i * 4, i * 4 + 1, i * 4 + 2, i * 4, i * 4 + 2, i * 4 + 3],
        i * 6,
      );
      this.writeCenter(
        i,
        this.seeds[i * 3],
        this.seeds[i * 3 + 1],
        this.seeds[i * 3 + 2],
      );
    }
    this.configureShapes();
    const native = scene.getEngine().isWebGPU;
    this.material = new ShaderMaterial(
      "weather:precipitation",
      scene,
      native ? PRECIPITATION_SHADERS.wgsl : PRECIPITATION_SHADERS.glsl,
      {
        shaderLanguage: native ? ShaderLanguage.WGSL : ShaderLanguage.GLSL,
        attributes: ["position", "uv", "shape"],
        uniforms: [
          "worldView",
          "view",
          "projection",
          "wind",
          "motionTime",
          "illumination",
          "extinction",
        ],
        samplers: [],
        needAlphaBlending: true,
      },
    );
    this.material.backFaceCulling = false;
    this.material.disableDepthWrite = true;
    this.material.alphaMode = Constants.ALPHA_COMBINE;
    this.material.fogEnabled = false;
    this.material.setVector2("wind", this.wind);
    this.material
      .setFloat("motionTime", 0)
      .setFloat("illumination", 0)
      .setFloat("extinction", 0);
    this.mesh = new Mesh("weather:precipitation-batch", scene);
    this.mesh.setVerticesData(
      VertexBuffer.PositionKind,
      this.positions,
      true,
      3,
    );
    this.mesh.setVerticesData(VertexBuffer.UVKind, uv, false, 2);
    this.mesh.setVerticesData("shape", this.shapes, true, 4);
    this.mesh.setIndices(indices);
    this.mesh.material = this.material;
    this.mesh.isPickable = false;
    this.mesh.receiveShadows = false;
    this.mesh.renderingGroupId = 0;
    this.mesh.setBoundingInfo(
      new BoundingInfo(
        new Vector3(-RADIUS - 1, BOTTOM - 1, -RADIUS - 1),
        new Vector3(RADIUS + 1, TOP + 1, RADIUS + 1),
      ),
    );
    this.mesh.subMeshes[0].indexCount = 0;
    this.mesh.setEnabled(false);
    this.sceneDisposal = scene.onDisposeObservable.addOnce(() =>
      this.dispose(),
    );
  }

  get activeCount() {
    return this.count;
  }

  /** Poll from the existing startup gate, even at clear weather; no hidden timer or draw. */
  prepare() {
    if (this.disposed) return false;
    const engine = this.scene.getEngine(),
      previousPass = engine.currentRenderPassId;
    engine.currentRenderPassId =
      this.scene.activeCamera?.renderPassId ?? previousPass;
    try {
      // Prepare the actual camera draw wrapper, without Mesh.isReady's unrelated
      // shadow-map loop or Material.forceCompilation's private timer polling.
      return this.material.isReadyForSubMesh(
        this.mesh,
        this.mesh.subMeshes[0],
        false,
      );
    } finally {
      engine.currentRenderPassId = previousPass;
    }
  }

  update(input: PrecipitationFrame) {
    if (this.disposed) return;
    const source = input.weather,
      rain = finite(source?.rain),
      snowfall = finite(source?.snowfall),
      code = Number.isFinite(source?.weatherCode)
        ? source?.weatherCode
        : undefined;
    if (
      rain !== this.weather.rain ||
      snowfall !== this.weather.snowfall ||
      source?.precipitationType !== this.weather.precipitationType ||
      code !== this.weather.weatherCode
    ) {
      this.weather.rain = rain;
      this.weather.snowfall = snowfall;
      this.weather.precipitationType = source?.precipitationType;
      this.weather.weatherCode = code;
      const next = precipitationAppearance(this.weather);
      const changed =
        next.snowFraction !== this.appearance.snowFraction ||
        next.hail !== this.appearance.hail ||
        next.drizzle !== this.appearance.drizzle;
      this.appearance = next;
      if (changed) {
        this.configureShapes();
        this.mesh.getVertexBuffer("shape")!.updateDirectly(this.shapes, 0);
        this.count = 0;
      }
    }
    const { position } = input;
    if (
      !input.outside ||
      this.appearance.density === 0 ||
      !Number.isFinite(position.x + position.y + position.z)
    ) {
      this.count = 0;
      this.mesh.subMeshes[0].indexCount = 0;
      this.mesh.setEnabled(false);
      return;
    }
    const dt = clamp(input.dt, 0, 0.1);
    this.motionTime = (this.motionTime + dt) % MOTION_PERIOD;
    this.wind.set(clamp(input.wind.x, -80, 80), clamp(input.wind.z, -80, 80));
    const dx = position.x - this.mesh.position.x,
      dy = position.y - this.mesh.position.y,
      dz = position.z - this.mesh.position.z;
    const previousCount =
      Math.abs(dx) > RADIUS || Math.abs(dy) > HEIGHT || Math.abs(dz) > RADIUS
        ? 0
        : this.count;
    this.count = Math.ceil(
      PRECIPITATION_BUDGET[input.quality] * this.appearance.density,
    );
    for (let i = 0; i < this.count; i++) {
      const p = i * 12,
        s = i * 16,
        fresh = i >= previousCount;
      const snow = this.shapes[s + 2] === 1,
        speed = this.shapes[s + 3];
      let x = fresh ? this.seeds[i * 3] : this.positions[p] - dx;
      let y = fresh ? this.seeds[i * 3 + 1] : this.positions[p + 1] - dy;
      let z = fresh ? this.seeds[i * 3 + 2] : this.positions[p + 2] - dz;
      x +=
        (this.wind.x * (snow ? 0.8 : 0.55) +
          (snow ? Math.sin(this.motionTime * 1.6 + i) * 0.6 : 0)) *
        dt;
      y -= speed * dt;
      z +=
        (this.wind.y * (snow ? 0.8 : 0.55) +
          (snow ? Math.cos(this.motionTime * 1.3 + i) * 0.6 : 0)) *
        dt;
      this.writeCenter(
        i,
        wrap(x, -RADIUS, RADIUS * 2),
        wrap(y, BOTTOM, HEIGHT),
        wrap(z, -RADIUS, RADIUS * 2),
      );
    }
    this.mesh.position.copyFromFloats(position.x, position.y, position.z);
    this.mesh.subMeshes[0].indexCount = this.count * 6;
    this.material.setFloat("motionTime", this.motionTime);
    this.material.setFloat("illumination", clamp(input.illumination));
    const visibility = source?.visibility;
    this.material.setFloat(
      "extinction",
      visibility !== undefined && Number.isFinite(visibility) && visibility >= 0
        ? -Math.log(0.05) / Math.max(80, visibility)
        : 0,
    );
    this.mesh
      .getVertexBuffer(VertexBuffer.PositionKind)!
      .updateDirectly(this.positions, 0);
    this.mesh.setEnabled(true);
  }

  private configureShapes() {
    for (let i = 0; i < CAPACITY; i++) {
      const snow = (i * 0.61803398875) % 1 < this.appearance.snowFraction;
      const kind = snow
        ? 1
        : this.appearance.hail
          ? 2
          : this.appearance.drizzle
            ? 3
            : 0;
      const width =
        kind === 1
          ? 0.008 + (i % 5) * 0.0025
          : kind === 2
            ? 0.009 + (i % 3) * 0.003
            : kind === 3
              ? 0.004 + (i % 3) * 0.001
              : 0.006 + (i % 3) * 0.002;
      const length =
        kind === 1
          ? width * (0.85 + (i % 3) * 0.075)
          : kind === 2
            ? width
            : kind === 3
              ? 0.04 + (i % 3) * 0.012
              : 0.16 + (i % 4) * 0.055;
      const speed =
        kind === 1
          ? 1.2 + (i % 7) * 0.16
          : kind === 2
            ? 8 + (i % 5) * 0.8
            : kind === 3
              ? 2.5 + (i % 5) * 0.3
              : 11 + (i % 5) * 0.7;
      for (let v = 0; v < 4; v++) {
        const p = i * 16 + v * 4;
        this.shapes[p] = width;
        this.shapes[p + 1] = length;
        this.shapes[p + 2] = kind;
        this.shapes[p + 3] = speed;
      }
    }
  }

  private writeCenter(i: number, x: number, y: number, z: number) {
    for (let v = 0; v < 4; v++) {
      const p = i * 12 + v * 3;
      this.positions[p] = x;
      this.positions[p + 1] = y;
      this.positions[p + 2] = z;
    }
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.count = 0;
    this.scene.onDisposeObservable.remove(this.sceneDisposal);
    this.mesh.dispose(false, false);
    this.material.dispose(false, false);
  }
}
