# B1: dvě lokální napojení venkovních prahů

`shared/data/cad-buildings/b01-entry-grade.json` opravuje pouze dvě konkrétní oblasti před dveřmi `n01-door-30F4` a `n01-door-312B`. Data se aktivují při `hasCadBuilding("53929063")` stejným sdíleným terrain-patch API pro render, Rapier a drapované povrchy. Native Blender model, dveřní flagy, placement ani původní DMR se nemění; nepřidává se nový schod nebo samostatná neviditelná kolize.

## Zdroj a geometrie

Zdroj je původní IPR Praha, léto 2023, licence **CC BY**, atribuce **datový podklad © IPR Praha**. Generátor přímo dekóduje určené trojúhelníky z originálních I3S binů, ověří jejich hash proti manifestu a vyžaduje hladkou normálu vzhůru. Souřadnice patchů odvozuje z native ostění včetně `normalOffset`, `cadOrigin` a aktuálního photo placementu. Explicitně vybraný world outside bod pouze určuje vnější stranu a konec malé předprahové oblasti.

| Dveře | Primární zdroj | Charakter podkladu | Plane Y venku | Native podlaha uvnitř |
| --- | --- | --- | --- | --- |
| 30F4 | `1127362:665` | Přímý ground hit v outside bodě | 2,1244622 m | 2,2698419 m |
| 312B | `1127370:666`, kontrola `:655` | Zakryté místo; celá plocha je explicitní extrapolovaný historický/foto odhad | 2,1786338 m | 2,2698419 m |

Roviny v herním world prostoru:

```text
30F4: Y = -0.013837599827918916 X - 0.005380148573695428 Z + 1.388924211057926
312B: Y = -0.010586919459267369 X + 0.04956690582438125 Z - 0.8145550220093516
```

U 30F4 je samotné jádro široké 0,838192 m a má **0,397303 m²**. Z toho **0,206369 m²** leží přímo v projekci source ground triangle; zbytek blízko prahu je odděleně označená interpretace, nikoli dodatečně změřený terén. Plane ve středu prahu dává 2,1270472 m.

U 312B je outside bod přibližně **0,568886 m** od source triangle. Jádro je omezeno maximální schválenou vzdáleností **1,051 m** od této projekce; nepatrný přední roh mimo limit (0,004462 m²) se do plane jádra nepřidává. Celé zachované jádro **0,400410 m²** má kategorii `extrapolated-historical-occlusion-game-grade` a prázdnou source-supported masku. Kontrolní triangle :655 dává o 5,37 mm nižší výšku venku a o 7,70 mm nižší projekci ve středu prahu. Plane projekce středu prahu je 2,2025471 m; kvůli přesnému omezení jádra má výsledná TIN v tomto bodě 2,2023514 m. Žádná z těchto hodnot se nevydává za geodetické zaměření prahu.

## Přechod a původní terén

Za hranou každého jádra je pouze **0,3m zaoblený přechod**. Výška nejbližšího schváleného okraje se mísí s původním DMR; source rovina se v přechodu dále neextrapoluje. Jádro a přechod mění přibližně **1,439 m²** u 30F4 a **1,442 m²** u 312B. Největší lokální rozdíl od hrubého DMR je **0,3831431 m** u části prahu, nikoli plošné zvýšení budovy či okolí.

30F4 vlastní jednu původní buňku **X [-76,-72], Z [56,60]**. U 312B je pro plynulý obvod přibrán sousední pás buněk: **X [-80,-72], Z [40,48]**, čtyři buňky. Celý vnější obvod má přesné původní F32 DMR výšky; mimo malé aprony se původní DMR zachovává i uvnitř těchto buněk. Původní NE–SW diagonály a společné hrany jsou triangulační constraints. Kombinovaný dataset má **153 vrcholů, 290 trojúhelníků, 5 buněk**, přibližně 21 kB. Mezi dvěma nespojenými oblastmi se žádný nový terén nevytváří.

## Reprodukce a stav

```powershell
uv run --no-project --with shapely==2.2.0 python -B scripts/cad-buildings/export_grade.py `
  --building b01 --terrain shared/data/terrain-grid.json `
  --model shared/data/cad-buildings/b01.json `
  --alignment shared/data/cad-buildings/photo-alignment.json `
  --photo-manifest shared/data/photogrammetry.json --public-root public `
  --output shared/data/cad-buildings/b01-entry-grade.json
```

Konkrétní dvojice dveří a primárních source triangles je v `B1_ENTRY_SOURCES`; jde o výslovně přidělené napojení dvou problémových vstupů. JSON uchovává zdrojové hashe, placement, dekódované body příslušných ground triangles, roviny, source/estimated masky a omezení. Při změně native modelu nebo photo pose je třeba dataset přegenerovat a znovu ověřit.

Společná malá přejímka grade pipeline: **10/10 Python a 7/7 TypeScript testů PASS**, cílený typecheck PASS. Testy ověřují identitu, plochu, diagonály, world výšky obou outside bodů, společné i vnější hrany, oddělení extrapolace, podmíněnou aktivaci B1/B6 a zachování původního north-court datasetu. Skutečné průchody Actorem v celém světě a vizuální kontrolu provede koordinátor; tento dokument je neoznačuje za dokončené.
