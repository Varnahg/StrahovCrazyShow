# B6: vlastní CAD příprava

24. 10. 2026. Exteriérový kódový checkpoint navazuje na přijatý R2. Nový přepočet a průchody provede root. Původní osmice DXF zůstává v Downloads a není součástí Gitu ani receptury. Aktuální scope jsou pouze B1 a B6.

## Doložené vstupy

Všech osm výkresů má grafickou 20m čáru dlouhou 19 999,999553 CAD jednotek. Použit převod CAD/1000, bez normalizace jednotlivých pater. Scale handles: P01 `113A`, N01 `5532`, N02 `529E`, N03 `4BF3`, N04 `51A6`, N05 `4FF2`, N06 `5BC2`, N07 `AE`. Odchylka vůči 20 000 jednotkám je 2,235 × 10⁻⁸ relativně. Jádra N01–N05 mají shodné source room polygony v toleranci 2 mm; každé patro se čte zvlášť.

| Patro | Room polygony | Dveře |
| --- | ---: | ---: |
| P01 | 44 | 52 |
| N01 | 59 | 125 |
| N02–N05, každé | 58 | 106 |
| N06 | 55 | 102 |
| N07 | 2 | 0 |

Celkem 392 room polygonů a 703 dveří. N07 obsahuje dvě skutečné nástavby `601/A3` a `602/9A`, nikoli další soubor obytných místností. Jeho vlastní uzavřená roof polyline `1036` má plochu 1163,265139 m² včetně přední přístavby; čtecí odvozený obrys je v ignorované `b06-preparation/roof-outline-source.json`. N07 zdivo se vybírá jen u obou nástaveb, aby obvod střechy nebyl omylem extrudován na výšku nástavby.

`cadOrigin = [35, 8]` je pouze místní metrický referenční bod. XY všech modelových deskriptorů zůstávají CAD/1000 bez odečtení originu. Herní rigid fit zajišťuje koordinátor podle IPR.

## Schodišťová a výšková interpretace

V obou jádrech běžných pater jsou tři ramena: boční šířky west 1,67 m / east 1,60 m, střední west 3,34 m / east 3,2835 m. Deset doložených poloh hran na běhu 2,70 m znamená devět viditelných intervalů po 0,30 m. Prosté opakování schodiště třikrát v každém půdorysu by zdvojilo promítaná ramena.

Pracovní topologie: dvě boční ramena `floor.main → floor.mezzanine`; příchozí střed `previousFloor.mezzanine → floor.main`. P01 střední kresba překrývá uzavřené s120/872 a s122/8EB; fyzicky se použije až příchozí N01 střed. N06 boční obrazy s návratovými značkami se nepřidávají jako další výstup na střechu. Výsledkem metadata sondy je 36 jedinečných vnitřních segmentů, sdílené podesty mají totožné stabilní ID a geometrii. Source handles se získávají z každého konkrétního výkresu, včetně obou částí řad přerušených grafickou čárou.

N01 vstup leží na šikmém levém boku přístavby kolem CAD (12,93; −3,45), místnosti 57/D2D a 58/D3C. Vnější rameno má 12 skutečných hran `1438, 1439, 143A, 1441, 12F7–12FE`, šířku 3,86 m, běh 3,30 m a stoupající směr přibližně +CAD X. Horní/dolní střed: (11,567763; −3,453880) / (8,292361; −3,856049). Podesta vychází z `143E/143B` a propojuje skutečné oblouky `12C2/12E1`; nejde o otočený obdélník převzatý z B1. Šestnáct až dvacet odhadnutých stupňů nebylo dosazeno.

| Klíče | Pracovní místní výšky |
| --- | --- |
| main P01, N01, …, N06 | −3, 0, 3, 6, 9, 12, 15 |
| mezzanine P01, N01, …, N05 | −1,5; 1,5; 4,5; 7,5; 10,5; 13,5 |
| N07 main a annexRoof | 18,0 |
| N07 westHeadRoof / eastHeadRoof | 21,41 / 20,50 |
| exterior.entry.lower | −0,60, předběžně 12 × 0,175 m pod vstupem podle IPR prvního nášlapu |

