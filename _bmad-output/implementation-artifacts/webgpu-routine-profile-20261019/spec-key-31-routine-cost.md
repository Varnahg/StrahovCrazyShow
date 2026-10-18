---
title: 'KEY-31: vlastní CPU cena potvrzených materiálových rutin'
type: 'chore'
created: '2026-10-19'
status: 'done'
route: 'oneshot'
review_loop_iteration: 0
context: ['{project-root}/docs/agents/bmad-policy.md']
---

<frozen-after-approval reason="Konkrétní diagnostický krok již autorizovaného migračního cíle">

## Intent

Změřit cenu konkrétních rutin při zbývajících světelných zásecích v produkční scéně, aby následující oprava vycházela z doloženého dominantního nákladu. V nové izolované copied verzi použít pouze osm z předchozích stacků potvrzených metod, aktivní časování v existujících max8světelných vzorcích; zachovat vykreslení, původní metriky, lifecycle i hrané verze. Výstup je důkaz pro volbu opravy, nikoli nový herní profiler nebo samotná optimalizace.

</frozen-after-approval>

## Implementation Notes

- BMAD oneshot: jedno reverzibilní QA zapojení, žádná produktová volba ani nezvratnost. Před rendererem claimroot/childoutputs+heavy/gpu/4200/2595. Foreign133paths a staré seven adminJSONs zachovat. Subagent má disjunktní helper/test/handoff; root vlastní copiedGame/build/capture/evidenci. Konfigurace rendereru/workflowfe8292081bd751763aeb odpovídá předchozí skutečně načtené verzi této worktree.
- Podklady: main56970786 CPUstackcapture, source52abcad6; skutečná pinned9.30.0 implementace Standard/PBR readiness, PBR._prepareEffect/_prepareDefines, MaterialDefines.toString, WebGPUEngine.createEffect/updateUniformBuffer, WebGPUCacheBindGroups.getBindGroups. CachecreateEffect stále přichází až za vytvořením define textu a effectoptions. PatchedtoString validuje/třídí hotový blok při každém volání.
- Starší hitches-v21 Nodeproof36submeshes: toString medián4,566ms PBR oproti7,381msreadiness; není produkčníGPU a nelze jej přepočítat na500calls. hitches-v23 čistýserializer rewrite nezlepšilcelýrender. Dosavadnímemo experimenty a jejichomezení nesmějí být přepsané; aktuálnípodíl po odstranění shader missů ještě nebyl přímo změřen.
- Varianty: opakování standardního JSsampleru neposkytne časovépodíly (199sub8msgaps, baseAPInerozlišítimer/forcedsamples). DřívějšíNodefixture nemá celouprodukčnívariabilitu. Vybráno pouze8vnořených wall-timečítačů v nynějších8framepříležitostech; dalšíglobálnícache/light-slots/prewarm zatímneimplementovat.
- Copybase26878bbf z retainednative909ebf8a, bez CPUselfProfiler/policy. Helperwraps Standard/PBR.isReadyForSubMesh, PBR._prepareEffect/_prepareDefines, MaterialDefines.toString, engine.createEffect/updateUniformBuffer a cacheBindGroups.getBindGroups. Prototypovédescriptors se zachovají, wrappers existujíjenbenchmark; clockreads/countersjenbegin/endFrame. Přesnáreturn/throw/this/args/Promiseidentity; max32depth aexpliciterrors/skips/conflicts. Self odečítá jen vnořené vybranéfunkce, nesmí se sčítat s jejichinclusive.
- Game.lightSwitch vlastníhelper: konstrukce v lokálníWebGPUbráně, beginpo finalmembership aexistingMeshDrawbegin, endpřed MeshDrawexport, rows8podcallTiming v existující samostatnéudálosti. Max8/restart/fault/dispose/recording-end odpojíwrappers idempotentně. Collectorlimit32KiB a redakceověřené naactualrecordu; původnírenderererrornesmídiagnostikapřepsat.
- Tests: actualnestedhelper+Babylonbindings, source-extractedGame trigger/lifecycle/recordlimit/inverse, fullTS/build. JedenEdgecontrolledfirstdrive při CSS1528×650/Low77%,1actual/0ambient/night/weatherfixture. Samplecounts+inclusive/self/corecost explicit; nulovéclock/restore/omissionerrorsjsou podmínkou interpretace. Wall-time můžeobsahovatnative/driver/GCčekání; nejdeGPUtime ani čistýFPSA/B. Vlastníservicesukončit, protected4199SHApřed/po.
- Dalšíoprava se vybere z tohotoaktuálníhovýsledku; zachovat rawlogy, zdroj/testSHA, neúspěšnéběhy a samostatnýscopedcommit. PokudtoStringdominuje, znovu posoudit levnější čistýserializer/omezenéexplicit-owner memo protiostatnímvariantám; pokudne, nepřidávatcachejenpodlehistorickéhoNodehitrate.
- Přijato: helper15/15/scopedTS, Game32/32/fullTS/build a skutečnýEdgecapture source0ac5b4db. ToString61,2/50,8ms oproticreateEffect2/1,3ms; dominujeserializacevčetněrawloop+canonicalResult.3completesamples/0clock/depth/restoreerrors,421souvislýchrawřádků. Review[]s výslovnýmscopeceléScene.render; žádnýdoloženýnález. Protected4199exactpřed/po, vlastníQAukončené. Donejenprodiagnostickývýstup. Novýzvláštnícurrentmemoproof+neinstrumentovanýA/M/A rozhodne o runtimeopravě.
