# KEY-31: nativní přenos immutable serializer schema F3

Root integrace dokončena: WT54cca498c95bb7b8a6894863f41c3ee56d8e4bd5 → main9edcc05132df1b3f9aa2c37c897fd11b29dad5fe. Native úkol je přijatý; celá migrace/KEY31/32nejsouDone. Úplná evidence a navazující předání: docs/agents/handoffs/webgpu-serializer-schema-qa-20261019.md a docs/performance/evidence/webgpu-migration-20261016/serializer-schema-qa/native/README.md.

## Root ověření před integrací

- Root převzal explicitní předání přes claim webgpu-01a15102-schema-native-root s adopt-dirty; osm payloadů stále odpovídá manifestu1655d900. Native source/patch/lock/test review[].
- Replication:3matchingA maxima182,8/155,5/157,6ms,3F3 128,9/127,3/128,6ms. Medianmax157,6→128,6,p9924,1→21,7,p9518,4→18,1,FPS57,3→57,8;>=100ms10/8celkem zůstává. W4s2ambient/3sync zachovaný mimo0ambientmediány; W7replacement předem. Hostobservedidle30,627–30,648s, actualreadyidlemediány33,978/35,345s, nezamčenétakty/trajektorie limitujíkauzalitu. Independentrawreview[]. NejdeofinálníMedium/3relace/WebGL2přejímku.
- Fresh copied pnpm install exit0, package-import-method=copy/frozen-lockfile/ignore-scripts. Prvníofflinepokus selhal na postcssmetadata, logzachovaný.10860core/loadersfreshsouborů ověřeno, jedinýdeltaexact3cc; původníshared10860unchanged, core/loadersstejnáclassidentity, source/lockunchanged. Žádnýinstall do pracovníchcheckoutů.
- Clean3c4be6d025f8524687e2eeb1cdf8f99f1c007ef12593ddda7c7db1ceb650fa03/576files:1453/1453/fullTS/build/4isolatedintegrationPASS. Combined77d6064f02cd5bfb6cc394dc22858bc56996be77dbf6482fd11cb765e39d2a52/589files:1513/1513/fullTS/build/4integrationPASS. Combinedreusesacceptedsemantic3d405, cizíWIPnenověpřevzatý. HistorickéQA-onlyprovenancevynechány, codebaselineHEADověřena,currentAGENTS/ignoreobnoveny. EmbeddedVITE_SOURCEIDověřeno voboubuildech.
- ActualnativebuiltcombinedEdgeN1:sourceUI77d,torchon/offtrue/false,šestustálenýchpředloh,vstupdohry,potvrzenýnástup/jízda,výstupdomenu. Carhealthvalid/pending0/render+asseterrors0,browsererrors[]. Firstattemptbylachůze, zachovanýwalkbenchmark/raw, nepočítanýzaauto. Eli/Samrychléscreenshotyloading/partial zachované; retryafterenabledready ukázalsprávnéoblečení. Hlavnícarbenchmarkje2.vrelaci a začalažponástupu, nikolisrovnatelnýfirst-entryFPSdůkaz.
- Rootreceipts/logy v .cache/webgpu-serializer-schema-qa-20261019/: native-install-verified/native-validated/native-pipeline,replication-analysis,runs-f3-replica,runs-native/n1. Own4200/2595/2568stopped,kartazavřená/viewportreset,4199code17+HTMLexact. Samostatnáruntimeintegrace následuje; KEY31/32/defaultstáleopen a syntheticunique-shapeF3churn+40,2%zůstáválimit. Plnárawevidence bude samostatnýcommit.

- Task: `webgpu-schema-native-20261019`; vlastník `webgpu-01a15102-schema-native`; koordinátor root. Přímý BMAD leaf, bez dalšího workflow, podagentů či commitů.
- Výsledek: připravený nativní patch a přenositelné regrese. Nejde o přijetí migrace, výchozího rendereru ani nový GPU důkaz. Výzkum/varianty a výkonnostní přijetí řídí root; tato práce nepřidává další optimalizaci.
- Payload manifest: `.cache/webgpu-schema-native-20261019/manifest.json`, SHA256 `1655d900c5b3e93f7dab40975ad4ddf1810750d48a8e841a484675c7880ad27d`. `files` uvádí přesných osm přenášených repo cest; `inputs` zdrojové SHA, `artifacts` skripty, preimages, replay a logy.

