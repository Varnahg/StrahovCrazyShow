# BMAD v projektu StrahovCrazyShow

Projekt používá oficiální **BMAD 6.12.4, core + BMM**, s 29 projektovými dovednostmi pro Codex. U nové funkce nebo významné opravy jej agent zvolí automaticky; uživatel nemusí znát názvy rolí. Závazné propojení se zdejší prací je v [policy](bmad-policy.md), oprávnění a vlastnictví určují [AGENTS.md](../../AGENTS.md) a [koordinace](README.md).

## Jak začít

Stačí zadat konkrétní výsledek, například „Oprav ztrátu ovládání po návratu do hry; nejprve najdi příčinu a ověř opravu.“ Agent nejdříve prozkoumá zdroje, důkazy a varianty, připraví přidělený task a získá potřebné rezervace. Potom použije vhodný rozsah BMAD.

| Zadání | Postup |
| --- | --- |
| Překlep nebo drobná mechanická změna | Běžný úzký task bez celého BMAD workflow. |
| Nová funkce nebo významná oprava | `bmad-build`: průzkum, specifikace přiměřená rozsahu, implementace, refaktoring, review a ověření. |
| Větší funkce s nejasnými požadavky či rozhraními | Nejdřív podle potřeby `bmad-spec`, `bmad-prd`, `bmad-architecture` nebo rozdělení pomocí `bmad-create-epics-and-stories`; navázat implementací. |
| Orientace v metodě nebo existujících artefaktech | `bmad-help`; doporučení dalšího kroku samo nezadává práci. |

Explicitní příklady zpráv v Codexu:

```text
Použij bmad-build pro tento přidělený úkol: <výsledek a task ID>.
Použij bmad-spec nad těmito podklady: <cesty>; připrav návrh, zatím neimplementuj.
Použij bmad-help a vysvětli další krok pro <task ID>.
```

Jsou-li projektové dovednosti v relaci načtené, lze použít i `$bmad-build`. Jejich skutečné vstupy jsou v [.agents/skills](../../.agents/skills/), například [bmad-build](../../.agents/skills/bmad-build/SKILL.md). Starší relace musí výslovně znovu načíst projektová pravidla; když novou dovednost v katalogu nemá, začni novou relaci v tomto projektu. Nepředpokládej, že samotná instalace aktualizuje již běžící chat.

## Rezervace a výstupy

Před vyvoláním workflow proveď vstupní kontrolu z kořene správné pracovní kopie:

```powershell
git status --short
git worktree list
node scripts/agent-tasks.mjs validate
node scripts/agent-tasks.mjs status
```

Koordinátor vytvoří konkrétní task podle [šablony](task-template.json) v administrativní rezervaci. Následující příklad nahraď skutečně přiděleným ID a jednoznačným vlastníkem; existence `ready` tasku není nové zadání:

```powershell
node scripts/agent-tasks.mjs claim --task <task-id> --owner <unique-session-id>
```

Claim musí uspět **před spuštěním rendereru**, který zapisuje ještě před projektovými hooks. Task zahrnuje implementaci, testy, předání i všechny generované cesty. Pro `bmad-build` konzervativně rezervuj `_bmad/render/bmad-build/`; přesné užší možnosti popisuje policy. Dva současné běhy nesmějí zapisovat do stejného prefixu. Podagent s konkrétním zadáním další BMAD workflow nespouští; pro vlastní zápisy získá disjunktní claim. Čistě čtecí reviewer rezervaci nepotřebuje.

| Obsah | Umístění a vlastnictví |
| --- | --- |
| Oficiální skills, skripty a manifest | `.agents/skills/`, `_bmad/scripts/`, `_bmad/_config/`; mění je jen rezervovaná instalace/údržba. |
| Týmová konfigurace | `_bmad/custom/config.toml` a sparse `<skill>.toml`; společná pravidla zůstávají v policy. |
| Specifikace a implementační evidence | `_bmad-output/planning-artifacts/`, `_bmad-output/implementation-artifacts/`; task rezervuje konkrétní soubor nebo svůj podadresář. |
| Výstup `bmad-spec` | Výchozí `_bmad-output/specs/spec-<slug>/`, včetně `.memlog.md`, `SPEC.md` a případných companion souborů; rezervuj celý konkrétní adresář. |
| Renderer a osobní nastavení | `_bmad/render/`, `*.user.toml`; ignorované lokální výstupy se necommitují, zápis stále vyžaduje vlastnictví. |

Sprint status nezakládej automaticky. Pokud jej konkrétní workflow potřebuje, patří do předem rezervovaného rozsahu. Odkaz na specifikaci a Linear přidej do existujícího `notes` tasku; nezaváděj druhý seznam vlastníků nebo stavů. BMAD `done` nepřebíjí přijetí integrátorem.

## Předpoklady a údržba

Běžný checkout již obsahuje verzovanou instalaci; není třeba instalovat BMAD znovu pro každý úkol. Projekt používá Node 24 a pnpm 11. Renderer a resolvery potřebují `uv` na PATH a Python **3.11 nebo novější**. Při přípravě 17. 10. 2026 byly dostupné Node 24.19.0, pnpm 11.25.0 a uv 0.12.3. Tyto zjištěné verze uv/Python nejsou novými závislostmi hry.

