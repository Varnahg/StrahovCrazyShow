# Výsledek: dva čisté kandidáty nepřijímat do QA buildu

18.10.2026. **Žádný vybraný runtime kandidát, žádný nový vendor patch/lock, žádná nová cache.** B (validované celé řádky) není konzistentně lepší; C (stejný regex test + indexOf/slice) zlevňuje úzký serializer, ale celkový actual warm render nemá doložené zlepšení. Výsledek zachováváme jako negativní experiment. Netvrdí, že další čistá optimalizace není možná; větší ruční scanner nebyl implementován a měl by nový gramatický/correctness rozsah. Root day13 baseline zůstává beze změny.

## Ověření a skutečný rozsah

- Differential6/6 PASS: actual source A/B/C,9realmaterialblocks,4096deterministických generovaných bloků+1024mutací, prefixy/digits/underscore/case/absent values/numeric spelling/finite, rezervované/duplicate/opaque bloky, exact32768/1024hrany, getters/receiver/latekeys/falsythrows. Runtime class a původní property loop jsou byte-identické; změny pouze internals helperu.
- Pure micro9samostatnýchprocesů v pořadí A/B/C/C/A/B/B/C/A: raw/helper/full měřeny zvlášť,5batches×9blocks×256calls/fáze. Žádný odečet fází, všechny procesy a maxima zachované. Detail v `phase-one.md`, `micro-summary.json` a raw `micro-*.json`.
- Actual warm9samostatnýchprocesů ve stejném proloženém pořadí, každý5/5 PASS. Na variantu a druh48warm přepnutí+48nezměněných snímků,36actual submeshes/snímek. PBR, Standard, PBR+CampusSurfaceArt. Actual světlo3→4→3, GltfLightBudget/StableLightState a native createEffect.
- **27/27 cross-variant celých snapshotů exact:** full defines, Effect/key IDs, zpracované WGSL bytes, processing layout, předávané uniforms. Samostatná plugin UBOdata shodná. Každý warm switch36cachehits/36serializer/36onEffectCreated/36setEffect/reset/0novýchprogramů; skutečná změna hodnoty1novýprogram a původní Effect při návratu. Refcount a cleanup zachované, original observer failure i later hook owner testované.
- Dosavadní actual class/WGSL/plugin/attribute/tinyGLB identity regrese **A18/18, B18/18, C18/18 PASS**, včetně známého nepodporovaného order-sensitive customprocessor limitu. Komprimovaná9,7MB baseline se nezměnila. Scoped TypeScript3172souborů/0chyb.
- První regression run měl6PASS a1FAIL způsobené **EEXIST output receipt** mezi dvěma Node test procesy; ne runtime problém. Zachován v `regression-records.log`. V2runner dal každému souboru samostatný receipt/log; měřený loader, runtime varianty, warm data i test assertions se neměnily. Nic se neskipovalo.

## Časy actual warm proofu

Mediány ms pro36submeshes v jednom snímku; nikoli ms/mesh, GPU FPS nebo produkční úspora. Scopes jsou inclusive a nesčítají se.

| Druh / scope | A current records | B lines.sort | C test+index |
|---|---:|---:|---:|
| PBR serializer |4,600|4,457|4,378|
| PBR readiness |7,491|7,333|7,285|
| PBR sync render+budget/order |8,687|8,843|8,759|
| Standard serializer |2,861|2,860|2,763|
| Standard readiness |5,274|5,625|5,396|
| Standard sync render+budget/order |6,609|6,987|6,756|
| Surface serializer |4,544|4,422|4,399|
| Surface readiness |7,164|7,225|7,115|
| Surface sync render+budget/order |8,261|8,636|8,318|

Samotné C toString se zkrátilo přibližně3–5 %, ale ani jeden celkový medián sync renderu není nižší než A. B má větší kolísání mezi procesy. PBR whole-render mediány po jednotlivých procesech: A8,693/8,503/8,741; B9,481/8,545/8,144; C8,375/8,711/8,839. Z jednotlivého rychlého běhu nelze vybrat vítěze. Není to důkaz celkové regrese kandidáta, ale chybí dostatečný důkaz užitku pro další QA patch/build/GPU faktor.

