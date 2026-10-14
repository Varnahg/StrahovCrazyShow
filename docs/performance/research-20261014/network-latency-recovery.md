# KEY-7: vysoké RTT, obnova epochy a přetrvávající odhad hodin

14.10.2026; navazující výzkum `research-01a13624-latency-recovery-20261014`. Tento dokument a cache reprodukce nejsou runtime oprava. Před testovacím kódem zaznamenáno rozhodnutí koordinátora: izolovat konkrétní interakci na skutečném frozen NetworkTimeline/TimelineInputQueue, zachovat pozitivní kontroly a původní red. Navazuje na `netcode-camera.md` a `../repair-live-network-audit.md`, neopakuje již opravené probe timeouty z wave2.

## Důkaz a jeho časová přesnost

Zdrojový log: `.cache/playtest-repairs-validation/snapshots/wave3/.cache/game-diagnostics/07c227f8-d2f8-4011-a6f8-5d27ad0627a4.jsonl`, SHA256 `0ebf9512e10df06d94121358a57133885b7d0371b10d3b0b3027dbbce4b46dbb`, snapshot `0f20b5a7c7ba9ce5ab9aa16bba3b0a6886823152a322be2724fd2cdad41d6248`. Nově ověřeno streamovaným čtením:1799 záznamů, seq0–1798 bez mezer,250 probe odpovědí, žádný timeout. Původní JSONL zůstává beze změny.

| Probe seq | Raw RTT ms | Čas do dalšího accepted vzorku ms | Následující RTT ms | Max frame ms v celých oknech překrývajících probe |
| --- | ---: | ---: | ---: | ---: |
| 1040 | 393.0 | 1446.3 | 8.2 | 42.6 |
| 1154 | 468.7 | 1417.6 | 14.1 | 38.1 |
| 1340 | 266.3 | 1932.1 | 225.2 | 43.5 |
| 1419 | 262.1 | 1676.6 | 50.7 | 43.0 |
| 1428 | 268.4 | 1692.4 | 17.1 | 36.6 |
| 1455 | 533.6 | 1437.2 | 34.0 | 41.8 |

Všech šest má `acceptedForPrediction=true`, `longTaskCoverage=available`, nulový overlap; žádný zaznamenaný LoAF/hitch se s vlastními probe intervaly nepřekrývá. Max frame je konzervativně maximum celých překrývajících oken, ne odhad z interpolovaných timestamps. Render tedy v těchto intervalech pokračuje. Součet vysokých řídicích intervalů je **9602.2ms**, nikoli jedna naměřená vizuální pauza. Deset wait eventů má `latency-budget` a `recoveryRequested=false`.

Frame context není timestamp konce frame-window: snapshot vzniká periodicky a okno uchová svůj počáteční context. Pro přiřazení byly použity výhradně `contextAtMs`, deduplikované podle téhož okamžiku; bez toho by šlo o chybné posunutí o1–2s. V každém vysokém intervalu jsou dvě skutečná context měření přibližně1s od sebe: počet klientských vyrobených vstupů i server accepted zůstává stejný; server idle vzroste o66/63/63/68/64/66 ticků. Autority stále přicházejí; sender reset vzroste o20/21/19/19/15/15. Těchto109 resetů není109 změn serverové epochy: běžná authority během zastavené predikce opakovaně překročí predictedSeq a vyvolá klientský rebase.

Serverový `Date.now()` těsně před reply proti `timeOrigin + measuredAt` ukazuje u těchto localhost vzorků interval před server timestampem −0.6…+0.3ms, návratovou část262.7…534.2ms. Záporné zlomky jsou slučitelné s kvantováním/časovou aproximací. Je to důkaz, že téměř celé zdržení je až za tímto timestampem; **není to důkaz čistého wire RTT ani čistého browser CPU delay**. Chybí socket write completion/backpressure a čas přijetí WebSocket rámce browserem. Chybějící LongTask nevidí řetězec kratších úloh ani pořadí task sources.

