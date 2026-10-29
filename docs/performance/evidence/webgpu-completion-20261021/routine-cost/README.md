# Bounded actual routine CPU diagnostic — decision before implementation

Owner: `webgpu-completion-01a15a3e-routine-cost`; task `webgpu-completion-routine-cost-20261021`; baseline `27055e8b`. Read-only research preceded this change. On 2026-10-21 all 19 current helper files matched root's immutable `validation/helper-runtimes/v4/frozen-identity.json`: helper `c9519c21acb9e6fd576fed1962b170853ee0b1e4d4016af11690313685a1063c`, build `63ca70a1b1f6ca6ec48ef776d82c9cdb845dc6a637058b46f0cf3545c5f4adf5`. Root retains that executable copy and live build; this work changes only the next helper version.

## Evidence and native chain

Actual source5 `36c134e1…`: CM34cfa48.6FPS, NCM9da053.5FPS, NCM3near73aae48.8FPS. Ambient/UTC differ, so these are diagnostic throughput pilots, not causal backend comparisons. NCM3 CPU render17.325ms, active5.887/main8.762/RTT1.762 are inclusive scope means, not attribution to a specific function or proof of a3ms saving. NCM1 has421 reused bundles/0creations at endpoints and unchanged monotonic pipeline-cache counters throughout; native fastBundle bypasses pipeline/bindgroup lookup. No new compiler/cache fix is justified by that evidence.

Pinned Babylon9.30 `Meshes/mesh.pure.js`: render2108; occlusion2122, instances2126, geometry2131; beforeRender2142; material.isReadyForSubMesh2161 (isReady2169); preBind2231; beforeBind2238; bindForSubMesh2247; draw2256+. Thus donor beforeRender→beforeBind includes material readiness, but merges it with other preparation and misses pre-observer/early-return work. `scene.pure.js`: active3906–3983; candidates3919, world3939, LOD3945, frustum3959, _activeMesh3978/4017, submesh dispatch3645; main4215–4221 is after RTT. `Rendering/renderingGroup.js`: _RenderSorted183 includes sort196 and render214. Node.setEnabled565 has a same-value guard, so repeating an unchanged car enabled flag does not itself invalidate candidates.

Primary current documentation checked 2026-10-21:

- https://doc.babylonjs.com/setup/support/webGPU/webGPUOptimization/webGPUNonCompatibilityMode/ — zero bundle recreation does not guarantee a gain; native pin decides the actual path.
- https://doc.babylonjs.com/features/featuresDeepDive/scene/optimizeOctrees/ — static/dynamic lifecycle, possible regression; native component replaces candidate providers.
- https://doc.babylonjs.com/features/featuresDeepDive/scene/optimize_your_scene/ — freeze alters updates; not selected.

## Alternatives and choice

Reuse `f3-routine-profile/overlay/client/qa-routine-profile.ts.gz` timer core (uncompressed SHA `ee3c3280de69ee61dcbf433dcf2a259d07a4efa80a711f822056da331168289f`): max8 selected routines, stack32, descriptor validation before mutation, original Reflect.apply exactly once, finally timing and owned restore. Rebase only its bounded accounting, target/filter and lifecycle gates. Default shader/cache target list is inappropriate for the current NCM fast path.

Selected8: actual scene.getActiveMeshCandidates; Scene._activeMesh; TransformNode.computeWorldMatrix; Mesh.getLOD; PBRBaseMaterial/StandardMaterial.isReadyForSubMesh; PBRBaseMaterial/StandardMaterial.bindForSubMesh. Own native prototype methods are filtered to receiver._scene===actualScene; Scene receiver must equal actualScene. Foreign scenes pass directly to original, without clocks/counters. One actualScene-only render boundary wrapper observes original calls, never calls render itself. At most8 existing render invocations with native frame progress are retained. Public scene active/main and ObjectRenderer init/finish observables classify phases; original errors, false returns and incomplete frames remain evidence. Phase overlap/nesting and selfSelected (subtract selected children only) are explicit, not a whole-frame partition.

An observer-only MeshDraw donor needs3observers per Mesh (~3k scene nodes), more retained handlers and top-mesh aggregation but cannot isolate readiness from other preparation. It is rejected for this first question. A new general profiler duplicates validated rollback/stack behavior; a native sampling UI has no supported export surface here. No profiler changes production source, adds readiness/GPU calls, changes cache/LOD/quality/visibility, or raises the32MiB shader inventory cap.

Costs: wrappers add argument/stack bookkeeping and clock calls; public phase observers and one frame boundary have bounded lifecycle work. This is a short diagnostic, never FPS A/B. No per-mesh observers, shader/defines export, continuous snapshots or persistent per-frame cache are added. Wrappers restore only exact owned descriptors on completion/abort/dispose/rejoin; shared-scene capture is refused. Foreign replacements are retained and evidence is incomplete.

Residual: mesh frustum/isReady(false)/reset overhead remains outside selected active routines; sorting/engine._draw/custom material classes and pre-Mesh observer work remain main residual. If a residual dominates, choose a separate bounded target set after reviewing actual data; do not add all hooks. Candidate-cache incremental membership, material output guards, sort-key reuse or spatial indexing are conditional options, not measured improvements. Existing enabled candidate, wet/quality, UBO and LOD caches already remove many duplicates.

CPU fixtures and syntax checks can prove hook semantics and bounds only. Root separately owns fresh immutable build, actual8-frame capture, plain10s performance, image/movement and integration.
