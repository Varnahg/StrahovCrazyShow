# R5: konzervativní Fir obal a odvozený listnatý výhon

Autorizovaná navazující výroba po R4. Aktuální integrovatelná revize má plný prostřední LOD a deset cílených kontrol PASS. Vícekolmý leafy vzorek zůstává oddělený a nepřijatý. Předchozí native a první whole checkpointy jsou neměnné. Nejde o přijatý katalog 110 stromů ani důkaz GPU zrychlení.

Po nálezu v čistém candidate-v4 byl navíc opraven samotný import authoring přípravy: R4 checkpoint se čte až při explicitní přípravě, nikoli při importu konstant. Regrese v novém kořeni bez `.cache` prochází a explicitní příprava stále odmítá chybějící pinované vstupy. Celý R5 soubor má nyní **11/11 PASS**. Geometrie, mapy, jejich metadata i historické hashované kopie skriptů zůstaly beze změny; podrobnosti jsou v aktuálním authoring handoffu.

## Aktuální full-coverage MID

`public/models/vegetation/seasonal-r5/runtime-contract.json` zachovává v2 a stabilní dvě ID. Oba prototypy mají explicitní `lodProfile: "full-coverage"`; marker znamená **LOD1 se všemi zdrojovými komponentami LOD0**, nikoli plnou hustotu vzdáleného LOD2. Root jej používá jako opt-in pro další LOD policy, původní R4/legacy flag nemají.

| Pilot | Aktuální GLB bajty | Plný MID: fyzické části / rank groups / foliage tri |
|---|---:|---:|
| own-broadleaf | 49 399 036 | 82 100 / 16 019 / 164 200 |
| own-conifer | 22 078 712 | 18 138 / 18 138 / 108 828 |

Broadleaf MID používá skutečné rohy `[0,1,5,4]` každého původního šestivertexového listu, jejich přesné pozice/UV/ranky a dva trojúhelníky. Nesrovnává listy na novou plochu a nezvětšuje je. Fir MID má všechny původní raw near FirA atributy a indexy. `validate_coverage.mjs` po skutečném GLB exportu nezávisle ověřil všechny tyto bajty, všechny ranky i fyzické počty. Současně prokázal byteovou shodu **LOD0 i LOD2** s prvním frozen R5 whole checkpointem. SHA jednotlivých accessorů jsou ve `sourcePreservation` pilot manifestu; jeho `frozenExport.path` odkazuje přímo do immutable kopie.

Nový native `r5-full-coverage-pilots.blend` byl otevřen a všech dvanáct meshů ověřeno. LOD1 wood zůstává původní R4 rozpočet při22m: jeho cutoff0,5px by při8m odpovídal asi1,38px. To je konkrétní omezení pro rootovu novou hero hranici a herní přejímku; autor zde bez zadání nepřegeneroval další dřevěnou politiku. Žádný multi-plane materiál není použitý v celých pilotech.

## Samostatný 2/3plane leafy výsledek

`public/models/vegetation/seasonal-r5/multiplane-v2/comparison-manifest.json` obsahuje skutečné výsledky, `accepted:false`. Každý ze tří atlasových tiles vznikl nativním ortografickým renderem **celého šestilistého source rank32722** z příslušného směru; původní fotografie zůstaly beze změny. Souřadné báze `(R,U,N)`, `(-N,U,R)`, `(R,-N,U)` prošly nezávislým read-only TBN/UV auditem. Jeden materiál používá čtyři nové 3072×1024 mapy, po třech1024px tiles; opacity je samostatné16bit RGB s deklarací `RGB-luminance`. Normal data je tangent OpenGL každé příslušné plochy. Strana tile je0,274689m, žádné škálování fyzických listů.

Porovnány jsou source24tri, dvě kolmé plochy4tri a tři kolmé plochy6tri. Všechny varianty mají tutéž kameru, pevný crop a768². K horizontálním yaw0/45/60/90 přibyl yaw45/elevation30, protože třetí plocha je v celé horizontální řadě hranou. Coverage se měří z výsledné render alpha při0,5; runtime maska je nezávisle ověřené RGB. Raw FP/FN/IoU jsou zachované. Níže jsou extra/missing **mimo1px toleranci**, definovanou8-neighbour3×3 dilatací/erozí source masky, normalizované původní source plochou.

