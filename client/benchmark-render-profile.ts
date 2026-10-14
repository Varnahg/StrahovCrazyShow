import type { Scene } from "@babylonjs/core/scene";
import type { Observable } from "@babylonjs/core/Misc/observable";
import type { ObjectRenderer } from "@babylonjs/core/Rendering/objectRenderer";

export type BenchmarkRenderCpuMs = {
  activeMeshes: number;
  mainDraw: number;
  renderTargets: number;
};

/** CPU wall intervals; these do not measure GPU execution or presentation. */
export const BENCHMARK_RENDER_CPU_SCOPE = {
  clock: "performance.now monotonic milliseconds",
  activeMeshes:
    "sum of Scene before/after active-mesh evaluation intervals in this frame",
  mainDraw:
    "sum of Scene before/after draw-phase intervals; excludes target draw callbacks and postprocess finalization",
  renderTargets:
    "sum of every ObjectRenderer init/finish interval, including multiple targets and repeated passes",
  relationship:
    "nested in frameBreakdownMs.render; inclusive intervals can overlap each other and must not be added as a whole-frame total",
  incompleteIntervals:
    "unpaired intervals interrupted by renderer removal or frame termination are not counted",
} as const;

type Interval = { starts: number[]; detach(): void };

/** Owned only for one benchmark. Public observables avoid Babylon 9.30's
 * captureRenderTime cleanup bug and PerfCounter's last-interval semantics. */
export class BenchmarkRenderProfile {
  private readonly detachScene: (() => void)[] = [];
  private readonly sceneIntervals: Interval[] = [];
  private readonly targets = new Map<ObjectRenderer, Interval>();
  private readonly totals: BenchmarkRenderCpuMs = {
    activeMeshes: 0,
    mainDraw: 0,
    renderTargets: 0,
  };
  private frameOpen = false;
  private disposed = false;

  constructor(
    private readonly scene: Scene,
    private readonly now: () => number = () => performance.now(),
    private readonly onRenderTargetInterval?: (
      renderer: ObjectRenderer,
      durationMs: number,
    ) => void,
  ) {
    this.sceneIntervals.push(
      this.interval(
        scene.onBeforeActiveMeshesEvaluationObservable,
        scene.onAfterActiveMeshesEvaluationObservable,
        "activeMeshes",
      ),
      this.interval(
        scene.onBeforeDrawPhaseObservable,
        scene.onAfterDrawPhaseObservable,
        "mainDraw",
      ),
    );
    this.detachScene.push(
      this.observe(scene.onNewObjectRendererAddedObservable, (renderer) => {
        // Babylon can defer the added notification until after removal.
        if (scene.objectRenderers.includes(renderer)) this.track(renderer);
      }),
      this.observe(scene.onObjectRendererRemovedObservable, (renderer) => {
        this.targets.get(renderer)?.detach();
        this.targets.delete(renderer);
      }),
      this.observe(scene.onDisposeObservable, () => this.dispose()),
    );
    for (const renderer of scene.objectRenderers) this.track(renderer);
  }

  private observe<T>(observable: Observable<T>, callback: (value: T) => void) {
    const observer = observable.add(callback);
    return () => observable.remove(observer);
  }

  private interval<T>(
    before: Observable<T>,
    after: Observable<T>,
    metric: keyof BenchmarkRenderCpuMs,
    onComplete?: (durationMs: number) => void,
  ): Interval {
    const starts: number[] = [];
    const detachBefore = this.observe(before, () => {
      if (this.frameOpen && !this.disposed) starts.push(this.now());
    });
    const detachAfter = this.observe(after, () => {
      if (!this.frameOpen || this.disposed) return;
      const started = starts.pop();
      if (started !== undefined) {
        const duration = Math.max(0, this.now() - started);
        this.totals[metric] += duration;
        onComplete?.(duration);
      }
    });
    return {
      starts,
      detach() {
        detachBefore();
        detachAfter();
        starts.length = 0;
      },
    };
  }

  private track(renderer: ObjectRenderer) {
    if (this.disposed || this.targets.has(renderer)) return;
    this.targets.set(
      renderer,
      this.interval(
        renderer.onInitRenderingObservable,
        renderer.onFinishRenderingObservable,
        "renderTargets",
        (duration) => this.onRenderTargetInterval?.(renderer, duration),
      ),
    );
  }

  /** Called immediately before scene.render(), also catching a target created
   * earlier in the same JS task whose added notification is still deferred. */
  beginFrame() {
    if (this.disposed) return;
    for (const renderer of this.scene.objectRenderers) this.track(renderer);
    for (const interval of this.sceneIntervals) interval.starts.length = 0;
    for (const interval of this.targets.values()) interval.starts.length = 0;
    this.totals.activeMeshes =
      this.totals.mainDraw =
      this.totals.renderTargets =
        0;
    this.frameOpen = true;
  }

  endFrame(): BenchmarkRenderCpuMs {
    this.frameOpen = false;
    return { ...this.totals };
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.frameOpen = false;
    for (const detach of this.detachScene) detach();
    for (const interval of this.sceneIntervals) interval.detach();
    for (const interval of this.targets.values()) interval.detach();
    this.detachScene.length = 0;
    this.sceneIntervals.length = 0;
    this.targets.clear();
  }
}
