# Průběžné vlastnictví integračního WIP

27.10 root předává `client/ui.tsx`, `tests/game-render-engine.test.ts` a `tests/room-callbacks.test.ts` koordinátorovi home-ai do jeho worktree. Přesný kompletní dependency checkpoint je `a9a1e3b5f15a2cee037117752230d5d8b3200c72`; zahrnuje renderer/fallback, sezóny, asset loader a všechny závislosti. Renderer/preview/UI62 případů, navazující Room11 případů, celý TypeScript a offline Vite bundle PASS; nezávislé review bez blokujícího nálezu. Hra ani server se nespouštěly. Root ukončil zápisy do tří předávaných souborů a zužuje své claims. Příjemce musí zachovat nové canvas generace a původní lifecycle assertions. UI integrace AI je jiné uživatelské zadání, nepřebírá zdejší praktickou herní přejímku.

Root trees-integration-01a16b37 vytvořil změny Game/UI/i18n a propojení flowerBloom v PhotographicGrass/GroundFlowers včetně tests/ground-flowers.test.ts. Cílený bloom/preview běh17/17PASS, log ve vlastní cache. Převzetí materiálů, fenologie a seasonal rendering je doložené jejich samostatnými checkpointy; příslušné source soubory vlastní root integrátor.

Při zúžení scope pro samostatný ground-litter task jsou rootovy vlastní zápisy krátce uvolněny a znovu převzaty pod stejným owner s --adopt-dirty. Tree-litter soubor ani jeho test před předáním neexistovaly, neobsahují přebíraný cizí WIP. Root dále vlastní Game/UI/QA a flower hooks; podagent dostává pouze litter modul, jeho test a vlastní evidence/cache.

Toto není dokončená přejímka, commit ani GPU důkaz. Chráněné buildy4179/2592 se nemění.
# Převod ještě nezměněných QA souborů

Koordinátor předává `client/terrain-review.ts`, `shared/local-benchmark.ts`, `tests/terrain-review.test.ts` a `tests/local-benchmarks.test.ts` samostatnému tasku `trees-20261025-qa-views`. V okamžiku předání jsou všechny čtyři soubory beze změn proti baseline. Root nadále vlastní Game/UI, propojení resolveru a startup fixture. Jde o rozdělení práce, nikoli přijetí GPU výsledku.


## Startup timeout: převod konkrétních vstupů · 28. 10. 2026

Původní root trees-integration-01a16b37 předává client/game.ts, tests/game-webgpu-startup.test.ts do jantar-startup-20261028-game v Jantar worktree nad0d957a1ba0f53baeeef894b13791da857663d6fe. Předané zdroje jsou čisté a bajtově shodné s původní D kopií; žádný cizí WIP se nepřebírá. Nový přímý lidský požadavek opravuje opakovaný skutečný startup timeout. Nejde o přijetí příčiny ani GPU výsledku; první fáze je bounded opt-in bez změny readiness/limitů a bez hráčských identit.

- client/game.ts: 587f8747c12c706d5a07fec81f7dc3151baf3f14c9252756e286f42e125d0b68
- tests/game-webgpu-startup.test.ts: 8f60f5c37e6d15687e90b92b9fa23427cf39a60c7ede43d274533518c30d9580

Root po tomto předání zužuje svou rezervaci přes release/reclaim; ostatní cesty a vlastní dřívější handoff WIP zůstávají původnímu ownerovi. Žádný pomocný proces pro tento převod neběží a immutable4278/4280 se nemění.

## Upřesnění minimálního startup scope · 28. 10. 2026

Nové startup tasky ještě nebyly claimnuté ani nezměnily zdrojové soubory. Původní owner trees-integration-01a16b37 přebírá zpět tests/game-webgpu-startup.test.ts, které minimální diagnostika nevyžaduje. Cesty jsou čisté a bajtově shodné mezi D a Jantar kopiemi. Převod je skutečný release/reclaim, nikoli převzetí podle stáří.
