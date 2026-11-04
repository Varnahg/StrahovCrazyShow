# Předání: repair-network-v11-server

- Vlastník: `repairs-network-v11-01a13624`; příjemce: `repairs-01a13624-root`.
- Checkout/větev/základ: `C:/Users/rezac/Documents/GitHub/StrahovCrazyShow`, main, `91ee88f0aaa902c79fad589aeb84bc086a66c9ea`.
- Výsledek: V11 server zapojený do plánované epochové queue, autoritativní UTC tick clock, bezpečný epoch respawn, priority sender a společné regrese. Root souběžně integruje Game/UI. **Dokončení KEY-7 se tím neprohlašuje; skutečná SDK a produkční přejímka patří rootu nad wave2.**
- Změněné soubory: `server/index.ts`, `server/respawn.ts`, `shared/netcode.ts`, `shared/network-diagnostics.ts`, `shared/input-timeline.ts`, `client/network-input-buffer.ts`, `tests/network-input-buffer.test.ts`, `tests/network-diagnostics.test.ts`, `tests/input-timeline.test.ts`, `tests/input-backlog.test.ts`, `tests/server-respawn.test.ts`, nový `tests/timeline-sender.test.ts`, tento handoff. `tests/netcode.test.ts` byl přidělený a spuštěný, ale nebylo nutné jej měnit.
- Převzatý WIP: root výslovně předal zpět vlastní výsledky transport-timing a primitives, včetně původního automatic-diagnostics-storage serverového handleru. Claim adopt-dirty převzal8 existujících dirty cest; jejich diagnostické chování zůstalo zachované. Cizí game/UI, renderer, SDK scripts ani zmrazený wave1 nebyly tímto agentem měněné.
- Delegace: šest SDK scripts cest, `tests/timeline-client.test.ts` a vlastní handoff byly koordinátorem vyjmuty do disjunktního tasku `repair-network-v11-sdk`. Podagent dokončil6/6 helper testů a scoped TypeScript; [samostatné předání](repair-network-v11-sdk.md). Potvrdil konec zápisů i uvolnění claimu.
- Podklady: [kauzální analýza](../../performance/repair-network-cause.md), předání transportu/primitives, aktuální server/recovery/physics kód, zmrazený `.cache/playtest-repairs-validation/wave1-integration.log`. Ten stále dokládá původní timeout `D turns the real front wheels right`; nebyl smazán ani přepsán. Změna producenta drží ovládání průběžně při podmínce; samotný timeout neprokazuje jedinou příčinu a znovu se musí ověřit skutečným SDK během.
- Refaktoring: FixedStepClock sdílí jeden plán kroků/dropu s předběžným hookem; TimelineSimulationClock drží jeden UTC okamžik pro sim.tick, authority i motion. UTC se počítá z celočíselného ticku a součtu dropped času, takže se neakumuluje zaokrouhlení při opakovaném přičítání16,666ms k velkému timestampu. Epoch reset serveru sjednocuje queue a veřejný ack. Stará FIFO třída zůstává pouze pro historické regresní porovnání, online server ji nepoužívá.
- Ověření: `pnpm exec tsx --test tests/server-respawn.test.ts tests/network-input-buffer.test.ts tests/network-diagnostics.test.ts tests/input-timeline.test.ts tests/input-backlog.test.ts tests/netcode.test.ts tests/timeline-sender.test.ts` dne13.10.2026 kolem21:45 Europe/Prague, **35/35**, exit0,6,635s. Následná přesnost UTC přidala jednu regresi; cílené `tests/input-timeline.test.ts tests/timeline-sender.test.ts` **9/9**, exit0,0,986s. Cílený TS createProgram nad13 přidělenými moduly/testy a závislostmi, stávající tsconfig/noEmit: **0 diagnostics**. Diff check tracked integračních souborů bez chyb. Celou sadu/build/integraci zde nikdo nespouštěl.
- Konkrétní důkazy: původní sender cadence bez priority skutečně ztratí nový jump při opožděném rebase, opravená varianta jej aplikuje jednou v tick14. Společný sender/timeline/queue scénář přiRTT200ms, jitteru,15FPS a druhé epoše má jeden jump na epochu, pokračující držený pohyb,0 late po zahřátí,0 overflow. Clock-drop test zahodí staré pending jumpy před8 skutečnými kroky v aktuálním UTC okně; poté nová epocha začínáack0. Skutečné Rapier respawn testy prošly pro invalidní NaN/Infinity fyziku, zachování veřejné identity a ochranu vozidla jiného řidiče.
- Procesy/zdroje: všechny vlastní CPU/CLI/typecheck procesy skončily; žádný server, port, GPU nebo build spuštěn. Root vlastní heavy-validation a produkční snapshoty. Žádný cizí proces ukončen.
- Rezervace: po předání uvolněna; runtime a testy již neměním. Root může zmrazit stabilní wave2 včetně SDK podagenta, který rovněž skončil.

## Finální V11 kontrakt

`PROTOCOL_VERSION=11`; připojení s10 se odmítá existující auth kontrolou. `Authority` povinně obsahuje `inputEpoch,inputTickBase,tick,ack,receivedSeq,time,state`; volitelně `resync,resyncReason,respawn,network`. Platí **ack=tick−inputTickBase**, nezávisle na počtu přijatých příkazů. `time` je UTC stejného posledního skutečného sim.tick. `TimelineInput` musí obsahovat epochu; server neprovádí V10 fallback a neodstraňuje epochu před kanonizací.