Installed Colyseus0.18.9 `Transport.ts::enqueueClientRaw` posílá joined klienta bez `afterNextPatch` přímo do transport.raw; náš probe tento option nemá. WebSocketClient.raw volá ws.send; WebSocketTransport standardně vypíná perMessageDeflate a hra jej nepřepisuje. Installed ws8.22 volá socket.setNoDelay. SDK0.18.5 `WebSocketTransport.ts:62 → Room.ts:546/673` předává/dekóduje MessageEvent synchronně, nemá zvláštní probe timer frontu. Tím se zužují kandidáti, neprokazuje nulová fronta OS/browseru. Plošné „zapnout TCP_NODELAY“ nebo „vypnout deflate“ není doložená oprava tohoto běhu.

## Potvrzené mechanismy a nová hypotéza před reprodukcí

1. `NetworkProbe.receive:182–208`: každý nekontaminovaný vzorek nahradí predictionRtt, i když observer chybí; raw i vybraný odhad se zatím shodují. `UI:657` jej okamžitě předá planneru.
2. `NetworkTimeline:78/157`: `ceil(RTT / (2*16.667)) + 5 > 12` vrátí latency-budget ještě před kontrolou čerstvé authority. Hranice je233.333ms. Neodebere nové ovládání a nevytvoří kroky; server po vyčerpání future queue správně simuluje neutral. Obraz může běžet bez ovladatelného pohybu.
3. `NetworkProbe:208` čeká1050ms od odpovědi, UI:404–414 kontroluje poll jen1×/s. U těchto šesti vzorků trvá odeslání další sondy1403.2–1706.9ms; k tomu se přidá další RTT. Cooldown chrání skutečný serverový rate limit a musí zůstat. Jeho spojení s okamžitým použitím jediného extrému ale prodlužuje blok ovládání.
4. **Nová izolovatelná interakce**: `NetworkTimeline:113` při každé nové epoše založí clock na `authority.ack + rtt/2/STEP_MS`, i když RTT právě blokuje delivery budget. Následující nízké RTT mění pouze lead; `hasTimingSample` již je true. Stejnoepochové `Math.max` na120 zachová posun hodin dopředu. To může po odblokování vysílat ticks za server future16. Nepřevíjet na každé authority zpět je přitom správná ochrana proti dřívějšímu delayed-packet loopu; samotné odstranění max by vrátilo původní chybu.

Konkrétní 07c řetězec: seq1454 prediction-budget požádá o obnovu v401616.2ms; seq1455 přijme RTT533.6 v401691.3ms; seq1456 odpověď client-request vytvoří epoch33 v401720.2ms, authority tick150539/ack0. Seq1459 v403128.5ms přinese RTT34, ale context403864.2ms stále má clockSeqAtAnchor−ack11.642 ticku. Kumulované `ahead` je do té chvíle0, potom1→7→9 mezi context403864.2/404871.1/405892.2ms; všech9 odmítnutí relace leží zde. Probe server timestamp403094ms má server tick150627, tedy epoch seq88; extrapolace nového anchoru dává98.436, zhruba10.4 ticku dopředu ve stejném localhost čase. Odhad se nepřeklopí zpět po RTT34. Pozdější epocha34 jej znovu založí.

Tato vazba je silnější než pouhá přítomnost velkého RTT, ale log nemá každé emit/delivery timestamp/seq, takže jednotlivých9 `ahead` ještě nelze definitivně přiřadit. Cílem následující skutečné blackbox reprodukce je ověřit **mechanismus**, nikoli vyrobit přesně počet9 nebo rekonstruovat skutečnou fyziku uživatele.

## Návrh rozhodující lehké reprodukce

Importovat přímo frozen `client/network-timeline.ts`, `client/network-probe.ts` a `shared/input-timeline.ts`; žádná kopie algoritmu. Simulované hodiny60Hz, skutečná queue.consume každý tick, authority20Hz, pravidelný input delivery1tick. Po epochové bariéře dočasně zdržet autority o6ticků, potom obnovit1tick; jde o explicitní callback-delay vstup fixture, ne tvrzení o wire asymetrii v logu. Probe s prázdným skutečným injected LongTask zdrojem přijme533.6ms. Po1.45s přijde34ms a čerstvé autority. Žádný render/physics/server/socket.

Kontroly: stabilní34ms s touž epochovou bariérou; samotná vysoká sonda bez nové epochy; kombinace vysoké sondy a nové epochy; následná nová epocha po již nízkém RTT jako kauzální reset kontrola, nikoli návrh přidávat další resyncy. V každé měřit skutečné queue accepted/late/ahead, přesný clock drift vůči fixture server ticku, počet kroků/nových inputů během waiting i po ní. Po návratu čerstvého nízkého RTT a autorit má kontrolovaný podporovaný transport nemít trvalé ahead odmítání. Tato assertion má před změnou produktu zůstat red, pokud je hypotéza správná.

