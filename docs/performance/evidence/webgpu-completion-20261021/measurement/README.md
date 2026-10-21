# Explicitní QA měření skutečné hry pro KEY-22

Tento malý build/serve helper navazuje na přijatý `transit-calendar-20261020/measurement` Vite postup. Nemění zdrojový snapshot, produkční renderer, readiness, timeout, světla ani stíny. Nemá browser automatizaci, CDP nebo API server. Konkrétní build/GPU výsledky sem nepatří, dokud je koordinátor skutečně neprovede.

## Rozhodnutí a hranice

Standardní recorder již ukládá `lighting-preparation` a `webgpu-preparation-profile` před kontrolou timeoutu v Game.start. Nejprve použít tyto raw záznamy. Existující transit QA panel vznikal až po ready; tady jediný exact UI transform obalí původní `await g.start()` před startem. Terminální snapshot vznikne před původním UI catch/dispose, původní výsledek nebo stejný thrown objekt se zachová i při chybě observeru. Není přidaný render, readiness check ani pipeline cache zásah. Game/device se nevystavují přes window.

Startup sampler pořídí nejvýše 180 technických snapshotů po 1 s. Skončí v obou terminal větvích. Whitelist obsahuje health/generaci/pending operations, backend/rozměry, skutečné avatar konfigurace bez přezdívek, scénové počty a existující compilation counters; shader text inventory se neexportuje. Počasí zachová všechny známé technické Weather hodnoty včetně cloudLayers/cloudWinds, vlhkosti, sněžení, fáze srážek a provenience. Standardní benchmark navíc uchová vlastní nezávislé weatherAtStart/weatherAtEnd, nikoli náhradu pozdějším scene snapshotem. Terminální raw jde do viditelného QA panelu, skrytého textového DOM exportu a download backupu, automaticky také do immutable receipt endpointu. Selhání startupu či neplatný benchmark jsou zachované důkazy, nikdy automatická přejímka výkonu.

Po úspěšném startu a přesném server ACK jeho raw záznamu panel volá existující Game metody: `setQuality`, `setTargetFps(60)`, `toggleFlashlight`, `startBenchmark`. UTC input používá stejný `timeOverride` jako vlastní UI. Ovládání je během měření a všech pending/failed transferů zamčené. Standardní Game benchmark trvá 10 s, exportuje původní raw `game.benchmark.frames` a vlastní výsledek; souběžný lehký RAF pozorovatel ukládá doručovací intervaly, nikoli GPU čas. **I plain standardní benchmark obsahuje produkční BenchmarkRenderProfile a běžné compilation/health hooks.** Helper nepřidává další profilovací wrappery. Mezi začátkem a koncem intervalu nedělá 1Hz snapshoty ani profile dumpy. Režim s `profileEnvironment=1` je označený diagnostic a nemíchá se s plain FPS páry. Odmítnutí, throw i dispose během startBenchmark mají vlastní failed raw attempt; cleanup se týká jen skutečně vytvořeného vlastního benchmark objektu a případná cleanup chyba nepřekryje původní chybu.

Různé 1Hz RAF startupy nejsou GPU FPS vzorky. Nula shader chyb neprokazuje dokončenou přípravu. Endpoint scene/draw/bundle counters nejsou intervalový průměr. WebGPU GPU timer je main-pass-only, WebGL timer může být whole-frame; nesrovnávat je jako totožný scope.

**Traffic clock se nemění.** Osvětlení timeOverride nesjednocuje dopravu; před/po počty nejsou min/max kohorty ani frustum workload. Nepočítat kauzální FPS gain z různých skutečných UTC jízd. Pohyb, počasí, kamera, teplota/takty a požadované 1/3 skutečné relace musí mít samostatný root protokol. Basic sample gates nevydávají celý KEY-22 za přijatý.

## Příkazy pro koordinátora

Nejprve rezervovat heavy-validation/workspace-build/gpu a porty podle skutečně prováděné akce. Výstupy musí být striktní potomci `.cache/webgpu-completion-20261021/validation/` v této worktree; cílový adresář musí být nový. Snapshot obsahuje testy a materiálované assety. Helper před/po build ověří každý manifestovaný soubor a vlastní helper SHA; native Vite config a původní chunk grouping zůstanou zachované. App/loaders musí používat jeden core. Identity sidecar ukládá helper/transform/dependency SHA a všechny skutečné bundle SHA.

