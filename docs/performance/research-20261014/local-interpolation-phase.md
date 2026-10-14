# KEY-12/7: lokální fáze interpolace — rozhodnutí před opravou

14. 10. 2026, `fix-01a13624-local-phase-20261014`. Scope je jedna vazba plánovače ticků na prezentační alpha. Vychází z přijatého `netcode-camera.md`, `game-interpolation-reproduction.md` a skutečného red checkpointu `891e947a9405f698477ed26b201f4c7bdb7ede0c3f7555af8ddd08b46d79f749`: 5 pohybových FAIL / 1 epoch PASS, narrow types bez diagnostik. Původní red zůstává nedotčený.

## Doložený řetězec a srovnání variant

`NetworkTimeline.advance(now)` spočítá monotonic estimatedServerSeq, z něj target a fixed steps. Game ukládá endpoints těchto kroků, ale po mechanické extrakci stále používá pro všechny tři Lerp/Slerp výrazy nezávislý accumulator remainder. Skutečný Game test vykázal 60FPS krok 0 místo 0,2 m, 144FPS 0,066667 místo 0,083333 m, zero-step 0,008 místo 0,048 m a waiting rewind o 6 cm. Nejde o chybu fixture nebo importu. Primární autorita je aktuální Game/NetworkTimeline a installed Babylon math; obecné časové/rendererové podklady jsou citované v původním výzkumu. GPU velikost příznaku není z těchto CPU výsledků známá.

| Varianta | Výhoda / rizika a cena | Rozhodnutí |
| --- | --- | --- |
| Ponechat accumulator, přidat modulo epsilon | Malý patch, ale neřeší rozdílnou clock fázi ani waiting rewind. | Zamítnuto. |
| `fract(estimatedServerSeq)` | Správná běžná fáze, ale když predikce čeká po poklesu leadu, přetáčí stejnou pose dvojici periodicky zpět. | Samostatně zamítnuto. |
| `clamp(estimatedServerSeq + lead − actualPredictedSeq,0,1)` | Váže vzorek na skutečně dokončený pár; bounded i při catch-up limitu. | Potřebný základ, sám při poklesu leadu může vrátit stejný pár zpět. |
| Výše uvedená fáze + monotonic alpha pouze uvnitř stejného páru | Řeší prokázaný mechanismus a nevrací starý segment při zero-step wait; stálý malý stav. | Zvoleno koordinátorem. |
| Nový render cursor/history/spring a lead smoothing | Může později řešit změny horizontu; přidá latency, paměť, policy a jiné vizuální chování. | Jiný budoucí celek; nevyžaduje se k této opravě. |

API: pouze `advanced` výsledek dostane `presentation: { inputEpoch, currentSeq, alpha }`, vypočtený z **téže** estimatedServerSeq a lead jako target v témže volání. Waiting shape, input pořadí, neutral prefix, max-frame16, future16, replay32, RTT/lead policy, server a wire protokol se nemění. `currentSeq` je skutečně dokončená sekvence po bounded kroku, nikoli target, kterého se možná ještě nedosáhlo.

Game uchová jediný bounded záznam fáze označený identitou timeline instance + epoch + currentSeq. Ve stejném páru alpha pouze roste (`max`), nový pár dostane aktuální hodnotu. Obyčejný advanced/steps=0 přijímá další fázi; waiting a respawnPending ji nemění. Jeden getter zásobuje lokální/avatar/camera target i driven-car pozici/rotaci. Offline dál používá původní accumulator; fyzikální kroky se neovlivňují.

## Lifecycle audit a hranice změny

