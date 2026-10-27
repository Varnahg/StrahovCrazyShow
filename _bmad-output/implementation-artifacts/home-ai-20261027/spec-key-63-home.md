---
title: 'KEY-63: Čistší úvod a pravdivé načítání'
type: feature
created: '2026-10-27'
status: in-progress
baseline_commit: 'a0e0e31286ae9521f1282a8bd966b40e8fdad628'
route: dispatch
review_loop_iteration: 0
context: ['docs/agents/bmad-policy.md', 'docs/home-ai/20261027/research.md']
---

<frozen-after-approval>

## Intent

Úvod nyní schovává vstup do hry pod plným editorem postavy a načítání neukazuje skutečnou činnost. Zjednodušit první obrazovku při zachování zeleného vizuálního stylu, obou vstupních režimů, mapy a původu herních podkladů. Ukázat aktuální souhrnný počet připojených hráčů a skutečné fáze přípravy hry.

## Boundaries & Constraints

Uživatel výslovně povolil veřejně pouze souhrnný online počet. Nejde o ověřené obyvatele kolejí. Host dál nedostává identity, polohy nebo lidské zprávy. AI/NPC nepatří do počtu. Žádný automatický multiplayer join kvůli číslu.

Zachovat Game.start readiness včetně skutečně odevzdaného snímku. Loader nesmí předstírat procenta stahování nebo zrychlení. Game, renderer a editor nepřepisovat; jejich souběžný vlastník přidává generační fallback s výměnou canvasu. Neměnit hraný snapshot na portu 4182.

## I/O & Edge-Case Matrix

| Stav | Výsledek | Chyba |
| --- | --- | --- |
| Úvod | Přezdívka a vstupní CTA před detailním editorem; editor otevře explicitní tlačítko | Chyba vstupu zůstává čitelná |
| Počet | GET /api/presence vrací pouze online z aktuálních hráčů | Nedostupnost se nikdy nezobrazuje jako 0 |
| Odchod z menu | Polling se ukončí, pozdní výsledek ignoruje | Abort není uživatelská chyba |
| Načítání | Aktuální reálný krok, uplynulý čas, srozumitelné detaily | Chyba zastaví animaci, odchod funguje |
| Nový canvas/generace | Nové sledování bez starého výsledku | Cleanup observeru a timeru |
| CZ/EN, úzký viewport | Čitelné popisky, klávesnice a fokus | Bez horizontálního přetékání |

</frozen-after-approval>

## Code Map

- `client/ui.tsx`: menu JSX, startup effect, health gate, enter/leave; zapisuje pouze integrátor po předání.
- `client/avatar-editor.tsx`: existující editor s vlastním async preview lifecycle, pouze znovu použít.
- `client/game.ts`: bootStage presentation, physics-library, static-collisions, avatar-and-props, cad-buildings, light-preparation, submitted-frame, ready; žádný zápis.
- `server/index.ts`: jediná StrahovRoom a store.players, health zůstává beze změny.
- `scripts/integration.ts`: privacy a skutečné připojení SDK; doplnit pouze agregát.

## Tasks & Acceptance

- [ ] `client/welcome-screen.tsx`, `client/welcome-screen.css`: přístupný úvod, odložený editor, stav počtu, sloty pro mapu/jazyk/feedback a budoucí AI. Hook dotazu bez překryvů, s timeoutem a cleanupem.
- [ ] `client/startup-progress.ts`, `client/loading-screen.tsx`: observer konkrétního canvasu, UI fáze import/renderer/world-construction, popisky skutečných Game fází; žádná změna připravenosti hry.
- [ ] `tests/welcome-screen.test.ts`, `tests/startup-progress.test.ts`: SSR/pure kontrakty, unknown stage, pozdní callback a uvolnění zdrojů.
- [ ] `server/public-presence.ts`, `tests/public-presence.test.ts`: malý handler GET, pouze konečný nezáporný počet, žádný seznam ani profil.
- [ ] `client/ui.tsx`, `server/index.ts`, `scripts/integration.ts`, `scripts/integration-network.ts`: propojit po předání a zachovat dosavadní privacy důkazy.

Given úvod, when návštěvník vstoupí bez otevření editoru, then nemusí nejprve projít desítky ovládacích prvků.
Given připojený/odpojený SDK hráč, when se čte souhrn, then odpovídá skutečné populaci a neobsahuje identifikátory.
Given probíhající startup, when canvas zanikne nebo se nahradí, then stará generace nemění nový loader.

## Implementation Notes

Autorizace plyne z přímého zadání a projektové policy; další BMAD schvalování běžné vratné práce se nevkládá. Dva uživatelské celky KEY-63/64 mají samostatné specifikace a commity. Výchozí revize a0e0e31286ae9521f1282a8bd966b40e8fdad628. Katalog přidělil druhý koordinátor, vlastní claimy musí uspět před zápisem.

## Spec Change Log

## Review Triage Log

## Design Notes

Pouhé CSS ponechá přeplněnou strukturu; wizard přidává zbytečné kroky. Zvolena komponenta a postupné odhalení editoru. Observer stávajících milníků je menší zásah než nový callback do právě měněného Game; sleduje jen prezentaci, nesmí nahrazovat health gate. Synchronní konstrukce světa může nadále blokovat hlavní vlákno; měření zrychlení není součástí tvrzeného výsledku.

## Verification

Cílené testy přes node --import tsx --test nad novými testy. Po stabilizaci a rezervaci plná sada, build a izolovaná integrace. Praktická kontrola úvodu CZ/EN, desktop/úzký viewport a fokusu v samostatné verzi. Skutečný 3D startup pouze v dohodnutém GPU okně; případné chybějící měření uvést, nenahrazovat ho NullEngine.
