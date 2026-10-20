# StrahovCrazyShow · playable demo

[Česká verze / Czech version](README.cs.md)

Virtual Strahov in your browser: a source-based campus, a reconstructed B6 interior, customisable characters, one anonymous shared world, fictional events and cooperative activities. You can also explore alone as an isolated guest. There is no IS sign-in, residency check, password or real student profile; a nickname identifies a temporary session.

The main game uses separate building, vehicle and vegetation models. The historical IPR 3D scan remains a spatial reference in a separate viewer. Maps, photographs, terrain data and modelling estimates have different accuracy limits; see the [documentation index](docs/README.md) and [Reality Pack](docs/reality-pack/README.md).

## Run locally

Install **Git + Git LFS, Node.js 24 and pnpm 11.25.0**. Blender is needed only for model authoring. Use a complete LFS clone:

```powershell
git lfs install
git clone https://github.com/Varnahg/StrahovCrazyShow.git
cd StrahovCrazyShow
git lfs pull
pnpm install --frozen-lockfile
pnpm dev
```

If needed, install pnpm after Node.js with `npm install --global pnpm@11.25.0`. In an existing clone, pull its LFS objects before installation/build. A GitHub ZIP does not replace them.

`pnpm dev` runs Vite and the multiplayer/API server. The client normally opens at [http://127.0.0.1:5173/](http://127.0.0.1:5173/), with `/api` and `/realtime` proxied to **127.0.0.1:2567**. Check the URL printed by Vite: it may choose another port if 5173 is occupied. These are development defaults, not a claim that a test build is running. In a shared checkout, follow [agent coordination](docs/agents/README.md) before starting processes or rebuilding a played version.

Run `pnpm dev:server` and `pnpm dev:client` in separate terminals if preferred. Guests can explore with only the client; current weather responses require the server. Astronomy, local map data, saved PID schedules and solo activities are independent of multiplayer.

## Run with Docker

With Git LFS objects present and a running Linux Docker engine:

```sh
docker compose up -d --build
```

The default address is [http://localhost:8080](http://localhost:8080). One container serves the website, API and multiplayer. Graphics run in the player's browser; host Node.js and a server GPU are unnecessary. Restarting resets the temporary world. See the [Docker guide](docs/deployment/docker.md) for configuration, logs, updates and HTTPS hosting.

## Play

Choose **Enter the shared world** in two tabs with different nicknames to try movement and global chat. Private messages require an accepted contact. A third tab using **Explore Strahov solo** must receive no multiplayer players or messages. All multiplayer sessions share one world; there are no groups of eight. Capacity depends on measured client, server and network performance.

The interface and journal support Czech and English, switchable on the landing page and in Settings. The browser saves the choice; initially it uses a supported browser language, otherwise English. Player-authored names, chat and meetup text are preserved.

| Key / input | Action |
| --- | --- |
| Short left-click | Select a character/place; capture mouse in first person |
| Drag with either mouse button | Rotate third-person/vehicle camera |
| W A S D / arrows | Walk; accelerate, brake/reverse and steer in the car |
| Shift | Run |
| Space | Jump / vehicle handbrake |
| E | Interact; enter/leave the car |
| V | First/third person; vehicle camera distance |
| F | Flashlight while on foot |
| M / J | Map / Strahov journal |
| G, then 1–4 | Quick gestures |
| R | Safe return to start |
| Mouse wheel | Third-person camera distance |
| Esc | Close menu or release cursor |

The shared car starts near spawn. S brakes before reversing; E exits after stopping and finding safe space. Disconnecting its driver parks it. Handling is an arcade interpretation.

Events and player-created meetups are fictional, not a real campus calendar. NPC passengers, parking occupancy and lit windows are simulated. PID data is a saved timetable, not live vehicle positions. Weather distinguishes fresh station observations, model fallback and stale data; wind direction says where wind comes **from**. Astronomy uses the actual UTC instant and Strahov coordinates.

Appearance, nickname, rewards, rendering preferences, language and journal progress stay in this browser. Multiplayer credentials use session storage. The server keeps sessions, contacts, messages, meetups and activities in memory; restarting removes that state. There are no persistent accounts. User diagnostics stay local.

## Renderer, verification and limits

**WebGL2 is the default.** WebGPU is an explicit loopback QA option (`?renderBackend=webgpu` or `webgpu-fast`), with no silent backend fallback; see the [migration and acceptance method](docs/performance/webgpu-migration.md). A QA option is not a public default or a performance result.

Client and server must use compatible sources: [the current protocol is 11](shared/netcode.ts), with shared **60 Hz** simulation and authoritative server state. The server sends motion at 20 Hz. Deploy both sides together after shared physics/protocol changes.

```powershell
pnpm check:readme
pnpm test
pnpm build
pnpm test:integration
```

Build checks TypeScript and creates the client `dist`; it does not start a multiplayer server. Integration starts and stops its own server on **2568**, which must be free. Full validation/build/integration in a shared workspace require the [corresponding reservations](docs/agents/README.md). CI runs these gates with LFS checks; Docker has a separate `pnpm test:docker` harness. See the [code map](docs/agents/architecture.md) and [CI guide](docs/agents/ci.md).

The [verification overview](docs/verification.md) records source identities, actual results and historical failures. D2/P5 and their old preview addresses are historical checkpoints. This guide does not identify a currently running test build. Each result applies only to its recorded source ID and test conditions; a baseline pass does not validate later candidates.

Photographic fidelity, all permitted interiors and the daytime/crowd **60 FPS target on GeForce GTX 1060** remain unaccepted as a whole. B6 is a documented reconstruction, not a surveyed current inventory. Other intended interiors are dormitory blocks, the training centre, R-ko and the grocery building; other buildings, including the stadium, are exterior-only. See the [acceptance checklist](docs/acceptance.md) and [performance method](docs/performance/README.md). NullEngine, CPU tests and one HUD number do not establish GPU performance.

## Sources and licences

Footprints/roads: **© OpenStreetMap contributors, [ODbL](https://www.openstreetmap.org/copyright)**. Terrain uses ČÚZK DMR 5G; IPR imagery and reference photographs have their own attributions. Coordinates are metres, +X east and +Z south, with origin 50.08065 N / 14.39175 E. Rendering and collision use shared spatial data.

Start with the [Reality Pack](docs/reality-pack/README.md), [building/model review](docs/model-review/README.md), [model licences](public/models/README.md), [characters](docs/characters/student-garments/README.md), [vegetation](docs/vegetation/realistic-pack.md) and [PID provenance](docs/transit/README.md). Reference images are not freely reusable game textures. Publishing the repository does not change third-party licences; the project's own code has no separately selected open-source licence.
