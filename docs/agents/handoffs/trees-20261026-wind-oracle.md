# Předání: trees-20261026-wind-oracle

- Owner: `trees-wind-oracle-01a16b37`; příjemce: root koordinátor `trees-20261025`.
- Cwd/větev: `D:/CodexWorkspaces/StrahovCrazyShow-terrain-20261025`, `codex/trees-realism-20261025`; výchozí HEAD `8516c7b1877ec66c37120d9088264d44c52882f1`.
- Výsledek: test explicitně přijímá pouze doloženou samostatnou TreeWind identitu; původní historický oracle i runtime zůstávají nedotčené. Připraveno k integraci rootem, bez tvrzení úplné/GPU přejímky.
- Vlastní změny: `tests/material-defines-wgsl-order.test.ts`, `docs/trees/20261025/wind-oracle.md`, toto předání; `.cache/trees-wind-oracle-20261026/`.
- Cizí WIP: test byl při claim čistý. TreeWind, fixtures, dependencies, ostatní runtime/testy ani živé preview nebyly měněny. Žádný staging/commit.
- Výzkum: [wind-oracle.md](../../trees/20261025/wind-oracle.md), runtime diff pouze feature define + class name, pinned MaterialPluginManager registry. Zachován 9 709 634B oracle s rozbaleným SHA `355ec327227af96c64c83c354636894d0ba3e5128913d95c9716900294a4896f`; gzip SHA `68cda48595cfa73bd7b1561ff5d4fbc47590d4ddcc46226f14d8221f67466858`.
- RED: nezměněný soubor 11/12 PASS, wind selhal na MATERIALPLUGIN_8→9 a přidaném STRAHOV_TREE_WIND. `red.log` a `before-report.json` zachovány.
- Úplný audit: všech 5 wind stavů má právě odstranění starého plugin flagu a dvě přidané true hodnoty. Celá WGSL body/metadatová struktura/UBO jsou exact; canonical defines/prefixy jsou exact po dvou explicitních textových změnách. `audit.mjs`/`audit.json`.
- Refaktoring: dva úzké helpery values/text, sdílený exact-once anchor; žádná obecná filtrace defines/bytes. Wind nyní kontroluje všech 5 stavů a přesné pořadí prefixů. Původní serializer/cache/reference/cleanup assertions zůstaly.
- Ověření 26. 10. 2026 12:29–12:30 UTC: oracle + tree-effect-identity + wgsl-vegetation **22/22 PASS**, targeted TypeScript **PASS**, diff check **PASS**, exit 0. Logy `targeted-tests.log`, `targeted-types.log`; `after-report.json`.
- Snapshot: `.cache/trees-wind-oracle-20261026/manifest.json`, `source/` s vlastním změněným testem/docs, `implementation.diff`. Manifest navíc eviduje neměnný oracle hash. Scope snapshot není celý produkční build.
- Procesy/omezení: pouze ukončené lehké CPU testy/types v přiděleném okně, bez GPU/build/fullsuite/install a bez živého pomocného procesu. Předchozí fullsuite fail zůstává historickým výsledkem; cílené PASS jej nezpětně nepřepisuje.
- Další krok: root přijme tento přesný testový diff do dalšího source snapshotu/commitu a aktualizuje Linear/verification/task status. Release neznamená Done širšího celku.
- Rezervace: po předání/snapshotu uvolněna CLI release; další zápisy nejsou plánované.
