import { ShaderMaterial } from "@babylonjs/core/Materials/shaderMaterial";
import { RawTexture } from "@babylonjs/core/Materials/Textures/rawTexture";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import { Effect } from "@babylonjs/core/Materials/effect";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Vector2, Vector3, Vector4 } from "@babylonjs/core/Maths/math.vector";
import type { Scene } from "@babylonjs/core/scene";
import { worldToJ2000Matrix } from "../shared/astronomy";
import type { Weather } from "../shared/weather";
import {
  celestialTransmission,
  lunarRelativeIrradiance,
} from "./atmosphere-light";
import starCatalog from "./data/bright-stars.json";

type Direction = { x: number; y: number; z: number; altitude: number };
type Wind = { x: number; z: number };
type Layers = { low: number; mid: number; high: number };
type RGB = { r: number; g: number; b: number };
export interface AtmosphereSkyInput {
  /** Actual UTC epoch milliseconds, shared by stars, sun and moon. */
  instant: number;
  dt?: number;
  quality?: string;
  sun: Direction;
  moon?: Direction & { fraction?: number; distance?: number };
  cloud: number;
  rain: number;
  cloudLayers?: Layers;
  /** Travel vectors, m/s; convert meteorological FROM bearing before passing. */
  cloudWind?: Wind;
  cloudWinds?: { low: Wind; mid: Wind; high: Wind };
  player?: { x: number; z: number };
  topColor?: RGB;
  horizonColor?: RGB;
  weather?: Pick<Weather, "cloud" | "rain" | "wind"> & Partial<Weather>;
}

const clamp = (x: number, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, x));
const smooth = (lo: number, hi: number, x: number) => {
  const t = clamp((x - lo) / (hi - lo));
  return t * t * (3 - 2 * t);
};
const TAU = Math.PI * 2;
const NIGHT_TOP = new Color3(0.018, 0.029, 0.065);
const DAY_TOP = new Color3(0.2, 0.39, 0.65);
const NIGHT_HORIZON = new Color3(0.045, 0.055, 0.09);
const DAY_HORIZON = new Color3(0.69, 0.77, 0.84);
const CLOUD_EDGE = 0.075;
// Metre scales and ray coefficients preserve nominal layer heights.
const CLOUD_SCALES = [4000, 9500, 38000] as const;
const CLOUD_RAY_SCALES = [
  1400 / CLOUD_SCALES[0],
  3510 / CLOUD_SCALES[1],
  8512 / CLOUD_SCALES[2],
] as const;

/** Calibrated atlas ranks make this the requested covered fraction of a layer. */
export function atmosphereCloudDensity(rank: number, coverage: number) {
  if (coverage <= 0) return 0;
  if (coverage >= 1) return 1;
  return smooth(1 - coverage - CLOUD_EDGE, 1 - coverage + CLOUD_EDGE, rank);
}

/** Rendering limits are authored for a light-polluted city, not measured sky brightness. */
export function atmosphereVisibility(
  sunAltitude: number,
  moonAltitude: number,
  moonFraction: number,
  rain: number,
  moonDistance?: number,
) {
  const day = smooth(-0.055, 0.18, sunAltitude);
  const twilight = smooth(-0.315, -0.035, sunAltitude);
  const moon =
    celestialTransmission(moonAltitude) *
    lunarRelativeIrradiance(moonFraction, moonDistance) *
    (1 - day);
  return {
    day,
    twilight,
    moon,
    stars:
      (1 - smooth(-0.27, -0.085, sunAltitude)) *
      (1 - 0.56 * moon) *
      (1 - clamp(rain / 8) * 0.8),
    sunset:
      (1 - smooth(0.035, 0.3, sunAltitude)) * smooth(-0.2, -0.005, sunAltitude),
  };
}

export const ATMOSPHERE_CLOUD_UNIFORMS = [
  "atmosphereCoverage",
  "atmosphereLowOffset",
  "atmosphereMidOffset",
  "atmosphereHighOffset",
  "atmosphereCloudDetail",
];
export const ATMOSPHERE_CLOUD_SAMPLERS = ["atmosphereNoise"];

