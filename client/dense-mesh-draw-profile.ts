import { Material } from "@babylonjs/core/Materials/material";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { SubMesh } from "@babylonjs/core/Meshes/subMesh";
import type { Scene } from "@babylonjs/core/scene";
import { renderMaterialName, renderMeshIdentity } from "./render-cost";

const CALL_LIMIT = 4096;
const TOP_LIMIT = 12;

export const DENSE_MESH_DRAW_SCOPE = {
  camera:
    "Scene draw phases with the active camera's render pass, including its configured output target",
  timing:
    "main thread wall intervals; compare to Edge thread CPU and GC events before assigning cause",
  mesh: "actual Mesh.render calls, including readiness and early returns; exclusive time excludes nested calls",
  material:
    "matches Babylon's existing SubMesh.getMaterial lookup and records _preBind when observed",
  drawCalls:
    "successful engine drawElementsType and drawArraysType calls in measured phases, not GPU work completion",
};

/** An endFrame result is readable through the next frame. Summarize or copy it
 * before beginning the second subsequent frame, which reuses its buffer. */
export interface DenseMeshDrawFrame {
  readonly frameStartAtMs: number;
  readonly mainDrawMs: number;
  readonly meshRenderMs: number;
  readonly meshMaterialMs: number;
  readonly unattributedMainDrawMs: number;
  readonly meshCalls: number;
  readonly recordedCalls: number;
  readonly droppedCalls: number;
  readonly failedCalls: number;
  readonly nestedCalls: number;
  readonly selectedCalls: number;
  readonly boundCalls: number;
  readonly phaseCount: number;
  readonly incompletePhases: number;
  readonly drawCalls: number;
  readonly meshHookIntact: boolean;
  readonly materialHookIntact: boolean;
  readonly bindHookIntact: boolean;
  readonly drawHooksIntact: boolean;
}

interface PairCost {
  mesh: ReturnType<typeof renderMeshIdentity>;
  material: { name: string; kind: string } | null;
  calls: number;
  draws: number;
  selfMs: number;
}

interface AttemptTiming {
  mesh: PairCost["mesh"];
  material: PairCost["material"];
  subMeshIndex: number;
  startOffsetMs: number;
  durationMs: number;
  selfMs: number;
  bindStartOffsetMs: number | null;
  draws: number;
  failed: boolean;
}

export interface DenseMeshDrawSnapshot extends DenseMeshDrawFrame {
  readonly topAttempts: AttemptTiming[];
  readonly topPairs: PairCost[];
}

class FrameBuffer implements DenseMeshDrawFrame {
  readonly meshes: Mesh[];
  readonly materials: (Material | undefined)[];
  readonly subMeshIndices: Float64Array;
  readonly started: Float64Array;
  readonly duration: Float64Array;
  readonly children: Float64Array;
  readonly bindStarted: Float64Array;
  readonly draws: Uint32Array;
  readonly failures: Uint8Array;
  frameStartAtMs = 0;
  mainDrawMs = 0;
  meshRenderMs = 0;
  meshMaterialMs = 0;
  unattributedMainDrawMs = 0;
  meshCalls = 0;
  recordedCalls = 0;
  droppedCalls = 0;
  failedCalls = 0;
  nestedCalls = 0;
  selectedCalls = 0;
  boundCalls = 0;
  phaseCount = 0;
  incompletePhases = 0;
  drawCalls = 0;
  meshHookIntact = false;
  materialHookIntact = false;
  bindHookIntact = false;
  drawHooksIntact = false;

  constructor(readonly capacity: number) {
    this.meshes = new Array<Mesh>(capacity);
    this.materials = new Array<Material | undefined>(capacity);
    this.subMeshIndices = new Float64Array(capacity);
    this.started = new Float64Array(capacity);
    this.duration = new Float64Array(capacity);
    this.children = new Float64Array(capacity);
    this.bindStarted = new Float64Array(capacity);
    this.draws = new Uint32Array(capacity);
    this.failures = new Uint8Array(capacity);
  }

  reset(start: number) {
    this.frameStartAtMs = start;
    this.mainDrawMs =
      this.meshRenderMs =
      this.meshMaterialMs =
      this.unattributedMainDrawMs =
        0;
    this.meshCalls =
      this.recordedCalls =
      this.droppedCalls =
      this.failedCalls =
      this.nestedCalls =
        0;
    this.selectedCalls =
      this.boundCalls =
      this.phaseCount =
      this.incompletePhases =
      this.drawCalls =
        0;
  }
}

