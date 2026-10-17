# Izolovaný combined Game/UI candidate

## C5: aktualizace 17. 10. 2026

- Vlastník `webgpu-mig-01a14497-c5-game`, příjemce root. Claim nad HEAD `8363c7603028a5a11b2f3d54f7a702c34ccfb608`; před implementací znovu načteny primární AGENTS/BMAD policy/spec KEY-39, task a živý registr. Konkrétní podagent další BMAD workflow nespouštěl. Zápis pouze do nového `.cache/webgpu-migration-checks/combined-game/c5/` a tohoto předání; primary, WT runtime, native-v12/native-v16 i combined-v4 zůstaly read-only.
- Přesné třícestné vstupy: base native-v12 `dc293902fd47072fc784fa4e7c9f04e816e2ec00` / snapshot `cbbca97e164ae6a7f0c756bd8d4b97e81e3bed8b984f308e05cc20f56d63b55c`; foreign combined-v4 `1383fc9296d70d256ead4c6df0ac87892cdcd522426272bc8e7288613266f277`; own native-v16 `8363c7603028a5a11b2f3d54f7a702c34ccfb608` / snapshot `f1d6c2bdd58f6c73fbaeec1f0b6326a4bda9e4c04449bc112cdd05ad609f4397`. `c5/inputs.json` a `inputs/{base,foreign,own}/` obsahují16 raw vstupů k šesti výstupům; všechny16 hashe souhlasí s manifesty i se zdroji při závěrečném auditu.
- Před zápisem porovnány vlastní v12→v16 a cizí C4 změny. Game má6 textových konfliktů, UI čistý merge, oba startup/UI testy po1 konfliktu. Volba: zachovat C4 orchestrace/telemetrii a doplnit ověřené native guardy; nahrazení celého Game nebo použití jediné strany konfliktu by odstranilo ownership či ochranu před dalším renderem. Původní conflict výstupy zůstávají v `c5/merges/`; `diffs/*.vs-foreign.patch` a `*.vs-own.patch` oddělují obě provenience.
- Runtime merge zachovává phased `start/startContent`, world resource adoption a cancellation, deferred presence, persistent editor, rozšířenou frame/mesh diagnostiku i optional benchmark profile. Přidal oba lokálně gated shader inventory flagy/stages, terminální callback s `finally`, samostatně chráněný `worldBuildJob.cancel`, input/UI/resize/quality/avatar guardy a `isRetired` pro light preparation/restore. Foreign `render-error`, `avatar-change` a quality draw-sample evidence zůstala; `benchmark?.profile?.dispose()` respektuje C4 volitelný profil.
- Fixture merge zachovává obě sady vlastnických a terminálních testů. Foreign-only `game-startup.test.ts` doplnil `compilationProfile.setStage` a dvě RAF/GPU I/O metody `_processFrame/endFrame`, které nyní sleduje skutečný RenderHealth; nejde o kopii jeho guardu. Nové fixture metody neslouží jako GPU důkaz. AST audit neodebral žádný Game member; změněných je přesně11 očekávaných members, všechny ostatní mají po sjednocení CRLF/LF shodný text s C4. Statická deklarace všech C4 i native testů v předávaných testových souborech zůstala přítomná.
- `c5/tests-v1.log`:67/81 PASS,14 FAIL kvůli chybějícím stagingovým server/scripts importům a původnímu fake enginu bez nových hooků. Zachováno jako neúspěšná fixture/staging kontrola, **nikoli runtime RED**. Po doplnění read-only kopií a fixture: `c5/tests-v2.log` **86/86 PASS**, exit0,~5.5s; sedm souborů Game startup/WebGPU/UI/light preparation/light lifecycle/diagnostics/room callbacks. `c5/types-v1.log`: scoped strict TypeScript pro9 kořenů, **3513 souborů/0 diagnostics**, exit0. Po testech změněno jen odsazení foreign effect telemetry v try; finální TS/audit již pokrývají tento text. Žádné full suite/build/integration/GPU/server/install nebyly spuštěné.
- Pro lehké ověření je v `c5/candidate/` kopie C4 s nezávislými native-v16 deltami; závislosti, public/assets/docs jsou pouze čtené junctiony. Peer-owned preview ve stagingu zůstalo C4: finální C5 musí root sestavit se samostatně předaným preview výsledkem. První staging se zastavil před vlastním merge na peer preview konfliktu a zůstal jako `initial-staging-stopped-before-merges`; nic z něj se nepublikuje.
- Finální manifest `c5/candidate-manifest.json` SHA256 **`38fe01a3a323f73e05f5d12a9bfbdac223fa96663b870a12c3ee16f3815a8c20`**. Přenášet jen níže uvedených šest souborů z `c5/candidate/`, nikoli staging strom či historický candidate. Není to čistá native změna ani přijetí cizího feature do main.

