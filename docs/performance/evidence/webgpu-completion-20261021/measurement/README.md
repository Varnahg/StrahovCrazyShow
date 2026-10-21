# Explicitní QA měření skutečné hry pro KEY-22

Tento malý build/serve helper navazuje na přijatý `transit-calendar-20261020/measurement` Vite postup. Nemění zdrojový snapshot, produkční renderer, readiness, timeout, světla ani stíny. Nemá browser automatizaci, CDP nebo API server. Konkrétní build/GPU výsledky sem nepatří, dokud je koordinátor skutečně neprovede.

## Rozhodnutí a hranice

Standardní recorder již ukládá `lighting-preparation` a `webgpu-preparation-profile` před kontrolou timeoutu v Game.start. Nejprve použít tyto raw záznamy. Existující transit QA panel vznikal až po ready; tady jediný exact UI transform obalí původní `await g.start()` před startem. Terminální snapshot vznikne před původním UI catch/dispose, původní výsledek nebo stejný thrown objekt se zachová i při chybě observeru. Není přidaný render, readiness check ani pipeline cache zásah. Game/device se nevystavují přes window.

Startup sampler pořídí nejvýše 180 technických snapshotů po 1 s. Skončí v obou terminal větvích. Whitelist obsahuje health/generaci/pending operations, backend/rozměry, skutečné avatar konfigurace bez přezdívek, scénové počty a existující compilation counters; shader text inventory se neexportuje. Počasí zachová všechny známé technické Weather hodnoty včetně cloudLayers/cloudWinds, vlhkosti, sněžení, fáze srážek a provenience. Standardní benchmark navíc uchová vlastní nezávislé weatherAtStart/weatherAtEnd, nikoli náhradu pozdějším scene snapshotem. Terminální raw jde do viditelného QA panelu, skrytého textového DOM exportu a download backupu, automaticky také do immutable receipt endpointu. Selhání startupu či neplatný benchmark jsou zachované důkazy, nikdy automatická přejímka výkonu.

Po úspěšném startu a přesném server ACK jeho raw záznamu panel volá existující Game metody: `setQuality`, `setTargetFps(60)`, `toggleFlashlight`, `startBenchmark`. UTC input používá stejný `timeOverride` jako vlastní UI. Ovládání je během měření a všech pending/failed transferů zamčené. Standardní Game benchmark trvá 10 s, exportuje původní raw `game.benchmark.frames` a vlastní výsledek; souběžný lehký RAF pozorovatel ukládá doručovací intervaly, nikoli GPU čas. **I plain standardní benchmark obsahuje produkční BenchmarkRenderProfile a běžné compilation/health hooks.** Helper nepřidává další profilovací wrappery. Mezi začátkem a koncem intervalu nedělá 1Hz snapshoty ani profile dumpy. Režim s `profileEnvironment=1` je označený diagnostic a nemíchá se s plain FPS páry. Odmítnutí, throw i dispose během startBenchmark mají vlastní failed raw attempt; cleanup se týká jen skutečně vytvořeného vlastního benchmark objektu a případná cleanup chyba nepřekryje původní chybu.

Různé 1Hz RAF startupy nejsou GPU FPS vzorky. Nula shader chyb neprokazuje dokončenou přípravu. Endpoint scene/draw/bundle counters nejsou intervalový průměr. WebGPU GPU timer je main-pass-only, WebGL timer může být whole-frame; nesrovnávat je jako totožný scope.

**Traffic clock je výchozí vypnutý.** Osvětlení timeOverride nesjednocuje dopravu; před/po počty nejsou min/max kohorty ani frustum workload. Nepočítat kauzální FPS gain z různých skutečných UTC jízd. Pro volitelný explicitní společný QA transit scénář slouží níže popsaná hashed clock konfigurace. Pohyb, počasí, kamera, teplota/takty a požadované 1/3 skutečné relace stále musí mít samostatný root protokol. Basic sample gates nevydávají celý KEY-22 za přijatý.

## Příkazy pro koordinátora

