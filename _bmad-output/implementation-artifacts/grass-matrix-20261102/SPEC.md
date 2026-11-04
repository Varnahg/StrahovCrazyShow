---
title: 'Levnější CPU snapshoty matic trávy a květin'
type: 'refactor'
created: '2026-11-02'
status: 'in-review'
route: 'oneshot'
review_loop_iteration: 0
context:
  - 'AGENTS.md'
  - 'docs/agents/bmad-policy.md'
  - 'docs/work-in-progress.md'
---

<frozen-after-approval reason="Uživatel výslovně schválil navržený plán: Implement the proposed plan.">

## Intent

Omezit zbytečné CPU převody matic společného PhotoGrassBatch pro trávu a květiny. Zachovat přesné transformace, sloty, fade data, počet instancí, bounds, GPU uploady, vzhled a chování. Nezavádět worker, partial GPU upload, jinou hustotu/LOD ani nový veřejný kontrakt.

Synchronizace snapshotů používá bounded Uint8 příznaky a Uint32 frontu změněných číselných slotů, rostoucí s kapacitou; přidaných5B/slot se počítá do allocatedBytes. Při stabilní cache se převádějí jen změněné sloty; vlastní matrix rebound nesmí opakovat převody, které právě provedl Babylon. Nečekaná cache má bezpečný úplný fallback. Celý flush stále O(N) kvůli nezměněným bounds/uploadům.

Přijetí vyžaduje přesnou datovou paritu, cílené i celkové ověření a pět párových CPU A/B běhů s opakovatelným zrychlením řídkých změn a bez stabilní regrese jiných scénářů nad10%. CPU měření není tvrzení o FPS celé hry. Práce pouze v kanonickém checkoutu na main, bez kopií projektu, větví/worktrees či zásahu do hraného8080 a předchozího stromového kandidáta.

</frozen-after-approval>

## Implementation Notes

- Baseline `21d24c5f1bb42c571d5c398d5e4a42aa472709b3`. Intent je úplný, není nevratná změna. Runtime rozsah: `client/photo-grass-batch.ts`; behaviorální regrese: `tests/photo-grass.test.ts`; benchmark samostatně `scripts/benchmark-grass-snapshots.ts` a jeho test. Root vlastní měření, společné kontroly/evidenci a commit.
- Pinned primární zdroj `node_modules/@babylonjs/core/Meshes/thinInstanceMesh.pure.js`: setBuffer(matrix)235–247 nuluje worldMatrices, bufferUpdated303 jen uploaduje; getter362–373 při miss sestaví všechny aktivní Matrix. [Oficiální thin instances](https://doc.babylonjs.com/features/featuresDeepDive/mesh/copies/thinInstances/) načteny při plánování2.11.2026. `PhotographicGrass` i `GroundFlowers` recyklují root objekty; snapshot cache čtou, nemutují ji jako zapisovací API.
- Varianty: stávající full převod je jednoduchý, ale nadbytečný; Set by alokoval položky při každé editaci. Vybraná typed fronta má pevný paměťový rozpočet a žádnou alokaci při běžné změně. Inkrementální bounds, částečné uploady a worker mají samostatná rizika a zůstávají mimo rozsah.
- Add označí nový slot, swap-remove přepsaný cíl. Tail-remove žádný nový slot. Flags se nemažou při remove: starý index může být ve frontě a slot znovu použit před flush. Záznamy se deduplikují, i když se root z poolu mezitím změnil. Reserve přidělí nové buffery do lokálních proměnných a převezme je společně; zachová pending stav a invariant dirtyCount≤capacity.
- Flush zachová pořadí thinInstanceCount před uploadem. Při vlastním reboundu lze důvěřovat nově sestaveným nativním maticím a pouze převzít cache/délku. Při stejné referenci a očekávané předchozí délce aktualizovat platné dirty sloty; objekty existujících Matrix neměnit za jiné. Délku porovnávat s poslední úspěšnou synchronizací, nikoli s novým roots.length, jinak by každý append spustil full fallback. Nečekaná identita/délka znamená plný převod, protože externí reader mohl cache vytvořit před další změnou.
- Po úspěchu zkrátit snapshoty na aktuální roots.length, uklidit flags všech queued slotů včetně již odstraněných a vynulovat počet. Bounds zachovat současným přesným scanem. Reserve-only rebound bez matrixDirty nemusí vytvářet CPU cache; zruší uloženou referenci a příští synchronizace použije bezpečný fallback. Při dispose uvolnit reference, typed buffery a počítadla. Běžné flush nesmí přidávat nové pomocné kolekce ani kopie.
- Given deterministické append/remove/recycle sekvence, when flush, then všech16 Float32 hodnot, root slots, fade/count a bounds odpovídají nezávislému full oraclu. Given jeden append/swap-remove při stabilní cache, then jeden převod; tail-remove/fade-only nula. Given64→128 rebound, then žádný druhý aplikační převod. Zahrnout add-remove-add před flush, odstranění všech/re-add, opakované přepsání téhož slotu, dva batche s poolováním rootů, reserve-only a změnu cache. Stávající testy květin a shader preparation musí projít.
- Benchmark načte baseline přes git show bez checkoutu, kandidáta ze stejného main; oba stejně transpilačně připraví se stejnými závislostmi. Artifacty jen v přidělené .cache, žádná kopie projektu. N=256/2048/8192, sparse1/32, tail/fade/no-op, celá obměna a rebound. Pět párových běhů, střídání A/B pořadí, warmup, raw hodnoty bez filtrování outlierů. Měřit mutate+flush i vnořený flush odděleně a nesčítat je; mechanické čítače a parity kontroly mimo timed část. Uvést skutečný Node/CPU, source/test/harness/dependency hashe a memory overhead. Přijmout pouze konzistentní CPU přínos; FPS ani optimalitu GPU netvrdit.
- Relevantní lehké testy průběžně: photo-grass, ground-flowers, photo-grass-preparation a benchmark fixtures. Po nezávislém review a stabilizaci: TypeScript, pnpm test, pnpm build, pnpm test:integration sériově pod root heavy-validation. Původní selhání zachovat. Zelené kontroly bez nové změny neopakovat.

- Finální CPU kritéria přijata podle předem uloženého pravidla a kalibrovaných kontrol; první neúspěch a mezivarianta zachované. Po odečtu se refaktoroval pouze idle guard/hot-state/fronta, nikoli bounds nebo GPU cesta. Nezávislé review všech úprav bez nálezu.
- Cíleně58/58 PASS, tsc/build/SDK integrace PASS. Dva celé běhy zůstávají FAIL kvůli nezměněným RAG/heartbeat testům, izolované67/67 a1/1 PASS je nepřeznačují. Root zůstává blocked/in-review pro celoprojektovou přejímku, implementace zachovaná přímo na main. Podrobnosti results.md a validation.json v docs/performance/evidence/grass-matrix-20261102/.
