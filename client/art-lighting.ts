import { Color3 } from "@babylonjs/core/Maths/math.color";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { createAtmosphereSky, type AtmosphereSky } from "./atmosphere-sky";
import {
  atmosphereFogDensity,
  celestialTransmission,
  lunarRelativeIrradiance,
} from "./atmosphere-light";
import type { Weather } from "../shared/weather";
import type { Scene } from "@babylonjs/core/scene";
import type { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";
import type { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import type { PointLight } from "@babylonjs/core/Lights/pointLight";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import {
  createSkyFirstMaterialComparator,
  createSkyFirstOpaqueComparator,
} from "./opaque-sort";

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
    distance?: number;
  };
  weather?: Pick<Weather, "cloud" | "rain" | "wind"> & Partial<Weather>;
  /** Shared sky/disc controller; omit for standalone lighting previews. */
  atmosphere?: AtmosphereSky;
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
  dayTop: c("#477db8"),
  dayHorizon: c("#bccedc"),
  dayKey: c("#fff1dc"),
  dayAmbient: c("#a8bcc8"),
  cloudTop: c("#87949c"),
  cloudHorizon: c("#b7c1c3"),
  cloudKey: c("#dbe3e7"),
  cloudAmbient: c("#b4bec4"),
  lowTop: c("#647caa"),
  lowHorizon: c("#e4b58e"),
  lowKey: c("#ffc48a"),
  nightTop: c("#050a12"),
  nightHorizon: c("#101820"),
  nightKey: c("#a0b5cf"),
  nightAmbient: c("#586a82"),
  duskTop: c("#354971"),
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
  moonDistance = 384400,
  visibility?: number,
) {
  cloud = clamp(cloud);
  const rainfall = clamp(rain / 8);
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
  const directTransmission =
    (1 - smooth(0.15, 1, cloud) * 0.98) * (1 - rainfall * 0.35);
  const sunlight = celestialTransmission(altitude) * directTransmission;
  const moonlight =
    0.035 *
    celestialTransmission(moonAltitude) *
    lunarRelativeIrradiance(moonFraction, moonDistance) *
    (1 - day) *
    directTransmission;
  const keySource =
    sunlight >= moonlight && sunlight > 0
      ? ("sun" as const)
      : moonlight > 0
        ? ("moon" as const)
        : ("none" as const);
  if (keySource !== "sun") key.copyFrom(palette.nightKey);
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
    keySource,
    key,
    ambient,
    day,
    twilight,
    sunlight,
    moonlight,
    ambientIntensity,
    // Bounded display response for precipitation, sharing the scene sky/key
    // instead of keeping unrelated bright rain streaks on a moonless night.
    surfaceIllumination: clamp(
      Math.sqrt(ambientIntensity * 0.35 + sunlight * 0.8 + moonlight * 0.35),
    ),
    cloudEmission:
      0.004 + twilight * (1 - day) * 0.075 + day * (0.836 - cloud * 0.1),
    fogDensity: atmosphereFogDensity(cloud, rain, visibility),
    night: 1 - smooth(-0.04, 0.1, altitude),
  };
}

type LightingState = {
  cloud: number;
  rain: number;
  time: number;
  sky: AtmosphereSky;
  cloudMaterial: StandardMaterial | null;
  poolMaterial: StandardMaterial | null;
  asphalt: StandardMaterial | null;
  sample: ReturnType<typeof sampleArtLighting>;
  fog: number;
  sampleAge: number;
  sampleSun: number;
  sampleMoon: number;
  sampleFraction: number | undefined;
  sampleDistance: number | undefined;
  sampleVisibility: number | undefined;
  nearest: PointLight[];
  streetCapacity: number;
  windows: StandardMaterial[];
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
  const sky =
    input.atmosphere ?? createAtmosphereSky(context.scene, context.quality);
  const box = MeshBuilder.CreateBox(
    "atmosphere backdrop",
    { size: 500 },
    context.scene,
  );
  box.material = sky.material;
  context.scene.onDisposeObservable.addOnce(() => sky.dispose());
  box.infiniteDistance = true;
  box.isPickable = false;
  box.applyFog = false;
  box.renderingGroupId = 0;
  // Explicitly render the backdrop before opaque scenery, without a depth clear.
  box.alphaIndex = -1000;
  context.scene.setRenderingOrder(
    0,
    context.scene.getEngine().isWebGPU
      ? createSkyFirstMaterialComparator(context.scene, box)
      : createSkyFirstOpaqueComparator(context.scene, box),
  );
  const state: LightingState = {
    cloud: input.weather?.cloud ?? 0.4,
    rain: input.weather?.rain ?? 0,
    time: 1,
    sky,
    nearest: [],
    streetCapacity: -1,
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
    fog: 0,
    sampleAge: 0,
    sampleSun: input.sun.altitude,
    sampleMoon: input.moon?.altitude ?? -1,
    sampleFraction: input.moon?.fraction,
    sampleDistance: input.moon?.distance,
    sampleVisibility: input.weather?.visibility,
    sample: sampleArtLighting(
      input.sun.altitude,
      input.weather?.cloud ?? 0.4,
      input.weather?.rain ?? 0,
      input.moon?.altitude,
      input.moon?.fraction,
      input.moon?.distance,
      input.weather?.visibility,
    ),
  };
  state.fog = state.sample.fogDensity;
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
  state.sampleAge += dt;
  // Slow weather interpolation needs no fresh Color3 allocations at display Hz.
  // Astronomical/time-preview changes update immediately, otherwise sample at 10 Hz.
  const moonAltitude = input.moon?.altitude ?? -1;
  if (
    state.sampleAge >= 0.1 ||
    state.sampleSun !== input.sun.altitude ||
    state.sampleMoon !== moonAltitude ||
    state.sampleFraction !== input.moon?.fraction ||
    state.sampleDistance !== input.moon?.distance ||
    state.sampleVisibility !== input.weather?.visibility
  ) {
    state.sample = sampleArtLighting(
      input.sun.altitude,
      state.cloud,
      state.rain,
      moonAltitude,
      input.moon?.fraction,
      input.moon?.distance,
      input.weather?.visibility,
    );
    state.sampleAge = 0;
    state.sampleSun = input.sun.altitude;
    state.sampleMoon = moonAltitude;
    state.sampleFraction = input.moon?.fraction;
    state.sampleDistance = input.moon?.distance;
    state.sampleVisibility = input.weather?.visibility;
  }
  const sample = state.sample;
  context.sun.diffuse.copyFrom(sample.key);
  if (sample.keySource === "sun") {
    context.sun.direction.set(-input.sun.x, -input.sun.y, -input.sun.z);
    context.sun.intensity = sample.sunlight;
  } else if (sample.keySource === "moon" && input.moon) {
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
  state.fog += (sample.fogDensity - state.fog) * t;
  context.scene.fogDensity = state.fog;
  const instant = input.instant ?? Date.now();
  state.sky.update({
    instant,
    dt,
    quality: context.quality,
    sun: input.sun,
    moon: input.moon,
    topColor: sample.top,
    horizonColor: sample.horizon,
    cloud: state.cloud,
    rain: state.rain,
    cloudLayers: input.weather?.cloudLayers,
    weather: input.weather,
    player: context.scene.activeCamera?.globalPosition ?? input.player,
  });
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
