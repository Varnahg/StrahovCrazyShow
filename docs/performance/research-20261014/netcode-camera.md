# KEY-6/7/12: čas pohybu, síťová obnova a třetí osoba

Datum výzkumu: 14. 10. 2026. Autor: `research-01a13624-network-20261014`. Stav: rozhodovací podklad, bez implementace. Navazuje na nový postup v `AGENTS.md`. Příjemcem je koordinátor oprav; jednotlivé změny vyžadují samostatný scope, refaktoring, ověření a commit.

## Rozhodující výsledek

Není doložená jedna společná „chyba kamery“, která by vysvětlila vše. Jsou rozlišitelné čtyři řetězce:

1. **Prokázaná chyba prezentační fáze:** síťová simulace postupuje podle `NetworkTimeline`, interpolace podle nezávislého `Game.accumulator`. Lehký reproduktor se skutečným plánovačem a přesným interpolačním vzorcem hry vytváří neplynulý obraz konstantního pohybu bez chyb autority. Samostatná rychlá oprava tohoto kontraktu má nejlepší poměr jistoty a rozsahu.
2. **Prokázané změny horizontu:** jediný přijatý RTT vzorek mění lead po celých tickách. Zvětšení leadu okamžitě odsimuluje více času, zmenšení čeká. I při bezchybné síti tím vznikají skoky a pauzy prezentace. Oddělení času prezentace od předstihu příkazů je potřebné i po sjednocení fáze.
3. **Prokázané velké opravy po stallu / obnově:** ve skutečné relaci jsou metrové přesuny, zastarávání autority, epochové bariéry a více odpovědí na obnovu. Je nutné obnovu koordinovat jako jednu transakci, odlišit vyžádání čerstvého stavu od změny epochy a zachovat skutečný respawn. Samotné zvýšení vyhlazení neřeší časový rozpor.
4. **Prokázané vypnutí predikce po nejistém RTT:** šest vzorků 262–534 ms bez LongTask bylo přijato a vyvolalo stav `latency-budget`. Skutečná příčina jejich zpoždění není izolována. Nálepka „uncontaminated“ dnes znamená pouze „nenalezen překryv s LongTask“, nikoli čistou transportní latenci. Doporučena je opatrná časová politika s explicitní nejistotou a potvrzováním změny podmínek, ne clamp RTT.

Pořadí navazující práce: minimální potřebná telemetrie → oprava prezentační fáze a zachování viditelné kontinuity → politika změn leadu/RTT → řízení obnovy → až podle zbytkového důkazu vlastní kamera a dynamický rollback. KEY-7 ani KEY-12 zatím nejsou Done.

## Identita a kvalita důkazů

- Referenční uživatelský záznam: `.cache/playtest-repairs-validation/snapshots/wave3/.cache/game-diagnostics/07c227f8-d2f8-4011-a6f8-5d27ad0627a4.jsonl`.
- SHA-256 logu: `0ebf9512e10df06d94121358a57133885b7d0371b10d3b0b3027dbbce4b46dbb`.
- Produkční build: `0f20b5a7c7ba9ce5ab9aa16bba3b0a6886823152a322be2724fd2cdad41d6248`; obsah zdrojů: `bc0895080849c7c97fc292ab2eddeaac11e2e8461a38234d7a4178935aadc1d9`; základ Git `91ee88f0aaa902c79fad589aeb84bc086a66c9ea`. Dirty HEAD sám není identita tohoto buildu.
- 1 799 záznamů, seq 0–1798 souvisle; jedna hra, bez dispose či výměny zdrojů. Klient je produkční `http://127.0.0.1:4176/`, nikoli dřívější HMR relace na 5173. Praha: 14. 10. 00:10:31–00:19:56; převod je `timeOrigin=1791929431389 + atMs`, UTC+2.
- GPU v logu: GTX 1060 přes ANGLE/D3D11, CSS i interní rozlišení 2040×986, DPR 1,25. Žádné nové GPU měření se v tomto výzkumu nekonalo.
- Koordinátor 14. 10. ověřil, že dřívější procesy chybějí a porty 4176/2571/5173/2567 neposlouchají. Nová hraná relace není spuštěna. Výzkum nevstupoval do prohlížeče a nezapínal služby.
- Byte porovnání současných souborů s frozen wave3: shodné `client/{game.ts,ui.tsx,network-timeline.ts,network-probe.ts,authority-buffer.ts,network-input-buffer.ts}`, `shared/{netcode.ts,input-timeline.ts,simulation.ts,vehicle.ts,controls.ts}`, `server/index.ts`. Závěry z těchto cest se vztahují na skutečně hraný kód.
- Installed verze ověřené z package metadat: Babylon 9.30.0, Rapier 0.21.0, Colyseus SDK 0.18.5; serverový dependency pin Colyseus core 0.18.9. Wire kontrakt je V11 (`shared/netcode.ts:12`).

Log nemá každosnímkovou trajektorii renderované pozice, projekce a kolizních zásahů kamery. Malé opravy nemají jednotlivý event. Síťové timestampy označují aplikační callbacky; chybí timestamp příchodu bajtů do OS/browseru. Proto nelze zpětně rozdělit každý pozorovaný otřes mezi kameru, interpolaci, autoritu a animaci.

