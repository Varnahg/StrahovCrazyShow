# Předání: webgpu-completion-ui-cleanup-20261021

- Vlastník: webgpu-completion-01a15a3e-ui-cleanup-v1; příjemce: webgpu-completion-01a15a3e-root.
- Pracovní kopie: C:/Users/rezac/Documents/GitHub/StrahovCrazyShow/.cache/player-feedback-20261020; větev codex/webgpu-completion-20261021; výchozí commit589b098cb60fc716247b8ebb3cc42bff7645588e. Aktuální HEAD při předání: 589b098cb60fc716247b8ebb3cc42bff7645588e.
- Výsledek: lokální kandidát opravující doložené UI vlastnictví Room po terminálním startup failure. Bez stagingu a commitu.
- Změněné soubory: client/ui.tsx; tests/room-callbacks.test.ts; docs/performance/evidence/webgpu-completion-20261021/ui-startup-ownership/ (výzkum, původní red a průběžné/final logy, scoped typecheck, manifest); tento handoff.
- Cizí práce: root validation/revisions/spec a souběžný measurement helper zůstaly nedotčené. Primární checkout a ostatní worktrees nebyly upravené. Claim získán před prvním zápisem do vlastního výzkumu i runtime.

## Výzkum, implementace a refaktoring

Podrobné podklady, mechanismus, srovnání všech rozumných variant a volba jsou v ui-startup-ownership/research-and-decision.md. Konkrétní onAuth branch není prokázaná a není prezentována jako příčina. Tokeny ani živý serverový stav nebyly čteny/měněny; zdrojový kód podmínek serveru a SDK byl čten bez runtime dat.

Sdílený disconnectRoom uvolní současný Room ref ještě před consented leave, zastaví connected/send gates, vyčistí input/authority/probe i odvozené player/car/chat/social cache. Explicitní leave používá tutéž síťovou cestu a nadále přepíná do menu. Aktuální startup catch zachová error screen a původní chybu. Room leave reject i synchronní throw jsou zneškodněné bez přepsání startup error.

Startup effect zachytí Room/attempt a vlastní jen svůj Game. Přesný Room guard brání ukončení náhradního spojení, zatímco novější pending join má vlastní attempt a není starým failure zrušen. Catch a effect cleanup neuvolňují libovolný game.current. Stará factory/Game chyba nemůže publikovat error do nového Game; starý onAction nemůže odesílat skrz nový Room. Scéna/engine zůstávají vlastnictvím Game, nevzniká síť uvnitř Game ani další renderer/reconnect framework.

Refaktoring odstranil duplikovaný síťový teardown v leave a sjednotil Game ref disposal uvnitř jediného effectu. Nové operace a snapshot zachyceného Room jsou pouze startup/cleanup práce, bez nové cache nebo hot-path výpočtu. Server onAuth, session tokeny/protokol, Guest isolation a readiness zůstaly beze změny. Přesný QA marker osmi mezer a await g.start(); má stále jediný výskyt.

## Skutečné ověření

Původní UI s novými skutečnými effect fixture regresními případy:2 testy,0 PASS,2 FAIL, protože leaveRequests bylo[] místo[true]. Původní baseline-red.txt je zachovaný. Shell nejprve jen zobrazil pnpm výstup a jeho exit nepropagoval; wrapper exit0 není vydáván za test PASS.

Finální příkaz:

    pnpm --config.verify-deps-before-run=false exec tsx --test tests/room-callbacks.test.ts tests/game-render-engine.test.ts tests/network-input-buffer.test.ts

**64/64 PASS, fail0, skip0, cancelled0, todo0, exit0**, runner2215.0097ms. Vykonává současné skutečné UI callbacky a effect získané TypeScript AST; fake je transport/factory/Game IO. Všechny původní testy zachované. Nové regrese pokrývají factory/start failure, primární chybu, přesný leave count, synchronní/retained callbacks, buffer/send/cache cleanup, deferred handshake/rejoin, aktuální vs náhradní Game/Room, novější pending join, Guest a Room leave throw/reject. Průběžné48/63PASS logy jsou odlišené od konečného64PASS.

Scoped TypeScript noEmit s projektovým tsconfig a rootFiles právě client/ui.tsx + tests/room-callbacks.test.ts:0diagnostik, exit0. Git diff --check: exit0. Samostatná plná sada, build, integrace ani GPU nebyly spuštěny. Marker count1 je v typecheck.json i verification.json.

## Identita a předání

SHA256 kompaktního JSON pole sourceAndTest v uvedeném pořadí: d745e2dd748669cd360d8e1358b0c9839100d00e11e76e17a5b936935ebd6d85.

```json
[
  {
    "path": "client/ui.tsx",
    "bytes": 111772,
    "sha256": "6aa94cf9ecd4278ef68c1e5a98377503f5bd96c667fe51e24e3ef5ac941562fe"
  },
  {
    "path": "tests/room-callbacks.test.ts",
    "bytes": 61570,
    "sha256": "24645eda0e42414f614cc84ecc5cce68a1f0d3143bcd8bbeaa06bb560d701f23"
  }
]
```

Přesné SHA důkazních artefaktů jsou ve verification.json; tento handoff se self-hashuje pouze do tool výstupu. Původní LF a netaskové bajty zachované.

Procesy: všechny vlastní krátké CPU pnpm/Node/TypeScript procesy skončily; žádný port, server, browser, GPU, helper nebo živý child nezůstává. Scoped TypeScript běžel v exec session14752 a skončil exit0. Během rootova10s GPU pilotu nebyly spuštěny testy ani TypeScript; pokračovalo jen čtení/editace až po výslovném uvolnění rootem.

Omezení: skutečný failed-start/rejoin scénář a novou úplnou pipeline provede root na novém neměnném checkpointu, včetně helper/source/bundle identity. Oprava neprokazuje, která onAuth větev způsobila historický reject, ani neřeší obecný reload transport handshake synchronně. Žádný FPS nebo GPU claim tohoto tasku.

Rezervace: po předání konkrétních souborů a úklidu bude uvolněna nástrojem; skutečný release dokládá tool výstup. Stav tasku, přijetí a integraci provádí koordinátor.

## Převzetí koordinátorem

Root převzal doložených10 dirty cest v rezervaci webgpu-completion-01a15a3e-root-ui. Nezávislý čtecí reviewer /root/webgpu_renderer_audit ověřil pouze tento source/test diff proti589b098c a přesné předané SHA; výsledek bez konkrétních nálezů. Root zkontroloval ownership, success/leave flow, exact QA marker a původní64/64/scopedTS důkazy. Opakování stejných cílených testů při převzetí není vydáváno za nové ověření.

Jde o samostatný implementační checkpoint do migrační větve, nikoli dokončenou GPU přejímku či main integraci. Následuje nový úplný neměnný snapshot a skutečný failed startup/rejoin; dosavadní1934/1934 CI platí předchozímu head8d97a47f a tuto novou UI opravu nezahrnuje.
