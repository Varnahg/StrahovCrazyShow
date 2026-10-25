# Předání: terrain-20261025-ground

- Vlastník: `terrain-ground-01a16b37`; příjemce: koordinátor `/root`.
- Pracovní kopie: `D:/CodexWorkspaces/StrahovCrazyShow-terrain-20261025`, větev `codex/terrain-quality-20261025`, baseline `ff13fa2b3b47363378ce55d34ed12eb5beec1ede`.
- Výsledek: připravený ground checkpoint; CPU kontroly prošly. Vzhled a výkon v nativním GPU zatím nepřijaté. Žádný commit, build, server, Blender ani GPU běh.
- Cizí WIP: root bootstrap/spec/static QA a agentovy `photo-grass-*`/flowers soubory zůstaly nedotčené. Nepřevzaty žádné cizí změny.

## Implementace a zdroje

`shared/ground-cover.ts` a `shared/data/ground-cover-reference.json` přidávají dvě konzervativní interpretace trávníku u B6. Původních 130 OSM ploch i všechny stromy zůstávají beze změny; `RAW_LANDCOVER` archivuje původní vstup, `LANDCOVER` přidává dvě reference. Hranice mají přiznanou nejistotu 2 m, povinné tvrdé výluky zachovává původní `placementClassifier`.

Podklady: IPR ortho z 2024-06-08, georeference v `docs/streets/ortho-georeference.json`, SHA `7db01f50b15dcb55fb12271406608bb847ca8e73411952957612373e0b849473`; uživatelské fotografie B6 front/rear přijaté 2026-10-24, bez známého data pořízení. Jejich SHA a význam jsou v referenčním JSON; fotografie se nekopírovaly do Gitu. Syntetický koncept není podklad reality. Rozmanitost a pravděpodobnost žlutých květů jsou výtvarná interpretace, nikoli druhový soupis.

API pro flowers: `sampleGroundCover(x,z,out?)` vrací a případně přepisuje stejný objekt `{variation,grassDensity,wear,flowerDensity}`. První tři hodnoty jsou v 0..1; `flowerDensity` je pravděpodobnost jednoho kandidáta na m², nejvýše 0.10, pouze uvnitř zadní referenční plochy. U okrajů a vyšlapané pěšiny plynule klesá. Funkce nenahrazuje tvrdé výluky. Světové opotřebení sleduje 11 skutečných segmentů se značkou `surface=dirt`; šířky jsou původní odhady podle třídy, nikoli nové zaměření.

Půda: Poly Haven `brown_mud`, Rob Tuytel, CC0, generická fotografická textura. API `https://api.polyhaven.com/files/brown_mud` a `/info/brown_mud` zachována v originálních bytech. Rozměr z API 1299.9960184 mm znamená opakování 1.2999960184 m. Importér kontroluje skutečné velikosti, API MD5, JPEG hlavičku, SHA-256 a byteově totožnou runtime kopii. Originály jsou v `assets/sources/terrain/brown_mud/`, tři runtime kanály v `public/textures/terrain/`; samostatný manifest `shared/data/assets/terrain-materials-manifest.json`. Původní surfaces manifest nebyl změněn. Před downloadem ověřeno přes 100 GB volných na D; vše včetně cache vzniklo na D.

| Kanál | Bytů | SHA-256 |
| --- | ---: | --- |
| diffuse | 501955 | `df3f135c899f10a3b018738343b222cbc67d13e7c76c5d8da834a3d34c984417` |
| normal OpenGL | 1011780 | `ac517ca39eb507ae0f27e2b3db431c60888f9b5c3c52bec49d2c0775da0920cb` |
| roughness | 340815 | `ae9fb57c1173ccb4579f40edf8321a30bdca815042ffd72015a2a707c7e2e7ba` |

## Volba, refaktoring a lifecycle

Volba proti samotné změně barvy: společný deterministický světový profil doplní chybějící pokrytí i opotřebení. Proti překryvné alpha vrstvě či novému fotoatlasu zachovává jediný PBR povrch bez nového coplanárního plátu, zapečeného světla a velkých dat. `GroundCoverMaterialPlugin` míchá albedo/normal/roughness půdy a trávníku ve stejných metrických světových souřadnicích pro GLSL i WGSL. Mokré parametry se aktualizují přes stejné SurfacePack lifecycle, ne přes novou per-frame scénovou smyčku. Přidaná cena jsou 3 další texture samples a omezený analytický profil; výkon není změřený.