| Pohled yaw/elevation | 2planes IoU | Extra / missing | 3planes IoU | Extra / missing |
|---|---:|---:|---:|---:|
| 0/0 | 0,99950 | 0 / 0 % | 0,99950 | 0 / 0 % |
| 45/0 | 0,65378 | 15,99 / 22,05 % | 0,65378 | 15,99 / 22,05 % |
| 60/0 | 0,62329 | 22,93 / 20,95 % | 0,62329 | 22,93 / 20,95 % |
| 90/0 | 0,99915 | 0 / 0 % | 0,99915 | 0 / 0 % |
| 45/30 | 0,63845 | 7,98 / 28,84 % | 0,57152 | 24,56 / 26,79 % |

Přesná projekční zobrazení0/90 prokazují správné umístění a mapování. Skutečné prohlédnuté šikmé PNG ukazují navíc duplikované listové plochy a vzájemné stínění; mezi projekčními směry karty nerekonstruují původní objem. Třetí plocha elevated výsledek zhoršuje. Proto zde není automaticky zvolen vítěz ani povolen whole-tree multi-plane bake.

Native CPU bake skončil exit0 za přibližně213s; všech15 PNG a čtyři mapy jsou zachované. Independent Node decoder ověřil shodné RGB a tile cutoff počty334226/243676/230523. Native master `r5-multiplane-v2.blend` se skutečně otevřel, osm použitých map je packed, source origins/rank a24/4/6tri ověřené. Toto detailní studio není důkaz far mip coverage ani GPU: při FOV0,85/720px zabírá tile přibližně4,65px ve47m a2,91px v75m; mipy a prolínání sousedních tiles nebyly přijaty.

## Navazující celé piloty

Po explicitním obrazovém přijetí rootem vznikly dva celé R5 piloty v `public/models/vegetation/seasonal-r5/runtime-contract.json`. Verze 2 ponechává stabilní ID `own-broadleaf` a `own-conifer`, původní source IDs/root/radius, fixed material keys a tři LOD. Generaci odlišuje nový adresář a obsahový hash. Near wood je přijatý `projection075`, střední/vzdálené wood zůstává byteově stejné jako R4. Fir používá osmifacetový obal ve všech LOD. Všechny broadleaf foliage accessors i indexy jsou byteově stejné jako R4; jeho LOD1/2 subset je stále výslovně otevřený problém.

| Celý pilot | GLB bajty | Near wood tri | Foliage near / mid / far tri |
|---|---:|---:|---:|
| own-broadleaf | 41 848 112 | 209 074 | 328 400 / 82 126 / 32 766 |
| own-conifer | 19 828 452 | 210 180 | 108 828 / 54 396 / 21 786 |

Native master `r5-runtime-pilots.blend` byl skutečně otevřen, všech dvanáct meshů a nulové originy ověřené. Osm cílených testů PASS včetně byteového srovnání nezměněných R4 atributů a zachování všech Fir ranků. První export skončil chybou odstraněné Blender RNA reference; nahrazení objektů nyní používá přímou mapu a odstraněný objekt se z ní odebírá. Neúspěšný log je zachovaný, druhý běh skončil exit 0.

Následuje pouze malý samostatný 2/3plane leafy sample. Jeho nepřijatý materiálový kontrakt se nepřimíchává do těchto integrovatelných dvou pilotů.

## Doložený problém a rozsah

R4 vlastní near wood má 281 530 / 304 594 trojúhelníků, far foliage 32 766 / 43 572. Ve skutečné B5 hře own vykresloval 1 111 559 aktivních tree tri proti 396 786 legacy; takty GPU se měnily a neumožňují přesné procentní tvrzení o FPS regresi. Obrazový audit navíc popsal dlouhé listnaté pásy a rozpad jemných zimních konců. Zdroj je [pilot-v3](../../verification-evidence/trees-20261025/pilot-v3.md), nikoli matematický model FPS.

R4 checkpoint `.cache/trees-pilot-20261025/r4-optimized/` zůstává neměnný. Nová příprava kontroluje jeho manifestové SHA-256; fotografie a původní material keys se nepřepisují. Aktuální osové JSON jsou samostatně hashované read-only vstupy. Listnatý druh zůstává neznámý. Měřítko LeafSet024 je původních 0,4 m na celý atlas; Fir délka 0,22–0,35 m je nadále autorský odhad R4.

