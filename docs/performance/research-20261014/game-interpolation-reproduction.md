# KEY-12/7: příprava regrese skutečné Game interpolace

14. 10. 2026, `reproduce-01a13624-game-interpolation-20261014`. První fáze byla pouze příprava zdrojů během B6 preview bez spuštění ověření. V následném výslovně povoleném neaktivním CPU okně je již doložen **skutečný red: 5 FAIL / 1 PASS, narrow types 0 diagnostik**; přesné výsledky jsou níže. Funkční oprava hry se neimplementovala.

## Podklady a dataflow před změnou

Navazuje na přijatý [výzkum času a kamery](C:/Users/rezac/Documents/GitHub/StrahovCrazyShow/docs/performance/research-20261014/netcode-camera.md), SHA-256 `82b74d998e781fc3a8c8e9fab4bafbac4cbfb4b356038bdb50d36055dfcb6df5`, a jeho primární installed Babylon/WHATWG/W3C zdroje. Modelová reprodukce ukázala mechanismus, ale nekontrolovala skutečnou Game implementaci; nyní se připravuje tento chybějící důkaz.

Převzatý `client/game.ts` v managed wave4 worktree je před změnou byte-identický s hraným immutable candidate/wave3: SHA `eb34279e38b799b8da4f075c70ba57c66bbcb5343f91d7fb498fcb68ad02f4e3`. Vlastní kopie před extrakcí je `.cache/game-interpolation-reproduction/game.before.ts`. Read-only `client/network-timeline.ts` má SHA `1f238cd7c6fa602e14b7f87cd6527fd6335c8119a5f0d3cbd588007cf461280e`. Původ Game WIP: root `repair-game-integration` → `repair-wave4-bootstrap` → výslovné předání tomuto tasku. HEAD `f63039b` sám tento celý WIP neobsahuje.

`Game.advanceSimulation(dt, now)` ukládá před každým fixed step předchozí actor/car pose, volá skutečný NetworkTimeline a PredictionHistory a při vykonaných síťových krocích počítá `accumulator %= FIXED_DT`. `Game.frame` pak používá `min(1, accumulator/FIXED_DT)` samostatně pro lokální Vector3.Lerp i pro car Lerp/Slerp. Lokální renderPosition napájí avatar i kameru. Reconcile resetuje pose dvojici; waiting resetuje accumulator. Přesný problém je propojení plánovače ticků a těchto callsites, nikoli samotná matematická funkce Lerp.

## Varianty důkazu a rozhodnutí před editací

| Varianta | Přínos / cena / riziko | Volba |
| --- | --- | --- |
| Další čistý test alpha helperu | Levný, ale může projít i při ponechání původního Game callsite. Duplicita vzorce by opakovala chybu testu. | Nestačí. |
| Celý Game constructor/frame s browserem a kompletním světem | Nejširší integrace, ale velká scene/asset/GPU závislost a kolize s právě hranou přejímkou. | Pozdější praktické ověření, ne tento task. |
| Celý frame s desítkami mocků všech nesouvisejících controllerů | Bez GPU, ale křehký fixture sleduje mnoho nepodstatných detailů, zvyšuje údržbu a zakrývá mechanismus. | Nezvoleno. |
| Mechanicky vyjmout skutečný Lerp/Slerp do frame-používaných Game metod a testovat je po skutečném advanceSimulation | Malý produkční delta, zachová pořadí, vzorec, alokace a lifecycle. Testuje právě chybnou vazbu, bez druhé implementace alpha. | Zvoleno pro přípravnou regresi. |
| Rozšířit existující prediction-replay-fixture | Má skutečný Rapier, ale předplňuje timeline mimo Game.advance a záměrně odchýlené states; nevhodný čistý časový driver. | Ponechat beze změny jako navazující fyzikální kontrolu. |

Extrakce zachová stejné vstupní objekty, stejné tři výrazy alpha, stejné Lerp/Slerp i pozici decay. Nevytvoří novou cache, clock, timer, history či callback. Dvě veřejné interní Game metody slouží frame i regresi: `interpolateLocalPosition(position: Vec3): Vector3` a `interpolateDrivenCarPose(position: Vector3, rotation: Quaternion): void`; druhá má stejnou předpodmínku `previousCarPose` jako původní frame větev. Networking, UI, kamera, recovery ani lead se nemění.

## Připravený test a hranice oraclu

Nový `tests/game-interpolation.test.ts` používá Game prototype, skutečný NetworkTimeline/PredictionHistory a Babylon math. Pouze actor/sim je konstantně se pohybující tělo; neutral input zastavení této testovací setrvačnosti nevyvolává. Nejde o Rapier správnost, řízení ani GPU výkon. Test neobsahuje výpočet alpha/modulo ani kopii interpolace.