## Změny a přesnost

- Jen sekce `Materials/materialDefines.js` v `patches/@babylonjs__core@9.30.0.patch`; všech ostatních osm sekcí zachováno byteově. Nový patch SHA256 `a586e5501d61c197ade5604a23b5f64a3e01d171ef4f839bbe94001f1d6b422b`.
- Přesný reverse původní sekce proti přijatému oracle `43a75f4a…` obnovil pristine `fcb89b6c…`; replay nové sekce obnovil frozen F3 `3cc739bea27f7ec1f1b0f43e089d72d63ab15952166e7d3557c88af10ed34768`. Žádné následné runtime cleanupy. Zpětná výměna sekce obnovuje celý původní patch.
- `pnpm-lock.yaml`: pouze šest výskytů původního patch SHA nahrazeno novým, inverse byteově přesný. Nový lock SHA256 `35e3b0d65cf484678129b0c54a3e42acde1b2540308f125ba08bec5c56f33e0c`. Manifesty a závislosti se neměnily; žádný install.
- Metadata kontrakt zůstává přesně F3: slabý pointer na defines, immutable primitive names/order/validNames, FIFO32/262144 name units, jeden schema entry1024/32768; žádné values/fragments/results/resources. Live weak-key schema může přežít odstranění ze silného indexu, takže nejde o celkový heap cap.

## Testy a cílený refaktoring

- Dva nové testy a společný fixture `installed.ts` řeší skutečný nainstalovaný modul přes `createRequire.resolve`, včetně pnpm layoutu. Veřejný corpus používá skutečný import; soukromé bounds/sharing kontroly používají izolovaný modul ze stejných installed bytes s test-only inspection exports a současně ověřují veřejný výstup proti skutečnému importu. Žádný dependency soubor se nezapisuje.
- Přeneseno52 differential cases/156 calls a dvě partial-initialization probes; zachována oracle licence/provenance. Oracle je přijatý patched current, nikoli pristine upstream.
- Pět shared testů ověřuje kompletní identitu sekvence, vynechání dalšího sortu, count/name-unit FIFO limity, přežití weak pointeru, unsafe/duplicate fallback, reentranci a shodné endpoints s odlišným middle pořadím.
- `.cache/webgpu-schema-native-20261019/run-light.mjs`: izolované kopie testů pod vlastní cache s junctions na read-only referenční/F3 dependencies. RED starý current:2pass/5fail (nový schema kontrakt chybí). GREEN frozen F3:7pass/0fail. Scoped strict TypeScript jen nové testy/fixture: exit0. Výstupy `old-test.log`, `new-test.log`, `new-types.log`, `light-results.json` jsou hashované manifestem.
- První scoped types pokus našel tři chybějící undefined-narrowing assertions v přenesených testech; opraveno explicitním `assert.ok(schema)`. Původní log a výsledky zachovány jako `first-types-failed.log`, `first-light-results.json`; následný celý lehký RED/GREEN/types běh prošel.
- Přípravný první inverse check selhal kvůli JS replacement-string interpretaci `$` v původní patch sekci; před zápisem produkčního patche opraveno callback replacementem. Následný přesný inverse i replay prošel; nešlo o runtime/test selhání. Pokus o `python --version` našel nefunkční WindowsApps alias; implementace používá Node24.

## Převzetí a omezení

- Root může převzít jen osm `manifest.files` cest. Plný fresh install, projektové types, suite/build/integration, kombinovaný snapshot a GPU přijetí jsou root gate; leaf je nespouštěl. Předchozí naměřený synthetic unique-shape churn F3+40,2% zůstává známým omezením; tento přenos jej nezakrývá ani nepřeměřuje.
- Hrané snapshoty, Game/UI, cizí WIP i sdílené `node_modules` beze změny. Own subprocesses dokončeny synchronně; nezůstává pomocný server ani měření. Rezervace se po předání uvolňuje; integrátor rozhoduje o stavu tasku a commitu.
