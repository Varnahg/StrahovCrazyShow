# Primární import C9 a aktuálního kódu

Import3.11.2026; čtecí agent game_evidence_import, žádné nové měření. Kód main22398e38145db30aa0aec2eafa9fe39583178022. Root zdrojů `docs/performance/evidence/shader-syntax-cache-20261103/` (dáleE). Zdrojový otisk měření157e275e124aa354b242d13db2baf521b1b37f6383a4f2ab33475bc1d668cfb1. JSONL pozorování dirty stromu má jiný hash0c628f923db1f171f87eff2c30d7d61c18674bd69b149d29137e64e429629ba5 aHEADb5058f62; nezaměňovat.

Benchmarky vE/final-artifacts chronologicky `on2-benchmark-f91e273c-6a85-422b-b2ab-7e9e372491b3.json.gz`, `on2-benchmark-4388fa7f-325b-4e48-ab24-f85621143b17.json.gz`, `on2-benchmark-a894d958-038f-4e63-ad2c-b98c1f4b92f0.json.gz`. Všechny mají společný snapshotID, WebGPU, Medium,3 near avatary, CSS/internal1280×720, scaling1 a pevný spawn. Jde o úspěšný **opt-in ON2**, nikoli ověřenou výchozíOFF baseline nebo pohybovou trasu.

Startup čtyř pokusů je přímo v `E/final-results.json`, `$.runs`: on1/run1 startup-failed, off1/run2 startup-failed, off2/run3 startup-failed (presentation=false), on2/run1-attempt2 measurement-complete a startupReady=true. Proto jeden ze čtyř skutečně dosáhlready; nestabilní OFF2 není srovnatelným časovým kontrolním vzorkem. Toto není nezávislá replikační studie, pouze čerstvé čtení původních záznamů.

| JSON údaj | B1 | B2 | B3 |
| --- | ---: | ---: | ---: |
| durationSeconds / frames | 10,01 /241 | 10,05 /232 | 10,03 /226 |
| averageFps | 24,1 | 23,1 | 22,5 |
| p95 /p99 ms | 66,6 /102,9 | 66,7 /101,2 | 68,6 /224,4 |
| součet6 sourozeneckých frameBreakdownMs | 38,707 | 40,547 | 35,127 |
| frameBreakdownMs.render | 35,630 | 37,724 | 32,613 |
| engineCpuBreakdownMs.activeMeshes | 9,305 | 10,077 | 8,610 |
| engineCpuBreakdownMs.mainDraw | 18,949 | 19,972 | 17,337 |
| engineCpuBreakdownMs.renderTargets | 6,397 | 6,622 | 5,777 |
| frameWork.cpuMs (snapshot, nikoli průměr) | 37,8 | 32,7 | 33,0 |
| GPU čas | null | null | null |
| drawCalls /triangles (všechny průchody) |491 /3821024|491 /3821024|491 /3821024|
| renderCost.inventory registrované meshes |5244|5275|5213|
| enabled visible geometry meshes |2526|2552|2500|
| hidden geometry meshes |2713|2718|2708|
| enabled regular instances |732|758|706|
| enabled distinct materials |194|194|192|

Inventář není počet skutečně frustum-active objektů. activeMeshes je zde čas. Engine podfáze mohou být vnořené; nepřičítat je k render ani automaticky sčítat. Všechny CPU timers jsou wall duration, tedy mohou obsahovat čekání/odplánování. Rozsahy a omezení: client/benchmark-render-profile.ts:10–23; Game render scope:client/game.ts:3305–3353; snapshot oproti průměru:3461.

renderCost.shadows:520casters,8alpha,905candidates,178frustumRejected,207inactiveRejected,map1024. selectionMeshVisits521796/915406/1836087 jsou kumulativní, nikoli per-frame. Vegetace110stromů,336načtenýchmeshes,LOD[0,5,105],enabledtree meshes[0,10,311],enabledtree triangles2912679,pendingloads0,detailcache5/65488188bytes. Geometry439770546/season45238974/source112646003 jsou účtované bajty, nikoli VRAM. Tree triangle scope se liší od all-pass triangles; jejich podíl není podíl vykreslené práce.

## Dlouhé intervaly

