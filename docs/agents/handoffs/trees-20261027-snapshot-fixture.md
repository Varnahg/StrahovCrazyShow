# Předání: trees-20261027-snapshot-fixture

- Vlastník: `trees-snapshot-fixture-agent-20261027`; příjemce: root koordinátor KEY-62.
- Pracovní kopie: `D:/CodexWorkspaces/StrahovCrazyShow-terrain-20261025`, větev `codex/trees-realism-20261025`, baseline `8516c7b1877ec66c37120d9088264d44c52882f1`.
- Rozsah změny: pouze `tests/performance-snapshot.test.ts`, tento dokument a vlastní `.cache/trees-snapshot-fixture-20261027/`. Test byl před převzetím čistý. Ostatní WIP a neměnný candidate-v13 se nemění.

## Příčina a rozhodnutí

Skutečný `scripts/performance-snapshot.mjs` zahrnuje nový statický release seznam a `.gitattributes`. Test si vytváří malý syntetický projekt, ale tyto dva soubory dosud nevytvářel. Pět pádů ve v13 proto skončilo na stejném `ENOENT` v úvodním `stat` release seznamu, před samotnými kontrolami integrity nebo odmítání změn.

Zvažované opravy: vynechat vstupy z produkčního snapshotu by porušilo jeho nový kontrakt; tolerovat chybějící soubory by oslabilo kontrolu; přidat dva soubory jen do fixture objektu by opravilo start, ale nedalo jim explicitní mutation coverage. Zvolená minimální změna přidává oba do existujícího společného `prerequisites` seznamu. Ten zároveň řídí tvorbu souborů, přesné porovnání jejich bajtů a hashů, změnu budoucí identity i neměnnost staršího snapshotu. Žádná nová duplicitní logika, cache ani lifecycle stav není potřeba.

## Ověření

Příkaz `node node_modules/tsx/dist/cli.mjs --test tests/performance-snapshot.test.ts` prošel **5/5 PASS**, 0 FAIL/SKIP, exit 0, 3,27 s. Log: `.cache/trees-snapshot-fixture-20261027/test.log`. Existující kontroly přesných bajtů, změny identity, zachování staršího snapshotu, odmítnutí přepsání a mutace během kopírování i byteově shodného reuse zůstaly aktivní a všechny proběhly.

Původní celá sada v13 zůstává beze změny s výsledkem 2 345 testů: 2 337 PASS, 5 FAIL, 3 SKIP. Tato oprava není přejmenováním původního běhu na úspěšný. Testovací patch má pouze dvě přidané položky společného seznamu; žádný runtime ani generátor se neměnil.

Vlastní testovací proces skončil. Žádná celá sada, build, integrace, GPU, port, Blender, instalace, staging ani commit se v tomto tasku nespouštěly. Zdrojový test, čtený freezer, handoff a log jsou uzavřené manifestem ve vlastní cache. Claim se po tomto předání uvolňuje; přijetí změny, úpravu stavu tasku a další snapshot/CI řídí root.
