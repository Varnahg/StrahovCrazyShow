# Recorded walkthrough fixtures

These are sampled render-state scenarios extracted on 2026-10-20 from the two user sessions. They replay observed positions, camera and settings in test code. They do not reproduce input ticks, collisions, network behavior, actor/car orientation or recovery. `zone` preserves observed floor coverage and does not prove traversability. Appearance and other personal/browser/network context, frame timings and quality statistics are omitted.

| Fixture | Complete uncompressed source SHA-256 | Selected input / ready / last input | All source records | Timeline samples / events |
| --- | --- | --- | --- | --- |
| `b6-20261017.json` | `cb15db6a0ee7905ede9debdd7435556c165799bcc0d3931246122d97403e46c2` | 0 / 259 / 2498 | 5297 | 584 / 24 |
| `outdoor-car-20261018.json` | `52cdf6bde7f27268ee6f628d347ba636a9ebb13d42aa504be2fb0a949434d425` | 636 / 1014 / 1695 | 1717 | 166 / 19 |

B6 comes from the original, read-only local `webgpu-comparison/StrahovCrazyShow/.cache/webgpu-migration/user-test-20261017-completed/session-prefix.jsonl`. Its whole private session is not copied into this fixture directory. It covers outside and B6 floors 0–4. Historical faults at 2412, 2413, 2450, 2451 and 2496 remain identified in `limitations`; they are not replay instructions or expected current errors. The long tail after the final frame-window is excluded.

The outdoor source is the committed [`session.jsonl.gz`](../../../docs/performance/evidence/webgpu-migration-20261016/user-4196-20261018/session.jsonl.gz). Its preceding agent smoke game is excluded by the selected range. `fromSeq` describes the provenance selection, including human startup; the replay timeline starts strictly at the selected `game-ready` and contains no menu/disposal event.

`recordCount` counts the complete validated source, including records outside the selection. SHA/session/sequence continuity and a consistent build snapshot are checked over that complete source before slicing. A duplicate delivery or any missing sequence is rejected. Gzip decompression is a caller responsibility; `compileRecording` takes uncompressed bytes and performs no file I/O.

The fixture clock is relative to `game-ready`. Samples use `frame-window.data.contextAtMs`, not the later flush timestamp; events use their explicit `atMs`. Time ordering is stable by relative time and original sequence. `durationMs` ends at the final timeline observation, so it excludes the flush/disposal tail. Missing initial states and observation gaps over 3 seconds remain explicit. Interpolation between observations is synthetic and cannot be treated as a recording of the original frames. Observed automatic quality is output to reproduce; these scenarios do not test the adaptation algorithm or certify historical FPS.

The chosen extraction approach uses an explicit nested technical whitelist, one pure compilation path and one in-memory timeline per fixture. Copying raw context would retain unnecessary personal/performance data; reconstructing input or choosing autopilot waypoints would invent missing evidence. The fixtures keep the recorded weather origins, timestamps and stale flags, and exact sampled UTC lighting instants.

To regenerate a fixture after obtaining its complete original source, import `compileRecording` from `../recording.mjs`, pass uncompressed bytes and `{ id, ...fixture.source }`, then write the returned JSON. Extra provenance fields in this options object are ignored. Preserve the original expected SHA-256; do not replace it with a hash of a truncated log. The committed outdoor source is recompiled and compared structurally in `tests/recorded-walkthrough-recording.test.ts`; B6 provenance and coverage are verified against its bounded committed fixture because the private raw source is deliberately local.

Run the light data tests from the repository root:

```powershell
pnpm exec tsx --test tests/recorded-walkthrough-recording.test.ts
```
