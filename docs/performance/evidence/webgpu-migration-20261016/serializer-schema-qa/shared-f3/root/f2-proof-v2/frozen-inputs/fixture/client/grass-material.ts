import "./render-shaders";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { MaterialPluginBase } from "@babylonjs/core/Materials/materialPluginBase";
import { ShaderLanguage } from "@babylonjs/core/Materials/shaderLanguage";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import type { Scene } from "@babylonjs/core/scene";
import type { UniformBuffer } from "@babylonjs/core/Materials/uniformBuffer";

export type GrassWindState = {
  time: number;
  windX: number;
  windZ: number;
  playerX: number;
  playerY: number;
  playerZ: number;
  range: number;
};

const WGSL_VERTEX = Object.freeze({
  CUSTOM_VERTEX_DEFINITIONS: "varying vCampusGrass: vec3f;",
  CUSTOM_VERTEX_UPDATE_WORLDPOS: `
    let grassGust = sin(uniforms.grassWind.x * 0.85 + worldPos.x * 0.07 + worldPos.z * 0.11) * 0.55
      + sin(uniforms.grassWind.x * 1.9 + worldPos.x * 0.21) * 0.22;
    let grassDisplacement = uniforms.grassWind.yz * grassGust * positionUpdated.y * positionUpdated.y * 0.004;
    worldPos = vec4f(worldPos.x+grassDisplacement.x,worldPos.y,worldPos.z+grassDisplacement.y,worldPos.w);
    vertexOutputs.vPositionW = worldPos.xyz;
    vertexOutputs.vCampusGrass = vec3f(fract(sin(dot(finalWorld[3].xz,vec2f(12.9898,78.233))) * 43758.5453),
      clamp(positionUpdated.y,0.0,1.0), distance(worldPos.xyz,uniforms.grassViewer.xyz));
  `,
});
const WGSL_FRAGMENT = Object.freeze({
  CUSTOM_FRAGMENT_DEFINITIONS: "varying vCampusGrass: vec3f;",
  CUSTOM_FRAGMENT_BEFORE_LIGHTS: `
    let grassFade = 1.0 - smoothstep(uniforms.grassViewer.w * 0.72, uniforms.grassViewer.w, fragmentInputs.vCampusGrass.z);
    if (fragmentInputs.vCampusGrass.x > grassFade) { discard; }
    surfaceAlbedo *= mix(0.74,1.1,fragmentInputs.vCampusGrass.y) * (0.88 + fragmentInputs.vCampusGrass.x * 0.16);
  `,
});

/** Thin-instanced grass uses the same PBR lights, fog and cast shadows as the
 * ground. The plugin adds only wind/colour/fade; it emits no independent light.
 */
export class GrassWindPlugin extends MaterialPluginBase {
  constructor(
    material: PBRMaterial,
    private state: GrassWindState,
  ) {
    super(material, "StrahovPbrGrassWind", 220, {}, true, true);
    this.doNotSerialize = true;
  }
  override isCompatible(language: ShaderLanguage) {
    return language === ShaderLanguage.GLSL || language === ShaderLanguage.WGSL;
  }
  override getUniforms(language = ShaderLanguage.GLSL) {
    return {
      ubo: [
        { name: "grassWind", size: 3, type: "vec3" },
        { name: "grassViewer", size: 4, type: "vec4" },
      ],
      vertex:
        language === ShaderLanguage.GLSL
          ? "uniform vec3 grassWind; uniform vec4 grassViewer;"
          : undefined,
      fragment:
        language === ShaderLanguage.GLSL
          ? "uniform vec4 grassViewer;"
          : undefined,
    };
  }
  override bindForSubMesh(buffer: UniformBuffer) {
    buffer.updateFloat3(
      "grassWind",
      this.state.time,
      this.state.windX,
      this.state.windZ,
    );
    buffer.updateFloat4(
      "grassViewer",
      this.state.playerX,
      this.state.playerY,
      this.state.playerZ,
      this.state.range,
    );
  }
  override getCustomCode(
    type: string,
    language = ShaderLanguage.GLSL,
  ): Record<string, string> | null {
    if (language === ShaderLanguage.WGSL)
      return type === "vertex"
        ? WGSL_VERTEX
        : type === "fragment"
          ? WGSL_FRAGMENT
          : null;
    if (language !== ShaderLanguage.GLSL) return null;
    if (type === "vertex")
      return {
        CUSTOM_VERTEX_DEFINITIONS: "varying vec3 vCampusGrass;",
        // Apply displacement in world space AFTER the per-clump yaw/ground tilt;
        // otherwise every rotated blade would bend in a different wind direction.
        CUSTOM_VERTEX_UPDATE_WORLDPOS: `
        float grassGust = sin(grassWind.x * 0.85 + worldPos.x * 0.07 + worldPos.z * 0.11) * 0.55
          + sin(grassWind.x * 1.9 + worldPos.x * 0.21) * 0.22;
        worldPos.xz += grassWind.yz * grassGust * positionUpdated.y * positionUpdated.y * 0.004;
        vPositionW = worldPos.xyz;
        vCampusGrass = vec3(fract(sin(dot(finalWorld[3].xz,vec2(12.9898,78.233))) * 43758.5453),
          clamp(positionUpdated.y,0.0,1.0), distance(worldPos.xyz,grassViewer.xyz));
      `,
      };
    if (type === "fragment")
      return {
        CUSTOM_FRAGMENT_DEFINITIONS: "varying vec3 vCampusGrass;",
        CUSTOM_FRAGMENT_BEFORE_LIGHTS: `
        float grassFade = 1.0 - smoothstep(grassViewer.w * 0.72, grassViewer.w, vCampusGrass.z);
        if(vCampusGrass.x > grassFade) discard;
        // Keep short clumps in the ground's muted family. Reduced tip/clump
        // contrast avoids bright striped tufts without adding a texture sample.
        surfaceAlbedo *= mix(0.74,1.1,vCampusGrass.y) * (0.88 + vCampusGrass.x * 0.16);
      `,
      };
    return null;
  }
}

export function createGrassMaterial(scene: Scene, state: GrassWindState) {
  const material = new PBRMaterial(
    "grass · physical sky and street lighting",
    scene,
  );
  material.albedoColor = Color3.FromHexString("#5e7043").toLinearSpace();
  material.metallic = 0;
  material.roughness = 0.97;
  material.specularIntensity = 0.12;
  material.backFaceCulling = false;
  material.twoSidedLighting = true;
  material.transparencyMode = PBRMaterial.PBRMATERIAL_OPAQUE;
  material.emissiveColor.setAll(0);
  material.metadata = {
    vegetation: "grass",
    physicallyBased: true,
    windDeformed: true,
    source: "project-authored blade geometry and bounded colour variation",
    paletteProvenance:
      "2026-10-11 artistic contrast reduction; not a campus reflectance measurement",
  };
  new GrassWindPlugin(material, state);
  return material;
}