/** Shared by opaque sky and celestial discs: the same clouds occlude all bodies.
 * All positions are camera-relative ray directions, +X east / +Z south.
 * Three curved-horizon planar layers approximate cloud shape, not a forecast image.
 */
export const ATMOSPHERE_CLOUD_GLSL = `
uniform sampler2D atmosphereNoise;
uniform vec3 atmosphereCoverage;
uniform vec2 atmosphereLowOffset;
uniform vec2 atmosphereMidOffset;
uniform vec2 atmosphereHighOffset;
uniform float atmosphereCloudDetail;
float atmosphereDensity(float n, float coverage) {
  if (coverage <= 0.0) return 0.0;
  if (coverage >= 1.0) return 1.0;
  return smoothstep(1.0 - coverage - ${CLOUD_EDGE}, 1.0 - coverage + ${CLOUD_EDGE}, n);
}
vec2 atmosphereLowUV(vec3 direction) {
  return direction.xz / max(direction.y, .085) * ${CLOUD_RAY_SCALES[0]} + atmosphereLowOffset;
}
vec4 atmosphereCloudField(vec3 direction) {
  if (direction.y < -.025 || dot(atmosphereCoverage, vec3(1.0)) < .001) return vec4(0.0);
  vec2 ray = direction.xz / max(direction.y, .085);
  vec4 lowNoise = texture2D(atmosphereNoise, atmosphereLowUV(direction));
  float low = atmosphereDensity(lowNoise.r, atmosphereCoverage.x);
  float mid = 0.0;
  float high = 0.0;
  if (atmosphereCoverage.y > .001) {
    vec4 midNoise = texture2D(atmosphereNoise, ray * ${CLOUD_RAY_SCALES[1]} + atmosphereMidOffset + vec2(.37, .11));
    mid = atmosphereDensity(midNoise.g, atmosphereCoverage.y) * .86;
  }
  if (atmosphereCoverage.z > .001) {
    vec2 highPosition = ray * ${CLOUD_RAY_SCALES[2]} + atmosphereHighOffset;
    vec2 cirrusRay = vec2(highPosition.x * .33 + highPosition.y * .53, highPosition.y * 1.42);
    vec4 highNoise = texture2D(atmosphereNoise, cirrusRay + vec2(.16, .63));
    high = atmosphereDensity(highNoise.b, atmosphereCoverage.z) * .65;
  }
  return vec4(vec3(low, mid, high) * smoothstep(-.025, .015, direction.y), lowNoise.r);
}
vec3 atmosphereCloudLayers(vec3 direction) {
  return atmosphereCloudField(direction).xyz;
}
float atmosphereLayerOpacity(vec3 layers) {
  return 1.0 - (1.0-layers.x)*(1.0-layers.y)*(1.0-layers.z);
}
float atmosphereCloudOpacity(vec3 direction) {
  return atmosphereLayerOpacity(atmosphereCloudLayers(direction));
}
`;

Effect.ShadersStore.strahovAtmosphereVertexShader = `
precision highp float;
attribute vec3 position;
uniform mat4 worldViewProjection;
varying vec3 vAtmosphereDirection;
void main(void) {
  vAtmosphereDirection = position;
  gl_Position = worldViewProjection * vec4(position, 1.0);
}`;

