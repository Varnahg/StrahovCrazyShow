# B1: odvozené prostorové podklady pro runtime

Stav 24. 10. 2026: implementace a malé analytické testy jsou hotové; skutečný export B1 a herní ověření přebírá koordinátor. Tento dokument nepotvrzuje nové zaměření ani dostupnost konkrétního vchodu.

## Vstup a rozhodnutí

Jediný prostorový vstup je přijatý `shared/data/cad-buildings/b01.json`, odvozený z uloženého R10 Blender modelu. Obsahuje modelové lokální XYZ v metrech, Y nahoru. Převod Blender `(x,y,z)` na herní `(x,z,-y)` už provedl `build_model.py::export_collision`; exporter site jej neopakuje. Výšky modelu zůstávají zdokumentovanou interpretací původních podkladů. CAD, recipe, nový půdorys ani pracovní odhad world placement se nenačítají.

Rozumné varianty výřezu terénu:

| Varianta | Důsledek |
| --- | --- |
| Obdélník nebo konvexní obal | Vymazal by venkovní dvory mezi křídly; zamítnuto. |
| Pouze jednotlivé podlahy | Nechal by původní terén v jejich schodišťových otvorech; zamítnuto. |
| Pouze projekce střech | Nezahrnul by doložené půdorysné odchylky nižších podlah; zamítnuto. |
| Sjednocení skutečných projekcí všech desek a explicitních modelových výřezů | Zachová vnější konkávnost i skutečné nezakryté otvory, střechy překryjí vnitřní schodišťové mezery; zvoleno. |

Desky jsou konkrétní collision parts s `role=slab`, střechy jsou jejich `:slab:roof` podmnožina. B1 má střechy jak v N01, tak v N04. Export zapisuje jejich přesná ID, plochy projekcí, plochu sjednocení střech, rozšíření nízkých desek mimo střechy a celkovou plochu výřezu do `derivation`. Stair a stair-landing nerozšiřují půdorysný výřez; venkovní šachty a konkrétní schodiště pokrývají pouze explicitní `model.terrainCutouts`. Výškové a provenienční údaje těchto vstupů se zachovávají v derivation; výstupní terrainCutouts je XY/XZ půdorysná operace nad jednovrstvým herním terénem, nikoli náhradní objemová kolize.

## Povrchy a transform

Horní i dolní plochy vznikají přímo z orientovaných kolizních trojúhelníků s rolí slab, stair nebo stair-landing. Znaménko normály Y odlišuje podporu od zakrytí. Svislé plochy se vyloučí, koplanární projekce se sjednotí v rámci konkrétního partu. Žádné změny XY, hull, uzavírání malých děr, ani vyhlazení hran. Roviny mají tvar `y=a*x+b*z+c`; koeficienty se seskupují na osm desetinných míst a každý původní vrchol musí dodržet maximální reziduum 0,00001 m. Tato tolerance není tvrzením přesnosti historické budovy.

`supportSurfaces` a `coverSurfaces` mají partId, floor, role, plane, bounds a loops; první loop je vnější obvod, ostatní díry. Neopakují poslední vrchol. `cadSpaceAtLocalPosition(site, center)` přijímá skutečný střed kapsle z Actor.position. Hledá nejvyšší podporu pod středem a nejnižší podhled nad ním, včetně šikmého spodního líce schodů nad s146. Bez podpory nebo zakrytí vrací undefined. Dotaz nevyžaduje kontakt chodidel s podlahou, takže při skoku nezruší interiér. Neodvozuje obyvatelnou místnost z pouhého označení patra; reálný krytý venkovní prostor může také vrátit podporu a zakrytí.

Sdílený helper je čistý, bez závislosti na world/terrain/simulation. Placement je `{translation:{x,y,z},yaw}`. Dopředný transform:

```
worldX = translation.x + cos(yaw)*localX + sin(yaw)*localZ
worldY = translation.y + localY
worldZ = translation.z - sin(yaw)*localX + cos(yaw)*localZ
```

Inverzní transform používá transponovanou rotaci. Nenulové Y/yaw jsou ověřené proti skutečnému Babylon Matrix.Compose + Quaternion.RotationAxis; žádný odhad umístění B1 není zapečený do helperu. `transformCadPositions` vrací nový Float32Array pro vlastníka colliderů a vstup nemění. Dotazy neudržují globální cache ani world stav. Načtení/export má jeden trvalý JSON, dotaz používá bounds před testem polygonu. Výkon celé hry tímto nebyl změřen.

## Reprodukce a lifecycle

Koordinátor po převzetí a získání heavy-validation spustí:

```
py -3.14 -B scripts/cad-buildings/export_site.py --model shared/data/cad-buildings/b01.json --output shared/data/cad-buildings/b01-site.json
```

Exporter vyžaduje Shapely 2, nepotřebuje Blender ani CAD. SHA collision vstupu počítá ze skutečných bajtů; SHA blend/GLB přebírá z deklarací téhož auditovaného collision modelu. Samostatně nečte a nerevaliduje blend/GLB: jejich shodu a nedotčenost ověřuje integrátor. Chyba při odvození nebo zápisu nahradí žádný dřívější výstup; publikace dočasného souboru v témže adresáři používá os.replace. Dočasný soubor se uklidí i při chybě. Zápis přes zdrojový model je odmítnut.

Malá ověření 24. 10. 2026:

- `py -3.14 -B scripts/cad-buildings/test_export_site.py -v`: 9/9 PASS. Otvory, venkovní dvůr, malá skutečná díra, nižší deska mimo střechu, nezvětšování výřezu schodištěm, explicitní shaft, orientace, šikmá spodní plocha, SHA a atomická chyba.
- `pnpm exec tsx --test tests/cad-building-geometry.test.ts`: 6/6 PASS. Babylon transform, inverze, nový buffer, polygonové hranice a díry, s146 analogie, mezipodesta, střed kapsle/skok/střecha/dvůr.
- Cílené `tsc --noEmit` pouze nad helperem a jeho testem: PASS.

Plný B1 export, jeho konkrétní počty/plochy a runtime/browserové testy zde zatím nejsou vydávány za PASS. Žádný placeholder b01-site.json nebyl vyroben. Při skutečném exportu je nutné zkontrolovat derivation, konkrétní vchody/šachty/s146, soulad terénního renderu a kolizí i skutečné world placement. Výstupní JSON nemá čas generování, aby shodné vstupy a verze Shapely dávaly shodné bajty.
