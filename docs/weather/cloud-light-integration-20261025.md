# Zapojení maskovaného přímého světla – 25. 10. 2026

## R3: doložený skok v extrakci bloom, denní GPU oprava přijata

Koordinátor předal GPU **A/B/A důkaz** z nového neměnného `source-r2-v1` (source ID začíná `af8c9ccb`), IAB browser2/tab1, WebGL2,1260×702,Medium, jasné DEMO a UTC2026-10-25T10:00Z,spawn110/12,heading přibližně171°. Bloom ON: široký světlý obdélník x≈310–945,top≈175; bloom OFF: obdélník zmizí, zůstane hladký sky gradient; ON: stejný artefakt se vrátí. Slunce/obloha/ostatní postprocessy nebyly změněny. To **potvrzuje bloom větev**, nikoli ještě konkrétní framebuffer/viewport mechanismus. Původní screenshot a server2591 zůstaly neměnné.

Root explicitně předal vlastní `setDiagnosticBloom` a uvolnil rezervaci; worker `weather-bloom-r3` získal claim s `--adopt-dirty` doloženého staršího scope + této QA metody. Žádná engine patch cesta není rezervovaná. Níže uvedený původní průzkum zůstává historickou evidencí před GPU izolací.

### Pinovaný řetězec znovu ověřený před opravou

