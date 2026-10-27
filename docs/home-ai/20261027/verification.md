# Ověření KEY-63 a KEY-64

Datum finální místní kontroly: 28. 10. 2026 (Europe/Prague). Zdrojový checkpoint včetně testů `b494fe38ab6472c6cd683c22c7a0d9f89fe664f8`, backend refinement `52b954123af072ba239c12f0c58ba9baa585ca3c`; přijatá base `752e75fd41b455db7e22453b881eb5f62bc283f0`. Následné dokumentační commity nemění runtime/testy. Větev `codex/clean-home-crazy-typka`.

## Lokální výsledky

| Kontrola | Skutečný výsledek |
| --- | --- |
| Cílené moduly a skutečné UI/Game/Room effect fixtures | 159/159 PASS, 0 skip, 3,35 s; fake provider, žádné placené API |
| Finální pnpm build | PASS včetně celého tsc --noEmit; klient index-B5I1OK5k.js, CSS index-3rwWxZ13.css |
| Finální izolované pnpm test:integration | PASS: skutečné Colyseus SDK, singleton, host privacy, pohyb/auto/chat/resume, veřejný count,12peers, input backlog, feedback boundary |
| Katalog a README | 397 tasků valid, oba jazykové README odkazy PASS |
| Source secret scanner | 6731 rozpoznaných textových souborů,0kandidátů; kontrola aktuálního zdroje, nikoli všech typů tajemství/historie |
| Soukromý klíč | Mimo Git kořeny; soukromé přesné porovnání proti HEAD/indexu nenalezlo klíč. Hodnota se nevypisovala ani nekopírovala do evidence. |
| Nezávislé review | Tři vrstvy; všechny tři konečné nálezy opravené, dvě produkční opravy potvrzené zpětným čtením reviewerů. [Triage](review.md). |

Původní plná místní sada skončila2430testy:2422PASS,5FAIL,3SKIP (1246s). Všech5selhání vzniklo nezhmotněnými LFS pointery v nové worktree. Po přesném lokálním LFS checkoutu všech609objektů prošlo31/31dotčených asset regresí a preflight. Neproběhla regenerace ani změna modelů. Tato oprava vstupů se nevydává za zelený opakovaný celý místní běh; úplné ověření finálního kandidáta musí dodat povinný CI verify. Původní selhání a CORS integrační selhání zůstávají uchována, pozdější logy je nepřepsaly.

Build nadále hlásí předchozí velké chunky a neúčinné dynamické importy b6-reality/vegetation. Nejde o novou optimalizaci ani doklad rychlejšího startupu.

## Skutečný prohlížeč

Testována produkční HTTP verze na vlastním4268 s výše uvedeným bundle. Desktop1280×720: pageWidth1265; mobil390×844: pageWidth375; v obou0canvas a bez horizontálního přetékání. CZ/EN přepnutí, viditelné obě vstupní akce a odložený editor. Finální místní pozdrav funguje přes skutečné API, fokus zůstává TEXTAREA; smazání konverzace vrátí prázdný chat a stejný fokus. Dřívější skutečná modelová odpověď prokázala psaní dalšího draftu během čekání a jeho zachování. Nové requestSeq/recovery hrany pokrývají cílené testy.

[Desktop](home-desktop.jpg) a [mobil](home-mobile.jpg) byly pořízeny z finálního buildu. Testovací override viewportu resetován, vlastní karta zavřena. Editor ani3Dhra se nespouštěly, hraný snapshot4182 zůstal beze změny. Loader byl ověřen kontrakty/actual-effect fixtures a CSS kaskádou; jeho obraz nad běžící GPU scénou, screen reader a herní AI panel nad reálnou scénou jsou **neověřené**. Nemění se Game readiness ani renderer; tato omezení se nemají vydávat za přijetí cizí renderer etapy.

## Živý OpenAI endpoint

Uživatel bezpečně dodal klíč mimo Git. Pro malé QA byl ověřen dostupný model `gpt-6-luna`, effort `none`; jen syntetické veřejné dotazy. Celkem8generování, žádné další automatické placené retry. Dřívější případy: členství, router, fiktivní AI identita/odmítnutí skutečného setkání a odmítnutí neověřené ceny; dotaz na flirt s nezletilým zastavila vstupní moderace422. Dřívější browser konverzace3generování. Tato malá sada není rozsáhlý bezpečnostní či kvalitativní benchmark.

Poslední samostatný proces měl skutečný env strop1:

| Operace | Výsledek |
| --- | --- |
| seq1 Ahoj | 200,8ms, místní schválený text bez API |
| seq2 Co se dá na Strahově podniknout? Je mi22, klidně trochu hravě. | 200,4940ms; nabídka3Dtisku/GameDev/hudeben/MacGyvera/SHerny/fotografie/tance/včel/zahrádek; jediná citace wiki projekty, žádná vymyšlená otevírací doba nebo cena |
| Přesný replay seq2 po vyčerpání cap | 200,3ms; zcela identický JSON, bez nové generace |
| Jiný text stejného seq2 | 409 request-conflict,4ms |
| Nový seq3 po cap | 503 budget-exhausted,2ms |

První spuštění tohoto QA helperu chybně očekávalo200místo správného201u založení session; žádná generace neproběhla. Opravena pouze helper assertion, původní log zachován. Finální helper i browser relace byly vyčištěny; preview shutdown potvrzen,2568a4268bez listeneru. Privátní konfigurace a session tokeny nejsou v logu ani evidence.

## Integrační hranice

Veřejné nasazení nebylo změněno; provozovatel musí dodat své serverové nastavení podle [návodu](deployment.md). RAG má11kurátorovaných chunků ze6zdrojů s vynuceným reviewAfter2026-11-27UTC, není úplnou znalostí SH. AI je soukromý explicitně vybraný kanál, ne nový multiplayer hráč a ne automatický účastník lidských konverzací.

Povinný PR CI a přesný project-acceptance se vydají před sloučením; tento místní záznam je sám nenahrazuje. Odkazy na konečný PR/head/base/CI a rozhodnutí patří do GitHub/Linear integračního dokladu.

Provozní logy zůstávají v ignorovaném `.cache/home-ai-20261027-validation/`: `full-tests.log`, `assets-after-lfs.log`, `final-targeted.log`, `build-accepted.log`, `integration-accepted.log`, `live-ai.json`, `live-final.json`. Neobsahují soukromé konfigurační hodnoty.
