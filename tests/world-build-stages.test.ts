import test from "node:test";
import assert from "node:assert/strict";
import { getEventListeners } from "node:events";
import {
  createWorldBuildStagesJob,
  runWorldBuildStagesSync,
  type WorldBuildStep,
  type WorldBuildPhaseTiming,
} from "../client/world-build-stages";

function scheduler() {
  let id = 0;
  const pending = new Map<number, () => void>();
  const all: (() => void)[] = [];
  return {
    pending,
    all,
    scheduleTask(callback: () => void) {
      const key = ++id;
      pending.set(key, callback);
      all.push(callback);
      return () => {
        pending.delete(key);
      };
    },
    async flush() {
      for (let guard = 0; pending.size && guard < 100; guard++) {
        const [key, callback] = pending.entries().next().value!;
        pending.delete(key);
        callback();
        await Promise.resolve();
      }
      assert.equal(
        pending.size,
        0,
        "scheduler must finish or cancel its pending work",
      );
    },
  };
}

test("sync and staged execute the same stream in order and return the same output contract", async () => {
  const create = (
    events: string[],
  ): Generator<WorldBuildStep, { answer: number }> =>
    (function* () {
      yield {
        phase: "first",
        operation: "one",
        run: () => {
          events.push("one");
        },
      };
      yield {
        phase: "first",
        operation: "two",
        run: () => {
          events.push("two");
        },
      };
      yield {
        phase: "second",
        operation: "three",
        run: () => {
          events.push("three");
        },
      };
      return { answer: events.length };
    })();
  const sync: string[] = [],
    staged: string[] = [];
  const expected = runWorldBuildStagesSync(create(sync));
  const host = scheduler();
  const job = createWorldBuildStagesJob(create(staged), {
    ...host,
    sliceBudgetMs: 0,
  });
  const promise = job.run();
  assert.equal(job.run(), promise, "one run and one Promise per job");
  assert.deepEqual(
    staged,
    [],
    "nothing is built before the first scheduled task",
  );
  await host.flush();
  assert.deepEqual(await promise, expected);
  assert.deepEqual(staged, sync);
  job.cancel();
  assert.equal(job.run(), promise);
});

test("production scheduling yields to a real task rather than a resolved microtask", async () => {
  let timerRan = false,
    built = false;
  const timer = setTimeout(() => {
    timerRan = true;
  }, 0);
  const steps = (function* (): Generator<WorldBuildStep, void> {
    yield {
      phase: "one",
      operation: "one",
      run: () => {
        assert.equal(timerRan, true);
        built = true;
      },
    };
  })();
  const promise = createWorldBuildStagesJob(steps).run();
  await Promise.resolve();
  assert.equal(built, false);
  await promise;
  clearTimeout(timer);
  assert.equal(built, true);
});

test("phase timings expose oversized atomic work and aggregate small steps without claiming a hard slice cap", async () => {
  let time = 0;
  const timings: WorldBuildPhaseTiming[] = [];
  const steps = (function* (): Generator<WorldBuildStep, void> {
    for (const [phase, operation, duration] of [
      ["terrain", "small", 1],
      ["terrain", "atomic-build", 80],
      ["labels", "caption", 2],
    ] as const)
      yield {
        phase,
        operation,
        run: () => {
          time += duration;
        },
      };
  })();
  const host = scheduler();
  const promise = createWorldBuildStagesJob(steps, {
    ...host,
    now: () => time,
    sliceBudgetMs: 4,
    onPhase: (value) => timings.push(value),
  }).run();
  await host.flush();
  await promise;
  assert.deepEqual(
    timings.map(
      ({
        phase,
        operations,
        cpuMs,
        maxOperationMs,
        maxOperation,
        outcome,
      }) => ({
        phase,
        operations,
        cpuMs,
        maxOperationMs,
        maxOperation,
        outcome,
      }),
    ),
    [
      {
        phase: "terrain",
        operations: 2,
        cpuMs: 81,
        maxOperationMs: 80,
        maxOperation: "atomic-build",
        outcome: "complete",
      },
      {
        phase: "labels",
        operations: 1,
        cpuMs: 2,
        maxOperationMs: 2,
        maxOperation: "caption",
        outcome: "complete",
      },
    ],
  );
  assert.equal(timings[0].yields, 1);
  assert.equal(timings[1].yields, 0);
});

