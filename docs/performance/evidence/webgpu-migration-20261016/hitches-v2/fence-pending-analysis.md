# QA fence: pending shader validation false negative

Owner `webgpu-hitch-fence-pending-20261017`, existing pipeline task; new candidate only. The previous frozen `gpu-fence-20261017` folder and its manifest `a9cc3a06bf2e1e6d6d1da143b873b00fe2a27e7534445ddc993d563e55cf2a42` are read-only inputs. That candidate came from timing-off snapshot `02cbf7ad962404a793721fe80766c5b4c84d4f276388192e1d01575711feb0af`. Only this new folder and the task handoff are written. The prior handoff was explicitly returned to its original author, matching SHA a5a63642ae48202bd26e4b881c8f374f97694d2af50cab25966b3d3534152968, before claim with adopt-dirty.

## Proven mechanism and evidence boundary

Root reports GPU QA session d06c…: first F about906.5ms CPU then3457ms RAF gap, zero fence events. This agent has not performed a GPU measurement or established why the RAF gap lasts that long.

Actual RenderHealth.track increments pendingByKind synchronously. Its snapshot.valid requires phase ready, zero errors **and zero aggregate pending operations**. A new shader's WebGpuCompilationProfile.createShaderModule wrapper calls inspectShader → getCompilationInfo → observe → RenderHealth.track(..., "shader-validation"). Even already-fulfilled compilation info remains pending until Promise microtasks run. The engine's actual RenderHealth frame/endFrame hooks correctly continue in ready phase, while the former QA diagnostic arm and current predicates reject aggregate valid=false. This deterministically excludes exactly the frame the fence should observe. That omission is proven by CPU reproductions; the entire GPU gap is still unexplained.

## Narrow choice

Both QA predicates now share a local canObserve(state) = phase === "ready" && errorCount ===0. They continue to reject preparing, invalid, restart-required, disposed, generation/device/renderer changes and Game disposal/failure. Pending asynchronous work is precisely what this diagnostic measures; it is not a render fault. Production RenderHealth, markReady, readiness checks, shader tracking, original frame guards and Promise behavior remain byte-identical. No shader/cache/timeout/engine-method change.

Changing aggregate valid or marking health ready again would weaken production readiness and is rejected. Delaying the probe until diagnostics settle would miss the interval under investigation. Removing health checks entirely would admit failed/preparing frames. The explicit diagnostic-only ready+no-fault predicate is the smallest change consistent with the existing engine frame semantics. It adds no queue/cache and no new hot-path state.

## Tests and refactor

New real RenderHealth+NullEngine regression proves ready/error0/pendingShaderValidation1/validfalse before arming; it executes actual endFrame and completes a fence while validation remains pending, then shows original valid only becomes true after validation settles. A second test inserts validation after arm and after request to cover both current checks. A real validation rejection preserves its original error even when onFault throws; Promise rejection is consumed and failed health vetoes endFrame or suppresses a late fence result.

Another test runs the actual CompilationProfile.createShaderModule/getCompilationInfo chain during the extracted complete Game.frame, through the real pinned engine _processFrame begin/render/end path. Fulfilled, deferred and rejected compilation-info variants demonstrate the actual synchronous tracking boundary. The rejection variant has a throwing fault callback and is consumed by the actual profiler's tracked catch. No RAF, WebGPU context, shader compilation or GPU draw is started. A final matrix independently checks phase and errorCount at arm, observer and settlement, even against deliberately inconsistent fake aggregate validity.

RED on the frozen former Game: two new real-health tests FAIL, fault control PASS (`pending-red.log`, exit1). After the narrow predicate change, the complete targeted file has22/22 PASS (17 previous +5 new). Scoped TypeScript roots remain only candidate Game and its diagnostics test. `validation.json` records final commands/UTC/exit codes; final logs preserve exact results. Runtime RenderHealth and CompilationProfile are unchanged source dependencies. One local predicate replaces the duplicated aggregate decision; original single-pending cancellation/emission/settlement logic is unchanged.

## Remaining limits

This remains a QA experiment measuring content-timeline completion latency, not GPU execution time. Pending validation tolerance makes the intended fence observable; it does not prove the hitch is GPU compilation or solve it. Raw RAF epoch remains arm metadata, not an invalidation guard. Cancellation, snapshots, terminal state or disposal can leave queued without settled; this is not evidence of an infinite GPU wait. An unreached endFrame produces no fence event. The root owns review, a new QA snapshot/build and the actual F retest. No full suite/build/GPU/server/install/pnpm or production source edit was performed here.
