# Final-gate shader churn: research checkpoint,21 October2026

This is an in-progress diagnosis, not an accepted product fix. Source80395553 / diagnostic build14983724 preserves the original startup budgets and readiness. [Actual receipts](../validation/startup-diagnostics-2/verification.json) distinguish NCM low preparation completion delays from the independent CM submitted-frame failure. CM failed again with a stable single session, so peer departure is not required.

## Measured chain

Renderer audit matched raw vanilla plain14d41a8e to sessiond85b8a46 in source97863f52 and failed CMba860fc6 to session532e0803 in source80395553. Plain preparation took55,635.2ms across41 stages; failed CM53,969.8ms across41. Each had exactly one weather-reference restart, respectively low/night-1-off and high/day-1-on. UI republishes parsed weather each60s, Game.setWeather replaces its reference, and light-preparation revision compares the reference. Numerically identical weather can therefore restart a stage. This mechanism does not establish the cause of final-gate churn.

| Original compilation counters | Plain before→after final gate | Failed CM before→after final gate |
| --- | --- | --- |
| Shader preparation |578→578|583→1017|
| Shader modules |1156→1156|1166→2034|
| Async pipeline |1029→1029|1029→1029|
| Sync pipeline |25→25|25→25|

The434 additional shader preparation pairs/868 modules have no additional pipeline creation. Existing inventory was null in both raw records; identical shader fingerprints and a particular mesh are not established. A terminal pending count of0 also does not prove all conditions held together in an earlier concrete gate callback. The gate checks actual mesh/effect readiness before and after draw plus tracked validation completion.

## Pinned primary mechanism and CPU reproduction

Installed Babylon9.30.0 sources are authoritative: Meshes/mesh.pure.js1042–1131, Lights/Shadows/shadowGenerator.js `_renderSubMeshForShadowMap`, and Scene's actual `_evaluateActiveMeshes`. `Mesh.isReady(true)` chooses hardware instancing from existing regular instances or thin instances. Actual shadow draw instead uses the current visible-instance batch or thin instances.

An inline NullEngine reproduction used actual Scene culling, Mesh.isReady and ShadowGenerator._renderSubMeshForShadowMap. Only terminal material/shadow readiness methods were replaced to capture their arguments and veto GPU drawing. The source box had one regular instance:

| Instance visibility | Current visible batch | Mesh.isReady shadow argument | Actual shadow-draw argument |
| --- | --- | --- | --- |
|false|null|useInstances=true|useInstances=false|
|true|1|useInstances=true|useInstances=true|

The successful probe exited0 and disposed scene/engine. Two preceding setup failures are retained in the audit trail: missing InstancedMesh side-effect import, then use of the incorrect private symbol `_renderSubMesh` instead of pinned `_renderSubMeshForShadowMap`. No GPU, network or file writes occurred in the inline probe. This proves an argument mismatch under explicit conditions, not its presence in the actual CM scene, actual compilation churn or FPS improvement.

## Alternatives and decision before changes

| Option | Cost and lifecycle/cache impact | Decision |
| --- | --- | --- |
| Raise timeout or omit shader validation | Hides failure and weakens readiness; does not repair repeated work |Reject|
| Treat pending0 sample as readiness | Misses before/after mesh readiness in the actual callback |Reject|
| Globally reset draw/effect caches | Additional allocation/compile work and invalidation; no missing frame reset was found in pinned NCM lifecycle |Reject|
| Immediately alter Mesh.isReady or skip shadow checks | Small apparent change but could mask required instanced/shadow variants and affect appearance |Wait for actual attribution|
| Observe original validation jobs and bounded module/effect/mesh metadata | Diagnostic overhead, no extra GPU call/await; precise ownership restoration and capped scalar exports required |Selected next discriminator|
| Extend NCM async preparation | Separate startup experiment with null-pass clear, bundle lifecycle and native insertion tests; not a CM fix or proven speedup |Separate reserved task|

The new diagnostic helper must keep original Promise identity, receivers, throws, health and readiness; no second getCompilationInfo call. Program source, GPU objects and unbounded scene dumps must not be exported. Existing inventory can be enabled through profileEnvironment for stage attribution. A fresh immutable build is required; original diagnostic14983724 and all failed receipts remain intact.

The official [Babylon NCM guidance](https://doc.babylonjs.com/setup/support/webGPU/webGPUOptimization/webGPUNonCompatibilityMode/) was checked21October2026. It explains that bundle creation has cost and performance depends on scene reuse. Our pinned lifecycle audit found end-pass/frame resets already present; persistent fastBundle is intentional. A global reset has no supporting reproduction here.
