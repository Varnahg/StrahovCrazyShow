# Ground seams and foundation orientation · 2026-10-11

The foundation repair is a demonstrated single-sided geometry defect. It is
separate from the user's rapid ground-color flicker, which remains unresolved.

`foundation-culling-before.json` and `foundation-culling-after.json` use actual
Babylon 9.30.0 right-handed FreeCamera view/projection matrices and native
clockwise/back-face material defaults. All 702 sampled skirt triangles on
B3/B4/B5/B6/B8/B10 were back-facing from outside before the repair, and all 702
are front-facing afterwards. Their Float32 position hashes and UV hashes are
identical. This is projection/culling evidence, not a GPU image or FPS result.

The factory now computes polygon orientation once and chooses outward normals
and native clockwise index order for either ring direction. The perimeter,
terrain-following lower boundary, positions, UVs, object roots, and collisions
are unchanged. The K5 ground partitioning fixture still passes unchanged.

## Actual archive synchronization

The source plan and exported models had two historical exporter conventions.
Counting counterclockwise map rings alone did **not** correctly identify damaged
exports. An actual GLB regression caught this before handoff. The earlier trial
was restored from verified backups; final changes follow the independently
audited source and GLB orientation in `archive-orientation-before.json`.

- Source plan: 105 foundation normal arrays and 16 foundation index arrays
  corrected to outward CCW; every other part, position, UV and material preserved.
- Actual derivatives: only 16 damaged GLBs and editable Blender files corrected.
  The remaining 105 GLB and Blender files are byte-identical to their originals.
- GLBs: original JSON/header and every byte outside the selected foundation
  NORMAL/index accessor components remain identical, including image/material
  data and every other mesh part. No re-export or texture recompression.
- Blender: 16 files edited with two worker threads, saved and reopened; mesh
  attributes, per-vertex UV binding, material graphs, image paths/content and
  object transforms checked. None of these foundations had custom split normals;
  the script handles them explicitly if encountered. Original unused material
  variants are retained using their persistence flag; shader content is unchanged.
- Every original affected file was backed up before mutation under
  `.cache/ground-layer-study/foundation-sync/backup/`.

`foundation-archive-sync.json` records IDs and before/after hashes.
`archive-orientation-after.json` verifies all 120 source/GLB skirts are outward.
`docs/reality-pack/separate-assets/building-export-audit.json` validates all 121
models and current source/manifest hashes. The earlier B6 partial-update evidence
describes its historical update, not this later repair.

Reproduction scripts are `scripts/repair-building-foundations.mjs` (prepare and
finalize stages, with independent source/GLB classification) and
`scripts/repair-building-foundations-blender.py` (open/edit/save/reopen). They
intentionally stop if an existing prepared plan would be overwritten.

## Flicker diagnosis and limits

Root's actual Game captures include working code and frozen J code, B5 exterior
foot probes at 2/30/60/100m, flat unlit colors with shadows/normal maps disabled,
avatar hidden, and small camera orbits. The observed framebuffer probe remained
stable; the photo asphalt/grass sample on J was also stable. These views have not
reproduced the reported rapid RGB changes. Earlier avatar-occluded pixel samples
are not ground-flicker evidence.

`ground-height-audit.json` samples actual Float32 ground inputs at 70,315
overlapping points. It found no physical height crossing and no equal-factor,
equal-units sub-D24 pair in the recorded K3 frustum. Its 1m grid misses narrow
seams and its analytic depth comparison does not model raster polygon offset or
prove GPU stability. Photo asphalt has factor −1/units 0; mapped grass has
factor −1/units −1, so they do not have identical bias.

`building-audit.json` audits actual façade, canonical B6 structure and foundation
inputs. Foundations contain vertical skirts only, not horizontal bottom faces.
It also identifies some interpreted window sills intersecting the varying terrain
at B3/B8; those are a separate alignment limitation and were not moved here.

The diagnostic page `/docs/verification/ground-seams.html` now offers independent
ground/layer/grass/shadow/normal-map switches, flat colors, foot offsets and a
factor-zero experiment preserving original constant units. No production bias
was changed. Material state is captured once per material and restored from the
same snapshot; checkbox elements and avatar roots are cached, with no full-scene
avatar scan per frame. Pixel readback remains explicitly opt-in and is not an
FPS measurement or automatic z-fighting proof.

## Focused checks

- Foundation tests: 3/3, including both open/closed ring directions, actual six
  dorm blocks, and all 120 actual exported foundation GLBs.
- K5 static regressions: 6/6, including the independently frozen 11-ground-mesh
  attribute/primitive fixture and actual main/shadow dispatch.
- Terrain and surface-transition checks: 10/10, including real Rapier traversal.
- Project and diagnostic TypeScript checks, and complete 121-model asset audit.

Root performs the final stable-checkpoint full tests, build, integration and GPU
review. No new FPS result is claimed by this repair.
