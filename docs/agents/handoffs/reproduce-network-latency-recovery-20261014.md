# Předání: reproduce-network-latency-recovery-20261014

**Výzkum a rozhodující reprodukce dokončené. Product runtime nezměněn; původní red zůstává očekávaně červený.**

- Vlastník `research-01a13624-latency-recovery-20261014`, příjemce `/root`; hlavní checkout `C:/Users/rezac/Documents/GitHub/StrahovCrazyShow`, branch main, výchozí HEAD při claim `444fef1049a0bf020d7d4004d60b5de743a21a56`. Read-only audit začal před tímto claim; první zápis až po přidělení tasku a úspěšném claimu. Načteny aktuální AGENTS, architecture/coordination/current-work, Git/worktree/registr a task.
- Scope pouze `.cache/network-latency-reproduction/`, vlastní `docs/performance/research-20261014/network-latency-recovery.md` a tento handoff. Žádné převzetí cizího WIP. Network publisher, phase WT, main runtime, frozen snapshot a původní log se neměnily.
- Podklad: frozen wave3 `0f20b5a7…`, skutečný 07c227f8 log SHA256 `0ebf9512e10df06d94121358a57133885b7d0371b10d3b0b3027dbbce4b46dbb`,1799 záznamů bez mezer. Před testovým kódem zapsány konkrétní důkazy, grain/contextAt omezení, mechanismy/hypotéza, varianty a návrh reprodukce. [Výzkum](../../performance/research-20261014/network-latency-recovery.md) obsahuje celý rozklad a rozhodovací kritéria.

## Rozhodující výsledek

Oddělit dvě závady:

1. **A: vypnutí výroby ovládání jediným raw RTT spike.** Ve skutečném logu šest přijatých262–534ms vzorků zablokuje planner na součet9602.2ms do dalších vzorků. Render v jejich probe intervalech pokračuje (max celých překrývajících oken36.6–43.5ms). Dva contextAt snapshots uvnitř každého vysokého intervalu mají stejný produced/server accepted; idle vzroste63–68ticks. Raw delay leží skoro celý za server timestampem, ale nerozlišuje socket/OS/browser queue. LongTask absence není čistá síť.
2. **B: přetrvávající chybná clock kotva po highRTT→epoch.** Epochová kalibrace použije stejný over-budget RTT/2. Pozdější34ms už změní lead, nikoli monotónní clock anchor. V logu po seq1455 RTT533.6 a client-request1456 epoch33 zůstává clock přibližně10–14ticků napřed; v následujících403–406s vznikne všech9 ahead odmítnutí. Jednotlivé packet timestamps chybí, proto to samo nebylo úplné kauzální přiřazení. Následující skutečná blackbox reprodukce mechanismusB potvrdila.

`reproduce.test.ts` importuje přímo frozen NetworkTimeline, NetworkProbe a TimelineInputQueue; neimplementuje jejich algoritmy znovu. Fixture naplánuje60Hz world tick/queue.consume,20Hz authority, input delivery1tick; při incidentu authority callback delay6ticků, pak opět1tick. Jde o řízené vstupy, nikoli odhad přesné skutečné wire latence. Nepoužívá Game, physics, skutečný sender/socket ani renderer. Probe má skutečný nonce/cooldown/receive s injected prázdným LongTask observerem.

| Scénář | Ahead po fresh34ms | Accepted po fresh34ms | Výsledek |
| --- | ---: | ---: | --- |
| stabilní34ms + stejná epochová bariéra | 0 | 158 | PASS |
| high533.6 bez nové epochy | 0 | 158 | PASS |
| high533.6 → epocha → fresh34ms | **153** | **4**, potom0 | **RED** |
| stejná závada, později další epocha při lowRTT | 0 po druhém resetu | 118 po druhém resetu | PASS kauzální kontrola |

Všechny high varianty mají87 waiting frames=1450ms. Red varianta po odblokování drží clock bias10.008 ticku až do konce5000ms; posledních118 doručených příkazů má0 accepted/118 ahead. Další reset kontrolní varianty bias sníží na0.02, ale není doporučením přidat resync smyčku. Stabilní kontrola má 6 odmítnutí staré epochy a 3 late odmítnutí při záměrně zpožděné bariéře; zero assertion se týká ahead, nikoli všech rejection.

## Skutečné ověření a refaktoring