## Co skutečný test prokázal

| Důkaz z 07c | Interpretace a omezení |
| --- | --- |
| 306 restore/reconcile operací; 47 detailních correction eventů | Není to 306 skoků. Detail má 17 běžných oprav nad prahem a 30 vynucených. Zbylých 259 operací nemá individuální detail; zahrnují i malé/ nulové přesuny. |
| 30 resync: 23 `client-request`, 6 `server-clock-drop`, 1 `respawn` | Důvody nejsou zaměnitelné. 32 wait eventů: 19 stale-authority, 3 prediction-budget, 10 latency-budget; poslední kategorie již neposílá resync. |
| 00:13:48.958, seq 778: 10,939 m, client-request, epoch 16 | Největší změřená nechtěná oprava. Před ní je 1,079 m v epoch 15, o několik ms později ještě 1,644 m. Jde o několik aplikací stavu mezi snímky, nikoli důkaz tří samostatně zobrazených skoků. |
| 00:12:12.353: 4,854 m po frame 453,7 ms; 00:14:41.050: 4,358 m po frame 480,5 ms | Záznam předchozího CPU/renderu je 449,6/441,6 ms, resp. 471,2/467 ms. Doložena časová souvislost s blokujícím renderem, ne samotná příčina každého rozdílu fyziky. |
| Okolí 10,939 m: opakované snímky cca 70–154 ms a stale waits | I řetězec kratších špatných snímků může zpozdit callbacky a obnovu; není třeba jediný několikasekundový blok. |
| `action: respawn` seq 979 v 00:15:08.594; forced reply seq 980 v 00:15:08.625 | Návrat na spawn je výslovná uživatelská akce, odpověď za 30,4 ms. Poslední vzorek před akcí je jedoucí auto daleko od startu. Motiv stisknutí R log nezná; neoznačovat jako spontánní reset. |
| Běžná oprava 2,818 m v 00:12:04.644 má `modeChanged=true` po interact | Legitimizuje přechod do auta; není sama o sobě netcode závada. |
| Poslední kontext: sender 27 976 vytvořených / 27 972 poslaných inputů, max queue 8, 0 overflow, 0 send errors | Předchozí přetečení senderu nebylo v tomto testu reprodukováno. Čtyři discarded a dva expired jsou oddělené čítače, ne důkaz ztráty všech inputů. |
| Autority: 10 323 přijatých, 1 311 superseded, 31 barriers; poslední ack 668, predicted 677 | Coalescing běžných autorit funguje. To neprokazuje správnou prezentační fázi ani příčinu 221 sender resetů. |
| Serverová queue: 267 late, 94 wrong-epoch, 9 ahead, 0 invalid/duplicate; max depth 16 | Síťový backlog a změny epoch stále mají dopad, ačkoli klientská queue nepřetéká. Čítače jsou vlastní relace, ne počty viditelných skoků. |
| 250 probe výsledků, 246 přijatých, 4 označené kontaminované; 0 timeoutů | Předchozí chyba probe cadence není v tomto testu reprodukována. Poslední frame context obsahuje jen 245 accepted, protože poslední probe je později. |
| Šest accepted RTT 393 / 468,7 / 266,3 / 262,1 / 268,4 / 533,6 ms; všechny blockedOverlap=0 | Po serverovém timestampu zbývá cca 266–534 ms téměř celé RTT; na stejném hostu to ukazuje problém návratové části řetězce. Neodděluje transport, frontu browseru a callback scheduling. |
| Tyto vysoké hodnoty zůstaly řídicí hodnotou 1,418–1,932 s do dalšího accepted probe | Součet intervalů vysoké řídicí hodnoty je 9,602 s. To není přesné měření doby subjektivního freeze; během nich ale kód odmítá nové predikované kroky a je 10 latency-budget eventů. |
| Nejdelší frame 4 798,1 ms je návrat po hidden 00:19:39.644–00:19:44.386 | Neuvádět jej jako foreground freeze. Poslední client-request při návratu odpovídá `Game.visibility()`, nikoli starému stale wait před 75 s. |
| Server clock final droppedTotal 4 250 ms, first observed 3 966,667 ms | Rozdíl po prvním vzorku je 283,333 ms. Max CPU/elapsed cca 1 109 ms i většina dropTotal už existovaly při prvním vzorku; jde o lifetime místnosti, ne důkaz takového server freeze v této relaci. |

Vozidlo bylo skutečně řízeno: 185 frame windows mají car/third-person, maximální sampled speed 14,486 m/s. Foot/third-person má 28 windows, foot/first-person 283. První camera-change v 00:13:45.871 mění vzdálenost auta, není dokladem začátku třetí osoby. Uživatelův popis třesení ve třetí osobě je relevantní, ale log nezaznamenává jeho přesný začátek ani video.

## Celý řetězec času a jeho vazby

