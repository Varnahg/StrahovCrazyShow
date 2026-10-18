# Předání: webgpu-b6-coverage-completion-prototype-20261018

- Vlastník `webgpu-b6-completion-01a14497`; příjemce root. WT `C:/Users/rezac/.codex/worktrees/webgpu-comparison/StrahovCrazyShow`, branch `codex/webgpu-migration`, při claim HEAD ce8415889cd67dbaa111bd6526d3bfe057c343bd. Claim získán před zápisem, heartbeat obnoven.
- Výsledek: izolovaný QA overlay dokončen a zmrazen pro review/fullTS/build/GPU koordinátorem. Žádný native/main runtime zápis, commit, instalace, server, GPU ani celý world CPU scénář.
- Read-only základ frozen a94 `b6-preparation-v1`, snapshot `a94ea6ced62b1aa5a3e7c5f94aa4884cce83f30bb5063cda2e4e126507f4eb78`. Nový vlastní prefix `.cache/webgpu-migration-checks/b6-coverage-completion-prototype-20261018/`; `assemble.mjs` ověřil proti source-manifest všech422kopírovaných source/test/config souborů. `node_modules` junction míří na readonly dependencies-v5. Původní a94, předchozí pilot i CPU proofy neměněny.

## Rozhodnutí a implementace

Root vybral menší variantu B z avatar CPU proofu: původní spawn `apply(day, torch, 1)` s jedním skutečným mapped POINT, OFF i ON. Oba stavy jsou potřebné kvůli doloženým OFF missům při vstupu. Nezavádí nový B6+spawn režim, avatar/actor teleport ani cache. Stávající B6 pár místo flat view používá jeden source-derived clipped orbit z entry proofu, který zachoval8/8malých GLB a přidal konkrétní `b6 dogleg floor 0 entry-metal` a concrete treads.

WebGPU s B6 vlastníkem má13etap včetně restore: původních8 + day-1 OFF/ON + B6-day OFF/ON + restore. WebGPU bez B6 má11, WebGL původních9. Nový denní pár používá původní mapped-lamp výběr/budget, bez změny skutečného gameplay svícení. Deadline30s, dvě complete ready draws, pipeline/effect/health gates a finální submit/readiness gate zůstaly stejné.

Nový `camera-orbit.ts` sdílí pouze původní čisté target/desired výpočty; distance8 je společná konstanta, dosavadní pitch.28 se exportuje z camera-look. Běžný CameraFollow zachovává původní clamp, cameraArm smoothing, oba cameraDistance dotazy, snap, první osobu a počty Vector3 alokací. B6 odvozuje body z layout landing/foundation a yaw z approachRoute; s pevnými původními orbit defaults používá skutečný read-only `sim.cameraDistance(target, desired, actor)`. Přepisuje jen camera.position/target, nikoli Game pitch/yaw/distance/cameraArm/vehicleCameraSnap/actor. Controller a environment anchor zůstávají B6 body; původní saved camera/leaveB6 a latest-request restore pokračují.

Existující opt-in Game inventory žádá maxStages20, jiné limity nemění. Actual-profile RED doložil interní clamp na16, root proto výslovně rozšířil task o jediný řádek profileru: default16 zůstává, pouze explicitní maxStages se clampuje2..20. Žádné nové hooks, shader transformace nebo diagnostická vrstva.

## Přesné změněné cesty

Všechny následující jsou pod vlastním `candidate/`, nikoli native checkout:

- Runtime: `client/game.ts`, `client/light-preparation.ts`, `client/camera-look.ts`, nový `client/camera-orbit.ts`, `client/webgpu-compilation-profile.ts`.
- Testy: `tests/game-light-preparation.test.ts`, `tests/light-preparation.test.ts`, `tests/webgpu-compilation-profile.test.ts`, nový `tests/camera-orbit.test.ts`, nový `tests/fixtures/camera-follow-before-orbit.ts.txt`.
- Fixture obsahuje přesný původní a94 CameraFollow method text se source SHA, nikoli nově napsaný ekvivalent. Nutné VM bindings doplněny jen v game-light-preparation.
- Vlastní evidence/scripts: `assemble.mjs`, `create-parity-fixture.mjs`, `freeze.mjs`, `input-manifest.json`, `runtime-checkpoint.json`, `overlay-record.json`, konkrétní `client_*.diff`/`tests_*.diff` a čtyři logy uvedené níže; tento handoff.

