# Pilot: cílená studie nákladů vykreslování, 11. 10. 2026

Tato studie odděluje render bottleneck celé hry od menší úspory CPU alokací při výběru trávy. Neoznačuje NullEngine, čas Node.js ani snížení počtu objektů za GPU/FPS důkaz.

## Podklady a hypotézy před změnou

- Produkční baseline L2 má source ID `c4586de83cef2b7406122c75eed04abf89796765cc338c0b7dabc92a9c7ad658`. První discovery interval: Intel UHD 630 / ANGLE D3D11 / WebGL2, CSS 1920 × 1080, interně 1476 × 830, low, jeden avatar, skutečný HUD. Průměr 37,2 FPS, p95 31,4 ms, p99 36,9 ms; render CPU průměr 12,08 ms, poslední GPU vzorek přibližně 23,1 ms. Jde o **jediný interval s živým počasím**, nikoli řízené A/B. [Celý záznam](performance/evidence/pilot-20261011-m/baseline-discovery.json).
- Záznam má 3280 registrovaných meshů, 1824 enabled/visible geometry meshů a 1452 skrytých geometry meshů. Všechny render průchody dohromady: 368 draw calls, 822 284 trojúhelníků. 162 stínových casterů je vybraných z 270 kandidátů. Tyto strukturální počty samy neurčují GPU čas.
- [K5 studie](performance/k5-candidate.md) zachovává každý původní trojúhelník; 96m buňky snižují odeslané indexy, ale v zaznamenaném pohledu přidaly 39 main+solar ground draw ranges. V západním pohledu bylo až 150 main ground ranges. Úspora vertex práce proto není doklad menší CPU render práce.
- Primární podklad je skutečně instalovaný Babylon.js **9.30.0**: `scene.pure.js::_evaluateActiveMeshes` prochází kandidátní meshe a volá `isReady(false)`, `isEnabled`, world matrix, LOD a frustum test. `Mesh.isReady(false)` však neprovádí úplný material readiness scan; samotné pořadí kontroly disabled meshů tedy nedokazuje drahé shader kontroly každého z nich. `OctreeSceneComponent.getActiveMeshCandidates` má veřejnou prostorovou alternativu, která vyžaduje korektní životní cyklus dynamických a nových meshů.
- `world-renderer.ts` sestavuje geometrii, ale nevkládá pravidelný frame callback. Jeho startup časy nejsou předmětem této opravy.

Další browser profil musí rozlišit aktivaci meshů, render targets/stíny, samotné draw/material bind a GPU práci. Materiály se naslepo nezmrazují: kvalita, slunce, stíny a shader wind mají dynamický životní cyklus. Celá scéna se nezmrazuje a nevkládá se neověřená octree, která by mohla vynechat nové hráče, streamované stromy nebo editované objekty.

## Přesný výběr trávy s opakovaným použitím paměti

`client/vegetation-selection.ts` přebírá původní pravidla: `Math.hypot`, ostrý limit `range + 11.4`, stabilní pořadí původních dlaždic při shodě a prioritu 0,85 pro předchozí viditelnou sadu. Kandidátní záznam vzniká jednou na dlaždici a dále se přepisuje. Místo opakovaného `map/filter/sort/slice/map/Set` se používají dvě pracovní pole a bitová příslušnost vybrané sady. Interní pracovní alokace JavaScript sortu nejsou vyloučené.

Při stejném X/Z, rozsahu a počtu dlaždic se už jednou vybraná sada znovu neskenuje ani nenastavuje na meshe. Tento cache má přesnou vlastnost: nově vybraný kandidát dostane v dalším výběru stejnou nebo nižší prioritu, vyřazený stejnou nebo vyšší; vybraná sada proto zůstane shodná. Seřazení uvnitř sady se může lišit od opakovaného původního sortu, ale vykreslování používá pouze příslušnost ke stejné sadě a původní pořadí meshů.

`VegetationController.update` dále aktualizuje wind/time/player uniforms každý frame a obsluhuje stromové LOD, dokončené načítání a cache před případným návratem z části trávy. Změna kvality vždy obnoví indexový budget a počty thin instances, i kdyby budoucí dvě quality úrovně měly stejný rozsah a limit dlaždic. Zaniklý controller uvolní odkaz na selector včetně zdrojových patch dat.

