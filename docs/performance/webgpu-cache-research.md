# KEY-32: drahá fáze environment a invalidace expozice

Průzkum 16. 10. 2026, owner `webgpu-mig-01a14497-cache`. Jde o výzkum a malé CPU reprodukce nad skutečným pinovaným Babylonem; tento checkpoint nemění runtime, patch ani obraz. Milisekundy produkční fáze zatím nelze rozdělit mezi její vnitřní volání. Nejde o přijatý FPS benchmark.

## Pozorovaný snapshot

- Relace `465948b8-7f84-418c-88fa-3b0f183b75e7`, preview `http://127.0.0.1:4193`, API 2588; root uvádí native-v4 jako stejný dist/source native-v3.
- Záznam sám uvádí `buildSnapshotId=4979284c89088eb2e4cf36d5f96202d9c580f6f0818e6a700b956d53cb1906b9`, serverový source identity `87599d9e2fb842e63bfa0adef55d064d85f6eebdb32804814dd509e09d3ec953` (non-atomic working-tree metadata; nenahrazuje build identity).
- Vstup: `.cache/webgpu-migration/native-v4/.cache/game-diagnostics/465948b8-7f84-418c-88fa-3b0f183b75e7.jsonl`. Přečteno 12 773 306 bajtů, 725 JSONL řádků / 4766 event records, SHA-256 `ec1819d3eff3677e9805ce0b0141d04ca95925b7b8293cb9e2ce206c791d9e86`.
- Posledních 120 `frame-window` eventů: `atMs` 1 289 599.3–1 410 174.9, všechny `visibility=visible`, CSS/interní rozlišení 2040×986, quality medium. Každé okno obsahuje jeden snímek. Interval medián 1015.8 ms, minimum 1012.4, maximum 1018.6. CPU medián 213.2 ms; environment medián 174.9 / průměr 240.217 / p95 622.1 / maximum 878.6 ms; render medián 36.4 / průměr 39.578 ms.
- V relaci je 1309 `frame-window`, 1360 longtask eventů, žádný `webgpu-work` nad nastaveným 25ms prahem. První skutečná hidden značka je až 1 416 216.9 ms. `visible` nedokazuje foreground/occlusion, ale 1Hz kadence sama rovněž nedokazuje hidden. Řetězec od expozice je problém CPU práce uvnitř callbacku nezávislý na této neuzavřené otázce.
- Příprava světel skončila timeoutem 30 585 ms. Relace tedy nemá úplně úspěšný startup a nesmí se vydávat za výkonovou přejímku migrace.

Následující aktuální soubory byly bajtově porovnány s native-v3 snapshotem a jsou shodné: sky-weather, atmosphere-sky, art-lighting, cinematic, sky-reflection, vegetation, photographic-grass, transit-renderer, surface-pack, vehicle-lighting, flashlight, gltf-light-budget, shared/transit a shared/weather. `client/game.ts` je rootův souběžný integrační WIP; původní hranice fáze byla ověřena také ve zmrazeném native-v3 souboru.

## Co skutečně měří environment

Hranice v `Game.updateRenderEnvironment` zahrnuje celý následující řetězec, nikoli jen oblohu:

