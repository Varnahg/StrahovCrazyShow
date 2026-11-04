# Experimental grass tile worker

Status: v2 targeted tests 36/36 and full TypeScript passed 19 October 2026; focused independent review accepted the native-to-worker handoff repair with no new findings. Implementation handed to root for browser/full validation; this is not an accepted optimization. Direct delegated task `client-threading-grass-worker-prototype-20261019`; no nested BMAD workflow.

Decision input: [parent audit](../client-threading-cpu-profile-20261019/worker-decision-input.md). Runs 01–03 did not intersect mapped grass. Runs 05–06 had 4007/5311 roots and 195/586 cached tiles, but profiler presence (prepareTile 1/2 samples versus batch.flush 14/9) does not establish isolated placement duration or a useful worker gain. Keep the smallest reversible boundary and decide from comparable production A/B.

## Contract

- Only exact loopback `grassWorker=1` enables one module worker per controller. Default native generator path remains enabled otherwise; no settings or UI change.
- Same source classifier, terrain and Babylon matrix generator. Main owns the existing FIFO cache1536. Worker releases each completed cache entry before transferring its ArrayBuffer. No transferred cache hit, duplicate long-term matrix cache, SAB, source-data edit or worker Scene/device.
- Two pending requests including received payloads; at most two cache insertions per update under the existing2ms tile-management deadline. Separate original selection2ms and256-step budget,256 additions/1024 checks, fades and batch uploads remain unchanged.
- Message handler only retains a bounded result and receive timestamp. Update validates/accepts it and increments tileRevision. Camera movement alone does not invalidate deterministic results; outside-capsule cancellation, resource epoch reset, duplicates and disposal reject obsolete replies.
- Serial worker generator slices yield through scheduled macrotasks. Cancel/reset can abandon unfinished generators between slices. Disposal terminates the owned worker and clears handlers/inbox.
- Bootstrap timeout5s; original native generator continues during bootstrap, so this never extends the game's startup readiness or prevents grass progress. Once ready, request timeout500ms causes permanent native fallback for this controller. This conservative prototype guard bounds hangs, is not a latency target, and may be tightened/rejected after actual browser results. Termination precedes requeue, preserving completed cache/roots/fades without concurrent producers.
- `ready` retains its existing render-resource meaning. `pendingTiles` includes in-flight and received tiles. Optional `tileWorker` stats are absent by default: bounded cumulative counts, bootstrap latency, completed-tile worker CPU, send-to-receive latency and main validation/cache-apply time with maxima. Worker CPU excludes cancelled partial work, module initialization, scheduling and transfer; apply excludes selection, fade, batch upload and GPU. Counters are evidence components, not FPS/performance claims.

## Validation boundary

New tests use the real placement generator and real structuredClone transfer, with deterministic fake scheduling/transport. Controller tests assert exact settled hash/1916 roots, deadline/apply limits, native progress during bootstrap, failure fallback, quality/teleport, and current near-frustum coverage during delayed walking/sprinting/turns. Existing grass selection, placement, batch and shader-preparation tests remain necessary.

The root owns actual browser module-worker loading, source identity, startup duplication of shared/world TREES, comparable cold convergence, A/B CPU/FPS/p95/p99, full suite/build/integration and acceptance. Reject byte/coverage/lifecycle regressions or no useful measured benefit; do not ship the prototype merely because tests pass.

Targeted command run by root in its owned worker-unit snapshot: `node --import tsx --test --test-concurrency=2 tests/photo-grass-worker.test.ts tests/photo-grass.test.ts tests/photo-grass-selection.test.ts tests/photo-grass-preparation.test.ts`. Exit0,35/35,36.9s; source `ddab5b6f8e399db4e99d460983eacda02e3c1e6c72e3c6c70b156ebe0a9b9119`; logs `.cache/client-threading-cpu-profile-20261019/worker-unit-logs/targeted.{log,json}`. No child tests/build/GPU/server were launched while root measured GPU.

Review repair: when readiness arrives during a partially completed native tile, finish only that tile and return before starting another native generator. Otherwise realistic 2 ms slices can repeatedly finish one tile and begin the next, keeping the ready worker idle. The new regression advances the clock by 0.25 ms per call (eight generator steps per slice), verifies this partial-work boundary and subsequent worker dispatch. V2 staged source: `f893fb5b44f87bef01a78d66c764ce256062c292eda796544b15703ad8d21da4`; runtime/test files frozen during verification.

Final v2 verification by root: same targeted command, 36/36 passed (41.8 s test-runner duration; command 19:13:35–19:14:17 UTC), plus `tsc --noEmit` passed (31 s). Exact records: `.cache/client-threading-cpu-profile-20261019/worker-unit-v2-logs/targeted.json` and `types.json`. Root follow-up task `client-threading-grass-worker-validation-20261019` owns full suite/build/integration and real Edge A/B. Default enablement, performance acceptance and commit remain pending that evidence.
