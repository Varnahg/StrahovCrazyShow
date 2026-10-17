# Projektové propojení BMAD

Platí pro BMAD 6.12.4 core+BMM v tomto repozitáři. [AGENTS.md](../../AGENTS.md), [koordinace](README.md) a přímé zadání uživatele určují oprávnění; BMAD dodává postup a artefakty. [Návod](bmad.md) obsahuje příklady použití. Toto propojení není instalací globálních skills ani změnou hry.

## Výběr postupu

U nové funkce nebo významné opravy použij automaticky `bmad-build`. Drobné mechanické úpravy zpracuj běžně. Zvolená velikost postupu nikdy neruší výzkum, porovnání rozumných variant, cílený refaktoring ani skutečné ověření požadované uživatelem. U větší funkce nejprve podle potřeby použij research/specifikaci, architekturu a rozdělení práce. Nevytvářej PRD, sprint nebo nový backlog jen proto, že pro ně existuje skill.

Existující rozpracovaný úkol pokračuje podle jeho vlastníka a předání; přítomnost BMAD není povolení převzít jej. Přímé implementační a review zadání podagentovi není nový vstup pro automatický BMAD. Takový podagent nespouští další BMAD workflow. Před zápisem získá vlastní rezervaci; čistě čtecí review rezervaci nepotřebuje a nezapisuje do evidence či specifikace vlastníka.

## Před rendererem i před prvním artefaktem

1. Přečti kořenové instrukce, aktuální mapu architektury, relevantní evidenci a zadání. Ověř `git status --short`, `git worktree list`, `node scripts/agent-tasks.mjs validate` a `status`. Archivy a celý katalog obsahově nenačítej bez konkrétní potřeby.
2. Koordinátor připraví task v administrativní rezervaci. Před zápisem získej vlastní `claim`; do `writePaths` patří i specifikace, review diff, evidence, paměť a generované výstupy. Existující task JSON schéma se nemění. Chybějící rozsah se řeší před zápisem přes koordinátora.
3. `bmad-build` a `bmad-build-auto` spouštějí `_bmad/scripts/render_skill.py` ještě před aktivačními hooks. Rezervace tedy musí existovat **před vyvoláním skillu**, nikoli až uvnitř něj. Konzervativně rezervuj `_bmad/render/<skill>/`; přesnější prefix je `<skill>/<slug>-<root-hash>/` podle připnutého rendereru a musí zahrnovat také `.staging-*`. Hash není ID tasku. Souběh shodného prefixu se serializuje.
4. Generátor musí zapisovat do explicitně rezervovaných cest. Výchozí `_bmad-output` nemá jednoho automatického vlastníka: preferuj konkrétní soubor/podadresář tasku. Pokud workflow vyžaduje společný soubor (například sprint status), rezervuj jej samostatně nebo workflow nepoužívej. Ignorovaný soubor stále potřebuje rezervaci.
5. Oficiální resolver a renderer musí úspěšně načíst týmovou konfiguraci a overrides. Pokud selžou, nepřecházej k nepřizpůsobeným upstream instrukcím; oprav skutečnou příčinu v autorizovaném rozsahu nebo popiš blokaci. Při úspěchu následuj skutečně vytištěný snapshot, nikoli starý render z jiné worktree.

## Výzkum, implementace a review

- Rozliš doložené příčiny, hypotézy a chybějící měření. Uveď primární zdroje, reprodukci, varianty a důvod volby včetně dopadů na chování, výkon, vzhled, cache a lifecycle tam, kde jsou relevantní. Specifikace odkazuje na současné kontrakty; nevymýšlí druhou architekturu hry.
- Specifikace není jediným zdrojem oprávnění. Předání podagentovi obsahuje task ID, cwd, přesné soubory/zdroje, kontextové odkazy a očekávané testy i handoff. Podagent načte projektová pravidla a relevantní podklady sám, získá disjunktní rezervaci a dodá implementaci, refaktoring a ověření společně. Nevynucuj jiný model ani neskrývej potřebné vlastnictví kvůli upstream požadavku na context-free dispatch.
- Dirty strom sám o sobě nevyžaduje nový souhlas, pokud jsou vlastní a cizí změny doložené a oddělené. Nejasné vlastnictví znamená nedotýkat se dotčených souborů. Nečisti, nestashuj a nestaguj cizí WIP. Review diff vytvoř jen z doloženého taskového rozsahu, včetně jeho nových souborů; temp výstup musí také patřit tasku.
- Upstream věty o stagingu všech změn od baseline, celém dirty stromu či „spec is sole source of truth“ se zde **nepoužijí**. `git add .` je zakázáno. Přidávej konkrétní vlastní soubory a kontroluj staged diff; již existující cizí staged obsah necommituj. Commit a integraci provádí přidělený integrátor, nikoli automaticky podagent.
- Review hledá doložené opravitelné chyby v konkrétním diffu. Neexistuje minimální počet nálezů ani povinnost vymyslet problém. I pro adversarial/blind-hunter je výsledek bez nálezů platný. Hypotézu označ; nezaměňuj ji za prokázanou chybu.
- Respektuj již udělené oprávnění. BMAD checkpoint není důvod opakovat otázku „mám pokračovat?“ u běžné vratné práce schváleného rozsahu. Ptej se pouze na skutečně chybějící podstatnou informaci nebo nové oprávnění. V Plan Mode se stále neimplementuje.

## Stav, ověřování a údržba

Task JSON určuje rozsah a závislosti, společný registr vlastníka, handoff skutečné výsledky a integrátor přijetí. Linear aktualizuj po výzkumu, rozhodnutí, implementaci, ověření a integraci. Specifikace, sprint nebo místní BMAD `done` jsou pomocné artefakty, nikoli důkaz integrace. Odkazy na ně a na Linear patří do existujícího `notes`; nevytvářej druhý autoritativní seznam stavů či vlastníků.

Testy vol podle změny. Pro dokumentaci/konfiguraci ověř resolver, skutečný render, odkazy a relevantní lifecycle. Herní změny nadále vyžadují své cílené a praktické testy; celé sady, build, integrace, GPU a porty podléhají původním rezervacím. NullEngine, úspěšný renderer BMAD ani dokumentační pilot nejsou důkazem výkonu nebo funkčnosti hry. Hotovo hlásíš až s provedenými kontrolami a omezeními.

Upstream skills a skripty zůstávají beze změny. Týmové úpravy jsou sparse soubory v `_bmad/custom`; osobní TOML a renderovaná cache se necommitují. Party memory je ve výchozím stavu vypnutá; při explicitním zapnutí se ukládá do ignorovaného, předem rezervovaného `.runtime` výstupu. Aktualizace/reinstall vyžaduje rezervaci instalovaných adresářů i root záloh `_bmad-custom-backup-temp/` a `_bmad-modified-backup-temp/`. Ověř zachování overrides a přenositelnost, nezapínej automatickou aktualizaci ani v7 migraci.

První přijetí a zdroje: [evidence KEY-38](../verification-evidence/agents/coordination-20261012/bmad-20261017/README.md). Nedostupnost společného `docs/verification.md` při cizí rezervaci se řeší samostatnou evidencí a následným předáním, nikoli přepsáním souboru.
