# Předání: d-cache-cleanup-20261028

- Vlastník: `cleanup-01a17fe0`; příjemce: původní koordinátor `01a16b37-1237-7583-af49-52c29a82272d`.
- Pracovní kopie: `D:/CodexWorkspaces/StrahovCrazyShow-terrain-20261025`, `codex/trees-realism-20261025`, výchozí HEAD `410876eaf2478084960850cdb1ab71fe55549ee5`.
- Zadání člověka 28. 10. 2026: bezpečně uvolnit staré cache zejména na D:, zachovat aktivní práci a neintegrované změny. Člověk výslovně autorizoval domluvení předání s původním koordinátorem. Ten založil task a skutečně uvolnil pouze původní validační rezervaci; port/GPU a ostatní claims zůstaly.

## Výzkum a rozhodnutí

Read-only inventura zjistila 14 509 163 529 logických B v čistém D main a 127 819 079 624 B v terrain worktree. Největší položky: trees-validation 68 870 515 936 B, terrain-validation 35 403 885 906 B. Logické součty nejsou fyzické využití: starší kontrolované deduplikace a main/v13 již mají hardlinky. Výchozí D volno bylo 723 996 672 B. Prázdný terrain-20261025-runtime nepředstavuje úsporu.

Aktuální server byl ověřen skutečným HTTP GET na `http://127.0.0.1:4182/`, odpověď 200 a entry `/assets/index-DSBPccIM.js`; dále se porovnávají skutečné HTTP bajty klienta s immutable v13. PID60528 a receipt server-v13-catalogue-01.json odpovídají v13. Cizí procesy nebyly ukončovány.

Porovnané varianty:

- Odstranit celé staré snapshoty: největší jednoduchá úspora, ale ztráta jedinečných vstupů, selhávajících fixture, compiled klientů a reprodukčních důkazů. Zamítnuto.
- Přesunout nebo archivovat celé kopie na C:: zachování bajtů, ale pouze přesun spotřeby, nákladná obnova a změna cest. Zamítnuto.
- Komprese: nejistá úspora u komprimovaných GLB/textur a další režie čtení. Nevybráno.
- **Vybráno:** stejný osvědčený projektový princip immutable hardlink reuse, ovšem pouze pro samostatné staré statické kopie. Zachovává všechny cesty a bajty, rozlišuje již sdílené inode a před/po měří skutečné volno D:. Nově sdílená data jsou read-only; před jakýmkoli budoucím přepisem je nutné vytvořit samostatnou writable kopii. Žádná herní cache, lifecycle ani runtime kód se nemění.

Přesný rozsah náhrad: terrain candidate-v1–v6 a trees candidate-v1–v12, pouze statické assety v public/assets/dist s vybranými binárními/obrazovými příponami od256KiB. Kandidáti se vybírají podle délky, SHA-256 i skutečného byteového porovnání. Destination musí mít právě jeden hardlink. Celý v13/main a inode živých pracovních assetů jsou vyloučené; samostatně zůstávají také terrain baseline a v7. Source/testy, compiled JS, jedinečné modely, logy a manifesty se nemění.

## Ověření a skutečné operace