## Dvě Fir varianty a odmítnuté alternativy

Baseline je konkrétní fotografická část R4: 12tri center fan s malým prohnutím. První kandidát A je adaptivní osmifacetový obal, triangulovaný šesti trojúhelníky. Druhý kandidát B je bbox quad, dva trojúhelníky. Obě varianty používají stejnou originální fotografii, UV/base, fyzické mapování, orientaci a rank skutečné R4 větévky. Mění se interpolace prohnutí uvnitř polygonu; tuto změnu musí posoudit nativní a herní obrazové srovnání.

Pro A se drží čtyři osové podpůrné roviny R4 bbox. Ze zbývajících osmi původních směrů po 30° se vybírají čtyři; všech 70 kombinací na část se porovnalo plochou a shodou původní alpha masky. Zvolené obaly zachovávají celý R4 hull včetně jeho 1px přesahu. Nezávislý Node decoder 16bit RGB PNG ověřuje každý opaque pixel v celém bbox, nikoli jen vrcholy hullů.

| Část | R4 opaque px | A plocha navíc | A další opaque px | B další opaque px |
|---|---:|---:|---:|---:|
| upper-right-spray | 51 922 | 3,44 % | 0 | 0 |
| upper-left-spray | 36 804 | 2,49 % | 0 | 73 |
| upper-single-twig | 8 301 | 0,14 % | 0 | 0 |
| middle-right-twig | 20 648 | 0,63 % | 0 | 2 |
| middle-left-twig | 8 513 | 0,76 % | 0 | 0 |
| lower-left-spray | 99 893 | 5,53 % | 0 | 200 |
| lower-right-spray | 77 185 | 5,22 % | 0 | 7 228 |

U lower-right bbox přibírá 7 071 pixelů nevybrané raw komponenty 12 a 157 pixelů komponenty 9. **B se nepřijímá pro produkci.** Čistý quad by potřeboval nový nativní bake konkrétního hullu do odvozených map s novým material key. Originální atlas se kvůli tomu nesmí editovat. Pravidelný obal po 45° je horší než A: plocha +8,8–20,8 % a dva další pixely u lower-left.

Při zachování dnešních 3 631 far větévek má A 21 786 foliage tri, B 7 262 a R4 43 572. Zakřivený osmivrcholový center fan by měl 29 048. Jedná se o počty geometrie. Pixelová shoda cutoff 0,5 neprokazuje shodu mip/filter/šikmých pohledů ani alpha fill na GPU.

## Konkrétní listnatý zdroj a následný větší výhon

První bake čerpá přímo exportovanou R4 near geometrii `own-broadleaf.glb`: source `ipr-crown-014`, branch **4120**, parent **4118**, rank **32722**, šest existujících listů, 24 tri. Žádné nové listy se nerozsypávají do objemu a původní pozice se necentrují ani neškálují. Frame má přibližně 0,267 × 0,263 m včetně 2,5% okraje; zdrojová hloubka 0,228 m zároveň upozorňuje na riziko jediné ploché projekce při šikmém pohledu.

Frame ukládá `anchor/right/up/normal`, metrické `bounds`, `depthRange`, přesné `branchId/parentId`, source root/radius a rank. Mapa normal je v tangent bázi konkrétní receiver karty (R right, G up, B směrem ke kameře), nikoli RGB world normals. Zdrojová fotografie se v Blenderu čte jako sRGB, datové kanály lineárně. Barva je nativní ortografický emission render bez světel, exposure 0, Standard; data používají Raw. Opacity má grayscale hodnotu v RGB. Roughness, opacity a normal jsou oddělené mapy. Combined osvětlený bake s AgX byl odmítnut, protože by do albeda přidal osvětlení a tone mapping.

Tak malá skupina sama nestačí na budoucí far katalog. Přesně identifikovaný parent subtree 4118 obsahuje branches 4118, 4119, 4120, **44 původních listů v devíti původních opadových rancích**. Je to další porovnávací zdroj, zatím bez exportu. Jeden společný rank by měnil dosavadní sezonní kontrakt; více vrstev/subsetů nebo nový clusterový sezonní kontrakt se musí rozhodnout před adopcí. Vícesměrný bake je alternativa pro skutečnou prostorovou hloubku; přidává mapy, geometrii a alpha fill a zatím není automaticky zvolen.