## Varianty a rozhodovací hranice

| Varianta | Přínos | Riziko / rozhodnutí |
| --- | --- | --- |
| Přidat smoothing kamery / nynější phase fix | Opraví některé viditelné změny fáze. | Nemění RTT, výrobu inputů, clock ani queue. Neřeší tento problém; phase fix není jeho regrese. |
| Clamp RTT nebo zvýšit future16/replay32 | Rychle skryje latency-budget / ahead. | Podhodnotí skutečně pomalou síť nebo zvětší výpočetní/paměťový a časový kontrakt. Bez měření zamítnout. |
| RTT raw minus LongTask nebo wire=RTT/2 | Snadné číslo. | Nepřípustná kauzalita: překryv není sériová část drátu, asymetrie zůstává. Zamítnout jako přesné měření. |
| Jediný spike jako nepotvrzený stav, bounded robustní baseline+jitter+stáří, potvrzení delivery feedbackem | Nezastaví automaticky podporovanou relaci kvůli jednomu nejistému vzorku; zachová všechny raw logy. | Musí rozpoznat trvalých300/500ms a skutečný vzestup late/depth, nesmí donekonečna ignorovat zhoršení. Konkrétní okno/quantil až podle kontrolovaných scénářů. |
| Epochová kalibrace jen z kvalifikovaného timing odhadu s nejistotou | Zabrání použití delivery-over-budget sample jako spolehlivé clock kotvy. | RTT policy/clock policy musí být oddělené; nestačí mechanicky odstranit halfRTT. Potřebuje control skutečné stabilní200ms a stará authority. |
| Čerstvý nízko-latenční serverTick interval zjistí clock mimo věrohodné hranice; bounded reanchor/slew | Opraví již existující chybnou epochovou kotvu. | Nesmí opakovat/resend vyřešené seq, změnit fyzikální DT ani trhnout presentation. Pouhá změna max na assignment je regrese. Přímý probe nyní neobsahuje epoch/base ani server monotonic receive/send. |
| Při client-request zachovat clock v globálním server ticku, změnit jen epochový seq origin | Zachová dobře známý čas přes syntaktickou změnu epochy. | Skutečný server-clock-drop/respawn/reconnect musí mít jiný rebase kontrakt; nejistý starý clock se nesmí uchovat navždy. Porovnat s předchozí variantou. |
| Častější poll bez častějšího povoleného send | Může zkrátit dodatečných353–657ms čekání timer fáze. | Stále zbývá1050ms a chybná klasifikace. Jen doplněk, žádné zvýšení serverového limitu ani spam. |
| Jedna recovery transakce / fresh state ve stejné epochě | Omezí nechtěné epochové reakce a vyhazování platných slots. | Samostatný wire/lifecycle scope; respawn a clock-drop se musí zachovat. Neopravuje sám nepravdivý timing odhad. |

Nejmenší praktický profil k určení původního zdržení: zachytit ve stejném authenticated herním spojení bounded nonce/seq, client monotonic sent/callback, server receive/pre-send/send-completion + queued bytes a event-loop delay; současně browser network-frame trace a main-thread task trace. Žádný druhý test socket jako náhrada stejné fronty. Server handler residence tím lze oddělit; k browser queue potřebujeme síťový timestamp mimo JS callback. Vše jen v rezervovaném QA okně, bez permanentního per-frame dumpu. Absent observer a řetězce<50ms úloh musí být samostatné kontrolní podmínky.

## Skutečný výsledek blackbox reprodukce

14.10.2026 **16:28:45.729–16:28:46.374UTC**, příkaz `node --import tsx --test .cache/network-latency-reproduction/reproduce.test.ts`, test runner530.45ms, **3 PASS / 1 očekávaný FAIL, exit1**. Původní výstup `red-01.log` se nepřepisuje; přesné časy a QA gate jsou vedle něj. Před během0 Established TCP4186/2581, žádný candidate JSONL. Úzké TypeScript ověření tohoto cache testu a importovaných skutečných modulů16:30:56–16:30:59UTC, exit0.

