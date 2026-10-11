# StrahovCrazyShow · playable demo

[Česká verze / Czech version](README.cs.md)

Virtual Strahov in your browser: a student campus based on maps, orthophotography and real terrain elevations, a reconstructed B6 interior, a customisable character, an anonymous shared world, fictional events and cooperative activities. Building exteriors, path connections and traversable spaces use common source data. The [Reality Pack](docs/reality-pack/README.md) connects review previews, photographs, Blender models and documented accuracy limits.

**The main game uses separate models with documented provenance.** The historical IPR 3D scan is a spatial reference with a separate viewer; its merged trees, cars and surfaces are not loaded into the game. Buildings, cars, trees and courts have individual identities and transforms. See [building models](docs/reality-pack/separate-assets/README.md), [individual trees](docs/vegetation/realistic-pack.md) and [model and terrain review](docs/model-review/README.md).

The demo has no IS sign-in, residency verification or real student profiles. A nickname identifies a temporary session only. Access is not restricted to Strahov residents. Public deployment is outside this version's scope.

## Current version

The `main` branch contains development demo 0.1.0 for local use. It builds on verified checkpoint K4 with road markings, smoother walking and running, spatial partitioning of static terrain and corrected building-foundation orientation. The [acceptance record for this version](docs/releases/demo-2026-10-11.md) identifies the exact tested sources, results and limitations.

The anonymous shared world, isolated guest mode, character editing, events and communication, map and journal, traversable B6 model, car controls, astronomical cycle and demonstration PID traffic are implemented. Visual fidelity, all interiors and character quality comparable to Hogwarts Legacy are unfinished. New studies of anatomical eyes, hair and photographic grass are not yet part of the game renderer. See the [acceptance checklist](docs/acceptance.md) for the detailed status of requirements.

## Run locally

You need **Git + Git LFS, Node.js 24 and pnpm 11.25.0**. Blender is not needed to play or for a normal build; it is used to edit model sources. Large Blender/GLB files use Git LFS; other game data is stored directly in the repository. The initial clone is therefore substantial: approximately 2 GB of models, references and documentation before installing dependencies.

Clone and run for the first time in PowerShell or a terminal:

```powershell
git lfs install
git clone https://github.com/Varnahg/StrahovCrazyShow.git
cd StrahovCrazyShow
git lfs pull
pnpm install --frozen-lockfile
pnpm dev
```

If `pnpm` is missing, install it after Node.js with `npm install --global pnpm@11.25.0`. In an existing clone, start with `git lfs pull`. A GitHub ZIP does not replace a complete clone with LFS models.

