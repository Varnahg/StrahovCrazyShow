# Příčiny front vstupů a síťových korekcí — 13. 10. 2026

Průzkum pro KEY-6/7, task `repair-network-cause`, vlastník `repairs-network-cause-01a13624`. Jde o kauzální analýzu a návrh oprav, nikoli prohlášení opravené hry. Produkční přejímka následuje u koordinátora.

## Evidence a její meze

Vstup: `.cache/playtest-diagnostics-20261013/session.jsonl`, SHA-256 `30f15b76b579f872d127c61bbdd4821e8779a6082fffb18001878391d2215f6d`. Původní relace `c0c87474-6d36-487d-b9c7-a180bb43c5fd`, development, jediný hráč, GTX 1060, 2040×986 CSS; podmínky a celkový audit jsou v [playtest-diagnostics-20261013.md](playtest-diagnostics-20261013.md).

Zkoumaný protokol v `shared/netcode.ts` má **PROTOCOL_VERSION = 10**, nikoli původní historickou verzi z mapy architektury. Níže uvedený nový wire kontrakt tedy vyžaduje nejméně verzi 11, pokud se mezitím verze nezvýší z jiného důvodu. Veškerá pozdější implementace musí přečíst aktuální hodnotu.

Primární implementační podklady: `client/game.ts` (`frame`, `reconcile`), `client/ui.tsx` (input timer a callbacky), `server/index.ts` (receiveInputs, simulation interval, sendAuthority), `shared/netcode.ts`, `shared/simulation.ts`, `shared/vehicle.ts`; testy `netcode`, `input-backlog`, `prediction-replay` a veřejné SDK scénáře `scripts/integration*.ts`. Průzkum neotevřel GPU scénu ani server.

