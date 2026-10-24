# Car preparation — research and decision before implementation

Owner `webgpu-completion-01a15a3e-car-preparation-renderer-audit-v1`; task `webgpu-completion-car-preparation-20261023`, baseline4aa7fb03. Explicit delegated leaf: no recursive BMAD, build, server, GPU, install or commit. Only the three runtime/six allocated test files and own evidence/cache/handoff are writable.

## Evidence, mechanism and limits

Actual immutable source8 `921f57b9`, CM build `1d12adb4`, helpera5b3, Medium2040x986, one Mia. Original session68f0e35c: E interaction seq1471 at722727.3ms precedes375ms frame interval722795.3–723170.3 (seq1474), CPU364.8/render317.2/environment34.3; browser longtask366 and LoAF374.1/script365.4/blocking321.5 corroborate. A subsequent2043ms interval has priorCPU63.2 and LoAF2021.6/script42.9/blocking0; its cause is not established. Compilation deltas from the last foot receipt to first car receipt:11 preparations,22 modules/validations,11 sync pipelines (+0.6ms total sync API CPU), unchanged1035 async pipelines, zero failures. Two validations were transiently pending and completed. These cumulative data do not attribute all11 programs or317ms to one operation. No migration-specific A/B conclusion follows.

The origin0 hypothesis is disproved: default loadCar→loadReviewedCar positions both actual driving and parked rigs at CAR_SPAWN(110,16), yaw0. The accepted foot anchor is(110,12). Current prepareLighting traverses Low/High/Medium for requestedMedium; only Low adds vehicle0/1. Actual VehicleLighting Low does not allocate a shadow generator, Medium requires256 and High512 with PCF. Medium/High can support two mapped POINT sources when the celestial key is absent, so just copying0/1 is incomplete. AuthoredLightPreparation currently exposes its narrow architecture/outdoor representatives only during Low vehicle stages.

The existing preparation lease changes only concrete visual-root enabled flags and computes the real beam from the actual car world transform. Actor/physics/input/authority ownership stays unchanged. It is not generic vehicle-camera preparation: vehicle apply skips the camera/local-avatar solve; world/street/LOD position remains the accepted foot anchor. A faithful virtual vehicle camera would also require explicit Simulation.cameraDistance vehicle-body exclusion; that is outside the assigned paths and has no demonstrated attribution yet. It is deliberately not changed here.

The copied20261019 candidate is a readonly primary input. Its152 CPU passes and later full checks are historical; its GPU hitches persisted and traffic differed, so it was not accepted. We port only the smallest matching delta into today's startup-view/PCF code, never replace the current Game wholesale.

## Variants and choice

| Variant | Work, cache, lifecycle and visual cost | Decision |
| --- | --- | --- |
| Existing Low0/1 only | Leaves actual Medium/High PCF and possible2POINT unprepared | Current confirmed gap |
| All WebGPU qualities0/1 only | Small expansion but misses a reachable2POINT state | Insufficient |
| Quality-derived stage sets | Avoids Low duplicate, but adds mutable stage/restart policy during quality changes | More orchestration than needed |
| Stable native vehicle0/1/2 in every quality pass | Reuses actual controllers/shaders/maps and current POINT clamp; Low2 repeats1;48 versus41 stages, no new cache/resource type or gameplay loop | Selected if current RED confirms |
| Requested-quality-only or quality-change restart | Less startup work, leaves supported later qualities cold or changes existing preparation traversal | Reject |
| Lazy first-entry loading/gate | Moves waiting to interaction and changes flow rather than proving prepared gameplay | Reject |
| Shadow-generator/Effect cache | Multiple lifetime owners and stale resource/defines risks; current singleton can retain requested final map | Reject |
| Switch NCM backend | Changes the acceptance target, does not repair this preparation contract | Reject |
| Full virtual vehicle view/camera or global force-active world | Broader presentation/shared simulation API or unbounded geometry work, no exact shader/CPU attribution yet | Separate evidence-driven decision |

The historical requestedQuality tail addresses a separate demonstrated contract: a late public quality request during the last temporary pass can restore the requested quality without preparing its correct final map. Reuse the existing finite quality pass with an optional requestedQuality getter, only if a current actual regression confirms it. Keep the same started/paused clocks,30s per attempt and90s total; never reset budgets or relabel prior final attempts. Stable requests still have three passes. No Actor, camera, network, physics, shader algorithm, backend, readiness threshold or timeout changes.

Measured current startup is51.816s (Low22.523, High19.870, Medium9.422). Remaining headroom is not a prediction: extra states must satisfy unchanged deadlines on the actual GPU. The final first-entry hitch/image/error result belongs to root's new frozen-source acceptance.

## Verification plan