- 60/144 FPS: fixed RTT 26 ms a čerstvé timeline autority, porovnání produkčně interpolovaného displacement s nezávislým `rychlost × elapsed`; car/root offset a quaternion proti známé lineární translaci a úhlové rychlosti. Po zahřátí se očekává konstantní obrazová rychlost, bez skutečného fyzikálního driftu.
- Zero-step: několik snímků v jednom ticku musí posunovat obraz i při nezměněném seq a počtu physics steps. Jde o jiný případ než timeline `waiting`.
- Waiting: stale a latency-budget nevykonávají další fyziku a nesmějí vrátit už zobrazenou interpolaci zpět na začátek poslední dvojice. Recovery request policy se pouze pozoruje, nemění.
- Recovery: skutečné `Game.reconcile()` přijme vzdálený stav nové epochy, před dalším stepem root/car pose nepoužije starý endpoint; následné kroky jsou nové epochy. Stará epocha je odmítnuta.

Při budoucím red běhu nestačí „test selhal“: musí selhat časový/pohybový invariant, nikoli import, type chyba nebo neúplný fixture. Je nutné uložit celý výstup a jednotlivé failure hodnoty. Teprve potom přidělit funkční opravu. Nové testy jsou nyní záměrně připravené jako normální assertions, ne skip/todo/expected-failure; do stabilní zelené větve se nesmí začlenit jako již ověřené.

Budoucí fáze, nyní **nespuštěno**: cílený `node --import tsx --test tests/game-interpolation.test.ts`, scoped typecheck v povoleném CPU okně; po potvrzení red samostatný fix NetworkTimeline/Game a teprve jeho regrese stávajícího replay/recovery. Žádný současný zásah do lead smoothing, skládání visualOffset nebo camera follow. Plná hra/produkční jízda zůstává další přejímkou.

## Připravené soubory, nikoli provedený test

Mechanická extrakce má proti uloženému wave3 Game přesně tři hunks: přidání dvou metod a nahrazení obou původních frame bloků jejich voláním. Původní tři alpha výrazy jsou nezměněné; decay stále předchází lokální interpolaci, car guard a remote branch zůstávají na původním místě. Delta je `.cache/game-interpolation-reproduction/game-extraction.diff`. Nový soubor obsahuje šest testů: dvě FPS varianty, zero-step, dvě waiting varianty a epoch recovery. Žádné kopie alpha, modulo, Vector3.Lerp ani Quaternion.Slerp v testu nejsou; očekávaný displacement používá pouze známou rychlost testovacího těla a elapsed čas.

Read-only hash kontrola po editaci potvrdila původní hash hraného candidate Game i NetworkTimeline; tyto cesty se nezměnily. Připravený Game má SHA `6ffb93929769f2993d21fadbfff46b43b68a7f7c4dfa64b4a0dea4d47de59e92`, test `edf7e098a69e44ad04cf515b92a59041f4be9de64f6f240df7d3e29d123426fb`. Manifest přípravy je `.cache/game-interpolation-reproduction/source-checkpoint.json`. Případné následné změny fixture/type oprav musejí vytvořit novou identitu a zachovat tento původní připravený checkpoint.

**Neověřeno:** importy/typecheck, skutečné spuštění a počty PASS/FAIL, red failure příčina, runtime chování extrakce, GPU či uživatelský pocit. Čtení diffu/hashing nejsou testy. Předaný source není nový hratelný build ani pokyn měnit běžící preview.

## Následné povolené CPU okno — skutečný red

Tato část aktualizuje výše zachovanou evidenci původní neprovedené fáze. Root upravil task a povolil pouze cílený test a úzké typy. Před testem, před typy i po obou bězích bylo na portech 4186/2581 **0 Established spojení** a candidate `.cache/game-diagnostics` neexistovala. API/preview zůstaly pod samostatným `serve-b6-candidate-20261014`; agent je nestartoval, nezastavoval ani neměnil.

Příkaz `node --import tsx --test tests/game-interpolation.test.ts`, 14. 10. 2026 **14:35:38.759–14:35:46.805 UTC**, skutečný child exit **1**, bez signálu. Původní výstupy zachovány v `.cache/game-interpolation-reproduction/red-20261014-1436.{stdout.log,stderr.log,json}`. Výsledek **6 testů, 1 PASS, 5 FAIL, 0 skipped/todo/cancelled**. Nebyla nutná žádná oprava fixture, importu ani chybějícího pole; všechny pády jsou přímo pohybové assertions:

| Scénář | Skutečný první failure | Význam |
| --- | --- | --- |
| 60 FPS, frame 16, seq 22 | posun 0 m místo 0,20000000000000023 m | Game na jeden snímek zastaví obraz konstantní trajektorie. |
| 144 FPS, frame 41, seq 23 | 0,06666666666666643 m místo 0,08333333333333348 m | I vysoká render cadence má chybnou fázi obrazu. |
| Zero-step, 20 ms | 0,008000000000000007 m místo 0,048 m | Alpha saturuje dřív než odpovídající časový pár; sekvence i počet fyzikálních kroků zůstaly stejné. |
| Stale-authority waiting | obraz z 1,26 m na 1,20 m | Návrat o 6 cm bez fyzikálního kroku; sender nevyprodukoval nový input. |
| Latency-budget waiting | obraz z 1,26 m na 1,20 m | Stejný rewind, při zachované politice bez resync požadavku. |
| Recovery nové epochy | PASS | Skutečné reconcile nahradí oba endpoints; stará epocha je odmítnuta. Tento správný kontrakt se musí zachovat. |

Úzká typová kontrola 14:36:30.775–14:36:51.695 UTC: TypeScript `createProgram` s roots pouze `client/game.ts` a `tests/game-interpolation.test.ts`, skutečné compiler options z tsconfig, `getPreEmitDiagnostics`; **0 diagnostik, exit 0**, 3 338 souborů import/type closure, bez emit. Výstupy `.cache/game-interpolation-reproduction/narrow-types-20261014-1437.{log,json}`. Nejde o celý build ani full suite.

Po bězích jsou Game a test SHA stále přesně shodné s prepared checkpointem. Timeline i hraný candidate Game mají nadále původní hash. Původní `source-checkpoint.json` se nepřepisuje; výsledkový manifest je `red-verification-checkpoint.json`. Cílený red nyní prokazuje skutečnou Game chybu a vyvrací alternativu „test selhává kvůli neúplné fixture“. Stále neprokazuje velikost screen-space jitteru v produkční jízdě ani Rapier kontaktní divergenci.

## Přesný návrh dalšího samostatného funkčního celku

Bez implementace v tomto tasku. Nejmenší navazující scope: `client/network-timeline.ts`, `client/game.ts`, `tests/network-timeline.test.ts`, `tests/game-interpolation.test.ts` a vlastní handoff; stávající recovery/replay testy nejprve spustit beze změn. UI, server, wire, RTT estimator, lead policy, camera follow a skládání visualOffset zůstávají mimo opravu fáze.

1. Rozšířit pouze úspěšný `TimelineAdvance` o `presentation: { inputEpoch, currentSeq, alpha }`. Po dokončení stejného `advance(now)` použít již vypočtené `estimatedServerSeq`, stejný lead a skutečné `predictedSeq`: `alpha = clamp(estimatedServerSeq + leadTicks - predictedSeq, 0, 1)`. `currentSeq` označuje skutečně dokončený tick, nikoli jen plánovaný target. Žádný další časový odběr po render práci. Existing `waiting` shape nemusí měnit API.
2. Game uchová poslední přijatou prezentační fázi společně s identitou **timeline instance + inputEpoch + currentSeq**. Při novém páru přijme vypočtenou alpha, při stejném páru použije `max(previousAlpha, alpha)`. To je ochrana před návratem v téže dvojici, zejména při poklesu leadu; není to vyhlazování horizontu ani změna input deadlines. Čistý `fract(serverSeq)` by při čekání opakovaně přetáčel alpha; samotný clamp bez párové ochrany by při snížení leadu zavedl zpětný pohyb.
3. `waiting`, `respawnPending` a snímek bez nové autority nesmějí resetovat už zobrazenou fázi na nulu. Obyčejný `advanced/steps=0` naopak přijímá rostoucí alpha téže dvojice. Všechny tři Lerp/Slerp spotřeby používají jeden uložený výsledek. Offline větev zachová stávající accumulator a fixed-step chování.
4. Reconcile se nemění: již resetuje oba endpoints při obnově. Mezi barrier a dalším stepem jsou endpointy shodné, tedy neunikne starý segment při jakékoli platné alpha. První nový pár přijme novou fázi. Nový NetworkTimeline objekt musí změnit identitu páru i při opakované epochě/seq po reconnectu. Nezavádět reset prezentační fáze do obecného `resetPredictionHistory()` naslepo: používá jej i čekání na respawn před přijetím nových endpoints.
5. Přidat přesné hranové regrese: epoch/reconnect se stejnými čísly a novou instancí timeline, alpha na float hranici ticku, zero-step přes pokles leadu bez rewind, remaining catch-up práce s alpha v [0,1], pending respawn drží starou dvojici až do bariéry. Neměnit lead values, max16 frame steps, future16, replay32 ani recovery request cadence. Prudký posun fyzikálního horizontu při růstu leadu a malé correction offsety zůstávají známé samostatné problémy.

Nejprve musí tento úzký fix změnit aktuálních 5 pohybových FAIL na PASS a zachovat epoch PASS i existující input/replay/recovery invariants. Až poté řešit další výzkumné větve či produkční GPU přejímku. Žádný dosavadní výsledek neopravňuje označit KEY-7/12 jako celek Done.