Effect.ShadersStore.strahovAtmosphereFragmentShader = `
precision highp float;
varying vec3 vAtmosphereDirection;
uniform vec3 topColor;
uniform vec3 horizonColor;
uniform vec3 sunDirection;
uniform vec3 moonDirection;
uniform vec4 atmosphereLight;
uniform vec3 atmosphereMood;
uniform mat3 worldToCatalog;
uniform sampler2D atmosphereStars;
${ATMOSPHERE_CLOUD_GLSL}
void main(void) {
  vec3 d = normalize(vAtmosphereDirection);
  float elevation = max(d.y, 0.0);
  float day = atmosphereLight.x;
  float twilight = atmosphereLight.y;
  float moon = atmosphereLight.z;
  float stars = atmosphereLight.w;
  float sunset = atmosphereMood.x;
  float wet = atmosphereMood.y;
  float overcast = atmosphereMood.z;
  float towardSun = dot(d, sunDirection);
  float towardMoon = max(0.0, dot(d, moonDirection));
  // Rayleigh angular dependence plus bounded Henyey-Greenstein forward lobe.
  float rayleigh = .75 * (1.0 + towardSun * towardSun);
  float mie = .36 / pow(max(.035, 1.64 - 1.6 * towardSun), 1.5);
  float horizon = exp(-elevation * 5.2);
  vec3 color = mix(horizonColor, topColor, smoothstep(-.02, .82, d.y));
  color *= mix(1.0, .91 + .11 * rayleigh, day * (1.0-overcast*.7));
  color += vec3(.17,.18,.17) * min(mie,8.0) * .13 * day * (1.0-overcast*.8);
  float sunHorizon = pow(max(0.0,towardSun),4.0) * exp(-elevation*4.2);
  color = mix(color, vec3(.96,.48,.20), sunset*sunHorizon*(1.0-overcast*.55)*.67);
  // Broad pink anti-solar twilight belt, bounded above the Earth's shadow.
  float antisolar = pow(max(0.0,-towardSun),2.0);
  float belt = exp(-pow((d.y-.16)/.12,2.0)) * antisolar * sunset;
  color = mix(color,vec3(.47,.30,.42),belt*.30*(1.0-overcast));
  // Urban light dome is an artistic, explicitly unmeasured Prague skyglow.
  color += vec3(.024,.017,.014) * horizon * (1.0-day) * (1.0-twilight*.6);
  color += vec3(.11,.15,.21) * moon * (pow(towardMoon,18.0)*.21 + pow(towardMoon,160.0)*.15);
  if (stars > .001 && d.y > 0.0) {
    vec3 equatorial = worldToCatalog*d;
    vec2 uv = vec2(atan(equatorial.y,equatorial.x)/6.28318530718+.5,
      asin(clamp(equatorial.z,-1.0,1.0))/3.14159265359+.5);
    vec3 starlight = texture2D(atmosphereStars,uv).rgb;
    float extinction = smoothstep(.025,.34,d.y);
    color += starlight * stars * extinction * (1.0-.55*moon*pow(towardMoon,5.0));
  }
  vec4 cloudField = atmosphereCloudField(d);
  vec3 layers = cloudField.xyz;
  float opacity = atmosphereLayerOpacity(layers);
  if (opacity > .001) {
    // Keep unthresholded cloud height: opaque interiors still have billowed relief.
    float thickness = atmosphereCoverage.x > .0001 ? smoothstep(1.0-atmosphereCoverage.x,1.0,cloudField.w) : 0.0;
    float bulk = thickness*.72+layers.y*.28;
    float relief = .5;
    if (atmosphereCloudDetail > .5 && layers.x > .001) {
      vec3 keyDirection = day > .01 ? sunDirection : moonDirection;
      vec2 key = keyDirection.xz / max(.12,length(keyDirection.xz));
      float lightSide = texture2D(atmosphereNoise,atmosphereLowUV(d)+key*.012).r;
      relief = clamp(.5+(cloudField.w-lightSide)*1.7,0.0,1.0);
    }
    vec3 cloudNight = mix(vec3(.020,.027,.043),vec3(.055,.070,.095),moon*.7);
    float shaded = clamp(.18+bulk*.26+(1.0-relief)*.22+wet*.32+overcast*.12,0.0,1.0);
    vec3 cloudDay = mix(vec3(.94,.95,.97),vec3(.43,.49,.58),shaded);
    vec3 cloudColor = mix(cloudNight,cloudDay,day);
    cloudColor += vec3(.14,.10,.13)*twilight*(1.0-day);
    cloudColor = mix(cloudColor,vec3(.86,.43,.24),sunset*(.16+.64*pow(max(0.0,towardSun),3.0))*(1.0-wet*.55));
    float silver = pow(max(0.0,towardSun),9.0)*(1.0-thickness)*day*(1.0-wet*.5);
    cloudColor += vec3(.12,.105,.08)*silver;
    cloudColor += vec3(.05,.075,.12)*moon*pow(towardMoon,12.0)*(1.0-bulk*.6);
    // Haze merges distant cloud bases into the same horizon as scenery fog.
    cloudColor = mix(cloudColor,horizonColor,horizon*.28);
    color = mix(color,cloudColor,opacity);
  }
  gl_FragColor = vec4(max(color,vec3(0.0)),1.0);
}`;

