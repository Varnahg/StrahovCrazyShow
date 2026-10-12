# Building models B1 — production checkpoint

Source snapshot **16b469a2685a08dce9b886bdd4828033d5c10c62b8bc338b14d61b32c7d14b65**, 8,353 files, including tests and three native-authoring audit fixtures. Weather/outdoor base: `7dac0a4985bff5503019107ae88c9380d53e025f`; protocol 10. The immutable build is in `.cache/performance-snapshot/building-models-20261012-b1`.

[Pipeline](pipeline.json): **675/675 tests PASS**, TypeScript + production build PASS, complete isolated integration PASS on its first run. [Source manifest](source-manifest.json), [freeze log](snapshot.log), [test log](test.log), [build log](build.log), [integration log](test-integration.log). The freeze compared every live byte before/after copying with the frozen tree; only unchanged historical IPR references share a documented junction to D2.

Implementation commit **fbe6ed3 is integrated in main and pushed to GitHub**. The tested distribution is live at **http://127.0.0.1:4179/** with API2570. [Publication verification](publication.json) compared all8353 main and frozen inputs plus277 served HTML/JS/CSS/Moon files with zero mismatches. Actual station/model weather is enabled. The old atmosphere distribution and older local benchmark data were preserved.

The new model geometry, materials and canonical placement passed [121 GLB audits and 121 native Blender reopens](../../reality-pack/separate-assets/README.md). B4 has 35 source-identified openings across three selected faces; window profiles and the market flue come from actual editable Blender kits. Game near/far geometry and highest-detail archives are separate declared levels. No additional building overlay is loaded.

## First production sample

[Full exported browser record](one-day-medium-full.json), measured through the real game UI on 12 October 2026 at 13:27:22 UTC:

- Intel UHD Graphics 630 / ANGLE D3D11, WebGL 2, requested power preference high-performance. This is **not a GeForce measurement**.
- Medium; CSS 1280×720 and internal 1280×720; full game and HUD; one authenticated multiplayer avatar.
- 10.01 seconds, 319 frames: **31.8 FPS, p95 37.9 ms, p99 42.7 ms**, zero render and asset-loading errors.
- Spawn `(110, -2.32390, 12.00003)`, yaw π; fixed labelled daylight preview and [recorded QA weather](weather-fixture.json), fixture SHA `7020eb19c61f4b5999e77e9a2cc77c70eead7521f9fc32249fc200e609aec941`. The stale-model label remains visible; this weather is not presented as a current station observation.
- 2,649,599 triangles across all render passes, 448 draw calls; recorded frame work about 19.6 ms CPU and 25.54 ms GPU. These are a scene profile, not proof of an optimization.

[Unedited initial game screenshot](spawn-day-medium.jpg). The complete record was downloaded with the visible “Stáhnout úplný záznam” control and copied from the resulting local file. Automatic collector output did not appear during this initial sample; no missing collector result is presented as a successful save.

Read-only diagnosis established the reason: the existing collector explicitly accepts port4179, so the isolated QA origin4193 disables it. This was a QA setup limitation, not a polygon-limit failure or missing benchmark. The main4179 publication reports the collector enabled for the exact B1 source. Future isolated samples continue through the supported full-download UI; no security-origin contract was changed.

## Deliberately unfinished at this commit

### Subsequent B1 evidence, 12 October 2026

The actual new crowd run completed: 29 authenticated SDK clients plus the browser, six complete avatar presets, one shared world, 180.008 seconds, min/max30 motion rows, zero resynchronizations and zero network errors. All29 SDK clients disconnected gracefully. [Network report](network-29.json), [profiles](network-29.json.profiles.json).

Two valid medium1280×720 whole-game intervals recorded30 avatars: **31.8 / 30.5 FPS, p95 37.6 / 44.4 ms, p99 44.8 / 55.3 ms**, zero render/asset errors. A third interval overlaps/comes after cohort shutdown and reports1 avatar, so it is explicitly **excluded** from the crowd results; its raw file remains [preserved](mixed-cohort-excluded.json). [Structured summary](gpu-summary.json). These results still do not prove60FPS, GeForce behavior or a matched optimization A/B.

The physical parking route to B4 was traversed at `(84.418,29.211)` through the aisle nearZ23. A further north-side observation at `(82.302,13.126)` captured the complete facade. [Actual screenshot](b4-north-day-material-review.jpg), [full scene/camera record](b4-north-day-before-material-full.json). It exposed a material defect: B4 uses textureless StandardMaterial while surrounding plaster/concrete uses PBR and sky environment lighting; the north panel appears too dark. Correct front normals were checked. A separately scoped B4-only material correction is in progress, so this image is a diagnostic finding rather than a finished beauty shot. No global lighting, vegetation or avatar changes are part of that correction.

Own QA services4193/2587 and tab41 were stopped after this evidence; persistent main4179/2570 remains available. Further building close-ups, complete physical route and the corrected-material production checkpoint remain pending.

