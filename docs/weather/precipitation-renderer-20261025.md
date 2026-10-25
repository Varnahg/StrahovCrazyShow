# Čitelnější srážky – 25. 10. 2026

## Koordinátor: skutečná GPU přejímka R3

Menší objem byl přijat po vizuální kontrole celé hry: déšť má čitelné úzké stopy, sníh měkké drobné vločky, smíšené srážky kombinaci obou a kroupy kompaktní body. WebGL2 i nativní WebGPU na source `6a7463439424a36607f22e437ab4d2ab658e3535dbb8a834d021cc759f44e1d9` naběhly ready bez render/shader chyb; WebGPU navíc zvládl přechod medium sníh → high déšť. Jedná se o pozorovaný obraz, ne meteorologicky kalibrovanou hustotu.

Skutečný AFTER DRAW/VBO capture sněhu: 806 částic, 4836 indexů, 217 center ve frustu; šířka P05/P50/P95 0,788/1,633/4,313 px. Po ustálení je world wind +3 m/s pro FROM270°. Depth LEQUAL, alpha blend, bez depth write/cull. Dřívější záporný vítr odpovídal přechodu pě­tisekundového filtru; preview neexpiruje podle stáří.

Desetisekundové srovnání: Intel UHD630/ANGLE D3D11, WebGL2, medium, CSS i render1260×702, stejná kamera a UTC denní náhled, tři autentizované relace s avatary Mia/Alex/Robin, HUD zapnutý. Během měření neběžel vlastní build, testy ani Blender.

| Scéna | Původní objem FPS / p95 / p99 ms | Menší objem FPS / p95 / p99 ms |
| --- | --- | --- |
| Silný déšť | 54,7 / 23,6 / 27,4 | 53,3 / 23,9 / 27,5 |
| Silné sněžení | 42,7 / 32,0 / 36,3 | 53,9 / 24,5 / 29,1 |

Všechny čtyři běhy mají valid render health a nula asset/render chyb. Krátké A/B neprokazuje optimalitu ani zrychlení sněhu; důvod pomalejšího výchozího sněhového běhu nebyl přiřazen. Jeden meziběh s jediným avatarem je výslovně vyřazen. Počet částic, bufferů i upload rozpočet se změnou objemu nezvýšil, fragmentové pokrytí ano. Původní snapshot je `7a2e36cd02297c4fe1cc2c9bfd6395881118b3849a3f00a8d1dbfd9f4faf1484`.

Důkazy: `.cache/b6-photo-refinement-20261024/revision2/weather-gpu-comparison.json`, SHA256 `ed75d4c0aa8b86420579fa5d4cf4558e188f4bc81de4f5e234f78afe4839ed91`; obsahuje přesné soubory/hashy, matice, počasí, GPU a plné výsledky. Samostatné WebGPU captures jsou `sky-v9-webgpu-snow.json` a `sky-v9-webgpu-rain-high.json`. Dopady na střechy, akumulace a per-particle řazení přes průhledná okna nejsou tímto ověřeny ani implementovány. Následující odstavce popisují historii dílčích checkpointů.

Task `weather-precipitation-renderer-20261025`, owner `weather-precipitation-r1`. Produkční integraci Game a GPU přejímku vlastní root; tento task vytváří samostatný controller, testy a evidenci. Uživatelská2591 zůstává nedotčená.

## R3 – menší objem při stejném počtu a stejné velikosti částic

Root předal task zpět ownerovi `weather-precipitation-r3` po skutečném v8 AFTER DRAW a GPU VBO capture. Zpráva koordinátora v této konverzaci uvádí WebGL2: cull=false, blend=true, LEQUAL, depthWrite=false, 1024 aktivních částic a6144indexů. Position data obsahují opakovaná3Dcentra, UV jsou přesně[0,0,1,0,1,1,0,1], první rain shape[0,006;0,16;0;11]. Ve frustu je118center; pixelová šířka P05/P50/P95=0,404/0,699/1,389 a výška10,36/18,78/48,10. Raw cesta/hash v8 nebyly tomuto workerovi dodány; jde o explicitně připsaný rootův GPU readout. Binding problém nebyl potvrzen, slabý footprint ano.

