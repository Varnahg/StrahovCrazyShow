# Nativní F3 metadata konstant: přijatá dílčí optimalizace

**Runtime oprava je v main 9edcc05132df1b3f9aa2c37c897fd11b29dad5fe** (WT54cca498c95bb7b8a6894863f41c3ee56d8e4bd5). Samostatných10souborů: patch, šest lock SHA referencí, dva testy/čtyři fixtures a task/předání.133cizích cest zůstalo byteově zachováno v obou checkoutech. Celé KEY-31/32, výchozí WebGPU ani migrace tím dokončené nejsou.

## Rozhodnutí a rozsah

F3 sdílí jen immutable názvy a permutaci po úplném porovnání skutečně přečtené sekvence. Zůstává původní getter/key/value/coercion/throw pořadí a canonical fallback. Žádná cache hodnot, řádků, výsledků, engine/device ani GPU zdrojů. Na defines je jeden WeakMap pointer; FIFO index max32schémat/262144nameunits, entry1024names/32768units. Živé weak keys mohou držet vyřazená metadata, takže nejde o celkový heap limit.

Výzkum a předchozí zamítnuté varianty jsou v ../f1 a ../shared-f3. F1 zrychlila warm, zhoršila cold. F2 sdílení snížilo cold cenu, ale mělo drahé common-prefix misses. F3 endpointreject je pouze levné odmítnutí před stále úplnou equality. Nový hash/index by přidal alokace/stav; odstranění úplné equality by bylo chybné. F3 synthetic churn stále46,929ms proti A33,465ms (+40,2% v jednom fixture okně); negativní výsledek se neskrývá.

## Opakování produkčního kandidáta

Jde o **dosavadní nativní WebGPU proti F3**, nikoli finální WebGL2/WebGPU srovnání. Měřen byl soukromý kandidát193477b9… se stejným přesným modulem3cc739…; následná skutečná instalace ověřila shodné runtime bajty.

GTX1060/driver582.28, Low77%, CSS1528×650/internal1175×500, fixednight1792447200000, řízené počasí, jedna skutečná relace/Alex/HUD. Stejný S1900/E-marker a10s benchmark s E/W8000/space2500; bez podrobného profileru. Původní plán ABBAAB, W4odlišná simulovaná zátěž a náhradní W7rozhodnutý před jeho výsledkem:

|Běh|Varianta|FPS|p95 ms|p99 ms|max ms|>=100ms|sim.pasažéři|
|---|---|---:|---:|---:|---:|---:|---:|
|W1|A|57,0|19,8|28,7|182,8|3|0|
|W2|F3|57,5|18,3|23,2|128,9|3|0|
|W3|F3|57,9|18,1|21,7|127,3|2|0|
|W4|A, jiná zátěž|57,3|18,6|23,1|166,8|4|2|
|W5|A|57,6|17,8|22,2|155,5|3|0|
|W6|F3|57,8|17,9|21,7|128,6|3|0|
|W7|A|57,3|18,4|24,1|157,6|4|0|

Matching3A/3F3 mediány: max157,6→128,6ms, p9924,1→21,7ms, p9518,4→18,1ms, FPS57,3→57,8. Celkem10/8intervalů>=100ms stále zůstává. First previous-frame CPU/render mediány154,1/146→123,7/115,4ms; pozdějšírender97,6→71,1ms. To podporuje úzký přenos této optimalizace, nikoli univerzální procentní FPS slib nebo odstranění všech záseků.

Všech7logů má seq0 bez mezer, správné UI/header source, právě1celou UI/raw shodu a validní health/pending0. Matching běhy mají0novýchprogramů/modulů a2syncpipelines; W4má3sync a je platný, pouze mimo0ambient mediány. Nepříznivá data nebyla filtrována podle rychlosti. Dva přípravné pokusy R1/V1 skončily předbenchmarkem kvůli ovládacímu wait/deadline a cross-cell timestamp při přípravě měření; zachované jakoaborted, nikdy nepočítané za výsledek.

Hostobservedidle30,627–30,648s, **skutečné logované ready-idle mediány33,978/35,345s**; nejsou to dokonale stejné30s podmínky. Takty/teploty70–74C nejsou uzamčené, některé after snapshoty jsouP5/810memory. Ty neprokazují takty během benchmarku ani nejsou důvodem vyřadit běh. Trasy se mírně liší. Independent raw review[] potvrzuje klasifikaci a omezení. Protokol, skutečné kroky browseru, timing, raw, UI a obrazy jsou přiložené.

