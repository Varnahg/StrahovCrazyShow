# Sparse photographic yellow flowers

Source: [Poly Haven Dandelion 01](https://polyhaven.com/a/dandelion_01), photography Rob Tuytel, modelling Rico Cilliers. Original assets are [CC0-1.0](https://polyhaven.com/license). This generic asset is a **visual interpretation of isolated yellow flowers** in the B6 reference, not identification of a species, local inventory, measured density or measured plant height.

`source-manifest.json` records exact download URLs, provider MD5, SHA-256, byte counts, decoded JPEG/PNG dimensions and the source metadata snapshot. `provider-files.json` contains the complete official file descriptors. Original 1K channels in `original-1k/` are byte-identical to the four public runtime maps. Each is 1024×1024; their total is **1,545,343 B**. No tint, relighting, alpha editing or website preview image is baked into the atlas.

The original highest Blender master and its five dependencies total **62,097,155 B** and are retained in `.cache/terrain-flowers-20261025/source-highest/` on the D work volume. They are deliberately not staged into the nearly full common Git storage. The importer recreates and verifies them; the source revision is pinned to provider files SHA1 `1aaae5d9ce759a84e3b9d381821c8647cefa7a85`. It refuses changed descriptors pending review. The original master is never saved over.

## Geometry and approximation

The source library contains five plants A–E with four LODs each. Only local geometry from `dandelion_01_a_LOD3` is used; the layout translations that arrange the library across 4.2 m are not plant dimensions. `derived-components.json` preserves the selected raw mesh corners, UV seams, split normals, native triangle IDs and source hashes.

| Level | Geometry | Triangles |
| --- | --- | ---: |
| near | One original upper yellow head, its curved stem and two original basal leaves | 60 |
| far | Same stem; UV-fit flat photographic head, basal leaves omitted | 16 |

The near source height is **0.156891 m**, with no uniform rescale. The declared bound includes both levels and all FAR card corners: height **0.158624 m**, horizontal radius **0.103894 m**. FAR head approximation has maximum source-vertex deviation **0.007087 m**, reported with RMS in `derivation-audit.json`; it is not described as source-exact. The raw source LOD has a Displace modifier that is **not evaluated** in this authoring derivative. Original authoring data remains preserved. The two representations retain original photographed UVs. Blender Z-up maps to Babylon `(x,z,-y)`; UV V is flipped for the original image orientation.

Material transfer is an explicit runtime interpretation: PBR, alpha test 0.45, two-sided lighting, source normal/ARM, 0.18 thin-leaf translucency, zero emission. The same GLSL/WGSL wind/fade plugin as grass uses the flower's own height and a smaller 0.00065 displacement coefficient. No flower shadow/depth pass is added.

## Reproduction

From repository root, first load the task's activation script on Windows. No dependency installs are needed. Do not execute the Blender step without the project's `heavy-validation` reservation.

```text
node scripts/import-ground-flowers.mjs --download
blender --background --factory-startup --disable-autoexec --threads 2 --python-exit-code 1 --python scripts/derive-ground-flowers.py
node scripts/import-ground-flowers.mjs --derive
```

The single Blender step only reads and extracts raw geometry/UV/material provenance; it does not render or use the GPU. Derivation is ordinary bounded Node CPU geometry processing. It publishes only `public/models/vegetation/flowers/geometry.json` and the four original 1K channels to `public/textures/vegetation/flowers/`. Runtime ID hashes stable geometry, channels and modelling provenance, excluding process IDs and elapsed extraction time.

Placement has one stable candidate/m², thinned by the shared `flowerDensity` probability and the full existing grass footprint exclusions. Current reference probability is 0.025–0.10 only in the conservative rear B6 mask, fading out at edges/worn paths. Changing quality changes LOD/caps, never the mask or candidate coordinates. Flower costs, including departing roots, are subtracted from the existing whole grass/flower triangle budget. Native/whole-game GPU appearance and performance still require root acceptance.
