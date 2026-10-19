# Prostorový lease přijímačů auta: dosahový kandidát nepřijat

19.10.2026, KEY-31. Dokončený vratný QA experiment, nikoli nová přijatá runtime optimalizace. Native patch/Game/main renderer i hrané buildy zůstávají stejné.

## Produkční rozhodnutí

| První jízda v pořadí | FPS | p95 ms | p99 ms | max ms | ≥100ms |
| --- | --- | --- | --- | --- | --- |
| Původní A1 |55,1|21,4|30,0|167,2|4|
| Lease M1 |52,7|23,8|30,5|187,9|4|
| Původní A2 |54,5|22,5|28,7|187,7|4|

**Dosahový lease nyní nezačlenit do native runtime.** V celé produkční scéně nebyl doložen přínos pro záseky ani průběžnou plynulost. Všechny platné běhy jsou uchované. Jeden A/M/A a odlišné automatické GPU takty/trajektorie/ready-idle nejsou statistický důkaz kauzální regrese.

Ve všech třech: Edge155,GTX1060/driver582.28,1skutečnýAlex,0simulovanýchbus/car/passenger,Low77%,CSS1528×650/render1175×500,night1792447200000,stejné řízené počasí a vstupE/W8000ms/space2500ms.0nových programů/modulů,2syncpipeline,healthvalid/pending0. A1/M1/A2 před GPU873/911/847MHz,69/72/72°C; jen před/po snapshoty, nikoli fixní nebo kontinuální takty. Koncovéz121,52/118,93/120,60. Mode→ready51,64/52,02/53,37s, ready-idle26,89/41,78/45,00s. Žádná jiná lokální herní karta v inventáři před pilotem. Dočasný viewport override1528×650 byl po dokončení resetován a vlastní karta zavřená.

M zaznamenal1101eligible a1067excluded,7rebuilds/22632fullMeshVisits,17refreshes/18717recordVisits,1107membershipChanges,0errors. **Jsou to kumulativní čítače od spuštění controlleru, ne změna během10s benchmarku ani počet ušetřených serializer volání.** Neprokazují, že filtr zrychlil skutečně kreslené objekty. Scénové topology události mohou vynutit nový rebuild; tento náklad není skrytý.

## Přesné zdroje a provedená změna

- A native source909ebf8a019b26aff5561a0aaba97b976a26d033746da85ae958c6f4034589a5,595souborů. M final source23140d1131f390c4ac1e59523348baeebf243cf3f5e0de2aade5c8fe453fcd67,604souborů včetně testů/provenance. Stejné skutečné assets/public/node_modules roots, žádný memo nebo změna vendor patche/lockfile.
- Helper manifest21c926dfa8cdb2a4a1bfc6a4f28cd3ce072b8800d43b1711dda2958679114588, helperSHAa1e386d46972570a7b65a4c6477d9a7b0da780e8210fc9ebeccb234a8a3416c2. Stock32m vehicle/STANDARD, pohybovárezerva8m+5cm. Pouze WebGPU car, nikoli torch/B6/ostatnísvětla. PolicyOFF po celou původní preparation/submittedframe; static eligibility/worldAABB až za tímto gate před oznámením ready. Uvnitř rezervy O(1), refresh před opuštěním; ne další celoscénový steady scan.
- Zachované counterfactual caps, masks/lists, wholebounds, unknown/custom/frozen/deformed/instances fallbacky, původníintensity/ON/OFF/shadows. Cache drží scoped records, žádnou shader/effect variantcache. Explicitní materiál/topology/other-enabled-light observer bridge a budget/loader epoch; activeLoader/invalidbudget bypass. Aktuální immutable vlastníci jsou doložení; obecné neohlášené in-place změny nejsou automaticky bezpečné.
- Re-admission předává pouze změněné přijímače přes exact dříve ověřené StableLightState.markMeshesDirty a následné původní řazení. Starý zamítnutý per-frame receiver scan18701037 se nevrátil; převzalo se jen jeho12-line ordering API/testy po exact currentbeforeSHA kontrole.

## Ověření a review

Helper actualBabylon CPU10/10 a scopedTS2958/0. Jednotlivý160mesh synthetic replay po úplnémOFF/ON/OFF prewarm: activation serializers160→46, hranice0/0→4/10, všechny0novýchprogramů; gate~0,999/0,355/0,310ms, explicitníprecompute3,084ms. Steady200gate bezscene/recordvisits. To nejsou produkčníGPU/FPS data; pozitivníCPUproof se nenahrazuje za nepříznivý produkčnípilot.

RootQA **102/102 targeted**, fullTypeScript/buildPASS. Targeted-1 původně101/102: starý AST assertion vyžadoval budget bezprostředně před stableupdate. Oprava assertionu nyní kontroluje a skutečně vykonává budget→receiver→stable→draw pro interaktivnícestu a nezměněné budget→stable→draw pro preload, přesně1receivergate/2rendersites. Runtime se opravou fixture nezměnil. První sourceb38366b7… a failedlog zůstávají zachované; finalsource23140d11… má testopravu v manifestu. Nový startup test dokládá factory až po fullpreparation/submittedgate.

Nezávislé BMAD blind code review:[] v přesně předanémQA scope včetně bridge/invalidation/teardown/fixture; omezení statického kontraktu přiznané. Dodatečné nezávislé raw-review pokusy obou reviewerů selhaly na externí kapacitě modelu; **raw audit proto není označený jako nezávisle dokončený**. Root compare-pilot ověřil všechny3source/session/seq0→konec bez mezer, právě1celouUI/rawframearray shodu, počasí/rozlišení/health a browser-state visible/focused. Žádná ztráta focus nebyla v raw zaznamenaná. Nejde o Medium/2040×986/3peer, shadow/image nebo plnou lifecycle přejímku.

## Důsledky pro další práci

Z již existujícího původního instrumentovaného profilu (main d17da3a6, zde jen podmnožina `prior-source-costs.json`) má carentry preparation architecture186calls38,8ms, tree92calls31,5ms, unclassified175calls40,2ms. Unclassified zahrnuje celé terrain/mapped-surface meshe s rozsáhlými bounds. Tato čísla se nesčítají s nynějším čistým A/M/A jako kauzální zisk. Vysvětlují, proč eliminace převážně vzdálených známých statických přijímačů sama nestačí. Cone je užší případná možnost, musí nejdřív doložit skutečně kreslené eligible objekty; wind/instance vegetaci automaticky neřeší.

Další prozkoumaný menší kandidát je rychlá kanonická serializace s metadaty pořadí klíčů, bez cachování hodnot/výsledku/engine zdrojů. Dřívější čistý serializer experiment měnil jen parser hotového textu a stále jej každýcall řadil; tento metadata fastpath nezkoušel. Před implementací vyžaduje differential getter/throws/coercion/reentrance/limits proof a celý skutečný warmřetězec, ne pouze helper mikrobenchmark. Žádná taková další optimalizace není tímto experimentem přijatá.

Vlastní služby4200/2595 ukončené podle PID/start/path/cwd identity. Protected4199 všech17codefiles a servedHTML před/po exact. Hrané4188/4192–4199 i133foreignWIP bezezměny.108payloadů v artifact-manifest, gzip lossless; operativníPID vynechané. KEY-31/32 a celý cíl zůstávají otevřené.
