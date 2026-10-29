# Předání: repair-gltf-light-budget

## Aktualizace 2026-10-14: pracovní kandidát wave4, není nasazený wave3

Root výslovně přidělil navazující steady-path opravu původnímu vlastníkovi `repairs-01a13624-gltf-budget` a schválil `--adopt-dirty` na základě tohoto původního předání. Změněny jsou opět jen `client/gltf-light-budget.ts`, `tests/gltf-light-budget.test.ts` a tento handoff. Game API se nezměnilo. **Vydaný immutable snapshot wave3 `0f20b5a7c7ba9ce5ab9aa16bba3b0a6886823152a322be2724fd2cdad41d6248`, jeho assety, běžící preview4176/API2571 ani browser nebyly změněny.** Níže původní evidence wave3 zůstává historickým záznamem, nové SHA této pracovní implementace jsou v této sekci.

### Důvod a skutečná wave3 evidence

Read-only streamované čtení uložených dvou částí `.cache/playtest-repairs-validation/wave3-session/371d306e-a801-41f0-917b-9ea7d832325d{,.part-0001}.jsonl`, bez spuštění aplikace:

- Všech 588 `frame-window` vzorků od seq234 / atMs34019.6 do seq3193 / atMs610391.4 má shodně `writes=inflationRepairs=4638`, `loaderStarts=loaderReady=23`, bez owner changes. Opravy byly hotové už v prvním herním vzorku. Pozdější cap-churn ani shaderem vyvolaný cyklus zápisů tento log nedokládá.
- Kumulativní `visits` roste z 43639 na **6004713** v posledním frame-window; poslední hitch seq3194 obsahuje novější previous-context s **6017825**. Původně zmiňovaných 3.1 milionu byl mezistav u 311 s. Tyto kumulativní hodnoty se nesčítají a čas předchozího contextu není časem pozdějšího eventu.
- Čistý interval seq252 / atMs36898.9 až seq842 / atMs159326.1: stabilně 278 materiálů, 42 registrovaných světel, 2 enabled, žádný aktivní loader, žádný nový zápis. Přesto `visits` 53925→1475339, tedy **1421414 = 5113 × 278** zbytečných kontrol materiálů za 122.4272 s. Důvod je přímý `beforeRender→update→for materials` původní verze, nikoli nekonečný loader.
- Instalovaný Babylon9.30: glTF loader `glTFLoader.pure.js:412–426` opakovaně nafoukne všechny scene materiály a až potom čeká na onReady extensions. Guard při každém skutečném nafouknutí obnoví cap. `standardMaterial.pure.js:1966`, `pbrMaterial.pure.js:961` a `decorators.js:17–40` vedou změnu capu přes `_markAllSubMeshesAsLightsDirty`; `material.pure.js:1376–1400,1448` při tom prochází scene meshes/submeshes/draw wrappers. Startup zápisy tedy mají skutečnou práci, ale její dobu dosavadní telemetry neizoluje. Tato aktualizace je neoptimalizuje.
- Samotný beforeRender guard běží před activeMesh/mainDraw intervaly (`scene.pure.js:4601`), takže jeho vlastní průchod náleží do celkového render času mimo tyto intervaly. Pozdní mainDraw hitches nelze připsat neexistujícím pozdním cap zápisům. Žádný FPS, GPU compile ani přesný CPU čas guardu se z počtu visits netvrdí.

### Provedená změna a refaktoring

