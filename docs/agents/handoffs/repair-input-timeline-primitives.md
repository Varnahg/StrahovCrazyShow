# Předání: repair-input-timeline-primitives

- Vlastník: `repairs-input-timeline-01a13624`; příjemce `repairs-01a13624-root`.
- Pracovní kopie/větev: `C:/Users/rezac/Documents/GitHub/StrahovCrazyShow`, main; základ `91ee88f0aaa902c79fad589aeb84bc086a66c9ea`.
- Výsledek: samostatné primitives serverové epochy, plánovaných vstupů a klientského replay; skutečné Rapier regresní scénáře. **Nejsou zapojené do současné hry a KEY-7 není hotový.** Současný V10 server, protokol, game/UI, původní testy a SDK producenti se v tomto tasku neměnili.
- Změněné soubory: `shared/input-timeline.ts`, `client/network-timeline.ts`, `tests/input-timeline.test.ts`, `tests/network-timeline.test.ts`, `tests/timeline-physics.test.ts`, tento handoff. Všechny nově přidělené cesty byly čisté, bez adopt-dirty; jiný WIP nepřevzat.
- Podklady: [kauzální analýza](../../performance/repair-network-cause.md), implementace současného InputQueue/Game/Rapier a předchozí předání transportu. Nové mechanismy jsou explicitní budoucí návrh, nikoli skrytá změna V10.
- Refaktoring: jedna kanonizace wire vstupu, jeden shared neutral/mode filtr pro obě strany, jednoznačná epoch/time identita. Bounded mapy16 serverových/32 klientských kroků; žádné snapshoty celého Rapier světa, vlastní timery, listener nebo dlouhožijící proces. Mode filtr vytváří replay pohled bez přepsání původních budoucích příkazů.
- Ověření: `pnpm exec tsx --test tests/input-timeline.test.ts tests/network-timeline.test.ts tests/timeline-physics.test.ts` dne13.10.2026 kolem21:06 Europe/Prague, **16/16**, exit0, 10,115s. Cílený TS createProgram nad pěti novými moduly/testy a jejich závislostmi, stávající tsconfig/noEmit: **0 diagnostics**, exit0. Nové soubory formátované Prettierem.
- Důkaz skutečné fyziky: dva světy s původním a plánovaným queue mají při dvou idle krocích auta **identické celé ActorState**, ale nový ack postupuje1→3 namísto záměny obou časů zaack1. Auto se normálně setrvačností posune přibližně0,465m; nezmrazí se ani nezrychlí.
- Latence/jitter/cadence: actual Rapier120tick scénáře s authority20Hz; pro RTT0/50/200ms a render60/30/15FPS bylo po zahřátí20/20/15 porovnání, max chyby **0,000000476837m /0,000000476837m /0m**, **0 pozdních vstupů**. Jitter doručení vstupů0–4ms/authority0–4ms. Nejde o GPU měření, browser transport ani úplný důkaz dynamických kontaktů v multiplayeru.
- Skok: skutečný pěší Actor na skutečném terénu přežije počáteční a pozdější epoch rebase přes dvě100ms síťové cesty; první čerstvý jump je naplánovaný do doručitelného kroku14, server jej opravdu vykoná (vertical>4, airborne). Staré kroky nespotřebují vstupní hranu.
- Zachované původní výsledky: první rozsáhlejší fyzikální test našel5 late příkazů přiRTT200/15FPS s nedostatečnou rezervou4ticks. Rezerva byla zvýšena na5ticks, protože potřebuje4ticks render kadence a1tick jitter. Statický podreview našel ztrátu jump hrany v nedoručitelném prefixu a destruktivní mode filtr; obě chyby opraveny a dostaly regresní test. Následný jediný neúspěch byl starý očekávaný počet uložených příkazů4 místo3 po správném zachování prázdné mezery; finální run výše je zelený.
- Procesy/zdroje: všechny vlastní CLI/testové/TS procesy skončily. Během root GPU baseline se testy nespouštěly; pokračovaly až po výslovném ukončení měřicího okna. Žádný server/GPU/build/integrace spuštěn. Read-only podreview nic neměnil ani nespouštěl.
- Rezervace: po předání uvolněna. Stav tasku/Linear a docs verification aktualizuje root.

