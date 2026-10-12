# Souběžná práce agentů

Tato pravidla rozdělují zápis do souborů, náročné procesy a předání výsledků. Kořenový [AGENTS.md](../../AGENTS.md) je vstupní instrukce pro každý nový úkol. [Mapa architektury](architecture.md) vychází ze skutečného kódu a lockfilu; [current-work.md](current-work.md) zachycuje rozpracovaný stav při zavedení koordinace 12. 10. 2026.

## Co je zdrojem pravdy

| Informace                                       | Kde ji zjistit                                                  |
| ----------------------------------------------- | --------------------------------------------------------------- |
| Co platí vždy                                   | `AGENTS.md` a relevantní lokální instrukce                      |
| Co se má udělat a které soubory smí task změnit | `docs/agents/tasks/<id>.json`                                   |
| Kdo právě drží soubory nebo procesní zdroj      | `node scripts/agent-tasks.mjs status`                           |
| Co skutečně změnil a otestoval                  | `docs/agents/handoffs/<id>.md` a odkazovaná evidence            |
| Co je přijaté do společného výsledku            | Stav tasku a `docs/verification.md`, aktualizované integrátorem |

Tasky nejsou automatická fronta. `ready` znamená připravený rozsah, `blocked` chybějící podmínku, `done` převzatý výsledek. Jejich přítomnost neopravňuje k další herní implementaci bez zadání. Probíhající práci ukazuje rezervace, nikoli ručně udržovaný druhý sloupec s vlastníkem. Původní rozpracovaná práce má při nejasném vlastnictví přednost před novou rezervací.

## Začátek, práce a předání

Z kořene repozitáře spusť:

```powershell
git status --short
git worktree list
node scripts/agent-tasks.mjs validate
node scripts/agent-tasks.mjs status
node scripts/agent-tasks.mjs claim --task avatar-turn-audit --owner RELACE-UNIKATNI-ID
```

`RELACE-UNIKATNI-ID` nahraď skutečným ID relace/agenta, které zachováš i při pokračování. Jména modelů typu `gpt` nebo `claude` nejsou jednoznačná. Volitelný `--pid 12345` označuje ověřený dlouhožijící proces; krátce běžící CLI není vlastník práce. Pro každý paralelní task použij samostatné ID vlastníka nebo alespoň jednoznačnou dvojici task/owner.

Úspěšný `claim` uloží přesné cesty, zdroje, pracovní kopii, výchozí commit a časy. Před zápisem zkontroluje jiné rezervace i již změněné soubory v aktuálním checkoutu. Odmítne také předka/potomka obsazené cesty, například rezervaci `client/` proti `client/game.ts`. Cesty jsou konzervativně porovnávané bez rozlišení velikosti písmen; `writePaths` nepodporují globy. Adresáře zapisuj s koncovým `/`, soubory přesně. Seznam nemá být celé `client/`, když jde o jediný modul.

```powershell
node scripts/agent-tasks.mjs heartbeat --task avatar-turn-audit --owner RELACE-UNIKATNI-ID
node scripts/agent-tasks.mjs release --task avatar-turn-audit --owner RELACE-UNIKATNI-ID
```

Heartbeat obnovuj nejpozději po 15 minutách. Po 30 minutách bez obnovy nástroj varuje, ale nic nepřebírá. Release použij až po předání a úklidu vlastních procesů. Koordinátor zkontroluje diff, důkazy a závislosti a až pak změní task na `done`. Částečný výsledek zůstává `blocked` s konkrétní příčinou a předáním umožňujícím pokračování.

Agent smí číst soubory mimo svůj rozsah. Jejich změnu musí nejdříve předat koordinátorovi: buď vznikne úzký navazující integrační task, nebo se původní rezervace po zastavení zápisů uvolní, task upraví a znovu rezervuje. Úprava JSON sama **nemění existující rezervaci**. Při rozšíření už rozpracované vlastní práce je `--adopt-dirty` přípustné pouze s doloženým vlastnictvím v předání. Ani s tímto přepínačem nelze přebít cizí aktivní rezervaci.