Fixture simuluje pouze události a doručování, nikoli renderer, fyzikální svět, skutečný sender či serverový socket. Queue/prediction/epoch/mode/neutral algoritmy jsou importované frozen třídy. Server tick jde přes queue.consume, bez přeskakování. Probe používá skutečnou třídu a injected observer s prázdným bufferem; naměří533.6 a později34ms, obě accepted, overlap0. Žádný limit nebyl změněn. Všechny varianty mají shodnou authority-delay sekvenci; liší se jen přijetím vysoké sondy a epochovou bariérou. Opožděné staré autority prochází skutečnou stale kontrolou.

| Varianta | Čekání frames | Ahead po fresh34ms | Přijaté příkazy po fresh34ms | Výsledek |
| --- | ---: | ---: | ---: | --- |
| stabilní34ms + stejná epochová bariéra | 0 | 0 | 158 | PASS |
| high533.6 bez nové epochy →34ms | 87 | 0 | 158 | PASS |
| high533.6 → nová epocha →34ms | 87 | **153** | **4**, potom žádné | **RED** očekává ahead0 |
| stejný problém + ještě jedna epocha už při34ms | 87 | 33 před resetem | 118 přijatých /0 ahead po resetu | PASS mechanism control |

Stabilní kontrola má kvůli záměrně opožděné epochové bariéře6 wrong-epoch a3 late odmítnutí; netvrdí nulová všechna odmítnutí. Rozhodující očekávání je neexistence trvalého ahead po stabilizaci. High bez epochy má všechna rejection0. V red variantě zůstává clock **10.008 ticku** před skutečným fixture serverem při tick66,146,160,220 i300; při posledním tick300 má server epoch ack240, planner predikuje257 a poslední lead je7. Po čerstvém34ms se tedy stav tváří advanced, ale nově vznikající příkazy už server systematicky odmítá. Posledních118 doručených příkazů v red konci má0 accepted/118 ahead. Následný low-RTT epochový reset v kontrolní variantě sníží bias na0.02 a příjem obnoví. **To není doporučení přidat další reset loop.**

Důkaz rozlišuje dvě závady:

- **A — dočasné vypnutí výroby ovládání:** jediný nejistý raw spike vyvolá87 waiting frames (1450ms) i bez epochy. Po fresh34ms se samo obnoví. To je širší RTT/confidence/lead policy.
- **B — trvalá chybná epochová clock kotva:** teprve současná nová epocha použije spike pro kalibraci; po fresh34ms waiting skončí, ale hodiny a příkazy zůstávají mimo future16. Toto je samostatný menší clock problém. Současný phase fix nemění aniA aniB a reproduktor žádný Game render nevolá.

Počet153 je řízený counterexample, **ne rekonstrukce9 produkčních paketů**. Skutečnou příčinu původního533.6ms delay mezi serverem a browser callbackem tato reprodukce neurčuje. Výsledek opravňuje samostatný runtime taskB před širší politikouA.

## Doporučení pro samostatný malý clock fix

Preferovat nejprve **kvalifikovanou epochovou kalibraci**: vzorek, kvůli němuž planner sám odmítá delivery budget, nesmí současně považovat za spolehlivou half-RTT kotvu. Při takové epoše lze autoritu použít jako potvrzenou dolní časovou hranici a ponechat potřebu kalibrace aktivní; při dalších over-budget autoritách ji nespotřebovat. První způsobilý fresh vzorek/autorita musí dostat právě jednu příležitost normální kalibrace. Raw RTT, deliveryBudgetExceeded a samotné odmítnutí predikce se nemění. Tím se řešíB bez předstírání, že skutečných300/500ms je podporovaných.

Oproti tomu kontinuita globálního server ticku by při čistém client-request přenesla již kvalifikovaný odhad `oldInputTickBase + estimatedSeq` do nové seq soustavy odečtením newInputTickBase. To může zabránit zbytečné změně clock i při běžném resync a je rozumná navazující varianta. **Pro první malý patch má ale širší kontrakt:** musí prokázat, že jde o tutéž místnost a spojitou serverovou osu, nikoli server-clock-drop, reconnect nebo nekvalifikovanou předchozí kotvu. Nynější TimelineAuthority nemá příčinu discontinuity jako povinný kontrakt. Bez přesného předání příčiny není bezpečné globální odhad slepě přenášet přes každou epochu. Respawn mění tělo, ne nutně hodiny, takže ani prosté `resync=true` není vhodné rozlišení. Vybrat continuity variantu teprve tehdy, pokud její menší viditelný zásah převáží nutné API/lifecycle rozšíření.

