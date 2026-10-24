# WebGPU migration — KEY-22

Owner: `webgpu-migration-01a14497-root`, 2026-10-16. User authorized the complete migration, separate issues, implementation and integration. [Parent issue](https://linear.app/gigeconomy/issue/KEY-22/premigrovat-celou-produkcni-hru-a-editor-na-plynule-webgpu) is the current delivery record; this document fixes the engineering contract. An individual CPU test is not graphical acceptance.

## Current candidate — 23 October 2026

Main9341bcef remains WebGL2; PR23 is draft. The immutable source10 actual editor/game/B6 proof is [editor-summary-source10](evidence/webgpu-completion-20261021/validation/editor-summary-source10/verification.json):6ready presets/accessories/resize, original Guest+2newMP startup76stages in65.614/66.456/69.197s under unchanged30/90s budgets, northB6 entry/reception/bothflights tofloor1 and first/repeatF healthy. The actual source10 car165.6ms/two-derived-program hitch remains unaccepted. These functional observations are not a controlled FPS comparison; newjoin after leaving a session does not prove in-session profile-edit resume.

Native per-pass checkpoint432e197d/source11 74dbc7a7 has a separate fresh frozen install39pins/singleton,201installed tests, TypeScript/build18.29s and isolated integration PASS; [CI39997771403](https://github.com/Varnahg/StrahovCrazyShow/actions/runs/39997771403) passed2126/2126/build/integration. Root then found a real broader nonstandalone source/draw-pass compatibility regression before GPU acceptance. [Primary research and decision](evidence/webgpu-completion-20261021/research/shadow-nonstandalone-compatibility.md) restores that original public contract without caller/standalone/cache-history changes. Source11 and all old seals stay immutable. The subsequent source12 correction and actual evidence are recorded below. Final18controlledbackend/cohort slots and exact-head main acceptance remain open. Current detailed status is [verification](../verification.md).

The compatibility correction `f3e50f94` is now independently reviewed and installed in immutable source12 `053501f0`;39pins/singleton,213 targeted tests, production build and isolated integration pass. [Exact-head CI40007000473](https://github.com/Varnahg/StrahovCrazyShow/actions/runs/40007000473) passes2138/2138/build/integration and secret hygiene. [Actual source12 evidence](evidence/webgpu-completion-20261021/validation/car-source12/verification.json) records healthy no-query CM startup76stages/67.7363s and first vehicle entry with0new shader/pipeline jobs. The entry still costs131.2ms/render114.6 versus matched-viewport WebGL149.1/render113.7; this single pair does not establish a gain or shared internal cause. The initial wrong-viewport GL is explicitly excluded.

Actual device loss shows the expected restart overlay with0unhandled; normal overlay exit→editor→new Game completes76stages/54.9843s healthy. Original fault records and recording gaps remain retained. The manually armed8-frame profiler missed the authoritative transition and is not accepted as entry attribution; a separate bounded transition observer will measure the light prelude and Scene.render before any further product fix. Distant-facade image differences, final18controlledslots, remaining functional matrix and exact-head main acceptance stay open.

[Actual source12 v14](evidence/webgpu-completion-20261021/validation/entry-source12-v14/verification.json) adds first-entry eight-routine attribution with0new compiler work, main PBR readiness53.9ms/364calls and Standard16.9ms/137calls; subsequent seven frames are much cheaper. Instrument/JIT/GC wall time does not identify serializer cost. Normal WASD passed north B6 entrance, both north flights, floor1 editor/resume with exact position/player/renderer/generation continuity, corridor and both south internal flights. First nightF after Mia→Robin+glasses edit created5preparations/10modules/9sync pipelines; repeat0, healthready/error0/pending0. Program families/defines/owners remain unknown; fresh Mia without edit is required before choosing a fix. Closed original4819records and34exact receipts are retained. A171.728s inactive-tab return passed healthy but remained visible/focused, so true hidden→visible is not accepted. Final18series/default/main remain open.

## Historical candidate — 21 October 2026

Latest startup acceptance: PCF correction1b2a6829, immutable source36c134e1/build63ca, changes final shader jobs812→0 while retaining the actual leaf owner and original complete gate. Both CM and NCM now resolve startup with healthy0pending/errors. [GPU before/after](evidence/webgpu-completion-20261021/validation/pcf-fixed-5/verification.json), CPU37/37 and [exact-head CI07c15f34](evidence/webgpu-completion-20261021/validation/ci-07c15f34.json):1961/1961, production build, full isolated integration and secret hygiene PASS. Actual GPU colorWrite bit was not exported; source+CPU reproduction+actual before/after support the narrow mechanism, not a universal FPS gain.

[Post-fix fullGame/HUD pilots](evidence/webgpu-completion-20261021/validation/post-pcf-pilots-2/verification.json): CM1avatar48.6FPS/p9526.4/p9933.3ms; NCM1avatar53.5/24/29.1; NCM3actualnearavatars48.8/28.2/37.6. Medium2040×986, same weather/source/helper; live transit/NPC/clock differ, so these are not matched causal A/B and do not accept60FPS. Auto driving/recovery,12external B6 stairs/door threshold/reentry and actual CM/NCM HUD-free feedback preview passed. Interior stair cores remain untested.

**Current NCM blocker:** [original GPU validation faults at B6](evidence/webgpu-completion-20261021/validation/ncm-b6-buffer-failure-1/verification.json) report generic vertex/storage buffer37326,size2048 used after destroy on submit89284–89286. Last state15:32:51 was valid0pending. No buffer owner/release graph exists yet; regular-instance signature is a hypothesis. F8 is2D existing-canvas copying, not RTT. Do not enable NCM by default or mask the fault with fences/delayed destruction before attribution. Main remains9341bcef/WebGL2, PR23draft.

[New bounded CPU discriminator](evidence/webgpu-completion-20261021/validation/routine-cost-1/verification.json)2c9b7bf4 has100/100CPU and clean review. Two actual8frame CM captures complete with0errors/remaininghooks and stable call-path counts; wrapper/clock overhead and early timing variation prevent a saving/FPS claim. Native cached matrix/emptyLOD paths, order/actions/instances/bounds/RTT dependencies rule out a generic freeze or spatial rewrite based only on counts. Buffer lifecycle attribution is a separate task.

Production `main` at `9341bcef` still defaults to WebGL2. [Draft PR23](https://github.com/Varnahg/StrahovCrazyShow/pull/23) contains the shared native WebGPU CM default candidate and bounded startup work independent of presentation RAF, preserving all variants and 30/90 s limits. The [vanilla source 97863f52 checkpoint](evidence/webgpu-completion-20261021/validation/candidate-2/verification.json) reached actual editor/game readiness without a query: 41 light variants, 247/247 shader preparation, 462/462 async pipelines, 494/494 validation, no failure/pending and no GLSL→SPIRV. Production build, 18 served bundle hashes and full isolated 12-peer integration passed.

[New exact-head CI](evidence/webgpu-completion-20261021/validation/ci-bc4d99c2.json) passed1944/1944 tests, production build, isolated integration and source-secret-hygiene onbc4d99c2, including UI ownership cleanup02fdf68b. It excludes later NCMb1c6390b and attribution helper93dac5eb. Prior CI8d97a47f passed1934/1934; the preceding Windows run failed9 fixtures and remains preserved with their source/snapshot repairs. UI cleanup also has64 targeted tests, source3 full TypeScript and independent clean review. Actual factory rejection and NCM timeout prove automatic failed-Room removal while preserving the original error; a passive SDK observer saw factory join→leave in180ms and disconnected cleanly.

[Focused raw pilots](evidence/webgpu-completion-20261021/validation/focused-pilots-1/verification.json) expose a remaining performance gap. GTX 1060 / driver 582.28, Medium 2040×986, one Mia, night/F-on: CM 41.3 FPS / p95 35.9 / p99 64.8 ms; WebGL2 54.4 / 23.8 / 28.6 ms. Live weather/traffic and thermal coverage differ, so these are diagnostic samples, not causal A/B acceptance. CM created no new shader/pipeline during its interval; inclusive render wall 20.426 ms dominates and GPU time is unavailable. The original 1Hz negative sample is retained; moving the owned test tab into a normal active/selected/focused window restored normal cadence without runtime changes.

The [new diagnostic startup receipts](evidence/webgpu-completion-20261021/validation/startup-diagnostics-2/verification.json), source80395553, preserve another NCM low timeout:315sync/0async, overlapping original scope/fence completion about20.7s of30s. These are completion wall latencies, not summed GPU execution times. CM completes all41 light stages but creates new shader modules during its final gate and times out. A stable single-session repeat fails too, so departure of the earlier passive peer is not required. NVIDIA polling during only that repeat's final gate has16 samples:607MHz/P8,65–66°C,32–45%utilisation,no active power/thermal limit. No clock/driver change or causal attribution is inferred. Attribute original validation jobs and requested/drawn program variants before fixing this separate CM issue; evaluate NCM async preparation independently. Do not increase timeouts, drop readiness or infer a deadlock from pending counts.

All 6 current native editor presets/accessories/resize and actual A/D projections at 3 camera orientations have new evidence. A407.96s functional cohort kept3 actual varied sessions in one world with0resync/errors; its moving trajectories are not a matched performance workload. Complete B6/car/LOD/weather/visibility/recovery, repeated matched backend/thermal series and exact-head release gates remain open. A helper sample gate, successful startup or CPU CI does not authorize publishing the default. See the [current verification record](../verification.md) for links and limits.

Later [NCM async candidateb1c6390b](evidence/webgpu-completion-20261021/validation/native-async-1/verification.json), source3e0b9c5f, passes39 targeted CPU tests/full TypeScript and independent review. Actual NCM completes all41 light stages in54.95s with1029async pipelines and no shader/GPU validation error, but still fails the original final gate. Its current API source3 shares all92server/shared files exactly with client source4; source labels are distinguished. This partial warm startup result is neither whole-game acceptance nor repeated causal speedup.

The [same-source CM trace](evidence/webgpu-completion-20261021/validation/cm-attribution-1/verification.json) captures original pending modules2049/2050→live Effect44/context44, with no captured mesh link. Historical map overflow and missing separate ShadowDepthWrapper/baseEffect ownership links remain explicit; no orphan/material cause is inferred. Optional inventory exhausted its original32MiB budget before final gate. Extend only passive native ownership projection; do not raise capacity or call extra GPU/readiness APIs.

## Evidence and decision

The production A/B report in [webgpu-comparison-20261016](evidence/webgpu-comparison-20261016/README.md) measured source snapshot `a1eb953f7dc9805ee01798e1f11da854215896aadc484d1d3b3d3a89aaad065d`. One-avatar idle FPS was approximately 60 on both backends. First flashlight activation blocked for about 4.9–5.2 seconds on WebGPU. Its lighting preparation timed out, and every three-avatar WebGPU run was invalid because of shader errors. These are observed failures of that prototype, not proof that native WebGPU cannot run this game smoothly.

Pinned Babylon core/loaders are 9.30.0. Their installed sources and existing project patch are authoritative for implementation. Official [non compatibility mode guidance](https://doc.babylonjs.com/setup/support/webGPU/webGPUOptimization/webGPUNonCompatibilityMode/) explains why bundle reuse must be measured: rebuilding bundles can cost more than it saves. [Other WebGPU guidance](https://doc.babylonjs.com/setup/support/webGPU/webGPUOptimization/webGPUMiscellaneous/) identifies DrawWrapper ownership and postprocess binding as specific review points. No unmeasured fast-mode switch is an accepted optimization.

Considered alternatives:

| Alternative | Benefit | Cost/risk | Decision |
| --- | --- | --- | --- |
| Keep GLSL translation on WebGPU | Smallest immediate port; preserves current recipes | Runtime compiler dependency and synchronous translation remain; shadow include language can mismatch | Retain only as an intermediate reference, not final architecture |
| Native WGSL in the existing Babylon renderer | Reuses scene, physics, multiplayer and assets; removes conversion path | Every custom shader, shadow and editor path needs real compilation/parity checks | Selected |
| Rewrite renderer/engine or game in Rust | Potential worker/WASM CPU kernels where profiling warrants them | Large unrelated migration; does not fix shader/pipeline work by itself | Out of scope without CPU profile evidence |
| Python rendering/runtime | Useful offline tooling | Does not replace the browser GPU API or improve this production render path | Out of scope |
| Immediately enable NCM/snapshot rendering | Potential submission reuse | Dynamic scene, uniforms, textures, avatars and pass cache invalidation need measurement | Evaluate NCM after native correctness; do not freeze dynamic rendering |

## Work packages and order

| Issue | Deliverable | Acceptance dependency |
| --- | --- | --- |
| KEY-23 | One asynchronous renderer factory and explicit engine ownership | Foundation |
| KEY-24 | Shadow include closure and native wrapper correctness | GPU shadow repro |
| KEY-25 | Tree, photographic grass and grass wind WGSL | Foundation + shadow parity |
| KEY-26 | Campus surface art and photographic facade WGSL | Foundation + calibrated appearance |
| KEY-27 | Hair and car paint WGSL, instances and all LOD | Foundation + shadow parity |
| KEY-28 | Sky, Sun and Moon WGSL | Foundation + derivative-safe texture sampling |
| KEY-29 | Asynchronous avatar preview/editor, cancellation and frame lifecycle | Shared factory |
| KEY-30 | Error channels, device generations and truthful timing | Shared factory |
| KEY-31 | Profile and prepare actual pipeline variants without blocking gameplay | All native materials + health |
| KEY-32 | Profile submission/cache ownership and optimize measured churn | Native scene + editor + health |
| KEY-33 | Complete functional and visual matrix | Native modules + lifecycle + preparation |
| KEY-34 | Repeated production acceptance, default flip and integration | Functional, performance and startup acceptance |

Research and disjoint modules may proceed in parallel. Integration follows the dependencies above. Every package records its mechanisms, alternatives, chosen change, targeted refactoring, tests and remaining GPU checks. It receives its own commit and handoff. Linear is updated at research, decision, implementation, verification and integration; no issue is Done merely because its CPU subset passed.

## Renderer and language contract

- Game and avatar preview receive an initialized engine from the same asynchronous factory. A Game constructor must never quietly create another WebGL engine. The caller owns an engine until successful transfer; the scene owner disposes it afterward.
- Initialization has an AbortSignal. Cancellation returns promptly while any in-flight adapter/device operation performs late cleanup. A changed or detached canvas must not receive an engine created for an older canvas.
- Preview readiness means a successful prepared frame. Each manual preview frame brackets scene rendering with beginFrame/endFrame and submits work. Idle preview scheduling does not create a second continuous GPU load.
- Final production default is actual WebGPU, independent of a query string. Unsupported adapter/device has an explicit usable error state. No silent WebGL fallback. A clearly identified reference backend may remain available for controlled local A/B.
- Native materials select WGSL at construction. Do not flip page-wide language flags on a live engine: Babylon's effect keys do not safely isolate every such transition. Final runtime must neither request nor invoke glslang/Tint.
- Preserve GLSL recipes during parity work. Preserve geometry, UVs, texture filtering/mips, calibrated colors, wind coefficients, alpha/discard, depth conventions and instance attributes. No missing effect is hidden by reducing quality or disabling shadows.
- Native support includes built-in PBR/Standard shaders, seven custom plugin classes, custom sky and car ShaderMaterials, all shadow paths and postprocessing. `ShadowDepthWrapper` requires explicit investigation; include availability alone does not prove correct WGSL declarations.
- Failure channels include effect compilation, shader-module information, validation errors, rejected asynchronous pipeline promises, device loss, failed assets and unexpected shader HTTP responses. Each invalidates the affected measurement generation. A fulfilled readiness Promise alone is insufficient proof of completed pipelines.

## Pipeline and cache work

Record separate CPU conversion, shader-module, synchronous pipeline and asynchronous pipeline timings. Derive variants from the actual scene draw state, including instance layouts, shadow passes, attachment formats, texture state and postprocessing. Babylon's geometry-only convenience prewarm must not be assumed to match those keys. Startup readiness must include all required light states without timeout and preserve scene state after preparation.

Inspect pipeline/bind-group/render-bundle reuse and rebuilds during idle, movement, LOD, flashlight, weather, quality, avatar changes and editor lifecycle. Keep cache ownership per engine/device generation; release obsolete entries and observers. Only add an optimization when the profile locates the cost. Validate both cold interaction and warm steady state; preloading cannot merely move an unbounded freeze into startup.

## Production acceptance

Use a built full production scene, real multiplayer sessions, HUD and varied avatars. Record commit and manifest hashes including tests/assets, Babylon version/patch hash, browser, actual adapter, driver, thermal/clock state, CSS/internal resolution, requested and effective quality, frame intervals, FPS, p95/p99, stalls and startup stages. Keep failures and raw data. A NullEngine or HUD number is not GPU evidence.

Functional matrix covers all six avatar presets and clothing/hair/glasses/beards, peer arrival/departure and LOD, guest isolation and a single shared multiplayer world, B6 entrances/stairs/floor transitions, car entry/driving/exit, camera rotations with A-left/D-right projection, day/night/weather, first and warm flashlight, lamp boundaries, every quality level, resize/hidden-tab/resume, editor open/edit/close and rejoin/recovery. Historical photogrammetry stays historical; this migration does not reinsert it into the live world.

Initial target on the measured GTX 1060 at medium 2040×986 with full HUD and one/at least three real sessions: near 60 FPS, p95 ≤20 ms, p99 ≤33.3 ms, no migration interaction hitch ≥100 ms and no seconds-long freeze. This is a target, not a current claim. If the measured scene budget cannot meet it, document the dominant cost and decision; do not silently lower quality or weaken acceptance. On 2026-10-18 the user explicitly accepted a longer startup in exchange for fast, responsive gameplay after entry. Record the complete loading time, but do not reject useful preparation solely because startup is longer. Preparation must still complete its full readiness contract within the existing timeout; do not hide loading cost or weaken health checks.

Use at least three interleaved repetitions with controlled cache state and thermal/clock evidence. Close other 3D views and account for editor sessions. Separate idle/first interaction/warm movement; verify the same position, camera and route. Do not compare GPU-error runs as if they rendered the same content. GPU timestamp scope is explicit; a main-pass sample is not whole-frame GPU time, and unavailable data stays null.

Full `pnpm test`, `pnpm build`, isolated `pnpm test:integration` and actual Edge GPU checks apply to the stable candidate. Broaden/repeat after relevant repairs. Default flip and integration require the accepted candidate, not just the factory change.

## Isolation and integration

- Active development: attached `webgpu-comparison/StrahovCrazyShow` worktree, branch `codex/webgpu-migration`; original comparison branch stays intact.
- Root owns new staging `.cache/webgpu-migration/`, ports 4192/2587, integration 2568, `heavy-validation`, `gpu` and `workspace-build`. Agents reserve exact disjoint task paths and CPU outputs. Heartbeats renew within 15 minutes.
- Played frozen4188/source snapshot `4dcb3f6fc34a560b455c0ee5c4f02a014105142d4bcce392f2628bca0e012ca0` stays byte-identical. Actual client URL/build identity is checked before browser work. No HMR as an isolated test.
- Historical A/B snapshot and evidence stay immutable. Its public/assets junctions are shared read-only inputs; any future asset change needs a separate scope and detached snapshot first.
- Primary checkout contains foreign WIP. Before integrating a unit, inspect its exact commit, tests and destination overlap; integrate only owned changes without adopting unrelated dirty paths. Shared Game/UI points require explicit coordination. Freeze candidate and preserve handoff evidence before any delivery.

## Current checkpoint

2026-10-16: issues KEY-22 through KEY-34 created; goal active. Commit `2899f08` closes the shadow include registration path. Actual Babylon wrapper/include processing changes from 1/3 to 3/3 passing tests, with the five-HTML-response negative control retained. GPU reproduction and native wrapper declarations remain open. Vegetation and surface WGSL implementations are in progress. Production default is not yet flipped.


## Checkpoint 2026-10-18: startup pipelines

Verified startup-only async pipeline preparation is integrated: native8d20cecc72066b498e735b8b2524fd23baa19eff → main232cffb1fd67b47766fedd2b27c933ddf786e617. Native1296/1296 and combined production1352/1352 tests, both builds and isolated integration passed. The protected played4193/C5 stays unchanged. [Evidence and limits](evidence/webgpu-migration-20261016/hitches-v5/README.md) retain three diagnostic startup pairs, a production pair, the slower41s production smoke, cancellation/reentry, and all source identities.

This is partial progress. First F in B6 still causes a6.2s interval after about1.17s CPU and59new synchronous pipelines. Default renderer and final FPS/visual/multiplayer acceptance are unchanged. Next research targets the actual B6 presentation/regular-instance coverage missing from spawn-only preparation; no extra cache is approved by the current duplicate inventory.


## Checkpoint 2026-10-24: source15 a otevřený startup

[Source15 actual evidence](evidence/webgpu-completion-20261021/validation/avatar-source15-v17/README.md) accepts the narrow avatar-shadow fix: Mia firstF0, Robin+glasses firstF0 and repeat0 in three valid windows, six editor presets and isolated Guest. Fresh39,228targeted/fullTS/build/integration and exact7b1CI2179PASS are recorded. Actual startup also failed Low30.0448s; own-device-loss/restart reached a new renderer but failed the90.1113s total budget. The valid first-entry diagnostic has a210.9ms hitch with zero new compiler calls, not FPS/GPU-time evidence. All negative attempts remain.

Main still defaults to WebGL2; migration PR23 remains draft. The final controlled performance matrix, reliable startup/recovery and main/default acceptance are open. [Next diagnostic decision](evidence/webgpu-completion-20261021/research/source15-blocking-costs-decision.md) keeps existing budgets, coverage, cache and production behavior. GPU/heavy was actually returned at06:44UTC; future runs require another coordinated resource claim.
