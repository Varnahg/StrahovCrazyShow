# B1 a B6: přenos fotogrammetrického vzhledu

Pracovní podklad 24. 10. 2026. Výsledek je odvozený vzhled na konstrukční CAD geometrii. Původní fotogrammetrický mesh se nestává viditelným překryvem budovy ani náhradním colliderem. Původní snímky pocházejí z léta 2023, půdorysy jsou historické: ani nízké reziduum registrace nedokazuje současný skutečný stav nebo výšku vnitřní podlahy.

## Primární zdroje a souřadnice

- IPR Praha, fotogrammetrie Praha 2023, licence CC BY, atribuce „datový podklad © IPR Praha“. Identita služby a položky je zachovaná v `shared/data/photogrammetry.json` a odvozeném `shared/data/cad-buildings/photo-alignment.json`.
- Manifest SHA-256 `d556d38d5c32d9d039479e492d7937e2c358df90cf94f7aee232f5e1ba330d93`; původní L16 listy mají každý SHA binární geometrie i JPEG atlasu. Před použitím se porovnávají skutečné bajty. Vyšší LOD rodiče se nepřimíchávají.
- Master `assets/blender/photogrammetry/strahov-ipr2023-master.blend`, 233 080 977 B, deklarovaný SHA z LFS/importního auditu `020eb74ce4b5068ceb9c5d7ff55ae9413e441fc582c088879940425123370ecf`. Primary-main má skutečný soubor; pracovní kopie CAD při tomto průzkumu jen 134B LFS pointer. Master nebyl otevřen, znovu hashován ani přepsán. Importní audit a `scripts/import-photogrammetry-blender.py` dokazují původní trojúhelníky/UV bez decimace; projekce čte přímo dostupné, individuálně hashované I3S/JPEG listy.
- I3S center je EPSG:3857, vertikální Bpv. Game `X=(centerX-originX)*factor+localX*localFactor`, `Y=centerZ-326.392+localZ`, `Z=−(centerY-originY)*factor−localY*localFactor`. V aktuálním manifestu `factor=localFactor=0.6417086829273079`. Výška se horizontálním faktorem nenásobí. Origin Mercator je `[1602082.281624095,6460254.733152758]`.
- Původní I3S `(u,v)` adresuje JPEG shora; master Blender UVMap používá `(u,1-v)`. Nový atlas má vlastní rovinné souřadnice a PNG řádky shora, Blender UV zůstává zdola. Regrese kontroluje orientaci barevným čtyřrohovým obrazem.

## Registrace bez škálování

`photo_projection.py` poskytuje rigidní dopředný/inverzní transform se stejnou znaménkovou konvencí jako Babylon, vážený fit z bodových dvojic a robustní fit ze **zadaných odpovídajících foto rovin**. Neprovádí automatické nearest-neighbour ICP, které by mohlo přitáhnout CAD k vnitřní stěně, vegetaci či sousední budově. Fit rovin vyžaduje plnou hodnost čtyř parametrů; samotná střecha nestačí k určení XY a yaw. Škála je vždy 1.

| Budova | Výchozí vazba | Foto kandidát `translation[X,Y,Z]`, yaw | Rezidua |
| --- | --- | --- | --- |
| B1, CAD origin `[250,731]`, OSM 53929063 | OSM fit `[-86.9071,4.2,77.6795]`, yaw −3.119232, RMS přibližně 1,4 m | `[-86.806769185171,4.219841912814184,77.74954203422622]`, yaw −3.1251629196638517 | plane RMS 0,7156 m; median absolutní 0,2771 m |
| B6, CAD origin `[35,8]`, OSM 53929071 | Skutečný N07 obrys entity 1036, 1 163,2651 m²; obousměrný OSM perimeter RMS 0,1091 m | `[6.702656726398903,0.6962777093118497,-55.04815187265829]`, yaw −3.1233667855768164 | plane RMS 0,2008 m; median absolutní 0,0621 m |

B1 kontroluje 30 původních L16 listů (43 924 trojúhelníků), B6 24 listů (24 187 trojúhelníků). Malé numerické sondy nekonstruují novou scénu. Kompletní použité kontroly, váhy a rezidua jsou v ignorované cache `photogrammetry/b01-registration-candidate.json` a `b06-registration-candidate.json`; bez CAD kopií v Gitu.

