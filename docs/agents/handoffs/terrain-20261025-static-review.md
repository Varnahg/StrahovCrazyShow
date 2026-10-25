# Předání: terrain-20261025-static-review

- Vlastník `terrain-static-01a16b37`, příjemce root koordinátor TERÉN-20261025 / KEY-61.
- Cwd `D:/CodexWorkspaces/StrahovCrazyShow-terrain-20261025`, baseline `ff13fa2b3b47363378ce55d34ed12eb5beec1ede`.
- Vlastní claim získán bez adopt-dirty; pět source/test souborů bylo před úpravou čistých. Cizí ground/flowers/bootstrap WIP nepřevzat ani změněn.
- Změny: `client/terrain-review.ts`, `client/game.ts`, `client/ui.tsx`, `tests/terrain-review.test.ts`, `tests/game-webgpu-startup.test.ts`, toto předání a `.cache/terrain-static-review-20261025/`.
- Spec `_bmad-output/implementation-artifacts/terrain-20261025/spec-key-61-teren.md`, kontext `docs/terrain/20261025/research.md`. Žádný nový BMAD, podagent, staging ani commit.

## Výzkum a rozhodnutí

Ve ff13 není fixed-camera API. `model-review` je pouze inventář; jednorázové `camera.position/setTarget` přepíše běžný `updateCameraFollow`. DEV `__strahov` není součástí zmrazeného produkčního klienta. Pouhé přesunutí kamery při ponechání hráče na `110,12` by navíc vytvořilo přes100m dlouhou camera→player výběrovou oblast fotografické trávy, oproti běžnému prvnímu/ třetímu pohledu. Vzdálený lookAt rovněž nesmí nahradit focus.

Zvoleny čtyři nezávislé **guest počátky před jediným sim.add**, obyčejný Actor s idle fyzikou a obyčejná first-person kamera/FOV0.85. Alternativní render-only focus/camera override by musel zvlášť synchronizovat více LOD a environment systémů; následná teleportace nebo simulované WASD neodpovídají zadání. Pro nový pohled vzniká nová relace, nikoli přesun uprostřed měření.

| ID | Počátek X,Z | Cíl X,Z | Primární opora |
|---|---|---|---|
| `b6-rear-path` |36,−64|29.24,−64|Uživatelská zadní fotografie B6, IPR8.6.2024, dirt OSM25920436|
| `b6-front-lawn` |−14,−64|−13,−59|Uživatelská přední fotografie B6, IPR8.6.2024|
| `osm-grass-control` |−103,−65|−100,−60|Existující grass OSM1059554109, IPR8.6.2024|
| `b6-far-context` |40,−75|28,−32|Stejný východní prostor B6, vzdálený authored inspection směr|

Polohy kamery jsou výběrem kontrolního stanoviště, nikoli geodetickým zaměřením. Read-only klasifikace před implementací ověřila mimo budovy/actual CAD výřezy/cesty všechny počátky; kontrolní OSM trávník má celý půdorys±.08m povolený. Původní B6 trávníky mají chybějící coverage, opravu dodává jiný agent. Datum expozice uživatelských fotografií je neznámé; zdrojové obrázky se nekopírují do Gitu.

## Implementace a lifecycle

`resolveTerrainReview(location, network)` akceptuje přesně jeden `terrainReview` parametr se čtyřmi whitelist ID, pouze na `localhost`, `127.0.0.1`, `[::1]` a mimo multiplayer. Chybějící/neznámý/duplicitní/remote/MP parametr je inertní. Žádné URL souřadnice, localStorage, nový server endpoint ani DEV API. Presety i jejich vnořené souřadnice/label jsou zamrazené.

`Game.createStartupActor` ponechává výchozí `sim.add("local")` beze změny. QA větev použije actual `sim.surfaceHeight`+standardní1m spawn clearance, nastaví yaw/firstPerson, srovná `previousPosition`, `visualOffset` a `localPlayer`. Po vytvoření skutečného avatara se pitch vypočítá podle jeho výšky očí a skutečného controller offsetu; stále je to first-person slope, nikoli úhel. Actor sám normálně dosedne idle fyzikou. Žádná následná korekce pozice, přepsání focus ani jiný controller. FOV, renderloop, počasí/osvětlení, HUD, physics a rozpočty detailu zůstávají produkční.

QA blokuje world movement/jump/interact/view/respawn klávesy, pointer orbit/lock/zoom, GUI respawn a transit preview přesouvající postavu. Mapové/menu zkratky a normální UI kvality/počasí/benchmarku zůstávají použitelné. To je viditelný **pevný pohled**, nikoli změna běžného ovládání. Dataset starého QA ID se při novém běžném/MP startu odstraní. React badge je vázaný na aktuální guest Game; stará relace ani výchozí MP identitu nedědí.