Nejprve rezervovat heavy-validation/workspace-build/gpu a porty podle skutečně prováděné akce. Výstupy musí být striktní potomci `.cache/webgpu-completion-20261021/validation/` v této worktree; cílový adresář musí být nový. Snapshot obsahuje testy a materiálované assety. Helper před/po build ověří každý manifestovaný soubor a vlastní helper SHA; native Vite config a původní chunk grouping zůstanou zachované. App/loaders musí používat jeden core. Identity sidecar ukládá helper/transform/dependency SHA a všechny skutečné bundle SHA.

```powershell
node docs/performance/evidence/webgpu-completion-20261021/measurement/harness.mjs build ABSOLUTE_SNAPSHOT ABSOLUTE_NEW_BUILD key22-original original
node docs/performance/evidence/webgpu-completion-20261021/measurement/harness.mjs inspect ABSOLUTE_BUILD
node docs/performance/evidence/webgpu-completion-20261021/measurement/harness.mjs serve ABSOLUTE_BUILD ABSOLUTE_NEW_RUN 4213 2597
```

Serve používá `http://127.0.0.1:PORT`, výchozí4211. První volitelný argument má přednost před `STRAHOV_WEBGPU_QA_PORT`. Druhý volitelný API argument má přednost před `STRAHOV_WEBGPU_QA_API_PORT`, default2596. Oba porty musejí být celá čísla1024..65535 a odlišné. Koordinátor je **před startem** rezervuje a ověří skutečné listenery; existující baseline4211/API2596 a CSS experiment4212 se nepřebírají ani nemění. Host/Origin kontrola receipt endpointu se odvozuje ze skutečně zvoleného preview portu, není hardcoded4211. Proxy `/api` a `/realtime` míří na **již spuštěný vlastní** explicitní API. Readonly public assety bere z přesně ověřeného snapshotu. Nespouští ani neukončuje API, další programy nebo proces podle portu. Ctrl+C/SIGTERM zavře jen svůj preview a vlastní sockets; root ověří cleanup a ukončí svůj API samostatně. Karty otevírá pouze root přes CUA.

QA vstup URL nastaví standardní `renderBackend=webgpu`, případně `webgpu-fast` nebo explicitní WebGL reference. `profileEnvironment=1` jen pro oddělenou diagnostiku. Root ověří skutečný backend/identity a foreground. Panel měří až po standardním UI joinu a dokončeném Game.start. Není tady syntetická scéna ani generované výkonové výsledky.

`build ... translucent` je samostatný **diagnostický** A/B flag. Exact CSS transform změní pouze `.loading` background z `#eff3e6` na `rgba(239,243,230,.96)`. Default `original` CSS zachová byteově. Sidecar a buildId odliší obě varianty. Experiment testuje hypotézu compositor/canvas occlusion a není přijatou opravou runtime. Žádná browser injekce ani jiný CSS zásah.

## Uchování a ověření

Browser raw export obsahuje source/helper/buildId; sidecar tento buildId váže na skutečné bundle hashy. Receipt API vyžaduje loopback, přesný Host/Origin, JSON POST a max2MiB. Každý attemptId se zapisuje do vlastního exclusive `wx` stage, po fsync publikuje atomickým exclusive linkem a uklidí jen vlastní stage. Přesné i souběžné opakování je idempotentní, rozdílné bajty stejného ID se odmítnou a původní soubor zůstane zachovaný.

Samostatná module-owned fronta uchová **neměnné původní bajty každého neACKovaného attemptu**. Má vlastní per-attempt download a retry panel, který přežije Game dispose i rejoin; zánik předchozího QA Game panelu jeho zálohy nemaže. Fronta nepřijímá Game/device reference. Pending i failed přenosy blokují dependent měření. Payload se uvolní až po server odpovědi se shodným attemptId, byte length a SHA256; pouhé persisted:true nestačí. Retry posílá přesně stejné bajty a pending request se neduplikuje. Unsent počet může růst při opakovaných rejoin bez připojení; nic se tiše nezahazuje, root má obnovit přenos nebo uložit jednotlivé downloady. Jde o paměť dané stránky, ne trvalý offline outbox přes reload či zavření browseru. Nepovažovat ACK ani basicSampleGatesPassed za schválení výkonových podmínek. Server běží v ignorované root cache, operational PID se necommitují.

