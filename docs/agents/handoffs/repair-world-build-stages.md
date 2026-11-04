# Předání: repair-world-build-stages

- Vlastník `repairs-01a13624-worldstages`; příjemce `/root` / `repairs-01a13624-root`.
- Checkout `C:/Users/rezac/Documents/GitHub/StrahovCrazyShow`, main, výchozí HEAD `91ee88f0aaa902c79fad589aeb84bc086a66c9ea`.
- Výsledek: jeden zdroj deterministických world operací pro synchronní i nové asynchronní stavění, skutečné task yielding, cancellation a agregovaná phase evidence. **Velké atomické konstruktory stále nejsou rozdělené. 4ms threshold není garance délky úlohy; KEY-8 ani celkový start nejsou hotové.**
- Změněné soubory: `client/world-renderer.ts`, nový `client/world-build-stages.ts`, nové `tests/world-build-stages.test.ts`, `tests/world-renderer-startup.test.ts`, toto předání. Žádný převzatý cizí WIP; vstupní world-renderer byl při claim čistý. Game/UI vlastní root.

## Podklady a přijaté chování

Primární předchozí průzkum `docs/performance/repair-startup-cause.md` prokázal synchronní konstrukci před game-start. Před změnou znovu přečten aktuální world-renderer a volající Game, controller dispose metody i world-asset-identity. Cílem je zachovat původní geometrii, materiály, asset identity, pořadí operací a stejné vrácené controllery; neubrat objekty ani měnit prostorové chunkování.

Koordinátor před implementací schválil API i vlastnictví: **Game vlastní svou Scene a host context; na abort/error musí zrušit celý Game.** Job nesmí mazat všechny „nové“ scene objekty proti nějakému baseline snapshotu, protože by mohl zasáhnout cizí/předexistující práci. Job však musí zrušit vlastní scheduler a již vytvořené controllery, dokud je úspěšně nepředá Game.

## API pro root integraci

```ts
const job = createWorldBuildJob(game, {
  signal: startupAbort.signal,
  sliceBudgetMs: 4,
  onPhase: (timing) => sessionDiagnostics.event("startup-world-phase", timing),
});
game.worldControllers = await job.run();
// Při cancel/dispose nebo chybě: job.cancel(); game.dispose();
```

Export `createWorldBuildJob(context, options)` je v `client/world-renderer.ts`; návrat `{ run(): Promise<WorldBuildResult>, cancel(): void }`. Opakovaný run vrací tentýž Promise a nespouští druhé stavění. Options zachovává `photogrammetry?: boolean`; navíc `signal`, `onPhase`, `sliceBudgetMs`, test clock/scheduler. Root nemá předávat test scheduler. Scene dispose samo zavolá cancel. Před prvním krokem, každým dalším krokem, po každé async hranici i před předáním dokončeného výsledku se ověřuje abort/disposed stav.

Stávající `buildWorld(context, {photogrammetry?})` zůstává synchronní a používá stejný `worldBuildSteps` generator. Přímé herní konstrukční příkazy se nepřesunuly do jiné kopie pravidel. Root může přesunout jejich asynchronní volání mimo Game constructor; aktuální sync call do té doby zachovává původní chování.

`onPhase` vrací `{phase, outcome, operations, cpuMs, elapsedMs, maxOperationMs, maxOperation, yields}`. CPU je součet skutečných synchronních `operation.run()` intervalů; elapsed obsahuje i yield čekání. Nejde o GPU čas ani plný profil cizích callbacků mezi dávkami. Emituje se záznam za fázi, nikoli každou budovu/B6 box. Výstup nezapisuje osobní údaje.

## Scheduler, refaktoring a lifecycle

- První krok i další dávky používají cancellable `setTimeout(...,0)` task. `await Promise.resolve()` se k předání řízení nepoužívá. První task dává mode-change/loading UI možnost zpracovat svůj cyklus před tvorbou geometrie. Časovač je bezpečný také bez běžícího RAF.
- Budget se kontroluje **mezi operacemi**; nepreemptuje jednu velkou funkci. Zvlášť pojmenované fáze prokazatelně vykážou přesah. Časové náklady callbacku diagnostiky se nevydávají za konstrukční CPU.
- Foundations po budovách, B6 face akumulace po boxech, fallback upload po materiálové skupině, popisky, hunt objekty, jednotlivé merge skupiny a závěrečné material updates jsou samostatné deterministické kroky. Původní final order i staticMeshes clear zůstávají stejné.
- Context `staticMeshes`, label registry a přímé partial scene objekty vlastní host. Job je při abortu plošně nemaže. **Pouhé zahození Promise nestačí:** root na selhání zavolá Game.dispose, které zruší Scene, ScreenLabels a další host resources.
- Vrácené architecture/landmark/campus/outdoor controllery jsou v dočasném vlastnickém seznamu; error/abort je zruší v opačném pořadí, i když jeden cleanup selže. Úspěch seznam vyprázdní bez dispose a předá vlastnictví Game. Původní konstrukční chyba se zachová; při souběžném cleanup/reporting error je v AggregateError také jako cause.
- Stop ruší pending timer a odpojuje AbortSignal posluchač. Pozdní již vyzvednutý callback po zrušení nic neudělá. Abort z posledního phase callbacku nesmí vrátit úspěšný výsledek. Idempotentní cancel po success nezruší hostovy předané controllery.

