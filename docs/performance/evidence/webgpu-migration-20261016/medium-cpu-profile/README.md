# Medium firstdrive: skutečné JS stacky po SDWf8

Source **f80f93c8a3d2cd0c44d48e73639e314bee16d4bdb5d5ece7f7095aa6d73173b6**,587source/test/provenance souborů. Currentnativeclean8fb+SDWf8/MD3cc a existující CPUprofilerV2:9lightSwitch+9CPU Gameeditů mají exactinverse naNativeGame32f, rendercost pouze2diagnostic additions, další2runtime+3testy. Staré629source/config/deps nepřevzaty. **29/29**, fullTS a minified hidden-map build PASS; nová celá sada/integrace se nespouštěla. Firstassembler inverse opomněl separatornewline, opraven jenassembler, partialownedtree/errorreceipt zachované. Runtime donor nezměněn. Independentreview[].

JedinýProfiler16ms/max2000 a existing bounded mesh sampler nejvýš8frameresultů, bez dalšíchroutine/programattribution hooků. Vlastnípreview Document-Policy:js-profiling, actualEdge constructor/stop úspěšné: **784samples/616frames**, reasonbenchmark-end. RawCPUexport je samostatnýDOMpre, ne osekanýsessionevent. Timestamp je relativní ktimeOrigin okna; frame line/column jsou1-based **pozice definice funkce**, ne instructionpointer. SourceMap.findEntry používá0-basedoffsety. [Primární specifikace](https://wicg.github.io/js-self-profiling/). Legacyheader vtomto prohlížeči skutečně fungoval.

## Actualscéna a limity

Relace94eb75c5-92a9-4094-8dd5-c9c7d2b6431f,536souvislých záznamů odseq0, MediumCSS/internal2040×986,Alex1actual,night1792447200000,řízenépočasí,plainwebgpuCM.30sustálení, S1900/E/benchmark/E/W8000/space2500. Carfalse→true, nejméně84,32m mezi zachycenými vehicle polohami,foregroundtrue,raw/UI1:1shoda1. Řidšíkontextovývzorek neudávácelouujetouvzdálenost. END0bus/5passenger/0car. GTX1060/582.28,83→81°C,1797→1366MHz před/po; odlišná zátěž/instrumentation/takty/cache vylučují FPSA/B.

Profilovanývýsledek41,9FPS,p9532,3ms,p99136,5ms,max201,4ms,5intervalů≥100ms,7preparations/14modules/8sync. Healthvalid/errors/pending0. Trace107418,60→117451,30ms,timeOrigin1792414867325,9;benchmark107418→117438ms. Median samplegap16,005ms,min0,015ms,max31,695ms,273gapů<8ms. **Samplecount ani count×16 nejsouCPUčas/podíl.** Chybějícístack neurčujeGC/GPU/idle. CPUintervaly jsou walltime synchronníhoGameframu, ne thread utilization.

## Co záznam mění

První201,4msinterval má předchozí synchronníframe196,8ms. MainDrawreport132,0ms z469dokončenýchcalls, ztoho91,7mspříprava/40,3msbind+draw; žádnébudget/ambiguous/unmatched/incomplete přeskočení. Top-source wallarchitecture35,4ms,trees28,2ms a dalšíunclassified; nejdražšíjednotlivýheadNPC16,9ms. OmittedtopN součty zachované. Vše zahrnujeobserver/profiler overhead.

**Čtyři skutečné stacky uvnitřentry: PBR._prepareEffect/_prepareDefines → PrepareDefinesForMergedUV → Texture.getTextureMatrix → Scene.markAllMaterialsAsDirty → Material.markAsDirty → _markAllSubMeshesAsDirty.** Poslednímetoda vpinovanémcore skenuje celou scene.meshes/submeshes/passwrappers; useMaterialMeshMap tuto konkrétnícestu nezkracuje. Jde o přímé pozorováníUV-driven invalidace, neCPUprocenta ani identitu konkrétnítextury. Data neodlišují prvnívýpočet odpozdějšíidentitytransformace. SDWtoken/contextcleanup se nevydává za dominantnípříčinu.

Další≥100msintervaly mají předchozíCPU44,0/18,4/134,5/31,7ms; některémezery leží mimo tentoGameCPUbracket. DruhýdlouhýCPUframe ani mezery se nesmějí schovat jednouTexturehypotézou. Přesnéhitch/sampleokna ařetězce v hitch-analysis.json.gz,JS/mapSHA vcpu-summary.json.gz.

Navazujícíprůzkum: stockPBR/Standard/NodeMaterial rozhodujíidentity až po getTextureMatrix. Sentinel_cachedIdentity3x2 začínátrue a cachematrixnull; prvnícomputednonidentity proto může vyvolat zbytečnéoznámení ještěnepoužitéstockmatice. Nejmenšícandidate hadCachedMatrix předalokací přeskočíglobaldirty JENpřiprvnímvýpočtu naWebGPU; math i pozdějšípřechody zachovat. **Vtomto tasku neimplementováno/neověřeno**, first-vs-later stálehypotéza. Eagerstartup nepokryjelateclones;dirtyindexmácounterexamplesrenderpass/MultiMaterial/instance;disableoptUVměníshaderbudget. Thirdpartyoverridehistorie sidentitybezsuper nenístockinvariant; client/core/loaders assignmentoverride nenalezen, nejde o univerzálníSDKpříslib.

Vlastní4200/2595/GPUkarta ukončené,viewportreset; hranésnapshoty/deps/cizíWIP nezměněné. KEY31/32/default/migrace a hitches zůstávajíotevřené. Manifest obsahuje rawCPU/session/benchmark,7sourcedelta,testy,logy,protokol a použité JS/mapdvojice pro offline replay.
