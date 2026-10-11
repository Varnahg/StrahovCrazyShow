# Cesty demonstračních cestujících k severním vstupům

Historická kontrola 10. 10. 2026. Soubor popisuje tehdejší kontrolu nového datového kandidáta před jeho vložením do hry a regresní testy produkčních dat. Aktuální znovuvygenerování a opakovaná kontrola 11. 10. 2026 jsou v [obnově zdrojového otisku](navigation-source-refresh-20261011.md); níže uvedené starší počty pevných objektů a délky kritických fyzických úseků tím nejsou vydávány za aktuální měření. Nejde o živé cestující PID ani o důkaz GPU výkonu.

## Co se opravuje

Původní 16 tras vedlo k bodům odhadnutým na západních výstupcích bloků, u B6 k někdejšímu bodu `[−7.9, −73]`. Západní výstupek není směr hlavních dveří. Nové společné vstupy B2–5 a B7–10 i přestavěný vstup B6 míří na sever. Trasy nyní přicházejí kolmo ke skutečně vykreslovaným schodům, stoupají po nich a končí před dveřmi na horní podestě. B5 má nově vlastní cíl.

Podklady a interpretace:

- OSM půdorysy a propojené pěší cesty určují pozici a průběh venkovní části. Původní identifikátory cest zůstávají v `sourceWayIds`; zdrojové hashe vygenerovaných dat zachycují použité mapové, výškové a geometrické soubory.
- [ČVUT ELSA – přístupnost Strahova](https://www.elsa.cvut.cz/bezbarierove-cvut/pristupnost-objektu/objekt/?o=81) a [identifikovaná fotografie typického vstupu B2](https://www.elsa.cvut.cz/wp-content/themes/elsa-cvut/images/objekty/12_6_koleje_Strahov/GALERIE/FULL/12_BLOK_2_typicky_hlavni_vstup.JPG) jsou podkladem společné kryté schodišťové typologie. Sever B6 nezávisle ukazuje [panorama ze září 2025](https://www.google.com/maps/@?api=1&map_action=pano&pano=gWCshoWQgiJdy1QWcqe1eQ&heading=178.82123&pitch=20) a orientace [plánu B6](https://wiki.sh.cvut.cz/kolej/bloky/blok_6).
- Dvanáct stupňů odpovídá doložené typologii; konkrétní výška 0.15 m, celkem 1.8 m, šířky a délky jsou **herní interpretace, nikoli zaměřené rozměry každého bloku**.
- PID GTFS zůstává zdrojem plánovaných příjezdů 143/149. Počet, vzhled a cílový blok cestujících jsou stále výslovně simulované.

## Datový kandidát

`scripts/rebuild-campus-transit-navigation.ts` vytváří schema 2: **9 bloků, 18 tras** ze dvou zastávek Koleje Strahov. Dijkstra používá pouze propojené pěší OSM cesty. Krátké připojení bodu zastávky a schodového předpolí je uvedeno zvlášť, bez tvrzení, že jde o přesně zaměřenou osu chodníku. Začáteční spojníky mají 0.644 m nebo 5.433 m; koncové spojníky 3.140–7.174 m. Poslední úsek jde po vnější normále vstupu dovnitř a končí 0.52 m před jeho lícem.

Kandidát byl zkontrolován bez přepsání produkčního souboru. [north-navigation-audit.json](north-navigation-audit.json) uvádí jeho SHA-256, jednotlivé trasy, výsledky kontroly objektů a skutečné procházky. Publikaci a obnovu kanonických dat provádí hlavní integrační proces.

## Výsledek kontroly

- Všech **18 tras**, celkem **18 717 vzorků po 0.25 m**, zůstává mimo zdrojové půdorysy budov a neprotíná skutečné pevné objekty světa.
- Kontrola používá kapsli stejného rozměru jako hráč proti skutečným tvarům **3 529 pevných objektů**: půdorysným rozměrům kmenů, aktuálním lampám, B6 nábytku a správně natočeným 24 parkovacím vozidlům i výchozímu ovladatelnému autu. Nepracuje s dříve odstraněnými fiktivními lavičkami a lampami.
- Všech **6 unikátních spojníků od fyzických dveří autobusů** prošlo samostatnou kontrolou budov a pevných objektů: 210 vzorků, nejdelší spojník 10.729 m. Dveře jsou odvozené od orientace a délky modelu autobusu, nikoli přesunuté přímo na označník.
- Každý z **9 vstupů** prošel souvislým přístupem skutečné kapsle v celé produkční `Simulation`, včetně parkování, stromů, lamp, budov a nových schodů. Kontrolované úseky měřily 6.878–10.834 m. Teleport i záchrana při pádu jsou v testu zakázané. Kapsle vystoupala na horní podestu a její spodní podpora souhlasila s příslušnou výškou.
- Středy všech **108 schodnic** byly ověřeny proti analytické výšce NPC a skutečné Rapier kolizi. Největší numerická odchylka činila 0.000000287 m. To popisuje shodu dvou reprezentací téhož herního modelu, **nikoli centimetrovou přesnost vůči reálným schodům**.

| Blok | Skutečně prošlá část přístupu | Fyzikální kroky | Horní podesta v herních metrech Y |
| ---- | ----------------------------: | --------------: | --------------------------------: |
| 2    |                       9.272 m |             208 |                             2.131 |
| 3    |                      10.746 m |             228 |                             0.844 |
| 4    |                      10.834 m |             228 |                            −0.640 |
| 5    |                       7.540 m |             188 |                             3.013 |
| 6    |                      10.604 m |             227 |                             1.800 |
| 7    |                      10.107 m |             221 |                             0.431 |
| 8    |                       6.878 m |             178 |                            −2.594 |
| 9    |                      10.027 m |             219 |                            −3.676 |
| 10   |                      10.443 m |             224 |                            −4.832 |

## Regresní ověření a omezení

`tests/transit-route-reality.test.ts` čte přímo produkční `TRANSIT_NAVIGATION` a vyžaduje devět cílů, osmnáct tras, správnou severní normálu, čisté trasy a všechny fyzické přístupy. `tests/transit.test.ts` navíc kontroluje všechny skutečné výstupní body autobusových tvarů proti aktuálním pevným kolizím. Opakování po publikování kanonických dat:

```powershell
pnpm exec tsx --test tests/transit.test.ts tests/transit-route-reality.test.ts
```

Dlouhé trasy byly zkontrolovány geometricky; plný fyzický průchod se zde cíleně provádí na kritickém připojení a schodišti každého bloku. Celé delší fyzické venkovní procházky samostatně pokrývají testy k oběma nástupištím 191. Tento audit neověřuje dynamické vyhýbání chodců jedoucím vozidlům ani vstup NPC do pokojů. Cestující dorazí k podestě a následně zmizí; jejich rozdělení do bloků není odhadem skutečného bydliště.
