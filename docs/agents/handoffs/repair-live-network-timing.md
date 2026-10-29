# Předání: repair-live-network-timing

- Vlastník `repairs-live-network-timing-01a13624`; příjemce `repairs-01a13624-root`; checkout `C:/Users/rezac/Documents/GitHub/StrahovCrazyShow`, main, HEAD `91ee88f0aaa902c79fad589aeb84bc086a66c9ea`.
- Výsledek: opravené samostatné moduly pro probe lifecycle/RTT kvalitu, coalescing běžných authority a monotónní odhad serverového času. Root zapojuje Game/UI. **Celá přejímka KEY-6/7 zůstává otevřená do skutečného browserového běhu s úplnými logy.**
- Změněné soubory: `client/network-timeline.ts`, nové `client/network-probe.ts`, `client/authority-buffer.ts`, `tests/network-timeline.test.ts`, nové `tests/network-probe.test.ts`, `tests/authority-buffer.test.ts`, `tests/timeline-physics.test.ts`, tento handoff. `tests/timeline-sender.test.ts` byl převzat do rozsahu a spuštěn, bez další změny.
- Převzatý WIP: root výslovně předal timeline a jeho dva testy podle svého handoffu; sender regression je vlastní předaná práce z V11 tasku. Claim adopt-dirty převzal právě4 doložené cesty. Game/UI, server a recorder nebyly upravovány.
- Podklady: [audit skutečného wave2](../../performance/repair-live-network-audit.md) a frozen moduly uvedené v něm. Ověřeny také primární [Performance Timeline – takeRecords/disconnect](https://w3c.github.io/performance-timeline/#dom-performanceobserver-takerecords) a [Long Tasks API](https://w3c.github.io/longtasks/). `takeRecords` převezme a vyprázdní vlastní observer buffer, takže může zachytit záznam před opožděným observer callbackem. Longtask evidence má práh50ms; nezachytí každou možnou příčinu scheduler delay.
- Refaktoring: NetworkTimeline odděluje stavový anchor od hodin. Autoritativní stav stále určuje restore/replay; stará zpráva ve stejné epoše nevrací známý odhad hodin zpět. První použitelné RTT jednou kalibruje bootstrap; další změny RTT upravují delivery lead, nikoli opakovaně fázi hodin. Nová epocha vytvoří novou bázi. Probe a authority buffering mají vlastní explicitní lifecycle, bounded paměť a nevytvářejí autonomní časovače.
- Ověření: `pnpm exec tsx --test tests/network-timeline.test.ts tests/network-probe.test.ts tests/authority-buffer.test.ts tests/timeline-physics.test.ts tests/timeline-sender.test.ts` **25/25 PASS**, exit0,10,391s. Poté byl skutečný Rapier scénář zpřísněn o4ms jitter už prvního bootstrap paketu přiRTT200/15FPS; samostatný `tests/timeline-physics.test.ts` **3/3 PASS**,10,638s. Po zahřátí max error0,000000476837m přiRTT0/50 a0m přiRTT200 s bootstrap jitterem;0 late. Původní testy skoku a sender priority zůstávají zelené. Finální scoped TypeScript všech8 modulů/testů se stávajícím tsconfig/noEmit: **0 diagnostics**, exit0.
- Nové příčinné regrese: 995ms timer fáze neodesílá před reply cooldownem; raw1000ms překryté980ms longtask z takeRecords ponechá predikční20ms; čistých3000ms se zachová bez clampu a aktivuje explicitní latency budget. Staré ack103 při skutečném109 po předchozím100 již neposílá107–109, ale110–115.80 běžných paketů se aplikuje jako1; explicitní/new-epoch/respawn bariéry se vrací okamžitě. Zvýšení a snížení RTT neposune kalibrované hodiny trvale dopředu.
- Procesy/zdroje: všechny vlastní testové/TS/CLI procesy skončily. Během root CPU A/B okna byly běhy zastavené a pokračovaly až po oznámení konce. Žádný server, port, GPU ani build vytvořen. Pokus o další read-only podreview odmítl limit agentů; žádné externí schválení nebo provedený review se netvrdí.
- Rezervace: po tomto předání uvolněna; zápisy do runtime/testů skončily. Root dokončí integraci, společné testy a skutečný browser checkpoint.

## AuthorityBuffer API

```ts
const offer = buffer.offer(packet, receivedAt);
if (offer.kind === "barrier") {
  // Apply immediately when Game is ready, otherwise retain the bootstrap
  // barrier outside the replaceable ordinary slot.
  applyAuthority(offer.authority.packet, offer.authority.receivedAt);
}
// Before the frame's simulation, not after generating new input:
const latest = buffer.takeLatest();
if (latest) applyAuthority(latest.packet, latest.receivedAt);
```

`offer` vrací rejected/queued/barrier. První nebo nová epocha, resync a respawn jsou bariéry. Starší/duplicitní frontiers se odmítají. V bufferu zůstává nejvýše1 běžný packet a jeho původní monotónní receivedAt. Bariéra vyřadí předchozí čekající normální stav; sama nikdy neleží ve slotu, který další normální packet nahradí. Root zajišťuje atomické zachování bootstrap bariéry před Game.ready a guard hosta. `reset()` při změně room odstraní pending/frontier; staré callbacks musí být odpojené přes existující room lifecycle. `dispose()` instanci uzavře. Snapshot rozlišuje received/superseded/barriers/ordinaryApplied/rejected.

## NetworkProbe API

```ts
const probe = new NetworkProbe({ now: () => performance.now(),
  send: request => ownRoom.send("networkProbe", request) });
const event = probe.poll({ enabled: multiplayerConnected, ready: gameReady });
// event is sent / timeout / send-error / null; log timeout and send-error.
const sample = probe.receive(reply);
if (sample) {
  recordRaw(sample); // Always retain rawRoundTripMs and quality metadata.
  if (sample.acceptedForPrediction)
    game.networkTimeline.setRtt(sample.predictionRoundTripMs!);
}
```

- Jeden pending; cooldown1050ms začíná přijetím reply. UI může volat poll pravidelně nebo podle snapshot.nextProbeAt, ale modul nemá vlastní timer. Timeout10000ms uvolní pending a začne retry cooldown; pozdní nonce neovlivní další měření.
- Před ready se sonda neposílá. Observer vzniká až pro enabled multiplayer, ne v guest konstruktoru. Vlastní observer/takeRecords sleduje nejvýše256 deduplikovaných záznamů v posledních10s, sjednocuje překrývající se intervaly a nepřičítá překryv dvakrát. Přetečení znamená neúplnou kvalitu a nepoužitelný vzorek, ne falešně čisté RTT.
- `receive` vrací rawRoundTripMs, measuredAt, serverTimeMs/serverTick, contaminated, blockedOverlapMs, overlappingLongTasks, longTaskCoverage, acceptedForPrediction a predictionRoundTripMs. Kontaminovaný vzorek nezmění poslední použitelný odhad; není-li žádný, odhad je null. Raw hodnota se neodečítá ani nepřepisuje.
- Čisté vysoké RTT se neclampuje. Timeline nyní přijímá libovolné konečné nezáporné RTT; údaj mimo podporovaný delivery budget vrací explicitní waiting/latency-budget. Root nemá z tohoto samotného důvodu periodicky resetovat serverovou epochu, protože epoch reset nepřepíše RTT.
- reset/disable/room-leave vyprázdní pending, RTT, task evidence a odpojí observer. Generační guard ignoruje i již naplánovaný callback starého observeru. Nonce čítač se při resetu nevrací zpět. Dispose zakáže další poll/receive.
- Pro testování lze injektovat `longTasks(record) => {takeRecords,disconnect}`. Když API není dostupné, coverage je unavailable; absence evidence se nesmí prezentovat jako důkaz čisté wire latence. Raw měření stále zahrnuje celé lokální/serverové plánování a transport.

## Zbývající přejímka a známé hranice

Root má ověřit nové callbacky v produkci včetně Game.ready/bootstrap, guest guard, room-leave, explicitního respawnu uprostřed backlogu, změny epochy a plných automatických logů. Observer s prahem50ms nedokazuje nepřítomnost zdržení z více kratších úloh nebo nepodporovaného browseru. Oprava nenavyšuje serverový rate/future/memory limit a neslibuje podporu libovolného WAN RTT. Původních777 chybějících záznamů se neopraví zpětně. Čítače aplikovaných stavů, časových rebases a skutečných velkých posunů se musí v reportu odlišovat.

## Úzký manifest 2026-10-13T21:01:22.434Z

SHA256 `JSON.stringify` uspořádaného pole `{path,sha256}` níže: `17edde15dc7b8676edc8fe952ca1696ea836362af6bbd644227ef9bbc47b9f32`. Zahrnuje všechny aktuální cílené testy; není manifestem celé hry.

| Soubor | SHA256 |
|---|---|
| client/network-timeline.ts | 1f238cd7c6fa602e14b7f87cd6527fd6335c8119a5f0d3cbd588007cf461280e |
| client/network-probe.ts | 7b784980bed2173f9372b9cf6f6b2e97047854fe0d8ce8ff3c103dc015d454af |
| client/authority-buffer.ts | 34909e09b77b9cac17d307a8ca21e43b4a74ecfffddaba154708716566308e19 |
| tests/network-timeline.test.ts | 763c040dbedf9b447c233213e276fd6ca9c757689b5f5ff3d6dc4013de17a6b0 |
| tests/network-probe.test.ts | dc514a6aaea645e2a6efc81d1260d3f1489c51ecd7ebcc1861c1c5683eb820b7 |
| tests/authority-buffer.test.ts | ae205de6646eabca431e509d9b2ae68060edc6655b1ef397522f89261014c167 |
| tests/timeline-physics.test.ts | 99becdca298c8e66304a0f1395e4d8fc94fbd63f94319da45cd92c4a02eb6939 |
| tests/timeline-sender.test.ts | b3ca6511382f125833e49f5ba52efb1d4f45a581b7890e0754503e2eaa8f7db5 |
