---
title: 'KEY-22: dokončení nativní WebGPU hry a editoru'
type: 'feature'
created: '2026-10-21'
status: 'in-progress'
route: 'dispatch'
baseline_commit: 'de902d5b6fae040f1f6370febf49622f9d9cb062'
review_loop_iteration: 0
context: ['docs/agents/bmad-policy.md', 'docs/performance/webgpu-migration.md']
---

<frozen-after-approval reason="výslovné zadání uživatele21Oct2026; autorizovaná implementace i integrace">

## Intent

**Problém:** Produkce stále vybírá WebGL2. Nativní port hry a editoru existuje, ale úplná obrazová, funkční a výkonová přejímka KEY-22 chybí.

**Postup:** Ověřit aktuální main9341bcef, opravit doložené vady, přijmout skutečnou celou hru i editor, nastavit společný WebGPU default a ověřené celky integrovat do main.

## Boundaries & Constraints

**Vždy:** Výzkum a srovnání variant před opravou, konkrétní rezervace, cílený refaktoring, samostatné commity, průběžná evidence v Linear. Snapshot zahrnuje testy a asset SHA. Produkční default publikovat až po přejímce. Zachovat fyziku, jeden společný svět, izolaci hosta, vzhled, stíny a prostorové podklady.

**Nikdy:** Tichý fallback, runtime překlad GLSL, oslabení readiness/timeoutů, odstranění obsahu kvůli FPS, převzetí cizího WIP nebo změna uživatelského frozen buildu. CPU testy nenahrazují GPU důkaz.

## I/O & Edge-Case Matrix

| Stav | Vstup | Výsledek | Selhání |
|---|---|---|---|
| Produkce | Bez query nebo webgpu | Nativní WebGPU CM v editoru i hře | Srozumitelná chyba bez fallbacku |
| Místní reference | Explicitní webgl2 / webgpu-fast | Výslovně zvolený backend | Mimo loopback odmítnout |
| Nejednoznačná volba | Prázdná, neznámá, duplicitní query | Nevytvořit engine | Konkrétní chyba |
| Lifecycle | Abort, odchod, device loss, hidden/resize | Jediný platný vlastník a úplný úklid | Vadná generace nemůže být ready |

</frozen-after-approval>

## Code Map

- `client/render-engine.ts`: jediná factory obou vstupů; změnit pouze selektor. Init, native shader policy a late cleanup zachovat.
- `client/ui.tsx`, `client/avatar-preview.ts`: společná factory, generation/abort a skutečný submitted-frame gate již existují; bez reprodukce nepřepisovat.
- `client/game.ts`, `light-preparation.ts`, `render-quality-preparation.ts`: skutečné mesh/effect/frame readiness;30/90s aktivní rozpočty. Raw recorder zachytí výsledek před řízeným timeoutem.
- `client/webgpu-frame-lifecycle-profile.ts`: odděluje raw RAF a engine cadence. Nové preflighty mají1Hz oba, také ve WebGL; příčina zatím není doložená runtime vada.
- `tests/render-engine.test.ts`: rozšířit kontrakt výběru; existující deferred init/cancellation/failure testy znovu použít.
- `docs/performance/evidence/webgpu-completion-20261021/measurement/`: explicitní Vite QA transform; immutable source/helper/bundle identity a neúspěšné receipts. Původní transit helper neměnit.

## Tasks & Acceptance

**Execution:**
- [ ] `measurement/`, vlastní handoff: prestart evidence, plain/diagnostic oddělení, raw herní intervaly a odolný transport; lehké regresní fixture testy.
- [ ] `client/render-engine.ts`, `tests/render-engine.test.ts`: výchozí webgpu a veřejná explicitní volba webgpu; místní referenční režimy, zachované validační chyby. Před zápisem samostatný task.
- [ ] `client/startup-preparation-loop.ts`, `client/light-preparation.ts`, `client/game.ts` a příslušné testy: konečná bounded startup práce oddělená od prezentačního RAF, synchronní submit verdict po cleanup, úplný frame a jediný pending GPUflight. Rozhodnutí a srovnání variant v `research/startup-scheduling-decision.md`; původní timeouty/readiness a gameplay/editor RAF zachovat.
- [ ] `validation/`: skutečný srovnatelný WebGL2/CM/NCM protokol, šest presetů,1/≥3 skutečné MP relace, HUD, B6, auto, F, lampy, kvality, počasí a lifecycle. Každý nový nález nejprve doložit a přidělit přesnými cestami.
- [ ] `docs/performance/webgpu-migration.md`, `docs/verification.md`, vlastní předání: současné důkazy, limity, commity a exact-head přijetí; rezervovat zvlášť.

**Acceptance Criteria:**
- Given platný adaptér, when uživatel otevře editor a vstoupí do hry bez query, then oba skutečně používají WebGPU a úplná příprava skončí bez timeoutu nebo shader/device/texture chyby.
- Given cílová GTX1060, Medium, CSS/internal2040×986 a1/≥3 různých relací, when proběhnou opakované plné intervaly a interakce, then doložit FPS blízké60, p95≤20ms, p99≤33,3ms a žádný migrační zásek≥100ms. Nesplněný cíl nepřejmenovat na úspěch.
- Given stabilní checkpoint, when proběhnou test/build/izolovaná integrace, GPU přejímka a required PR brány, then integrovat pouze jeho změny a ověřit také skutečné main CI.

## Implementation Notes

Výzkum: `research/initial-recon.md`, `current-source.json`, `asset-hydration.json`; vybrané nové raw události v `validation/preflight-events.json`. Historické shader/cache/garment opravy jsou již v main. CM má přípravu async pipeline; NCM ji nemá a vyžaduje samostatnou měřenou přejímku. Volba CM je konzervativní kandidát, nikoli důkaz vyššího FPS.

## Spec Change Log

## Review Triage Log

## Verification

- Cílené factory/lifecycle/preparation testy:155/155PASS na nezměněném základu; nejde o GPU přejímku.
- Po opravách `pnpm test`, `pnpm build`, izolovaný `pnpm test:integration` a skutečný obraz/výkon se source/test/asset identitou, GPU/driverem, rozměry, raw intervaly a kontinuálními teplotami/takty.

21.10 source checkpointy: společný defaultCM kandidát je již bbc50815 (main9341 zůstává WebGL2). PCF1b2a6829 odstranil doložené finaljobschurn812→0 a skutečnéCM/NCM starty source5 prošly. Dílčí CM B6 oběcore0→1→2→0/119NCMstates/54min nejsou finální výkonová přejímka. Startup-view2c3a365e (201CPU/TS0/cleanpeer) připravuje accepted foot anchor a známý roster; remote proof je explicitně submitted-frame snapshot při nadále živém target streamu, původní90+shared30s aGPUguards zůstaly. Native34aacb82 řeší independent cold fullMesh.render regular-instance buffer stale bundle (14isolatedgreen); oldactual37326 owner zůstává neprokázaný. Frozen source6/tests8573 je2b88fe58 a má own freshinstallMesh7ceb/core singleton, původnídeps zůstaly. Fullsuite94784 právě běží, build/integration/praktická UI handshake/obraz/výkon/maingate až po něm. Staré192/b91 proofy nejsou current přijatýruntime.