- `resetPredictionHistory()` se volá také při `requestRespawn()` **před** odpovědí. Nesmí nulovat poslední viditelnou fázi; reset history a phase nejsou stejná událost.
- `reconcile()` po skutečné obnově/přehrání již nahradí previousPosition i previousCarPose současnou opravenou pozicí. Teprve zde lze zneplatnit starou phase binding; oba endpoints jsou stejné, takže fallback current pose nepřidá novou interpolaci staré trajektorie. Exact early-return ponechává existující pár.
- `setLocalId()` vytváří nový NetworkTimeline, zahazuje car previous pose a síťové historie. Musí zneplatnit i cached phase. Neplatná/chybějící síťová phase použije current endpoint, nikoli phase cizí timeline. Při přímé výměně timeline objektu stejné epoch/seq nesmí monotonic clamp převzít předchozí relaci.
- `respawnPending` drží předchozí fázi až do přijaté authority; explicitní recovery nadále používá původní safe pose/camera reset. `snapRecoveryPresentation()` a visualOffset se neproměňují v nový smoothing systém.
- Cache je nejvýše jeden záznam, při běžném advance se jeho skaláry aktualizují na místě. Žádný timer, listener, historie render pose ani dodatečný time odběr za rendererem. Malý nový presentation payload v již vraceném výsledku není wire zpráva.

Růst leadu může stále odsimulovat více kroků a změnit horizont; tato oprava to nevyhlazuje. Reset vizuálního offsetu při malých korekcích, velké resyncy a vlastní camera follow zůstávají samostatné známé otázky. Zde se nesmějí měnit prahy nebo tolerance, aby zmizel red.

## Plán relevantního ověření

Před každým CPU během zkontrolovat TCP4186/2581 Established a candidate game-diagnostics; při aktivitě odložit a hlásit rootu. Původních šest Game assertions zůstane, přibude pokles leadu ve stejném páru, opakovaná epoch/seq v nové timeline instanci, actual setLocalId/pending respawn a offline fixed step. Timeline ověří fázi na tick hranici, zero-step, nový epoch a skutečný completed tick při bounded catch-up. Navazující existující client recovery, prediction replay, timeline physics/sender použít beze změny očekávání. Úzký TypeScript používá skutečné project options; plná sada/build/integrace/GPU patří root checkpointu.

Před funkční editací byly původní Game/timeline a tři testy zkopírovány do `.cache/local-interpolation-phase/before/`. Finální handoff musí dodat delta vůči tomuto reproduction základu i proti wave3 Game a source hashes; nesmí vydávat celkový Game diff proti HEAD za jediný nový fix, protože HEAD starší V11 WIP neobsahuje.

## Implementovaný výsledek a cílený refaktoring

Implementovány dvě runtime cesty: Timeline vrací presentation payload ze stejného odhadu a cacheovaného lead jako target; Game aktualizuje jeden stav fáze na místě a obě frame-používané interpolační metody čtou jediný getter. Driven-car Lerp i Slerp dostanou stejnou uloženou alpha. Původní síťový accumulator/history reset zůstal kvůli ostatnímu kontraktu, ale není zdrojem síťové render fáze. Offline getter je původní výraz.

Cache se zneplatní při skutečné výměně identity a po náhradě obou endpoints v reconcile; exact early-return nezasahuje. Obecné resetPredictionHistory ani čekající respawn cache nenulují. Chybějící/neplatná síťová binding použije current pose (alpha1), takže nepoužije endpoint z jiné timeline. Zero-step pokračuje, waiting drží, pokles leadu nevrací tutéž dvojici. Přímou výměnu timeline objektu se shodnou epochou/seq ověřuje porovnání s fresh Game fází.

Změněny pouze `client/game.ts`, `client/network-timeline.ts`, `tests/game-interpolation.test.ts`, `tests/network-timeline.test.ts` a vlastní dokumentace/cache. `tests/client-recovery.test.ts` byl převzatý scope, ale zůstal byte-identický. UI/server/sender/SDK producer/shared protocol nejsou editovány.

## Skutečná ověření 14. 10. 2026

Před každým během i při závěrečném sledování: Established4186/2581=0 a candidate game-diagnostics neexistuje. Žádné nové GPU/browser/server procesy, instalace, full suite nebo build. Všechny příkazy mají uložený stdout/stderr a metadata se skutečným child exit code; starý red se nepřepisoval.

