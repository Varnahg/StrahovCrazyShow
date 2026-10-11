import { Vector3, Quaternion } from "@babylonjs/core/Maths/math.vector";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { ShaderMaterial } from "@babylonjs/core/Materials/shaderMaterial";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import { RawTexture } from "@babylonjs/core/Materials/Textures/rawTexture";
import { Effect } from "@babylonjs/core/Materials/effect";
import type { Scene } from "@babylonjs/core/scene";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import {
  moonState,
  sunState,
  windVector,
  type Weather,
} from "../shared/weather";

export interface SkyWeatherInput {
  /** UTC epoch milliseconds; do not add Prague's UTC offset to this value. */
  instant: number;
  weather?: Weather;
  player: { x: number; y: number; z: number };
  dt: number;
  quality: string;
}
export interface SkyWeatherState {
  sun: ReturnType<typeof sunState>;
  moon: ReturnType<typeof moonState>;
  /** Smoothed surface wind, in world meters/second, for rain/vegetation. */
  wind: { x: number; z: number };
  cloud: number;
  rain: number;
  instant: number;
}

const clamp = (v: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));
const mix = (a: number, b: number, t: number) => a + (b - a) * t;
const smooth = (a: number, b: number, v: number) => {
  const t = clamp((v - a) / (b - a));
  return t * t * (3 - 2 * t);
};

/** Lighting a projected sphere gives the actual illuminated-area fraction. */
export function moonDiscLightVector(fraction: number, brightLimbAngle: number) {
  const z = 2 * clamp(fraction) - 1,
    transverse = Math.sqrt(Math.max(0, 1 - z * z));
  return {
    x: -Math.sin(brightLimbAngle) * transverse,
    y: Math.cos(brightLimbAngle) * transverse,
    z,
  };
}

Effect.ShadersStore.strahovCelestialVertexShader = `
precision highp float;
attribute vec3 position;
uniform mat4 worldViewProjection;
varying vec2 vDisc;
void main(void) {
  vDisc=position.xy;
  gl_Position=worldViewProjection*vec4(position,1.0);
}`;
Effect.ShadersStore.strahovSunFragmentShader = `
precision highp float;
varying vec2 vDisc;
uniform float altitude;
uniform float angularRadius;
uniform float upY;
uniform float strength;
void main(void) {
  vec2 p=vDisc*6.0;
  float radius=length(p);
  if (sin(altitude)+upY*angularRadius*p.y<0.0) discard;
  float disc=1.0-smoothstep(.99,1.01,radius);
  float halo=exp(-radius*radius*.16)*.12;
  float warm=1.0-smoothstep(0.0,.28,altitude);
  vec3 color=mix(vec3(1.0,.97,.86),vec3(1.0,.67,.32),warm*.75);
  gl_FragColor=vec4(color,max(disc,halo)*strength);
}`;
Effect.ShadersStore.strahovMoonFragmentShader = `
precision highp float;
varying vec2 vDisc;
uniform sampler2D moonMap;
uniform vec3 lightDirection;
uniform vec3 skyColor;
uniform float daylight;
uniform float altitude;
uniform float angularRadius;
uniform float upY;
uniform float textureAngle;
uniform float strength;
void main(void) {
  float r2=dot(vDisc,vDisc);
  if (r2>1.0 || sin(altitude)+upY*angularRadius*vDisc.y<0.0) discard;
  vec3 normal=vec3(vDisc,sqrt(max(0.0,1.0-r2)));
  float cs=cos(textureAngle),sn=sin(textureAngle);
  vec3 textureNormal=vec3(normal.x*cs-normal.y*sn,normal.x*sn+normal.y*cs,normal.z);
  // NASA's equirectangular map is centred on near-side longitude zero.
  vec2 uv=vec2(.5+atan(textureNormal.x,textureNormal.z)/6.28318530718,
               .5-asin(clamp(textureNormal.y,-1.0,1.0))/3.14159265359);
  vec3 albedo=texture2D(moonMap,uv).rgb;
  float cosine=dot(normal,lightDirection);
  float lit=pow(max(cosine,0.0),.32)*smoothstep(-.006,.006,cosine);
  float earthshine=.028*(1.0-daylight);
  vec3 color=albedo*(lit*1.7+earthshine);
  // Atmospheric foreground keeps the unlit side from becoming a black daytime disc.
  color=mix(color,skyColor+color*.3,daylight*.78);
  float edge=1.0-smoothstep(.992,1.0,sqrt(r2));
  gl_FragColor=vec4(color,edge*strength);
}`;