Výchozí dirty soubory byly předané handoffy obou CPU proofů a root task JSON; během práce root měnil katalog/evidenci. Nic z toho nebylo převzato nebo přepsáno tímto taskem.

## Ověření a refaktoring

Přímé příkazy v candidate, vždy `TSX_DISABLE_CACHE=1`, bez pnpm:

- `node --import tsx --test --test-concurrency=1 tests/light-preparation.test.ts tests/game-light-preparation.test.ts tests/camera-orbit.test.ts tests/camera-look.test.ts tests/game-startup.test.ts tests/game-webgpu-startup.test.ts`: **72/72 PASS**, exit0, 13.815s, dokončeno18.10.2026 00:29:57UTC; `targeted-02.log`.
- `node --import tsx --test tests/webgpu-compilation-profile.test.ts`: **35/35 PASS**, exit0, .831s test runner, dokončeno00:33:10UTC; `inventory-02.log`.
- Targeted matice:128kombinací přesných starých/nových follow metod s porovnáním výsledku, kolizních query arguments, pitch/arm/snap a alokačního počtu; skutečná Babylon projection A/D/first-person; skutečný Rapier sweep přes57kanonických entry colliderů; day OFF/ON, original mapped lamp selection, pozdní settings/rig replacement, B6 asset/controller revision, pending effects, readiness, timeout/dispose a restore.
- Inventory: všech18labelů včetně unassigned/construction/assets/restore/submitted/ready, skutečný overflow po naplnění20, default16, explicit20, oversized999, fractional a invalid hodnoty, stejné ostatní hardcaps a původní privacy/sanitizer assertions.
- Zachované neúspěchy: `targeted-01.log`44/45 (nový13stage fixture potřebuje91ticků, starý testovací finish dovoloval90; opraven jen nový test jedním úvodním tickem, deadline se nezvyšoval). `inventory-01.log`33/34 skutečný RED pro clamp16, před schváleným profile fixem. Tyto běhy nejsou vydávány za PASS.
- Refaktoring sjednotil orbit geometrii/defaults a ponechal historii/IO v původním vlastníkovi. Stage volby používají jeden finální seznam. Žádná nová per-frame cache, retain nebo runtime callback vlastnictví. Test fixtures uklízejí scény, engine, světla, observables a izolovaný Rapier world.

## Freeze a předání

`overlay-record.json` SHA256 **8b20233b973720717e13f50f665f5ae99d9b3ebcfddb7f31fb7c1c94340e44ee**, changedSourceDigest **c95675e663ffc013aee414284a312d414c589f674eaf674a46ceba6c0d3810cf**. Obsahuje všech10změněných source/test/fixture cest, původní SHA i finální SHA, logy a assembly provenance. Runtime:

- game `8cc4de0cc0e5c188fb8073bdfffcdad687e4f209cac96bd322437f00f26786e5`
- light-preparation `c2ab44478bb12568a2ee05b72b9e487f4625d0f1bee55238eb09a4088cc7eaae`
- camera-look `bcc1bb1a43dc4042ab0175910e39ffb41913b9d46950fc15cebeaeb8f70f4449`
- camera-orbit `8b6a32e02c9b090ca3bf165627044fda39f68706c4a416997f7648ed083ba163`
- compilation-profile `0f4fb08c44c3efa405b7b3bef2d8833c66299a951722ab0bed7fe2d61dd0f6c0`

Root dostal předběžné4runtime diffy pro paralelní review a finální pátý checkpoint po actual-profile opravě. Všechny vlastní příkazy skončily; žádný proces/port nezůstává. Po předání uvolněna rezervace téhož ownera; release není přijetí výkonové opravy. Další source/test změna vyžaduje nový koordinovaný followup, frozen inputs se nepřepisují během QA.

Otevřené limity: CPU důkazy jsou NullEngine/GLSL a bounded IO, nikoli WGSL/pixel/occlusion/performance přejímka. Production full-world collision může pohled zkrátit jinak; editor transform, další avatar/LOD/weather/time kombinace nejsou pokryté. Podporované source-derived body je stále odhadová geometrie původního layoutu, nikoli zaměření. Žádný příslib odstranění celých1.9s nebo každého F/time hitches. Root vlastní fullTS/build, GPU obraz/paritu, startup cenu, first-F měření, timeout chování na zařízení a následnou integraci/Linear/BMAD.
