# Komunikace, parkování, světla a fotogeoreference Strahova

Aktualizace 10. 10. 2026. Výstupem jsou **herní polygony a sdílené souřadnice**, ne pouze seznam odkazů. [Prostorový kontrolní náhled](preview.html) se spouští přes lokální Vite na `/docs/streets/preview.html`.

## Co je v datech

`shared/data/streets.json` vychází z úplného oficiálního OSM výřezu `.cache/osm.xml`, nikoli ze starého zjednodušeného `MAP.paths`. Zachovává identifikátory uzlů, celou střednici a tagy `highway`, `name`, `surface`, `width`, `lanes`, `sidewalk`, `kerb`, `lit`, parkování i schody. V herním území a dvanáctimetrovém přesahu obsahuje:

- 156 úseků: 33 silnic/obslužných komunikací, 105 pěších spojení, 15 schodišť a 3 explicitní `footway=sidewalk`;
- 11 skutečných polygonů parkování, které se již nemají zobrazovat jako zelená plocha;
- 15 OSM bodů lamp a 6 bodů přecházení; pouze **2** mají doložené namalované značení;
- doložené názvy Vaníčkova, Olympijská, Jezdecká, Chaloupeckého, Strahovská a Šermířská.

Jezdecká má zdrojový tag `width=9`. U zbývajících 155 úseků je šířka **výslovně odhad podle třídy**, nikoli změřená skutečnost. Například hlavní silnice používá 7 m, běžná místní 6 m, obslužná 4,2 m a neoznačená pěší spojka 1,8 m. Zdrojové tagy se nepřepisují tímto odhadem. `sidewalk=separate` nepřidává vymyšlený paralelní chodník: vykreslují se skutečně mapované samostatné linie. `sidewalk=no` zůstává zachované.

## Povrchy a průchodnost

`scripts/fetch-streets.py` provádí GIS operace při sestavení. Každá linie se rozšiřuje na polygon se zaoblenými spoji a konci. Polygony se sjednotí, rozdělí podle materiálu a odečtou se půdorysy budov. Materiálové plochy jsou navzájem disjunktní; velká parkoviště jsou vyplněné plochy a zatáčky/křižovatky nemají mezery mezi natočenými kvádry. Zobrazení ponechává skutečné otvory a ostrůvky. Podzemní/zakryté komunikace se na zem nepromítají, včetně Strahovského tunelu ve zdrojovém výřezu.

`client/streets-renderer.ts` vytváří čtyři spojené povrchové meshe (asfalt, kamenná dlažba, chodníková dlažba, nezpevněný povrch), tři sloučené meshe svítidel a jeden mesh značení. Vlastní jemné textury mají mipmapy. Nejde o kopírované obrázky z map ani o ortofoto použité jako herní textura. Výškový odstup povrchu je jen 18 mm proti podkladu. Depth bias odstraňuje blikání vzdálených vrstev na integrované grafice; nerozšiřuje kolize ani nevytváří schody.

Terén **zůstává rovinný demonstrační model**. Mapa ukazuje skutečné půdorysné návaznosti, ale nemá zaměřené výšky svahů, obrub, venkovních schodišť a ramp. V OSM výřezu nejsou doložené čáry obrub s výškami, a proto nebyly vytvořené blokující obrubníky. Tento krok není tvrzení, že je již celý areál přesnou průchozí kopií.

## Integrační API

```ts
import { buildStreets } from './streets-renderer';
// Nahrazuje starou smyčku MAP.paths a starou pravidelnou řadu lamp.
buildStreets({ scene, mat: (hex) => sharedMaterial(hex), lights });

import { STREET_COLLISIONS, isStreetSurface, streetSurfaceAt } from '../shared/streets';
for (const b of STREET_COLLISIONS)
  simulation.solid(b.x, b.y, b.z, b.w, b.h, b.d, b.yaw);
// Full dimensions; rendered lamp poles and bases use the same values.
if (!isStreetSurface(x, z)) { /* candidate grass/tree position */ }
```

`streetSurfaceAt` vrací materiál nebo `undefined`, ze stejných polygonů jako renderer včetně parkování. `STREETS`, `STREET_FEATURES`, `STREET_SURFACES` a `LAMP_PLACEMENTS` poskytují podrobnosti pro mapu/editor. Kořenový tým provádí hooky v rendereru světa, fyzice a vegetaci; tento díl tyto souběžně upravované soubory neměnil.

Lampy jsou na skutečných mapovaných bodech; výška 6 m, model svítidla a natočení k nejbližší komunikaci jsou **typologický odhad**, nikoli inventář skutečných svítidel. Zdrojové body pokrývají hlavně západ areálu a okolí sportovišť. Chybějící bod neznamená, že východ areálu nemá osvětlení. Pravidelná smyšlená řada uprostřed areálu se tímto nahrazuje. Noční stav je výtvarná simulace, nikoli živá evidence provozu lamp.

## Otevřené ortofoto a stromy