Primární externí podklady ověřené 13. 10. 2026: [HTML Standard – timers](https://html.spec.whatwg.org/multipage/timers-and-user-prompts.html) negarantuje přesné spuštění časovače a připouští zdržení jinými úlohami/CPU. [Rapier – determinism](https://rapier.rs/docs/user_guides/javascript/determinism/) podmiňuje shodu stejnými vstupy a počtem kroků; [serialization](https://rapier.rs/docs/user_guides/javascript/serialization/) popisuje snapshot celého světa. To není důkaz konkrétního plánovacího rozhodnutí browseru nebo přesného rollbacku při samotném `Actor.restore`.

## 1. Fronta UI roste, protože odčerpávání závisí na samostatném timeru

Aktuální tok:

1. `Game.frame` vytváří jeden příkaz na pevný simulační krok 1/60 s. Každý jde synchronně do `g.onInput`.
2. `onInput` pouze vloží příkaz do `inputBuffer`. Při délce 65 zahodí všech 65 a pošle `resync`.
3. Pouze samostatný `setInterval(1000 / 30)` odešle maximálně osm příkazů. Teoretických 240 příkazů/s platí pouze při pravidelném běhu tohoto callbacku.
4. Server přijme maximálně osm příkazů v paketu a spotřebuje maximálně jeden v každém ze svých 60 kroků/s. V10 přijímá pouze přesné další `seq`.

Zásek celého hlavního vlákna sám o sobě frontu nenaplní, protože v něm neběží ani producent. Kritická je **asymetrie callbacků**: renderové callbacky a produkce vstupů dále běží, odčerpávání timerem dostává nedostatečný čas. Po odhození fronty se navíc generují další `seq` až do přijetí vynucené authority, zatímco server striktně čeká na první chybějící číslo. To prodlužuje obnovu a může tvořit další požadavky na resync.

Přímé údaje prvního shluku, čas `atMs` od počátku stránky:

| Událost | atMs | Co skutečně víme |
|---|---:|---|
| Poslední zpracovaný motion před prodlevou | 86265,7 | Hodnota `lastMotionAtMs` z následných kontextů |
| Kontext | 86727,4 | Pending history 29, motion age 461,8 ms |
| Overflow #527 | 87397,1 | UI zahodilo 65 neodeslaných příkazů |
| Kontext | 87592,0 | Pending 81, stejný počet motion/authority jako výše |
| Overflow #533 | 88468,7 | Dalších 65; odstup 1071,6 ms odpovídá přibližně 60 příkazům/s |
| Kontext | 88710,6 | Pending 147, motion age 2445 ms |
| Obnovené authority #571–575 | 89419,9–89552,1 | Každá přehrává strop 180 příkazů; opravy až 1,562 m |
| Overflow #576 | 89702,0 | Dalších 65 |
| Oprava #580 | 89985,4 | 2,120 m, replay 180 |
| Čtyři vynucené authority | 90070,4–90134,6 | Čtyři resyncy za 64,2 ms |

Přitom frame okna #528/#534 mají 15,44/13,03 FPS a maxima **92,4/111,9 ms**, nikoli jeden dvousekundový blok. V původním logu nejsou události skrytí/blur. Záznam neobsahuje časy input timeru ani `WebSocket.bufferedAmount`, takže **neprokazuje přesné rozhodnutí scheduleru**, síťový RTT ani zdravý server. Prokazuje, že lokální producent fungoval a jeho lokální odčerpávání nestačilo; samotné vzdálené zpoždění nemůže tuto UI frontu naplnit, protože `room.send` na síťový ACK nečeká.

Všech osm overflow se vyskytlo při pokračujícím renderování, často s jednotlivými intervaly jen 40–150 ms. Pravidlo resync při `rawFrameMs > 250` tento typ degradace nezachytí.

### Oprava transportu před změnou protokolu

Vyjmout vlastnictví fronty do čistého `client/network-input-buffer.ts`. Jediná instance na room lifecycle; explicitní dispose/reset. Odeslání vyvolat synchronně **na konci simulační části snímku**, před drahým renderem, a podle tlaku nejpozději při osmi příkazech. Běžně nejvýše 30 paketů/s; tlaková výjimka drží paket do osmi a nečeká na nezávislý timer. Timer může zůstat pouze doplňkový pro malé zbytky a měření kadence; správnost na něm nesmí záviset. Není důvod vytvářet druhý writer stejné fronty v UI.

Před odesláním musí být stále ověřen režim multiplayer, připojený room a neprobíhající respawn. Guest nesmí vytvořit sender, probe ani odesílat síťové telemetrie. Při vynuceném resetu musí být zrušeny původní neodeslané příkazy. Ve V10 nepřidávat nepřiznané přeskakování `seq`: vyžaduje korektní recovery handshake. Ani tato změna sama neopravuje časovou osu auta popsanou níže.

Regrese: řízený scheduler 180 produkovaných příkazů/3 s při 15 FPS, input timer záměrně nespustit. Starý sender dvakrát překročí 64 (zbytek 50); nový po každém simulačním snímku odešle vytvořené příkazy, zachová pořadí a všechny sekvence, fronta nikdy nepřekročí osm. Doplnit zdravé 60/144 FPS, hranici 30 paketů/s, tlak osm, reset, odpojení, dispose a guest. Test nemá tvrdit, že tím byla reprodukována přesná implementace scheduleru Edge.

## 2. `ack` příkazu ve V10 neidentifikuje čas autoritativního fyzikálního stavu

`InputQueue.consume()` při prázdné frontě vrací nulový pohyb/jump a **stejné ack**. Server však stále volá `Actor.step` a `Simulation.tick`. U auta to znamená pokračující setrvačnost i brzdy, gravitaci a kontakty. `sendAuthority` pak připojí aktuální auto k původnímu ack.

Klient porovnává tento stav s `prediction.states.get(ack)` a po restore přehraje všechny dosud nepotvrzené příkazy. Jeho uložený stav vznikl bez dodatečných serverových idle kroků. Počet příkazů a čas fyziky už tedy nejsou stejná osa. Totéž se může projevit u skoku/pádu pěší postavy; vodorovně stojící pěší je vůči problému mnohem méně citlivý.

### Deterministické CPU reprodukce na skutečném Rapieru

Obě reprodukce byly spuštěny přes `node --import tsx --input-type=module` s kódem na stdin, bez zápisu pomocných skriptů, serveru a GPU:

- Dva samostatné `Simulation` světy, stejné auto ve stejném bodě x=180,z=20, 180 identických kroků včetně zatáčení: maximum rozdílu pozice **0 m**, linvel **0 m/s**. Tento omezený kontrolní scénář nepotvrdil náhodnou nedeterminističnost auta.
- Jedna `InputQueue`, vůz na stejném místě se z=14 m/s, první platný příkaz seq1, potom žádný další: po 1/2/3 neutrálních serverových krocích je ack stále1, ale vzdálenost od state@ack je **0,232903 /0,465406 /0,697518 m**.
- Při volání skutečného `Game.reconcile` přes `createReplayFixture("vehicle")`, stejné ack18 a postupující tick, vyšly korekce **0,233183 /0,465771 /0,697787 m**. Už dva běžné kroky tedy překračují stávající hranici tvrdé korekce 0,35 m.

Ve skutečném logu první jízda při vzorkované rychlosti 14,35 m/s obsahuje #699–705, opravy **0,474 /0,472 /0,705 /0,934 /0,464 /0,693 /0,689 m**, replay vždy2. Rozdíly následných authority ticků jsou 2,3,4,2,3,3. To je silná shoda s časovým mechanismem výše, ale bez ack/idle metrik nelze zpětně přiřadit stejnou příčinu každé ze 420 oprav.

Minimální reprodukce chybných časových identit:

```ts
import assert from "node:assert/strict";
import { initPhysics, Simulation } from "./shared/simulation.ts";
import { InputQueue, canonicalInput } from "./shared/netcode.ts";
import { groundHeight } from "./shared/terrain.ts";
await initPhysics();
const sim = new Simulation(), actor = sim.add("probe");
try {
  actor.setVehicle(true);
  sim.car.reset({x:180,y:groundHeight(180,20)+1,z:20}, 0);
  sim.car.unpark("probe");
  const initial = sim.car.capture();
  initial.linvel = {x:0,y:0,z:14};
  sim.car.restore(initial);
  const queue = new InputQueue();
  const input = canonicalInput({x:0,z:1,yaw:0,jump:false,seq:1,vehicle:true});
  assert.ok(input); queue.push(input, 0);
  actor.step(queue.consume(0)); sim.tick(0);
  const stateAtAck = actor.capture(), ack = queue.ack;
  for (let tick=1; tick<=2; tick++) {
    actor.step(queue.consume(tick*1000/60)); sim.tick(tick*1000/60);
  }
  const current = actor.capture();
  assert.equal(queue.ack, ack); // V10 identifies different physics times identically.
  const distance = Math.hypot(current.position.x-stateAtAck.position.x,
    current.position.y-stateAtAck.position.y,
    current.position.z-stateAtAck.position.z);
  assert.ok(distance < 0.003, `same ack ${ack} has state distance ${distance} m`);
  // Last assertion FAILS: actual distance 0.465406 m, even without rendering/network.
} finally { sim.dispose(); }
```

Tato poslední assertion popisuje požadovanou identitu `state@ack` starého prediktoru, nikoli požadavek zastavit fyziku auta. Regrese nové verze musí místo toho ověřovat, že ack postupuje spolu se serverovými kroky, a že přehrané příkazy patří výhradně do budoucích kroků.

## 3. Konkrétní nový časový kontrakt

Nejméně invazivní robustní varianta: **seq je číslo plánovaného simulačního kroku uvnitř serverem vydané inputEpoch**. Dosavadní `PredictionHistory.states` tak může zůstat mapou podle seq; změní se jeho přesně definovaná časová sémantika.

### Wire a server

- Nová verze protokolu odmítne V10 při připojení. Nepřidávat tichý fallback starých příkazů do nové časové osy.
- Network input obsahuje běžné řízení, `seq` a povinné nezáporné celé `inputEpoch`. Offline fyzika může nadále používat základní `Input` bez wire epochy. Vhodný je samostatný `NetworkInput` a jeho striktní validátor.
- Authority obsahuje `inputEpoch`, `inputTickBase`, `tick`, `ack`, `receivedSeq`, `state`, případné `resync/respawn/resyncReason`. V dané epoše platí **ack = tick − inputTickBase**. Ack je hranice vyřešeného simulačního času, i když pro některé kroky nic nepřišlo; `receivedSeq` je jiný údaj.
- Při každém skutečném pevném serverovém kroku roste ack o1. Server spotřebuje nanejvýš jeden příkaz přesně pro dané ack. Při nepřítomnosti použije neutral. Pozdní příkaz seq<=ack se už nikdy nevykoná. Budoucí příkazy čekají podle seq v omezené mapě/frontě; nejvýše například12 kroků dopředu, zároveň pevný limit počtu/velikosti.
- Přijímání dovolí díry v budoucích sekvencích: chybějící krok se vyřeší neutral v příslušném čase. Duplicity, neplatná epocha a příliš vzdálený budoucí krok se odmítnou a měří. Žádné rychlejší vyprázdnění, replay serverového světa nebo zrychlení aktéra při burstu.
- Explicitní resync/respawn, změna identity a serverový drop času vytvoří novou epochu a base=currenttick, ack0. U respawnu zachovat marker a izolaci cizího řidiče. Všechny původní in-flight příkazy tím bezpečně zastarají; jejich seq se nemůže splést s novou nulovou epochou.
- Událost běžného nedostatku vstupů sama nevytváří resync: autoritativní čas dál běží a normální authority je platná. Stávající trvalý FIFO backlog tím z principu zaniká; nový backlog test ověřuje expiraci plánovaných kroků, ne staré hromadné zahazování fronty.

### Klient, lead a mezery

- Klient udržuje model serverové osy z `tick/ack`, lokálního monotónního času přijetí, ověřeného RTT a případně serverového zbytku akumulátoru. Nekombinovat přímo nesynchronizované klientské/serverové Date.now. Zpočátku je možný konzervativní lead6 kroků (100 ms), vždy omezený pod serverovým maximem a později upravený podle měření.
- Očekávaný cílový seq na snímku = odhad serverového ack + lead; fyzika postupuje po všech jednotlivých krocích. Pro počáteční lead klient **nesmí pouze přiřadit seq=ack+lead a provést jediný krok**. Po authority@ack vytvoří/předpoví každý z ack+1…targetSeq a odešle příslušná aktuální řízení. Příkazy, které mezitím na server dorazily pozdě, expirují; příchod nového ack opravu korektně ukotví.
- Jestli v již zaznamenané historii některý tick chybí, replay musí provést neutrální krok pro tuto mezeru. Filtrování nesprávného vehicle mode nesmí vynechat časový krok. Jump je hrana, nelze jej opakovat v neutral filleru. Neutral musí mít shodnou definici na obou stranách.
- Authority@ack je stav po právě tomto počtu kroků epochy. Přehrává se jen souvislá časová posloupnost ack+1…predictedSeq. Příkaz seq<=ack je definitivně reprezentovaný autoritativním časem, i když byl doručen pozdě nebo vůbec; nikdy se nepřehrává znovu. Nový tick se stejným `receivedSeq` je normální.
- Při dlouhém stall nejprve zpracovat nejnovější použitelnou authority (se zachováním forced/respawn bariér). Pokud je aktuální předpověď starší než poslední ack, obnovit tento stav a předpovědět pouze omezený lead. Bez čerstvé authority a při překročení bounded historie požádat jednou o recovery a omezit místní predikci; nedohánět sekundy stovkami starých příkazů. Fyzika serveru stále běží.
- Časovou synchronizaci nelze řídit současným `min(0.1, rawFrameMs)` odděleně od serverového cíle: opakované intervaly 100–250 ms jinak ztrácejí kroky bez recovery. Limit catch-up práce je rozpočet, ne nová definice fyzikálního času. Nadlimitní rozdíl musí vyvolat explicitní rebase, nikoli tiché prodloužení rozdílu.
- Skutečný blur/visibility/input focus může pustit klávesy; pouhý render stall nesmí mazat fyzicky držené ovládání. Epoch/prediction reset musí být oddělený od `clearHeldInput`.
- Hromadu doručených běžných authority před jedním vykreslením lze sloučit na poslední platný stav. Forced epoch/respawn bariéry nelze přeskočit bez zpracování jejich sémantiky. V logu 180 ze420 tvrdých korekcí patří do48 časových shluků s mezerou mezi událostmi<=5 ms; největší má15 oprav za4,1 ms. Neznamená to automaticky15 viditelných skoků, ale každá nyní vykonává replay a přidává měřicí událost.

### Regrese a přejímka

1. Stejné vstupy a cílové kroky, dva světy, authority20Hz, klient/render 15/30/60/144Hz: shodný fyzikální čas a žádné periodické 0,46m korekce ze záměny ack. Test použije skutečný `Game.reconcile` a Rapier, nikoli jen kopii algoritmu.
2. Auto14m/s, 2–3 serverové kroky bez vstupu: auto pokračuje, ack roste; pozdní příkaz pro vyřešený krok se neprovede. Čerstvý budoucí příkaz normálně řídí.
3. Síťové jitter/bursty a 100–250ms render cadence: omezená fronta, max jeden příkaz/serverový tick, žádné trvalé FIFO zpoždění, žádné zrychlení.
4. Počáteční lead, seq mezery, mode změna a jump: přesný počet fyzikálních kroků, filler nemůže opakovat jump. Změnu mode z autority respektovat.
5. 1–3s stall a opožděné pakety včetně explicitního respawnu: bounded rebase, stará epocha odmítnuta, žádný replay již vyřešených ticků a žádné zahození držených kláves pouhou výkonnostní pauzou.
6. Guest nesmí navázat multiplayer, číst jeho presence přes HTTP nebo vyžadovat síťovou telemetrii. Multiplayer má stále jediný svět; návrh nezavádí skupiny.
7. SDK integration produkuje příkazy podle nejnovější epoch/ack a lead, nesmí dále předpokládat `ack === počet odeslaných příkazů`. Propojit respawn, duplicate, mode, reconnect i backlog scénáře.
8. Produkční hra, aktuální HUD a avatary, původní rozlišení/scénáře: doložit FPS, p95/p99, četnost a amplitudu **vykreslených** korekcí, queue/timing metriky, hash zdrojů/testů. CPU reprodukce není GPU/performance důkaz ani úplná přejímka kontaktů s dynamickou dopravou.

## 4. Minimální automatická telemetrie

Před změnou wire algoritmu lze přidat kompatibilní volitelná pole a zjistit skutečnou baseline. Bez chatů, profilů, tokenů a cizí presence; pouze vlastní relace a agregované časování.

- **Klient sender:** vyprodukované/odeslané příkazy a pakety, lokální fronta/current/max/oldestAge, poslední enqueue/flush/timer callback, interval timeru a frame flush, reset/discard counter a důvod, poslední odeslaná seq, epoch. Buffer WS uvést jen z veřejného API SDK, jinak výslovně unavailable.
- **Klient receiver:** receiveAt monotónní, authority tick/ack/received frontier/epoch, počet sloučených packetů, velikost replay a skutečně odsimulované kroky/fillery, před/po pozice, před/po render pose, resyncReason, request ID. Délka od posledního motion není RTT.
- **RTT probe:** autentizovaná room zpráva echo s omezeným číselným nonce a lokálním monotónním t0; měřit t1−t0 na stejném klientu, nejvýše1/s, server rate limit. Opožděné main-thread doručení patří do end-to-end hodnoty, ne čistého wire RTT. Samostatný veřejný HTTP endpoint není potřeba.
- **Server vlastní fronta:** depth/max, lastReceived/ack/lastAppliedTick, input age, accepted/rejected/late/duplicate/modeMismatch counts; v původním V10 zejména **idleTicksSinceAck** a explicitní důvod každého resync (`client-request`, `input-gap`, `input-backlog`, `server-clock-drop`, `respawn`, `join/reconnect`).
- **Server clock:** elapsed callback, steps, droppedSeconds, simulation CPU duration, accumulator remainder, motion/authority cadence; delší interval agregovat do min/mean/max/count. Na klient neposílat mapu ostatních hráčů.
- Normal authority již chodí20Hz; malé čítače lze připojit a agregovat do recorderu v jeho stávajících oknech, incident ponechat podrobně. Nezapisovat celý svět ani každou historii každého inputu neomezeně.

## 5. Rozdělení implementace

První etapa koordinátora: opravit měření, frame sender, kompatibilní serverovou telemetrii, získat baseline. **KEY-7 tím není hotový.** Druhá etapa mění časový protokol i všechny wire fixtures společně.

Navržené rezervace druhé etapy: `shared/netcode.ts`, `shared/types.ts` pouze pokud je zde nutný základní wire typ, `server/index.ts`, samostatné `client/network-input-buffer.ts` a `client/network-timeline.ts`; testy `network-input-buffer`, `network-timeline`, `netcode`, `input-backlog`, `prediction-replay`; `scripts/integration.ts`, `integration-network.ts`, `integration-input-backlog.ts`, `integration-respawn.ts`. Root ponechá integraci `client/game.ts`, `client/ui.tsx` a domluvené fixture změny. Žádný z těchto souborů tento analysis task nemění.

Nestačí navýšit buffer/hard correction threshold, držet poslední throttle donekonečna, zmrazit serverové auto, ani nahradit měření tvrzením, že síť „by měla být stabilní“. Přijímací testy musí dokázat shodu časových os a praktický výsledek.