- Veřejné `update()` zůstává force sweep. Loader begin/READY/finish nadále volají force update a po celou dobu aktivního loaderu probíhá před každým renderem plný sweep, včetně await-onReady mezery a souběžných loaderů. Plugin bridge nebyl změněn.
- Interní `refresh(false)` v beforeRender levně projde světla a porovná enabled/registered count, material count, skutečně nově zachycené materiály a synchronní removal/topology signály. Beze změny a bez aktivního loaderu **neiteruje všechny materiály**. Same-count výměnu materiálu či světla zachytí removal signal před deferred Babylon add callbackem. Parent enable/reparent změny zachytí skutečné `isEnabled()` při průchodu světel; nepřibyly další observer mapy pro světla.
- Sdílený helper `repair()` obsluhuje force sweep i malý Set odložených materiálů. Frozen s čekajícím cílem/známou inflací, invalid cap a odmítnutý setter zůstávají v tomto Setu a další frame navštíví jen je. Automatic4→enabled5 během freeze se po unfreeze opraví i bez jiné události. Explicitní deferred fixed cap zachová svoji politiku. Invalid počáteční cap neztratí lifecycle: entry má do získání validní deklarace null policy.
- Při klidu se vlastní přímé cap zápisy nedotýkají; jejich politika se zachytí před dalším řízeným přepočtem světel nebo loaderem. Stejně hodnotově neodlišitelný owner záměr používá stávající `declareBudget`.
- Odstranění/dispose čistí deferred Set i vlastní observers. Guard dispose během odmítnutého setteru nemůže vrátit materiál do retry Setu. Set je omezen existujícími tracked materiály, frame bez změny nealokuje snapshot či seznam materiálů.
- Nové stats `fullSweeps`, `deferredPasses`, `skippedFrames`, `deferredMaterials` umožní další běh ověřit automaticky. `visits` nadále počítá skutečné navštívené materiály a `writes` jen skutečné úspěšné změny. Nezavedeno blokování dirty mechanismu, žádný prototype patch, reparent workaround ani změna Babylon závislostí.

### Ověření kandidáta

2026-10-14 00:06–00:07 Europe/Prague, jen povolené cílené CPU kontroly:

- `pnpm exec tsx --test tests/gltf-light-budget.test.ts` — exit0, **16/16**. Zachované všechny původní skutečné empty/nonempty/concurrent glTF a define/lifecycle testy. Nově 100 idle beforeRender bez růstu visits, explicit force sweep, enabled2→3→5→4, ancestor enabled/reparent, synchronous new material před deferred callbackem, same-count replacements, frozen automatic a explicit budget retry, invalid cap a throwing/ignored setter recovery, idle owner intent před count/load změnou, removal/re-add/dispose a disposal přímo během setteru.
- `pnpm exec tsc --noEmit --target ES2022 --module ESNext --moduleResolution Bundler --strict --skipLibCheck --esModuleInterop --types node tests/gltf-light-budget.test.ts` — exit0.
- Prettier pouze vlastní dva soubory; `git diff --no-index --check` oproti původním wave3 souborům bez whitespace nálezu.
- Finální SHA-256: `client/gltf-light-budget.ts` = `909d69632a7fe955c7cbdaa3e264aa032bc9198f5e0ed9feca9bcdcaa24248aa`; `tests/gltf-light-budget.test.ts` = `db8ba5e162dbebf14189de2b03178b5fbe02b678c94eb0f00e42606207e98136`.
- Read-only hash původních wave3 souborů znovu potvrzen nezměněný: implementace `1babb4d5e8e93b5e568a1482420a690b1036776a7cc1c72845ab36f520d66c15`, testy `3735cd0141b43c095e62300983cd9ea43f4554fe3b87c1f8a51dea4d24cdc1b1`.

Vlastní test/types příkazy skončily, žádné vlastní pomocné procesy/porty nezůstávají. Neběžel full suite, build, integrace, GPU/browser ani zátěžový profil. Po předání se vlastní rezervace znovu uvolňuje; root integruje task a společnou verification evidenci.

### Co musí ověřit čerstvý wave4

Root musí zmrazit nový source+tests checkpoint a provést společnou přejímku. Produkční srovnání musí potvrdit steady `visits/fullSweeps` bez růstu při nezměněné scéně, funkční nové loady a změny světel včetně unfreeze, cap histogram a skutečné enabled lightSources. Teprve srovnatelné GPU/CPU měření celé hry může doložit dopad na render time/FPS/p95/p99; pokud je třeba rozlišit malou vlastní režii guardu, musí ji zvlášť časovat. **Startup4638 zápisů se touto změnou neodstraňuje.** Wave3 gameConstruction37.5ms, gameStart22595.6ms, architecture819.2ms, finalVisual642.5ms/staticCollisions630.9ms a souběžné vegetation10138.1ms/B6 assets12477.7ms jsou oddělené kontextové údaje; souběžné wall časy se nesčítají a toto předání je nepřipisuje guardu.