Předcházející v7 data jsou v `revision2/precipitation-gpu-v7.json`, SHA256 `854814722a5d73d9d1ffda5873607a71f83e6cd5937c1b252484b2464311c43a`. Výpočet použil skutečné matice/rozlišení1260×702, illumination0,529735 a64 možných fází pole. Kvůli tehdy chybějícím VBO a historii větru/kamery šlo o model před opaque depth testem a FXAA, nikoli přesnou rekonstrukci snímku. Pro původní objem36×36×20m vyšlo průměrně138center ve frustu a123rastrových stop, medián šířky0,745px, 73,7 % pod1px a pokrytí obrazu0,408 %. Číselný kontrast proti zachycenému pozadí byl typicky~6/255. Sníh při stejné kameře/osvětlení vycházel jen na~69rastrových vloček a0,020 % obrazu. V8 měření odpovídá tomuto řádu velikosti; jde o renderer částice, nikoli skutečnou meteorologickou koncentraci.

Zvolená a rootem výslovně schválená minimální varianta mění **pouze RADIUS18→10 a TOP18→10; BOTTOM−2 zůstává**. Objem je nyní20×20×12m, tedy4800m³ místo25 920m³. Stejný počet se soustředí do5,4×menšího objemu. Žádná změna budgetů384/1024/2048, rozměrů vloček/stop, opacity/barvy, zdrojové klasifikace, API, shaderových receptů nebo distance fade18–28m. Již sdílené konstanty upraví inicializaci/wrap, volume edge fade, teleport hranici a bounds s1m rezervou: lokálně[-11,−3,−11] až[11,11,11].

Model této varianty pro v7 kameru předpověděl~316rastrových dešťových stop, medián šířky1,030px a1,741 % pokrytí obrazu. To je **odhad**, nikoli GPU A/B výsledek. CPU/vertex/index/buffer/upload limity zůstávají stejné; větší viditelné pokrytí může zvýšit fragmentovou práci, proto se nesmí tvrdit stejný naměřený výkon. Alternativní zvýšení počtu, velikostí nebo opacity nebylo provedeno; bez změny těchto vstupů bude rootovo srovnání izolovat pouze objem.

Ověření R3: `pnpm exec tsx --test tests/precipitation-renderer.test.ts` → **9/9 PASS, exit0,2,10s**, `volume-r3-tests.log`; `pnpm exec tsc --noEmit --pretty false` → **exit0**, `volume-r3-typecheck.log`. Wrapping/dt/teleport/quality/bounds test nyní vyžaduje menší objem. Stávající dispatch test byl rozšířen na clear constructor/prepare/3renders→rain→clear→move→snow, včetně computeWorldMatrix, zachování Effectu a skutečných index draw counts6144/4836. Per-frame buffer identity, world wind/camera kompenzace, disposal i obě native shader interface cesty zůstaly ověřené.

`volume-r3-runtime-check.json` potvrzuje, že jediný runtime diff jsou obě povolené konstanty; výchozí bytes odpovídají immutable v6b (`c425bf669fd71eafc7c15d46aeda9c13252d1372a2b372b6e83bf336bf9c84d9`), nový runtime SHA256 je `1e61ed97ca8d041211875c10425c8485be5f234797c70fd998824effa3a238a6`. Root provede nový skutečný GPU obrazový a výkonový A/B. B6 commit `f83236bc9c159eb595f1451f3c00ac3af611fadd` ani jeho immutable snapshot nejsou touto variantou měněny.

## R2 – perspektivní směr dešťové stopy

Po nezávislém review root výslovně předal vlastní WIP zpět ownerovi `weather-precipitation-r2` (`--adopt-dirty`). P2 nález je platný: samotné `viewVelocity.xy` ignorovalo pohyb do hloubky. U LookAtRH/PerspectiveFovRH, pohledu85° dolů a center view(3,0,−10), world velocity(0,−11,0), je view velocity(0,−0,95871317,−10,95814168). Původní převážně svislá stopa měla proti skutečnému NDC pohybu úhlovou chybu62,595° a half-extent0,01394492 místo opravených0,04980923.

