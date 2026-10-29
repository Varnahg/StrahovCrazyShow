# KEY-12/7: izolované ověření fáze skutečné herní interpolace

14. 10. 2026. Snapshot `2aaa3f428bcba9527ab86c61d10cc3b85b40a9a434161683adc7e5fb0bc55e70` má8408 vstupů/511 source-config-test. Proti neměnnému B6 kandidátu `cbc158068138e3454a6959a0d7a945465ea2974e6c246e86ed231abf92a4b5dc` se liší právě4 soubory: `client/game.ts`, `client/network-timeline.ts`, nový `tests/game-interpolation.test.ts` a původní `tests/network-timeline.test.ts`. Engine/IMAGE/glTF kandidáty nejsou přimíchané; dependencies zůstávají původní.

## Důkaz příčiny a změny

Nová regrese volá skutečný Game.advanceSimulation a stejné interpolace, které používá frame. Před funkční změnou, po pouhé mechanické extrakci, bylo5 FAIL/1 PASS: při60FPS nulový posun místo0.2m, při144FPS0.066667 místo0.083333m, zero-step0.008 místo0.048m a dvě waiting větve vracely obraz o0.06m bez fyzikálního kroku. Obnova epochy prošla už před opravou. Testové tělo má konstantní dynamiku; toto není Rapier kontaktový ani GPU experiment.

Timeline nově vrací epoch/aktuální dokončené seq/alpha ze stejného clock a lead vzorku jako plánování kroků. Game sdílí jeden platný fázový záznam mezi místním hráčem/cílem kamery a autem. Stejný pár se nevrací zpět, běžný zero-step se posouvá dál a waiting drží poslední fázi. Skutečný collapse/reconnect invaliduje záznam; offline accumulator a síťové vstupy/lead/recovery/visualOffset politika zůstaly zachované.

## Ověření

- 52 různých cílených Game/Timeline/Rapier recovery/replay/sender testů PASS. Původních5 red pohybových assertions nebylo oslabeno; přibyly lead decrease, timeline instance/setLocalId, pending respawn a offline scénáře.
- Finální narrow TypeScript včetně SDK API consumeru:0 diagnostik. První5 testových typových chyb z redundantních unreachable větví jsou zachované; oprava odstranila jen duplicitní if po status assertion.
- Nezávislý read-only lifecycle review nenalezl nový funkční problém.
- **Celý stabilní checkpoint:892/892 testů PASS, build PASS, celá pnpm test:integration PASS.** Podrobnosti [pipeline.jsonl](pipeline.jsonl) a [checkpoint.json](checkpoint.json). Po validaci511/511 zdrojových hashů beze změny; integrační2568 volný.

Raw výsledky, before kopie a nové delta patche jsou v `.cache/game-interpolation-reproduction/`, `.cache/local-interpolation-phase/` a `.cache/local-interpolation-validation/`. Provozní PID zůstávají pouze v ignorované cache. Před náročnými běhy byla ověřena absence připojené herní relace na4186/2581; neměnný veřejně dostupný testovací build se nepřebuildoval.

## Co zatím není přijato

Tento výsledek neprokazuje skutečné FPS, výslednou kameru v prohlížeči ani odstranění všech korekcí. Změna leadu stále může způsobit burst/freeze, velké resyncy, RTT policy a skládání visualOffset mají další příčiny. Praktická produkční přejímka zůstává otevřená.

Nový phase delta zatím není samostatný commit ani v main: Game/Timeline mají starší předaný V11 feature WIP. Před publikací je potřeba oddělit diagnostický základ a atomický V11 klient/server/SDK celek a teprve pak stageovat nový phase fix. Celý pracovní Game diff se nesmí vydávat za tento malý fix. Přesná nová delta proti wave3 i mechanické reprodukci je uložená; nic se nezahazuje.