interface Hook {
  intact(): boolean;
  restore(): void;
}

function installHook<T extends object, K extends keyof T>(
  target: T,
  key: K,
  value: T[K],
): Hook | undefined {
  const descriptor = Object.getOwnPropertyDescriptor(target, key);
  if (descriptor && !descriptor.configurable) return;
  if (
    !Reflect.defineProperty(target, key, {
      value,
      configurable: true,
      writable: true,
      enumerable: descriptor?.enumerable ?? false,
    })
  )
    return;
  const intact = () =>
    Object.getOwnPropertyDescriptor(target, key)?.value === value;
  return {
    intact,
    restore() {
      if (!intact()) return;
      if (descriptor) Reflect.defineProperty(target, key, descriptor);
      else Reflect.deleteProperty(target, key);
    },
  };
}

// Mesh and SubMesh methods are shared by Babylon scenes on this page. A single
// capture owns the patched methods and records only its own scene and phase.
let activeProfile: DenseMeshDrawProfile | undefined;

export class DenseMeshDrawProfile {
  private readonly buffers: [FrameBuffer, FrameBuffer];
  private readonly engine;
  private readonly detach: (() => void)[] = [];
  private readonly meshHook?: Hook;
  private readonly materialHook?: Hook;
  private readonly bindHook?: Hook;
  private readonly elementHook?: Hook;
  private readonly arrayHook?: Hook;
  private bufferIndex = 1;
  private frame?: FrameBuffer;
  private phasePass: number | undefined;
  private phaseStarted = 0;
  private currentIndex = -1;
  private currentSubMesh?: SubMesh;
  private depth = 0;
  private disposed = false;

  constructor(
    private readonly scene: Scene,
    private readonly now = () => performance.now(),
    capacity = CALL_LIMIT,
  ) {
    const size = Math.max(1, Math.min(CALL_LIMIT, Math.floor(capacity) || 1));
    this.buffers = [new FrameBuffer(size), new FrameBuffer(size)];
    this.engine = scene.getEngine();
    if (activeProfile) return;
    activeProfile = this;

    const profile = this;
    const originalRender = Mesh.prototype.render;
    this.meshHook = installHook(
      Mesh.prototype,
      "render",
      function (this: Mesh, subMesh, alpha, replacement) {
        const frame = profile.frame;
        if (!frame || !profile.inPhase() || this.getScene() !== scene) {
          return originalRender.call(this, subMesh, alpha, replacement);
        }
        return profile.renderMesh(
          frame,
          originalRender,
          this,
          subMesh,
          alpha,
          replacement,
        );
      },
    );

    // Babylon 9.30 calls this existing lookup before material readiness checks.
    // Calling it separately would mutate MultiMaterial draw caches.
    const originalGetMaterial = SubMesh.prototype.getMaterial;
    this.materialHook = installHook(
      SubMesh.prototype,
      "getMaterial",
      function (this: SubMesh, getDefaultMaterial, passId) {
        const material = originalGetMaterial.call(
          this,
          getDefaultMaterial,
          passId,
        );
        const index = profile.currentIndex;
        const frame = profile.frame;
        if (
          frame &&
          index >= 0 &&
          this === profile.currentSubMesh &&
          material &&
          getDefaultMaterial === undefined &&
          passId === undefined &&
          frame.bindStarted[index] < 0 &&
          profile.inPhase()
        ) {
          frame.materials[index] = material;
        }
        return material;
      },
    );

    const originalBind = Material.prototype._preBind;
    this.bindHook = installHook(
      Material.prototype,
      "_preBind",
      function (this: Material, effect, orientation) {
        const index = profile.currentIndex;
        const frame = profile.frame;
        if (
          frame &&
          index >= 0 &&
          frame.materials[index] === this &&
          frame.bindStarted[index] < 0 &&
          profile.inPhase()
        ) {
          frame.bindStarted[index] = profile.now();
        }
        return originalBind.call(this, effect, orientation);
      },
    );

    const engine = this.engine;
    const drawElements = engine.drawElementsType;
    this.elementHook = installHook(
      engine,
      "drawElementsType",
      function (this: typeof engine, mode, start, count, instances) {
        drawElements.call(this, mode, start, count, instances);
        profile.countDraw();
      },
    );
    const drawArrays = engine.drawArraysType;
    this.arrayHook = installHook(
      engine,
      "drawArraysType",
      function (this: typeof engine, mode, start, count, instances) {
        drawArrays.call(this, mode, start, count, instances);
        profile.countDraw();
      },
    );

    const before = scene.onBeforeDrawPhaseObservable.add(
      () => this.beginPhase(),
      -1,
      true,
    );
    const after = scene.onAfterDrawPhaseObservable.add(() => this.endPhase());
    this.detach.push(
      () => scene.onBeforeDrawPhaseObservable.remove(before),
      () => scene.onAfterDrawPhaseObservable.remove(after),
    );
  }

