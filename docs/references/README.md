# Reference pro virtuální 3D Strahov

Ověřeno **10. 10. 2026**. Výsledkem je [atlas 29 zdrojů](atlas.json), [export půdorysů a cest](footprints-and-paths.geojson) a archivovaný [plán Bloku 6](media/blok-6-plan-2023.jpg). Průzkum zapisoval pouze do `docs/references/`. Nikdo nebyl kontaktován. Zdrojové datum ani přesnost fotografie nejsou nezávislým zaměřením současného stavu.

## Rychlý výběr pro modelování

| Objekt | Nejužitečnější reference | Omezení |
|---|---|---|
| Blok 6 | Plán podlaží; Google Street View září 2025; Mapy.com 1. 6. 2023; OSM obrys | Chybí kóty a výškový řez |
| Klub 007 | Oficiální fotografie baru, pódia a schodiště; Google Street View květen 2024; pódium 6 × 4 m | Chybí celý půdorys klubu |
| R-ko | Recharging Bar, Olympijská 1913/1; fotografie baru leden 2026; panorama/letecká mapa 2023; RÚIAN | Obrys celé budovy není půdorysem provozovny |
| Cesty | 39 OSM úseků s tagy a odkazy; panoramata u B6 a B7 | Neověřeny všechny šířky, sklony a průchodnost |

V `atlas.json` jsou konkrétní URL, identifikátory snímků, data, poloha kamery nebo POI, směr, licence a odůvodněná důvěra. ID níže odkazují na jeho záznamy. Google odkazy obsahují ID konkrétních fotografií/panoramat; při změně rozhraní použít i postup `navigation`. Pořadí snímků se může měnit. `captureDate: null` znamená nezjištěné datum, `checkedAt` datum kontroly odkazu. Souřadnice bodu provozovny nejsou zaměřením dveří.

## Blok 6 — priorita

### Dispozice a vstupy

