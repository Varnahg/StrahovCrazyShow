import { AbstractEngine } from "@babylonjs/core/Engines/abstractEngine.pure";
import { WebGPUDrawContext } from "@babylonjs/core/Engines/WebGPU/webgpuDrawContext";
import { DrawWrapper } from "@babylonjs/core/Materials/drawWrapper";
import { ShadowDepthWrapper } from "@babylonjs/core/Materials/shadowDepthWrapper";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { SubMesh } from "@babylonjs/core/Meshes/subMesh";

const unsupported = () => new Error("Unsupported pinned tree draw-cache ownership or layout");
function data(owner: object, name: string, writable = false): unknown {
  const property = Object.getOwnPropertyDescriptor(owner, name);
  if (!property || !("value" in property) || writable && !property.writable) throw unsupported();
  return property.value;
}
function optionalData(owner: object, name: string): unknown {
  return Object.hasOwn(owner, name) ? data(owner, name) : undefined;
}
function nativeMap(value: unknown): Map<unknown, unknown> {
  if (!(value instanceof Map) || Object.getPrototypeOf(value) !== Map.prototype) throw unsupported();
  return value;
}
function wrappersFrom(value: unknown, result: Set<DrawWrapper>, label: "main" | "shadow") {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) throw unsupported();
  // These arrays are sparse render-pass tables. Observe existing entries only;
  // a high historic pass id must not allocate/scan all missing aliases.
  for (const key of Object.keys(value)) {
    // Babylon 9.30 ObjectRenderer first releases its empty pass list. That calls
    // SubMesh._removeDrawWrapper(undefined), leaving this exact main-table
    // tombstone. It owns no context; preserve it without admitting named aliases.
    if (label === "main" && key === "undefined") {
      const slot = Object.getOwnPropertyDescriptor(value, key);
      if (slot && "value" in slot && slot.value === undefined && slot.writable && slot.enumerable && slot.configurable) continue;
    }
    if (!/^(0|[1-9]\d*)$/.test(key)) {
      let preview = key.slice(0, 78), escaped = JSON.stringify(preview);
      while (escaped.length > 80) { preview = preview.slice(0, -1); escaped = JSON.stringify(preview); }
      throw new Error(`Unsupported pinned tree draw-cache ${label} pass key ${escaped}`);
    }
    const wrapper = data(value, key);
    if (wrapper == null) continue;
    if (!(wrapper instanceof DrawWrapper)) throw unsupported();
    result.add(wrapper);
  }
}

/** Call before changing a live tree/litter submesh's index range. The pinned
 * adapter invalidates commands only, never Effects, material data or UBO slots.
 * It has no persistent cache and does not create missing shadow pass aliases. */
export function invalidateTreeDrawRange(mesh: Mesh, subMesh: SubMesh, nextIndexStart: number, nextIndexCount: number): void {
  if (subMesh.indexStart === nextIndexStart && subMesh.indexCount === nextIndexCount) return;
  const scene = mesh.getScene(), engine = scene.getEngine();
  if (!engine.isWebGPU || engine.compatibilityMode !== false) return;
  if (mesh.isDisposed() || scene.isDisposed || engine.isDisposed) return;
  if (AbstractEngine.Version !== "9.30.0" || engine.snapshotRendering !== false ||
      subMesh.getMesh() !== mesh || subMesh.getRenderingMesh() !== mesh || !mesh.subMeshes.includes(subMesh) ||
      !Number.isSafeInteger(nextIndexStart) || !Number.isSafeInteger(nextIndexCount) || nextIndexStart < 0 || nextIndexCount < 0 ||
      nextIndexStart + nextIndexCount > mesh.getTotalIndices()) throw unsupported();

  const wrappers = new Set<DrawWrapper>();
  wrappersFrom(data(subMesh, "_drawWrappers"), wrappers, "main");
  const material = mesh.material, shadow = material?.shadowDepthWrapper;
  if (material && material.getScene() !== scene) throw unsupported();
  if (shadow) {
    if (!(shadow instanceof ShadowDepthWrapper) || shadow.baseMaterial !== material || data(shadow, "_scene") !== scene)
      throw unsupported();
    const table = data(shadow, "_subMeshToDepthWrapper");
    if (!table || typeof table !== "object") throw unsupported();
    const entries = nativeMap(data(table, "mm")).get(subMesh);
    const disposed = data(shadow, "_depthDisposed");
    if (typeof disposed !== "boolean" || disposed && entries !== undefined) throw unsupported();
    if (entries !== undefined) for (const value of nativeMap(entries).values()) {
      if (!value || typeof value !== "object" || Object.getPrototypeOf(value) !== Object.prototype) throw unsupported();
      const main = data(value, "mainDrawWrapper");
      if (!(main instanceof DrawWrapper)) throw unsupported();
      wrappers.add(main);
      wrappersFrom(data(value, "drawWrapper"), wrappers, "shadow");
    }
  }
  const override = optionalData(subMesh, "_mainDrawWrapperOverride");
  if (override != null && !wrappers.has(override as DrawWrapper)) throw unsupported();

  const manager = data(engine, "_bufferManager"), contexts = new Set<WebGPUDrawContext>();
  if (!manager || typeof manager !== "object") throw unsupported();
  for (const wrapper of wrappers) {
    const context = data(wrapper, "drawContext"), effect = data(wrapper, "effect") as { getEngine(): unknown } | null;
    if (!(context instanceof WebGPUDrawContext) || data(context, "_bufferManager") !== manager) throw unsupported();
    const bundle = data(context, "fastBundle", true), buffers = data(context, "buffers");
    const indirect = optionalData(context, "indirectDrawBuffer");
    if (buffers === undefined && !effect && bundle === undefined && indirect === undefined) continue; // retired alias
    if (!buffers || Object.getPrototypeOf(buffers) !== Object.prototype ||
        bundle !== undefined && (!bundle || typeof bundle !== "object") ||
        effect && (typeof effect.getEngine !== "function" || effect.getEngine() !== engine))
      throw unsupported();
    if (indirect !== undefined) {
      const count = data(context, "_currentInstanceCount", true), values = data(context, "_indirectDrawData");
      if (!indirect || typeof indirect !== "object" || !Number.isSafeInteger(count) || (count as number) < -1 ||
          !(values instanceof Uint32Array) || values.length !== 5) throw unsupported();
    }
    contexts.add(context);
  }
  // All owners/fields are validated before either mutation. Native draw owns
  // rebuilding and refreshing indirect GPU data with its actual instance count.
  for (const context of contexts) {
    context.fastBundle = undefined;
    if (context.indirectDrawBuffer) (context as unknown as { _currentInstanceCount: number })._currentInstanceCount = -1;
  }
}
