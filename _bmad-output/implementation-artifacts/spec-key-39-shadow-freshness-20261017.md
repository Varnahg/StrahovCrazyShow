---
title: 'KEY-39: správné světelné vazby stínů a bezpečný konec vadného rendereru'
type: 'bugfix'
created: '2026-10-17'
status: 'in-progress'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: '5cdb14e25afbdf83a9f5fa0707b31fed5caea184'
baseline_worktree: 'C:/Users/rezac/.codex/worktrees/webgpu-comparison/StrahovCrazyShow'
workflow_project_commit: '1377f133c8553c90e9fa57501dd535f67e7c2ee3'
context:
  - '{project-root}/AGENTS.md'
  - '{project-root}/docs/agents/bmad-policy.md'
  - '{project-root}/docs/agents/tasks/webgpu-shadow-freshness-20261017.json'
  - '{project-root}/docs/agents/tasks/webgpu-render-failure-20261017.json'
  - '{project-root}/docs/agents/tasks/webgpu-shadow-integration-20261017.json'
  - '{project-root}/docs/agents/tasks/webgpu-manual-frame-failure-20261017.json'
---

<frozen-after-approval reason="Oprava doložené chyby v uživatelem autorizované úplné migraci KEY-22">

## Intent

**Problém:** Při uživatelském přepnutí quality/času/svítilny C4 svázalo sun UBO80B se stínovým shaderem vyžadujícím96B. Následný chybějící buffer vyvolal TypeError, zastavil snímky a nechal UI `ready:true`. Neplatné vykreslování nesmí být vydáváno za hratelný svět.

**Přístup:** Před shadow draw zajistit aktuální základní materiál a shodu skutečných světelných slotů. Při přesto vzniklém terminálním render faultu invalidovat vlastníka a UI, zastavit další GPU práci a umožnit bezpečný nový vstup.

## Boundaries & Constraints

**Vždy:** zachovat materiály, geometrii, stíny, shaderový záměr, instancing, vlastnictví passů a původní exception identity. Změny jsou per-engine/per-wrapper; žádná globální atribuce cizích chyb. Hrané snapshoty a cizí WIP zůstanou beze změny.

**Nikdy:** vypnutí cache/stínů/validace, umělé zvětšení bufferů, globální změna hot swappingu, opravný flush/endFrame po vadném snímku, tichý WebGL fallback nebo přijetí invalidního FPS běhu.

## I/O & Edge-Case Matrix

| Stav | Vstup | Očekávané chování | Selhání |
|---|---|---|---|
| Změna světel | Shadow-first HEMI/POINT→DIR,4→3sloty,off-camera/LOD | Aktuální base/depth efekt a správné BindLights sloty | Pending či nesoulad nepustí draw |
| Vlastnictví |2generátory,pass9/10,frozen/hot swap | Nezměněný pass/override, stabilní vlastní efekty | Neznámé typy konzervativně odmítnout |
| Celý snímek | Throw v beginFrame/callback/endFrame/submit | Jediný terminální render fault, původní throw | Reporter nesmí nahradit chybu |
| Terminální stav | Validation/device/render fault nebo restore | Game/UI nejsou ready, vstupy/benchmark zastavené | Bez dalších resize/quality GPU operací |
| Ukončení | Dispose,novývlastník,thenable,cizíengine | Cleanup pouze vlastních hooks a generace | Žádné čtení then/Promise modifikace |

</frozen-after-approval>

## Code Map

Runtime WT: `C:/Users/rezac/.codex/worktrees/webgpu-comparison/StrahovCrazyShow`; níže relativní runtime cesty. Původ chyby je exact combined-v4 s readonlydependencies-v5. Oficiální npm9.30 tarball má správnou lockfile SHA512; UniformBuffer/DrawWrapper jsou byte-identické upstreamu.

- `client/vegetation.ts`: dosavadní non-standalone ShadowDepthWrapper PBR stromů; integrační factory beze změny assetů.
- `client/webgpu-shadow-readiness.ts`: nová úzká factory; pinned wrapper/material/BindLights jsou čtecí závislosti, bez úpravy balíčku.
- `client/render-health.ts`: vlastnictví celé `_processFrame`, generace a terminální callback; Game/UI již mají failure cestu.
- `client/render-startup.ts`, `client/avatar-preview.ts`: vlastní ruční draw cesty; jejich render failure musí být vyhodnocený před end/submit a čekáním na GPU.
- `client/game.ts`, `client/ui.tsx`: odstranit device-only filtr, zajistit nezávislé doručení failure, zablokovat GPU mutace a vyprázdnit input queue.
- Archiv `user-test-20261017-completed/session-prefix.jsonl` pod root cache: seq2412/2450/2496/3676; souvislých5297records. Reprodukce `shadow-freshness/reproduction-v1.log`3/3 a `pass-probe-v2.log` používají skutečné pinned metody, nejsou GPU přejímka.

## Tasks & Acceptance

