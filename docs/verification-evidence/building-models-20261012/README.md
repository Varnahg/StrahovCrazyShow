# Building models B1 — production checkpoint

Source snapshot **16b469a2685a08dce9b886bdd4828033d5c10c62b8bc338b14d61b32c7d14b65**, 8,353 files, including tests and three native-authoring audit fixtures. Weather/outdoor base: `7dac0a4985bff5503019107ae88c9380d53e025f`; protocol 10. The immutable build is in `.cache/performance-snapshot/building-models-20261012-b1`.

[Pipeline](pipeline.json): **675/675 tests PASS**, TypeScript + production build PASS, complete isolated integration PASS on its first run. [Source manifest](source-manifest.json), [freeze log](snapshot.log), [test log](test.log), [build log](build.log), [integration log](test-integration.log). The freeze compared every live byte before/after copying with the frozen tree; only unchanged historical IPR references share a documented junction to D2.

The new model geometry, materials and canonical placement passed [121 GLB audits and 121 native Blender reopens](../../reality-pack/separate-assets/README.md). B4 has 35 source-identified openings across three selected faces; window profiles and the market flue come from actual editable Blender kits. Game near/far geometry and highest-detail archives are separate declared levels. No additional building overlay is loaded.

## First production sample

[Full exported browser record](one-day-medium-full.json), measured through the real game UI on 12 October 2026 at 13:27:22 UTC:

- Intel UHD Graphics 630 / ANGLE D3D11, WebGL 2, requested power preference high-performance. This is **not a GeForce measurement**.
- Medium; CSS 1280×720 and internal 1280×720; full game and HUD; one authenticated multiplayer avatar.
- 10.01 seconds, 319 frames: **31.8 FPS, p95 37.9 ms, p99 42.7 ms**, zero render and asset-loading errors.
- Spawn `(110, -2.32390, 12.00003)`, yaw π; fixed labelled daylight preview and [recorded QA weather](weather-fixture.json), fixture SHA `7020eb19c61f4b5999e77e9a2cc77c70eead7521f9fc32249fc200e609aec941`. The stale-model label remains visible; this weather is not presented as a current station observation.
- 2,649,599 triangles across all render passes, 448 draw calls; recorded frame work about 19.6 ms CPU and 25.54 ms GPU. These are a scene profile, not proof of an optimization.

[Unedited initial game screenshot](spawn-day-medium.jpg). The complete record was downloaded with the visible “Stáhnout úplný záznam” control and copied from the resulting local file. Automatic collector output did not appear during this initial sample; no missing collector result is presented as a successful save.

## Deliberately unfinished at this commit

The human explicitly requested **commit and integrate main now, then continue**. Close-up B4/window/market game photographs, the full entry/stair/stadium/car/camera route and the new 30-session/6-avatar GPU cohort remain **pending**, as does any claim of 60 FPS or matched A/B speed improvement. The initial A/D walking check moved left from x110 to106.18 and right back to110.10 under the initial camera, but it is not a complete multi-angle input or driving proof. A parked car correctly blocked the subsequent walking route; the route was paused for the requested integration.

The temporary QA tab was closed before committing. Dedicated QA services are identified in [live-processes.json](live-processes.json); process cleanup and main publication will be recorded separately. No changes to avatars, grass or unverified interiors belong to this building checkpoint.
