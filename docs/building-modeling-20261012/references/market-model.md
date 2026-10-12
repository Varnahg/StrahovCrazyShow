# Potraviny / R-ko: authored flue model

The [east panorama](https://mapy.com/cs/zakladni?q=Recharging%20bar&source=firm&id=13296995&pid=101883310&newest=1&yaw=4.343&x=14.3938139&y=50.0812633&ds=2&z=17&ovl=8) was visually inspected on 12 October 2026. Its displayed capture date is 1 June 2023. It establishes the round shaft, collars, raised rain cap and protective enclosure on the east end of the shared Potraviny/R-ko building, OSM way 7645350. No photograph, panorama screenshot or mural pixels were archived or used as a texture.

`scripts/create-market-detail-kit.py` authors a native Blender model: an open tubular shaft, three joint collars, rear brackets, a rain cap on supports, and a barred protective enclosure. The highest editable `.blend` retains separate named parts and bevel/weighted-normal modifiers. It is saved before lower-detail variants are constructed. Dimensions, collar count/spacing and exact grille construction are photographic interpretation, not survey.

The existing placement is retained exactly: along the existing east edge by `edge.length * 0.18`, offset 0.3 m inward, at the same building base elevation. The original 0.17 m shaft radius and total 5.4 m height remain. All new parts fit within 0.28 m of the centre in plan, so the enclosure stays inside the existing solid building footprint. This adds no separate collision obstacle or traversable surface and does not pretend to locate the bar entrance.

| Variant | Triangles | Material groups |
| --- | ---: | ---: |
| Editable highest | 8,336 | 2 |
| Runtime near | 1,984 | 2 |
| Runtime far | 600 | 2 |

The portable GLBs and batched runtime JSON come from the actual evaluated Blender meshes. The source JSON for the full building master is `assets/blender/market-detail-kit/highest-geometry.json`; the near/far runtime catalogue is `shared/data/market-detail-kit.json`. Local axes are X tangent to the facade, Y up, Z outward, origin at shaft bottom centre.

Native Blender 5.2.2 LTS reopened the saved highest source and verified its 29 mesh objects, evaluated triangles, bounds and retained editable modifiers. The exporter checks finite geometry, nondegenerate triangles and consistent split normals/winding. The targeted Node tests also transform every GLB node and compare its triangles against the runtime JSON within 0.1 mm quantisation, verify the original envelope, and validate delivered hashes. Three tests passed. This is geometry/asset evidence, not a GPU or FPS claim.

The portable assets retain their galvanized and dark-metal PBR properties. The existing architecture renderer batches these roles into its existing metal material with relative vertex tint; that runtime material is an approximation and does not reproduce the separate Blender roughness/metallic values. Whole-game integration and visual inspection are recorded by the integrating agent.

The companion `observations.json` records the specific B4, standard-window and training-centre references. B4's north-end composition is geolocated by a May 2024 panorama. A second geolocated contributor panorama, captured September 2023 and uploaded October 2023, identifies the northwest corner composition shared by ČVUT photo 2 and its three-column small-window return. The pale covers themselves are documented only by the later June 2024 photographs; their metric locations remain interpreted and no vent placement has been implemented by this kit.
