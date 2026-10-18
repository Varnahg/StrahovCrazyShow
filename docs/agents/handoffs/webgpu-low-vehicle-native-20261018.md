# Předání přípravy světel auta

Koordinátor a příjemce `/root`, owner `webgpu-low-vehicle-native-01a14497-root`; Game patří také aktivnímu `webgpu-migrate-root-20261016`. Přesně čtyři soubory: `client/game.ts`, `client/light-preparation.ts`, `tests/game-light-preparation.test.ts`, `tests/game-low-vehicle-preparation.test.ts`.

Runtime commit `a86136ef6183c4319cce0bb41b5ed638542b0d3e` je integrován do main jako `42f7336f7e3bf9e651e6ee921ef9dad63cf580cd`. Dva kombinované source/test soubory zachovávají cizí rozdíly a dalších 132 pracovních cest zůstalo beze změny. [Přijetí a omezení](../../performance/evidence/webgpu-migration-20261016/low-vehicle/README.md).

- Dvě skutečné vehicle etapy pouze pro low WebGPU, před původními etapami; životnost a obnova konkrétních car/parked uzlů. Původní časové limity, úplná readiness, latest settings i finální draw zachovány. Žádná nová cache, žádné přepnutí výchozího rendereru.
- P2 z prvního review (zánik jediného leased rootu) opraven a reprodukován regresí; závěrečné V2 i native transfer review bez nálezů. Přenos prokazuje totožnost metody a opačnou aplikací obnovu celých původních native souborů. Refaktoring sdílí acquire/restore lease a původní environment update.
- Native targeted 49/49, related 26/26, scoped TypeScript 3361/0. Clean `9b58c828897da633b06f13b41d559de818bb2bf9b7614b54acf23fbae7f3c88c`: 1387/1387; combined `5c6b36ad783a332030bf21f25344d17b43e6ea0005c9f0bb5a754bae7444c483`: 1447/1447. Oba full TypeScript/build a izolovaná integrace PASS, žádné skipy nebo drift.
- Edge A1/B1/A2: 24/8/24 modulů, 15/6/15 pipeline; max 803,7/424,1/865,7 ms. P95 se nezlepšil, počet snímků ≥100 ms neklesl. Nejde o přijetí celé migrace. Přesné rozlišení, odlišné konce tras a zapnutá diagnostika jsou uvedeny v evidenci.

Všechny vlastní testovací procesy skončily, QA 4194/2589 je zastavené. Hrané snapshoty se nezměnily. Nový 4197/2592 spravuje samostatný user-build task. Tato native rezervace se po předání uvolňuje; root migrační rezervace a celkový cíl zůstávají aktivní.
