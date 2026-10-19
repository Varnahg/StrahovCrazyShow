# BMAD podklady: rendering a WebGPU

Audit 19. 10. 2026 vychází z committed `main db9108ddd3d069030abebd0fcccd6ecefbd0ff53`, úplných Linear popisů, komentářů a vztahů. Přítomnost implementací a regresí byla ověřena přes `git show/git grep HEAD`. Původní Game/UI/preview WIP není přijatý kód. Níže uvedené počty testů jsou dohledaná historická evidence; během tohoto auditu neběžely nové testy hry, build, GPU ani server. Výstup je analytický podklad navazující na root BMAD specifikaci, nikoli nový rekurzivní workflow či oprávnění k implementaci.

Podle posledního upřesnění uživatele doporučujeme KEY-5 jako hlavní zastřešení optimalizace a KEY-22 pod něj. To je organizační seskupení: CPU příprava materiálů, GPU práce, startup, cache a lifecycle jsou různé příčiny. Pokles FPS sám nedokazuje GPU bottleneck. Konkrétní korektnostní vady a přijímací brány zůstávají samostatné podúkoly. Samotná změna rodiče nepřenáší stav Done ani nemění kritéria.

Doporučená konsolidace: zbývající přejímku KEY-25/26/27/28 převést do KEY-33, jejich úplný původní rozsah a kritéria zachovat před označením duplicity. KEY-23/36/37 ponechat Done. Před odstraněním duplicit odstranit jejich již překonané implementační blokace KEY-31/32/33; nenahradit je KEY-33→31/32, protože KEY-31→33 by vytvořilo cyklus. Průzkum neukázal důvod zahodit konkrétní reprodukční brány KEY-24/35/39.

