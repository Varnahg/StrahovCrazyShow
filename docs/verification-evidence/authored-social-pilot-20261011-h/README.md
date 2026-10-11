# Ověření zmrazené sestavy H — 11. 10. 2026

Snapshot: `.cache/performance-snapshot/authored-social-pilot-20261011-h`.

SHA-256 ID: `f7741a88638c05ab2bdc52c443fdc8382d31c0dc6d1dd24e1337ce1d94cfbb14`.

Všechny příkazy proběhly **sekvenčně ze snapshotu H**, nikoli ze živých zdrojů. [Manifest](./source-manifest.json) obsahuje 7 869 souborů a 47 testovacích souborů. Herní modely, jejich editovatelné zdroje a testy jsou samostatnou kopií; pouze historické referenční IPR soubory jsou deklarovaným junctionem na nezměněné G. Závislosti používají junction na `node_modules`, jejich verze identifikují hashované package/lock soubory.

| Kontrola | Skutečný výsledek | Doba příkazu | Úplný log |
| --- | --- | --- | --- |
| `pnpm test` | **269/269 PASS**, 0 FAIL/skipped/cancelled/todo, exit 0 | 160,442 s | [tests.log](./tests.log) |
| `pnpm build` | TypeScript i Vite produkční build PASS, exit 0 | 27,514 s | [build.log](./build.log) |
| `pnpm test:integration` | Izolovaný server a dvě skutečné SDK relace PASS, exit 0 | 16,841 s | [integration.log](./integration.log) |

[results.json](./results.json) obsahuje přesné UTC začátky/konce, pracovní adresář, snapshot ID, příkazy, exit code a signal každého kroku. Build zapisoval výhradně do snapshotového `dist`; živý `dist`, runtime zdroje, Blender masters, G ani referenční junction tento běh neměnil.

Kompletní testy zahrnují i nový guard opakovaného přepínání lamp, umělecké materiály, dosavadní geometrie/LOD, skutečné modely, počasí/astronomii, ovládání, komunikaci, fyzické vstupy a interiéry. Grid ověřil 4 309 přístupných venkovních sond, z toho 1 840 pod původní nulovou hladinou a 1 187 na svazích, skutečným ustalováním postavy bez záchranných teleportů. Doba tohoto výpočtu není FPS měření.

## Izolovaný multiplayer

Standardní wrapper spustil vlastní server na **2568**, odděleně od hlavního serveru, a po běhu jej ukončil. Na tomto portu po skončení nebyl listener. [integration-evidence.json](./integration-evidence.json) zaznamenává **protocol 5, status=passed, completed=true a 29 skutečně provedených SDK/HTTP kontrol**, včetně přijatých fyzikálních stavů řidiče a pozorovatele.

Ověřeno: host dostane odmítnutí multiplayerových relací a soukromých HTTP dat, veřejné health neobsahuje přítomnost; dvě relace sdílejí jediný svět a pohyb, nastupování, fyzikální W/A/D/brzda/zpátečka, odmítnutí vystoupení za jízdy, bezpečné vystoupení a opětovné nastoupení, globální chat, kontakt až po přijetí, soukromý chat, blokování, vlastnictví událostí, obnovení relace a public weather endpoint.

Metadata i konečný text tohoto testu již správně uvádějí **nativní DMR a samostatné authored modely**; photogrammetry je reference-only. V logu je zachována SDK diagnostika ukončení spojení kódem 4002; celý test přesto dokončil assertions a skončil exit 0. SDK test není browserový vizuální ani GPU benchmark a nepředstavuje třicet současných vykreslených uživatelů.

## Úplný hash audit včetně junctionu

[reference-junction.json](./reference-junction.json) potvrzuje skutečný realpath, **7 038 referenčních souborů**, ID původního G a přesný SHA-256 jeho manifestu. Závěrečný [source-check.json](./source-check.json) v **2026-10-10T23:34:13.428Z** znovu SHA-256 ověřil všech 7 869 souborů proti H manifestu ve zmrazeném i živém projektu. Vyhledávání dodatečných souborů používá `fs.stat`, takže také vstoupilo do referenčního directory junctionu.

Výsledek v okamžiku auditu: **allStagesPassed=true, liveAndFrozenMatch=true, mismatches=[]**. Sdílená reference nebyla vynechána z hashů ani ze zjišťování dodatečných souborů. Dokumentace, cache, dist a node_modules nejsou zdrojovou sadou manifestu.

Po zmrazení H uživatel dodal nové fotografie schodiště B3 a schéma B6; samostatný agent nadále rekonstruuje schodiště v živém projektu. [live-source-observation.json](./live-source-observation.json) proto výslovně rozlišuje neměnný H a časově omezené pozorování živých souborů. Ty se při tomto auditu ještě shodovaly, ale **pozdější nové schodiště tímto H během ověřeno není** a bude vyžadovat navazující sestavu. Případná následná autorizovaná živá změna nepřepisuje výsledek immutable H.

Build zachovává neblokující upozornění na statický i dynamický import vegetace, JavaScript chunky přes 1 100 kB a časování přípravy výstupního adresáře. Testy ani limity nebyly upraveny kvůli získání PASS. Tento subagent neprováděl runtime změny, browser/FPS měření, boty, nasazení ani git commit. Produkční výkon musí být měřen samostatně se source ID této ověřené sestavy.