function hash(x: number, y: number) {
  const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return n - Math.floor(n);
}
function noise(x: number, y: number) {
  const ix = Math.floor(x),
    iy = Math.floor(y),
    fx = x - ix,
    fy = y - iy,
    ux = fx * fx * (3 - 2 * fx),
    uy = fy * fy * (3 - 2 * fy);
  return mix(
    mix(hash(ix, iy), hash(ix + 1, iy), ux),
    mix(hash(ix, iy + 1), hash(ix + 1, iy + 1), ux),
    uy,
  );
}
/** Shared, authored RGBA cloud sprite: generated once, mipmapped; no runtime raymarch. */
export function cloudPixels(width = 256, height = 128) {
  const pixels = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const u = x / (width - 1),
        v = y / (height - 1),
        nx = u * 8,
        ny = v * 4,
        detail =
          noise(nx, ny) * 0.55 +
          noise(nx * 2.07 + 17, ny * 2.07) * 0.28 +
          noise(nx * 4.11, ny * 4.11 + 31) * 0.17;
      // Rounded individual lobes with irregular wisps, rather than uniform grey blobs.
      let silhouette = 0;
      for (let l = 0; l < 5; l++) {
        const cx = 0.17 + l * 0.165,
          cy = 0.54 + Math.sin(l * 2.1) * 0.09,
          q =
            ((u - cx) / (0.19 + hash(l, 4) * 0.03)) ** 2 +
            ((v - cy) / (0.32 + hash(l, 9) * 0.1)) ** 2;
        silhouette = Math.max(silhouette, Math.exp(-q * 1.65));
      }
      const edge =
          smooth(0, 0.08, u) *
          smooth(0, 0.08, 1 - u) *
          smooth(0, 0.08, v) *
          smooth(0, 0.08, 1 - v),
        alpha = smooth(0.17, 0.57, silhouette + detail * 0.31 - 0.16) * edge,
        shade = clamp(0.76 + v * 0.16 + detail * 0.12),
        i = (y * width + x) * 4;
      pixels[i] = Math.round(242 * shade);
      pixels[i + 1] = Math.round(245 * shade);
      pixels[i + 2] = Math.round(246 * shade);
      pixels[i + 3] = Math.round(alpha * 225);
    }
  return pixels;
}

export class SkyWeatherController {
  private readonly sunDisc: Mesh;
  private readonly moonDisc: Mesh;
  private readonly sunMaterial: ShaderMaterial;
  private readonly moonMaterial: ShaderMaterial;
  private readonly moonMap: Texture;
  private readonly cloudTexture: RawTexture | null;
  private readonly direction = new Vector3();
  private readonly right = new Vector3();
  private readonly up = new Vector3();
  private readonly back = new Vector3();
  private readonly light = new Vector3();
  private readonly worldUp = Vector3.Up();
  private lastInstant = -Infinity;
  private initialized = false;
  private readonly layerWind = [
    { x: 0, z: 0 },
    { x: 0, z: 0 },
    { x: 0, z: 0 },
  ];
  private readonly state: SkyWeatherState = {
    sun: sunState(),
    moon: moonState(),
    wind: { x: 0, z: 0 },
    cloud: 0.4,
    rain: 0,
    instant: Date.now(),
  };

