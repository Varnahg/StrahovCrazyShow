---
title: 'Český návod pro projektový BMAD'
type: 'chore'
created: '2026-10-17'
status: 'done'
baseline_commit: 'b10194bb4bc8a433d87f1ce73241277914710cfa'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/AGENTS.md'
  - '{project-root}/docs/agents/bmad-policy.md'
  - '{project-root}/docs/agents/README.md'
  - '{project-root}/docs/agents/tasks/bmad-pilot-20261017.json'
---

<frozen-after-approval reason="Rozsah pilotu je součást uživatelem schváleného plánu BMAD z 17. 10. 2026.">

## Intent

**Problem:** Projekt má nainstalovaný BMAD, ale chybí stručný český provozní návod a praktický průchod přes zdejší rezervace, implementaci a review.

**Approach:** Dokončit návod jako samostatný delegovaný dokumentační task. Uživatel zvolil projektovou oficiální instalaci a automatické použití podle rozsahu práce. Tento pilot dokládá propojení workflow; nepřidává funkci hry.

## Boundaries & Constraints

**Always:** Zachovat AGENTS, živé rezervace a existující schema tasků jako zdroj oprávnění. Důkazy oddělit od plánovaných kontrol. Použít češtinu a krátké skutečně použitelné příklady. Autor provede kontrolu svých odkazů a příkazů, předá vlastní handoff a uvolní rezervaci; integraci provede koordinátor.

**Never:** Měnit hru, dependencies, vendor skills, pravidla koordinátoru nebo cizí WIP. Spouštět rekurzivní BMAD v implementačním podagentovi. Tvrdit, že dokumentační pilot měří GPU nebo že je hotová integrace, dokud nebyla provedena. Zavádět nové schvalovací kroky.

</frozen-after-approval>

## Code Map

- `AGENTS.md`, `docs/agents/README.md`, `docs/agents/bmad-policy.md`: závazné vstupy a hierarchie pravdy; návod odkazuje, pravidla nekopíruje.
- `.agents/skills/bmad-*/SKILL.md`, `_bmad/custom/`: skutečné příkazy a týmové overrides; číst selektivně.
- `docs/agents/tasks/bmad-pilot-20261017.json`: přesný scope; task vlastní `docs/agents/bmad.md`, vlastní handoff a vlastní podadresář implementation-artifacts.
- `docs/agents/handoffs/bmad-install-20261017.md`: pin 6.12.4, 29 skills, ověřená instalační cesta a omezení prostředí.

## Tasks & Acceptance

**Execution:**
- [x] `docs/agents/bmad.md` — napsat návod pro automatickou volbu malého/většího postupu, explicitní vyvolání, rezervace před renderem, umístění artefaktů, aktualizaci a běžná selhání.
- [x] `_bmad-output/implementation-artifacts/bmad-pilot-20261017/` — uchovat vlastní průchod a výsledky kontrol; nevytvářet druhý task/status systém.
- [x] `docs/agents/handoffs/bmad-pilot-20261017.md` — předat skutečné soubory, testy, omezení a stav rezervace podle existující šablony.

**Acceptance Criteria:**
- Given nový autorizovaný úkol, when agent použije návod, then pozná rozsah BMAD a povinnost claim před rendererem, včetně generovaných výstupů.
- Given obsazený task nebo cizí dirty soubor, when agent čte postup, then návod neumožní přebít zámek, automaticky převzít WIP nebo stage/commitnout celý strom.
- Given čistá pracovní kopie s verzovanou instalací, when agent hledá předpoklady a aktualizaci, then nalezne Node, uv/Python, pin verze a ověřený pnpm instalační příkaz bez změny závislostí hry.
- Given dokončený dokumentační task, when proběhne review a předání, then jsou doložené kontroly a výslovně odlišená integrace od BMAD statusu.

## Implementation Notes

- Pilot navazuje na schválený plán a připravenou specifikaci. Oficiální renderer běžel až po claimu `bmad-policy-20261017`; snapshot `ce20385889019000b383` obsahuje týmové hooks, českou konfiguraci a vlastní implementační handoff. Specifikace není epic story a nepoužívá sprint-status.

- Průzkum provedli koordinátor a nezávislí agenti před instalací. Varianty: dokumentační adaptace, stabilní oficiální core+BMM, v7 preview a další moduly. Zvolená stabilní lokální instalace poskytuje oficiální skills bez nového herního frameworku nebo zásahu do runtime.
- Rozhodnutí: dispatch navzdory malému dokumentačnímu rozsahu, protože schválený pilot výslovně ověřuje delegování s vlastní rezervací. Žádná otevřená produktová otázka; uživatel již požádal implementovat celý navržený plán.

## Spec Change Log

## Review Triage Log

- `low`, patch: Blind Hunter doložil nepřesné zobecnění rendereru v návodu. `bmad-spec` a `bmad-help` rozlišují konfiguraci přímo, zatímco `bmad-build` a `bmad-build-auto` používají renderer. Autor dostal úzkou opravu věty a obnovu dotčených kontrol/hashů; nejde o změnu rozsahu pilotu.
- Edge Case Hunter: `[]`, staticky zkontrolované cesty, parsery, precedence a čtyři manifestové hashy; žádné opakované runtime spouštění.
- Verification Gap Reviewer: bez verification gaps; jeho postup tento statický dokumentační diff vyřadil z analýzy executable behavior. Tento výsledek nepředstírá nové provedení testů.

## Verification

- Ověřit místní odkazy nového návodu proti souborům, nikoli pouze root README checkerem.
- Porovnat názvy skills, verzi a příkazy se skutečnou instalací; případný neprovedený příkaz označit jako upstream podporovaný, nikoli lokálně otestovaný.
- `node scripts/agent-tasks.mjs validate` musí uspět.
- Nezávislý review agent zkontroluje pouze taskový diff, bez povinného minima nálezů.

- Dokončení pilotu: autor opravil zobecnění rendereru, znovu ověřil 26 odkazů a obnovil manifest. Koordinátor zkontroloval výsledný diff, skutečné skill vstupy a čtyři hashy. BMAD done označuje dokončený dokumentační pilot; integrace celého zapojení zůstává samostatným taskem.
