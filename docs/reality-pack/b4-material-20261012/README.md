# B4 panel material — 2026-10-12

The published B1 north-view screenshot showed the newly modeled panels much darker than nearby north-facing facades. Its public diagnostic record retained the intended `#a3a7a4` shade, no texture maps and zero rendering/asset errors. The panel used StandardMaterial while neighboring plaster/concrete used SurfacePack PBR, including linear light and the scene's weather-dependent environment. This identifies a material-path mismatch; it does not substitute for the pending visual A/B comparison.

## Change

Only the grey panel material now uses `createB4PanelMaterial`. The source shade is read from the unchanged B4 plan and decoded with `Color3.toLinearSpace(true)`. Runtime albedo is approximately `[0.366252596, 0.386429434, 0.371237681]`, metallic 0, roughness 0.84, environment intensity 0.7. Exact decoding and roughness match both existing Blender-native panel GLBs. The setting is a neutral photographic interpretation, not a measured albedo or evidence of concrete composition.

No albedo, normal, metallic, emissive or reflection texture is assigned; no emission or light is added. Babylon's PBR automatically shares its embedded `data:EnvironmentBRDFTexture…` lookup. That engine-owned LUT is explicitly permitted in the headless tests; external/authored texture slots remain prohibited. Near and far retain the same material instance and name. Batch/map types accept the base Material interface; vertex assembly, normals and geometry are untouched.

The existing source plan, panel kits, native Blender master and native GLBs were not edited. Global lighting, tonemapping, other buildings, characters and vegetation were not edited. The combined B4 building archive still requires the root's subsequent regeneration to adopt the new linear material factor.

## Verification

- `node node_modules/tsx/dist/cli.mjs --test tests/b4-panel-material.test.ts tests/b4-facade-rendering.test.ts tests/architecture-reality.test.ts`: **10/10 passed**, exit 0; `final-tests.log`.
- `node node_modules/typescript/bin/tsc --noEmit`: exit 0; `types.log`.
- `git diff --check` for the five changed runtime/test files: exit 0.
- Hash comparison of every position, normal, UV, colour and index buffer plus mesh/material names: **all 120 buildings identical**, including B4 near/far. See `before-geometry.json`, `after-geometry.json`, `geometry-comparison.json`.
- Counts remain 3,242 windows, 1,326,031 stored near triangles, 11,661 far triangles and 1,109 meshes. Mesh counts are not GPU draw-call measurements.

The first test run passed 8/10. Its two failures were incorrect test assumptions: Babylon exposes the embedded LUT under a `data:EnvironmentBRDFTexture0` alias rather than a literal image URL/name, and its exact transfer function's rounded constants differ from the independent double-precision formula by approximately 4e-10. Assertions now check the actual internal alias and object identity, forbid every other scene texture, and use 1e-8 colour tolerance (still rejecting the gamma-2.2 approximation). The implementation was not changed to bypass these tests. The original failure log remains in `first-tests.log`.

`result.json` includes source and test hashes. No Blender, application build, server or GPU session was started for this task. Root must compare the new production result against the preserved `b4-north-day-before-material-full.json` and image, with the same camera, lighting instant, resolution and weather fixture. Visual improvement and FPS are not yet claimed.