  constructor(
    private readonly scene: Scene,
    sunOrb: Mesh,
    moonOrb: Mesh,
    private readonly clouds: Mesh[],
  ) {
    sunOrb.setEnabled(false);
    moonOrb.setEnabled(false);
    this.sunMaterial = new ShaderMaterial(
      "sky:solar-disc",
      scene,
      { vertex: "strahovCelestial", fragment: "strahovSun" },
      {
        attributes: ["position"],
        uniforms: [
          "worldViewProjection",
          "altitude",
          "angularRadius",
          "upY",
          "strength",
        ],
        needAlphaBlending: true,
      },
    );
    this.moonMaterial = new ShaderMaterial(
      "sky:lunar-disc",
      scene,
      { vertex: "strahovCelestial", fragment: "strahovMoon" },
      {
        attributes: ["position"],
        uniforms: [
          "worldViewProjection",
          "lightDirection",
          "skyColor",
          "daylight",
          "altitude",
          "angularRadius",
          "upY",
          "textureAngle",
          "strength",
        ],
        samplers: ["moonMap"],
        needAlphaBlending: true,
      },
    );
    for (const material of [this.sunMaterial, this.moonMaterial]) {
      material.backFaceCulling = false;
      material.disableDepthWrite = true;
    }
    this.moonMap = new Texture(
      "/textures/sky/moon-lroc-2k.jpg",
      scene,
      false,
      false,
      Texture.TRILINEAR_SAMPLINGMODE,
    );
    this.moonMap.name = "NASA SVS · LROC 2025 colour map";
    this.moonMaterial.setTexture("moonMap", this.moonMap);
    this.sunDisc = this.createDisc("astronomical sun", this.sunMaterial);
    this.moonDisc = this.createDisc("astronomical moon", this.moonMaterial);
    const material = scene.getMaterialByName("art:clouds");
    if (material instanceof StandardMaterial) {
      const oldTexture = material.diffuseTexture;
      this.cloudTexture = RawTexture.CreateRGBATexture(
        cloudPixels(),
        256,
        128,
        scene,
        true,
        false,
        Texture.TRILINEAR_SAMPLINGMODE,
      );
      this.cloudTexture.name = "authored detailed cloud sprite";
      this.cloudTexture.hasAlpha = true;
      material.diffuseTexture = this.cloudTexture;
      oldTexture?.dispose();
    } else this.cloudTexture = null;
    for (let i = 0; i < clouds.length; i++) {
      const layer = i % 3;
      // Compressed visual layers fit a browser campus; their altitudes are not measured cloud bases.
      clouds[i].position.y = 125 + layer * 40 + (Math.floor(i / 3) % 3) * 7;
      clouds[i].scaling.scaleInPlace(1 + layer * 0.28);
      clouds[i].metadata = { ...clouds[i].metadata, skyLayer: layer };
    }
  }

  private createDisc(name: string, material: ShaderMaterial) {
    const disc = MeshBuilder.CreatePlane(name, { size: 2 }, this.scene);
    disc.material = material;
    disc.isPickable = false;
    disc.applyFog = false;
    disc.rotationQuaternion = Quaternion.Identity();
    return disc;
  }

  private placeDisc(
    mesh: Mesh,
    body: { x: number; y: number; z: number; angularDiameter: number },
    observer: { x: number; y: number; z: number },
    scale = 1,
  ) {
    const distance = 420;
    this.direction.set(body.x, body.y, body.z);
    Vector3.CrossToRef(this.direction, this.worldUp, this.right);
    if (this.right.lengthSquared() < 1e-8) this.right.set(1, 0, 0);
    this.right.normalize();
    Vector3.CrossToRef(this.right, this.direction, this.up);
    this.up.normalize();
    this.back.copyFrom(this.direction).scaleInPlace(-1);
    Quaternion.RotationQuaternionFromAxisToRef(
      this.right,
      this.up,
      this.back,
      mesh.rotationQuaternion!,
    );
    mesh.position.set(
      observer.x + body.x * distance,
      observer.y + body.y * distance,
      observer.z + body.z * distance,
    );
    mesh.scaling.setAll(Math.tan(body.angularDiameter / 2) * distance * scale);
    return this.up.y;
  }

