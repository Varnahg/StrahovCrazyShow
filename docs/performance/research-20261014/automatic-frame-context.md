# KEY-19: automatické snímky a kontext vlastní relace

Průzkum 14. 10. 2026 nad publikovaným `f4f6116c643bf001702f1b96331a3088d1717b08`. Izolovaný převzatý overlay v `key17-ownership-integration`; hlavní dirty wave3 ani hrané preview se nemění.

## Prokázaný mechanismus

`client/main.tsx` spouští recorder automaticky, ale publikovaný `Game.frame()` nevolá `SessionDiagnostics.recordFrame()`. `diagnosticContext` i frame napojení jsou pouze součástí širšího nepřijatého WIP. Recorder a offline čtečka tedy existují, ale hlavní produkční frame producent chybí. Server přes `sendAuthority`/respawn posílá vlastní frontu příjemce a společný room clock; Game síťovou diagnostiku ukládá až po přijetí autority, ale nevydává ji recorderu. Staré/nepřijatelné autority cache nemění.

`setLocalId` resetuje predikci jen při změně identity. Stejné ID musí zachovat frontier, zatímco bind/reconnect/leave musí odříznout diagnostiku předchozího spojení. Samotné vynulování Game nestačí: recorder singleton dosud drží sampledContext, previousFrame a rozpracované okno přes hranice relací. Oddělený recorder task přidává `resetFrameContext()` a invalidaci na lifecycle eventech. Reset musí nejdřív dokončit historické okno, potom vyčistit kontext; nesmí smazat platné uložené důkazy.

## Varianty a rozhodnutí před implementací

1. Zapisovat každou autoritu jako event: nepotřebuje frame napojení, ale přidává přibližně 20 událostí/s, nemá vazbu na aktuální frame-window a vyžaduje další formát čtečky. Zamítnuto.
2. Převzít celý wave3 Game diff: přinese také startup změny, skenování meshů, profilery a změny rendereru. Neodpovídá úzkému zadání ani bezpečnému vlastnictví WIP. Zamítnuto.
3. Samostatný timer síťových snapshotů: vytváří další lifecycle/scheduling zdroj, nesleduje skutečně vykonaný render a nelze jej vydávat za FPS. Zamítnuto.
4. Zvolená úzká integrace: volat existující recorder jednou po skutečném renderu, znovu použít šest existujících CPU timing bodů a skutečný předchozí raw interval. GPU hodnota pouze z nového timer-query count, nikdy opakovaně z cache. Kontext tvoří pevný počet skalárů a bezpečně promítnutá vlastní síť. Žádné scény/avatary/meshe se kvůli kontextu neprocházejí.

Kontext se počítá jen při existujícím bounded sampling recorderu (1 s běžně, 250 ms při hitchi). Při vypnutém recorderu se kontext nevyhodnocuje. Kopie přijaté volitelné serverové diagnostiky má pevný malý rozsah a odpojí zdrojové objekty ještě před jejich možnou pozdější mutací. Whitelist čte vlastní data descriptors, nepouští gettery ani zděděné hodnoty; odmítá neplatné skaláry a zachytí chyby exotických objektů. Žádné tokeny, profily, uživatelské řetězce, ID, hráči či raw payload se neukládají.

## Dopady a omezení

- Změna nemění simulaci, predikci, RTT výběr, autoritu, protokol, svět, materiály ani render nastavení. Diagnostický reset nesmí nahradit `NetworkTimeline` při same-ID reconnectu.
- Guest kontext je `network: null`; transport callback se v guest větvi vůbec nevolá. Dispose a všechny stávající UI RTT reset hranice vyprázdní vlastní síťový kontext.
- `shared/session-diagnostics.ts` má depth <= 8, 96 klíčů/object a 6000 uzlů. Clock scalar v `data.context.network.server.clock` má depth 5, queue.rejected scalar depth 6. Limity se nezvyšují.
- Clock je room lifetime metrika, queue patří vlastní relaci. Čtečka KEY-18 zachová oddělení lifetime baseline od pozorovaných přírůstků. Bez server-instance ID nelze dokázat nezachycený restart; tento úkol jej nepřidává.
- CPU testy ověří produkční Game/recorder/UI datovou cestu a izolaci. Nejsou důkazem výsledných FPS, vzhledu ani GPU výkonu.

## Primární podklady a plán důkazů

Primární implementace: `server/index.ts` sendAuthority/captureNetworkDiagnostics; `shared/network-diagnostics.ts`; `client/game.ts` reconcile/frame/setLocalId/dispose; `client/ui.tsx` bind/connect/leave; `client/room-callbacks.ts`; `client/session-diagnostics.ts`; `shared/session-diagnostics.ts`; `scripts/diagnostics-report.mjs`. Existující skutečné AST UI a Game.prototype fixtures jsou v `tests/room-callbacks.test.ts`, `tests/client-recovery.test.ts` a `tests/game-interpolation.test.ts`.

Nejdřív červený test proti publikovanému producentu. Potom skutečný celý Game.frame s nahrazeným renderingem/IO, reálný recorder a serializované batches; fresh GPU count, disabled recorder, host, accepted/rejected/missing autority, getters/mutace/privátní pole a lifecycle. UI testy vykonají skutečné callbacky včetně same-ID reconnectu a stale room. Závěrečnou celou pipeline a integraci provede koordinátor.

## Výsledky cíleného ověření

- Finální červená kontrola používá přesný `f4f6116:client/game.ts` blob v cache AST fixture (produkční soubor nebyl kvůli kontrole přepisován). Skutečný frame test má 0 uložených frame-window místo očekávaného 1; exit 1. Původní přípravná fixture chyba `exports` byla odstraněna před tímto důkazem; samotný `flush()` neuzavírá rozpracované okno, finální test používá skutečný timer tick.
- Finální `tsx --test tests/game-diagnostics.test.ts tests/room-callbacks.test.ts tests/client-recovery.test.ts`: **49/49 PASS**, exit 0, přibližně 14 s. Log `.cache/game-frame-feature/targeted-final.log`; red `.cache/game-frame-feature/red-production-main.log`.
- Skutečný celý `Game.frame` → recorder → wire validator → in-process lokální collector → disk JSONL → offline report: 3 frame windows, přírůstek 120 callbacků a 283,33 ms, původní baseline 4 000 ms není přičtena. Transport/server privátní extras a local ID se do souboru nedostaly; rejected scalar v hloubce 6 přežil oba sanitizery. Žádný listener/port/server proces nebyl spuštěn.
- Reálný Game/Rapier acceptance test odhalil další vazbu: `NetworkTimeline.acceptAuthority` kopíruje anchor spreadem. Game nyní předává pouze jeho šest frontier/time skalárů, takže optional network getter se nespustí ani na accepted větvi a raw physics/diagnostický packet se v timeline nedrží. Test potvrzuje přijetí korekce i s vyhazujícím optional getterem, nulový počet getter volání a ignorování stale autorit.
- CPU hodnota používá jeden koncový okamžik po labels; součet šesti fází přesně odpovídá této hodnotě. Není to čas celého callbacku včetně následujícího HUD, benchmark bookkeeping a recorderu. Adaptivní `lastCpuFrameMs` zůstal na původním místě.
- Samostatný reviewer přidal adversarial projekční testy; jeho výsledky a předání jsou oddělené. Zde nebyla spuštěna plná sada/build/multiplayer integrace ani GPU.