`terrainReviewIdentity` vytváří odpojený záznam ID/verze/scope/souřadnic/provenience. Raw `Game.Benchmark` a úplný UI download jej obsahují. HUD ukazuje QA, pojmenovaný pohled a začátek `CLIENT_BUILD_ID`, celý hash i ID jsou v title/data a navazují na existující sourceSnapshotId výsledku. Nová data netvoří per-frame cache nebo event listenery; dvě startup metody sdílejí čistý výpočet pose. Dispose využívá stávající vlastnictví Game/React.

## Root postup pro statickou přejímku

Pouze **nový izolovaný produkční preview**, nikdy hraná2592. Například podle rootem přiděleného portu:

```text
http://127.0.0.1:<novy-port>/?terrainReview=b6-rear-path
http://127.0.0.1:<novy-port>/?terrainReview=b6-front-lawn
http://127.0.0.1:<novy-port>/?terrainReview=osm-grass-control
http://127.0.0.1:<novy-port>/?terrainReview=b6-far-context
```

1. Načíst jednu URL; v normálním menu vybrat **Prohlédnout si Strahov sám**. Žádné WASD/jízda/rozhlížení.
2. Ověřit viditelný QA pohled/build, skončený loading/renderHealth, počkat na klidové dosednutí postavy a dokončení vegetace (`ready`, `preparing=false`, `pendingTiles=0`, dokončené transitions). `ready` materiálů samo neprokazuje kompletní studenou přípravu trávy.
3. Stejné avatarové proporce, explicitní kvalita, CSS/interní rozlišení, čas a počasí pro A/B. Zachytit běžný snímek a použít existující Nastavení →10s benchmark →úplný download. Kamera, matice a skutečná pozice jsou v původním benchmarku.
4. Pro další ID načíst novou URL/nový Game. Při multiplayerové volbě zůstane běžný spawn a QA badge se neobjeví.

Baseline ff13 a kandidát musejí mít **stejný tento QA overlay**; root si zmrazil baseline mimo task. Čtyři guest pohledy nejsou multiplayerový výkonový důkaz. Oddělený statický produkční MP control se3skutečnými SDK relacemi na normálním spawnu a stejnou kamerou ověří režii této scény; neprokazuje cenu detailu B6, pokud není v záběru.

## Ověření a otevřená navazující integrace

- První room/startup balík24/24 PASS; širší cílený balík **84/84 PASS**,57.532s, `.cache/terrain-static-review-20261025/targeted-tests.log`: terrain-review, game-webgpu-startup, room-callbacks, camera-look, benchmark-presentation. Nejde o fullsuite.
- Nové testy spouštějí skutečné extrahované metody Game/start a původní RenderHealth gates, běžný follow výpočet a interpolaci, aktuální JSX badge; jen IO/render je nahrazené. Reálný malý Rapier+Actor fixture dosedne se stejnou kapslí.25/.55, nulovým horizontálním inputem a zakázaným recovery. NullEngine není GPU důkaz.
- První strict targetedTS zachytil pouze nevhodný readonly→mutable cast v nové negativní testovací fixture; nahrazen `Reflect.set` s očekávaným false, bez změny produkce či oslabení regrese. Původní log `typecheck.log` zachován. Finální **strict targeted TypeScript PASS exit0** v `typecheck-final.log`; finální opakování obou vlastních testových modulů **24/24 PASS**,14.108s v `targeted-final.log`.
- **Collector mezera potvrzena skutečným pure voláním** v `collector-gap.json`: `projectLocalBenchmark` zahodí terrainReview a odmítá avatars3 (`choice`, aktuální whitelist1/30). Root byl informován; potřebná navazující scope je `shared/local-benchmark.ts` + `tests/local-benchmarks.test.ts`. Stejnou projekci používají UI před POST i server, server adaptér nemusí měnit. Mimo tento task nebylo zapisováno; raw UI/full download novou identitu zachovává.
- Full-world fyzikální podpora konkrétních stanovišť, obraz, asset připravenost, skutečné GPU/FPS/p95/p99, server a multiplayer nebyly v tomto CPU tasku spuštěny. Patří rootově rezervované statické přejímce. Hraná2592 zůstala nedotčená.

Všechny vlastní procesy skončily. Scoped diff whitespace check PASS. Přesné source/test/handoff SHA i logy obsahuje `.cache/terrain-static-review-20261025/checkpoint.json`; patch tracked souborů je `changes.patch`, dva nové soubory jsou explicitně uvedené v manifestu. Po vytvoření manifestu následuje release. Root přebírá doložený WIP přes `--adopt-dirty`; katalog, review, případnou collector integraci a commit vlastní koordinátor.