## Near wood

Konzervativní matematický kandidát zachovává všechny větve, všechny child attachment parametry, ancestry, root a konce. Oproti R4 0,35px@2m zkouší 0,45px@2m, zároveň chybu střednice a interpolovaného poloměru omezuje polovinou nejtenčího poloměru dané větve. Zůstává limit 24 stran. Jde o cílené zjednodušení vzorkování a radiálních stran, žádné odstraňování celé podpůrné kostry nebo zvětšování listů.

| Model | R4 near tri | R5 matematický kandidát | Zachované větve |
|---|---:|---:|---:|
| own-broadleaf | 281 530 | 259 862 | 5 865 / 5 865 |
| own-conifer | 304 594 | 275 472 | 5 188 / 5 188 |

Maximum přijaté chyby střednice+poloměru je 0,000763 / 0,000435 m. Radiální limit 24 je zděděný kompromis R4 a nelze jej vydávat za striktní neomezenou projekční chybu všech kruhových průřezů. Nativní zimní rendery jsou nyní hotové; skutečná hra a runtime export zůstávají navazující přejímkou.

Druhý profil `projection075` má 0,75px@2m, nejvýše šest stran větví řádu depth≥3 a bez dodatečného omezení 0,5×terminal radius. Zachovává všechny větve a spoje. Výsledek má 209 074 / 210 180 tri (−25,7 / −31,0 % proti R4). Skutečné maximum chyby kruhového průřezu je ale 5,60 mm = 2,23 px u listnáče a 1,89 mm = 0,75 px u jehličnanu; 0,75 px tedy popisuje rozpočet zjednodušení střednice+poloměru, nikoli celkový povrchový limit. Profil A má obdobný zděděný limit kmene 1,65 / 0,60 px.

Oba profily vytvoří skutečné tube trojúhelníky a kontrolují point-to-triangle vzdálenost všech 82 100 / 18 138 původních kotev vůči jejich vlastní podpůrné větvi. Žádná nepřekročila existující mez `max(0.008, supportRadius+0.005)` metrů. Jde o geometrickou kontrolu kandidáta před exportem, nikoli o důkaz současného runtime nebo věrnosti zimní siluety. Původní osy jsou navíc porovnané se všemi neměnnými R4 `branchId/branchT/anchor`.

## API, cache a lifecycle

Fir A může později zůstat na `fir_tree_01`, ale tato sada obsahuje jen izolované samples. Současný loader v2 vyžaduje tři LOD jediného GLB, jména/role a pevné material keys. Samples **nejsou** runtime v2 prototypy. Leafy karta používá nový kandidátní key `LeafSet024-shoot-r5`; žádný loader se zde nemění.

Příprava je offline nativní ESM s čistými matematickými funkcemi; společná triangulace, clipping a frame jsou sjednocené. Nemá globální runtime cache, observer ani frame alokace. Blender načítá pouze konkrétní mapy a vytváří vlastní scénu; každý běh končí procesem. Výstupy mají oddělené cesty `seasonal-r5`, `20261025-r5` a vlastní evidence. Další v3 streamování a geometrické pooly jsou samostatný koordinovaný rozsah.

## Reprodukce a dosavadní důkazy

Po aktivaci `.cache/trees-20261025/activate.ps1`:

```powershell
node scripts/trees-20261025-r5/prepare.mjs
node node_modules/tsx/dist/cli.mjs --test tests/tree-seasonal-lod.test.ts
# Až s r5-bake rezervací heavy-validation:
& 'C:/Program Files/Blender Foundation/Blender 5.2/blender.exe' --background --factory-startup --threads 2 --python-exit-code 7 --python scripts/trees-20261025-r5/bake.py
& 'C:/Program Files/Blender Foundation/Blender 5.2/blender.exe' --background --factory-startup --threads 2 --python-exit-code 7 --python scripts/trees-20261025-r5/wood_preview.py
& 'C:/Program Files/Blender Foundation/Blender 5.2/blender.exe' --background --factory-startup --threads 2 --python-exit-code 7 --python scripts/trees-20261025-r5/verify_native.py
node scripts/trees-20261025-r5/finalize.mjs
node node_modules/tsx/dist/cli.mjs --test tests/tree-seasonal-lod.test.ts
```

