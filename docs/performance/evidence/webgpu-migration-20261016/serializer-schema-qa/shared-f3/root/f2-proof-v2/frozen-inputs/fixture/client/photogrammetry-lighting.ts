import { MaterialPluginBase } from "@babylonjs/core/Materials/materialPluginBase";
import { ShaderLanguage } from "@babylonjs/core/Materials/shaderLanguage";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import type { UniformBuffer } from "@babylonjs/core/Materials/uniformBuffer";
import type { SubMesh } from "@babylonjs/core/Meshes/subMesh";
import type { AbstractEngine } from "@babylonjs/core/Engines/abstractEngine";
import { PointLight } from "@babylonjs/core/Lights/pointLight";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import type { Scene } from "@babylonjs/core/scene";
import type { RenderQuality } from "../shared/render-quality";
import {
  photogrammetryNodeCenter,
  type PhotogrammetryManifest,
  type PhotogrammetryNode,
  type PhotogrammetryPoint,
} from "../shared/photogrammetry";
import { LAMP_PLACEMENTS } from "../shared/streets";
import annotations from "./data/photogrammetry-lighting.json";

export const PHOTOGRAMMETRY_WINDOW_FACADES = annotations.facades;
export type PhotogrammetryWindowFacade =
  (typeof PHOTOGRAMMETRY_WINDOW_FACADES)[number];
type Point = Pick<PhotogrammetryPoint, "x" | "z">;
type Lamp = Pick<
  (typeof LAMP_PLACEMENTS)[number],
  "id" | "x" | "z" | "groundY" | "height" | "heightProvenance" | "source"