Podagent dostává implementaci, refaktoring i odpovídající testy a vlastní konkrétní soubory. Rodič mu nerezervuje stejný nadřazený adresář: tím by jeho claim oprávněně zablokoval. Dokončený podagent předá výsledek, uvolní rezervaci a slot; integrátor doplní společný entrypoint až ve své rezervaci.

## Katalog úkolů

Začni výpisem `status`; přesné aktuální ID a podmínky jsou v [tasks/](tasks/). Připravené průzkumy avatarů, trávy a hosta zapisují každý jen vlastní výstup. Opravy závisí na průzkumu. Počasí a venkovní objekty jsou blokované do identifikace vlastníků existujícího WIP. Závěrečná integrace přijímá výsledky společně.

Nový task založí koordinátor z [task-template.json](task-template.json). Povinná pole:

| Pole                           | Význam                                                                             |
| ------------------------------ | ---------------------------------------------------------------------------------- |
| `schemaVersion`, `id`, `title` | Verze 1, unikátní kebab-case ID shodné s názvem JSON, konkrétní výsledek           |
| `status`, `dependsOn`          | `ready`/`blocked`/`done`; ID předchůdců, které musejí být `done`                   |
| `writePaths`                   | Úplný a co nejmenší rozsah zápisu, včetně nových souborů, testů, exportů a předání |
| `resources`                    | Vzájemně výlučné procesní zdroje                                                   |
| `acceptance`                   | Pozorovatelné podmínky dokončení                                                   |
| `verification`                 | Cílené testy, praktické scénáře a hranice důkazů                                   |
| `notes`                        | Podklady, nezapisované závislosti, blokace a požadované předání                    |

Všechna pole se seznamem mají typ pole řetězců. Stav `blocked` vysvětli v `notes`; nevymýšlej vlastníka. CLI kontroluje strukturu, neznámé závislosti a cykly. Dva plánované tasky smějí mít společný integrační soubor, ale jeho rezervaci dostane v jeden okamžik pouze jeden z nich. Nadřazený task není důvod ke současnému zápisu dvěma agenty.

Katalog a pravidla mění vždy jeden koordinátor v tasku `dev-coordination-maintenance`. Při založení prvního katalogu byly soubory přidělené explicitně v relaci; to není výjimka pro budoucí práci. Nová rezervace procesu se zakládá **před** jeho spuštěním, ne zpětně.

`dev-coordination-maintenance` je opakovatelný administrativní slot: po předání konkrétní údržby se rezervace uvolní a definice zůstává `ready`. Ostatní tasky jsou konkrétní výsledky a po převzetí přecházejí do `done`. [Ověření první verze koordinátoru](../verification-evidence/agents/coordination-20261012/README.md) obsahuje skutečné výsledky a snapshot také s testy; společný `docs/verification.md` při přípravě upravovala jiná aktivní relace.

## Procesy, porty a drahé kontroly

| Zdroj                    | Kdo ho musí rezervovat                                                                           |
| ------------------------ | ------------------------------------------------------------------------------------------------ |
| `heavy-validation`       | Celá sada testů, build, integrace, GPU benchmark, Blender/export nebo CPU/síťový zátěžový profil |
| `gpu`                    | Browserová 3D přejímka nebo GPU měření; také Blender, pokud používá GPU                          |
| `workspace-build`        | Build zapisující `dist` v pracovní kopii                                                         |
| `port:2568`              | Standardní `pnpm test:integration`, port je ve skriptu pevný                                     |
| `port:5173`, `port:2567` | Výchozí dev klient a server                                                                      |
| `port:<číslo>`           | Každý další preview, server nebo dlouhožijící proces naslouchající na portu                      |

`gpu` i `heavy-validation` jsou společné v rámci registru, takže měření nekonkuruje našemu buildu/exportu. Rezervace port neobsadí na úrovni OS: před startem ověř skutečné naslouchání, například `Get-NetTCPConnection -State Listen`. Obsazený port není souhlas ukončit nalezený proces. Zjisti vlastníka a použij jiný rezervovaný port, pokud to skript umožňuje. Historicky publikované porty v dokumentaci nejsou volné jen proto, že je nový registr nezná.

Při startu procesu zaznamenej příkaz, cwd, PID, porty, výstupní adresář a task do předání. Na konci ukonči pouze procesy, které jsi sám spustil nebo převzal doloženým předáním, a ověř ukončení. V PowerShellu spouštěj pomocné procesy skrytě. Build do sdíleného `dist` může změnit už otevřený preview; pro přejímku použij izolovaný snapshot se všemi testy a datovými fixtures.

