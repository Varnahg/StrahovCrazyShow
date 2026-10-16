# Předání: webgpu-strict-material-preparation-20261016 / KEY-31

- Vlastník `webgpu-mig-01a14497-strict-material` (`/root/stack_options`); příjemce `/root`.
- WT `C:/Users/rezac/.codex/worktrees/webgpu-comparison/StrahovCrazyShow`, větev `codex/webgpu-migration`, task přidělen v `91ca7ee`; souběžný HEAD při předání `c51908d35c76fa786063c2152dc9114a96c47d07`.
- Vlastní soubory: `client/strict-material-preparation.ts`, `tests/strict-material-preparation.test.ts`, toto předání; pomocné výstupy pouze `.cache/webgpu-migration-checks/strict-material/`.
- Výsledek: ověřený **read-only readiness helper**, žádný material mutator. Koordinátor tuto změnu varianty a API výslovně schválil před prvním zápisem; původní task filename/scopes zůstaly. Task metadata může po release upravit root.
- Cizí WIP: Game a jeho integration fixtures vlastní root; typed health overlap a jeho předání vlastní jiný agent. Nic z toho nebylo upraveno ani přidáno do tohoto commitu. Primary, živé snapshoty a dependencies beze změn.

## Průzkum příčiny a variant

Pinovaný Babylon 9.30 v read-only `dependencies-v5/node_modules`:

- `Engines/webgpuEngine.pure.js:132`: `areAllEffectsReady()` bezpodmínečně vrací true. `Engines/WebGPU/webgpuPipelineContext.js:9` považuje context za připravený při existenci stages; nejde o GPU compiler validation.
- `Materials/PBR/pbrBaseMaterial.pure.js:930` a `Materials/standardMaterial.pure.js:1290`: při `allowShaderHotSwapping` a nepřipraveném novém Effect ponechají předchozí ready efekt. Mesh readiness tedy může vracet true, aniž by stage použila novou variantu.
- `Materials/effect.pure.js:215`: `extraInitializationsAsync` se awaituje před `_prepareEffect` a engine hookem. Samotné rozdělení health pending counters tuto předcházející mezeru neměří.
- `Engines/webgpuEngine.pure.js:1522–1524`: nově vytvořený Effect je synchronně vložen do `_compiledEffects`, tedy ještě během čekání na extra initializer. `Effect.isReady()` je v této době false. `_releaseEffect` odstraní položku a `releaseEffects` cache nahradí; helper nesmí držet starou kopii.
- `Engines/thinEngine.pure.js:302`: WebGL veřejná readiness metoda již prochází tuto cache. Read-only ekvivalent pro WebGPU je přesnější než jeho stub.

Zvažováno:

1. Dočasně vypnout `allowShaderHotSwapping` všem účastnícím se materiálům. Je to přímý boolean (`material.pure.js:511`) a Babylon jej sám používá ve `forceCompilation`. Vyžadovalo by to ale identity Map, zachování false/true hodnot, řešení nových/odstraněných materiálů, cizího přepsání a obnovu při timeout/dispose. `Scene.onNewMaterialAddedObservable` je navíc deferred (`scene.pure.js:2780`), takže samo nepokrývá tentýž synchronní draw.
2. Porovnávat každý mesh/submesh s očekávaným efektem. Přináší další závislost na interních define/cache/render-pass mechanismech a variantách instancí či shadow wrapperů.
3. **Zvoleno:** číst skutečnou per-engine cache všech požadovaných efektů. Zahrnuje i novou dosud nenainstalovanou hot-swap variantu a nevyžaduje žádné přepisování rendereru či cleanup stavů. Náklad je lineární scan pouze při přípravě/final gate; záměrná pinovaná závislost na protected `_compiledEffects` je zdokumentovaná a při změně kontraktu fail-closed.

## API a refaktoring

`arePreparationEffectsReady(engine: Pick<AbstractEngine, 'isWebGPU' | 'isDisposed' | 'areAllEffectsReady'>): boolean`.

