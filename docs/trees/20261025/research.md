# Stromy Strahova · průzkum25.10.2026

Uživatel preferuje realistický vzhled před dokonalým kopírováním fotografií. [Vizuální návrh](concepts.md) je autorský koncept, ne důkaz výsledku hry. Baseline main8516c7b1 po dokončené terénní etapě. D pracovní kopie byla čistá a shodná s main před vytvořením nové větve; oba user buildy zůstávají zmrazené.

## Doložený současný řetězec

Runtime110stromů:47OSM+63foto/ortho interpretovaných. Katalog110 obsahuje107broadleaf,2conifer,1bare; všechna botanicalSpecies=null. Raw OSM48uzlů a surveyed78korun nejsou totéž co výsledný deduplikovaný runtime. Surveyed je ruční interpretace s nejistotou±2,5m, nikoli geodetické zaměření. Starší README109/67 není aktuální inventář.

Generátor má hlavní větve, ale80% listových skupin následně přemístí nezávisle do objemu koruny. Blízké karty0,68–0,94m se vLOD2 zvětšují3,5×. Normály jsou ze72% odvozené od celé obálky. To jsou konkrétní mechanismy anatomické nevěrohodnosti a hypotézy podílu na vatovém obrazu; vizuální cenu je třeba izolovaně porovnat, ne přidávat další gamma korekce.

Současné větvení není řízené roční dobou. Tree input nedostává datum, time je vítr. Far bootstrap76 500 488B, z toho67 850 872B vložených map (~88,7%), devět skutečných2048² map. Far geometrie8 471 996B,256 428tri/219meshů;220LOD0/1chunků dalších120 424 334B. Při předpokladuRGBA8+plné mipmapy je devět2K map asi192MiB GPU úložiště; jde o výpočet, ne měřenou VRAM. Původní streaming má2requesty a měkký32položkový cache limit. Aktivní/desirable objekty mohou limit překročit. Cíleně ošetřit částečný import a abort bootstrapu; nepřidávat každoframovou přestavbu korun.

## Skutečné místní reference

Uživatelské B6 front/rear a B2 typology fotografie jsou v soukromé předchozí cache, datum pořízení neznámé. Root i podagent snímky skutečně prohlédli. B6 front dokládá asymetrický kuželovitý jehličnan s nízkými/převislými patry; druh neprokázán. Jeho opravené ID `ipr-b6-north-conifer`, X/Z−10,5/−76,5, nejistota±2m, odhad výšky12m a koruny6,5m. Ortho8.6.2024 a IPR2023 podporují polohu, ne přesnou anatomii.

Původní ortho je `docs/streets/strahov-ortho-2024.jpg` s georeferencí; detail `docs/reality-pack/facade-study/b6-entry-ortho-2024.jpg`. Příklady: ipr-crown-014 uB5 (−67,59/−60,96), ipr-crown-054 uB1 (−105,94/55,09), ipr-crown-061 uB4 (97,26/77,75). Korunní průměry jsou interpretace, chybí druhové pozemní snímky. U B2 fotografie prokazuje další jehličnan, ale přiřazení ke konkrétnímu stávajícímu bodu se musí ověřit; nevytvářet náhodný nový bod. Jižní B6 conifer a crown031 jsou blízko, možný překryv interpretací se nesmí označit automaticky za dva zaměřené kmeny.

Historický tree-pack-reference.py čte JPEG přes1−v, zatímco novější ověřený photo_projection používá v od horního okraje. Neprohlašuje to všechny staré odhady za chybné, ale green-point/PCA/percentilové výšky nelze převzít jako nové měření bez revalidace. Uživatelská priorita dovoluje přirozený generický habitus; zdrojovou nejistotu nezastírat.

## Varianty authoringu

