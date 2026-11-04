# Předání: low-tree-lod-pr40-default-tests

- Vlastník: pr40-low-tests-20261104; příjemce: root / pr40-low-20261104-root.
- Pracovní kopie a větev: C:/Users/rezac/Documents/GitHub/StrahovCrazyShow, main; výchozí commit: 12d81aa908684c20dfb5f1d33eb3ebbc19912b4d.
- Rozsah: pouze tests/tree-streaming.test.ts a toto předání. Cizí/root rozpracované změny se nepřebírají.

## Rozhodnutí před úpravou

1. Problém: čtyři regrese stále vyžadují nepřijatý FAR45; koordinátor vrací produkční práh75.
2. Doložený mechanismus: treeDetailForProjection dělí vzdálenost projekčním měřítkem. Skutečný TreeRenderer ho získává z projekční matice, výšky renderu a viewportu; bez kamery používá1. Pro základní720px/.85 projekci je scale1, proFOV.42 přibližně2,13. Žádná změna runtime testem nevzniká.
3. Jediná změna: hranicové aserce45→75; oba skutečné streamovací scénáře60→90m, aby90 zůstalo zaLow75 a předHigh135. ZúženíFOV pak90 vrací doMID. Ostatní kvalitativní, viditelnostní, cache a disposal aserce zachovat.
4. Hlavní metrika: výsledek cílené sady tree-streaming/tree-cluster-streaming/tree-catalog-loading, nikoli FPS.
5. Správnost: žádné odstranění testu, změna syntetickýchGLB ani úprava produkčních souborů; obě pořadí pozdníhoMID musí zůstat ověřená.
6. Přijetí: všechny cílené testy PASS a diff omezený na očekávaný práh a příslušnou geometrickou vzdálenost; cache se znovu používá, starýFAR/MID je vypnutý a zdroje nejsou předčasně zničené.

Varianta odstranění čtyř regresí by ztratila užitečné lifecycle pokrytí. Ponechání60m a změna očekávání naMID by přestalo ověřovat přechodFAR/MID podleprojekce. Zvolených90m zachovává původní význam bez nové abstrakce nebo testové kopie implementace. Primární podklady: současné client/tree-renderer.ts a tests/tree-streaming.test.ts; rozhodnutí o nepřijetí kandidáta a příčinných limitechA/B předal root.

## Výsledek a předání

- Hotovo v přiděleném rozsahu: všechny původní deklarace testů i všechny aserce zachované (17 deklarací, 165 asercí v souboru). Jedna parametrizovaná deklarace nadále ověřuje obě pořadí dokončení MID.
- Změněné soubory: tests/tree-streaming.test.ts; docs/agents/handoffs/low-tree-lod-pr40-default-tests.md. Runtime změnil výhradně root.
- Refaktoring: zachované existující datové smyčky pro hranice a dokončení low/high; nevznikla duplicitní implementace ani další testový stav. Všechny dosavadní cache, rezervace bajtů, dispose a viditelnostní aserce zůstaly.
- Ověření 4. 11. 2026 16:59 Praha: přímé node --import tsx --test tests/tree-streaming.test.ts tests/tree-cluster-streaming.test.ts tests/tree-catalog-loading.test.ts — exit0;36 PASS,0 FAIL,0 SKIP,0 CANCELLED,5048.2368ms. Úplný stdout je ve výstupu nástroje relace low_default_tests (chunk ead5cc); další logový soubor mimo scope nevznikl.
- git diff --check -- tests/tree-streaming.test.ts PASS. Počet deklarací a asercí proti HEAD programově porovnán beze změny.
- SHA256 tests/tree-streaming.test.ts: aefefb6adfcf9019e3e473f815a586de7d6cf828beca53b337467d1bfe0a49a7.
- SHA256 souběžně ověřeného client/tree-renderer.ts od koordinátora: 6033ae2870a3c1f4772266e2b5f7efa358cc90f95ea423ef31e0c5188ab1e979. Jde o přesné identity těchto souborů, nikoli o tvrzení úplného produkčního snapshotu.
- Neproběhl build, celá sada, integrace ani GPU: tento leaf ověřuje pouze testový rozsah. NullEngine není FPS nebo obrazový důkaz; širší přejímku a původní neúspěchy A/B drží root.
- Vlastní testovací proces skončil; žádný server, port, GPU scéna ani pomocný proces nezůstává. Změny nebyly staged ani commitnuté.
- Příjemce root přebírá dva uvedené soubory a výsledky; stav tasku a integraci mění pouze on.
- Předání dokončeno 2026-11-04T16:00:49.540Z. Následuje uvolnění pouze vlastní rezervace low-tree-lod-pr40-default-tests; úspěch release potvrzuje výstup relace. Nejde o celkové dokončení GPU/PR přejímky.