## Skutečný nativní patch a plná kontrola

Frozen native manifest1655d900c5b3e93f7dab40975ad4ddf1810750d48a8e841a484675c7880ad27d. Nový patcha586e550…/lock35e3b0d6…, exact replay MaterialDefines3cc739bea27f7ec1f1b0f43e089d72d63ab15952166e7d3557c88af10ed34768. Ostatních8patchsekcí byteexact, šest lockrefs inverseexact. Package/workspace manifest a verze bezezměny. Independent native review[].

Portable testy: skutečný installed modul a inspection kopie stejných bajtů pouze pro metadata bounds;52case/156call+2partial-init probes,5sharing/eviction/reentrance/full-equality tests. RED2pass/5fail→GREEN7/0; první3TypeScript narrowing chyby zachované, následné scopedtypes0. Nejde o univerzální cyclic-module/GC/heap důkaz.

Fresh pnpm install s frozen-lockfile/ignore-scripts/package-import-method=copy exit0. První offline pokus skončil na chybějících postcss metadata, logzachovaný.10860core/loaderssouborů ověřeno, jediná změna exact3cc, ostatní balíkové bajty i původní shared10860bezezměny, core/loadersjednaclassidentity a physical copywitness. Žádný install do checkoutu nebo hraných dependencies.

Clean3c4be6d025f8524687e2eeb1cdf8f99f1c007ef12593ddda7c7db1ceb650fa03/576files: **1453/1453**, fullTS/build/4isolatedintegrationPASS. Knowncombined77d6064f02cd5bfb6cc394dc22858bc56996be77dbf6482fd11cb765e39d2a52/589files: **1513/1513**, fullTS/build/4integrationPASS. Combinednavazuje na již přijatý semantic3d405, nejde o nové převzetí cizíhoWIP. Historické QA-only metadata vynechány, codebaseline protiHEAD ověřena, currentAGENTS/ignore obnoveny. EmbeddedVITE_SOURCEID v obou buildech a source bytes po pipeline ověřeny. Původní2568runner bezezměny.

## Omezená actual native-built Edge kontrola

N1 používá compiledcombined77d a skutečně nainstalovaný patch. On/offsvítilna true/false, šestustálenýchpředloh, vstupdohry, explicitněpotvrzené auto a jízda, návratdomenu. Healthvalid/pending0/render+asset+browsererrors0. Session2f4e46a9… má seq0–1155, hlavní UI výsledek odpovídá právějednou druhému benchmarku. Frame contexts a UI potvrzují auto.

První pokus byla chůze, nikoli auto: entry nebyl potvrzen. Walkbenchmark/raw/summary zachované zvlášť. Po public resetu bylo ověřené entryhint a vehiclebefore/aftertrue; hlavní carbenchmark začal ažponástupu a je **funkční smoke, ne další first-entry FPS pár**. PředchozíF/presety/respawny a kombinovaný kód dělají podmínky odlišné. Rychlé Eli/Sam screenshoty ukázalyloading/partialstav; původní snímky zůstávají, oba později po publicready znovu vykreslené správně. Není to úplná editor/LOD/lifecycle matice. Jeden zastaralý pending údaj v pre-smoke receipt opraven po dokončení kontroly, původníreceipt zachovaný; raw se nepřepisovaly.

Own4200/2595/2568služby skončily, karta zavřená a viewportreset. Protected4199všech17code+servedHTMLexact; ostatníhranésnapshoty nerebuildované. Provozní PID receipts zůstávají lokální, archiv má jen run identity. Docs/verification.md zůstává cizíWIP; toto je samostatná evidence a předání pro integrátora.

## Co zbývá

KEY31/32: další>=100ms záseky a další postavy/scénáře. Před defaultem celé funkční/obrazové/lifecycle/multiplayer ověření a opakované WebGL2/WebGPU přiMedium a alespoň3skutečnýchrelacích. Dlouhý startup je nižší priorita, timeouty a ready kontrakt se nemění. Žádnýdefaultflip ani uzavření celé migrace v tomto commitu.

artifact-manifest.json má encoded/decodedSHA a původní délky; velké artefakty jsou losslessgzip. Runtimefiledelta je samostatný main9edcc051, tato evidence ověřuje jeho přijetí v úzkém rozsahu.