| Volání | Práce, cache a invalidace | Co zatím chybí změřit |
| --- | --- | --- |
| `skyWeather.update` | Astronomie nejvýše jednou za ≥1000 ms UTC; poloha dvou disků a jejich uniformy každý callback. | Samostatný čas a počet aktualizací slunce. |
| `applyArtLighting` → `atmosphere.update` | Vzorek osvětlení při astronomické změně nebo po 0.1 s clamped dt; společné cloud uniformy, hvězdná matice při změně ≥1000 ms; okna/lampy. `Light.setEnabled` už má skutečné transition guards. | Čas sampling/uniformů, skutečné změny světelných stavů. |
| car lighting, vehicle beam, flashlight | Car lens barvy mají epsilon gate; světla transition guard. Aktivní beam může po 250 ms/movement/mesh-count změně navštívit celou scénu. | Stav flashlight/driving a výběr casterů. |
| vegetace | Vítr, 0.15s tree LOD, fotografická tráva s časově/počtem kroků omezenou přípravou. Přesná změna camera matrix/focus může znovu spustit výběr; dirty batch může nahrát instance buffer. | Počet restarts, roots a skutečné uploady. |
| transit | Každý callback `sampleTransit`, prostorový výběr vozidel/NPC, nové/disponované rigy, LOD, animace, pool prune. Ground queries používají `sim.surfaceHeight`; bez fotogrammetrie vrací rovnou grid/patch ground, nikoli Rapier raycast. | Sampling proti rig/animation práci a counts; neodhadovat cenu podle velikosti názvu subsystému. |
| déšť | Jen při srážkách venku update segmentů a aktualizace LineSystem instance. | Zapnutí, počet segmentů, upload. |
| SurfacePack | Pending mesh/material observables, nikoli stálý full-scene scan; barvy/materiály se mění jen při wet/quality/fresh změně. | Pending count a materialUpdates delta. |
| cinematic | Expozice/IBL intenzita, bloom, podle clamped dt po >0.4 s full-scene caster selection, pending glass. | Především expozice, potom selection a reflection upload. |
| sky reflection uvnitř cinematic | 32×32×6 persistent face buffers; SH báze spočítané jednou. Update pouze když `(timer≥2s nebo delta>0.08) a delta>0.002`. Upload a mip generation patří sem. | `skyUpdates` delta a oddělení CPU sampler/upload. |

`gltfLightBudget.prepareFrame()`, `stableLights.update()` a `scene.render()` jsou až v následující fázi **render**. Jejich přímý čas nelze připsat naměřeným 382.9 ms environment. Mohou pouze spotřebovat následky dřívější změny materiálu/světla.

## Doložený řetězec expozice

