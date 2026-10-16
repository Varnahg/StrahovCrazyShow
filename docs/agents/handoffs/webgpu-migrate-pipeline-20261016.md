# Předání: webgpu-migrate-pipeline-20261016 (KEY-31)

Vlastník `webgpu-mig-01a14497-pipeline`, příjemce root, WT `C:/Users/rezac/.codex/worktrees/webgpu-comparison/StrahovCrazyShow`, větev codex/webgpu-migration. Claim získán před zápisem. Tento díl je měření pro první native GPU profil; nezavádí dosud žádnou výkonovou optimalizaci ani vendor patch.

## Průzkum a rozhodnutí před implementací

Pinovaný Babylon9.30 odděluje synchronní glslang/Tint CPU konverzi, vytvoření shader modulů a pozdější render-pipeline cache miss. WebGPU areAllEffectsReady vrací true a PipelineContext.isReady kontroluje jen stages. Běžný draw volá device.createRenderPipeline; driver může blokaci odložit do prvního použití/submission. Dosavadní5s callback neměřil tyto části samostatně. Convenience async prewarm používá geometry-only buffers, overrides=null a textureState=0, takže jej nelze bez ověření použít pro skutečné instancing/shadow/postprocess stavy. ShaderLanguage chybí v effect cache key; native baseline potřebuje nový čistý engine.

Varianty: globální prototype/navigator patch by smíchal editory a hry; čtení globálních Babylon cache counters by bez scope připisovalo práci jinému enginu; okamžitá async optimalizace by hádala nezměřenou příčinu. Zvoleny vratné metody pouze na konkrétním engine/device/queue/Tint objektu, bounded aggregate čítače, CPU call time odděleně od async completion latency, callbacky na root-owned RenderHealth. Původní return/Promise/throw identity zůstane zachovaná. Snapshot výslovně označí nepřipojené hooks a globální scope statických Babylon counters. Nebude obsahovat shader zdroje ani per-frame shader dumpy.

Factory-returned attachment měří tvorbu scény a gameplay, nikoli již dokončené engine init. Při attachment před init využije pinovaný per-engine _initializeLimits hook přístup k novému device před inicializací clearQuad; bez globálního requestDevice zásahu. Fulfilled getCompilationInfo se čte pro zprávy typu error, nikoli jako automatický compile success. Async pipeline rejection se musí pozorovat přímo, nemusí vyvolat uncapturederror. Stará generace/disposed owner nesmí dopisovat nový snapshot. RenderHealth.track dostává diagnostickou větev s vlastní catch; volající stále dostává původní promise.

Další výkonový krok až po native GPU profilu: rozhodnout, zda zbývá konverze, syntaktický/variantový problém, module creation nebo první pipeline/submit. Bez přesného descriptor/cache token a proof hit neměnit cache. Případný vendor patch vyžaduje další výzkum/rezervaci a koordinaci s vlastníkem shadow patch/lock.

## Implementovaný profilovací díl

Scope tohoto commitu: client/webgpu-compilation-profile.ts, tests/webgpu-compilation-profile.test.ts a tento handoff. Vlastní izolované vstupy/logy pouze .cache/webgpu-migration-checks/pipeline/. Ostatní povolené pipeline/light soubory tasku nejsou změněné. Root vlastní Game/factory zapojení.

API: `new WebGpuCompilationProfile(engine, { now?, onError?, track?, slowCallMs?, onSlowCall? })`, `snapshot()`, `dispose()`. onError(channel,error,label) předá synchronní/diagnostickou chybu rootovu RenderHealth.report. Async operace při dodaném track projde RenderHealth.track; vrácená diagnostická větev má vlastní catch a původní return/Promise/throw identita se nemění. Fulfilled getCompilationInfo s messages.type=error je chyba, warnings ne. Label je omezen na160 znaků; shader zdroje nejsou ve snapshotu ani standardním logu.

Devět oddělených fází: glslToSpirv, spirvToWgsl, compilerLoad, shaderPreparation, shaderModule, shaderValidation, syncPipeline, asyncPipeline, submit. Každá má counts, completed/failures/pending, CPU call total/max a async completion total/max. CPU scopes jsou inkluzivní a mohou se vnořovat: nesčítat shaderPreparation+konverzi+module jako disjunktní čas. Completion latency zahrnuje čekání/scheduling, není GPU time. Failures jsou selhání API operací, ne deduplikovaný počet prvotních incidentů. Maxima jsou lifetime aktuální device generation, nikoli delta maximum od předchozího snapshotu. Čistá generation se vytvoří při výměně device.

