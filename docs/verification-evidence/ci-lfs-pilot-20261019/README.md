# KEY-44: autonomní LFS pilot a obnova

Stav: RED fáze v samostatné větvi `codex/ci-lfs-pilot`; dosud nepřijato.

Výchozí přijatý main: `a9f1805808c653d2a9fb9cd81def446bfaead588`, PR #7 a post-merge CI39321924235 PASS. Koordinátor `ci-01a155b2-pilot` drží metadata/renderer/GitHub ověření, implementer má samostatný source task `ci-lfs-pilot-20261019`.

## Doložený mechanismus a volba

Read-only průzkum pracovní kopie před implementací našel 12 LFS souborů, všechny ve stavu malého pointeru, ačkoli lokální LFS store objekty má. [Reprodukce](preflight-reproduction.json). Git LFS3.7.1 inventory `downloaded` znamená cache dostupnost, `checkout` je pouze srovnání délky; bez explicitního HEAD přimíchává index. Prázdný `files` může být null. Zdroj: [command_ls_files.go](https://github.com/git-lfs/git-lfs/blob/v3.7.1/commands/command_ls_files.go), skutečný lokální help `git lfs ls-files` a `git lfs pointer`.

Zvolen committed HEAD inventory, kontrola běžného souboru/cesty/velikosti a nejvýše1KiB header. Samotné booleany nestačí; plné SHA velkých modelů by zbytečně duplikovalo drahé integrity kontroly. Preflight nenahrazuje kontrolní součet stejně dlouhého poškozeného modelu. Žádná změna assetů, hry, výkonu rendereru nebo cache. Lifecycle descriptorů/fixture procesů musí být uzavřený a testovaný.

## Průběh obnovy

1. První čerstvá agentní relace připraví skutečné regresní testy, nedokončený stub a CI preflight. Lokální red výsledek je plánovaný, není dokončením funkce.
2. Koordinátor zachová checkpoint a spustí skutečnou GitHub CI. Po selhání ověří odmítnutí merge pod aktivním rulesetem a nezměněný main.
3. Nová relace načte specifikaci, handoff a zachované soubory, získá vlastní claim po doloženém převodu a implementuje původní kontrakt. Původní test hash se porovná.
4. Nezávislé review a úplná GitHub CI musí projít na finálním SHA. Integrátor poté vydá `project-acceptance` na toto SHA a provede samostatný merge.

Skutečné výsledky, run ID, checkpointy a výsledek obnovy se doplní po provedení. Source/metadata ownership zůstává oddělené, žádný obecný autodev controller ani bmad-loop nevzniká.
