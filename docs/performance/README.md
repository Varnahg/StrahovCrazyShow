# Výkonový audit plné aplikace

Výsledek patří konkrétnímu otisku zdrojů a podmínkám běhu. Změna klienta, serveru, fyziky nebo assetu vyžaduje nový snapshot; stará čísla se nepřenášejí. [Aktuální stav a historické výsledky](../verification.md), [přejímkový cíl](../acceptance.md). Tento návod neurčuje běžící testovací URL.

## Izolace a identita

Před přípravou rezervuj vstupy/výstupy a zdroje podle [koordinace](../agents/README.md): `heavy-validation`, pro GPU také `gpu`, pro build `workspace-build` a každý port zvlášť. Ověř skutečné procesy i 3D scény. Uživatelský tab a hranou verzi neměň. HMR karta není izolovaný produkční test.

Z kořene vytvoř nový snapshot (příklad jména):

```powershell
node scripts/performance-snapshot.mjs audit-YYYYMMDD-a
Set-Location .cache/performance-snapshot/audit-YYYYMMDD-a
```

[Skript](../../scripts/performance-snapshot.mjs) porovná vstupní SHA-256 před/po kopírování a v kopii. Obsahuje runtime, assety, testy, manifest/lockfile a explicitní dokumentační fixtures; vývojová evidence mimo seznam se nekopíruje. Neshoda nebo neúplný snapshot není základ měření. Závislosti jsou připojené z pracovního prostředí, proto zaznamenej i jejich instalaci z frozen lockfile.

Následující build spusť v adresáři právě vytvořeného snapshotu. Sváž klienta s jeho manifestem. Snapshot používá junction již nainstalovaných závislostí; přímé Node CLI zabrání nečekané reinstalaci a native config loader nezapisuje Vite cache do vypůjčeného node_modules:

```powershell
$env:VITE_SOURCE_SNAPSHOT_ID=(Get-Content -Raw source-manifest.json | ConvertFrom-Json).snapshotId
node node_modules/typescript/bin/tsc --noEmit
if ($LASTEXITCODE -ne 0) { throw "TypeScript kontrola selhala." }
node node_modules/vite/bin/vite.js build --configLoader native
```

Ověř úspěšný exit také u buildu. Změní-li se zdroj nebo test, vytvoř novou kopii; už hrané zdroje se nepřestavují. V odděleném terminálu z kořene repozitáře přejdi do stejného snapshotu a spusť vlastní server:

```powershell
Set-Location .cache/performance-snapshot/audit-YYYYMMDD-a
$env:PORT='2570'
$env:STRAHOV_PERF_TELEMETRY=(Join-Path (Get-Location) 'server-telemetry.jsonl')
node --import ./scripts/performance-server-preload.mjs --import tsx server/index.ts
```

V dalším terminálu stejného snapshotu spusť `node scripts/performance-preview.mjs`. [Preview](../../scripts/performance-preview.mjs) má výchozí **127.0.0.1:4175**, API **2570** a strict port; `STRAHOV_PERF_PREVIEW_PORT` / `STRAHOV_PERF_API_PORT` umožňují jiné předem rezervované porty. Preview API server samo nespustí a zakazuje dev kombinaci 5173/2567. Ověř skutečnou URL, source identity a načtené assety, nikoli jen jméno složky.

## Skutečné síťové relace

[performance-network.ts](../../scripts/performance-network.ts) importuje současný `PROTOCOL_VERSION` (**11**) a používá [ScriptTimelineClient](../../scripts/timeline-client.ts) se serverovými tick/epoch authority. Starý popis protokolu 2 a pevného počtu příkazů v batchi není kontraktem současného harnessu. Následující síťové příkazy spusť v adresáři vytvořeného snapshotu.

```powershell
node --import tsx scripts/performance-network.ts http://127.0.0.1:2570 30 30 crowded network-30-crowded.json 3
node --import tsx scripts/performance-network.ts http://127.0.0.1:2570 100 30 distributed network-100-distributed.json 50
```

Argumenty jsou endpoint, počet botů, délka záznamu, layout, výstup, warmup a volitelná očekávaná populace. Samotné označení `distributed` neprokazuje rozptýlení: ověř pozice, dráhy a obálku v JSON. Harness odmítá dev server 2567, kontroluje populaci přes autentizované motion zprávy a měří skutečný postup ticku, vstupy/ack, resync a chyby. Veřejný `/api/health` populaci nevydává.

Pro browser + 99 botů použij poslední argument `100`, např. `99 180 crowded network-99-browser.json 15 100` za endpointem. Renderová syntetická skupina se nevydává za skutečné relace. Před další kohortou respektuj serverový limit vydávání relací; port ani limit neopravňují ukončit cizí proces.

## Produkční GPU přejímka

Použij celou hru s HUD, reálnými relacemi a různými avatary. Zaznamenej:

- Zdrojový hash/manifest, příkazy, časy, délku/warmup a počet opakování; browser/verzi, CPU, skutečný GPU adaptér/ovladač, napájení a další zátěž.
- Skutečný backend, CSS viewport, DPR a interní backbuffer. Nízká/adaptivní kvalita může měnit interní rozlišení; cílová FPS nejsou naměřená FPS.
- Kvalitu, kameru/místo, den/noc, skutečný UTC čas, počasí a případný explicitní QA fixture. Pro A/B drž srovnatelné podmínky.
- Skutečnou síťovou populaci i počet zobrazených avatarů, ambientní NPC, chyby assetů/shaderů/pipeline a připravenost scény.
- Kompletní původní benchmark JSON: snímky, skutečné trvání, FPS, p95/p99 dob snímků a screenshot celé scény/HUD. Kvantily nepřepočítávej ze zaokrouhlených HUD FPS.