  beginFrame(renderStartedAtMs: number) {
    if (this.disposed) return;
    this.bufferIndex ^= 1;
    this.frame = this.buffers[this.bufferIndex]!;
    this.frame.reset(renderStartedAtMs);
    this.phasePass = undefined;
    this.currentIndex = -1;
    this.currentSubMesh = undefined;
    this.depth = 0;
  }

  endFrame(): DenseMeshDrawFrame {
    const frame = this.frame;
    if (!frame) throw new Error("No active mesh draw frame");
    if (this.phasePass !== undefined) {
      frame.incompletePhases++;
      this.endPhase();
    }
    frame.meshHookIntact = this.meshHook?.intact() ?? false;
    frame.materialHookIntact = this.materialHook?.intact() ?? false;
    frame.bindHookIntact = this.bindHook?.intact() ?? false;
    frame.drawHooksIntact = Boolean(
      this.elementHook?.intact() && this.arrayHook?.intact(),
    );
    frame.unattributedMainDrawMs = Math.max(
      0,
      frame.mainDrawMs - frame.meshRenderMs,
    );
    this.frame = undefined;
    return frame;
  }

  private beginPhase() {
    const frame = this.frame;
    if (!frame) return;
    if (this.phasePass !== undefined) {
      frame.incompletePhases++;
      this.endPhase();
    }
    const camera = this.scene.activeCamera;
    const pass =
      camera?.outputRenderTarget?.renderPassId ?? camera?.renderPassId;
    if (pass === undefined || pass !== this.engine.currentRenderPassId) return;
    this.phasePass = pass;
    this.phaseStarted = this.now();
    frame.phaseCount++;
  }

  private endPhase() {
    if (this.frame && this.phasePass !== undefined) {
      this.frame.mainDrawMs += this.now() - this.phaseStarted;
    }
    this.phasePass = undefined;
  }

  private inPhase() {
    return (
      this.phasePass !== undefined &&
      this.phasePass === this.engine.currentRenderPassId
    );
  }

  private countDraw() {
    const frame = this.frame;
    if (!frame || !this.inPhase()) return;
    frame.drawCalls++;
    if (this.currentIndex >= 0) frame.draws[this.currentIndex]++;
  }

  private renderMesh(
    frame: FrameBuffer,
    original: Mesh["render"],
    mesh: Mesh,
    subMesh: SubMesh,
    alpha: boolean,
    replacement: Parameters<Mesh["render"]>[2],
  ) {
    const parent = this.currentIndex;
    const parentSubMesh = this.currentSubMesh;
    const nested = this.depth > 0;
    const index =
      frame.recordedCalls < frame.capacity ? frame.recordedCalls++ : -1;
    const started = this.now();
    frame.meshCalls++;
    if (nested) frame.nestedCalls++;
    if (index < 0) frame.droppedCalls++;
    else {
      frame.meshes[index] = mesh;
      frame.materials[index] = undefined;
      frame.subMeshIndices[index] = subMesh._id;
      frame.started[index] = started;
      frame.children[index] = frame.draws[index] = frame.failures[index] = 0;
      frame.bindStarted[index] = -1;
    }
    this.depth++;
    this.currentIndex = index;
    this.currentSubMesh = subMesh;
    let failed = true;
    try {
      const result = original.call(mesh, subMesh, alpha, replacement);
      failed = false;
      return result;
    } finally {
      const elapsed = this.now() - started;
      this.currentIndex = parent;
      this.currentSubMesh = parentSubMesh;
      this.depth--;
      if (!nested) frame.meshRenderMs += elapsed;
      if (parent >= 0) frame.children[parent] += elapsed;
      if (failed) frame.failedCalls++;
      if (index >= 0) {
        frame.duration[index] = elapsed;
        frame.failures[index] = Number(failed);
        if (frame.materials[index]) {
          frame.selectedCalls++;
          frame.meshMaterialMs += Math.max(0, elapsed - frame.children[index]);
        }
        if (frame.bindStarted[index] >= 0) frame.boundCalls++;
      }
    }
  }