| Vrstva | Skutečné chování / primární cesta | Dopad |
| --- | --- | --- |
| Render clock | Installed `engine.pure.js:64` měří delta přes `PerformanceMonitor.sampleFrame`; `abstractEngine.pure.js:432` spouští frame callback. `Game.frame:2111` čte delta a omezuje dt na 100 ms. | Delta je čas vykreslených snímků. Není fází serverového ticku. Po stallu se vizuální tlumení/animace posune jen o capped dt. |
| Přijetí autorit | `ui.tsx:335,711`, `authority-buffer.ts:30`: ordinary latest až před frame, epoch/resync/respawn barrier ihned, zachová receivedAt. | Dobře omezuje opakovaný replay ordinary backlogu. Barriers se stále mohou aplikovat několikrát před jedním obrazem. |
| Vstupy | `game.ts:2026`: držení kláves, edge skoku jen při deliverable kroku; `network-timeline.ts:167`: target=floor(server estimate)+lead. | Fixed 60Hz příkazy označují budoucí čas; pozdní burst nesmí zrychlit server ani opakovat minulé ticks. |
| Transport | `ui.tsx:562`: flush po simulaci; timer fallback:400; `network-input-buffer.ts`. | Frame hook odstranil závislost pouze na timeru, zachováno ≤8/packet a rolling budget. Pokud stojí hlavní vlákno, zastaví se obě cesty i odběr inputu. |
| Server | `server/index.ts:285`: fixed 60Hz, maximálně 8 catch-up steps, dropped time posune UTC, zahodí pending a změní epoch. Authority/motion 20Hz. | Server pokračuje i bez inputu, missing slot je neutral. Auto má setrvačnost; nesmí se zastavit kvůli ack nebo renderu klienta. |
| Tick/UTC | `shared/input-timeline.ts:35`, `shared/netcode.ts:93` | Ack je vyřešený simulation tick v epochě, nejen počet přijatých příkazů. Oprava původního V10 časového rozporu musí zůstat zachována. |
| Replay | `game.ts:1168`: úplnější exact comparator; restore actor/car, poté jen budoucí kroky s UTC autority. | Shoda pozice nestačí pro shodu grounded/velocity/dynamics. Actor restore není whole-world rollback. |
| Svět / kolize | `simulation.ts:478`: transit cache po 33 ms, kinematické překážky; `Actor.step:704` předchází `sim.tick`; `vehicle.ts:470` restore game-owned state. | Replay vrací lokální tělo, ale kontaktní cache a ostatní dynamické objekty nejsou atomicky obnoveny. První replay step může vidět kolizní svět z pozdějšího času. Důležitá hypotéza pro zbytkové chyby, dosud neprokázaná příčina 07c. |
| Interpolace lokálního těla | `game.ts:2031,2084,2196`: accumulator += dt, modulo jen když timeline udělala krok, alpha=min(1,accumulator/DT). | Dva nezávislé hodiny. Změna epochy resetuje accumulator, běžná korekce resetuje previousPosition. To ovlivní obraz i při správném fyzikálním koncovém stavu. |
| Auto a avatar | `game.ts:2259`: car pose používá stejnou alpha, lokální camera target actor.position je car.position+0,8 m. Avatar dostává interpolovanou root, ale současné yaw/grounded. | Pozice auta a camera target jsou za normálního stavu konzistentní. Nelze bez důkazu tvrdit, že kamera prostě sleduje neinterpolované auto. Grounded/yaw/animace mohou být o tick jinak. |
| Malá korekce | `game.ts:1299`: visualOffset = oldPhysics − corrected, previousPosition=corrected; decay exp(−18dt). | Není zachována předchozí viditelná pozice včetně zbylého offsetu a fáze. Další korekce může přepsat nevyprchanou korekci; i nulová fyzikální korekce může změnit obraz. |
| Kamera | `game.ts:1859`: okamžité zkrácení collision arm, pomalé prodloužení exp(−5dt); absolutní world-position follow exp(−12dt), druhý bezpečnostní cast, lookAt aktuální render target. `controls.ts:18` chase yaw exp(−3dt) před novou simulací. | Tři filtry a dvě kolizní projekce mohou zesílit měnící se rychlost či zásahy kamery. Exponenciální koeficient sám nezajišťuje shodu průběhu pro pohybující se cíl při libovolné dt. |
| Vzdálené entity | `netcode.ts:280`: 30 samples, offset EWMA packet.time−Date.now(receipt), render −100 ms; parked/foreign car obdobně. | Oddělená časová osa; zpožděný callback může změnit offset a Date.now není monotonic. Nejde o přímý zdroj lokální car camera jitter, ale změna clock policy nesmí rozbít ostatní hráče. |

## Reprodukce povolené koordinátorem

Koordinátor povolil lehké in-memory matematické/fake-clock experimenty bez renderu, assetů, serveru a zápisu souborů. Spuštění `node --import tsx --input-type=module` přes stdin, exit 0, přibližně 1–2 s včetně importu. Nebyl spuštěn test runner ani Rapier svět. Následující zdroj je uchován zde pro opakovatelnost.

### A. Fáze obrazu při konstantní rychlosti

Používá skutečný `NetworkTimeline`; skalární pozice je číslo ticku. Actor/camera/GPU nejsou simulovány. Autority nemají odchylku, žádné corrections, ztráty, stally ani variabilní RTT. Přesně převzatý výraz accumulator/modulo/lerp z Game porovnáváme s časem odvozeným z clock stejného timeline.