| C5 výstup | SHA256 |
|---|---|
| `client/game.ts` | `462d127ece6762e6180d6a815b461fd5226be708e25dbf4affb188e6021d5ffe` |
| `client/ui.tsx` | `f417a1466c0ec321c0e0753d365384a0ad8a1554e31e3771d00eab4897aabe36` |
| `tests/game-render-engine.test.ts` | `606c040d929b6c70ce73a9d6e5729ed0457773511cd5a289a1a343850cedf73a` |
| `tests/game-webgpu-startup.test.ts` | `e462f1277a8e9f79bc8176a442684a5aaefccd2990f6cd9d1f7f1db95cfb32f0` |
| `tests/game-light-preparation.test.ts` | `c2653e75483b4f541bc274b27152207c9e5f886c891c8dc5785da9ddeee608a4` |
| `tests/game-startup.test.ts` | `ace7cad67ce763bf6f433125a18f2763854b641efe191fecc23db4c1a53daf03` |

Všechny vlastní CPU procesy skončily; nic není staged ani commitované. Root přebírá review, handoff-only commit a následné společné ověření/integraci. Rezervace se po tomto předání uvolní; release není Done ani GPU přejímka.

## Historický C1 kandidát

- Vlastník `webgpu-mig-01a14497-combined-game`; příjemce root. Task povoluje pouze vlastní `.cache/webgpu-migration-checks/combined-game/` a tento handoff. Primary ani migrační runtime nejsou write scope a nebudou změněné. Čistý native vstup `8de8299a7db91c6e072898a7cecbcaf0de3ffa3c`, primary committed HEAD `cdd439c` plus explicitně čtený foreign WIP; claim před zápisem.
- Výzkum: oba Game/UI čisté předchůdce mají společný přesný blob z960cb6f. Foreign Game přidává phased world, start/startContent, phase timing, final visual setup před assety, deferred presence, render/mesh incident profily a cancellation. Native přidává prepared engine, RenderHealth, submitted-frame gate, native compilation/timing/environment profile. Žádná větev neobsahuje druhou. Mechanický třícestný merge vytvořil10 Game a3 UI konfliktů; zdroje i původní konflikty jsou zmrazené v cache.
- Volba před implementací: zachovat foreign orchestrace a doplnit native ownership/checkpointy do jejích hranic. Nahrazení celého Game/UI by odstranilo phased startup a persistent preview; přepsání world generatoru by bez potřeby rozšířilo scope. Samotný outer guard nestačí: při world result transferu se owned list vyprázdní před Game await continuation a Simulation vzniká před svou async phase continuation. Použije se jednotná evidence neadoptovaných výsledků s explicitním disposerem; caller odstraní výsledek až po synchronním active checku a převzetí. `startupPhase` zůstane diagnostickým obalem bez předčasného zahazování resource výsledků; health.guard obaluje až registrovanou operation.
- Preview má samostatného vlastníka stack_options. Game/UI zachová persistent editor a active API, ani jeho candidate soubory zde nevznikají. Pro společné scoped typy lze později převzít přesně oznámené a hashované preview candidate vstupy do této cache.
- Vstupní manifest `inputs.json` obsahuje26 relevantních vstupů a raw SHA256 všech124 primary dirty/untracked cest. Candidate má kopie native client/shared/tests a relevantních foreign modulů/testů; node_modules je pouze čtená junction na dependencies-v5. Žádný install, pnpm exec, server, GPU, build ani fullsuite.
- Výsledek: izolovaný kombinovaný kandidát hotový a zmrazený pro peer review. Není to čistý native commit a žádný jeho runtime/test overlay se nesmí stageovat do main jako vlastní původní migrace.

