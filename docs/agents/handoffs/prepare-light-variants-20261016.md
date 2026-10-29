# Předání: prepare-light-variants-20261016

- Vlastník `key3-light-preparation-20261016` (`/root/flashlight_wip_and_regressions`); příjemce `/root`.
- WT `C:/Users/rezac/.codex/worktrees/key17-ownership-integration/StrahovCrazyShow`; detached metadata HEAD2c7aec9. Převzatý runtime overlay je publikovaný V1 main9d98ffc, nikoli starý metadata HEAD.
- Root nejprve přidělil pouze cache/research draft, aby zůstaly vstupy běžící V1 validace neměnné. Po explicitním GO byly rezervace release/reclaim rozšířené o šest přesných runtime/test cest, `--adopt-dirty` na doložené vlastní/předané cesty. Původní main WIP a frozen4188 se neměnily.

## Výsledek a soubory

Hotový kandidát pro následnou plnou a GPU přejímku:

- `client/light-preparation.ts`: startup-only bounded state machine current OFF/ON, normal night OFF/ON a restore. Jediný engine loop, dávky128 meshů/4ms, celkový deadline20s, samostatný timer i při pozastaveném RAF, explicitní cancellation. Výsledkem je status, elapsedMs, failureStep a kumulativní stage checks/renders/restarts.
- `client/game.ts`: sdílené render-only `updateWorldPresentation` / `updateRenderEnvironment`; příprava finální skutečné scény a lokálního avatara ještě při ready=false. Preload loop se před dočasným loopem zastaví; běžná herní smyčka začíná až po výsledku. Světla používají skutečný renderer, material/instance/shadow stav, žádnou proxy. Camera follow se pod neprůhledným existujícím loading overlay ustálí bez fyzikálního kroku. Dispose vyřeší čekající přípravu před teardown. Event `lighting-preparation` a dataset výslovně rozlišují complete/timeout/disposed/failed.
- `tests/light-preparation.test.ts`: devět scheduler/readiness/lifecycle regresí.
- `tests/game-light-preparation.test.ts`: šest regresí skutečné produkční metody s reálným PlayerFlashlight/ShadowGenerator a řízeným readiness/draw callbackem; nejde o GPU měření.
- `tests/game-diagnostics.test.ts`: produkční frame fixture přebírá nové sdílené helpery, doplněný guard API stub.
- `tests/game-light-lifecycle.test.ts`: ověřuje pořadí budget→stable→render a umístění environment helperu před kanonizací.
- Výzkum `docs/performance/research-20261016/light-preparation.md`, tento handoff, cache `.cache/light-preparation-feature/`.

Root nezávisle vlastní rozšíření `GltfLightBudget.prepareFrame()` a jeho nový interakční test. Na jeho výslovný pokyn je API zapojené před oběma actual render callsites; redundance stable update v preparation apply byla odstraněná. Rootovy dva glTF soubory nejsou součástí mého přiděleného diffu ani šestifile manifestu, ale byly přítomné ve finálních72 testech.

## Volba, refaktoring a bezpečné hranice

Výzkum/rozhodnutí zapsané před implementací. Nové GPU A/B rootu izolovalo zbytek: V1 warm maximum93ms oproti1913ms, první ON1114,4ms, jeho render1068,8ms versus environment30,9ms a click20,2ms. Proto se připravují skutečné cold varianty před vstupem do hraní; neoptimalizuje se naslepo konstruktor svítilny ani neslibuje nižší celková práce.

Žádné volání frame/advanceSimulation/input/authority/adaptive update před ready. Veřejné quality/timeOverride/flashlightOn se nepřepisují. Každá stage používá aktuální quality; změna settings/profilu/počasí/topologie restartuje jen current stage s kumulativními počítadly. Lokální rig se získává znovu, takže profil/reconnect změna neponechá disposed reference. Restore vždy čte aktuální requested values, ne starý snapshot.

Původní world/environment kód byl přesunut do společných render-only helperů, aby warmup nekopíroval jiná pravidla pro B6, sky, street budget, beams, weather, vegetation nebo cinematic. Žádná změna intenzit, barev, rozměrů, světelného budgetu, ovládání či simulace. Vypnutá svítilna je po restore skutečně disabled s intensity0; mapa je ponechaná pro reuse podle původního lifecycle.

