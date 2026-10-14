# Předání: fix-network-epoch-calibration-20261014

**Úzká prevenceB dokončená: implementace, refaktoring, red/green,59 různých cílených testů a narrow types. Připraveno k root review/full checkpointu; necommitnuto ani neintegrováno.**

## Vlastnictví a výsledek

- Vlastník `fix-01a13624-epoch-calibration-20261014`, příjemce `/root`. Pouze `C:/Users/rezac/.codex/worktrees/wave3-feature-publication/StrahovCrazyShow`, větev `codex/wave3-feature-publication`, výchozí HEAD `c677d47fd5722475ea1700b44fb3aea6ea581955` (samostatný ověřený V11 + test-only Scene mock). Před zápisem načteny instrukce/task/registry/Git/worktrees a získán čistý claim; žádný adopt-dirty ani cizí runtime WIP. Administrativní změny AGENTS/task catalogu ponechány vlastníkovi.
- Runtime mění pouze `client/network-timeline.ts`. Číselně platný sample nad stávajícím delivery budgetem se nepoužije jako half-RTT offset nové epochy. Potřeba kalibrace zůstane otevřená i přes opakované over-budget autority; první způsobilý sample+platná authority může jednou kalibrovat. Podporovaných0/34/200ms zůstává.
- `setRtt` signature a raw hodnota, probe/logging, deliveryBudgetExceeded, všechny limity, Game/camera/presentation, wire a server jsou beze změny. Nepodporovaná latence stále zastaví predikci. Jde oB přetrvávající clock kotvu, **nikoli opravuA dočasného freeze od jediného raw spiku**.
- Runtime refaktoring: jediná lokální `canCalibrate = hasTimingSample && !deliveryBudgetExceeded` po validaci authority, použitá v obou clock větvích. Žádná duplicitní číselná hranice, nový flag/collection/timer/listener/cache nebo alokace. Ostatní monotónní max, epoch reset a produkční frontier jsou zachované. Diff8 přidaných/4 odebrané řádky.

## Přesné soubory

1. `client/network-timeline.ts` — jediný runtime delta.
2. `tests/network-timeline.test.ts` —105 přidaných řádků se4 unit scénáři; původní testy beze změny.
3. `tests/network-latency-recovery.test.ts` — nový skutečný Probe/Timeline/TimelineInputQueue counterexample a kontroly, převzatý z vlastní historické reprodukce s public product imports.
4. `docs/performance/research-20261014/network-epoch-calibration.md` — rozhodnutí zapsané před implementací, varianty, výsledky a omezení.
5. Tento handoff.
6. `docs/performance/research-20261014/network-latency-recovery.md` a `docs/agents/handoffs/reproduce-network-latency-recovery-20261014.md` — rootem výslovně povolený byte-exact přenos vlastní předchozí práce zmain; historie a původní red se nezměnily.
7. Ignorovaná `.cache/network-epoch-calibration/` — before kopie, red/green/related/final/types logs, activity gates, tracked delta a final manifest.

Původní main `.cache/network-latency-reproduction/reproduce.test.ts` SHA `fcdda75fc78dda916f927c68d39b93ba7ef7c39cb35674797ffbda2f745f1837` a `red-01.log` SHA `5a72ba8a996f6eafc443833988aa34acda02d9b5733ebe1b2386723c60c34322` zůstaly byte-exact. V novém produktovém testu je závěrečná kauzální reset kontrola správně změněna z očekávání kladného ahead incidentu na0 už před dodatečným resetem; jinak by vyžadovala zachování opravované chyby. Nejde o oslabení assertion. Nový test navíc kontroluje monotónně vytvářené seq v každé epoše a původních87 waiting frames.

## Důkazy a ověření

Vlastní výzkum a 07c log jsou v přeneseném research. Finální runtime rozhodnutí porovnalo clamp/vyšší limity, odstranění halfRTT, neúplný epoch-only guard, qualified calibration, globální tick continuity a širší estimator/slew. Qualified varianta je nejmenší bez nového reason-aware wire/lifecycle kontraktu. Předchozí skutečný frozen counterexample potvrdil153 ahead po high533.6→epoch→fresh34ms; stabilní kontrola a high bez epochy byly pozitivní.

Časy14.10.2026 UTC; všechny logy v `.cache/network-epoch-calibration/`:

| Běh | Výsledek |
| --- | --- |
| `red`,17:00:46.473–17:00:47.194 | původní runtime,14/19PASS, **5FAIL**, exit1; queue153/33ahead +3 offset/pending selhání |
| `green`,17:01:41.237–17:01:41.767 | **19/19PASS**, exit0; testy předtím pouze formátované |
| `related`,17:01:57.168–17:02:29.705 | **33/33PASS**, exit0; nezměněné Probe/sender/Rapier/replay/Game recovery |
| `final-targeted`,17:03:22.440–17:03:22.970 | **26/26PASS**, exit0; finální testový text +2 waiting assertions a existující clock-drop/input-timeline kontroly |
| `types`,17:03:46.638–17:03:47.826 | **0 diagnostik**, exit0; Timeline, dva testy, SDK timeline-client |