```js
import { NetworkTimeline } from './client/network-timeline.ts';
const D = 1000 / 60;
for (const fps of [30, 59.94, 60, 61, 144]) {
  const t = new NetworkTimeline(); t.setRtt(26);
  let prev=0, cur=0, acc=0, last=0, render=0, idealLast=0;
  let min=Infinity, max=-Infinity, minIdeal=Infinity, maxIdeal=-Infinity;
  const auth = ack => ({ inputEpoch:1, inputTickBase:0, ack,
    tick:ack, time:ack*D });
  t.acceptAuthority(auth(0), 0, { vehicle:false, yaw:0 });
  for (let i=0; i<=fps*3; i++) {
    const now=i*1000/fps, dt=(now-last)/1000; last=now;
    if (i%Math.ceil(fps/20)===0)
      t.acceptAuthority(auth(Math.floor(now/D)),now,{vehicle:false,yaw:0});
    acc += dt;
    const a=t.advance(now, seq=>({seq,x:0,z:1,yaw:0,jump:false,vehicle:false}),
      s=>{prev=cur;cur=s.input.seq;});
    if(a.status!=='advanced') throw Error(a.reason);
    if(a.steps) acc%=D/1000;
    const out=prev+(cur-prev)*Math.min(1,acc/(D/1000));
    const s=t.snapshot();
    const target=s.clockSeqAtAnchor+(now-s.clockAnchorAtMs)/D+t.leadTicks-1;
    if(i>10){
      const v=(out-render)*fps/60, vi=(target-idealLast)*fps/60;
      min=Math.min(min,v);max=Math.max(max,v);
      minIdeal=Math.min(minIdeal,vi);maxIdeal=Math.max(maxIdeal,vi);
    }
    render=out;idealLast=target;
  }
  console.log({fps, current:[min,max], sameClock:[minIdeal,maxIdeal]});
}
```

| FPS | Rychlost obrazu / skutečná konstantní rychlost, min–max | Jedna časová osa, min–max |
| --- | --- | --- |
| 30 | 0,5–1,5 | 1–1 |
| 59,94 | 1–1 | 1–1 |
| 60 | 0–2 | 1–1 |
| 61 | 0,2–2,01667 | 1–1 |
| 144 | 0,6–1,4 | 1–1 |

Při přesných 60/30 FPS se přidává citlivost modulo na floating point hranici 1/60: stejná simulace vykoná kroky podle timeline, ale accumulator zvolí střídavě téměř 0 nebo téměř DT. Výsledek není tvrzení, že každá skutečná 60Hz obrazovka vždy přesně takto chvěje; 59,94 je záměrný kontrolní proti-příklad. Prokazuje neplatný invariant mezi pair ticků a alpha. Referenční sameClock je matematický target, nikoli hotová implementace pro lead change nebo rebase.

Ve stejné první variantě s fps=144, `setRtt(136)` při i=144 a zpět `setRtt(26)` při i=288: lead 6→10, čtyři dodatečné kroky v jednom frame; normalizovaná rychlost obrazu max 8,2×, po snížení leadu několik nulových snímků. Numericky při i=143 rendered tick 65,583; i=144 69; i=145 70,417. Tento mechanismus vyplývá ze změny časového horizontu; bezprostřední změnu potřebného input leadu nelze jen zrušit, protože by se příkazy staly pozdními.

### B. RTT bez LongTask není čistý RTT

```js
import { NetworkProbe } from './client/network-probe.ts';
import { NetworkTimeline } from './client/network-timeline.ts';
let now=0;
const p=new NetworkProbe({now:()=>now,send:()=>{},longTasks:()=>({
  takeRecords:()=>[],disconnect:()=>{}
})});
p.poll({enabled:true,ready:true}); now=533.6;
const m=p.receive({nonce:1,serverTick:10,serverTimeMs:1000000});
const t=new NetworkTimeline();t.setRtt(m.predictionRoundTripMs);
t.acceptAuthority({inputEpoch:1,inputTickBase:0,ack:0,tick:0,time:1000000},
  now,{vehicle:false,yaw:0});
console.log(m.rawRoundTripMs,m.acceptedForPrediction,m.longTaskCoverage,
  m.blockedOverlapMs,t.advance(now,()=>{throw Error('input sampled')},()=>{}));
```

Výsledek: `533.6, true, available, 0, waiting/latency-budget`. To reprodukuje současnou rozhodovací chybu nejistoty, **nerozlišuje**, zda real callback čekal za krátkými úlohami, transportem nebo obojím. Dlouhé úlohy lze použít jako pozitivní důkaz kontaminace, jejich nepřítomnost jako důkaz čistoty použít nelze.

### C. Kontinuita malých oprav — důkaz čtením kódu

Pokud physics old=10, zbývající visualOffset=+0,2, nový corrected=9,9, současný reconcile přepíše offset na +0,1. Předtím viditelná pozice 10,2 se změní na 10 ještě před decay. To je ztráta staré korekce. Navíc previousPosition se nastaví na corrected; interpolovaná poloha mezi původními tickami se nezachová. Pro tento případ nebyla spouštěna fyzikální reprodukce; smysluplná budoucí regrese musí volat skutečný `Game.reconcile` a vzorkovat prezentaci před/po, nikoli pouze opsat aritmetiku do testu.

