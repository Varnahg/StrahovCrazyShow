import type { Scene } from "@babylonjs/core/scene";
import type { Observable } from "@babylonjs/core/Misc/observable";
import type { Material } from "@babylonjs/core/Materials/material";
import type { Effect } from "@babylonjs/core/Materials/effect";
import type { SubMesh } from "@babylonjs/core/Meshes/subMesh";
import type { ObjectRenderer } from "@babylonjs/core/Rendering/objectRenderer";
import {
  BenchmarkRenderProfile,
  BENCHMARK_RENDER_CPU_SCOPE,
  type BenchmarkRenderCpuMs,
} from "./benchmark-render-profile";

const DETAIL_LIMIT = 8;
const MAX_SHADER_DEPTH = 32;
const technicalName = (name: string) => name.slice(0, 96);

export const RENDER_INCIDENT_SCOPE = {
  ...BENCHMARK_RENDER_CPU_SCOPE,
  shaderCreation:
    "CPU wall time between paired engine before/after shader-compilation observables; WebGL createShaderProgram submission/call time, not asynchronous GPU compilation completion",
  shaderPrograms:
    "completed observable pairs, not a count of unique shaders or proof of successful asynchronous compilation; engine-wide cumulative counters include work outside the profiled scene.render call",
  materialEffects:
    "effect-created notifications are not shader compilations or confirmation of effect adoption/readiness; changes compare observed effect/define identity for the same material and submesh slot, not unrelated submeshes",
  materialCoverage:
    "existing scene materials and incrementally notified additions; a newly added material can create an effect before Babylon delivers its deferred added notification",
  details:
    "at most 8 slowest completed target intervals and 8 material identities per frame; omitted detail counters preserve the number of other observations; variant fingerprints are non-cryptographic labels, never shader source",
} as const;

type IncidentCounters = {
  shaderProgramStarts: number;
  shaderPrograms: number;
  shaderIntervalsDropped: number;
  materialEffectEvents: number;
  materialEffectChanges: number;
  materialDetailsOmitted: number;
  renderTargetIntervals: number;
  renderTargetDetailsOmitted: number;
};
type TargetDetail = { name: string; renderPassId: number; cpuMs: number };
type MaterialDetail = {
  name: string;
  materialId: number;
  effectId: number;
  previousEffectId: number | null;
  variant: string;
  events: number;
  changes: number;
};
type Binding = { effectId: number; variant: string };
type MaterialState = {
  active: boolean;
  bindings: WeakMap<SubMesh, Binding>;
  noSubmesh: Binding | null;
  detach(): void;
};
const counters = (): IncidentCounters => ({
  shaderProgramStarts: 0,
  shaderPrograms: 0,
  shaderIntervalsDropped: 0,
  materialEffectEvents: 0,
  materialEffectChanges: 0,
  materialDetailsOmitted: 0,
  renderTargetIntervals: 0,
  renderTargetDetailsOmitted: 0,
});
const COUNTER_KEYS = Object.keys(counters()) as (keyof IncidentCounters)[];

export type RenderIncidentSnapshot = {
  cpuMs: BenchmarkRenderCpuMs & { shaderCreation: number };
  counters: IncidentCounters;
  details: { slowRenderTargets: TargetDetail[]; materials: MaterialDetail[] };
  cumulative: IncidentCounters & {
    shaderCreationMs: number;
    trackedMaterials: number;
  };
};

/** Continuous observer-only telemetry. Never polls readiness, invokes GL,
 * changes material state or wraps engine methods. Owns one reused phase profiler. */
export class RenderIncidentProfile {
  private readonly phases: BenchmarkRenderProfile;
  private readonly detach: (() => void)[] = [];
  private readonly materials = new Map<Material, MaterialState>();
  private readonly variants = new WeakMap<
    Effect,
    { defines: string; binding: Binding }
  >();
  private readonly shaderStarts: number[] = [];
  private shaderOverflowDepth = 0;
  private readonly frameCounters = counters();
  private readonly totalCounters = counters();
  private readonly slowTargets: TargetDetail[] = [];
  private readonly materialDetails: MaterialDetail[] = [];
  private shaderCpuMs = 0;
  private totalShaderCpuMs = 0;
  private frameOpen = false;
  private disposed = false;

  constructor(
    private readonly scene: Scene,
    private readonly now: () => number = () => performance.now(),
  ) {
    this.phases = new BenchmarkRenderProfile(scene, now, (renderer, duration) =>
      this.recordTarget(renderer, duration),
    );
    const engine = scene.getEngine();
    this.detach.push(
      this.observe(engine.onBeforeShaderCompilationObservable, () =>
        this.beforeShader(),
      ),
      this.observe(engine.onAfterShaderCompilationObservable, () =>
        this.afterShader(),
      ),
      this.observe(scene.onNewMaterialAddedObservable, (material) => {
        // Babylon can deliver the deferred add notification after removal.
        if (scene.materials.includes(material)) this.trackMaterial(material);
      }),
      this.observe(scene.onMaterialRemovedObservable, (material) =>
        this.untrackMaterial(material),
      ),
      this.observe(scene.onDisposeObservable, () => this.dispose()),
    );
    for (const material of scene.materials) this.trackMaterial(material);
  }

  private observe<T>(observable: Observable<T>, callback: (value: T) => void) {
    const observer = observable.add(callback);
    return () => {
      observable.remove(observer);
    };
  }

  private count(key: keyof IncidentCounters, amount = 1) {
    this.totalCounters[key] += amount;
    if (this.frameOpen) this.frameCounters[key] += amount;
  }

  private beforeShader() {
    if (this.disposed) return;
    this.count("shaderProgramStarts");
    if (this.shaderStarts.length >= MAX_SHADER_DEPTH) {
      this.shaderOverflowDepth++;
      this.count("shaderIntervalsDropped");
    } else this.shaderStarts.push(this.now());
  }