`SurfacePack` vlastní mapy a cache podle URL/gamma/UV scale, plugin je pouze půjčuje. Wetness/quality nepřidávají materiály ani textury. Disposal vrací původní materiály, uvolňuje jen vlastní mapy a ponechává scene-owned BRDF lookup. Readiness nepřidává per-frame pomocná pole. Shader recipe je vytvořená jednou, žádné běhové změny programu podle kvality.

`sourceStreetSurfaceGroups()` dělí pouze materiály. Šest čistých dirt polygonů získá soil; smíšený polygon s ground/gravel ponechá původní materiál. Zachová se každý přesný polygonový objekt, otvory, triangulace a terénní vstupy. Přibude jeden batch `mapped-surfaces:soil`; integrační fixture počtu meshů může potřebovat ověřenou aktualizaci mimo tento scope. Nové štítky landcover obsahují pouze skutečně vytvořené zdrojové plochy. Žádná změna DMR výšek, kolizí, tras, umělých hřišť či stromů.

## Přesné soubory

- `shared/ground-cover.ts`, `shared/data/ground-cover-reference.json`, `shared/vegetation.ts`.
- `client/ground-cover-material.ts`, `client/surface-pack.ts`, `client/streets-renderer.ts`, `client/vegetation.ts`.
- `scripts/import-terrain-materials.mjs`, `shared/data/assets/terrain-materials-manifest.json`.
- `assets/sources/terrain/brown_mud/{files.json,info.json,brown_mud_diff_1k.jpg,brown_mud_nor_gl_1k.jpg,brown_mud_rough_1k.jpg}`.
- `public/textures/terrain/{brown_mud_diff_1k.jpg,brown_mud_nor_gl_1k.jpg,brown_mud_rough_1k.jpg}`.
- `tests/ground-cover.test.ts`, `tests/terrain-materials.test.ts`, `tests/wgsl-surface-materials.test.ts`; toto předání a vlastní cache.

## Ověření

Každý příkaz načetl `. ./.cache/terrain-20261025/activate.ps1`. Závislosti zůstaly pouze čtené; nepoužit `pnpm run/exec`, který zde zkoušel automatickou instalaci.

- `node node_modules/tsx/dist/cli.mjs --test tests/ground-cover.test.ts tests/terrain-materials.test.ts tests/wgsl-surface-materials.test.ts`: **13/13 PASS**, poslední běh 2026-10-25, exit 0, 7.55 s. Log `.cache/terrain-ground-20261025/targeted-materials-final.log`.
- `node node_modules/tsx/dist/cli.mjs --test tests/surface-pilot.test.ts tests/surface-transitions.test.ts tests/vegetation.test.ts tests/vegetation-runtime.test.ts tests/cinematic-art.test.ts`: **26/26 PASS**, exit 0, 35.32 s. Výstup zachycen v tool transcript; souhrn ve vlastní cache.
- `node node_modules/typescript/bin/tsc --noEmit`: **exit 0**, bez diagnostik. Po následném refaktoringu grouping neměněn datový typ kontraktu.
- Cílený `git diff --check`: exit 0.
- První nové fixtures byly 7/8: test nesprávně očekával likvidaci scene-owned BRDF texture. Opraven na přesnou identitu zachovaných půjčených zdrojů; runtime leak tím nebyl prokázán. Poté všechny cílené kontroly zelené.
- Testy pokrývají source byte/hash/repeat, přírodní/umělé výluky, determinismus a invalid inputs, sparse flower mask, původní polygonovou identitu, materiálové cache/wetness/disposal a skutečný Babylon PBR preprocessing obou jazyků. NullEngine neověřuje ovladač ani GPU čas.

Checkpoint SHA všech vlastních vstupů a testů je v `.cache/terrain-ground-20261025/checkpoint-manifest.json`; nejde o identitu celého souběžného dirty stromu. Vlastní pomocné procesy skončily. Registraci uvolním po předání; root provede statickou GPU A/B kontrolu, celkový build/integraci a případné přijetí. Hraná verze 2592 ani prohlížeč nebyly ovládány.

## Review opravy 25. 10. 2026

Koordinátor explicitně vrátil checkpoint manifestu `b9e1d924612ecce8392c9f6f06398dab9cf64739436256852956c86952a45a5e` a rozšířil task o tři fixture cesty. Převzato claimem `terrain-ground-reviewfix-01a16b37 --adopt-dirty`. V této iteraci se mění pouze `tests/terrain-materials.test.ts`, `tests/streets.test.ts`, `tests/static-submesh-chunks.test.ts`, `tests/fixtures/static-ground-source.json`, toto předání a vlastní cache. Všechny produkční soubory i assety jsou SHA-256 shodné s původním checkpointem.

