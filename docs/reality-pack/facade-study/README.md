# B6: zprovozněná studie původní fotogrammetrie jako předlohy

11. 10. 2026. [Interaktivní srovnání](index.html) ukazuje skutečně vykreslené západní/východní fasády a střechu B6 ze tří sad: původní IPR2023, semanticky omezená zdrojová plocha a samostatný čistý archivní B6 GLB. Zdrojové auto/strom/zem se nekopírují do herního modelu. Žádná fotografie či zdrojový mesh se touto studií neintegrovaly do hlavní hry.

## Co je skutečný zdroj

[IPR Praha popis 3D meshe](https://geoportalpraha.cz/data-a-sluzby/clanky-a-projekty/3D-model/3D-mesh) výslovně uvádí letní snímkování 2023, souvislou síť bez objektového rozdělení, vegetaci a dopravní prostředky zachycené ve snímcích. [Zdrojová ArcGIS položka](https://www.arcgis.com/home/item.html?id=92d2d376599c4fd2b6600ed46db7402e) je evidována v původním manifestu jako CC BY; atribuce **datový podklad © IPR Praha** zůstává součástí studie. Její data nejsou Google mesh.

Pipeline opravdu načte vybrané originální objekty z `assets/blender/photogrammetry/strahov-ipr2023-master.blend`, nikoli umělou náhradu. Ověřuje SHA každého použitých původních `.bin` a `.jpg`. SHA masteru, původního manifestu, aktuálního čistého GLB a source-plan před/po vykreslení jsou v [study.json](study.json); změna jakéhokoli z těchto zdrojů během běhu způsobí chybu. Originály se neukládají ani neupravují. Oddělená pracovní scéna je v `assets/derivative/facade-study/b6-reference-study.blend`.

## Reprodukce

```powershell
& 'C:/Program Files/Blender Foundation/Blender 5.2/blender.exe' --background --threads 2 --python scripts/semantic-facade-study.py
& 'C:/Program Files/Blender Foundation/Blender 5.2/5.2/python/bin/python.exe' scripts/semantic-georeference-audit.py
& 'C:/Program Files/Blender Foundation/Blender 5.2/5.2/python/bin/python.exe' scripts/semantic-window-candidates.py
& 'C:/Program Files/Blender Foundation/Blender 5.2/blender.exe' --background --threads 2 --python scripts/semantic-facade-audit.py
```

Blender 5.2.2, CPU maximálně dvě vlákna. Ověřený hlavní běh se správným framingem trval **40,4 s** a vytvořil devět PNG; není to FPS test hry. Kamery mají explicitní horizontální sensor fit, takže portrait střecha není omylem oříznutá na devítimetrový pruh. Západ/východ: 1 600×600 px, ortografická šířka 80 m, tedy 5 cm/px. Střecha: 560×1 680 px, šířka 28 m a výška 84 m, také 5 cm/px. Matice kamery, skutečné herní souřadnice, CRS a výškový počátek jsou v jednotlivých `*-georeference.json`.

## Konkrétní výsledky

- Západní severní část má malé téměř čtvercové otvory a sousední zapuštěný schodišťový pás. Archivní čistý model na této části nesprávně opakuje velká pokojová okna. To je skutečný geometrický rozdíl, nikoli chybějící fototextura.
- Na skutečných fotografických fasádách jsou širší okenní **skupiny**. Viditelné tmavé oblasti na šesti řádcích dávají threshold kandidáty 13/10/10/9/11/10. Část skupin se slučuje ve stínech a korunách; tento počet se **nevydává za počet pokojů ani schválený fasádní pitch**. Podrobnosti a pixelové rozsahy jsou v [window-candidates.json](window-candidates.json).
- Nezávislý [georeferenční audit](georeference-audit.json) z původních OSM lat/lon a binárních I3S souřadnic vyloučil chybu měřítka 1,56×. OSM B6 má bounds x −7,84..16,52 a z −90,07..−20,27 m; zdrojový střešní obal má přibližně x −7,409..15,757 a z −89,390..−20,945 m. Native hlavní obal má 16×70 m. Rozdíl původní zaokrouhlené mapy a nezávislé Mercator projekce je nejvýše **4,61 mm**; dvě nezávislé formy zdrojového převodu se liší nejvýše **1,42×10⁻¹⁴ m**. XY používá cos(latitude) jednou; Bpv výška se nikdy tímto faktorem nenásobí.
- Fit západní fasády má sklon x/z 0,02688, východní 0,02089, přibližně 1,2–1,5°. Je to rekonstrukční interpretace, nikoli zaměření. Studie sama budovu neotáčí.
- Dominantní zdrojová střecha vychází přibližně worldY 18,753 / **345,145 m Bpv**. Modelová základna a výška se tímto auditem automaticky nemění. Zdroj má navíc dvě viditelné nástavby: severní top envelope x 1,47..6,52, z −81,18..−77,15 s vrškem worldY 22,216; jižní x 9,08..14,49, z −30,37..−24,41 s vrškem 21,258. Jsou to fotogrammetrické obaly, ne stavební kóty.
- Striktní geometrický filtr ponechal 1 725 západních, 1 978 východních a 373 střešních trojúhelníků. Přijímá pouze blízkost vlastní roviny, správnou normálu a výškový/poziční rozsah. Při západním srovnání se nikdy nepoužije východní stěna jako výplň díry. V náhledu zůstávají skutečné díry po zákrytech a členitých otvorech.

## Doložená chyba duplicitní konstrukční slupky

[Úplný archivní clean render](west-clean.png) měl velké stěny černé, přestože všechny jeho skutečné texture files existovaly a dekódovaly se. [Kontrolní render](west-clean-facade-only-diagnostic.png) skryl jediný objekt `B6 authored structural wall`; tatáž fasáda se ihned normálně osvětluje. V původních datech se vnější boxový shell a fasádní geometrie překrývaly přesně na x=−0,175 m a dalších obvodových rovinách. To je zdvojená geometrie a self-shadowing, nikoli nedostatek barevné fotografie.

Následná kanonická oprava v `createB6BoxFaceParts` odstraňuje jen prokazatelně koplanární vnější shell faces. Vnitřní plochy, ostění, stěnová tloušťka a kolize zůstávají. Archiv musí přebírat stejnou továrnu, aby se chyba nevrátila do `.blend` či GLB. Zde uložené srovnávací PNG a SHA zachycují konkrétní verzi **před touto opravou**, nikoli tvrzení o aktuální barvě hlavní hry.

## Proč se zatím nebakuje fotografie do main materiálu

Původní atlas obsahuje zaznamenané slunce, stíny i možné listí promítnuté přímo na stavební plochu. Polohový/normalový filtr nemůže zaručit, že barva každého pixelu je čistá omítka. Chybějící zakryté části se nesmějí vyplnit nataženými stromy, auty či protější fasádou. Přenesení celé fotografie by navíc zdvojilo již modelované okenní rámy a znemožnilo správné relighting během dne/noci.

Pro tento pilot je doloženě vhodné převzít **siluetu, členění, správnou typologii otvorů, rytmus skupin a střešní nástavby** a použít čisté autorské/CC0 PBR materiály. Vybraný atlas může později sloužit jako přiznaná fotografická diagnostická vrstva, až bude ručně zkontrolovaná semantická maska; není současně vydáván za albedo/roughness/normal. Studie neposkytuje dokonalý fotogrammetrický model ani současný stavební pasport B6.
