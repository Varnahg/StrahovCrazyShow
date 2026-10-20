# KEY-53: reprodukovatelné měření produkční hry

Tento samostatný QA harness nevnáší optimalizaci do hry. Používá přesný zmrazený runtime, jeho původní Vite produkční konfiguraci, server, skutečné assety, fyziku, HUD a avatarové renderery. Jediný buildový transform přidá import a volání `installTransitQA(g)` po skutečném dokončení Game startupu. Původní snapshot source soubory se nemění. Úplný transformovaný UI soubor a vyřešený virtuální modul se ukládají vedle buildu spolu s SHA-256 manifestem. Transform selže při chybějícím nebo nejednoznačném vstupním bodu.

## Volba scénáře a omezení

Primární podklady: `Game.trafficInstant`, `Game.startBenchmark` a callback dokončeného benchmarku, produkční UI startup, `TransitRenderer.update`, `AvatarPrimitivePool.pruneUnused`, SDK session/join kontrakt v serveru a integračním skriptu. Doprava nepoužívá `timeOverride`; proto QA instance výslovně zmrazí zvlášť dopravní hodiny i osvětlení. Globální `Date` ani serverové hodiny nepřepisuje.

Funkční průchod reálným jízdním řádem našel 12 ambientních cestujících v okruhu 140 m od původního spawnu x110/z12 při `2026-10-20T13:25:00Z`. Datum patří do skutečné platnosti feedu 10.–23.10.2026. Jde o herní fiktivní cestující, ne živé PID polohy. Používá se pevné nulové QA počasí, medium, kamera yaw -1.4/pitch0.1/distance8. Výběr času je výslovná reprodukční fikce. Avatarové animace a běžný render loop dál běží.

Zvažované alternativy: náhodný současný okamžik může nemít aktivní kohortu; teleport mění serverovou fyziku a geometrii testu; samostatná redukovaná scéna neověřuje náklady celé hry. Zvolený normální multiplayerový spawn a uložený platný čas nepotřebují změnu gameplay. Profilování přes browserový inject nebo CDP se nepoužívá. Tlačítka jsou součást výslovného lokálního QA buildu.

Hlavní uživatelská UI relace musí vstoupit do normálního multiplayeru jako první. Tlačítko připraví dvě další **skutečné Colyseus SDK relace** se dvěma rozdílnými avatary; ty jsou ve stejném světě a dostávají skutečné motion/presence zprávy. Bez tří relací/rozdílných avatarů, správné kohorty, viditelné karty a zdravého rendereru měření selže. Projekce NPC se ukládá ze skutečné kamery; její přítomnost sama neprokazuje nepřekrytý viditelný obraz, který musí root ověřit screenshotem/praktickou CUA kontrolou.

## Příkazy

Ze správné pracovní kopie, po získání zdrojové rezervace `perf-transit-runtime-validation-20261020` a potvrzení, že neběží jiná náročná práce/scéna:

```powershell
node docs/performance/evidence/transit-calendar-20261020/measurement/harness.mjs build ABSOLUTNI_SNAPSHOT baseline
node docs/performance/evidence/transit-calendar-20261020/measurement/harness.mjs create-campaign EXPLICITNI_JEDINECNE_ID
node docs/performance/evidence/transit-calendar-20261020/measurement/harness.mjs serve ABSOLUTNI_VRACENY_BUILD_DIRECTORY ABSOLUTNI_CAMPAIGN_JSON A1
```

`build` zkontroluje všechna snapshotová hashovaná data před i po buildu. Výstupy jsou výhradně pod `.cache/performance-transit-measure-20261020/builds/`; původní `dist` se nepřepisuje. Výchozí veřejné assety se nekopírují znovu, preview je čte z ověřeného neměnného `public/` daného snapshotu. Žádné zdrojové hardlinky se nevytvářejí. Build dostane jedinečný adresář a původní pokus zůstává zachovaný i při selhání.

`create-campaign` vytvoří jediný explicitní immutable manifest a adresář pod `.cache/performance-transit-measure-20261020/campaigns/ID/`. Ten vlastní všechny starty/pokusy právě této kampaně; nehledá se globální poslední výsledek. `serve` vyžaduje tento přesný manifest a jeden slot A1/B1/A2/B2/A3/B3, každý proces dostane vlastní jedinečné startId. Používá pouze loopback porty4209 a2595, jejichž obsazenost předem ověří. Spouští vlastní server jediným Node procesem přes `--import tsx`, PID zaznamená. Výstup uvádí přesnou URL `http://127.0.0.1:4209`; HTTP stav `/__transit-qa/status` uvádí i campaignId/startId. Žádný browser nespouští ani neovládá.

