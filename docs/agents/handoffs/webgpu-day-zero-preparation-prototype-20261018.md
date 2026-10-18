# Předání: webgpu-day-zero-preparation-prototype-20261018

- Vlastník `webgpu-day0-01a14497`, příjemce root. WT `C:/Users/rezac/.codex/worktrees/webgpu-comparison/StrahovCrazyShow`, branch `codex/webgpu-migration`, výchozí HEAD ec74bda. Claim před prvním zápisem; změny pouze vlastní nový cache prefix a tento handoff.
- Výsledek: izolovaný QA overlay dokončen, cíleně ověřen a zmrazen. Bez native/main zápisů, commitu, serveru, instalace, GPU, fullTS/build/fullsuite. Původní frozen kopie a hrané verze zůstaly neměnné.
- Base: `.cache/webgpu-hitch-validation-20261017/b6-coverage-v2`, snapshot `36431c878f1c0c151af4bc259918a108dee60b15d1d294ecb7e6e40ee12ad42b`. `assemble.mjs` ověřil source-manifest SHA všech425kopírovaných client/shared/test/config vstupů. Dependency junction míří na readonly dependencies-v5; přímé Node/tsx s vypnutou diskovou cache.
- Cizí WIP při zahájení: předchozí předaný coverage handoff, root task JSON a hitches-v9 evidence. Nic z toho se nepřebíralo ani nepřepisovalo. BMAD/Linear vede root; leaf nevyvolal další workflow.

## Podklad, varianty a malá změna

Koordinátor doložil na V2 B6 first-F0novýchmodulů/pipeline a max190ms, ale Day preview na spawnu869.2msCPU/29programů/0RTT a3593.8msgap (seq835/842/851). Frozen `art-lighting.ts:419–422` vypíná mapped lampy při night<=.01. Původní day1 startup záměrně drží jeden mapped POINT enabled s intensity0; ten stále mění light defines. Proto day1 nepokrývá denní rodinu bez mapped POINT. Není tím prokázána úplná atribuce všech29programů.

Pouhé OFF je menší varianta, ale nechává zdrojově identifikovanou rodinu SPOT+DIR+HEMI při F venku nebo odchodu z B6. Root zvolil OFF+ON; **ON je zdrojová hypotéza, nikoli již změřený samostatný bug**. Přidány pouze `day-0-off/on` přes původní apply se streetCount0. Žádné nové světlo, shader, cache, actor/rig teleport ani nové IO. Current/spawn pose zůstává skutečná; count0 vypíná mapped street POINT, nikoli libovolná jiná nemapped světla.

Stávající flag byl cíleně přejmenován na `includeDayPointVariants`, protože teď řídí čtyři etapy0/1 OFF/ON. Day a night používají stejný parsing explicitního count. Pořadí je původních8, day0 OFF/ON, day1 OFF/ON, B6 OFF/ON, restore:15etap s B6,13bez B6, WebGL původních9. B6 orbit, camera historie, latest restore/spatial refresh,30s visible deadline, dvě kompletní acceptance draws a pending/fault/final gates se nezměnily.

Inventory má20pojmenovaných položek včetně unassigned a posledního ready. Vyhrazený overflow vyžaduje21slotů. Game explicitní lokální opt-in a profiler hardcap jsou21; default16, entries1024, text32MiB a rows16 zůstávají stejné. Žádné nové profiler hooks nebo export shaderových zdrojů.

## Přesný rozsah a ověření

Nový prefix `.cache/webgpu-migration-checks/day-zero-prototype-20261018/`. Pouze těchto6copied souborů se liší od base:

- `candidate/client/game.ts`
- `candidate/client/light-preparation.ts`
- `candidate/client/webgpu-compilation-profile.ts`
- `candidate/tests/game-light-preparation.test.ts`
- `candidate/tests/light-preparation.test.ts`
- `candidate/tests/webgpu-compilation-profile.test.ts`

Evidence: `assemble.mjs`, `freeze.mjs`, `input-manifest.json`, `overlay-record.json`, konkrétní `client_*.diff`/`tests_*.diff`, `targeted-01.log`. Z425ověřených vstupů se změnilo6souborů; zbývajících419jsou nezměněné kopie. Žádná kopie velkých assets nebo fullworld konstrukce.

Příkaz z candidate: `TSX_DISABLE_CACHE=1 node --import tsx --test --test-concurrency=1 tests/light-preparation.test.ts tests/game-light-preparation.test.ts tests/camera-orbit.test.ts tests/camera-look.test.ts tests/game-startup.test.ts tests/game-webgpu-startup.test.ts tests/webgpu-compilation-profile.test.ts`.

**108/108 PASS**, exit0, runner15.667s, dokončeno18.10.2026 01:02:40UTC. Testy ověřují skutečné scene light membership DIR+HEMI / SPOT+DIR+HEMI bez mapped POINT, následující count1, pending readiness, změny weather/profile/quality/rig/time, restore, timeout i dispose v obou denních párech. Zůstaly camera parity/allocations, bounded actual Rapier clip i obě startup VM. Malý stage-list fixture používá batchSize5, stále kontroluje stejné3renders/10checks pro každou etapu a původní100ms testovací deadline; runtime batching ani30s limit se nemění.

Actual inventory test ověřuje všech20názvů včetně ready, další jméno jde do overflow21. Zachovány default/invalid/fractional/oversized případy, ostatní limity a skutečný privacy roundtrip. Plně naplněný derived inventory test probíhá jak s default16, tak explicit21sloty včetně overflow, maximum16duplicate rows/16names a wire byte limit; žádné shader bodies se nedostanou do exportu.

Refaktoring je omezen na přesné pojmenování variant a sjednocený count parsing. Žádný nový dlouhodobý stav, retain nebo produkční alokace na frame. Všechny vlastní procesy skončily; fixture lifecycle byl uklizen. Podpis přímého testového příkazu v logu není GPU/performance měření.

## Freeze a další krok

`overlay-record.json` SHA256 **681d529fb62d0794b5c4085396a8eca24a23638dcf919b340379e64ffe8930f9**, changedSourceDigest **fd1c6314eb2b1b781a06b287b4fe2bd29efb383c185695ff9923514a5644160f**. Obsahuje source/test SHA a evidence log. Runtime:

- game `983182d6d2870bededa8d4896d40b3127b5ce69571d45bc196f90cd819758a04`
- light-preparation `43fa59c2555ea9f70a9a9f62ad69c686718c420a89938a66c2c3786e0cc3f93b`
- compilation-profile `cbeef371271c44f4e55d7c4aafe3a47f3d1cc123caa254c3817a3f5c6d308876`

Root dostal runtime checkpoint před testy pro paralelní review a finální6file freeze po testech. Po předání uvolněna rezervace stejného ownera, bez stagingu/commitu. Runtime/test inputs se dále nemění během QA.

Root provede fullTS/build, zkontroluje startup proti stále stejnému30s limitu a srovná skutečný Day přechod/F při shodných podmínkách. Dosavadní21.12s příprava není povolení timeout prodloužit. Neověřeny GPU přínos, pixel parity, všechny avatar/LOD/weather/editor/light kombinace ani celý migrační cíl; release není jejich přijetí ani označení KEY-31 Done.
