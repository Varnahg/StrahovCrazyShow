import { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import type { Material } from "@babylonjs/core/Materials/material";
import type { Observable } from "@babylonjs/core/Misc/observable";
import type { Scene } from "@babylonjs/core/scene";
import { renderMeshIdentity } from "./render-cost";

const TOP_LIMIT = 8;
const ATTEMPT_LIMIT = 2048;
const GROUP_LIMIT = ATTEMPT_LIMIT;
const technicalName = (value: string) => value.slice(0, 96);

export const MESH_DRAW_PROFILE_SCOPE = {
  cpu: "sampled CPU wall intervals inside Scene main draw phase and its render pass; not GPU timing",
  completed:
    "only beforeRender -> beforeBind -> afterRender chains are timed; initial occlusion/instance-list/geometry checks before beforeRender are outside the interval",
  preparation:
    "beforeRender to beforeBind: material readiness, effective effect/state preparation; not a shader-compilation claim",
  bindDraw:
    "beforeBind to afterRender: buffer/material binding, submission, unbind and after-mesh stages; can include driver waits",
  pairing:
    "any unfinished attempt invalidates its mesh for this draw phase; ambiguous/nested or early-return attempts are omitted rather than paired with a later completion",
  materials:
    "effective material is identified by its public onBindObservable; an unobserved bind remains unknown, never inferred from a MultiMaterial container",
  instances:
    "native instanced batches are attributed to the rendering source Mesh; attempt counts are not instance counts or GL draw calls",
  omissions:
    "top 8 per dimension; up to 2048 identities and timed attempts per sample; omitted counts/CPU and incomplete intervals are explicit",
  coverage:
    "deferred mesh/material additions during rendering may be unobserved; current scene members are attached before sampled frames; non-sampled frames have no per-mesh clock reads",
} as const;

type Cost = {
  calls: number;
  cpuMs: number;
  preparationMs: number;
  bindDrawMs: number;
};
type Group = Cost & { key: string; name: string; source: string; kind: string };
type Attempt = {
  mesh: Mesh;
  started: number;
  binding: number | null;
  material: Material | null;
};
type Tracked = { active: boolean; detach: (() => void)[] };
const emptyCost = (): Cost => ({
  calls: 0,
  cpuMs: 0,
  preparationMs: 0,
  bindDrawMs: 0,
});
const addCost = (target: Cost, cost: Cost) => {
  target.calls += cost.calls;
  target.cpuMs += cost.cpuMs;
  target.preparationMs += cost.preparationMs;
  target.bindDrawMs += cost.bindDrawMs;
};

export type MeshDrawSnapshot = {
  reason: string;
  mainDrawCpuMs: number;
  completed: Cost;
  counts: {
    attempts: number;
    abandoned: number;
    ambiguousSkipped: number;
    budgetSkipped: number;
    unmatchedBind: number;
    unmatchedAfter: number;
    unknownMaterials: number;
    incompletePhases: number;
    phases: number;
    trackedMeshes: number;
    trackedMaterials: number;
  };
  topMeshes: Group[];
  topMaterials: Group[];
  topSources: Group[];
  omitted: { meshes: Cost; materials: Cost; sources: Cost };
};

/** Sampling is requested by the Game's automatic periodic/action scheduler.
 * Observers stay owned, but idle frames perform no per-mesh clock reads or
 * grouping. No render wrappers, private draw state or readiness queries. */
export class MeshDrawProfile {
  private readonly detach: (() => void)[] = [];
  private readonly meshes = new Map<Mesh, Tracked>();
  private readonly materials = new Map<Material, Tracked>();
  private readonly tainted = new Set<Mesh>();
  private readonly meshCosts = new Map<string, Group>();
  private readonly materialCosts = new Map<string, Group>();
  private readonly sourceCosts = new Map<string, Group>();
  private reason: string | null = null;
  private phaseOpen = false;
  private phaseStarted = 0;
  private phasePass = -1;
  private pending: Attempt | null = null;
  private disposed = false;
  private mainDrawCpuMs = 0;
  private completed = emptyCost();
  private omitted = {
    meshes: emptyCost(),
    materials: emptyCost(),
    sources: emptyCost(),
  };
  private counts = this.emptyCounts();

  constructor(
    private readonly scene: Scene,
    private readonly now: () => number = () => performance.now(),
  ) {
    this.detach.push(
      this.observe(scene.onNewMeshAddedObservable, (mesh) => {
        if (scene.meshes.includes(mesh)) this.trackMesh(mesh);
      }),
      this.observe(scene.onMeshRemovedObservable, (mesh) =>
        this.removeMesh(mesh),
      ),
      this.observe(scene.onNewMaterialAddedObservable, (material) => {
        if (scene.materials.includes(material)) this.trackMaterial(material);
      }),
      this.observe(scene.onMaterialRemovedObservable, (material) =>
        this.removeMaterial(material),
      ),
      this.observe(scene.onBeforeDrawPhaseObservable, () => this.beginPhase()),
      this.observe(scene.onAfterDrawPhaseObservable, () => this.endPhase()),
      this.observe(scene.onDisposeObservable, () => this.dispose()),
    );
    this.trackCurrent();
  }

  private emptyCounts(): MeshDrawSnapshot["counts"] {
    return {
      attempts: 0,
      abandoned: 0,
      ambiguousSkipped: 0,
      budgetSkipped: 0,
      unmatchedBind: 0,
      unmatchedAfter: 0,
      unknownMaterials: 0,
      incompletePhases: 0,
      phases: 0,
      trackedMeshes: 0,
      trackedMaterials: 0,
    };
  }
  private observe<T>(observable: Observable<T>, callback: (value: T) => void) {
    const observer = observable.add(callback);
    return () => {
      observable.remove(observer);
    };
  }
  private trackCurrent() {
    for (const mesh of this.scene.meshes) this.trackMesh(mesh);
    for (const material of this.scene.materials) this.trackMaterial(material);
  }
  private observing() {
    if (this.disposed || this.reason === null || !this.phaseOpen) return false;
    if (this.scene.getEngine().currentRenderPassId !== this.phasePass) {
      this.abandon();
      return false;
    }
    return true;
  }
  private trackMesh(mesh: AbstractMesh) {
    // InstancedMesh has no Mesh.render observer chain: Babylon renders its
    // actual near/far source. The source is tracked independently.
    if (this.disposed || !(mesh instanceof Mesh) || this.meshes.has(mesh))
      return;
    const owned: Tracked = { active: true, detach: [] };
    owned.detach.push(
      this.observe(mesh.onBeforeRenderObservable, () => {
        if (owned.active) this.before(mesh);
      }),
      this.observe(mesh.onBeforeBindObservable, () => {
        if (owned.active) this.bind(mesh);
      }),
      this.observe(mesh.onAfterRenderObservable, () => {
        if (owned.active) this.after(mesh);
      }),
    );
    this.meshes.set(mesh, owned);
  }
  private trackMaterial(material: Material) {
    if (this.disposed || this.materials.has(material)) return;
    const owned: Tracked = { active: true, detach: [] };
    owned.detach.push(
      this.observe(material.onBindObservable, (mesh) => {
        if (
          owned.active &&
          this.observing() &&
          this.pending?.mesh === mesh &&
          this.pending.binding !== null
        )
          this.pending.material = material;
      }),
    );
    this.materials.set(material, owned);
  }
  private removeMesh(mesh: AbstractMesh) {
    if (!(mesh instanceof Mesh)) return;
    const owned = this.meshes.get(mesh);
    if (!owned) return;
    if (this.pending?.mesh === mesh) this.abandon();
    owned.active = false;
    for (const detach of owned.detach) detach();
    this.meshes.delete(mesh);
  }
  private removeMaterial(material: Material) {
    const owned = this.materials.get(material);
    if (!owned) return;
    if (this.pending?.material === material) this.pending.material = null;
    owned.active = false;
    for (const detach of owned.detach) detach();
    this.materials.delete(material);
  }
  private abandon() {
    if (!this.pending) return;
    this.tainted.add(this.pending.mesh);
    this.counts.abandoned++;
    this.pending = null;
  }
  private beginPhase() {
    if (this.disposed || this.reason === null) return;
    if (this.phaseOpen) this.counts.incompletePhases++;
    this.abandon();
    this.tainted.clear();
    this.phasePass = this.scene.getEngine().currentRenderPassId;
    this.phaseStarted = this.now();
    this.phaseOpen = true;
    this.counts.phases++;
  }
  private endPhase() {
    if (this.disposed || this.reason === null || !this.phaseOpen) return;
    this.abandon();
    const elapsed = this.now() - this.phaseStarted;
    if (Number.isFinite(elapsed) && elapsed >= 0) this.mainDrawCpuMs += elapsed;
    else this.counts.incompletePhases++;
    this.phaseOpen = false;
    this.tainted.clear();
  }
  private before(mesh: Mesh) {
    if (!this.observing()) return;
    this.counts.attempts++;
    // A previous early return and a nested draw look identical to public
    // observers. Never allow either start to leak into a later completion.
    this.abandon();
    if (this.tainted.has(mesh)) {
      this.counts.ambiguousSkipped++;
      return;
    }
    if (this.counts.attempts > ATTEMPT_LIMIT) {
      this.counts.budgetSkipped++;
      return;
    }
    this.pending = { mesh, started: this.now(), binding: null, material: null };
  }
  private bind(mesh: Mesh) {
    if (!this.observing()) return;
    if (
      !this.pending ||
      this.pending.mesh !== mesh ||
      this.pending.binding !== null
    ) {
      this.counts.unmatchedBind++;
      if (this.pending?.mesh === mesh) this.abandon();
      return;
    }
    this.pending.binding = this.now();
  }
  private group(
    groups: Map<string, Group>,
    key: string,
    name: string,
    source: string,
    kind: string,
    cost: Cost,
    omitted: Cost,
  ) {
    let group = groups.get(key);
    if (!group) {
      if (groups.size === GROUP_LIMIT) {
        addCost(omitted, cost);
        return;
      }
      group = { key, name: technicalName(name), source, kind, ...emptyCost() };
      groups.set(key, group);
    }
    addCost(group, cost);
  }
  private after(mesh: Mesh) {
    if (!this.observing()) return;
    const pending = this.pending;
    if (
      !pending ||
      pending.mesh !== mesh ||
      pending.binding === null ||
      this.tainted.has(mesh)
    ) {
      this.counts.unmatchedAfter++;
      if (pending?.mesh === mesh) this.abandon();
      return;
    }
    this.pending = null;
    const ended = this.now(),
      preparation = pending.binding - pending.started,
      bindDraw = ended - pending.binding;
    if (
      !Number.isFinite(preparation) ||
      preparation < 0 ||
      !Number.isFinite(bindDraw) ||
      bindDraw < 0
    ) {
      this.counts.abandoned++;
      return;
    }
    const cost = {
      calls: 1,
      cpuMs: preparation + bindDraw,
      preparationMs: preparation,
      bindDrawMs: bindDraw,
    };
    addCost(this.completed, cost);
    const existing = this.meshCosts.get(String(mesh.uniqueId));
    const identity = existing ?? renderMeshIdentity(mesh);
    this.group(
      this.meshCosts,
      String(mesh.uniqueId),
      identity.name,
      identity.source,
      mesh.getClassName(),
      cost,
      this.omitted.meshes,
    );
    const material = pending.material;
    if (!material) this.counts.unknownMaterials++;
    this.group(
      this.materialCosts,
      material ? String(material.uniqueId) : "unknown",
      material?.name ?? "unobserved effective material",
      "material-bind",
      material?.getClassName() ?? "unknown",
      cost,
      this.omitted.materials,
    );
    this.group(
      this.sourceCosts,
      identity.source,
      identity.source,
      identity.source,
      "source",
      cost,
      this.omitted.sources,
    );
  }

  /** Null (the default) is idle. Root schedules periodic and action-triggered
   * reasons automatically; the user never needs a recording switch. */
  beginFrame(reason: string | null = null) {
    if (this.disposed) return;
    this.pending = null;
    this.phaseOpen = false;
    this.tainted.clear();
    this.reason = reason === null ? null : technicalName(reason);
    if (this.reason === null) return;
    this.trackCurrent(); // catch same-task additions before deferred callbacks
    this.meshCosts.clear();
    this.materialCosts.clear();
    this.sourceCosts.clear();
    this.completed = emptyCost();
    this.omitted = {
      meshes: emptyCost(),
      materials: emptyCost(),
      sources: emptyCost(),
    };
    this.counts = this.emptyCounts();
    this.mainDrawCpuMs = 0;
  }
  endFrame(): MeshDrawSnapshot | null {
    if (this.disposed || this.reason === null) return null;
    this.abandon();
    if (this.phaseOpen) this.counts.incompletePhases++;
    this.phaseOpen = false;
    const reason = this.reason;
    this.reason = null;
    const top = (groups: Map<string, Group>, omitted: Cost) => {
      const ordered = [...groups.values()].sort((a, b) => b.cpuMs - a.cpuMs);
      for (let index = TOP_LIMIT; index < ordered.length; index++)
        addCost(omitted, ordered[index]);
      return ordered.slice(0, TOP_LIMIT).map((group) => ({ ...group }));
    };
    const omitted = {
      meshes: { ...this.omitted.meshes },
      materials: { ...this.omitted.materials },
      sources: { ...this.omitted.sources },
    };
    return {
      reason,
      mainDrawCpuMs: this.mainDrawCpuMs,
      completed: { ...this.completed },
      counts: {
        ...this.counts,
        trackedMeshes: this.meshes.size,
        trackedMaterials: this.materials.size,
      },
      topMeshes: top(this.meshCosts, omitted.meshes),
      topMaterials: top(this.materialCosts, omitted.materials),
      topSources: top(this.sourceCosts, omitted.sources),
      omitted,
    };
  }
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.reason = null;
    this.pending = null;
    this.phaseOpen = false;
    for (const detach of this.detach) detach();
    this.detach.length = 0;
    for (const mesh of this.meshes.keys()) this.removeMesh(mesh);
    for (const material of this.materials.keys()) this.removeMaterial(material);
    this.tainted.clear();
    this.meshCosts.clear();
    this.materialCosts.clear();
    this.sourceCosts.clear();
  }
}
