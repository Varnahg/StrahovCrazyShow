import { MaterialPluginBase } from "@babylonjs/core/Materials/materialPluginBase";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { ShaderLanguage } from "@babylonjs/core/Materials/shaderLanguage";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { InstancedMesh } from "@babylonjs/core/Meshes/instancedMesh";
import type { UniformBuffer } from "@babylonjs/core/Materials/uniformBuffer";
import type { AbstractEngine } from "@babylonjs/core/Engines/abstractEngine";
import type { SubMesh } from "@babylonjs/core/Meshes/subMesh";
import type { Scene } from "@babylonjs/core/scene";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import type { MaterialDefines } from "@babylonjs/core/Materials/materialDefines";

export const CAR_PAINT_COLOR_BUFFER = "instanceColor";

/** Babylon's built-in instanceColor is only consumed with INSTANCES. Mirrored
 * instances use a regular draw instead; hardBind supplies their original tint
 * on every bind, including consecutive draws sharing the same material. */
export class CarPaintFallbackPlugin extends MaterialPluginBase {
  constructor(material: PBRMaterial) {
    super(material, "CarPaintFallback", 210, {}, true, false);
    this.doNotSerialize = true;
    this.registerForExtraEvents = true;
    this._enable(true);
  }

  override isCompatible(language: ShaderLanguage) {
    return language === ShaderLanguage.GLSL;
  }

  override getUniforms() {
    return {
      ubo: [{ name: "carPaintFallback", size: 3, type: "vec3" }],
      fragment: "uniform vec3 carPaintFallback;",
    };
  }

  override prepareDefines(
    defines: MaterialDefines,
    _scene: Scene,
    mesh: AbstractMesh,
  ) {
    // A native LOD source renders the near source's instances without owning
    // instances[] itself. Babylon 9.30's generic hasInstances check misses that
    // case. Use the actual draw's INSTANCES define and registered public stream.
    defines.INSTANCESCOLOR =
      !!defines.INSTANCES && mesh.isVerticesDataPresent(CAR_PAINT_COLOR_BUFFER);
  }

  override hardBindForSubMesh(
    buffer: UniformBuffer,
    _scene: Scene,
    _engine: AbstractEngine,
    subMesh: SubMesh,
  ) {
    if (subMesh.materialDefines?.INSTANCES) return;
    const mesh = subMesh.getEffectiveMesh();
    const color =
      mesh instanceof Mesh || mesh instanceof InstancedMesh
        ? (mesh.instancedBuffers?.[CAR_PAINT_COLOR_BUFFER] as
            Color4 | undefined)
        : undefined;
    buffer.updateFloat3(
      "carPaintFallback",
      color?.r ?? 1,
      color?.g ?? 1,
      color?.b ?? 1,
    );
  }

  override getCustomCode(type: string, language = ShaderLanguage.GLSL) {
    if (type !== "fragment" || language !== ShaderLanguage.GLSL) return null;
    return {
      CUSTOM_FRAGMENT_BEFORE_LIGHTS: `
        #ifndef INSTANCES
        surfaceAlbedo *= carPaintFallback;
        #endif
      `,
    };
  }
}

/** Keep the original per-LOD materials/textures/coats. Only move their linear
 * tint from the material uniform to Babylon's official per-instance buffer. */
export function installCarPaintInstances(sources: readonly Mesh[]) {
  const first = sources[0]?.material;
  if (!(first instanceof PBRMaterial))
    throw new Error("Car paint instancing requires the source PBR material");
  const original = first.albedoColor.clone();
  for (const source of sources) {
    const material = source.material;
    if (
      !(material instanceof PBRMaterial) ||
      !material.albedoColor.equals(original) ||
      material.alpha !== 1
    )
      throw new Error("Car paint LODs require matching opaque source tints");
  }
  const configured = new Set<PBRMaterial>();
  for (const source of sources) {
    const material = source.material as PBRMaterial;
    source.registerInstancedBuffer(CAR_PAINT_COLOR_BUFFER, 4);
    source.instancedBuffers[CAR_PAINT_COLOR_BUFFER] = carPaintColor(original);
    if (!configured.has(material)) {
      material.albedoColor.setAll(1);
      material.metadata = { ...material.metadata, instancePaintTint: true };
      new CarPaintFallbackPlugin(material);
      configured.add(material);
    }
  }
  return original;
}

export function carPaintColor(original: Color3, colour?: string) {
  const rgb = colour ? Color3.FromHexString(colour).toLinearSpace() : original;
  return new Color4(rgb.r, rgb.g, rgb.b, 1);
}