function cloudHash(x: number, y: number, seed: number) {
  let h = x * 374761393 + y * 668265263 + seed * 1013904223;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

/** Rounded periodic cellular lobes, blended with FBM before rank calibration. */
function cumulusLobes(size: number) {
  const period = 8,
    mask = period - 1;
  const points = new Float32Array(period * period * 2);
  for (let y = 0; y < period; y++)
    for (let x = 0; x < period; x++) {
      const i = (y * period + x) * 2;
      points[i] = 0.12 + 0.76 * cloudHash(x, y, 127);
      points[i + 1] = 0.12 + 0.76 * cloudHash(x, y, 193);
    }
  const lobes = new Float32Array(size * size);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const px = (x / size) * period,
        py = (y / size) * period;
      const ix = Math.floor(px),
        iy = Math.floor(py);
      let nearest = 4;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const i = (((iy + dy) & mask) * period + ((ix + dx) & mask)) * 2;
          const qx = ix + dx + points[i] - px,
            qy = iy + dy + points[i + 1] - py;
          nearest = Math.min(nearest, qx * qx + qy * qy);
        }
      lobes[y * size + x] = 1 - smooth(0.1, 0.85, Math.sqrt(nearest));
    }
  return lobes;
}

/** Immutable periodic cloud rank atlas, generated once, never per frame.
 * A measured empirical CDF makes n>1-coverage occupy the requested texture area.
 */
export function atmosphereNoisePixels(size = 256) {
  const data = new Uint8Array(size * size * 4);
  const accumulation = new Float32Array(size * size);
  const lobes = cumulusLobes(size);
  const histogram = new Uint32Array(4096),
    cdf = new Float32Array(4096);
  // Hash only lattice points, then interpolate: no per-pixel closures or hashes.
  for (let channel = 0; channel < 3; channel++) {
    accumulation.fill(0);
    let amplitude = 1,
      weight = 0;
    for (let octave = 0; octave < 5; octave++) {
      const frequency = 4 * 2 ** octave,
        mask = frequency - 1;
      const grid = new Float32Array(frequency * frequency),
        indices = new Uint16Array(size),
        blend = new Float32Array(size);
      for (let y = 0; y < frequency; y++)
        for (let x = 0; x < frequency; x++) {
          grid[y * frequency + x] = cloudHash(x, y, 17 + channel * 29);
        }
      for (let x = 0; x < size; x++) {
        const coordinate = (x / size) * frequency,
          t = coordinate - Math.floor(coordinate);
        indices[x] = Math.floor(coordinate);
        blend[x] = t * t * (3 - 2 * t);
      }
      for (let y = 0; y < size; y++) {
        const iy = indices[y],
          nextY = ((iy + 1) & mask) * frequency,
          v = blend[y],
          row = iy * frequency;
        for (let x = 0; x < size; x++) {
          const ix = indices[x],
            nextX = (ix + 1) & mask,
            u = blend[x];
          const a = grid[row + ix],
            b = grid[row + nextX],
            c = grid[nextY + ix],
            d = grid[nextY + nextX];
          accumulation[y * size + x] +=
            ((a + (b - a) * u) * (1 - v) + (c + (d - c) * u) * v) * amplitude;
        }
      }
      weight += amplitude;
      amplitude *= 0.57;
    }
    histogram.fill(0);
    for (let pixel = 0; pixel < size * size; pixel++) {
      const fbm = accumulation[pixel] / weight;
      const density = channel === 0 ? fbm * 0.9 + lobes[pixel] * 0.1 : fbm;
      accumulation[pixel] = Math.min(
        4095,
        Math.max(0, Math.floor(density * 4095)),
      );
      histogram[accumulation[pixel]]++;
    }
    let count = 0;
    for (let bin = 0; bin < histogram.length; bin++) {
      cdf[bin] = (count + histogram[bin] * 0.5) / (size * size);
      count += histogram[bin];
    }
    for (let pixel = 0; pixel < size * size; pixel++) {
      data[pixel * 4 + channel] = Math.round(255 * cdf[accumulation[pixel]]);
      data[pixel * 4 + 3] = 255;
    }
  }
  return data;
}

