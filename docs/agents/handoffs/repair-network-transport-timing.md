# Předání: repair-network-transport-timing

- Vlastník: `repairs-network-transport-01a13624`; příjemce: koordinátor `repairs-01a13624-root`.
- Pracovní kopie/větev: `C:/Users/rezac/Documents/GitHub/StrahovCrazyShow`, `main`; výchozí HEAD `91ee88f0aaa902c79fad589aeb84bc086a66c9ea`.
- Výsledek: implementován kompatibilní V10 sender a serverová telemetrie s cílenými testy. **Integraci do game/UI provádí root; KEY-7 zůstává neopravený do další etapy časového protokolu.**
- Změněné soubory: `server/index.ts`, `shared/netcode.ts`, `shared/network-diagnostics.ts`, `client/network-input-buffer.ts`, `tests/network-input-buffer.test.ts`, `tests/network-diagnostics.test.ts`, tento handoff.
- Převzatý WIP: výslovné předání rootem zahrnovalo původní `server/index.ts` změnu z automatic-diagnostics-storage (import handleru a jeho připojení na HTTP). Claim `--adopt-dirty` převzal právě tento jeden soubor. Původní diagnostický handler i jeho zapojení jsou zachované. Jiný WIP nebyl upraven.
- Podklady: [kauzální analýza](../../performance/repair-network-cause.md), vlastní skutečný kód a zmrazený uživatelský log uvedený v analýze. Proto serverové kroky/fyzika a PROTOCOL_VERSION10 zůstávají beze změny.
- Refaktoring: sender centralizuje frontu, deduplikaci, lifecycle, časování, tlakové odeslání a recovery čítače v jednom modulu; nevytváří vlastní časovač. Serverové snímky sdílí `captureNetworkDiagnostics`; InputQueue měří stávající přechody, nemění jejich fyziku. Nové samostatné soubory jsou formátované; společné soubory nebyly plošně přeformátované.
- Ověření: finální `pnpm exec tsx --test tests/network-input-buffer.test.ts tests/network-diagnostics.test.ts tests/input-backlog.test.ts tests/netcode.test.ts` dne13.10.2026 kolem20:41 Europe/Prague, exit0, **21/21**, 3,957s. Skutečný Rapier ve stávajících regresích stále zachovává fyziku. Cílený TypeScript `createProgram` nad šesti změněnými moduly/testy a jejich závislostmi, se stávajícími tsconfig options a noEmit: **0 diagnostics**, exit0. `git diff --check` pro oba upravené tracked soubory bez chyb.
- Procesy: všechny CLI/testové/typecheck procesy skončily; žádný server/GPU/port/heavy-validation spuštěn. Live-dev i produkční baseline jsou původním vlastníkům.
- Omezení: probe wiring má zde statický test vlastního autentizovaného room reply + dynamický test nonce/rate policy. Skutečnou SDK komunikaci a guest boundary musí ověřit koordinátor v izolované integraci. Nová diagnostika přidává metadata do20Hz authority; její skutečnou režii je nutné zahrnout do produkční přejímky. CPU test senderu nesimuluje scheduler Edge ani síťový RTT.
- Rezervace: po tomto předání uvolněna. Root přebírá výsledky a aktualizuje stav tasku/Linear/docs verification.

## API pro zapojení rootem

```ts
const sender = new FrameInputBuffer({
  now: () => performance.now(),
  canSend: () => /* own multiplayer room connected, not respawnPending */ true,
  send: (inputs) => room.send("inputs", inputs),
  onOverflow: (snapshot) => { /* log snapshot + request one V10 resync */ },
  onSendError: (error) => { /* report transport failure */ },
});
sender.enqueue(input);             // Game.onInput
sender.flush("frame");            // after simulation loop, before scene render
sender.flush("timer");            // existing 30Hz fallback timer, optional
sender.acknowledge(authority.ack);  // before applying a possible forced reset
sender.reset("forced-authority"); // prediction reset, respawn, mode/room change
sender.snapshot();                 // own diagnostic context
sender.dispose();                 // disconnect/component cleanup; new room=new instance
```

`canSend` kontroluje i guest/mode hranici; modul při false neakceptuje nové vstupy a nic neodesílá. Root musí při změně room/disconnect explicitně resetovat/dispose frontu, aby příkazy předchozí room nemohly přežít do nové.

