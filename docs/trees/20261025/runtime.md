# Stromový runtime · rozhodnutí před implementací

Task `trees-20261025-runtime`, owner `trees-loader-01a16b37`, baseline `8516c7b1`. Materiálový checkpoint zůstává neměnný. Root vlastní Game/UI/UTC/litter, modelář geometry-only GLB a autor season-rendering vlastní season geometry/material/wind.

## Zjištěný řetězec a varianty

Původní `VegetationController` míchá grass/landcover a stromový bootstrap/detail/cache. Bootstrap fetch/import nemá jednotný abort owner; detail decode nevylučuje všechny neplatné offsety/typy a částečně vytvořené primitivy mohou přežít pozdější chybu. Limit 32 cache záznamů je měkký, protože aktivní/desirable LOD nelze vyřadit. Jde o mechanismy z čtení kódu, nikoli o tvrzení pozorované havárie GPU.

Porovnáno zachování jedné třídy, pouze nový alternativní loader a vyjmutí společného lifecycle. Zvolen `TreeRenderer` jako jediný vlastník stromových roots/LOD/season a `TreeAssetLoader` jako vlastník fetchů/validace. Grass/landcover zůstane ve VegetationController. Původní v1 manifest/chunks a plné listí při nepřítomné season zůstanou podporované; veřejné decode/attach reexporty se zachovají.

Nový v2 geometry-only GLB je úzký dohodnutý kontrakt, proto jej lze celý validovat a dekódovat před Babylon mesh alokací bez obecného glTF importeru a bez načítání embedded materiálů. To zmenšuje partial-import a abort prostor. Legacy bootstrap stále používá skutečný Babylon glTF loader kvůli původním vloženým materiálům, ale s vlastním loaderem a evidencí vytvořených prostředků; nepoužije se globální diff scény, který by mohl uklidit cizí souběžné assety. Čtená primární implementace: Babylon9.30 `glTFFileLoader.pure.js` loadAssetContainerAsync/onMeshLoaded/onMaterialLoaded/onTextureLoaded a sceneLoader.js.

## Dohoda sousedních tasků

- Modelář potvrdil `version:2`, `units:'metres'`, `rankEncoding:'uint16-normalized'`, `prototypes` keyed podle ID, 3 `lods` s URL/bytes/SHA/meshNames a `placements` s existujícím sourceTreeId/sourceRootXZ/prototypeCandidates/selectedPrototypeId:null. Každý GLB obsahuje všechny3LOD. Node extras: role wood/foliage, materialKey Bark012/LeafSet024/fir_tree_01, lod, archetypeId, sourceTreeId. Geometrie je root-local Y-up. Ranky se rozprostírají do1..65534 a zachovávají meziLOD.
- `TreeSeasonGeometryPlan` vlastní jednou seřazené indices; `applyTreeSeasonGeometry` nastavuje vlastní submesh rozsah a plné bounds, nic neuploaduje ani neenable. Shared geometry Mesh klony mají vlastní submeshe. `TreeSeasonMaterialPlugin` čte per-mesh stav; material.alpha=1 a hasVertexAlpha=false. Nové lokální normály mají `treeNormalSource='authored-local'` a neprocházejí crown proxy.
- Root potvrdil `VegetationInput.season?:TreeSeasonState` a explicitní options `treePilot:{manifestUrl,selections}`. Žádná libovolná URL z dotazu, žádná automatická volba own/MTree a žádné domyšlené URL výsledného katalogu. Pilot nahradí jen vybraná existujícíID; ostatní stromové identity zůstanou legacy. Celkový bootstrap tím zatím neklesá. Pokud pozdější explicitní katalog pokryje všechnaID, legacy bootstrap lze vynechat.

## Ověření

Následují cílené CPU regrese celého vstupu, abort/partial import, coalescing, cache, late-season/LOD a původního placement/grass chování. Žádný Blender, GPU, server, build ani celá sada v tomto tasku. Skutečný obraz/výkon a společný nový source checkpoint přebírá root.

## Implementovaný kontrakt a omezení

`loadVegetation(scene, { treePilot: { manifestUrl, selections } })` je explicitní aplikační vstup. Bez `treePilot` zůstává původní v1 bootstrap a streamované detaily. `selections` mapuje existující `sourceTreeId` na kandidátní prototype ID; samotné `selectedPrototypeId: null` v katalogu nic automaticky nevybírá. Kořen a poloměr kmene se kontrolují proti shared katalogu s tolerancí 1 mm. Runtime nepřepočítává rozměry prototypu a nepřidává kolize.

`VegetationInput.season` přebírá hotový stav ze společného explicitního UTC okamžiku. Nepřítomnost znamená původní plné listí. U v2 se jednou vytvoří seřazený index buffer a následně mění pouze `SubMesh.indexCount`; každá celá leaf/twig komponenta má rank 1–65534. Změna sezóny se uplatní i uvnitř 0,15s LOD cadence a před zapnutím jakéhokoli pozdě načteného meshe. Nulové listí znamená indexCount 0 a disabled foliage, dřevo zůstává. Staré v1 nemá rank kanál: explicitní zima je skryje a materiál se může tónovat, ale plynulý geometrický opad v1 není implementovaný. `legacyTreeInstances` a `rankEnabledTreeInstances` tento rozdíl zveřejňují.

