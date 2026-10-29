# Předání: webgpu-completion-routine-cost-20261021

- Vlastník: `webgpu-completion-01a15a3e-routine-cost`; příjemce: root koordinátor.
- Worktree: `C:/Users/rezac/Documents/GitHub/StrahovCrazyShow/.cache/player-feedback-20261020`, větev `codex/webgpu-completion-20261021`, baseline `27055e8b`.
- Výzkum/rozhodnutí před implementací: `docs/performance/evidence/webgpu-completion-20261021/routine-cost/README.md`. Všech19 frozen v4/helperc951 souborů ověřeno před prvním zápisem; live build63ca zůstává pod rootem.
- Cizí WIP při převzetí: validation handoff, docs/verification.md, ci-07c15f34.json a focused-baseline-control-1/; nepřevzato, neupravováno.
- Výsledek: implementace, cílený refaktor a CPU ověření dokončené; připraveno pro nezávislé review a fresh root build/GPU přejímku. Žádný runtime/source snapshot/build/server/GPU/commit změněn nebo spuštěn.

## Přesné změny

Pod `docs/performance/evidence/webgpu-completion-20261021/measurement/`:

- nové `routine-cost-core.mjs`, `routine-cost.mjs`, `routine-cost.test.mjs`;
- změněné `common.mjs`, `harness.mjs`, `qa-overlay.mjs`, `receipt.mjs`, `helper.test.mjs`, `weather-latency.test.mjs`, `shader-attribution.test.mjs`, `README.md`;
- ostatní soubory measurement beze změny. Stávající immutable attempt queue, clock, weather a shader runtime zůstaly beze změny. Tři existující test fixtures pouze získaly nový povinný canonical boolean; původních83 scénářů zůstalo zachováno, doplněno17 nových.

Pod `routine-cost/`: `README.md`, `verify.mjs`, `helper-before83.tap`, `helper-tests.tap`, `syntax.log`, `verification.json` a zachované vývojové/neúspěšné logy `helper-before-missing-loader.log`, `routine-development1.tap`, `helper-development2.tap`, `helper-development3.tap`. Tento handoff je jediný další vlastní soubor. Dirty cizí paths nejsou součástí předání.

## Rozhodnutí a refaktor

- Rebase donor rawSHA `ee3c3280de69ee61dcbf433dcf2a259d07a4efa80a711f822056da331168289f` do čistého bounded timer core a malého actualScene adapteru. Přesných8 metod, stack32,8 native frame-progress calls,100000 selected calls/frame,128 phase enters/frame,64 ObjectRenderers. Row pouze scalar routine/phase/calls/false/throw/time; bez shaderů/defines, per-mesh observerů a nových GPU/readiness/render volání.
- Receiver filter se týká pouze vlastněné skutečné Scene a jejího engine; cizí scény jdou přímo do originálu. Jeden dodatečný actualScene.render boundary wrapper řídí původní volání, nepřidává render. Idle/foreign větev nepoužívá clock ani phase accounting. Original this/return/throw/Promise zůstává zachováno.
- UI explicitní `--routine-cost` defaultoff, nový samostatný8-frame button po startup ACK a durable `routine-cost` diagnostic receipt. Canonical input/browser/bundle seal zahrnuje povinný boolean a nové helper/pinned dependency SHA. Tento build včetně případného10s benchmarku je diagnostic, nikoli plain FPS A/B.
- Restore respektuje vlastněné descriptor flags; foreign replacement zůstane a zneplatní evidence. Abort/dispose/retirement/rejoin/deadline/partial frames nezahazují pokus. Restore i reporting běží po bounded původních voláních; nevytváří se trvalá mesh/material cache.
- Phase `active/main/rtt/other` znamená innermost původní public scope; inclusive a selfSelected mohou překrývat jiné intervaly. SelfSelected odečte pouze vybrané děti. Unselected frustum/reset/sort/engine/custom-material práce je residual, ne údajná nula.

