import { ShaderStore } from "@babylonjs/core/Engines/shaderStore";

/** Native equivalents of the retained GLSL recipes. Register once at module
 * initialization; all three materials share the same cloud function/settings.
 * Babylon injects entry-point returns and its render-target Y transform. */
export function registerAtmosphereWgsl(
  cloudEdge: number,
  rayScales: readonly [number, number, number],
) {
  const clouds = `
var atmosphereNoiseSampler: sampler;
var atmosphereNoise: texture_2d<f32>;
uniform atmosphereCoverage: vec3f;
uniform atmosphereLowOffset: vec2f;
uniform atmosphereMidOffset: vec2f;
uniform atmosphereHighOffset: vec2f;
uniform atmosphereCloudDetail: f32;
fn atmosphereDensity(n: f32, coverage: f32) -> f32 {
  if (coverage <= 0.0) { return 0.0; }
  if (coverage >= 1.0) { return 1.0; }
  return smoothstep(1.0 - coverage - ${cloudEdge}, 1.0 - coverage + ${cloudEdge}, n);
}
fn atmosphereLowUV(direction: vec3f) -> vec2f {
  return direction.xz / max(direction.y, .085) * ${rayScales[0]} + uniforms.atmosphereLowOffset;
}
fn atmosphereCloudField(direction: vec3f) -> vec4f {
  if (dot(uniforms.atmosphereCoverage, vec3f(1.0)) < .001) { return vec4f(0.0); }
  let ray = direction.xz / max(direction.y, .085);
  let lowNoise = textureSample(atmosphereNoise, atmosphereNoiseSampler, atmosphereLowUV(direction));
  let low = atmosphereDensity(lowNoise.r, uniforms.atmosphereCoverage.x);
  var mid = 0.0;
  var high = 0.0;
  if (uniforms.atmosphereCoverage.y > .001) {
    let midNoise = textureSample(atmosphereNoise, atmosphereNoiseSampler, ray * ${rayScales[1]} + uniforms.atmosphereMidOffset + vec2f(.37, .11));
    mid = atmosphereDensity(midNoise.g, uniforms.atmosphereCoverage.y) * .86;
  }
  if (uniforms.atmosphereCoverage.z > .001) {
    let highPosition = ray * ${rayScales[2]} + uniforms.atmosphereHighOffset;
    let cirrusRay = vec2f(highPosition.x * .33 + highPosition.y * .53, highPosition.y * 1.42);
    let highNoise = textureSample(atmosphereNoise, atmosphereNoiseSampler, cirrusRay + vec2f(.16, .63));
    high = atmosphereDensity(highNoise.b, uniforms.atmosphereCoverage.z) * .65;
  }
  if (direction.y < -.025) { return vec4f(0.0); }
  return vec4f(vec3f(low, mid, high) * smoothstep(-.025, .015, direction.y), lowNoise.r);
}
fn atmosphereCloudLayers(direction: vec3f) -> vec3f {
  return atmosphereCloudField(direction).xyz;
}
fn atmosphereLayerOpacity(layers: vec3f) -> f32 {
  return 1.0 - (1.0-layers.x)*(1.0-layers.y)*(1.0-layers.z);
}
fn atmosphereCloudOpacity(direction: vec3f) -> f32 {
  return atmosphereLayerOpacity(atmosphereCloudLayers(direction));
}
`;

  ShaderStore.ShadersStoreWGSL.strahovAtmosphereVertexShader = `
attribute position: vec3f;
uniform worldViewProjection: mat4x4f;
varying vAtmosphereDirection: vec3f;
@vertex
fn main(input: VertexInputs) -> FragmentInputs {
  vertexOutputs.vAtmosphereDirection = vertexInputs.position;
  vertexOutputs.position = uniforms.worldViewProjection * vec4f(vertexInputs.position, 1.0);
}`;

  ShaderStore.ShadersStoreWGSL.strahovAtmosphereFragmentShader = `
varying vAtmosphereDirection: vec3f;
uniform topColor: vec3f;
uniform horizonColor: vec3f;
uniform sunDirection: vec3f;
uniform moonDirection: vec3f;
uniform atmosphereLight: vec4f;
uniform atmosphereMood: vec3f;
uniform worldToCatalog: mat3x3f;
var atmosphereStarsSampler: sampler;
var atmosphereStars: texture_2d<f32>;
${clouds}
@fragment
fn main(input: FragmentInputs) -> FragmentOutputs {
  let d = normalize(fragmentInputs.vAtmosphereDirection);
  let elevation = max(d.y, 0.0);
  let day = uniforms.atmosphereLight.x;
  let twilight = uniforms.atmosphereLight.y;
  let moon = uniforms.atmosphereLight.z;
  let stars = uniforms.atmosphereLight.w;
  let sunset = uniforms.atmosphereMood.x;
  let wet = uniforms.atmosphereMood.y;
  let overcast = uniforms.atmosphereMood.z;
  let towardSun = dot(d, uniforms.sunDirection);
  let towardMoon = max(0.0, dot(d, uniforms.moonDirection));
  let rayleigh = .75 * (1.0 + towardSun * towardSun);
  let mie = .36 / pow(max(.035, 1.64 - 1.6 * towardSun), 1.5);
  let horizon = exp(-elevation * 5.2);
  var color = mix(uniforms.horizonColor, uniforms.topColor, smoothstep(-.02, .82, d.y));
  color *= mix(1.0, .91 + .11 * rayleigh, day * (1.0-overcast*.7));
  color += vec3f(.17,.18,.17) * min(mie,8.0) * .13 * day * (1.0-overcast*.8);
  let sunHorizon = pow(max(0.0,towardSun),4.0) * exp(-elevation*4.2);
  color = mix(color, vec3f(.96,.48,.20), sunset*sunHorizon*(1.0-overcast*.55)*.67);
  let antisolar = pow(max(0.0,-towardSun),2.0);
  let belt = exp(-pow((d.y-.16)/.12,2.0)) * antisolar * sunset;
  color = mix(color,vec3f(.47,.30,.42),belt*.30*(1.0-overcast));
  color += vec3f(.024,.017,.014) * horizon * (1.0-day) * (1.0-twilight*.6);
  color += vec3f(.11,.15,.21) * moon * (pow(towardMoon,18.0)*.21 + pow(towardMoon,160.0)*.15);
  if (stars > .001) {
    let equatorial = uniforms.worldToCatalog*d;
    let uv = vec2f(atan2(equatorial.y,equatorial.x)/6.28318530718+.5,
      asin(clamp(equatorial.z,-1.0,1.0))/3.14159265359+.5);
    let starlight = textureSample(atmosphereStars, atmosphereStarsSampler, uv).rgb;
    let extinction = smoothstep(.025,.34,d.y);
    if (d.y > 0.0) { color += starlight * stars * extinction * (1.0-.55*moon*pow(towardMoon,5.0)); }
  }
  var lightSide = 0.0;
  if (uniforms.atmosphereCloudDetail > .5) {
    let keyDirection = select(uniforms.moonDirection, uniforms.sunDirection, day > .01);
    let key = keyDirection.xz / max(.12,length(keyDirection.xz));
    lightSide = textureSample(atmosphereNoise, atmosphereNoiseSampler, atmosphereLowUV(d)+key*.012).r;
  }
  let cloudField = atmosphereCloudField(d);
  let layers = cloudField.xyz;
  let opacity = atmosphereLayerOpacity(layers);
  if (opacity > .001) {
    var thickness = 0.0;
    if (uniforms.atmosphereCoverage.x > .0001) {
      thickness = smoothstep(1.0-uniforms.atmosphereCoverage.x,1.0,cloudField.w);
    }
    let bulk = thickness*.72+layers.y*.28;
    var relief = .5;
    if (uniforms.atmosphereCloudDetail > .5 && layers.x > .001) {
      relief = clamp(.5+(cloudField.w-lightSide)*1.7,0.0,1.0);
    }
    let cloudNight = mix(vec3f(.020,.027,.043),vec3f(.055,.070,.095),moon*.7);
    let shaded = clamp(.18+bulk*.26+(1.0-relief)*.22+wet*.32+overcast*.12,0.0,1.0);
    let cloudDay = mix(vec3f(.94,.95,.97),vec3f(.43,.49,.58),shaded);
    var cloudColor = mix(cloudNight,cloudDay,day);
    cloudColor += vec3f(.14,.10,.13)*twilight*(1.0-day);
    cloudColor = mix(cloudColor,vec3f(.86,.43,.24),sunset*(.16+.64*pow(max(0.0,towardSun),3.0))*(1.0-wet*.55));
    let silver = pow(max(0.0,towardSun),9.0)*(1.0-thickness)*day*(1.0-wet*.5);
    cloudColor += vec3f(.12,.105,.08)*silver;
    cloudColor += vec3f(.05,.075,.12)*moon*pow(towardMoon,12.0)*(1.0-bulk*.6);
    cloudColor = mix(cloudColor,uniforms.horizonColor,horizon*.28);
    color = mix(color,cloudColor,opacity);
  }
  fragmentOutputs.color = vec4f(max(color,vec3f(0.0)),1.0);
}`;

  ShaderStore.ShadersStoreWGSL.strahovCelestialVertexShader = `
attribute position: vec3f;
uniform worldViewProjection: mat4x4f;
uniform world: mat4x4f;
uniform skyObserver: vec3f;
uniform farDepth: f32;
varying vSkyRay: vec3f;
varying vDisc: vec2f;
@vertex
fn main(input: VertexInputs) -> FragmentInputs {
  vertexOutputs.vDisc = vertexInputs.position.xy;
  vertexOutputs.vSkyRay = (uniforms.world*vec4f(vertexInputs.position,1.0)).xyz-uniforms.skyObserver;
  vertexOutputs.position = uniforms.worldViewProjection*vec4f(vertexInputs.position,1.0);
  vertexOutputs.position.z = uniforms.farDepth*vertexOutputs.position.w;
}`;

  ShaderStore.ShadersStoreWGSL.strahovSunFragmentShader = `
varying vSkyRay: vec3f;
${clouds}
varying vDisc: vec2f;
uniform altitude: f32;
uniform angularRadius: f32;
uniform upY: f32;
uniform strength: f32;
@fragment
fn main(input: FragmentInputs) -> FragmentOutputs {
  let p = fragmentInputs.vDisc*6.0;
  let radius = length(p);
  let cloudOpacity = atmosphereCloudOpacity(normalize(fragmentInputs.vSkyRay));
  if (sin(uniforms.altitude)+uniforms.upY*uniforms.angularRadius*p.y<0.0) { discard; }
  let disc = 1.0-smoothstep(.99,1.01,radius);
  let halo = exp(-radius*radius*.16)*.12;
  let warm = 1.0-smoothstep(0.0,.28,uniforms.altitude);
  let color = mix(vec3f(1.0,.97,.86),vec3f(1.0,.67,.32),warm*.75);
  fragmentOutputs.color = vec4f(color,max(disc,halo)*uniforms.strength*(1.0-cloudOpacity));
}`;

  ShaderStore.ShadersStoreWGSL.strahovMoonFragmentShader = `
varying vSkyRay: vec3f;
${clouds}
varying vDisc: vec2f;
var moonMapSampler: sampler;
var moonMap: texture_2d<f32>;
uniform lightDirection: vec3f;
uniform skyColor: vec3f;
uniform daylight: f32;
uniform altitude: f32;
uniform angularRadius: f32;
uniform upY: f32;
uniform textureAngle: f32;
uniform strength: f32;
@fragment
fn main(input: FragmentInputs) -> FragmentOutputs {
  let r2 = dot(fragmentInputs.vDisc,fragmentInputs.vDisc);
  let normal = vec3f(fragmentInputs.vDisc,sqrt(max(0.0,1.0-r2)));
  let cs = cos(uniforms.textureAngle);
  let sn = sin(uniforms.textureAngle);
  let textureNormal = vec3f(normal.x*cs-normal.y*sn,normal.x*sn+normal.y*cs,normal.z);
  let uv = vec2f(.5+atan2(textureNormal.x,textureNormal.z)/6.28318530718,
    .5-asin(clamp(textureNormal.y,-1.0,1.0))/3.14159265359);
  let albedo = textureSample(moonMap, moonMapSampler, uv).rgb;
  let cloudOpacity = atmosphereCloudOpacity(normalize(fragmentInputs.vSkyRay));
  if (r2>1.0 || sin(uniforms.altitude)+uniforms.upY*uniforms.angularRadius*fragmentInputs.vDisc.y<0.0) { discard; }
  let cosine = dot(normal,uniforms.lightDirection);
  let lit = pow(max(cosine,0.0),.32)*smoothstep(-.006,.006,cosine);
  let earthshine = .035*(1.0-uniforms.daylight)*(1.0-(uniforms.lightDirection.z+1.0)*.5);
  var color = albedo*(lit*1.7+earthshine);
  color = mix(color,uniforms.skyColor+color*.3,uniforms.daylight*.78);
  let edge = 1.0-smoothstep(.992,1.0,sqrt(r2));
  let visibleSurface = mix(1.0,smoothstep(-.006,.04,cosine),uniforms.daylight);
  fragmentOutputs.color = vec4f(color,edge*visibleSurface*uniforms.strength*(1.0-cloudOpacity));
}`;
}