## Implementace a zachování cizí práce

`candidate/client/game.ts` zachovává foreign start/startContent, world job a jeho signal/cancel, stage timing, deferred presence a early setCar, finální visual setup před prvním preloadem, updatePreloadVisuals, RenderIncidentProfile, MeshDrawProfile a rozšířený diagnostický kontext. Připravený engine je předaný konstruktorem; health je instalovaný před scénou. Každý asynchronní přechod před pokračováním znovu ověří aktivního vlastníka; ready vznikne až po dokončené lighting preparation a healthy submitted-frame gate.

Jedna startup Map drží výsledek a disposer až do synchronního převzetí volajícím. Registrace probíhá před health.guard. World result má disposer pro čtyři vlastní controllery; zbytek scene resources stále uklízí host. Simulation i tři loadery používají stejnou evidenci; pozdní result se uvolní i při visícím jiném loaderu. Vlastnictví se nesmí odstranit uvnitř další async helper funkce, protože by vznikla další settlement→continuation mezera. Chyba jednoho disposeru nezastaví ostatní; zachována foreign startup-cleanup-error i native late-startup-cleanup-error evidence. Dispose zastaví engine loop před odpojením scene controllerů a zůstává idempotentní.

Actual foreign frame nyní volá jeden updateRenderEnvironment místo druhého inline provedení. Zachovány původní sky/artLighting/vegetation/transit/particles/surfaces/cinematic/lightOrdering časy, rozhraní vrací původní lighting a volitelně zapisuje phase ends do jednoho znovupoužitého objektu. Native environmentProfile měří tentýž skutečný řetězec a své reportování vynechává ze svého intervalu. Žádná další aktualizace počasí, světel či materiálů za snímek nevznikla. Rodičovských šest fází se sčítá samostatně; děti environment ani lightOrdering se k celému CPU času nepřičítají podruhé.

`candidate/client/ui.tsx` zachovává foreign startup phase/error timing, inventory, network bootstrap i persistent AvatarEditor/active markup. Přidává native import/factory/canvas/abort ownership a readiness kontrolu po startu. Game dostane current ownership před construction diagnostic callbackem, takže ani jeho výjimka neosiří engine.

## Ověření a rozsah fixture změn

- `combined-ownership-red-v2.log`: **0/3 PASS** před runtime opravou – late world controllery neměly dispose, fault u visícího world job neodmítl start, Simulation phase po device faultu ještě vytvořila actor. První log předv2 obsahoval navíc chybějící fixture resetDiagnosticContext a není použitý jako runtime důkaz.
- `combined-final-tests.log`: **94/94 PASS**, exit0, přímý Node/tsx nad devíti vybranými soubory (oba startupy, engine/UI, light preparation/lifecycle, room callbacks, Game diagnostics, environment profile, world stages). Regrese navíc kryjí fault mezi world settlement/adoption, cleanup exception, gate před ready a pozdní přepis UI. Původní lifecycle a obsahové podmínky zůstaly ověřené; AST assertions jsou přizpůsobené skutečnému startContent, optional controllerům a diagnostic try/finally. Dvě dříve implicitně splněné cancellation promise nyní explicitně vyžadují AbortError podle native kontraktu.
- `combined-final-types.log`: **scoped strict TypeScript PASS**, exit0, Game/UI plus šest adaptovaných testových modulů. Obsahuje také přesně převzaté čtyři preview source vstupy z freeze stack_options, jejichž hashe jsou v manifestu. Nepotvrzuje celý projekt ani server build.
- Dřívější `combined-frame-world-v1.log` má **4/4 actual NullEngine world lifecycle PASS** a7/7 scheduler PASS; tři tehdejší frame fixture neshody jsou opravené a zahrnuté v konečných94/94. Celý cílený world běh trval31s, nešlo o GPU měření ani herní FPS benchmark. Nezměněný world se znovu netestoval.
- Fixture adaptéry vykonávají skutečný start→startContent a skutečný dispose. Zachovávají původních9 phased-startup scénářů a všech6 native-startup scénářů. Přidávají chybějící IO metadata/disposery a reálný RenderHealth; žádná kopie start algoritmu. Light fixture hledá skutečný call i přes foreign diagnostic try/finally; nadále skutečně ověřuje stabilní Babylon light defines. Frame fixture ověřuje nový úplný diagnostický kontext a hierarchii časů.
- Všechny testovací procesy skončily. Dependencies-v5 se pouze četly; nebyl spuštěn install/pnpm exec/GPU/server/build/fullsuite. Cinematic zůstal na původním primary frozen vstupu; navazující KEY-37 combined změnu přebírá root odděleně.

