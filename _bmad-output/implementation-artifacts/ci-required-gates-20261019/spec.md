---
title: 'KEY-44: Povinná CI a přijetí změn do main'
type: 'chore'
created: '2026-10-19'
status: 'done'
baseline_commit: 'db9108ddd3d069030abebd0fcccd6ecefbd0ff53'
route: 'dispatch'
review_loop_iteration: 0
context:
  - docs/agents/bmad-policy.md
  - docs/agents/README.md
  - docs/agents/tasks/ci-required-gates-20261019.json
---

<frozen-after-approval reason="Výslovné zadání uživatele 19.10.2026: implementovat CI, ochranu main, skutečnou GitHub přejímku a následný pilot.">

## Intent

Publikovaný main má pouze kontrolu secrets a dovoluje neověřené přímé změny. Zavést reprodukovatelné testy, build a izolovanou integraci na GitHubu a povinnou integrační hranici. Samostatný následný pilot ověří selhání a obnovu; tento celek připravuje funkční bránu.

## Boundaries & Constraints

Zachovat BMAD 6.12.4, dependency lockfile, existující testy, LFS a cizí WIP. Pracovat v čisté samostatné worktree z remote main db9108ddd3d069030abebd0fcccd6ecefbd0ff53. Žádné herní změny, GPU měření, nový backlog ani obecný orchestrátor. Veškeré zápisy v claimu; katalog byl připraven zvláštní administrativní rezervací. Main ochrana a GitHub operace jsou přímo autorizované. Nevynucovat další lidský approval pro běžné změny.

## I/O & Edge-Case Matrix

| Stav | Výsledek |
| --- | --- |
| PR nebo push main | Jeden úplný verify job, žádné path filtry přeskakující required check. |
| LFS pointer místo assetu | CI nesmí být zelená; checkout stahuje skutečné objekty. |
| Chyba libovolné povinné kontroly | Job selže a merge je blokován. |
| Nový commit PR | Starší CI a přijetí SHA jej nepokrývají. |
| Změněný base main | Required checks vyžadují aktuální základ před merge. |
| Potřebná praktická přejímka | Integrátor nesmí vydat úspěšný acceptance status bez konkrétních přijatých důkazů. |
| Nepotřebná herní přejímka | Integrátor uvede důvod v důkazu k danému SHA, ne fiktivní GPU výsledek. |

</frozen-after-approval>

## Code Map

- `package.json`: Node 24, pnpm 11.25.0; test/build/integration/check:readme již existují.
- `pnpm-workspace.yaml`: frozen install aplikuje připnutý Babylon patch; žádná regenerace.
- `.gitattributes`, `tests/vegetation-realistic-pack.test.ts`: skutečné GLB/Blender objekty vyžadují LFS.
- `.github/workflows/source-secrets.yml`: existující minimální permissions a SHA-pinned actions, zachovat.
- `scripts/test-integration.mjs`: vlastní server na 2568, kontrola identity a cleanup, běh na odděleném runneru.
- `scripts/agent-tasks.mjs`: kooperativní registr ve společném Git adresáři; status není oprávnění začít cizí task.

## Tasks & Acceptance

**Execution:**
- [x] `.github/workflows/ci.yml`: jeden Ubuntu job; LFS checkout, Node/pnpm, frozen install, task validate, README, full tests, build, integration. Pinned actions, read permissions, timeout a rušení staršího běhu stejného PR.
- [x] `docs/agents/ci.md`: popsat přesné checky, SHA-vázané přijetí, aktualizaci base, obnovu a praktické důkazy.
- [x] `docs/verification-evidence/ci-main-20261019/`: uložit výzkum, rozhodnutí, GitHub SHA/run/ruleset výsledky a review.
- [x] `docs/agents/handoffs/ci-required-gates-20261019.md`: skutečné výsledky a omezení, předání integrátorovi.
- [x] GitHub: otevřít vlastní PR, přijmout review, ověřit skutečnou CI, vytvořit aktivní ruleset pro main, merge přesně ověřeného head a ověřit main run.

**Acceptance Criteria:**
- Given čistý checkout, when GitHub provede CI, then projdou skutečné existující testy, build a celá síťová integrace se staženými assety.
- Given aktuální main, when vznikne PR, then merge vyžaduje úspěšné `verify`, `source-secret-hygiene` a SHA-vázané `project-acceptance`.
- Given main posunutý jiným PR, when někdo slučuje starší větev, then strict checks vyžadují aktualizaci a nové ověření.
- Given úspěšný task, when integrátor předává, then evidence obsahuje konkrétní SHA, URL/run ID a výsledky, nikoli historický počet testů.

## Design Notes

Porovnáno: více jobů proti jednomu; jeden minimalizuje opakovaný LFS/dependency download a poskytuje stabilní check. Celý LFS checkout proti selektivnímu: první běh použije celý pro doloženou správnost, případnou optimalizaci až podle měření. Cache pnpm proti bez cache: začít bez další cache action a přidat vestavěnou setup-node store cache po ověření základního běhu, pokud přinese užitek. Ruleset proti branch protection: aktivní ruleset je inspectovatelný a bez implicitního admin bypassu. Loose proti strict: strict zabraňuje přijetí staré kombinace změn. Acceptance status vydává integrátor po nezávislém review na konkrétní SHA; CI sama nedokazuje vizuální/GPU kvalitu.

Náklady: runner-minuty a LFS přenos. Herní výkon, vzhled a cache se nemění. Lifecycle: ephemeral GitHub runner, vlastní integrační server a cleanup; místní hrané buildy beze změny. Manuální schválení produktu není nová brána. Žádné otevřené produktové rozhodnutí; dosud nezměřená přenositelnost plné suite na Linux se ověří skutečným během, případné opravy potřebují konkrétní doložený scope.

## Implementation Notes

Specifikace vznikla z průzkumu a již výslovně schváleného rozsahu; projektová policy nevyžaduje opakování souhlasu. Pilot má vlastní blocked task.

Přijato: PR #7, head 94e6481415eba8802d02d34f9e09c06e9bb65137, merge a9f1805808c653d2a9fb9cd81def446bfaead588. PR run39321039004 PASS; main run39321924235 PASS (5m6s). Všech 1491 testů, build, celá integrace, LFS, frozen install a dokumentace prošly. Ruleset25433383 aktivní, bez bypassu. Tři review vrstvy a následná kontrola finální delta vrátily []. Všechny execution položky byly dokončeny, podklady jsou v docs/verification-evidence/ci-main-20261019/ a Linear KEY-44. Pilot je další samostatný task, nikoli nedokončená část CI změny.

## Spec Change Log

## Review Triage Log

## Verification

- `node scripts/agent-tasks.mjs validate`.
- GitHub `verify`: `pnpm install --frozen-lockfile`, `pnpm check:readme`, `pnpm test`, `pnpm build`, `pnpm test:integration`.
- Read-only nezávislé review vlastního diffu.
- GitHub API: aktuální check-run names, SHA, conclusions; ruleset a efektivní branch rules; merge commit a následný main run.
