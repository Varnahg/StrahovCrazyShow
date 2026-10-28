# Jantar: původ a zpracování assetů

Task `jantar-home-20261028-assets`, Linear KEY-66. Připraveno 28. 10. 2026 v pracovní kopii `jantar-home`, větev `codex/jantar-home`, baseline `e09d60fa24419a93b26f15e21c862e95e44aff2f` nad přijatým main `de6f87a2efbf8596bb03efae863e8d6763e22774`.

## Mapa

Podklad tvoří původní projektová data, nikoli nová AI fotografie nebo mapové dlaždice. Zdrojové JSON se nemění.

| Soubor | Původ a čas | SHA-256 původních bajtů |
| --- | --- | --- |
| `shared/data/map.json` | OSM; staženo `2026-10-10T19:22:25.150Z` | `cc41d5fc78ffbff275468cdd191e96c74e1c9dc09a74be7bc82a918184c7f64c` |
| `shared/data/streets.json` | OSM s projektovou interpretací IPR 2024; generováno `2026-10-10T21:41:59.292816+00:00` | `d1d9d27cfbd0cb62a4d1be9c3d1e1eff774e126fc257d61d1e32d51c6c687b14` |
| `shared/data/building-catalog.json` | OSM, kontrola `2026-10-10`; stadion relation `1515034` | `ed435ec06401b5ea8ea604ca75af0a9fd3a2d7e8252ca65f018853c19a3a804b` |

Mapová data: © OpenStreetMap contributors, ODbL 1.0. Interpretovaný podklad cest: © IPR Praha, CC BY 4.0. Projektové zdroje rozlišují mapové údaje, odhadované šířky a interpretaci snímku; tato dekorace nepřidává zaměření ani aktuální leteckou fotografii. Uvedení původu na úvodní stránce obstarává sekce O projektu rodičovské implementace.

Společné pevné natočení `+1.690770010257384°` odvozuje helper z nejdelší hrany B6 (OSM way `53929071`, vektor `[1.47, 49.8]`). Stejné otočení dostávají všechny souřadnice všech vrstev; žádná budova se nepřesouvá ani neotáčí zvlášť. Čistá transformace zachovává délky i plochy. SVG serializuje každou souřadnici na tři desetinná místa v metrech (chyba bodu pod 1 mm), zachovává každý zdrojový vrchol, uzavření i díry. Pořadí vrcholů půdorysů se případně obrací, aby se překryté budovy ve společné nonzero výplni nevyrušily; vstup se nemutuje.

Vykreslení obsahuje 143 půdorysů, 148 polygonů cest s 79 dírami a stadion s jedním vnějším a jedním vnitřním prstencem. Čtyři materiály cest mají samostatný `evenodd` path, aby se jejich vzájemná překrytí nevyrušila. Koleje tvoří vlastní barevnou vrstvu; všechny budovy jsou zahrnuté právě jednou. Legacy `map.paths` se nekreslí, aby se cesty neduplikovaly.

Zvoleno bylo statické SVG před interaktivním `MapView` (zbytečný stav a handlery) i rasterizací (další obrazový asset a horší změna měřítka). Sedm řetězců cest a React strom vznikají jednou při načtení modulu. Výsledek nemá efekty, časovače, event listenery, síťové dotazy ani vlastní engine. `viewBox="-610 -310 980 610"` a `xMidYMid slice` zachovávají poměr stran i při ořezu na úzkém displeji. `aria-hidden`, `focusable="false"` a `pointer-events="none"` zajišťují čistě dekorativní roli; názvy, čísla, značky a ovládání chybí. Rodič vlastní rozměry, Jantar barvy, blur 2,5 px a omezení pohybu při reduced-motion.

Třídy komponenty jsou `home-map-art`, `home-map-roads roads`, `home-map-buildings buildings`, `home-map-buildings buildings home-map-dormitories dormitories` a `home-map-stadium stadium`; krátké aliasy odpovídají dohodnutému CSS rodiče. Výchozí i pojmenovaný export `WelcomeMap` nemá props.

