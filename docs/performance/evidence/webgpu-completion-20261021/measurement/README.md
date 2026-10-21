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

## Rozhodnutí před implementací weather/latency rozšíření

21.10.2026, delegovaný celek nad589b098c. Root uchoval přesných12 source souborů helperu07b3e1cd v immutable vlastní validation kopii; běžící f511d0ab se nepřestavuje. Nové možnosti vyžadují čerstvý build. NCM30s timeout na6/15 stages a285sync/0async je reprodukce, nikoli důkaz dominance konkrétního GPU fence. Níže zvolená diagnostika nesmí měnit readiness, timeout, scheduler nebo obsah scény.

| Varianta | Náklad/riziko | Rozhodnutí |
|---|---|---|
| Zachovat živé počasí + readback | Bez fixture nákladů, ale různé backend starty nemají garantovaný stejný stav | Ponechat jako default, nestačí pro řízené srovnání |
| Přepsat Game weather po ready | Rychlé, ale startup by připravoval jiný stav a UI refresh by jej přepsal | Nezvoleno |
| Build-bound immutable preview fixture | Jediné čtení JSON a původní middleware; raw/emitted provenance/SHA, stejné numeric/layers/winds | Zvoleno podle existujícího performance-preview, defaultoff |
| Přidat vlastní popErrorScope/fence nebo další await | Změní počet/pořadí synchronizací a měřený mechanismus | Odmítnuto |
| Pouze celkový startup čas | Nejmenší režie, nerozliší původní scope versus queue completion | Dosavadní důkaz zachovat, doplnit úzký observer |
| Obalit dvě původní instance metody a pozorovat jejich native Promise | Dvě reaction handlers na zachycený call, scalar buffers a timestamp reads; měří completion wall latency včetně browser scheduling | Zvoleno pouze explicitně diagnostic |

CLI zachová staré positional loading/clock vstupy; nové named flags budou `--weather ABS_JSON` a `--startup-latency`, duplicity/unknown args se odmítnou. Weather input je explicitní omezený JSON ve vlastní validation cache, raw i emitované bytes se hashují a vážou na build/run. Numerická pole včetně wind0.9/cloud0.86 a nested layers/winds se nekorigují, nezaokrouhlují ani nevyjasňují. Mění se jen stejné QA/fallback labely jako v původním preview mechanismu. Default bez fixture nezasáhne weather proxy.

Observer bude mít společný cap4096 původních volání přes obě metody, výrazně nad typickým řádem236submitů. Předalokované numeric/status buffers mají konečnou velikost; raw trace obsahuje jen scalar tuples a per-channel souhrny, nikoli GPUError/Promise/device/Game objekty. Odhad trace je několik set KiB, nikoli navyšování2MiB receipt limitu. Overflow/unsupported output/ownership/clock chyba zneplatní úplnost a zůstane v důkazu; původní volání pokračují. Pending calls při stop se označí jako nedokončené. Reakce po stop již nemění sealed trace ani jiného ownera.

Každá metoda vrátí původní Promise a zachová receiver/argumenty/původní sync throw. Observer nevolá metody navíc, nečeká na ně a neposílá health report. Pozorování se vztahuje na všechna původní volání vlastního device/queue během Game.start, včetně případných Babylon shader scopes; není automatickou identifikací call site. Terminal/dispose/rejoin obnoví pouze dosud vlastněné instance wrappery. Oba kanály jsou oddělené a všechny takové buildy/receipts označené diagnostic; plain FPS cesta zůstává neinstrumentovaná.

### Použití nových explicitních variant

```powershell
# Weather-only plain: observer zůstává vypnutý, clock není přidán.
node docs/performance/evidence/webgpu-completion-20261021/measurement/harness.mjs build ABS_SNAPSHOT ABS_NEW_BUILD weather-plain original --weather ABS_WEATHER_JSON
# Samostatný diagnostic startup; starý positional clock argument zůstává platný.
node docs/performance/evidence/webgpu-completion-20261021/measurement/harness.mjs build ABS_SNAPSHOT ABS_NEW_BUILD startup-latency original --weather ABS_WEATHER_JSON --startup-latency
# Pokud je clock potřeba, lze jej zadat také pojmenovaně.
node docs/performance/evidence/webgpu-completion-20261021/measurement/harness.mjs build ABS_SNAPSHOT ABS_NEW_BUILD clock-weather original --clock ABS_CLOCK_JSON --weather ABS_WEATHER_JSON
node docs/performance/evidence/webgpu-completion-20261021/measurement/harness.mjs serve ABS_BUILD ABS_NEW_RUN OWN_PREVIEW_PORT OWN_API_PORT
node --import tsx --test docs/performance/evidence/webgpu-completion-20261021/measurement/helper.test.mjs docs/performance/evidence/webgpu-completion-20261021/measurement/clock.test.mjs docs/performance/evidence/webgpu-completion-20261021/measurement/weather-latency.test.mjs
```

Weather/latency jsou **build flags**, ne mutable serve přepínače nebo zděděné weather env. Neznámé/duplicitní/nejednoznačné argumenty se odmítnou. Root rezervuje vlastní preview/API porty před spuštěním; výchozí4211/2596 ani existující immutable služby helper nepřebírá. Výše uvedené příkazy child nespouštěl.

