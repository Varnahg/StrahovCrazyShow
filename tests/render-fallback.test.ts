import test from "node:test";
import assert from "node:assert/strict";
import { RenderFallbackSession, WebGpuInitializationError } from "../client/render-fallback";

const automatic = { hostname: "strahov.example", search: "?view=world" };

test("automatic preference changes only for future attempts on the current page", () => {
  const session = new RenderFallbackSession();
  const pendingSelection = session.select(automatic);
  const failure = new WebGpuInitializationError("webgpu", "initialization-failed", new Error("device refused"));
  assert.deepEqual(session.request(failure, automatic), { backend: "webgl2", reason: "initialization-failed" });
  assert.deepEqual(session.select(automatic), { requested: "webgpu", backend: "webgl2", automatic: true, fallbackReason: "initialization-failed" });
  assert.deepEqual(pendingSelection, { requested: "webgpu", backend: "webgpu", automatic: true, fallbackReason: null });
  assert.equal(Object.isFrozen(pendingSelection), true);
  assert.equal(new RenderFallbackSession().select(automatic).backend, "webgpu", "no persistent hardware blacklist");
});

test("one failed attempt requests one new canvas, while concurrent owners can finish their own fallback", () => {
  const session = new RenderFallbackSession();
  const first = new WebGpuInitializationError("webgpu", "unavailable");
  const second = new WebGpuInitializationError("webgpu", "initialization-failed");
  const decision = session.request(first, automatic);
  assert.ok(decision);
  assert.equal(session.request(first, automatic), null);
  assert.equal(session.request(second, automatic), decision);
  assert.equal(session.request(second, automatic), null);
  assert.equal(Object.isFrozen(decision), true);
});

test("explicit selections override the page preference and never authorize an automatic retry", () => {
  const session = new RenderFallbackSession();
  session.request(new WebGpuInitializationError("webgpu", "unavailable"), automatic);
  for (const backend of ["webgpu", "webgpu-fast", "webgl2"] as const) {
    const location = { hostname: "localhost", search: "?renderBackend=" + backend };
    assert.deepEqual(session.select(location), { requested: backend, backend, automatic: false, fallbackReason: null });
    assert.equal(session.request(new WebGpuInitializationError("webgpu", "unavailable"), location), null);
  }
});

test("abort, cleanup, import, shader, asset, deadline and running device errors do not change backend", () => {
  const session = new RenderFallbackSession();
  const abort = new AbortController(); abort.abort();
  assert.equal(session.request(new WebGpuInitializationError("webgpu", "unavailable"), automatic, abort.signal), null);
  for (const error of [
    new Error("import chunk failed"), new Error("shader validation failed"), new Error("asset integrity failed"),
    new Error("preparation timeout"), new Error("device lost while playing"),
    new AggregateError([new WebGpuInitializationError("webgpu", "unavailable"), new Error("cleanup failed")]),
    Object.assign(new Error("aborted"), { name: "AbortError" }),
    { name: "WebGpuInitializationError", backend: "webgpu", reason: "unavailable" },
    new WebGpuInitializationError("webgpu-fast", "initialization-failed"),
  ]) assert.equal(session.request(error, automatic), null);
  for (const search of ["?renderBackend=bad", "?renderBackend=", "?renderBackend=webgpu&renderBackend=webgl2"])
    assert.equal(session.request(new WebGpuInitializationError("webgpu", "unavailable"), { ...automatic, search }), null);
  assert.equal(session.select(automatic).backend, "webgpu");
});
