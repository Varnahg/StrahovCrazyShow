# PCF readiness context candidate

## Průzkum a rozhodnutí před implementací

21.10.2026, task webgpu-completion-pcf-readiness-20261021 nad d6232624. Actual source80395553/build2cbf4a05/helperc951 receipt7416b596 ze cm-lifetime-attribution-run-4 přiřadil všech812 final validation jobs ke406 novým derived depth Effectům jediného tree__ipr-crown-029__lod1__leaves/material507/pass9/generator5. useInstances/regular/thin jsou0, visible batch null. Před release je cache identity shodná/ref0, disposedAtBind0 a lateCompile0. Historical overflow je přiznaný, final module coverage812/812. Base Effect161/163 jsou vraceny opakovaně ze stávající cache. Actual colorWrite flag receipt neobsahuje; níže doložený CPU mechanismus je silný kandidát, kauzalitu rozhodne až root frozen GPU před/po.

Primární pinned Babylon9.30 `ShadowGenerator` onBeforeRender pro FILTER_PCF volá setColorWrite(false), onAfterUnbind true (shadowGenerator.js:757–776). `PBRBaseMaterial._prepareDefines` volá při readiness `PrepareDefinesForFrameBoundValues`, který přepíná DEPTHPREPASS podle !engine.getColorWrite() (materialHelper.functions.js:944). Game mesh complete check volá shadow.isReady mimo skutečnou PCF render transaction, se stejným shadow passId, ale main colorWrite=true. Fresh wrapper správně refreshuje base PBR před výběrem depth effectu; při nekonzistentním kontextu však onEffectCreated notify přepíná dva existující base Effecty a pinned ShadowDepthWrapper ruší derived entry pro tento submesh. Předchozí inline actual PBR/Fresh/ShadowDepthWrapper CPU reproduktor true/false/true/false/true dal base0/2/0/2/0, depth1/3/4/5/6, předchozí derived disposed, useInstances=false.

Factory nesignalizuje churn nových materiálů: vegetation sdílí3 source PBR materiály; streamed LOD přebírá sharedTreeMaterials referenci, TreeWind mění uniformy a crown shading geometrii jednou. Jde o PBR, nikoli leaf ShaderMaterial. Actual base identity flip i CPU příčina proto neodůvodňují generic instancing/helper/LOD opravu.

| Varianta | Cache/lifecycle/vzhled/náklady | Rozhodnutí |
|---|---|---|
| PCF-only false scope v existujícím Fresh wrapperu | Pouze synchronní push/pop původního bool; žádný nový materiál/program cache, hot swap, texture/wind/geometry změna; false během skutečného draw je no-op | Zvoleno |
| Clone/pass materiály | Více UBO/material contexts/plugins/wrappers, vlastnictví sdílených textur; neserializovaný TreeWindPlugin musí být obnoven. Stejný submesh stále může přepínat DEPTHPREPASS | Odmítnuto |
| Globální pinpatch DEPTHPREPASS | Zasáhne legitimní depth-only/prepass a ostatní materiály/backendy | Odmítnuto |
| Bounded derived-variant cache | Maskuje chybný kontext, drží více Effect/GPU resources a vyžaduje novou invalidaci/eviction/refcounts | Odmítnuto |
| Vynechat base freshness/validation nebo prodloužit timeout | Vrací stálé staré LightN layouty/nesprávnou readiness, nezachovává kontrakt | Odmítnuto |

Kandidát použije native boolean getter `generator.usePercentageCloserFiltering`, ne magic enum nebo novou globální policy. Po původních ownership/retirement guards bude scope zahrnovat CELÝ původní base+super+layout postup. Ve finally vrátí původní bool; jižfalse nevolá setter. Ostatní filtry/WebGL/custom ShaderMaterial zůstanou původní. Refaktor nesmí přidávat dlouhodobý per-frame state/closure cache ani zdvojit readiness body. Scope je synchronní, přes žádný await nepřetrvá.

CPU regrese mají skutečný PBR/Scene/Mesh a Fresh/pinned ShadowDepthWrapper, stejný pass a explicitní compiled Effect/null-device IO. Red→green má uchovat stabilní base/depth identity po zahřátí přes vnější true/false, alpha/light layout freshness a original false/throw/dispose. Dále nested/no-opfalse, ostatní filtry, finally/pass/override a minimální setter count. Nejde o WebGPU shader kompilaci/obraz/startup/FPS. Root vlastní nový snapshot5 a GPU přijetí; child nespouští fullsuite/build/server/GPU ani necommitne.

## Kandidát a ověřovací příkazy

Runtime sjednocuje původní opakované retirement/pass/override podmínky do private isCurrent a přesouvá jediný původní base+super+light-layout postup do private isReadyInCurrentContext. Public method po původním material ownership guardu z native PCF getteru převezme původní colorWrite bool, uvnitř try změní pouze true→false a ve finally jej obnoví. Jižfalse a non-PCF setter nevolají. Žádné nové dlouhodobé stavové pole/closure cache nebo změna lights/alpha/shader defines policy nevzniká.

```powershell
node --import tsx --test --test-reporter=tap tests/webgpu-shadow-pcf-state.test.ts
node --import tsx --test --test-reporter=tap tests/webgpu-shadow-pcf-state.test.ts tests/webgpu-shadow-freshness.test.ts tests/webgpu-shadow-depth-wrapper.test.ts
```

`red-tests.tap`/`red-verification.json` zachovají skutečný předimplementační exit1 a base0/2/0/2/0 proti depth1/3/4/5/6 s disposal. První green stejného fixed-pass scénáře má jedinou base1/depth2, stále DEPTHPREPASS=true a žádný disposal přes všechny vnější true/false hodnoty. Nové testy pozorují skutečný original base/native super/depth selection kontext včetně standalone once-only refresh a nested no-op, minimální setter calls, native NONE/POISSON/PCSS/ESM filtry, returnfalse/původníthrow/wrapper+mesh+scene+engine disposal i guard returns před state write. Původní14 freshness regressí zůstávají beze změny a shader-depth testy pokrývají původní alpha/WGSL/GLSL varianty.

Alpha test záměrně nejprve ověří false s pending RawTexture. NullEngine.createRawTexture nevykonává GPU upload a nenastaví InternalTexture.isReady; fixture pak explicitně dokončí jen tento terminal IO bit. Skutečná PBR/texture readiness metoda se nestubuje. Alpha cutoff a aktuální light layout musí dál vytvořit nový správný effect; po zahřátí opět stabilní identita. První vývojový20/21 běh selhal pouze na neukončeném NullEngine raw uploadu v novém alpha fixture, nikoli na scope/freshness testech. Následný alpha-only průchod prošel; finální společný proof uvádí verification.json.

Scoped TypeScript program používá pouze runtime wrapper a oba freshness/pcf testy jako3root files se stávajícím tsconfig/noEmit. Nejde o pnpm build. Source/pin SHA před/po, TAP a typecheck log jsou explicitní CPU důkazy. Actual GPU colorWrite příčinnost, samostatný nový snapshot/bundle, health/startup/celý obraz i výkon zůstávají root přejímkou; CPU výsledky za ně nejsou vydávané.

První společný37/37 průchod měl jediný scoped TS diagnostic v nové testové zkratce FILTER_ESM, kterou pin neexportuje. Nahrazeno skutečnými nativními FILTER_EXPONENTIALSHADOWMAP a dalšími ESM family konstantami a přidána kontrola jejich integer identity; původní undefined položka se nevydává za ESM důkaz. Runtime kandidát kvůli tomu změněn nebyl. Finální proof je až po této opravě.
