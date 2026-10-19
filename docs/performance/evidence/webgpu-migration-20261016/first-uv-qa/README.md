# První UV invalidace: produkční přínos neprokázán

19. 10. 2026. Kandidát **není přijat do produkčního patche**. Tento záznam uzavírá omezený experiment, nikoli KEY-31/32, výchozí WebGPU nebo migrační přejímku.

## Rozhodnutí a důkazy

CPU profil předchozího current-native Medium průjezdu zachytil skutečný řetězec `Texture.getTextureMatrix → Scene.markAllMaterialsAsDirty → Material._markAllSubMeshesAsDirty`. Neurčil, zda šlo o první výpočet matice. Stock Texture začíná identity sentinel hodnotou; kandidát proto potlačil první notifikaci jen na WebGPU, aniž změnil vypočtenou matici nebo pozdější notifikace.

Zvažované alternativy a omezení jsou v BMAD specifikaci a helper CONTRACT. Eager startup hook nepokrývá pozdní klony, mesh-membership cache vyžaduje render-pass/MultiMaterial/instance lifecycle a vypnutí UV optimalizace může změnit shader varying budget. Dva přesné hunks byly nejmenší testovatelnou variantou; možnost nestandardního externího getteru/resetu soukromé cache není univerzálně podporována.

Source **c78de2b2ed2e20519aa38b6fccb5c1ddc9df66ebc368b89cb7a684c3c6067f1c**,586 zdrojů/testů; native základ8fb217a1… a SDWf8. Vite transform ověřil preimage `f27fd4a5…`, candidate `f98c6a16…` a právě jeden zásah. Původní dependencies, projektový patch i lock beze změny. `source-manifest.json.gz` a `build-transform.json.gz` obsahují přesné identity.

Genuine CPU RED2pass/2fail → GREEN4pass/0fail. Čtyři další skutečné Standard/PBR/NodeMaterial procesy × šest stavů zachovaly celé matrix bytes, defines, ordered ABI a shader text tables; jen WebGPU first dirty1→0. Root tento proof znovu přehrál do vlastní cache. NullEngine/GLSL fixture s explicitním decoded-one-pixel ready bitem není WGSL/GPU/image přejímka. Původní failed fixture pokusy jsou přiložené. Root4/4, full TypeScript a produkční minifikovaný build PASS. Další plná sada/integrace nebyla pro nepřijatý izolovaný kandidát provedena.

## Skutečný produkční běh

Edge, GTX1060, driver582.28; Medium CSS/render2040×986, Alex,1 skutečná MP relace, noc1792447200000. Čerstvá session `910dceb8-7d30-489a-8fed-52c230291148`,732 souvislých záznamů, právě jeden desetisekundový benchmark,354 frame intervals a přesné UI/raw1:1. Nástup i jízda doložené kontextem, minimum94,8m z řídkých pozic; nejde o úplnou délku trasy. Foreground doložen. Žádné pozorování ani testy během měření.

| Metrika | Kandidát |
| --- | ---: |
| FPS |35,4|
| p95 |40,2ms|
| p99 |138,8ms|
| Maximum |802,9ms|
| Intervaly≥100ms |14|
| Nové programy/moduly/sync pipeline |6/12/7|

Health valid/pending0, render/asset/browser errors0. První nástup měl181,5ms interval s předchozími175,6ms synchronní Game CPU, render133ms. Největší interval měl756,9ms synchronní CPU, render686,7ms. Záznam určuje fázi, nikoli konkrétní rutinu; nelze jej přiřadit UV nebo driveru podle pouhé časové shody. Detailní hitch záznamy jsou omezené a zachytily12 ze14 intervalů≥100ms. Kompletní histogram je v `benchmark.json.gz`.

**Nejde o srovnatelné A/B.** Provoz2busy/4pasažéři/2auta se lišil od předchozího native0/1/0. GPU88°C před/po a takty1797→1480MHz nebyly zamčené; tepelná příčina není tímto prokázána. Příprava vyžadovala boční přesun mimo sběratelskou značku a předchozí odmítnutý pokus nastoupit z větší vzdálenosti. Procentní zrychlení ani regresi nelze tvrdit. `summary.valid=true` ověřuje integritu a základní podmínky; neznamená přijetí kandidáta.

Původní neproměřená karta se uzavřela při konci předchozího tahu. Její raw session55e30d90… zůstává v `unmeasured-session.jsonl.gz`. Nová relace použila stejné nadále běžící služby a identitu buildu; nebylo znovu spuštěno měření po pouhém observačním timeoutu. Od skutečné ready před jízdou uplynulo více než30s. Po testu návrat do menu, karta zavřena, viewport reset a vlastní služby4200/2595 ukončeny s kontrolou identity procesů. Hrané buildy nedotčeny.

## Artefakty a rozsah

`artifact-manifest.json` uvádí SHA256 původních i komprimovaných bajtů. Přiložené jsou source/transform identity, raw benchmark a celá proměřená session, omezené hitch přiřazení, GPU teploty/takty, obrazy, vlastní QA skripty, test/build logy, helper26artefaktů a root replay. Živé PID se necommitují. Nezávislé candidate-only review bylo bez nálezů; **neprokazuje výkonovou přejímku**. Úplná denní/noční UV image parity a multiplayer/lifecycle matice nejsou dokončené a u tohoto nepřijatého kandidáta se netvrdí.

Další krok: zjistit skutečný spouštěč a cenu render invalidace, zejména první versus pozdější UV přechod a úplný Material/SubMesh/render-pass řetězec. Nepřidávat cache ani nepřepínat default podle tohoto výsledku.
