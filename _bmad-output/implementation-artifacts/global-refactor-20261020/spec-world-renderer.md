---
title: 'KEY-48: odstranit nevyužitý světový renderer'
type: 'refactor'
created: '2026-10-20'
status: 'ready-for-dev'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/AGENTS.md'
  - '{project-root}/docs/agents/bmad-policy.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Uživatel zadal kompletní refaktoring při zachování API a hry. První celek odstraní nevolaný privátní renderer, který vedle současných továren drží druhý návrh budov.

**Approach:** Smazat pouze doložený mrtvý řetězec v world-renderer.ts. FacadeEdges deleguje do existujícího architectureEdges a promítne původní tvar výsledku. Další celky celkového zadání pokračují samostatně.

## Boundaries & Constraints

**Always:** Zachovat WorldBuildContext, buildWorld a facadeEdges. Tělo a pořadí buildWorld zůstane shodné. Hrany zachovají reference a/b, pořadí, signed zero, délky, normály, long a šest původních klíčů. Zapisovat jen pod úzkým claimem.

**Never:** Měnit architecture-reality.ts, Game/UI, geometrii, kolize, modely, manifesty, závislosti nebo ovládání. Nepřidávat cache ani FPS tvrzení. Nepřebírat cizí WIP.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
| --- | --- | --- | --- |
| Svět | WorldBuildContext | Stejné továrny a pořadí | Původní propagace |
| Orientace | Otevřený/uzavřený polygon, oba winding | Stejné normály, long a body | Bez nové validace |
| Degenerace | Prázdný/jednobodový vstup, opakované a krátké hrany | Stejná hranice 0.08 a numerika | Původní chování |
| Kompatibilita | facadeEdges | Jen a,b,length,nx,nz,long; původní a/b reference | Žádné tx/tz navíc |

</frozen-after-approval>

## Code Map

- client/world-renderer.ts: nevolané building/b6/stadium a jejich collect/texture/facadeMaterials/facadePlane/edgeStrip/flatRoof/removeOriginalRoof/removeBoxFace řetězec; buildWorld původně od řádku 668.
- client/architecture-reality.ts: shodný architectureEdges je již připojený, navíc vrací tx/tz. Neměnit hashovaný autorovací vstup.
- tests/graphics.test.ts: orientace a katalogové fasády. docs/refactoring/20261020/README.md obsahuje průzkum a varianty; export-building-assets nehashuje world-renderer.

## Tasks & Acceptance

**Execution:**
- [ ] client/world-renderer.ts -- odstranit mrtvé kořeny, uzavřené pomocníky a následně nepoužité barvy/importy -- odstranit druhý návrh světa.
- [ ] client/world-renderer.ts -- použít architectureEdges s projekcí šesti polí -- jediný algoritmus bez nového veřejného tvaru.
- [ ] tests/graphics.test.ts -- doplnit kontraktní případy matice -- chránit API bez kopie algoritmu.
- [ ] docs/agents/handoffs/global-refactor-world-renderer-20261020.md -- předat diff, zdroje, testy a limity -- přijetí integrátorem.

**Acceptance Criteria:**
- Given výchozí přijatý zdroj, when porovnáme AST buildWorld před a po, then tělo i signatura budou shodné.
- Given matici vstupů, when zavoláme facadeEdges, then projdou kontraktní aserce i katalogové regrese.
- Given taskový diff, when proběhne review a přejímka, then obsahuje jen vlastní ověřené změny bez nových API/modelů.

## Implementation Notes

## Spec Change Log

## Review Triage Log

## Design Notes

Přesun mrtvého kódu ho pouze přemístí, jeho zapojení by měnilo hru. Alias architectureEdges by přidal tx/tz. Projekce přidá drobné alokace jen kompatibilnímu exportu bez současného produkčního volajícího; nejde o optimalizaci FPS. Nevzniká cache ani nový lifecycle.

## Verification

- node --import tsx --test tests/graphics.test.ts tests/architecture-reality.test.ts tests/b6-reality.test.ts tests/landmark-reality.test.ts tests/building-foundation.test.ts tests/campus-exterior.test.ts tests/stadium-exterior.test.ts -- zachovaná geometrie a chování.
- pnpm build; pnpm test:integration -- stabilní checkpoint pod validační rezervací.
- Produkční vizuální scénář pod GPU rezervací -- kanonické budovy, B6 a terén bez rozdílu; žádné FPS tvrzení.

