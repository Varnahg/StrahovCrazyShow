# Síťový audit skutečného browserového běhu wave2

Audit 13. 10. 2026, task `repair-live-network-audit`, pouze čtení runtime. V11 odstranilo přetékání lokální fronty, ale skutečný browser odhalil tři další chyby: kolizi probe timeru se serverovým limitem, použití RTT zatíženého hlavním vláknem jako fyzikálního odhadu a přepis odhadu serverového času opožděnou authority. Samostatně se zbytečně aplikují desítky starých authority před jedním vykreslením.

## Rozsah a spolehlivost důkazů

- Záznam `.cache/playtest-repairs-validation/wave2-session.jsonl`, SHA256 `501e33fdf9a60732616036cd70f636573b840b10f146c733294184201ab68bb3`, relace `73cddded-7359-406d-b622-2c13e0f5b26b`.
- Header uvádí build snapshot `c3c8164a48f1ac9e02fbf57c4d46c6b67fdfd5ed9c71e817d76d125efdb1a3de`. Příčinné reprodukce importovaly přímo moduly z `.cache/performance-snapshot/playtest-repairs-wave2/`. Při začátku auditu byly Game/UI/timeline/sender/server/rate helper v working tree bajtově shodné s tímto snapshotem; audit není závislý na dalších souběžných editacích rootu.
- Uloženo **1 819 událostí**, seq0…2595, přesně **777 chybějících seq**, žádné duplicity. Poslední `recording-gap.droppedTotal=777` to nezávisle potvrzuje. Tuto neúplnost řeší vlastní task recorderu. Nelze z nepřítomnosti události vyvozovat, že se nic nestalo.
- Existuje46 zachovaných probe odpovědí,26 timeoutů,6 `network-timeline-wait` a7 `network-correction` událostí. Finální kontext z466171,3ms obsahuje8838 authority,498 reconcile operací,476 resetů senderu,505 late vstupů,17 old-epoch odmítnutí,1 ahead odmítnutí, **0 overflow** a6 resync.
- **498 reconcile operací není498 tvrdých skoků.** Šest zachovaných forced correction událostí má skutečný naměřený posun0; sedmá má2,701m a `modeChanged:true`,172,4ms po explicitní interakci s `vehicle:true` (výstup z auta). Ani tuto legitimní změnu režimu nelze vydávat za nevyžádaný teleport. Další velké korekce nelze potvrdit nebo vyloučit v chybějících událostech.
- Sender vyrobil24733 vstupů, odeslal24731, pouze2 neodeslané expirovaly po ack. Max lokální queue8. Reset counter tedy neznamená476 zahazování drženého ovládání ani476 overflow. Serverové kumulované čítače ukazují24203 přijatých,505 late,17 old-epoch a1 ahead; rozdíl proti odeslaným představuje několik vstupů ještě v letu v okamžiku vzorku.

## 1. Probe timeout často znamená tiché odmítnutí naším rate limiterem

UI volá `setInterval(...,1000)`. Pokud není pending nonce, odešle sondu. Pokud odpověď nepřijde, čeká10s a teprve pak ji nahradí. Server ovšem přijme pouze1 probe za přesné klouzavé okno1000ms přes `store.rate` a odmítnutí neoznamuje.