```powershell
node --test docs/performance/evidence/webgpu-completion-20261021/measurement/helper.test.mjs
```

Lehké helper testy ověřují exactonce/drift v aktuálním UI/CSS, původní rejection a pořadí teardown, observer faults, identity/source drift, immutable receipts a request/array/byte bounds. Jejich fixture důkazy jsou výslovně testovací; nejsou fake GPU měření. Neotevírají browser, port nebo server a čistí jen vlastní nové dočasné adresáře uvnitř tohoto prefixu. Build, serve a praktickou GPU přejímku provede root odděleně.

## Volitelný společný QA transit clock

Rozhodnutí je v sousedním `research/controlled-transit-clock.md`. Default bez posledního config argumentu nic nemapuje a browser neimportuje novou Simulation přes clock adapter. Explicitní JSON soubor musí být absolutní cesta v rootově validation cache a mít pouze tyto položky:

| Pole | Kontrakt |
|---|---|
| `schemaVersion` |1|
| `scenarioEpochUTC` |E0: bezpečný nezáporný integer UTC z vědomě zvoleného scénáře, GTFS provenience patří root protokolu|
| `armAtUTC` |A: předem daný budoucí integer UTC; během běhu se nepřepisuje|
| `benchmarkAtUTC` |Volitelné B>A pro jednorázový planned benchmark|
| `latenessToleranceMs` |Povinné s B, předem pevně dané0..1000ms; bez B nesmí být přítomné|

```powershell
node docs/performance/evidence/webgpu-completion-20261021/measurement/harness.mjs build ABS_SNAPSHOT ABS_NEW_BUILD clock-cm original ABS_CLOCK_JSON
node --import tsx docs/performance/evidence/webgpu-completion-20261021/measurement/server-bootstrap.mjs ABS_BUILD ABS_NEW_PROOF_DIRECTORY 2597
node docs/performance/evidence/webgpu-completion-20261021/measurement/harness.mjs serve ABS_BUILD ABS_NEW_RUN 4213 2597
node --import tsx --test docs/performance/evidence/webgpu-completion-20261021/measurement/helper.test.mjs docs/performance/evidence/webgpu-completion-20261021/measurement/clock.test.mjs
```

Root vyhradí dostatek času od vytvoření manifestu přes build a startup až po **30s settling před A**. Pozdní server/browser instalace se výslovně odmítne; původní config se neposouvá. Root vytvoří nový čerstvý běh/config, nikoli nový arm v existující Simulation. E0 je mezi porovnávanými běhy stejný; absolutní A/B a proto configId se mohou lišit, ale B−A a lateness policy musejí být shodné. Uvnitř jednoho běhu server a klient vyžadují přesně stejný config ID/SHA. Raw config bajty se kopírují exclusive do build directory, hashuje se jak původní soubor, tak canonical config; jsou součástí buildId. Před/po build se kontroluje i původní config soubor.

Při loadBuild se také přímo ověřuje shoda ověřeného manifest.snapshotId s identity.sourceSnapshotId. Nestačí samostatně platný manifest jiného snapshotu. Embedded identity.clock.config musí po normalizaci obsahově souhlasit s ověřenými config bajty/canonical ID, Simulation SHA se kontroluje proti stejnému manifestu. Negativní CPU fixture odmítají podvrženou source identitu i rozporný embedded clock, bez spuštění serveru.

Čistá immutable mapa je E0+max(0,t−A). Před A stojí jen transit; po A jde reálnou rychlostí. Server bootstrap obalí přesnou snapshot `Simulation.prototype.tick` před native importem server/index se stejným registrovaným tsx module graph. Browser explicitní Vite adapter importuje tentýž snapshot module ID jako Game a instaluje stejný tick wrapper před Game.start; zároveň mapuje původní Game.trafficInstant pro render. **Jen skutečný MP** je povolený, Guest start se v této QA variantě odmítne před instalací, aby jeho trafficInstant→sim.tick větev nemapovala dvakrát. Ostatní porty a buildy se nepatchují. Date, TimelineSimulationClock, NetworkTimeline, packet Authority/Motion/inputEpoch/ack/replay timestamps a fixedtimestep zůstávají beze změny. Wrapper mění jen transit argument, zachovává receiver, return a původní throw; single-owner registry zakazuje dvojí instalaci.

