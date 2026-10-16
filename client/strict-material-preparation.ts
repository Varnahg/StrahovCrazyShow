import type { AbstractEngine } from "@babylonjs/core/Engines/abstractEngine";

type PreparationEngine = Pick<
  AbstractEngine,
  "isWebGPU" | "isDisposed" | "areAllEffectsReady"
>;
type RequestedEffect = {
  readonly isDisposed: boolean;
  getEngine(): unknown;
  isReady(): boolean;
};

/** Pin-specific read access: Babylon 9.30 caches an Effect synchronously in
 * WebGPUEngine.createEffect, before its extraInitializationsAsync completes.
 * WebGPUEngine.areAllEffectsReady itself returns true unconditionally. */
function cacheOf(engine: PreparationEngine): unknown {
  return (engine as PreparationEngine & { _compiledEffects?: unknown })
    ._compiledEffects;
}

function isCache(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object") return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function ownCount(cache: Record<string, unknown>) {
  let count = 0;
  for (const key in cache) if (Object.hasOwn(cache, key)) count++;
  return count;
}

function isOwnedLiveEffect(
  value: unknown,
  engine: PreparationEngine,
): value is RequestedEffect {
  if (value === null || typeof value !== "object") return false;
  const effect = value as Partial<RequestedEffect>;
  return (
    effect.isDisposed === false &&
    typeof effect.getEngine === "function" &&
    typeof effect.isReady === "function" &&
    effect.getEngine() === engine
  );
}

/** Readiness of all requested effects, including an uninstalled hot-swap
 * replacement. No flags, caches, Promise handlers or GPU resources are changed.
 * Missing/changed pinned cache contracts fail closed. Actual readiness throws
 * propagate to the caller's preparation failure path.
 *
 * An empty valid cache is ready, matching ThinEngine's public contract. The
 * caller still checks actual meshes and draws, health errors/pending operations
 * and final submitted validation; this does not prove GPU validation completed.
 */
export function arePreparationEffectsReady(engine: PreparationEngine): boolean {
  if (engine.isDisposed) return false;
  if (!engine.isWebGPU) return engine.areAllEffectsReady();
  const cache = cacheOf(engine);
  if (!isCache(cache)) return false;
  const requested = ownCount(cache);
  let visited = 0;
  for (const key in cache) {
    if (!Object.hasOwn(cache, key)) continue;
    const effect = cache[key];
    if (!isOwnedLiveEffect(effect, engine) || effect.isReady() !== true)
      return false;
    // No pinned Effect.isReady mutation is expected. Still do not accept a
    // replaced/disposed entry or cache if readiness caused synchronous work.
    if (
      engine.isDisposed ||
      cacheOf(engine) !== cache ||
      cache[key] !== effect ||
      !isOwnedLiveEffect(effect, engine)
    )
      return false;
    visited++;
  }
  return (
    !engine.isDisposed &&
    cacheOf(engine) === cache &&
    visited === requested &&
    ownCount(cache) === requested
  );
}