  summarize(frame: DenseMeshDrawFrame): DenseMeshDrawSnapshot {
    if (frame !== this.buffers[0] && frame !== this.buffers[1])
      throw new Error("Mesh draw frame belongs to another profile");
    const data = frame as FrameBuffer;
    const pairs = new Map<Mesh, Map<Material | undefined, PairCost>>();
    const byDuration = new Array<number>(data.recordedCalls);
    for (let index = 0; index < data.recordedCalls; index++) {
      byDuration[index] = index;
      const mesh = data.meshes[index]!;
      const material = data.materials[index];
      let byMaterial = pairs.get(mesh);
      if (!byMaterial) {
        byMaterial = new Map();
        pairs.set(mesh, byMaterial);
      }
      let pair = byMaterial.get(material);
      if (!pair) {
        const identity = renderMeshIdentity(mesh);
        pair = {
          mesh: identity,
          material: material
            ? {
                name:
                  identity.source === "avatar"
                    ? "avatar material"
                    : renderMaterialName(material),
                kind: material.getClassName(),
              }
            : null,
          calls: 0,
          draws: 0,
          selfMs: 0,
        };
        byMaterial.set(material, pair);
      }
      pair.calls++;
      pair.draws += data.draws[index];
      pair.selfMs += Math.max(0, data.duration[index] - data.children[index]);
    }
    const topAttempts = byDuration
      .sort((a, b) => data.duration[b] - data.duration[a])
      .slice(0, TOP_LIMIT)
      .map((index) => {
        const pair = pairs
          .get(data.meshes[index]!)!
          .get(data.materials[index])!;
        return {
          mesh: pair.mesh,
          material: pair.material,
          subMeshIndex: data.subMeshIndices[index],
          startOffsetMs: data.started[index] - frame.frameStartAtMs,
          durationMs: data.duration[index],
          selfMs: Math.max(0, data.duration[index] - data.children[index]),
          bindStartOffsetMs:
            data.bindStarted[index] < 0
              ? null
              : data.bindStarted[index] - frame.frameStartAtMs,
          draws: data.draws[index],
          failed: Boolean(data.failures[index]),
        };
      });
    const topPairs = [...pairs.values()]
      .flatMap((byMaterial) => [...byMaterial.values()])
      .sort((a, b) => b.selfMs - a.selfMs)
      .slice(0, TOP_LIMIT);
    return {
      frameStartAtMs: frame.frameStartAtMs,
      mainDrawMs: frame.mainDrawMs,
      meshRenderMs: frame.meshRenderMs,
      meshMaterialMs: frame.meshMaterialMs,
      unattributedMainDrawMs: frame.unattributedMainDrawMs,
      meshCalls: frame.meshCalls,
      recordedCalls: frame.recordedCalls,
      droppedCalls: frame.droppedCalls,
      failedCalls: frame.failedCalls,
      nestedCalls: frame.nestedCalls,
      selectedCalls: frame.selectedCalls,
      boundCalls: frame.boundCalls,
      phaseCount: frame.phaseCount,
      incompletePhases: frame.incompletePhases,
      drawCalls: frame.drawCalls,
      meshHookIntact: frame.meshHookIntact,
      materialHookIntact: frame.materialHookIntact,
      bindHookIntact: frame.bindHookIntact,
      drawHooksIntact: frame.drawHooksIntact,
      topAttempts,
      topPairs,
    };
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.frame = undefined;
    this.phasePass = undefined;
    if (activeProfile === this) activeProfile = undefined;
    for (const detach of this.detach) detach();
    this.meshHook?.restore();
    this.materialHook?.restore();
    this.bindHook?.restore();
    this.elementHook?.restore();
    this.arrayHook?.restore();
  }
}