## Server API a kontrakt

```ts
const queue = new TimelineInputQueue(inputEpoch, simulationClock.tick);
queue.push(raw); // accepted | invalid | epoch | late | ahead | duplicate
const step = queue.consume(nextWorldTick, {vehicle:actor.vehicle,yaw:actor.yaw});
actor.step(step.input, FIXED_DT);
simulation.tick(simulationUTC); // právě jeden skutečný společný krok
const frontier = queue.frontier();
// {inputEpoch,inputTickBase,tick,ack,receivedSeq}; ack = tick - inputTickBase
queue.reset(newerEpoch, simulationClock.tick);
```

Jeden queue patří jedné autentizované identitě v jediném společném světě. `consume` vyžaduje přesně následující world tick a sám svět neposouvá. Ack postupuje i bez příkazu. Krok bez příkazu/mimo mode je neutral, nikdy opakovaný jump. Přijmout lze maximálně16 budoucích kroků; díry a přeházené budoucí příkazy nejsou důvodem starý čas vykonat později. `receivedSeq` je samostatný max přijatých příkazů. Reset musí vydat přísně novější epochu a aktuální tick base; stará in-flight epocha se zamítne i při shodném seq.

`TimelineAuthority.time` znamená **UTC okamžik použitý pro skutečný poslední simulační tick**. Není to pozdější `Date.now()` při odeslání paketu. Serverová V11 integrace musí uchovávat odpovídající UTC osu i během catch-up/dropů a dát stejnou hodnotu do `sim.tick` a authority. Jinak dynamická doprava znovu zavede nesoulad času.

## Klient API a kontrakt

```ts
const timeline = new NetworkTimeline();
timeline.setRtt(measuredRoundTripMs);
const result = timeline.acceptAuthority(packet, receivedAtMonotonicMs,
  {vehicle:packet.state.vehicle,yaw:packet.state.yaw});
if (result.accepted) {
  actor.restore(packet.state);
  for (const step of result.replay) {
    actor.step(step.input, FIXED_DT); simulation.tick(step.time);
    // Capture resulting prediction state keyed by step.input.seq.
  }
}
timeline.advance(performance.now(), seq => readCurrentControls(seq), step => {
  actor.step(step.input, FIXED_DT); simulation.tick(step.time);
  // Capture this state as prediction at seq, including neutral filler ticks.
  if (step.source === "input") sender.enqueue(step.input);
});
```

- `acceptAuthority` odmítne starou epochu/tick, neplatnou tick-base/ack identitu a duplicitní ack v téže epoše. Vrací `epochChanged`, `rebase` a replay **jen ack+1…predictedSeq**. Integrátor vlastní actor restore, externí stavové captures a vizuální korekci. Může zachovat ověřený fast path bez fyzikálního replay, pokud state@ack přesně souhlasí a future mode/hole filtr nevyžaduje přepočet; nový epoch/rebase se takto přeskočit nesmí.
- Při coalescing authority uchovat `receivedAt` z **onMessage**, nikoli čas pozdější aplikace v render snímku. Jinak se ztratí doba čekání a predikce podhodnotí serverový čas. V replay nepoužívat aktuální klientský Date.now.
- Initial lead6 skutečně simuluje všech6 kroků. RTT50/100/200ms dává lead7/8/11; max lead12 proti serverové hranici16. Pro200ms může být úvodní cíl17 a frame budget16: všechny provedené kroky mají vlastní čas, zbytek se dokončí následným frame callbackem. Žádné přiřazení seq17 po jediném kroku.
- Nedoručitelný prefix využívá neutral bez volání `inputForStep`, takže nespotřebuje hranu skoku. `source === "missing"` musí projít fyzikou/capture, **nesmí se odesílat jako čerstvý řízený vstup**. Další replay při dočasné změně vehicle mode nesmí přepsat původní wire příkaz: může být znovu platný, pokud se mode před jeho deadlinem vrátí.
- Nejvýše16 předpovězených kroků v jednom `advance`,32 retained/replay kroků. Authority starší250ms vrací `waiting/stale-authority`, ne sekundové catch-up. Čerstvé authority s ack za místní predikcí vyvolají rebase a pouze nový lead. Recovery požadavek musí integrátor sloučit/omezit; nesmí posílat resync v každém render snímku.
- `setRtt` přijímá konečnou měřenou hodnotu0–2000ms jako data. Pokud požadovaný delivery lead překračuje rozpočet12 (přibližně nad233ms), snapshot přizná `deliveryBudgetExceeded` a advance vrátí `waiting/latency-budget`. **To není implementovaný fallback pro libovolně vysoké RTT**. Zde je doložen rozsah0–200ms; prodloužení serverového horizontu či jiný vzdálený režim vyžaduje navazující explicitní návrh/test. Jediný RTT outlier se v integraci nemá vydávat za dlouhodobou čistou wire latenci, protože probe zahrnuje main-thread doručení.