Zvažovány byly projekce dvou konečných konců stopy a lokální derivace perspektivního podílu. Zvolená derivace zachovává stávající krátký billboard a jeho střed; konečné endpoints by navíc vyžadovaly asymetrický posun středu a clipping obou konců. Obě shaderové cesty nyní počítají `clipVelocity.xy - clipCenter.xy * clipVelocity.w / clipCenter.w`, poté dělí projectionScale, aby offset zůstal ve view-plane metrech. V běžné perspektivě jde o `v.xy - center.xy * v.z / center.z`; pro orthographic s konstantním W se správně vrátí v.xy. Pixelové měřítko/aspect dále aplikuje skutečná projection matice, nepoužívá se NDC vektor přímo jako world offset.

W musí být kladné a větší než0,05, měřítka/flow konečná a omezená. Neplatná projekce vynuluje viditelnost; half-extent je omezen0,75m, tedy stále uvnitř stávajících bounds s1m rezervou. Úprava přidává projekční aritmetiku ve vertex shaderu, nikoli další buffery, draw calls, uniforms, světelné varianty či per-frame CPU práci. API controlleru zůstává stejné. Čistá exportovaná numerická reference slouží regresím; runtime animace ji nevolá.

Nový diferenciální test skutečně posouvá world point a promítá jej pinovanými Babylon `LookAtRH`/`PerspectiveFovRH` maticemi pro pitch−85/0/+85° a různé off-axis středy. Proti tomuto nezávislému výsledku porovnává tangent i promítnuté konce billboardu, nikoli pouze regex. Ověřuje i původní >60° kontrapříklad, orthographic, near/behind a NaN vstupy. **9/9 testů PASS, exit0,2,75s**, `projection-tests-r3.log`; původní shader/interface/lifecycle testy zůstaly. Po rootově typovém zúžení integračního `Game.quality` má `pnpm exec tsc --noEmit --pretty false` **exit0**, `projection-typecheck-r3.log`. Nativní GPU výsledek stále čeká na nový koordinovaný kandidát; R2 není GPU PASS.

## Důkaz a varianty před implementací

Aktuální `Game` vytváří160 dvoubodových line segments, všem nastavuje modrou barvu a kreslí je přes `CreateLineSystem(instance)` při každém aktivním update. `updateRainSegments` již správně rozlišuje modelovou fázi, malé kroupy/drizzle a rekonstruuje oba konce po wrap. Pro vločky ale zůstává line primitive: nemá plochu, měkký obrys ani jiný vizuální charakter. Rootův v4 GPU pohled se silným sněžením potvrdil sotva viditelné krátké modré čáry. Tento task nepovažuje CPU test za vizuální náhradu tohoto důkazu.