Účinné nastavení čti přes [resolver](../../_bmad/scripts/resolve_config.py), nikoli jen z instalačních YAML. Pořadí vrstev je `_bmad/config.toml`, `_bmad/config.user.toml`, `_bmad/custom/config.toml`, `_bmad/custom/config.user.toml`; pozdější vrstva přebíjí dřívější. Týmová vrstva drží češtinu a přenositelné cesty. Osobní hodnoty nepublikuj do evidence. Čtecí kontrola z kořene projektu:

```powershell
$bmadProject = (Get-Location).Path
uv run --no-cache "$bmadProject/_bmad/scripts/resolve_config.py" --project-root "$bmadProject" --key core.communication_language --key core.document_output_language --key core.output_folder
```

`bmad-build` a `bmad-build-auto` vyvolají oficiální renderer a načtou vytištěný `workflow.md`. Ostatní skills se aktivují podle vlastního `SKILL.md`; například `bmad-spec` a `bmad-help` přímo rozlišují konfiguraci bez tohoto renderu. Před jakýmkoli zápisem stále musí existovat rezervace příslušných výstupů. Při diagnostice neotvírej starý render z jiné pracovní kopie a po chybě resolveru nenahrazuj týmové instrukce nepřizpůsobeným upstream workflow.

Instalaci, reinstall i upgrade provádí samostatný rezervovaný task. Zahrne `.agents/skills/`, `_bmad/`, potřebné ignore soubory a možné root zálohy `_bmad-custom-backup-temp/`, `_bmad-modified-backup-temp/`. Pro první instalaci na tomto stroji uspěl následující oficiální příkaz z cílového kořene; při reinstallu je nutné znovu ověřit zachování overrides:

```powershell
pnpm --config.enable-global-virtual-store=false --config.node-linker=hoisted dlx bmad-method@6.12.4 install --directory . --modules bmm --tools codex --no-shims --user-name StrahovCrazyShow --communication-language Czech --document-output-language Czech --output-folder _bmad-output --yes
```

Přepínače pnpm platí jen pro toto volání. Podle [instalačního předání](handoffs/bmad-install-20261017.md) běžné `pnpm dlx` selhalo na resolution `fast-wrap-ansi`; hoisted varianta uspěla. Kořenová příčina pnpm nebyla určena. Herní `package.json` ani lockfile se kvůli BMAD nemění. Verzi neměň na `latest`, v7 preview ani další moduly bez samostatného průzkumu a zadání. Upgrade musí ověřit konfiguraci, hooks, skutečný render, zachování vlastní práce a přenositelnost; samotný exit 0 instalátoru nestačí.

## Když se postup zastaví

| Situace | Další krok |
| --- | --- |
| Claim odmítl kolizi nebo cizí dirty cestu | Do rozsahu nepiš. Koordinátor upraví rozdělení nebo doloží převzetí; stáří zámku ani `--adopt-dirty` není obcházení vlastnictví. |
| Chybí `uv`/Python nebo selhal resolver/render | Uchovej konkrétní chybu a oprav předpoklad v přiděleném rozsahu. Nepokračuj s neaplikovanými overrides. |
| Chybí cesta pro nový artefakt | Nejdříve rozšiř task a obnov rezervaci přes koordinátora; úprava JSON sama existující claim nemění. |
| Review nenalezlo závadu | Zapiš čistý výsledek a skutečný rozsah kontroly. Není stanovený minimální počet nálezů. |
| Hotová implementace, ale chybí přejímka | Předání uvede provedené kontroly a omezení. Koordinátor rozhodne o integraci; `release` neznamená Done. |

Review a commit zahrnují pouze doložené vlastní změny, včetně nových souborů. Nikdy nepřebírej celý dirty strom, cizí staged obsah ani upstream pokyn `git add .`. Autorizované běžné kroky se znovu neschvalují jen kvůli BMAD. Postup obnovy heartbeat a úklidu procesů zůstává v koordinaci.

## Co bylo prakticky ověřeno

[Instalační předání](handoffs/bmad-install-20261017.md) dokládá připnutou instalaci; [předání overrides](handoffs/bmad-overrides-20261017.md) dokládá skutečné rozlišení týmových hodnot. Koordinátor následně [ověřil reinstall a přenositelnost](../verification-evidence/agents/coordination-20261012/bmad-20261017/portability-reinstall.json) v jiné cestě s mezerami: 251 chráněných souborů beze změny, 27 rozlišených přizpůsobení a render obou build workflow s opakovaným použitím cache. `user_name` je instalační/osobní hodnota, nikoli týmový identifikátor vlastníka tasku.

[Specifikace pilotu](../../_bmad-output/planning-artifacts/bmad-pilot-20261017.md) zadala tento návod prostřednictvím renderovaného workflow; [evidence pilotu](../../_bmad-output/implementation-artifacts/bmad-pilot-20261017/README.md) rozlišuje vlastní kontroly od následného review a integrace. Společné přijetí ověřuj v [evidenci KEY-38](../verification-evidence/agents/coordination-20261012/bmad-20261017/README.md).

Tento dokumentační pilot neověřuje hru, GPU ani multiplayer. Pro herní změny dál platí příslušné praktické testy a rezervace drahých kontrol.