Preserve current eight source/test bytes and relevant protected/native digests, read the compressed historical candidate into this task's private reference directory, and record current baseline CPU. Add current real Game/VehicleLighting/Scene/shadow/map/POINT RED cases before runtime edits. Port only proven stage policy and, if reproduced, the optional requested-quality tail; refactor shared native conditions. Run assigned targeted CPU tests, relevant readonly startup/view tests and scoped TypeScript through explicit own-cache source8 native loader only. Normal portable tests must not acquire an env bypass. Preserve all red/development logs, keep both installed and frozen dependencies unchanged, then hand off exact owned manifest and release. GPU/default/main acceptance is not a CPU claim.

## Current reproduction and implementation

The original five assigned tests passed77/77 before changes. The current-source RED adds actual native Medium/High 256/512 shadow, nonvacuous0/1/2POINT and current late-quality tests:127 total,111PASS/16FAIL. Runtime bytes were unchanged for that run and preserved in own red-current-inputs/. The main coverage RED is the missing actual vehicle-stage sequence, not a setup/loader failure. Some dependent assertions also fail because those actual stages do not exist; they are not GPU exceptions.

After only all-quality0/1/2 policy was ported,122/127 passed. The remaining real Game public setQuality/controller case proved actual retained map256 versus requestedHigh512; four independent quality-helper cases also stayed RED. This confirms the tail is necessary in the current code, independently of the historical donor. The minimal optional requestedQuality tail then proved the requested512 map before entry while preserving original total/per-attempt clocks and historical final flags.

One development port utility stopped at an intentionally exact anchor because two different tests contain `passes.length===3`; production edits already applied correctly. Its subsequent126/127 CPU run failed only the original late-request fixture's obsolete3-pass expectation. The exact late-request assertion alone was updated to4, the other stable3-pass assertion was retained, and existing concrete-root lifecycle cases were extended across all three qualities. This log/proof is preserved under development-tail-expectation; it is not the final pass.

The first completed current candidate has143/143 assigned targeted CPU PASS and scoped semantic TypeScript9 roots/2780 readonly source8 declaration files with0 diagnostics/no declaration drift. The final proof below reruns stable bytes after the trailing-blank-line correction and includes readonly original startup/view/light/controller regressions. All actual checks use the current Game AST/real controllers/Scene/shadow code and terminal NullEngine IO. No GPU timing/image/hitch result is inferred.

Root later captured a more precise independent source8 diagnostic first-entry window: `car-attribution-1`, profileEnvironment plus frozen-transit E0, before14:39:50.735/after14:39:53.041UTC. It has exactly1 new shaderPreparation,2 modules/validations and1 sync pipeline (580→581,30→31), errors0. Its first interaction hitch is211.9ms/CPU194.4/render158.9/environment26.9 (action2200, hitch2206). This is a diagnostic run, not a comparable FPS/A-B sample; no complete material owner attribution is available. RenderIncidentProfile is not instantiated, and the frozen helper's shader attribution stops after startup. The earlier11-program cumulative delta is explicitly not the first-entry attribution. This patch repairs independently reproduced preparation coverage, not a demonstrated complete explanation of either317.2ms or158.9ms render work.

The unchanged foot-camera/current-authority projection remains a stated limit. No Actor, queue, input, camera collision/shared simulation API, physical placement, native patch/dependencies, profiler or backend was changed. Normal portable tests have no new environment or source bypass; only the private CPU command uses the explicit readonly source8 native loader. Actual first-entry improvement, supported image parity and all original deadlines remain root acceptance.


## Follow-up coverage finding and decision before profile changes

The independent peer found a real current-date gap in the first264-pass candidate (verification RAW1eb7992d, preserved verbatim as before-fixed-profiles-*). At the real23Oct2026 preview night22:00Z, actual sunState/moonState plus sampleArtLighting return moon altitude0.7006673, illuminated fraction0.9357254 and keySource moon. Ambient + celestial key + car consume3 slots, so Medium/High vehicle2 clamps to1. The old moonless10Oct fixture correctly proved a reachable2POINT shader but did not prove its preparation during today's startup. Root explicitly rejected this conditional coverage as task completion and authorized a bounded internal profile extension in the same files. No actual first-entry material owner or GPU benefit follows from this CPU finding.

| Profile variant | Cost / lifecycle / cache / appearance | Decision |
| --- | --- | --- |
| Keep current preview only | Date-dependent shader layouts; confirmed current23Oct missing keyless2POINT | Insufficient |
| Search days/hours for complementary Moon state | Repeated SunCalc work and stopping rules; dynamic astronomy edge cases without extra shader benefit | Reject |
| Current night plus alternate only when needed | Needs classify/deduplicate/revision policy; test contracts can silently become vacuous again | Reject |
| Two explicit physically valid UTC preparation nights | Fixed6 vehicle stages/pass; uses existing sky/SunCalc/art lighting and current weather, real enabled lights and real shadow; no new cache or light owner | Selected |
| Force celestial light off or inject proxy light | Bypasses actual environment and can prepare an impossible lighting state | Reject |
| New permanent variant cache | More allocation/eviction/disposal ownership; does not establish missing physical layout | Reject |