Readiness používá skutečný camera.renderPassId a vrací předchozí pass ve finally. Mesh.isReady(true) samo může vracet starý hot-swapped efekt, proto engine.areAllEffectsReady gate chrání finální dva rendery. Progress draw spustí práci, která bez renderu nemůže být ready; nepočítá se za hotovou přípravu. Každý callback má dávkový limit a po neinterruptibilním draw znovu kontroluje deadline. Timer/observer/loop/queue se uklidí i po chybě nebo cancellation. Holé whenReadyAsync ani forceCompilationAsync se nepoužívají.

## Ověření 16. 10. 2026 přibližně00:46–00:54 Europe/Prague

GPU okno rootu bylo ukončeno před cílenými CPU testy.

- První sada helper/lifecycle/frame16/16 PASS; následně actualGame5/5 PASS.
- RED: původní V1 Game z `.cache/light-preparation-feature/game.v1.ts` přes `GAME_PREPARATION_SOURCE` — očekávaný exit1, **0/5**, chybí skutečná `prepareLighting` a start hook. Importy fungují. Log `red.log`. Šestý později doplněný error/pass test je navíc GREEN regrese.
- Sada po rozšíření:71/71 PASS.
- Finální `pnpm exec tsx --test tests/light-preparation.test.ts tests/game-light-preparation.test.ts tests/game-light-lifecycle.test.ts tests/game-diagnostics.test.ts tests/stable-light-state.test.ts tests/gltf-light-budget.test.ts tests/flashlight.test.ts tests/vehicle-lighting.test.ts tests/art-lighting-budget.test.ts tests/art-lighting-maintenance.test.ts tests/night-lighting.test.ts` — **72/72 PASS**, exit0,6,14s. Log `targeted-ordered-budget.log`.
- Prettier omezený na nové helper/testy a dotčený lifecycle test; u Game formátované jen nové přesunuté helpery. `git diff --check` pro tracked měněné soubory exit0. Celý starý Game soubor nebyl přeformátovaný.
- Nezávislé read-only review `/root/flashlight_chain_research` zkontrolovalo scheduler, skutečný Game, hot swapping, progress draws, počítadla, cancellation, camera a nové testy. Připomínky byly zapracované; žádný další blocking nález nepředal.

## Převzetí a meze

`.cache/light-preparation-feature/manifest.json` obsahuje aktuální šestifile SHA manifest včetně testů. Cache `game.v1.ts` a fixture kopie jsou vstupní archiv; `refactor-game.mjs` je jednorázový historický draft generátor a **nesmí se znovu spouštět přes následné změny**. Aktuální source v client/tests je autoritativní kandidát.

Celou sadu, typy/build, odpovídající integraci a skutečné GPU A/B vlastní root. Tento agent je nespouštěl. Kandidát musí doložit zvýšení startup času a snížení prvníhoF i warm cyklů při stejném GPU/rozlišení/HUD. Připravuje aktuální kvalitu, normální noční preview a aktuálně vykreslené receiver/instance/shadow varianty; nepokrývá automaticky všechny budoucí vzdálené avatary, B6 materiály, jiné kvality ani další astronomické sestavy. Deadline/incomplete není úspěch a nesmí sloužit k uzavření celého KEY-3. Konkrétní synchronní GPU/driver volání nelze přerušit uprostřed; přesunutý startup náklad je výslovně měřený.

Žádný vlastní server, port, GPU/browser, build nebo instalace závislostí. Všechny vlastní cílené test procesy skončily. Po předání se rezervace uvolňuje; root přebírá tento přesný diff, integraci, další GPU rozhodnutí, docs/verification a Linear. Převzaté soubory nejsou volný anonymní WIP.

## Root acceptance16Oct2026

Root refined the five-state draft after the first real movement851.9ms: final9states cover0/1/2street lamps×nightOFF/ON pluscurrentOFF/ON/restore; actualnonstreetcount and quality cap preserved. SmartArray fixture corrected after V2 strictTS failure. Watchdog increased20→30s only after measured V4timeout duringrestore; V5complete16.386s. Final snapshot3593bd1d46b70aa6591e527e7caf47c7eb617d5dd34ae53967c063ad25f24a56 has959tests/build/integrationPASS and sourceunchanged. GPUfirstF157.8ms, V4cutoffmovement54.4ms, butV5broader movement374.9ms/warm269.8ms; no generalfluidityclaim. Full comparative evidence is preparation.md. No owned helper process remains. Root integrates clean validated source separately from the explicitly preserved wider main WIP.