B1 má podstatný konstrukční nesoulad: mediány fotografických čel v původním lokálním rámci leží přibližně na Z −33,65/+33,86 proti CAD −32,30/+32,97. Rigidní transform neopraví oba konce najednou. Podélné foto fasády mají přibližně X −8,39/+8,37 proti CAD −8,043/+8,141. Foto čela jsou proto z počáteční projekce záměrně vynechaná. Další změna konstrukce nesmí být skrytá škálováním ani obrázkem.

B6 orientaci o 180° rozlišuje skutečný CAD vstup u `[12.93,-3.45]` na severozápadní přístavbě: při dohodnutém převodu os musí být yaw blízko π. West head 601/A3 u vstupu je severní nástavba, east head 602/9A vzdálenější jižní. Původní foto horizontální plochy mají:

- Hlavní střecha přibližně gameY 18,7304; velká plocha 956,67 m² v pásu 18,45–19,0 m.
- Vstupní přístavba: 31,74 m² v pásu gameY 18,75, tedy stejná hlavní střešní úroveň; původní pracovní annexRoof 16,5 m nad lokálním počátkem neměla tuto primární oporu.
- Severní west head: vážené gameY 22,1396, přibližně XZ `[4.2543,-79.2983]`, 17,11 m²; výběrový interval 22,066–22,204 m.
- Jižní east head: gameY 21,2269, XZ `[11.8358,-27.2766]`, 29,88 m²; interval 21,169–21,252 m.

Rozdíl nástaveb asi 0,91 m je podpořen primárními plochami. Poloha jejich fotografického středu není automaticky střed vnitřní CAD místnosti. Současné modelové head výšky 21,41/20,50 a origin kolem 0,70 m mají několika centimetrový rozdíl hluboko pod nejistotou fotogrammetrické interpretace. Žádná z uvedených hodnot sama nepotvrzuje podlahu recepční mezipodesty nebo přístupové schody. World placement zůstává kandidátem k overlay/render a vstupní přejímce koordinátorem.

Konkrétní kontrola po tomto pose: westHead CAD room center se promítá do `[4.2393,22.1063,-79.1985]`, foto střed je `[4.2543,22.1396,-79.2983]`. EastHead CAD room center se však promítá do `[11.1183,21.1963,-31.0504]`, zatímco foto střed je `[11.8358,21.2269,-27.2766]`: výšková shoda neodstraňuje přibližně 3,84m půdorysný rozdíl. Foto nástavba má větší plochu; historické rozšíření je pouze možnost, ne doložený závěr. Nevylepšuje se to posunem celé budovy ani přesunutím CAD místnosti pro získání textury.

Predikovaný B6 stair-top CAD `[11.567763,-3.453880]` leží na world XZ `[-5.17637,-78.26775]`, pracovní mezz podlaha Y 2,1963. V tomto místě IPR ukazuje velkou vodorovnou plochu Y 4,42–4,49, pokračující i nad dolním ramenem. Její poloha odpovídá spíše zastřešení vstupu; bez bočního renderu není důkazem podesty. U dolního CAD konce XZ `[-5.63817,-81.53528]` jsou navíc terénní plochy Y 0,03–0,32. Horní ray hit se proto nesmí vydávat za výšku schodiště.

Podrobná cache `b06-entry-ground.json` má svislé průsečíky na šířce 3,86 m a v pásech 0/0,2/0,4/0,6/0,8 m zpět od spodní CAD hrany. Hladší přístupová plocha (normalY > 0,92, nejméně 0,2 m před hranou) dává 16 platných bodů: `worldY=−0.0354969905*X+0.1269273737*Z+10.2076936487`, RMS rezidua 0,00791 m, rozsah −0,01099 až +0,02469 m. Cache-only `b06-approach-patch-proposal.json` omezuje tuto rovinu na jediný polygon 0,979 m² odvozený ze skutečných IPR trojúhelníků 1127471:275/417/441/739 a interpolační oblasti platných vzorků; jeho rohové reziduum je −0,01228 až +0,02469 m. Tyto centimetry jsou lokální shoda přibližné foto roviny, nikoli geodetická přesnost. U samotné dolní hrany scan už mísí první stupně/rampu a ukazuje Y 0,19–0,35; celá šířka není doložená. Žádná navržená herní grade ani změna venkovního riseru se tímto podúkolem nepublikuje.

Venkovní B6 panel WEAK1072/1073 u CAD X 2,094–2,469, Y 16,724–19,714 má v IPR nízkou horní plochu: 1127456:189 a :1127, world centra `[15.5931,-0.3377,-87.9193]` a `[16.3679,-0.3793,-87.7716]`, vrcholy Y −0,441 až −0,316, normálaY 0,992–0,997. Boky :810/:1204 klesají přibližně do Y −0,846. Vyšší plochy jsou až u vlastní fasády, ne po délce panelu. Plná 3m stěna nad N01 zde nemá oporu v primárním meshi; přesnou funkci opěrné/boční konstrukce je nutné rozlišit texturovaným detailem. Důkazy jsou v `b06-exterior-panel-source.json`, nikoli v nové geometrii.

