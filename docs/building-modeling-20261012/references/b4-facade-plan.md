# B4: three localised facade faces

The authoritative plan is `shared/data/b4-facade-plan.json`. `shared/b4-facade-plan.ts` matches actual edge endpoints within 5 mm; an edge that merely has the same normal or length does not match. `scripts/export-b4-facade-plan.ts` makes the byte-identical Blender input copy at `assets/blender/b4-facade/source-plan.json`.

| Face | Existing OSM edge, metres | Observed opening arrangement |
| --- | --- | --- |
| North tower | (78.64, 40.45) → (85.16, 40.33) | Six rows of two small square windows |
| North recess | (85.21, 42.47) → (95.34, 42.23) | Five low wide stair bands at the western end; eastern remainder blank |
| West return of north core | (78.87, 52.8) → (78.64, 40.45) | Six rows with three small windows, rather than the ordinary dorm room grid |

The [May 2024 north panorama](https://www.google.com/maps/@?api=1&map_action=pano&pano=Vf0vxZZEYzkbdybWxPSX4w&heading=176.9096&pitch=24.7346&fov=75) is geolocated north of the building and faces south. The [September 2023 northwest contributor panorama](https://www.google.com/maps/@?api=1&map_action=pano&pano=CIHM0ogKEICAgIDZ6Z2S-QE&heading=157.33&pitch=32.12&fov=75), reached by normal panorama navigation, establishes the corner arrangement shared by the [June 2024 ČVUT photographs](https://media.cvut.cz/cs/foto/20240620-exteriery-koleji-strahov). The contributor card says October 2023, while the image-capture footer says September 2023; the plan records both separately. `observations.json` contains individual photo IDs and limits.

The 0.72 × 0.78 m small windows, 0.2 m pair separation, 3 m storey module and sill heights retain the existing game interpretation. The stair bands are 2.4 × 0.66 m with local U = 0.12 m. The three west-return centres use 20%, 50% and 80% of the actual edge length. These dimensions and centres are **unmeasured photographic modelling estimates**. They are not a room inventory or architectural elevation survey.

The grey material is identified as panel cladding with visible seams and fine vertical striations; its composition is unknown. Neutral `#a3a7a4` is an artist setting. The 1.5 m joint rhythm is a conservative interpretation of visible seam density, not measured panel manufacture. Blender must clip panels around the same shared openings. The perimeter already has the north-core setback: a panel model must not add another setback.

`blankEasternPartOfNorthFace` means only the part of the 10.13 m north edge east of the stair bands. It does not mean the long eastern facade of B4. All other B4 edges and other buildings keep their existing plans.

The ground-level doorway below the stair strip is recorded as an observed region without a new metric doorway or collision opening. Existing generic sign placement is suppressed on these faces so it cannot cover the new stair windows. The projecting blue-white number at the northwest corner and the later pale vent covers remain unplaced facts until a separate justified placement is made.

Three targeted tests passed: actual OSM endpoint/width/height matching; source arrangement and blank-region/no-door constraints; and reverse-edge invariance with owned opening data. For a reversed edge, opening U coordinates reverse, while the canonical geometry anchor and joint coordinates remain unchanged.
