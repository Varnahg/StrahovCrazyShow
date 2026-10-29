# Předání: repair-game-startup-fixtures

- Vlastník: `repairs-01a13624-startup-fixtures` (`/root/repair_reporting`); příjemce: koordinátor `repairs-01a13624-root`.
- Pracovní kopie/větev: `C:/Users/rezac/Documents/GitHub/StrahovCrazyShow`, `main`; výchozí commit `91ee88f0aaa902c79fad589aeb84bc086a66c9ea`.
- Výsledek: nové lehké regresní testy skutečné Game startup orchestrace a lifecycle, **9/9 PASS**. Nezavádějí alternativní startup algoritmus. Runtime, UI ani ostatní testy nebyly upraveny.
- Změněné soubory: `tests/game-startup.test.ts`, tento handoff. Clean claim, žádný dirty WIP nebyl převzat.
- Podklady: aktuální rootem vlastněné Game metody a stavové inicializéry, AST/VM vzor `tests/room-callbacks.test.ts`, kontrakt world-build cancellation. Root před finálním během výslovně potvrdil stabilitu startup metod; jeho další změny se týkaly jiných síťových/frame částí.

## Co se skutečně provádí

Test za běhu čte `client/game.ts`, přes TypeScript AST vybírá a transpile/VM spouští původní `start`, `startContent`, `startupPhase`, `createWorldPresentation`, `updatePreloadVisuals`, `updatePlayers`, `setCar`, `dispose` a getter `assetLoadErrorCount`. Vybírá také původní inicializéry `ready`, `disposed`, `avatarSetupReady`, `pendingPlayers`, `startupAssetErrors`, `renderErrorCount`, `rainLines`, `avatars`; chybný výchozí runtime stav tedy neskrývá ručně nastavené fixture false/map.

Nahrazené jsou pouze okolní závislosti: renderer/render-loop ledger, materiálové/controller factory, physics dependency, event targets, hodiny a dynamické asset moduly. Deferred brány samostatně řídí presentation cadence, world job a tři loadery. Dynamické imports původní metody běží přes transpile CommonJS `require` s fixture module mapou. `import.meta` AST transform nahrazuje prostředí, nikoli kontrolní tok. Constructor se nevykonává jako GPU engine; samostatná AST regrese hlídá, že z něj nejsou volány těžké world/car/sky/physics/final factory.

## Ověřené scénáře

1. Constructor přímo nespouští buildWorld/createWorldBuildJob/createWorldPresentation/makeCar/updatePlayers/Simulation/SkyWeatherController/SurfacePack/CinematicAtmosphere/VehicleLighting.
2. Cadence musí doběhnout před world job; prezentace auta/sky/rain až po world. SurfacePack/Cinematic/VehicleLighting, aktuální avatar a follow camera se připraví **před prvním preload loopem i asset loadery**. Každý controller i loader je při jednom startu vytvořen/spuštěn jednou. Další preload frames používají stejné instance.
3. `updatePreloadVisuals` dostává skutečně nastavené quality/weather/timeOverride/player, dt0, stejné světlo a finální surface/cinematic controllery. Připravenost textur/shaderů nepředstírá.
4. Presence přijatá během cadence/world nevytváří předčasné avatary; při final setup se použije nejnovější odložený seznam. Opakování stejné presence nepřidává rig. Časné `setCar` před vznikem parkedCar je bezpečné.
5. Zrušení během cadence nevytvoří world/presentation, nedosáhne Game.ready a nespustí normální smyčku.
6. Zrušení probíhajícího world job odmítne původní start s AbortError; Game se uvolní pouze jednou. Tato regrese kryje chybu dvojího dispose nalezenou při průzkumu a opravenou přímo rootem.
7. Fatální physics-library/final-visual-setup failure uvolní částečný Game, zachová původní chybu, nevytvoří asset loadery/ready a phase diagnostika má outcome failed. Nespolehlivá cadence se předá adaptive controlleru jako null, nikoli jako přesných120Hz.
8. Při zrušení mezi loadery se i pozdě dokončené B6/vegetation/car controllery uvolní, neinstalují se do zavřeného Game a normální render loop nezačne. Jedna výjimka při pozdním B6 dispose nesmí zabránit cleanup ostatních; zapíše se startup-cleanup-error.
9. Volitelný B6 loader failure zachová fallback, současně předá úspěšnou vegetaci/auto a označí asset/phase chybu; při pozdějším normálním dispose se živé controllery uvolní jednou. Nezaměňuje očekávanou optional fallback politiku s fatálním selháním celého startu.

## Nález předaný vlastníkovi a ověření

- Při čtení bylo zjištěno: user dispose zruší world job, ten rejectne a `Game.start` catch zavolá `dispose()` znovu. Původní metoda neměla guard. Root tuto konkrétní závadu sám opravil (`if(disposed)return`, nastavení flagu před cleanup/logging) a potvrdil stabilní checkpoint. Fixture nyní asertuje jediný engine/avatar-pool cleanup a jediný game-dispose event.
- 13. 10. 2026 přibližně22:50 Praha: `pnpm exec tsx --test tests/game-startup.test.ts` **9/9 PASS**, exit0.
- `pnpm exec tsc --noEmit --target ES2022 --module ESNext --moduleResolution Bundler --strict --skipLibCheck --esModuleInterop --types node tests/game-startup.test.ts` **PASS**, exit0.
- Prettier pouze nad vlastním testem; cílený `git diff --check` exit0. První běh1/9 odhalil chybějící `exports` v CommonJS VM fixture (ne runtime chybu); po doplnění9/9. První narrow tsc ukázal nežádoucí assert.equal(undefined) flow narrowing přes pozdější callbacks; nulové counts se nyní kontrolují bez trvalého zúžení. Finální runtime i typy prošly bez potlačení diagnostik.
- Refaktoring: jeden dependency/resource ledger, jedna deferred primitive a jeden AST extractor, místo kopie orchestrace. Kritické field initializéry čteny přímo ze zdroje. Test nefixuje náhodný počet detailů deště nebo všech phase událostí, ale lifecycle a relevantní pořadí/identity.
- SHA256 `tests/game-startup.test.ts`: `f5930a4f1147652f3b7230eec5673bfa2ef990ace6440038010a52a57e37e925`.
- SHA256 zřetězených testovaných Game členů v pořadí testového `methodNames` (oddělovač LF): `9c0972cc7241fc481cf0f33bc671c0187268dd952544f46459323f0e06de81c2`. Tento přesný výčet je výše; celý Game soubor mohl mezitím měnit root v nesouvisejících frame/reconcile částech. Nejde o identitu celého herního checkpointu.
- Procesy/zdroje: všechny vlastní krátké testy/tsc dokončené, včetně potvrzení konce dočasně vráceného test handle. Žádný port, GPU, Babylon scéna, skutečná fyzika, build nebo fullsuite nebyly spuštěny. Fixture nepoužívá skutečné asset loadery ani síť.
- Omezení: constructor gate je strukturální; renderer a assety jsou fake. Testy **neprokazují**, že první finální render/textury/shadery jsou kompletně ready, že geometrie vypadá správně nebo že start zrychlil. Tyto vlastnosti zůstávají v samostatné produkční přejímce rootu. Novou wave2 hypotézu lightbudget/preprocessing jsem převzal jen jako podklad další práce, bez neoprávněného runtime zásahu.
- Rezervace: předání dokončeno13.10.2026 22:53 Praha; následuje `release --task repair-game-startup-fixtures --owner repairs-01a13624-startup-fixtures`. Integrátor přebírá test a doplní task/Linear/verification; výsledek neuzavírá všechny startup/performance problémy.
