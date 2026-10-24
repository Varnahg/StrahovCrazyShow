# Transient Effect ownership discriminator,21 October2026

## Actual evidence before another implementation

Same source80395553/buildc09485f4/helper16c21daa, without optional source inventory or scope/fence latency observer, failed the original submitted-frame gate again. Receiptdf18c609-b447-49c7-9fc7-9cdb88369c7c has complete original job trace2052, including882final-gate validation jobs. At terminal every job is settled and none of the551currently mapped Effect rows refers to any of those882module IDs. Native shadow/base projection scanned3312meshes,10shadow entries/138lookups, with unknownSlots0, mismatch0, legacy0; historical projection overflow517 remains explicit. Last3samples and terminal all have3312meshes/222materials. This is absence of current references, not proof of an orphan, exact disposal cause or a particular instancing mesh.

The same original gate also fails NCM after actual async candidateb1c6390b completes41lighting variants. Do not conflate that partial preparation improvement with ready gameplay or FPS acceptance.

## Primary lifecycle audit

Pinned9.30 Effect/ShadowDepthWrapper/WebGPUEngine sources and project FreshWebGpuShadowDepthWrapper are authoritative. Effect.dispose at final refcount can remove its cache entry through engine._releaseEffect without a mesh/material count change. ShadowDepthWrapper._makeEffect can replace a previous depth Effect, or discard the new Effect on its reentrant identity guard. The current terminal projection cannot reconstruct such earlier ownership.

Effect disposal does not cancel an already pending _processShaderCodeAsync/include continuation. A later original _onRenderingStateCompiled(context) can therefore assign stages even after the Effect was marked disposed. Native WGSL _preparePipelineContextAsync has no own await; its async declaration alone is not proof of delayed execution. Delays can occur outside it. These are source-supported mechanisms; which one produced the actual882jobs is not yet measured.

FreshWebGpuShadowDepthWrapper refreshes its base material before calling native super/_makeEffect. Native standalone similarly refreshes the base first. A discriminator limited to the inner _makeEffect scope might miss base Effect creation; its scope must distinguish base and derived ownership, with unknown left explicit.

## Alternatives considered and selected

| Option | Coverage/cost/lifecycle | Decision |
| --- | --- | --- |
| Larger terminal map or source inventory | Cannot reconstruct a removed reference; increases memory/work and repeats an exhausted budget |Reject|
| One microtask full-scene snapshot | Runs after the whole current stack; synchronous create→replace→dispose may already finish |Reject as principal discriminator|
| Cache/retain Effects or GPU descriptors until terminal | Changes resource lifetime and may hide the very failure being investigated |Reject|
| Scoped original shadow/base creation and release taps | Constant bounded scalar writes on original calls, precise owner arguments and returned Effect, no new readiness/GPU calls |Selected|
| Conditional original instance compile bridge | Links original late context when create-return had no modules, including already-disposed Effect; weak cleanup required |Selected only for those unresolved instances|

Observe the smallest appropriate original owner scope, actual engine.createEffect return and engine._releaseEffect before removal. Assign weak technical identities and capped scalar owners. Preserve every original receiver, return and throw, call the original exactly once, never call isReady/getCompilationInfo/render or add an await/Promise. No strong Effect/GPU retention or shader source/defines export. The original existing bounds apply.

When create-return has no observed context/stages, an instance-only _onRenderingStateCompiled(context) wrapper may record its exact original argument before forwarding. Restore after first bind or owner disposal, with WeakRef cleanup and foreign-wrapper protection. Report unsupported/unknown and overflow; never turn no-modules-at-create into no-owner. Exact known instancing flags from actual base/returned Effect.defines or an original outer boolean argument are distinct from cached visibility and SM_* shadow defines.

CPU fixtures must exercise actual pinned creation/replacement/dispose/release, late compiled callback, reused cached Effect with multiple owners, sync/async contexts, original throws/returns/receiver, abort/rejoin/foreign replacement, unknown drift and byte bounds. Review and stable proof precede the next immutable same-source GPU run. No product readiness change is authorized by this diagnostic decision, and the possible instances.length/visible-batch mismatch remains an actual-attribution hypothesis.

## Actual lifetime result and next decision

Receipt7416b596, originalsource80395553/build2cbf4a05/helperc951, covers812/812 final modules in406 derived Effects for one actual leaf PBR owner757, material507/pass9/generator5. Instancing/regular/thin0, cached visible batch null, same-cache release/ref0, no late-compiled disposed bind. Cached base161/163 return repeatedly. History overflow829 and terminal mapping overflow1564 remain explicit; target coverage is complete. This rejects the earlier generic instancing mismatch as the selected cause and does not establish an orphan or stale release.

Pinned PCF onBeforeRender uses colorWrite=false; PrepareDefinesForFrameBoundValues toggles PBR DEPTHPREPASS from that engine bit. Complete Game shadow readiness outside draw uses true. Actual CPU PBR/Fresh/native depth reproduces base0/2 alternating and fresh disposed depth1/3/4/5/6, without instancing. Actual GPU receipt lacks this color bit, so the mechanism is a candidate until frozen before/after succeeds.

The separately claimed/reviewed PCF task compares material cloning, global define patching, derived caches and a minimal synchronous original-bool scope. Its selected scoped fix, lifecycle/refactor and red→green37/37 proof are in ../pcf-readiness/README.md and verification.json, runtimecommit1b2a6829. Whole source5 hash36c134e1438c6ca1e1c2bb243edd20e37b1fd3dd90e8df35138d446fea231841 includes tests, fullTS and new QA build pass. Same weather/helper/CM actual GPU startup and image remain the root acceptance gate; no timeout/health/cache policy is relaxed.
