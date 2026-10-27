# TreeWind identity a historický WGSL oracle

26. 10. 2026, task `trees-20261026-wind-oracle`, owner `trees-wind-oracle-01a16b37`.

## Výzkum a RED

Full v9 odhalil staré očekávání wind identity. Samostatný cílený běh nezměněného `tests/material-defines-wgsl-order.test.ts` potvrdil **11 PASS / 1 FAIL**: pouze wind. `.cache/trees-wind-oracle-20261026/red.log` a `before-report.json` zachovávají skutečný výsledek všech scénářů.

Runtime diff `client/tree-wind.ts` proti `8516c7b1` obsahuje přesně vlastní `getClassName() = TreeWindPlugin` a feature define `STRAHOV_TREE_WIND: true`. WGSL/GLSL těla a `cleanTreeWind` UBO se nezměnily. Pinned `MaterialPluginManager` přiděluje `MATERIALPLUGIN_n` podle pořadí prvního registrování class name; v tomto neměnném pořadí deseti scénářů původní obecný `MaterialPluginBase` má 8 a vlastní `TreeWindPlugin` má 9. Samostatnou identitu vyžaduje oprava chybného sdílení wind/season efektů doložená `tests/tree-effect-identity.test.ts`.

Nezávislý read-only audit porovnal **všech pět** wind stavů z aktuálního reportu s historickými baseline/canonical záznamy. V každém jsou právě tyto změny hodnot:

1. `MATERIALPLUGIN_8: true` odstraněno.
2. `MATERIALPLUGIN_9: true` přidáno.
3. `STRAHOV_TREE_WIND: true` přidáno.

Metadata i celá WGSL těla jsou deep-equal. Canonical defines a oba vygenerované prefixy jsou byte-equal po přesné výměně jediného plugin řádku a vložení jediného feature řádku na canonical pozici před `TEXTURE_REPETITION_MODE`. Uniform data jsou shodná. Historický oracle má 4 programy, canonical i aktuální skutečný scénář 3; extra Effect reference se uvolní a scene/engine/effects/observers se uklidí. Audit a číselný report: `.cache/trees-wind-oracle-20261026/audit.mjs`, `audit.json`.

## Volba před úpravou testu

| Možnost | Důsledek | Volba |
| --- | --- | --- |
| Přepsat uložený oracle aktuálním výstupem | Ztratí nezávislý historický důkaz a může přijmout nesouvisející regresi | Zamítnuto |
| Odstranit všechny plugin defines/normalizovat WGSL whitespace | Skryje nesprávné cache identity i skutečné změny shaderu | Zamítnuto |
| Explicitní wind-only očekávaná transformace s jedinými přesnými anchory | Zachová všechny ostatní hodnoty a bajty, metadata, UBO, pořadí a lifecycle; dokumentuje přijatou změnu | Vybráno |

Historický gzip se nepřepisuje. Nadále musí mít 9 709 634 rozbalených bajtů se SHA-256 `355ec327227af96c64c83c354636894d0ba3e5128913d95c9716900294a4896f`; komprimovaný soubor má SHA-256 `68cda48595cfa73bd7b1561ff5d4fbc47590d4ddcc46226f14d8221f67466858`.

Test použije transformaci pouze pro wind. Ostatní scénáře a již dříve explicitně přijatá PhotoGrass/Standard očekávání zůstanou stejné. Wind rozšíří historickou kontrolu ze stavů 1/2 na všech pět a porovná canonical prefixy v přesném pořadí místo dosavadního porovnání seřazených řádků. Nejde o úpravu runtime, WGSL, assetů nebo dependencies.

## Implementace, refaktoring a ověření

Dva malé testové helpery oddělují přesnou změnu veřejných hodnot od přesné změny textových řádků. `replaceOnce` nadále vyžaduje právě jeden historický anchor; nové identity/feature řádky nesmějí v historickém vstupu již existovat. Nedochází k obecné regex filtraci flagů, přepisování WGSL body, whitespace normalizaci nebo změně historických dat. Pořadí fixture zůstává explicitním předpokladem; jiné číslování musí být znovu posouzené, nikoli automaticky přijaté.

26. 10. 2026, přibližně 12:29–12:30 UTC:

- `node node_modules/tsx/dist/cli.mjs --test --test-concurrency=1 tests/material-defines-wgsl-order.test.ts tests/tree-effect-identity.test.ts tests/wgsl-vegetation.test.ts`: **22/22 PASS**, exit 0. Celý oracle soubor 12/12, identity 6/6, vegetation WGSL 4/4. Log `.cache/trees-wind-oracle-20261026/targeted-tests.log`; skutečný kandidátní report `after-report.json`.
- `node node_modules/typescript/bin/tsc --project .cache/trees-wind-oracle-20261026/tsconfig.targeted.json`: **PASS**, exit 0; zděděný projektový config s jediným testovým vstupem a jeho importy, prázdný `targeted-types.log`.
- `git diff --check -- tests/material-defines-wgsl-order.test.ts`: **PASS**.
- SHA-256 komprimovaného oracle zůstává `68cda48595cfa73bd7b1561ff5d4fbc47590d4ddcc46226f14d8221f67466858`; rozbalený hash/velikost ověřuje každý testový import. Původní fixtures a runtime TreeWind beze změny.

Zůstávají skutečné stejnoenginové kontroly cache reuse, genuine value change, odlišné unsupported order-sensitive větve, počet 3 programů, owned-reference release, přesné UBO hodnoty, layout metadata a cleanup. Jde o CPU nativní WGSL processing/NullEngine důkaz, nikoli GPU či novou úplnou sadu. Build, instalace, GPU a fullsuite nebyly spuštěné.
