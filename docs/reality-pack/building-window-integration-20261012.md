# Blender window and market-detail integration — 2026-10-12

The first integration record below predates the source-backed B4 correction. The **current B4 checkpoint** and its own 24 passing targeted tests are recorded in the final section; the earlier 46-test result is retained as historical evidence, not reused as validation of later changes.

The runtime near facades now use the evaluated Blender profiles from `shared/data/building-window-kit.json`: the outer frame, nested pane sashes, glazing seals, mullions, existing transoms, beveled reveal and folded sill. The previous procedural strips and sill faces have been removed, not overlaid. The source openings, their count and typology, wall slicing, entrance gaps, glazing style seeds and simulated night-light metadata remain the authority. The original single glass plane and normalized UVs remain, including the six transparent B6 material variants.

The source-identified market flue at OSM way 7645350 uses the near/far meshes from `shared/data/market-detail-kit.json`. They replace the old cylinder at the same documented tangent position, foundation and height. The rain cap, collars and protective grille remain inside the existing building collision footprint. No new door or walkable interior is introduced. See the two kit manifests for photographic provenance, observation dates, model interpretations and dimensional uncertainty.

## Geometry and material handling

- The original Blender indices and split normals are retained. Corner resize weights translate profile anchors instead of stretching a 45 mm frame with the width of a whole window. Pane cells follow the existing 1/3/4-pane and transom layout.
- A triangle's weight gradients give the piecewise affine deformation Jacobian. Normals use its inverse transpose; metric UV derivatives adapt with the dimensions. Plaster and wood retain the existing three-metre repeat. The facade basis transforms vertices and normals together and reverses winding for mirrored footprint orientation.
- Model parts append to the existing per-building/material buffers. Dark glazing seals and flue metal use RGB vertex tints within those batches, with white for surrounding vertices. There is no object or draw submission per individual window. Runtime StandardMaterial does not reproduce all PBR properties of the separate authored metal GLB.
- Prepared shapes are shared only during the architecture build, then the cache is cleared. There are no frame callbacks, asset requests or persistent per-window objects. The near JSON is the only window kit imported by the browser. Archive export explicitly injects the highest window and market geometry; requesting highest without either source fails rather than silently archiving a runtime mesh.

## Recorded CPU verification

The scoped integration run passed **46/46 tests** on 2026-10-12. `tsc --noEmit` also completed with exit code 0. It includes exported-profile validity, physical profile widths, all existing opening typologies, inverse-transpose normal transport, both facade windings, UV tangent validity and metre scale, vertex-colour batching, B6 glazing/entry/steps, shared roof and chassis collision, foundations and independent building identities. The actual oblique frame ray hits the modeled inner bevel before the deeper return; its expectation was updated from the former flat strip.

Command:

```text
node node_modules/tsx/dist/cli.mjs --test tests/building-window-model.test.ts tests/architecture-reality.test.ts tests/architecture-depth.test.ts tests/building-foundation.test.ts tests/building-roofs.test.ts tests/b6-reality.test.ts tests/b6-exterior-concrete.test.ts tests/world-asset-identity.test.ts
```

The initial scoped run passed 6/8; its two failures were the previous flat-normal-only assertion and the obsolete 180,000-triangle ceiling. A subsequent frame-ray expectation also detected the newly modeled bevel before the old return depth. They were inspected against the actual source geometry, not bypassed. The final test allows the authored shallow divider smoothing while still requiring matching outward winding, valid tangent frames and strict flat wall/reveal normals. The new near topology ceiling is 1,400,000 triangles for the entire stored campus architecture, not an FPS acceptance threshold.

| Stored architecture | Baseline 918a59c | Integrated candidate |
|---|---:|---:|
| Buildings | 120 | 120 |
| Windows | 3,258 | 3,258 |
| Near triangles | 166,237 | 1,314,723 |
| Far triangles | 10,927 | 11,503 |
| Near + far meshes | 1,104 | 1,104 |
| Stored vertices | 359,524 | 2,187,076 |

The higher vertex count is a material memory and geometry cost. The existing distance selection still chooses near/far per building; unchanged stored mesh count alone does not prove unchanged GPU cost. These are NullEngine geometry/collision checks, **not gameplay screenshots, draw-call measurements or FPS proof**. Whole-game visual validation, a stable full test/build/integration checkpoint, archive export and hardware measurements remain the root task's responsibility.

Exact integration and source hashes are recorded in `docs/verification-evidence/building-window-integration-20261012/integration.json`.

## Current B4 checkpoint

The actual exported Blender panel kit now replaces three identified faces on building 53929057: twelve small north-tower windows, five stair bands at the western side of the recessed north face, and eighteen small windows on the west return. The rest of the recessed north face stays blank. There is no second artificial 23 cm setback, procedural wall overlay or invented entrance. The far facade follows the same asymmetric opening plan. Dark neutral frames and grey panels use no unsupported wood grain or board-formed texture. The photographed projecting corner sign remains an unplaced fact rather than the previous flat plaque across the stair glazing.

The native near panel export has 21,840 triangles and its highest source has 69,104. This integration consumes the real data. Source plan SHA `fa9343fdb925c5f670dab75e8c86bf99fa4eb9100c7df7246156a77171c21172` matches the panel kit's recorded plan. Archive export injects the highest panel data outside the runtime bundle.

Current validation passed **17/17** window/B4/architecture/material-recipe tests and **7/7** targeted B6 entry, glazing, actual GLB and source-identity checks. `tsc --noEmit` and `git diff --check` exited 0. The B4 test checks all 35 wall apertures and corresponding far glass patches, the blank north-recess panel and the exact expected panel-plus-reveal triangle count. No corrective edit or failing retry was needed in this run. Full commands, logs and hashes of code, source kits and tests are in `docs/verification-evidence/building-window-integration-20261012/b4-final-integration.json`.

Per-building hashes of every position, normal, UV, colour and index buffer, together with mesh/material names, show **119 unchanged buildings and only B4 changed** relative to the preceding window/market integration. B4 near geometry changed from 129,687 to 140,995 triangles, far geometry from 133 to 291, and stored meshes from 19 to 24. Campus totals are now 3,242 windows, 1,326,031 near triangles, 11,661 far triangles and 1,109 stored meshes. Before/after manifests and the comparison are retained alongside the result.

`solid()` also now records authored colour/normal texture URLs and normal strength independently of `document`. The browser reads those same values; its appearance is unchanged. NullEngine keeps its fallback colour and does not load images, while the archive exporter can recover the exact texture recipe. Physical surface overrides retain priority. Root owns the corresponding archive transfer; B6's separate tint contract remains unchanged.

These results validate CPU geometry, the material-data contract and collision continuity. They do **not** establish gameplay appearance, draw-call cost or FPS. Full building archive regeneration, production test/build/integration and GPU acceptance are still the root checkpoint's next steps.