## Alternativy: co řešit a co nezaměňovat

### Prezentační fáze, lead a malé opravy

| Varianta | Přínos | Náklady, rizika, vzhled/cache/lifecycle | Rozhodnutí |
| --- | --- | --- | --- |
| Přidat epsilon před `% DT` | Omezí hraniční floating point alias. | Neopraví rozdílnou fázi server clock, změny leadu, rebase ani přepsaný offset. Levné CPU, ale neúplné. | Samostatně zamítnout. |
| Vykreslovat vždy current physics / vypnout interpolaci | Odstraní chybné alpha. | Při >60 FPS zůstává schodovitých 60Hz, nízké FPS/lead stále skáčou; kosmetická degradace. | Jen diagnostické A/B, ne cílové řešení. |
| Pouze přidat camera lerp / zvýšit práh 0,35 m | Snadno sníží viditelnost některých chyb. | Větší zpoždění kamery, průniky či rozjezd body/camera; skrývá chybu. Fyzika, pozdní vstupy a burst se nemění. | Zamítnout jako primární opravu. |
| Alpha odvodit ze stejného timeline času a explicitních předchozího/současného ticku | Přímo opravuje reprodukovaný rozpor, stálá paměť, minimální CPU. | Musí ošetřit žádný krok, více kroků, epochu, waiting, a float hranice. Samo o sobě neřeší skok leadu. | Doporučit jako první funkční celek. |
| Oddělit command horizon od monotonic presentation cursor nad krátkou historií pozic/quaternionů | Input lead může reagovat včas, obraz nepolyká celé ticky skokem. Jedna render pose pro root/car/cameru. | Bounded history a pravidla rychlosti kurzoru; přechodně přidává input-to-photon lag. Nelze měnit čas neomezeně ani extrapolovat přes kolize. Reset při respawn/epochě musí být explicitní. | Doporučit jako další celek po fázi; parametry porovnat měřením, nevymýšlet finální hodnoty bez A/B. |
| Fixní vysoký lead pro všechny | Odstraní změny leadu, malý stav. | Trvale více budoucích inputů, větší serverová odezva vůči ostatním, větší prediction error po změně směru; nefunguje pro libovolnou RTT. | Kontrolní varianta, horší cílový kompromis než bounded adaptive lead. |
| Zachovat před korekcí skutečnou render pose; od ní počítat nový presentation offset | Korekce se skládají bez ztráty předchozího offsetu/alpha. | Potřebuje samostatný stav poslední zobrazené pozice a případně orientace, jasný reset při mode/respawn. Žádná změna authoritative physics. | Doporučit s regresí dvou korekcí během decay a nulové korekce. |
| Prediction v pracovníkovém vlákně | Oddělí simulaci/transport od render stallu. | Serializace inputů/pose, lifecycle WASM, přístup k mapě, crash/reconnect, žádný automatický lék na prezentační chybu. Hlavní vlákno stále nemusí přijmout klávesu včas. | Velká navazující architektura jen pokud profil ukáže trvalou potřebu. |

Minimální návrh API pro první celek: timeline poskytne `presentationFrame(now)` se `{epoch, previousSeq, currentSeq, alpha, status}` nebo ekvivalentním fractional tickem. Hodnoty musí vycházet ze stejného clock jako `advance`, ne z druhého akumulátoru. Hra uchová dvojici pose označenou seq. `alpha` nesmí interpolovat neexistující dvojici po rebase. Následující rozšíření na kurzor/history má být interní vlastnost jednoho malého modulu, ne další ručně synchronizovaný Game counter.

### RTT, odhad clocku a hranice latence

