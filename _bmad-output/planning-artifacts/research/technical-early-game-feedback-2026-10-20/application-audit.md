# Lokální primární audit — KEY-51

Datum:2026-10-20. Čtecí audit, nikoli GPU přejímka. HEAD main22de9054f8151227efab12b807f4d9c3ade079d3. Game/UI jsou cizí dirty WIP; následující pozorování patří přesným přečteným bajtům, ne tvrzení o nasazené hře. Žádný hraný klient nebyl otevřen ani změněn. Pro skutečnou pozdější přejímku je nutné ověřit URL, client build identity a immutable snapshot včetně testů.

## Doložené mechanismy
| Tvrzení | Primární soubor a místo | Dopad |
|---|---|---|
| Herní canvas je sourozenec React HUD prvků a formulářů; jmenovky jsou DOM vrstva | client/ui.tsx1102–1202; client/labels.ts55–76 | Canvas-only copy vynechá současný HUD, chat, minimapu i jmenovky; nemusí se žádný HUD schovávat ani překreslovat. Ověřit obrazem na všech podporovaných backendech. |
| WebGL má preserveDrawingBuffer:false | client/render-engine.ts177–191 | Náhodný async screenshot v onclick není bezpečný kontrakt pro živý buffer; kopii naplánovat v render lifecycle. Trvalou změnu bufferu pro vzácné reporty nedoporučujeme. |
| WebGPU a fast režim jsou explicitní a pouze loopback; default je webgl2 | client/render-engine.ts18–38 | WebGL2 i rozpracované WebGPU musí mít oddělenou přejímku; současný kód nedokazuje default veřejného nasazení. |
| Game renderuje scénu a potom DOM labels; engine zakončuje frame vně Game callbacku | client/game.ts3154–3181; @babylonjs/core/Engines/abstractEngine.pure.js438–450 | scene.onAfterRender není automaticky potvrzení WebGPU submission. Metadata musí patřit stejnému snímku jako kopie. |
| WebGPU endFrame flushuje command buffery před super.endFrame→observable | node_modules/@babylonjs/core/Engines/webgpuEngine.pure.js2350–2370; abstractEngine.pure.js398–400 | Konkrétní onEndFrame hook má ve zdejší pinované verzi oporu, ale veřejný runtime je třeba přezkoušet. Submission neznamená dokončenou GPU práci ani nulový stall kopie. |
| Současný recorder start na veřejné hostname vypne; server rovněž vynucuje loopback+same origin | client/session-diagnostics.ts128–137,219–225; server/session-diagnostics.ts146–178,220,402–415 | Nepovolovat veřejný feedback pouhým odstraněním bezpečnostních kontrol diagnostiky. Nový endpoint s vlastním schématem, kvótami a persistentní frontou. |
| Recorder má bounded queue a stav retry/dropped; po náhlém pádu nejsou všechny tail záznamy zaručené | client/session-diagnostics.ts20–35,230–241 | Nepsat uživateli, že máme celé poslední období, pokud existují mezery. Současný recorder není automaticky veřejný30s ring. |
| Technická sanitizace vynechává citlivé klíče, ořezává query/fragment/token | shared/session-diagnostics.ts30–114 | Uživatelský popis/kontakt patří do samostatného feedback payloadu, ne obecného diagnostics.event. Technický allowlist zůstává oddělený od vědomě zaslaného textu. |
| Game diagnosticContext je sampled a zahrnuje simulation position/pose, performance a network | client/game.ts2234–2300 a následující; recordFrame3203 | Sampled context není přesná identita vykresleného framebufferu. Capture musí freeze render pose+frame separately. Host network vrací null. |
| Game.setUiModal zruší held input a pointer lock | client/game.ts348–366 | Formulář lze napojit na stávající vstupní kontrakt. Nezastavovat společnou multiplayer simulaci. Auto pokračování/lock bez kliknutí se neslibuje. |
| Všechny jiné /api cesty jsou403; globální handleApi nastavuje CORS* až po lokálních diagnostických handlerech | server/index.ts548–634 | Veřejný feedback musí mít vlastní origin policy/route před generickou větví, nikoli přístup do místností nebo důvěru v klientské teamId/status/URL. |