[Plán B6](https://wiki.sh.cvut.cz/_media/kolej/bloky/0.jpg) je axonometrie 0.–5. NP a suterénu. [Detail média](https://wiki.sh.cvut.cz/_detail/kolej/bloky/0.jpg?id=kolej%3Abloky%3Ablok_6) uvádí **20. 3. 2023 11:06**; není doloženo, že jde o datum zaměření nebo vytvoření obrázku. Plán ukazuje pokoje kolem chodby, schodišťové části, vrátnici, místnosti nad ní a venkovní suterénní přístupy. **Nemá kóty ani severku.**

[Wiki B6](https://wiki.sh.cvut.cz/kolej/bloky/blok_6), upravená podle patičky **26. 9. 2026**, lokalizuje kolárnu pod vrátnici, studovnu do 1. mezipatra, SHernu do 3. mezipatra a klubovnu mezi 4. a 5. patro; v suterénu posilovnu na jih a pingpong na sever. Označení pater v textu a NP v obrázku se nemá mechanicky sjednocovat, společné místnosti využívají mezipatra.

[Čajovna](https://klubcajovna.cz/) přímo určuje **východní stranu B6 mezi bloky 6 a 7**. Wiki uvádí Čajovnu i STOH pod venkovními schody; [přehled Silicon Hill](https://www.siliconhill.cz/koleje-strahov) popisuje STOH z boku pod druhými schody. To dokládá orientaci přístupu, nikoli přesné souřadnice dveří. Olympijská 1902/5 je adresa místa; korespondenční Vaníčkova není zaměřením vstupu.

### Konkrétní fotografie a panoramata

- **`b6-google-streetview-2025`**: panorama `gWCshoWQgiJdy1QWcqe1eQ`, **září 2025**, kamera **50.081601, 14.3917645**, pohled přibližně k jihu. Číslice 6 na čele, malá čelní okna, krytý prosklený vstup se schody, betonová stěna, chodník, tráva a parkování. Profil B6 → Street View a 360°.
- **`b6-mapy-panorama-2023`**: [Mapy.com `101883263`](https://mapy.com/cs/zakladni?pid=101883263&newest=1&yaw=2.754&fov=1.257&x=14.3918028&y=50.0815907&z=19&ovl=8), **1. 6. 2023**. Otočením je vidět čelo, boční kryt vstupu a návaznost cest na sousední bloky.
- **`b6-google-exterior-2018`**: **Roman Vápeník / červen 2018**, ID `CIHM0ogKEICAgICkkZC9iwE`. Šikmý pohled ukazuje dlouhou světlou fasádu, rytmus tmavých oken, suterénní otvory, plochou střechu a venkovní schody. Proporce jsou dobře patrné, datum je starší.

### Místnost není současný projekt

Plán obsahuje **Modelland** a **Fotoateliér**. [Seznam projektů](https://wiki.sh.cvut.cz/klub/projekty), upravený podle patičky 18. 7. 2026, řadí Modelland (2011–2026) mezi zaniklé, usnesení 2026-0010. [Fotoateliér](https://wiki.sh.cvut.cz/klub/projekty/fotoatelier) oznamuje zrušení od 1. 7. usnesením 2026-0012 a předání místnosti Fotokomoře. Historické názvy nejsou důkazem provozu v roce 2026 ani zániku fyzické místnosti. Aktuální vybavení někdejšího Modellandu není zjištěno.

## Sedmička / Klub 007

[Oficiální kontakt](https://klub007strahov.cz/kontakt/) potvrzuje **suterén Bloku 7, Chaloupeckého 1903/6**. [Technické informace](https://klub007strahov.cz/informace/) uvádějí **pódium 6 × 4 m** — použitelnou rozměrovou kotvu, nikoli kompletní plán.

Individuálně byly otevřeny tyto snímky oficiální galerie:

| Fotografie | Viditelné detaily |
|---|---|
| [007-gal001.jpg](https://klub007strahov.cz/wp-content/uploads/2020/04/007-gal001.jpg) | Dřevěný barový pult, lednice, lahve, plakáty a nálepky |
| [007-gal002.jpg](https://klub007strahov.cz/wp-content/uploads/2020/04/007-gal002.jpg) | Pódium, nízký portál, monitory, závěs a polepy |
| [007-gal003.jpg](https://klub007strahov.cz/wp-content/uploads/2020/04/007-gal003.jpg) | Sestupné schodiště, modré a tmavě červené stěny, světlý pruh a malovaný podhled |

Adresář `2020/04` neprokazuje datum pořízení. Volná licence fotografií nebyla doložena; jsou vedeny pouze odkazem.

**`seven-google-streetview-2024`**: panorama `2UCXwe4UgzW5bAoI5ZFssA`, **květen 2024**, kamera **50.0806573, 14.3928585**, pohled **348,27°**. Z jihovýchodu je vidět číslo 7 a betonové schodiště na východní straně jižní části B7; pod ním tmavý vstup označený 007. Vedle je nízký přístavek; před budovou parkování a vpravo pěší plochy a tráva.

[Mapy.com `94772339`](https://mapy.com/cs/letecka?q=Klub%20007%20Strahov&source=firm&id=275251&pid=94772339&newest=1&yaw=0.229&x=14.3925128&y=50.0807524&ds=2&z=17&ovl=8), **21. 5. 2022**: automatické otevření profilu 007 míří na sousední **SPORT BAR**, jeho sezení a plot. **Tyto dveře nejsou vstupem do 007.** Záběr slouží pro přístavek, dlažbu a okolí. Datum **4. 6. 2023** na malé letecké mapě patří jiné vrstvě.

## R-ko — doložená poloha a hranice poznání

Identitu dokládá [oficiální Rko Party](https://www.rechargingbar.cz/event/rko-party-2025-2), [Mapy.com](https://mapy.com/cs/zakladni?source=firm&id=13296995&x=14.3936686&y=50.0812273&z=17) a Google Maps: **Recharging Bar, Olympijská 1913/1**, východně od B7. Google výslovně uvádí „Umístění: Potraviny Strahov“.

**Bod provozovny:** [OSM node/5508982945](https://www.openstreetmap.org/node/5508982945), **50.0811693 N, 14.3931930 E**. V herních osách **x = 103,08 m; z = −57,81 m**, origin **50.08065 N, 14.39175 E**. Leží uvnitř společné budovy; není označen jako `entrance`.

**Celá budova:** [OSM way/7645350](https://www.openstreetmap.org/way/7645350), již v `shared/data/map.json` pod názvem **Potraviny**. Všechny OSM vrcholy jsou v [GeoJSON](footprints-and-paths.geojson). [RÚIAN 22041559](https://vdp.cuzk.gov.cz/vdp/ruian/stavebniobjekty/22041559) potvrzuje **č.p. 1913**, parcelu **2458/10, k.ú. Břevnov**, objekt občanské vybavenosti a **zastavěnou plochu 701 m²**. Prohlížeč uváděl platnost dat ISÚI **10. 10. 2026 17:32**. Podlaží a podlahová plocha jsou nevyplněné; evidovaná nula vchodů není důkazem absence dveří.

OSM polygon má vypočtenou plochu **700,37 m²** a orientovanou vnější obálku přibližně **48,61 × 16,67 m**. Shoda ploch podporuje identifikaci, ne geodetickou přesnost hran. Obálka zahrnuje krajní výstupky. **Přesný půdorys prostor užívaných R-kem uvnitř budovy nebyl veřejně doložen.** Nevytvářet druhou samostatnou budovu z POI a nepřipsat baru automaticky celých 701 m².

- [Mapy.com `101883310`](https://mapy.com/cs/zakladni?source=firm&id=13296995&pid=101883310&newest=1&yaw=4.343&x=14.3938139&y=50.0812633&z=17&ovl=8), **1. 6. 2023**: východní malovaná stěna, horní malá okna, spodní zamřížované otvory, kouřovod, parcelbox a sklon terénu. Přesný vstup do baru zde není doložen.
- [Letecká vrstva Mapy.com](https://mapy.com/cs/letecka?source=firm&id=13296995&x=14.3938172&y=50.0812619&z=17), označená **4. 6. 2023**: poloha protáhlé stavby, střecha a vztah k B7, cestě a školícímu centru.
- **`rko-google-bar-photo-2026`**: fotografie profilu Recharging Bar, **leden 2026**, ID `CIABIhCuGekJFiKwrKHihKRxiUaf`. Dřevěná deska a tmavé čelo baru, osvětlené lahve, lednice a betonový strop se spárami. Bez rozměrového měřítka.

## Cesty a geometrie

[Mapa společenských prostor](https://www.siliconhill.cz/uploads/mapa-hospody.jpg) ukazuje Čajovnu/STOH u jihu B6, 007 u B7 a další bar východně od B7 bez výslovného popisku R-ko. [Mapa vybavenosti](https://www.siliconhill.cz/uploads/mapa3.jpg) doplňuje hřiště jižně od B5–B7, Silicon Gym a školící centrum. Obě byly vizuálně otevřeny; datum není doloženo a značky nejsou zaměřenými vstupy.

Panoramata dokládají asfalt, chodníky, travnaté pásy, dlažbu a schody jen v uvedených záběrech. **Souvislý současný pěší průchod B6–007–R-ko nebyl ověřen.**

`footprints-and-paths.geojson` obsahuje **3 půdorysy, 2 POI a 39 celých úseků komunikací**, jejich OSM URL, verze, časy změn a dostupné tagy. Výběr zahrnuje úseky s vrcholem v rozsahu **lon 14.3913–14.3939, lat 50.08075–50.08165**; celé úseky mohou pokračovat ven. Rozlišovat `footway`, `path`, `steps` a obslužné komunikace.

| Celá budova | OSM ID | Vnější orientovaná obálka | Plocha polygonu |
|---|---|---:|---:|
| B6 | 53929071 | cca 69,99 × 22,75 m | 1155,34 m² |
| B7 | 53929068 | cca 70,27 × 22,63 m | 1149,38 m² |
| Potraviny / R-ko | 7645350 | cca 48,61 × 16,67 m | 700,37 m² |

Jde o výpočty z OSM, **ne zaměření**. Obálky B6/B7 zahrnují výstupky. Výška 18 m v herních datech vzniká ze šesti podlaží po 3 m v `scripts/fetch-map.mjs`; fotografie ji nepotvrzují. Ani 3 m u budovy R-ka nejsou novým měřením.

Reprodukce: `node docs/references/build-geometry.mjs` z kořene repozitáře. Skript potřebuje `.cache/osm.xml` a `shared/data/map.json`, pouze je čte, zapisuje sem a nepoužívá síť. Export uchovává SHA-256 vstupů, WGS84 a lokální osy hry (x východ, z jih).

## Chybějící podklady v pořadí užitečnosti

1. **R-ko:** kótovaný plán skutečně užívaných místností, přesné dveře, rozhraní s Potravinami, výšky/podlaží a aktuální zahrádka. Plocha celého stavebního objektu nestačí.
2. **B6:** kóty pokojů, chodby, schodišť a mezipater; výškový řez; přesná poloha dveří Čajovny/STOHu; aktuální fotografie všech fasád a společných interiérů.
3. **007:** kótovaný půdorys sálu, baru a zázemí, výška stropu a úroveň pódia, novější fotografie schodiště. Oddělit sousední Sport bar.
4. **Cesty:** současný souvislý průchod, šířky, počty schodů, obruby, sklony a bariéry. OSM a různé roky panoramat to nenahrazují.
5. **Stav 2026:** vybavení někdejšího Modellandu, využití bývalého Fotoateliéru po převzetí a novější vzhled oproti snímkům 2022–2025.
6. **Licence:** konkrétní oprávnění k archivaci fotografií provozovatelů. Tento sběr je nezískával kontaktováním osob.

## Licence a kontrola

[LICENSES.md](LICENSES.md) obsahuje atribuci a původ. Archivován je jen původní plán B6 pod obecnou deklarovanou **CC BY-SA 4.0** wiki. OSM export nese **ODbL 1.0**. Google a Mapy.com byly prohlíženy běžným veřejným webovým rozhraním; jejich fotografie, dlaždice ani screenshoty nejsou archivovány. Nebylo použito hromadné stahování ani obcházení přístupů.

Kontrola souborů zahrnuje validitu JSON/GeoJSON, povinná pole a unikátní ID, uzavřené polygony, shodu lokálních vrcholů s herní mapou, bod R-ka uvnitř společné budovy a SHA-256 plánu. Neověřuje současný fyzický stav na místě.