- Doplněna skutečná cesta `SurfacePack.update → jeho vytvořený GroundCoverMaterialPlugin → Babylon UniformBuffer` pro grass i soil, posloupnost sucho → déšť → sucho. Kontroluje se reálné std140 pole wetness, opačný fyzický repeat a normal strength, wet darken/roughness koeficienty i hlavní materiál. Inertní je pouze GPU sampler sink; uniformní zápisy nejsou stubované. Existující testy zůstaly.
- Streets explicitně očekává nový soil batch a ověřuje oba výsledné meshe proti přesným původním polygonům a jejich atributům, indexům a winding. Soil = původní gravel polygon indices `[0,2,3,6,7,8]`: 4356 vrcholů / 1452 trojúhelníků. Zbytek gravel = 32775 / 10911; každý původní polygon patří právě jedné skupině.
- Static test nezávisle zachytí vstupní VBO, všechny atributy a indexy všech **12** actual výstupů před chunkingem. Zachovává původní kontroly identity a bitové shody. Pre-K5 hashe v JSON nebyly přerazítkovány; přidána oddělená `terrain20261025` delta s aktuálními svědky soil/gravel a trávníku.
- Dvě referenční plochy mění pouze grass mesh: 96249 → 100158 vrcholů, 32056 → 33217 trojúhelníků, tj. +3909 / +1161. Původní atributové i indexové prefixy zůstávají byteově shodné; regrese je přímo kontroluje. Starší CAD vliv je oddělený od pre-K5 historických dat.

Ověřeno pouze `node node_modules/tsx/dist/cli.mjs --test tests/terrain-materials.test.ts tests/streets.test.ts tests/static-submesh-chunks.test.ts`: **15/15 PASS**, exit 0, 12.72 s; log `.cache/terrain-ground-20261025/reviewfix-targeted.log`. Cílená CPU sonda v téže cache ověřila před/po referenčních ploch, nikoli celý build. Žádné širší testy, build, server ani GPU. Nový checkpoint v `reviewfix-manifest.json`; původní manifest zachován. Po ukončení vlastních procesů předáno zpět rootovi a claim uvolněn; celkovou přejímku provádí root.

## Vizuální oprava – oddělené fáze 25. 10. 2026

Task vrácen rootem pod ownerem `terrain-ground-visualfix-01a16b37 --adopt-dirty`. Změny od reviewfix checkpointu: pouze `client/ground-cover-material.ts`, `tests/terrain-materials.test.ts`, `tests/wgsl-surface-materials.test.ts`, toto předání a vlastní cache. Všechny pixelové originály, asset metadata, UV, source geometry, density a výšky zůstaly shodné.

1. **Identity-only:** GroundCover nyní vrací stabilní vlastní `getClassName()`. V3 soubor SHA `e85940f4b05a169f0846ef1f4fb7efe253eb4b8028ac0446ccd51eaac862ea26` je zachován v `ground-cover-material-v3.ts`. Root před pokračováním zmrazil candidate-v3 snapshot `50bac31694491a592f3c87c08b2e44992371b58a636602984ac4fe320468076f`. Samostatnou regresi kolize WebGL Effect cache s CampusSurfaceArt vlastní weather autor; není součástí mých změn.
2. **Periodicita:** Native Babylon 9.30 `TEXTURE_REPETITION_HEX_TILING` a profil `[0,0,7,0.5]` platí pro ground materiál. Všechny tři opačné kanály nyní používají stejný `TEXRD` jako tři base PBR kanály. Rotation=0 zachovává normálovou orientaci; fallOffContrast=0 odstraní rozdílné jasové váhy podle kanálu; gain=0.5 je neutrální, gain=0 by neutrální nebyl. Zdrojové gradienty a metrická měřítka zůstávají původní.
3. **Ztracený detailový profil:** Grass větev obnovuje původní `campusSurfaceArt("grass")` sourceMean, detail 0.8 → 0.55 mezi 3.7 a 64 m a saturation 0.81. Stejný helper se používá pro base grass i přimíchanou grass před smícháním se soil. Mean násobí skutečný tint a wetness faktor; půda není přitahována k trávníkovému průměru. Parametry se váží do skutečného UBO; shader recipe je nadále sdílená, bez nové běhové cache či map.

Varianty byly porovnány před implementací: samotný návrat kontrastu pouze tlumí motiv, nový fotografický asset nemá zatím lepší doloženou shodu s B6, vlastní stochastic kód přidává správu a rizika. Vybrán existující připnutý kernel se společnými váhami, bez rotace a změn originálů. Cena je **18 místo 6 ground texture fetches** na low/medium/high, stále stejné sampler sloty a textury. To není tvrzení optimálnosti; root musí změřit GTX 1060 a porovnat statické pohledy.