## Volba přenosu a rozsah

| Varianta | Důvod volby nebo odmítnutí |
| --- | --- |
| Překryv původním skenem | Zakryl by průchozí otvory, obsahuje okolí/vegetaci a není totožný s konstrukčními kolizemi. Nepoužívá se. |
| Neomezené selected-to-active/nearness pečení celé budovy | Může promítnout fasádu do vnitřní stěny nebo do ostění za oknem. Nepoužívá se. |
| Přiřadit celé původní JPEG atlasy | Zaneslo by nepotřebné zdrojové snímky a neřešilo nesoulad CAD geometrie. Nepoužívá se. |
| Explicitní vnější rovinné patch masky, orientace a omezený první ray hit | Zvoleno. Vnější díly jsou identifikované part ID, rovinou, obdélníkovým rozsahem a normálou. Všechny skutečné polygony/otvory zůstávají. |

`eligible_face` přijme jen celý polygon na konkrétní vnější rovině s odpovídající normálou a rolí. Wall a slab mohou uvnitř jednoho objektu obsahovat interiéry: samotná role k přijetí nestačí. Sklo, rámy, dveře, vnitřní stěny a ostění s jinou normálou nepřijme. Target texel maska rasterizuje skutečné vybrané trojúhelníky, takže obrázek nevytváří povrch v otvoru. Každý patch může mít také seznam povolených původních `tile:triangle` ID. V aktuální počáteční konfiguraci identitu zdrojových ploch vymezuje blízkost, normála a konkrétní primární fasádní/střešní oblast; samotná tato geometrická podmínka není automatickou sémantickou klasifikací vegetace. Vyžaduje obrazovou přejímku.

Aktuální lokální cage paprsek začíná 0,45 m před cílovou CAD plochou a směřuje podél její záporné normály nejvýše 0,90 m. Posuzuje se **první** zdrojový hit v tomto okolí; nevyhovující hit se nepřeskakuje hledáním jiného za ním. Vzdálenost od CAD bodu musí být nejvýše 0,45 m a dot normál nejméně 0,94. To není globální test viditelnosti z kamery nebo z jiného křídla. Jiný strom dále před fasádou sám o sobě nevyvrací legitimní původní foto texturu zachycenou z jiné polohy. Další maska zdroje/occluderu se přidává podle konkrétního obrazového nálezu, ne automaticky podle hypotetické viditelnosti z libovolného bodu.

Počáteční B1 návrh má šest hlavních podélných fasádních patchů N01/N02/N03 a tři střešní úrovně main/wing/head. B6 má připravený skutečný N07 main+annex roof patch; rozšíření fasád potřebuje hotový nativní B6 model a jeho konkrétní vnější roviny. Nezjištěné povrchy si ponechávají autorský materiál.

Po zpřístupnění plné B6 recipe vznikl oddělený cache návrh `photogrammetry/b06-patch-proposal.json`: 23 vnějších podélných wall plane patchů N01–N06 a tři konkrétní N07 roof slabs. Každá fasádní rovina je odvozená z orientovaných hran připravených stěnových solidů; návrh obsahuje jejich ID, extrudovanou plochu a X/Z/Y rozsah. Nepoužívá výšku ani přesah střechy k odhadu fasádní roviny. Native B6 selection, jeho SHA a vizuální shoda zůstávají další kontrolou. Sdílená B1 konfigurace se během nativního auditu nemění; původní přesné bajty SHA `1d42e312aa5cd2ecf342b5370aeeae07bacac5da68c91abbc781058cde7fdc09` jsou archivované jako `photogrammetry/photo-alignment-b01-p4b.json`.

## Materiálový, auditní a provozní kontrakt

`photogrammetry_bake.py` spouští pouze koordinátor v heavy-validation rezervaci, nad novým cache výstupem. Je to CPU ray projekce přes Blender BVH, ne Cycles/GPU ani načtení celé primární scény. Používá jen původní L16 source data pro danou budovu. Zdrojové JPEG image datablocks se po dekódování odstraní; scan mesh objekty vůbec nevznikají.

