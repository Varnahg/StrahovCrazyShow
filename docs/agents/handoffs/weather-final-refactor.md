# Weather final refactor · 2026-10-12

Owner `weather-01a12fcb-root`, original weather task `01a12fcb-4233-70c0-bc2d-95fc261f870c`; main at coordination HEAD de5647a. Only explicitly claimed weather files were edited. Outdoor game/world-renderer and active GPU window were not touched.

- Shared `ageWeatherSnapshot` now implements one server/client freshness policy; the client module re-exports it. Independent observation/model/field provenance and immutable retained responses remain intact.
- EXP fog transitions smoothly. Daytime unlit Moon reveals the actual backdrop; Earthshine decreases towards full phase. Scenery depth clips celestial bodies behind distant buildings.
- Updated old graphics art-unit bounds to the new documented mean-distance moon scale and fog fallback, retaining horizon, relative contrast and continuity checks.
- Added model snow/visibility labels and HYG/NASA attribution, including dataset license and modifications, to settings in Czech/English.
- Updated weather README, provenance JSON and atmosphere-lighting.md with primary references, implementation, limitations and test scope.

Validation: two focused CPU batches of **30/30 PASS** each after refactor; second includes i18n, lighting budget/maintenance, night, graphics and client freshness. No full suite/build/GPU performed here. A first intermediate batch had 20/30 because a Python file read accidentally used Windows cp1250 for UTF-8 sources; exact encoding repair restored the original Czech strings/units and all 30 then passed. This failure was an editing issue and is not attributed to external services. Original run remains in tool history; final source assertions exercise the station and model unit strings.

Touched TypeScript normalized only within the claimed files using Prettier LF. No assets or dependencies intentionally changed. No persistent process started; prior preview5191 already stopped and released. The cloud refinement handoff remains independently hashed. Final production snapshot and actual GPU work belong to weather-integration-20261012 after outdoor releases its resources.

File manifest SHA-256: `e8a549f3fe190d2f52d5d9ebb64c5cf2449e99c0b70210ff2298ae33cd663bad` (UTF-8 LF text below).

```text
shared/weather.ts e9c9faed4a1200d020324bcc6a1b42b32c340f5f1dbcb26f36bc6f904226b542
server/weather.ts 1ecd80066e7c5f53bd23f61f8b4fde90683b26842089b101056816b8cdd52cf8
client/weather-freshness.ts 6c0da068bdb54faf10a40b7671652ca68602a02e6191e6d196afc928f737081d
client/art-lighting.ts 39aa6772e6d398b8ef54ed8eea31fe25aa3859148d5ea9b7ccc5c3d7a09b9707
client/sky-weather.ts 5b5ff84ea82abd428face381739ebc52e7a28ca34f59dba6fff64b22218a0b8e
client/ui.tsx 55d2dc7a9deb24a11d5878aac753d83ab32daa93f3313500357c48975a715d53
client/i18n-messages.ts a08728019cce0ba2a50904b89f8a1ea34719fa687d2402d70cc061f231f6f06f
tests/graphics.test.ts ed9b4b4097a1c3a337f0bceb562e285e1707a9b26bd40b6be710dbd14092a881
tests/weather-freshness.test.ts 0fcbe81315b0fbc02b65a66773565f675152f8a8800e89bc77b8b820d9f6383f
docs/weather/README.md f6db257c6153fb4ba11aff54302575fbe79bcd96e9b81fad37a83a74022133b3
docs/weather/atmosphere-lighting.md 476cae19837d61cef1fa43a31a99268045dddd8986d0e2a161e2b550a13d6083
docs/weather/sources.json 27bc90558c080b6362088ddc4969d58bdb88d1d258910419057a99454f480d22
```

Reservation is released after this handoff and task marked done by its original coordinating owner. Metadata changes from this root accepted atmosphere-cloud-refinement, added its three files to integration scope, and introduced/completed this disjoint CPU refactor task. Historical coordination evidence and unrelated tasks remain unchanged.
