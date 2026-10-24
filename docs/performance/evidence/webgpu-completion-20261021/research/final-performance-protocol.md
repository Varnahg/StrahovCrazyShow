# Navazující kontrolované měření

Jde o připravený protokol, nikoliv výsledek. Výzkum vychází z aktuálních `measurement/transit-clock.mjs`, `browser-clock.mjs`, `server-bootstrap.mjs`, `clock.test.mjs`, `scripts/capture-system-gpu.ps1` a vlastního normálního SDK driveru `validation/stationary-companions.mjs`. Čtecí peer výzkum nic nespouštěl. První skutečný clock pilot musí ověřit serverový i browserový hook, než lze přijmout další sérii.

## Pevné podmínky

- Tentýž finální frozen source včetně query lifecycle opravy `296876f4` a aktualizovaných testovacích fixtures, fresh Mesh `7ceb79d2…`, původní celé assety, Medium, HUD, CSS i interní2040×986, lokální Mia4. Source6 `2b88fe58…` zůstává předchozí diagnostika se skutečným device-loss selháním a nesmí být finální výkonový kandidát. Jediná aktivní3D scéna, žádný build či fullsuite během intervalů. GPU/driver/teploty/takty/P-state a dostupné throttle důvody zaznamenat stejným collector protokolem.
- SPAWN má ověřené normální multiplayerové pozice kolem110,12. Dva autentizovaní SDK peers používají produkční neutral inputs a presety Alex0/Robin1, spawnují blízko. Skutečné3 rendered/near avatary a stejnou kameru ověřit v původních before/after datech i obrazu; počet sessions sám nestačí.
- Zaznamenané QA počasí má stejné číselné hodnoty, není snížení obsahu. Astronomický UTC okamžik nastavovat samostatně a shodně (pro návaznost noc2026-10-20T22:00Z), svítilnu a kameru rovněž. Řízený transit clock nepřepisuje Date, síťové timestampy ani fyzikální tick.
- Základní navržená série používá neměnný helperv6/a5b3. Pozdější lifecycle helper má samostatný seal a nesmí se přimíchat do původního v6 buildu/bootstrapu. Clock-only v6 zapisuje modeplain, proto výsledky výslovně označit controlled-clock QA.

## Pořadí a čas

Nejméně tři opakování × tři backendy × dvě kohorty znamenají18 čerstvých configů/buildů/API/Game podle původní migrační metodiky. Proti jednostrannému časovému trendu:

`CM/1 → NCM/1 → GL/1 → CM/3 → NCM/3 → GL/3 → GL/3 → NCM/3 → CM/3 → GL/1 → NCM/1 → CM/1 → CM/1 → GL/1 → NCM/1 → CM/3 → GL/3 → NCM/3`.

Pro každý nový slotS použít E0=1792598400000 (2026-10-21T16:00Z), A=S+360000 a B=A+60000, stejnou latenessToleranceMs=50. Plánovaná transit fáze každého10s vzorku je16:01:00–16:01:10Z, v platném současnémGTFS rozsahu. Skutečnou lateness uvést jednotlivě. Deadline se v existujícím configu neposouvá; neplatný pokus zůstane zachovaný a dostane nový config.

Existující planner vyžaduje readyAtUTC+30s≤A, nikoli pouze≤B. B-planned má jeden použitelný interval naGame; ruční druhý vzorek nesplní comparability guard. Šest configů se dvěma ručními intervaly tedy není ekvivalentní. Na další slot vyhradit orientačně aspoň9min a nepřekrývat GPU. Tři opakování jsou minimum této přejímky, nikoli silný obecný statistický důkaz.

## Praktický pilot a každý slot

1. Vytvořit nový immutable config a build, spustit přesně odpovídající bootstrap/API a preview. Před náhradou služby ověřit vlastní PID/start/exe/listener, žádné stop podle samotného portu.
2. Browser připojit první, počkat na skutečný UI handshake/loading-off a preparationViewReleased. Pro kohortu3 spustit stávající dva neutral SDK peers a ověřit přesné3 near/visible avatary. Nejpozději A−90s mít parametry a resources ustálené.
3. Před plánováním přijmout clock proof: observedServerHook=true, jedna Simulation instance a skutečné calls, browseractualSimulationMatches=true, rostoucíphysics/rendercalls aunexpectedreceivers0, shodnéconfigId/configSHA/SimulationSHA. PředA mapování naE0, poA vztahE0+lastOriginalUTC−A. Síťový replay rewind sám není změna fyzikálního času ani automatická chyba.
4. Naplánovat interval. V [B,B+10s] neprovádět další diagnostické akce. PoACK uložit původní Game/raw RAF data, before/after health/roster/LOD, source/helper/bundle/asset identitu a serverproof mimo interval.
5. Normální odchod a skutečný STOP/teardown vést zvlášť. SDK finally během postupných leaves stále může snížit finálníminRows na2; nesmí se to zaměňovat za roster v měřicím okně. Použít UTC samples kolem okna a Game minimum avatarů.

Existující actualStartUTC je okamžik těsně před startBenchmark, nikoli UTC prvního nativeframu. Protokol dokládá shodnou plánovanou fázi a omezenou lateness, nikoliv doslova byteově shodnou první vykreslenou scénu. Zbylé clock/ambient/cache rozdíly uvést, nepřisuzovat drobný rozdíl automaticky backendu.

## Oddělená funkční přejímka B6

B6walk→leave→resume ověřovat na stejném živém API bez clock konfigurace; authority anchor je jen v jeho paměti a resume platí30min. Nová API instance jej nepřevezme. Browserem ověřená mapová trasa může sloužit budoucímu normal-input driveru, ale samotný shared planner sdefault≤4m connector neprokazuje reálné kolize. NovýB6driver nyní není nutný pro SPAWN výkonovou sérii.

## Přijetí

U každého běhu jednotlivě uvést FPS/p95/p99/hitches≥100ms, přítomné chyby a pending, skutečný backend/CM, konfiguraci, rozlišení, GPU/driver a průběžnou telemetrii. Původní60FPS/p95≤20/p99≤33.3ms cíl se při nesplnění označí nesplněný. Relativní výhra nad WebGL ani chybějící chyba v jednom vzorku jej nenahrazuje. Main/default/KEY22 se neuzavírá podle plánovacího dokumentu či mikroměření.
