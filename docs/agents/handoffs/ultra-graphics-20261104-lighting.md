# Předání lighting Ultra

Vlastník ultra-20261104-lighting, task ultra-graphics-20261104-lighting. Cwd D:/CodexWorkspaces/StrahovCrazyShow-graphics-20261104; přímá D výjimka byla koordinátorem potvrzena proti historickému main-only zadání. Žádné soubory C se nemění.

Aktuální checkpoint 4. 11. 2026 22:14 CET: poslední barevná regrese opravena, cílené testy 45/45 a scoped strict TypeScript PASS. Předáno rootu; zbývající celkovou a GPU přejímku řídí root. Historické průběžné výsledky níže nejsou finální obrazový ani FPS důkaz.

## Rozhodnutí před změnou

1. Problém: ColdUltra by dnes vždy alokovala solar shadow a standardní Low přechod by rušil/rebudoval postpipeline; off resize callback může stále kompilovat blur.
2. Mechanismus: Cinematic constructor vytváří ShadowGenerator, configure mapSize a dispose pipeline; BJS9.30 DefaultRenderingPipeline resize observer přepisuje bloomKernel i při scene.postProcessesEnabled=false. Shadow scene component správně kontroluje light.shadowEnabled.
3. Jediná změna: explicitní lighting features, lazy konstrukce a bounded jedna sada; master OFF prosolar/player/car a scoped gate jediné vlastněné pipeline resize callback.
4. Metrika: počty skutečných shadow render targets, caster visits, pipeline/observer identity a lazy alokace v cílených testech. Nejde o GPU/FPS.
5. Správnost: světla/astronomie/tonemapping beze změny; žádná cache konfigurací; no unsafe detach, vlastněný observer se obnoví předdispose; výchozí presetové chování zachovat.
6. Přijetí: targeted lifecycle regrese PASS, TypeScript vlastního rozsahu, předání rootu pro skutečnou Game readiness aGPU přejímku.

Alternativa scene flag bez callback gate neodstraní off resize update. Dispose na každém OFF by obnovil známé shader/resource záseky. Retence jedné sady s explicitním active stavem je vybraná varianta schváleného plánu. Private observer access je izolovaný na vlastním pinned9.30 pipeline, nikoli globální engine patch.

## Výsledek a předání

Hotové API:
- CinematicAtmosphere(scene,camera,sun,initialFeatures?:Pick<VisualFeatures,'shadows'|'postProcesses'>) + setVisualFeatures(features).
- VehicleLighting(scene,kind='vehicle',shadowsEnabled=true) + setShadowsEnabled(boolean).
- PlayerFlashlight(scene,shadowsEnabled=true) + setShadowsEnabled(boolean), delegace do beam.

Cinematic solar shadow je lazy pro coldOFF, liveOFF ponechává jediný generator bez casterselection/resize/passu. Vehicle/player masterOFF ponechá světlo/intenzitu, vypne pouzeshadow; dalšíupdate nevytvoří mapu. Postprocesy respektují explicitní Low+ON/High+OFF, ponechají jednu připojenou sadu a řídí scene.postProcessesEnabled. OFF vrací původní scene.autoClear, protože první PP pass už nemůže vyčistitframe. Při dispose se vlastněnéglobálníflags obnoví jen pokud stáleodpovídajíposlednímuvlastnímuzápisu.

Pinned9.30 resize observer adaptér obaluje pouze callback vlastního DefaultRenderingPipeline._resizeObserver, jeho identita zůstává stejná a cizí observers nejsou měněné. OFF odloží bloomKernel update; ON jednou dožene aktuálníscale pod přípravou rootu. automaticBuild jeOFF během neaktivního stavu. Předdispose adaptér vrátí přesně vlastnícallback (pokud nebyl nahrazen). Kamery se nedetachují. Synchronous chyba prvnípipeline.prepare uklidí částečného vlastníka a dovolí rollbackOFF a pozdějšíON.

Koordinátor výslovně potvrdil production-ready barevnou paritu: původní všekvalitovýwarmup vždy nastavil imageProcessingConfiguration.isEnabled=false přesDefaultPipeline. Novýmanual/coldUltra bezpipeline proto nastavífalse přímo vkonstruktoru, aby vzhlednezávisel na absolvováníMedium/High. Není zaveden nový tonemapping režim; applyByPostProcess=false zůstává.

Ověření: node --import tsx --test tests/lighting-visual-settings.test.ts tests/cinematic.test.ts tests/cinematic-pipeline.test.ts tests/cinematic-fresnel-disposal.test.ts tests/cinematic-atmosphere.test.ts tests/vehicle-lighting.test.ts — finálně40/40PASS,0fail,0skip,exit0,3011.562ms (tool chunk04809d). Nová sada má5případů: coldlazy/lightfunctional, skutečnýshadowtargetgather0, boundedpostretain+clearing, OFFresize/ON/dispose/foreignobserver a synchronousfailedcreationcleanup. Scoped tsc se strict/ES2022/ESNext/bundler/resolveJsonModule/skipLibCheck nad3runtime soubory+novýmtestem PASS, exit0 (session47715).