| Běh | Skutečný výsledek | Evidence v `.cache/local-interpolation-phase/` |
| --- | --- | --- |
| `node --import tsx --test --test-concurrency=1 tests/game-interpolation.test.ts tests/network-timeline.test.ts` | **25/25 PASS**, exit0, 14:49:48.404–14:49:54.031 UTC. Všech pět původních red assertions je zelených bez změny tolerance/oraclu. | `targeted-01.{stdout.log,stderr.log,json}` |
| `node --import tsx --test --test-concurrency=1 tests/client-recovery.test.ts tests/prediction-replay.test.ts tests/timeline-physics.test.ts tests/timeline-sender.test.ts` | **27/27 PASS**, exit0, 14:50:54.172–14:51:31.945 UTC; původní testy beze změn, skutečný Rapier replay/jump i sender. | `related-01.*` |
| Úzký TypeScript, šest roots + type/import closure | První běh **5 diagnostik**, exit1; jen nadbytečné if větve nových testů po již zužujícím `assert.equal(status,'advanced')`, čtení reason z `never`. Původní failure zachován. | `narrow-types-01.{log,json}` |
| Po odstranění pouze pěti duplicitních if větví: `node --import tsx --test tests/network-timeline.test.ts` | **14/14 PASS**, exit0, 14:54:31.676–14:54:34.981 UTC. Všechny status assertions zůstaly. Nejde o dalších14 různých testů nad předchozích52. | `timeline-final-02.*` |
| Stejný úzký TypeScript a stejné options/roots | **0 diagnostik**, exit0, 14:55:15.452–14:55:46.127 UTC, 3342 souborů type closure, bez emit. Roots Game/Timeline/oba jejich testy + existující client-recovery a SDK timeline-client consumer. | `narrow-types-02.{log,json}` |

Nezávislý read-only review `/root/repair_network_causes/review_timeline_contract` nenašel nový konkrétní funkční defect. Prověřil stejné clock→target→alpha, completed tick při catch-up, same-pair max, čekání/respawn, reconcile/setLocalId, timeline identity a offline. Nespouštěl testy či GPU. Výslovný limit: steady test clock anchors obcházejí Game.reconcile; ordinary correction visual continuity, lead burst a camera follow tím nejsou vyřešené ani dokázané.

## Identita a předání

- Game před fixem/reproduction: `6ffb93929769f2993d21fadbfff46b43b68a7f7c4dfa64b4a0dea4d47de59e92`; po fixu `b40a8a97a9100a0c872fda1771fcb9d9fd7fbaa8bc6e3d3278bdaa3208d07954`.
- Timeline před fixem: `1f238cd7c6fa602e14b7f87cd6527fd6335c8119a5f0d3cbd588007cf461280e`; po fixu `c5007cac09055ed02eb3362f79da0d920725a61adb3e1bd1a2d17508590d2fa1`.
- Game test finální `9365d519affe5310ec6685d7bc5fd28de922804a54222a70e2e8ce3abea976f9`; Timeline test finální `ed7cf65ae3049add3508f7f5d34ad9b9c8c4074cdab55d223cc885b264d1ee0f`.
- Přesné nové delta: `game.ts.vs-reproduction.diff`, `network-timeline.ts.vs-reproduction.diff`, oba testové `.diff`. Souhrnný Game delta oproti wave3 v `game.vs-wave3.diff` obsahuje také přijatou mechanickou extrakci. Celkový `git diff HEAD -- client/game.ts` obsahuje starší cizí V11/startup/diagnostics WIP a není správnou jednotkou nového commitu.
- Hraný candidate Game zůstal `eb34279e38b799b8da4f075c70ba57c66bbcb5343f91d7fb498fcb68ad02f4e3`. Žádný hratelný build tohoto fixu nebyl vytvořen, žádné GPU/FPS tvrzení. Root má převzít delta, rozhodnout staging starších závislostí a provést celý stabilní checkpoint i praktickou přejímku.
