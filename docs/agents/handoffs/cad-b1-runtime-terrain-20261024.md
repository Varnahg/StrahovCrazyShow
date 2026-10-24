# Předání: cad-b1-runtime-terrain-20261024

- Vlastník: `cad-buildings-01a16b37-runtime-terrain`; příjemce: root koordinátor runtime integrace.
- Pracovní kopie: `C:/Users/rezac/.codex/worktrees/cad-building-models/StrahovCrazyShow`; větev `codex/b1-playtest-20261024`; baseline `6dd89606b137ccf4ea156a4978b649a87c818b1e`.
- Výsledek: čistý společný geometrický helper pro odečítání půdorysných výřezů je implementovaný a cíleně ověřený. Zapojení do `shared/terrain.ts`, celé hry, kolizí a drapovaných povrchů zůstává úkolem koordinátora.
- Změněné soubory: `shared/terrain-cutouts.ts`, `tests/terrain-cutouts.test.ts`, tento handoff. Nic nestagováno ani necommitováno. Žádné cizí WIP nebylo převzato či upraveno; `shared/terrain.ts` zůstal pouze čtecím podkladem.

## Rozhraní a rozhodnutí

```ts
compileTerrainCutouts(polygons: readonly TerrainCutoutPolygon[]): CompiledTerrainCutouts
subtractTerrainTriangle(triangle: TerrainCutoutVertex[], compiled: CompiledTerrainCutouts): TerrainCutoutVertex[][]
```

`TerrainCutoutPolygon.loops` obsahuje vnější XZ prstenec a následné díry. `TerrainCutoutVertex` je `[number, number, number]` ve světovém XYZ. `CompiledTerrainCutouts.bounds` je veřejný `{minX,maxX,minZ,maxZ}|null`; v prázdném souboru výřezů je `null`. Funkce nemají závislost na B1, world, terrain, scéně ani fyzice. Vstupy se nemění. Nezasažený trojúhelník se vrací původní referencí v jednoprvkovém poli. Kompilace si souřadnice kopíruje a pozdější změna vstupních prstenců ji neovlivní.

Pouhá bbox maska nebo odebrání celých terénních buněk by odstranilo terén i mimo budovu; klasifikace těžiště by nechala šikmé trojúhelníky přes šachty. Nová polygonová boolean knihovna by znamenala další závislost a integrační náklady. Zvolena je existující pinovaná `earcut` triangulace jednou při kompilaci, včetně konkávních obrysů a děr. Následně se z původního terénního trojúhelníku odečítají její konvexní trojúhelníky pomocí sdíleného dělení půlrovinami. Překrývající se výřezy se tak chovají jako sjednocení; díra ve výřezu zůstává terénem, pokud ji neodstraní další výřez.

Clipping zachovává konvexní zbytky až do poslední triangulace, aby se při každém kroku zbytečně nemnožily trojúhelníky. Jediný vypočtený průsečík XYZ sdílejí obě strany řezu. Výška je lineárně interpolovaná v původní rovině; nic se znovu nevzorkuje. Zachovává se původní orientace bez předpokladu Babylon/Rapier konvence. Kontroly bbox celé kompilace, polygonu a jednotlivého cutter trojúhelníku odmítnou nezasaženou oblast před clippingem. Kompilaci držte jednou u neměnného souboru půdorysů; netriangulujte výřezy pro každý terénní trojúhelník nebo snímek.

Tolerance je **1e-9 metru** od normalizované hrany, ekvivalent cross-product tolerance `délkaHrany * 1e-9`. Neopakuje tedy dřívější chybu pevného cross-product epsilon, která rozšiřovala krátké hrany o centimetry. Nulová/zanedbatelná plocha XZ se zahazuje; finální výstupy obsahují jen konečné nedegenerované trojúhelníky. Souřadnice se při triangulaci výřezu posunou do lokálního počátku kvůli přesnosti při velkém světovém offsetu.

Podklady: současný `shared/terrain.ts` a jeho komentář k metrickému epsilon, existující terrain testy, lokální primární README instalované knihovny `earcut` (API, díry, winding, předpoklad jednoduchých prstenců). Datum práce 2026-10-24. Nejde o nové geografické nebo výškové odhady.

## Ověření

Příkaz `pnpm exec tsx --test tests/terrain-cutouts.test.ts`: **14/14 PASS**, exit 0, poslední běh 0,461 s. Analytické testy zahrnují:

- žádný zásah a zachování reference, úplné pokrytí a částečný řez hranou;
- konkávní L se známou plochou, otvor ve výřezu při obou orientacích prstenců;
- překryvy a duplicity výřezů, včetně jiného výřezu částečně zasahujícího do díry;
- obě orientace vstupního trojúhelníku, šikmou výškovou rovinu;
- pouhý dotyk hrany/vrcholu, krátkou cutter hranu 0,1 mikrometru bez umělého rozšíření;
- různé škály, zachovaný mikrometr široký zbytek terénu a světový offset 1e8 m;
- shodné koncové XYZ výřezu na společné hraně dvou různě nakloněných sousedních terénních trojúhelníků;
- nezávislost kompilace na pozdější mutaci vstupu a odmítnutí NaN/Infinity/vadných prstenců.

Cílený typecheck obou nových souborů:

```text
pnpm exec tsc --noEmit --target ES2022 --module ESNext --moduleResolution Bundler --strict --skipLibCheck --types node --esModuleInterop shared/terrain-cutouts.ts tests/terrain-cutouts.test.ts
```

Výsledek: exit 0. Neběžel celý `pnpm test`, build, server, Blender ani GPU. Důkazy testů jsou v tool výstupu tohoto předání; task nepovoloval vlastní cache/log adresář, proto nebyly vytvářeny další soubory mimo tři rezervované cesty.

- SHA-256 helperu: `009488c5e855142d062b4c6bb1b506bd75bf7e6b835acfa695618f044145361a`.
- SHA-256 testů: `bd7057a970d7af9a2a6a9ecccf688c7e56384a31c9999790d7a96b6c8db8e45c`.

## Omezení a převzetí

Kontrakt vstupu předpokládá jednoduchý vnější prstenec a disjunktní díry přísně uvnitř. Helper kontroluje konečnost, degeneraci a shodu triangulované plochy, ale není opravou libovolné neplatné polygonové topologie. Zachovává geometrickou hranici; nevytváří globální konformní remeshing všech sousedních ploch. Podklady B1 a jejich runtime transform musí přejmout integrátor zvlášť. Numericky nepoužitelné rozsahy, nesprávný počet XYZ vrcholů a nekonečné hodnoty se odmítají výjimkou.

Všechny vlastní pomocné příkazy skončily. Žádný proces, port ani další zdroj nezůstává aktivní. Po tomto GREEN předání vlastník uvolňuje rezervaci a výslovně předává vlastní untracked WIP root koordinátorovi k převzetí přes `--adopt-dirty`. Task není označen Done; stav a integrační důkazy doplní koordinátor po zapojení do společného terénního řetězce.