Žádný vrchol, materiál, textura, tráva/strom umístění, LOD vzdálenost, density, konzervativní bounds, shader wind, schod nebo kolize se nemění. Rozpočtová struktura trávy se navíc nealokuje znovu při každém frame a průběžný zápis wind uniform state nepotřebuje dočasný objekt pro `Object.assign`.

## Ověření a limity

Nový nezávislý oracle uchovává původní implementaci výběru a porovnává viditelnou sadu přes 1800 kroků skutečných mapových patchů: pohyb, vzdálené záporné buňky, klid, všechny tři kvality. Druhý případ ověřuje ostrou hranu rozsahu, stabilní shody, změny kvality, opakované použití výsledku a odchod mimo svět. Existující runtime test ověřuje skutečné Babylon grass meshe, sdílenou geometrii, hustotu, indexové LOD, nezměněné plné bounds a dispose; stromové testy hlídají přesné původní atributy a transformace.

**Cílený běh: 11/11 PASS, exit 0, 14,68 s.** Příkaz: `pnpm exec tsx --test --test-concurrency=1 tests/vegetation-selection.test.ts tests/vegetation.test.ts tests/vegetation-runtime.test.ts`. [Úplný log](performance/evidence/pilot-grass-20261011/targeted-tests.log). Aktuální podklady mají **597 dlaždic / 80 576 trsů**; starší konstrukční studie 599/80 736 není aktuální počet a není použitá jako vstup.

Krátká CPU studie proběhla v Node **24.19.0**, Windows x64, **Intel Core i7-8750H**. Každý vzorek měří 12 000 výběrů po 4000 warmup výběrech, pět dvojic se střídavým pořadím. Samostatný CPU profiler zachytil 60 000 pohyblivých výběrů každé varianty; načítání dat a generování patchů se do těchto intervalů nepočítá. Starý výběr a nový selector dostávají stejnou předpočítanou trasu a low budget, následuje stejný součet thin-instance počtů. Studie nespouští Babylon ani GPU.

| Režim | Původní medián ms/výběr | Nový medián ms/výběr |
| --- | ---: | ---: |
| Pohyb | 0,03815 | 0,01939 |
| Stejná poloha | 0,03077 | 0,000037 |

[Jednotlivé vzorky, prostředí a dílčí SHA-256 souborů](performance/evidence/pilot-grass-20261011/study.json), [původní CPU profil](performance/evidence/pilot-grass-20261011/baseline.cpuprofile), [nový CPU profil](performance/evidence/pilot-grass-20261011/candidate.cpuprofile). Jde o hashe vstupů této studie, nikoli úplného produkčního snapshotu. Původní profil má 75 přímých GC vzorků, nový 38; odlišná délka profilů a přirozená práce GC nedokazuje přesné procento snížení GC času celé hry.

Pro reprodukci uložte [přesně použitý skript](performance/evidence/pilot-grass-20261011/study.ts.txt) do `.cache/pilot-grass-study.ts` a spusťte `pnpm exec node --import tsx .cache/pilot-grass-study.ts`; přepíše pracovní evidence stejné studie. Zveřejněný text skriptu odpovídá jeho zaznamenanému SHA. Měření bylo koordinované mimo zamýšlené oficiální GPU intervaly; hlavní agent byl informován při doběhu. Celkové zatížení operačního systému ani turbo frekvence se nezaznamenávaly.

**Absolutní úspora je malá:** při výběru jednou za 150 ms vysvětluje řádově setiny milisekundy na výběr, nikoli přibližně 12ms render CPU bottleneck produkční hry. Přínos je odstranění stovek dočasných záznamů a dalších pracovních kontejnerů z pravidelného výběru a stabilní cache klidné polohy. Produkční vícehráčové GPU A/B a stabilní checkpoint test/build/integration koordinuje hlavní agent; zde se netvrdí celkové procento zrychlení ani splnění 60 FPS.
