# Předání: repair-light-lifecycle

- Vlastník `repairs-01a13624-lights`; příjemce `/root`, koordinátor `repairs-01a13624-root`.
- Checkout `C:/Users/rezac/Documents/GitHub/StrahovCrazyShow`, větev `main`, výchozí HEAD `91ee88f0aaa902c79fad589aeb84bc086a66c9ea`.
- Výsledek: implementované odstranění historie pořadí světelných slotů a opakované stavby stejného postprocess řetězce. **GPU přejímka a první studené zapnutí zůstávají otevřené. Žádný sekundový zásek zde není prohlášen za opravený bez skutečného GPU měření.**
- Změněné soubory: `client/stable-light-state.ts`, `tests/stable-light-state.test.ts`, `client/cinematic.ts`, `tests/cinematic-atmosphere.test.ts`, toto předání. `vehicle-lighting.ts` a `flashlight.ts` jsou jen přečtené. Žádné převzetí cizího dirty WIP; tyto čtyři soubory byly při claim čisté/neexistovaly.

## Doložený mechanismus

Průzkum 13. 10. 2026 vychází z instalovaného Babylon.js **9.30.0**, ne z předpokladu podle názvu API:

1. `Lights/light.js` `setEnabled()` volá `_resyncMeshes()`. `Meshes/abstractMesh.pure.js` `_resyncLightSource()` při zapnutí přidává světlo pomocí `push`; při vypnutí ho odstraní. `scene.pure.js` `sortLightsByPriority()` řadí jen `scene.lights`, nikoli již existující `mesh.lightSources`.
2. `Materials/materialHelper.functions.js` `PrepareDefinesForLights/PrepareDefinesForLight` bere světla právě v pořadí `mesh.lightSources`. Jejich typy, falloff, projekční textury a stíny jsou definice **indexovaného shaderového slotu**. Přepínání pouličních lamp proto může vytvořit další varianty i při návratu stejné aktivní sestavy. Test nejprve bez stabilizace prokazuje rozdílný výstup skutečných Standard/PBR helperů a poté jeho rovnost po stabilizaci.
3. `SHADOW<n>` je navíc podmíněno `shadowEnabled`, existencí generátoru a neprázdným `renderList`. `Rendering/objectRenderer.js` při přechodu renderList prázdný/neprázdný zneplatňuje světelné definice všech meshů. `ShadowGenerator.mapSize/filter/filteringQuality` také označují světelné definice za dirty.
4. `client/art-lighting.ts` mění kapacitu pouličních lamp při zapnutí lokálního světla. Pouhá náhrada `setEnabled(false)` nulovou intenzitou u dvou stávajících lokálních světel by spotřebovala sloty čtyřsvětelného limitu a mohla odstranit původní osvětlení. Proto se nepřidal pátý slot, nezměnily intenzity, světelné rozpočty ani stíny.
5. `DefaultRenderingPipeline._buildPipeline()` znovu tvoří FXAA a připravuje bloom. Dosavadní low řetězec zcela zrušilo a návrat do medium ho znovu sestavil. Změna ho na low odpojí, následný návrat použije totožné objekty. První cold vytvoření zůstává beze změny. Babylon `dispose()` prochází `_cameras`; odpojený řetězec je proto při teardown nejprve znovu asociovaný s kamerou a okamžitě zrušený, bez renderovaného snímku.

Uživatelský vstup: `.cache/playtest-diagnostics-20261013/session.jsonl`, SHA256 `30f15b76b579f872d127c61bbdd4821e8779a6082fffb18001878391d2215f6d`, shrnutí `docs/performance/playtest-diagnostics-20261013.md`. Svítilna ON #312/#314: 1597,8 ms, OFF #638/#640: 1761,7 ms; nastoupení #671/#674: 1504,2 ms; low→medium #842/#844: 2713,8 ms (459,4 ms cinematic). Původní záznam nerozlišoval shader kompilaci od dalších nákladů scene.render, proto tato čísla nejsou důkazem přesné velikosti zlepšení.