## Čtené existující WIP — ne převzetí
C:/Users/rezac/.codex/worktrees/playtest-diary/StrahovCrazyShow; odečtený HEAD0a598a6a5db4bb4e81469543c72b96b5d88720ed a relevantní dirty status. Rezervace media/timeline/report/integration jsou stále cizí i při stale heartbeat. KEY-21 obsahuje přijaté požadavky, ne důkaz integrace. Capture source SHA-256 cf408483376eaa0303b2fcab9027305354a9d89c74d654954d693a2a08a164c8; fake-canvas test SHA-256 bc779a567ab8a927bd0eb2d20ec3e68633adcdad7f266eaebe6855de4b94a880.

client/playtest-capture.ts: onEndFrame observer, request/copy/saved handles, freeze frame+camera metadata,2D drawImage pouze zdrojového canvasu, bounded queue8/32MiB a jedna komprese, WebP1280/.9 a full PNG, kontrola null/MIME, hash/receipt/retry/timeout/dispose. tests/playtest-capture.test.ts mají fake engine/canvas; jejich čtení nepotvrzuje skutečný WebGPU output. client/playtest-diary.ts dodává submitFrame a capture request. Současné rozpracované Game zapojení a starší base nelze slepě kopírovat do novější main.

Doporučení: dohodnout převzetí/reuse této capture primitive s vlastníkem KEY-21, nebo úzký společný interface v navazujícím tasku. Feedback nesmí spustit paralelní nekontrolovaný capture+encode pipeline ani přebírat automatický diary upload celého hraní. Právě vyžádaný jednorázový snímek bude povinný default; failure nezablokuje popis.

## SHA-256 čtených souborů
| Soubor | SHA-256 |
|---|---|
| client/ui.tsx | f417a1466c0ec321c0e0753d365384a0ad8a1554e31e3771d00eab4897aabe36 |
| client/game.ts | 388caed28049fd41b70d485446de2db65978c75de264949677e6ce486373dd68 |
| client/render-engine.ts | 23d9fd28e21d4a176dd653c29b4eed14f8980ffb1d17137fd11fc76a9f82e23d |
| client/labels.ts | 12b63aaeeb9e5b1eed53dc65b78bc4f345ec7d5fb84147f8bb6d8b5ba0730d87 |
| client/session-diagnostics.ts | 87ceadf7be528b9e7210bba6415880c2dc37706c6b6118cd51d25183b3a1ad4c |
| server/session-diagnostics.ts | d06d3c123b60957ac4c6e834fe2d69d56008b60ddcee13ec87b648a24913c1f6 |
| shared/session-diagnostics.ts | ad1850d3e1409beaa2374dfa67c6a6d7a8d8cbab159da2a774c66dd4d436fe1f |
| server/index.ts | 8432ef8ba57912596a2fce5feb7ba1fbb6e67d42456ba6ac1d4e9482ba2a2723 |
| client/render-health.ts | 7a5027922feb2292e9238917a7af58a2371187446d8cc36f0324562e49d583a4 |

compose.yaml má jednu službu game bez persistentního volume. Doporučený serverový spool proto vyžaduje samostatné zajištění persistence přes znovuvytvoření kontejneru; současný HTTP receipt to automaticky nedokazuje.

## Co audit neprokazuje
Doba kopie/encode, stally, memory peak, barevná věrnost, CORS taint reálných assetů, správný celý snímek postprocessu na WebGPU, fungující upload do Linear ani spolehlivé background retries. Nebyl proveden GPU test, změna kódu, build ani síťový produkční pokus. Před implementací zůstává volba persistentního deployment volume/store a skutečný oprávněný Linear credential.