E/final-artifacts/on2-4ad8bf3e-0fd3-4eeb-ac46-255e18259234.jsonl.gz obsahuje1692 souvislýchrecords seq0–1691. Benchmark-start945/1128/1628 nastaly249996,8/281697,5/357649,6ms. Vybraná jsou pouze celá frame-window uvnitř benchmarku; nejde o všechny benchmark frames a hranice se nedopočítávaly ze zaokrouhlených polí.

| Podmnožina | Frames | >50 /100 /250ms | p95 /p99 /max ms |
| --- | ---: | ---: | ---: |
| B1 seq961–1047 |212|34 /4 /0|64,4 /102,9 /128,9|
| B2 seq1139–1247 |224|40 /3 /0|64,8 /101,2 /107,4|
| B3 seq1634–1691 |173|15 /10 /1|180,8 /228 /1329,6|

L1: seq1653 výslovně páruje interval1329,6ms (360417,9–361747,5) s předchozím CPU callbackem66ms, render41,8ms. LoAF1666 start360485,4/renderStart361747,1/duration1443,3/script181/forcedLayout0ms. Nejdelší interval tedy nelze vysvětlit jen změřenou prací callbacku; příčina mezery neznámá. L2: seq1132 páruje105,1ms s předchozím CPU101,6ms/render97,3ms; jiné záseky se s render callbackem shodují.

Upřesnění po nezávislé kontrole:66ms a101,6ms jsou **měřený scope do labels**, nikoli celý callback. `game.ts:3335–3358` vylučuje recorder a pozdější HUD/benchmark bookkeeping. `lastCpuFrameMs` se nastavuje ažna konci (za onStats, přibližně3548), ale záznamy hitch jej neuchovávají jako plnou spárovanou řadu. Nelze tedy prohlásit mezeru za práci mimo celýcallback.

Přímý exportní řetězec: Game benchmark přidává `frameIntervalsMs` a `frameWork.webgpuMainPassMs/webgpuMainPassScope` (3460–3480), `ui.tsx:206–211,714–718` volá `projectLocalBenchmark` při uložení, server/local-benchmarks.ts:129 jej používá znovu. `shared/local-benchmark.ts:294–295` zachová jen frameWork.cpuMs/gpuMs; frameIntervalsMs v projektoru vůbec není. To vysvětluje chybění těchto polí v archivech. `gpu-diagnostics.ts:78–101` už má čtečku main-pass timing s označením main-render-pass-only a null při nedostupném/stale výsledku; existence čtečky neprokazuje dostupnýčas vC9.

## Existující mechanismy a kandidáti

TreeRenderer už má LOD, throttling, cache a frozen transforms (client/tree-renderer.ts:76–78,529–565,639–655); pilot bytes jsou dirty-gated505. Render inventory je on-demand (render-cost.ts:5,game.ts:3459). Nelze doporučit jejich prosté přidání jako novou optimalizaci.

Vysoká jistota pozorování: render je největší měřený callback scope. Nízká jistota kauzality: chybí rozdělení JS execution/driver wait/GPU/presentation/scheduling. Nejlevnější další krok je trace známého dlouhého intervalu a komponentové A/B. Data sama nerozhodují mezi stromy a stíny. Tři krátké stacionární vzorky nedokládají ovládání, kameru, pohyb, síťovou plynulost ani celou mapu.

Root spot-check znovu přečetl seq1132/1653/1666 a scope profileru; číselné rozlišení potvrzené. Navazující přímé importy3.11.: `client/active-mesh-candidates.ts:7–10,70–103` už dirty-gated filtruje efektivně vypnuté uzly; frustum/readiness/instances/LOD ponechává Babylonu. Instalace vGame:710–713. Nejde o prostorový index. `game.ts:2369–2422` má přímou first-person pozici a exponenciální follow v orbitě (`1-exp(-dt*12)`, rameno při uvolnění`1-exp(-dt*5)`); samotná existence smoothingu není naměřenou vstupní latencí. Lokální interpolace už existuje2538–2565. `render-fallback.ts:1–23` podporuje strictwebgl2/webgpu a loopbackwebgpu-fast; defaultwebgpu. `game.ts:2752–2792` má odlišnou předpřípravu kvalit proWebGPU aWebGL2. BackendA/B tedy hodnotí celý produktový výsledek; není izolovaným důkazem jediné příčiny.
