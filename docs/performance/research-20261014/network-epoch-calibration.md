# KEY-7 B: kvalifikovaná kalibrace nové epochy

14.10.2026; rozhodnutí před implementací. Vlastník `fix-01a13624-epoch-calibration-20261014`, příjemce root. Pouze publication WT na `c677d47fd5722475ea1700b44fb3aea6ea581955`, čistý V11 runtime; nový phase fix je samostatný. Původní dvě vlastní research/handoff listiny jsou přeneseny byte-exact z main, původní cache red se nemění.

## Důkaz a zvolená hranice

[Předchozí výzkum](network-latency-recovery.md) rozlišuje A: jediný nejistý RTT zastaví výrobu inputů, a B: nová epocha z tohoto RTT vytvoří trvale chybný clock anchor. Skutečný frozen counterexample má3 pozitivní kontroly PASS a153 ahead odmítnutí v red; při návratu na34ms zůstává10.008ticku clock bias. 07c log obsahuje obdobný řetězec a následných9 ahead odmítnutí, ale chybí per-packet důkaz jejich jednotlivých příčin. Tato oprava řeší pouzeB. Nebude měnit raw měření, logging, deliveryBudgetExceeded, hranicefuture/replay/rate, probe, Game, wire ani server.

Koordinátor vybral **kvalifikovanou kalibraci**. Timing sample je způsobilý pro half-RTT clock kalibraci pouze pokud existuje a nepřekračuje stávající delivery budget. Při nové epoše bez způsobilého vzorku se použije potvrzený authority ack jako dolní odhad, pending kalibrace zůstane otevřená. Další over-budget autority ji nesmějí spotřebovat. Až způsobilý vzorek a platná čerstvá authority mohou doplnit half-RTT právě jednou. Same-epoch monotónní max a frontier validace zůstávají. Existující clock se při pouhé změně RTT znovu nekalibruje.

## Porovnané varianty

| Varianta | Rozhodnutí a dopady |
| --- | --- |
| Vyšší future/replay budget nebo clamp RTT | Zamítnuto: skryje nepodporovanou latenci, mění bezpečnostní a CPU/paměťový kontrakt. |
| Vždy odstranit half-RTT | Zamítnuto: degraduje podporovaných200ms i původní jump/deadline kalibraci. |
| Jen guard epochového offsetu bez pending flagu | Neúplné: pozdější over-budget authority by označila nekalibrovaný clock za kalibrovaný a fresh200ms už nikdy nedostane příležitost. |
| Způsobilý sample pro epoch i pending jednorázovou kalibraci | Zvoleno: stejná existující budget podmínka na obou větvích, žádný nový stav/okno/cache/API. Korektní0ms je platný sample; neplatné RTT zůstává odmítnuté. |
| Globální server-tick continuity přes každý client-request | Rozumná budoucí alternativa, ale vyžaduje důvod discontinuity a room lifecycle. Server-clock-drop/reconnect nesmí převzít starý čas; nynější povinný TimelineAuthority takový důvod neobsahuje. Nepřibaluje se. |
| Bounded estimator/confidence/hystereze RTT a clock slew | Potřebné pro širšíA a případný již poškozený same-epoch clock, ale nová policy, měření a frontend/presentation dopady jsou jiný celek. |

Podporovanost není tvrzení „wire čistoty“. Kvalifikace zde pouze říká, že hodnota neodporuje vlastnímu aktuálnímu plánovacímu rozpočtu. Skutečných300/500ms zůstane latency-budget a raw bude nezměněné. Tato oprava nezaručuje, že všechny podlimitní callback spikes jsou dobré kalibrační vzorky; to je výslovná hranice dalšího výzkumu.

## Předem stanovené regrese

1. Přenést původní skutečnou queue/probe reprodukci na public product imports. Před runtime změnou má high→epoch→low selhat; po opravě0 ahead a pokračující accepted. Poslední dodatečný reset už nesmí vyžadovat incident před resetem. Historický red se kvůli tomu neupravuje.
2. High-first bootstrap i nová epocha po již platném clock; několik over-budget autorit; fresh0/34/200ms; jednorázová kalibrace a zachované raw/budget. NaN/Infinity/záporný sample a neplatná/stará autorita nesmějí změnit pending stav.
3. Nová epocha musí stále zahodit předchozí clock pro server-clock-drop/respawn kontrakt; nový Timeline po reconnectu nesmí zdědit měření. Nezavádět sdílenou singleton cache. Stejnoepochové opožděné autority nadále nesmějí clock vracet zpět.
4. Skutečná queue regrese ověří monotónní produkované seq v každé epoše a žádné duplicitní sends; existing sender/Rapier/replay/recovery regrese pokryjí stableRTT200+jitter+15FPS, neutral prefix/jump a poškozené/reconnect stavy. Žádná physics DT změna.