test("abort between operations cancels the pending task, closes resources once and ignores a dequeued callback", async () => {
  const host = scheduler(),
    abort = new AbortController();
  let writes = 0,
    closed = 0;
  const steps = (function* (): Generator<WorldBuildStep, void> {
    try {
      for (let i = 0; i < 3; i++)
        yield {
          phase: "build",
          operation: String(i),
          run: () => {
            writes++;
          },
        };
    } finally {
      closed++;
    }
  })();
  const job = createWorldBuildStagesJob(steps, {
    ...host,
    signal: abort.signal,
    sliceBudgetMs: 0,
  });
  const promise = job.run();
  const [key, callback] = host.pending.entries().next().value!;
  host.pending.delete(key);
  callback();
  await Promise.resolve();
  assert.equal(writes, 1);
  const stale = host.all.at(-1)!;
  abort.abort();
  await assert.rejects(promise, { name: "AbortError" });
  assert.equal(host.pending.size, 0);
  stale();
  await Promise.resolve();
  assert.equal(writes, 1);
  assert.equal(closed, 1);
  assert.equal(getEventListeners(abort.signal, "abort").length, 0);
  job.cancel();
  assert.equal(closed, 1);
});

test("already aborted or disposed hosts never schedule or mutate the world", async () => {
  for (const disposed of [false, true]) {
    const host = scheduler(),
      abort = new AbortController();
    if (!disposed) abort.abort();
    const steps = (function* (): Generator<WorldBuildStep, void> {
      yield {
        phase: "never",
        operation: "never",
        run: () => {
          assert.fail("late world write");
        },
      };
    })();
    const job = createWorldBuildStagesJob(steps, {
      ...host,
      signal: abort.signal,
      isDisposed: () => disposed,
    });
    await assert.rejects(job.run(), { name: "AbortError" });
    assert.equal(host.pending.size, 0);
    assert.equal(getEventListeners(abort.signal, "abort").length, 0);
  }
});

test("errors preserve the original failure, close the generator and report the failing operation", async () => {
  const host = scheduler(),
    failure = new Error("geometry failure");
  let closed = 0;
  const timings: WorldBuildPhaseTiming[] = [];
  const steps = (function* (): Generator<WorldBuildStep, void> {
    try {
      yield {
        phase: "architecture",
        operation: "facade",
        run: () => {
          throw failure;
        },
      };
      yield {
        phase: "forbidden",
        operation: "late",
        run: () => {
          assert.fail("late mutation");
        },
      };
    } finally {
      closed++;
    }
  })();
  const promise = createWorldBuildStagesJob(steps, {
    ...host,
    onPhase: (value) => timings.push(value),
  }).run();
  const rejection = assert.rejects(promise, (error) => error === failure);
  await host.flush();
  await rejection;
  assert.equal(closed, 1);
  assert.equal(timings[0].outcome, "failed");
  assert.equal(timings[0].maxOperation, "facade");
  assert.equal(timings[0].operations, 1);
});

test("abort from the final phase callback prevents success delivery", async () => {
  const host = scheduler();
  const abort = new AbortController();
  const steps = (function* (): Generator<WorldBuildStep, string> {
    yield { phase: "last", operation: "one", run() {} };
    return "must not transfer";
  })();
  const promise = createWorldBuildStagesJob(steps, {
    ...host,
    signal: abort.signal,
    onPhase: () => abort.abort(),
  }).run();
  const rejection = assert.rejects(promise, { name: "AbortError" });
  await host.flush();
  await rejection;
});