Původnífail34/35 byl starýtest očekávajícídispose chainu přiLow; nahrazen silnějšími asercemi nové zadanéretence+disabled drawing a clearing. Následné2fail byly ve fixture: pendingSceneComponent ještěnebylregistrován aNullEngine vždyvracíscale1. Fixture nyní provede stejnéregistrace jakoScene.render a vystavískutečný AbstractEngine scaling stav. Posledníobserver-array kontrola respektuje Babylon deferred removal příštímtahem. Původníruntime regresníasercemimo změněné zadáníse neodstraňovaly.

Refaktor: jediný ensureShadow a postactive/lifecycleowner; žádnáduplicita parseru, žádný novýasset, dalšílight ani cachekombinací. Root musí gate readiness/inventář podle scene.postProcessesEnabled, protože retainedcamera._postProcesses jsou stále připojené. Při Apply nejdřívefeatureOFF a potom hardwareScaling, aby starýaktivnípipeline nezachytilzbytečnýresize.

Tyto kontroly jsouCPU/NullEngine, nikoliGPU/FPS. Root provede Game integrační/runtime/full/GPU přejímku. Žádný vlastníserver/build/GPUproces neběžel a žádný pomocnýprocesnezůstává. Nicstaged/commitnuto. Claim se po předáníuvolňuje; taskstatus integruje root.

SHA256 finálních vstupů:
- client/cinematic.ts: 01c8df6d51269203c5263e9cb37dc825eec1d29103a4674cd87ed8f9feaa5996
- client/vehicle-lighting.ts: e223869384d30b315101af3803668d26a4295b1f5d272b34aa369e4277084451
- client/flashlight.ts: c78ec997e147e5a587ff6d632cc1e792233b9521692e67cb979111dc6b6c84ed
- tests/cinematic.test.ts: 870345a497ba7e7e16b896037faed808181e6d2b6d0cfdd786ed6170d82fe43d
- tests/lighting-visual-settings.test.ts: 57c552c0c358d03837a1fdc9616b784abf55869cedfc27911148ca0e39f0556a

## Review oprava obnovy autoClear

Po konkrétním nálezu rootu ověřen pinned DefaultRenderingPipeline.dispose: bezpodmínečně nastaví scene.autoClear=true. Původní vlastnická kontrola po dispose proto ztrácela původnífalse a cizífalse zapsané běhemOFF. Oprava nejprve zachytí současnouhodnotu a rozhodne podle written/original o výslednéhodnotě; pak pipeline.dispose a finally obnoví tento výsledek. Pozdní chybná podmínka odstraněna. Ostatnívlastníci/životnícyklus bezezměny.

Regrese nejprve RED2/2 (toolchunk2ec58d, true!==false), potom GREEN:33/33 cílených lighting/cinematic/pipeline/Fresnel/atmosphere kontrol,0fail/skip,exit0,2852.1454ms. Test původnífalse zahrnuje aktivníiretainedOFFpipeline; druhýpřípad cizífalsepoOFF. Scopedstrict tsc client/cinematic.ts+tests/lighting-visual-settings.test.ts PASS, exit0 (session71002). Bezfullbuild/GPU, bezcommitu. Předclaimem bylživýCvalidate mutex; nedošlo kmazánízámku/PID, normálníclaimuspěl po jeho skončení.

NovéSHA256 po opravě:
client/cinematic.ts: afb6edfdee2603140d7e9f2872a47318da0a6b490211563615f63be0f0e61719
tests/lighting-visual-settings.test.ts: 0126ab6efe6ea74ca3224265df6823850e8e993c46f3c192f77db02faa9af252

## Převzetí koordinátorem a WebGL barevná parita

Root převzal dokončené soubory pod claimem `ultra-20261104-root-lighting` pouze pro potvrzený edge-review nález: původní WebGL Low neprocházel všemi kvalitami a nezakazoval materiálové image processing. Vynucené `isEnabled=false` proto nyní platí jen pro WebGPU, kde odpovídá původnímu all-quality startupu. WebGL Medium/High nadále použije dosavadní pipeline setter. Cold vypnuté efekty stále nevytvářejí žádný pipeline.

Testy rozlišují původní cold WebGL barevnou cestu a cold WebGPU Ultra bez postprocess prostředků. Rootův společný cílený běh render-startup + lighting-visual-settings + cinematic: 45/45 PASS, exit 0; `.cache/ultra-graphics-20261104/gate-colour-review.log`. Nejde o GPU/obrazový důkaz. Root má změny převzaté pro finální integraci; žádný pomocný proces nezůstává.

## Navazující oddělení postprocesů od materiálového gradingu

