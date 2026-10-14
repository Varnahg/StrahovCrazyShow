# KEY-7: isolated transient RTT acceptance, 14 October 2026

This checkpoint addresses the remaining A mechanism in urgent KEY-7: an isolated unconfirmed high round-trip measurement stops command production despite continued rendering and fresh authority. Main already contains V11, epoch calibration B and presentation phase fixes. The original six high-RTT intervals total9602.2ms; this is not a claim of one continuous visual freeze or proof of the cause of network/callback delay.

## Selection and interaction review before implementation

Two independent read-only reviews selected bounded confirmation in NetworkTimeline rather than changing raw NetworkProbe measurements, adding timer propagation, applying broad RTT smoothing, raising server limits or changing camera smoothing. A timestamped supported baseline may be retained briefly at the first over-budget transition; a second newer high sample or a fixed deadline confirms deterioration. Cold, stale or untimestamped inputs remain conservative. The3000ms baseline freshness and2500ms grace limits are product bounds based on observed1418–1932ms next-sample intervals and existing polling cadence, not measured wire constants or a guarantee of latency support. The freshness bound includes the actual1s UI poll phase: a1ms warm reply followed by a2s poll and534ms callback would already be2533ms old, so the initially considered2500ms freshness was rejected.

The reviews found two necessary interactions. First, lead and a new epoch's clock must use the same selected supported baseline: withholding calibration while using200ms lead can make every new command arrive late under actual100+100ms transport. Raw over-budget values must never calibrate the clock. Second, same-identity reconnect preserves Timeline frontiers, so sample-selection history needs its own reset when Probe changes connection. UI startup must not attach the latest contaminated measurement's timestamp to an older accepted RTT. Authority receipt times can also precede the newest sample; invalid or stale authority must retain its existing no-mutation guarantee.

The change preserves server authority, future/replay/frame bounds, sender rate/queue limits, fixed physics steps, probe nonce/cooldown, guest isolation, raw diagnostics and all graphics/asset paths. KEY-6 sender and KEY-12 presentation are regression dependencies; KEY-13/14/16 are outside this fix. A real sudden rise in latency may produce late commands during the short grace period; that risk must be bounded and visible, not hidden by asserting support for persistent300/500ms.

Primary references: [RFC5905 clock filtering](https://www.rfc-editor.org/rfc/rfc5905.html#section-10) separates raw measurements, sample selection and age; [High Resolution Time](https://www.w3.org/TR/hr-time-3/#monotonic-clock) provides monotonic elapsed-time semantics. Neither prescribes this game's thresholds. Repository-specific cause and alternatives are in [the earlier latency research](../../research-20261014/network-latency-recovery.md); final implementation decision and red/green proof are in [the feature research](../../research-20261014/network-transient-latency.md).

## Checkpoint discipline

Validation reuses the previous owned, idle KEY-17 worktree. Before edits,491 source/test/config blobs matched main7cc5a59 and all12 Git LFS objects matched their recorded SHA256. Its existing patched dependencies are retained. Main's dirty work and old previews are preserved. The new manifest references the previous full input manifest plus only the exact new delta, including tests; it does not duplicate three historical asset manifests.

Full pipeline results and implementation/security acceptance will be appended after execution. No browser/GPU, FPS or complete visual resolution of every KEY-7 symptom is claimed by this controlled network fix.

## Accepted implementation and results

Independent final security/lifecycle review found no blocker. The three runtime hashes match the reviewed source; the exact five-file source/test delta is in [checkpoint.json](checkpoint.json). No server, protocol, asset, dependency or physics implementation changed. The helper for required lead removes duplicated budget arithmetic; confidence is bounded O(1) state, snapshots remain read-only, no new timer or per-frame history is introduced.

Six original warm34/200 ×15/60/144FPS counterexamples fail against unchanged main and pass after the fix. The complete queue/sender statistics match no-spike controls.106/106 targeted tests and narrow TypeScript pass, including unchanged B regressions and actual Rapier replay/jump. Sustained300/500ms fixtures explicitly retain the tradeoff:86/98 late commands during transition, then0 new commands after confirmation,0 ahead/overflow and bounded depth6.

Final snapshot `a13a88d0b68f0c81fa209bfdcd801d22c7b24d54f765515f0d116f643472500c`: **869/869 tests, production build and complete isolated multiplayer integration PASS**. All8394 inputs, including157 test files and12 materialized LFS objects, stayed unchanged. No full-pipeline retry was needed. Original main installed dependency hashes/paths remain unchanged.

Actual authenticated Colyseus/SDK test with1s polling and a534ms hold of only the second probe callback:0 latency waits,87 sent commands,86 server-accepted commands and6.436m authoritative actor travel during the uncertain interval. This is a controlled callback-delay experiment, not proof of the original delay's source or a GPU playthrough. [Full live results](live-probe.json), [pipeline](pipeline.jsonl), [post-check](post-check.json), feature red/targeted logs and executable-harness text are retained here.

Main integration is limited to the five validated source/test files and this issue's research/evidence/task records. Existing main UI work is retained by applying only the feature patch and proving its inverse reconstructs the original bytes; only the validated clean UI enters the commit. Existing verification WIP receives an append and is not staged wholesale.

The known A mechanism is fixed. Complete visual acceptance of broader KEY-7 remains pending alongside separately tracked renderer/camera causes; this result does not claim that every reported correction or the user's original callback delay is explained.
