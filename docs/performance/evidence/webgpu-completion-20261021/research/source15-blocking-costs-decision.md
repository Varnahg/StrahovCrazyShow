# Source15: rozhodnutí o dalším měření blokujících nákladů

24. 10. 2026. Navazuje na skutečné receipty source `d38b63a6`, helper `37646a00`, buildy `05723c84` a `b9bef6aa`, nikoli na odhad FPS z HUD. Aktuální produktový checkpoint je `754dde6ad665070f6d46c52e755eaa2a24e0df69`. GPU okno bylo skutečně ukončeno a vráceno CAD v 06:44 UTC. Další práce zde má pouze soubory a lehké cílené CPU kontroly.

## Doložené výsledky a mezery

Source15 odstranil sledovanou kompilaci při prvním F po změně Mia→Robin s brýlemi: tři dokončená 30s okna mají false→true a compiler calls0, stejný player/renderer/generaci, zdraví a pending0. Nejde o FPS ani pixelové A/B. Dvě selhání startupu zůstávají: Low30.0448s/18etap a obnova hosta90.1113s/73etap. Při obnově neběžely root CLI/test/build procesy. High `day-1-on` této obnovy trval11.4725s, čtyři synchronní `options.render` dohromady8.8379s, jeden8.5947s, restarty0. Vnitřní příčina tohoto renderu není změřená.

Úspěšný no-clock MP startup75.7451s obsahuje37.5674s inkluzivních render spanů. Sjednocení802 scope/fence intervalů je28.0690s, jejich společný překryv24.4126s; součet52.4816s není GPU čas. Bez absolutních hranic etap jej nelze přiřadit konkrétnímu stadiu. Poslední scope při neúspěšné obnově zůstal pending; samotný pending neurčuje čekající GPU práci.

Validní první vstup do auta zachytil frame6016–6023 a původní hitch210.9ms/CPU209.8/render191.3. První main PBR readiness364calls/62.4ms, Standard137/19.1; další framy jsou podstatně levnější. Před/po compiler counters zůstaly828prep/1656modules/25sync/1267async. Nula nových kompilací neprokazuje levný cache lookup ani příčinu uvnitř serializeru.

## Primární řetězec a varianty

Skutečný automat je `client/light-preparation.ts`; `lighting-prewarm.ts` neexistuje. `Game.prepareLightingVariants` předává vlastní options objekt. Původní `startStage`, `saveStage` a `measure(cpu.render, …)` znají přesné monotonic hranice. Wrapper `apply` nebo `setStage` je neumí: apply se opakuje při restartu a hranice další etapy předchází dalšímu apply. Scene observables zase neznají pass/stage ani celý render prelude. Volíme přesný QA transform dvou snapshotových zdrojů, který zachová originální options objekt a použije již odečtené časy. Je dražší na pin/transform testy, ale přináší skutečnou korelaci bez produkčního API či změny scheduleru.

Původní `captureRoutineCost` vyžaduje ready Game a osm framů, takže během startupu nestačí. Jeho lower-level `RoutineCallProfile` lze použít pouze v původních options.render vybrané uzavřené etapy. Nový receipt smí legitimně skončit při méně než osmi renderech, pokud etapa skončí; nesmí tvrdit starý osmirámcový kontrakt. Cíle: první Medium vehicle-0, první High day-1-on a první Low day-1-on. Cap16passes/304stages/8renders/256KiB, původní8routine/core byteexact. Žádné další render/readiness/GPU/await/now/scheduler volání. Přesné preimage a AST/count guards musí odmítnout drift.

Pinovaný Babylon9.30 PBR readiness volá `_prepareEffect`; ta nejdřív připraví defines a při čisté větvi vrátí null. Dirty větev sestaví ABI/fallbacky, serializuje defines a zavolá `engine.createEffect`. WebGPU vlastní implementaci na WebGPUEngine, WebGL ji dědí z ThinEngine. Cache hit vrátí Effect/ref++; callback/refcount práce patří dovnitř API, není čistým lookupem. PBR předává callback v options, takže generic positional callback na hitu nelze automaticky předpokládat. onEffectCreatedObservable a SubMesh.setEffect/reset následují až po návratu `_prepareEffect`.

Pro vstup auta volíme jeden nový společný10target stack (původních8 + tyto2hranice), nikoli dva souběžné profilery, které by chybně počítaly selfSelected. Přidáme nullReturns. MaterialDefines.toString nyní neměříme: nejdřív rozlišit prepare residual, createEffect API a readiness residual; případný další krok musí filtrovat přes skutečný defines argument. Žádné čtení cache/keys ani odhad hit/miss podle compiler0.

## Rozsah a náklady

Dvě samostatné kopie V17 umožní nezávisle ověřit startup a entry bez navrstvené režie. Starých36 vstupů, raw, původní tlačítka, pin/order/behavior assertions zůstanou zachované. Nové flagy jsou výchozí vypnuté a součástí canonical identity; nový10target formát se nesmí vydávat za původní8target schema. Oba nástroje mají atomické descriptor guards, přesný rollback, native frame IDs, explicit partial/overflow/drift/disposal/foreign restoration a žádné retained Game reference po úklidu. Časy stále zahrnují observer/JIT/clock overhead; timeout v instrumentovaném buildu sám neprokazuje regresi produktu.

Nemáme podklad pro zvýšení30/90 limitů, vynechání coverage/readiness nebo další cache/prewarm optimalizaci. Produkční oprava bude samostatný výzkum a ověřený commit až po lokalizaci nákladu. Finální výkonová matice a KEY22/default/main přijetí zůstávají otevřené.