Open [http://127.0.0.1:5173/](http://127.0.0.1:5173/). Vite serves the client on **5173**, and the Colyseus/API server runs on **2567**. The client uses Vite's `/api` and `/realtime` proxies. At this stage the server binds to the local computer.

To start the services separately, use two terminals:

```powershell
pnpm dev:server
pnpm dev:client
```

A guest can also explore with only `pnpm dev:client` running. Without the server, current weather responses are unavailable; the astronomical cycle, local map data, saved PID timetable and solo activities remain independent of multiplayer.

### Try two players

1. Run `pnpm dev` and open the URL in two browsers or two separate tabs.
2. Choose different nicknames and select **Vstoupit do společného světa** (Enter the shared world) in both. Each tab receives its own temporary session.
3. Check mutual movement and global chat. For private messaging, first send and accept a contact request.
4. Open a third tab with **Prohlédnout si Strahov sám** (Explore Strahov solo): multiplayer players and messages must not appear there.

All multiplayer participants share one world instance. There are no groups of eight. Distant characters may use lower visual detail, and labels have their own budget; neither changes shared presence. Actual capacity depends on measured client, server and network performance.

## Controls

| Key / input | Action |
| --- | --- |
| Short left-click | Select a character or place; capture the mouse in first person |
| Drag with left / right mouse button | Rotate the third-person or vehicle camera |
| W A S D / arrow keys | Walk; accelerate, brake/reverse and steer in the car |
| Shift | Run |
| Space | Jump; vehicle handbrake |
| E | Nearby marker or task; enter / leave the car |
| V | First / third person |
| M | Map |
| J | Strahov journal |
| G, then 1–4 | Quick gestures |
| R | Safe return to the start |
| Mouse wheel | Third-person camera distance |
| Esc | Release the cursor for the interface |

The car starts near the spawn. One player can drive the shared vehicle while others see its movement. It uses a dynamic Rapier body, four raycast wheels, suspension, speed-dependent steering, brakes and CCD. S first brakes, then reverses after stopping; Space applies the handbrake. E allows exit only after stopping and finding free space. After the driver exits, the car remains as an obstacle and can be entered again; disconnecting the driver parks it. Mouse view is independent of steering, and V changes vehicle camera distance. Handling is an arcade interpretation for the campus, not an exact automobile simulation.

## Events, communication and storage

- **Teď / Dnes / Tento týden** (Now / Today / This week), the map, interest filters and event details work without walking around the 3D campus. Built-in events are explicitly labelled **fictional** and follow the current day in Europe/Prague.
- Optional interests and the states “rád se seznámím” (open to meeting people), “jdu poprvé” (first time here) and “hledám společnost” (looking for company) help people join events. Virtual attendance and avatar position do not confirm real visits.
- Global chat, nearby chat within 40 m in the same zone, and event chat have server-side permissions. Private messages require accepted contacts. Mute, block and message-rate limits are available.
- The creator of a demo meetup can edit and cancel it. Ownership belongs to a temporary session, not a verified person.
- The scavenger challenge shares multiplayer progress; the team quiz uses server time. Guests have their own exploration, scavenger hunt and B6 delivery task. Cosmetic badges have no economy.

Appearance, nickname and earned cosmetic rewards are stored in browser `localStorage`. The multiplayer session token is in that tab's `sessionStorage`. The server temporarily holds presence, contacts, blocks, attendance, new meetups and activities in memory. A session can be resumed within 30 minutes of disconnecting; restarting the server removes temporary state. Chat history is not restored after reconnecting.

Guests do not connect to multiplayer channels. Direct requests to create a guest multiplayer session are rejected. Public `/api/health` returns only `{ok:true,demo:true}`, without player counts or a world identifier. Public demo events and weather are not private multiplayer state.

## Weather, sky and a livelier campus

The [Silicon Hill weather station](https://weather.sh.cvut.cz/weather/) supplies temperature, surface wind and precipitation intensity. The server refreshes source data at most once every five minutes. [Open-Meteo](https://open-meteo.com/en/docs) supplies modelled cloud cover and winds at several altitudes; if the station is unavailable or stale, it provides a labelled surface-weather fallback. Observations and model data have separate timestamps and freshness status. Source failures are not presented as live calm or dry conditions.

Sun and Moon positions are calculated for the real date and Strahov coordinates. The Moon uses its phase, illuminated-edge orientation and a locally stored [NASA LROC surface map](https://svs.gsfc.nasa.gov/4720/). Clouds follow available modelled winds aloft; leaves and grass respond to surface wind. Rain and modelled snow are separate. Some windows light up after dark according to a fictional pattern that does not monitor real rooms.

Grass respects mapped surface types and avoids roads, buildings and artificial turf. Curved blades respond to wind, and clumps keep away from actual paving edges. There are 109 individual trees with geometry based on their source crowns, three detail levels, CC0 materials and shader-driven foliage. Highest-detail sources remain in Blender. Trunk positions and botanical species are not always verified; the catalogue distinguishes map nodes, photograph interpretation and estimates. This is not a complete inventory of real trees. See the [tree pack](docs/vegetation/realistic-pack.md).

The campus uses 38 documented or interpreted lamps: 36 map points and two orthophoto identifications. Night follows the actual astronomical instant; the driven car's headlight, B6 interior and nearest lamps share a limited light budget. Intensities are artistic parameters, not surveyed lux values. Specific clouds, local gusts and actual room occupancy are not reconstructed from live imagery. See [weather and astronomy](docs/weather/README.md), [night-lighting repair](docs/weather/night-lighting-repair.md) and [headlights](docs/vehicles/headlights.md).

### PID 143 / 149 and passengers

Buses use a downloaded [PID timetable](https://pid.cz/o-systemu/opendata/) and GTFS road routes: **143 Dejvická–Stadion Strahov**, **149 Dejvická–Stodůlky-Bavorská**. Saved data is valid **10–23 October 2026**. These are scheduled times, without actual vehicle positions or delays. Expired data is labelled, and normal mode does not repeat a fictional timetable.

Both routes share an adapted downloaded CC0 generic low-floor bus, with different route numbers and destinations on the displays. A variable number of fictional NPCs alight at each arrival. They follow verified exterior paths to derived block entrance thresholds; they are not real passengers or online players. Cars form separate fictional ambient traffic.

**Nastavení** (Settings) lists scheduled arrivals. Guest mode offers a labelled **Ukázka příjezdu a cestujících** (Preview a bus arrival and passengers), so there is no need to wait for a service. It does not alter astronomical lighting time or actual weather. Refresh local data with:

```powershell
node scripts/fetch-transit.mjs
```

The script can use Python bundled with an installed Blender. See [PID and NPCs](docs/transit/README.md) for licences, the model, passenger routes, validity and limitations.

## Maps, references and accuracy

The [interactive atlas](http://127.0.0.1:5173/docs/world-architecture/atlas.html) connects building map identities, individual photographs and panorama viewpoints. [Reference documentation](docs/world-architecture/README.md) covers B1–B12, the dining hall, grocery/R-ko building and the separate Great Stadium ring with an open centre. The catalogue has 70 OSM identities, the photograph index has 146 individual CTU links, and the panorama survey has five documented viewpoints. Each reference has its own review status; including a link does not mean that its photograph has been individually located. Google Street View, Mapy.com and GeoGuessr are inspection references; their imagery is not downloaded in bulk as game textures.

Basic footprints and roads: **© OpenStreetMap contributors, [ODbL](https://www.openstreetmap.org/copyright)**. Coordinates are a local approximation in metres: X east, Z south, origin 50.08065 N / 14.39175 E. `pnpm map:fetch` refreshes the basic map extract; dependent catalogues and derived layers must then be rebuilt and verified according to their documentation. The [newer street/source audit](docs/streets/audit.json) distinguishes map geometry from estimated widths; integration of that layer is verified separately.

**Terrain is based on ČÚZK DMR 5G**, resampled to a 4 m grid. Roads, paths, crossings, parking and vegetation follow this relief; physics uses the same triangles. Central asphalt, parking rows and the Silicon Hill inscription are interpreted from IPR Prague orthophotography dated 8 June 2024. Parking positions come from the source, while occupancy is simulated. B6 explicitly adapts foundation terrain for its traversable basement and model floors. The northern tennis court uses a source-backed local plane with connected terrain; rendering, sampling and collisions share one TIN. Six separate courts retain their map identities. The [court and diagonal B6 entrance paving](docs/reality-pack/terrain/court-repair/README.md) document both sources and uncertainty.

Facades distinguish long window walls, stairwell ends, B12, the dining hall, R-ko and the open stadium. B6 has a covered northern entrance with 12 exterior steps, reception, two switchback stair cores, corridors and sanitary facilities. Its 210 illustrative bedrooms and 222 model door routes are not a real inventory. Interior stair materials use a photograph explicitly labelled BLOCK 3; an undimensioned B6 diagram supports the layout. **This is not a surveyed current B6 interior:** archived room photographs do not always identify their block, and current reception and sanitary areas are not fully confirmed by photography. Other blocks do not have all interiors completed.

Characters use continuous CC0 Blender Studio anatomy, GPU skinning, procedural IK and six customisable presets. Separate sewn CC0 MakeHuman garments replace the original close-fitting body-coloured clothing; the editor and game share one factory. See [anatomy](docs/characters/skinned-anatomy/README.md) and [current garments and verification](docs/characters/student-garments/README.md). These are not photogrammetric faces, motion capture or completed Hogwarts Legacy quality. Hair is provisional, expressions are limited, and each foot's contact with every stair needs further visual review.

## Blender and models

The game loads GLB files from `public/models/`; editable sources are in `assets/blender/`. The car, eight furniture items/bench and vegetation have reproduction scripts. Furniture uses the same placement and conservative collision manifest on client and server. Models load once, and repeated instances share geometry.

There are separate `.blend` and GLB archives for 121 buildings in `assets/blender/buildings/` and `public/models/buildings/`. One playable car, 24 parked cars and ambient traffic use the [CC0 hatchback pack](docs/vehicles/README.md): 26 material parts, an interior, four separate wheels and near/medium/far detail. The [wheel LOD repair](docs/vehicles/wheel-repair.md) verified closure of all 32 derived wheel parts and preserved the highest-detail near/master and car body. Low quality uses five shared shadow geometries; visible models remain separate. Each car has its own root and shares immutable geometry. Model archives are not added as an overlapping second layer above native game geometry. See [verified exports and source IDs](docs/reality-pack/separate-assets/README.md).

```powershell
& 'C:/Program Files/Blender Foundation/Blender 5.2/blender.exe' --background --threads 2 --python scripts/car-master-pack.py
& 'C:/Program Files/Blender Foundation/Blender 5.2/blender.exe' --background --threads 2 --python scripts/create-realistic-car.py
& 'C:/Program Files/Blender Foundation/Blender 5.2/blender.exe' --background --threads 2 --python scripts/create-car-lods.py
pnpm exec tsx scripts/build-car-manifest.ts
& 'C:/Program Files/Blender Foundation/Blender 5.2/blender.exe' --background --python scripts/create-environment.py
& 'C:/Program Files/Blender Foundation/Blender 5.2/blender.exe' --background --python scripts/create-vegetation.py
& 'C:/Program Files/Blender Foundation/Blender 5.2/blender.exe' --background --python scripts/create-bus.py
```

Adjust the Blender path to your installation. Models use metres and glTF Y-up. Furniture dimensions are modelling estimates from references, not an inventory of current B6. See [environment models](docs/models/README.md) and [bus provenance](docs/transit/README.md).

## Verification and performance

```powershell
pnpm test
pnpm build
pnpm test:integration
```

`pnpm test:integration` **starts its own isolated server on 2568**, runs network scenarios and terminates its process. It does not need the main server on 2567. Port 2568 must be free. `pnpm build` checks TypeScript and creates client `dist`; building alone does not start multiplayer.

Current checkpoint L2 passed **372/372 tests, build, isolated integration and a source SHA audit with no mismatches**. See [demo acceptance](docs/releases/demo-2026-10-11.md). The following GPU results belong to historical K4; they do not measure the newer terrain and animation changes.

**K4 passed 352/352 tests, build, isolated integration and a SHA audit of 8066 live + 8066 frozen files with no mismatch.** See [K4: exact sources, results and limitations](docs/performance/render-order-material-budget-20261011-k4.md). Intel UHD 630 / low / CSS 1920×1080 / internal 1476×830: one daytime avatar 35.6–35.8 FPS; 30 daytime avatars 31.7–32.5 FPS, p95 35.0–40.2 ms; one 30-avatar night sample 35.7 FPS. All seven valid intervals had zero graphics errors. Neither 60 FPS nor the strict daytime p95 ≤33.3 ms target was met. The first SDK run had 29 authority flags, the repeated run zero; an interval after the deadline is excluded. Technical PASS does not complete all visual requirements. Historical checkpoints remain in [verification](docs/verification.md).

**Historical K3 GPU measurements on Intel UHD 630 missed the performance target:** low, CSS 1920×1080 / internal 1476×830; one daytime avatar at 28.2 FPS in three runs; 30 daytime avatars at 25.0 / 26.5 / 27.3 FPS and one valid night sample at 27.9 FPS. Daytime p95 with 30 avatars was 41.3–52.9 ms, and night p95 was 41.7 ms. Neither the 60 FPS target nor the strict 30 FPS / p95 ≤33.3 ms threshold passed. All seven valid GPU samples had zero shader and asset errors. The 600-second daytime network run had 30 participants and zero resyncs; the repeated 180-second night run had **58 authority resync flags** and is not claimed as stable night networking. A transient night file with only one avatar after the deadline is excluded from 30-avatar evidence. See [complete K3 acceptance and limitations](docs/performance/shadow-reserve-wheel-repair-20261011-k3.md).

[Historical J measurements](docs/performance/faithful-world-repairs-20261011-j.md) show approximately 26 daytime FPS versus K3's 28.2 for one player; this is not a strictly isolated GPU A/B with identical weather. User-initiated measurements remain local and are not public repository evidence. Spatial terrain partitioning has geometry and shadow regressions; new comparable GPU measurements remain open.

Settings offers a ten-second FPS test with frame count, average, p95/p99 frame times, player-avatar count, resolution and adapter identification. Low quality lowers internal resolution relative to the CSS viewport. Repeatable audits require an immutable snapshot, full HUD, target GPU and recorded weather, lighting and ambient NPCs. NullEngine geometry and CPU checks are not game FPS measurements.

Default **automatic quality** evaluates actual frame times, gradually changing internal resolution and a shared distant-detail budget. Nearby surroundings remain more detailed; distant facades and avatars use cheaper representations, while grass and B6 furniture have limited ranges. Manual low/medium/high settings do not change themselves. Targets are **60, 120 or 144 FPS**. The render loop has no fixed 60 FPS cap; actual cadence also depends on the display and browser. Before rendering the world, a short unloaded browser-cadence check avoids needless quality reduction on a 60 Hz display when targeting 144 FPS. See [principles, budgets and tests](docs/performance/adaptive-quality.md).

Settings reports the **actual GPU renderer**, not merely a list of installed cards. WebGL requests `high-performance`, but the browser or Windows may choose otherwise. Measurements on this computer selected Intel UHD 630 despite an installed GTX 1060. For the embedded browser, set Windows graphics preference for Codex and restart the application normally. See [verified GPU and display-refresh setup](docs/performance/gpu-selection.md). The active display reported 60 Hz; support for 144 FPS rendering does not mean 144 FPS was measured.

Client and server share collision geometry and a fixed **60 Hz** simulation. The server is authoritative; local prediction, input acknowledgement and temporal interpolation separate movement from render frequency. The camera checks a sphere against obstacles, animation does not bob the physical root, and labels use the same rendered camera frame. Sampled terrain and collision regressions do not prove every possible error impossible.

## Architecture and next stage

| Directory | Responsibility |
| --- | --- |
| `client/` | React interface, Babylon.js, models, camera and render loop |
| `server/` | One authoritative Colyseus world, temporary sessions, chat, events and weather adapter |
| `shared/` | Types, validation, events, map, public ambient traffic and Rapier simulation |
| `assets/blender/`, `public/models/` | Editable models and game exports |
| `docs/` | References, provenance, geometry audits, tests and known limitations |

IS verification could later be added before issuing a game session without rewriting movement and social features. Persistent accounts, voice, real community-event imports, an economy, player room furnishing, secured administration and public deployment belong to a later stage. The shared world has finite hardware and network capacity; this demo is not an unlimited MMO.

## Provenance and licences

Source data and imported models retain their own licences: OSM/ODbL, IPR and ČÚZK under included attributions, and CC0 models/materials under their manifests. Start with the [Reality Pack](docs/reality-pack/README.md), [models](public/models/README.md), [characters](docs/characters/student-garments/README.md) and [tree pack](docs/vegetation/realistic-pack.md). Google Maps and other authors' reference photographs are for comparison, not freely reusable game textures. Publishing the repository does not change their original licence terms. The project's own code does not yet have a separately chosen open-source licence.
