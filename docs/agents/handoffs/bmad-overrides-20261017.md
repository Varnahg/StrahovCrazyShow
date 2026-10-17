# Předání: bmad-overrides-20261017

- Vlastník: `bmad-01a14a49-overrides`; příjemce/integrátor: `bmad-01a14a49-root`.
- Pracovní kopie: `C:/Users/rezac/.codex/worktrees/bmad-integration/StrahovCrazyShow`, větev `codex/bmad-integration`; základ `b10194bb4bc8a433d87f1ce73241277914710cfa`.
- Výsledek: hotové týmové overrides a ověřené rozlišení konfigurace; skutečný render, reinstall, pilot a integraci přebírá koordinátor. Podagent nic necommitoval.
- Převzaté vlastní výstupy instalátoru: `_bmad/custom/.gitignore` a stub `_bmad/custom/config.toml`, doloženo [instalačním předáním](bmad-install-20261017.md) a jeho [dodatkem](bmad-policy-20261017.md). Claim s `--adopt-dirty` převzal právě tyto dvě cesty. `.gitignore` a ignorovaný osobní `config.user.toml` zůstaly beze změny; cizí WIP se nepřebíral.

## Implementace a volba

Oficiální BMAD 6.12.4 nabízí sparse TOML overrides, proto se neměnily vendor skills ani sdílené skripty. Oproti lokálnímu forku zůstává aktualizace oddělená od projektových pravidel. Pouhá úprava dev agenta by nepokrývala přímo vyvolané workflow.

- Všech 27 instalovaných přizpůsobitelných skills odkazuje na společnou [policy](../bmad-policy.md). 26 používá podporované `activation_steps_prepend` a `persistent_facts`; `bmad-advanced-elicitation` používá své `preferences`.
- `bmad-help` a `bmad-customize` nemají rozhraní overrides; chrání je kořenový AGENTS.md. Počet instalovaných skills je 29.
- Build/build-auto předávají konkrétní task, cwd, writePaths, resources, testy a handoff. Dítě claimuje disjunktní rozsah, nevyvolává znovu BMAD a předává implementaci, refaktoring i skutečné ověření. Specifikace nepřebíjí oprávnění nebo rezervace.
- Blind-hunter vrstvy build/build-auto/code-review a build oneshot již nevynucují počet nálezů. Core review má nahrazenou adversarial lens a výslovné review_guidance proti upstream kvótě. Prázdný výsledek po skutečném přezkumu je platný; nečitelný vstup není čistý výsledek.
- Týmová konfigurace drží `project_name = StrahovCrazyShow`, češtinu, přenositelné `{project-root}/_bmad-output` a `{project-root}/docs/agents`; selective reading určuje policy.
- Party memory je vypnutá; případná explicitně zapnutá paměť má cestu `{output_folder}/.runtime/party-memory` a vyžaduje vlastní rezervaci.
- Refaktoring: projektová pravidla jsou soustředěná v jedné policy, jednotlivé overrides obsahují pouze odkazy a nutné odlišnosti. Zachována identita i pořadí všech ostatních review vrstev. Žádné herní cache, alokace ani lifecycle se nemění.

## Přesné soubory

Nové nebo upravené týmové soubory:

- `_bmad/custom/bmad-advanced-elicitation.toml`
- `_bmad/custom/bmad-agent-analyst.toml`
- `_bmad/custom/bmad-agent-architect.toml`
- `_bmad/custom/bmad-agent-dev.toml`
- `_bmad/custom/bmad-agent-pm.toml`
- `_bmad/custom/bmad-agent-ux-designer.toml`
- `_bmad/custom/bmad-architecture.toml`
- `_bmad/custom/bmad-brainstorming.toml`
- `_bmad/custom/bmad-build.toml`
- `_bmad/custom/bmad-build-auto.toml`
- `_bmad/custom/bmad-code-review.toml`
- `_bmad/custom/bmad-correct-course.toml`
- `_bmad/custom/bmad-create-epics-and-stories.toml`
- `_bmad/custom/bmad-deep-recon.toml`
- `_bmad/custom/bmad-forge-idea.toml`
- `_bmad/custom/bmad-party-mode.toml`
- `_bmad/custom/bmad-prd.toml`
- `_bmad/custom/bmad-prfaq.toml`
- `_bmad/custom/bmad-product-brief.toml`
- `_bmad/custom/bmad-project-context.toml`
- `_bmad/custom/bmad-qa-generate-e2e-tests.toml`
- `_bmad/custom/bmad-retrospective.toml`
- `_bmad/custom/bmad-review.toml`
- `_bmad/custom/bmad-spec.toml`
- `_bmad/custom/bmad-sprint-planning.toml`
- `_bmad/custom/bmad-ux.toml`
- `_bmad/custom/bmad-walkthrough.toml`
- `_bmad/custom/config.toml`
- `docs/agents/handoffs/bmad-overrides-20261017.md`