Ukončení SIGINT/SIGTERM nebo same-origin JSON POST na `/__transit-qa/stop` s přesným `{campaignId,startId}` provede omezený cleanup. Již terminální SDK relace nečekají na druhý onLeave; živé mají nejvýše1.5s na leave, poté se uzavře vlastní spojení. API dostane ukončení a nejvýše1.5s na potvrzený exit, poté případně SIGKILL a další1.5s; preview uzavře pouze vlastní sledované sockety do1.5s. Všechny větve uklidí server/preview i po chybě peera a zapisují `cleanup.json`; nepotvrzený exit se nevydává za úspěch. Automatické reconnecty QA peerů jsou vypnuté, jejich výpadek je neúspěšná podmínka. Cizí PID se nepoužívají.

Root přes vlastní CUA kartu:

1. Otevře přesnou URL, ověří identitu buildu, standardním UI vstoupí do multiplayeru jako první hráč. Zkontroluje zachovaný HUD a odlišné avatary.
2. Klikne **Připravit scénář**, vyčká20s automatického warmupu a stavu `ready`. Ověří počet12NPC, aspoň3avatary, GPU, CSS/backbuffer a obraz.
3. Klikne **CPU profil 3×10 s**. Jde o tři běžné10s `Game.startBenchmark` intervaly s1s mezerami. Wrapper existuje jen po dobu každého profilu na instance metodách `TransitRenderer.update` a `pool.pruneUnused`; vrací původní výsledek a v `finally` měří CPU wall time. Ukládá omezené raw časové řady. Po intervalu nebo chybě vrátí původní metody.
4. Klikne **Plain FPS 3×10 s**. Použije jen původní benchmarkové sondy hry; žádný přidaný transit/prune profil není aktivní. Uloží raw `benchmark.frames`, nikoli vyhlazené číslo z HUD.
5. **Vypsat stav a výsledky** ukáže read-only identitu, poslední soubor a skutečný stav. Každé měření nejprve registruje `begin.json` pod konkrétním startem a attemptId. Server následně ukládá úplný raw `received.json` přes `wx` **i při zamítnuté validaci nebo pozdním odpojení peera**; verdict obsahuje důvody. Opakované odeslání stejného attemptId/obsahu vrátí první záznam, jiné bajty pod stejným ID odmítne.
6. **Vypsat celý raw export** nabídne odkaz ke stažení úplného zachovaného JSON všech klientských pokusů. Export se zachová před prvním HTTP pokusem. Při transportní chybě má stav `transport-failed-export-available`; root jej musí uložit před zavřením karty. **Znovu odeslat poslední raw** idempotentně zkusí uložit tentýž pokus, nic znovu neměří. Při nemožnosti odeslání lze browserový export uložit do vlastního cache a příkazem níže zachovat jako výslovně neúspěšnou evidence bez současného serverového potvrzení; nesmí vstoupit do přijatých statistik.

Ovládací panel je sbalitelný a při začátku každé série se automaticky sbalí. Pro další akci se rozbalí stejným viditelným ovladačem. Malý identifikační proužek zůstává, běžný HUD a obraz jsou viditelné. Export používá Blob URL; při vytvoření nového exportu i odchodu ze stránky se předchozí URL uvolní. Preflight odhalil zamrznutí UI po vložení přibližně20MB JSON do textarea; původní úspěšně uložená raw data i následný timeout jsou zachované. Tato úprava se ověří prakticky před finální A/B dvojicí, která musí používat shodný nový hash harnessu.

```powershell
node docs/performance/evidence/transit-calendar-20261020/measurement/harness.mjs recover-export ABSOLUTNI_CAMPAIGN_JSON PRESNE_START_ID ULOZENY_BROWSER_EXPORT_JSON
```