| Varianta | Co opravdu změří / opraví | Rizika a dopady | Rozhodnutí |
| --- | --- | --- | --- |
| Poslední raw RTT + LongTask veto (dnes) | End-to-end request/reply + některé ≥50ms bloky. | Izolovaný vzorek mění lead/stop; dlouhé období krátkých úloh nezachytí; browser bez LongTask stále vzorek přijímá. | Nedostatečné jako jediná řídicí politika. |
| Raw RTT clamp na 200/233 ms | Zabrání latency-budget stavu. | Lže o skutečně pomalé síti a vyrábí late commands. | Zamítnout. |
| Raw minus součet LongTask | Zdánlivě očištěné číslo. | Překryv mohl nastat ještě během skutečného přenosu; délky se obecně nesčítají. Může podhodnotit skutečnou latenci. | Zamítnout jako „wire RTT“. |
| Bounded okno vzorků, robustní baseline/jitter a potvrzené změny režimu | Odolnost proti jednomu extrému; explicitně oddělí měření, odhad a nejistotu. | Příliš dlouhé minimum ignoruje zhoršení skutečné sítě. Musí reagovat i na vlastní late/receivedSeq/depth trend; raw vždy logovat. Jednotky desítek vzorků, reset per room/epoch policy. | Doporučená nejmenší politika k porovnání v kontrolované síti. Neoznačovat odhad jako čistou latenci. |
| Více timestampů v téže authenticated odpovědi (receive/send server monotonic + server tick/epoch) | Oddělí server handler residence, zpřesní interval clock offset. | Neoddělí nepozorovaný browser queue ani jednosměrnou asymetrii. UTC rozdíl přes počítače není latence. | Doporučit diagnosticky; není sám estimator. |
| MessageChannel/timer lateness + frame workload | Nízký náklad, důkaz části lokálního scheduler zpoždění i bez LongTask. | Jiný task source může být obsloužen jinak než WebSocket; nepřítomnost lateness nic negarantuje. Zbytečný high-frequency heartbeat by sám škodil. | Omezený diagnostic, ne autoritativní odečet z RTT. |
| Socket a jeho receive timestamps ve workeru | Přímější oddělení main-thread dispatch delay od socket roundtrip. | SDK/lifecycle/reconnect/guest boundary, postMessage kopie, workers mohou být také zpožděni. Samostatný probe socket neměří přesně stejnou congestion/frontu jako herní socket. | Nejlepší navazující izolující experiment, ne první runtime přepis. |
| Vyšší bounded future/replay budget | Podporuje skutečnou větší latenci. | Více input latency/prediction work/history, riziko zákeřně vzdálených příkazů, nutný wire/queue kontrakt a tests. | Až po rozhodnutí požadovaného rozsahu RTT; ne jako lék na callback spike. |
| Server-only fallback při skutečně nepodporované latenci | Hra může ukázat autoritativní pohyb bez falešné predikce. | Vyžaduje nový způsob odesílání současných controls nebo server scheduling kontrakt; současný strict tick producer se zastaví úplně. Jiná odezva. | Produktová varianta pro skutečný vysoký RTT, vyžaduje vlastní výzkum/scope. |

Nyní je hranice `ceil(RTT / (2·16,667)) + 5 > 12`, tedy raw RTT přibližně nad 233,333 ms. Zvyšovat číslo bez cílového rozsahu není řešení. Doporučená policy musí mít pojmenované stavy `timing-unconfirmed`, `supported`, `confirmed-over-budget`; uživateli nesmí tvrdit funkční predikci, pokud reálná síť časové sloty nedoručuje. Izolovaný extrém nemá sám dokazovat změnu režimu. Konkrétní délka potvrzení, quantil a rychlost adaptace se zvolí až z experimentů isolated spike vs trvalý RTT 300/500 ms, asymetrie a queue pressure.

Monotonic server clock je již oddělen od state anchor; vracet jej na každý opožděný packet by znovu vytvořilo late input loop. Při dlouhé relaci je ovšem třeba ověřit drift obou hodin: dnešní same-epoch `max` umí posunout clock jen dopředu. Přechod na odhad s korekcí rychlosti musí být bounded a nesmí znovu použít vyřešené seq; nevnášet clock slew přímo do fyzikálního DT.

### Obnova, bariéry a fyzika

| Varianta | Přínos | Rizika / náklady | Rozhodnutí |
| --- | --- | --- | --- |
| Více resync požadavků / kratší cooldown | Občas rychleji přijde aktuální stav. | Více epoch, zahozených future inputů, vynucených skoků; při callback backlogu zesiluje feedback. | Zamítnout. |
| Zvětšit stale/replay limity a pokračovat bez čerstvé autority | Méně recovery. | Neřeší chybějící jistotu času, může draze replayovat a narůst drift. Bez podmínek nemá bezpečnou mez. | Jen řízená součást policy, ne změna konstant naslepo. |
| Jedna recovery transakce, nonce/reason/requestedEpoch + timeout | Zabrání duplicitní epochové obnově během zpožděné odpovědi; přesná kauzalita logu. | Musí propustit skutečný respawn a server-clock-drop, restart při reconnectu. Stálá paměť, nízký CPU. | Doporučit. |
| Po krátkém stale vyžádat čerstvou authority ve stejné epochě; změnit epoch jen při skutečné potřebě | Zachová platné budoucí slots a menší zásah do světa. | Nutno prokázat, že fresh authority stačí pro bounded rebase a původní pending inputy nemohou zasáhnout jiný režim. Nesmí jen odstranit reset ze všech větví. | Preferovaná navazující varianta k přesné regresi, nikoli hotový patch. |
| Slít všechny forced/barrier odpovědi | Méně aplikací starých stavů. | Prosté latest by mohlo ztratit uživatelský respawn, mode/lifecycle událost či request completion. | Plošně zamítnout; oddělit sémantické zpracování bariér od jedné výsledné prezentace na frame. |
| Ponechat authority restore a zvýšit vizuální smoothing | Menší jednotlivé trhnutí. | Mohou zůstat metry rozporu a průchody geometrií. | Až poslední bounded prezentační úprava po časové opravě. |
| Whole-world snapshot/rollback Rapier | Obnovuje kontaktní cache a celý dynamický stav. | Velká paměť/copy CPU, potřeba shodných objektů/handles a vlastnictví světa; autorita dnes neposílá celý svět. Samotný lokální snapshot bez správných serverových podmínek není exact restore. | Nezavádět globálně bez kontaktní reprodukce a profilu. |
| Oddělený prediction world s deterministickými překážkami a cíleným rollbackem | Izoluje replay od render/live world, explicitní dynamické vstupy. | Duplicita collision geometry/traffic, lifecycle a paměť, musí zachovat jednotný multiplayer svět. | Možná větší architektura pro prokázanou kontaktní divergenci. |
| Nejdřív obnovit časově odpovídající kinematické překážky a potřebné game-owned state | Menší zásah, testuje konkrétní first-replay-step rozpor. | Pořadí actor.step/world.step musí zůstat stejné na obou stranách; contact cache tím nemusí být vyřešena. | Preferovat důkaz na skutečném Rapier kontaktu před volbou rollback architektury. |