## Ověření a identita

`node docs/performance/evidence/webgpu-completion-20261021/routine-cost/verify.mjs` dokončen `2026-10-21T15:29:54.790Z`, exit0. Spouští pouze přesných6 helper test souborů přes `node --import tsx --test --test-reporter=tap`, nikoli plnou sadu projektu. Výsledek100/100 PASS,21MJS `node --check` exit0, původní aktuální UI SHA ověřen bezprostředně před/po exact transform+TSX parse (0diagnostics), git diff--check exit0.16 runtime/config souborů,11 pinned souborů a22 helper souborů před/po beze změny. Nové CPU fixtures používají skutečné Scene/Mesh/PBR/Standard/ObjectRenderer/Texture na NullEngine; nejde o GPU/performance výsledek. Native Texture bez terminálního GPU resource dává původní readiness=false; samostatná fixture původní texture readiness hází stejný Error a přes PBR/render řetězec je zachována a změřena.

- helper SHA: `3673a9e445bde2c187380c0660d0d9b101d6be0c8152308b366369984a877a63`
- `routine-cost-core.mjs`: `89391fd7e7699a4a194e3773dd138ab3aab2be15baca340322d4cce4e174a728`
- `routine-cost.mjs`: `ab09861aa008f82aee91c0ae48a2ba36dede1fdfb07e13c1ae0b221f907efe33`
- `routine-cost.test.mjs`: `f3277957c66cf1c150ea9280aa14330cc96d244a41643716ff2622688cba8b82`
- `qa-overlay.mjs`: `62adc4b694af71a795b2cec9ba6a4ab6666127d2d9d785abe5f93e13fa86acd6`
- manifest `routine-cost/verification.json`: `15c2213c13fd4840c760c12a74a02718219f8f17ef4fe881df828018ce199ea5`
- final TAP: `3593e5cd1f18a334e6b83e1e34407790989850835d36515dc9ce3cb3f7e0631a`
- syntax log: `0e88c21b7a77fc2f21b743b2f419657bac6dd7c46acf64bf1c0b7e139bc6b209`
- historical before83 TAP: `0ab12e5cc1589ce26dc60ca935d571ca6098d78999099f29ad754287a113eb7e`; baseline helperc951/frozen19 identity je v manifestu odděleně od nových bytů.

První chybný Node strip-only příkaz neměl existující tsx loader, proto selhal na Simulation parameter property. Další vývojové chyby byly test fixture zápis getter-only UniformBuffer.isSync a chybějící nový canonical boolean ve staré fixture; opraveno v testech, původní failure logy zachované. Nejde o zatajené GPU běhy. Poslední100 proof je nad finálními bytes.

## Procesy, rezervace a další krok

Vlastní CPU pomocné procesy jsou dokončené (včetně exec session96250), žádný vlastní běžící proces, port, build, server, browser či GPU zdroj není ponechán. Žádné staging/commity. Závěrečné release CLI následuje bez dalších zápisů do scope; skutečný výsledek bude potvrzen koordinátorovi a živým registrem. Release není integrace ani Done celého KEY-22.

Root/renderer peer dostali stabilní přesné SHA k read-only review. Root vlastní přijetí, nový frozen build/URL identity, skutečný8-frame diagnostic a oddělené plain10s/obraz/movement GPU ověření i main integraci. Jeho existující helperc951/build63ca zůstal neměnný. Nový helper nesmí být použit k relabelování původního buildu.

Root převzal22dirty cest po doloženém release autora, znovu přepočetl source/pin/helper/TAP/syntax SHA proti finálnímu proof15c2213c a nezávislému čistému review. CPU100/100 a syntax21/UIparse0 přijaté; actual8frames ani FPS přínos tím nejsou přijaté. Stávající nativeGame mezitím odhalil samostatný NCM buffer-after-destroy blocker a jeho důkazy jsou oddělené.