Tyto výšky nejsou CAD svislé kóty. Modelují 0,15 m na každou vnitřní hranu a vyžadují nativní/terénní přejímku. Koordinátorův IPR 2023 průzkum podporuje hlavní i přední střechu na world Y 18,73–18,75 a rozdílné nástavby na 22,140 / 21,227; uvedené místní hodnoty používají pracovní origin Y +0,73. Dřívější hypotéza nižší střechy přístavby 16,5 byla tímto důkazem odmítnuta. N05 poslední přední místnost zůstává na mezzanine 13,5 s odhadnutým stropem 17,8; žádná další podlaha/pokoj N06 se nevymýšlí.

## Konstrukce, provenience a přejímka

Generátor používá z `prepare_b01.py` jen obecné čtení/operace se skutečnými hranami, constrained triangulaci, opening/solid primitiva a měřená ramena. Nevolá B1 explicitní korekce, výškové masky, core výběr ani jeho dveřní parser. B6 zóny chrání interiéry sousedních běžných pokojů. Názvy všech místností, jejich polygony, jednotlivá patra a otvory se zachovávají; nejsou převzaty schematické runtime pokoje.

B6 má vlastní ověřené výjimky krátkých/částečných oblouků: čtyři P01 a šest N01, vždy spojené s konkrétním skutečným křídlem a opačným zdrojovým koncem oblouku. Dvě totožné N01 čáry křídel se deduplikují s uchováním obou source handles. Neidentifikovaná nebo nespárovaná výplň končí chybou.

Recipe/audit mají `generatorDependenciesSha256` pro **oba** soubory `prepare_b06.py` a čtený `prepare_b01.py`, plus `heightModel.id`. Přísná přejímka `B06_RECIPE_ACCEPTANCE=1` odmítá chybějící nebo neaktuální recepturu. Normální syntetické testy nepotřebují soukromý CAD. Všechny plné runtime testy a barvy/placement z fotogrammetrie patří následnému přijetí koordinátorem.

Exteriérová kódová přejímka: **31 malých testů PASS** (0,137 s); dvanáct skutečných recipe metod čeká na nový přepočet s aktuálními dependency hashi. R2 receptura, audit a osm overlay zůstávají zmrazené v `r2-before-exteriors`; původní R1 je v `first-before-landing-fix`. Rootův R2 měl nativní audit, 74 schodišťových směrů a 1376 dveřních směrů PASS, s dalšími 30 směry bez venkovní podlahy. Tato historická přejímka se nevydává za ověření nových exteriérů. Jejich skutečné napojení na terén, včetně skoku na nižší východní terasu, musí ověřit root.

## Opravy po první přejímce

- P01 východní boční lety končí na Y 14,664404; N01 příchozí střed začíná na Y 14,499404. Široká mezipodesta proto začíná až na první z těchto hran. Pouze prostřední pás X 52,085303–55,368803 se prodlužuje o 0,165 m ke skutečnému nástupu středu. Nezasahuje do posledních bočních nášlapů a nemění jejich XY nebo Z.
- Přesně vybrané malé SW/NE rohy a T napojení se doplňují z konkrétních vnějších i vnitřních silných hran. Výběr není plošná morfologie: vyžaduje měřené hranice, konzervativní plochu, minimální source shodu a nulový průnik do obytných room polygonů. Source candidates a přesné handles jsou v `source-join-candidates.json`. N07 dříve hlášené hrany jsou už přítomné po pozdějších konstrukčních krocích, a proto audit odděluje early kandidáty od finální XY kontroly.
- Příčky 14/15 (`620/621`, X 29,928803/30,028803), 40/41 (`4AC/4AD`, X 32,376803/32,476803) v N01 existovaly i v prvním modelu. Mezerník 31a/31c mezi Y 13,645389–14,445389 je skutečný dveřní otvor. Žádná příčka přes něj se nepřidává. Vlastní B6 overlay správně označuje budovu, vykresluje úzké skutečné stěny a celý source obrys střechy N07.
- Jediný panel N01 `1072/1073` s koncovou hranou `1066` má podle IPR nízkou opěrnou funkci. Je odstraněn z obecných N01 plných stěn a floor envelope, pak vložen jako přesná `retaining-wall` od místního −3,0 do −1,05. Půdorys se zachovává. Zdroj: `photogrammetry/b06-exterior-panel-source.json`, manifest SHA `d556d38d5c32d9d039479e492d7937e2c358df90cf94f7aee232f5e1ba330d93`; horní dvě téměř vodorovné plochy mají world Y −0,441 až −0,316 a souhrnnou plochu 1,348 m². Dolní konstrukce sahá do země. Toto výškové pravidlo se nepřenáší na jiné venkovní zdi.
- Stejná IPR interpretace umisťuje první vstupní nášlap do world Y 0,19–0,345. Nový lokální dolní konec −0,60 a stoupání 0,175 m při aktuální pracovní world translaci +0,696278 dávají první nášlap přibližně 0,271278. Počet dvanácti CAD hran a jejich polohy zůstává.
- Čtyři N05 dveře `4D34/4D3E/4D61/4D77` jsou zachované i přes horní N06 konstrukci. Source stěna N06 `970/971` leží v Y −0,085594–0,164403. Pouze přes jejich skutečné X otvory se od N06 wall/slab odečte překryv do původního door head 15,60 m; prahový půdorys pokračuje k existující core díře Y 0,364404. N06 boční konstrukce a nadpraží zůstávají. `crossFloorPortals` eviduje vazbu na původní nižší dveře; targety se neposouvají.