Původní bootstrap používá vlastní instanci Babylon glTF loaderu s evidencí mesh/material/texture ownership; chyba uklízí jen jeho zdroje. Vstupní GLB nemůže odkazovat na další síťové obrázky/buffery nebo rozšíření. Pilotní geometry-only data procházejí úplnou kontrolou všech LOD, attribute bounds, konečnosti, indexů, node extras a ranků před mesh alokací. Data map se fetchují s týmž abort vlastníkem a do Texture se předává již stažený buffer. Chyba jedné mapy počká na vypořádání sourozenců a uklidí částečný materiálový výsledek.

Nové mapy jsou sdílené mezi LOD a používají původní pixely. Barva je sRGB, normal/roughness/opacity jsou linear. Opacita je luminance samostatné zdrojové PNG; COLOR_0.a není průhlednost. PBR alpha zůstává 1, vertexAlpha false, alphatest 0,5. Nové lokální normály zůstávají zachované, mají two-sided lighting a glTF OpenGL normal-map konvenci pro pravotočivou scénu. Translucence se tónuje z albeda bez druhé původní zelené mapy. Před season bindem se mesh bounds zvětší o 0,1 m v XZ pro vítr; změna kořene padding obnoví.

## Rozpočty a význam metrik

- Legacy detail cache má tvrdý limit 32 položek a 64 MiB. Před fetch se rezervuje dvojnásobek velikosti chunku jako horní mez pro zdrojový buffer a odvozené normály. Aktivní/požadované LOD se nevyhazují; pokud není prostor, zůstane vzdálenější dostupné LOD. Nejvýše dva detail requesty běží souběžně.
- Pilotní součet zdrojových GLB je omezený 96 MiB. Dřívější návrh 64 MiB by odmítl skutečnou druhou own dvojici: broadleaf 55 612 472 B + conifer 30 760 460 B = 86 372 932 B. Zvýšení je přijetí vstupu do pilotního měření, nikoli doklad přijatelného výkonu GTX1060.
- `treeDetailCacheBytes` je konzervativní CPU součet zdrojových chunků a případných odvozených foliage normals; `treeDetailReservedBytes` jsou ještě nevyrovnané rezervace. `treePilotSourceBytes` je součet současných binárních vstupů; `treePilotGeometryBytes` jsou délky finálních vertex/index atributů; `treePilotSeasonBytes` jsou vlastní index/rank/prefix buffery helperu. Tyto tři metriky se částečně překrývají a nesmějí se bez rozlišení sčítat jako GPU VRAM.
- `treeTextureSourceBytes` měří samostatné nové zdrojové mapy, nikoli nekomprimovanou GPU paměť. Původní Bark012 se v částečném pilotu sdílí z legacy bootstrapu. `treeFetchedBytes`/`treeFetchRequests` jsou kumulativní dokončené těla/začaté requesty; `pendingTreeLoads` nezapočítává stejný detail job a jeho fetch dvakrát.
- Coalescing slučuje pouze identické rozpracované URL + SHA + bytes. Úspěšné buffery loader nedrží ve druhé neomezené cache. Renderer stále vlastní načtené geometry atributy. Celková VRAM, GPU upload náklady, p95/p99 a vizuální přejímka z těchto CPU kontrol neplynou.

Dnešní dvě pilotní identity ponechávají legacy bootstrap 76 500 488 B. Vynechá se pouze při explicitní kompletní náhradě všech shared ID, která zároveň projde stejným vstupním limitem. Aktuální katalog všechna ID nenahrazuje. Každý pilotní zdroj má samostatné geometry a root; sdílený je materiál/texture pool. Nepoužívá se škálování jednoho kmene na různě velké koruny ani nový strom na stejném místě.

## CPU checkpoint 2026-10-25

33/33 cílených kontrol PASS, žádné skipy; příkaz a původní výstup jsou v `.cache/trees-runtime-20261025/targeted-final-v2.log`. Zahrnují skutečné všechny čtyři aktuální GLB, původní byte-exact LOD chunk regrese, actual B6 root/bounds, starou grass populaci/budgets, neplatný poslední LOD, integrity/cap/abort/coalescing, částečný Babylon import, zachování cizích zdrojů, PBR factory a pozdní zimu/LOD/obnovu plného listí. Season helper kontroly navíc ověřují skutečné draw index počty přes NullEngine; jde o CPU lifecycle důkaz, ne obraz ani rychlost GPU. `node node_modules/typescript/bin/tsc --noEmit --pretty false` skončil exit 0; `.cache/trees-runtime-20261025/tsc-final-v2.log` je bez diagnostik.

Zmrazená vlastní dvojice a přesný přijatý kontrakt jsou v `.cache/trees-runtime-20261025/inputs/own-v2/snapshot.json`. Modelář může dále upravit MTree kandidáty; případný pozdější export vyžaduje zopakovat actual asset test nad novým hashem. Kandidátní prototypy nebyly označeny za vizuálně přijaté.