**Execution:**
- [ ] Shadow helper + `tests/webgpu-shadow-freshness.test.ts`: readiness základního materiálu před super readiness, explicitní shoda LIGHTn/type pouze podle skutečného BindLights limitu a lighting enable podmínek; refaktor a pinned regrese. Task `webgpu-shadow-freshness-20261017`.
- [ ] Health + `tests/render-health.test.ts`: instanční catch celého snímku, zachované návraty/výjimky, deduplikace a lifecycle bez per-frame snapshotu. Task `webgpu-render-failure-20261017`.
- [ ] Ruční startup/preview + jejich dva skutečné testy: po chybě nepokračovat end/submit, uzavřít scope a bez čekání zachovat původní chybu. Task `webgpu-manual-frame-failure-20261017`.
- [ ] Root: zapojit factory do vegetace a skutečných tree testů pod `webgpu-shadow-integration-20261017`; Game/UI a jejich skutečné lifecycle/startup fixtures pod existujícími root rezervacemi.
- [ ] Ověřit úplnou testovou matici, review přesného vlastního diffu a integrační snapshot; jednotlivé opravy commitovat samostatně, neproniknout do cizího WIP.

**Acceptance Criteria:**
- Given aktuální světla odlišná od starého depth efektu, when nastane shadow pass před hlavním draw, then není svázán80B buffer do96B deklarace ani chybějící LightN.
- Given nepřipravený náhradní efekt, when wrapper rozhoduje o draw, then počká na správný efekt místo použití staré nekompatibilní deklarace.
- Given terminální chyba po ready či během startupu, when health doručí fault, then UI přestane hlásit hratelnost, pending start skončí chybou a další snímek/resize/quality nevydá GPU práci.
- Given odchod a nový vstup, when vznikne nový renderer, then pracuje samostatná zdravá generace bez pozdní práce starého vlastníka.

## Implementation Notes

Kroky01/02 BMAD pokračují konkrétním child KEY-39 v již schváleném cíli, bez nového backlogu či změny rozsahu hry. Výzkum/varianty a cílené reprodukce předcházely opravě. Uživatel již ukončil ruční test; původní build/archiv zůstává zachovaný. Záměr nemá otevřené lidské rozhodnutí ani nevratný krok.

## Spec Change Log

## Review Triage Log

Předběžný statický review shadow factory: `[]`,14/14CPU aTS2954/0. Health review prokázalo dvě mezery: pozdníRAF při0loops a inlinefault stále vydávalyend/submit. PinnedRED28/30 následoval `_processFrame` i `endFrame` terminalveto,32/32PASS/TS2956/0. Rootintegration reviewP2 našlo environment restore při cancel jižvadnéhoprewarm: vlastníRED1FAIL, sdílenýisRetired guard opraviloběcancel/tickcesty,42/42Game/UI/light/diagnosticsPASS a re-review[]. Zdravýtimeoutrestore zůstává.

Navazující audit nutnéhranice odhalil ručnístartup/preview render-throw→endFrame předhealthreport. To je porušení jižschváleného invariantuno-invalid-submit, nikoli nováfunkce. Přidělen disjunktní callerfix, beznovýchhooků/profileru; skutečnýflush/submit je nutné odlišitod completioncheck counteru. Runtime GPU/pipeline přijetíje stáleotevřené.

## Design Notes

Pinned non-standalone wrapper nekontroluje base readiness, zatímco BindLights iteruje aktuální lightSources. Scene renderuje shadow RT před main materiálovou přípravou. Reproduktor doložil starýHEMI→aktuálníDIR a chybějícíLight1; konkrétní mesh uživatelského pádu není známý. Pass probe skutečných PBR/Standard potvrdil stabilní baseEffect reuse a samostatné depthEffect IDs při0→9→10, bez změny pass ID nebo override.

Volba: lokální factory `createWebGpuShadowDepthWrapper(material, scene, options?)`, na WebGL původní wrapper, na WebGPU úzká ochrana. `standalone:true` zneužívá depth-only význam a samo neřeší explicitní staré typy; širší patch/cache reset nejsou nutné. Frozen defekt nebyl samostatně reprodukován, slotguard je konzervativní obrana, ne tvrzení jeho příčiny.

Game-only catch mine engine.endFrame; globální window.error nemá vlastnictví. Proto vždy aktivní instanční health hook nad `_processFrame`; neměnit celou RAF smyčku. Focus jako příčina pozdějšího vadného submitu není doložen, resize je pouze známá možná cesta.

## Verification

- Pinned RED/green regrese shadow typu/počtu slotů, pending/hot swap,2generátory/pass IDs/frozen/dispose; health begin/callback/end/submit, reporter failure, thenable, generations a profiler layering.
- Skutečné Game/UI fixtures pro terminální failure, pending startup, input flush, resize/quality stop a nový vstup. ScopedTS a diff check.
- Stabilní native a combined snapshot: `pnpm test`, `pnpm build`, izolovaný `pnpm test:integration`. Testové zdroje a patch/dependency identita v manifestu.
- Edge: zopakovat B6/LOD,medium→high→low,noc→golden→real,F a úmyslnou failure/restart cestu; žádné UBO/bindgroup/CommandBuffer chyby ani stale ready. Výkonové tvrzení až ze srovnatelných opakovaných zdravých běhů.