`onSlowCall({phase,label,cpuMs,generation})` běží pouze pro synchronní call nad nastavitelným prahem (default25ms), nikdy pro každý frame. Root jej připojí na webgpu-work event. Callbacky se vyvolávají až po ukončení CPU měření a jejich výjimka nepřepíše původní operaci. Žádný queue.onSubmittedWorkDone nebo blocking readback se nepřidává.

Hooky jsou vlastní instance engine, device, queue a případně později vzniklého Tint objektu. `_createPipelineStageDescriptor` připojí Tint před první skutečnou konverzí i tehdy, když health tracking prodlouží mikroúkolovou cestu compiler-load Promise. Cleanup obnoví původní own descriptor nebo odstraní vlastní shadow metodu; cizí pozdějšího vlastníka nepřepíše. Retained wrapper po dispose pouze deleguje. Device restore uklidí staré metody a pozdní staré výsledky nemění nové counters/callbacky. Druhý současný owner stejného engine se odmítne; sdílení stejného device se označí ownership-conflict.

Snapshot explicitně uvádí dostupnost každého hooku. perengine countersLastFrame jsou kopie. Babylon statické cache counters mají samostatný popis, že jsou společné všem enginům v JS realm; nejsou vydávané za počet game-only cache hitů. Module getCompilationInfo dostupnost se zjišťuje až na skutečném shader modulu. attachedAfterDeviceCreation rozlišuje profiler po engine init od attachment před init. Aktuální RenderHealth watcher se před init nesmí automaticky považovat za připravený: správu rootovy factory instalace vlastní root.

## Ověření

- První cílené testy9/9 PASS, rozšíření11/11 PASS. Původní targeted typecheck zachytil1 chybu veřejného strukturálního interface proti private _tintWASM v pinovaném WebGPUEngine. Opraveno interním strukturálním čtením, vnější API nepotřebuje cast. Zachováno `types-v1.log`.
- Finální `node --import tsx --test --test-concurrency=1 tests/webgpu-compilation-profile.test.ts`: **12/12 PASS**,0.596s,exit0 (`profile-final-v2.log`).
- `node typecheck.mjs`: **2957 souborů,0diagnostik**,exit0 (`types-final-v2.log`). Zahrnuje explicitní kontrakt s AbstractEngine, WebGPUEngine a RenderHealth.track.bind, nikoli jen fake engine.
- Regrese používají skutečný Babylon Observable a deterministické device/queue/Promise doubles bez GPU: zachování receiver/return/throw identity, slow event timing a bounded label, fulfilled compile errors/warnings, chyby getCompilationInfo, vlastní async catch, generation/dispose, pre-init device a první lazyTint, pozdější owner a nepřipojitelné hooks. Samotné dummy timings nejsou měřením hry.
- Scoped formatter a git diff --check PASS. `manifest.json` obsahuje SHA runtime/test/handoff. Žádný vlastní proces nezůstal; žádný GPU/build/full-suite/server/install nebo vendor edit nebyl proveden.

## Navazující rozhodnutí po prvním native GPU profilu

Nejdříve rozlišit skutečně zbývající conversion calls od native shaderModule/syncPipeline/submission CPU blokace, a uložit start/end snapshots i slow events pro první F. Pokud konverze zůstává, najít konkrétní nepřevedenou cestu; neoznačit nativní migrační checkpoint za úplný. Readiness musí zahrnovat chyby a outstanding vlastní promises, nikoli areAllEffectsReady=true.

Pokud profil potvrdí pipeline miss jako příčinu, další návrh musí použít skutečný draw descriptor/cache token, včetně override instancing buffers, textureState, vertex layout, MSAA, target/depth formátů a všech blend/depth/raster stavů. Raw createRenderPipelineAsync samo bypassuje Babylon cache. Případný engine/cache patch musí umožnit čekající přípravu před Gameplay.ready bez předání Promise do setPipeline, deduplikovat pending tokeny, zachovat chyby, a odmítnout dokončení z jiného device/cache epoch. Nelze vložit starý pipeline do nového zařízení po restore. Tento patch není nyní implementovaný ani rezervovaný; shadow patch/lock má jiného vlastníka.

Tento commit uzavírá pouze profiler podúkol. KEY-31 celková oprava blokující přípravy zůstává otevřená do prvního nativního měření, rozhodnutí a ověření navazující změny. Po explicitním stagingu tří vlastních souborů, samostatném commitu a předání se claim uvolní; root obdrží commit/release a vlastní navazující profil/integraci.
