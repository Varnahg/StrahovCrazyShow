# Tree crown shading study — 12 October 2026

This candidate changes runtime lighting normals and thin-leaf transmission. It does not change tree positions, crown geometry, collision dimensions, source texture pixels, alpha coverage, LOD distances or draw counts. Whole-game appearance and frame-time acceptance are separate from the CPU checks below.

## Evidence and interpretation

- The existing crown geometry is authored from IPR summer 2023 green scan points and the 8 June 2024 orthophoto. `shared/data/tree-reconstruction.json` contains the interpretation, uncertainty and shape parameters. This is not a survey of individual leaves or a botanical identification.
- `docs/streets/strahov-ortho-2024.jpg` shows coherent light/shadow regions across crown volumes. The user-supplied Vaníčkova image, `assets/reference/road-details/codex-clipboard-7e2949f1-8c17-4ae9-97ab-8eabbb2a2ec9.png`, also shows volumetric green crowns. Its archive date is 11 October 2026; capture date is unknown. The image is a visual reference, not a licensed texture.
- The actual-game baseline `.cache/gameplay-quality-20261012/u1-trees.jpg` was captured by the root agent in the primary checkout, medium quality, player `(87.4191, -70.2018)`, looking north, overcast weather, approximately 10:04 UTC on 12 October 2026. The closest trees are `ipr-crown-026` and `ipr-crown-025`. It shows pale bark and yellowish, patchy foliage. It is more relevant than the historical isolated component render.
- The original asset normals are normalized, but only 53.78% of far foliage normals point toward the source crown envelope; their mean absolute envelope alignment is 0.4472. See `source-normal-audit.json`. This is expected from individually oriented bent cards, but produces inconsistent cluster lighting. It is not evidence of a corrupt normal channel.
- Material sources are ambientCG [LeafSet001](https://ambientcg.com/a/LeafSet001), [LeafSet019](https://ambientcg.com/a/LeafSet019) and [Bark012](https://ambientcg.com/a/Bark012), imported 10 October 2026 under CC0. The leaf sets are provider-classified **Approximation**, not photographic scans of Strahov trees. Bark012 is surface photogrammetry; its original colour is light yellow-brown. Existing filenames/material names are retained for compatibility. `texture-manifest.json` retains the original channel hashes.
- Babylon's hardware sRGB texture path already decodes albedo correctly; a `gammaSpace=false` getter together with `_useSRGBBuffer=true` is not a missing colour conversion. No extra gamma conversion or arbitrary colour grade is added.

## Candidate

The crown helper combines the original leaf-card normal (28%) with an outward normal from the same crown centre, diameter, minor axis and orientation used by the authored mesh (72%). Broadleaves use an ellipsoid gradient; conifers use a cone gradient. These are explicit lighting approximations, not measured normals. The result is normalized and written once at bootstrap or detail streaming. Runtime metadata identifies this derived shading.

The approach follows the cluster-normal principle described in the primary [SpeedTree card-generator lighting documentation](https://docs9.speedtree.com/modeler/doku.php?id=card_generator). It does not import SpeedTree assets or code. The source albedo, roughness and normal maps remain shared. Foliage stays alpha-tested at 0.5. Two-sided rasterization remains enabled, while automatic backface normal flipping is disabled because the derived normals already describe an outward crown envelope.

Thin-leaf PBR translucency uses the existing albedo map at intensity 0.12, white tint and estimated thickness 0–1 mm. It adds no emissive colour, emissive texture or extra light. The original bark material is retained. Pale/smooth bark may still need a separate source-based diagnosis after the matching gameplay comparison.

The wind plugin is extracted without changing its position displacement. Its vertical shear now applies the inverse transpose to normals and the forward transform to tangents. Uniforms update through the hard-bind hook even if Babylon caches the material. Shared PBR materials and their existing shadow wrappers remain the only material instances.

## Cost and ownership

`cpu-audit.json` records hashes, hardware, method and individual timings. The measured CPU transform on the i7-8750H / Node 24.19.0 took 23.62 ms on the first pass over all 108 retained foliage meshes (109 tree placements, including one bare tree), and 19.16 ms median over nine warmed passes. It processes 179,358 vertices, replacing 2,152,296 bytes of normal buffers. Representative `ipr-crown-026` near/mid medians were 1.37 / 0.36 ms. The retained source archive also has one excluded crown, hence the original archive audit examines 109 foliage meshes.

This is CPU transformation time only: it excludes disk/network/decode, WebGL upload and frame rendering. It is not an FPS result. No per-frame vertex-buffer mutation is added. Independent source meshes keep their existing geometry rather than cloning all attributes. The temporary original normal arrays are released after loading; there is no global normal cache. Normal buffers belong to their mesh and are disposed by existing LOD eviction and scene disposal.

## Verification

Passed 13/13 targeted tests:

```powershell
pnpm exec tsx --test tests/tree-appearance.test.ts tests/vegetation-runtime.test.ts tests/vegetation-realistic-pack.test.ts
```

The tests cover original master/channel/chunk hashes, all far normal vectors, source-array immutability, near/mid attribute identity, unchanged bounds, one-time application, LOD eviction, material ownership, non-emission, frozen-material wind updates and normal/tangent shear. Scoped TypeScript passed for the helper, wind plugin, test and audit entry points. Source assets and editable Blender master remain byte-identical.

Reproduce the CPU-only load-cost audit:

```powershell
pnpm exec tsx scripts/audit-tree-appearance.ts
```

No Blender or GPU scene was opened by this agent. Root coordinates the real-game before/after review and complete checkpoint tests/build. The candidate must still be assessed for crown shape, normal-map interaction, close/far transition consistency, night lighting and actual whole-game performance. Counts and NullEngine tests cannot establish either visual quality or 60 FPS.
