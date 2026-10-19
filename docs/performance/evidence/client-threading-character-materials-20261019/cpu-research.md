# Character material initialisation research, 2026-10-19

Claim: `threading-character-materials-20261019-subagent`; base HEAD `737e0c7abfe3677240b97e243521be46a516fcdd`.

## Evidence before runtime edits

Readonly installed primary source: `.cache/client-threading-lab-20261019/snapshot/node_modules/@babylonjs/core`, package 9.30.0 (coordinator's existing patched dependency donor). Root dependencies are absent. The reserved test snapshot uses a node_modules junction to that donor; no dependency writes/install.

- `Materials/material.pure.js` lines 218–244: public `atomicMaterialsUpdate` blocks only that material and restores dirty handling in `finally`; unblocking calls `markDirty`.
- Same file lines 978–1004: `markDirty` visits each existing draw wrapper, checks material identity and invalidates ready state only for this material/context.
- Same file lines 1376–1404: `_markAllSubMeshesAsDirty` first respects per-material blocking, then iterates all scene meshes/submeshes/draw wrappers and calls `getMaterial` before rejecting foreign material identities.
- `Materials/PBR/pbrMaterial.pure.js` lines 905–925: initial environment/texture/metallic/roughness property decorators call texture dirty handling. Clearcoat, sheen, alpha and hair plugin paths add further work.
- Public API reference: https://doc.babylonjs.com/typedoc/classes/BABYLON.Material#atomicmaterialsupdate ; upstream pinned source: https://github.com/BabylonJS/Babylon.js/blob/9.30.0/packages/dev/core/src/Materials/material.pure.ts . Local executed source is authoritative for counts.
- App chain: `CharacterMaterials.get` creates a PBR material without mesh consumers; configures material and lazy micro/hair/eye textures; publishes only at the end. Cache-hit path returns immediately. `prune` releases material without shared textures; `dispose` owns material and texture release. `configureStudentHairMaterial` registers the existing tint plugin during initial setup. Existing `avatar-garments.ts` already uses the same public batch.

Actual-Babylon RED regression, 16 foreign meshes × two existing draw wrappers, fresh cache per surface: skin 192; hair 160; strands-short02 352; strands-short04 320; beard/cloth/denim 224; leather/eye/iris/metal/rubber 128; ocular 320 foreign `getMaterial` reads. Threshold is at most one 32-wrapper traversal. All 13 traversal cases fail (parent plus cases = 14 failed), while values/first-ready defines, cache/prune/dispose and later invalidation tests pass (3 passed). No method is replaced with a traversal stub; wrapper calls delegate to actual Babylon.

## Alternatives and decision before implementation

| Alternative | Cost and effect | Decision |
|---|---|---|
| Keep setters unchanged | No code risk, retains 4–11 full scans per newly configured material; cache hits already cost no scans | Reject after reproduced RED |
| Public per-material atomicMaterialsUpdate around synchronous initial setters before cache publication | Small local edit; one final scan; preserves setter values, lazy textures, plugin setup and existing ownership; finally restores dirty handling | Select; smallest change addressing measured mechanism |
| Split helpers or move texture creation outside batch | More structure/lookup changes with no demonstrated benefit; textures are owned by same cache and preserve their lifecycle in place | Keep current ordering and minimise refactor |
| Prewarm or add material cache | Existing cache already handles hits; prewarm moves cost/startup, new cache risks duplicate lifetimes and palette coverage | Reject for this mechanism |
| Worker for preparation/rendering | Cannot remove Babylon scene-material setter traversal by transferring plain data; moving scene/renderer has broad lifecycle, resource, UI and message-copy costs and requires separately measured benefit | Out of this narrow fix |
| Scene-wide suppression, permanent block, SDK patch | Broader ownership/invalidation risks and unnecessary API/version maintenance | Reject |

Texture bytes, colours, alpha, sheen/clearcoat, shader plugin and cache keys remain unchanged. The only extra allocation is a short-lived synchronous callback per cache miss; no per-frame state or cache is added. Narrow refactor uses a separate const for cache hit and a const for the new material so the initialization callback captures an unambiguous owned PBR instance.

## Limits

Transit profile envelope 78.9/69.9/46.6 ms covers a whole block and does not attribute that time to this function. Traversal counts prove redundant CPU work, not elapsed-time/FPS savings. NullEngine has no GPU/image decoder; test derivative capability and raw-texture readiness are CPU fixture setup only. Integrator still owns frozen production visual comparison, full tests/build/integration and any performance claim.