- Lokální pomocník `.cache/d-cache-cleanup-20261028/deduplicate.py` sdílí kontroly cest, vlastnictví, file identity a byteové shody. Neprochází junctiony. Každá náhrada má fsync journal a zachová původní samostatnou kopii do ověření nového odkazu; žádné rekurzivní mazání.
- `python deduplicate.py selftest`: **11 kontrol PASS, exit0**, včetně read-only samostatné kopie, změněných bajtů, chráněného inode, již sdíleného cíle, v13/main a junction cesty.
- Inventura vytváří úplné skutečné SHA-256/identity/atributy/časy chráněných v13 a main, přesné hashe pracovního WIP a hash HTTP klienta. Tyto důkazy se porovnají po náhradách.
- Přesný plán: **3921 samostatných kopií /26887166704 logických B**, terrain1898 a trees2023 cest. `operations.jsonl` má3921 fsync prepared a3921 committed záznamů pro3921 různých cílů; vlastní apply skončil exit0. Všechny původní názvy a bajty jsou zachované.
- Skutečné D volno bezprostředně před apply **693035008 B**, po něm **27581521920 B**; pozorovaný fyzický nárůst **26888486912 B**. Jde o měření volného prostoru, nikoli součet logických délek. Celkový výchozí stav před inventurou byl723996672 B; rozdíl zahrnuje také malé pracovní důkazy tohoto úklidu.
- Přerušené read-only pokusy a jejich důvody jsou zachované v `attempts.json`. Dva původně neznámé nové handoffy přidal nezávisle druhý koordinátor; žádný z34 původních WIP souborů se nezměnil ani nezmizel. Guard byl upřesněn na zachování všech původních souborů se samostatnou evidencí nezávislých přírůstků. Načtení plánu znovu ověřilo identity/atributy/časy chráněného baseline a actual HTTP klienta, než začaly náhrady.
- Cílený refaktoring pomocníka sjednotil SHA, byte compare, kontroly cest a inode. Read-only plán nejdříve filtruje relevantní binární soubory a používá `scandir` metadata bez opakovaného otevírání každého předka; při každé skutečné náhradě zůstávají úplné bezpečnostní kontroly. Žádný produkční kód nebo runtime API není změněné.
- SHA-256 pomocníka včetně lokálních safety testů: `039f7996d8740e593392b90b99fea2f803c60500cda71099ddb3c062762f7515`. Plán, plné protected-before.json, working-before.json, actual HTTP identity a operation journal jsou v přiděleném cache adresáři. Source snapshoty nadále obsahují původní testy; žádná fixture ani testový výsledek se nepřepisují.
- **Závěrečný výsledek PASS, exit0:** plné SHA-256, identity, link counts, atributy a mtime všech **43483 chráněných v13/main souborů** jsou shodné s počátkem. Všech **34 původních WIP souborů** je přesně zachovaných; pouze přibyly dva nezávislé handoffy release-packaging/snapshot-fixture od druhého koordinátora. Všech **3921 změněných cest** má očekávané bajty i skutečnou hardlink identitu a read-only ochranu. Žádný `.scs-backup-*` ani `.scs-link-*` zbytek nezůstal.
- Skutečný HTTP klient před/po je shodný: v13 snapshot `d381c244f9e667ebfe85c420133effbca0fa0c4b9326d27f8593cd148a13a9f7`, entry `/assets/index-DSBPccIM.js`, SHA-256 `d8fa097bd0f86a94487726b6ffe15a71835b767b3e5df0b6d9b71ae74a2b9fd8`. Konečné D volno při auditu **27581513728 B**, tedy přibližně27,6GB proti původním0,724GB. Získáno přibližně26,9GB.
- Primární důkazy: `.cache/d-cache-cleanup-20261028/verification.json`, `apply-result.json`, `operations.jsonl`, `plan.json`, `protected-before.json`, `working-before.json`, `served-before.json`, `selftest.json`, `attempts.json`; samostatný `evidence-manifest.json` připíná jejich SHA-256 včetně zdroje s lokálními testy.
- Plná herní testovací sada/build/integrace ani GPU se nespouštěly: jde výhradně o lokální sdílení přesně shodných archivních dat, bez změny produkčních zdrojů a chování. Žádný výkonový přínos hry se netvrdí. Výsledkem je doložená disková úspora při zachování bajtů.

## Procesy a rezervace

Všechny vlastní Python pomocníky skončily; apply i finální audit exit0. Žádný nový server, port, build, GPU, Blender ani install. Původní v13 server zůstává pod původním vlastníkem. Předání je dokončené; bezprostředně následuje CLI release `d-cache-cleanup-20261028 / cleanup-01a17fe0` a oznámení skutečného výsledku původnímu koordinátorovi. Ten může po release znovu získat svůj validační scope a administrativně přijmout task. Staging/integrace případných koordinačních dokumentů patří pouze vlastnímu přesnému tasku; žádné cizí WIP se nepřebírá.