## Poslední exteriérový checkpoint

- P01 `4A4` dostává pouze doložené pokračování fasády X 67,439–67,814 / Y 0,384–1,034, plocha 0,24375 m², s oporou `683/703/70A/6EA`. Okno `25E0/25E1` ani interiér s127 se nevyplňují.
- Vstupní kryt používá skutečný CAD rám `142A/143C/143D`, 21,99919 m², top 3,7540823 a tloušťku 0,10 m. Dva měřené podélné pásy `143C/143B` a `143D/143E` mají odhadnutou svislou hloubku 0,10 m; žádné opakované sloupky se nevymýšlejí. IPR obálka 26,607 m² má odlišné boční hranice: historický CAD obrys se kvůli tomu nerozšiřuje. Nejnižší rám je 2,054 m nad horní vstupní podestou.
- Východní betonový kryt/terasa vychází z `D85/D90/F63/D83/4D65–4D67/4DCF`, 10,8644965 m². Top 1,0187223 a tloušťka 0,15 m jsou IPR interpretace. P01 dveřní head 0,60 zůstává pod spodkem 0,8687223. Šest N01 křídel je `openable-glazing`, nikoli pevné sklo; skutečný výškový rozdíl od mezipatra je 0,4812777 m a vyžaduje ověření skoku.
- Vstupní kryt, jeho rám a východní terasa mají roli `canopy`: poskytují fyzickou oporu/kryt, nikoli důvod vyřezat zem pod zastřešením. Dvě koncová portika naopak mají zdrojový obrys ustoupeného vstupu, podlahu na 0 a fyzický plint −1 až −0,20. Jejich stejnoúrovňová plocha se neduplikuje v běžné desce; nové schody se nepřidávají.
- Oddělená s201 `A5A`, stěny `7DC–7DF`, je uzavřená neobytná komora bez doloženého vstupu. Podlaha −3 zůstává, kryt má top −2,2962777093 a tloušťku 0,20 m; stěny končí pod ním. Top odpovídá world −1,60 pod doloženým trávníkem. `terrainPreservationAreas` uchovává přesný půdorys místnosti a stěn, roli `buried-chamber` a provenienci, stále v CAD XY metrech. Export jej musí použít pro zachování země.

Společné helpery sjednocují serializaci exteriérových prvků a vyloučení pouze jejich shodných podlahových ploch; nevzniká druhá sada půdorysných pravidel v builderu. Zdrojový čtecí výstup je `exterior-source-candidate.json`. Nový fullprep, overlay, Blender ani fyzikální průchody v tomto checkpointu neběžely. Výšky a tloušťky jsou interpretace IPR a konstrukční odhady, nikoli svislé kóty CAD.

## Přijetí finálního B6 modelu koordinátorem

R4 přepočet a 44 přísných přípravných testů prošly. P01 části stěn v přesném footprintu východní terasy jsou omezené jejím skutečným spodním lícem 0,8687223 m; dřívější cap 1,3 m vyčníval nad terasu. Vnitřní stěny, sill a dveřní head zůstaly zachované. Finální modelový/native audit a skutečné dveřní/schodišťové průchody jsou popsány v [modelu B6](README.md); předchozí R2/R3 výsledky výše zůstávají historické. Aktuální origin Y je 0,6962777093 m podle finálního rigid fitu, nikoli dřívější pracovní +0,73 m.
