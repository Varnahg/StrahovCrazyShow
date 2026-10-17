# Evidence dokumentačního pilotu BMAD

Datum: 17. 10. 2026. Task `bmad-pilot-20261017`, autor `bmad-01a14a49-pilot`; výchozí commit `b10194bb4bc8a433d87f1ce73241277914710cfa`. Specifikaci a vlastní render koordinátora zachycuje [zadání](../../planning-artifacts/bmad-pilot-20261017.md). Výsledkem pilotu je [český návod](../../../docs/agents/bmad.md), nikoli herní změna.

## Průchod a rozhodnutí

1. Autor samostatně přečetl specifikaci, AGENTS, policy, koordinaci, mapu stacku a předání instalátoru/overrides; ověřil stav pracovní kopie a společného registru.
2. `node scripts/agent-tasks.mjs claim --task bmad-pilot-20261017 --owner bmad-01a14a49-pilot` uspěl před prvním zápisem. Rozsah obsahuje pouze návod, vlastní handoff a tento podadresář evidence, bez procesních zdrojů.
3. Podklady porovnal se skutečnými vstupy 6.12.4: manifest, 29 adresářů skills, `bmad-build/SKILL.md`, `bmad-spec/SKILL.md` a jeho `customize.toml`, resolvery, renderer a ignore soubory. Nevyvolal další skill, renderer ani podagenta.
4. Zvolil návod s provozními příklady a odkazy na jedinou policy. Zamítl kopírování celých pravidel a vytváření nového backlogu: vedlo by k další udržované verzi oprávnění/stavů. Herní cache, alokace, výkon a vzhled se nemění.
5. Cílený dokumentační refaktoring sjednotil umístění výstupů do jedné tabulky a oddělil běžný start, rezervace, údržbu a řešení selhání. Údaj o `bmad-spec` zahrnuje jeho skutečný memlog/companion rozsah, nikoli jen `SPEC.md`.
6. Následovala kontrola místních odkazů, jmen skills, skutečných verzí a shody instalačního příkazu s doloženým předáním. Strojový výsledek je v [checks.json](checks.json); identity dodávaných souborů v [source-manifest.json](source-manifest.json).

## Rozsah ověření

Ověřené příkazy této práce: `node --version`, `pnpm --version`, `uv --version`, `node scripts/agent-tasks.mjs validate` a úzká obsahová/linková kontrola Node ze stdin. Ta řeší relativní cíle vůči skutečné cestě Markdown, kontroluje existenci uváděných skills a srovnává instalační řádek s původním předáním. Nejde o nové unit testy dokumentace. Čas, exit code a jednotlivé kontroly obsahuje JSON.

Instalační příkaz provedl původní instalátor; autor pilotu ověřil jeho shodu s [předáním](../../../docs/agents/handoffs/bmad-install-20261017.md), nespouštěl jej znovu. Ukázkový `claim --task <task-id>` je šablona, nikoli samostatně spuštěný příkaz. Resolverové přepínače byly porovnány s instalovaným parserem; skutečné rozlišení overrides je doložené [jejich autorem](../../../docs/agents/handoffs/bmad-overrides-20261017.md). V tomto podtasku se nevydává jeho běh za nový test.

Předání koordinátora hlásí také 15/15 testů `agent-tasks` a source-secret guard. Autor pilotu je neopakoval a nepoužívá je jako vlastní důkaz. Přečetl skutečný [výsledek reinstallu a přenositelnosti](../../../docs/verification-evidence/agents/coordination-20261012/bmad-20261017/portability-reinstall.json): 251 chráněných souborů beze změny, 27 přizpůsobení, 29 skills, oba build rendery v jiné cestě s mezerami a cache reuse. Jde o oddělené ověření koordinátora. Nezávislé review návodu a integrace teprve následují. Případný dosud chybějící odkaz na společnou evidenci je explicitně `pending` v `checks.json` a musí jej integrátor před přijetím ověřit.

Neběžely herní testy, build, integrace, GPU, server ani Blender. Změna je dokumentační; nevznikl nový helper proces a nebyl změněn žádný cizí WIP. Claim se po dokončení předání uvolní; platný aktuální stav ukazuje registr. [Handoff](../../../docs/agents/handoffs/bmad-pilot-20261017.md) je podkladem pro review a převzetí koordinátorem.

## Oprava po review

Review upozornilo na příliš obecnou větu o spuštění rendereru. Návod ji omezuje na `bmad-build` a `bmad-build-auto`; ostatní skills následují vlastní aktivační postup v `SKILL.md`. `bmad-spec` a `bmad-help` přímo rozlišují konfiguraci, zatímco požadavek rezervace před zápisem zůstává společný. Původní autor znovu získal claim s doloženým převzetím svých pěti souborů. Kontrola byla omezena na tento odstavec proti čtyřem instalovaným vstupům, odkazy upravených dokumentů a aktualizaci jejich otisků; katalog ani širší testy se neopakovaly.
