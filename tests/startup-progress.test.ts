import test from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  observeStartupProgress,
  paintStartupStage,
  startupStageLabel,
} from "../client/startup-progress";
import { LoadingScreen } from "../client/loading-screen";

test("startup observer follows only its canvas, deduplicates and retires queued callbacks", () => {
  const canvas = {
    dataset: { bootStage: "physics-library" },
  } as unknown as HTMLCanvasElement;
  const stages: string[] = [];
  let callback!: MutationCallback;
  let disconnects = 0;
  const observer = {
    observe(target: unknown, options: unknown) {
      assert.equal(target, canvas);
      assert.deepEqual(options, {
        attributes: true,
        attributeFilter: ["data-boot-stage"],
      });
    },
    disconnect() {
      disconnects++;
    },
  } as MutationObserver;
  const stop = observeStartupProgress(
    canvas,
    (stage) => stages.push(stage),
    (value) => {
      callback = value;
      return observer;
    },
  );
  callback([], observer);
  canvas.dataset.bootStage = "cad-buildings";
  callback([], observer);
  stop();
  stop();
  canvas.dataset.bootStage = "ready";
  callback([], observer);
  assert.deepEqual(stages, ["physics-library", "cad-buildings"]);
  assert.equal(disconnects, 1);
});

test("a new canvas can restart the same stage without a stale generation suppressing it", () => {
  const events: string[] = [];
  const create = () =>
    ({
      observe() {},
      disconnect() {},
      takeRecords() {
        return [];
      },
    }) as MutationObserver;
  const first = observeStartupProgress(
    { dataset: { bootStage: "presentation" } } as unknown as HTMLCanvasElement,
    (value) => events.push(`first:${value}`),
    create,
  );
  first();
  const second = observeStartupProgress(
    { dataset: { bootStage: "presentation" } } as unknown as HTMLCanvasElement,
    (value) => events.push(`second:${value}`),
    create,
  );
  second();
  assert.deepEqual(events, ["first:presentation", "second:presentation"]);
});

test("unknown or inherited stage labels are safe and fallback has its own label", () => {
  for (const stage of ["unknown", "constructor", "__proto__"])
    assert.equal(startupStageLabel(stage, "cs"), "Připravuji herní scénu");
  assert.equal(
    startupStageLabel("renderer-fallback", "en"),
    "Trying the fallback 3D renderer",
  );
});

test("loading view reports real activity without percentage or readiness substitution", () => {
  for (const locale of ["cs", "en"] as const) {
    const html = renderToStaticMarkup(
      createElement(LoadingScreen, {
        locale,
        stage: "light-preparation",
        onLeave() {},
        onFeedback() {},
      }),
    );
    assert.doesNotMatch(
      html,
      /aria-busy="true"/,
      "live phase announcements must not be held by a busy ancestor",
    );
    assert.match(html, /role="status"/);
    assert.match(html, /aria-current="step"/);
    assert.doesNotMatch(html, /role="progressbar"|aria-valuenow|\d%/);
    assert.match(
      html,
      locale === "cs"
        ? /Připravuji světlo a materiály/
        : /Preparing lighting and materials/,
    );
  }
  const failed = renderToStaticMarkup(
    createElement(LoadingScreen, {
      locale: "cs",
      stage: "submitted-frame",
      error: "Chyba rendereru",
      onLeave() {},
      onFeedback() {},
    }),
  );
  assert.doesNotMatch(failed, /aria-busy="true"/);
  assert.match(failed, /role="alert"/);
  assert.doesNotMatch(failed, /class="startup-spinner"/);
});

test("construction paint waits for two frames and cancellation releases a hidden-tab wait", async () => {
  let next = 0;
  const frames = new Map<number, FrameRequestCallback>();
  const schedule = (callback: FrameRequestCallback) => {
    frames.set(++next, callback);
    return next;
  };
  const cancel = (id: number) => {
    frames.delete(id);
  };
  const runFrame = () => {
    const [id, callback] = frames.entries().next().value!;
    frames.delete(id);
    callback(0);
  };
  const controller = new AbortController();
  let painted = false;
  const work = paintStartupStage(controller.signal, schedule, cancel).then(
    () => {
      painted = true;
    },
  );
  runFrame();
  await Promise.resolve();
  assert.equal(painted, false);
  runFrame();
  await work;
  assert.equal(painted, true);
  assert.equal(frames.size, 0);

  const cancelled = new AbortController();
  const waiting = paintStartupStage(cancelled.signal, schedule, cancel);
  const queued = frames.values().next().value!;
  cancelled.abort();
  await waiting;
  queued(0);
  assert.equal(
    frames.size,
    0,
    "a retired callback cannot schedule a new frame",
  );
  await paintStartupStage(cancelled.signal, schedule, cancel);
  assert.equal(frames.size, 0);
});

test("loader preserves compatibility notice and manual recovery only when startup failed", () => {
  const render = (error?: string) =>
    renderToStaticMarkup(
      createElement(LoadingScreen, {
        stage: "renderer",
        locale: "cs",
        error,
        onLeave() {},
        onFeedback() {},
        rendererNotice: createElement(
          "p",
          { role: "status" },
          "WebGL2 compatibility",
        ),
        recoveryAction: createElement(
          "button",
          { type: "button", "data-renderer-fallback": "webgl2" },
          "Retry in WebGL2",
        ),
      }),
    );
  assert.match(render(), /WebGL2 compatibility/);
  assert.doesNotMatch(render(), /data-renderer-fallback/);
  assert.match(render("Renderer failed"), /data-renderer-fallback="webgl2"/);
});