- Disposed engine → false. WebGL deleguje public metodu s původním receiverem/návratem/výjimkou.
- WebGPU vyžaduje platný plain/null-prototype cache objekt, živé Effect záznamy se správným `getEngine()` a přesné boolean true z `isReady()`.
- Chybějící cache, cizí/disposed/malformed efekt, nonboolean výsledek, výměna kontrolované položky či cache, změna počtu položek nebo dispose během kontroly → false. Skutečné výjimky se propustí do caller failure cesty, nejsou vydávány za úspěch.
- Prázdná platná cache → true stejně jako ThinEngine. **Není to důkaz vykreslené scény ani dokončené GPU validace.** Root nadále kontroluje skutečné meshe/draws, health chyby, typed preparation pending a na final gate všechny pending operace + error scope + submitted queue.
- Žádné změny materiálových flagů, shaderů, freeze politiky, cache, prototypů ani Promise handlingu. Helper nevytváří ownera/listenery/timery a nepotřebuje dispose. Každý call čte aktuální cache; neuchovává efekty ani výsledky mezi snímky.
- Společné malé kontroly ownership/liveness a cache kontraktu; count/scan přes `for...in` + own keys, bez per-call `Object.values` polí. Ochrana mutation je konzervativní kontrola aktuální identity a cardinality, nikoli transakční snapshot libovolného nepřátelského cache objektu. Pinované WebGPU `Effect.isReady` cache nemutuje.

## Ověření

Příkazy běžely výhradně v `.cache/webgpu-migration-checks/strict-material/` s read-only junction na `.cache/webgpu-migration/dependencies-v5/node_modules`, přímým Node CLI.

- Causal RED: tentýž skutečný Standard/PBR fixture proti původnímu delegování na `engine.areAllEffectsReady()`, `node node_modules/tsx/dist/cli.mjs --test --test-name-pattern='actual (standard|pbr)' tests/strict-material-preparation.test.ts`: **0/2 PASS**, exit1, `logs/public-readiness-red.log`. Oba dostaly true místo false, když nová varianta ještě čekala na initializer. Baseline wrapper existoval pouze v pomocné kopii; produkční source se nevracel zpět.
- GREEN: `node node_modules/tsx/dist/cli.mjs --test tests/strict-material-preparation.test.ts`: **8/8 PASS**, exit0, 2026-10-16 19:59 UTC, `logs/targeted-final.log`.
- `node node_modules/typescript/bin/tsc --noEmit --strict --skipLibCheck --target ES2022 --lib ES2022,DOM --module ESNext --moduleResolution Bundler --esModuleInterop --types node tests/strict-material-preparation.test.ts`: **PASS**, exit0, `logs/types-final-v2.log`. Po green runtime testu byla doplněna pouze chybějící testová `this: NullEngine` anotace; runtime se nezměnil.
- Zachované první výsledky: `targeted-v1.log` 7/7 PASS; `types-v1.log` obsahuje pouze fixture this/cast diagnostiky; `types-final.log` zbývající chybějící this anotaci. Tyto logy nebyly přepsány ani assertions oslabeny.

Skutečný fixture používá Standard/PBR, jejich skutečné `isReadyForSubMesh`, skutečný Effect a pinned `WebGPUEngine.prototype.createEffect` na NullEngine driver backendu. Per-test engine wrapper vloží deferred `extraInitializationsAsync`; test prokáže old bound effect ready, new cached Effect unready a **0 volání engine preparation hooku**. Helper vrací false a nepřepíše materiál/cache; po dokončení initializeru a dalším reálném readiness průchodu se připne nový Effect. Pro test helper větve se pouze dočasně nastaví flag daného testového NullEngine; materiál zůstává GLSL a žádný GPU device/kompilátor neběží.

Další regrese: WebGL delegation/throw identity, unavailable/malformed cache, dvě nezávislé engine identity, entry/cache insert/remove/replace, disposed owner/efekt, nonboolean thenable bez jediného čtení then a propagated readiness exception. Compile-time kontrakt zahrnuje skutečný AbstractEngine i WebGPUEngine bez Game-side private castu.

Finální SHA-256: helper `a1c384e975ddd5d4d5f7d6fcb917f916e37b82c7a4d00a79b10aa5a99d12019a`; test `b93d2987ef7a011b12ba44454f78250314f4582cc18090cd7f06d201ff52dd40`.

Žádný GPU, build, full suite, server, install či pnpm exec. Není tvrzené zrychlení startu/FPS ani úplná přejímka. Root musí propojit helper per-stage i ve final gate a ověřit typed diagnostic-overlap v celém stabilním checkpointu. KEY-31 aktualizován s výzkumem, rozhodnutím a CPU důkazy; není Done.

Všechny vlastní CPU procesy skončily. Po samostatném commitu těchto tří souborů se uvolní rezervace; commit/release potvrdí zpráva koordinátorovi. Další integrační zápisy a plnou pipeline vlastní root.