| Varianta | Přínos | Cena/riziko a volba |
|---|---|---|
| Vlastní hierarchický generátor | ZachováníID/kořenů, plná kontrola LOD a komponent | Nutná skutečná anatomie, ne zvýšení počtu karet; první pilot |
| [MTree5.6.0](https://github.com/GoodPie/modular_tree/releases/tag/5.6.0) | Udržované víceúrovňové větvení a listy na větvích; release20.10.2026 zmiňujeBlender5.2.2 | AddonGPL3+, coreMIT oddělit. Export/LOD/Babylon nejsou automaticky hotové; druhý malý pilot |
| [Sapling](https://extensions.blender.org/add-ons/sapling-tree-gen/) | Weber–Penn, presety, Blender | Omezená podpora, vlastní LOD/material pipeline; záložní varianta |
| [EZ-Tree](https://github.com/dgreenheck/ez-tree) | MIT/GLB, sdílená kostra | Jiný renderer a také zvětšování listů/zaoblení normál; důvod nepřidávat Three runtime |
| Hotové [PolyHaven](https://polyhaven.com/license/)CC0 stromy | Fotografické mapy a komponenty | Např.TreeSmall02 je Burkea africana a katalogově5Mtri; není to změřený pražský druh ani herní rozpočet. Vhodné vybrané mapy/větvičky |
| [TreeIt](https://www.evolved-software.com/treeit/treeit) | Bezplatné herní autorství a LOD | Starší Windows/ASCII FBX, samostatně ověřit licence dodaných map |
| [SpeedTree](https://unity.com/products/speedtree) | Silná hierarchie, ruční korekce, LOD/sezóny | Placený nástroj a redistribuce assetů; pouze srovnání, bez nákupu |
| [The Grove](https://www.thegrove3d.com/license/) | Přirozená růstová simulace | Podmínka neextrahovatelných modelů a chybějící herníLOD nevyhovuje prostému public GLB |

## Fotografické mapy

Současné LeafSet001/019 jsou v aktuální v3 API surface-approximated. [LeafSet024](https://ambientcg.com/view?id=LeafSet024) je Surface Photogrammetry, zelené zaoblené listy, atlas40×40cm, [CC0](https://docs.ambientcg.com/license/). LeafSet022 je Photometric Stereo/25×25cm,027 Photometric Stereo/90×90cm se zelenými i podzimními laločnatými exempláři. Fyzické rozměry patří celému atlasu. JPG balík obsahuje i JPEG opacity; finální alfa hrany preferují původní PNG masku. Všechny1K rozměry byly ověřené v malých archivech,2K se musí znovu ověřit při importu. V3 `technique` má přednost před rozporným starším v2 `creationMethod`.

[FirTree01](https://polyhaven.com/a/fir_tree_01) má doložené Photography RobTuytel/Modeling RicoCilliers; twig_diff/alpha/nor_gl/rough jsou přímo dostupné bez celého stromu. Čtyři1K kanály1 525 727B,2K4 698 932B, skutečné hlavičky1024²/2048² a PNG alpha ověřené. Fyzický rozměr samotné větvičky není vAPI doložen. Zachovat botanický název zdrojového assetu v provenienci, ale nepřenášet jej jako určení strahovského stromu.

## Sezóny a výkon

[ČHMÚ fenologie](https://opendata.chmi.cz/meteorology/phenology/) obsahuje rašení/listy/žloutnutí/opad;444 znamená fáze nenastala. Přečtená lípa2014–2025, nejbližší stanice36–44km a rozdíl mediánu plného olistění asi24dnů: regionální opora, ne živá Strahov stanice. [Metodika](https://www.chmi.cz/namerena-data/fenologicky-vyvoj-vegetace) vyžaduje historii efektivních teplot a délku dne, nikoli jednu současnou teplotu. Barva a opad jsou různé proměnné, půdní retence není1−leafAmount. [Evergreeny také obměňují jehlice](https://arboretum.harvard.edu/stories/evergreens-are-deciduous-too/), ale celá koruna neopadá; opadavé jehličnaté podpořit jako typ bez neprokázaného místního přiřazení.

Pro runtime preferovat několik věrohodných habitů s řízenými variantami, zachované sourceID/kolize, sdílené materiály/geometry. Thin instances nejsou automatická úspora pro unikátní stromy kvůli společným bounds/LOD; [Babylon dokumentace](https://doc.babylonjs.com/features/featuresDeepDive/mesh/copies/thinInstances). Index subset celých listových komponent zachová hlavní i stínový průchod a zlevní skutečnou práci, zatímco alpha discard nešetří vertex fázi. Material.alpha není vhodný: caster filtr odmítá hodnoty pod0,98 a materiál je sdílený. Unikátní plugin class identity a GLSL/WGSL jsou povinné; stávající TreeWindPlugin dědí obecnou identitu, riziko není prokázaná současná obrazová kolize.

Impostory/KTX2 jsou srovnané následné možnosti: dynamičtější světlo a zimní kostra zvyšují cenu atlasových variant, dekodér/alpha mipy vyžadují vlastní přejímku. První pilot proto nemíchá změnu geometrie s kompresí. [Blender glTF](https://docs.blender.org/manual/en/5.1/addons/import_export/scene_gltf2.html), [Khronos KTX](https://github.com/KhronosGroup/3D-Formats-Guidelines/blob/main/KTXArtistGuide.md), [NVIDIA vegetační animace](https://developer.nvidia.com/gpugems/gpugems3/part-iii-rendering/chapter-16-vegetation-procedural-animation-and-shading-crysis). Optimálnost zatím není naměřená.
# Dodatečné srovnání celých hotových CC0 stromů

Čtecí audit ověřil oficiální metadata a malé glTF JSON bez stažení velkých BIN/modelů. [Fir Tree 01](https://polyhaven.com/a/fir_tree_01) je skutečná alternativní anatomie: preview má nepravidelné plné koruny, převislé větve a mezery. Varianty A/B/C mají v daném glTF LOD0 4 176 819 / 2 300 624 / 505 494 trojúhelníků a geometrické výšky18,925 /14,055 /14,521m. Nejde o zaměření živých stromů. B je charakterem bližší plnějšímu B6, C má výrazněji odhalený spodní kmen. [Oficiální API info](https://api.polyhaven.com/info/fir_tree_01), [glTF metadata](https://dl.polyhaven.org/file/ph-assets/Models/gltf/1k/fir_tree_01/fir_tree_01_1k.gltf).

Není to přímá runtime náhrada: glTF deklaruje twig BLEND s JPEG barevnou mapou bez alpha a C trunk nemá TEXCOORD_0. Zdrojový blend má218,99MB, s1K mapami274,83MB; externí glTF BIN478,46MB. Provider uvádí Geometry Nodes/LOD, ale nižší LOD uvnitř blend nebyly otevřeny ani ověřeny. Vhodné je případné převzetí anatomie přes nový kontrolovaný export a již ověřené opacity mapy, nikoli slepé načtení původního glTF. [Seznam souborů](https://api.polyhaven.com/files/fir_tree_01).

Úzké listnaté alternativy: [Tree Small 02](https://polyhaven.com/a/tree_small_02) má organický prohnutý kmen, ale jde o providerem označenou Burkea africana, výšku4,557m a2 062 487tri; její prosté zvětšení na B5 by změnilo velikost listů. [Island Tree 01](https://polyhaven.com/a/island_tree_01) má skenovaný pokroucený pobřežní habitus, výšku5,027m a1 599 403tri. Oba jsou inspirativní, ale neprokazují vhodnější kompletní náhradu místního listnáče. Všechny uvedené podklady jsou [CC0](https://polyhaven.com/license).

Závěr tohoto omezeného průzkumu: nynější R5/streaming práce zůstává použitelná. Fir B je konkrétní možný následný anatomický comparator; jeho převaha ve hře, vhodný nižší LOD a míra přizpůsobení měřítka nejsou ověřeny. Žádný velký model, instalace ani nákup nebyly tímto auditem provedeny.

## FAR koruny: následný pilot po WebGPU opravě

Čtecí audit streaming agenta26.10. doporučuje nejprve porovnat skutečné dřevo s malými atlasovými skupinami listů zachovávajícími původní opadové ranky. Jde o návrh, nikoli přijatý model. Dosavadní katalogový odhad109,7MB FAR foliage překračuje96MiB rezidentní limit ještě bez dřeva. Vyšší procento geometrického subsetu vrací paměť, nižší prokazatelně ředí korunu; samotné streamování neřeší vzhled ani chybějící koruny během fetch/eviction.

Alternativa více pohledů celé source koruny přesouvá náklad do textur/sezón: ilustračních8pohledů×256²×8B/texel je4MiB na strom před mipmapami, asi587MiB pro110stromů s mipy. Komprimovaný skutečný rozpočet může být jiný a musí se změřit. Hybrid geometry/billboard cloud má primární oporu v [Hybrid Billboard Clouds](https://casual-effects.com/research/Martin2004HybridBillboardClouds/Martin2004HybridBillboardClouds.pdf); nejde o náš výkonový důkaz. Kontrolovat také transparentní fill.

Nejmenší pilot: celá B5 koruna, reference plnýR5MID, negativní kontrola současnýFARsubset, kandidát rankových skupin na1–2rovinách. Roviny mají rozdělit zdrojové listy podle orientace, nikoli opakovat celou projekci výhonu. Zachovat sourceTreeId/branchId/kotvu/fyzické měřítko. Jeden zdokumentovaný44listý výhon má9ranků; jejich spojení na jednu kartu by změnilo opad a jednoduchá mapa nejbližšího ranku neodkryje zadní list po opadu předního.

Porovnat při75/135/175m,720px/FOV0,85, čelně/45°/60°/90° a zvýšeném pohledu, plné léto/50%opad/zima. Na175m je8cm list asi0,36px,0,275m výhon1,25px a B5 koruna81,5px; velký768² studio výhon při60° tedy sám FAR nezamítá. Navržené, dosud nesplněné pilotní cíle: celková maskovaná plocha±5%, přidaná/chybějící plocha mimo1px toleranci každá≤5%, samostatně mezery/kvadranty/blikání a absence listů v zimě. Opacity mipmapy musí zachovat coverage a atlasové padding, jinak může koruna řídnout až při filtrování; náš opacity vstup je RGB mapa.

Před hromadným exportem změřit rozbalené atributy vs sdílené roviny s transformacemi/ranky, atlasový pool+mipy a skutečné drawy. Případné instancované rank prefixy jsou nový explicitní runtime kontrakt. Rezidentní základ+FARcache+rezervace musí zůstat≤100663296B v současném source-byte účtu; textury a rozbalené buffery uvést zvlášť. FAR eviction potřebuje atomickou rezidentní náhradu. Kořeny, identity a collidery zůstávají původní; druhy jsou neznámé.