Před každým CPU krokem ověřit TCP4186/2581 a nové candidate JSONL; pouze lehké cílené testy a narrow types. Plný checkpoint/build/integraci a GUI přejímku drží root. Výsledky a přesné hashy se doplní po skutečném běhu.

## Implementace a cílený refaktoring

Výsledný runtime delta má12 řádků diffu v `acceptAuthority`: po validaci příchozí authority vznikne jediná lokální podmínka `canCalibrate = hasTimingSample && !deliveryBudgetExceeded`. Použije se pro epochový offset, pending flag a pro jednorázovou same-epoch kalibraci/její dokončení. Nevzniká nová RTT hranice, paměťová historie, timer, listener ani API; ostatní clock max/frontier/replay/lead kód je beze změn. Existující validní0ms sample zůstává způsobilý. Produkční new-queue regrese pouze přenáší původní skutečný counterexample; dodatečná reset kontrola již správně vyžaduje0ahead před i po resetu.

Nezávislý read-only review `review_epoch_contract` nenašel blocker. Potvrdil, že rejected authority vrací výsledek před jakoukoli clock mutací, neplatné RTT nezmění stav a již kalibrovaná epocha se změnou RTT znovu neotevírá. Upozornění přijata: monotonie fixture znamená **vytvářené příkazy**, nikoli důkaz skutečné sender retransmise; tu pokrývá samostatný existující sender test. `setRtt` nemá timestamp, takže **starý, ale číselně validní RTT nelze v tomto API rozpoznat**. Stale/invalid authority a neplatné RTT nejsou totéž jako sample freshness. Širší A/confidence politika zůstává otevřená.

## Výsledky14.10.2026 (UTC)

| Běh | Výsledek | Evidence v `.cache/network-epoch-calibration/` |
| --- | --- | --- |
| 17:00:46–17:00:47 původní runtime + nové testy |14/19PASS, **5FAIL**, exit1; dvě queue selhání153/33ahead, tři pending/offset regrese | `red.log`, `red-result.json` |
| 17:01:41 stejný runtime po úzkém patchi, testy pouze formátované | **19/19PASS**, exit0 | `green.log`, `green-result.json` |
| 17:01:57–17:02:29 původní Probe/sender/Rapier/replay/client-recovery | **33/33PASS**, exit0 | `related.log`, `related-result.json` |
| 17:03:22 finální testy + existující input-timeline clock-drop kontroly | **26/26PASS**, exit0 | `final-targeted.log`, `final-targeted-result.json` |
| 17:03:46–17:03:47 narrow TypeScript (Timeline, oba změněné testy, SDK timeline-client) | **0 diagnostik**, exit0 | `types.log`, `types-result.json` |

Celkem **59 různých cílených testů PASS** (26+33, průběžných19 se znovu nesčítá). Finální queue test navíc výslovně zachová87 waiting frames ve všech high scénářích; tím dokládá, žeA se skrytě nemění. Původní cache test/log vmain zůstávají byte-exact; fresh red v tomto tasku zůstává zachovaný včetně tehdejších source/test hashů. Po prvním green pouze zpřesněno označení generated seq a přidány dvě waiting assertions; následný26-test běh ověřil finální soubor.

Přesné fyzikální coverage: Rapier0ms/60FPS,50ms/30FPS a200ms/15FPS s bootstrap jitter4ms; navíc skutečný walking jump200ms po join i rebase. Sender200ms+jitter/15FPS zachová držený vstup a jednu jump hranu v epoše. Nejde o plný kartézský produkt RTT×FPS ani o144FPS fyzikální důkaz. Nové unit kontroly samostatně pokrývají0/34/200ms kvalifikovanou kalibraci. Existující input-timeline test kontroluje actual clock drop, discard před osmi omezenými kroky a následnou epochu; actual Game recovery testy pokrývají nový identity reconnect, same-identity resume, respawn a poškozený stav. Žádný z těchto původních souborů se nezměnil.

Před každým test/type během QA gate ukázala0 Established TCP4186/2581 a žádný candidate JSONL; evidence v pěti activity JSON. Všechny procesy skončily. `git diff --check` prošlo. Žádný fullsuite/build/SDK integration/server/install/GPU/browser, staging ani commit.

Runtime SHA256 `b4bfa1aee25502fb0a90b6e486183052f564989c90c70cb7ef7bf1dafacb9d13`; unit test `151b20c2de52c05f262cba30563a2a56c2c1955c92a176a27e6e0542c8e32bf3`; queue regression `828b40f57bce5be904d552f1e9de41a249c2a838c7a4da60c8d712fd9bbbd224`. Přesný tracked delta a source/evidence manifest jsou v cache; root převezme samostatný commit a plný stabilní checkpoint. Tato prevenceB neopravuje již dříve vzniklý same-epoch bias, širšíA, všechny korekce ani subjektivní plynulost obrazu.
