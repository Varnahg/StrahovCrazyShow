# Předání: terrain-20261025-regression-deltas

- Vlastník `terrain-deltas-01a16b37`; příjemce root TERÉN-20261025 / KEY-61.
- Cwd `D:/CodexWorkspaces/StrahovCrazyShow-terrain-20261025`, větev `codex/terrain-quality-20261025`, baseline `ff13fa2b3b47363378ce55d34ed12eb5beec1ede`.
- Samostatný claim bez adopt-dirty; oba testové soubory byly čisté. Změněny pouze `tests/material-defines-wgsl-order.test.ts`, `tests/vegetation-index.test.ts`, toto předání a `.cache/terrain-regression-deltas-20261025/`.
- Žádná změna produkce, OSM archivu nebo historického `tests/fixtures/material-defines-order/baseline.json.gz`; žádný staging/commit, BMAD, podagent, server nebo GPU.

## Příčina a volba

Rootův `.cache/terrain-validation-20261025/candidate-v1-tests.log` doložil dvě chyby nativních WGSL metadata pro photo-grass/photo-grass-thin po novém `photoGrassShape` a původní597 vs aktuálních617 grass patches. Ostatní problémy snapshot/TEMP/Docker/fixtures řeší root; tento task kvůli nim nic nemění.

Zvoleny **aditivní regresní oracly**. Nahrazení celé referenční JSON nebo přerazítkování celého vegetačního hashe by zakrylo původní záruky. Neodstraňují se asserty, nenormalizuje se obecně whitespace a nefiltrují se libovolné nové uniformy.

## Přesné shaderové delta

Historický gzip zůstává byteově stejný (SHA `68cda48595cfa73bd7b1561ff5d4fbc47590d4ddcc46226f14d8221f67466858`). Původní dekomprimovaná velikost9709634 i SHA `355ec327227af96c64c83c354636894d0ba3e5128913d95c9716900294a4896f` zůstávají explicitními asserty.

Pouze dvě photo-grass varianty očekávají navíc:

- Jeden `leftOverUniforms` záznam `{name:photoGrassShape,type:vec3f,length:0}` na konci původního přesného seznamu.
- Jednu deklaraci `photoGrassShape : vec3f` v obou skutečně zpracovaných WGSL tělech.
- Dvě přesné náhrady v vertex těle: původní konstanty denominator0.060 a strength.001 za příslušné složky uniformu.
- Jeden prázdný řádek, který připnutý nativní shader processor ponechá po odstranění nové uniform deklarace: vertex před `struct Scene`, fragment za `//#define FROMLINEARSPACE`. Úvodní lokální běh tento dosud nezahrnutý rozdíl správně odmítl; kompletní RED log zůstal v `targeted-tests.log`. Povoluje se jen jedna konkrétní změna s ověřeným jedinečným anchor textem, žádné obecné trim/normalizování.
- Skutečný hardBind buffer musí zachovat celý historický12float prefix a doplnit `[Math.fround(.06),Math.fround(.001),0,0]`. Tím se ověřuje zachované výchozí ohýbání trávy, nikoli jen přítomnost nového jména.

Úplná metadata, obě shaderová těla, hodnoty defines, původní canonical defines/prefixes, počet sdílených programů, uvolnění reference i ostatní varianty se stále porovnávají. Historická Standard IBL výjimka a explicitně unsupported order-sensitive processor zůstávají beze změny.

## Přesné vegetační delta

Aktuální produkční `createGrassPatches` se rozdělí podle příslušnosti skutečných světových souřadnic bodů do **RAW_LANDCOVER** trávníků. Nezakládá se druhý generator ani se nepřepisuje globální landcover.

| Část | Patches | Body | SHA JSON přesných patch records |
|---|---:|---:|---|
| Původní OSM |597|80576|`c852a5980990694f5fced980ce3b980babc6b838e9805fa70f74987f4d3742bd`|
| Dvě nové B6 reference |20|2294|`4e8fef0f38eacfa5d087deada2809179269d648981bd4fc49713ea40cd44479d`|
| Celek (pouze audit, nenahrazuje starý oracle) |617|82870|`72f2f802c076d4e5af1fc5f14a553e1b210507d6bc5808b0d9dca1a34bff5e2e`|

Původní SHA ověřuje všechny lokální polohy, velikosti, yaw i pořadí. Každý nově přidaný bod musí ležet uvnitř jedné ze dvou jmenovaných source reference ploch; kontrolují se jejich přesná ID, samostatný počet/fingerprint, disjunktnost tile bank a celkový součet. Ostatní exhaustive oracly pro ulice/okraje/holes/clearance/grass/forest/trees zůstávají. Úplný odvozený audit včetně20tile IDs a SHA zdrojů je `vegetation-delta.json`.

## Ověření a procesy

Před shellem použit `activate.ps1`, který nyní nastavuje i `GIT_CEILING_DIRECTORIES`; Node přímo, bez pnpm instalace a bez zápisu do junction. Root dostal oznámení před CPU oknem i po jeho ukončení a v tomto okně neměřil GPU.

```powershell
node node_modules/tsx/dist/cli.mjs --test --test-concurrency=1 tests/material-defines-wgsl-order.test.ts tests/vegetation-index.test.ts
```

Finální **17/17 PASS**, exit0,37.603s; `.cache/terrain-regression-deltas-20261025/targeted-final.log`. `DEFINE_ORDER_REPORT` ukládal skutečné nativní processor výsledky do `wgsl-final.json`; první RED běh je samostatně `targeted-tests.log`/`wgsl-current.json`. NullEngine/WGSL processing zde není GPU kompilace ani výkonový důkaz.

Všechny vlastní CPU procesy skončily. Root byl výslovně informován, že může znovu měřit GPU; další testy ani typový/full build se nespouštěly. Předání doplňuje `checkpoint.json` a scoped diff, potom release `terrain-deltas-01a16b37`. Root může převzít tyto přesné vlastní změny přes `--adopt-dirty`, doplnit je do kandidátního snapshotu a provést svou celkovou přejímku.