Běžná kadence je nejvýše30 paketů/s (min interval33,333ms). Tlak osmi čekajících příkazů tuto kadenci obejde, **ale nikdy nepřekročí60 paketů v klouzavé sekundě**; paket má nejvýše8 příkazů. Dva tlakové pakety mohou jít v jednom pomalém snímku: zákaz tohoto případu by omezil propustnost při méně než7,5FPS na méně než60 vstupů/s. Rate budget přežije reset, aby resync storm nemohl obejít limit. `send` failure zachová pořadí; abnormální queue65 má explicitní overflow/reset callback. Normální 60Hz produkce ve frame frekvencích **1/5/10/15/30/60/144FPS**, zcela bez timer callbacků, v testu doručí všech180 sekvencí a má maxqueue8. To neznamená, že původní V10 server při doručeném velkém opožděném burstu přestane dělat backlog resync.

Timestampy odeslaných nepotvrzených vstupů jsou omezené180 položkami; vyřazení měření přiznává `evictedUnacked`. Samotné vstupy se z tohoto důvodu neodesílají znovu ani nemění. Snapshot rozlišuje queue/inflight/frontiers, poslední a maximální timer/send interval, stáří vstupů a příčinu resetu.

## Server/wire

- `Authority.network?: { queue, clock }`, `Authority.resyncReason?` jsou volitelná přídavná pole; protokol zůstává10 a význam ack/fyziky se nemění.
- Queue měří current/max depth, ack/receivedSeq, age nejstaršího inputu, `lastAppliedTick`, `idleTicksSinceAck`, accepted/consumed/duplicate/gap/capacity/reset/discard čítače. Extra mapka časů je omezena kapacitou původní fronty64.
- Clock má aktuální callback elapsed/CPU/steps/drop/accumulator a celoživotní mean/max/drop souhrn v konstantní paměti. CPU zahrnuje simulation/store práci před odesláním motion, nikoli serialization a send. Tuto definici při analýze zachovat.
- Všechny současné forced reply cesty mají reason: `client-request`, `input-gap`, `input-backlog`, `server-clock-drop`, `join`, `respawn`.
- Autentizovaný vlastní room dostává echo `networkProbe`: žádost `{nonce:number}`, odpověď `{nonce,serverTimeMs,serverTick}`. Nonce musí být safe nezáporné celé číslo; na identitu platí rate1/1000ms. Odpověď jde jen žádajícímu připojenému client objektu s vlastní input queue. Žádný nový HTTP endpoint ani broadcast.
- Klient má měřit RTT vlastním t1−t0; serverTimeMs nesmí odečítat od performance.now. RTT je end-to-end včetně případného zpoždění doručení na hlavním vlákně. Koordinátor dodá klientský probe lifecycle a recorder zapojení.

## Povinná následující etapa

V10 pořád při prázdné queue posouvá auto serverovou fyzikou se stejným ack; sender a telemetrie **neopravují** tuto časovou chybu. Následuje [navržený tick/epoch kontrakt](../../performance/repair-network-cause.md): seq jako simulační krok uvnitř epochy, ack podle vyřešeného serverového času, pozdní vstupy expirují, jeden vstup/tick, omezený klientský předstih včetně skutečných filler kroků a rebase po dlouhém stall. Aktualizovat všechny SDK producers a regresní scénáře společně, zvýšit aktuálně ověřenou verzi10. Test této kompatibilní etapy verzi10 záměrně hlídá; při úmyslném přechodu test odpovídajícím způsobem změnit.

## Úzký manifest 2026-10-13T18:41:45.118Z

SHA256 `JSON.stringify` uspořádaného pole `{path,sha256}` níže: `16206d8021a0ac0cce429f99f376070d007b0d42a89f8c6f6be94da5de66ae71`. Zahrnuje změny a spuštěné testy, není identitou celé produkční hry.

| Soubor | SHA256 |
|---|---|
| server/index.ts | 736411738478b680bd5b3343eca6fff917e5a41613e39652f715a8035149fcc7 |
| shared/netcode.ts | 4904f4ae66894049d8daa0725e930de0ed44d8830d149f7cdb73009b859be57f |
| shared/network-diagnostics.ts | 9a9cfabea09f9753eba548f674cf6dbd25b53305b831c9cf6ff762f62b5cae76 |
| client/network-input-buffer.ts | 3a82ac8a5d3cd0931b6003f0f2f04802fd3200e3be5fc73572a7b9e6e442602d |
| tests/network-input-buffer.test.ts | 125afd2503e712113240ab5f2f61e40a330bd8d6c9011ea36ecf0e8bb0610ac7 |
| tests/network-diagnostics.test.ts | 0ad794d60296b4d93f2c88f15ab851c75ceb7f3ab22af654f7a0907bc68b3644 |
| tests/input-backlog.test.ts | 28780156695aa7bbf89f1948bdf1034e595c0b871cf65719f070ffa18c40d093 |
| tests/netcode.test.ts | 3306794c3d323aaa73ea70fd44312cad9d745efdeaf1957d684b718b13bec621 |
