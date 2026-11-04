# Ultra 50 % — aktuální předání po přerušeném ověření

Koordinátor ultra-20261104-root; D:/CodexWorkspaces/StrahovCrazyShow-graphics-20261104, codex/graphics-smoothness-20261104. Runtime checkpoint e60d33a6796d6aacc8adf39e2ca8fae5baa3964a, [draft PR41](https://github.com/Varnahg/StrahovCrazyShow/pull/41). Uživatel schválil PR a merge po dokončení; merge dosud neproběhl.

## Doložený stav

Ultra/Custom UI, resolver V2, feature gates a živá transakce jsou implementované. Review opravy a přesné cílené testy jsou ve SPEC a předáních UI, vegetation, lighting a game-tests. První dvě CI selhání byla reprodukovaná a opravila se pouze inicializace starých fixture a pět typových anotací. Finální celé CI na e60d33a6:3191 testů,3189 PASS,0 FAIL,2 SKIP; produkční build a izolovaná SDK integrace PASS. Feedback browser a source hygiene také PASS.

Výslovné následné zadání WebGL2 timeoutů je samostatně provedené v e60d33a6: jediná zvolená kvalita60s jako manuální WebGPU, bez změny readiness/submission gates;11/11 cílených quality regresí a celý místní TypeScript PASS. Není to zrychlení ani runtime WebGL2 důkaz.

Neměnný candidate2/build má source/tests74780b517048cdf304643486912d2921cd7dff88e6b0c5d7ad9007ce05b6f4c2. Ve skutečném Edge session021fdcd8-bfd5-4a2d-8100-e97eba3467a3 dosáhlo Ultra game-ready22:20:00.694UTC přes WebGPU/NVIDIA, CSS1280×720 a render640×360. Dva různí skuteční SDK peers se připojili. Přehled důkazů, raw archiv a CI odkazy jsou v [reportu](../../performance/evidence/ultra-graphics-20261104/README.md).

## Co není dokončené

Žádný z48 plánovaných A/B benchmarků se neuskutečnil; live Apply, B6/chůze/jízda/noční svítilna a WebGL2 smoke nejsou prakticky přijaté. Přibližně1s intervaly byly pozorované před nezávislým ověřením popředí; jejich příčina ani FPS přínos nejsou prokázané. Celkový gameplay gate se nemění a celek není Done.

Computer Use při getApp pro nativní Edge okno bezpečnostně ukončil předchozí tah, protože nedokázal ověřit aktuální URL. Tah byl ukončen. Navazující koordinační práce probíhala pouze mimo UI; žádný alternativní ovládací kanál ani reset ochrany. Po STOP nebyl ověřen reset viewportu ani navrácení testovacích preferencí High/60; origin4179 zůstal Ultra/50%/60,8080 se neměnilo.

## Cleanup a koordinace

STOP run1 ukončil API/preview; cleanup22:31:36.795UTC má apiExited=true, inputsRevalidated=true a cleanupErrors=[]. Sampler i launcher skončily22:31:37UTC, exit0, bez cleanup chyb. Všechny zaznamenané vlastní PID včetně NVIDIA helperů byly ověřené jako nepřítomné,2568/4179 volné; původní8080 zachované. Peers skončili již22:23:13 kvůli změně populace, poté oba čistě uzavřeni; tento negativní konec není skrytý.

Raw lifecycle obsahuje poslední visibility:hidden, nikoli game-dispose/pagehide. Ne-UI audit proto neprohlásil zánik scény. Uživatel následně výslovně potvrdil zavření přesné karty ve skupině 🎮 Ultra ověření. Ultra validation claim je RELEASE; heavy/GPU/workspace-build/2568/4179 jsou volné. Navržený GPU-only hold se nezřídil a pomocná task definice byla odstraněná jako již nepotřebná. Root a verification-record se uvolní po tomto předání a commitu evidence.

Uživatel výslovně autorizoval koordinaci s chatem01a1a80f-d5fa-74c1-b137-7d030ba06b9d (KEY-73/PR42). Chat obdržel potvrzení cleanupu a volného okna. Původně navržené pořadí41→42 už není blokující závislost;42 může pokračovat samostatně. Případná budoucí integrace musí zachovat oba UI celky a aktuální main, žádné další kopie či worktrees.

Další krok po dovoleném obnovení testování: nově rezervovat zdroje, čerstvě ověřit ovládání/URL/popředí, až poté nový běh podle MEASUREMENT.md. Historický run1 se nepřepisuje. Dokončit praktickou přejímku, uložit výsledky, teprve pak ready PR a autorizovaný merge. Do té doby zůstává PR41 draft.
