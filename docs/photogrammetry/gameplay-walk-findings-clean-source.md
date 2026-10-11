# Průchozí fotogrammetrie: čistý source pack

Ověřená kolize má SHA-256 **88c247467579429c92dbec2886ebdb156cfc73d426bcd3472095947e905c2b0c**, 3 949 797 trojúhelníků. Produkční `Simulation(photoCollision)` k ní přidává 649 podpůrných trojúhelníků ve 13 doložených pěších intervalech (94,887 m²) a čtyři trojúhelníky přístupu B6. Odvozený source mění pouze 60 kopií souřadnice Y v doložených intervalech; původní nejvyšší originály zůstávají nedotčené. Výchozí místo je skutečné centrální parkoviště **(110,12)** a interaktivní auto **(110,16)**.

Platné úplné běhy jsou `gameplay-walk-clean-source-20261010-a/b/c.json`. Běhy `d/e/f/g` samostatně diagnostikují nynější první neověřený úsek 191, včetně lokálního obchvatu po fotograficky doložené zpevněné ploše a jemnějšího plánovacího rastru. Kontrolují SHA všech `shared/**/*.ts/json` před i po běhu a také collision pack; u uvedených běhů zůstaly stejné. Každý běh používá jednu produkční photo Simulation, žádný teleport, skok, změnu autostepu nebo fyzikálních tolerancí. Jde o fyziku, nikoli noční vizuální nebo GPU/FPS důkaz.

## Prokázané průchody

| Průchod                                                             | Skutečně prošlá délka | Výsledek |
| ------------------------------------------------------------------- | --------------------: | -------- |
| Spawn → napojení pěší sítě (109,5234; −11,4075)                     |              23,320 m | PASS     |
| Spawn → sever, přímých 10 m                                         |               9,894 m | PASS     |
| Spawn → východní přístup Potraviny/R-ko s obchvatem skutečného auta |             106,376 m | PASS     |
| Severní přístup B6 → dvanáct schodů → recepce                       |              19,919 m | PASS     |

Parking connector je v celé délce uvnitř OSM parkoviště 155743958 i kalibrovaného asfaltového podkladu (101 kontrolních bodů) a musí jej souvisle ujít skutečný KCC. OSM parkoviště má `access=private`; jde o **herní spojník po skutečném asfaltu**, nikoli tvrzení o právně veřejném přístupu.

Přímé sondy na východ a západ končí na zachycených pevných překážkách poblíž X 115,4 a X 103,9. Přímá jižní sonda správně končí na interaktivním automobilu. Tyto tři případy neznamenají vadnou zem ani povolení odstranit skutečné objekty.

## Obchvat automobilů

Čistá OSM střednice severně od parkoviště prochází zachycenými automobily. Původní atlas uzlu 1123668 ukazuje, že první překážka odpovídá automobilu. Fyzicky prokázaný obchvat 191 vede z bodu `(103.9033,−10.2826)` přes `(104,−9)` a `(100,−8)` na `(93.78,−11.087)`. Geometrie automobilu zůstává zachovaná. Obdobný obchvat na východ umožnil průchod k R-ku.

QA planner je **pouze čtecí** A* v síti po 1 m. Povolené plochy jsou skutečné parkoviště, skutečná šířka zdrojových pěších cest zmenšená o poloměr kapsle a volitelně mapovaný `grass/meadow/grassland` do šesti metrů od prokázané překážky. Každý bod a vzorek hrany po 25 cm musí mít skutečnou source/fill podporu; náhradní výška DEM není dovolena. Průchodnost dále ověřuje kapsle a swept shape. Vygenerované body potom musí postava skutečně ujít pomocí běžného KCC; plánování samo o sobě není důkaz průchodu.

## Dosud neověřené 191

Obě trasy ze spawnu nyní souvisle dojdou **280,518 m**. U chodníku Chaloupeckého se zastaví na **X −94,7128; Y 3,0612; Z 39,2688**. Kontakt: **X −95,1418; Y 2,5832; Z 39,2729**, normála Y **0,22465**. Zdroj: **1127373**, původní trojúhelník **435**, odvozený collision triangle **3043328**.

Start i cílový OSM bod `(-115.66,39.897)` mají skutečnou opěrnou plochu a volnou kapsli. V povolené ploše však planner zatím nenašel průchozí obchvat. Šířka chodníku 1,8 m je výslovně `class-inferred-not-measured`; sousední body `(-95,38)` a `(-95,41)` nemají v LANDCOVER žádný polygon, tedy ani doloženou trávu. Nelze je automaticky vydávat za mapovaný trávník nebo potichu rozšířit chodník.

Proto byl stažen samostatný oficiální detail IPR 8. 6. 2024 v nativní referenční hustotě 10 px/m: `evidence/vanickova-crossing-ortho-2024.jpg`, SHA `d55f5311b1dd4a083b59653e8598a0a3f3f9beef8b7c7f5e3d97c8ab5a62e5c8`. Kontakt odpovídá tenké hnědé hranici před B2. Severní zpevněný pás/apron byl pro QA explicitně interpretován podle fotografie, s vynecháním zeleného ostrůvku a zachováním veškeré původní kolize. Běhy `e/f` v něm našly řadu podporovaných volných kapslí, ale nikoli souvislou řadu bezpečných swept hran. Běh `g` zpřesnil pouze plánovací rastr z 1 m na 0,5 m; ani ten nedokázal průchod. Není prokázáno, že jde o chybu samotné země; zdrojová podpora existuje a přesný blokující objekt není bezpečně pojmenovaný. Žádná geometrie se kvůli těmto QA pokusům nezplošťovala.

**Zbývající úseky k nástupištím 191 zatím nejsou ověřené.** Starší úspěšné trasy nad DEM tento chybějící důkaz nenahrazují.

## Opakování

```powershell
pnpm exec tsx scripts/validate-photogrammetry-walks.ts --detours --grass-detours --label clean-source-next
```

Pro rychlou diagnostiku pouze první trasy: přidat `--only-route stadium191a`. Pro nezávislé source/car sondy: `--spawn-probes-only --spawn-points '113,12/110,16/113,16'`. Každý nový běh musí uvést vlastní SHA a skutečný výsledek, včetně prvního FAIL.

Lokální fotograficky interpretovaný apron zapíná pouze `--apron-detour`; jeho polygon, datum a SHA reference se zapisují do konkrétního detour záznamu. `--nav-grid 0.5` mění pouze rozlišení čtecího plánovače, nikoli poloměr kapsle, fyziku nebo svět. Alternativní veřejný pěší graf po vynechání blokovaného západního segmentu 25920432 existuje (A: 644,56 m od severního anchoru), ale zatím není fyzicky ověřený a nesmí se prezentovat jako úspěšný průchod.
