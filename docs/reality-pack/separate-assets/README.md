# Samostatné autorské modely budov

Aktualizováno 12. 10. 2026. Hlavní svět používá čisté autorské modely a doložené mapové umístění. IPR fotogrammetrie z roku 2023 zůstává prostorovou předlohou; její spojený mesh se zde nepřebírá jako herní budovy, auta ani vegetace.

## Aktuální modelářský checkpoint 12. 10. 2026

Všech 121 samostatných `.blend` a GLB bylo znovu vytvořeno z nejvyšší skutečně autorské geometrie: **2 905 224 trojúhelníků**. Zahrnuje nové Blender profily oken, správnou identifikovanou skladbu tří fasád B4 a doložený kouřovod Potravin/R-ka. Okna mají oddělené rámy, zapuštěné křídlo, těsnění, ostění a profilovaný parapet. B4 má 12/5/18 otvorů, tmavé neutrální rámy a panelové spáry; složení šedého obkladu není prokázané. Konstrukční milimetrové rozměry jsou výslovně modelářské odhady, ne zaměření.

Aktuální přenosné geometrie mají dohromady **206 118 812 B**, 15 sdílených obrazů **6 020 118 B**. Source plan má **379 878 281 B** a je vedený přes Git LFS. Herní near/far varianty pocházejí ze stejných autorských kitů; nejvyšší archivní detail se v běžné hře nepřidává jako další překrývající se model.