`PostProcess.activate` počítá velikost RT z `_options` (bloomScale0,5); při běžném `enablePixelPerfectMode=false` váže framebuffer s plným viewportem targetu a `_scaleRatio=(1,1)`. `forceFullscreenViewport` default=true. `DefaultRenderingPipeline` všem aktivním passům nastaví `adaptScaleToCurrentViewport=true`, ale to samo pouze mění velikost cílové textury. Native `postprocess` i `kernelBlur` vertex shaders kreslí `gl_Position=vec4(position,0,1)`; `PostProcessManager` vlastní fullscreen vertex data ±1. `scale` v neblur shaderu mění UV, nikoli NDC geometrii. Proto poloviční velikost textury sama o sobě nevysvětluje centrální půlku obrazovky. [Oficiální Babylon dokumentace](https://doc.babylonjs.com/features/featuresDeepDive/postProcesses/defaultRenderingPipeline) rovněž používá bloomScale0,5 jako standardní konfiguraci.

Zvažované varianty: vypnout bloom je pouze diagnostika; bloomScale1 by zvýšilo fragmentovou cenu a mohlo problém jen maskovat; vynucené clear/black blur targety by skryly nezapsané pixely bez opravy chybných draw bindings; kompletní vlastní bloom graf přidá zbytečné vlastnictví zdrojů, pokud stačí malá doložená oprava. Volba skutečné opravy bude až podle pass capture. Scope neobsahuje engine patch a nebude rozšiřován bez koordinátora.

### Jednorázový capture kontrakt

`await cinematic.captureDiagnostics()` zachytí jeden **přirozeně vykreslený** frame, nejvýše8 passů. Výsledky jsou serializovatelné; status je `captured/incomplete/timeout/disposed/no-pipeline`, `frameId`, UTC start a velikost renderu. Každý pass má před/po záznam rozměrů, options, scaleRatio, pixel-perfect/fullscreen/viewport flags, vstupního/výstupního/current-engine RT a jeho vlastnictví, GL viewport/scissor/framebuffer/program, scale uniformu, sampler binding cache a position atributu. Opaque GPU objekty jsou nahrazené identifikátory lokálními jednomu capture; vertex shader je omezený na posledních8192znaků.

Capture nemění GL stav, nepřidává render ani žádný nevynechá. Původní v2 kontrakt nečetl pixely; následná v3 verze níže přidala omezené čtení už vázaného framebufferu. Má defaulttimeout2500ms/max5000ms, souběžné požadavky sdílejí tutéž Promise, všechny observers/timer se uklidí po výsledku, timeoutu i při scene/controller dispose. GL dotazy běží jen během výslovného QA requestu, nikdy v běžném update. `onBeforeRender` Babylonu nastává před `bindBuffers`, proto pro skutečný **position buffer použít after záznam**; before viewport/program už odpovídá připravovanému passu.

Cílené lifecycle testy tohoto mezikroku: **9/9 PASS, exit0**, log `.cache/weather-cloud-light-integration-20261025/bloom-capture-tests.log`. Dva nové testy simulují observable dispatch/timeout/disposal, ověřují coalescing/odpojení a zachování stejné postprocess chain. Jde o CPU test API, nikoli opravu obdélníku. Root vytvoří nový frozen diagnostický kandidát a vystaví capture v explicitním DOM `<pre>`; aktivní2592 se nepřepisuje.

### Skutečný v2 capture a další diskriminátor

Koordinátor předal `source-r2-v2` (source ID začíná `3f062218`),frame7876,1260×702,WebGL2,Medium. Artefakt existuje i při **startu přímo v této velikosti, před jakýmkoli resize**. Všech5passů má správný viewport od0,0 do velikosti outputu, scissor disabled, správné vlastníky/input/output textury, scale=[1,1], shodný očekávaný GLprogram. Všechny AFTER position atributy ukazují na stejný buffer,location0,size2,stride8,offset0,divisor0. Samplery odpovídají přesně řetězci full→half→half→half→full→canvas. Skutečný GLSL vertex shader obsahuje fullscreen `gl_Position=vec4(position,0,1)`. Hypotézy prostého double-size/POT/viewport/sampler přepojení tedy tento capture **nepotvrdil**.

Na explicitní pokyn rootu byl stejný jednorázový capture rozšířen: čte pouze již vázaný ARRAY_BUFFER přes `getBufferSubData`, pokud odpovídá position atributu a má alespoň32bajtů; porovná8floatů s původními CPU quad daty. Dále čte15 jednotlivých RGBA pixelů z aktuálního READ framebufferu v pravidelné mřížce u=.1/.3/.5/.7/.9,v=.9/.7/.5 (souřadniceGL, zdola). Pixel probe běží pro scene source v `onAfterDrawPhaseObservable` a před/po každém passu. Query zahrnuje také skutečný blend/depth/stencil/color-write mask a delta/threshold/exposure/bloomWeight uniformy.

`readBoundBloomPixels` přijímá pouze **inzerovaný** IMPLEMENTATION_COLOR_READ_FORMAT=RGBA a TYPE=UNSIGNED_BYTE/FLOAT/HALF_FLOAT s odpovídajícím typedarray; jiné kombinace přeskočí. Ověří shodný READ/DRAW framebuffer, completeness, offscreen multisample, nulový PBO a pack row/skip stav. Nic nepřevazuje, nemění pack/unpack, neprovádí resolve ani nemaže GLerror state. Half-float se dekóduje, NaN/Infinity se zachová textově, ne jako nenápadné JSONnull. Zdrojový framebuffer je snímán právě před postprocess chainem, ne pozdějším převázáním.

**10/10 cílených testů PASS, exit0**, log `bloom-pixel-capture-tests.log`: navíc validace typů/počtu/výstupních pixelů a že nepodporované stavy nevyvolají žádný readPixels. Tato diagnostika má explicitní jednosnímkový GPU readback náklad; není používána při běžném hraní ani výkonovém benchmarku. Skutečná oprava stále čeká na první pass, jehož obsah prokáže obdélník.

### v3b: první skok vzniká v extrakci, nikoli v bindování nebo blur geometrii

Úplný skutečný GPU capture je `.cache/b6-photo-refinement-20261024/revision2/bloom-gpu-v3b.json`, SHA256 `f19a264f158a808386dd5e13dbd7fc54c93cc1bd0f770f4f6e0f0514beb50c58`. Všech8GPUfloatů quad bufferu odpovídá CPU `[1,1,-1,1,-1,-1,1,-1]`. Horizontální/vertikální delta jsou1/630 a1/351, blend/depth/stencil testy v postpasses vypnuté, všechny color kanály zapisované. Resize a poškozený fullscreen buffer nebyly potvrzeny.

Pro UV(.3,.7) má **scene source před bloomem** RGB(.820801,.950195,1.052734). Luminance s captured exposure1.08000004 je1.0044965, jen0.0228809 nad captured threshold0.98161566. Pinovaný [Babylon shader](https://raw.githubusercontent.com/BabylonJS/Babylon.js/9.30.0/packages/dev/core/src/Shaders/extractHighlights.fragment.fx) přesto propustí **celé RGB** pomocí binárního step. Oba blury toto plošné pole téměř nemění; merge správně přidá vážených10 %, výsledné G/B přesáhnou1 a canvas je ořízne. Vedlejší UV(.1,.7) má luminance.8854358 a nulovou extrakci. Všech15vzorků odpovídá stejnému mechanismu; rozdíl merge−source odpovídá0.1×blur s FP16/odlišným texelcentrem do≈.001.

To dokládá nežádoucí skok a plošné přisvícení jasného pozadí. Přesný vizuální tvar uživatelova obdélníku bude uzavřen až opravným GPUA/B, nikoli samotnými15vzorky.

| Varianta extrakce | Důsledek | Rozhodnutí |
| --- | --- | --- |
| Vyšší threshold / nižší weight | Přesune/sníží skok, ztlumí legitimní lampy a Slunce | Neřeší mechanismus |
| exposure=1 | Změní jasovou hranici, hard step zůstane a týká se i nočního zdroje | Není samostatná oprava |
| Výjimka pro sky/stencil maska | Odstraní i požadovaný glow nebeských těles, přidá pass/ownership | Zbytečně široké |
| Spojitý excess jas + quadratic knee | Při nepatrném překročení nepropustí celý pixel; silné světelné zdroje zůstanou | Zvoleno |

Primární porovnání: [Unity PostProcessing, Colors.hlsl, QuadraticThreshold](https://raw.githubusercontent.com/Unity-Technologies/PostProcessing/v2/PostProcessing/Shaders/Colors.hlsl) používá spojité koleno a přebytečný jas normalizovaný původním jasem. Zde zůstává Babylonova luminance, exposure i threshold převod; mění se pouze převod výsledné luminance na váhu extrakce. Koleno0,08 je výtvarná šířka, ne meteorologický údaj. V doloženém bodu sníží extrakci z≈.82/.95/1.05 na≈.027/.031/.035, bez vypnutí bloom.

Implementační volba: veřejný per-name `PostProcess.RegisterShaderCodeProcessing`, unikátní owner jméno a cache discriminator `CAMPUS_BLOOM_SOFT_KNEE_V1`. Nahrazuje pouze jediný step ve standardním extract shaderu proGLSL/WGSL, ponechá texturu/UV/alfu a celý standardní blur/merge graf. Registrace se odpojí při dispose konkrétního passu; žádné přepsání globálního shader store, cizích highlights passů ani engine patche. Pinned-source invariant při změně receptu selže explicitně, nikoli tichým návratem vadného shadera. Nové resource/passy nejsou potřeba. GPUcena nad běžnou hrou dosud neměřena.

### Stabilní implementační checkpoint před v4 GPU kontrolou

Runtime oprava je omezena na `client/cinematic-art.ts` a `client/cinematic.ts`. Vlastní nový extraction pass je nalezen podle identity v přírůstku veřejného `engine.postProcesses` a `getEffectName()`, nikoli soukromým `pipeline.bloom` nebo jménem cizího passu. Jeho jedinečné jméno začíná `campus bloom highlights`; stabilní define oddělí cache od stock shadera, ale nevytváří nový shader pro každý owner. Hook se instaluje před `prepare` a automaticky odpojí při dispose konkrétního passu. Průběžné update nemá další alokace ani GL dotazy.

`pnpm exec tsx --test tests/cinematic-art.test.ts tests/cinematic-atmosphere.test.ts tests/opaque-sort.test.ts` → **27/27 PASS, exit0, 3,84 s**, `.cache/weather-cloud-light-integration-20261025/bloom-soft-final-tests.log`. Regrese používá zachycený RGB bod a hash původního GPU capture; ověřuje spojitost/monotónnost odezvy, zachování silného HDR zdroje, přesnou transformaci obou pinovaných shaderů, nedotčený globální shader store, oddělenou Effect cache a odstranění hooku. Skutečný ExtractHighlightsPostProcess prochází cestou kompilace v NullEngine; nejde o GPU důkaz.

`pnpm exec tsc --noEmit --pretty false` → **exit0**, `.cache/weather-cloud-light-integration-20261025/bloom-soft-final-typecheck.log`. Dřívější neúspěšné typové logy jsou zachované; finální kontrola ověřuje opravený veřejný výběr passu. Native Babylon WGSL processor navíc zpracoval změněný shader pro obě reverse-depth konvence se zachováním scale/threshold/exposure a jediného sampleru; `.cache/weather-cloud-light-integration-20261025/bloom-soft-native-processing.json`. To opět dokládá pouze CPU zpracování skutečného rozhraní, nikoli WebGPU výsledek.

Nezávislá čtecí kontrola nenašla další konkrétní vadu v hook fázi, vlastnictví, cache discriminatoru či lifecycle. **Vizuální přijetí čeká na rootův neměnný v4 kandidát**: stejný denní reprodukční pohled s bloom ON/OFF, capture zdroj/extrakce/merge, noční lampy a Slunce pro zachování legitimního glow, případně resize a druhý backend. Shader zůstává s bloom zapnutým; samotný pokles pixelové extrakce není důkaz odstranění celého obdélníku.

### v4: denní GPU reprodukce opravena při zapnutém bloom

Koordinátor vizuálně ověřil neměnný `source-r2-v4`, source ID `9a495d0a9817a25398b9c59f5863f46743432e4db807442788499c5a21b6c456` (ověřeno v `revision2/freeze-v4.json`), IAB, **WebGL2, Medium, CSS/render1260×702**, jasné DEMO, UTC2026-10-25T10:00Z. Ve stejném reprodukčním pohledu yaw0,14159265358979312,pitch−0,12 a pozici přibližně(110,−1,5351,12) je při **výchozím bloom ON obdélník nepřítomný**, sky gradient plynulý a Slunce zachované. Jde o rootův skutečný GPU vizuální výsledek, nikoli úsudek z NullEngine.

Úplný capture frame4718 je `.cache/b6-photo-refinement-20261024/revision2/bloom-gpu-v4-fixed.json`, SHA256 `4af615cc012a55c0c7c1bce0212aff74e462ce7298e44de141ec749c5b11a086`. Vlastní extractor má jméno `campus bloom highlights 1`. RGB ve stejném UV(.3,.7):

| Stage | R | G | B |
| --- | ---: | ---: | ---: |
| Scene source | 0.82080078125 | 0.95068359375 | 1.0537109375 |
| Highlights | 0.0274658203125 | 0.03179931640625 | 0.03521728515625 |
| Vertical blur | 0.0275115966796875 | 0.0318603515625 | 0.0352783203125 |
| Merge | 0.8232421875 | 0.95361328125 | 1.056640625 |
| FXAA/canvas | 0.8235294117647058 | 0.9529411764705882 | 1 |

Captured threshold0,9816156625747681 a exposure1,0800000429153442 zůstaly stejné. Analytická odezva pro vzorek scene source dává luminance1,0049498485, váhu0,0332042502 a RGB(0,02725407;0,03156674;0,03498768); rozdíl od skutečné extrakce je nejvýše0,000233 a odpovídá odlišnému texelcentru full/half targetu a FP16. Dřívější stock shader ve stejné oblasti propouštěl celé~0,82/0,95/1,05. Toto je další důkaz, že se na skutečném GPU uplatnila zamýšlená oprava extrakce. Samotný zdrojový modrý kanál již přesahuje1; omezení canvas do1 zůstává běžnou vlastností řetězce a neznamená navrácení obdélníku.

Denní reprodukce je tedy **GPU PASS a koordinátorem přijata**. Runtime od tohoto kandidáta nebyl dále měněn.

Koordinátor dále kvalitativně ověřil v4 noční scénu „Úplňková noc“, astronomical instant1792968096837, jasné DEMO, CSS/render1260×702,Medium,WebGL2. Streetlamp, teplá okna a HYG hvězdy jsou viditelně vykreslené a nevzniká nový obdélníkový plateau; screenshot je v koordinační konverzaci. **Patnáctibodová RGB mřížka míjí tenké jádro lampy**, proto z tohoto výsledku neplyne samostatná GPU kvantifikace energie nočního halo ani poměru před/po. Retence silného HDR zdroje je numericky testovaná na CPU a skutečná denní extrakce doložená GPU capture. Žádný další runtime fix nebyl požadován.

Cena celého produkčního weather řetězce, úplná matice variant, alternativní backend a případná další resize/quality přejímka zůstávají u koordinátora. Nejde o uzavření velkého zadání fyzikálnější atmosféry.

Task `weather-cloud-light-integration-20261025`, owner `weather-light-integration-r2`, baseline `e7ef3ff63dbb3ed0f771082331d8bb0eee5f2427`. Před zápisem byl získán disjunktní claim. Žádné GPU, server, build ani manipulace hraným klientem 2591.

## Doložená příčina a rozhodnutí před implementací

Předaný `applyArtLighting` již nastavuje `DirectionalLight.intensity` podle konkrétní masky mraku nad kamerou. `CinematicAtmosphere.update` předává tuto intenzitu do `campusShadowResponse`, ale ta ji přes odezvu `direct` znovu násobí faktorem `1 - smooth(.2,1,cloud)`. Při celkovém cloud=1 je proto síla stínu nula i v okamžiku, kdy skutečný maskovaný key svítí mezerou. Jde o dvojí započtení oblačnosti, doložené skutečným kódem.

| Varianta | Chování / dopady | Volba |
| --- | --- | --- |
| Odstranit globální cloud faktor všem callerům | Rozbije samostatné referenční scény, které ještě nemají maskovaný key | Ne |
| Přepsat `cloud` na0 v Game | Skrývá význam vstupu a může zničit ostatní weather odezvy | Ne |
| Automaticky usoudit z nenulového `keySource` | Zdroj Slunce/Měsíc neříká nic o aplikaci masky | Ne |
| Explicitní `cloudOcclusionApplied?: boolean` | Jen maskovaný key přeskočí druhý cloud faktor, omission/false zachová původní chování | Ano |

Faktor deště zůstane samostatnou výtvarnou odezvou kontrastu, útlum podle skutečné intenzity a nízkého Slunce/Měsíce zůstane. Nulový key nikdy nespustí mapu stínů. Žádné nové materiály, textury, observers, alokace per-frame ani změny kvality/exposure; refaktoring je omezen na pojmenování volby a její průchod existujícím řetězcem. Root doplní `cloudOcclusionApplied: true` do `this.cinematic.update` za odpovídajícím `applyArtLighting`.

Test double `AtmosphereSky` v `tests/opaque-sort.test.ts` používá úmyslné `as unknown` a dosud neobsahuje novou `lightTransmission`. Bude doplněn explicitním neutrálním `{sun:1,moon:1}`; produkční kontrakt se kvůli neúplnému mocku neoslabí.

## Další průzkum světlého obdélníku

Jde stále o **neidentifikovaný GPU artefakt** uživatelova screenshotu. Níže jsou oddělené doložené vlastnosti a hypotézy. Přesně totožné sky/art-lighting zdroje v neměnném `source-v4` byly dříve potvrzeny SHA256. Kamera má FOV0,85rad a maxZ1100; standardní backend je WebGL2. Při přejímce je ale nutné znovu číst skutečnou URL/backend/client ID, ne pouze default.

### Doložený draw a postprocess řetězec

- Sun plane: `CreatePlane(size:2)`, poloha ve vzdálenosti420m, měřítko `tan(.533°/2)*420*6`; shader dělí vlastní kotouč tímto faktorem pomocí `vDisc*6`. Výsledkem je kotouč0,533° a rovina cca3,2°. Screenshot ukazuje malý kotouč a pod ním obdélník o mnohonásobně větší ploše. Zvětšený halo billboard tedy není doložená příčina velkého obdélníku. Nenulový okraj starého Gaussianu byl samostatná malá vada a už má compact support.
- Moon plane má skutečný úhlový průměr z vzdálenosti, nikoli šestinásobné halo; fragmenty mimo kruh jsou discard. Oba materiály jsou ShaderMaterial, `needAlphaBlending:true`, bez depth write, bez fog, bez backface culling. Výchozí Babylon9.30 `Material.alphaMode=2` je standardní SRC_ALPHA kombinace, ne additive. Vertex shader posouvá jen clip Z téměř na far plane. Žádný z obou controllerů nevytváří třetí světelný obdélník.
- Atmosphere backdrop je box500m, `infiniteDistance=true`, bez parenta, group0, opaque řazený jako první, bez depth write. Pinovaný `transformNode.pure.js` přičítá kameru do world translation. Fragment používá normalizovanou lokální pozici; analyticky je směrový vektor spojitý přes stěny krychle. To není GPU důkaz správně bindnuté skutečné world matice.
- `CinematicAtmosphere` používá ACES/color curves pouze v Standard/PBR materiálech. `imageProcessingEnabled=false` a `config.applyByPostProcess=false`; custom sky už emituje display barvy. Medium/high zapíná FXAA a bloom, low nemá postprocess. DOF, volumetric-light-scattering, grain ani chromatic aberration se zde nezapínají.
- Pinovaný Babylon `BloomEffect` má highlight extraction → horizontal blur → vertical blur → merge. Blur targety mají `alwaysForcePOT=true`, scale0,5, kernel32, merge přičítá pouze vážený blur k původnímu obrazu. Rectangular viewport/RT problémy jsou tedy testovatelnou hypotézou, ne prokázaným důvodem měnit bloom.
- `SkyReflectionSampler` tvoří pouze6×32² paletovou cubemapu a SH pro materiály. Sama nevykresluje fullscreen ani world quad. Její chyba by se primárně projevila na přijímajících materiálech; široký čistý obdélník v obloze musí mít další mechanismus.
- Pinovaný patch `postProcess.pure.js` mění vlastnictví observable při dispose, nikoli viewport/scissor/UV. `imageProcessingPostProcess` patch řeší vlastnictví wrapperu a cleanup. Nebyl nalezen důkaz pro zásah do těchto patchů.
- Další explicitní emissive plochy v kódu jsou malé bus displays, popisky, světla aut a terénní lamp pools. Lamp pool je průhledný ground mesh a jeho denní alpha klesá na0; samotné světlo nemůže osvítit unlit sky ShaderMaterial. Importovaná CAD/GLB geometrie ale může obsahovat materiály/plochy, které tento textový audit neidentifikuje.

Dodatečný skutečný CPU experiment načetl **původní controller přímo z neměnného source-v4**. Při UTC2026-10-24T10:00Z,1260×714,FOV0,85 a kameře mířící naSlunce má skutečná plane scale11,7213667 a promítnuté rozměry **44,03×44,03px**, tedy samotný kotouč přibližně7,34px. To odpovídá řádu velikosti kotouče screenshotu, ale halo plane je asi13,6×užší než jeho velký~600px obdélník. Materiál skutečně hlásí alphaMode2,alphaBlendtrue,depthWritefalse,group0. Moon je v tomto denním okamžiku pod obzorem a **disabled**; jeho za-kamerové projektované bounds nejsou visible draw. Evidence `.cache/weather-cloud-light-integration-20261025/source-v4-disc-projection.json` je CPU transformace, nikoli skutečný GPU binding. Snapshot nebyl změněn.

### Hypotézy a diskriminační důkazy

| Hypotéza | Co by ji potvrdilo | Co ji oslabuje / současný stav |
| --- | --- | --- |
| Sun/moon draw má v reálném rendereru jinou scale/matici než kód | Obdélník zmizí po vypnutí právě jednoho tělesa; capture ukáže chybný bound/world/WVP | Velikost screenshotu nesedí na navrženou geometrii; zatím nereprodukováno |
| Nesprávný viewport/scissor nebo RT clear/binding v bloom | Bez bloom obdélník zmizí, pre-bloom scene color je čistý; blur/merge target má hranaté znečištění | Kód pipeline neobsahuje cílené scissor; nelze rozhodnout ze statického snímku |
| Background world/clip draw nebo nesprávné pořadí/depth | Obdélník zůstane bez postprocess a reaguje na backdrop/transparent draw; frame capture určí draw call | Analytická kontinuita boxu nic takového nevyžaduje; potřeba GPU binding důkazu |
| Emissive/importovaná plocha za budovami | Bez těles i s ponechaným sky stále existuje; vypnutí konkrétní mesh ji odstraní | V ručně vytvářených sky mesh není tak velká rovina, importované meshes neprověřeny GPU |
| IBL/exposure | Mění se jen materiály nebo artefakt při přepnutí environment intensity | IBL nevykresluje oblohu a uniformní exposure nevytvoří novou obdélníkovou hranici |

## GPU izolace, kterou může provést root

Jen nový kandidátní snapshot a vlastní QA karta, nikdy hraná2591. Ovládání je diagnostika agenta, ne nový hráčský UI workflow. Každý krok vychází ze stejného uloženého camera/time/weather/quality stavu, screenshotu a source/client ID.

1. Zaznamenat aktivní camera viewport, CSS/backbuffer rozlišení, backend, `astronomical sun`/`astronomical moon` world matrices + projected bounds, materiál alphaMode/depthWrite/depthFunction/renderGroup, počty a názvy postprocesses. Porovnat skutečnou maxZ a případné reverse depth.
2. V nezměněné scéně vypnout pouze bloom, poté samostatně celý postprocess řetězec. Neměnit kvalitu jako první test: low mění také další geometrii, shadowmap a rozlišení. Pokud raw scene color je čistý, zachytit highlights, blurX, blurY, merge, viewport/scissor a clear při každém passu.
3. Obnovit pipeline. Samostatně vypnout sun disc, potom moon disc; každou změnu vrátit. Jestli zmizí artefakt, uložit skutečný WVP, alpha/depth state a draw bounds příslušného tělesa. Pouhé vizuální zmizení při kompletním zhasnutí scény nestačí.
4. Při vypnutém postprocess dále izolovat sky backdrop, průhledné draws a podezřelé importované meshes. Pokud sky vypnutí nechá obdélník, vyhledat draw z jiného producenta. Pokud zmizí s backdropem, porovnat skutečné bindingy a frustum, nikoli okamžitě nahrazovat skybox sphere.
5. Poté opakovat stejný případ při změně rozlišení/resize a v alternativním backendu. Podle výsledku vymezit minimální opravný scope. Při každém backendu nejdřív ověřit shodný source/client ID a načtené shader stages.

Pokud běžný QA bridge nedokáže jednotlivé postprocessy dočasně odpojit, root může přidat loopback-only ephemeral diagnostic setter (bez localStorage/URL persistence). Nutné volby jsou `bloom`, `all-postprocess`, `sun`, `moon`, `sky`; čtení projected bounds a původních hodnot musí být součástí návratu. Nevytvářet obecné vypnutí libovolných materiálů v hráčském nastavení.

## Ověření a přejímka

`pnpm exec tsx --test tests/cinematic-atmosphere.test.ts tests/cinematic-art.test.ts tests/opaque-sort.test.ts` skončil **21/21 PASS, exit0,3,34s**; log `.cache/weather-cloud-light-integration-20261025/targeted-tests.log`. Nové regrese ověřují zachovaný omission/false fallback, explicitně maskovaný key, nulu/horizont/déšť, okamžitý start/stop při obou tělesech, reuse stejné shadow mapy/textur a okamžitou aktualizaci caster listu. Původní opaque routing fixture skutečně prochází ArtLighting se správným novým kontraktem. `git diff --check` PASS.

Žádný zdejší NullEngine test není GPU přijetí ani měření ceny skutečného počasí. Fyzikální LUT, volumetrické mraky, prostorové cloud shadows a odpovídající IBL zůstávají samostatná nedokončená část velkého uživatelského zadání.