/** Gaussian angular footprints, seamless in RA and widened near the pole.
 * Magnitudes and B-V are real; display brightness, PSF and colour are artistic.
 */
export function atmosphereStarPixels(
  width = 2048,
  height = 1024,
  catalog: ReadonlyArray<ReadonlyArray<number | string>> = starCatalog.stars,
) {
  const pixels = new Uint8Array(width * height * 4);
  for (const row of catalog) {
    const ra = Number(row[2]),
      dec = Number(row[3]),
      magnitude = Number(row[4]),
      bv = Number(row[5]);
    const cx = ((ra / 24 + 0.5) % 1) * width - 0.5,
      cy = (dec / 180 + 0.5) * height - 0.5;
    const originalSigma = 0.6 + Math.max(0, 2 - magnitude) * 0.09;
    const sigmaY = 0.41 + Math.max(0, 2 - magnitude) * 0.085;
    const sigmaX =
      ((sigmaY / Math.max(0.013, Math.cos((dec * Math.PI) / 180))) * width) /
      (height * 2);
    const brightness = Math.min(1, 0.075 * 10 ** (-0.26 * (magnitude - 4.5)));
    const warm = clamp((bv + 0.1) / 1.6);
    const color = [
      1 - 0.25 * (1 - warm),
      0.84 + 0.13 * (1 - Math.abs(warm - 0.45)),
      1 - 0.4 * warm,
    ];
    const rx = Math.ceil(sigmaX * 3),
      ry = Math.ceil(sigmaY * 3);
    const indices: number[] = [],
      weights: number[] = [];
    for (
      let y = Math.max(0, Math.floor(cy) - ry);
      y <= Math.min(height - 1, Math.ceil(cy) + ry);
      y++
    )
      for (let x = Math.floor(cx) - rx; x <= Math.ceil(cx) + rx; x++) {
        const gaussian = Math.exp(
          -0.5 * (((x - cx) / sigmaX) ** 2 + ((y - cy) / sigmaY) ** 2),
        );
        const index = (y * width + (((x % width) + width) % width)) * 4;
        indices.push(index);
        weights.push(gaussian);
      }
    // Preserve integrated point energy across subpixel placement. A bounded
    // photographic response gives bright cores without clipping away flux.
    const flux =
      brightness * TAU * sigmaX * sigmaY * (originalSigma / sigmaY) ** 2 * 1.6;
    let lo = 0,
      hi = 256;
    for (let iteration = 0; iteration < 20; iteration++) {
      const scale = (lo + hi) * 0.5;
      let sum = 0;
      for (const weight of weights)
        sum += (scale * weight) / (1 + scale * weight);
      if (sum < flux) lo = scale;
      else hi = scale;
    }
    const scale = (lo + hi) * 0.5;
    for (let point = 0; point < weights.length; point++) {
      const weighted = scale * weights[point];
      const energy = weighted / (1 + weighted),
        index = indices[point];
      for (let c = 0; c < 3; c++)
        pixels[index + c] = Math.min(
          255,
          pixels[index + c] + Math.round(255 * energy * color[c]),
        );
      pixels[index + 3] = 255;
    }
  }
  return pixels;
}