Pure micro oddělil původní loop: PBR raw~0,0138ms/helper~0,0670/full~0,0867 v A, Standard~0,0103/0,0356/0,0483. Raw loop zůstává totožný, přesto mezi variantami kolísá; viditelná mez JIT/GC/procesového šumu. Capture a differential nejsou součástí timed sady. Warm trace má stejné wrapper/performance.now/uniform observer alokace ve všech variantách; snapshot assertions jsou mimo interval, jejich alokace mohou ovlivnit pozdější GC. `nativeCreateEffectInclusive` stále zahrnuje post-call observer count/classification/ownership check, jak opravilo předchozí V2handoff. Žádné36→794 přepočítání.

## Actual raw corpus a memo pouze jako analýza

Samostatný untimed capture5/5PASS vložil jediný test-only source tap na vstup skutečného canonicalResult, tedy **po původním loopu a jeho jediném čtení getters**. Before/after module SHA a přesná vložená věta jsou v `actual-raw-corpus.json`; `capture-loader.mjs` nemění fyzické dependencies ani production API. Corpus:2953calls/9unique/0omitted,45156B součet logických UTF-16 délek. Všech9micro raw bloků přesně odpovídá skutečnému capture.

Při hypotetickém uchování všech9klíčů je horní mez opakování99,695 %. Nejde o LRU/production hitrate: pořadí přístupů nebylo ukládáno a fixture nemá celý svět/meshvariability. Hypotetický key+output text má přibližně2×součet logických délek; skutečný heap se liší podle string encoding/sharing, Map a objektů, nebyl měřen. WeakMap perDefines má per-instance retenční cenu, nededuplikuje36různých submeshes a last-entry může přiOFF/ON míjet. Globální bounded string→string map by sdílel výsledky, ale držel je i přes scene disposal; potřebuje explicitní celkové entry/byte limity a lifecycle/eviction. Pure output závisí na hotovém textu, ne GPU generation; cache však nesmí skrýt předchozí getters/throws nebo přidávat neomezenou paměť. **Žádná memo zde není implementovaná ani vybraná.**

## Zdrojová izolace a reprodukce

Baseline fyzická core/loaders identity je frozen define-order QA, dependency manifest3e17ecf…7970, MaterialDefines43a75f4…916f4. `variant-loader.mjs` je **pouze testový source selector**: ověří přesný original SHA, vrátí kompletní zvolený module source ze `variants/{records,lines,indexed}.js` na stejné skutečné URL a uloží receipt. Nevytváří druhou class identity, prototype override ani nové exporty. Aktualizovaná kopie dependencies nevznikla, protože podmínka výběru kandidáta nebyla splněna. Actual18testů s realpath a tinyGLB/instanceof prošlo u každé varianty.

`baseline/` obsahuje47přesně zkontrolovaných source/config/fixture vstupů z frozen native-transfer closure, adaptovaný `warm.test.ts`, byte-identické trace/native engine a readonlynode_modules junction. `candidate/` je pouze stejná předem připravená **nevybraná source staging kopie bez dependencies/build identity**, nikoli publikovatelný checkpoint. Její copied patch/lock jsou původní, unchanged. `source-inputs.json` dokládá jen nutné tři import path změny a report destination u copied warmtestu; jeho chování/assertions se nepřepisovalo.

Reprodukce: `node --test differential.test.mjs`; `node micro.mjs VARIANT NOVY_RUN_ID`; z baseline `TSX_DISABLE_CACHE=1 SERIALIZER_VARIANT=... SERIALIZER_RECEIPT=... WARM_REPORT=... node --import ../node_modules/tsx/dist/loader.mjs --import ../variant-loader.mjs --test --test-concurrency=1 --test-timeout=30000 warm.test.ts`. Exact skutečnéargs/UTC/logs v run receipts. `run-micro.mjs`, `run-warm.mjs` a `run-regressions-v2.mjs` mají bounded vlastní children a wxlogy; nespouštět přes frozen výstupy. Typy `node types.mjs`. Žádný pnpm/install/fullsuite/build/GPU/port.

CPU okna07:44:00–07:44:35 a07:50:39–07:52:35UTC byla koordinovaná; všechny vlastní procesy ukončené a root o uvolnění informován. GPU/shadows/instancing/GLBworld/externítextury nejsou warmfixture důkaz. NullEngine zpracuje skutečný WGSL a nativecache, ale nevytváří browserGPU pipelines; skutečné GPU binding/owner-slot náklady i obraz zůstávají neověřené. Formalargument lexical equivalence a primární ECMAScript odkazy jsou v `decision.md`. Tento záporný výsledek nemění denní13stage přípravu, timeout/readiness, image, sharedcache ani celkový migrační cíl.