První verze CLI nepodporuje atomický převod živého procesu. Má-li preview dále běžet, dosavadní vlastník drží rezervaci i odpovědnost až do koordinovaného ukončení. Příjemce získá novou rezervaci a teprve potom proces znovu spustí. Samotný zápis „předáno“ v handoffu ani `release` za běhu nestačí.

Praktická míra ověření:

- Dokumentace a koordinátor: validace katalogu, kontrola odkazů, cílené CLI testy v dočasných repozitářích; nepoužívat herní GPU jako důkaz zámků.
- Herní modul: cílené testy během práce a odpovídající skutečný scénář; funkční update vždy dokonči refaktoringem dotčené logiky.
- Stabilní společný checkpoint: postupně `pnpm test`, `pnpm build`, `pnpm test:integration`; integrátor drží potřebné zdroje a zaznamená hash snapshotu včetně testů. Pro render/řízení/kolize doplň praktickou hru; pro výkon srovnatelné produkční GPU měření.

## Obnova a omezení

Registr leží v `<git-common-dir>/agent-coordination/claims.json`, interní krátký mutex v `directory.lock`. Zjistíš ho přes `git rev-parse --path-format=absolute --git-common-dir`. Všechny worktrees téhož lokálního Git repozitáře proto vidí stejné rezervace. Úloha v jiné worktree musí používat sjednocený katalog a tuto verzi CLI; samotná worktree soubory z aktuálního dirty stromu nekopíruje.

Rezervace jsou kooperativní dohoda, ne přístupová práva OS. Nástroj nehlídá každé uložení editoru, nesleduje automaticky procesy a nedokazuje dokončení tasku. Kontrola dirty souborů platí pro tracked a neignorované untracked soubory aktuálního checkoutu; ignorované výstupy (např. `dist/`) chrání dohoda o scopes/resources, nikoli tato kontrola. Cizí nezaregistrovaný WIP v jiných worktrees je potřeba převzít přes koordinátora. Čistý strom není důkaz, že ho nepoužívá jiný proces. Nezávislé klony, stroje a procesy mimo tento registr se automaticky nekoordinují; pro jejich souběh je nutné jediné společné přidělování nebo externí rezervační služba.

Při opuštěné rezervaci nejdříve ověř relaci i proces, zachovej její diff a zaznamenej převzetí. Původní vlastník uvolní task; pokud už není dostupný, koordinátor může po doloženém ukončení jeho práce uvolnit rezervaci jejím evidovaným owner ID. PID může být znovu použitý a jeho absence nestačí. `--adopt-dirty` není potvrzení uživatele ani automatický bypass; je to explicitní záznam již doloženého předání.

Po pádu při zápisu může zůstat interní mutex. Nástroj má v takovém případě odmítnout změny. Koordinátor nejprve vyloučí živou instanci CLI, zazálohuje registr a až poté odstraní konkrétní zbylý mutex. Poškozený registr nepřepisuj prázdným seznamem: obnov ho ze zálohy či předání a ověř vlastníky. Stáří není důvod k automatickému smazání.

## Primární podklady návrhu

Ověřeno 12. 10. 2026. Repo-specifická fakta dokládá [architecture.md](architecture.md). Oficiální [OpenAI dokumentace AGENTS.md](https://learn.chatgpt.com/docs/agent-configuration/agents-md) popisuje načtení instrukcí při startu a pořadí od kořene k pracovnímu adresáři. Proto je povinný vstup v kořenovém souboru; odkazované dokumenty mají agenti výslovně číst. Běžící relace je třeba na změnu upozornit nebo znovu spustit; automatické načtení nových pravidel není zaručené.

[Git rev-parse](https://git-scm.com/docs/git-rev-parse) rozlišuje společný Git adresář používaný worktrees. [Node.js 24 fs](https://nodejs.org/docs/latest-v24.x/api/fs.html) poskytuje operace pro výlučné vytvoření a zápis souborů. Na těchto primitivách stojí lokální rezervace; nejde o distribuovanou službu ani automatický scheduler.