The human explicitly requested **commit and integrate main now, then continue**. Close-up B4/window/market game photographs, the full entry/stair/stadium/car/camera route and the new 30-session/6-avatar GPU cohort remain **pending**, as does any claim of 60 FPS or matched A/B speed improvement. The initial A/D walking check moved left from x110 to106.18 and right back to110.10 under the initial camera, but it is not a complete multi-angle input or driving proof. A parked car correctly blocked the subsequent walking route; the route was paused for the requested integration.

The temporary QA tab was closed before committing. Dedicated QA services are identified in [live-processes.json](live-processes.json); process cleanup and main publication will be recorded separately. No changes to avatars, grass or unverified interiors belong to this building checkpoint.

## Corrected B4 material and actual gameplay, B2

The B1 north-face photograph exposed overly dark B4 panels. The dedicated neutral PBR material now shares the existing daylight/sky environment, exact sRGB conversion, roughness 0.84 and zero metalness. It adds no lights, textures or per-frame work; all120 building geometry buffers remained identical. Combined Blender/GLB archives were regenerated and all121 native reopens and121 GLB audits passed again (M2). These are technical export checks, not photographic surveys of121 buildings.

B2 source **edfac4a2a1b0ed14fe8835b47df5b957ef8efe4a538e4c775710ecda7d44d19e**,8355 files including tests: **677/677 tests, build and full isolated integration PASS**. [Pipeline](b2-pipeline.json), [GPU/route summary](b2-summary.json). Real production game, medium1280×720 CSS/internal, Intel UHD630, full HUD, controlled labelled weather and noon preview:

| Scene | Avatars | FPS | p95 / p99 frame time |
|---|---:|---:|---:|
| B4 north | 1 | 33.2 | 38.2 / 46.9 ms |
| Spawn area | 30 | 28.3 | 43.5 / 48.7 ms |

Both ten-second records have zero render/asset errors. The29 SDK peers plus browser stayed in one world for120 seconds, with six complete avatar presets, exactly30 motion rows, zero resyncs/errors and graceful disconnection. These are Intel measurements, not GeForce60 confirmation. Camera differs from B1, so no matched speedup/regression claim. B1's third sample remains excluded because the crowd had ended.

Unedited gameplay photographs: [B4 north](b2-b4-north-day.jpg), [west entry](b2-b4-west-entry.jpg), [panel-window detail](b2-b4-window-detail.jpg), [shared dorm-window detail](b2-dorm-window-detail.jpg), [market east](b2-market-east.jpg), [market opening detail](b2-market-window-detail.jpg), [B6 stairs](b2-b6-entry.jpg), [reception landing](b2-b6-entry-landing.jpg), [successful descent](b2-b6-descended.jpg), [stadium east](b2-stadium-east.jpg), [closed wall](b2-stadium-closed-boundary.jpg), [30-session scene](b2-thirty-day-medium.jpg), [left turn](b2-car-left.jpg), [right turn and stop](b2-car-right-stop.jpg).

Actual route verified car entry/left/right/brake/exit, camera-relative walking, orbit/first-person fallback, B6 external stairs up into reception and back down, and the stadium east wall stopping forward motion near X=-143.2. An initial B6 retreat stopped at the entry edge; recentering passed without a jump or respawn. First approach to the interior briefly showed7–8 HUD FPS, then recovered to26; this cold-load hitch is recorded and not claimed fixed. This was not a timed interior benchmark or a walk of every doorway/perimeter. Browser pointer lock was unavailable; the documented drag fallback worked.

The exact source coverage is in [observations](../../building-modeling-20261012/references/observations.json): B4 selected north/west faces from May2024 / September2023 panoramas and CTU20June2024; general window typology from CTU20June2024 (block unidentified); market from1June2023 panorama. Other dorm faces were not individually newly surveyed. B1 ELSA capture date is unknown. Training-centre source is partially obscured and did not support a new detailed reconstruction. R-ko door remains unverified. Stadium uses prior sources and remains a closed exterior. Grey panel composition and millimetre profiles are estimates, not measured material facts.

## Final main reconciliation, B3

Main's source-sanitization/guard commits15c3c74 and a53a5f4 were preserved. B3 source **e94b95757c44c2d58c63a3df2bb7ecc8581725271fc9ff29124919a7988928a6**,8357 inputs, adds only the source guard CLI and seven tests. [Exact parity](b3-runtime-parity.json) confirms all8355 B2 inputs remain unchanged. B2 GPU evidence retains its original hash; B3 is not labelled as a newly measured sample. [Final pipeline](b3-pipeline.json) is authoritative for684 tests/build/integration.

B3 final result: **684/684 tests and production build PASS**. First isolated integration failed with `Timeout: D turns the real front wheels right`; its original log and code1 remain in `b3-pipeline.json`. A complete second isolated `pnpm test:integration`, with no source changes, **passed** including real vehicle manoeuvres, multiplayer and input backlog. [Retry result](b3-integration-retry.json), [complete log](b3-integration-retry.log), [vehicle evidence](b3-integration-retry-vehicle.json). The first timeout's cause is not proven; passing retry is not represented as a clean first run.
