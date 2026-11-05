# Ultra 50 % — aktuální předání po přerušeném ověření

Koordinátor ultra-20261104-root; D:/CodexWorkspaces/StrahovCrazyShow-graphics-20261104, codex/graphics-smoothness-20261104. Runtime checkpoint e60d33a6796d6aacc8adf39e2ca8fae5baa3964a, [draft PR41](https://github.com/Varnahg/StrahovCrazyShow/pull/41). Uživatel schválil PR a merge po dokončení; merge dosud neproběhl.

## Doložený stav

Aktuální5.listopadu: [srovnání run3](../../performance/evidence/ultra-graphics-20261104/comparison-run3/README.md) má45/48 platných vzorků,22 dvojic pohledů+1Down; všechny tři Low/Ultra páry pro oba pohledy kompletní. Low→Ultra ve scenérii53,30→45,00ms (**15,57 %**, kritérium20 % nesplněno). Stíny OFF mají13,92 % zlepšení ve dvou výhledových opakováních a téměř stejné FPS jako Ultra při vyšším rozlišení. Samotné50 % renderu ani další malé rozdíly nejsou průkazné; v záběru nebyla aktivní drobná vegetace. Všech45 záznamů odpovídá zdroji, nastavení, poloze/kameře, počasí a fokusu; validní health a nulové nové shader/pipeline chyby. Nezávislý čtecí přepočet výsledky potvrdil. Raw/procesní/kompilační podklady a přesné limity jsou archivované v reportu.

Ultra/Custom UI, resolver V2, feature gates a živá transakce jsou implementované. Review opravy a přesné cílené testy jsou ve SPEC a předáních UI, vegetation, lighting a game-tests. První dvě CI selhání byla reprodukovaná a opravila se pouze inicializace starých fixture a pět typových anotací. Finální celé CI na e60d33a6:3191 testů,3189 PASS,0 FAIL,2 SKIP; produkční build a izolovaná SDK integrace PASS. Feedback browser a source hygiene také PASS.

Výslovné následné zadání WebGL2 timeoutů je samostatně provedené v e60d33a6: jediná zvolená kvalita60s jako manuální WebGPU, bez změny readiness/submission gates;11/11 cílených quality regresí a celý místní TypeScript PASS. Není to zrychlení ani runtime WebGL2 důkaz.

Neměnný candidate2/build má source/tests74780b517048cdf304643486912d2921cd7dff88e6b0c5d7ad9007ce05b6f4c2. Ve skutečném Edge session021fdcd8-bfd5-4a2d-8100-e97eba3467a3 dosáhlo Ultra game-ready22:20:00.694UTC přes WebGPU/NVIDIA, CSS1280×720 a render640×360. Dva různí skuteční SDK peers se připojili. Přehled důkazů, raw archiv a CI odkazy jsou v [reportu](../../performance/evidence/ultra-graphics-20261104/README.md).

## Co není dokončené

Z45 platných vzorků chybí třetí výhled C a oba třetí pohledy G: do45min operátorského okna se nevešly, neoznačovat48/48. Prakticky proběhlo20 úspěšných živých transakcí testovaných Low/Custom/Ultra nastavení; B6/jízda/noční svítilna a WebGL2 smoke stále chybějí. Všech22 výhledových vzorků neplní60FPS frame gate a neprokazuje se oprava několikasekundových zamrznutí. PR41 musí před merge také integrovat nový main6614cb9b poPR42 a zachovat společný AI store/assistantActions. Celek není Done.

Historický run1 skončil bezpečnostním zastavením Computer Use při nativním getApp; tehdy byl tah řádně ukončen. Uživatel později ručně zavřel kartu a výslovně znovu požádal o výkonové srovnání. Nové vlastní okno bylo ovládané dokumentovaným browser management API nad ověřeným tab/window ID. Run2 odhalil současné používání počítače uživatelem, který poté schválil nerušené měřicí okno; do primárních výsledků se run2 nepřidává. Run3 měl potvrzený fokus a skutečné UI ovládání. Po sběru byla hra ukončena do úvodu, High/60 obnovené, viewport resetovaný a vlastní karta/okno zavřené s ověřením nepřítomnosti window ID. Původní8080 zachované.

## Cleanup a koordinace

STOP run1 ukončil API/preview; cleanup22:31:36.795UTC má apiExited=true, inputsRevalidated=true a cleanupErrors=[]. Sampler i launcher skončily22:31:37UTC, exit0, bez cleanup chyb. Všechny zaznamenané vlastní PID včetně NVIDIA helperů byly ověřené jako nepřítomné,2568/4179 volné; původní8080 zachované. Peers skončili již22:23:13 kvůli změně populace, poté oba čistě uzavřeni; tento negativní konec není skrytý.

Raw lifecycle obsahuje poslední visibility:hidden, nikoli game-dispose/pagehide. Ne-UI audit proto neprohlásil zánik scény. Uživatel následně výslovně potvrdil zavření přesné karty ve skupině 🎮 Ultra ověření. Ultra validation claim je RELEASE; heavy/GPU/workspace-build/2568/4179 jsou volné. Navržený GPU-only hold se nezřídil a pomocná task definice byla odstraněná jako již nepotřebná. Root a verification-record se uvolní po tomto předání a commitu evidence.

Uživatel výslovně autorizoval koordinaci s chatem01a1a80f-d5fa-74c1-b137-7d030ba06b9d (KEY-73/PR42). Chat obdržel potvrzení cleanupu a volného okna. Původně navržené pořadí41→42 už není blokující závislost;42 může pokračovat samostatně. Případná budoucí integrace musí zachovat oba UI celky a aktuální main, žádné další kopie či worktrees.

Další krok po dovoleném obnovení testování: nově rezervovat zdroje, čerstvě ověřit ovládání/URL/popředí, až poté nový běh podle MEASUREMENT.md. Historický run1 se nepřepisuje. Dokončit praktickou přejímku, uložit výsledky, teprve pak ready PR a autorizovaný merge. Do té doby zůstává PR41 draft.

Cleanup run3: sampler skončil řádně po2700s, oba SDK peers uzavřené, API/preview ukončené a inputsRevalidated=true/cleanupErrors=[]. Launcher zachovává časový nesoulad „sampler ended before owned server cleanup“; nejde o úplně dokončenou plánovanou sérii. Vlastní PID jsou nepřítomné a validation claim je RELEASE. Root/record budou uvolněné po commitu tohoto předání. Žádné další GPU testy ani produkční změny během offline vyhodnocení neběžely.