- Všech **121 skutečných GLB PASS**: identity, topologie, 0 nulových trojúhelníků, normály, UV, vertex barvy, kanonické materiálové faktory i originální bajty procedurálních barevných a normálových PNG. Maximální rozdíl bounds 0,013793 mm. [Audit](building-export-audit.json), [log](building-glb-audit-20261012-b3.log).
- Všech **121 skutečných uložených Blender souborů bylo znovu otevřeno**, nikoli pouze ověřeno podle deklarace. 8 715 672 rohových normál a 7 554 954 barevných rohů zkontrolováno; source polohy, topologie, UV, materiály a linked soubory PASS. Maximální odchylka vrcholu 0,015137 mm. [Audit](blender-reopen-audit.json), [log](building-native-audit-20261012-b3.log).
- Přesné zdrojové normály jsou uložené jako POINT/FLOAT_VECTOR `_SOURCE_NORMAL` v kanonických osách x východ / y nahoru / z jih. Maximální komponentová chyba tohoto atributu po native reopen je **2,981×10⁻⁸**. GLB z něj získává standardní `NORMAL`; pomocný atribut a nepotřebné původní normal buffery se při exportu odstraní.
- Nativní Blender shading používá vlastní ztrátovou reprezentaci normál. Jeho samostatně měřená největší úhlová odchylka je **0,218142°**, pod stanoveným limitem 0,25°. To se nesmí zaměnit s přesností uložených zdrojových dat ani s přísným GLB limitem 2×10⁻⁴ na komponentu. [Primární implementace převodu](https://github.com/blender/blender/blob/05b4ed5d395292b1da0acf431515d3f0ca3e45f1/source/blender/blenkernel/intern/mesh_normals.cc) vysvětluje short2/trig uložení; chování instalované verze 5.2.2 bylo změřeno přímo. [Původní neúspěšný audit](building-glb-audit-20261012-b1.log) je zachovaný.
- 19 skupin B6 schodišť a 3 976 kanonických boxových částí zůstalo správně osazených s jediným foundation offsetem; source/runtime rozdíl pod 0,0005 mm. Není to přesnost skutečné stavby.

`_SOURCE_NORMAL` je archivní datový atribut. Při ruční změně geometrie v Blenderu se automaticky nepřepočítává: změna musí projít zdrojovým autorským workflow a novým auditem. Přenos je určený pro zdejší statické modely bez dalších transformací/modifikací topologie, nikoli obecný exporter animovaných či skinned modelů. Procedurální odrazy, noční masky a rendererové světlo nadále nejsou tvrzenou shodou shaderů mezi Blenderem a hrou.

Podklady a skutečné kit kontroly: [okna](../building-window-kit-20261012/README.md), [B4](../b4-facade-panels-20261012/README.md), [fotoidentifikace](../../building-modeling-20261012/references/b4-facade-plan.md). Celohrová přejímka a FPS jsou samostatná následná kontrola; tento archivní audit je CPU důkaz geometrie.

Následující popis zachovává původ a starší etapy. Historické počty a dílčí B6 výsledky z 11. 10. jsou nahrazené aktuálním checkpointem výše.

## Skutečná identita objektů

Každá budova má vlastní `TransformNode` s klíčem `building:osm:way:<id>`. Stadion má `building:osm:relation:1515034`. Fasáda, vstup a střecha téže budovy sdílejí jeden pivot. Materiály lze sdílet, geometrie dvou budov se neslučuje. Posunutí jednoho pivotu přesune jeho okna, vstup a střechu a neovlivní sousední budovu. Test ověřuje skutečně proměněné world souřadnice vrcholů, nejen názvy uzlů.

Osm typických vstupů již není sloučených do společné skupiny `entries`. Každý zůstává u svého bloku, včetně detailního LOD. Šest hřišť má vlastní source ID, samostatné meshe a nezávislý detail LOD. Nový severní tenisový kurt B6 má také vlastní `.blend` a GLB mimo sadu 121 budov; viz `../terrain/court-repair/README.md`. Střecha Marketu / R-ka patří k OSM budově `7645350`; odstraněna byla druhá, koplanární generická střecha. Odstraněny byly také nulové druhé trojúhelníky, které rozhraní pro čtyřúhelníky dříve přidávalo k trojúhelníkovým střechám.

`client/world-asset-identity.ts` nabízí `getWorldAssetRoot`, `attachWorldAssetNode` a úklid prázdných rootů. Připojení zachovává dosavadní world transform. Matice dětí nejsou zmrazené tak, aby pozdější změna rodiče ponechávala části modelu na původním místě. Renderer a kolize nadále vycházejí ze stejných původních shared poloh a rozměrů.

## Editovatelné soubory

- `assets/blender/buildings/osm-way-<id>.blend`: 120 samostatných budov.
- `assets/blender/buildings/osm-relation-1515034.blend`: samostatný stadion.
- `public/models/buildings/osm-*.glb`: odpovídajících 121 samostatných exportů.
- `assets/blender/buildings/source-plan.json`: kompletní nejdetailnější autorská geometrie použitá k exportu, s původem a hashi zdrojů.
- `public/models/buildings/manifest.json`: source identity, world origin, počet částí a trojúhelníků, velikost a SHA-256 každého modelu.

GLB obsahují lokální souřadnice v metrech a Y nahoru. Pro zasazení se přičítá `manifest.models[].origin`, kde +X je východ a +Z jih. Blender používá svůj Z nahoru. Každý soubor má jediný vlastní source root a jeho části; neobsahuje jiné budovy, stromy nebo zaparkovaná auta. B6 zahrnuje autorský strukturální interiér, jehož rozměry zůstávají schematické.

Stejné textury se sdílejí přes relativní `textures/<sha256>.*` URI. Při kopírování GLB je nutné zachovat sousední složku `textures`. Při sdílení se zachovávají přesné exportované bajty, bez změny rozlišení, dekódování nebo opětovné komprese. Původní CC0 zdroje a jejich provenance zůstávají v balíčku povrchů. Celé GLB mají dohromady 16 015 928 B; devět sdílených map má 5 489 695 B. První přímý export opakoval stejné obrázky v každém modelu a měl přibližně 625 MB.

Hra generuje stejné číselné části nativně ze shared plánů. Archivní GLB se nesmějí přidat jako druhá vrstva přes již existující model. Nejdetailnější archiv se nedecimuje; herní LOD pouze vybírá viditelný detail.

## Historické ověření 11. 10. 2026

- Závěrečná cílená sada B6, architektury a tranzitu prošla 36/36. Po doplnění readonly stavu skutečného interiérového světla a aktualizaci zdrojového copyrightu navigace prošly ještě 3/3 testy materiálu, světelného getteru a navigačního SHA kontraktu. `tsc --noEmit` prošel.
- Původní sada všech 121 skutečných `.blend` byla znovu otevřena: počty vrcholů a trojúhelníků, rodiče, zdrojové ID, UV a odkazy na textury byly platné. Největší zaokrouhlení editovatelného vrcholu bylo 0,0152 mm. Po úpravě schodišť byl znovu otevřen samostatný B6; ostatních 120 `.blend` a GLB zůstalo byte-identických. Nový B6 má maximální zaokrouhlení 0,0019 mm.
- Aktuálně zkontrolováno všech 121 skutečných GLB: 190 863 trojúhelníků, žádný s nulovou plochou, konečné hodnoty a platné indexy, jediná vlastní source identita, žádné skryté transformace ani cizí budovy, správné SHA a velikosti. Největší odchylka bounds od zdroje je 0,013605 mm.
- Všech devět sdílených textur bylo kompletně dekódováno po pixelech pomocí Pillow.
- Původní rozdělení pěti hřišť změnilo 11 materiálových částí na 28, ale zachovalo přesně stejných 9 082 trojúhelníků se shodným kanonickým SHA i stejné kolizní pole. Nový severní kurt B6 přidává 3 samostatné části a 1 019 trojúhelníků mimo archiv budov; původních pět ploch se nepřesunulo.

Podrobné výsledky jsou v `building-export-audit.json`, `blender-reopen-audit.json`, `texture-decode-audit.json` a `geometry-equivalence.json`. NullEngine sloužil pouze ke kontrole struktury, nikoli jako důkaz GPU výkonu. Celou hru, ovládání a výkon ověřuje integrační předání projektu.

Aktualizovaná zapečená navigace má SHA 23 skutečných zdrojů, včetně shared terénu/TIN, dlažby, schodišť, vstupu a generátoru. Všech 18 cest k devíti severním vstupům zůstává dostupných. B6 v obou směrech od zastávek doroutuje na přesný mapový anchor a potom použije zdokumentované diagonální dlážděné body; nekrátí posledních šest metrů přes trávu. Interpretační spojka má vlastní ID oddělené od OSM way ID. Tento hash není kompletním otiskem celé hry ani důkazem všech proměnlivých překážek.

## Historická inkrementální oprava schodišť B6

Aktualizován byl pouze model OSM `53929071`: 55 290 trojúhelníků a 48 částí včetně 19 podlažních/materialových skupin schodišť. Archiv používá přímo `createB6StairMeshes` z klienta, stejné zdrojové vrcholy, uzavřené betonové spodní plochy a stejné UV a PBR styly. Sdílený foundation offset se přičítá právě jednou; audit porovnal všechny zdrojové stair ID a vrcholy s nulovou rozdílovou chybou. Fyzický zdroj má CCW winding, Babylon jej pro vykreslení převádí na CW. Export pro Blender/glTF převádí indexy zpět podle původních outward normals. Žádný vrchol, UV ani trojúhelníková plocha se tím neposouvá. Stejná konverze opravuje CW konvenci strukturálních boxů B6.

Fotografie B3 určuje pouze materiálovou typologii: šedé páskované podlahy, teraco, tmavé kovové balustry a dřevěné madlo. Půdorys B6 z wiki SH určuje dvě západní schodišťová jádra a mezipodesty; nemá rozměry ani severku. Odhadnuté jsou orientace v herní skořepině, šířka 2,4 m, dvojice deseti stoupání po 0,15 m, nášlap 0,35 m a tloušťka desky 0,24 m. Nejde o zaměřenou dokumentaci ani o potvrzení skutečných povrchů B6. PNG vzory jsou původní autorské pixely; fotografie nebyly zkopírovány do textur.

Metadata v `.blend`, GLB a source-planu uvádějí modelová podlaží `-1, 0, 1, 2, 3, 4, 5`, nula ložnic v modelovém suterénu a 35 ilustrativních ložnic na každém modelovém obytném podlaží. Počet se počítá z aktuálních `B6_ROOM_AREAS`; není to skutečný inventář koleje. `b6-partial-update-audit.json` obsahuje SHA všech 120 nezměněných archivů i jejich nezměněných zdrojových geometrií. `b6-blender-reopen-audit.json` dokládá skutečné znovuotevření nového B6. Neměnný IPR master byl zkontrolován proti svému původnímu SHA-256 `020eb74ce4b5068ceb9c5d7ff55ae9413e441fc582c088879940425123370ecf`.

## Podklady a hranice věrnosti

Poslední inkrementální export používá skutečně společnou `createB6BoxFaceParts`: dřívější archivační cesta stále vytvářela plné boxy, a vracela tak do GLB koplanární vnější slupku i texturu podlahy na strop. Nový audit kontroluje všech **3 976 kanonických boxových částí** právě jednou; maximální rozdíl jejich runtime/archive souřadnic je 3,55×10⁻¹⁵ m. Odstranění 24 obsažených zdvojených sloupků na mezipodestách zachovalo fyzickou sjednocenou plochu. Aktuální audit přesných neprůhledných překryvů hlásí nula duplicit; částečné překryvy tento audit netvrdí. Tato numerická shoda není přesnost stavebního zaměření. Doložené vnější sklo krytého vstupu se nyní přenáší i jako glTF `BLEND`, alpha 0,28; procedurální pokojové odrazy se nadále nevydávají za přenositelnou shodu shaderů.

Současný B6 zahrnuje krytý severní vstup, uzavřené boční příčky obou schodišťových jader, malé severní západní otvory, široký pás schodišťového výstupku a dvě střešní nástavby. Spodky nástaveb jsou osazeny na aktuální modelovou střechu při zachování jejich zdrojově odvozené relativní výšky. Foundation ani globální počet pokojových bayů se nemění. Poslední skutečné znovuotevření B6 `.blend` prošlo s 55 290 trojúhelníky a maximální odchylkou editovatelných vrcholů 0,001892 mm; log je `.cache/b6-final-reopen.log`. Ostatních 120 archivů je byte-identických; originální IPR master má stále původní SHA uvedené výše.

## Venkovní beton schodů B6

Celá hra při vizuální kontrole ukázala jednolité světlé stupně: runtime používal plain PBR bez map, který obecný `SurfacePack` nepřevádí, a sRGB barva byla vložena jako lineární faktor. Nová sdílená factory `createB6ExteriorConcreteMaterial` nahrazuje pouze tento materiál v runtime a archivu. Nepřidává vrstvu geometrie a nemění kolize, povrchy ani ostatní barvy domu.

Používá originální [ambientCG Concrete034](https://ambientcg.com/a/Concrete034), CC0: color v sRGB, NormalGL a roughness v lineárním prostoru. Oficiální přibližný repeat je 1,10 × 0,55 m; existující UV v metrech/1,28 se odpovídajícím faktorem přepočítají. Autorský tint `#b7b6ad` je převeden do lineárního faktoru `[0.481952237, 0.476177265, 0.425905286]`, roughness faktor 1, metallic 0, normal strength 0,27. Roughness je samostatná grayscale mapa; její modrý kanál v runtime nesmí vytvářet kov. Materiál je neprůhledný a má backface culling.

Jde o obecný CC0 beton s odstínem interpretovaným podle typologického snímku vstupu, nikoli zaměřený nebo naskenovaný povrch B6. Zdrojové fotografie se nepřenášejí do textur a jejich stíny se nepečou do albeda. Runtime environment/specular nastavení zůstávají popsanou shaderovou recepturou, nikoli zárukou shody cizího rendereru po pixelech.

Skutečný glTF export z Blenderu 5.2 vynechával Multiply tint; existující serializační krok nyní zapisuje pro explicitně označenou B6 recepturu kanonický `baseColorFactor`, roughness, metallic a normal strength. Obrazové ani vertex/index buffery tato oprava nemění. `b6-exterior-concrete-audit.json` kontroluje skutečný GLB: sRGB-to-linear tint, repeat, normal strength, opaque/culling a původní SHA color/NormalGL. Blender balí grayscale roughness do glTF green kanálu; původní JPEG zůstává nezměněn. `.blend` reopen navíc kontroluje skutečné Mapping, Multiply a NormalMap uzly. Poslední materiálové logy jsou `.cache/b6-material-{export,build,audit,reopen}.log`.

Půdorysy jsou odvozené z identifikovaných OSM objektů. Fasády vycházejí z podkladů v `shared/data/facade-reality.json`, včetně ČVUT exteriérů z 20. 6. 2024 a odkazovaných panoramat; typické vstupy z fotografií ELSA. Stadion využívá relation 1515034, jeho stavební části a dodané fotografie Vaníčkovy. Povrchy hřišť a plochá střecha se interpretují z IPR ortofota z 8. 6. 2024; fotografie Marketu je z června 2023. Fotografie se nepřebírají jako textury ani jako podklady pro spojený herní mesh.

Modely zůstávají interpretací, nikoli zaměřenou fotogrammetrickou rekonstrukcí. B1 má doložená tři podlaží, výška 9,6 m je interpretovaná. Výšky schodů, profil vstupů, rozteče oken a některé části stadionu nejsou zaměřené. Dveře Marketu / R-ka zůstávají neověřené a nebyly domyšlené. B6 interiér je schematický a neprokazuje skutečný inventář pokojů. Procedurální okenní odrazy, simulované noční obsazení a průhlednost B6 jsou runtime shaderové recepty; přenosný GLB archiv neprohlašuje jejich shodu po pixelech. Změny těchto nejistých detailů vyžadují další konkrétní podklad.

## Reprodukce

```powershell
pnpm exec tsx scripts/export-building-assets.ts
& 'C:/Program Files/Blender Foundation/Blender 5.2/blender.exe' --background --threads 2 --python scripts/create-building-assets.py
pnpm exec tsx scripts/audit-building-assets.ts
& 'C:/Program Files/Blender Foundation/Blender 5.2/blender.exe' --background --threads 2 --python scripts/audit-building-blender.py
```

Samostatné zdrojové archivy landmarků a hřišť se nadále vytvářejí jejich existujícími generátory. Také nyní uchovávají rooty a source identity jednotlivých objektů.

Pro aktualizaci jediného B6 bez regenerace ostatních modelů:

```powershell
pnpm exec tsx scripts/export-building-assets.ts --only 53929071
& 'C:/Program Files/Blender Foundation/Blender 5.2/blender.exe' --background --threads 2 --python scripts/create-building-assets.py -- --only 53929071
pnpm exec tsx scripts/audit-building-assets.ts
& 'C:/Program Files/Blender Foundation/Blender 5.2/blender.exe' --background --threads 2 --python scripts/audit-building-blender.py -- --only 53929071
pnpm exec tsx scripts/audit-b6-exterior-concrete.ts
```
