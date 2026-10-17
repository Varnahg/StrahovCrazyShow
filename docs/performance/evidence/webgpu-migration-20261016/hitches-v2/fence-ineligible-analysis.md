# QA-only queue completion fence, 17 October 2026

Owner: `webgpu-hitch-fence-probe-20261017`, task `webgpu-migrate-pipeline-20261016`; recipient root. Only this new cache folder and the existing task handoff are writable. No production runtime/test file, existing QA source, played build, shader, cache, timeout, engine method, dependency or asset is modified.

## Input and question

Exact read-only input: `.cache/webgpu-hitch-validation-20261017/timing-off`, snapshot `02cbf7ad962404a793721fe80766c5b4c84d4f276388192e1d01575711feb0af`, source commit `8363c7603028a5a11b2f3d54f7a702c34ccfb608`. Root observed first F with timestamp queries OFF still producing approximately 948 ms Game CPU work followed by 3472 ms RAF gap, raw and engine counters each +1. This is root-provided observation, not a measurement performed by this CPU task. It disproves removal of timestamp queries as a sufficient fix; it does not identify the long-gap cause.

Pinned primary source in readonly dependencies-v5, Babylon 9.30.0: `Engines/webgpuEngine.pure.js` endFrame lines 2350–2369 calls `flushFramebuffer(true)` before `super.endFrame()`. `flushFramebuffer` lines 2379–2407 finishes encoders and calls `device.queue.submit` at line 2385. `Engines/abstractEngine.pure.js` endFrame lines 398–400 increments frame ID and notifies onEndFrameObservable. A CPU regression executes both real pinned WebGPU methods with minimal resource/queue stubs and demonstrates order `submit`, then `fence`.

## Choice and scope

Choose one `onEndFrameObservable.addOnce` observer armed only after the complete copied actual Game.frame has measured a finite CPU duration >=250 ms, existing opt-in frame profiler exists, WebGPU is active and health is valid. Ordinary frames allocate no probe. At most one owned probe is pending, covering both the waiting observer and the asynchronous completion Promise. No polling, timers, new render calls, flushes, timestamp queries or engine wrappers.

Calling the fence at Game.frame exit would precede the engine's final submit and miss current work. Awaiting it in Game or making it part of readiness would change the scheduling being investigated. Wrapping submit/endFrame adds an unnecessary owner/lifecycle layer. A one-shot existing post-submit observable is the smallest boundary that preserves normal frame behavior.

The observer requests `queue.onSubmittedWorkDone()` and consumes both settlement branches. `Promise.resolve` also contains an erroneous thenable rejection; its handlers contain diagnostics failures and do not change render health. Synchronous queue throws become `failed/sync-throw`; Promise rejection becomes `failed/rejection`. No error message, shader, URL or personal data is recorded.

Events use the existing `engine-frame-profile` kind and `stage: gpu-completion-fence`. Fields: status queued/completed/failed, probeId (monotonic per Game), rendererId, generation (RenderHealth), engineGeneration (existing profiler), rawRafEpoch at arm, cpuFrameStartMs, cpuFrameEndMs, cpuFrameMs, frameMs, queuedAtMs and completedAtMs/failedAtMs plus completionLatencyMs. `queued` means start of the request, including a synchronous throw. `engineGeneration` deliberately avoids the privacy filter's forbidden `profile` key pattern; the real recorder and validator preserve the identity fields in tests.

Identity/current-state checks cover Game disposal/readiness/fault, engine, device, profiler owner, renderer and both generations. Disposal cancels/removes the pending observer before health/engine disposal. Already requested Promises are not cancellable; late resolve/reject is consumed and ignored. Changed identity or unhealthy state is ignored, with owned pending state cleared. Observer installation, snapshot, clock, sink and cleanup failures are diagnostic-only. A missing endFrame notification produces no fence; it must not be interpreted as quick completion. Original Game ready/fault guards remain byte-identical apart from added independent diagnostic call/state/disposal cleanup.

Completion latency is **content-timeline** elapsed time from the post-submit fence request to its JavaScript settlement callback. It includes prior work on that queue and callback scheduling; it is not GPU execution duration, per-frame GPU timing, or proof of a driver/compiler cause. Future submits are not intentionally awaited. Profiling itself can affect timing and this experiment must not be promoted as a performance fix.

## Validation and refactor

Actual source-AST Game.frame fixture was extended, not replaced with a duplicate frame algorithm. Six initial fence tests all failed without the candidate. The original RED additionally reports an unhandled test Promise rejection because the missing fence had not registered consumption; the final implementation consumes that rejection. Initial GREEN 5/6 exposed the sanitization issue above; corrected GREEN 6/6. Two more regressions cover real pinned post-submit ordering and late snapshot/unavailable observer paths.

Final direct Node file test: 17/17 PASS (9 existing diagnostics/cadence cases +8 new fence cases). Final scoped TypeScript roots `client/game.ts` and `tests/game-diagnostics.test.ts`: 3361 transitive files, zero diagnostics. The first scoped run had only two unavailable global GPUDevice type errors; using the exact local queue interface resolved them without adding a dependency or changing runtime behavior. No full suite/build/integration/GPU/server/install was run. `validation.json` contains exact UTC intervals and exit codes; `tests-final.log` and `types-final.log` are the final logs. Earlier RED/failure evidence remains distinct.

Refactor: one pending owner, one cancellation path, one identity predicate, one safe emitter and one settlement path. No global store, cache, unbounded queue or per-normal-frame snapshot. CPU interval ends before diagnostic capture overhead; interpret that boundary explicitly. Both Promise branches release owned state. Root must review the exact candidate diff and assemble a new separately owned QA variant, then perform the actual F experiment. This folder is an isolated targeted-test staging area, not a complete production snapshot or build.
