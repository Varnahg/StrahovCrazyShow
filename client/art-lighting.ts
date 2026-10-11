import { Color3 } from "@babylonjs/core/Maths/math.color";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { ShaderMaterial } from "@babylonjs/core/Materials/shaderMaterial";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Effect } from "@babylonjs/core/Materials/effect";
import type { Scene } from "@babylonjs/core/scene";
import type { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";
import type { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import type { PointLight } from "@babylonjs/core/Lights/pointLight";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { createSkyFirstOpaqueComparator } from "./opaque-sort";

export interface ArtLightingContext {
  scene: Scene;
  sun: DirectionalLight;
  ambient: HemisphericLight;
  lamps: StandardMaterial;
  lights: PointLight[];
  clouds: Mesh[];
  quality: string;
}
export interface ArtLightingInput {
  sun: { x: number; y: number; z: number; altitude: number; daylight: number };
  moon?: {
    x: number;
    y: number;
    z: number;
    altitude: number;
    fraction?: number;
  };
  weather?: {
    cloud: number;
    rain: number;
    wind: number;
    cloudLayers?: { low: number; mid: number; high: number };
  };
  player: { x: number; y: number; z: number };
  dt: number;
  instant?: number;
  /** Reserve one material slot when the controlled vehicle's beam is active. */
  headlightRequested?: boolean;
  /** Actual enabled local sources, e.g. the B6 interior fill. */
  extraPracticalLightSlots?: number;
}

const c = (hex: string) => Color3.FromHexString(hex);
const palette = {
  dayTop: c("#648cb0"),
  dayHorizon: c("#cad5d6"),
  dayKey: c("#fff1dc"),
  dayAmbient: c("#a8bcc8"),
  cloudTop: c("#87949c"),
  cloudHorizon: c("#b7c1c3"),
  cloudKey: c("#dbe3e7"),
  cloudAmbient: c("#b4bec4"),
  lowTop: c("#6a87a1"),
  lowHorizon: c("#d6b7a0"),
  lowKey: c("#ffd5a5"),
  nightTop: c("#050a12"),
  nightHorizon: c("#101820"),
  nightKey: c("#a0b5cf"),
  nightAmbient: c("#586a82"),
  duskTop: c("#3f5772"),
  duskHorizon: c("#8d97a8"),
  duskAmbient: c("#708198"),
};
function clamp(value: number) {
  return Math.min(1, Math.max(0, value));
}
function smooth(from: number, to: number, value: number) {
  const x = clamp((value - from) / (to - from));
  return x * x * (3 - 2 * x);
}

/** Pure state calculation allows deterministic comparisons at fixed sun/weather. */
export function sampleArtLighting(
  altitude: number,
  cloud: number,
  rain: number,
  moonAltitude = -1,
  moonFraction = 0,
) {
  cloud = clamp(cloud);
  rain = clamp(rain);
  // Astronomical twilight ends at -18 degrees. These are bounded art units,
  // not measured lux: a small orientation fill must not become a second sun.
  const twilight = smooth((-18 * Math.PI) / 180, -0.015, altitude);
  const day = smooth(-0.035, 0.15, altitude);
  const low = (1 - smooth(0.06, 0.34, altitude)) * day * (1 - cloud);
  const top = Color3.Lerp(palette.nightTop, palette.duskTop, twilight);
  const horizon = Color3.Lerp(
    palette.nightHorizon,
    palette.duskHorizon,
    twilight,
  );
  const dayTop = Color3.Lerp(palette.dayTop, palette.cloudTop, cloud);
  const dayHorizon = Color3.Lerp(
    palette.dayHorizon,
    palette.cloudHorizon,
    cloud,
  );
  Color3.LerpToRef(top, dayTop, day, top);
  Color3.LerpToRef(horizon, dayHorizon, day, horizon);
  Color3.LerpToRef(top, palette.lowTop, low * 0.65, top);
  Color3.LerpToRef(horizon, palette.lowHorizon, low * 0.72, horizon);
  const key = Color3.Lerp(palette.dayKey, palette.cloudKey, cloud);
  Color3.LerpToRef(key, palette.lowKey, low, key);
  const sunlight = smooth(0, 0.07, altitude) * (1 - cloud * 0.75);
  const moonlight =
    moonAltitude > 0
      ? 0.012 *
        smooth(0, 0.21, moonAltitude) *
        clamp(moonFraction) ** 2.3 *
        (1 - day) *
        (1 - cloud * 0.85)
      : 0;
  if (altitude <= 0) key.copyFrom(palette.nightKey);
  const ambient = Color3.Lerp(
    palette.nightAmbient,
    palette.duskAmbient,
    twilight,
  );
  Color3.LerpToRef(
    ambient,
    Color3.Lerp(palette.dayAmbient, palette.cloudAmbient, cloud),
    day,
    ambient,
  );
  const nightFill = 0.018 * (1 - cloud * 0.5) + moonlight * 0.2;
  const twilightFill = nightFill + twilight * (0.16 + cloud * 0.05 - nightFill);
  const ambientIntensity =
    twilightFill + day * (0.62 + cloud * 0.16 - twilightFill);
  return {
    top,
    horizon,
    key,
    ambient,
    day,
    twilight,
    sunlight,
    moonlight,
    ambientIntensity,
    // Custom foliage shaders emit display colours and bypass material image
    // processing. This bounded display-space response shares the same smoothed
    // sky/key state instead of keeping their own unrelated bright night floor.
    surfaceIllumination: clamp(
      Math.sqrt(ambientIntensity * 0.35 + sunlight * 0.8 + moonlight * 0.35),
    ),
    cloudEmission:
      0.004 + twilight * (1 - day) * 0.075 + day * (0.836 - cloud * 0.1),
    fogDensity: 0.0012 + cloud * 0.001 + rain * 0.0013,
    night: 1 - smooth(-0.04, 0.1, altitude),
  };
}

Effect.ShadersStore.strahovSkyVertexShader = `
precision highp float;
attribute vec3 position;
uniform mat4 worldViewProjection;
varying vec3 vSkyDirection;
void main(void) {
  vSkyDirection = position;
  gl_Position = worldViewProjection * vec4(position, 1.0);
}`;
Effect.ShadersStore.strahovSkyFragmentShader = `
precision highp float;
varying vec3 vSkyDirection;
uniform vec3 topColor;
uniform vec3 horizonColor;
uniform vec3 sunDirection;
uniform float sunAltitude;
uniform float cloud;
uniform float starStrength;
uniform float siderealAngle;
float hash21(vec2 p) {
  return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453123);
}
void main(void) {
  vec3 direction = normalize(vSkyDirection);
  float elevation = direction.y;
  float t = smoothstep(-0.02, 0.72, max(elevation, -0.02));
  vec3 color = mix(horizonColor, topColor, t);
  float towardSun = max(0.0, dot(direction, sunDirection));
  float sunset = (1.0 - smoothstep(0.02,0.27,sunAltitude)) * smoothstep(-0.13,0.03,sunAltitude);
  float horizonGlow = pow(towardSun,8.0) * (1.0 - smoothstep(0.0,0.5,abs(elevation)));
  color = mix(color,vec3(0.93,0.57,0.32),sunset * horizonGlow * (1.0-cloud*0.8) * 0.43);
  float daylight = smoothstep(-0.02,0.15,sunAltitude);
  color += vec3(0.21,0.19,0.14) * pow(towardSun,64.0) * daylight * (1.0-cloud*0.75);
  // Decorative stars, rotated around Prague's celestial pole. No constellation claim.
  if (starStrength > 0.005 && elevation > 0.0) {
    vec3 pole = vec3(0.0,0.766948,-0.641709);
    float cs=cos(siderealAngle), sn=sin(siderealAngle);
    vec3 d=direction*cs + cross(pole,direction)*sn + pole*dot(pole,direction)*(1.0-cs);
    vec2 grid=vec2(atan(d.x,d.z),asin(clamp(d.y,-1.0,1.0)))*130.0;
    vec2 cell=floor(grid);
    float seed=hash21(cell);
    vec2 point=vec2(hash21(cell+14.7),hash21(cell+91.3))*.7+.15;
    float star=(1.0-smoothstep(.018,.095,length(fract(grid)-point))) * step(.992,seed);
    color += vec3(0.83,0.89,1.0) * star * starStrength * smoothstep(0.0,0.25,elevation);
  }
  gl_FragColor = vec4(color,1.0);
}`;

type LightingState = {
  cloud: number;
  rain: number;
  time: number;
  sky: ShaderMaterial;
  cloudMaterial: StandardMaterial | null;
  poolMaterial: StandardMaterial | null;
  asphalt: StandardMaterial | null;
  sample: ReturnType<typeof sampleArtLighting>;
  nearest: PointLight[];
  streetCapacity: number;
  windows: StandardMaterial[];
  sunDirection: Vector3;
  layerCoverage: number[];
  windowInstant: number;
  windowActivity: number;
};
const states = new WeakMap<Scene, LightingState>();
const pragueHour = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/Prague",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

function initialize(context: ArtLightingContext, input: ArtLightingInput) {
  const sky = new ShaderMaterial(
    "art:sky-gradient",
    context.scene,
    "strahovSky",
    {
      attributes: ["position"],
      uniforms: [
        "worldViewProjection",
        "topColor",
        "horizonColor",
        "sunDirection",
        "sunAltitude",
        "cloud",
        "starStrength",
        "siderealAngle",
      ],
    },
  );
  sky.backFaceCulling = false;
  sky.disableDepthWrite = true;
  const box = MeshBuilder.CreateBox(
    "atmosphere backdrop",
    { size: 500 },
    context.scene,
  );
  box.material = sky;
  box.infiniteDistance = true;
  box.isPickable = false;
  box.applyFog = false;
  box.renderingGroupId = 0;
  // Explicitly render the backdrop before opaque scenery, without a depth clear.
  box.alphaIndex = -1000;
  context.scene.setRenderingOrder(
    0,
    createSkyFirstOpaqueComparator(context.scene, box),
  );
  const state: LightingState = {
    cloud: input.weather?.cloud ?? 0.4,
    rain: input.weather?.rain ?? 0,
    time: 1,
    sky,
    nearest: [],
    streetCapacity: -1,
    sunDirection: new Vector3(0, 1, 0),
    layerCoverage: input.weather?.cloudLayers
      ? [
          input.weather.cloudLayers.low,
          input.weather.cloudLayers.mid,
          input.weather.cloudLayers.high,
        ]
      : [
          input.weather?.cloud ?? 0.4,
          input.weather?.cloud ?? 0.4,
          input.weather?.cloud ?? 0.4,
        ],
    windowInstant: 0,
    windowActivity: 0.8,
    windows: context.scene.materials.filter(
      (material): material is StandardMaterial =>
        material instanceof StandardMaterial &&
        material.metadata?.nightWindows === true,
    ),
    cloudMaterial: context.scene.getMaterialByName(
      "art:clouds",
    ) as StandardMaterial | null,
    poolMaterial: context.scene.getMaterialByName(
      "art:lamp-pool",
    ) as StandardMaterial | null,
    asphalt:
      context.scene.getMaterialByName("m#666b68") instanceof StandardMaterial
        ? (context.scene.getMaterialByName("m#666b68") as StandardMaterial)
        : null,
    sample: sampleArtLighting(
      input.sun.altitude,
      input.weather?.cloud ?? 0.4,
      input.weather?.rain ?? 0,
      input.moon?.altitude,
      input.moon?.fraction,
    ),
  };
  states.set(context.scene, state);
  return state;
}

/** Call once per rendered frame after the celestial discs, before scene.render(). */
export function applyArtLighting(
  context: ArtLightingContext,
  input: ArtLightingInput,
) {
  const state = states.get(context.scene) ?? initialize(context, input);
  const dt = Math.max(0, Math.min(0.1, input.dt)),
    t = 1 - Math.exp(-dt / 5);
  state.cloud += ((input.weather?.cloud ?? 0.4) - state.cloud) * t;
  state.rain += ((input.weather?.rain ?? 0) - state.rain) * t;
  const sample = sampleArtLighting(
    input.sun.altitude,
    state.cloud,
    state.rain,
    input.moon?.altitude,
    input.moon?.fraction,
  );
  state.sample = sample;
  context.sun.diffuse.copyFrom(sample.key);
  if (sample.sunlight > 0) {
    context.sun.direction.set(-input.sun.x, -input.sun.y, -input.sun.z);
    context.sun.intensity = sample.sunlight;
  } else if (sample.moonlight > 0 && input.moon) {
    context.sun.direction.set(-input.moon.x, -input.moon.y, -input.moon.z);
    context.sun.intensity = sample.moonlight;
  } else context.sun.intensity = 0;
  // A zero-intensity celestial key must not consume one of the four material
  // light slots during a moonless night. Change state only at actual transitions.
  const keyEnabled = context.sun.intensity > 0;
  if (context.sun.isEnabled(false) !== keyEnabled)
    context.sun.setEnabled(keyEnabled);
  context.ambient.diffuse.copyFrom(sample.ambient);
  context.ambient.groundColor.set(
    sample.ambient.r * 0.18 * (1 - sample.day) + 0.25 * sample.day,
    sample.ambient.g * 0.18 * (1 - sample.day) + 0.28 * sample.day,
    sample.ambient.b * 0.18 * (1 - sample.day) + 0.24 * sample.day,
  );
  context.ambient.intensity = sample.ambientIntensity;
  context.scene.clearColor.copyFromFloats(
    sample.top.r,
    sample.top.g,
    sample.top.b,
    1,
  );
  context.scene.fogColor.copyFrom(sample.horizon);
  context.scene.fogDensity = sample.fogDensity;
  state.sky.setColor3("topColor", sample.top);
  state.sky.setColor3("horizonColor", sample.horizon);
  // A sun below the horizon still determines the direction of evening twilight.
  state.sunDirection.set(input.sun.x, input.sun.y, input.sun.z);
  state.sky.setVector3("sunDirection", state.sunDirection);
  state.sky.setFloat("sunAltitude", input.sun.altitude);
  state.sky.setFloat("cloud", state.cloud);
  state.sky.setFloat(
    "starStrength",
    (1 - smooth(-0.21, -0.08, input.sun.altitude)) *
      (1 - state.cloud) ** 2 *
      (1 -
        (input.moon?.fraction ?? 0) * Math.max(0, input.moon?.y ?? 0) * 0.45),
  );
  const instant = input.instant ?? Date.now();
  const sidereal =
    ((280.46061837 +
      360.98564736629 * (instant / 86400000 + 2440587.5 - 2451545) +
      14.39175) *
      Math.PI) /
    180;
  state.sky.setFloat("siderealAngle", sidereal % (Math.PI * 2));
  context.lamps.emissiveColor.set(
    0.94 * sample.night,
    0.74 * sample.night,
    0.43 * sample.night,
  );
  if (state.poolMaterial) state.poolMaterial.alpha = sample.night * 0.72;
  // Nightlife is an illustrative room-light pattern, never real room occupancy.
  if (Math.abs(instant - state.windowInstant) > 1000) {
    state.windowInstant = instant;
    const [hour, minute] = pragueHour.format(instant).split(":").map(Number);
    const h = hour + minute / 60;
    state.windowActivity =
      h < 5
        ? 0.35 + 0.45 * (1 - smooth(0, 4, h))
        : h < 17
          ? 0.35 + 0.2 * smooth(5, 17, h)
          : 0.55 + 0.35 * smooth(17, 21, h) - 0.1 * smooth(21, 24, h);
  }
  for (const material of state.windows) {
    material.useEmissiveAsIllumination = true;
    // Babylon StandardMaterial ADDS emissiveTexture to emissiveColor. Scaling
    // color would illuminate every facade pixel, including the opaque wall.
    material.emissiveColor.setAll(0);
    if (material.emissiveTexture)
      material.emissiveTexture.level =
        sample.night * state.windowActivity * 0.7;
  }
  if (state.cloudMaterial) {
    const brightness = sample.cloudEmission;
    // disableLighting avoids 24 extra lit cloud planes, but their emissive
    // value still has to follow the sky. Preserve the sprite's colour detail.
    state.cloudMaterial.useEmissiveAsIllumination = true;
    state.cloudMaterial.emissiveColor.set(
      brightness * 0.96,
      brightness,
      brightness * 1.02,
    );
  }
  for (let layer = 0; layer < 3; layer++) {
    const target = input.weather?.cloudLayers
      ? [
          input.weather.cloudLayers.low,
          input.weather.cloudLayers.mid,
          input.weather.cloudLayers.high,
        ][layer]
      : state.cloud;
    state.layerCoverage[layer] += (target - state.layerCoverage[layer]) * t;
  }
  context.clouds.forEach((mesh, index) => {
    const layer = index % 3,
      rank = Math.floor(index / 3);
    const coverage = state.layerCoverage[layer];
    const visibility =
      clamp(coverage * Math.ceil(context.clouds.length / 3) - rank) *
      (layer === 2 ? 0.65 : 1);
    mesh.visibility = visibility;
    mesh.setEnabled(visibility > 0.001);
  });
  if (state.asphalt) {
    const wet = 1 - clamp(state.rain / 8) * 0.14;
    state.asphalt.diffuseColor.set(
      (102 / 255) * wet,
      (107 / 255) * wet,
      (104 / 255) * wet,
    );
  }
  // All materials retain four light slots. Reserve the actual celestial key,
  // controlled headlight and interior sources before selecting street lamps.
  const headlightActive =
    input.headlightRequested === true && sample.night > 0.1;
  const extraSlots = Number.isFinite(input.extraPracticalLightSlots)
    ? Math.max(0, Math.min(4, Math.ceil(input.extraPracticalLightSlots!)))
    : 0;
  const streetCapacity = Math.min(
    context.quality === "low" ? 1 : 2,
    Math.max(
      0,
      4 - 1 - Number(keyEnabled) - Number(headlightActive) - extraSlots,
    ),
  );
  state.time += dt;
  if (state.time >= 0.5 || state.streetCapacity !== streetCapacity) {
    state.time = 0;
    state.streetCapacity = streetCapacity;
    const distance = (l: PointLight) =>
      (l.position.x - input.player.x) ** 2 +
      (l.position.z - input.player.z) ** 2;
    state.nearest = context.lights
      .filter((light) => distance(light) < Math.min(32, light.range + 8) ** 2)
      .sort((a, b) => distance(a) - distance(b))
      .slice(0, streetCapacity);
  }
  for (const light of context.lights) {
    const enabled = sample.night > 0.01 && state.nearest.includes(light);
    // Light.setEnabled resyncs every scene mesh even if its state is unchanged.
    if (light.isEnabled(false) !== enabled) light.setEnabled(enabled);
    light.intensity = enabled ? sample.night * 0.7 : 0;
  }
  return sample;
}
