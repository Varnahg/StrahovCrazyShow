# Mapped outdoor furniture and barriers

Primary inventory checked on 12 October 2026. The [OSM map API](https://api.openstreetmap.org/api/0.6/map?bbox=14.3842,50.07725,14.3985,50.0834) response is preserved in `osm-source.xml`; `osm-source.json` records its retrieval date and SHA-256. Attribution: © OpenStreetMap contributors, ODbL 1.0. This is community map evidence, not a new site survey. Each item keeps its OSM type, ID, version, object timestamp, original tags and direct object URL in `shared/data/outdoor-artifacts.json`.

The inventory projects latitude/longitude through the same origin as the world: 50.08065 N, 14.39175 E, metres, +X east, +Z south. Point furniture is limited to the current walk bounds X −500…440, Z −270…340. Intersecting fence ways keep their full source geometry in the inventory and are clipped to the playable area by the shared plan. The source also contains 94 excluded objects, with an individual reason, predominantly outside those bounds. No extra furniture is scattered to fill unmapped areas.

| Mapped kind | Count in the world | Model/evidence |
| --- | ---: | --- |
| Benches | 143 | Source node and `backrest`/`material` tags; generic 1.8 m seat if length is absent |
| Picnic tables with two seats | 2 | Source `leisure=picnic_table`, checked in OSM 2026-01-27; generic 1.9 m table and two seats, no roof |
| Waste baskets | 5 | Source node; generic small street bin |
| Waste disposal | 1 | One source node near X 66, Z 2.9; generic wheeled dumpster |
| Recycling collection fixtures | 4 | One fixture per node, preserving collection tags; no invented row for every accepted fraction |
| Information boards/maps | 4 | Source name/type; neutral original board face, not fabricated local wording |
| Bicycle parking | 1 | Source capacity 10, `stands`, silver and covered; five generic two-bike stands plus estimated shelter |
| Gates | 20 | Source node and access tags; measured-in-map width tag if present, otherwise estimated 3.2 m opening |
| Bollard features | 3 | Two points plus a way; only source way vertices become posts |
| Fence ways | 17 | Exact mapped polylines; source height where present, otherwise estimated 1.8 m |

Examples with individually inspectable provenance:

- [Lavička u stadionu](https://www.openstreetmap.org/node/3610459428), X −114.46, Z 9.87, explicitly has no backrest. It is outside the stadium's east outline. The other west-side bench, [node 4715874726](https://www.openstreetmap.org/node/4715874726), X −491.57, Z 197.5, is also outside the stadium. The inventory does not put seats in the closed stadium interior.
- [Waste disposal near the dormitories](https://www.openstreetmap.org/node/4433357980), [KlokTex clothes container](https://www.openstreetmap.org/node/1245372635), [recycling near B6/B7](https://www.openstreetmap.org/node/10067305206) and [recycling farther east](https://www.openstreetmap.org/node/10067305205).
- [Covered bicycle parking](https://www.openstreetmap.org/node/10067305194) is a mapped ten-bike facility. The precise shelter dimensions are not mapped.
- The two picnic tables are [node 6735036413](https://www.openstreetmap.org/node/6735036413), X 9.74, Z 41.86, and [node 6735036414](https://www.openstreetmap.org/node/6735036414), X 56.45, Z 41.61. Each keeps its exact source anchor, one tabletop and two seats with shared visible/collision boxes. Both have `covered=no`; no canopy is added. The integrated furniture form and dimensions are generic estimates rather than a manufacturer identification.
- [Komplex zahrad vrchu Petřína](https://www.openstreetmap.org/node/2875139941) preserves its source name and OSM check date 2026-08-06; the model does not claim its printed content was photographed.

## Interpretation limits and access

Geometry and physics are generated together in `shared/outdoor-artifacts.ts`; the renderer does not decide a second position, scale or rotation. Furniture dimensions, finish colours and construction detail are generic game estimates unless an OSM tag explicitly establishes them. Width/height tags remain map evidence, not verified physical measurements. A clothes collection box is distinguished from a wheeled bin by the actual collection tag. `backrest=no` never receives a backrest.

Direction tags are honoured when numeric. Where missing, seats and boards face the nearest mapped path; gates align with an adjacent mapped fence, or across the nearest mapped path. Those orientations are labelled interpretations in every inventory record. A source point is never shifted onto a prettier location. `nearbyTreeOsmIds` records trees mapped within 5 m; just one bench has such an OSM neighbour in this snapshot. Proximity does not prove canopy coverage, so none is asserted to be a verified “bench under a tree.” No source in this snapshot identifies a distinct `barrier=railing`; generic fences are not relabelled as verified railings.

Only the five existing fenced campus courts are treated as already owned geometry; the northern court without a measured fence is not given an invented duplicate. Source fence segments crossing mapped road or pedestrian corridors are omitted with a capsule clearance allowance. Every omission has `artifactId`, reason and length in the plan's `audit`. This is a documented game access adaptation, not a claim about the physical fence opening. Mapped gate nodes are cut out of fence runs. Private/locked/no-foot-access gates have a closed visible leaf; public and unknown-state gates retain an open centre. The open state is explicitly a game state, not a live gate report. B6 entrance clearance and fence clearance along the mapped street network have regression checks.

## Reproduction and verification

`node scripts/fetch-outdoor-artifacts.mjs` downloads a fresh primary response and updates the inventory. `node scripts/fetch-outdoor-artifacts.mjs --snapshot` recreates the JSON from the preserved response without network access. XML decoding retains original source tags; the script does not import third-party textures, photos, Google pixels or 3D tiles.

The shared plan is created once per process and cached, and boxes are merged by artifact, material and level of detail. Thin fence infill uses two visible faces instead of solid cuboids. This reduced the original furniture geometry from 130,416 to 83,264 triangles without changing collision or source locations. With the two picnic tables included, the final 200-object inventory has 83,600 triangles: 53,676 structural triangles and 29,924 near-detail triangles, 551 premerged parts, 1,768 collider boxes. Benches and picnic tables share the same terrain-rooted support helper. These are geometry counts, not GPU performance measurements or a claim of optimality.

Targeted checks passed after the final seating extension and refactor: eight `outdoor-artifacts.test.ts` tests covering source projection/provenance, exact picnic anchors and tabletop/seat collision corners, deferred candidates, stable cached geometry, arbitrary-yaw box/physics agreement including winding, no-backrest/container semantics, B6/open-gate access, and all mapped path corridors against every new fence collider. The combined targeted run including `transit-navigation-source.test.ts` and `surface-transitions.test.ts` passed 15/15. No GPU scene was run by the inventory agent; production visual and performance evidence belongs in `docs/verification.md` after the integrated client verification.

## Identified candidates pending shape evidence

The same response identifies 16 further candidates. `deferredCandidates` in the JSON preserves each ID, full original tags, timestamp/version, coordinates, source URL and a `withinWalkBounds` flag. Fifteen await source photographs/shape identification; the pink tractor records `owned-by-outdoor-landmarks` to prevent a duplicate model. Six candidates are outside the current walk bounds; one is a dependency node far north that the map API returns with a full source way. None of these unresolved candidates is replaced with a generic sculpture, fountain or flag.

| Source node | Candidate | X, Z (m) | Current bounds |
| --- | --- | --- | --- |
| [302839058](https://www.openstreetmap.org/node/302839058) | Pítko Zahrada Kinských | 449.39, 289.32 | Outside |
| [1200857319](https://www.openstreetmap.org/node/1200857319) | Lachtan | 458.66, 167.41 | Outside |
| [1200857327](https://www.openstreetmap.org/node/1200857327) | Herkules | 463.51, 316.74 | Outside |
| [1247919096](https://www.openstreetmap.org/node/1247919096) | Polibek | 326.24, −128.52 | Inside |
| [1922925120](https://www.openstreetmap.org/node/1922925120) | svatý Filip Neri | 518.28, −973.07 | Outside |
| [3918144570](https://www.openstreetmap.org/node/3918144570) | Milan Rastislav Štefánik | 412.63, −82.18 | Inside |
| [4288369889](https://www.openstreetmap.org/node/4288369889) | Flagpole | 83.44, −246.87 | Inside |
| [4288369891](https://www.openstreetmap.org/node/4288369891) | Flagpole | 77.25, −249.55 | Inside |
| [4451378012](https://www.openstreetmap.org/node/4451378012) | Fountain | 407.32, 224.69 | Inside |
| [4738087435](https://www.openstreetmap.org/node/4738087435) | Poselství | −480.89, −109.36 | Inside |
| [6798562503](https://www.openstreetmap.org/node/6798562503) | Vojta Náprstek | 464.94, −104.74 | Outside |
| [13471014119](https://www.openstreetmap.org/node/13471014119) | Memorial plaque on St Norbert bastion | −271.88, −277.08 | Outside |
| [13482792171](https://www.openstreetmap.org/node/13482792171) | Punk tractor — separate landmark owner | −113.08, −113.66 | Inside |
| [14083635431](https://www.openstreetmap.org/node/14083635431) | Štefánik memorial plaque at observatory | 420.09, −80.75 | Inside |
| [14137857478](https://www.openstreetmap.org/node/14137857478) | Pítko Petřín střed | 308.17, −104.45 | Inside |
| [14137857914](https://www.openstreetmap.org/node/14137857914) | Pítko Petřín jih | 402.77, 7.05 | Inside |

The pink tractor and Petřín tower use the separate landmark evidence and model in `landmarks*` and `shared/outdoor-landmarks.ts`.