Veřejná [služba IPR Praha](https://gs-pub.praha.eu/imgs/rest/services/ort/letecke_snimkovani/ImageServer) uvádí snímkování **8. 6. 2024**, rozlišení původních dat 10 cm/px a povoluje analýzu. Jeden lokální výřez `strahov-ortho-2024.jpg` má 2048 × 1265 px pro celou hratelnou oblast. Jeho souřadnice EPSG:3857, rozměry a SHA-256 jsou v `ortho-georeference.json`. IPR poskytuje otevřená data pod [CC BY s doložkou „datový podklad © IPR Praha“](https://geoportalpraha.cz/data-a-sluzby/otevrena-data).

`build-survey.py` zaznamenává **78 jednotlivě vizuálně určených korun**. Nejde o náhodný rastr. Každá má původní pixel, převod na WGS84 i místní metry, odhad průměru a původ `reference-interpreted-not-surveyed`. Uvádí se přibližný střed koruny, nejistota polohy 2,5 m; nejsou známé přesné kmeny, druhy ani výšky. Souvislé porosty, jejichž jednotlivé koruny nelze spolehlivě oddělit, nejsou vydávané za přesný počet stromů.

`shared/data/surveyed-trees.json` je vstup pro společnou vegetaci. Při zařazení je potřeba deduplikace s OSM stromy a vyřazení středu v budově nebo na komunikaci; vyřazený bod se nemá náhodně přesouvat. [Kontrolní překryv](survey-overlay.jpg) zobrazuje žlutě střednice silnic, tyrkysově pěší spojení a číslované koruny. Obraz byl ručně kontrolován po čtyřech nezmenšených výřezech s pixelovou sítí.

## Matice doložení a mezer

| Oblast | Použitý podklad / vizuální ověření | Zbývající mezera |
|---|---|---|
| Vaníčkova a zastávky Koleje Strahov | OSM střednice/tagy, IPR ortofoto, PID GTFS společný souřadnicový systém | Měřená šířka jízdních pruhů a bezbariérové detaily přechodů |
| Olympijská severně od B5–B7 | OSM komunikace a parkování, IPR koruny a pěší diagonály; existující panorama B6 2023/2025 | Přesné výšky, obruby, úplný inventář lamp |
| Jezdecká jižně od řady B2–B10 | OSM `width=9`, povrch asfalt; IPR potvrzuje průběh ulice a diagonály | Výška podélného svahu a přesné obrysy každého vjezdu |
| Chaloupeckého / centrální parkování | OSM polygon parkování a obslužné větve, vizuálně srovnané s IPR | Aktuální malované parkovací boxy a případné změny po roce 2024 |
| Spojky B6, B7, R-ko | Úplné OSM pěší linie; IPR, existující panoramatický průzkum | Kóty venkovních schodů/ramp, aktuální provoz vstupů |
| Východ u B11/B12 | OSM půdorysná síť, IPR plochy a jednotlivé koruny | Část porostů je souvislá, lampy nejsou úplně zmapované |

Další skutečně přesná etapa potřebuje výškový model a kontrolu chodníků/obrub v [DTM Prahy a Středočeského kraje](https://map.dtm-praha-sck.cz/) a více pozemních stanovišť. Google/Mapy panoramata zůstávají odkazy pro ruční inspekci. Hromadný obrazový download ani vymyšlené rozměry nejsou součástí tohoto výstupu.

## Reprodukce a ověření

```powershell
# Jednorázové GIS závislosti do ignorované lokální cache, mimo runtime hry:
& 'C:/Program Files/Blender Foundation/Blender 5.2/5.2/python/bin/python.exe' -m pip install --target .cache/street-python shapely pyproj pillow
& 'C:/Program Files/Blender Foundation/Blender 5.2/5.2/python/bin/python.exe' scripts/fetch-streets.py
# --refresh znovu načte OSM; --ortho získá jeden otevřený georeferencovaný výřez.
& 'C:/Program Files/Blender Foundation/Blender 5.2/5.2/python/bin/python.exe' docs/streets/build-survey.py
pnpm exec tsx --test tests/streets.test.ts
pnpm exec tsc --noEmit
```

**5/5 testů PASS, TypeScript PASS.** Testy kontrolují tagy a původ šířek, vyloučení podzemních cest, orientaci trojúhelníků i díry, centroidy mimo budovy, souvislý povrch skutečných společných OSM uzlů, soulad GTFS autobusů s asfaltem Vaníčkovy a shodu lampových kolizí. GIS audit uvádí nulový plošný překryv s půdorysy budov.

Skutečný WebGL prohlížečový náhled byl ověřen půdorysně, šikmo a večer. Při kontrole se našly a opravily dvě chyby, které čistá geometrická kontrola neodhalila: culling obrácených indexů v RH scéně a depth z-fighting proti velké podkladové rovině. Uložené snímky: `browser-streets-day.jpg`, `browser-streets-night.jpg`. Náhled měří a ukazuje tento díl komunikací; není výkonovým auditem celé hry ani důkazem finální integrace kořenovým týmem.