Každý přijatý patch vytvoří kopii původního Principled materiálu pro příslušné vybrané polygony. Ostatní polygony ponechají původní slot. Změní se pouze vybrané loop UV v existujícím aktivním `UVMap`/TEXCOORD_0 a jejich BaseColor texture. Shader má jediný direct TexImage.Color → Principled.BaseColor link; UVMap node přímo vede do texture Vector bez transformu. Roughness, Metallic, Alpha a ostatní Principled vstupy zůstávají původní. Neaplikuje se generativní doplnění, ztmavení, displacement, retuš ani vymyšlená normal mapa.

Nedoložené texely zachovají původní solid BaseColor, standardně převedenou linear→sRGB. Foto data zachovají původní zachycené osvětlení; nejsou označena za fyzikálně oddělené albedo. PBR dosvícení může ovlivnit vzhled, proto se posuzuje v reálné scéně. JPEG pro CPU dekódování má Non-Color, odvozený bezztrátový PNG je označený sRGB. Přesný vztah Blender pixel bufferu a původního byte128 se navíc ověřuje nativní sondou koordinátora.

Po konkrétním 16px/m čelním srovnání se potvrdily ostré trojúhelníkové přechody accepted photo → solid fallback na meziokenních panelech. Cílená volba `--feather-metres 0.15` proto zavádí pouze váhu důvěry v úzkém **accepted** okraji. Default 0 zachovává původní baseline PNG. Vzdálenost se šíří po target masku osmi sousedy v metrických rozměrech texelu, diagonálně jen pokud existují oba ortogonální target sousedé. Hole/non-target pixel není rejected seed ani průchod; jiné oddělené komponenty neovlivní. Odmítnuté texely zůstávají přesně původní fallback a validní core mimo pás přesně původní photo bytes. Jen accepted pás do 0,15 m se míchá s původní barvou v lineárním světle. Masky, coverage, reach, geometrie a ostatní PBR vlastnosti se nemění. Parametr a jeho význam jsou v report/root `transferOptions` a `featherMetres` image/material metadatech; odvozený atlas nepředstírá nezměněnou kopii fotografie.

Image i material mají `provenance='IPR2023-derived'`, `photoPatchId`, `sourceManifestSha256`, `sourceIds`, `sourceHashes`, `sourceCapture`. Image má `imageSha256` skutečných packed PNG bytes, `pack()` a prázdnou filepath. Kopie raw foto atlasů se do Gitu nepřidávají. Root custom property obsahuje jen JSON provenienci odvození. Native master zůstává editovatelný, textura není závislá na externím souboru.

Před a po přenosu se porovnává digest všech vertex positions, polygonů, corner normals, object transforms a building/floor/role/collision metadat. Následný root audit musí navíc porovnat native material podle polygon.material_index, všechny orientované trojúhelníky a UV proti GLB, embedded image bytes a PBR stav. Úspěšný malý syntetický test není důkaz skutečného Blender/GLB exportu nebo výkonu hry.

Počáteční omezený běh má 4 px/m a max dimension 512; po vizuální přejímce lze zvýšit rozlišení. Default driveru je 16 px/m, max 2048, což je výrobní nastavení, nikoli změřená optimálnost. Zdrojová obrazová rozlišitelnost a fotografie ve stínu se tím nezlepší. Driver nepublikuje žádný finální asset, neexportuje kolize a nikdy nepřepíše vstupní `.blend` ani existující kandidátní output.

## Ověření a zbývající přejímka

`py -3.14 -B scripts/cad-buildings/test_photo_projection.py -v`: 15 malých CPU regresí PASS. Pokrývají metrické osy, původní UV, rigidní fit bez škály, degenerované fit kontroly, čtyřparametrový plane fit, ray barycentriku včetně Blender float32 tolerance, explicitní fasádní masku, odmítnutí první nevyhovující plochy, otvory target rasteru, byteově přesný sRGB PNG a absolutní CLI cesty před otevřením `.blend`. Tři confidence-edge regrese navíc dokazují neměnné vstupní masky, byteově shodný zero baseline/core/fallback, fyzický limit, nepřekračování otvorů/diagonálně sousedních komponent a známou lineární směs černé/bílé → sRGB188.

První root nativní probe `b01-texture-build/probe-p4/` skončil exit1: Blender interpretoval relativní cestu k právě vytvořenému PNG vzhledem k otevřenému masteru. Zdroj ani model nebyly přepsané. Oprava normalizuje všech pět CLI cest před `open_mainfile` a každé `bpy.data.images.load` dostane absolutní cestu; původní log je zachovaný.