## Původní předání wave3 (2026-10-13)

- Vlastník: `repairs-01a13624-gltf-budget` (`/root/repair_reporting`); příjemce: `/root`.
- Pracovní kopie: `C:\Users\rezac\Documents\GitHub\StrahovCrazyShow`, větev `main`; výchozí commit této opravy `91ee88f0aaa902c79fad589aeb84bc086a66c9ea`.
- Výsledek: hotový scénově vlastněný `GltfLightBudget`. Root již integruje vytvoření hned po `new Scene`, automatický `beforeRender` hook, disposal před scénou a `stats` do diagnostického kontextu `lightBudgets`. Žádný ruční přepínač.
- Přesné soubory: `client/gltf-light-budget.ts`, `tests/gltf-light-budget.test.ts`, tento handoff. Před claimem byly cesty čisté; žádné cizí WIP nebylo převzato. Ostatní rozpracované změny zůstaly mimo rozsah.

## Kontrakt a doložený mechanismus

Primární zdroj přečtený 2026-10-13: instalovaný Babylon 9.30.0, `node_modules/@babylonjs/loaders/glTF/2.0/glTFLoader.pure.js`, zejména řádky 412–417 a navazující `_extensionsOnReadyAsync`. Loader po načtení zvýší `maxSimultaneousLights` všech materiálů své scény na maximum původní hodnoty a **celého** `scene.lights.length`, včetně disabled světel. Dělá to také prázdný glTF bez material/mesh callbacků. Veřejný READY následuje až po await extension hooks.

- `new GltfLightBudget(scene)` musí vzniknout před materiály/loadery. Jedna instance na scénu. `dispose()` je idempotentní; `scene.onDisposeObservable` ji také volá.
- Zachycený standardní Babylon default 4 je automatický základ: `max(původní základ, počet aktuálně enabled světel scény)`. To je konzervativní horní mez běžného `mesh.lightSources`; nepřidává světla a nemění jejich pořadí/membership.
- Zachycené jiné hodnoty jsou přesná fixed politika vlastníka. Nezávislé změny capu se také stanou fixed politikou. `declareBudget(material, cap)` je explicitní fixed politika i pro úmyslnou 4 při pěti světlech nebo pro souběžnou hodnotu nerozlišitelnou od loader rewrite. Vrací úspěšnost okamžité aplikace. Frozen materiál se nemění.
- Materiály jsou omezené na skutečné `StandardMaterial`, `PBRMaterial`, `PBRBaseSimpleMaterial`. Neznámý již inflační vstupní cap se neodhaduje zpět na 4.
- `onMaterialLoadedObservable` zachytí nové importované materiály před rewrite. READY, terminální události a `scene.onBeforeRenderObservable` provedou opravu. BeforeRender pokrývá i await mezeru před READY. Guard nevolá `isReady`, render ani shader compilation.
- Rozpoznání inflace je konzervativní: během prokazatelně vlastního aktivního loaderu přesná vzestupná hodnota `Math.max(lastApplied, scene.lights.length)`. Nerozpoznané změny jsou zachované jako owner politika. Při změně počtu registrovaných světel přesně mezi rewrite a prvním pozorováním může být původní loader hodnota nerozlišitelná od owner změny a zůstat zachována; guard si nevymýšlí její původ.
- U frozen materiálu si guard pouze zapamatuje již pozorovanou prokázanou inflaci; po unfreeze ji může opravit, i když loader mezitím skončil. Žádná změna frozen materiálu ani automatické unfreeze.

## Veřejný plugin bridge a lifecycle

Prázdné loady identifikuje dočasný bridge na **instanci** `GLTFFileLoader` přes veřejné `loadFile`, `directLoad`, `loadAsync`, `loadAssetContainerAsync`, `importMeshAsync`; scéna pochází z jejich skutečného veřejného argumentu. Žádná soukromá loader pole, prototype patch ani změna node_modules.

