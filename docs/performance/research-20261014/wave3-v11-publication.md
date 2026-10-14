# Publikace původního wave3 V11 celku

14. 10. 2026, `publish-01a13624-v11-20261014`, publication WT na `5f9b011f2f65ffeaab1c16754f37a4ff8c5771d8`. Rozhodnutí je zapsané před source přenosem. Zdrojem je immutable wave3 snapshot `0f20b5a7c7ba9ce5ab9aa16bba3b0a6886823152a322be2724fd2cdad41d6248` v hlavním checkoutu. Nejde o nový návrh síťového protokolu ani o pozdější opravu renderové fáze.

## Primární podklady a vazby

Audit přečetl skutečné diffs/imports vůči5f9, frozen source-manifest a vlastní handoffy `repair-network-transport-timing`, `repair-input-timeline-primitives`, `repair-network-v11-server`, `repair-network-v11-sdk` (včetně opravy holdUntil po integračním failu), `repair-live-network-timing`. Mechanismy a limity jsou už popsány v původních `repair-network-cause.md`, `repair-live-network-audit.md` a `netcode-camera.md` v hlavním checkoutu; neprohlašují všechny correction/RTT problémy za vyřešené. Installed dependency verze i helpery zůstávají vlastním frozen node_modules publication WT.

Atomická dependency closure má **17 runtime +15 test/fixture cest**, přesně podle task JSON. Runtime: Game/UI, čtyři client moduly (timeline/input-buffer/probe/authority-buffer), tři shared (netcode/input-timeline/network-diagnostics), server index/respawn, šest scripts (timeline-client, integration, integration-network, integration-input-backlog, integration-respawn, performance-network). Testy: network-timeline, network-input-buffer, network-probe, authority-buffer, input-timeline, network-diagnostics, input-backlog, server-respawn, timeline-sender, timeline-physics, timeline-client, client-recovery, prediction-replay, helpers/prediction-replay-fixture, room-callbacks.

Read-only závislosti již v5f9: shared types/physics/vehicle/simulation/controls/motion-codec, server session-lifecycle, client room-callbacks, diagnostický recorder/sanitizer/server sink. Žádná z nich nepotřebuje pro V11 další změnu. V11 Authority povinná epoch/base/receivedSeq pole vyžadují aktualizovat všechny příslušné testové authority fixtures a SDK producenty současně.

## Varianty oddělení a volba

| Varianta | Cena/riziko | Volba |
| --- | --- | --- |
| Převzít celý Game/UI z wave3 | Snadné byte porovnání, ale přibalí deferred startup, avatar readiness/editor, light guards, mesh profiler a render instrumentation. | Zamítnuto. |
| Rozdělit wire/server a klient/SDK do nezávislých publikací | Mezistav neumí bezpečně posílat scheduled V11 inputy ani interpretovat advancing ack. | Zamítnuto; společný atomický celek. |
| Vytvořit nový V11 návrh nebo rovnou phase fix | Mísí historicky ověřený kontrakt s další behavior změnou; neoddělí příčiny a commity. | Zamítnuto. |
| Byte převzetí15 čistě síťových runtime souborů a15 fixtures, parsovaný výběr Game/UI | Malý kontrolovatelný rozdíl, zachová původní V11 a legacy render fázi. Vyžaduje explicitní test skutečného callback wiring. | Zvoleno rootem. |

Server/probe/input queue a SDK budou převzaty celé po SHA kontrole. Zachová se seq=tick-offset v epochě, resolved ack postupující i bez inputu, neutral missing/mode kroky, maximálně16 future/32 replay,60Hz svět/20Hz authority, priority první sender batch při rolling rate limitu, stejný UTC simtime i motion/authority, clock-drop epoch barrier, raw RTT evidence a probe cooldown od reply. Bez fallbacku na V10 a bez nových limitů/politik.

## Přesný Game/UI výběr

