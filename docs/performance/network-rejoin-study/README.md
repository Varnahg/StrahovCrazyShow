# K3: odpojené kohorty a noční resynchronizace

Hypotéza, že server po odpojení ponechává 30 minut fyzické aktéry a vytváří neviditelné kolize, se **nepotvrdila**. Zdroj i praktický test fyzikálních zdrojů ukazují okamžité odstranění aktéra. Nočních 58 resynchronizačních flagů je silně podpořeně spojeno se zásekem serverové smyčky a globálním catch-up limitem; přesnou příčinu záseku nelze z těchto dat určit.

Rozsah je vyšetřovací. Produkční server, pravidla drop/resync ani síťový harness nebyly změněny. GPU měření nebylo spuštěno.

## Stejný nezměněný zdroj

Zkoumaný snapshot K3: `e91aa84ec7d77949b2db706091fa66c603777faa13daa8ed998ff0871b390c9b`. Kontrola SHA-256 potvrzuje shodu aktuálního a zmrazeného `server/index.ts`, `shared/simulation.ts`, `shared/netcode.ts` a `scripts/performance-network.ts`.

Server `onLeave`:

1. Uloží obyčejný serializovaný `ActorState`; pozice se kopíruje, nejde o referenci na Actor/body.
2. U řidiče zajistí vystoupení a zaparkování.
3. Okamžitě odstraní connection, zavolá `sim.remove(id)`, odstraní player a input queue.
4. Pro případ pozdější obnovy zachová pouze dočasnou relaci/profil/savedState s expirací 30 minut.

`Simulation.remove` odstraní handle z `walkingColliders`, nativní rigid body s jeho colliderem, nativní character controller a záznam v `actors`. `onJoin` případně vytváří nového aktéra a obnovuje savedState do něho. Uchování relace tedy neznamená uchování fyzického těla.

## Praktický důkaz počtů fyziky

`.cache/network-rejoin-study/physical-lifecycle.ts` používá skutečný zmrazený K3 `Simulation.add/remove/Actor.restore` a Rapier, bez náhradní simulace. Tři cykly přidaly a odstranily po 29 aktérech a vždy následně obnovily jednoho aktéra z uloženého stavu.

| Stav v každém cyklu | Actors | Rigid bodies | Colliders | Character controllers | Walking handles |
| ------------------- | -----: | -----------: | --------: | --------------------: | --------------: |
| Před připojením     |      0 |           25 |     9 343 |                     0 |               0 |
| Po přidání 29       |     29 |           54 |     9 372 |                    29 |              29 |
| Po odstranění 29    |      0 |           25 |     9 343 |                     0 |               0 |
| Po obnovení jednoho |      1 |           26 |     9 344 |                     1 |               1 |
| Po jeho odstranění  |      0 |           25 |     9 343 |                     0 |               0 |

Každý původní body/collider handle byl přímo vyhledán a po odstranění vracel null; každý původní controller byl nepřítomný v Rapier setu. Všechna tři obnovená `ActorState` byla přesně shodná s uloženými. Základních 25 těl patří světu před přidáním hráčů, nikoli odpojeným aktérům.

Výsledek **PASS, exit 0, přibližně 2,9 s** je v `.cache/network-rejoin-study/physical-lifecycle.json`. Tento test ověřuje skutečný fyzikální lifecycle, nikoli SDK/Colyseus callback invocation. Volání `sim.remove` z `onLeave` bylo ověřeno přímo ve stejném serverovém zdroji. Na běžící backend 2575 tento test nesáhl.

## Co znamená resync v těchto měřeních

Výkonnostní SDK harness nepoužívá klientskou predikci a neposílá klientskou zprávu `resync`. Počítá přijaté `authoritative.resync` flagy. Není to měření počtu kolizí nebo automatický důkaz prediction divergence.

Server takový flag posílá při prvním joinu, při explicitním resync/sequence-gap požadavku nebo všem klientům, když `FixedStepClock` kvůli zpoždění zahodí část catch-up času. Join nastává před warmup a nahráváním; vstupy testu mají po spolehlivém uspořádaném WS transportu průběžná sekvenční čísla.

`FixedStepClock` dovolí nejvýše osm 60Hz kroků v jednom callbacku. Při přebytku zahodí celé další kroky. Server potom resetuje všechny input queues a v nejbližším motion cyklu pošle `resync = true` všem klientům. Tento mechanismus zůstává zachovaný; odstranění flagu za účelem vykázání nuly by pouze skrylo incident.

## Day/night data a časová korelace

Oba běhy používají backend 2575, společný world `7BJfrdt5S`, stejný K3 zdroj a stejný harness SHA `8e98ef8b8c5f3b322d485ca6355e855bf23055862d678a77474a85b98c825a16`.