Minimální a jediná přijatelná metoda je **A1/B1/A2/B2/A3/B3**, šest samostatných startů stejných scénářů se stejným browserem/GPU/oknem. V každém startu proveď právě jednu přijatou skupinu CPU profil3×10s a jednu přijatou skupinu PlainFPS3×10s. Pro každý mode musí samostatně vyjít přesné pořadí šesti slotů; oba modes jednoho slotu pocházejí ze stejného skutečného startId. Duplicitní pokusy, kopie cest, nadbytečné přijaté skupiny, smíchané módy nebo pouze dvě opakování tuto přejímku nesplní. Neúspěšné pokusy/starty se uchovají odděleně, nesmí zastoupit přijatou skupinu. Root zavře vlastní měřicí hru do menu/kartu před výměnou serveru. Update čas je inkluzivní včetně prune a wrapper overheadu, prune je vnořený a nesmí se přičítat k update. Nulový počet prune v ustáleném kandidátu neznamená nulovou celkovou cenu rendereru.

## Identita a přijetí

`identity.json` obsahuje hash všech snapshotových vstupů včetně testů, hash společného harnessu/scénáře a transformu, verze závislostí i každého výsledného bundle souboru. `inspect BUILD_DIRECTORY` kontroluje neporušenost harnessu/bundlu před spuštěním. Stejný hash osmi provozních zdrojů harnessu musí být v A i B; do vyřešeného modulu se liší pouze identita měřeného buildu. Novější společný main vyžaduje novou dvojici zmrazených A/B zdrojů; předběžný starý snapshot nelze porovnávat s kandidátem obsahujícím cizí mezilehlé změny.

Každý raw interval obsahuje CPU/FPS scope, skutečné GPU, CSS/DPR/backbuffer, kamera matrix, kvalitu, počasí, skutečné avatarové profily a polohy,12NPC s projekcí a LOD, pool/scene počty, zdraví rendereru, checksum semantických dopravních vstupů před/po. Při změně kohorty, skryté kartě nebo změně rozlišení interval selže. SDK peer metadata jsou bez session/resume autentizačních tokenů.

Přijetí vyžaduje srovnatelné opakované skutečné CPU časy a praktický plný obraz; nelze je nahradit samotným počtem vynechaných sweepů. FPS/p95/p99 uvést jako celé výsledky; malý CPU přínos nemusí měřitelně zvýšit GPU-limitované FPS. Semantické/lifecycle regrese create/remove/replace/dispose provádí runtime worker v jeho rezervovaných testech, nezaměňovat s ustáleným profilovacím intervalem.

Lehké regrese pomocníka:

```powershell
node --test docs/performance/evidence/transit-calendar-20261020/measurement/harness.test.mjs
```

Po A1/B1/A2/B2/A3/B3 lze vytvořit předem deklarované důkazy `baseline.json`, `candidate.json`, `comparison.json`:

```powershell
node docs/performance/evidence/transit-calendar-20261020/measurement/package-evidence.mjs ABSOLUTNI_CAMPAIGN_JSON
```

Assembler nepřijímá ručně vybrané raw cesty. Projde úplný explicitní campaign adresář, hashne manifest/starty/registry/raw/cleanup/logy a odmítne neznámé soubory nebo duplicitní identity/cesty. `baseline.json` a `candidate.json` zachovají **acceptedRecords i failedRecords** celé včetně partial raw a důvodů; chybějící receipt zůstane evidovaným selháním. Failed/partial/recovered pokusy nikdy nevstupují do statistik. Comparison obsahuje úplný inventář, selhání startů, chybějící raw a výsledek samostatného ověření každého módu. Nepotvrzený cleanup nebo chybějící raw zabrání přijetí.

Samostatně se uvedou všechny jednotlivé FPS/p95/p99 a CPU série bez odstranění outlierů, skutečné pořadí podle serverové registrace, jediný společný harness, rozdíly zdrojů a shoda podmínek/semantiky. Tolerance: kamera/actor1cm, peer3cm, view matrix0.02, projection1e-6. Generovaná ID nových serverových relací/kamer nejsou fyzická podmínka. Nesplněný příznak zůstane v důkazu false a assembler vrátí exit2; není to přijetí. Předem existující finální soubory se nikdy nepřepíší.

Zatím ověřené:13/13 cílených testů a syntax Node24; jde o funkční/light regrese, nikoli výkonový důkaz. Produkční build, UI průchod a timed CPU/GPU A/B ještě vyžadují přidělené validační okno. Tento dokument sám netvrdí naměřený přínos.
