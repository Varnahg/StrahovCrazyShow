# Private QA receiver lease contract

This is a stock **vehicle**32m prototype, not a generic Light policy or production acceptance. It retains the earlier18701037 eligibility/shader/counterfactual-cap proof while removing its per-draw eligibility/ancestor/animation/bounds scan. It does not promise safety for unreported mutations. The root owns the actual Game mutation audit and wiring.

## API and sequencing

`CarReceiverLeaseLight` has the normal SpotLight constructor. Configure the actual car beam after its normal construction with `configureStockVehicleLease({kind:"vehicle",range:32,movementReserveMetres:8})`. Configuration does not change intensity/range/shadow/pose properties. Torch/B6/other lights are outside this policy.

Policy starts **OFF**. Keep `setPolicyEnabled(false)` for every original startup, quality, avatar/LOD, car and shadow preparation and manual startup submission. Preserve the complete original preparation and timeout/readiness rules. After final world/material construction, `prepareStaticReceivers()` may cache eligibility/world bounds during bypass; it changes no light membership/variants. It throws if called with policy enabled. Enabling after actual readiness and complete prewarm is a caller responsibility; the negative test proves the helper itself does not prevent first-use compilation.

After ready and no active loader/invalid budget, `setPolicyEnabled(true)` enables optimization. The overridden `setEnabled(true)` calls its private preparation **before** native Light.setEnabled/resync; pending receiver changes are retained. It owns no effective-enabled listener that could erase that pre-ON filter. OFF retains native disabled behavior and invalidates the position lease, with no receiver scan. A later ON refreshes its cap/membership decision from cached records.

At every actual final pre-draw point, after all relevant mutation and `gltfLightBudget.prepareFrame()`, perform:

```
root mutation/loader/budget epoch check -> optional bypass/invalidate
changed = carLease.prepareReceivers()
stableLights.markMeshesDirty(changed)
stableLights.update()
scene.render()
```

`prepareReceivers()` returns a reused readonly list valid until its next call. Consume it synchronously; do not retain it. The copied `qa-stable-light-state.ts` adds only the exact prior12-line markMeshesDirty method to current native source; it is QA wiring, not an integrated production API.

## Required invalidation owners

Call `invalidate(reason)` after the mutation and before the final gate/render. Missing calls are unsupported, not automatically safe. Invalidation only marks a lease stale: it does not clear a valid pre-ON filter into a global resync. The gate refreshes before draw.

| Reason | Required caller/mutations | Next work |
| --- | --- | --- |
| `topology` | Scene mesh add/remove/same-count replacement, attaching loaded/LOD instances, ownership transfer | Full eligibility/bounds rebuild |
| `material` | SurfacePack material assignment/restoration, mesh.material/MultiMaterial replacement, freeze/unfreeze, plugin/custom resolver/disableLighting/debug changes | Rebuild |
| `bounds-transform` | Any cached static mesh/ancestor transform, frozen world matrix change/unfreeze, refreshBoundingInfo | Rebuild |
| `geometry` | Position-buffer changes, geometry replacement, instance/thin-instance/source changes, locked bounds | Rebuild |
| `animation-deformation` | Animation starts/groups/runtime vector targets, skeleton/morph/baked animation/wind/deformer changes | Rebuild/fallback |
| `caps` | Actual material/device light cap changes, GltfLightBudget writes/owner changes/inflation repair | Refresh cached records |
| `light-membership` | Other light enabled/add/remove, celestial/lamp/B6 transitions, native filtered membership changes | Refresh |
| `light-configuration` | Own range/falloff/parent/lightmap/projector/IES or relevant scene lighting policy change | Refresh; unsupported configuration bypasses |
| `masks-lists` | Own masks and inclusion/exclusion changes, relevant mesh layers | Refresh |

Only **onMeshRemoved** is owned internally, for bounded reference cleanup plus topology invalidation. No material/other-light/budget observers are installed. Root must avoid duplicate ownership. Direct parent-chain/script/animation changes after the final gate cannot be repaired afterward; cached candidates must remain static through actual draw or be in fallback. Getter/custom/plugin configurations outside the supported proof remain native.

Loader activity requires bypass, not merely a count comparison. Root's audit additionally tracks loaderStarts/activeLoaders and invalidBudgetVisits as well as writes/ownerChanges/writeErrors; the helper imports no budget implementation. Restore policy only after loaders stop, final budget repair/invalidation and static rebuild. General cap epochs based only on writes are insufficient for frozen/loader-inflation paths.

## Spatial and cap proof

At refresh the entire cached world AABB is excluded only if its distance from the light anchor is greater than32m+reserve+0.05m. For every later position within the reserve sphere, triangle inequality keeps the whole AABB beyond32.05m. Rotation need not invalidate this conservative sphere proof. On crossing the reserve the gate refreshes **before** draw. It scans cached records, not the scene/ancestor/material eligibility graph. Inside the lease it checks only constant light/config/position state and drains a normally empty change list.

Only known, nondeformed static Standard/PBR meshes and the same known plugins as the prior proof qualify. Frozen/unknown/custom/deformed/regular/source/thin instances/skeleton/morph/baked animation/billboard/infinite/untrusted bounds remain native. Native masks/lists are never rewritten. A large AABB intersecting the expanded sphere stays included.

The original counterfactual list includes this beam even while OFF or already excluded. If its count exceeds the actual material/device cap, no exclusion is allowed: dropping an out-of-range light must not promote another previously truncated light. Re-admission appends natively and must pass through the existing explicit ordering gate.

The helper does not change enabled state beyond the caller's own setter, intensity, shadowEnabled, ShadowGenerator caster selection/list, budgets, shader source or Effect cache. Unsupported mode fails open by removing only owned range exclusions. `setPolicyEnabled(false)` likewise restores native membership. Disposal removes the owned observer and all records/sets/buffers; removed meshes are not retained.

## Evidence limits

Current tests use actual Babylon9.30 WGSL processing and readiness with NullEngine GPU IO. Positive readmission tests preserve prewarmed Effect identities/defines and add no programs. Negative readiness deliberately demonstrates new programs when ON preparation is omitted. Shadow tests preserve caster list/intensity/mode; they do not prove shadow pixels or GPU UBO/driver behavior.

`replay-1.json` is the initial single160mesh CPU replay with eligibility charged at activation. `replay-2.json` is the final explicit eligibility-preparation API, with that cost reported separately. Both are preserved; neither is a statistical performance or GPU/FPS acceptance. Movement creates refresh work and additional serializers that stock movement did not have. Production coverage/benefit must be measured independently over the actual material mix, first/repeated car entry, driving, lamp/B6/quality/loader transitions and lifecycle.