/** The caller owns its dome mesh; this handle owns material and both GPU textures. */
export function createAtmosphereSky(scene: Scene, quality: string) {
  const lowQuality = quality === "low";
  const noise = RawTexture.CreateRGBATexture(
    atmosphereNoisePixels(),
    256,
    256,
    scene,
    true,
    false,
    Texture.TRILINEAR_SAMPLINGMODE,
  );
  noise.name = "atmosphere:periodic-cloud-noise";
  noise.wrapU = noise.wrapV = Texture.WRAP_ADDRESSMODE;
  noise.gammaSpace = false;
  const starWidth = lowQuality ? 1024 : 2048,
    starHeight = starWidth / 2;
  const stars = RawTexture.CreateRGBATexture(
    atmosphereStarPixels(starWidth, starHeight),
    starWidth,
    starHeight,
    scene,
    true,
    false,
    Texture.TRILINEAR_SAMPLINGMODE,
  );
  stars.name = "atmosphere:HYG-v4.1-bright-stars";
  stars.wrapU = Texture.WRAP_ADDRESSMODE;
  stars.wrapV = Texture.CLAMP_ADDRESSMODE;
  stars.gammaSpace = false;
  const material = new ShaderMaterial(
    "art:atmosphere-sky",
    scene,
    "strahovAtmosphere",
    {
      attributes: ["position"],
      uniforms: [
        "worldViewProjection",
        "topColor",
        "horizonColor",
        "sunDirection",
        "moonDirection",
        "atmosphereLight",
        "atmosphereMood",
        "worldToCatalog",
        ...ATMOSPHERE_CLOUD_UNIFORMS,
      ],
      samplers: ["atmosphereStars", ...ATMOSPHERE_CLOUD_SAMPLERS],
    },
  );
  material.backFaceCulling = false;
  material.disableDepthWrite = true;
  material.setTexture("atmosphereStars", stars);
  const cloudMaterials = new Set<ShaderMaterial>([material]);
  const coverage = new Vector3(),
    offsets = [new Vector2(), new Vector2(), new Vector2()];
  const drift = [new Vector2(), new Vector2(), new Vector2()];
  const smoothedWind = [new Vector2(), new Vector2(), new Vector2()];
  const sun = new Vector3(),
    moon = new Vector3(),
    top = new Color3(),
    horizon = new Color3();
  const light = new Vector4(),
    mood = new Vector3();
  const matrix = new Float32Array(9);
  let previousInstant: number | undefined,
    matrixInstant = NaN,
    disposed = false,
    cloudDetail = lowQuality ? 0 : 1;
  const bind = (target: ShaderMaterial) => {
    target.setVector3("atmosphereCoverage", coverage);
    target.setVector2("atmosphereLowOffset", offsets[0]);
    target.setVector2("atmosphereMidOffset", offsets[1]);
    target.setVector2("atmosphereHighOffset", offsets[2]);
    target.setFloat("atmosphereCloudDetail", cloudDetail);
  };
  material.setTexture("atmosphereNoise", noise);
  bind(material);
  const update = (input: AtmosphereSkyInput) => {
    if (disposed) return;
    cloudDetail = (input.quality ?? quality) === "low" ? 0 : 1;
    const visibility = atmosphereVisibility(
      input.sun.altitude,
      input.moon?.altitude ?? -1,
      input.moon?.fraction ?? 0,
      input.rain,
      input.moon?.distance,
    );
    sun.set(input.sun.x, input.sun.y, input.sun.z);
    moon.set(input.moon?.x ?? 0, input.moon?.y ?? -1, input.moon?.z ?? 0);
    material.setVector3("sunDirection", sun);
    material.setVector3("moonDirection", moon);
    light.set(
      visibility.day,
      visibility.twilight,
      visibility.moon,
      visibility.stars,
    );
    mood.set(visibility.sunset, clamp(input.rain / 8), clamp(input.cloud));
    material.setVector4("atmosphereLight", light);
    material.setVector3("atmosphereMood", mood);
    if (input.topColor)
      top.set(input.topColor.r, input.topColor.g, input.topColor.b);
    else Color3.LerpToRef(NIGHT_TOP, DAY_TOP, visibility.day, top);
    if (input.horizonColor)
      horizon.set(
        input.horizonColor.r,
        input.horizonColor.g,
        input.horizonColor.b,
      );
    else Color3.LerpToRef(NIGHT_HORIZON, DAY_HORIZON, visibility.day, horizon);
    material.setColor3("topColor", top);
    material.setColor3("horizonColor", horizon);
    if (
      !Number.isFinite(matrixInstant) ||
      Math.abs(input.instant - matrixInstant) >= 1000
    ) {
      worldToJ2000Matrix(input.instant, matrix);
      material.setMatrix3x3("worldToCatalog", matrix);
      matrixInstant = input.instant;
    }
    const layers = input.cloudLayers ?? input.weather?.cloudLayers;
    // Integrating travel avoids jumps when weather changes. The initial UTC phase
    // is deterministic; time travel reinitializes rather than integrating days.
    const dt =
      previousInstant === undefined
        ? Infinity
        : (input.instant - previousInstant) / 1000;
    const reset = !Number.isFinite(dt) || Math.abs(dt) > 30;
    const elapsed = Math.max(0, Math.min(0.1, input.dt ?? (reset ? 0 : dt)));
    const response = reset ? 1 : 1 - Math.exp(-elapsed / 5);
    coverage.x += (clamp(layers?.low ?? input.cloud) - coverage.x) * response;
    coverage.y +=
      (clamp(layers?.mid ?? input.cloud * 0.7) - coverage.y) * response;
    coverage.z +=
      (clamp(layers?.high ?? input.cloud * 0.45) - coverage.z) * response;
    const phase = (((input.instant / 1000) % 86400) + 86400) % 86400;
    for (let layer = 0; layer < 3; layer++) {
      const wind =
        layer === 0
          ? input.cloudWinds?.low
          : layer === 1
            ? input.cloudWinds?.mid
            : input.cloudWinds?.high;
      const speed = wind ?? input.cloudWind;
      const model =
        layer === 0
          ? input.weather?.cloudWinds?.low
          : layer === 1
            ? input.weather?.cloudWinds?.mid
            : input.weather?.cloudWinds?.high;
      const bearing =
        ((model?.direction ?? input.weather?.windDirection ?? 0) * TAU) / 360;
      const magnitude = clamp(model?.speed ?? input.weather?.wind ?? 0, 0, 100);
      const wx = speed?.x ?? -Math.sin(bearing) * magnitude;
      const wz = speed?.z ?? Math.cos(bearing) * magnitude;
      smoothedWind[layer].x += (wx - smoothedWind[layer].x) * response;
      smoothedWind[layer].y += (wz - smoothedWind[layer].y) * response;
      const scale = CLOUD_SCALES[layer];
      if (reset)
        drift[layer].set(
          (smoothedWind[layer].x * phase) / scale,
          (smoothedWind[layer].y * phase) / scale,
        );
      else {
        drift[layer].x += (smoothedWind[layer].x * elapsed) / scale;
        drift[layer].y += (smoothedWind[layer].y * elapsed) / scale;
      }
      drift[layer].x %= 1;
      drift[layer].y %= 1;
      offsets[layer].set(
        (input.player?.x ?? 0) / scale - drift[layer].x,
        (input.player?.z ?? 0) / scale - drift[layer].y,
      );
    }
    previousInstant = input.instant;
    for (const target of cloudMaterials) bind(target);
  };
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    cloudMaterials.clear();
    material.dispose();
    noise.dispose();
    stars.dispose();
    scene.onDisposeObservable.remove(disposeObserver);
  };
  const disposeObserver = scene.onDisposeObservable.add(dispose);
  return {
    material,
    update,
    /** Register once after adding shared cloud GLSL/uniforms/sampler to a shader. */
    bindClouds(target: ShaderMaterial) {
      if (!disposed) {
        cloudMaterials.add(target);
        target.setTexture("atmosphereNoise", noise);
        bind(target);
      }
      return () => cloudMaterials.delete(target);
    },
    dispose,
  };
}

export type AtmosphereSky = ReturnType<typeof createAtmosphereSky>;