## Nevyřešená konkrétní integrační podmínka senderu

Primitivní testy posílají čerstvé příkazy okamžitě. Současný `FrameInputBuffer.reset()` zachovává `lastSentAt` a může po rebase odložit malý paket až33,3ms; úvodní200ms RTT dávka má jen3 čerstvé příkazy, takže nemusí vyvolat pressure flush. Toto čekání společně s jitterem může spotřebovat časovou rezervu skoku.

**V11 integrace musí zajistit včasný flush prvních packetů nové epochy (obejít běžnou33ms kadenci, ale zachovat rolling60packet limit), nebo zahrnout skutečné čekání senderu do delivery plánu. Povinný je test kombinace reálného FrameInputBuffer+NetworkTimeline s opožděným rebase, drženým rate budgetem, jitterem a skokem.** Tento handoff nepředstírá jeho splnění; transport modul není ve write scope této etapy. Nález potvrdil opakovaný statický podreview a byl přímo sdělen rootu.

## Další požadovaná integrace

Teprve navazující společný checkpoint změní aktuálně ověřený V10 protokol, server queue/authority/UTC simtime, game/UI planner/captures/sender lifecycle, diagnostické pole nové queue a všechny SDK/input fixtures. Zachovat guest boundary, jeden společný svět, autoritativní respawn marker/cizího řidiče, klávesy při render stall a forced epoch bariéry při coalescing. Po cílených testech skutečná SDK integrace a produkční GPU jízdní přejímka; nesmí se vyvozovat oprava všech420 původních korekcí jen z těchto krátkých CPU scénářů.

## Úzký manifest 2026-10-13T19:07:07.289Z

SHA256 `JSON.stringify` pole `{path,sha256}` v pořadí níže: `19d9233408bce62a3de4e8b255b45b15e25db62f37de30fe68b0664508a7b61d`. Zahrnuje testy a skutečné fyzikální podklady; není produkčním otiskem celé hry.

| Soubor | SHA256 |
|---|---|
| shared/input-timeline.ts | 5250e00173e0690d83dc227e67e3bafdd06f07e69520dbb12278f47591d53c99 |
| client/network-timeline.ts | 207e00e91348bbeb8eac3e5cf5f54540fb856c5c53a8a056fc6619cf6c732eca |
| tests/input-timeline.test.ts | 3910629b78ff7d8da211d7a6e4b0c6f8e2762d3d81143c9de84b26cf2e3edfd2 |
| tests/network-timeline.test.ts | 7ed98939c0b4da888677fb4d0ebb1fdcc45a55686634fd94fa4ef02755dddb1b |
| tests/timeline-physics.test.ts | c564719b4f8349178667f453d6a05cff238a4718aa089c874fc0a14b7367c024 |
| shared/netcode.ts | 4904f4ae66894049d8daa0725e930de0ed44d8830d149f7cdb73009b859be57f |
| shared/simulation.ts | 11f6016a254b33b7b042ee1c225027b78c1b17b5913753c42d065ee8162d9ea5 |
| shared/vehicle.ts | 9cdb914602a99e23f68ab607f9be5226ecdb1f1850c83e2177ccfea458562703 |