Společné zdroje: [projektová policy](../../agents/bmad-policy.md), [migrační kontrakt](../../performance/webgpu-migration.md), [funkční matice](../../performance/webgpu-functional-matrix.md), [výkonový protokol](../../performance/webgpu-acceptance.md). Primárním technickým zdrojem je pinovaný Babylon 9.30.0 s verzovaným [patchem](../../../patches/@babylonjs__core@9.30.0.patch), jeho skutečné procesory a přenositelné regrese. Relevantní veřejný normativní zdroj je [WGSL uniformity a textureSample](https://www.w3.org/TR/WGSL/#texturesample); vyšší verze enginu není předpokládána.

## KEY-22 — Přemigrovat celou produkční hru a editor na plynulé WebGPU

**Rozhodnutí: ponechat jako migrační podcelek pod hlavním optimalizačním KEY-5.** Porty a společný renderer jsou v main, ale [render-engine.ts](../../../client/render-engine.ts) stále bez query vybírá `webgl2`; WebGPU je explicitní loopback volba. Finální migrační cíl není dokončený.

Varianty: jeden implementační megatask by ztratil vlastnictví a samostatně přijatelné změny; samostatné portové issues naopak již opakují tutéž zbývající přejímku. Nejlepší je zachovat migrační umbrella pod KEY-5, přesunout portové implementace do historie a řídit zbývající korektnost přes KEY-24/29/30/35/39, výkon přes KEY-31/32, obraz přes KEY-33 a release přes KEY-34. Tato hierarchie neslučuje CPU invalidaci a GPU rendering do jedné neprokázané příčiny.

Další postup: nejdřív korektnost shadow/failure řetězce, současně evidence coverage v existující matici. Výkonové zásahy přijímat samostatně podle profilu. Odmítnuté cache kandidáty nevracet podle CPU mikroměření. Delší startup je schválený tradeoff, nesmí skrývat timeout či nedokončenou přípravu.

Přijetí: cílová GTX1060, Medium, CSS/internal 2040×986, celá hra/HUD, 1 a ≥3 skutečné relace; přiblížení 60 FPS, p95≤20 ms, p99≤33,3 ms a žádné migrační interakční záseky ≥100 ms jsou dosud cíle. Default změnit přes KEY-34. Rozsah této fáze je migrační dokumentace a přesné rezervované podtasky, nikoli nový plošný přepis Game. Plné test/build/integration a skutečná přejímka musí patřit stabilnímu zdrojovému checkpointu včetně testů.

## KEY-23 — WebGPU: sjednotit renderer, verze a bezpečný integrační kontrakt

**Ponechat Done.** Společná async factory, native guard a Game/preview integrace jsou v main (`2644a6de`, `0ef3ccfa`, `a8af2183`); úzké přijetí dokládají regrese a existující GPU evidence v [handoffu](../../agents/handoffs/webgpu-migrate-root-20261016.md). Default, úplný preview lifecycle a výkon patří do KEY-29/30/34, nikoli k opětovnému otevření přijatého kontraktu.

## KEY-24 — WebGPU: odstranit shadow shader HTML fallback a potvrdit compiler chybu

**Rozhodnutí: ponechat; aktuální práci zúžit na reprodukční přejímku.** V main `8c3e7e20` [render-shaders.ts](../../../client/render-shaders.ts) explicitně registruje šest GLSL a šest WGSL shadow includes. [Regrese](../../../tests/render-shadow-includes.test.ts) zachovává skutečný wrapper/ProcessIncludes reproduktor i negativní kontrolu pěti HTML substitucí. Historické resource velikosti odpovídají hypotéze, ale původní URL/body chybějí. Jednoavatarový shadow witness nepokrývá původní tři scénáře.

Varianty: další přepis registrace bez nové chyby má náklady a riziko duplicitních shader vstupů; obecný resource framework je nadbytečný. Doporučena cílená přejímka integrované opravy s existujícím sběrem, doplněným pouze o úplný záchyt shaderových odpovědí. Bez globálního `ForceGLSL`, změny světel nebo geometrie.

Scope: vlastní evidence a existující integrační scénáře; uvedené runtime/test soubory měnit pouze při novém doloženém selhání. Ověřit R-only, skuteční peers-only a peers+R v produkčním snapshotu. Zaznamenat i rychlé HTTP 200 `.fx` odpovědi, content-type, body hash, processed source/defines při chybě, health a hlavní/stínový obraz. PASS vyžaduje všechny tři scénáře bez HTML/undefined/compiler/Promise chyb. CPU test ani absence pomalého resource záznamu tuto bránu nenahradí. Zůstává předpokladem KEY-35 a konečné KEY-33; nesplývá s odlišnou UBO chybou KEY-39.

Podklady: [předání registrace](../../agents/handoffs/webgpu-migrate-shadow-includes-20261016.md), [dílčí shadow witness](../../performance/evidence/webgpu-migration-20261016/quality-visual-acceptance/README.md), Linear audit 18. 10.

## KEY-25 — WebGPU: portovat vítr a fotografickou trávu na nativní WGSL

**Rozhodnutí: sloučit zbývající přejímku do KEY-33; neoznačit automaticky Done.** Port `0c0a17ec` a thin-instance příprava `cb236094` jsou v main. [tree-wind.ts](../../../client/tree-wind.ts), [grass-material.ts](../../../client/grass-material.ts), [photo-grass-wind.ts](../../../client/photo-grass-wind.ts) přijímají oba jazyky a používají neměnné recipes. Host bindingy se nemění, nepřibyla runtime cache. Historických 37/37 CPU testů a 12 kombinací Babylon WGSL processingu není obrazová přejímka.

Varianty: samostatná portová QA a KEY-33 opakují stejné běhy; nový port či shader DSL nemají doloženou potřebu. Nejlevnější je jedna přejímka s identifikovanou sekcí V25 a vazbou na původní issue. Stávající reference zachovat kvůli srovnatelnému obrazu.

Přenést bez ztráty: všechny tree/grass LOD a low/medium/high, pohyb vieweru, world-space deformaci, meteorologický FROM směr, čas/amplitudu, normály/tangenty, thin-instance fade/discard, per-rendering-mesh hardBind metadata, více vlastníků sdíleného materiálu a pohyb deformovaných stínů. Žádná runtime GLSL konverze. Plynulost má samostatný měřený důkaz; počet shaderů ji nenahrazuje.

Scope při nálezu: tři uvedené moduly; [wgsl-vegetation.test.ts](../../../tests/wgsl-vegetation.test.ts), [tree-appearance.test.ts](../../../tests/tree-appearance.test.ts) a photo-grass/vegetation regrese. Refaktor pouze doložené duplicity bez frame alokací. Worker KEY-42 a optimalizace KEY-9 zůstávají oddělené. Po přesunu odstranit portové blokace KEY-31/32/33; implementační předpoklad je splněný, úplná QA ne.

Podklad: [předání portu](../../agents/handoffs/webgpu-migrate-vegetation-wgsl-20261016.md).

## KEY-26 — WebGPU: portovat povrchové a fotografické materiály na WGSL

**Rozhodnutí: sloučit zbývající přejímku do KEY-33, sekce S26.** Main `cdd439c7` obsahuje native větve v [cinematic-art.ts](../../../client/cinematic-art.ts) a [photogrammetry-lighting.ts](../../../client/photogrammetry-lighting.ts). Historické 12/12 testy kontrolují skutečný plugin manager/WGSL processor, Float32 UBO, arithmetic, effect identity a lifecycle. Driver kompilace a kalibrovaná obrazová matice nejsou plně doložené.

Varianty: druhý materiálový systém mění cache a vizuální riziko bez důkazu; samostatná přejímka opakuje stanoviště KEY-33. Doporučena společná matice se specifickými číselnými kontrakty. Existující per-invocation `var<private>` sdílí noise mezi hooky při jednom výpočtu; duplikovaný noise by zvýšil fragmentovou práci, patch podpisu PBR funkce by přidal křehkou vazbu.

Přenést kritéria: linear/sRGB, albedo, roughness, mokrost, detail fade, gradients/noise, cache identity, quality/weather invalidace a cleanup; stejné UV, textury, kalibrace a geometrie. Den/noc/mokro/sucho/detail distance potřebují obraz a identifikovaný vstup. Historickou fotogrammetrii ověřit izolovaným fixture; nepřipojit ji zpět do hlavního světa. U maskovaných fasád zachovat označení simulované occupancy.

Scope při regresi: oba pluginy; [wgsl-surface-materials.test.ts](../../../tests/wgsl-surface-materials.test.ts), [cinematic-art.test.ts](../../../tests/cinematic-art.test.ts), [photogrammetry-lighting.test.ts](../../../tests/photogrammetry-lighting.test.ts). Refaktor pouze dotčené recipes/bindingy, bez nových assetů nebo živé cache. Po přesunu odstranit implementační blokace KEY-31/32/33. Shoda CPU výpočtů neznamená automatický obrazový PASS všech driverových větví.

Podklad: [předání povrchů](../../agents/handoffs/webgpu-migrate-surfaces-wgsl-20261016.md).

## KEY-27 — WebGPU: nativní WGSL vlasy, barvy aut a instance všech LOD

**Rozhodnutí: sloučit přejímku do KEY-33, sekce A27/C27.** Main má port `fefd05db`, instancing `1d89d80c`, inicializační opravu `145cbe95` a KEY-41 `cb2bed42`. [avatar-hair.ts](../../../client/avatar-hair.ts) má native hook, [car-paint-instances.ts](../../../client/car-paint-instances.ts) instance stream a každodraw hardBind fallback, [car-pack.ts](../../../client/car-pack.ts) připouští oba jazyky. Historických 15/15+2/2 CPU regresí není multiplayerová/jízdní obrazová přejímka.

Varianty: per-colour material clones zvyšují počet materiálů a draw workload; GLSL převod nesplní native kontrakt. Samostatná zbývající QA duplikuje A01–A03/C02 KEY-33. Doporučeno zachovat explicitní port a jeden společný GPU průchod.

Přenést přesně: šest presetů, současné různé skutečné kostry, účesy/barvy/alpha atlas, brýle/vousy/oděvy, near→medium→far→near; správné `toLinearSpaceVec3` a kalibrace. U aut `INSTANCESCOLOR`, vec4 stream, tři LOD, mirrored determinant fallback, všechny kvality, hlavní/shadow draw, jízda/brzda/výstup a kamera. Barvy se nesmějí zaměňovat mezi instancemi; materiálové vlastnictví musí zůstat omezené. Vlastní force-near hráč neprokazuje remote LOD.

Scope při nálezu: tři uvedené moduly; [wgsl-avatar-car.test.ts](../../../tests/wgsl-avatar-car.test.ts), [car-webgpu-parity.test.ts](../../../tests/car-webgpu-parity.test.ts), příslušné hair/car lifecycle regrese. Refaktor zachová identity a per-draw fallback. Preview lifecycle zůstává KEY-29, shadow chyby KEY-24/35/39. KEY-41 se neopakuje. Odstranit implementační blokace slučovaného issue bez zavedení cyklu.

Podklad: [předání hair/car](../../agents/handoffs/webgpu-migrate-avatar-car-wgsl-20261016.md).

## KEY-28 — WebGPU: převést oblohu, Slunce a Měsíc na nativní WGSL

**Rozhodnutí: sloučit přejímku do KEY-33, sekce SKY28.** Main má port `2958a3f5` a uniform texture sampling `71771ccc`. [atmosphere-sky.ts](../../../client/atmosphere-sky.ts), [sky-weather.ts](../../../client/sky-weather.ts) vybírají jazyk explicitně a [atmosphere-wgsl.ts](../../../client/atmosphere-wgsl.ts) drží native zdroje. Historických 22/22 kontrol doložilo pět shader stages, GLSL byte parity, bindingy, mat3 padding, host parametry a cleanup; nikoli všechny GPU kombinace.

Varianty: opakovaný port nemá podklad; sampling LOD0 nebo vypnutí uniformity diagnostiky by změnily obraz/skryly problém. Doporučena současná implementace a společná přejímka. W3C váže `textureSample` na uniformity analýzu; vzorkování před pixelovými větvemi proto ponechat. [Normativní WGSL podklad](https://www.w3.org/TR/WGSL/#texturesample)

Přenést kritéria: den/západ/modrá hodina/noc/úplněk, nízké/vysoké Slunce i Měsíc, clear/overcast/rain, všechny kvality; skutečný UTC a Strahovské souřadnice, FROM vítr, star atlas, lunar UV/fáze, cloud occlusion, alpha/farDepth, mipmapy/trilinear. Potřebné jsou i restart a přepnutí bez resource leaků. Fixture musí zachovat stejné astronomické/meteorologické vstupy, nikoli jen podobně vypadající oblohu.

Scope při nálezu: tři uvedené moduly; [atmosphere-native-wgsl.test.ts](../../../tests/atmosphere-native-wgsl.test.ts), [atmosphere-webgpu.test.ts](../../../tests/atmosphere-webgpu.test.ts), [atmosphere-sky.test.ts](../../../tests/atmosphere-sky.test.ts) a počasí/astronomie regrese. Refaktor nezasahuje do geometrických či fotometrických zdrojů. Odstranit implementační blokace KEY-31/32/33 po přenosu úplných kritérií.

Podklad: [předání oblohy](../../agents/handoffs/webgpu-migrate-sky-wgsl-20261016.md).

## KEY-30 — WebGPU: sjednotit pravdivou diagnostiku a obnovu rendererů

**Rozhodnutí: ponechat; oddělit obecný health/restart kontrakt od shadow příčiny KEY-39.** Main obsahuje RenderHealth, startup gate, loading/failure odchod a terminální frame zachycení. Kód má renderer ID/purpose/generation, sedm error kanálů, pět prvních zpráv, úplné čítače a oddělené pending přípravy/validace. GPU timing rozlišuje main-pass scope a vrací `null` pro chybějící/staré vzorky.

Varianty: globální odchyt všech page Promise zaměňuje vlastníky; automatická obnova stejného rendereru může obejít přípravu. Doporučeno dokončit existující owner-bound model s novým rendererem po device loss a opravit jen konkrétní mezeru. Nová telemetry vrstva není potřeba.

Scope: [render-health.ts](../../../client/render-health.ts), [webgpu-validation.ts](../../../client/webgpu-validation.ts), [render-startup.ts](../../../client/render-startup.ts), [gpu-diagnostics.ts](../../../client/gpu-diagnostics.ts); explicitně rezervované Game/UI/engine/preview integrace. Refaktor zachová hot-path bez synchronního GPU readbacku, generační guards, rejection identity a odpojení jen vlastních hooků.

Přijetí: skutečné cílené compiler/effect, async pipeline, uncaptured validation, textura a device-loss chyby. Game a současný preview se nepřipisují navzájem. Chyba zruší ready, zneplatní benchmark, zabrání submitům a umožní pointerem opustit scénu/restartovat. Pozdní Promise starého vlastníka neovlivní nového. Ověřit při startupu, pending submission a po ready; doložit nový renderer/zdravý snímek. Testy render-health/startup, webgpu-validation, gpu-diagnostics a Game/UI fixtures; skutečná GPU fault/restart kontrola je stále mezera. KEY-33/34 přebírají výsledky, nikoli duplicitní opravu.

## KEY-33 — WebGPU: provést úplnou funkční a obrazovou přejímku hry

**Rozhodnutí: ponechat jako jediné místo úplné obrazové přejímky a přijmout scope KEY-25–28.** [Matice](../../performance/webgpu-functional-matrix.md) má 20 identifikovaných scénářů a šest avatar tras. Editor smoke a průchod do B6:0 jsou dílčí. Horní patra/obě schodiště, skutečné remote LOD, ≥3/9 relací, host/device-loss a úplná weather matice nejsou přijaté.

Varianty: 108 kartézských avatar běhů opakuje stejné shader chování; obecné smoke ztrácí nepokryté větve. Doporučena existující pairwise/reprezentativní matice s explicitními sekcemi V25/S26/A27/C27/SKY28. Každé původní kritérium má řádek/důkaz nebo UNVERIFIED. Jedno pozorování smí pokrýt více řádků jen s uvedenými variantami.

Scope: existující matice, vlastní raw/image manifesty a úzké reprodukční fixture. Nepřidávat produkční weather přepínač, druhý B6 portál ani historickou fotogrammetrii do světa. B6 má jeden canonical venkovní portál a dvě schodišťová jádra. Případné opravy/refaktoring patří do konkrétního vlastníka vady.

Ověření: frozen production source/assets/tests hash, skutečná URL/backend, browser/GPU, CSS/internal/DPR, renderer/generation, počasí/UTC a trajektorie. Chůzi/jízdu nenahrazovat teleportem. Každá buňka PASS/FAIL/UNVERIFIED; úmyslný fault oddělit od FPS. Nálezy vracet odpovědnému issue s reprodukcí.

Závislosti: odstranit blokace přes slučované KEY-25–28, zachovat KEY-31→33. Jejich původní blokace KEY-31/32 nenahradit KEY-33→31/32; vznikl by cyklus. KEY-24/29/30/35/39 zůstávají samostatné korektnostní brány. Finální default/rychlost jsou KEY-34. Hierarchie KEY-5→22→33 nezaměňuje QA s důkazem GPU bottlenecku.

## KEY-34 — WebGPU: přijmout výkon, integrovat default a předat stabilní verzi

**Rozhodnutí: ponechat; není duplicitou KEY-33 ani synchronizace KEY-43.** Main je zveřejněný, default stále WebGL2. Existují [reporter](../../../scripts/webgpu-migration-report.mjs), [regrese](../../../tests/webgpu-migration-report.test.ts) a [protokol](../../performance/webgpu-acceptance.md) s valid/invalid/unverified. Exit 0 reporteru neznamená přijetí migrace.

Varianty: default po Low smoke ignoruje Medium/peers a frame tails; další framework není potřeba. Doporučeno použít stávající reporter nad stabilním checkpointem po funkčních/lifecycle branách. CPU a GPU profil, main-pass/whole-frame čas a completion latency nesčítat jako stejnou metriku.

Postup: ≥3 úplné proložené/counterbalanced páry WebGL2/WebGPU při stejných source/assets, GPU/browser, kvalitě, CSS/internal, UTC/počasí, trase, kohortě a cache protokolu. Oddělit první start/interakci od warm; přiznat startup, takty/teploty, FPS, p95/p99/max a ≥50/100/250/1000 ms. Uchovat všechny pokusy, pomalé platné běhy nezahazovat. Vyšší startup sám není zamítnutí; timeout/neúplná příprava ano.

Scope až po přijetí: `client/render-engine.ts` a testy, stack/verification dokumentace, případně úzký dependency cleanup. Factory musí bez query zvolit WebGPU pro Game i editor; unsupported má pravdivou chybu bez tichého fallbacku. Refaktor odstraní překonané větvení jen po ověření nulového použití; žádná účelová změna stínů/rozlišení.

Done: plné test/build/izolované integration, KEY-33, KEY-30/39, výkonové cíle parentu a nová immutable uživatelská URL. Staré snapshots/dependencies zachovat. Hierarchie KEY-5/22 nemění tuto finální bránu.

## KEY-35 — WebGPU: opravit nativní WGSL ShadowDepthWrapper v pinovaném Babylonu

**Rozhodnutí: ponechat úzkou shadow deklarace/kompilace přejímku; neabsorbovat výkon KEY-31 či recovery KEY-39.** Main `2e65d681` opravuje WGSL normal remap/native fragment declarations; `1757002e` později přidává exact descriptor/token sharing. Historický red/green důkaz ukazuje tři konkrétní chybějící symbolické větve a 29/29 kontrol. Sharing má 19 portable regresí a fresh-install clean/combined pipeline, nikoli obraz všech shadow větví.

Varianty: úzký pinned patch zachovává wrapper lifecycle/GLSL; subclass privátních internals nebo vlastní shadow shader duplikují wind/alpha/instancing/depth a zvyšují údržbu. Plošný upgrade enginu je jiný úkol. Doporučeno dokončit GPU přejímku současného patche místo opakované implementace deklarací.

Scope při nálezu: `patches/@babylonjs__core@9.30.0.patch`, související lock hash, [webgpu-shadow-depth-wrapper.test.ts](../../../tests/webgpu-shadow-depth-wrapper.test.ts). Zachovat ostatní patch sekce i exact source/ABI/cache identity. Přidat reproduktor/refaktor jen konkrétní nové chyby.

Přijetí: directional normal bias, soft transparency a packed point bez normal bias, default/explicit remap, Standard/PBR a skutečné wind/alpha materiály. Driver kompilace a obrazy stromů/aut na Medium/High; Low bez stínů není náhrada. Pozdější baseEffect/lifetime nález potřebuje reprodukci nad současným pinem a vazbu na KEY-39/31. Starý před-sharing proof sám neprokazuje současný stav.

Podklady: [předání wrapperu](../../agents/handoffs/webgpu-migrate-shadow-wrapper-20261016.md), [přijetí současného sharing pinu](../../performance/evidence/webgpu-migration-20261016/shadow-share-native/README.md).

## KEY-36 — WebGPU: odstranit zbytečnou invalidaci materiálů při plynulé změně expozice

**Ponechat Done.** Runtime `667ce466`, evidence `7396fbcb` a [produkční přijetí](../../performance/evidence/webgpu-migration-20261016/exposure-acceptance/README.md) dokládají osm skutečných Babylon regresí i změnu expozice při zachovaném bloom/obrazu. Samostatná časová úspora/FPS nebyla změřena a není důvod ji dodatečně tvrdit.

## KEY-37 — WebGPU: odstranit globální invalidaci Fresnel materiálů při ukončení scény

**Ponechat Done.** Runtime `dc858ce8`, evidence `16623571` a [GPU přijetí](../../performance/evidence/webgpu-migration-20261016/quality-visual-acceptance/README.md) dokládají vlastnický detach/resetDrawCache, izolaci cizích materiálů a quality/menu/reentry kontrolu. Done nedokládá samostatné milisekundy cleanupu ani fyzické uvolnění GPU paměti.

## KEY-39 — WebGPU: opravit nesoulad světelných UBO ve stínech svítilny a zastavení renderu

**Rozhodnutí: ponechat urgentní; korektnost před výkonem.** Historický combined-v4 má doložené directional 80B UBO v pipeline očekávající 96B, invalid CommandBuffer, chybějící buffer a zastavený frame při ready UI. Nejde o šest nezávislých příčin. Main má freshness guard `36734e96`, terminal health `37a4137e`, manual-frame opravu `6d42c8f5` a Game/UI propagation `a2acbed8`. [webgpu-shadow-readiness.ts](../../../client/webgpu-shadow-readiness.ts) obnovuje base readiness a kontroluje pass/override/disposal i typy/počty světel.

Mezera: úplný původní sled přes vyšší patra/obě schodiště, přesná lokalizace pádu a skutečný fault/restart. Nelze bez nového reproduktoru připsat vyřešení pozdějšího cached baseEffect/lifetime problému token sharingu; ten zachovává jiný kontrakt.

Varianty: samotný fail-closed layout guard je obrana, ale nemusí odstranit stale identitu; preferována nejmenší oprava reprodukované selection/invalidation chyby. Široká variant cache má retenční/disposal riziko a vyžaduje důkaz. Vypnutí stínů/zvětšení uniform size schovává chybu.

Scope: uvedený modul, [webgpu-shadow-freshness.test.ts](../../../tests/webgpu-shadow-freshness.test.ts), případně úzká vendor sekce a portable lifecycle fixture. Game/UI/health integrace pouze při doložené mezeře a vlastní rezervaci. Refaktor zachová exact source/ABI sharing a reference accounting.

Přijetí: pinned red/green nad současným patchem; původní quality/time/F sled bez UBO/bindgroup/CommandBuffer chyb; úmyslný render/submit fault zruší ready, zabrání starému submitu, dovolí odchod/nový zdravý renderer. Pointer kontrola, foreground návrat, logy/obraz celé B6 trasy. KEY-30 přebírá recovery, KEY-33 funkční výsledek, KEY-31 samostatně hitches. [Dílčí dosavadní replay](../../performance/evidence/webgpu-migration-20261016/safety-v16/README.md) není úplná přejímka.