## Manrope

Staženy původní soubory z oficiálního Google Fonts repozitáře dne `2026-10-28T11:42:22Z`, bez konverze nebo subsetování. Runtime používá pouze lokální `/fonts/manrope/Manrope-Variable.ttf`; nevytváří požadavek na Google CDN. Původní variable TTF je zvoleno před CDN (síťová závislost) a vlastní WOFF2 konverzí (další nástroj a odvozený asset bez doložené potřeby).

| Lokální soubor | Oficiální zdroj | Bajtů | SHA-256 |
| --- | --- | ---: | --- |
| `public/fonts/manrope/Manrope-Variable.ttf` | [Manrope[wght].ttf](https://raw.githubusercontent.com/google/fonts/main/ofl/manrope/Manrope%5Bwght%5D.ttf) | 164700 | `3ae11c49db0455a3cc33e37d380f20fdb8c7f8b41dc07625c177e3d87a9d6ae6` |
| `public/fonts/manrope/OFL.txt` | [OFL.txt](https://raw.githubusercontent.com/google/fonts/main/ofl/manrope/OFL.txt) | 4387 | `58172e0c0fac2cda8a37b348164bb55e44b0e69051e557e92b1d3f6910141f7b` |
| `public/fonts/manrope/FONTLOG.txt` | [FONTLOG.txt](https://raw.githubusercontent.com/google/fonts/main/ofl/manrope/FONTLOG.txt) | 3075 | `b6b54bcc1dbd1b18d5afd087ec0b578097644b1c9ec3e0a642d4df7808f449c2` |

[Oficiální metadata](https://raw.githubusercontent.com/google/fonts/main/ofl/manrope/METADATA.pb) uvádějí normální řez, osu váhy 200–800, latin/latin-ext a upstream `googlefonts/manrope`. Autorská práva: 2018 The Manrope Project Authors; licence SIL OFL 1.1 je přiložena v plném původním znění včetně FONTLOG. Odkaz na větev `main` je pohyblivý; identitu přijatých lokálních bajtů určují uvedené SHA-256.

## Crazy Typka

`public/ui/crazy-typka.svg` je původní malý vektorový portrét vytvořený pro tento projekt 28. 10. 2026. Jde o fiktivní postavu, nikoli podobiznu konkrétní osoby. Neobsahuje cizí fotografii, raster, externí zdroj, text ani skript. Barvy pleti/vlasů/oblečení navazují na projektové `client/avatar-presets.ts` (`#d7a77f`, `#352823`, `#657b67`) a ilustraci přijatého Jantar návrhu; jantarové náušnice používají `#ffcf92`. Rodič vykresluje portrét jako dekorativní obrázek vedle dostupného názvu Crazy Typka a štítku AI.

## Ověření a limity

`node --import tsx --test tests/welcome-map.test.ts`: 6/6 prošlo, exit 0 dne 28. 10. 2026. Testy ověřují skutečnou orientaci B6, plochy a vzdálenosti mezi prvky, každý zdrojový vrchol s milimetrovou tolerancí, uzavřené díry a počet prvků, nemutaci vstupů, statický nepopsaný a neovladatelný SVG strom i přítomnost originálního lokálního fontu a licence. Cílený refaktoring sjednotil transformaci a serializaci pro všechny vrstvy, ukládá trigonometrii i finální cesty pouze jednou a ponechává vzhled/lifecycle v rodiči.

Cílený TypeScript check pouze obou nových modulů a jejich testu prošel bez diagnostiky, exit 0. Prettier check těchto tří souborů také prošel, exit 0. Přesné příkazy a identita předaných souborů jsou v handoffu tasku.

Nebyl spuštěn server, celý build/test suite ani GPU scéna. Vizuální velikost/ořez, finální kontrast, skutečné vykreslení portrétu/fontu a reduced-motion ověří integrátor ve stabilním produkčním klientu. CPU testy nejsou důkazem GPU výkonu nebo finální vizuální přejímky.