- Day: 600,01 s, min=max 30 motion rows, 29 pohybujících se SDK relací, 60,000 tick/s podle serverového času, 0 resync, 0 hlášených chyb.
- Night: 180,00 s, min=max 30 rows, 29 pohybujících se SDK relací, 59,947 tick/s, **58 resync**, 0 hlášených chyb.

Noční incident je soustředěný kolem **11. 10. 2026 08:08:32 UTC**:

- Paket v 08:08:32.758 má serverovou mezeru 347 ms a přijímací mezeru 365,928 ms; tick delta 9 reprezentuje 150 ms simulace.
- Následující paket v 08:08:32.900 má serverovou mezeru 142 ms a tick delta 8, tedy 133,333 ms simulace.
- Po přechodné fázi se ustálený rozdíl wall time proti tick time zvýšil přibližně o 150 ms, tedy devět 60Hz kroků. Celkové noční okno má 179 958 ms serverového času proti 179 800 ms tickového času; zbytek zahrnuje běžnou fázi/zaokrouhlení koncových paketů.
- Nezávislá nemodifikující Node telemetry v 08:08:33.333 zaznamenala **event-loop max 218,759 ms** a p95 69,337 ms v daném přibližně sekundovém okně.
- 58 flagů odpovídá dvěma globálním oznámením pro 29 sledovaných klientů. Největší zaznamenaný ack lag monitoru byl 20 příkazů, pod limitem queue 64.

Tato shoda podporuje vysvětlení dvěma globálními catch-up drop událostmi během záseku a následného dohánění. Raw harness však neukládá čas každého resync flagu ani důvod jednotlivého serverového callbacku, proto přesné přiřazení všech 58 flagů konkrétním callbackům zůstává **inference**, nikoli přímý trace. Časový rozdíl jednoho motion paketu navíc může zahrnovat právě probíhající práci serveru a následný catch-up; nesmí se bez dalšího zaměnit za přesný počet zahozených kroků.

Raw evidence jsou `network-29-gpu-day.json`, `network-29-gpu-night.json` a `server-telemetry.jsonl` ve zmrazeném K3 adresáři. Metadata/hash, největší mezery a vybrané telemetry řádky jsou v `.cache/network-rejoin-study/gap-audit.json`.

## Zbývající nejistota

Telemetry neodlišuje GC pauzu, dlouhý callback, synchronní práci a plánování CPU hostitelským OS. Z těchto dat proto nelze konkrétní příčinu 218,8ms záseku prohlásit za opravený bug, ani tvrdit bezchybný noční síťový běh. Při dalším cíleném měření by pomohly časově označené authority resync důvody a neinvazivní GC/event-loop trace. Pro tento nález není podklad pro změnu fyzikálního odpojování nebo zatajení resynců.

Následná kontrola CPU: v předchozích 30 přibližně sekundových telemetry oknech byl medián CPU 204 ms, p95 439 ms a maximum 514 ms. Incident měl 423 ms CPU za 1 024 ms, tedy nevybočil nad předchozí CPU p95, přesto event-loop maximum vzrostlo z předchozího maxima 41,19 ms na 218,76 ms. Heap mezi sousedními vzorky klesl přibližně o 8 MB; bez GC trace to není důkaz délky nebo příčiny konkrétní GC pauzy. **Process ELU se nesbíralo** a CPU procento se za ELU nevydává. Souhrn je `.cache/network-rejoin-study/telemetry-summary.json`.

Serverové počasí používá asynchronní fetch s 7s timeoutem a deduplikovanou pending promise. Pět minut je pouze cache TTL; nový fetch spouští příchozí `/api/weather` požadavek, nikoli pětiminutový serverový timer. Klient se dotazuje po minutě. Parsing přijatého modelového JSON a station HTML je synchronní, ale skutečné HTTP časy, body sizes ani jejich korelace s incidentem se nezaznamenávaly. V serverovém kódu není periodický subprocess/spawn/exec ani synchronní načítání modelů při obnově počasí. Další housekeeping běží po 30 s, transit používá sdílená již importovaná data. Nebyla nalezena atribuovatelná aplikační chyba nebo doložená pětiminutová příčina.

Noční GPU okno **08:08:31.84–08:08:41.85 UTC incident obsahovalo**. Jeho výsledky tedy patří k reálnému společnému Windows stroji se zachyceným event-loop zásekem a následnou resynchronizací, nikoli k běhu bez resync. Omezení hostitelského plánování/GC/sdíleného zatížení musí při interpretaci zůstat uvedené; konkrétní původ se z dostupného záznamu nerozlišil.