Game: import sessionDiagnostics/NetworkTimeline/TimelineInput; complete vehicle comparator včetně q/−q a occupancy driver normalizace; network callbacky/stav; reset timeline při nové identitě; motion counters; celý V11 reconcile/replay/priority reset; plain Vec3 interact event a respawn action event; skutečný advanceSimulation z wave3; frame drain před simulací a flush na jejím konci. Odstranit starý render-stall blur/resync a původní FIFO frame loop. **Ponechat původní inline accumulator interpolaci**, žádné presentation API, phase cache ani nově extrahované phase metody.

Z reconcile/interact se vynechá jen `pendingMeshDrawReason`, protože patří odloženému profileru. Nepřebírat avatarSetupReady/pendingPlayers ani early return updatePlayers: bez staged startup by avatary zůstaly zablokované. Nepřebírat světla, constructor/startContent/createWorldBuildJob, žádný full diagnosticContext/recordFrame ani profiler/benchmark změny. Síťové counters/hook jsou připravené pro pozdější kontextovou instrumentaci; tato publikace ještě neslibuje kompletní frame telemetry.

UI: input sender/authority/bootstrap/probe refs a jejich vlastní lifecycle; applyReceivedAuthority s host/network/ready guardem a acknowledge až po přijatém reconcile; drainAuthorities; syncNetworkStage; původní frame/timer flush; jeden probe timer s ready/guest guardem; skutečné g.onInput/onInputFrame/onBeforeInputFrame/onNetworkDiagnostics/onPredictionReset vazby; bootstrap drain+RTT po startu; vlastní room events a reset při leave/nové identitě. Zachovat malý `game-ready` event až po úspěšném nezrušeném `await g.start()`, jinak recorder report bez frame dat může herní relaci označit za menu. Žádné startupPhase měření, editorOpened state, avatar panel lifecycle, obecné UI diagnostické markup nebo lighting/profiler úpravy.

## Ověření a artefakty

Před přenosem ověřit SHA všech32 zdrojových cest proti frozen manifestu. Uchovat frozen originály a base Game/UI ve vlastní cache. `assembly-output.json` musí obsahovat baseHead, manifestSha256 a entries `{file,sourceSha256,headSha256,actualSha256}`; nově přidávané cesty mají headSha256=null.30 čistých síťových/testových kopií mají zůstat byte-identické, pokud přímý kompoziční důkaz nevyžaduje výslovně zdokumentované fixture rozšíření.

Testy room-callbacks navíc vykonají skutečné AST assignmenty UI hooků a relevantní Game frame/simulation cestu; pořadí drain→simulation→flush se nesmí dokazovat ručním zapojením falešných hooků. Skutečný mode lifecycle effect ověří game-ready pouze po úspěšném nezrušeném startu. Původní wave3 assertions zůstanou beze změny.

Povolené jsou cílené CPU testy a projektové typy, vždy po ověření neaktivity portů4186/2581 a absence nových herních JSONL. Žádné služby, integrace, build, fullsuite nebo GPU. Root po předání zmrazí přesný32-path feature delta, zkontroluje ostatní source Git blobs a provede samostatnou full pipeline/commit. Původní hraný candidate a ostatní worktrees zůstávají beze změn.

## Sestavený výsledek

Všechny32 frozen vstupy prošly SHA porovnáním před přenosem. Jednorázový `.cache/wave3-v11-publication/assemble.mjs` uložil originály a base soubory;15 čistě síťových runtime cest a15 fixtures nejdřív převzal byte-exact, Game/UI složil podle AST členů/statementů. Script po existujícím assembly manifestu odmítá opakovaný start, aby nepřepsal pozdější ověřené fixture rozšíření. Žádný shared physics ani nesíťový renderer/editor/startup modul se nepřenesl.

Finálně je **29/32 cest byte-identických s frozen**. Výjimky jsou vybraný Game, vybraný UI a rozšířený `tests/room-callbacks.test.ts`. Game/UI zachovávají starou inline accumulator interpolaci i původní constructor/startup. Klient obsahuje malý game-ready event po await a cancellation guardu; plný frame/context recorder je výslovně odložen. Síťové eventy, raw RTT, own-authority counters a onNetworkDiagnostics hook jsou zachované; tento mezistav ještě neposkytuje plný frame profil.

