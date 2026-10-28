# Opakovaný startup timeout: průzkum 28. 10. 2026

Uživatel po dokončení Jantaru opakovaně hlásí: „3D scénu se nepodařilo spustit … timeout. to je vždycky tohle…“. Cíl zůstává skutečně spustit celou hru. Úvod je implementovaný, ale opakované selhání přípravy není přijatý výsledek.

## Doložené průběhy

Zdroj `0d957a1ba0f53baeeef894b13791da857663d6fe`, fyzický snapshot `6bfb508e6361023bbe3e1cccbfbdb6f89de0714908e8c3da4788ce780e3ebcba` na D:, 9494 souborů včetně testů. Dependencies `8782a45c1fa0247e7370453e5af9970a411391792c89c35a540285bddec71591`, 16288 souborů, žádné linky/hardlinky. Relevantních šest rendererových souborů je byteově shodných s předchozím987 i přijatým základem86e4; nejde o změnu rendereru zavedenou Jantarem.

| Záznam | Předherní kadence | Výsledek přípravy | Ticky / rendery / kontroly |
| --- | --- | --- | --- |
| `6bc4ac49-8e28-4b36-83a3-92881b834340` | 1 vzorek, cca1016ms, nespolehlivá | timeout30.008s, current-off | 29 /7 /1489 |
| `cc0daa2a-caac-4fc2-bffe-4963ec4d7247` | 59.9Hz, spolehlivých79vzorků, potvrzené popředí | timeout30.020s, 7/9stages | 891 /95 /40732 |
| starší `354e8023…` | 59.9Hz, spolehlivá | timeout30.022s,7/9 | 831 /97 /30410 |
| starší `0ba26db5-488f-41ca-8bd3-9e9cfd86d460` | 59.9Hz, spolehlivá | complete15.924s,9/9 | 294 /39 /18230 |

Nové záznamy jsou v `D:/CodexWorkspaces/StrahovCrazyShow-terrain-20261025/.cache/jantar-home-20261028-final-serve/snapshots/final-01/.cache/game-diagnostics/`, starší ve vlastním `combined-serve/snapshots/combined-02/.cache/game-diagnostics/`. JSONL obsahuje `batch.records`; nikoli přímý seznam eventů.

Nový focused timeout má synchronní CPU wall součty apply0.841s, checks3.816s, render12.953s; starý success0.819/1.570/8.854s. Nejde o GPU timing. Nové current-on vyžaduje27draws proti4, night-0-off18proti4 a night-2-off23proti4. Poslední fáze má21142kontrol a450checkBatch volání za9174ms. Batch dosahuje průměrně3.95ms/max4.2ms, takže pouhé zvýšení počtu128mesh nezruší4ms limit.

Oba srovnávané běhy mají5mesh restartů jen vcurrent-off, nový navíc1weather restart vnight-2-off. Nekonečný revision loop doložen není. Success začínal daylight≈0.598, failure daylight0 a jiným počtem meshes; není to izolované cold/warmA/B. První render-fault je až syntetický důsledek timeoutu. Profiler WebGPU je naGL2 neaktivní; jeho nuly nedokazují nulovou kompilaci.

## Řetězec a mezera

`Game.start` → skutečný camera render pass → `prepareLightingVariants` → `prepareLightVariants` → `mesh.isReady(true)` + precipitation/pipeline/health/all-effects → dvě potvrzovací kreslení → finální submitted-frame gate. Timeout nastává před posledním gate. Další kontroly nelze přeskočit: Babylon dovoluje během hot swap použít předchozí Effect a globální readiness brání falešnému dokončení.

`client/game.ts:2718` však zaznamenává poslední gate pouze pro `terrainReview && !network`. Normální multiplayer proto neukazuje, zda opakuje false mesh, precipitation, effect nebo jinou podmínku. `light-preparation.ts` již má skutečné výsledky retry/pre/post-draw a batchu, ale jejich důvody neukládá. To je první nutná mezera měření.

Instalovaný Babylon9.30.0 je primární zdroj pro `Meshes/mesh.pure.js:1042`, `Materials/standardMaterial.pure.js:1292`, `Engines/thinEngine.pure.js:302` a `Engines/WebGL/webGLPipelineContext.js:16`. `isReady(true)` aktivně připravuje materiály a shadow passy; není levný pasivní boolean. [Oficiální KHR specifikace](https://registry.khronos.org/webgl/extensions/KHR_parallel_shader_compile/) rozlišuje neblokující dotaz na dokončení od samotné doby kompilace. Aktuální dokumentace Babylon Lite není podklad pro tuto připnutou verzi.

Čtecí audity nezávisle provedli `/root/final_verification`, `/root/map_assets`, `/root/audit_home_integration`. Žádný neměnil zdroje ani spouštěl GPU. Při předání jsou všechny kontrolované karty home/canvas0.4278 a4280 zůstávají zachované; nová instrumentace vyžaduje vlastní kandidát/port.

## Porovnání variant

| Varianta | Náklady a riziko | Rozhodnutí |
| --- | --- | --- |
| Zvednout deadline / vynechat readiness | Skryje problém, falešný ready či delší nepřiznané blokování | Zamítnuto |
| Více meshes v dávce | NaGL2 zde dominuje4ms cap; delší dávka může blokovat UI | Bez důkazu neimplementovat |
| Oddělit check scheduler od RAF | Může snížit čekání; mění lifecycle/cancel a odezvu | Posoudit až podle gate a retry dat |
| Await skutečných asset dependencies | Transit.ready a stromové detaily jsou relevantní; nutno zachovat preload draw a odmítnout pozdní generace | Hypotéza, zatím nepřipsat5restartů konkrétnímu vlastníkovi |
| Sémantická weather revision | Mohla by odstranit metadata-only restart; musí zahrnout všechny skutečné shaderové vstupy | Payloadový rozdíl nyní chybí |
| Persistent shader/effect cache | Paměť, vlastnictví, disposal a stale varianty; bez konkrétní identity není důvod | Neimplementovat obecnou cache |
| Bounded pozorování již provedených kontrol | Malý opt-in startup náklad, žádná změna obrazu či readiness; musí chránit identitu a nepřidat probes | Zvoleno jako první krok |

Diagnostika není oprava ani GPU/FPS přejímka. Po konkrétním reproduktoru se zvolí nejmenší oprava a cílený refaktoring, ověří skutečný noční i běžný start a zachová původní neúspěchy. LinearKEY-31/KEY-66 zůstávají InProgress; main acceptance nebylo vydáno.