Převzatá `_bmad/custom/.gitignore` se obsahově neměnila.

## Ověření 17. 10. 2026, přibližně 15:08–15:09 UTC

Použitý dostupný interpreter: `C:/Users/rezac/AppData/Roaming/uv/python/cpython-3.13-windows-x86_64-none/python.exe`, vždy `-B`; dávka resolverů měla také `PYTHONDONTWRITEBYTECODE=1`. Nebyl vyvolán renderer.

- 27 skutečných CLI volání `python -B _bmad/scripts/resolve_customization.py --skill <absolutní .agents/skills/name> --project-root <absolutní root> --key agent|workflow`: všechna exit 0. Kontroly přes standardní `tomllib` ověřily podporovaná pole, skutečné hooks/facts/preferences, přítomnost handoff pravidel, odstranění aktivních kvót a zachování všech původních ID a pořadí vrstev.
- `python -B _bmad/scripts/resolve_config.py --project-root <absolutní root>`: exit 0; skutečně rozlišené české jazyky a přenositelné cesty. Po doplnění stálého project_name byl centrální resolver znovu spuštěn, exit 0.
- Dávka potvrdila 28 týmových TOML, 27 přizpůsobitelných skills, úplná keyed-array replacement records a vypnutou party memory.
- První zkušební dávka skončila chybou testovacího čtení `KeyError: preferences`: harness očekával rozbalené `--key` JSON. Oficiální CLI vrací `{workflow: ...}`; po opravě harnessu prošla celá dávka. Nešlo o závadu konfigurace.
- `git diff --check -- _bmad/custom/`: exit 0, ale nové soubory jsou zatím untracked, takže tento příkaz sám není obsahovým důkazem; hlavním ověřením byly skutečné resolvery a TOML kontrola.
- Žádné servery, GPU, Blender, build, plná testovací sada ani integrace nebyly spuštěny. Jejich výsledky se tímto předáním netvrdí.

Manifest identity všech 28 týmových TOML: `ec931cc79603711b19fab6f1a858ee316304d1ffa69d37bebd7891cea04f9f01` (SHA-256). Recept: lexikograficky seřazené cesty, každý řádek `<repo-relative-posix-path> <sha256-raw-file-bytes>`, spojení znakem LF bez koncového LF, následně SHA-256 UTF-8 řetězce. Osobní TOML, tato zpráva a beze změny převzatá .gitignore nejsou součástí tohoto manifestu. Kontrolní skript běžel ze stdin; nebyl přidán do vendor souborů.

## Omezení, procesy a předání

- Upstream `bmad-review/SKILL.md` stále obsahuje větu o deseti nálezech. Vendor text zůstává původní; projektová policy, review_guidance a nahrazená lens tuto kvótu výslovně ruší.
- Renderer zapisuje ještě před hooks. Povinnou rezervaci zajišťuje root preflight, nikoli tyto TOML; koordinátor má ověřit skutečný render a automatické načtení.
- Žádný vlastní dlouhožijící proces neběží. Všechna pomocná CLI skončila. Po předání následuje `release --task bmad-overrides-20261017 --owner bmad-01a14a49-overrides`; skutečný stav potvrzuje registr.
- Integrátor přebírá tento konkrétní manifest a dokumentaci, ověří render/reinstall/přenositelnost/pilot a teprve potom stav tasku a společné přijetí. `release` není Done.

Podklady: připnutý [BMAD v6.12.4](https://github.com/bmad-code-org/BMAD-METHOD/tree/v6.12.4), jeho [kontrakt overrides](https://github.com/bmad-code-org/BMAD-METHOD/blob/v6.12.4/docs/customize/customize-bmad.md), skutečné instalované `customize.toml` a Python resolvery, průzkum 17. 10. 2026.