Opakovaný root `probe-p4b/` v Blender 5.2.2 LTS skončil exit0: osm packed atlasů, shodný před/po geometry digest. Pokrytí dvojic hlavních fasád N01/N02/N03 bylo 0,788/0,878; 0,751/0,792; 0,628/0,582. Main roof 0,899, wing roofs 0,753. Head roof 0,571 zůstalo pod zadaným minimem 0,6, proto se jeho materiál nezměnil. Root odděleně porovnal PNG i JPEG128: PIL a Blender Non-Color vrátily shodně `[128,128,128]`, PASS (`b01-texture-build/color-probe/result.json`). Rozlišení 4 px/m je diagnostické, nikoli konečný vizuální výstup.

Root následně potvrdil p4b nativní exportní audit včetně packed PNG bytes, PBR a UV (83 nativních částí, 50 kolizních částí). Skutečný GLB načetl Babylon NullEngine: 91 primitive meshes, 19 materials, 9 textures. Rozdělení objektu na více material primitives je očekávané; NullEngine není GPU test. Candidate SHA `a2dca487e9f66c1f964c7bb509d62fd8e93645d43996fca132ad5e6a39d1451a`, shodný před/po geometry digest `942f002a52f525e7b07895b9acb559d17c419245e207f0e4c98b13cb20527655`.

Celkový p4b render neukázal zjevně přenesenou zelenou vegetaci ani zakrytí otvorů skenem. Nízké rozlišení a historické stíny na střeše jsou viditelné. Na podélné fasádě jsou drobné světlé fragmenty poblíž rámů; z celkového záběru nelze spolehlivě odlišit aliasing/fallback od skutečné nesouososti foto rámu a CAD. Pro konkrétní přejímku vznikl cache-only `compare-b01.py`: dvě emise/BaseColor zobrazení se shodnou světovou kamerou nad přibližně šesti okny a dvěma patry. Neukládá `.blend`; root jej spouští v rezervaci. Výsledek srovnání a konečný 16px/m bake zatím nejsou tímto dokumentem označené jako PASS.

Root skutečně spustil `candidate-p16/compare/`; oba obrazy byly prohlédnuté. Zdroj je sám silně rozmazaný a zvýšení vzorkování nevytváří nové skutečné detaily. Prokázané ostré trojúhelníkové přechody vedly k výše popsané úzké confidence-edge opravě. Jediný root `candidate-p16-feather/` bake i následný comparison skončily exit0. Koordinátor po prohlédnutí stejného čelního detailu přijal 0,15m variantu: zřetelně zmírňuje zubaté a trojúhelníkové přechody, bez zásahu do rámů, otvorů nebo geometrie. Není to tvrzení přesného fotorealistického detailu.

Čtecí kontrola skutečných before/after reportů a PNG je v `photogrammetry/feather-native-pixel-check.json`: shodné target/accepted texely, target faces, source IDs, rejection counts, coverage, alignment SHA i geometry digest. U všech osmi atlasů počet skutečně změněných PNG pixelů nepřekročil evidované feather texely (např. N02 negative 1 932/2 202, main roof 10 693/10 711). Tento nativní doplněk neslibuje více než kontrolované počty; přesnou neměnnost core/fallback a maskové oddělení dokazují výše uvedené analytické fixture. Vizuální přijetí je samostatný důkaz.

Konečný předaný B1 kandidát pro následující root export je `b01-texture-build/candidate-p16-feather/b01-photo.blend`. Koordinátor nyní provede jeho finální packed PNG/UV exportní audit, aktualizaci assetu/site/placement a skutečné herní ověření. B6 vyžaduje přijatý vlastní nativní model, vazbu jeho SHA, převzetí 26-patch návrhu a samostatnou přejímku vstupů. Tyto zbývající kroky zde nejsou předčasně označené jako PASS.

## Finální masters B1 a B6

Koordinátor publikoval B1 osm atlasů a B6 R4 dvacet jedna atlasů z 28 kandidátních ploch. Oba exporty prošly packed PNG/UV/PBR auditem a mají shodný geometry digest před/po projekci. Přesné identity, usazení, přijaté plochy a omezení jsou v [B1](b01/README.md) a [B6](b06/README.md). Původní předávací text výše popisuje tehdejší kandidáty, nikoli nynější stav. B6 používá samostatně doloženou terasu a kryt vstupu; zamítnuté plochy mají původní materiál. Rozlišení 16 px/m nevytváří detail, který ve zdroji chybí. Fotogrammetrie nemění kolize ani nezakrývá interiéry skenovou geometrií.
