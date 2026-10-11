# B6: oprava orientace vstupu, 10. 10. 2026

Hlavní dveře vrátnicového výstupku směřují na sever, vstupující člověk jde na jih. Předchozí západní otevření, šest stupňů a zvýšení 0,9 m byly nesprávným výkladem fotografie. Historické protokoly původní verze proto nedokládají dnešní správnou orientaci.

Před změnou byly přímo vizuálně prohlédnuté tyto zdroje:

- [Google panorama B6](https://www.google.com/maps/@?api=1&map_action=pano&pano=gWCshoWQgiJdy1QWcqe1eQ&heading=178.82123&pitch=20), `gWCshoWQgiJdy1QWcqe1eQ`, září 2025, kamera 50.081601/14.3917645, pohled 178,82123°. Krytý vstup je vidět z ulice severně od krátké strany vrátnicového výstupku. Pixely nebyly archivovány ani použity jako textury.
- [Půdorys B6](https://wiki.sh.cvut.cz/_media/kolej/bloky/0.jpg), místní referenční kopie [blok-6-plan-2023.jpg](../../references/media/blok-6-plan-2023.jpg), SHA256 `afdb05307e6fb770a42f0363708acd4f06983c8b1a6db20bbb169a3bac95dd7c`. Šipka 1.NP VRÁTNICE je na krátké straně; 0.NP KOLÁRNA je pod ní. Samotný obrázek nemá severku ani kóty.
- [Oficiální ELSA ČVUT: Koleje Strahov](https://www.elsa.cvut.cz/bezbarierove-cvut/pristupnost-objektu/objekt/?o=81), ověřeno 10. 10. 2026: bloky 2–7 mají krytá nástupní schodiště zpravidla s dvanácti stupni. [Plán B2, 1.NP](https://www.elsa.cvut.cz/wp-content/themes/elsa-cvut/images/objekty/12_6_koleje_Strahov/SCHEMA/FULL/BLOK_2_-_1NP.jpg) ukazuje Chaloupeckého a příslušnou orientaci krátké vstupní strany. B2 je podpůrný doklad orientace a typologie, nikoli zaměřený plán B6.
- OSM severní hrana výstupku od přibližně `(-7,84;-76,61)` do `(-1,86;-77,60)` kalibruje polohu dveří kolem `(-4,85;-77,1)`. Kolizní model používá pravoúhlé zjednodušení s nejistotou přibližně 2 m. [Původ mapových dat a licence](https://www.openstreetmap.org/copyright).

Modelované parametry se nyní sdílejí v `B6_LAYOUT`:

| Parametr | Hodnota |
|---|---|
| Severní stěna lobby | `z=-77.1`, západní bok `x=-7`, jižní bok `z=-70` |
| Dveře / normála ven | `x=-4.85, z=-77.15` / `(0,-1)` |
| Šířka průchodu | 2,4 m, `x=-6.05..-3.65` |
| Nástupní schody | 12, směr `+Z`, `z=-81.4..-77.8` |
| Podesta | `z=-77.8..-76.95`, stejná šířka jako schody |
| Zvýšení podlahy | 1,8 m = 12 × 0,15 m; **nezaměřený odhad** |
| Venkovní testovací spawn | `(-4.85,-85)` |

Schody a podesta jsou společné boxy pro vykreslení a Rapier kolize. `b6EntranceHeight(x,z,foundationOffset)` vrací přímo světovou výšku jejich povrchu. Volající nepřičítá základnu podruhé. Fasáda odvozuje vrátnicový obvod z téhož modulu; nepřidává neprůhlednou čelní plochu přes severní dveře. Bývalá západní mezera je vyplněná kolizí i viditelnou stěnou. Pult a nástěnka se přesunuly mimo průchod. Hlavní budova, rozteč pokojových oken a východní galerie u schodů zůstaly zachované.

Průchod se testuje bez teleportu i bez nouzového obnovení polohy: venkovní spawn → `(-4.85,-82.1)` → `(-4.85,-77.35)` → `(-4.85,-73)` → servisní hala → pata vnitřních schodů → první patro. Test běží ve skutečné Rapier simulaci s rekvizitami a také v celé světové fyzice s terénem. Samostatné ray testy hlídají severní otvor, západní uzavření, zasklení pokojů a dvanáct dveří vedle schodů. Plná regresní zkouška prochází všech 228 obytných dveří, žádné místnosti nebyly vyřazeny kvůli testu.

GPU průchod ve finální hlavní hře a celkové výkonové měření provádí koordinátor po integraci ostatních změn. NullEngine použitý k ověření geometrického průsečíku ani fyzikální testy neposkytují důkaz FPS či výsledného osvětlení. Přesná výška prahu, výška stupňů, současná vnitřní recepce a dvojice vnitřních schodišťových sekcí nadále vyžadují zaměření nebo identifikované aktuální fotografie.
