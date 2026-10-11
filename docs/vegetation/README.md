# Mapované povrchy, stromy a vítr

Implementace 10. 10. 2026. Výchozí data jsou archivované OSM podklady v `shared/data/landcover.json`: 93 mapovaných polygonů a 36 stromových uzlů v širším výřezu. Autorství mapových dat: **© OpenStreetMap contributors, ODbL**. Nejde o terénní inventarizaci ani licence fotografií. [Zdrojový výřez OSM](https://api.openstreetmap.org/api/0.6/map?bbox=14.3868,50.0784,14.3972,50.0834), [atribuce OSM](https://www.openstreetmap.org/copyright).

## Co je přímo zapojené

- Základní zem má neutrální zemní/zpevněný povrch. Samostatné mapované polygony odlišují skutečnou trávu, umělý trávník, písek, tartan/antuku a lesní podklad. Mají stabilní výškové vrstvy 0,8–7,5 mm nad zemí (tráva 2,5 mm), takže různé vnořené povrchy nejsou koplanární; všechny zůstávají pod stávajícími cestami. Nepřidávají fyzikální překážky.
- 3D tráva vzniká pouze v explicitních OSM grass/meadow/grassland nebo pitch se surface=grass. Park bez doloženého trávníku, neznámé sportoviště a lesní podklad ji automaticky nedostávají. Umělý trávník, písek, tartan, antuka, budovy a cesty se vylučují.
- Ve zmražené integrované verzi je **67 stromů: osm zachovaných OSM uzlů a 59 interpretovaných korun** z georeferencovaného ortofota IPR z 8. 6. 2024. Zdroj obsahuje 78 ručně označených korun; duplicitní body a polohy v komunikacích či stavbách se vyřazují, nepřesouvají náhodně. Provenience je `reference-interpreted-not-surveyed`, nejistota středu 2,5 m. Koruna není zaměřený kmen, výška a druh jsou neznámé. [Důkaz a georeference](../streets/README.md), datový podklad © IPR Praha, CC BY 4.0. Původní doplňované lesní body byly nahrazené tímto podkladem.
- Sdílený export `TREES` řídí vykreslování i stávající serverové kolize kmenů. Původní koule korun a náhodný rozptyl stromů jsou odstraněné.
- Hra jednou načítá původní Blender GLB `public/models/vegetation/broadleaf-tree.glb`, sloučí větve a listy do dvou sdílených zdrojů a instancuje je. Textury kůry/listových shluků a geometrie jsou vlastní procedurální tvorba projektu; model není sken konkrétního stromu na Strahově. Editovatelný zdroj je `assets/blender/vegetation/broadleaf-tree.blend`, reprodukce `scripts/create-vegetation.py`.
- Listy používají mipmapy, trilineární filtrování a alpha test bez alpha blend vrstvení. Listové shluky a tráva se ohýbají ve vertex shaderu podle směru a síly větru, s nulovým posunem při nulové rychlosti. Kmen se nehýbe. Geometrie se každý snímek nepřepisuje na CPU.

## Výkonové hranice

Travní dlaždice sdílejí jedinou autorskou geometrii16 zakřivených stébel a PBR materiál. Kvalita vybírá4/8/16 stébel sdíleným indexovým bufferem; nejvyšší vrcholy a konzervativní bounds zůstávají zachované. Tráva přijímá společná světla a stíny bez vlastního nočního emisního minima; podrobnosti v grass-lighting.md. Každá používá thin instances. Počet rezidentních shluků závisí na aktuálních mapových výlukách; původní komponentový audit 272 dlaždic / 30 905 shluků předcházel rozšířeným polygonům komunikací. Aktuální aktivní počet zaznamenává JSON herního benchmarku.

| Kvalita | Viditelný dosah stébel | Aktivní dlaždice nejvýše | Hustota | Horní mez aktivních shluků |
| ------- | ---------------------: | -----------------------: | ------: | -------------------------: |
| Nízká   |                   35 m |                       16 |  37,5 % |                      1 536 |
| Střední |                   45 m |                       24 |    65 % |                      3 984 |
| Vyšší   |                   60 m |                       32 |   100 % |                      8 192 |

Shluk má šest trojúhelníků. Fragment shader postupně potlačuje vzdálené shluky pomocí stabilního hashe; nepřehazuje náhodný vzor každý snímek. Dlaždice se vybírají nejvýše přibližně 6,7krát za sekundu, se zvýhodněním již aktivních. Stromy mají sdílené zdroje a rozdílné měřítko/natočení. Cíl 100 hráčů a FPS celé scény stále vyžaduje hlavní GPU benchmark.

## Integrace a ověření

`buildWorld` volá `buildLandcover(scene)`. Hlavní Game startup volá `await loadVegetation(scene)`; před renderem aktualizuje controller přes `update({dt,time,wind:{x,z,speed},daylight,player,quality})`. Čas je v sekundách, rychlost větru v m/s, směr x/z se normalizuje. Controller má `dispose()` a inspectovatelné `stats`; neúspěšné načtení stromu je explicitně v `stats.loadError` a nevytváří tiché tvrzení o hotovém modelu.

`pnpm exec tsx --test tests/vegetation.test.ts` kontroluje mapové výluky, shodu stromů, nulový vítr, limity a skutečně sdílenou geometrii/aktivní instance v Babylon NullEngine. NullEngine nekompiluje GPU shadery. Browser audit musí potvrdit shader compilation, alpha okraje/mipmapy, počasí, noc, dosah a skutečné FPS. Bez těchto důkazů nelze vydávat vrstvu za výkonově ověřenou hru.