Room fixture nyní sdílí jeden VM transpiler/context, vyjímá skutečné UI hook assignmenty z konkrétního lifecycle effectu, spouští skutečný souvislý Game.frame prefix až po advanceSimulation a celé skutečné advanceSimulation. Výběr nezkonstruuje nové pořadí hooků. Test zaznamená skutečný drain→actor.step→sim.tick→sender.flush:frame a ověří odeslaný input ve skutečném FrameInputBuffer. Další čtyři případy spouštějí celý skutečný lifecycle effect s jedinou substitucí dynamického importu Game: success/failure/cancel-success/cancel-failure. Všechny původní19 room assertions scénáře zůstaly; nové5 je doplňuje. Původní fixture source je ve vlastní frozen cache.

## Skutečné ověření

Před všemi CPU běhy a závěrem14.10.16:37:25UTC bylo0 Established na4186/2581 a žádné candidate game-diagnostics. Neběžel nový server/browser/GPU, full suite/build/integrace ani instalace. Všechny výstupy mají skutečný child exit code v metadatech pod `.cache/wave3-v11-publication/`.

| Skupina | Výsledek | Evidence |
| --- | --- | --- |
| netcode, input-timeline, network-diagnostics, input-buffer, probe, timeline, authority-buffer, timeline-client, timeline-sender | **56/56 PASS**, exit0,16:27:30.061–16:27:38.245UTC | `primitives-01.*` |
| Skutečné UI subscriptions, bootstrap/guest/probe, nové frame hook a lifecycle regrese | **24/24 PASS**, exit0; po jediné type anotaci znovu24/24 | `room-wiring-01.*`, `room-wiring-02.*` |
| client-recovery, prediction-replay, input-backlog, server-respawn, timeline-physics | **33/33 PASS**, exit0,16:32:44.090–16:33:28.799UTC; skutečné Rapier recovery/contacts a časové regrese | `game-physics-01.*` |
| Projektový `node node_modules/typescript/bin/tsc --noEmit --pretty false` | První běh exit2, jedna TS7006 v novém mock callback parametru; přidán `Parameters<FrameInputBuffer['flush']>[0]`, žádná assertion odstraněna. Opakovaný stejný příkaz **exit0**,16:35:57.419–16:36:24.268UTC | `types-01.*`, `types-02.*` |

Celkem **113 různých cílených testů PASS**. Opakovaných24 se nepřičítá jako nové pokrytí. Jediný první type failure je zachovaný, nebyl přepsán. Scoped git diff whitespace kontrola exit0. Root průběžně přečetl Game/UI výběr a nenašel konkrétní kolizi; finální přejímka/commit patří jeho samostatné pipeline.

## Identita předávaného celku

- `baseHead`: `5f9b011f2f65ffeaab1c16754f37a4ff8c5771d8`.
- **Vstupní** `sourceManifestSha256`: `7e13ccbad545087657995e7eb02d618a2203392b2a6f6fda11d70c635a94b8a4`.
- `assemblyEntriesSha256` (JSON.stringify finálních32 entries v pořadí tasku): `efb05554cb033b7d4f3882d56f69c703cb52115793e99b9f52cd0abba6924ff7`.
- **Výstupní celý** `.cache/wave3-v11-publication/assembly-output.json` SHA: `507eb1326bbb4aefc9aaa0cbc6672bc16c387c62c7f938a23d217c158fbbad3c`. Obsahuje per-file sourceSha256/headSha256/actualSha256, výslovné rozlišení input manifestu a entries hash. Starý `manifestSha256` je pro kompatibilitu ponechán jako pojmenovaný alias vstupního manifestu, nikoli výstupní identita.
- `.cache/wave3-v11-publication/feature-against-head.patch` SHA: `51150fd74267caecc1f9fbfca67bd0f6b4e49516baf5663290904466d783c592`; obsahuje pouze32 feature cest včetně16 nových souborů, ne cizí task/architecture metadata. Index se neměnil.

Root má ověřit celý výstupní assembly hash a každou actualSha před freeze, poté všechny ostatní source Git blobs proti base. Vstupní frozen snapshot ani živý B6 candidate se neměnily. Nový phase fix z wave4 není v tomto celku; zůstává až následující samostatnou změnou.