Skutečné callbacky časovače nemají přesný odstup. Po později vykonaném callbacku může další původní timer fáze přijít dříve než za1000ms. Stačí955ms a server sondu odmítne; UI potom deset sekund čeká na odpověď, kterou server úmyslně nevytvořil. [HTML Standard](https://html.spec.whatwg.org/multipage/timers-and-user-prompts.html) negarantuje přesné termíny timerů; konkrétní kratší odstupy zde dokládá přímo log.

Čas odeslání úspěšné sondy se rekonstruuje jako `event.atMs − roundTripMs`; čas pending sondy z timeoutu jako `timeout.atMs − pendingMs`. Serverový timestamp odpovědi se u tohoto localhost běhu převádí pomocí `timeOrigin`. S přesností přibližně1ms:

| Timeout seq | Odeslání pending sondy | Od předchozího serverového probe timestampu | Následující čekání |
|---|---:|---:|---:|
|130|16125,3ms|990,1ms|12460ms|
|186|31373,4ms|954,2ms|10015,7ms|
|332|76438,2ms|863,0ms|10947,4ms|
|461|91418,3ms|989,1ms|10959,7ms|
|1686|317401,5ms|999,3ms|10002,7ms|

U **23 z26** timeoutů je tento odstup863–999,3ms. Je to silný přímý důkaz kolize s limitem; přesný okamžik přijetí odmítnuté sondy server nezapisuje, proto se odmítnutí každé jednotlivé sondy netvrdí jako dokonale změřené. U zbývajících3 chybí mezilehlé odpovědi v neúplném logu, takže příčinu nelze přiřadit.

Spuštěná in-memory reprodukce přímo s frozen `consumeRate(...,1,1000,now)`:

```text
now(ms)   0      995     10995   11990   21990
accepted  true   false   true    false   true
```

**Oprava:** jeden pending a další sonda nejdříve1050ms **po přijetí odpovědi**, nikoli v původní fázi intervalového timeru. Z kauzality plyne, že server minulou sondu zpracoval před tímto přijetím; nový cooldown proto nejde zkrátit doručovacím jitterem. Zachovat serverový limit, nonce validaci a guest hranici. Timeout musí uvolnit pending a následně dodržet vlastní retry/backoff. Volitelný serverový `probeRateLimited` čítač v own-session telemetrii odstraní zbývající nejasnost; veřejný endpoint není potřeba.

## 2. Čekání hlavního vlákna blokuje predikci jako údajná vysoká síťová latence

UI každou syrovou probe dobu okamžitě předá do `networkTimeline.setRtt`. Planner ji používá pro odhad jednocestného doručení a lead. Nad rozpočtem vrací `latency-budget`; Game potom jednou za sekundu žádá server o nový inputEpoch. Nová epocha ovšem RTT nemění.

| Událost | Raw RTT | Čas od serverového timestampu do klientského callbacku |
|---|---:|---:|
|probe seq51, callback16124,4ms|992,4ms|989,2ms|
|probe seq158, callback29986,7ms|1401,3ms|1401,5ms|

Serverový timestamp vzniká těsně před `c.send`; poslední sloupec zahrnuje serverový odchozí transport, návrat po síti a především případné čekání callbacku na klientu. Není to čistá doba browseru nebo čistý wire RTT. U **tohoto společného localhost hostitele** lze přímo srovnat časové domény; zaokrouhlení vysvětluje rozdíly pod1ms. Tento postup nelze bez kalibrace zobecnit na dva nesynchronizované počítače.

Všech46 zachovaných odpovědí má medián raw RTT66,1ms, minimum15,7ms, p95 174,4ms. Souhrnně přibližně99,57% naměřeného času leží **za serverovým timestampem**. Medián času před ním je kolem0ms, maximum14,2ms. Spolu s doloženými dlouhými render/init callbacky to vylučuje interpretaci startup992/1401ms jako změřené jednocestné síťové cesty. Jejich přímé použití ve fyzikálním rozpočtu je konkrétní chyba.

Game hlásí ready v25856,7ms, ale má uloženou předchozí kontaminovanou992ms hodnotu. Následují tři `latency-budget` události a tři zbytečné client-request resyncy; zdravější66,8ms vzorek přijde až30484,9ms. První context má0 vyrobených vstupů,0 serverem přijatých a již832 idle ticků. In-memory volání se skutečným frozen plannerem potvrdilo: setRtt(992.4) → waiting/latency-budget; nová epocha → **stále waiting/latency-budget**.

**Oprava:** oddělit vždy zaznamenaný `rawRoundTripMs` od hodnoty schválené pro predikci. Bounded `PerformanceObserver` pro longtask, včetně `takeRecords()` při přijetí reply, označí doložené překrytí měřicího intervalu dlouhou klientskou úlohou. Takový vzorek se zapíše s důvodem/overlapem, ale nepřepíše poslední použitelný odhad. Před-ready vzorek musí být označen a nesmí se po ready slepě znovu aplikovat. Bez pozorovaného klientského zdržení se skutečně vysoké RTT **nesmí clampovat do podporovaného rozsahu**. Měřit kvalitu, stáří a důvod přijetí/odmítnutí odhadu; chybějící longtask záznam není důkaz čisté síťové latence.

`latency-budget` samo o sobě není důvod měnit serverovou epochu: tím se fyzikální ani dopravní rozpočet neopraví. Oddělit čekání na vhodné měření od recovery zastaralého autoritativního stavu. První kalibraci provést automaticky bez uživatelského přepínače; zachovat explicitní nedostatek důvěry v odhad.

## 3. Opožděná authority vrací odhad serverového času zpět

`acceptAuthority` pokaždé nastaví `anchor=packet; receivedAt=čas callbacku`. `advance` pak odhaduje server z `anchor.ack + (now − receivedAt + RTT/2)`. Pokud dlouhý render zdrží callback starého paketu, jeho stáří se při callbacku zahodí. Starší fyzikální stav pak poslouží zároveň jako údajná aktuální serverová hodina. Odesílají se příkazy, jejichž serverový tick už proběhl.

Spuštěná minimální reprodukce ze skutečných frozen modulů:

1. Čerstvá authority ack100 v lokálním t0, RTT0; planner předpoví106.
2. Klient se na150ms zdrží. Server už odsimuloval109.
3. Dorazí opožděná authority ack103 a dostane nový `receivedAt=150`.
4. Současný planner cíluje109 a vyrobí **107,108,109**. Skutečný `TimelineInputQueue` všechny odmítne jako `late`.
5. Původní správný monotónní odhad serverových hodin by nyní znal109 a cíloval115:107–109 mají být pouze neutral doplnění času; čerstvé ovládání patří do110–115.

To není důvod znovu přijímat pozdní příkazy na serveru. Deadline rejection je správná ochrana proti přehrání starého času. **Oprava je v klientském odhadu:** oddělit state anchor pro restore/replay od monotónního clock anchoru. Opožděná zpráva může upřesnit stav a potvrzenou hranici, ale ve stejné epoše nesmí posunout už spolehlivě odhadnutý serverový čas zpět. Nová epocha/clock-drop musí hodinový anchor znovu založit. Zachovat limit future16, bounded replay a neutral prefix bez spotřeby nové jump hrany.

V logu505 late příkazů představuje přibližně2% odeslaných příkazů. Tento mechanismus je reprodukovaný a odpovídá shlukům po render zdržení, ale **původ všech505 jednotlivých příkazů nelze rekonstruovat** bez per-packet emit/receive/deadline telemetrie. Některé late jsou legitimním důsledkem skutečného stall. Server neposkytuje důkaz časového dropu: finální `droppedTotalMs=0`, max callback elapsed134,76ms, průměr vlastní CPU práce0,986ms. Šest zaznamenaných epochových resetů má důvod client-request, žádný server-clock-drop.

## 4. Browser přehrává celý backlog místo jedné potřebné opravy

UI nyní volá `Game.reconcile` pro každou doručenou běžnou authority. Pokud mezi těmito callbacky nebyl render/prediction krok, každé další ack je vyšší než `predictedSeq`: planner opět hlásí rebase a Game znovu čistí prediction/sender a obnovuje fyziku.

Spuštěná reprodukce: po inicializaci předpovědi6 doručit80 authority paketů (ack3…240) po4s bez vloženého frame kroku. Současný planner vyžádá **78 rebases**. Aplikace pouze posledního běžného paketu vyžádá **1**, přičemž finální timeline snapshot je přesně shodný.

V zachovaných kontextech sedm shluků kratších než1s obsahuje **376 ze476** resetů senderu a380 reconcile operací. Příklady:88 resetů za370,8ms při startupu;76 za166,1ms kolem201,94s;73 za107,3ms kolem450,32s. Hráč v těchto třech příkladech stojí. Tyto počty měří opakované zpracování backlogu, ne stejně mnoho vykreslených skoků.

**Oprava:** coalescing běžných authority před simulační částí frame. Uchovat skutečný `receivedAt` z onMessage. Forced resync/respawn a novou epochu aplikovat jako explicitní bariéry; nesmí zmizet marker čekajícího respawnu ani stará epochová data přežít za bariérou. Nejmenší bezpečné rozhraní ukládá nanejvýš jeden normální paket, zatímco bariéru předává okamžitě integrátorovi. Při příchodu bariéry se starý čekající normální paket odstraní.

## Navržené API, rozsah a přejímka

Root nadále vlastní Game/UI a jejich zapojení. Následující samostatný runtime task může vlastnit:

- `client/network-timeline.ts`, `tests/network-timeline.test.ts`, `tests/timeline-physics.test.ts`: samostatný monotónní clock anchor, zachované future deadlines, epoch reset, kontaminované RTT bez vypnutí predikce.
- Nové `client/authority-buffer.ts`, `tests/authority-buffer.test.ts`: `offer(packet,receivedAt)` → rejected / queued / immediate barrier; `takeLatest()` → nanejvýš1 normální authority před frame. Zachovat epoch, pořadí, respawn a původní čas přijetí.
- Nové `client/network-probe.ts`, `tests/network-probe.test.ts`: jeden pending, `poll({enabled,ready})`, reply cooldown1050ms, `receive(reply)` s raw RTT a kvalitou odhadu, bounded longtask observer/takeRecords, `snapshot()/dispose()`. Observer a requesty nesmějí vzniknout v guest režimu.
- Root může samostatně přidělit serverový rate-limited counter, pokud jej bude implementovat; nynější důkazy nevyžadují povolení většího počtu probe paketů.

Povinné regrese: časovač s callbacky0/995/10995ms; first-ready dlouhá úloha uvnitř probe intervalu; skutečná čistá vysoká latence bez clampu; stará authority103 doručená při reálném109 po dobrém100; backlog80 paketů→jedna normální aplikace; forced epoch a explicitní respawn uprostřed backlogu; známé RTT0–200ms,15–144FPS a nepravidelné hlavní vlákno; správně zachovaný jump po rebase se skutečným senderem. Potom nový reálný browser run s úplnými logy, oddělenými `stateRestores/timelineRebases/hardPositionCorrections/epochResets` a bez zaměňování těchto čítačů.

Tento audit runtime nemění. Opravy je nutné ověřit na celé produkční hře; původní chybějící777 záznamů se jejich implementací zpětně neobnoví.