1. Problém: WebGL Low/Ultra začíná s materiálovým gradingem zapnutým, ale první post ON jej neúmyslně vypnul.
2. Doložený mechanismus: pinned Babylon 9.30 public `imageProcessingEnabled` setter mění scene config; vlastní `_imageProcessingConfigurationObserver` synchronizuje tento globální flag zpět do pipeline a mohl by přidat nepovolený imageProcessing průchod. Stejný observer také aktualizuje expozici bloom extractor.
3. Změna: oddělit pouze vlastní pipeline flag a callback od scene gradingu; zachovat expoziční větev callbacku, při OFF ji odložit. Při skutečné změně základní kvality do Medium/High zachovat historické vypnutí gradingu, při post toggle stejné kvality jej neměnit.
4. Metrika: skutečná NullEngine pipeline s pěti průchody bez imageProcessing, neměnný scene grading při ON/OFF/ON, expoziční callback a lifecycle.
5. Správnost: cizí observers nedotčené, adaptér obnoví jen vlastní callback, OFF bez práce a cold Ultra bez alokace; WebGPU false cesta beze změny. Root zachytí grade flag pro rollback kvality, protože historická High→Low cesta je stavová.
6. Přijetí: nové regrese nejdřív RED (2/2, chunk 6a6684), následně cílená lighting/cinematic sada a scoped strict TypeScript PASS; žádný GPU/FPS závěr.

Zamítnuté varianty: obnovit scene flag po veřejném setteru aktivuje imageProcessing pass přes callback; dočasně měnit globální config během callbacku zbytečně notifikuje ostatní vlastníky a může překompilovat materiály. Samostatná ručně složená pipeline by znamenala podstatně větší změnu lifecycle. Vybraný izolovaný adaptér je obdobou již schváleného vlastního resize observer gate a přímo odpovídá pinned kódu 9.30.

### Finální chování a ověření barevné opravy

`installPipelineImageProcessingGate` přebírá pouze callback konkrétního `_imageProcessingConfigurationObserver` nově vytvořené vlastní pipeline a nastaví její interní `_imageProcessingEnabled=false` před `prepare()`. Veřejný setter se nepoužívá, scene config se při post toggle nemění. Původní callback má v pinned 9.30 dvě funkce: expozici bloom a synchronizaci globálního grading flagu do pipeline. Adaptér zachovává pouze expoziční funkci; během OFF neprovádí ani tu. ON jednou načte aktuální exposure do současného extractoru. Vlastní observer má stále stejnou identitu, při chybě/dispose se původní callback obnoví jen pokud stále patří adaptéru; Babylon provede své původní odstranění. Cizí observers, jejich callbacky a notifikace zůstávají beze změn.

Platí dva oddělené kontrakty:
- Přepnutí pouze postProcesses u stejné základní kvality zachová aktuální materiálový grading, exposure a contrast. WebGL cold Low/Ultra tedy zůstává true i při ON/OFF/ON; ruční pozdější grade změna se nepřebije. Řetězec má přesně pět bloom/FXAA průchodů bez imageProcessing.
- Skutečný přechod základní kvality do Medium/High nastaví grade=false jako původní Medium/High preset. Návrat do Low historicky ponechává false; cold WebGPU false odpovídá původnímu všekvalitovému startupu. To není efekt post přepínače. Root výslovně potvrdil zachování této historie a přidal interní zachycení grade flagu pro rollback neúspěšné změny kvality.

Finální cílený příkaz: `node --import tsx --test tests/lighting-visual-settings.test.ts tests/cinematic.test.ts tests/cinematic-pipeline.test.ts tests/cinematic-fresnel-disposal.test.ts tests/cinematic-atmosphere.test.ts tests/vehicle-lighting.test.ts` — **45/45 PASS**, 0 fail/skip, exit 0, 3714.8486 ms (chunk ade897). Nové regrese pro Low ON/OFF/ON a quality transition byly před opravou RED 2/2 a po opravě GREEN. Zahrnují skutečné pipeline contents, OFF exposure skip/ON catchup, cizí observer, obnovení vlastního callbacku před dispose a následné odstranění. Stávající OFF resize/reenable, cold bez alokací, selhání prepare a autoClear lifecycle regrese rovněž PASS.

Scoped strict TypeScript nad `client/cinematic.ts` a `tests/lighting-visual-settings.test.ts`, ES2022/ESNext/bundler, resolveJsonModule, allowSyntheticDefaultImports, esModuleInterop, skipLibCheck, types node: PASS, exit 0 (session 98902, chunk 942ed2). První TS kontrola našla přímý přístup k private bloom; následný úzký pinned typ a jedna vlastněná syncExposure closure odstranily duplicitu přístupu a splnily kontrolu. `git diff --check` PASS. Neproběhl full build/GPU/commit, žádný pomocný proces nezůstává. Claim po předání uvolněn pro root.

Finální SHA256 této opravy:
- `client/cinematic.ts`: `d11a2592df851debe774e348ce0dd37cfe93c1a0a79795e0da32d1376c32ce9b`
- `tests/lighting-visual-settings.test.ts`: `469073ffd6434ba46bafadafffbf924ede24c8015a415af9ba8fd4996c1178ad`
