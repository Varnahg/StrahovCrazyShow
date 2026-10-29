# KEY-16 B6 pivot fix against current main, 14 October 2026

Base: main0607003, already containing diagnostics, V11, clock calibration B, presentation phase, KEY-17 and transient RTT confirmation. This task accepts one previously identified B6 lifecycle correction; it does not resolve every entrance/stair hitch or prove a GPU improvement.

## Decision and interactions before integration

Independent review found that committed main's B6, VehicleLighting, ArtLighting and world-asset identity are byte-identical to the predecessor of candidatef63039b. Only the B6 runtime and its lifecycle tests are transferred. No whole branch or old wave3 WIP is included.

Every walking update used to force a stationary building pivot while converting the interior fill target to local coordinates. This invalidated sibling transforms, then actual torch candidate and shadow-list traversal repeatedly forced the parent again. The reviewed fix forces only an unsynchronized pivot and uses controller-owned scratch Matrix/Vector3 values with toRef operations. It keeps actual edits current within the same render ID without retaining an inverse cache.

Always using false fails same-frame edits; freezing the building breaks its editing contract; a general ancestor/shadow index rewrite has broader risks. The narrow fix preserves geometry, shared collisions, LOD/membership, material/light settings, node ownership and networking. The new scratch objects need no disposal callback or event subscription. No new dependency, filesystem/network input, permission or serialization is introduced.

Primary engine authority is installed Babylon9.30.0, specifically node.js, transformNode.pure.js and math.vector.pure.js; [upstream TransformNode](https://github.com/BabylonJS/Babylon.js/blob/9.30.0/packages/dev/core/src/Meshes/transformNode.pure.ts) and [Node](https://github.com/BabylonJS/Babylon.js/blob/9.30.0/packages/dev/core/src/node.ts) identify that version. [Original research](../../research-20261014/b6-render.md) compares thirteen alternatives and the three distinct user incidents; [current-main decision and regression results](../../research-20261014/b6-current-main.md) records this transfer.

## Graphical acceptance remains open

On14 October the current CUA inventory returned no apps/browsers; opening the direct4186 address through IAB returned `Browser is not available: iab`. No scene, browser/GPU run or alternative automation was started. This is a current tool-availability result, not a GPU pass or a failed performance result.

The earlier plan postponed all main integration until graphical acceptance. The new scoped integration decision, following the user's request to continue another issue as with the previous fixes, accepts the independently reproduced lifecycle correction separately while retaining KEY-16's full production acceptance. It does not rewrite historical evidence as a graphical success.

Still open: compare cold/warm entry and both stair cores, first/third person, day/night and torch, stable scene content/occlusion and p95/p99/max in the complete production game. The original stationary-player early-return behavior and dynamic root-move shadow cascade are pre-existing and outside this fix. Shader hitches, red flashes, overall6–8FPS incidents and night grading remain separately unproven.

## Validation discipline

Reuse the owned idle key17 worktree with492 source/test/config blobs matching main0607003, existing patched dependencies and already verified LFS assets. Do not install into main, modify old previews or rebuild historic snapshots. New evidence references the previous complete manifest plus this exact two-file delta, including the expanded tests. Full results are appended only after execution.

## Completed current-main results

The original four tests again produced1 FAIL/3 PASS against current main:405 root and402 child matrix recomputations during three static-building walking updates. The exact candidate runtime changes this to0/0 with4/4 PASS. Expanded parent-chain and freeze/unfreeze regressions:6/6 PASS. Final targeted selection:49/49 PASS, narrow types0. Original tests and runtime candidate are retained without weakened assertions; the runtime SHA256 is942cc969ebf9b4249086353c08090630720758fc3c63cbca648e72fb7b0bb422.

Independent final review found no blocking security/interaction issue in the exact runtime and expanded test delta. No API/network/permission/dependency or asset change is introduced. The root-owned scratch values remove per-update allocations without a persistent inverse cache.

Snapshot`b6c02a10837c2e4ba708f1eb9c8bbbfa3f8e3c20a8c4500920eb10a17b3c4e33`: **875/875 full tests, production build and complete isolated multiplayer integration PASS**; all8395 inputs including158 test files and12 LFS objects stayed unchanged. No full-pipeline retry. [Exact two-file delta](checkpoint.json), [pipeline](pipeline.jsonl), [post-check](post-check.json) and feature red/green logs are retained. Source/collision/route regression results are CPU evidence, not a graphics run.

Integration preserves every unrelated main dirty/untracked path and appends only this verification entry; the previous verification WIP stays unstaged. Main installed packages and existing4186/4187 previews remain untouched. KEY-7/17 changes are preserved; IMAGE remains outside main. **KEY-16 stays open for actual production/GPU acceptance.**