Po dokončené přípravě nech scénu zahřát; opakovaná série používá alespoň 3×10 s, pro srovnání 1/30/100 relací a hustou/rozptýlenou scénu, vždy s uvedenými podmínkami. Projdi také B6 a nádvoří. Změna kvality vyžaduje nové ustálení. Jediný krátký pohled neprokazuje plynulost celého světa.

**WebGL2 je default.** WebGPU (`renderBackend=webgpu` / `webgpu-fast`) je explicitní loopback QA; platnost vyžaduje příslušné health/readiness gates a metodiku [WebGPU workflow](webgpu-migration.md). Timeout přípravy nebo neplatný health není FPS vzorek. Úspěch CPU/NullEngine ani snížený počet draw calls není GPU zrychlení.

Cíl 60 FPS na GeForce GTX 1060 za dne a s davem zůstává otevřený; výsledky jiného adaptéru nebo rozlišení jej neuzavírají. Historické Intel série mají vlastní přísnější limity a omezení v odkazované evidenci.

## Význam serverových čísel a uložení

CPU znamená proces serveru vůči jednomu jádru; 100 % = jedno jádro. `tickHzObserved` vychází z přijatých ticků a monotónního času. Downlink počítá Colyseus zprávy, bez WS/TCP/IP/TLS hlaviček jde o spodní hranici provozu. Ack age není ping ani čas do pixelu. `monitorEventLoopDelay` je serverové vzorkování, nikoli interval renderových snímků. Loopback bez latence/ztrát neprokazuje internetové chování.

Po ukončení měření se z adresáře snapshotu vrať do původního kořene repozitáře. [Reportér](../../scripts/performance-report.mjs) odtud zpracuje výstupy:

```powershell
Set-Location ../../..
node scripts/performance-report.mjs .cache/performance-snapshot/audit-YYYYMMDD-a docs/performance/evidence/audit-YYYYMMDD-a
```

Výstupní adresář musí patřit rezervovanému tasku. Uchovej neúspěšné/vyloučené pokusy i původní raw data. Ukonči pouze vlastní server/boty/preview, ověř cleanup a předej důkazy. Uživatelské diagnostiky zůstávají místní.

## Historický kontext

Následující původní předintegrační výsledky jsou z 10. 10. 2026. Popisují tehdejší snapshot/harness a jeho limity, nikoli současný protokol, stav KEY-48 nebo aktuální GPU výkon.

## Předintegrační serverová evidence

Snapshot `7c47a4c6d47f6c42a346799bcbd5e69d29c7699d20c04c0a91092c7450396580`, [raw evidence](evidence/preintegration-20261010-a/summary.json), Node 24.19.0, Windows, Intel Core i7-8750H (6 jader / 12 vláken). Na stroji jsou Intel UHD 630 i NVIDIA GTX 1060; následující čísla jsou serverový test a žádný adaptér se jím neověřuje.

| Měřená varianta | Tick / s | Motion / s | CPU jednoho jádra | Downlink jednoho / všech | Ack p95 | Resync / chyby |
|---|---:|---:|---:|---:|---:|---:|
| 30 pohybujících se, 30 s | 60,023 | 19,999 | 17,72 % | 61,667 kB/s / 1,850 MB/s | 50,372 ms | 0 / 0 |
| 100 pohybujících se, 30 s | 59,996 | 20,000 | 34,75 % | 195,959 kB/s / 19,615 MB/s | 57,745 ms | 0 / 0 |
| 100 připojených rozptýlených, 87 pohybujících se, 30 s | 59,307 | 19,260 | 47,18 % | 186,676 kB/s / 18,666 MB/s | 290,865 ms | 400 / 0 |

Všichni testovaní účastníci byli ve stejném světě. V prvních dvou variantách se každý skutečně pohyboval. Zprávy obsahovaly přesně 30, respektive 100 řádků. Vstupy dosahovaly 60 příkazů/s v 30 batchech/s. Síťový výstup roste téměř kvadraticky, protože celý pohybový seznam dostává každý účastník. To je konkrétní hranice současné architektury; úspěšná simulace stovky na loopbacku není důkaz dostatečného veřejného uplinku.

Rozptýlená varianta měla reálnou obálku x 24–256 m a z −11–30 m. Třináct botů uvízlo při jednoduchém řízení k cíli; tuto variantu tedy nelze vydávat za sto současně pohybujících se klientů. Zaznamenala p95 intervalu motion 79,439 ms, maximum 353,589 ms a 400 autoritativních resynchronizací. Event-loop maximum dosáhlo 243,532 ms. Současně se na stroji sestavil frozen produkční klient (Vite build trval 2,08 s); běžel také další vývoj. Příčina jednotlivých prodlev není tímto měřením izolovaná. Výsledek dokládá citlivost vůči prodlevám, **nikoli splnění požadavku na stabilitu**. Finální audit má tuto scénu zopakovat bez sestavování a prověřit důsledky `MAX_CATCHUP_STEPS` a resetování front při zahazování času.

Frozen produkční sestavení prošlo. Browser/GPU měření bylo záměrně odloženo na dokončení následné integrace; pro tuto verzi není zaznamenané žádné FPS ani tvrzení o 30 FPS na Intel UHD 630.

Tyto výsledky **nepatří pozdějším úpravám vozidla, avatarů, grafiky ani klienta**. Finální integrovaná verze vyžaduje další freeze a samostatné GPU měření.

Novější historický [integrovaný audit D](integrated-20261010-d.md) obsahuje skutečné Intel UHD 630 výsledky pro 1/30/100 připojených účastníků, kompletní raw evidence, neplatný populační přechod na high a otevřené problémy. Ani jeho čísla se nepřenášejí na následné integrační opravy.
