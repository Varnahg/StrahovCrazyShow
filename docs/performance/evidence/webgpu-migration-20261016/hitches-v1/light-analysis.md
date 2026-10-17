# Light membership churn: bounded CPU reproduction

This is an isolated research fixture, not a runtime change or a GPU benchmark. Pinned Babylon 9.30 in readonly dependencies-v5, actual NullEngine, Scene, Light.setEnabled/resync, PBRMaterial, StandardMaterial, material.isReadyForSubMesh and forceCompilationAsync were used. No production scene, server, GPU or test file was changed.

## Measured fixture result

There are 18 distinct material/mesh users: 8 far PBR, 8 far Standard, and one near mesh of each class. Every far mesh has its entire world AABB beyond both relevant ranges. For each separate point-range12 and spot-range24 toggle, all **16/16 far users** were marked light-dirty, changed their LIGHT/type/falloff defines and switched their bound Effect identity. All 18 users were dirtied again when disabling the light. Immediate and settled readiness returned true on NullEngine; this does **not** demonstrate GPU readiness or measure a compile stall. Counts describe affected material users, not 16 unique compiled shader programs.

Setting intensity to zero while the light stayed enabled caused no dirty state and no Effect/define changes; the light still occupied a slot. A fixture-only conservative AABB includedOnlyMeshes list containing the two near meshes resulted in **0/16 far dirty/effect changes**, while both near users changed. This is a mechanistic comparison only; the production street-light budget and scene selection were not reproduced.

Final body/cleanup interval was **2026-10-17T18:28:22.300Z–18:28:22.651Z**, 349 ms wall, process CPU 265 ms user +109 ms system after imports. Command wall including imports was 1.50 s. Earlier attempts: 18:27:20Z lacked an InstancedMesh side-effect import; 18:27:49.809Z–18:27:50.141Z exposed NullEngine's default lack of instancedArrays capability. The final thin-instance bounds example explicitly enables that capability only for CPU bookkeeping, without a GPU claim. All processes finished and disposed their scene/engine.

## What the pinned shaders prove

Both GLSL and WGSL ordinary Standard point/spot functions multiply diffuse and specular by `max(0, 1-distance/range)`. PBR lightFragment first selects explicit per-light LIGHT_FALLOFF_STANDARD before falling back to the material's physical/GLTF setting; its standard function has the same finite cutoff. Both target controllers explicitly use Light.FALLOFF_STANDARD, and actual fixture defines confirm that per-light flag for both material classes. PBR ordinary diffuse, transmitted, specular, sheen and clear-coat radiance use attenuation; shadow multiplication cannot turn zero direct radiance into nonzero radiance. A positive finite range therefore bounds **that light's ordinary direct contribution**.

This is not unconditional image equivalence for changing membership:

- PBR physical falloff is inverse-square with no finite range cutoff. Missing/physical/custom falloff must remain included. GLTF has a finite cutoff only with its actual finite range. At twice range, standard/GLTF attenuation is zero but physical is positive; source-backed numeric examples are in shader-audit.json.
- LIGHTMAPEXCLUDED + LIGHTMAP adds lightmap color times shadow without this ordinary distance attenuation. SHADOWONLY, custom user lighting, unknown shader/plugin behavior and debug paths need separate treatment. The inspected C5 controllers do not assign a nondefault lightmap mode, but source inspection is not a live exhaustive asset/material inventory.
- Dropping a zero-contribution light from a truncated light list can promote a previously omitted nonzero light into maxSimultaneousLights, changing the image. Preserve selection or restrict eligibility to known non-truncated lists. Frozen material defines can remain stale after membership changes; do not apply this blindly to frozen/unknown classes.
- C5 applyArtLighting reserves global street capacity for B6 and torch before selecting lamps. Local membership filtering alone does not eliminate the separate global street-count transition. Correctness requires considering that budget together with per-mesh binding order and the existing shadow freshness guard.

## Conservative bounds requirements

The real bounds examples disprove center-only rejection: a 100 m wide box centered50 m away has AABB minimum distance0. A regular-instance source has minimum distance99 m while an instance of that source has minimum distance2 m. A thin-instance source translated100 m has a near instance after a -100 m local transform; its actual refreshed aggregate bound has minimum distance2 m.

A sphere test is cheaper and conservatively over-includes more geometry; world AABB minimum-distance is tighter. Both require current finite world bounds that contain rendered/deformed vertices. Hardware-instanced batches need the union of source/instance bounds actually sharing the draw/light layout. Thin-instance bounds need refresh after matrix changes. Skinning, wind deformation, custom vertex displacement, nonuniform transforms, disposed/replaced geometry and unproven bounds must be conservatively retained or have an explicit deformation envelope. An object's center, or only its source mesh's bound, is insufficient.

## Alternatives before a runtime decision

| Approach | Evidence / potential benefit | Main risks and costs |
| --- | --- | --- |
| Conservative sphere/AABB membership | Fixture directly reduced far invalidations16→0 for both lights. Can shrink global material bursts while preserving zero-contribution exclusions under explicit eligibility. | World/instance/deformation bounds, material cap/slot promotion, frozen shaders, global street budget, lifecycle; naive array membership can add O(meshes×included) resync work. Moving boundaries need hysteresis/early inclusion to avoid new shader churn. |
| Stable enabled slots, intensity0 | Fixture preserves defines/effects with no dirtiness. | Zero intensity still consumes a slot. Four-slot capacity can displace visible lamps; retained shadow-enabled lights can add shadow work. Requires a lighting-budget/image decision, not just replacing setEnabled. |
| Descriptor-exact async prewarm | Existing pinned engine/cache already exposes createRenderPipelineAsync/preWarmPipeline. Can move first-use pipeline completion off the submission critical path. | Does not itself remove global define/CPU work. Convenience API uses geometry-only buffers, overrides=null and textureState0; real instancing, depth textures, shadow/postprocess formats, sample counts and states must match. Raw descriptor path bypasses Babylon cache. Need pending dedupe, error/generation ownership and no stale cache insertion. |

No variant is selected as a production fix by this probe. The 8-second C5 gaps remain a separate GPU/browser scheduling hypothesis: this fixture proves the broad invalidation mechanism and eligibility constraints, not its contribution to those gaps. Production visual equivalence, exact descriptor coverage and comparable GPU timings remain required.