## Přesné předání

Cache root: `C:/Users/rezac/.codex/worktrees/webgpu-comparison/StrahovCrazyShow/.cache/webgpu-migration-checks/combined-game/`. Přenést pouze těchto osm vlastních výstupů z `candidate/`, po porovnání raw SHA256:

| Cesta | SHA256 |
|---|---|
| client/game.ts | 36fca2e2a4f2301972179e9cc4abf890090dd6779cfb3c95b3e00e61608dd40d |
| client/ui.tsx | 4c6078413055fc17f48223689bea9c6ba81f99172040a7b1927ce8f740215f65 |
| tests/game-startup.test.ts | 44e7a579725704408c27913332adbe32c2b784bb161cb093ef5185893f42aad5 |
| tests/game-webgpu-startup.test.ts | d888c10fb68692443186b55ddcb6d0af460374d0b573081b2a36ef7a739bdb75 |
| tests/game-render-engine.test.ts | 69161c749defbf5ae4dcc18ce4716696db056bb4abfb0a883aa1785116303434 |
| tests/game-light-preparation.test.ts | 0124c28fd02512d5982359abf9599806df5a22f07a2d9cc7abf4dc5f84a2e1fa |
| tests/game-light-lifecycle.test.ts | 156eb693481a81204e58c5a665797867a079d27ee95d28e6fec33d2bd0800e39 |
| tests/game-diagnostics.test.ts | 618783f8805c780dc780ccd8e608e2162b26ea18a1e16af74a166428274fdc52 |

`candidate-manifest.json` SHA256 **54a374776c27a17d959b112c50b51a9a33fa6fa5f56cf8fefdf57032a0c6764d** obsahuje výše uvedené výstupy, vstupní manifest hash, kontrolní výsledky a preview dependency hashe. `inputs.json` a `inputs/{primary,base,native}/` identifikují přesné zmrazené vstupy. `diffs/*.vs-primary.patch` oddělují změny proti fyzickému WIP, `*.vs-native.patch` kombinovaný overlay proti čisté migraci, `own-native-game-ui.patch` původní vlastní native deltu vůči960cb6f. Pomocné prepare/resolve skripty jsou historický průzkumný postup, nikoli pokyn přepsat zmrazený candidate; finální artefakt určují manifest a soubory.

Final preservation audit potvrzuje **124/124 primary raw hashů beze změny a přesně stejný porcelain status**. Root mezitím samostatně posunul main zcdd439c na2644a6d; toto není změna provedená tímto taskem. Žádný primary ani migrační runtime soubor tento agent nezapsal. Z commitovaných souborů patří tomuto tasku pouze tento handoff; root rozhodne o fyzické working integraci, odděleném stage čistých vlastních blobů a následné společné stabilní přejímce.

Nezávislý read-only peer review stack_options nad freeze54a374... ověřil Game/UI hashe, oba diffy, tři red ownership případy i konečné94PASS/typeexit0. Nenašel novou actionable P1/P2 chybu. Potvrdil resource lifetime do caller adoption, UI owner před diagnostikou, jedinou běžnou environment aktualizaci a preparingLighting bariéru, zachované phase/log/network i persistent active markup. Jeho závěr je čtení a kontrola dodaných CPU logů, nikoli další GPU/multiplayer/hardware-loss měření.

Po handoff-only commitu následuje release vlastní rezervace; candidate zůstává zmrazený pro root. CPU výsledek není GPU ani úplná projektová přejímka.
