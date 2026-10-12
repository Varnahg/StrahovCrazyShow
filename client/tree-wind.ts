import { MaterialPluginBase } from "@babylonjs/core/Materials/materialPluginBase";
import { ShaderLanguage } from "@babylonjs/core/Materials/shaderLanguage";
import type { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import type { UniformBuffer } from "@babylonjs/core/Materials/uniformBuffer";
import type { AbstractEngine } from "@babylonjs/core/Engines/abstractEngine";
import type { SubMesh } from "@babylonjs/core/Meshes/subMesh";
import type { Scene } from "@babylonjs/core/scene";
export type TreeWindState = { time: number; x: number; z: number };

/** Same displacement as the established tree wind, with the corresponding
 * inverse-transpose normal and forward tangent shear for PBR/normal mapping. */
export class TreeWindPlugin extends MaterialPluginBase {
  constructor(
    material: PBRMaterial,
    private state: TreeWindState,
  ) {
    super(material, "StrahovCleanTreeWind", 220, {}, true, false);
    this.doNotSerialize = true;
    this.registerForExtraEvents = true;
    this._enable(true);
  }
  override isCompatible(language: ShaderLanguage) {
    return language === ShaderLanguage.GLSL;
  }
  override getUniforms() {
    return {
      ubo: [{ name: "cleanTreeWind", size: 3, type: "vec3" }],
      vertex: "uniform vec3 cleanTreeWind;",
    };
  }
  override hardBindForSubMesh(
    buffer: UniformBuffer,
    _scene: Scene,
    _engine: AbstractEngine,
    _subMesh: SubMesh,
  ) {
    buffer.updateFloat3(
      "cleanTreeWind",
      this.state.time,
      this.state.x,
      this.state.z,
    );
  }
  override getCustomCode(type: string, language = ShaderLanguage.GLSL) {
    if (type !== "vertex" || language !== ShaderLanguage.GLSL) return null;
    return {
      CUSTOM_VERTEX_UPDATE_POSITION: `
      float treeGust=sin(cleanTreeWind.x*.85+world[3].x*.07+world[3].z*.11)*.55+sin(cleanTreeWind.x*1.9+world[3].x*.21)*.22;
      float treeT=clamp((positionUpdated.y-1.5)/8.5,0.0,1.0);
      float treeWeight=smoothstep(1.5,10.0,positionUpdated.y);
      vec2 treeOffset=cleanTreeWind.yz*treeGust*.008;
      vec2 treeShear=treeOffset*(6.0*treeT*(1.0-treeT)/8.5);
      positionUpdated.xz+=treeOffset*treeWeight;
      #ifdef NORMAL
      normalUpdated=normalize(vec3(normalUpdated.x,normalUpdated.y-dot(treeShear,normalUpdated.xz),normalUpdated.z));
      #endif
      #ifdef TANGENT
      tangentUpdated.xyz=normalize(vec3(tangentUpdated.x+treeShear.x*tangentUpdated.y,tangentUpdated.y,tangentUpdated.z+treeShear.y*tangentUpdated.y));
      #endif
    `,
    };
  }
}