Obě varianty musí projít stejnými kritérii, bez vyšších limitů a bez úprav raw evidence:

1. Tento původní red přejde na0 trvalých ahead; všechny tři pozitivní kontroly zůstanou. Nekontaminovaný skutečný300/500ms stále zůstane explicitně over-budget — nevzniká falešné ready.
2. Opakované over-budget autority mezi epochou a prvním fresh low vzorkem nesmějí předčasně spotřebovat kalibraci. Stejně funguje první join bez předchozího timing sample, high při bootstrapu, high po již známém clock a neplatný/stale sample.
3. Skutečné symetrické RTT0/34/200ms, asymetrie a jitter,15/60/144FPS, normální client-request, server-clock-drop, respawn a reconnect. Stabilních200ms musí zachovat původní delivery/replay a nesmí být degradováno na nulový one-way odhad.
4. Delayed authority nesmí vracet clock zpět ve stejné epoše. Žádný duplicitně produkovaný/sent tick, žádné nové ovládání do elapsed ticks, jump edge přes neutral prefix zachovaná. Pending/sent frontier má přednost před kosmetickou korekcí hodin; nezrychlovat fixed physics DT ani znovu vykonávat již dokončený tick.
5. Pokud budoucí robustnější estimator opravuje již existující bias, korekce clock a production frontier musí být oddělená. Bounded pause/slew může nechat real server dohnat již vyrobené future seq; nesmí přepsat seq zpět a stejné příkazy opakovat. Taková oprava má navíc měřit trvání pauzy, late/ahead i render continuity. Není nutné ji přibalit do prevence nové špatné kotvyB.

Nejmenší navržený scopeB: `client/network-timeline.ts`, jeho původní testy a nový skutečný TimelineInputQueue regression. `network-probe.ts`/UI/server/protocol/logovací limity zůstanou mimo, pokud zvolená varianta nepotřebuje nový reason-aware kontrakt; pak koordinátor vytvoří širší samostatný task. Testovat také skutečný sender/physics existujícími relevantními kontrolami a potom společný checkpoint. Žádná z variant v této reprodukční rezervaci není implementovaná.

Primární principy ověřené14.10: [RFC5905 §8/§10](https://www.rfc-editor.org/rfc/rfc5905.html#section-8) rozlišuje čtyři timestampy výměny, odhad offsetu/delay a samostatný výběr vzorků; není důvod přepsat hru na celé NTP. [High Resolution Time3](https://www.w3.org/TR/hr-time-3/#monotonic-clock) rozlišuje monotónní elapsed měření a upravitelný wall clock; UTC není univerzální synchronizovaný one-way čas. Pro hru z toho plyne oddělit důvěryhodnost časového odhadu, naměřený RTT a monotónní produkci příkazů, nikoli vydávat RTT/2 za změřenou jednosměrnou latenci.

## Identita použitých zdrojů

| Frozen wave3 soubor | SHA256 |
| --- | --- |
| `client/network-timeline.ts` | `1f238cd7c6fa602e14b7f87cd6527fd6335c8119a5f0d3cbd588007cf461280e` |
| `client/network-probe.ts` | `7b784980bed2173f9372b9cf6f6b2e97047854fe0d8ce8ff3c103dc015d454af` |
| `shared/input-timeline.ts` | `8d9d46f22550157639aeb7f3e4f23e0f88aa9f45416944062d1d5c9c28ab767f` |
| `shared/netcode.ts` | `b92ae0f5937e58e14baf954ef06109c88e7a365e56b87afea371b901a624b532` |

Cache test SHA256 `fcdda75fc78dda916f927c68d39b93ba7ef7c39cb35674797ffbda2f745f1837`. `audit-log.mjs` znovu streamovaně čte původní log, ukládá jen projekci do `log-audit.json` a správně páruje contextAtMs. Finální source/evidence manifest a předání zaznamenávají všechny soubory. Main runtime, snapshot, staré logy, publication WT i nová phase WT zůstaly nedotčené.
