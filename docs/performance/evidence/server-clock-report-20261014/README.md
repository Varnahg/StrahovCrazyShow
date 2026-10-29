# KEY-18: observed server clock counters, 14 October 2026

This is the already documented non-game portion of KEY-2: distinguish counter increases during observed intervals from lifetime server totals/maxima. Main and Linear were synchronized first at af4d6ef. KEY-18 is a child tracking this bounded requirement, not an additional graphics feature.

## Before implementation

The current offline report does not aggregate frame-window context.network.server.clock at all. It therefore lacks a trustworthy automatic summary of these existing records. NetworkClockTiming explicitly exposes room-lifetime callbacks/droppedTotalMs and lifetime elapsed/cpu maxima; current callback samples are separate values. Adding lifetime totals, summing current droppedMs snapshots, or subtracting maxima would produce incorrect conclusions.

Chosen scope: scripts/diagnostics-report.mjs and tests/diagnostics-report.test.ts, with small local functions inside the existing plain-Node CLI. No new Game emitter, server, protocol, queue aggregation, rendering, dependency or network request. Current committed Game does not yet emit this server context; logs without it must report unavailable. Existing wave3 recordings already contain the needed data.

The first valid sample is a baseline, not work attributed to the session. Only comparable monotonic intervals contribute. Repeated context snapshots must not duplicate work; conflicting batch/sequence/context evidence, missing records, invalid counters, resets and documented connection/game boundaries must not create fabricated increases. A single valid snapshot cannot establish a delta. Observed current callback maxima and reported lifetime maxima remain separate and explicitly sampled/historical. Unknown server instance identity prevents detection of every hidden reset; these are observed intervals under continuity assumptions, not complete session totals.

## Independent archival oracle

Original local recording07c227f8-d2f8-4011-a6f8-5d27ad0627a4 has SHA2560ebf9512e10df06d94121358a57133885b7d0371b10d3b0b3027dbbce4b46dbb,1799 records and496 frame-window server observations. Two independent read-only calculations agree:

| Quantity | Observation |
|---|---|
| callbacks | 86629 →108024; increase21395 |
| droppedTotalMs | 3966.6666667 →4250; increase283.3333333ms |
| sampled current CPU / elapsed maximum | 15.3898ms /32.0614ms |
| reported lifetime CPU / elapsed maximum | 1108.5657ms /1108.6527ms |

All sampled current droppedMs values are zero, demonstrating why summing those snapshots loses the actual counter increase. The first server observation occurs well after recording start, so its lifetime value is not assumed to predate the entire client session. Raw evidence remains on disk unchanged; only numeric projections and its hash are versioned here.

## Security and validation scope

Use a fixed whitelist of numeric scalars, finite/nonnegative and safe-integer checks, checked aggregation, bounded detail and explicit continuity limitations. No eval, dynamic object merge, credential/profile capture or source-log writes. The existing reader already stores per-record ordering data; bounded output is not a claim of constant-memory or hostile-input DoS hardening.

Fixtures, original report/CLI regressions, a plain Node JSON/text run on the immutable archive, source-hash verification, then the stable full test suite and build provide complete acceptance for this offline task. No browser, GPU, server or gameplay test is required or planned. The broader KEY-2 graphics/instrumentation acceptance remains separate.

## Completed acceptance

The offline report now returns additive serverClock JSON and readable text. A shared empty factory keeps legacy formatting compatible. The implementation uses a scalar projector and a segmented aggregator; existing frame percentiles, session selection and integrity reporting remain unchanged. Counters are compared only at fresh endpoints; cached copies are not summed. Required counters and optional timing fields have separate availability.

The independent review found an intermediate temporal-boundary bug: clearing a baseline alone could allow a later-delivered but earlier-sampled context to cross an unknown period. Missing/invalid data, sequence gaps, ambiguous sequence copies and conflicting contexts now establish explicit time barriers; stale rejection itself does not move a barrier indefinitely. Added regression fixtures preserve that correction. Final code/security review passed; source hashes match the reviewed pair in the manifest.

**29/29 focused report tests PASS**, preserving all12 original tests. Historic red/intermediate outputs remain in feature/. Final whole-project validation: **892/892 tests and production build PASS**, no retry of the full pipeline. Snapshot`54f3532699e234a935b9cc7e8d85bc99d6aafc939903f631c262ebb5670e4d08` includes8395 inputs and158 test files; all before/after input hashes agree. No server, integration/gameplay, browser or GPU run was started for this offline task.

Two independent calculations and plain Node JSON/text CLI agree on the immutable archive:496 raw frame-window server records →479 unique retained contexts/475 fresh comparable intervals; **21395 callbacks and283.333333ms observed drop increase**. Sampled CPU maximum15.3898ms is separate from reported lifetime CPU maximum1108.5657ms. Original log SHA before/after remains`0ebf9512e10df06d94121358a57133885b7d0371b10d3b0b3027dbbce4b46dbb`. [Compact archive results](archive-acceptance.json) and [independent oracle](independent-archive-oracle.json) contain numeric evidence only; full raw reports stay in local ignored cache.

KEY-18 acceptance is complete without a new game test. The broader KEY-2 still has distinct emitter/render/GPU work. Current main logs without server context return unavailable; no new collection capability is implied. Existing dirty main work, recorded source logs, dependencies and previews are preserved.
