# StrahovCrazyShow · playable demo

[Česká verze / Czech version](README.cs.md)

Virtual Strahov in your browser: a student campus based on maps, orthophotography and real terrain elevations, a reconstructed B6 interior, a customisable character, an anonymous shared world, fictional events and cooperative activities. Building exteriors, paths and traversable spaces use common source data. The [Reality Pack](docs/reality-pack/README.md) connects review previews, photographs, Blender models and documented accuracy limits.

**The main game uses separate models with documented provenance.** The historical IPR 3D scan is a spatial reference with a separate viewer; its merged trees, cars and surfaces are not loaded into the game. Buildings, vehicles, trees and courts have individual identities and transforms. See [building models](docs/reality-pack/separate-assets/README.md), [individual trees](docs/vegetation/realistic-pack.md) and [model and terrain review](docs/model-review/README.md).

There is no IS sign-in, residency verification, password or real student profile. A nickname identifies a temporary session only. Access is not restricted to Strahov residents. Public deployment is outside this version's scope.

## Current version

The repository contains development demo 0.1.0 and the current social MMO pilot. [Historical L2 acceptance](docs/releases/demo-2026-10-11.md) records the earlier release; the latest checkpoint is described below.

The current tested pilot is **P5**, source `4601a8c8f94775e37befda81976b1a8457a171be923dd5b24981847b7c34000e`. **471/471 tests and the production build passed.** Isolated integration passed an unchanged retry after an initial steering timeout; both attempts are preserved. Independent SHA audit verified **8175 live + 8175 frozen files without mismatches**. See [verification](docs/verification.md) and [P5 evidence](docs/verification-evidence/pilot-20261011-p5/results.json). Local testing: [http://127.0.0.1:4179/](http://127.0.0.1:4179/).

P5 fixes inverted legs during jumps, carries the pelvis with the physical character in flight, and prepares foot contact before landing. [Jump reconstruction and tests](docs/characters/locomotion-study/jump-repair-20261011.md) distinguish this fix from remaining sharp-turn locomotion and remote jump-pose limitations.

P3 adds Czech/English UI and all 36 journal articles, a compact HUD with translucent panels, walking destinations/routes shared by the large map and minimap, the F flashlight, repaired foot continuity when starting/stopping, and a closed stadium exterior shell. Fitted eyes, Alex/Sam hair, medium glasses, calmer materials and client rendering savings remain integrated. Historical N reduced redundant transforms and batched painted car parts; O2 fixed roof collisions and safe character/car recovery and passed 433/433 tests. Current protocol 7 requires matching server/client versions. Historical L2/N/O2 evidence is not substituted for P3's own results.

The working interface supports **Czech and English**, switchable on the landing page and in Settings without restarting the world or disconnecting a session. The choice is saved in this browser; the initial choice follows supported browser languages, falling back to English. Nicknames, chat and player-authored meetup text are preserved. Original reference URLs remain unchanged and may lead to Czech pages. These features are included in P3; future changes require their own checkpoint validation.

The shared world, isolated guest mode, character editing, events, communication, map, journal, traversable B6 model, car, astronomical cycle and demonstration PID traffic are playable. Visual fidelity and Hogwarts Legacy-level character quality are unfinished. That game inspires atmosphere and readability; its assets are not reused. Intended interior scope is dormitory blocks, the training centre, R-ko and the grocery building; other buildings are exterior-only. The detailed B6 interior is complete within its documented reconstruction scope; other permitted interiors are not complete. **Daytime and crowd testing at 60 FPS on GeForce GTX 1060 remains unverified, and full photographic fidelity remains open.** User diagnostics stay local and are not uploaded to the repository. See the [acceptance checklist](docs/acceptance.md).

## Run locally

You need **Git + Git LFS, Node.js 24 and pnpm 11.25.0**. Blender is not needed to play or build; it edits model sources. Large Blender/GLB files use Git LFS. An initial clone contains approximately 2 GB of models, references and documentation before dependencies.

```powershell
git lfs install
git clone https://github.com/Varnahg/StrahovCrazyShow.git
cd StrahovCrazyShow
git lfs pull
pnpm install --frozen-lockfile
pnpm dev
```

If pnpm is missing, install it after Node.js with `npm install --global pnpm@11.25.0`. In an existing clone, start with `git lfs pull`. A GitHub ZIP does not replace a complete LFS clone. A new clone normally selects `main`/L2; newer pilot changes require `codex/pilot-visuals-client-performance` if available in your clone.

Open [http://127.0.0.1:5173/](http://127.0.0.1:5173/). Vite serves the client on **5173**, Colyseus/API on **2567**. The client uses Vite's `/api` and `/realtime` proxies. At this stage the server binds locally. Services can also run in separate terminals:

```powershell
pnpm dev:server
pnpm dev:client
```

Guests can explore with only `pnpm dev:client`. Current weather responses then require the missing server; astronomy, local map data, saved PID schedules and solo activities remain independent of multiplayer.

### Try two players

1. Open the URL in two browsers or separate tabs after starting `pnpm dev`.
2. Choose different nicknames and **Enter the shared world** in both. Each tab receives its own temporary session.
3. Check mutual movement and global chat. Send and accept a contact request before using private messages.
4. Open a third tab with **Explore Strahov solo**. It must not receive multiplayer players or messages.

Everyone in multiplayer shares one world instance. There are no groups of eight. Lower detail for distant avatars and label budgets do not change shared presence. Capacity depends on measured client, server and network performance.

## Controls

| Key / input                   | Action                                                     |
| ----------------------------- | ---------------------------------------------------------- |
| Short left-click              | Select a character or place; capture mouse in first person |
| Drag with either mouse button | Rotate third-person or vehicle camera                      |
| W A S D / arrows              | Walk; accelerate, brake/reverse and steer in the car       |
| Shift                         | Run                                                        |
| Space                         | Jump / vehicle handbrake                                   |
| E                             | Interact; enter or leave the car                           |
| V                             | First / third person; vehicle camera distance              |
| F                             | Toggle flashlight while on foot                            |
| M                             | Map                                                        |
| J                             | Strahov journal                                            |
| G, then 1–4                   | Quick gestures                                             |
| R                             | Safe return to start                                       |
| Mouse wheel                   | Third-person camera distance                               |
| Esc                           | Close menu or release cursor                               |

The car starts near spawn. One player drives the shared vehicle while others see it move. It uses a Rapier dynamic body, four raycast wheels, suspension, speed-dependent steering, brakes and CCD. S brakes first, then reverses after stopping; Space is the handbrake. E exits only after stopping and finding safe space. The parked car remains an obstacle and can be entered again; disconnecting its driver parks it. Mouse view is independent of steering and V changes camera distance. Handling is an arcade interpretation, not an exact vehicle simulation.

## Events, communication and storage

- **Now / Today / This week**, the map, interest filters and event details work without walking around the campus. Built-in events are explicitly **fictional** and follow the current day in Europe/Prague.
- Optional interests and “Open to meeting people”, “First time here” and “Looking for company” help people meet. Avatar position and virtual attendance do not confirm real visits.
- Global chat, nearby chat within 40 m in the same zone, and event chat have server permissions. Private messages require accepted contacts. Mute, block and rate limits are available.
- Players can create, edit and cancel their own fictional meetups. Temporary sessions own them; restarting the server removes them. They are not a real event calendar.
- Appearance, nickname, rewards, rendering preferences and language stay in browser local storage. Multiplayer credentials use session storage. Journal bookmarks and reading progress stay in this browser too. There are no persistent accounts.
- Guests run separately and receive no multiplayer presence or messages, including through public HTTP endpoints.

## Weather, lighting and vegetation

Weather distinguishes a fresh Silicon Hill station observation, model fallback, and stale or unavailable data. Wind direction is meteorological: where wind comes **from**. Astronomy uses the actual UTC instant and Strahov coordinates. Lighting previews are explicitly marked.

The Moon uses the original [NASA LROC surface map](https://svs.gsfc.nasa.gov/4720/). Clouds follow available modelled winds aloft; leaves and grass respond to surface wind. Rain and modelled snow are separate. Lit windows follow a fictional pattern that does not monitor real rooms.

Grass respects mapped surfaces and avoids roads, buildings and artificial turf. Curved blades move with wind and clumps keep away from paving edges. There are 109 individual trees with source-based crowns, three detail levels, CC0 materials and shader-driven foliage. Highest-detail sources stay in Blender. Trunk positions and species are not always verified; the catalogue distinguishes map nodes, photograph interpretation and estimates. This is not a complete real-tree inventory. See the [tree pack](docs/vegetation/realistic-pack.md).

The campus uses 38 documented or interpreted lamps: 36 map points and two orthophoto identifications. The car headlight, B6 interior and nearest lamps share a limited light budget. Intensities are artistic settings, not surveyed lux. Specific clouds, local gusts and room occupancy are not reconstructed from live imagery. See [weather and astronomy](docs/weather/README.md), [night-lighting repair](docs/weather/night-lighting-repair.md) and [headlights](docs/vehicles/headlights.md).

### PID 143 / 149 and passengers

Buses use a downloaded [PID timetable](https://pid.cz/o-systemu/opendata/) and GTFS routes: **143 Dejvická–Stadion Strahov**, **149 Dejvická–Stodůlky-Bavorská**. Saved data is valid **10–23 October 2026**. These are scheduled times, with no actual vehicle positions or delays. Expired data is labelled; normal mode does not loop a fictional timetable.

Both routes share an adapted CC0 generic low-floor bus with separate route/destination displays. Fictional NPCs alight and follow verified exterior paths to derived block entrance thresholds. They are not real passengers or online players. Ambient cars are separately simulated.

Settings lists scheduled arrivals. Guest mode offers a labelled **Preview a bus arrival and passengers** without waiting for a service; it does not change astronomical lighting time or real weather. Refresh local data with:

```powershell
node scripts/fetch-transit.mjs
```

The script can use Python from an installed Blender. See [PID and NPCs](docs/transit/README.md) for licences, models, routes, validity and limitations.

## Maps, references and accuracy

The [interactive atlas](http://127.0.0.1:5173/docs/world-architecture/atlas.html) links building identities, photographs and panorama viewpoints. [Reference documentation](docs/world-architecture/README.md) covers B1–B12, the dining hall, grocery/R-ko building and the Great Stadium ring with an open centre. It has 70 OSM identities, 146 individual CTU photograph links and five documented panorama viewpoints. Every reference has a review status; inclusion does not prove individual photograph localisation. Google Street View, Mapy.com and GeoGuessr are inspection sources, not bulk game-texture downloads.

Footprints and roads: **© OpenStreetMap contributors, [ODbL](https://www.openstreetmap.org/copyright)**. Local coordinates are metres: +X east, +Z south, origin 50.08065 N / 14.39175 E. `pnpm map:fetch` refreshes the basic extract; dependent catalogues and derived layers must then be rebuilt and verified. The [street/source audit](docs/streets/audit.json) distinguishes map geometry from estimated widths.

**Terrain uses ČÚZK DMR 5G**, resampled to a 4 m grid. Roads, paths, crossings, parking and vegetation follow it; physics uses the same triangles. Central asphalt, parking rows and the Silicon Hill inscription are interpreted from IPR orthophotography dated 8 June 2024. Parking positions come from the source; occupancy is simulated. B6 explicitly adapts foundation terrain for its traversable basement and model floors. The northern tennis court has a source-backed local plane and connected terrain; renderer, sampler and collisions share one TIN. Six courts retain separate identities. See [court and diagonal B6 entrance paving](docs/reality-pack/terrain/court-repair/README.md) for sources and uncertainty.

Facades distinguish window walls, stairwell ends, B12, the dining hall, R-ko and open stadium. B6 has a covered northern entrance with 12 exterior steps, reception, two switchback stair cores, corridors and sanitary facilities. Its 210 illustrative bedrooms and 222 model door routes are not a real inventory. Stair materials use a photograph explicitly labelled BLOCK 3; an undimensioned B6 plan supports layout. **This is not a surveyed current B6 interior:** archived room photographs do not always identify their block, and present reception/sanitary areas lack complete photographic confirmation. Other blocks do not have all interiors completed.

Asphalt, paving and ground vegetation use original generic CC0 ambientCG maps with metric UVs. Pilot materials reduce distracting fine contrast, especially at a distance, and adjust normal strength without changing paths, elevations or collisions. Colours and intensities are artistic interpretations rather than measured reflectance. See [pilot materials and provenance](docs/pilot-surfaces-20261011.md).

Characters use continuous CC0 Blender Studio anatomy, GPU skinning, procedural IK and six customisable presets. Separate sewn CC0 MakeHuman garments replace body-coloured clothing; editor and game share one factory. See [anatomy](docs/characters/skinned-anatomy/README.md) and [garments and verification](docs/characters/student-garments/README.md). Fitted shared eyes stay readable through turns and medium LOD. Alex uses `short02`, Sam `short04`, with editor colours, original atlases and glasses fitting. Sam's ear opening follows complete original face sets; medium glasses do not add a full frame to the far silhouette. See [eyes and students](docs/pilot-avatars-20261011.md) and [hair repairs and GPU evidence](docs/pilot-hair-20261011.md).

These are not photogrammetric faces, motion capture or completed Hogwarts Legacy quality. Four other hairstyles and the common face base need work, hair retains some baked lighting, and blinking/full expressions are absent. Each shoe's contact with every stair needs further visual review.

## Blender and models

GLB files load from `public/models/`; editable sources are in `assets/blender/`. Car, furniture and vegetation have reproduction scripts. Furniture shares placement/collision manifests across client and server. Repeated models share geometry.

There are separate `.blend` and GLB archives for 121 buildings. The playable car, 24 parked cars and ambient traffic use the [CC0 hatchback pack](docs/vehicles/README.md): 26 material parts, interior, four separate wheels and near/medium/far detail. The [wheel LOD repair](docs/vehicles/wheel-repair.md) verified closure of all 32 derived wheel parts. The later [near repair](docs/vehicle-pilot-repair-20261011.md) changed one triangle-pair diagonal without moving vertices or changing materials/physics. Original sources and medium/far remain preserved; separate distant wheel-arch/body defects are not fixed by it. Low uses five shared shadow geometries while visible models stay separate. Every car has its own root. Model archives are not an overlapping second layer above native game geometry. See [exports and source IDs](docs/reality-pack/separate-assets/README.md).

```powershell
& 'C:/Program Files/Blender Foundation/Blender 5.2/blender.exe' --background --threads 2 --python scripts/car-master-pack.py
& 'C:/Program Files/Blender Foundation/Blender 5.2/blender.exe' --background --threads 2 --python scripts/create-realistic-car.py
& 'C:/Program Files/Blender Foundation/Blender 5.2/blender.exe' --background --threads 2 --python scripts/create-car-lods.py
pnpm exec tsx scripts/build-car-manifest.ts
& 'C:/Program Files/Blender Foundation/Blender 5.2/blender.exe' --background --python scripts/create-environment.py
& 'C:/Program Files/Blender Foundation/Blender 5.2/blender.exe' --background --python scripts/create-vegetation.py
& 'C:/Program Files/Blender Foundation/Blender 5.2/blender.exe' --background --python scripts/create-bus.py
```

Adjust the Blender path to your installation. Models use metres and glTF Y-up. Furniture dimensions are source-based modelling estimates, not a current B6 inventory. See [environment models](docs/models/README.md) and [bus provenance](docs/transit/README.md).

## Verification and performance

```powershell
pnpm test
pnpm build
pnpm test:integration
```

`pnpm test:integration` **starts its own isolated server on 2568**, runs network scenarios and terminates it. It does not need the main server on 2567. Port 2568 must be free. `pnpm build` checks TypeScript and creates client `dist`; it does not start multiplayer.

Historical L2 passed **372/372 tests, build, isolated integration and a source SHA audit with no mismatches**. See [demo acceptance](docs/releases/demo-2026-10-11.md). Later snapshots have separate results in [verification](docs/verification.md); old success does not automatically cover new changes.

The client reuses grass-selection scratch storage and caches effectively enabled Babylon meshes while preserving instance sources, order, native LOD and object lifecycle. Profiles record render passes and actual GPU context. See [grass selection/CPU study](docs/pilot-render-performance-20261011.md) and [renderer candidates](docs/performance/active-mesh-candidates-20261011.md). Structural checks and fewer allocations alone do not prove higher full-game FPS.

**Public 60 FPS acceptance on the target GeForce in daytime with multiplayer remains open.** Local user diagnostics are not public evidence. M's production GPU series used Intel UHD 630, the full game, HUD and real sessions; it does not prove later snapshots' performance. Hair, glasses and car screenshots are not FPS benchmarks.

**K4:** 352/352 tests, build, isolated integration and SHA audit of 8,066 live + 8,066 frozen files passed without mismatch. [Exact sources and limits](docs/performance/render-order-material-budget-20261011-k4.md). Intel UHD 630 / low / CSS 1920×1080 / internal 1476×830: one daytime avatar 35.6–35.8 FPS; 30 daytime avatars 31.7–32.5 FPS, p95 35.0–40.2 ms; one 30-avatar night sample 35.7 FPS. All seven valid intervals had zero graphics errors. Neither 60 FPS nor strict daytime p95 ≤33.3 ms passed. First SDK run: 29 authority flags; repeat: zero. An interval after the deadline is excluded. Technical PASS does not complete all visual requirements.

**Historical K3 also missed the target:** Intel UHD 630 / low / CSS 1920×1080 / internal 1476×830. One daytime avatar: three runs at 28.2 FPS. Thirty daytime avatars: 25.0 / 26.5 / 27.3 FPS, p95 41.3–52.9 ms; one valid night sample: 27.9 FPS, p95 41.7 ms. All seven valid GPU samples had zero shader/asset errors. The 600-second daytime network run had 30 participants and zero resyncs; the repeated 180-second night run had **58 authority resync flags**, so stable night networking is not claimed. A one-avatar night file after the deadline is excluded from 30-avatar evidence. See [K3 acceptance](docs/performance/shadow-reserve-wheel-repair-20261011-k3.md).

[Historical J](docs/performance/faithful-world-repairs-20261011-j.md) measured about 26 daytime FPS against K3's 28.2 for one player; this was not a strictly isolated GPU A/B with matching weather. Terrain partitioning has geometry/shadow regressions, but new comparable GPU measurements remain open.

Settings provides a ten-second FPS test with frame count, average, p95/p99 frame times, player avatars, resolution and adapter. Low quality lowers internal resolution versus CSS. Repeatable audits need an immutable source snapshot, full HUD, target GPU and recorded weather, lighting and ambient NPCs. NullEngine/CPU checks are not game FPS measurements.

Default **automatic quality** measures actual frame times and adjusts internal resolution and distant-detail budgets. Near surroundings stay detailed; distant buildings/avatars use cheaper representations and grass/B6 furniture have limited ranges. Manual low/medium/high remain fixed. Targets are **60, 120 or 144 FPS**. Rendering has no fixed 60 FPS cap but depends on the display and browser. A short unloaded browser-cadence check avoids needlessly reducing quality on a 60 Hz display with a 144 FPS target. See [principles, budgets and tests](docs/performance/adaptive-quality.md).

Settings reports the **actual GPU renderer**. WebGL's `high-performance` request is a hint; Windows or the browser may choose otherwise. Historical measurements used Intel UHD 630 despite an installed GTX 1060. For the embedded browser, Windows graphics preference applies to Codex and needs an ordinary app restart. See [GPU and display setup](docs/performance/gpu-selection.md). Earlier display diagnostics reported 60 Hz; support for 144 FPS is not a claim that it was measured.

Client and server share collision geometry and fixed **60 Hz** simulation. Server authority, local prediction, input acknowledgement and interpolation separate movement from rendering. The camera checks a sphere against obstacles, animation does not bob the physical root, and labels use the rendered camera frame. Sampled regressions do not prove every possible collision error impossible.

## Architecture and next stage

| Directory                           | Responsibility                                                                 |
| ----------------------------------- | ------------------------------------------------------------------------------ |
| `client/`                           | React interface/localisation, Babylon.js, models, camera and render loop       |
| `server/`                           | One authoritative Colyseus world, temporary sessions, chat, events and weather |
| `shared/`                           | Types, validation, events, maps, ambient traffic and Rapier simulation         |
| `assets/blender/`, `public/models/` | Editable models and game exports                                               |
| `docs/`                             | References, provenance, geometry audits, tests and limitations                 |

IS verification could later precede session issuance without rewriting movement or social features. Persistent accounts, voice, real event imports, an economy, player room furnishing, secured administration and public deployment belong to a later stage. Hardware/network capacity is finite; this demo is not an unlimited MMO.

## Provenance and licences

Sources retain their own licences: OSM/ODbL, IPR and ČÚZK under included attributions, CC0 models/materials under manifests. Start with the [Reality Pack](docs/reality-pack/README.md), [models](public/models/README.md), [characters](docs/characters/student-garments/README.md) and [tree pack](docs/vegetation/realistic-pack.md). Google Maps and other reference photographs are for comparison, not freely reusable game textures. Publishing the repository does not change their licence terms. The project's own code does not yet have a separately chosen open-source licence.
