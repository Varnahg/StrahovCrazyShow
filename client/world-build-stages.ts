export type WorldBuildStep = {
  phase: string;
  operation: string;
  run(): void;
};

export type WorldBuildPhaseTiming = {
  phase: string;
  outcome: "complete" | "aborted" | "failed";
  operations: number;
  cpuMs: number;
  elapsedMs: number;
  maxOperationMs: number;
  maxOperation: string;
  yields: number;
};

export type WorldBuildStageOptions = {
  signal?: AbortSignal;
  onPhase?: (timing: WorldBuildPhaseTiming) => void;
  /** A yield threshold between operations, NOT a bound on atomic operation cost. */
  sliceBudgetMs?: number;
  isDisposed?: () => boolean;
  /** Test clock; defaults to the browser's monotonic performance clock. */
  now?: () => number;
  /** Test scheduler. Production defaults to a cancellable setTimeout task. */
  scheduleTask?: (callback: () => void) => () => void;
};

export type WorldBuildJob<T> = {
  run(): Promise<T>;
  cancel(): void;
};

function aborted(signal: AbortSignal) {
  const error = new Error("World build was aborted", { cause: signal.reason });
  error.name = "AbortError";
  return error;
}

function scheduleTask(callback: () => void) {
  // A resolved Promise would only yield to microtasks and keep input/paint
  // blocked. A real task also works while RAF is suspended in a hidden tab.
  const timer = setTimeout(callback, 0);
  return () => clearTimeout(timer);
}

function pause(
  signal: AbortSignal,
  schedule: NonNullable<WorldBuildStageOptions["scheduleTask"]>,
) {
  return new Promise<void>((resolve, reject) => {
    if (signal.aborted) {
      reject(aborted(signal));
      return;
    }
    let cancel: (() => void) | undefined;
    let settled = false;
    const abort = () => {
      if (settled) return;
      settled = true;
      cancel?.();
      signal.removeEventListener("abort", abort);
      reject(aborted(signal));
    };
    signal.addEventListener("abort", abort, { once: true });
    try {
      cancel = schedule(() => {
        if (settled) return;
        settled = true;
        signal.removeEventListener("abort", abort);
        resolve();
      });
    } catch (error) {
      settled = true;
      signal.removeEventListener("abort", abort);
      reject(error);
    }
  });
}

/** Executes the same operation stream used by the asynchronous world builder. */
export function runWorldBuildStagesSync<T>(
  steps: Generator<WorldBuildStep, T>,
) {
  try {
    for (;;) {
      const step = steps.next();
      if (step.done) return step.value;
      step.value.run();
    }
  } catch (error) {
    try {
      steps.return(undefined as T);
    } catch (cleanupError) {
      throw new AggregateError(
        [error, cleanupError],
        "World build and cleanup failed",
        { cause: error },
      );
    }
    throw error;
  }
}

/** One run/Promise per job. Cancellation closes the generator's owned resources. */
export function createWorldBuildStagesJob<T>(
  steps: Generator<WorldBuildStep, T>,
  options: WorldBuildStageOptions = {},
): WorldBuildJob<T> {
  const abort = new AbortController();
  const now = options.now ?? (() => performance.now());
  const schedule = options.scheduleTask ?? scheduleTask;
  const budget = Number.isFinite(options.sliceBudgetMs)
    ? Math.max(0, options.sliceBudgetMs!)
    : 4;
  let running: Promise<T> | undefined;
  const check = () => {
    if (options.isDisposed?.()) abort.abort("host disposed");
    if (abort.signal.aborted) throw aborted(abort.signal);
  };

  const execute = async () => {
    const externalAbort = () => abort.abort(options.signal?.reason);
    if (options.signal?.aborted) externalAbort();
    else
      options.signal?.addEventListener("abort", externalAbort, { once: true });
    let phase: Omit<WorldBuildPhaseTiming, "outcome" | "elapsedMs"> | undefined;
    let phaseStarted = 0;
    const finishPhase = (outcome: WorldBuildPhaseTiming["outcome"]) => {
      if (!phase) return;
      const timing = {
        ...phase,
        outcome,
        elapsedMs: Math.max(0, now() - phaseStarted),
      };
      phase = undefined;
      options.onPhase?.(timing);
    };
    try {
      check();
      // Give the mode-change/loading UI its first task before creating geometry.
      await pause(abort.signal, schedule);
      let sliceStarted = now();
      for (;;) {
        check();
        const step = steps.next();
        if (step.done) {
          finishPhase("complete");
          check();
          return step.value;
        }
        const operation = step.value;
        if (phase?.phase !== operation.phase) {
          finishPhase("complete");
          check();
          phaseStarted = now();
          phase = {
            phase: operation.phase,
            operations: 0,
            cpuMs: 0,
            maxOperationMs: 0,
            maxOperation: operation.operation,
            yields: 0,
          };
        }
        const started = now();
        try {
          operation.run();
        } finally {
          const duration = Math.max(0, now() - started);
          phase!.operations++;
          phase!.cpuMs += duration;
          if (duration > phase!.maxOperationMs) {
            phase!.maxOperationMs = duration;
            phase!.maxOperation = operation.operation;
          }
        }
        check();
        if (now() - sliceStarted >= budget) {
          phase!.yields++;
          await pause(abort.signal, schedule);
          sliceStarted = now();
        }
      }
    } catch (error) {
      let diagnosticError: unknown;
      try {
        finishPhase(abort.signal.aborted ? "aborted" : "failed");
      } catch (failure) {
        diagnosticError = failure;
      }
      try {
        steps.return(undefined as T);
      } catch (cleanupError) {
        throw new AggregateError(
          [error, cleanupError, ...(diagnosticError ? [diagnosticError] : [])],
          "World build and cleanup failed",
          { cause: error },
        );
      }
      if (diagnosticError)
        throw new AggregateError(
          [error, diagnosticError],
          "World build and phase reporting failed",
          { cause: error },
        );
      throw error;
    } finally {
      options.signal?.removeEventListener("abort", externalAbort);
    }
  };

  return {
    run() {
      return (running ??= execute());
    },
    cancel() {
      abort.abort("cancelled");
    },
  };
}