  update(input: SkyWeatherInput): SkyWeatherState {
    const dt = clamp(input.dt, 0, 0.1),
      t = 1 - Math.exp(-dt / 5),
      targetWind = windVector(
        input.weather?.wind ?? 0,
        input.weather?.windDirection ?? 0,
      );
    if (Math.abs(input.instant - this.lastInstant) >= 1000) {
      this.lastInstant = input.instant;
      this.state.sun = sunState(input.instant);
      this.state.moon = moonState(input.instant);
    }
    const cloud = clamp(input.weather?.cloud ?? 0.4),
      rain = Math.max(0, input.weather?.rain ?? 0);
    if (!this.initialized) {
      this.initialized = true;
      this.state.cloud = cloud;
      this.state.rain = rain;
      Object.assign(this.state.wind, targetWind);
    }
    this.state.cloud = mix(this.state.cloud, cloud, t);
    this.state.rain = mix(this.state.rain, rain, t);
    this.state.wind.x = mix(this.state.wind.x, targetWind.x, t);
    this.state.wind.z = mix(this.state.wind.z, targetWind.z, t);
    this.state.instant = input.instant;
    const { sun, moon } = this.state;
    // Update the camera matrix now: yesterday's globalPosition would create parallax while walking.
    this.scene.activeCamera?.getWorldMatrix();
    const observer = this.scene.activeCamera?.globalPosition ?? input.player;
    const sunUp = this.placeDisc(this.sunDisc, sun, observer, 6),
      moonUp = this.placeDisc(this.moonDisc, moon, observer),
      transparency = 1 - smooth(0.55, 1, this.state.cloud) * 0.9;
    this.sunDisc.setEnabled(sun.altitude > -sun.angularDiameter / 2);
    this.moonDisc.setEnabled(
      moon.altitude > -moon.angularDiameter / 2 && moon.fraction > 0.002,
    );
    this.sunMaterial
      .setFloat("altitude", sun.altitude)
      .setFloat("angularRadius", sun.angularDiameter / 2)
      .setFloat("upY", sunUp)
      .setFloat("strength", transparency);
    const moonLight = moonDiscLightVector(moon.fraction, moon.brightLimbAngle);
    this.light.set(moonLight.x, moonLight.y, moonLight.z);
    this.moonMaterial
      .setVector3("lightDirection", this.light)
      .setColor3("skyColor", this.scene.fogColor)
      .setFloat("daylight", sun.daylight)
      .setFloat("altitude", moon.altitude)
      .setFloat("angularRadius", moon.angularDiameter / 2)
      .setFloat("upY", moonUp)
      .setFloat("textureAngle", -moon.parallacticAngle)
      .setFloat("strength", transparency);
    const layers = [
      input.weather?.cloudWinds?.low,
      input.weather?.cloudWinds?.mid,
      input.weather?.cloudWinds?.high,
    ];
    for (let i = 0; i < 3; i++) {
      const target = layers[i]
        ? windVector(layers[i]!.speed, layers[i]!.direction)
        : targetWind;
      this.layerWind[i].x = mix(this.layerWind[i].x, target.x, t);
      this.layerWind[i].z = mix(this.layerWind[i].z, target.z, t);
    }
    for (let i = 0; i < this.clouds.length; i++) {
      const cloudMesh = this.clouds[i],
        wind = this.layerWind[i % 3];
      cloudMesh.position.x += wind.x * dt;
      cloudMesh.position.z += wind.z * dt;
      // Wrapping is outside the local campus view; no jumping directly overhead.
      if (cloudMesh.position.x > input.player.x + 620)
        cloudMesh.position.x -= 1240;
      if (cloudMesh.position.x < input.player.x - 620)
        cloudMesh.position.x += 1240;
      if (cloudMesh.position.z > input.player.z + 620)
        cloudMesh.position.z -= 1240;
      if (cloudMesh.position.z < input.player.z - 620)
        cloudMesh.position.z += 1240;
    }
    return this.state;
  }

  dispose() {
    this.sunDisc.dispose();
    this.moonDisc.dispose();
    this.sunMaterial.dispose();
    this.moonMaterial.dispose();
    this.moonMap.dispose();
    this.cloudTexture?.dispose();
  }
}