Selected hidden preparation instants are10Oct2026 22:00Z (Sun/Moon below horizon, keyless) and23Oct2026 22:00Z (Sun below horizon, Moon above, keyed). They are explicit simulated preparation UTC instants, not forecasts or gameplay time. Original current/day/night player previews and final actual requested time remain unchanged. Each profile requests0/1/2 mapped POINTs using the existing clamp: Medium/High keyless supports0/1/2, keyed supports0/1/1; Low2 remains a deliberate repeat of1. Extra practical sources may reduce capacity further, truthfully. No synthetic key/intensity/astronomical API, Actor/camera/network mutation or enlarged deadlines.

Use unique vehicle-0/1/2 (keyless) and vehicle-keyed-0/1/2 labels so both profiles stay identifiable and test/evidence Map keys cannot overwrite. Native catalog becomes19 stages/pass,57 for three stable qualities,76 for one tail; original30s/90s clocks stay shared. This adds3 stages/pass versus the conditional candidate and16 versus original41 overall. With4 lifecycle labels the inventory can request23 distinct labels; existing maxStages21 reserves its final slot for explicit overflow and reports stageOverflow. The cap is unchanged, and inventory does not claim23 individually retained labels or complete per-stage attribution. The exact preparation result retains all19 actual stage labels. Practical startup headroom and first-entry acceptance remain root's GPU work.


## Final stable profile candidate (CPU only)

Final14-root run:272/272 PASS,0FAIL/skip,15:06:46.539–15:07:03.139UTC23Oct2026; TAP5ee75b7c35a76c990cc099b7886cbf04942036e1fdca5b4f2a9e77e7a600bf2d. Source9 files are identical before/after, as are14 readonly used tests,15 protected files and9 native modules in each readonly fresh/installed tree. Scoped semantic TypeScript9roots/2780 source8 declarations gives0diagnostics/0drift;8 owned MJS syntax checks plus cache loader and diff-check all exit0. Final verification RAWbc07eb4fda009106334d95677de37a6748a7b7b3a8b27c77112cc55d6fb4e0eb. Exact reverse transforms restore the original Game/light helper; every other Game member is byte-exact to baseline. The quality helper retains the explicitly reviewed optional final requestedQuality tail. No whole-file historical Game transfer occurred.

Current23Oct RED is49/51, exactly the2 new Medium/High actual-environment failures, before profile runtime changes; source stable and exact9 RED input bytes preserved and rehashed in own red-fixed-profile-inputs/. After the fixed-profile change,118/118 direct four-root CPU passes, followed by272/272 broader targeted passes. Both actual profiles have distinct stage keys, real environment UTC, enabled-source counts2/3, corresponding0/1/2 versus0/1/1 POINTs, SPOT+SHADOW defines,256/512 real map sizes, retained generator/RTT/pass, and exact Effect reuse on replay. Keyed current weather/quality/time revisions, original failure/timeout/cancel cleanup and null real-clock restoration are explicit regressions. The original typed guards/false verdict/async submitted-frame readiness remain unchanged.

The inventory test now constructs the actual WebGpuCompilationProfile rather than inferring capacity from a Set. It truthfully reports21 retained rows: unassigned,19 individually named labels,overflow; stageOverflow4 for23 requested labels. The initial unassigned row already existed, so even the historical20-label candidate could overflow; the prior fit comment was inaccurate. No maxStages/byte/entry limit was increased, and no complete per-stage shader attribution is claimed.

Targeted refactoring: one shared native vehicle flag controls both quality-independent vehicle catalog and the existing authored lease; keyless/keyed stage parsing shares the same actual apply/restore path. Existing Scene/VehicleLighting controller singleton and quality-specific map owner are retained, with concrete-root identity/disposal and nested cleanup unchanged. Additional work is6 vehicle states/pass and3 added stages/pass versus the conditional candidate; stable total57, one late-request tail76, versus original41. Low request2 and keyed Medium/High request2 are explicit clamped repeats. No CPU fixture represents WGSL pixels, GPU speed, first-entry stutter removal, NCM/CM image parity or completion within actual GPU deadlines. Root must run new frozen-source GPU acceptance under original30s/pass,90s total and shared30s visible final gate.

No build, fullsuite, server, browser/GPU call, install/dependency/native patch, helper/frozen tree or root validation write was performed. Final actual car attribution is still1 new first-entry program in the diagnostic run, with unassigned158.9ms render cost; the older317.2ms/11 cumulative-program observation is not magically attributed by these preparation regressions.
