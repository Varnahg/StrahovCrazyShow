# Záseky přetrvávají bez UV identity notifikací

19. 10. 2026. Omezený lokální diagnostický experiment, **žádná nová produkční optimalizace ani přijetí KEY-31/32**. Snapshot `3320c7a9ba4bdb793dc5d3942c0527308e3487dda9c2471bea849fb9a65ea36a` obsahuje592 zdrojových/testových souborů; základ je již přijatý CPUprofile f80 nad current native8fb/SDWf8/MD3cc.

## Proč a co se měřilo

Předchozí stack zachytil Texture→Scene globaldirty→Material/SubMesh scan, ale neurčil první versus pozdější UV přechod. Nepřijatý first-UV guard c78 nezískal důkaz produkčního přínosu. Tento probe proto **zachovává původní stock notifikace**, shader math, matice i výjimky; neopakuje tuto optimalizaci.

Exact Texture f27 → QA payload `edaa133c49ee6886424b2530f51360ca1810b64912349a524d213e3e126fbe7c`, právě jeden SHA-ověřený Vite zásah. Borrowed dependencies, projektový patch a lock se nemění. Nejvýše64 skutečných UV notifikací má ID/texturu, existenci matice před alokací, old/newidentity, UV parametry a synchronní dirty-call elapsed. Defaultdisabled, žádné časování běžného cached fastpathu. Centralizovaný začátek/konec stávajícího Profileru zahrnuje buffer-full i chyby. Read/export a inventory probíhají až po stop Promise, mimo benchmark; reference na Scene se uvolní i bez DOM. Není přidána cache nebo další trvalá vrstva sběru.

Alternativy: další plain pilot nerozliší příčinu; plošný getMaterial profiler by přidal vysoký observer náklad; sparse-wrapper cache zatím nemá profilový důkaz. Prostý context reorder není paritní kvůli MultiMaterial getMaterial/resetDrawCache vedlejšímu účinku. Výzkum a hranice jsou v BMAD specifikaci/handoffu.

## Ověření diagnostiky

Helper12/12 actual Texture safety/lifecycle testů a15-state originál/probe parity (matrix/identity/7dirtycalls), manifest SHA `00f9d8eee6fa2771fc5939ac7cb30ad1a10a9fc6eef56d658132820ed6d62588`. Root31/31 (existujících29 +2 integrační), full TypeScript a hidden-map minifikovaný build PASS. První30/31 pokus selhal v testovém finally kvůli neúplnému fake DOM při NullEngine.dispose; oprava obnoví globals před cleanup. Původní v2log/sourcef500 a repair receipt zachovány. Payload edaa se neměnil. NullEngine proof neprokazuje WGSL/GPU/FPS.

Nezávislé read-only review helperu i skutečných sedmi adapterových změn v snapshotu vrátilo[]; zkontrolovalo limit/generace/původní throw/cleanup a přesný build transform. Celá testovací/integrace sada nebyla pro izolovanou diagnostiku opakována; poslední produkční native checkpoint má samostatné clean1472/combined1532/fullTS/build/integration důkazy.

## Skutečný Edge průjezd

GTX1060/driver582.28, Medium CSS/render2040×986, Alex,1 skutečná multiplayerová relace, noc1792447200000. Session `a9cd1691-78d8-4db2-8b05-da6dc282d422`,475 souvislých seq0–474, jeden10s benchmark,419 intervalů, UI/raw1:1. Nástup i jízda doloženy; minimum91,1m z řídkých pozic, nikoli úplná délka trasy. Foreground a ready idle33,424s. D550 před benchmarkem obešel prioritu sběratelské značky. Během měření žádné screenshoty/testy/jiná 3D scéna. Provoz0busy/8simulovanýchpasažérů/0auta; GPU77→80°C,1822→1518MHz, bez zamčených taktů.

| Metrika | Instrumentovaný průjezd |
| --- | ---: |
| FPS |41,9|
| p95/p99 |33,6/132,4ms|
| Maximum |197,7ms|
| Intervaly≥100ms |6|
| Programy/moduly/sync pipeline navíc |6/12/7|

Health valid/pending0, render/asset/browserErrors0. Capture `captured/benchmark-end`,16ms/max2000,**769 nepravidelných samples**. Počty vzorků ani count×16 nejsou CPU podíl/doba. Profiler souřadnice jsou1-based definition positions, SourceMap.findEntry používá0-based; namapovaná řádka není sampled instruction pointer. Základní interpretace odpovídá [primární specifikaci JS Self-Profiling](https://wicg.github.io/js-self-profiling/).

**UVtrace captured:0events,0overflow,0errors; probeErrors0.** V tomto průjezdu tedy šest záseků≥100ms nastalo bez jediné UV identity notifikace. První-versus-pozdější přechod se zde nevyskytl; tento výsledek nevyvrací předchozí pozorovaný UV řetězec ani jej univerzálně nevylučuje. Inventory `available:false` vzniklo absencí Scene z notifikace; nulové čítače nejsou důkazem prázdné scény nebo absence wrapper holes. Další UV guard/cache podle tohoto běhu nepřijímáme.

## Kam ukazuje další průzkum

Po ověření6 používaných JS/map párů obsahuje trace15 pozorování vybraných dirty/light/shadow řetězců. Konkrétní řetězec je `_markAllSubMeshesAsDirty → _markAllSubMeshesAsTexturesDirty → decorator setter → avatar-garments.materialFor:45 → install:110 → createAvatar:346 → TransitRenderer.update:222`. Jiné stacky obsahují light resync a vytváření shadow target/pass při vehicle updateBeam. Jsou to skutečné call paths, **nikoli změřený podíl na celém záseku**.

Další návrhy: dávkové nastavení právě nového garment materiálu před vlastním cache/mesh zveřejněním a návrat k odložené Medium/High přípravě auta po již přijatém exact shadow sharing. První návrh porovnává veřejné `atomicMaterialsUpdate` s globálním blokováním a změnou SDK, podle [připnutého zdroje Babylon9.30](https://github.com/BabylonJS/Babylon.js/blob/9.30.0/packages/dev/core/src/Materials/material.pure.ts). Ani jedna tato oprava není tímto diagnostickým commitem implementována nebo přijatá. Některé intervaly mají výrazně menší GameCPU než celý interval; chybějící stack neurčuje GPU/GC/idle příčinu.

`artifact-manifest.json` obsahuje SHA256 původních a komprimovaných bajtů všech94 artefaktů: raw trace/session/benchmark, mapy a odpovídajícíJS, source/inverse, helper proof, vlastní QA skripty i failed/passing test/build logy. Živé PID zůstávají v ignorované cache. Po testu menu, vlastní karta zavřena, viewport reset a pouze vlastní4200/2595 ukončeny s procesními guardy. Hraný4201 znovu HTTP/hash ověřen jako původní77d/19codefiles; všechny hrané snapshoty a cizí WIP zachovány. Nejde o čisté FPS A/B ani dokončenou migraci.