1. `client/cinematic.ts:89` (`applyCampusSkyIntensity`) zapisuje `scene.imageProcessingConfiguration.exposure = campusExposure(daylight)` při každém cinematic update. `campusExposure = 1.08 + (1-daylight)*0.1`; hodnotu nelze kvantizovat bez změny obrazu.
2. `client/sky-weather.ts:276` aktualizuje slunce po ≥1000 ms. `shared/weather.ts:152` počítá plynulý daylight mezi 0 a 1. Pinned suncalc 2.1.1 na skutečných UTC okamžicích relace vrací exposure 1.1469270018021045 v 16:08:42, 1.1479410174010987 v 16:10:00 a 1.1479540241827886 o sekundu později; v 16:32:00 je 1.1652399282974966. Je to soumrak, při 1.015s callbackech se tedy hodnota mění téměř při každém snímku. Toto je výpočet pro skutečný UTC čas, nikoli uložená hodnota z konkrétního snímku; případný time override musí doplnit runtime telemetry.
3. Babylon `ImageProcessingConfiguration.exposure` zahodí pouze zcela stejnou hodnotu. Jinak zavolá `_updateParameters()` a společný observable. [Pinovaný setter a bind](https://raw.githubusercontent.com/BabylonJS/Babylon.js/9.30.0/packages/dev/core/src/Materials/imageProcessingConfiguration.pure.ts).
4. Každý připojený Standard/PBR image-processing listener volá `_markAllSubMeshesAsImageProcessingDirty`. [Pinovaný ImageProcessingMixin](https://raw.githubusercontent.com/BabylonJS/Babylon.js/9.30.0/packages/dev/core/src/Materials/imageProcessing.ts).
5. Tato funkce pro **každý materiál** znovu projde celé `scene.meshes`, jejich submeshe a draw wrappers a teprve uvnitř kontroluje skutečného vlastníka. Existující `scene.useMaterialMeshMap=true` tuto cestu nezrychluje; zde se mapa nepoužívá. [Pinovaný Material](https://raw.githubusercontent.com/BabylonJS/Babylon.js/9.30.0/packages/dev/core/src/Materials/material.pure.ts).
6. Expozice se přitom normálně předává jako uniform `exposureLinear`; define závisí pouze na `exposure !== 1` a na zapnutí image processingu. Mírná změna 1.08→1.080013 nemění variantu. Neznamená to, že CPU mark-dirty vždy vytváří nový GPU pipeline: v repro zůstává Effect totožný.

Složitost opakované invalidace je součin připojených materiálů a scene-wide submesh/render-pass traversal. Je to doložený mechanismus a silný kandidát pro soumrakové environment špičky. Jeho podíl na konkrétních 382.9 ms zatím není přímo změřen.

## Binding, postprocess a skutečné CPU reprodukce

Příkazy běžely jako krátký `node --input-type=module` se vstupem přes PowerShell single-quoted here-string, přímé importy z `.cache/webgpu-comparison/frozen/node_modules/@babylonjs/core/`. Žádný browser, build, server ani GPU. Všechny vytvořené scény, enginy a UBO byly na konci disposovány; žádný soubor node_modules se neměnil.

**Počty traversal:** 6 skutečných `Mesh`, Standard a PBR materiál, counting getter `subMeshes`. Změna 1→1.08: 12 čtení / 1 notifikace; 1.08→1.080001: opět 12 / 1 při stejném EXPOSURE define; opakování stejné hodnoty: 0 / 0; přechod na1: 12 / 1. První verze tohoto pomocného probe chybně předpokládala own descriptor na neinicializovaném `subMeshes` a skončila TypeError; po zachování skutečné inherited/undefined hodnoty probe prošel. Šlo o chybu fixture, ne produkční selhání.

**Skutečné ready/bind cesty:** 4 boxy s reálnými submeshi, FreeCamera a čtyři typy materiálů: StandardMaterial, PBRMaterial, PBRMetallicRoughnessMaterial, PBRSpecularGlossinessMaterial. Po čtyřech NullEngine renderech byly efekty ready. Oba následující scénáře byly provedeny pro unfrozen i `freeze()` materiály:

| Cesta | Počet `subMesh.getMaterial` během setteru | CPU jednoho volání na malém fixture | Příští render všech 4 materiálů |
| --- | ---: | ---: | --- |
| běžný setter, unfrozen | 32 | 0.0977 ms | přesná nová exposure, stejný Effect a EXPOSURE=true |
| přímé `_exposure`, unfrozen | 0 | 0.0015 ms | totéž |
| běžný setter, frozen | 32 | 0.0345 ms | totéž |
| přímé `_exposure`, frozen | 0 | 0.0011 ms | totéž |

Časy jsou jednotlivá kontrolní volání na čtyřech objektech, **ne měření produkčního zrychlení**. Hodnotnější důkaz je počet návštěv a skutečný binding. `Scene.render()` resetuje cached material před rendery; `PushMaterial._mustRebind` a Standard/PBR bind proto na příštím snímku znovu bindují image processing i u frozen materiálu. Aktuální klient materiály `freeze()` nezamyká (zamyká world matrices, což je jiná operace). Změny uprostřed již běžícího draw/pass, multifamily submeshe a NCM re-use musí být v případné implementační regresi ověřené samostatně.

**Proč přímý zápis nestačí:** byl vytvořen skutečný `DefaultRenderingPipeline` přesně cinematic receptem (imageProcessingEnabled=false, FXAA+bloom, prepare, automaticBuild, applyByPostProcess=false). `config.isEnabled` pak skutečně je false; to je stávající chování a tento zásah ho nesmí opravovat ani měnit. Pipeline observer kopíruje exposure do highlight wrapperu. Naměřený binding `ThinExtractHighlightsPostProcess.bind`:

| Aktualizace | config.exposure | skutečně bindovaný bloom `exposure` |
| --- | ---: | ---: |
| veřejný setter | 1.080013 | 1.080013 |
| pouze `_exposure` | 1.080026 | **1.080013 — zastaralý** |
| `_exposure` + zachovaná notifikace | 1.080039 | 1.080039 |

Výsledek vyvrací jednoduchý value-only zápis jako úplnou opravu. Materiálový EXPOSURE může být v medium/high vypnutý, ale bloom expozici stále používá. Samotná notifikace přitom i v takovém případě zbytečně spouští material traversals. FXAA a blur nepoužívají scene exposure; highlight ano. Obecný `ThinImageProcessingPostProcess` při každém bindu čte živou konfiguraci, ale není součástí této zapnuté cinematic chain.

**Native uniform cache:** skutečný `WebGPUPipelineContext` s `leftOverUniforms=[exposureLinear:f32]` a skutečný `UniformBuffer`; jediný stub byl CPU transport místo GPU bufferů. Pro oba režimy — standardní `update()` i existující `_updateOwnerKeyed(owner)` — hodnoty 1.08→1.080013 vedly k odpovídajícím Float32 bajtům 1.0800000429153442→1.0800130367279053 a jednomu uploadu na změnu; opakování stejné hodnoty mělo 0 uploadů. Po dispose zůstalo 0 tracked UBO. `WebGPU._draw` flushuje leftover UBO **před** NCM fast-bundle větví, takže zachovaný JS binding má cestu i do znovu použitého bundle. Jde o uzavřený CPU mechanismus; fyzický GPU výsledek a všechny kombinace passů vyžadují reálnou přejímku.

Ve scéně jsou přímé autorské materiály Standard/PBR, pluginy vegetace/povrchů/vlasů zachovávají jejich binding. Vlastní ShaderMaterial oblohy/Sun/Moon již emituje vlastní barvy a neodebírá image-processing config. MultiMaterial je kontejner submateriálů, ne další nezávislá color-grade implementace. Starý vlastnický UBO patch se nesmí odstranit; není příčinou této invalidace.

## Varianty a doporučení před runtime změnou

| Varianta | Přínos | Riziko a rozhodnutí |
| --- | --- | --- |
| Pouze menší frekvence/kvantizace exposure | Méně invalidací | Mění plynulou hodnotu/obraz; nepoužít. |
| Přímé `_exposure` v aplikaci | Odstraní traversal | Repro prokazuje zastaralý bloom a vynechané observer kontrakty; samostatně nepoužít. |
| Přímé `_exposure` + ruční oprava bloom | Malý app diff | Váže aplikaci na privátní strukturu pipeline, musí hlídat její recreate a nové consumers; obchází obecné notifikace. Slabší varianta než zachování observerů. |
| Material membership cache / jednorázová scene sweep | Zachová všechny dirty semantics a zlevní i jiné dirty události | Širší lifecycle: MultiMaterial, instances, material replacement, render-pass override, AssetContainer, shadow wrappers, disposal a již vytvořené draw wrappers. Existující meshMap nepokrývá automaticky celý tento kontrakt. Pro tuto jednu příčinu příliš široké. |
| Cílený pinned config/mixin patch rozlišující exposure uniform update | Zachová přesnou expozici, všechny consumers a notifikace; vynechá pouze nepotřebný material define traversal | Doporučená varianta **po podfázovém runtime potvrzení**. Musí zachovat 1↔non1 změny, ostatní config změny a reentrant notifikace. |

Navržený minimální vendor kontrakt: notifikace nese interní, po celou synchronní dispatch platné rozlišení `definesDirty` (default true); exposure-only aktualizace při neměnné variantě je false. ImageProcessingMixin v tomto jediném případě nepustí material define traversal. Ostatní observeři včetně DefaultRenderingPipeline dostanou původní hodnotu a notifikaci. Reentrant dispatch musí obnovit předchozí stav v `finally`, nesmí ztratit vnořenou změnu contrast/toneMapping ani vyvolat potlačení další obyčejné notifikace. Samotný public exposure setter nesmí kvantizovat čísla. Je možné omezit tuto cestu explicitním opt-in API jen pro předrenderový cinematic update, pokud kontrakt stejného snímku ukáže neparitu; nerozšiřovat ji naslepo na všechny config setter operace.

Po přidělení runtime scope by nejmenší změna zahrnovala stávající `patches/@babylonjs__core@9.30.0.patch`, navazující patch hash v lockfile podle repozitářového postupu, případně `client/cinematic.ts` pro explicitní opt-in a samostatný skutečný Babylon test `tests/image-processing-exposure.test.ts`. V patchi zachovat všechny původní hunks, zejména UBO ownership a nové WGSL shadow opravy. Nový runtime helper/test/staging musí nejdřív přidělit root; současný task vlastní jen tento výzkum a handoff.

Požadované regrese: unchanged value žádná práce; same-define changed value bez scene-wide traversal; 1→non1→1 musí připravit skutečnou variantu; config.isEnabled/applyByPostProcess/toneMapping/colorCurves/texture změna se neztratí; Standard/PBR/simple PBR + MultiMaterial/instance/frozen + pozdě přidaný materiál; zachování bloom uniformu a postprocess chain identity; vlastní a sdílená config; vnořený observer, throw a dispose; reálná WebGPU leftover/cache a následná GPU obrazová parita. CPU test musí pozorovat skutečné traversal/bind hodnoty, nikoli kopii implementovaného ifu.

## Nejmenší runtime měření

Root doplní explicitní hranice jednotlivých volání `updateRenderEnvironment`, bez per-draw tracingu a bez globálního monkeypatchování. U cinematic rozdělit alespoň `applyCampusSkyIntensity`/exposure, quality pipeline configure, caster selection a reflection sample/upload; u expozice uložit previous/next exposure, daylight/timeOverride, config.isEnabled, applyByPostProcess a notification count. Ke snímku připojit delta existujících `skyUpdates`, `selectionMeshVisits`, `glassVisits`, SurfacePack a vegetačních/transit counts.

Subfáze se nesmějí přičíst k současným šesti hlavním phases jako další nezávislý CPU součet — jsou vnořené. Použít oddělené agregované `environment-profile` okno s count/total/max a source/session identity, nebo jednoznačně oddělené nested pole. Jednotlivé pomalé volání lze hlásit s omezenou frekvencí; nepřidávat shader dump ani každý draw log. Profilovací callback musí být observer-safe, nesmí změnit return/throw nebo držet disposed scénu.

V předchozím immutable kandidátu ověřit zvlášť soumrakový live UTC a pevný stejný time override (kauzální kontrola), stejné místo/kameru/quality/resolution, dostupný foreground marker. Fix srovnat na odděleném snapshotu a přesných číselných obrazových vstupních hodnotách. Žádné předběžné tvrzení, že odstranění traversal odstraní také 1Hz browser scheduling.

## Provenience pinovaných souborů

Čteno z vlastních dříve zmrazených závislostí, nikoli z měněného node_modules hrané 4188. Babylon 9.30.0 s existujícími repo patchi. SHA-256 lokálních mechanismů:

- `Materials/imageProcessingConfiguration.pure.js`: `4b466bb63267c193e3508499d13fd15ec018099fc8cbcf7e5f2cb1923c879d8e`
- `Materials/imageProcessing.js`: `d83e46a2d03f8160e349c3377c599029725eee785be1c947ac76144cf086925b`
- `Materials/material.pure.js`: `57ea7fa9a4c31d7cefa2fbbfa5c7c53db85f1ea783447f0146b8b9b101343676`

Relevantní lokální primární místa: imageProcessingConfiguration setter262/notify541/defines593/bind660; ImageProcessingMixin attach49/observer65; Material traversal1376; Scene.render4554; Standard bind1566/PBR bind1753; DefaultRenderingPipeline observer404; ThinExtractHighlights bind40; WebGPU pipeline setFloat346; UniformBuffer updateUniform608; WebGPU engine UBO flush2875. Vzdálené pinované source odkazy výše slouží ke kontrole upstream kontraktu; existující lokální UBO patch má navíc vlastní původní evidenci.

## Rozhodnutí koordinátora po předání CPU důkazů

Root schválil samostatný KEY-36 / `webgpu-migrate-exposure-20261016` (katalog `d3bd6c0`) pro úzký exposure-only marker a vynechání pouze material define traversal, se zachováním všech notifikací a původního patch prefixu. Toto rozhodnutí dovoluje implementaci mechanistické opravy před dokončením podfázového měření; **nedoplňuje chybějící produkční čas ani GPU důkaz**. Root nadále zajistí skutečné podfázové měření, novou instalaci odděleného snapshotu a GPU paritu. KEY-32 výzkum tím končí, implementace má nový samostatný scope/commit.
