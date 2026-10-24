---
title: 'KEY22: lokalizace blokujících nákladů startupu a prvního vstupu'
type: 'chore'
created: '2026-10-24'
status: 'in-progress'
route: 'dispatch'
baseline_commit: '754dde6ad665070f6d46c52e755eaa2a24e0df69'
review_loop_iteration: 0
context:
  - '{project-root}/AGENTS.md'
  - '{project-root}/docs/agents/bmad-policy.md'
  - '{project-root}/docs/performance/evidence/webgpu-completion-20261021/research/source15-blocking-costs-decision.md'
---

<frozen-after-approval reason="Existující výslovné zadání KEY22; projektová policy nevyžaduje nové potvrzení běžné diagnostiky.">

## Intent

**Problém:** Source15 opravuje avatar F, ale skutečný startup Low i obnova hosta překročily limity. První car render má přes200ms bez nových kompilací; chybí vnitřní lokalizace.

**Postup:** Dvě samostatné immutable QA kopie zachytí skutečné startupové etapy a synchronní práci s efekty při prvním vstupu. Výstup slouží výběru pozdější opravy, není změnou produktu ani přijetím výkonu.

## Boundaries & Constraints

**Vždy:** Vlastní disjunktní claim; V17/36seal a historické raw beze změn; explicit default-off identity; původní receiver/args/return/Promise/falsy throw přesně jednou; bounded data, atomický rollback, native frame IDs a úklid referencí. Původní core/pin/order/behavior assertions zachovat. Pouze nové helper kopie a jejich přidělené public evidence/handoff.

**Nikdy:** Produkční source/lock/asset změny, cache key scan, nové render/readiness/GPU/scheduler/await volání, zvýšení30/90budgetů nebo oslabení coverage. GPU/build/fullsuite nejsou přidělené; vyžadují další skutečné předání CAD. Podagenti nespouštějí BMAD ani další agenty.

## I/O & Edge-Case Matrix

| Stav | Očekávaný výsledek | Chyba |
|---|---|---|
| Default off | Žádné nové runtime hooks/čtení Game | Nezměněný produkt |
| Vybraná startup etapa | Původní absolutní hranice, nejvýše8 actual renders | Nedosažený/partial cíl výslovně |
| Entry false→true | Společný10target stack,8actual Scene framů | Deadline/foreign owner/refusal výslovně |
| Reentry/throw/dispose/drift | Stejný původní výsledek, vlastní rollback | Partial evidence, žádný přepis cizího descriptoru |
| Cap/schema tamper | Bounded valid projection | Odmítnutí/overflow, žádná falešná complete |

</frozen-after-approval>

## Code Map

- `client/game.ts`, `client/light-preparation.ts`: skutečné options/startStage/saveStage/measure hranice; pouze exact QA transform ve snapshot buildu.
- `.cache/webgpu-completion-20261021/startup-stage-export/helper/v17/`: immutable donor36, původní routine/core a entry waiter; nový kód nesmí donor upravit.
- Pinované PBRBaseMaterial, WebGPUEngine a ThinEngine9.30: dvě synchronní effect hranice a skutečné inherited originy. Detailní chain/varianty a důkazy jsou v context rozhodnutí.

## Tasks & Acceptance

**Implementace:**
- [ ] `startup-stage-routines/helper/v18/`: kopie36 + nový modul/test; canonical enum null/first-medium-vehicle-0/first-low-day-1-on/first-high-day-1-on. Game options registrace vrací tentýž objekt. Původní časové odečty, žádný extra now. Lower-level8core pouze ve vybrané etapě; cap16/304/8/256KiB a explicit méně-než8 complete při skutečném konci etapy. Upravit jen vlastní common/harness/overlay/receipt/README a nezbytná copied-test metadata.
- [ ] `entry-effect-cost/helper/v18/`: kopie36 + nový core/adapter/test. Jediný10target stack, nullReturns, actual own engine wrapper a native backend origin check včetně ThinEngine dependency SHA. Nový receipt/profile schema a oddělená akce pod default-off routine-cost; původní akce/moduly byteexact. Původní entry waiter přes startCapture factory, jeden30s deadline,8framů.
- [ ] Otestovat matici, default-off/strict transforms/native null-dirty/cache reuse, nested selfSelected, foreign/reentry/Promise/falsy throw, rollback/late references/deadline/capy/receipt tamper. Uložit skutečné TAP a hashy; light targeted CPU bez sdílených heavy zdrojů.
- [ ] Nezávislý review konkrétních task diffů, root rehash a relevantní ověření. Nový build/GPU teprve po koordinaci; source/CPU přijetí oddělit od actual výkonu.

**Přijetí:**
- Given původní source15/V17, when každý task vytvoří novou kopii, then donor seal i chráněné produktové vstupy jsou stejné.
- Given selected stage nebo accepted entry, when originál běží, then evidence rozliší hranice a hierarchii bez přidaných produktových operací.
- Given chyba či konec, when owner uklízí, then zbývající vlastní hooks0 nebo explicit foreign conflict a výsledek originálu zůstává stejný.

## Implementation Notes

## Spec Change Log

## Review Triage Log

## Verification

- Nové cílené `node --import tsx --test` moduly, exact transform/pin/schema/lifecycle kontroly; všechny spuštěné příkazy a omezení v task handoffu.
- Celý helper corpus, build a GPU nesmí běžet bez přiděleného heavy okna. NullEngine/syntetické časy nejsou GPU důkaz.