Oficiální doplňkové podklady: [Babylon Light implementation](https://github.com/BabylonJS/Babylon.js/blob/master/packages/dev/core/src/Lights/light.ts), [vyjádření Babylon maintainerů k setEnabled a světelným slotům](https://forum.babylonjs.com/t/performance-issue-with-spotlights-setenabled-and-material-maxsimultaneouslights/47473), [Khronos parallel shader compilation](https://www.khronos.org/assets/uploads/developers/presentations/WebGL-06-Intels-Updates-on-Web-Graphics_SIGGRAPH_Jul19.pdf). Přesné chování bylo ověřeno proti lokální zamčené verzi, ne proti současné master větvi.

## Integrace a refaktoring

`new StableLightState(scene)`, potom `.update()` **po všech úpravách světel a stínů těsně před `scene.render()`**, včetně případného preload renderu. `.dispose()` před zrušením scény. Koordinátor zapisuje `game.ts`. Statistiky `revisions`, `visits`, `sorts`, `skipped` jsou kumulativní a dostupné pro průběžný profil.

Stabilizace mění pouze pořadí již existujících světel. Přeskakuje seznamy přes skutečný materiálový/GPU limit, nejmenší limit u MultiMaterial, null/unknown/custom/frozen materiály a neznámé typy světel/generátorů. Nerozšiřuje množinu přispívajících světel. Efektivní enable observer pokrývá i vypnutí a opětovné zapnutí v jediném snímku; počty meshů a okamžitý remove observer pokrývají výměnu před odloženým Babylon add callbackem.

Steady stav čte jen světla a netransformuje/neprochází meshe. Dvě znovupoužívané mapy drží malé signatury aktivních světel; ranky se přepočítají při změně. Odstranění světla odregistruje observer bez každosnímkové kvadratické kontroly příslušnosti. Dispose čistí mapy, frontu meshů i všechny vlastní observery. MultiMaterial průzkum je omezen hloubkou.

Cinematic udržuje nejvýše jednu dříve aktivovanou bloom/FXAA sadu, na low bez průchodů. Tato vědomá omezená cache může na low držet dříve alokované textury; nezvyšuje počet sad opakovanými přepnutími. `pipelineBuilds/pipelineAttached` jsou ve stats. Při odpojení se vypne automaticBuild, aby konfigurační observer sám neobnovil řetězec.

## Ověření a skutečné výsledky

- `pnpm exec tsx --test tests/stable-light-state.test.ts tests/cinematic-atmosphere.test.ts tests/cinematic.test.ts tests/vehicle-lighting.test.ts tests/flashlight.test.ts tests/night-lighting.test.ts tests/art-lighting-budget.test.ts`: **42/42**, exit 0, 13. 10. 2026 cca 20:29 Praha. Zahrnuje skutečné RH pozice kuželu, 128/256/512 shadow lifecycle, čtyři light sloty, occludery a reference osvětlení. NullEngine není vizuální/GPU důkaz.
- Po doplnění samostatného light-observer lifecycle testu a ochrany frozen materiálů finální `pnpm exec tsx --test tests/stable-light-state.test.ts`: **6/6**, exit 0, 20:31 Praha. Finální součet jednotlivých pokrytých případů je 43; celá sedmisouborová sada po posledním úzkém testu znovu spuštěná nebyla.
- `git diff --check -- client/cinematic.ts tests/cinematic-atmosphere.test.ts`: exit 0.
- První nové testy správně odhalily stejný enabled set po OFF→ON v jednom snímku; opraveno effective-enable observerem. Jeden původní assertion nad velkými cyklickými Babylon objekty se zasekl při výpisu neshody; vlastní ověřený proces `tests/stable-light-state.test.ts` PID31344 byl ukončen. Assertions nyní porovnávají konkrétní uniqueId seznamy a další běhy prošly. Žádný cizí proces nebyl ukončen.
- Žádný build, plné testy, integrace, server, port ani GPU proces nebyl spuštěn; patří do koordinátorova `repair-production-validation`. Typovou kontrolu společného checkpointu provede integrátor.

## Snapshot změněné implementace včetně testů

| Soubor | SHA256 |
|---|---|
| client/cinematic.ts | 57B4A6BBC39448481D740FF490761DFC68B00A6A565EAFD550084EF02DB85193 |
| client/stable-light-state.ts | 4ADFB37DAE15CA6A0B9E1B65634266B6791FFC1D8C1ACA01858A9557C7F7B8BC |
| tests/cinematic-atmosphere.test.ts | 4CBCE25EDED68292C950E620681FDEE4A324EECAC2786A46F249E576FD0FD770 |
| tests/stable-light-state.test.ts | DA9FDB75827D310FF408F05DC0C0BC3A84556EE2B88C9630269DEF3576AB181B |

## Zbývající přejímka a otevřené příčiny

Potřebné: skutečná produkční hra ve stejném rozlišení/GPU s HUD, cold a warm ON/OFF svítilny, nástup/výstup, průjezd pouličními lampami, low→medium→low→medium a high; evidence efektů/kompilací, FPS/p95/p99 a režie `StableLightState`. Zachovat vzhled a occlusion, zejména sloty B6/street/beam. Pokud profil nepotvrdí přínos nebo odhalí velkou režii přechodů, pokračovat ve změně; tyto testy nejsou tvrzení o dosaženém FPS.

`forceCompilationAsync` není obecné asynchronní odstranění práce: v instalovaném `material.pure.js` první checkReady běží synchronně a opakovaná kontrola StandardMaterial znovu čte aktuální mesh. Přepnout sestavu, zavolat promise a okamžitě sestavu vrátit by nepřipravilo spolehlivě zamýšlenou variantu. PBR má odlišnou větev. Bez konečné sady proxy meshů a jejich skutečných defines/textur/instancí by šlo o neověřené zahřívání. MaterialPlugin by musel nahradit built-in výběr a výpočet světel pro Standard i PBR; nejde o lokální přepínač, který bezpečně zachová čtyři sloty.

- Rezervace: předání připravené, po odeslání integrátorovi uvolněna příkazem `release`; žádné pomocné procesy nezůstávají běžet.
- Integrátor: doplní hooky, typovou/GPU přejímku a `docs/verification.md`; stav tasku mění pouze koordinátor. KEY-3/4 jako celek nejsou touto dílčí implementací hotové.
