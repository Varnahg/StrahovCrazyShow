# Building window profiles — 12 October 2026

This kit replaces flat window strips with real authored Blender profile geometry.
The client receives the evaluated mesh vertices, normals, UVs and triangles; it
does not reconstruct independent lookalike boxes. Campus placement, openings,
window counts, collision dimensions and existing glass remain the responsibility
of the shared building plan and facade integrator. This is a window modelling
checkpoint, not evidence that every campus building is complete.

## Identified photographic evidence

- [ČVUT exteriors, photo 3, 20 June 2024](https://media.cvut.cz/cs/foto/20240620-exteriery-koleji-strahov#lg=1&slide=2),
  Jiří Ryszawy: four vertical panes, nested dark brown frame, light sloped metal
  sill with a front return. The block number is not visible: this is a long-facade
  typology reference, not proof that the photograph depicts B4. No horizontal
  transom is added to the standard four-pane window.
- [ČVUT exteriors, photo 2, 20 June 2024](https://media.cvut.cz/cs/foto/20240620-exteriery-koleji-strahov#lg=1&slide=1),
  Jiří Ryszawy: identified B4 entrance wing, separate small square openings,
  recessed dark frames and narrow pale sills. The reference researcher visually
  inspected both photographs on 12 October 2026. They remain links; their pixels
  are neither redistributed nor embedded in game textures.
- [B12 detail, 6 October 2009](../../world-architecture/media/b12-detail-2009.jpg),
  Ondrej.konicek, [CC BY-SA 3.0 and provenance](../../world-architecture/LICENSES.md):
  historical inset frame, deep reveal and horizontal transom. The original JPEG
  was inspected directly. Its cracked plaster and aged finish are not asserted
  to be the present condition of B12 or transferred to B4.

The exact original URLs, capture/review dates and B12 source SHA-256 are stored
in both geometry exports. The aperture dimensions (2.18 × 1.5 m nominal), 18–20 cm
reveal depth, 45 mm outer frame, 16 mm sash and 6 mm gasket are **architectural game
estimates**, not measurements recovered from a calibrated photo. Colours are
photo-informed material choices, not measured albedo. The folded sill hem is a
conservative construction interpretation of the visible front return.

## Editable asset and placement contract

- [Editable Blender master](../../../assets/blender/building-window-kit/building-window-kit.blend)
  retains seven named profile meshes with base topology, selected bevel edge
  weights and WeightedNormal modifiers. The scene contains a labelled assembled
  four-pane example and an explicitly preview-only wall, glass, camera and light.
- [Highest evaluated geometry](../../../assets/blender/building-window-kit/highest-geometry.json)
  is separate from the client payload.
- [Near runtime geometry](../../../shared/data/building-window-kit.json)
  contains `outerFrame`, `reveal`, `sill`, `sash`, `gasket`, `mullion`, `transom`.
- [Highest GLB](../../../public/models/building-window-kit/window-kit-profiles-highest.glb)
  and [near GLB](../../../public/models/building-window-kit/window-kit-profiles-near.glb)
  contain those actual meshes, arranged in a profile gallery through node
  translations only. `extras.sourcePrimitive` identifies each original mesh.

Canonical coordinates are metres: X along the opening, Y upward, Z outward.
The origin is the lower-left rough opening. The preserved runtime glass plane
is Z = −0.182 m at nominal depth; no kit glass enters the client. Existing
curtains, blinds and simulated occupied-room masks must therefore remain intact.

Each vertex carries three binary `resizeWeights`. Its adapted position is:

```
x += wx * (requestedWidth - primitive.nominalWidth)
y += wy * (requestedHeight - primitive.nominalHeight)
z += wz * (0.18 - requestedDepth) + frontDepth
```

This changes the clear span while preserving millimetre profile widths. Sash and
gasket repeat once per clear pane cell between the outer frame and dividers;
their common cell origin is lower-left. Mullions have fixed width 0.036 m;
optional transoms have fixed height 0.045 m and only follow existing source-backed
transom placement. Reveal/sill depth adaptation must transform their normals
(`normalMode: recompute-on-depth-resize`). Canonical UVs are metres and the facade
integrator must retain that scale when adapting textured reveals.

## Geometry choices and budget

The profile itself carries the important depth: stepped frames, actual mitered
corners, pane-sized sash lips, separate dark seals, splayed reveal edge and folded
sloping sill. One-segment secondary bevels are restricted to selected visible
edges in the highest asset. Hidden rear edges, reveals and rubber seals do not
receive indiscriminate subdivision. The near asset omits only these secondary
sub-millimetre bevels; all main 3–5 mm profile chamfers remain real geometry.

| Geometry                            | Highest triangles | Near triangles |
| ----------------------------------- | ----------------: | -------------: |
| Outer frame                         |               192 |             64 |
| Reveal                              |                16 |             16 |
| Folded sill                         |                48 |             24 |
| One sash                            |               128 |             48 |
| One gasket                          |                32 |             32 |
| One mullion / transom               |                44 |             20 |
| Assembled standard four-pane window |         **1,028** |        **484** |

The client JSON is 28,215 bytes. This counts authored triangles, not actual
visible GPU work or draw calls. Per-building/material batching, facade LOD and
whole-game performance remain integration concerns.

The initial three-segment study was excessive (4,720 triangles per four-pane
window) and is retained in [study-three-segment](study-three-segment) with its
master, geometry, script and export audit. The final construction is substantially
cheaper without discarding its primary profile. A first transient export also
smoothed unrelated planar reveal/gasket corners; explicit construction-edge
sharpness corrected that before the accepted export. Near reveal/frame/sash/sill
face-to-corner-normal dot products exceed 0.9999998; gasket is exactly 1.

## Actual verification

- Blender **5.2.2 LTS**, CPU, two threads: creation, evaluated exports, saving and
  actual native `.blend` reopen all passed. The reopened master still contains
  all seven editable meshes, UV layers, role materials and retained modifiers.
  [Export audit and file hashes](blender-export-audit.json).
- Four targeted tests pass: finite/unit normals and valid winding; nondegenerate
  resized small/standard/wide openings with fixed profile widths; **exact near
  and highest GLB triangle parity with their JSON**; reopened master/export
  checksums and bounded assembled triangle budgets.
- [Bidirectional surface samples](profile-distance-audit.json) compare initial
  study, final highest and near. Every vertex, triangle midpoint and edge
  midpoint is checked against the other mesh's triangles. The maximum observed
  displacement is **0.660426 mm**, below the 0.7 mm limit. This is a sampled 3D
  surface/silhouette check, not a continuous Hausdorff proof.
- [CPU inspection render](blender-cpu-profile-inspection.png): 1280 × 960,
  Cycles CPU, 32 samples, two threads. Directly inspected nested profiles,
  separate seals, joined corners, reveal depth, sloped sill and its front fold.
  This is an offline model inspection, **not a gameplay screenshot or FPS proof**.

Reproduction from the repository root:

```powershell
& 'C:/Program Files/Blender Foundation/Blender 5.2/blender.exe' --background --threads 2 --python scripts/create-building-window-kit.py -- --render
node docs/reality-pack/building-window-kit-20261012/verify-profile-distance.mjs
node node_modules/tsx/dist/cli.mjs --test tests/building-window-kit.test.ts
```

No new opening, shop, speculative ornament, door or stadium window was placed by
this kit. GPU visual acceptance in the complete game and the full stable-checkpoint
pipeline are performed by the integrating task.