Browser owner má vlastní abort/retirement guard před i po asynchronním importu. Abort uvolní už instalované hooky i v mezeře před publikací výsledku callerovi; observeStartup po await případného pozdního ownera ještě uvolní a nikdy nespustí původní Game.start na retired Game. Dispose i pouhý rejoin během importu zachová AbortError receipt, původní import rejection zůstává totožný. Deferred import nemůže ponechat pozdní prototype wrapper blokující další Game.

Node bootstrap před importem snapshot modulů nastaví cwd na přesně identity.snapshot. Vyjmenovaná launch policy vyprázdní serverový Linear credential bez čtení/výpisu zděděné hodnoty, izoluje FEEDBACK_DIR do vlastního proof/feedback, odstraní STATIC_DIR (API-only), nastaví NODE_ENV=production, HOST/PORT a STRAHOV_SOURCE_SNAPSHOT_ID z ověřeného manifestu. Zděděné prostředí se nevypisuje. Proof ukládá jen booleany/cesty a source ID. Koordinátor výslovně povolil normální původní server diagnostics v owned snapshot/.cache/game-diagnostics; source vstupy zůstávají neměnné a skutečný scanner se neobchází. Zbytek QA proof/feedback/logů patří vlastní validation cache. Pure launch-plan test neprovádí změnu cwd/env ani server import.

Každý hook vede jen scalar counters/poslední původní a mapovaný UTC, pre/postarm, rewind, počet skutečně viděných instancí a receiver nesoulady. V hot path nevzniká log/JSON/pollovací timer. Browser snapshot dokládá `actualSimulationMatches` a skutečné physics/render calls. Clock snapshot sám nevolá trafficInstant a nezvyšuje render důkaz uměle. Zero physics calls nebo jiná třída/import jsou neplatné, nikoli důkaz dobrého aliasu. Node proof má source/helper/config/Simulation SHA a `observedServerHook`; initial installed proof s0calls je výslovně nepotvrzený. Po server importu je další immutable proof; root může **mimo benchmark** poslat na stdin vlastního procesu řádek `proof` a získat další immutable snapshot. Při normálním process exit vzniká terminal proof; při násilném kill jeho doručení garantované není, proto root pořídí requested proof před shutdown. Import bootstrap modulu v testu nic nespustí; CLI guard je nutný.

Po receipt ACK startupu může root stisknout `Naplánovat jediný 10s benchmark UTC`. Jde o jediný harness timer. Běžná Game ani startup smyčka se nemění. Callback uloží plánovaný/actual start a lateness, před skutečným startBenchmark lateness ověří znovu. Pozdní/časný callback, dispose při čekání nebo nedostatečný settling se uloží jako neplatný attempt s prázdnými arrays a bez vymyšleného FPS. Nejde o novou campaign/frame scheduler vrstvu. Když je B nakonfigurované, ruční benchmark zůstane funkčním důkazem, ale jeho comparability gates výslovně neprojdou.

Clock CPU fixtures používají skutečný Simulation/Rapier a skutečné transit sampling: porovnávají cache/extrapolaci/create/remove/rewind proti přímo mapované referenci, stejná vozidla/render obstacles, původní Timeline packet/replay hodnoty, defaultoff/Guest/lifecycle a one-shot timer faults. Nejde o Node server, GPU kompilaci, plynulost, multiplayer přejímku ani identické render framy. Root musí prakticky potvrdit oba skutečné import hooky a stejné nastavení kvality/viewportu/počasí/route/teplot. Ani stejné E0 neznamená shodný draw list nebo door/wheel/LOD sampling při různém FPS.
