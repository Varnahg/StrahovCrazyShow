---
title: 'KEY-48: odstranit nevyužitý světový renderer'
type: 'refactor'
created: '2026-10-20'
status: 'done'
route: 'dispatch'
baseline_commit: '885d07fc2e22576f0ce6c6ceaea08fd8a8d9dc95'
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
- [x] client/world-renderer.ts -- odstranit mrtvé kořeny, uzavřené pomocníky a následně nepoužité barvy/importy -- odstranit druhý návrh světa.
- [x] client/world-renderer.ts -- použít architectureEdges s projekcí šesti polí -- jediný algoritmus bez nového veřejného tvaru.
- [x] tests/graphics.test.ts -- doplnit kontraktní případy matice -- chránit API bez kopie algoritmu.
- [x] docs/agents/handoffs/global-refactor-world-renderer-20261020.md -- předat diff, zdroje, testy a limity -- přijetí integrátorem.

**Acceptance Criteria:**
- Given výchozí přijatý zdroj, when porovnáme AST buildWorld před a po, then tělo i signatura budou shodné.
- Given matici vstupů, when zavoláme facadeEdges, then projdou kontraktní aserce i katalogové regrese.
- Given taskový diff, when proběhne review a přejímka, then obsahuje jen vlastní ověřené změny bez nových API/modelů.

## Implementation Notes

Výchozí sada 1671 PASS / 0 FAIL / 1 platformní skip, build a izolovaná integrace PASS. Baseline je zmrazený v refactor-baseline-20261020-b, snapshot 336a9b1dbde06271c5d158f14a0a7c85b0c0c55ebdee1e290eaac3c067044c89 (8518 souborů včetně testů). Původní neúspěšný freezer zůstává zachovaný. Implementační zápisy mohou začít až nyní; první tři veřejné exporty a canonical AST hash buildWorld zachycuje world-renderer-contract.json.

Převzetí koordinátorem: přečten celý taskový diff (801 řádků); samostatně ověřena bajtová shoda deklarací buildWorld, WorldBuildContext a FacadeEdge, zachované exporty i nezměněný architecture-reality.ts. Všechna čtyři implementační zadání splněna. Matice má kontraktní testy; 55 cílených testů PASS a diferenciální porovnání 488 polygonů / 6333 hran PASS. Produkční vizuální přejímka a ověření stabilního kandidáta zůstávají otevřené.

## Spec Change Log

## Review Triage Log

20. 10. 2026: spuštěny všechny tři nezávislé vrstvy nad taskovým diffem SHA-256 8a255d54676bba93040f9128292b6aced195d8dae757c4b9521d3b9db01c947a. Blind hunter: []; edge-case hunter: []; verification-gap: No verification gaps found. Žádné nálezy k triáži, opravě nebo odložení.

## Design Notes

Přesun mrtvého kódu ho pouze přemístí, jeho zapojení by měnilo hru. Alias architectureEdges by přidal tx/tz. Projekce přidá drobné alokace jen kompatibilnímu exportu bez současného produkčního volajícího; nejde o optimalizaci FPS. Nevzniká cache ani nový lifecycle.

## Verification

- node --import tsx --test tests/graphics.test.ts tests/architecture-reality.test.ts tests/b6-reality.test.ts tests/landmark-reality.test.ts tests/building-foundation.test.ts tests/campus-exterior.test.ts tests/stadium-exterior.test.ts -- zachovaná geometrie a chování.
- pnpm build; pnpm test:integration -- stabilní checkpoint pod validační rezervací.
- Produkční vizuální scénář pod GPU rezervací -- kanonické budovy, B6 a terén bez rozdílu; žádné FPS tvrzení.

## Přijetí prvního celku20.10.2026

PR13 head42fa92a8 má celou CI1675/1675PASS, build a4SDKintegracePASS, run39385260988. Viditelný IAB ověřil samostatně původní336a9b1d i kandidátníaa3feebd snapshot: celý authored svět sHUD, camera/A/D, fyzickéauto, respawn, terén/plot/budovy a B6schody/vstup/lobby včetně sestupu. Oba bootready/lightcomplete/renderhealthready/0errors. Skutečný adaptér IntelUHD630/ANGLE-D3D11, CSSiinternal580×668, medium. Žádné nové FPS/p95/p99 ani performance závěry; předchozíEdge timeouty zůstávají přiznané s nedoloženou přesnou příčinou. Důkazy a rawdiagnostics v docs/refactoring/20261020/world-visual/. Všechny vlastníkarty/serverprocesyukončené,4290volný. Lokální BMADdone neoznačuje celýKEY48 ani dosud neprovedenou mainintegraci.
