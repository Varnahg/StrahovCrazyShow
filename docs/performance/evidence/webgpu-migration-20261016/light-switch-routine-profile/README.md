# CPU cena osmi materiálových rutin při světelných zásecích

19.10.2026 Europe/Prague. Přijatý diagnostický výstup, žádná nová runtime cache. Předchozí stacky určily volané funkce; toto měření konečně oddělilo jejich synchronní wall-time bez dvojího sčítání vybraných parent/child rutin.

| Scope | Nastoupení + světla | Další změna světel |
|---|---:|---:|
| MaterialDefines.toString |**61,2ms /499calls**|**50,8ms /431calls**|
| PBR._prepareDefines |22,8ms|8,3ms|
| PBR._prepareEffect bez vybraných children |9,3ms|5,5ms|
| Standard readiness bez vybraných children |12,3ms|7,0ms|
| PBR readiness bez vybraných children |12,0ms|1,6ms|
| engine.createEffect |2,0ms|1,3ms|
| bind-group cache |16,4ms|10,0ms|
| updateUniformBuffer |1,4ms|1,3ms|

Serializer je největší jednotlivá změřená rutina. Zahrnuje původní property/getter loop, formátování i canonicalResult validaci/třídění; **61,2/50,8ms nejsou samostatnou cenou parseru**. Samotný effect cache lookup je výrazně menší. Nadřazené inclusive readiness/PBR.prepareEffect zůstávají v raw datech a nesmějí se přičítat k tabulkovým vybraným children.

Tři skutečné samples mají321/500/432mesh pokusů,0omissions/errors/unknown/incomplete; jejich MeshDraw příprava6,7/124,1/76,6ms, bind/draw12,2/53,5/33,3ms, main draw22,6/183,5/112,5ms. Osm callTiming rows/frame máerrors/depthSkipped/restoreConflicts0 a závěrečný cleanuperrors/conflicts0. Nízké zaokrouhlené0ms neznamenají nulovou práci.

## Rozsah a omezení

Časování je aktivní pouze v existujících max8sampleframes během explicitního benchmarku. Wrappers jsou vlastněné benchmarkem a po limitu/konci/restartu/faultu/dispose obnoví přesné původní descriptory; cizí náhrady nepřepisují. Testy ověřují receiver/args/return/throw/Promiseidentity, selected-child subtraction,32depth limit, atomicrollback, stalegeneration i skutečné Standard/PBR dispatch a collector. Není standardníJSsampler ani jehoDocumentPolicy.

Scope je celý synchronní `Scene.render()` včetně případných dalších průchodů. **Není to přesný rozklad MeshDraw hlavního průchodu ani GPU čas.** SelfSelected odečítá pouze vnořené vybrané rutiny; obsahuje ostatní práci, GC/native/driver čekání a instrumentační režii. Wrappers mohou měnit JIT chování; diagnostickáFPS nelze porovnat s neinstrumentovaným během jako dosažené zrychlení. Před přijetím opravy musí běžet čisté A/M/A bez těchto wrappers.

## Identita a ověření

Source `0ac5b4db9e77fe178f08ab3dd40cfb20f4af7724d61270eb9d5ffd9df2056e06`,629vstupů včetně testů, exact Game inverse vůči26878bbf/native909ebf8a. Session `da753f79-b879-4f9c-ad17-03d915b4578d`,421souvislých rawřádků. Edge155/WebGPUcompatibility/NVIDIAPascal, hostGTX1060driver32.0.15.8228; CSS1528×650/internal1175×500,Low77%,1actualAlex/0ambient, pevná původníweatherfixture a night1792447200000. AktuálníLow preference je nastavena již při vstupu; dřívějšíCPUcapture začínalAuto/Medium a naLow přešel po ready, proto mezi těmito diagnostikami netvrdíme A/B změnu.

Benchmark51,0FPS/p9524,9/p9934,6/max211,6ms pouze popisuje instrumentovaný běh; healthvalid/0errors/pending. Přesné shader/pipeline čítače jsou v benchmark.json. Helper15/15+scopedTS a celé zapojení **32/32+fullTypeScript+produkčníbuildPASS**; nezávisléreview bez doloženého nálezu, se správně uvedenými scope limity. Fullsuite/integrace zde znovuNOTRUN, runtime zůstává přijatý původní native/combined.

Vlastní4200/2595 ukončené po návratu do menu. Protected4199 před/po17codehashů+servedHTML shodné s3d405db9; ostatníhranéslužby nepřestavované. Archiv33payloadů má původní i gzipSHA a délky; PID/start identity zůstávají ignorované, projekce je bez nich. Současnýmain/runtime se nemění.

## Následující oprava

Zvažované varianty: dalšíeffect lookup cache cílí jen2/1,3ms; trvalélight slots mění shader/shadow/GPU práci; staršípure serializer rewrite nezlepšilcelýrender; omezenéexplicit-owner memo má již correctness/lifecycle proof a CPUúsporu na opakovaných textech, ale uniquechurn+12,59% a dřívějšíGPUběhy s odlišnýmiambienty byly nejednoznačné. Nejlepší další ověřitelný kandidát je **přenést původní memo64entries/262144combinedUTF16units na současnýruntime a změřit čisté A/M/A s0ambienty a0shader misses**. Zachovat současnéIBL/IPpatche a všechny getter/customserializer/deviceepoch kontrakty. Do přijetí žádná runtime integrace. Samotný toStringwrapper na M by memo vypnul kvůli stock-method identity guardu, proto se v tomto pilotu nepoužije.
