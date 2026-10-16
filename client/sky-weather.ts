import { Vector3, Quaternion } from "@babylonjs/core/Maths/math.vector";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { ShaderMaterial } from "@babylonjs/core/Materials/shaderMaterial";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import { Effect } from "@babylonjs/core/Materials/effect";
import type { Scene } from "@babylonjs/core/scene";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import {
  createAtmosphereSky,
  ATMOSPHERE_CLOUD_GLSL,
  ATMOSPHERE_CLOUD_UNIFORMS,
  ATMOSPHERE_CLOUD_SAMPLERS,
  type AtmosphereSky,
} from "./atmosphere-sky";
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
uniform mat4 world;
uniform vec3 skyObserver;
uniform float farDepth;
varying vec3 vSkyRay;
varying vec2 vDisc;
void main(void) {
  vDisc=position.xy;
  vSkyRay=(world*vec4(position,1.0)).xyz-skyObserver;
  gl_Position=worldViewProjection*vec4(position,1.0);
  // Celestial geometry sets angular size only: every piece of scenery, even
  // beyond the 420m placement sphere, must be able to occlude a distant body.
  gl_Position.z=farDepth*gl_Position.w;
}`;
Effect.ShadersStore.strahovSunFragmentShader = `
precision highp float;
varying vec3 vSkyRay;
${ATMOSPHERE_CLOUD_GLSL}
varying vec2 vDisc;
uniform float altitude;
uniform float angularRadius;
uniform float upY;
uniform float strength;
void main(void) {
  vec2 p=vDisc*6.0;
  float radius=length(p);
  float cloudOpacity=atmosphereCloudOpacity(normalize(vSkyRay));
  if (sin(altitude)+upY*angularRadius*p.y<0.0) discard;
  float disc=1.0-smoothstep(.99,1.01,radius);
  float halo=exp(-radius*radius*.16)*.12;
  float warm=1.0-smoothstep(0.0,.28,altitude);
  vec3 color=mix(vec3(1.0,.97,.86),vec3(1.0,.67,.32),warm*.75);
  gl_FragColor=vec4(color,max(disc,halo)*strength*(1.0-cloudOpacity));
}`;
Effect.ShadersStore.strahovMoonFragmentShader = `
precision highp float;
varying vec3 vSkyRay;
${ATMOSPHERE_CLOUD_GLSL}
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
  vec3 normal=vec3(vDisc,sqrt(max(0.0,1.0-r2)));
  float cs=cos(textureAngle),sn=sin(textureAngle);
  vec3 textureNormal=vec3(normal.x*cs-normal.y*sn,normal.x*sn+normal.y*cs,normal.z);
  // NASA's equirectangular map is centred on near-side longitude zero.
  vec2 uv=vec2(.5+atan(textureNormal.x,textureNormal.z)/6.28318530718,
               .5-asin(clamp(textureNormal.y,-1.0,1.0))/3.14159265359);
  vec3 albedo=texture2D(moonMap,uv).rgb;
  float cloudOpacity=atmosphereCloudOpacity(normalize(vSkyRay));
  // All mipmapped reads precede the pixel-dependent limb/horizon discard.
  if (r2>1.0 || sin(altitude)+upY*angularRadius*vDisc.y<0.0) discard;
  float cosine=dot(normal,lightDirection);
  float lit=pow(max(cosine,0.0),.32)*smoothstep(-.006,.006,cosine);
  float earthshine=.035*(1.0-daylight)*(1.0-(lightDirection.z+1.0)*.5);
  vec3 color=albedo*(lit*1.7+earthshine);
  // Atmospheric foreground keeps the unlit side from becoming a black daytime disc.
  color=mix(color,skyColor+color*.3,daylight*.78);
  float edge=1.0-smoothstep(.992,1.0,sqrt(r2));
  // In daylight the unlit lunar surface is hidden by foreground sky radiance.
  // Reveal the exact backdrop instead of painting a dark circular sky-colour guess.
  float visibleSurface=mix(1.0,smoothstep(-.006,.04,cosine),daylight);
  gl_FragColor=vec4(color,edge*visibleSurface*strength*(1.0-cloudOpacity));
}`;

export class SkyWeatherController {
  private readonly sunDisc: Mesh;
  private readonly moonDisc: Mesh;
  private readonly sunMaterial: ShaderMaterial;
  private readonly moonMaterial: ShaderMaterial;
  private readonly moonMap: Texture;
  readonly atmosphere: AtmosphereSky;
  private readonly observer = new Vector3();
  private readonly unbindClouds: (() => void)[] = [];
  private readonly direction = new Vector3();
  private readonly right = new Vector3();
  private readonly up = new Vector3();
  private readonly back = new Vector3();
  private readonly light = new Vector3();
  private readonly worldUp = Vector3.Up();
  private lastInstant = -Infinity;
  private initialized = false;
  private readonly state: SkyWeatherState = {
    sun: sunState(),
    moon: moonState(),
    wind: { x: 0, z: 0 },
    cloud: 0.4,
    rain: 0,
    instant: Date.now(),
  };

  constructor(private readonly scene: Scene) {
    this.atmosphere = createAtmosphereSky(scene, "medium");
    this.sunMaterial = new ShaderMaterial(
      "sky:solar-disc",
      scene,
      { vertex: "strahovCelestial", fragment: "strahovSun" },
      {
        attributes: ["position"],
        uniforms: [
          "worldViewProjection",
          "world",
          "skyObserver",
          "farDepth",
          ...ATMOSPHERE_CLOUD_UNIFORMS,
          "altitude",
          "angularRadius",
          "upY",
          "strength",
        ],
        needAlphaBlending: true,
        samplers: [...ATMOSPHERE_CLOUD_SAMPLERS],
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
          "world",
          "skyObserver",
          "farDepth",
          ...ATMOSPHERE_CLOUD_UNIFORMS,
          "lightDirection",
          "skyColor",
          "daylight",
          "altitude",
          "angularRadius",
          "upY",
          "textureAngle",
          "strength",
        ],
        samplers: ["moonMap", ...ATMOSPHERE_CLOUD_SAMPLERS],
        needAlphaBlending: true,
      },
    );
    for (const material of [this.sunMaterial, this.moonMaterial]) {
      material.backFaceCulling = false;
      material.disableDepthWrite = true;
      material.setFloat(
        "farDepth",
        scene.getEngine().useReverseDepthBuffer ? 0.000001 : 0.999999,
      );
      this.unbindClouds.push(this.atmosphere.bindClouds(material));
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
      moonUp = this.placeDisc(this.moonDisc, moon, observer);
    this.observer.set(observer.x, observer.y, observer.z);
    this.sunDisc.setEnabled(sun.altitude > -sun.angularDiameter / 2);
    this.moonDisc.setEnabled(
      moon.altitude > -moon.angularDiameter / 2 && moon.fraction > 0.002,
    );
    this.sunMaterial
      .setFloat("altitude", sun.altitude)
      .setFloat("angularRadius", sun.angularDiameter / 2)
      .setFloat("upY", sunUp)
      .setFloat("strength", 1)
      .setVector3("skyObserver", this.observer);
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
      .setFloat("strength", 1)
      .setVector3("skyObserver", this.observer);
    return this.state;
  }

  dispose() {
    this.sunDisc.dispose();
    this.moonDisc.dispose();
    this.sunMaterial.dispose();
    this.moonMaterial.dispose();
    this.moonMap.dispose();
    for (const unbind of this.unbindClouds) unbind();
    this.atmosphere.dispose();
  }
}
