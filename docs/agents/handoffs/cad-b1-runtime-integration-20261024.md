# B1 runtime — průběžné vlastní předání

13:05UTC pokračování stejného vlastníka: UI location-pill původně rozpoznával pouze `b6:<number>`, nové `b01:n02`/`b06:p01` by hlásil jako Mezi bloky. Úzká oprava parsuje skutečný CAD block/floor a má CZ/EN text. Kvůli těmto dvěma čistým baseline souborům byl vlastní task rozšířen o ui.tsx/i18n-messages.ts, po vlastním release znovu claim --adopt-dirty; přebráno pouze18 doložených vlastních runtimeWIP cest. Žádný primary-mainUIWIP se nepřebírá. Starší odstavce níže jsou historický checkpoint; aktuální výsledky574door/44stair a foto přejímka jsou v b1-b6-work.md a navazující evidenci.

Cwd C:/Users/rezac/.codex/worktrees/cad-building-models/StrahovCrazyShow, větev codex/b1-playtest-20261024, přijatý základ6dd89606b137ccf4ea156a4978b649a87c818b1e (origin/main2a7 + pouze vlastní asset). Owner cad-buildings-01a16b37-runtime. PrimarymainWIP/source15 nepřebírány.

Vlastní WIP: nový client/cad-buildings.ts, jeho tests/cad-building-loader.test.ts, shared/cad-buildings.ts; úzké game.ts/world-renderer.ts startup/cleanup/fallback hooks; simulation.ts nativekolize a kapsle0.25/0.55/autostep0.22/0.10, world.ts indoor zóna, terrain.ts společné clipping, netcode.ts revize12 a navigační hashlists. Původní tři B1 assety beze změny.

Loader+skutečný vybraný Game startup prošly9 malými fixture, včetně chyby assetu, zrušení/pozdního načtení, ownership a kritického awaitu mimo optionalcarcatch. Doložený RED→GREEN: Babylon Vector3.copyFrom neumí obyčejný bod{x,y,z}; opraveno na set(x,y,z), transformfixture nyní porovnává skutečnou world pozici. Handoffy site a terrain helperu byly převzaty samostatnými root claims (9Python+6TS a14TSanalytických testů).

Plný b01-site.json ještě nevznikl; žádný placeholder. Celá Simulation, nativeGLBload, terrain/entry spojení, B6/auto/kamera, fullsuite/build/integration ani GPU přejímka runtime zatím neproběhly. Do10:25UTC je heavy/build/GPU předané druhému chatu; root pouze lehká implementace. Po reálnémSTOP/release provede actualsiteexport a další validaci.

Nyní root rozšiřuje vlastní integrační rezervaci o aktualizaci původních modelových probe aktuálníhoActor kontraktu a generic-roof regresí. Původní rapier_model.mjs stále hlídá .42/.38/.20 a pojmenovává tento profil current; při záměrné integraci nové kapsle musí vědomě navazovat na nové sharedSimulation, ne ji odmítat nebo o ní lhát. Převzetí dosavadního vlastního WIP přes --adopt-dirty je tímto výslovně doložené. Vlastní lehké příkazy skončily, žádný server/Blender/GPU neběží.


## Přijatý herní checkpoint B1+B6, 24.10.2026

Aktuální rozsah jsou pouze B1 a B6: samostatné editovatelné Blender modely, konstrukční interiéry podle půdorysů, odvozené IPR2023 textury a rigidní usazení. Nativní GLB a fyzika používají stejnou geometrii i transform. Původní CAD soubory a jejich kopie nejsou v Gitu. Chybějící svislé kóty, tloušťky některých krytů a rozdíly historických podkladů jsou popsané v modelech; nejde o nové zaměření ani kompletní vybavení pokojů.

Modelové commity: B1 foto `30c13354`, B6 `dea1b67f`; runtime a regrese `a31f743a`. Finální izolovaná produkční hra: **http://127.0.0.1:2590/**, source ID `841637d90c3a7d5ad99114ee1a0b76001edfc8093f8775353a5b18f6f5eb0ed5`. Žádný HMR. Uživatelův původní primary-main WIP zůstal nedotčený.

### Skutečné výsledky

- Souvislé finální full-world přehrání skutečného Actoru: **B1 574/574, B6 1406/1406 dveřních bodů**, všechny sessions PASS, bez teleportu/recovery. Samostatné schodišťové průchody **44/44 a 74/74 směrů**. B6 obsahuje šest vyšších terasových prahů a jeden venkovní P01 návrat ověřený standardním skokem, nikoli zvýšeným autostepem.
- Nativní exportní audity ověřily Blender/GLB trojúhelníky, normály, UV, PBR a packed PNG; Babylon skutečný GLB transform a společné terrain/render kolize prošly. B6 má372 vzorků světlosti/opory PASS. Finální overall, všech osm půdorysů a tři dokončené interiérové rendery B6 byly prohlédnuté. Další obdobný render batch byl vědomě ukončen; tyto nevytvořené obrazy nejsou označené za důkaz.
- Úplné `pnpm test` nejprve dalo1943 testů:1914 PASS,27 FAIL,2 platformní skip,1622,65s. Následovaly doložené opravy starých fixtures a skutečných návazností: kritický CAD startup, navigační capsule, NPC výška a17,5mm near-flat DEM hover. Přísný3mm limit stability zůstal; finální residual range0,156mm. Nezměněné dlouhé autodev/coordination testy již prošly a neopakovaly se.
- Finální produktová sada s concurrency4 ve frozen-v2:1786 testů,1781 PASS,3 chybějící static fixtures,2 platformní skip. Frozen-v3 doplnil pouze Dockerfile,compose.yaml a diagnostický JSONL; **všech8603 ostatních hashů je totožných**. Tyto tři testy nyní PASS. Celý produktový rozsah je tedy **1784 PASS a2 platformní skip** napříč tímto doloženým během a doplněním, nikoli tvrzení nového jediného plného pnpm test běhu. Dvě původní WGSL readiness chyby se izolovaně i v tomto běhu neopakovaly; shader ani timeout se neměnily.
- TypeScript a produkční `pnpm build` frozen-v3 PASS. Plná izolovaná `pnpm test:integration` nad totožnými runtime/test vstupy frozen-v2 PASS, protokol12, společný svět, vlastní odpovědi, pohyb/vozidlo/recovery a feedback hranice. Port2568 byl po testu uvolněný.
- Skutečná hra v Edge/WebGL2 na **GeForce GTX1060**, medium, CSS i interně **1528×650**, tři současné skutečné relace a tři různé avatary: **59,2 FPS**, p95 **19,5ms**, p99 **25,1ms**,10s. Renderer ready/valid,0 render chyb,0 asset chyb. Oba CAD modely skutečně načtené:225meshů/49materiálů. Jde o tento denní pohled a konfiguraci, nikoli slib výkonu všech scén nebo optimalizační srovnání. Dva pomocní SDK hráči byli následně odpojeni.

Důkazy jsou v lokální vlastněné cache: `world-paths/{b01,b06}-final-world.json`, `b01-playtest/{final-game-tests.log,supplemental-fixtures-v3.log,v2-v3-equivalence.json,build-v3.log,integration-v2.log,benchmark-v3-medium-three-peers.json}` a `publication/final-evidence.json`. Snapshot obsahuje testy i všechny jejich použité statické vstupy. Venkovní cestování před anotovanými vstupy a všechny kombinace dynamické dopravy nejsou zahrnuté do tvrzení o úplném dveřním pokrytí.