Příkazy:

```text
node --import tsx --test tests/network-timeline.test.ts tests/network-latency-recovery.test.ts
node --import tsx --test --test-concurrency=1 tests/network-probe.test.ts tests/timeline-sender.test.ts tests/timeline-physics.test.ts tests/prediction-replay.test.ts tests/client-recovery.test.ts
node --import tsx --test tests/network-timeline.test.ts tests/network-latency-recovery.test.ts tests/input-timeline.test.ts
node node_modules/typescript/bin/tsc --noEmit --target ES2022 --module ESNext --moduleResolution Bundler --strict --skipLibCheck --esModuleInterop --types node client/network-timeline.ts tests/network-timeline.test.ts tests/network-latency-recovery.test.ts scripts/timeline-client.ts
```

59 je součet26 finálních +33 related; průběžných19 se znovu nesčítá. Rapier přesně0ms/60FPS,50ms/30FPS,200ms/15FPS s jitter4ms; walking jump200ms po join/rebase. Reálný sender200ms+jitter/15FPS zachovává držení vstupu/jump. Není to plný RTT×FPS produkt ani144FPS GPU/physics evidence. Nové unit kontroly0/34/200ms ověřují halfRTT kalibraci, repeated-high pending, invalid RTT, stale/invalid authority, jednorázovost a epoch/reconnect izolaci. Existující actual input clock-drop a Game identity/reconnect/respawn testy prošly beze změny. Fixture sama nedokazuje real sender retransmise — to pokrývá samostatná sender sada.

Nezávislý read-only review `review_epoch_contract` bez blockeru; přijaté upřesnění generated command tvrzení a přesného FPS coverage. Zdrojové validity guardy jsou před mutacemi,0ms je validní, already-calibrated same-epoch clock se neznovukalibruje změnou RTT. `git diff --check` exit0. Pět activity JSON před každým test/type během ukazuje0 Established TCP4186/2581 a žádný candidate JSONL. Všechny vlastní procesy skončily s uvedenými exit codes; žádný server/port/worker nezůstal. Provozní PID se zde neukládají.

## Identita a meze

| Soubor | SHA256 |
| --- | --- |
| runtime `client/network-timeline.ts` | `b4bfa1aee25502fb0a90b6e486183052f564989c90c70cb7ef7bf1dafacb9d13` |
| `tests/network-timeline.test.ts` | `151b20c2de52c05f262cba30563a2a56c2c1955c92a176a27e6e0542c8e32bf3` |
| `tests/network-latency-recovery.test.ts` | `828b40f57bce5be904d552f1e9de41a249c2a838c7a4da60c8d712fd9bbbd224` |
| vlastní rozhodnutí/výsledky | `f72faaf1aa98af73a6e181f017c39977e6deea5c1c7cccd9a31193e294f57031` |
| přenesený research | `28fd0185d7926326d0e4442abf1b1edf4ec799bc232b7806cdd31842b016c5b3` |
| přenesený opravený handoff reprodukce | `3c21c24425cf5515a0377252e8fca1bd227cabde69e454e7fd4defed195ecf57` |

Before runtime SHA `1f238cd7c6fa602e14b7f87cd6527fd6335c8119a5f0d3cbd588007cf461280e`, shodný frozen wave3. `.cache/network-epoch-calibration/tracked-delta.patch` obsahuje pouze tracked runtime/unit změny; nový queue test a dokumenty jsou samostatné plné soubory. `final-manifest.json` zahrnuje finální zdroje/testy/dokumenty i before/logy. Nepoužívat celý starý Timeline proti případné novější phase větvi; root aplikuje přesný malý delta na aktuální základ.

„Způsobilý“ zde znamená přítomný sample v existujícím budgetu, **nikoli wire-clean nebo časově čerstvý**. `setRtt` nemá timestamp: starý číselně validní RTT nelze rozpoznat. Neplatné RTT a stale/invalid authority jsou jiné případy. Probe nonce/room lifecycle zůstává původní. Oprava preventivně nevytvoří chybnou over-budget epochovou kotvu; neopravuje již vzniklý same-epoch bias ani všechny podlimitní spikes. A policy, subjektivní třesení, další recovery/camera/physics příčiny jsou otevřené.

Žádný fullsuite/build/SDK integrace/install/GPU/browser, staging ani commit. Main/HMR, staré snapshoty a user preview se nezměnily. Root přebírá samostatný commit, stabilní full checkpoint, případné spojení s phase a průběžný Linear. Po uložení manifestu následuje release; registry je autoritativní. Release neznamená celý KEY-7 Done.
