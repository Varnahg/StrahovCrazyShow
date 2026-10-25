# Terén Strahova — průzkum 25.10.2026

Výchozí commit ff13fa2b3b47363378ce55d34ed12eb5beec1ede, Babylon9.30.0. Linear [KEY-61](https://linear.app/gigeconomy/issue/KEY-61/teren-realistictejsi-travniky-puda-a-kvetiny-podle-strahova). Výzkum předchází zásahu do kódu. Uživatelský build2592/snapshot7637aac280069053bb76c5c67d79b83f04844405db72277f7be535bec777fee1 se nemění.

## Skutečné podklady a nejistota

- Uživatelské fotografie B6 přední/zadní, přijaty24.10.2026, datum expozice neznámé. Zůstávají mimo Git v původní soukromé cache. Přední: krátký nerovnoměrný trávník, ostré hrany chodníku, vegetace ve spárách zatravňovací dlažby. Zadní: nepravidelný nízký trávník, vyšlapaná světlá pěšina, řídké žluté květy. Přesný druh, počet, výška ani sezóna nejsou doložené.
- IPR ortofoto8.6.2024, původně10cm/px; zde uložený široký výřez asi0,249m/px, rozšíření0,469m/px. Vhodné pro hranice ploch, nikoli listy/květiny. [Metadata](https://gs-pub.praha.eu/imgs/rest/services/ort/letecke_snimkovani/ImageServer?f=pjson), [licence](https://geoportalpraha.cz/data-a-sluzby/otevrena-data), atribuce „datový podklad © IPR Praha“.
- [ČÚZK DMR5G](https://ags.cuzk.gov.cz/arcgis2/rest/services/dmr5g/ImageServer?f=pjson), [otevřená data](https://ags.cuzk.cz/opendata/): zde4m rastr s existujícími lokálními úpravami. Neměnit výšky jen na základě dojmu z fotografie.
- Archivované OSM cesty25920436/1021415594: skutečný tag dirt; hlavní lomená trasa(17.752,−89.067)→(32.324,−56.128)→(45.433,−22.654). Šířka1,4m je herní odhad. Tři centrální hřiště mají artificial_turf, východní tartan; zelená barva není důkaz přírodní trávy.
- [Zahrádky SH](https://wiki.sh.cvut.cz/klub/projekty/zahradky), aktualizace9.4.2026, a [výroční zpráva2024](https://wiki.sh.cvut.cz/_media/klub/projekty/vyrocni-zpravy/2024/vyrocni-zprava-2024-zahradky.pdf), Adam Beckert30.11.2024: doložená péče o trávník, půdu a oddělené cesty/záhony. Neopravňuje vymýšlet záhony po celé mapě.
- [Historické foto2008](https://commons.wikimedia.org/wiki/File:StrahovStudentDormitory.jpg), Adam Zivner CC BY-SA3.0: historické srovnání, nikoli současný inventář.

## Doložený mechanismus

`buildTerrain` používá měřený podklad + grading + CAD výřezy, `buildLandcover`130 OSM polygonů. B6 oblastX[−35,70],Z[−105,0] postrádá mapovaný přirozený trávník; klasifikátor vyžaduje explicitní plochu, takže blízké trsy nevznikají. Nejbližší západní OSM kontrola1059554109 je jinde. Doplnění konzervativních foto/ortho interpretovaných ploch musí zachovat výluky budov, ulic a hřišť.

`SurfacePack` převádí označené povrchy na PBR; Grass001 je procedurální generický CC0 materiál, ne Strahov sken ([asset](https://ambientcg.com/view?id=Grass001), [licence](https://docs.ambientcg.com/license/)). Opakování1,4m, jediná makrovariace16m ±10%. Aktivní půdní ani květinová rodina chybí. Štěrk není fotografická půda.

PhotographicGrass: dosahy6/9/12m, fade3,5/6/8m, rozpočty60k/140k/280k trojúhelníků. Tři LOD168/84/22 trojúhelníků,42/42/11 listů, obvykle3 draws. Projektovaná výška0,055m a hystereze32/26px,10/8px,far2px. Kořeny deterministické, až160/m², klasifikátor a půdorys±0,08m. Pět atlasů1024×512, dva PBR materiály alpha-test0,45, světlo/stíny přijímá, nové stíny nevrhá.

Cache1536 tiles/≤15MiB matic; oddělené2ms dávky výběru a generování, upload/commit/prune mimo tento tvrdý limit. Statický ustálený pohled neuploaduje instance každý snímek. Nové květiny vyžadují vlastní výšku/bounds, cache rozlišující materiálovou recepturu a zachované disposal/pending-load/préwarm.

## Porovnání variant

| Varianta | Vzhled/chování | Náklady a rozhodnutí |
|---|---|---|
| Jen barva/noise | Méně jednotvárné, stále chybí B6 trsy/půda/květiny | Levné, nedostatečné |
| Zdrojové pokrytí + společné světové pole + půdní vrstva | Souvislost podkladu/blízké trávy, přirozený okraj pěšiny | Zvolený první celek; malé textury a deterministické pole |
| Omezené květinové thin-instance LOD dávky | Řídký referenční detail, bohatší vyšší tiery | Zvolený navazující celek; společný rozpočet s trávou, žádný neomezený scatter |
| Prostorové thin-instance chunky | Pomůže větším vzdálenostem | Současný CPU culling již řeší jednotlivé kořeny; více draws/bufferů bez doloženého zisku |
| Běžné InstancedMesh / sloučené patche | Vhodné pro několik větších unikátních záhonů | Per-instance objekty nebo duplikovaná geometrie; pro hustý trávník nezvoleno |
| Celoplošný fotoatlas | Lokální geografie, ale zapečené stíny | Velká data, paměť, sezónní opravy; nezvoleno |
| Nové vlastní stíny trávy | Možné kontaktní detaily | Extra pass + wrapper se stejným větrem/alpha/fade, nejprve vyžaduje měření |

## Primární dokumentace enginu

[Thin instances](https://doc.babylonjs.com/features/featuresDeepDive/mesh/copies/thinInstances), [LOD](https://doc.babylonjs.com/features/featuresDeepDive/mesh/LOD/), [merge](https://doc.babylonjs.com/features/featuresDeepDive/mesh/mergeMeshes/), [průhlednost](https://doc.babylonjs.com/features/featuresDeepDive/materials/advanced/transparent_rendering).

Pin9.30: [thinInstanceMesh](https://github.com/BabylonJS/Babylon.js/blob/9.30.0/packages/dev/core/src/Meshes/thinInstanceMesh.pure.ts), [MaterialPluginBase](https://raw.githubusercontent.com/BabylonJS/Babylon.js/9.30.0/packages/dev/core/src/Materials/materialPluginBase.pure.ts), [ShadowDepthWrapper](https://raw.githubusercontent.com/BabylonJS/Babylon.js/9.30.0/packages/dev/core/src/Materials/shadowDepthWrapper.ts). Každá nová dávka stejné geometrie potřebuje izolované instance buffery (`makeGeometryUnique`), shader musí mít skutečné GLSL/WGSL větve. Alpha blend netřídí listy v jednotlivém thin batchi; alpha-test stále stojí overdraw/texturové vzorky. Nelze odvodit FPS jen z počtu trojúhelníků.

## Statická přejímka

Navržené whitelist guest počátky (X,Z) / cíl: rear(36,−64)/(29.24,−64), front(−14,−64)/(−13,−59), OSM(−103,−65)/(−100,−60), far(40,−75)/(28,−32). Čtecí klasifikace ověřena; fyzikální podpora a obraz ještě ne. Kamera a Actor začínají společně; samotné přesunutí kamery od hráče by zvětšilo výběr trávy a znehodnotilo měření. Žádné následné přesuny/inputy. Vyčkat ready, preparing=false, pendingTiles=0 a dokončené přechody. A/B stejné světlo, vítr, kvalita, CSS/interní rozlišení, HUD a GPU. MP režie odděleně, pokud nový detail není v záběru.

## Převzatá omezení

Terasa B6 má neuzavřený rozdíl zdrojů0,481m a36 středů sprch dosud není prakticky ověřeno. Nejde o vyřešené body této etapy. Stromy jsou další objednávaná etapa. C: téměř plné; pracovní kopie, cache a nové assety jsou na D: se stejným Git registrem. Hrané2592 zůstává neměnné.

## Volba konkrétních assetů a koncept

[Poly Haven brown_mud](https://polyhaven.com/a/brown_mud), fotografie Rob Tuytel, CC0, kategorie Bare Dirt & Soil. [API metadata](https://api.polyhaven.com/info/brown_mud) uvádí opakování1,299996m. Originální1K diffuse/normalGL/roughness dohromady1854550B. Vybráno jako generická fotografická půda, nikoli místní sken. Alternativní ambientCG Ground037 je vlhký zarostlý lesní povrch a typologicky méně vhodný. Hashy a skutečné dekódované rozměry budou v importním manifestu.

[Poly Haven dandelion_01](https://polyhaven.com/a/dandelion_01), Rico Cilliers/Rob Tuytel, [CC0](https://polyhaven.com/license). Celý katalogový asset64099tri; jeho bounding box4,214×0,258×0,170m není rozměr jedné rostliny. [API souborů](https://api.polyhaven.com/files/dandelion_01). Headless CPU inspekce zdroje potvrdila5 rostlin×4LOD; vybrat izolovanou zdrojovou hlavu/stonek/listy, nikoli instancovat celou rozestavěnou scénu. Originální1K mapy diffuse/alpha/normalGL/ARM mají1545343B. Celandine01 má1746764tri/Geometry Nodes a hustý půdopokryvný charakter, proto zde není vybrán. Konkrétní derivace má vlastní audit; druh na Strahově zůstává neověřený.

Imagegen vestavěným nástrojem vytvořil jediný syntetický koncept (ne texturu ani důkaz) s titulkem „KONCEPT – nikoli fotografie ani výsledek hry“. Soukromý pracovní výstup: `.cache/terrain-20261025/ground-concept-v1.png`, SHA256 `6e97d2af3876ebee4265c74b1aa794f4ae11db83d84b9c2b27b2fcfcfaef61cc`. Zadání: zachovat budovu/kameru/stromy a trasy z uživatelské zadní fotografie, navrhnout krátký nerovnoměrný sečený trávník, řídké žluté květy, roztřepený okraj stávající vyšlapané pěšiny a ostřejší hranu betonového chodníku; bez nových záhonů/stromů/budov. Koncept místy zesiluje suchost, proto není přesnou barevnou specifikací reference.

Původní front foto SHA256 `748bacdcf689e1ab8706ef9048505e85ef9acd71628c1e340e5a27cd0134366c`, rear `0a4837870bf3cce7e21ead36ce6ce4f4780562de150d39226a602f4df00e3841`. Neukládat je do Gitu.

## Vizuální opravy po prvním skutečném Edge snímku

### Mikrotranslace a stabilita výběru

Ve dvou v5 front HUD záznamech se za 314 s změnila pouze translace view matice: X o 35,682 mm, Y o −0,562 mm; rotace, projekce, FOV a rozlišení jsou stejné. Přesné porovnávání pohledu/focus v PhotographicGrass po dokončení výběru znovu invaliduje přípravu. Květiny mají obdobný gate. Zbytek 8/16 trojúhelníků pod minimálním LOD není nekonečná smyčka: cursor přeskočeného kandidáta postupuje. Záznamy neodhalují soukromou OR větev každého jednotlivého snímku; tuto hranici má ověřit cílená regrese.

Porovnáno: epsilon celé VP matice míchá rotaci a projekci; pevné centimetrové zaokrouhlení nezaručuje subpixelový pohyb; časový throttle nerozlišuje důležitost změny; projekce všech kořenů každý frame vrací zbytečnou práci. Zvolen je omezený cache gate pouze čisté translace, maximálně 2 mm a 0,25 interního pixelu vůči poslednímu přijatému snapshotu, s konzervativní hloubkou rostlinných bounds a guard bandem. Při přeskočení se reference neposouvá, takže kumulovaný skutečný pohyb nakonec aktualizaci vyvolá. Rotace/projekce/FOV/resolution/quality/budget zůstávají invalidátory. Kamera, fyzika a živé uniformy se nemrazí. Náklady: malý konstantní stav, žádné per-frame procházení všech rostlin. Vzhled a skutečné ukončení přípravy musí potvrdit testy a nový Edge snímek.

Výsledek: actual front controller test při 139994 trojúhelnících a konzervativní hloubce 1,833211916 m prošel 240 jitter snímků bez výběru/uploadu. Kumulovaný 20s creep 2,272721 mm vyvolal čtyři dokončené výběry; po zastavení se preparation i allocationDirty vyprázdnily. Původní 0,15s cadence pohybu/rotace a anti-starvation zůstaly. Review odhalilo a regrese uzavřela ztrátu budget události uvnitř intervalu. Finální 43/43 cílených testů a tsc PASS. V7 skutečný Edge front medium má preparing=false/pendingTiles=0/0 render chyb; 10s interval 39,5 FPS proti baseline 42,7 s nulovými B6 trsy. Jde o novou detailní scénu a jeden srovnávací interval, nikoli důkaz univerzální optimálnosti.

### Zbývající pruhy před B6

V5 front medium i repeat JPEG obsahují pravidelné vlnité pruhy v oblasti x≈410–870, y≈155–400 při 1280×720. Samotné snímky nerozlišují aliasing textury, překryv geometrie a shadow acne. Primární lokální zdroj ukazuje, že sloučený mapped landcover může podle výškové AABB vstoupit do shadow caster seznamu, zatímco podklad DMR5G má depthCaster:false. Hypotéza samostínování se ověří odděleně změnou pouze caster klasifikace; dosud není přijata jako prokázaná příčina.

Následný kauzální experiment v6: snapshot `704a009c40da68a3fb32262ae535cea742cd65caea1887ca4258a16f96542abd` obsahuje proti v5 pouze `shadowCaster:false` v merged landcover. Ustálený Edge/GTX1060 front/medium/day/clear snímek odstranil pruhy a zachoval stromový stín; fotografie v5/baseline mají shodný pevný pohled. Tím je pro tento artefakt potvrzeno samostínování overlay. Shader, UV, geometrie a shadow bias se neměnily. Actual mesh regrese prošla a zachovala geometrické hashy. Ponechána nejmenší oprava; v6 výkonový záznam nebyl přijat, protože root při buildu opomněl VITE_SOURCE_SNAPSHOT_ID (DOM hodnota null, bez zpětného přepisování). Identitu vizuálního experimentu váže vlastní freeze/build a client build `sha256-795a5…`; finální snapshot dostane správnou build-time identitu.

Uživatel odmítl pravidelný rastr trávy. Izolovaný průzkum doložil správné UV1,4m, ale ztrátu původní grass detail compression0,8→0,55 a saturation0,81 při nahrazení CampusSurfaceArt. Pouhé násobení noise8/1,7m periodu zdrojového materiálu neodstraní. Zvolená druhá fáze obnovuje původní sourceMean/detail/saturation pouze grass složky před smícháním, symetricky pro oba základní materiály.

Porovnané možnosti: obnovení útlumu nemá další texture fetch, ale ponechá periodu; jiný fotografický grass asset má stejnou cenu, ale sám netilování nezaručuje a Sparse Grass/Leafy Grass nejsou automaticky lepší shodou s B6. Vlastní dvouvzorkové posuny by měly asi12 místo6 fetchů a novou implementaci. Native HEX_TILING má18, TILE_RANDOMIZATION24 a VORONOI54 fetchů pro šest ground map. Nejde o naměřené GPU časy.

Vybrán existující Babylon9.30 HEX_TILING pro základní i přimíchané mapy přes stejnou TEXRD cestu. Parametry `[0,0,7,0.5]` znamenají nulovou rotaci (normálové XY se nemusí přetáčet), nulové luminanční vážení (barva/normal/roughness mají shodné prostorové váhy), exponent7 a neutrální gain0,5. Gain0 by neutrální nebyl. Nové sampler sloty nepřibývají; původní pixely a metrické UV se nemění. Cena18 místo6 fetchů je přiznaná a čeká na cílové měření na GTX1060. [Připnutý kernel](https://github.com/BabylonJS/Babylon.js/blob/9.30.0/packages/dev/core/src/Shaders/ShadersInclude/textureRepetitionFunctions.fx).

Samostatná skutečná regrese: spodní concrete:plates chodník OSM25920437 zčernal, přestože jeho textury, původní manifest, raw streets a core patch měly stejné SHA jako baseline. GroundCover a CampusSurfaceArt dědily stejné getClassName=MaterialPluginBase; Babylon registruje MATERIALPLUGIN define podle třídy a WebGL Effect cache nezahrnuje customCode/samplery. Kolize může interpretovat paving UBO jako ground a dát barevný faktor−1,888. Skutečná CPU cache fixture reprodukovala obě pořadí a potvrdila opravu unikátní class identity, i při repetition0 na obou materiálech.

Kauzální GPU důkaz: frozen candidate-v3/snapshot50bac31694491a592f3c87c08b2e44992371b58a636602984ac4fe320468076f obsahuje proti v2 pouze getClassName override. Ve stejném Edge/GTX1060 rear/low/day/clear pohledu se spodní šedá dlažba vrátila bez změny textur nebo geometrie. Tento snímek není důkaz odstranění tilingu; antitiling je až další checkpoint.