Server musí ve všech variantách dál simulovat 60Hz svět i setrvačnost auta, nepouštět pozdní burst rychleji a nesmí cizímu řidiči přepsat auto při obnově jiného hráče. `respawn` z poškozené pozice musí mít bezpečnou hard-recovery cestu. Guest nesmí získat room telemetry ani přes nový veřejný endpoint.

### Samotná kamera a animace

Nejdřív opravit výše prokázanou prezentační fázi. Potom porovnat stávající world-position exponential follow s (a) přenosem translation delta cíle a filtrováním pouze orbit offsetu, (b) analytickým kriticky tlumeným springem se stavem rychlosti. První varianta má menší paměť a pevnější tělo v obraze, ale mění pocit jízdy; druhá lépe řídí přechody a vyžaduje explicitní reset rychlosti po respawn a kolizním zkrácení. Žádná neřeší chybný target.

Kolizní arm se má porovnat na stejných zaznamenaných target/collider datech: současné okamžité zkrácení a pomalý návrat versus hystereze zásahu či časová stabilizace contact identity. Stabilizace nesmí držet kameru za překážkou. Telemetrie musí rozlišit první desired cast a druhý bezpečnostní cast. Parametry nesmějí maskovat průchod zdí ani měnit geometrii kvůli pocitu.

Lokální avatar používá root z interpolace, ale grounded/yaw ze současné simulace; foot planting a LOD reset mohou vytvářet jiný typ třesení než camera translation. Pro tuto větev chybí video a per-frame bone/root evidence. Před změnou gait kódu je nutný vlastní scope; nezaměnit s problémem KEY-12 jen podle slova „třesení“.

## Minimální automatická telemetrie pro rozhodnutí

Žádné ruční zapínání pro uživatele. Použít bounded ring a agregace navázané na současný recorder; ne každosnímkový JSON dump celé scény. Přesné rozpočty nejprve ověřit na profilu recorderu.

- Per-frame levné skaláry / incident ring: frame id, now/dt/raw dt, epoch, authority ack/tick, predicted seq, steps, estimated fractional server tick, lead, alpha, previous/current pose seq, render root/car pose, camera target/final pose a collision-arm length; čítač případů alpha/pair nesouladu.
- Correction summary každou sekundu: exact/no-op, state component mismatch (position/rotation/grounded/velocity/mode), soft/hard/forced; histogram fyzikální a **viditelné** delta, max, replay steps/CPU. Přesné incidenty s before/after render pose a frame id. Nezvyšovat jen počet nynějších nedostatečných correction eventů.
- Recovery: request id, původ (stale/budget/visibility/respawn/overflow), epoch/ack/age při odeslání, already pending, server accepted/suppressed, reply request id/epoch; počet resetů na incident. Last reply bez vazby k requestu nestačí.
- RTT: raw, vybraný odhad, confidence a důvod přijetí/odložení; skutečné stáří odhadu, longtask coverage, scheduler observation, server handler residence. `no-longtask-overlap` nepřejmenovat na `wire-clean`.
- Lifetime server counters zachovat, ale ve reportu používat baseline/delta a vlastní čas incidentu. Room tick/drop/queue nemíchat s relací jiného uživatele.
- Lifecycle: všechny ringy/buffery bounded, room reset/dispose, visibility a stale callbacks s generation guard; guest bez room probe/authority subscription. Před zápisem žádné chaty, tokeny, profily ani peer listy.

## Přesné další ověření a navržené scopes

Nejsou zde spuštěné testy ani build. Následující jsou návrhy pro koordinátorem přidělené samostatné funkční celky:

1. **Fáze prezentace** — `client/network-timeline.ts`, nový `client/prediction-presentation.ts`, `client/game.ts`; cílené `tests/network-timeline.test.ts`, nový `tests/prediction-presentation.test.ts` a integrace skutečné Game frame v `tests/prediction-replay.test.ts`. Konstantní pohyb 30/59,94/60/61/120/144 FPS, offset fáze 0–DT, jitter a zero-step/multi-step. Assert monotonic position a konstantní rychlost při konstantní trajektorii, quaternion shortest arc; žádný server/network change. RTT/epoch lead transitions musí mít explicitní kontrakt, ne náhodně projít.
2. **Kontinuita korekce** — tentýž malý presentation modul + Game integration, disjunktní task až po prvním předání. Dvě měkké korekce během decay, nulová pozice s jiným grounded/velocity, korekce mezi RAF bez step, auto rotation q/−q, následný mode change/respawn. Assert správná authoritative physics i kontinuita render pose; přejímka nesmí jen zvednout tolerance.
3. **RTT/lead politika** — `client/network-probe.ts`, `client/network-timeline.ts`, případně nový malý estimator; `tests/network-probe.test.ts`, `tests/network-timeline.test.ts`, `tests/timeline-sender.test.ts`, Game/UI jen explicitní API integrace. Přehraj isolated 533,6 ms bez LongTask, 400ms main-thread block, řetězec <50ms tasks, trvalý skutečný RTT 300/500 ms, asymetrický transport, absent observer, stale sample, room leave/reconnect. Pro podporovaný 0–200ms rozsah zachovat timed held inputs a jump při 15FPS, bounded future16 a nulové opakování elapsed ticks. Falešné označení „ready“ při trvale zpožděné síti je fail.
4. **Recovery transaction / state refresh** — nový `client/network-recovery.ts`, `client/ui.tsx`, `client/game.ts`, `shared/network-diagnostics.ts`, `shared/netcode.ts`, `server/index.ts`; testy authority-buffer, room-callbacks, client/server recovery a SDK integration producer. Dva timeout intervaly před odpovědí musí dát jednu běžnou žádost; visibility, clock drop a respawn mají přesné priorizace. Zachovat safe damaged pose a foreign-driver invariants. Protocol compatibility rozhodnout explicitně podle finálního payloadu, nepřidělovat verzi před návrhem wire změny.
5. **Dynamické kontakty** — nejprve pouze testovací scope `tests/timeline-physics.test.ts`/nový kontaktový fixture. Skutečný Rapier: stejné statické podmínky vs pohybující se překážka / auto do hrany / svah, restore mezi kontakty, replay různě staré authority. Porovnat state diff po každém ticku a cache/traffic time; teprve výsledek rozhodne o `shared/simulation.ts` a `shared/vehicle.ts`.
6. **Kamera po vyčištění vstupní trajektorie** — nový extrahovaný modul kamery a test, Game integrace. Skutečná Babylon projekce pro konstantní rovnou jízdu, zatáčení, rampu, kolizní arm, různé FPS, orbit drag, V, vstup/výstup, R, first-person. Měřit screen-space body/landmark trajektorii a vzdálenost target-camera, ne jen znaménka nebo rozptyl FPS.

Praktická přejímka nad neměnným checkpointem obsahujícím testy: nejprve celé testy/build/izolovaná SDK integrace s rezervovanými zdroji, pak jedna produkční hra, stejné GPU/2040×986/HUD/avatar/počasí, řízená chůze i souvislá jízda, první/třetí osoba, B6, torch, editor, respawn a visibility resume. Porovnat FPS/p95/p99, input/authority/correction histograms a screen-space jitter; nové scene nesmí soupeřit o GPU. NullEngine či scalar model nejsou GPU ani subjektivní důkaz opravy. Vysoká skutečná síťová latence a callback stall musí být v přejímce oddělené scénáře.

## Primární zdroje a hranice jejich použití

Čteno 14. 10. 2026. Místní installed kód výše je rozhodující pro konkrétní verze. Externí standardy vysvětlují možné mechanismy, samy nedokazují, který task čekal v 07c.

- [WebSockets: feedback from the protocol](https://websockets.spec.whatwg.org/#feedback-from-the-protocol): doručená zpráva teprve zařadí task pro MessageEvent. Callback timestamp tedy není zaručený okamžik síťového přijetí. SDK `WebSocketTransport.ts:62 → Room.ts:546` pouze předává/dekóduje callback; ani SDK ping by sám neodstranil main-thread čekání.
- [HTML event loop](https://html.spec.whatwg.org/multipage/webappapis.html#event-loops): task sources/queues a render scheduling jsou oddělené mechanismy. Nelze odvodit čisté RTT jen z pravidelných RAF nebo z chybějící jedné dlouhé úlohy.
- [Long Tasks](https://w3c.github.io/longtasks/): pozoruje úlohy kolem hranice 50 ms včetně příslušných microtasks. Neposkytuje úplnou historii všech kratších tasků ani příchod paketů.
- [PerformanceObserver.takeRecords](https://w3c.github.io/performance-timeline/#dom-performanceobserver-takerecords): drain vlastního observer bufferu omezuje zpoždění jeho callbacku; nerozšiřuje druhy měřených událostí. Current `NetworkProbe.receive` tento drain již dělá.
- [High Resolution Time](https://w3c.github.io/hr-time/): monotonic timestamp slouží pro elapsed duration; wall clock lze upravit a origin timestamp je aproximace. ServerUTC proti client performance origin lze v lokálním testu použít jako orientační rozklad, nikoli jako obecný one-way latency protokol.
- [Rapier determinism](https://rapier.rs/docs/user_guides/javascript/determinism/): determinismus závisí na stejných počátečních podmínkách a stejné posloupnosti kroků. Nestačí shodná finální translation jednoho těla.
- [Rapier serialization](https://rapier.rs/docs/user_guides/javascript/serialization/): whole-world snapshot/restore je jiný kontrakt než game-owned Actor/Vehicle capture. Proto kontaktový replay nesmí být prohlášen za exact bez samostatného důkazu.

Oficiální Colyseus tutorial URL při tomto čtení vrátily interní chybu; žádný závěr o SDK nebyl odvozen z nedostupné stránky. Installed SDK source výše je dostupný primární podklad. Nebyl přidán externí plugin ani runtime závislost.