>;
type LightingState = { night: number; activity: number; disposed: boolean };
const pragueTime = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/Prague",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});
const clamp = (x: number) => Math.max(0, Math.min(1, x));
const smooth = (a: number, b: number, x: number) => {
  const t = clamp((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};

/** Fictional group occupancy. It never identifies actual rooms or residents. */
export function photogrammetryNightState(daylight: number, instant: number) {
  const [hour, minute] = pragueTime.format(instant).split(":").map(Number);
  const h = hour + minute / 60;
  const activity =
    h < 5
      ? 0.2 + 0.32 * (1 - smooth(0, 4, h))
      : h < 17
        ? 0.22 + 0.2 * smooth(5, 17, h)
        : 0.42 + 0.28 * smooth(17, 21, h) - 0.14 * smooth(21, 24, h);
  return { night: 1 - smooth(0.025, 0.35, clamp(daylight)), activity };
}

function sourceGlassMask(
  rgb: readonly number[],
  facade: PhotogrammetryWindowFacade,
) {
  const hi = Math.max(...rgb),
    lo = Math.min(...rgb);
  // Green foliage and brightly colored surfaces are excluded even in shadow.
  if (rgb[1] > Math.max(rgb[0], rgb[2]) * 1.07 + 0.01) return 0;
  return (
    (1 -
      smooth(
        facade.sourceDarkThreshold - 0.04,
        facade.sourceDarkThreshold,
        hi,
      )) *
    (1 -
      smooth(
        facade.sourceChromaThreshold - 0.04,
        facade.sourceChromaThreshold,
        hi - lo,
      ))
  );
}

/** CPU mirror of the fragment mask, for source evidence and geometric tests.
 * RGB is the original JPEG's sRGB sample, before night tint or linearization. */
export function photogrammetryWindowMask(
  facade: PhotogrammetryWindowFacade,
  position: PhotogrammetryPoint,
  normal: PhotogrammetryPoint,
  originalSrgb: readonly [number, number, number],
) {
  const dx = position.x - facade.origin[0],
    dz = position.z - facade.origin[1];
  const along = dx * facade.tangent[0] + dz * facade.tangent[1];
  const plane = dx * facade.normal[0] + dz * facade.normal[1];
  const normalLength = Math.hypot(normal.x, normal.y, normal.z);
  if (
    !normalLength ||
    along <= 0.35 ||
    along >= facade.length - 0.35 ||
    Math.abs(plane) >= facade.planeTolerance ||
    Math.abs(normal.y / normalLength) >= 0.45 ||
    Math.abs(
      (normal.x * facade.normal[0] + normal.z * facade.normal[1]) /
        normalLength,
    ) <= 0.8
  )
    return 0;
  const row = Math.floor(
    (facade.topWindowY - position.y) / facade.rowPitch + 0.5,
  );
  if (row < 0 || row >= facade.rowCount) return 0;
  const deltaY = Math.abs(
    position.y - (facade.topWindowY - row * facade.rowPitch),
  );
  return (
    (1 -
      smooth(facade.windowHalfHeight - 0.08, facade.windowHalfHeight, deltaY)) *
    sourceGlassMask(originalSrgb, facade)
  );
}

/** Tile-level broad phase only; the shader still checks actual source fragments. */
export function photogrammetryFacadesForNode(
  node: Pick<PhotogrammetryNode, "center" | "radius">,
  manifest: Pick<
    PhotogrammetryManifest,
    "mercatorOrigin" | "metresPerMercatorUnit" | "worldHeightReference"
  >,
) {
  const center = photogrammetryNodeCenter(node, manifest);
  return PHOTOGRAMMETRY_WINDOW_FACADES.filter((facade) => {
    const dx = center.x - facade.origin[0],
      dz = center.z - facade.origin[1];
    const s = dx * facade.tangent[0] + dz * facade.tangent[1];
    const d = dx * facade.normal[0] + dz * facade.normal[1];
    const ds = s < 0 ? -s : s > facade.length ? s - facade.length : 0;
    const y0 =
      facade.topWindowY - (facade.rowCount - 1) * facade.rowPitch - 0.6;
    const y1 = facade.topWindowY + 0.6;
    const dy =
      center.y < y0 ? y0 - center.y : center.y > y1 ? center.y - y1 : 0;
    return Math.hypot(ds, d, dy) <= node.radius + facade.planeTolerance;
  });
}

const gl = (value: number) =>
  Number(value.toFixed(7)).toString().includes(".")
    ? Number(value.toFixed(7)).toString()
    : `${Number(value.toFixed(7))}.0`;

export function photogrammetryWindowShader(
  facades: PhotogrammetryWindowFacade[],
) {
  const blocks = facades
    .map(
      (f) => `{
    vec2 photoDelta = vPositionW.xz - vec2(${f.origin.map(gl).join(",")});
    float photoS = dot(photoDelta, vec2(${f.tangent.map(gl).join(",")}));
    float photoD = dot(photoDelta, vec2(${f.normal.map(gl).join(",")}));
    if (photoS > 0.35 && photoS < ${gl(f.length - 0.35)} && abs(photoD) < ${gl(f.planeTolerance)} &&
        abs(photoNormal.y) < 0.45 && abs(dot(photoNormal.xz,vec2(${f.normal.map(gl).join(",")}))) > 0.8) {
      float photoRow = floor((${gl(f.topWindowY)}-vPositionW.y)/${gl(f.rowPitch)}+0.5);
      float photoDY = abs(vPositionW.y-(${gl(f.topWindowY)}-photoRow*${gl(f.rowPitch)}));
      float photoMask = (1.0-smoothstep(${gl(f.windowHalfHeight - 0.08)},${gl(f.windowHalfHeight)},photoDY));
      photoMask *= (1.0-smoothstep(${gl(f.sourceDarkThreshold - 0.04)},${gl(f.sourceDarkThreshold)},photoHi));
      photoMask *= (1.0-smoothstep(${gl(f.sourceChromaThreshold - 0.04)},${gl(f.sourceChromaThreshold)},photoHi-photoLo));
      if (photoRow >= 0.0 && photoRow < ${gl(f.rowCount)} && photoSource.g <= max(photoSource.r,photoSource.b)*1.07+0.01) {
        float photoBay = floor(photoS/${gl(f.occupancyBayMetres)});
        // Source-independent, stable fictional pattern; never uses player data.
        float photoOccupancy = fract(sin(photoBay*12.9898+photoRow*78.233+${gl(f.block * 41.719)})*43758.5453);
        float photoLit = 1.0-smoothstep(photoNightSettings.y-0.015,photoNightSettings.y+0.015,photoOccupancy);
        photoEmission = max(photoEmission, photoMask*photoLit);
      }
    }
  }`,
    )
    .join("\n");
  return `
  #ifdef ALBEDO
  if (photoNightSettings.x > 0.001) {
    // The original source sample still uses its unchanged original atlas UV.
    vec3 photoSource = albedoTexture.rgb;
    float photoHi=max(photoSource.r,max(photoSource.g,photoSource.b));
    float photoLo=min(photoSource.r,min(photoSource.g,photoSource.b));
    vec3 photoNormal=normalize(cross(dFdx(vPositionW),dFdy(vPositionW)));
    float photoEmission=0.0;
    ${blocks}
    finalEmissive += vec3(1.0,0.61,0.28)*photoEmission*photoNightSettings.x*0.9;
  }
  #endif
  `;
}

/** Native WGSL counterpart. The original atlas sample stays in main scope;
 * geometric derivatives are prepared before any PBR discard, separately. */
function photogrammetryWindowShaderWgsl(facades: PhotogrammetryWindowFacade[]) {
  const blocks = facades
    .map(
      (f) => `{
    let photoDelta = fragmentInputs.vPositionW.xz - vec2f(${f.origin.map(gl).join(",")});
    let photoS = dot(photoDelta, vec2f(${f.tangent.map(gl).join(",")}));
    let photoD = dot(photoDelta, vec2f(${f.normal.map(gl).join(",")}));
    if (photoS > 0.35 && photoS < ${gl(f.length - 0.35)} && abs(photoD) < ${gl(f.planeTolerance)} &&
        abs(photoNormal.y) < 0.45 && abs(dot(photoNormal.xz,vec2f(${f.normal.map(gl).join(",")}))) > 0.8) {
      let photoRow = floor((${gl(f.topWindowY)}-fragmentInputs.vPositionW.y)/${gl(f.rowPitch)}+0.5);
      let photoDY = abs(fragmentInputs.vPositionW.y-(${gl(f.topWindowY)}-photoRow*${gl(f.rowPitch)}));
      var photoMask = (1.0-smoothstep(${gl(f.windowHalfHeight - 0.08)},${gl(f.windowHalfHeight)},photoDY));
      photoMask *= (1.0-smoothstep(${gl(f.sourceDarkThreshold - 0.04)},${gl(f.sourceDarkThreshold)},photoHi));
      photoMask *= (1.0-smoothstep(${gl(f.sourceChromaThreshold - 0.04)},${gl(f.sourceChromaThreshold)},photoHi-photoLo));
      if (photoRow >= 0.0 && photoRow < ${gl(f.rowCount)} && photoSource.g <= max(photoSource.r,photoSource.b)*1.07+0.01) {
        let photoBay = floor(photoS/${gl(f.occupancyBayMetres)});
        // Same source-independent fictional occupancy; never player data.
        let photoOccupancy = fract(sin(photoBay*12.9898+photoRow*78.233+${gl(f.block * 41.719)})*43758.5453);
        let photoLit = 1.0-smoothstep(uniforms.photoNightSettings.y-0.015,uniforms.photoNightSettings.y+0.015,photoOccupancy);
        photoEmission = max(photoEmission, photoMask*photoLit);
      }
    }
  }`,
    )
    .join("\n");
  return `
  #ifdef ALBEDO
  if (uniforms.photoNightSettings.x > 0.001) {
    let photoSource = albedoTexture.rgb;
    let photoHi=max(photoSource.r,max(photoSource.g,photoSource.b));
    let photoLo=min(photoSource.r,min(photoSource.g,photoSource.b));
    var photoEmission=0.0;
    ${blocks}
    finalEmissive += vec3f(1.0,0.61,0.28)*photoEmission*uniforms.photoNightSettings.x*0.9;
  }
  #endif
  `;
}

export class PhotogrammetryNightPlugin extends MaterialPluginBase {
  constructor(
    material: PBRMaterial,
    readonly facades: PhotogrammetryWindowFacade[],
    private state: LightingState,
  ) {
    // Distinct facade sets need distinct effect cache keys: injected constants
    // must never be reused for a different source tile's facade mask.
    const setId = facades.reduce(
      (n, f) => n + 2 ** PHOTOGRAMMETRY_WINDOW_FACADES.indexOf(f),
      0,
    );
    super(
      material,
      "IPRPhotogrammetryNight",
      210,
      { PHOTO_NIGHT_FACADE_SET: setId },
      true,
      true,
    );
    this.doNotSerialize = true;
    material.metadata = {
      ...material.metadata,
      simulatedNightWindows: true,
      sourceWindowAnnotation: annotations.sourceManifestSha256,
    };
  }
  override isCompatible(language: ShaderLanguage) {
    return language === ShaderLanguage.GLSL || language === ShaderLanguage.WGSL;
  }
  override getUniforms(language = ShaderLanguage.GLSL) {
    return {
      ubo: [{ name: "photoNightSettings", size: 2, type: "vec2" }],
      fragment:
        language === ShaderLanguage.GLSL
          ? "uniform vec2 photoNightSettings;"
          : undefined,
    };
  }
  override bindForSubMesh(
    buffer: UniformBuffer,
    _scene: Scene,
    _engine: AbstractEngine,
    _subMesh: SubMesh,
  ) {
    buffer.updateFloat2(
      "photoNightSettings",
      this.state.disposed ? 0 : this.state.night,
      this.state.activity,
    );
  }
  override getCustomCode(
    type: string,
    language = ShaderLanguage.GLSL,
  ): Record<string, string> | null {
    if (type !== "fragment" || !this.isCompatible(language)) return null;
    // The base constructor collects hook names before facades is initialized.
    const facades = this.facades ?? [];
    if (language === ShaderLanguage.WGSL)
      return {
        CUSTOM_FRAGMENT_MAIN_BEGIN: `
        #ifdef ALBEDO
        let photoNormal=normalize(cross(dpdx(fragmentInputs.vPositionW),dpdy(fragmentInputs.vPositionW)));
        #endif
      `,
        CUSTOM_FRAGMENT_BEFORE_FINALCOLORCOMPOSITION:
          photogrammetryWindowShaderWgsl(facades),
      };
    return {
      CUSTOM_FRAGMENT_EXTENSION:
        "#extension GL_OES_standard_derivatives : enable",
      CUSTOM_FRAGMENT_BEFORE_FINALCOLORCOMPOSITION:
        photogrammetryWindowShader(facades),
    };
  }
}

export type PhotogrammetryLightingOptions = {
  manifest: PhotogrammetryManifest;
  /** Enable only if the caller has no existing source lamp PointLights. */
  lampLights?: boolean;
  lamps?: readonly Lamp[];
};

/** Artistic source-aligned night overlay. Captured daytime shadows remain baked.
 * No added facade mesh, source UV edit, extra JPEG sample, or extra draw call. */
export function createPhotogrammetryLighting(
  scene: Scene,
  options: PhotogrammetryLightingOptions,
) {
  const state: LightingState = { night: 0, activity: 0.5, disposed: false };
  const plugins = new Map<PBRMaterial, PhotogrammetryNightPlugin>();
  const sources = options.lamps ?? LAMP_PLACEMENTS;
  const lights = options.lampLights
    ? [0, 1].map((i) => {
        const light = new PointLight(
          `IPR mapped lamp light ${i}`,
          Vector3.Zero(),
          scene,
        );
        light.diffuse = new Color3(1, 0.76, 0.46);
        light.specular = new Color3(0.4, 0.3, 0.18);
        light.range = 22;
        light.radius = 0.5;
        light.intensity = 0;
        light.setEnabled(false);
        return light;
      })
    : [];
  let activeLampIds: string[] = [];
  let lastSelection = -Infinity;
  let lastHourMinute = -Infinity;
  let lastPlayer: Point = { x: Infinity, z: Infinity };
  let lastQuality: RenderQuality | undefined;
  const update = (input: {
    daylight: number;
    player: Point;
    quality: RenderQuality;
    instant?: number;
  }) => {
    if (state.disposed) return;
    const instant = input.instant ?? Date.now();
    const minute = Math.floor(instant / 60_000);
    if (minute !== lastHourMinute) {
      lastHourMinute = minute;
      state.activity = photogrammetryNightState(
        input.daylight,
        instant,
      ).activity;
    }
    state.night = 1 - smooth(0.025, 0.35, clamp(input.daylight));
    if (
      instant - lastSelection > 400 ||
      instant < lastSelection ||
      input.quality !== lastQuality ||
      Math.hypot(input.player.x - lastPlayer.x, input.player.z - lastPlayer.z) >
        5
    ) {
      lastSelection = instant;
      lastPlayer = { ...input.player };
      lastQuality = input.quality;
      const nearest = sources
        .map((lamp) => ({
          lamp,
          d: Math.hypot(lamp.x - input.player.x, lamp.z - input.player.z),
        }))
        .filter(({ d }) => d < 32)
        .sort((a, b) => a.d - b.d)
        .slice(0, input.quality === "low" ? 1 : 2);
      activeLampIds = [];
      lights.forEach((light, i) => {
        const source = nearest[i]?.lamp;
        if (!source) {
          light.setEnabled(false);
          light.metadata = undefined;
          return;
        }
        light.position.set(
          source.x,
          source.groundY + source.height - 0.2,
          source.z,
        );
        light.metadata = {
          sourceNode: source.id,
          source: source.source,
          heightProvenance: source.heightProvenance,
          simulatedIllumination: true,
          sourcePhotogrammetryUnlit: true,
        };
        activeLampIds.push(source.id);
      });
    }
    for (const light of lights) {
      const enabled = !!light.metadata?.sourceNode && state.night > 0.001;
      light.setEnabled(enabled);
      light.intensity = enabled ? state.night * 0.75 : 0;
    }
  };
  return {
    attach(
      material: PBRMaterial,
      node: Pick<PhotogrammetryNode, "center" | "radius">,
    ) {
      if (state.disposed || plugins.has(material)) return plugins.get(material);
      const facades = photogrammetryFacadesForNode(node, options.manifest);
      if (!facades.length) return undefined;
      const plugin = new PhotogrammetryNightPlugin(material, facades, state);
      plugins.set(material, plugin);
      material.onDisposeObservable.addOnce(() => plugins.delete(material));
      return plugin;
    },
    update,
    stats: () => ({
      sourceWindowFacades: PHOTOGRAMMETRY_WINDOW_FACADES.length,
      activeMaterials: plugins.size,
      mappedLampSources: sources.length,
      lampLights: lights.filter((light) => light.isEnabled()).length,
      activeLampIds: state.night > 0.001 ? [...activeLampIds] : [],
      night: state.night,
      activity: state.activity,
      simulatedOccupancy: true,
      physicalRelighting: false,
      originalAtlasesUnmodified: true,
      addedFacadeDrawCalls: 0,
    }),
    dispose() {
      if (state.disposed) return;
      state.disposed = true;
      lights.forEach((light) => light.dispose());
      plugins.forEach((plugin) => plugin.dispose());
      plugins.clear();
    },
  };
}
