import { ShadowDepthWrapper, type IIOptionShadowDepthMaterial } from "@babylonjs/core/Materials/shadowDepthWrapper";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { PBRBaseSimpleMaterial } from "@babylonjs/core/Materials/PBR/pbrBaseSimpleMaterial";
import { GetSupportedSimultaneousLights } from "@babylonjs/core/Materials/materialHelper.functions";
import type { Material } from "@babylonjs/core/Materials/material";
import type { Effect } from "@babylonjs/core/Materials/effect";
import type { SubMesh } from "@babylonjs/core/Meshes/subMesh";
import type { ShadowGenerator } from "@babylonjs/core/Lights/Shadows/shadowGenerator";
import type { Scene } from "@babylonjs/core/scene";

type LitMaterial = StandardMaterial | PBRMaterial | PBRBaseSimpleMaterial;
const lightTypes = ["POINTLIGHT", "DIRLIGHT", "SPOTLIGHT", "HEMILIGHT"];
const lightClasses = ["PointLight", "DirectionalLight", "SpotLight", "HemisphericLight"];
type LightLayout = { defines: string; slots: number[] | null };

/** Interpret only the pinned built-in light-slot defines, not arbitrary WGSL.
 * Incomplete/unknown declarations are unsafe even if their byte sizes coincide. */
function lightLayout(defines: string): LightLayout {
  const enabled = new Set<number>(), types = new Map<number, number>();
  for (const line of defines.split("\n")) {
    const match = /^\s*#define\s+(LIGHT|POINTLIGHT|DIRLIGHT|SPOTLIGHT|HEMILIGHT|AREALIGHT|CLUSTLIGHT)(\d+)(?:\s+(.*?))?\s*$/.exec(line);
    if (!match) continue;
    const index = Number(match[2]);
    if (!Number.isSafeInteger(index) || match[3]?.trim()) return { defines, slots: null };
    if (match[1] === "LIGHT") {
      if (enabled.has(index)) return { defines, slots: null };
      enabled.add(index);
    } else {
      const type = lightTypes.indexOf(match[1]);
      if (type < 0 || types.has(index)) return { defines, slots: null };
      types.set(index, type);
    }
  }
  if (enabled.size !== types.size) return { defines, slots: null };
  const slots: number[] = [];
  for (let index = 0; index < enabled.size; index++) {
    const type = types.get(index);
    if (!enabled.has(index) || type === undefined) return { defines, slots: null };
    slots.push(type);
  }
  return { defines, slots };
}

class FreshWebGpuShadowDepthWrapper extends ShadowDepthWrapper {
  private released = false;
  private layouts = new WeakMap<Effect, LightLayout>();

  private isCurrent(subMesh: SubMesh, passId: number): boolean {
    const scene = this.baseMaterial.getScene();
    return !this.released && !scene.isDisposed && !subMesh.getMesh().isDisposed() &&
      scene.getEngine().currentRenderPassId === passId && !subMesh._drawWrapperOverride;
  }

  override isReadyForSubMesh(subMesh: SubMesh, defines: string[], generator: ShadowGenerator,
    useInstances: boolean, passId: number): boolean {
    const material = this.baseMaterial as LitMaterial;
    // This runs before ShadowGenerator installs its depth binding override. A
    // reentrant call must not prepare the base material inside that override.
    if (!this.isCurrent(subMesh, passId) ||
        (!this.standalone && subMesh.getMaterial() !== material)) return false;
    const engine = material.getScene().getEngine();
    // Pinned PCF rendering disables color writes before refreshing the base
    // PBR. Complete mesh readiness also asks here outside that render scope.
    const previousColorWrite = generator.usePercentageCloserFiltering === true ? engine.getColorWrite() : undefined;
    try {
      if (previousColorWrite === true) engine.setColorWrite(false);
      return this.isReadyInCurrentContext(subMesh, defines, generator, useInstances, passId);
    } finally {
      if (previousColorWrite === true) engine.setColorWrite(previousColorWrite);
    }
  }

  private isReadyInCurrentContext(subMesh: SubMesh, defines: string[], generator: ShadowGenerator,
    useInstances: boolean, passId: number): boolean {
    const material = this.baseMaterial as LitMaterial;
    const scene = material.getScene(), mesh = subMesh.getMesh();
    // Native standalone already performs this exact call; don't do it twice.
    // Keep the current shadow pass: changing it would mix base/draw ownership.
    if (!this.standalone && !material.isReadyForSubMesh(mesh, subMesh, useInstances)) return false;
    if (!this.isCurrent(subMesh, passId) ||
        !super.isReadyForSubMesh(subMesh, defines, generator, useInstances, passId)) return false;
    if (!this.isCurrent(subMesh, passId)) return false;
    const effect = this.getEffect(subMesh, generator, passId)?.effect;
    if (!effect || effect.isDisposed || typeof effect.defines !== "string") return false;
    let layout = this.layouts.get(effect);
    if (!layout || layout.defines !== effect.defines) {
      layout = lightLayout(effect.defines);
      this.layouts.set(effect, layout);
    }
    if (!layout.slots) return false;
    const cap = material.maxSimultaneousLights;
    if (!Number.isSafeInteger(cap) || cap < 0) return false;
    const supported = GetSupportedSimultaneousLights(scene, cap);
    if (!Number.isSafeInteger(supported) || supported < 0) return false;
    // PrepareDefinesForLights clamps the shader slots to device support;
    // BindLights supplies the corresponding leading mesh.lightSources entries.
    const count = scene.lightsEnabled && !material.disableLighting
      ? Math.min(mesh.lightSources.length, supported) : 0;
    if (layout.slots.length !== count) return false;
    for (let index = 0; index < count; index++) {
      const light = mesh.lightSources[index], type = layout.slots[index];
      if (light.getTypeID() !== type || light.getClassName() !== lightClasses[type]) return false;
    }
    return true;
  }

  override dispose() {
    if (this.released) return;
    this.released = true;
    this.layouts = new WeakMap();
    super.dispose();
  }
}

/** WebGPU built-in lit materials must refresh their base effect before shadows,
 * including shadow-only/off-camera meshes. Other material/backend contracts
 * retain Babylon's wrapper; no shaders, cache keys or hot-swap flags are changed. */
export function createWebGpuShadowDepthWrapper(material: Material, scene: Scene,
  options?: IIOptionShadowDepthMaterial): ShadowDepthWrapper {
  const supported = material instanceof StandardMaterial || material instanceof PBRMaterial ||
    material instanceof PBRBaseSimpleMaterial;
  return scene.getEngine().isWebGPU && supported
    ? new FreshWebGpuShadowDepthWrapper(material, scene, options)
    : new ShadowDepthWrapper(material, scene, options);
}
