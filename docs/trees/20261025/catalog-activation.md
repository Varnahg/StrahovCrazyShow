# Aktivace úplného katalogu stromů

Aktualizace27.10: uživatel převzal praktické hraní a výslovně požaduje začlenit hotovou implementaci bez dalšího spuštění hry agentem. Následující původní GPU plán je historický; aktuální přejímka používá kontrolu kódu, izolované CPU případy, typy a sestavení. Vizuální/FPS výsledky se netvrdí. Doplněný SHA fallback zachovává integritu při absenci SubtleCrypto, raw normal mapy nyní odpovídají native síle0,45.

27. 10. 2026 · KEY-62. Výroba a přijetí modelů jsou oddělené od praktického ověření hry.

## Rozhodnutí před zapojením

Výrobní run `17d138291328bad0` dokončil 110 zdrojových identit: 104 nových modelů a šest dříve přijatých sad. Po přerušení se obnovuje pouze nezávislý audit produkčním dekodérem a atomické zveřejnění; hotové modely se znovu nevyrábějí.

Dosavadní `TreeRenderer` umí celý katalog načíst přes kontrolovaný descriptor URL/bytes/SHA-256. Ověří přesnou populaci, polohy a kolizní poloměry ze společného světa. Úspěšná úplná varianta přeskočí původní 76 500 488 B bootstrap. Při chybě zachová `loadError`, odstraní částečně publikované vlastní objekty a obnoví celou původní populaci. Dispose nepouští náhradní načítání. Tyto vlastnosti mají samostatné testy `tree-catalog-loading.test.ts`.

Porovnané varianty:

- Ponechat dvě pilotní náhrady: nejmenší změna, ale zbytek světa by stále používal původní stromy a nedodal by objednaný katalog.
- Načíst původní bootstrap a následně nahradit všech 110 stromů: zbytečný přenos, paměť i dočasná dvojí životnost; pro úplný katalog není potřeba.
- Předat jediný ověřený descriptor do existujícího úplného loaderu: zvolená varianta. Zachovává společné zdroje, rozpočty, řízení LOD i doložený cleanup a fallback.

`Game.start()` proto použije platnou výslovnou lokální QA dvojici, pokud ji vrátí stávající `resolveTreePilot`; jinak úplný descriptor. Oba vstupy se nikdy nepředávají zároveň. Běžný host i multiplayer dostanou stejný katalog. Query string nesmí vybírat libovolnou URL. Malý strom mimo pilotní dvojici používá úplný katalog i při neplatném pilotním požadavku.

## Kontroly před přijetím

Skutečný release seznam uzavírá runtime soubory, editovatelné native modely a jejich knihovny. Test porovná všech 110 identit, kořeny, poloměry a všechny uvedené bytes/SHA s uloženými soubory. Odmítnuté výrobní pokusy se nezahrnou do snapshotu ani Git změn. Snapshot obsahuje také tuto regresi a její release fixture.

Následuje jedna závěrečná sada, produkční build a izolovaná integrace nad stabilním snapshotem; potom statická kontrola celé hry v Edge/GTX 1060. Samotné úspěšné dekódování není GPU, vizuální ani výkonový důkaz. Výchozí WebGPU zůstává v ověřeném compatibility mode; experimentální non-compatibility mode není podmínkou této aktivace.

## Stav

Produkční dekodéry prošly všech 110 zdrojů; atomická publikace je dokončená. Runtime manifest má 215 400 B a SHA-256 `2d108559f64f6596d995ab5d8796d90aa9e94ed850144abc38e836826bcaeae7`. Jeho skutečné bajty root samostatně ověřil proti novému descriptoru.

Game nyní předává katalog běžnému hostovi, multiplayeru i katalogovým QA pohledům. Tři cílené regrese skutečného startup těla prošly: původní statická kamera před preloadem, bezpečný výběr lokální pilotní dvojice a úplný katalog pro ostatní starty. Nejde o test GPU.

Převzatý release seznam má 588 unikátních souborů, 110 native modelů a čtyři sdílené material libraries. Autor ověřil skutečně uloženou relativní cestu u všech 108 linkovaných modelů; dva původní piloty mají materiály lokálně zabalené. Závěrečná sada, build, integrace, GPU, commity a main přijetí ještě čekají.