Primární pinované zdroje Babylon9.30.0: `Particles/particleSystem.pure.js`, `Particles/gpuParticleSystem.pure.js`, `Particles/solidParticleSystem.js`, `Buffers/buffer.pure.js` (retained `updateDirectly`), `Meshes/geometry.js`, `Materials/shaderMaterial.pure.js` (worldView/view/projection binding) a `Materials/material.pure.js` (forceCompilation polling). Oficiální [přehled particle systémů](https://doc.babylonjs.com/features/featuresDeepDive/particles/) rozlišuje sprite, mesh a point cesty; [SPS API](https://doc.babylonjs.com/typedoc/classes/BABYLON.SolidParticleSystem) popisuje jeden mesh a řízenou aktualizaci. [Particle intro](https://doc.babylonjs.com/features/featuresDeepDive/particles/particle_system/particle_system_intro) potvrzuje recyklaci pevné kapacity a standardní texturovou cestu. [GPU particle dokumentace](https://github.com/BabylonJS/Documentation/blob/master/content/features/featuresDeepDive/particles/particle_system/gpu_particles.md) popisuje další GPU buffers/random texture a odlišný stop lifecycle; současný pin navíc vybírá native WGSL na WebGPU. [ShaderMaterial](https://doc.babylonjs.com/features/featuresDeepDive/materials/shaders/shaderMaterial/) podporuje přímé zdroje shaderů a explicitní uniformy. [WebGPU status](https://github.com/BabylonJS/Documentation/blob/master/content/setup/support/webGPU/webGPUStatus.md) uvádí omezení point-size, proto nejsou zvětšené body přenosným řešením.

| Varianta | Přínos | Náklady/rizika | Volba |
| --- | --- | --- | --- |
| Více původních line segments | Nejmenší změna | Sníh stále bez měkké plochy, barva společná, topologii nelze změnit na vločku | Ne |
| Native CPU ParticleSystem / SpriteManager | Recyklace, billboardy, hotové emittery | Textura/custom effect, další particle-system lifecycle a startup path; průhlednost/styl smíšených částic vyžadují úpravu | Rozumné, pro tento malý rozsah nadbytečné |
| Native GPUParticleSystem | Velké populace bez CPU integrace | Feedback/compute, dvojité buffers, random texture a další readiness/stop vlastnictví; absolutní GPU budget zatím neznáme | Odloženo |
| SPS z quadů | Jeden mesh/draw, native billboard | Obecné particle/vertex aktualizace a rotace, více objektového stavu než potřebují srážky | Rozumné, ale vlastní úzký batch je menší |
| Analytický GPU pohyb z času | Statické buffers | Složitější kontinuita při změně větru, kvalitě a přesunu hráče; samostatný shader/reference audit | Další optimalizační varianta až podle profilu |
| Jediný pevný indexed quad batch | Explicitní limit, vlastní měkká maska, běžná mesh preparation, snadný wrap/lifecycle audit | CPU integrace a nejvýše98 304B position upload na aktivní frame při kapacitě2048 | **Zvoleno** |

Kandidátní limity jsou384/1024/2048 pro low/medium/high, škálované stejnou `precipitationAppearance` hustotou. Nejde o naměřené optimální počty. Geometrie, indexy, materiál a typedarrays vzniknou jednou; běžná animace nevolá MeshBuilder ani nevytváří objekty/vektory. Změna vstupních meteorologických skalárů může obnovit malý cached appearance objekt z existujícího helperu. Typ a velikost částic se řeší daty, nikoli novými shader defines nebo světelnými permutacemi.

## Integrační kontrakt přijatý koordinátorem

`new PrecipitationRenderer(scene)` vlastní jeden readonly `mesh`; `activeCount` umožní číst skutečný počet. `update({dt, weather, wind, position, quality, illumination, outside})` používá renderový dt, volitelné počasí, hotový world wind velocity vector, polohu středu u hráče a relativní osvětlení0–1. Vítr se znovu nepřeklápí; meteorologické FROM již převedl nadřazený weather controller. Controller nečte teplotu pro odhad fáze a nemění zdroj/freshness/DEMO metadata. `prepare(): boolean` spustí/ověří jediný shader i u disabled meshe za jasna a zapadá do existující readiness gate. Připravuje `isReadyForSubMesh` pro skutečný renderPassId aktivní kamery a v `finally` obnoví předchozí pass. Nepoužívá shadow-map smyčku obecného Mesh.isReady. Vlastní timer/promise polling nemá; pinované `forceCompilationAsync` by přidalo16ms polling s odděleným lifecycle. `dispose()` je idempotentní.

Quady vznikají v aktuálním view-space přes skutečné worldView/view/projection bindingy. Sníh je drobný nepravidelný měkký disk s měnícím se úhlem, kroupy kompaktní pelety, déšť/drizzle mají směr projekce skutečné rychlosti a omezenou délku. Velikosti/opacity jsou umělecká reprezentace, nikoli měření částic. Standardní alpha blend, depth test a group0 zachovají zakrytí neprůhlednou scénou; depth write je vypnutý, bez aditivního světla, textures a akumulace sněhu.

`outside=false` ihned vypne batch, návrat inicializuje celý aktivní prefix znovu. Změna počtu a teleport rekonstruují celé částice, nikoli odpojené konce dlouhých čar. Střed se pohybuje s hráčem, ale uložené lokální pozice kompenzují jeho posun, aby částice nebyly přilepené ke kameře. Pevné bounds pokryjí objem i rozměr billboardů. **Depth test není simulace dopadu na střechu**: přesnou informaci o zakrytí/indoor prostoru musí dodat Game; současný zone-based signál sám nevyloučí srážku pod každou venkovní stříškou. Prostorová kolizní mapa/raycast/depth-collision jsou další koordinovaný scope, ne falešně deklarovaná vlastnost tohoto controlleru.

## Ověření a otevřená přejímka

`pnpm exec tsx --test tests/precipitation-renderer.test.ts` → **7/7 PASS, exit0, 1,71 s**, `.cache/weather-precipitation-renderer-20261025/targeted-tests-r3.log`. Testy ověřují všechny existující preview rodiny a zachování jejich provenience, skutečný FROM→world směr přes `windVector`, kompenzaci pohybu hráče, omezení dt, teleport/wrap/quality/indoor přechody, identity typedbuffers a jediný retained position upload v běžném update. Skutečný NullEngine scene dispatch vykreslí jeden indexed transparent batch a při clear žádný. Camera prewarm vytvoří přímo používaný draw wrapper, nezapne mesh a všechny rodiny sdílí tentýž Effect bez LIGHT/SHADOW defines. Dispose jednoho ownera nezničí druhý controller; scene teardown odpojí vlastní observer.

Native Babylon WGSL processor pro obě reverse-depth konvence má stejné uniformní rozhraní a žádné textury/samplery; zachovává engine Y transform. Nejde o nativní GPU validaci typů/pixelů. `pnpm exec tsc --noEmit --pretty false` → **exit0**, `typecheck-r3.log`. Původní neúspěšné logy zůstaly: první test odhalil chybnou volbu prewarm wrapperu a první tsc chybějící typ tuple v testovém spy; obě příčiny jsou opravené, žádná assertion nebyla odstraněna.

Pevná kapacita drží8192vertexů/4096trojúhelníků; aktivní index range je šest indexů na skutečnou částici. Samotná data mají336KiB CPU typedarrays včetně seedů a312KiB GPU buffers bez overheadu Babylonu; position upload je96KiB na aktivní frame i při low, aby native buffer zachoval CPU data pro rebuild bez dočasných subarrays. Silné sněžení z aktuálního demo scénáře dává303/806/1612částic podle kvality. To jsou analytické rozměry a deterministic count, nikoli naměřená rychlost nebo objem reálného sněžení.

Rootova konkrétní GPU přejímka:

1. Jasný startup při medium: zavolat `prepare` v existujícím readiness gate; první `snow-heavy` nesmí přidat novou světelnou variantu nebo přehrát celý startup. Porovnat stejnou kameru s původními160lines.
2. `snow-light/snow-heavy` za dne a při úplňkové noci: bílé měkké drobné vločky, perspektivní velikost, průběžná rotace, vítr a plynulý pohyb kamery. Vyloučit velké blízké billboardy či modré čáry.
3. `drizzle/rain-heavy/freezing-rain/mixed/hail`: odlišná délka/rychlost/plocha, žádná teplotou vymyšlená fáze či pokrývka; rychlý boční vítr a pohled dolů nesmí vytvořit obrazovkové dlouhé stopy.
4. Průchod za neprůhlednou B6 fasádu, terén a dveře; inside/outside návrat, teleport a low→high změna. Zakrytí skutečnou střechou závisí na callerově outside signálu. Alpha pořadí uvnitř jednoho batch není per-particle depth sort; zkontrolovat zvláště transparentní okna.
5. Totéž na native WebGPU po ověření source ID; skutečná validace WGSL, první snímek i resize. Pak plná produkční hra s HUD/avatary/relacemi: srovnatelné baseline/candidate CSS/render/GPU, FPS/p95/p99 a CPU/GPU timing bez jednorázových readback diagnostik.

**GPU vzhled/performance a úplná weather přejímka zůstávají otevřené.** Žádný server, build, plná sada ani GPU proces tohoto tasku nebyl spuštěn.