  private afterShader() {
    if (this.disposed) return;
    if (this.shaderOverflowDepth) {
      this.shaderOverflowDepth--;
      return;
    }
    const started = this.shaderStarts.pop();
    if (started === undefined) {
      this.count("shaderIntervalsDropped");
      return;
    }
    const elapsed = this.now() - started;
    if (!Number.isFinite(elapsed) || elapsed < 0) {
      this.count("shaderIntervalsDropped");
      return;
    }
    this.count("shaderPrograms");
    this.totalShaderCpuMs += elapsed;
    if (this.frameOpen) this.shaderCpuMs += elapsed;
  }

  private abandonShaderIntervals() {
    // A thrown createShaderProgram can omit its after notification. Do not
    // attribute that open interval to an unrelated later frame/program.
    if (this.shaderStarts.length)
      this.count("shaderIntervalsDropped", this.shaderStarts.length);
    this.shaderStarts.length = 0;
    this.shaderOverflowDepth = 0;
  }

  private binding(effect: Effect): Binding {
    const defines = effect.defines ?? "";
    const cached = this.variants.get(effect);
    if (cached?.defines === defines) return cached.binding;
    // Hash only on effect/define changes, never every frame or every draw.
    // Full define length is included in this non-cryptographic variant label.
    let hash = 2166136261;
    for (let index = 0; index < defines.length; index++)
      hash = Math.imul(hash ^ defines.charCodeAt(index), 16777619);
    const binding = {
      effectId: effect.uniqueId,
      variant: `${(hash >>> 0).toString(16)}:${defines.length}`,
    };
    this.variants.set(effect, { defines, binding });
    return binding;
  }

  private trackMaterial(material: Material) {
    if (this.disposed || this.materials.has(material)) return;
    const state: MaterialState = {
      active: true,
      bindings: new WeakMap(),
      noSubmesh: null,
      detach: () => {},
    };
    state.detach = this.observe(
      material.onEffectCreatedObservable,
      ({ effect, subMesh }) => {
        if (this.disposed || !state.active) return;
        const binding = this.binding(effect);
        const previous = subMesh
          ? state.bindings.get(subMesh)
          : state.noSubmesh;
        const changed =
          !!previous &&
          (previous.effectId !== binding.effectId ||
            previous.variant !== binding.variant);
        if (subMesh) state.bindings.set(subMesh, binding);
        else state.noSubmesh = binding;
        this.count("materialEffectEvents");
        if (changed) this.count("materialEffectChanges");
        if (!this.frameOpen) return;
        let detail = this.materialDetails.find(
          (entry) => entry.materialId === material.uniqueId,
        );
        if (!detail) {
          if (this.materialDetails.length === DETAIL_LIMIT) {
            this.count("materialDetailsOmitted");
            return;
          }
          detail = {
            name: technicalName(material.name),
            materialId: material.uniqueId,
            effectId: binding.effectId,
            previousEffectId: null,
            variant: binding.variant,
            events: 0,
            changes: 0,
          };
          this.materialDetails.push(detail);
        }
        detail.events++;
        if (changed) detail.changes++;
        detail.previousEffectId = previous?.effectId ?? null;
        detail.effectId = binding.effectId;
        detail.variant = binding.variant;
      },
    );
    this.materials.set(material, state);
  }

  private untrackMaterial(material: Material) {
    const state = this.materials.get(material);
    if (!state) return;
    state.active = false;
    state.detach();
    this.materials.delete(material);
  }

  private recordTarget(renderer: ObjectRenderer, duration: number) {
    if (this.disposed || !this.frameOpen || !Number.isFinite(duration)) return;
    this.count("renderTargetIntervals");
    if (this.slowTargets.length === DETAIL_LIMIT) {
      this.count("renderTargetDetailsOmitted");
      if (duration <= this.slowTargets[this.slowTargets.length - 1].cpuMs)
        return;
      this.slowTargets.pop();
    }
    this.slowTargets.push({
      name: technicalName(renderer.name),
      renderPassId: renderer.renderPassId,
      cpuMs: duration,
    });
    this.slowTargets.sort((a, b) => b.cpuMs - a.cpuMs);
  }

  /** Call immediately before scene.render(), not around the whole game frame. */
  beginFrame() {
    if (this.disposed) return;
    this.abandonShaderIntervals();
    for (const key of COUNTER_KEYS) this.frameCounters[key] = 0;
    this.shaderCpuMs = 0;
    this.slowTargets.length = this.materialDetails.length = 0;
    this.frameOpen = true;
    this.phases.beginFrame();
  }

  /** Fresh, bounded plain snapshot. Inclusive phase intervals can overlap. */
  endFrame(): RenderIncidentSnapshot {
    this.abandonShaderIntervals();
    this.frameOpen = false;
    return {
      cpuMs: { ...this.phases.endFrame(), shaderCreation: this.shaderCpuMs },
      counters: { ...this.frameCounters },
      details: {
        slowRenderTargets: this.slowTargets.map((detail) => ({ ...detail })),
        materials: this.materialDetails.map((detail) => ({ ...detail })),
      },
      cumulative: {
        ...this.totalCounters,
        shaderCreationMs: this.totalShaderCpuMs,
        trackedMaterials: this.materials.size,
      },
    };
  }

  dispose() {
    if (this.disposed) return;
    this.abandonShaderIntervals();
    this.frameOpen = false;
    this.disposed = true;
    this.phases.dispose();
    for (const detach of this.detach) detach();
    this.detach.length = 0;
    for (const material of this.materials.keys())
      this.untrackMaterial(material);
  }
}
