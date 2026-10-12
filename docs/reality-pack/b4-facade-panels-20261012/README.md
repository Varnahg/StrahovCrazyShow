# B4 grey panel facade geometry — 12 October 2026

The new B4 evidence distinguishes three actual faces from the generic dormitory
window grid: the northern tower, its recessed northern neighbour, and the
northwestern return. This model supplies those wall faces themselves, with real
openings and shallow panel joints. It must replace their previous wall geometry,
not overlap an opaque wall behind the windows.

The authoritative [shared facade plan](../../../shared/data/b4-facade-plan.json)
owns the OSM edge endpoints, face widths, common 18 m game height and all openings.
The Blender generator reads that exact file and records its SHA-256. The rendered
window kit and facade wall therefore use the same opening coordinates.

| Identified face        |                    Openings | Supported composition                                             |
| ---------------------- | --------------------------: | ----------------------------------------------------------------- |
| Northern western tower |         Six pairs, 12 total | Small windows in a grey panel face                                |
| Recessed northern face |            Five stair bands | Bands near the western edge; broad blank eastern panel            |
| Northwestern return    | Six rows of three, 18 total | Small windows in grey panel cladding, not a long room-window grid |

## References and limits of identification

- [North panorama, May 2024](https://www.google.com/maps/@?api=1&map_action=pano&pano=Vf0vxZZEYzkbdybWxPSX4w&heading=176.9096&pitch=24.7346&fov=75):
  northern composition, six small-window pairs, five stair bands and blank
  eastern region.
- [Northwest photosphere, September 2023](https://www.google.com/maps/@?api=1&map_action=pano&pano=CIHM0ogKEICAgIDZ6Z2S-QE&heading=157.33&pitch=32.12&fov=75):
  corner correspondence, three columns of small return windows and a separate
  blank reception wall. Upload date is October 2023.
- [ČVUT, 20 June 2024, photographs 1, 2 and 8](https://media.cvut.cz/cs/foto/20240620-exteriery-koleji-strahov),
  Jiří Ryszawy / ČVUT VIC: frame/reveal character, grey panels, joints and fine
  striations. The material composition is unknown; no board-formed concrete
  material is inferred from those marks.
- [OpenStreetMap way 53929057](https://www.openstreetmap.org/way/53929057),
  © OpenStreetMap contributors, ODbL: retained footprint and mapped storeys.
  Map geometry is not a measured elevation drawing.

The reference researcher visually reviewed these sources on 12 October 2026.
Their image pixels are not redistributed as textures. Joint pitch, aperture
dimensions and the material shade remain explicitly labelled interpretations.
The 1.5 m panel-joint rhythm is a conservative construction estimate, not a
photogrammetric measurement. Vent positions are not established and no vent is
invented or placed by this model.

## Authored construction

The canonical local frame is X along the exact source edge from `anchor.a` to
`anchor.b`, Y upward from the existing building base, and Z outward. Front panel
faces lie at Z = 0; the shell back lies at Z = −0.02 m. The mapped recessed face
already has its own OSM anchor; the kit adds no second arbitrary recess.

Panel joints are actual recessed mesh surfaces: interpreted 12 mm groove width,
6 mm depth and 2 mm shoulder. A restrained 1.5 mm bevel softens the outer wall
perimeter. Those dimensions are artistic construction estimates and are recorded
in the asset payload. All openings cut completely through both sides of the
shell. No glass, random decoration or additional aperture is embedded here.

Highest geometry carries a few additional samples along the small joint shoulder;
near geometry retains one shaped shoulder segment. Hidden rear edges receive no
bevel subdivisions. Broad panels use their geometric normals and physical metre
UVs. Material colour comes from the same shared plan's neutral shade, converted
from sRGB to linear values for Blender; roughness is an interpretation. There are
no painted shadows or fabricated concrete-board textures.

Files:

- [Generator](../../../scripts/create-b4-facade-panels.py)
- [Editable highest/near Blender master](../../../assets/blender/b4-panel-kit/b4-facade-panels.blend)
- [Highest evaluated mesh JSON](../../../assets/blender/b4-panel-kit/highest-geometry.json)
- [Near runtime mesh JSON](../../../shared/data/b4-panel-kit.json)
- [Highest GLB](../../../public/models/architecture/b4-facade/b4-facade-panels-highest.glb)
- [Near GLB](../../../public/models/architecture/b4-facade/b4-facade-panels-near.glb)

The GLB gallery uses node translations only; the vertices remain in each source
face's canonical local coordinates. Each object retains `faceId`, source-plan
SHA and material-role metadata. The Blender master keeps editable wall meshes,
UVs and the two explicit detail levels.

## Verification scope

The export audit is produced only after successful Blender export and an actual
native `.blend` reopen. Targeted tests check exact source binding, every opening
by rays through both mesh LODs, adjacent solid wall, complete projected wall area,
unit geometric normals, closed shell topology and delivered file checksums.
Whole-game visual checks and checkpoint-wide build/tests remain with the main
integrating task. Geometry checks are not GPU or FPS evidence.

```powershell
& 'C:/Program Files/Blender Foundation/Blender 5.2/blender.exe' --background --threads 2 --python scripts/create-b4-facade-panels.py
node node_modules/tsx/dist/cli.mjs --test tests/b4-facade-panels.test.ts
```

The coordinated CPU export was completed on 12 October 2026 using Blender 5.2.2
LTS, two threads, after acquiring `heavy-validation`. The [export log](blender-export.log)
and [audit](blender-export-audit.json) record the actual native save/reopen and
all delivered hashes. All six reopened objects reproduce their pre-save
positions, normals, UVs and indices exactly, with no boundary/nonmanifold edges
or degenerate triangles.

| Face | Near triangles | Highest triangles |
| --- | ---: | ---: |
| North tower | 5,420 | 16,316 |
| North recess | 6,656 | 22,032 |
| West return | 9,764 | 30,756 |
| Total | 21,840 | 69,104 |

The [final targeted tests](targeted-tests-verified.log) passed **9/9**, including
the unchanged existing window-kit tests. Scoped TypeScript completed with exit 0
([log](scoped-types.log)). The prior [missing-data failure](pre-export-test.log)
is retained, as are two attribute-comparison failures in
[the first test](targeted-tests.log) and [retry](targeted-tests-retry.log).

Those two comparisons exposed a representation conversion in Blender's own
bundled glTF exporter, not different panel geometry. In Blender 5.2.2,
`io_scene_gltf2/blender/exp/primitive_extract.py` rounds corner normals with
NumPy float32 `round(..., ROUNDING_DIGIT)` and then normalizes them;
`io/com/constants.py` sets `ROUNDING_DIGIT = 4`. Float32 ties round to even
(for example `0.94865 × 10000` becomes `9486.5 → 9486`). The test now models that
defined portable representation, still requiring the original 2e-6 attribute
tolerance. It also verifies the exporter's explicit V-origin conversion
`(u,v) → (u,1-v)`. Geometry/winding parity and the native exact comparison remain
independent of this conversion.

The authoritative source-plan SHA-256 is
`fa9343fdb925c5f670dab75e8c86bf99fa4eb9100c7df7246156a77171c21172`.
The [completed handoff](../../agents/handoffs/building-b4-export.md) and
[file manifest](export-handoff-manifest.json) include the generator, tests and
evidence. Whole-game rendering, full checkpoint verification and GPU/FPS results
remain the integrating task's responsibility; this modelling task has not
claimed those passes.