Weather JSON musí být absolutní regular `.json` soubor pod rootovou `.cache/webgpu-completion-20261021/validation/`, nejvýše64KiB, fatal UTF-8 a známý `shared/weather.ts` tvar. Symlink file, únik přes cestu, neznámá pole, chybějící povinná data, neplatná čísla a numericky ztrátový JSON roundtrip se odmítnou. Volitelné hodnoty se nedoplňují ani neclampují. Přesné původní `weather-source.json` a emitované `weather-emitted.json` vzniknou exclusive v novém build adresáři. Jejich SHA, byte length a explicitní provenance jsou v browser/build/run identity i buildId vedle transformů a bundle SHA. `inspect`, bootstrap a `serve` ověří raw/emitted bytes/provenance znovu; zdrojový vstup je ověřen i po buildu. Middleware vrátí jen dřívější přesnou `/api/weather` route s `no-store`; ostatní API a default bez fixture pokračují původní proxy cestou. Game dostává fixture před svým původním startupem/refresh, ne dodatečným přepsáním instance. Panel a původní weather UI uvádějí uložený QA/fallback zdroj. Browser freshness aging může po čase změnit stale metadata; root porovnává také skutečné weatherAtStart/End, nikoli pouze fixture SHA.

`--startup-latency` je vždy diagnostic, včetně případného pozdějšího benchmarku ze stejného buildu. Instalace probíhá před původním Game.start, výstup pouze jednou v terminal startup raw `startupLatency`. Během měření nevzniká periodický trace dump. `device.popErrorScope` a `queue.onSubmittedWorkDone` mají nezávislé čítače calls/tracked/settled/pending/fulfilled/rejected/syncThrows/unsupportedResults, souhrn sync wall a completion wall ms. Řádky jsou `[sequence, channel, startAtMs, settledAtMs, completionMs, outcome, nonNullResult]`; kanály0/1 odpovídají pořadí výše. Outcome0 znamená pending při stop,1 fulfilled,2 rejected,3 původní sync throw,4 unsupported výstup. Neexportuje se obsah GPUError, rejection ani Promise/device/Game reference. Completion při reject je zahrnutá, sync throw zůstává samostatný. Pending má age při stop a není vykazovaný jako dokončená nula.

Cap4096 je společný pro oba kanály. Původní native volání pokračují i za limitem, ale `issues.overflow` zneplatní evidenceValid; byte limit receipt zůstává2MiB. CPU cap fixture ověřuje konkrétní maximální scalar export pod768KiB, nikoli předpoklad reálné GPU zátěže. Diagnostické wrappery přidávají předalokované buffers, timestamp reads a dvě Promise reaction funkce na sledované volání; jejich režie brání plain causal FPS závěru. Klasifikace příčiny vyžaduje skutečný root startup trace a korelaci s existujícími stage/pipeline údaji. Completion wall včetně browser/microtask plánování se nesmí vydávat za GPU čas nebo call-site fence dominanci.

Observer vrací původní native Promise i synchronní výjimku. Instalace/clock/unsupported/ownership chyby zůstávají scalar invalidity a nezastupují původní startup chybu. Abort/dispose/rejoin zastaví observer synchronně a terminal jej uklidí ještě před exportem; pending reactions po stop již sealed trace nemění. Pozdní terminal starého Game nemůže odebrat wrapper nového ownera. Restore vrací přesný původní vlastní descriptor nebo odstraní vlastní instance override pro inherited metodu. Cizí aktuální wrapper se neodstraňuje, konflikt se zaznamená. Metody jiné device/queue generace se nově nesledují; změna původního ownera zneplatní trace. Defaultoff nekontroluje device a nic neobaluje; chybějící API/ne-WebGPU při explicitním flagu je viditelně neplatná diagnostic evidence.

### Peer P2: rozhodnutí před opravou build identity

Reviewer doložil, že samotná validace weather bytes nestačí: odstraněné/null identity.weather přeskočí jejich větev, pokud loadBuild nepřepočítává buildId. Totéž se týká clock a diagnostic flagu. Samotný nový digest by odmítl běžný drift, ale konzistentně přepočítaný sidecar stále nemusí patřit skutečnému browser bundle. Zvolena proto jediná pure canonical projekce všech společných build vstupů (source/helper/label/loading/transforms/clock/weather/startupLatency/selected dependencies, s povinnými explicitními null/boolean), použitá při build i load. Load dále porovná původní exclusive build-input raw SHA, přesnou z něj odvozenou browser identity v resolved overlay a přítomnost stejného buildId v hashově ověřeném emitovaném JS. Skutečně ověřené source/helper/config/weather/transformed/dependency soubory musí patřit téže větvi. Dodatečná práce probíhá pouze při build/load, ne při startupu nebo měření. Nepřidává se podpisová infrastruktura ani obrana proti přepsání všech bundle; starší helper má vlastní neměnný server a tento nový kontrakt vyžaduje fresh build. Předchozí46/46 důkaz bude zachovaný odděleně.
