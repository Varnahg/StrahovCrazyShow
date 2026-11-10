import test from "node:test";
import assert from "node:assert/strict";
import { setImmediate as turn } from "node:timers/promises";
import { GraphicsTransition, type GraphicsClock } from "../client/graphics-transition";
import type { GraphicsApplicationState } from "../shared/render-quality";

class Clock implements GraphicsClock {
  time = 0; shown = true; serial = 0;
  timers = new Map<number, { at: number; callback: () => void }>();
  listeners = new Set<() => void>();
  now = () => this.time;
  visible = () => this.shown;
  observeVisibility = (callback: () => void) => { this.listeners.add(callback); return () => { this.listeners.delete(callback); }; };
  setTimer = (callback: () => void, milliseconds: number) => { const id = ++this.serial; this.timers.set(id, { at: this.time + milliseconds, callback }); return id; };
  clearTimer = (id: unknown) => { this.timers.delete(id as number); };
  visibility(shown: boolean) { this.shown = shown; for (const callback of [...this.listeners]) callback(); }
  advance(ms: number) {
    const end = this.time + ms;
    for (;;) {
      const next = [...this.timers].filter(([, t]) => t.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
      if (!next) break;
      this.time = next[1].at; this.timers.delete(next[0]); next[1].callback();
    }
    this.time = end;
  }
}

function setup(prepare: (value: string, signal: AbortSignal, remaining: () => number, restoring: boolean) => Promise<void>, auto = false) {
  const clock = new Clock(), commits: string[] = [], states: GraphicsApplicationState[] = [];
  const lifecycle = { retired: false, healthy: true };
  const controller = new GraphicsTransition({ prepare, clock, commit: value => { commits.push(value); },
    publish: state => { states.push(state); }, retired: () => lifecycle.retired, canRestore: () => lifecycle.healthy,
    targetBudget: () => auto ? 180_000 : 60_000 });
  return { clock, commits, states, lifecycle, controller };
}

test("settings commit only after target preparation and reject concurrent Apply", async () => {
  let finish!: () => void;
  const s = setup(() => new Promise<void>(resolve => { finish = resolve; }));
  const result = s.controller.apply("old", "ultra");
  assert.equal(s.states[0].applying, true); assert.deepEqual(s.commits, []);
  assert.equal(await s.controller.apply("old", "other"), false);
  finish(); assert.equal(await result, true); assert.deepEqual(s.commits, ["ultra"]);
  assert.equal(s.states.at(-1)?.applying, false); assert.equal(s.clock.timers.size, 0); assert.equal(s.clock.listeners.size, 0);
});

test("cancel restores the old configuration and never publishes late target completion", async () => {
  let finish!: () => void; const calls: string[] = [];
  const s = setup(async (value, _signal, _remaining, restoring) => {
    calls.push(value); if (!restoring) await new Promise<void>(resolve => { finish = resolve; });
  });
  const result = s.controller.apply("old", "ultra"); s.controller.cancel();
  assert.equal(await result, false); assert.deepEqual(calls, ["ultra", "old"]); assert.deepEqual(s.commits, []);
  finish(); await turn(); assert.deepEqual(s.commits, []);
  assert.equal(s.states.at(-1)?.restartRequired, false); assert.equal(s.clock.listeners.size, 0);
});

test("manual deadline pauses while hidden and timeout uses a fresh rollback signal", async () => {
  const signals: AbortSignal[] = [];
  const s = setup(async (_value, signal, _remaining, restoring) => {
    signals.push(signal); if (!restoring) await new Promise<void>(() => {});
  });
  const result = s.controller.apply("old", "ultra");
  s.clock.advance(1000); s.clock.visibility(false); s.clock.advance(600_000);
  assert.equal(signals[0].aborted, false); s.clock.visibility(true); s.clock.advance(58_999);
  assert.equal(signals[0].aborted, false); s.clock.advance(1);
  assert.equal(await result, false); assert.equal(signals[0].aborted, true); assert.equal(signals[1].aborted, false);
  assert.equal(s.states.at(-1)?.restartRequired, false); assert.deepEqual(s.commits, []);
});

test("rollback cannot extend the 180 second total budget", async () => {
  const remaining: number[] = [];
  const s = setup(async (_value, _signal, left) => { remaining.push(left()); await new Promise<void>(() => {}); }, true);
  const result = s.controller.apply("old", "auto"); s.clock.advance(150_000); s.controller.cancel();
  await turn(); assert.equal(remaining[1], 30_000);
  s.clock.advance(30_000); assert.equal(await result, false);
  assert.equal(s.states.at(-1)?.restartRequired, true); assert.equal(s.clock.timers.size, 0);
});

test("device failure is restart-required instead of pretending a rollback succeeded", async () => {
  const calls: string[] = [];
  const s = setup(async value => { calls.push(value); s.lifecycle.healthy = false; throw new Error("device lost"); });
  assert.equal(await s.controller.apply("old", "ultra"), false); assert.deepEqual(calls, ["ultra"]);
  assert.equal(s.states.at(-1)?.restartRequired, true); assert.deepEqual(s.commits, []);
});

test("dispose retires pending work and observes its late rejection", async () => {
  let fail!: (error: Error) => void;
  const s = setup(() => new Promise<void>((_, reject) => { fail = reject; }));
  const result = s.controller.apply("old", "ultra"); s.lifecycle.retired = true; s.controller.dispose();
  assert.equal(await result, false); fail(new Error("late IO")); await turn();
  assert.deepEqual(s.commits, []); assert.equal(s.clock.listeners.size, 0); assert.equal(s.clock.timers.size, 0);
});