Sedm cílených kontrol PASS: nezávislá source-alpha rovnost a kontaminovaný quad, konzervativní geometrie/triangulace, near child junction/tenké větve, ortonormální metrický frame, skutečná povrchová vzdálenost včetně záměrně odpojené kotvy, skutečné GLB/native hashe/ranky/šest původních částí a nezávisle dekódované RGB opacity PNG. Plná sada, build, integrace a GPU nejsou výsledkem tohoto authoring kroku.

## Skutečný nativní výsledek

Blender 5.2.2 LTS `d13f752e3b9c`, Cycles **CPU**, dvě vlákna. První sada skončila exit0 za přibližně63s, dřevo exit0 za118s. První sada obsahuje sedm Fir comparison GLB, leafy source/card GLB, čtyři mapy a deset čelních/60° PNG; wood sada má dvanáct PNG (R4/A/B × dva stromy × whole/detail). Žádná další GPU scéna nebo runtime modelový katalog nebyly spuštěné.

- **Fir A** v prohlédnutých čelních a šikmých obrázcích zachovává fotografickou část; **quad B** viditelně přibírá cizí kus kůry. Rozdíl je záměrně zachován v `fir-lower-right-spray__quad-rejected-view0.png`, nejde o potichu opravený vstup.
- **Leafy jediná karta** zachovává čelní fotografický obrys, ale při60° výrazně ztrácí prostorový rozsah a mění vzájemné překrytí listů. Proto se **nepřijímá jako univerzální mid/near náhrada**. Čelní rozdíl vlastních stínů je očekávaný důsledek ploché geometrie; do albeda se stíny dodatečně nezapékají. Source zůstává6/6 listů a24tri, karta2tri.
- **Wood A/B** zachovávají v celých zimních pohledech hlavní siluetu a napojení. Detaily ze2m ukazují lokální změny průřezů a jemných větví, nikoli odříznutí podpůrné kostry. Listnatý detail míří na branch10, depth3, šest stran, nominální radiální chyba2,23px; jehličnatý na branch2087, depth3, tři strany,0,749px. Přesné kamery a centra jsou ve `woodComparison.closeViews`. To není výběr vítěze ani GPU důkaz;12samples bez denoise navíc nejsou pixelově bezšumové.

Opacity je16bit **RGB**, `maskChannel=RGB-luminance`, Raw. Oba nezávislé dekodéry potvrdily stejné RGB kanály, minimum0, maximum1, dekódovanou alpha1; cutoff0,5 ponechá353640 z1031168 pixelů (1024×1007). WhiteRGB+transparentA se nepoužívá. Ostatní mapy mají samostatné hashe a deklarované barevné prostory.

Oba nativní mastery se skutečně znovu otevřely. Sample master má12 použitých packed map, wood master3. Source origins jsou0, source GLB leaf mesh má36vertex/24tri/6connected parts; rank32722 se zachoval. Leafy60 projekce obsahuje všechny source vertices v rozsahu přibližně4,7–95,3 % viewportu, takže rozdíl není ořezem snímku. Návratové CPU kontroly potvrdily také přesné počty trojúhelníků všech čtyř wood kandidátů.

Primární souhrn výstupů je `shared/data/assets/tree-r5-materials-manifest.json`; přesné soubory, hashe, procesy a snapshot viz [authoring handoff](../../agents/handoffs/trees-20261025-r5-authoring.md) a [bake handoff](../../agents/handoffs/trees-20261025-r5-bake.md). Blender vypsal upozornění na budoucí odstranění `use_nodes` a nepřevoditelné cesty dvou nepoužitých factory brush materiálů; všechny použité mapy jsou zabalené a readback prošel. Původní logy jsou zachované.

Primární podklady: neměnné R4 skripty/modely, původní [materiálové mapy a provenience](materials.md), [Blender render baking](https://docs.blender.org/manual/en/4.4/render/cycles/baking.html), [Khronos glTF Blender normal-map convention](https://github.com/KhronosGroup/glTF-Blender-IO/blob/main/docs/blender_docs/scene_gltf2.rst). Aktuální latest Blender manual nebyl přes web dostupný; použitelný archiv primární dokumentace rozlišuje barvu bez světla a tangent normal. Konkrétní Blender 5.2.2 API musí potvrdit vlastní běh, nikoli starý text dokumentace.
