import { MaterialPluginBase } from "@babylonjs/core/Materials/materialPluginBase";
import { ShaderLanguage } from "@babylonjs/core/Materials/shaderLanguage";
import type { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import type { UniformBuffer } from "@babylonjs/core/Materials/uniformBuffer";
import type { Scene } from "@babylonjs/core/scene";
import type { AbstractEngine } from "@babylonjs/core/Engines/abstractEngine";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import type { SubMesh } from "@babylonjs/core/Meshes/subMesh";
import { GRASS_FADE_SECONDS } from "./photo-grass-transition";
export type PhotoGrassWindState = {
  time: number;
  windX: number;
  windZ: number;
  viewerX: number;
  viewerY: number;
  viewerZ: number;
  focusX: number;
  focusZ: number;
  fadeStart: number;
  fadeEnd: number;
};
export const createPhotoGrassWindState = (): PhotoGrassWindState => ({
  time: 0,
  windX: 0,
  windZ: 0,
  viewerX: 0,
  viewerY: 0,
  viewerZ: 0,
  focusX: 0,
  focusZ: 0,
  fadeStart: 6,
  fadeEnd: 9,
});

/** Source pixels remain unchanged. Per-root timing and fixed world-space range
 * are evaluated in the shader, without uploading every fade on every frame. */
export class PhotoGrassWind extends MaterialPluginBase {
  constructor(
    material: PBRMaterial,
    private state: PhotoGrassWindState,
  ) {
    super(material, "PhotographicLeafGrassWind", 220, {}, true, false);
    this.doNotSerialize = true;
    this.registerForExtraEvents = true;
    this._enable(true);
  }
  override isCompatible(language: ShaderLanguage) {
    return language === ShaderLanguage.GLSL;
  }
  override getAttributes(
    attributes: string[],
    _scene: Scene,
    mesh: AbstractMesh,
  ) {
    if (mesh.hasThinInstances) attributes.push("photoGrassFade");
  }
  override getUniforms() {
    return {
      ubo: [
        { name: "photoGrassWind", size: 3, type: "vec3" },
        { name: "photoGrassView", size: 4, type: "vec4" },
        { name: "photoGrassFocus", size: 3, type: "vec3" },
      ],
      vertex:
        "uniform vec3 photoGrassWind; uniform vec4 photoGrassView; uniform vec3 photoGrassFocus;",
    };
  }
  override hardBindForSubMesh(
    buffer: UniformBuffer,
    _scene: Scene,
    _engine: AbstractEngine,
    subMesh: SubMesh,
  ) {
    const state =
      (subMesh.getRenderingMesh().metadata?.photoGrassWind as
        PhotoGrassWindState | undefined) ?? this.state;
    buffer.updateFloat3("photoGrassWind", state.time, state.windX, state.windZ);
    buffer.updateFloat4(
      "photoGrassView",
      state.viewerX,
      state.viewerZ,
      state.fadeStart,
      state.fadeEnd,
    );
    buffer.updateFloat3(
      "photoGrassFocus",
      state.focusX,
      state.focusZ,
      GRASS_FADE_SECONDS,
    );
  }
  override getCustomCode(
    type: string,
    language = ShaderLanguage.GLSL,
  ): Record<string, string> | null {
    if (language !== ShaderLanguage.GLSL) return null;
    if (type === "vertex")
      return {
        CUSTOM_VERTEX_DEFINITIONS: `varying vec2 vPhotoGrassVisibility;
      #ifdef THIN_INSTANCES
      attribute vec4 photoGrassFade;
      #endif`,
        CUSTOM_VERTEX_UPDATE_WORLDPOS: `
        float leafHeight=clamp((positionUpdated.y+0.002)/0.060,0.0,1.0);
        float leafGust=sin(photoGrassWind.x*.85+worldPos.x*1.7+worldPos.z*1.1)*.55+sin(photoGrassWind.x*1.9+worldPos.z*2.1)*.22;
        worldPos.xz+=photoGrassWind.yz*leafGust*leafHeight*leafHeight*.001;
        vPositionW=worldPos.xyz;
        vec2 rootXZ=finalWorld[3].xz;
        vec2 focusDelta=photoGrassFocus.xy-photoGrassView.xy;
        float focusLength=dot(focusDelta,focusDelta);
        float focusT=focusLength>0.00000001?clamp(dot(rootXZ-photoGrassView.xy,focusDelta)/focusLength,0.0,1.0):0.0;
        float rangeDistance=length(rootXZ-photoGrassView.xy-focusDelta*focusT);
        float rangeVisibility=1.0-smoothstep(photoGrassView.z,photoGrassView.w,rangeDistance);
        #ifdef THIN_INSTANCES
        float temporal=smoothstep(0.0,photoGrassFocus.z,photoGrassWind.x-photoGrassFade.z);
        vPhotoGrassVisibility=vec2(photoGrassFade.w,mix(photoGrassFade.x,photoGrassFade.y,temporal)*rangeVisibility);
        #else
        vPhotoGrassVisibility=vec2(0.0,rangeVisibility);
        #endif
      `,
      };
    if (type === "fragment")
      return {
        CUSTOM_FRAGMENT_DEFINITIONS: "varying vec2 vPhotoGrassVisibility;",
        CUSTOM_FRAGMENT_BEFORE_LIGHTS:
          "if(vPhotoGrassVisibility.y<=0.0||vPhotoGrassVisibility.x>vPhotoGrassVisibility.y)discard;",
      };
    return null;
  }
}