- `node --import tsx --test .cache/network-latency-reproduction/reproduce.test.ts`,14.10.2026 **16:28:45.729–16:28:46.374UTC**, **3PASS/1FAIL, exit1**. Runner530.45ms. Red assertion je `153 !== 0`; kontrolní assertions prošly. Zachováno `red-01.log`, `red-01-result.json` a `red-01-activity.json`.
- `node .cache/network-latency-reproduction/audit-log.mjs`, exit0; streamuje původní JSONL, uloží jen agregovanou projekci do `log-audit.json`. Používá contextAtMs, deduplikuje převzaté contexty a nezamění jejich capture za konec frame-window.
- `node node_modules/typescript/bin/tsc --noEmit --target ES2022 --module ESNext --moduleResolution Bundler --strict --skipLibCheck --esModuleInterop --allowImportingTsExtensions --types node .cache/network-latency-reproduction/reproduce.test.ts`, **16:30:56.707–16:30:59.569UTC**, **exit0**, `types.log`/`types-result.json`.
- Před oběma CPU kroky0 Established TCP4186/2581, žádný candidate JSONL; oba activity JSON zachované. Žádný server/GPU, instalace, build, plná sada, load profil nebo browser.
- Refaktoring fixture: jedna malá event-schedule funkce pro všechny kontroly, shodné veřejné queue/timeline operace, jediný bounded trace kontrolních ticků, probe.dispose ve finally. Není nový produktový framework. Původní testový zdroj po red neměněn.

## Doporučený další celek

Samostatný malý **B clock fix před A RTT policy**. Preferované minimální rozhodnutí: over-budget vzorek nepoužívat jako kvalifikovanou half-RTT kotvu nové epochy a nespotřebovat pending kalibraci, dokud je vzorek over-budget; další skutečně způsobilý fresh sample/authority může kalibrovat jednou. Raw RTT a delivery-budget chování zůstává pravdivé. Nepřidávat clamp ani nové vyšší limity.

Continuity globálního server ticku přes client-request je rozumná alternativa, ale potřebuje jasně odlišit spojitou místnost/epochu od server-clock-drop, reconnectu a nekvalifikovaného starého clock. Nynější TimelineAuthority nemá povinnou příčinu časové discontinuity. Výzkum proto porovnává tuto větší API/lifecycle variantu s úzkou qualified-calibration prevencí; žádná není zde implementována.

Přejímka B: tento původní red+kontroly, opakované over-budget autority před freshlow, bootstrap/high-first, stabilní pravé RTT200+jitter/15–144FPS, server-clock-drop, respawn/reconnect. Zachovat monotónní same-epoch čas, skutečnou production frontier bez opakovaných/nově přeskočených ticků, neutral prefix/jump, input deadlines a žádné falešné podporované300/500ms. Případná korekce již existujícího bias nesmí přetočit seq; bounded čekání/slew je jiný kontrakt než fixed physics DT. Nezaměnit s phase opravou, ta A ani B nemění.

Navržené runtime/test writePaths pro budoucí B task: `client/network-timeline.ts`, `tests/network-timeline.test.ts`, nový skutečný queue regression. Probe/UI/server/protocol beze změny, ledaže koordinátor zvolí důvodově rozlišenou continuity variantu a zvlášť rozšíří scope. Následně existující sender/physics testy a stabilní plná přejímka. Přesný původ původního callback delay stále potřebuje společný server send/queue a browser network/main-thread trace v rezervovaném QA okně.

## Identita a předání

| Výstup | SHA256 |
| --- | --- |
| cache `reproduce.test.ts` | `fcdda75fc78dda916f927c68d39b93ba7ef7c39cb35674797ffbda2f745f1837` |
| původní `red-01.log` | `5a72ba8a996f6eafc443833988aa34acda02d9b5733ebe1b2386723c60c34322` |
| `audit-log.mjs` | `308fd146daf65fbe83d69b1a44efe89d909fc815a69442bd718388582c632920` |
| `log-audit.json` | `a9cb054122ab8d8aff43f9a353ff7c4b35fa95e874196d4887bdcea2175ab3ee` |
| výzkumný dokument | `28fd0185d7926326d0e4442abf1b1edf4ec799bc232b7806cdd31842b016c5b3` |

Zdrojové SHA frozen Timeline/Probe/InputQueue/netcode jsou v research a `.cache/network-latency-reproduction/final-manifest.json`; opět ověřeny po reprodukci, beze změny. Manifest zahrnuje i test, evidence a handoff. Všechny vlastní krátké příkazy skončily s uvedenými exit codes. Provozní PID se necommitují; žádný pomocný proces/port nezůstal.

Po uložení manifestu následuje release; registry je autoritativní. Root přebírá rozhodnutí, Linear a případný nový runtime claim, nikoli deklaraci dokončeného KEY-7. Nic nestagováno/commitováno. Hraný immutable candidate zůstal nedotčený; žádné FPS, obrazové nebo finální uživatelské tvrzení.