Server přijímá nejvýše8 příkazů v paketu,90 input paketů/s. Queue přijme nejvýše16 budoucích kroků; staré, neplatné, duplicitní, příliš vzdálené nebo cizí epochy pouze odmítne a změří. Chybějící krok je neutral, nikoli hromadný resync. Každý world tick má nanejvýš jedno řízení daného aktéra; fyzika se nikdy nezrychluje kvůli burstu.

Epochy vydává monotónní room counter, takže **nová epocha musí být větší, nemusí být přesně původní+1**. Join vytváří queue s base=currenttick. Explicitní client recovery, respawn a server-clock-drop vytvoří novou epochu/base=currenttick/ack0; stará in-flight řízení nemohou působit po resetu. Ostatní hráči se neresetují kvůli individuálnímu recovery. Clock drop je globální chyba společného serverového času, proto zde reset epoch dostanou všichni.

`FixedStepClock.advance(elapsed, step, beforeSteps?)` má nový volitelný hook s immutable pohledem `{steps,dropped}`. Počet/timestep maximálně8 skutečných kroků zůstává původní. `TimelineSimulationClock` před kroky zahrne dropped wall time do UTC osy. Server před nimi zahodí původní pending vstupy, simuluje skutečné kroky a potom vydá epoch bariéru. Žádný neodsimulovaný čas se nezamaskuje pouhou změnou timestampu existujícího stavu.

`respawnServerPlayer(sim,player,queue,{inputEpoch,tick,time})` vyžaduje připravenou novější epochu a UTC simtime. Před opravou nikdy nečte poškozenou pozici auta; používá existující safe recovery a nezasahuje vozidlo cizího řidiče. Authority je okamžitá s markerem `respawn:true`, novou epochou a správnou přítomností.

## Sender a diagnostika

`FrameInputBuffer.reset(reason,{priority:true})` umožní první úspěšný flush bez čekání na33ms cadence. **Rolling limit60 paketů/s přežije i tento reset**; priority nelze zneužít k neomezenému transportu. Další běžné packety zůstávají pod původní cadence/pressure pravidly. `acknowledge(ack)` odstraňuje odeslané timestampy i neodeslané queued příkazy seq≤ack; měří `expiredQueuedInputs`. Root musí nejdřív ověřit přijetí authority správné epochy a až potom předat ack senderu.

V11 `.network.queue` má `resolution:"scheduled-tick"`, epoch/tick/frontiers, depth/maxDepth, accepted/consumed, idleTicks/idleTicksSinceInput/lastAppliedTick, modeMismatchTicks, resets/discarded, vstupní stáří a `rejected:{invalid,epoch,late,ahead,duplicate}`. Společný typ připouští i starý diagnostický tvar pro historické záznamy; zúžení pomocí `resolution in queue`. Authenticated own-room probe1/s a absence nového veřejného presence/HTTP endpointu jsou zachované.

## Omezení před přejímkou

Primitivní planner doložil RTT0–200ms; nad jeho delivery budgetem vrací explicitní `latency-budget`. Není to řešení libovolně vzdáleného/chybujícího transportu. Nesmí se automaticky pokládat každý resync nebo každý RTT spike za internetový výpadek. Plná hra musí potvrdit steering/A–D projekci, replay/correction četnost, interakce, respawn, guest hranici a výkon. Root ve wave2 ověří také svůj úplný fyzikální exact comparator; tento serverový task jej neupravoval.

## Úzký manifest 2026-10-13T19:48:51.022Z

SHA256 `JSON.stringify` pole `{path,sha256}` v uvedeném pořadí: `1f33f621780a38f934e2d19f379e050c748b6adefcc106f5c664c342fdb98168`. Obsahuje relevantní testy, není otiskem celé produkční hry.

| Soubor | SHA256 |
|---|---|
| server/index.ts | c6878dad98fdea9c525e021ed5bf1c864465aa558b66804d5fc34a666053ccfe |
| server/respawn.ts | e424a0fcd85d0fb7804f77a4357c0669e16265fa6dc44a0561bdf753d63bdea0 |
| shared/netcode.ts | b92ae0f5937e58e14baf954ef06109c88e7a365e56b87afea371b901a624b532 |
| shared/network-diagnostics.ts | 77c95f08fdf6018a34c0f8748a2ae964daab5daa4744b4838dd76433bae5b368 |
| shared/input-timeline.ts | 8d9d46f22550157639aeb7f3e4f23e0f88aa9f45416944062d1d5c9c28ab767f |
| client/network-input-buffer.ts | 10b78181fb3355b5ea83d97284f6eb1b5946aed214595ab99d2d49b7debbb45c |
| tests/network-input-buffer.test.ts | 1dfc5e128a1992cb872c5396beaf72af6864dcef42d7bc44d6b22f9b0b44803d |
| tests/network-diagnostics.test.ts | db65856bae43c7a632228009f14037e9e30ca646e4060603d80fe6d26af2c23a |
| tests/input-timeline.test.ts | 49531fc2614c44411db6325a5ee6aa1f44ec1105bbb3775cc19eb9fd9bb07298 |
| tests/input-backlog.test.ts | a845c94b17cbc6e9ff196f8b55d754b48d723e53aa62425576272dd4a651d3e1 |
| tests/netcode.test.ts | 3306794c3d323aaa73ea70fd44312cad9d745efdeaf1957d684b718b13bec621 |
| tests/server-respawn.test.ts | 224f930cf47828962426b3851829799e74d04ebbc6968f0e98c004ad1c962a63 |
| tests/timeline-sender.test.ts | b3ca6511382f125833e49f5ba52efb1d4f45a581b7890e0754503e2eaa8f7db5 |
