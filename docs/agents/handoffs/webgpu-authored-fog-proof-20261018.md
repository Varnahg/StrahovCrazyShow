# Předání: webgpu-authored-fog-proof-20261018

- Vlastník: webgpu-authored-fog-proof-01a14497-child; příjemce root.
- Pracovní kopie: C:/Users/rezac/.codex/worktrees/webgpu-comparison/StrahovCrazyShow/, codex/webgpu-migration; vymezený výstup .cache/webgpu-authored-fog-proof-20261018/.
- Výsledek: reproduktor s chybějícím skutečným FOG stavem zůstává GREEN; není to vysvětlení zbývající actual GPU rekompilace.

## Volba a rozsah

Z frozen authored-ibl-v2 (source38ec36f9f40df6d3cf0d8c8426cee9d06d5cbc22b12770176062087260f8b22d) je převzatý pouze test game-authored-light-preparation. Klient, shared a node_modules jsou READONLY junctions. Game388caed28049fd41b70d485446de2db65978c75de264949677e6ce486373dd68, helper1b455b8a87995433fdf79e59965d11453fca514fbeb055166ac21283c03c6a18 a opravený Standard core91e9810b0fea2366e407cd58e2cbb1bbde31c39525c03b1aba75efcc5e218f33 zůstaly byte-identické před/po spuštění. Všechny10 pinované vstupy jsou v inputs.json.

Jediná věcná změna fixture je scene.fogMode=Scene.FOGMODE_EXP a density0.0018 před factories/Cinematic/přípravou; report zachycuje mode/density/enabled a replay výslovně vyžaduje FOG define. Všech51 původních assertion callů zůstalo zachováno; přesný AST subsequence check je součástí runneru. Původních41etap,30/90s limity a 1/0/1/0 replay se neměnily. Namísto nové široké fixture je stejný case parametrizován C5 versus native-bootstrap historií (vynechání předchozí updatePreloadVisuals), vždy nad TÝMTÉŽ současným frozenGame/factories; nejde o novou paritu jiné primary source větve.

Alternativa nového renderer harnessu nebo dalšího browser sběru by nerozlišila samotnou chybějící vstupní větev tak úzce. Nezměnily se runtime, shader, cache, readiness, materiály, světelné etapy ani dependencies. Refaktoring se omezil na opakované použití jednoho existujícího case pro dvě inicializační historie a sdílený bounded runner/report.

## Ověření a závěr

Příkaz: node .cache/webgpu-authored-fog-proof-20261018/run.mjs 01. Run2026-10-18T18:08:41Z až18:08:50Z; exit0;11/11PASS,0skip. Log run-01.log, úplný report case/tests/report-fog-01.json, souhrn summary.json. Žádný fullTS/fullsuite/build/integration/GPU/server/install/commit.

Všech4 scénářů (C5/native-bootstrap × low-first/low-last) dokončilo41etap. Tři rodiny skutečně kreslí jen low/vehicle-0 a low/vehicle-1, cap4, po skutečném deferred cleanupu žádný připravenýEffect disposed. Replaycar1/0/1/0 má0/0/0/0 nových programů, přesnou wholedefines/Effect/context reuse a FOG ve všech cílových replayefektech. Původní lifecycle/WebGL cases z kopírovaného testu také prošly.

Nové actual GPU requesty621/622/623 z authored-attribution-1 mají pro odpovídající CPU vehicle etapy shodný celý define text po jediné explicitní normalizaci MATERIALPLUGIN číselného runtimecounteru. Nic jiného se neodstraňuje ani nesortuje; není to shader semantic/pixel equivalence claim. Tento výsledek opravuje chybějícíFOG pokrytí fixture, ale NEprokazuje, žeFOG způsobuje GPU rekompilaci. Naopak se tento problém samotným doplněnímFOG v CPU reproduktoru nereprodukoval.

Omezení: NullEngine/GLSL frontend, synthetic canvas/texture IO a původní collision/presentation seams zůstávají. WGSL/browserstartup historie konkrétních efektů a pixely nebyly prověřeny; nevzniká FPS ani GPU přejímka. Root rozhodne další úzký krok podle stále otevřených3actualglassrequestů.

Všechny vlastní procesy skončily, žádný port/GPU/preview není držen. Claim bude po vytvoření manifestu uvolněn; task Done a integraci určuje koordinátor.
