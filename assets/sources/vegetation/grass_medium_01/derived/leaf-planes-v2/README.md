# Source-derived individual leaf planes v2

This permanent package retains the component-reviewed derivative of the **unchanged authored highest v2** (`8e777333…c3c8bf61`) and original Poly Haven Grass Medium 01 photographs. The original master, original 8k channels, earlier authored v1/v2 meshes and their UV-aware render pack remain in the parent source package. Original assets are CC0; modelling: Rico Cilliers, photography: Rob Tuytel, <https://polyhaven.com/a/grass_medium_01>.

Each of the 42 original highest leaves is projected separately. The plane contains the actual root and tip centres. Its transverse direction follows the summed physical cross-section width vectors, orthogonalized against the root-to-tip chord. This corrects the rejected first fit, whose unconstrained transverse PCA sometimes viewed a bowed leaf almost edge-on. The two-segment version places its hinge at the source centreline row with the largest depth deviation.

The three data passes were generated with Blender 5.2.2 Cycles **CPU**, four threads, eight samples, a 1024×512 atlas, no denoising. There is no baked illumination. Albedo uses Standard/sRGB; normal and roughness use Raw. All three passes use the same original photographic alpha cutoff 0.45. The offline emission shader only transfers surface data. Final materials are lit PBR with source F0/translucency, AO disabled and zero emission.

`leaf-bake-report.json` records source hashes, actual plane axes, dimensions, per-leaf approximation errors and unchanged-source verification. `leaf-manifest.json` contains both geometries and derived texture hashes. The three `*-raw.png` files retain exact data-pass output. The processed maps extend RGB six texels only into zero-alpha padding, independently per leaf cell; alpha remains unchanged. Bent normals are rotated into the actual segment tangent bases before ordinary PBR transforms them back to world coordinates.

| Runtime level | Representation | Triangles | Whole source leaves |
| --- | --- | ---: | ---: |
| Near | Two segments per leaf | 168 | 42 |
| Medium | One plane per leaf | 84 | 42 |
| Far | Deterministic subset of complete medium leaves | 22 | 11 |

Maximum source-vertex deviation is 5.913 mm for the flat projection and 1.710 mm for the two-segment version. Root and tip **centres** are exact; this does not claim every basal edge, fold or twist is exact. High quality uses the same actual 1024×512 atlas, not an upsampled file.

The root accepted the component on 12 October 2026 for integration as a candidate after close, low, rotated and night GPU review. This is **not** whole-game appearance or FPS acceptance. Source-ground materials have separate provenance; the common Grass001 underlay is procedural ambientCG material, not a photograph.

Rebuild from the repository root with `scripts/bake-photographic-leaves.py` in Blender background, `--threads 4 --python-exit-code 1`, followed by `scripts/prepare-photographic-leaves.py` using the Blender Python environment. Both write only `.cache/photographic-leaf-export`. `node scripts/export-photographic-leaves.mjs --from-bake` stages runtime geometry/textures there; without that flag it stages this checked permanent package. Publishing staged files into `public` is a separate explicit implementation step.