Bridge zachovává `this`, argumenty, návratovou hodnotu a identitu Promise; rejection cleanup je pouze side channel. Obnoví přesný původní own descriptor nebo odstraní vlastní shadow zděděné metody. Cizí pozdější wrapper nepřepíše. Neobalitelné instance/deskriptory nezastaví loader: pokrytí hlásí `unwrappedEntryPoints`; neúspěšná obnova má vlastní counter. Foreign scéna se uzavře bez zásahu do materiálů.

Jeden globální activation observer slouží všem guardům, každá scéna vlastní svoje materiály/loadery. Observe/detach a terminální cleanup jsou sdílené helpery; weak deklarace uchovávají politiku při AssetContainer remove/re-add bez retence uvolněných materiálů. Stabilní rámec nevytváří nový plný snapshot scény, nezapisuje stejný cap opakovaně a sleduje jen aktuální material map a světla. COMPLETE/error/dispose uklidí wrappers/listeners, guard dispose uklidí vlastní scene/material observers a poslední guard také globální bridge.

## Ověření

2026-10-13 23:22 Europe/Prague, po uvolnění CPU okna rootem:

- `pnpm exec tsx --test tests/gltf-light-budget.test.ts` — exit 0, **8/8**. Skutečný loader bez guardu prokazuje default 4→43 i u prázdného glTF. S guardem 5, stabilní frames bez dalších writes. Skutečná odložená glTF extension drží loader před READY s capem 43; beforeRender obnoví 5, skutečné Babylon material defines mají `MAXLIGHTCOUNT=5`, `LIGHTCOUNT=5`, mesh má pět enabled lightSources. Dále skutečný import malého mesh/material glTF, automatická politika po container re-add a šestém světle, dva současné vlastní loady a nezměněná foreign scéna, fixed 2/8/4 a owner 9/43, Promise/this/args/descriptor parity, rejection/dispose, neobalitelné metody, dva guardy a deferred observable cleanup, frozen a následné unfreeze.
- `pnpm exec tsc --noEmit --target ES2022 --module ESNext --moduleResolution Bundler --strict --skipLibCheck --esModuleInterop --types node tests/gltf-light-budget.test.ts` — exit 0.
- `pnpm exec prettier --write client/gltf-light-budget.ts tests/gltf-light-budget.test.ts` — exit 0; jen vlastní dva soubory.
- `git diff --check -- client/gltf-light-budget.ts tests/gltf-light-budget.test.ts` — exit 0 (nové untracked soubory nejsou tímto kontrolovány jako patch; byly formátované Prettierem).
- První cílený běh byl 7/8 kvůli chybně odečtenému baseline počtu deferred Observable listenerů v testu; opravený test nejprve čeká na jejich reálné odstranění. První narrow tsc odhalilo čtyři chybějící `bin:null` v loader fixture datech; doplněno. Tyto chyby nebyly runtime výsledkem guardu.

Výstupy jsou v tool transcriptu této relace, nevytvářely se další soubory mimo claim. Vlastní příkazy skončily; žádný server, port, GPU scéna nebo dlouhotrvající pomocný proces nezůstává. Neběžel build, plná sada, integrace ani GPU benchmark; společnou přejímku stabilního checkpointu vlastní root.

## Identita předaného snapshotu

SHA-256 konečných implementace a testů (testy zahrnuté):

| Soubor | SHA-256 |
| --- | --- |
| `client/gltf-light-budget.ts` | `1babb4d5e8e93b5e568a1482420a690b1036776a7cc1c72845ab36f520d66c15` |
| `tests/gltf-light-budget.test.ts` | `3735cd0141b43c095e62300983cd9ea43f4554fe3b87c1f8a51dea4d24cdc1b1` |

NullEngine dokazuje mechanismus a cap/define/lifecycle správnost, **ne GPU výkon ani příčinu produkčních hitchů**. Produkční dopad MAXLIGHTCOUNT a mainDraw/mesh preparation se musí ověřit s plným profilem a ostatními wave3 opravami. Výjimky frozen/unsupported/unwrappable/ambiguous owner hodnot jsou záměrně konzervativní a čitelné v API scope/stats.

Rezervace bude uvolněna bezprostředně po tomto předání; konečný registr je autoritativní. Root přebírá integraci a aktualizaci tasku i `docs/verification.md`.