## Ověření

Během root GPU okna byly prováděny jen editace/čtení. Testy a typová kontrola začaly až po výslovném ukončení jeho browser okna; žádný vlastní GPU/port/server/build/fulltest nebyl spuštěn.

1. `pnpm exec tsx --test tests/world-build-stages.test.ts`: **7/7 PASS**, exit0. Ověřuje stejný stream/order/result, skutečný task vs microtask, přesné agregované časování včetně80ms atomické operace při4ms threshold, abort/cancel a stale callback, předem abort/disposed host, původní chybu a generator close, abort z finálního phase callbacku.
2. `pnpm exec tsx --test tests/world-renderer-startup.test.ts`: **4/4 PASS**, exit0,46,1s proces. Skutečné NullEngine fabriky celého světa: synchronní/staged parity geometrických vertex atributů a indexů (SHA), material parametrů a přiřazení, matrix/parent/root metadata, pořadí scene položek, světel, popisků, controller metrik. Dále abort s již hotovým architecture controllerem při zachování foreign meshe, scene dispose s queued first task bez late write, exception za dokončenou architekturou s cleanup a zachováním původní chyby.
3. Po změně parity fixture na **sekvenční snapshot→dispose→druhý svět**, aby nedržel dvě velké scény současně, `pnpm exec tsx --test --test-name-pattern 'scheduled construction preserves' tests/world-renderer-startup.test.ts`: **1/1 PASS**, exit0,22,8s proces /16,7s případ. Snapshot používá structuredClone pro nezávislost metrik na následném controller dispose. Ostatní tři případy se nezměnily.
4. Úzká typová kontrola čtyř změněných modulů/testů a jejich import graphu: `pnpm exec tsc --noEmit --pretty false --target ES2022 --module ESNext --moduleResolution Bundler --strict --skipLibCheck --esModuleInterop --resolveJsonModule --allowImportingTsExtensions --experimentalDecorators --useDefineForClassFields false --types node,vite/client client/world-build-stages.ts client/world-renderer.ts tests/world-build-stages.test.ts tests/world-renderer-startup.test.ts`: **PASS**, exit0. První běh odhalil pouze typy dvou fixture map keys a záměnu Landmark.metrics za stats; opraveno, úspěšný běh je finální. Není to tvrzení o typové kontrole celého pracovního stromu.
5. `git diff --check` nad čtyřmi cestami: PASS. Formátování pouze těchto přidělených souborů. Žádný lockfile/package změněn nebyl.

NullEngine zde neověřuje canvas texture pixels, skutečný render, kolize ani dobu produkčního UI blokování. Stávající renderer příkazy a zdrojová data jsou zachované; production parity/firstframe/cache/start kontrolu vlastní root. Samostatná photogrammetry větev používá tentýž stream, ale nová úplná runtime parity v těchto testech cíleně pokrývá aktivní authored svět.

## Zbývající atomické kroky — další explicitní scopes

Naměřené **NullEngine CPU smoke** maximum operace v poslední parity (není produkční/GPU výkonnostní evidence):

| Fáze / atomická funkce | ms |
|---|---:|
| streets / buildStreets |2983|
| architecture / buildArchitectureReality |1155|
| landcover / buildLandcover |695|
| terrain / buildTerrain |350|
| campus-plan / buildCampusExteriorPlan |233|
| road-details / buildRoadDetails |214|
| landmarks / buildLandmarkReality |176|
| outdoor-artifacts / plan-and-createOutdoorArtifacts |145|
| reality-ground / buildRealityGround |46|
| campus-exterior / createCampusExterior |23|
| b6-stairs / createB6StairMeshes |18|

**Největší další hranice je buildStreets uvnitř `client/streets-renderer.ts`, následně architecture/landcover/terrain.** Tyto soubory tento task nevlastní, takže se neimprovizovalo jejich široké přepsání. Další task potřebuje přesně rezervovat příslušný renderer a jeho případné shared geometry factory/testy, prokázat subfáze a rozdělit je bez změny indexů, švů, provenance, materiálového/spatial pořadí či kolizí. Návrat z každé velké funkce teď umožní yield, ale samotný3s streets callback pořád blokuje.

## Snapshot implementace včetně testů

| Soubor | SHA256 |
|---|---|
| client/world-renderer.ts | E8087ED598D46D3C3C5C164EF638482EEA5627CCFC03ADCBC172930EE00CD1DA |
| client/world-build-stages.ts | 13864E87066624BB53B9583800DA7946EC8618A2E533EA6FF952FB5ABBFA62E7 |
| tests/world-build-stages.test.ts | E4C6B67869B5DACEBB2A70DC35369AD6F9B82B1F435CA0941B694B4EC3574FDD |
| tests/world-renderer-startup.test.ts | 3E3450957FF614D57F19F2B913639018EFAE03D19D32FDDC1A1654DAAE3643C5 |

- Procesy: všechny vlastní cílené testy a tsc skončily; žádné procesy/porty se nepředávají.
- Rezervace: po předání uvolněna `release`.
- Integrátor: převezme Game/start/error/dispose hooky, první phase záznamy a production/GPU kontrolu, doplní `docs/verification.md` a stav tasku. Ready ani FPS cíle se tímto dílčím modulem neprohlašují za splněné.