```powershell
node docs/performance/evidence/webgpu-completion-20261021/measurement/harness.mjs build ABSOLUTE_SNAPSHOT ABSOLUTE_NEW_BUILD key22-original original
node docs/performance/evidence/webgpu-completion-20261021/measurement/harness.mjs inspect ABSOLUTE_BUILD
node docs/performance/evidence/webgpu-completion-20261021/measurement/harness.mjs serve ABSOLUTE_BUILD ABSOLUTE_NEW_RUN 4213
```

Serve používá `http://127.0.0.1:PORT`, výchozí4211. Explicitní poslední argument má přednost před `STRAHOV_WEBGPU_QA_PORT`; port musí být celé číslo1024..65535, odlišné od API2596. Koordinátor jej **před startem** rezervuje a ověří skutečné listenery; existující baseline4211 a CSS experiment4212 se nepřebírají ani nemění. Host/Origin kontrola receipt endpointu se odvozuje ze skutečně zvoleného portu, není hardcoded4211. Proxy `/api` a `/realtime` stále míří na **již spuštěný vlastní** server2596. Readonly public assety bere z přesně ověřeného snapshotu. Nespouští ani neukončuje API, další programy nebo proces podle portu. Ctrl+C/SIGTERM zavře jen svůj preview a vlastní sockets; root ověří cleanup a ukončí svůj API samostatně. Karty otevírá pouze root přes CUA.

QA vstup URL nastaví standardní `renderBackend=webgpu`, případně `webgpu-fast` nebo explicitní WebGL reference. `profileEnvironment=1` jen pro oddělenou diagnostiku. Root ověří skutečný backend/identity a foreground. Panel měří až po standardním UI joinu a dokončeném Game.start. Není tady syntetická scéna ani generované výkonové výsledky.

`build ... translucent` je samostatný **diagnostický** A/B flag. Exact CSS transform změní pouze `.loading` background z `#eff3e6` na `rgba(239,243,230,.96)`. Default `original` CSS zachová byteově. Sidecar a buildId odliší obě varianty. Experiment testuje hypotézu compositor/canvas occlusion a není přijatou opravou runtime. Žádná browser injekce ani jiný CSS zásah.

## Uchování a ověření

Browser raw export obsahuje source/helper/buildId; sidecar tento buildId váže na skutečné bundle hashy. Receipt API vyžaduje loopback, přesný Host/Origin, JSON POST a max2MiB. Každý attemptId se zapisuje do vlastního exclusive `wx` stage, po fsync publikuje atomickým exclusive linkem a uklidí jen vlastní stage. Přesné i souběžné opakování je idempotentní, rozdílné bajty stejného ID se odmítnou a původní soubor zůstane zachovaný.

Samostatná module-owned fronta uchová **neměnné původní bajty každého neACKovaného attemptu**. Má vlastní per-attempt download a retry panel, který přežije Game dispose i rejoin; zánik předchozího QA Game panelu jeho zálohy nemaže. Fronta nepřijímá Game/device reference. Pending i failed přenosy blokují dependent měření. Payload se uvolní až po server odpovědi se shodným attemptId, byte length a SHA256; pouhé persisted:true nestačí. Retry posílá přesně stejné bajty a pending request se neduplikuje. Unsent počet může růst při opakovaných rejoin bez připojení; nic se tiše nezahazuje, root má obnovit přenos nebo uložit jednotlivé downloady. Jde o paměť dané stránky, ne trvalý offline outbox přes reload či zavření browseru. Nepovažovat ACK ani basicSampleGatesPassed za schválení výkonových podmínek. Server běží v ignorované root cache, operational PID se necommitují.

```powershell
node --test docs/performance/evidence/webgpu-completion-20261021/measurement/helper.test.mjs
```

Lehké testy ověřují exactonce/drift v aktuálním UI/CSS, původní rejection a pořadí teardown, observer faults, identity/source drift, immutable receipts a request/array/byte bounds. Jejich fixture důkazy jsou výslovně testovací; nejsou fake GPU měření. Testy neotevírají browser, port, engine nebo server a čistí jen vlastní nové dočasné adresáře uvnitř tohoto prefixu. Build, serve a praktickou GPU přejímku provede root odděleně.