Finální příkaz `node node_modules/tsx/dist/cli.mjs --test tests/terrain-materials.test.ts tests/wgsl-surface-materials.test.ts tests/surface-pilot.test.ts`: **14/14 PASS**, exit 0, 3.27 s; log `.cache/terrain-ground-20261025/visualfix-final.log`. Ověřeno skutečné předání PBR define `TEXTURE_REPETITION_MODE 2`, tři fetches v native hex funkci, všech šest sampling cest, původní sampler seznam, obě source větve, skutečný UBO wetness/detail, cache/reuse a disposal. PBR preprocessing prošel GLSL i WGSL; nejde o GPU driver kompilaci. Dva zachované mezilehlé RED logy odhalily pouze mylné předpoklady fixture: GLSL makra expanduje až driver a `forceCompilationAsync` používá dočasný submesh; finální kontrola čte defines přímo v zachyceném `createShaderProgram` volání.

Cílený `git diff --check` exit 0. Žádné fullsuite/build/GPU. Vlastní procesy ukončeny; finální manifest je `visualfix-manifest.json`, po předání claim uvolněn. Root přebírá vizuální i výkonnostní přejímku.

## Izolované ověření landcover caster role – v6

Root vrátil task ownerovi `terrain-ground-shadowprobe-01a16b37 --adopt-dirty`. Jediná produkční změna proti v5: `shadowCaster: false` v metadatech merged landcover v `client/vegetation.ts`, SHA `3abaad90af466d47b889127ba8452302508fad9ab1553ce32d31315e43163438`. Root kopíruje v6 z neměnného v5 plus tohoto souboru, takže shader/UV/offsety/normal maps/geometry se mezi kauzálními kandidáty nemění.

Primární sonda zdroje: sedm bodů `[-14,-64]` až `[-8,-34]` po směru front QA pohledu patří nové B6 referenci a žádné staré OSM ploše. Overlay je 2.5 mm nad stejným canonical terénem. Na rozdíl od base terénu a streets neměl merged landcover caster metadata; obecný `casterKind` jej podle celkové AABB nad 12 cm přijímal jako opaque caster. Izolovaná změna má ověřit self-shadow acne, nikoli předem prohlásit všechny viditelné pruhy za vyřešené.

Regrese v existujícím `all twelve actual...` testu ověřila skutečný grass mesh: překračuje fallback výšku, bez nového příznaku by byl caster, s ním je odmítnut; zůstává viditelný, enabled, s běžným depth write a bez zákazu přijímání stínů. Stávající bitové kontroly všech bufferů a přesné geometry fixtures zůstávají beze změny. Po výslovném povolení root (baseline GPU interval skončil a Edge byl about:blank) proběhl pouze `node node_modules/tsx/dist/cli.mjs --test --test-name-pattern="all twelve actual" tests/static-submesh-chunks.test.ts`: **1/1 PASS**, exit 0, 16.94 s včetně importů / 6.36 s vlastní test; log `.cache/terrain-ground-20261025/shadow-v6-targeted.log`. Proces skončil před dalším GPU v6 intervalem. Žádná změna cinematic nebo globálního shadow bias.

Root kauzální GPU přejímka: ustálený `.cache/terrain-gpu-20261025/edge-candidate-v6-shadow-only-front-settled.jpg` proti v5 potvrzuje odstranění jemných vlnitých pruhů; stín koruny zůstává ve stejné poloze. Autor přípravy snímek nezávisle prohlédl. První v6 snímek bez stromového stínu vznikl před dokončením světelného přechodu; nebyl použit jako potvrzení receiver chování. Čtecí kontrola lifecycle doložila, že `selectCasters` nastavuje receiver všem meshům před filtrem casterů; solar frustum má pevné rozsahy, takže odebrání landcover nepřepočítává jeho obálku. Ponechán jediný příznak `shadowCaster:false`, bez redundantních depth/receiver zásahů.

Root uvedl frozen source prefix `704a009c`, client build prefix `795a5`. V6 benchmark má `sourceSnapshotId:null`, protože při buildu chybělo `VITE_SOURCE_SNAPSHOT_ID`; záznam je zachován a **není přijatým výkonovým důkazem**. Izolovaný freeze/build a obraz dokládají tuto vizuální příčinu, nikoli výkonový přínos. Finální vlastní checkpoint je `.cache/terrain-ground-20261025/shadow-v6-manifest.json`. Pomocné procesy jsou ukončené; task po předání uvolněn rootovi.
