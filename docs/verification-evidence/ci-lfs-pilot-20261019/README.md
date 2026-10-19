# KEY-44: autonomní LFS pilot a obnova

Stav: skutečné RED selhání a blokace merge prokázány; probíhá obnova v nové relaci. Dosud nepřijato.

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

## Skutečný RED checkpoint

- První relace `pilot_red` dokončila testy/stub a předání; vlastní claim uvolnila. Koordinátor převzal pouze její čtyři konkrétní source/handoff soubory s doloženým adopt-dirty.
- Commit `e0ea60e642c1a1e177a6d1dfcf04c90dc18301b6`, tree `55f45cf31b61ae022239e80fd9addee765a8a821`; [PR #8](https://github.com/Varnahg/StrahovCrazyShow/pull/8). Původní lokální commit49662548 je zachován na záložní větvi; publikovaný tree je totožný.
- [Lokální RED](red-local.json): 22 testů, 21 fail/1 pass, bez skip/todo a bez chyby fixture setup/cleanup. Test SHA256 `042aa1dec471509a696520608b3b223bf7c945a8d073fcea41ff3f10f74713de` je zmrazený pro obnovu.
- [GitHub run39324153438](https://github.com/Varnahg/StrahovCrazyShow/actions/runs/39324153438) **FAILURE**, 1m27s; targeted preflight test opět 22/21fail/1pass. Velká suite/build/integrace se správně nespustily. [Strukturovaný výsledek](red-github.json).
- Skutečný merge request pro toto head SHA byl **odmítnut HTTP405**: jeden required check selhal a další nebyl vydaný. Main před i po `a9f1805808c653d2a9fb9cd81def446bfaead588`. [Důkaz odmítnutí](blocked-merge.json).
- [Kolizní claim](claim-collision.json) jiného vlastníka skončil exit1, claim a source soubory beze změny. Žádný aktivní registr ani PID není součástí verzované evidence.
- Po skončení RED GitHub watcheru koordinátor uvolnil checkpoint claim. Nová relace `pilot_recovery` začíná pouze ze specifikace, předání a zachovaného commitu; nepřebírá konverzační reasoning předchůdce. Má zachovat původní testy a získat vlastní claim. Green výsledek se zatím netvrdí.

## Obnova v nové relaci

Relace `pilot_recovery` získala vlastní claim, ověřila RED commit a původní hash testů a změnila pouze implementaci CLI a své předání. Přímý targeted běh skončil **22/22 PASS**, bez skip/todo, 47.356s; test SHA je nezměněný. Skutečný místní checkout správně selhal s12pointery, bez downloadu. [Sanitizovaný výsledek](recovery-local.json). Implementace sdílí malé helpery pro subprocess, inventory, cestu a bounded čtení; descriptor se zavírá ve finally a raw parser obsah se nevypisuje.

První pomocný wrapper vypršel po120s bez testového výsledku; raw logy jsou zachované v ignorované cache. Přímý opakovaný běh ověřil stejné zdroje. Vlastní procesy skončily, claim byl po předání uvolněn. Automatická kontrola odmítla úklid jedné neaktivní fixture s prázdným souborem a podsložkou s důvodem „blocked by policy“; přesná cesta je v [handoffu](../../agents/handoffs/ci-lfs-pilot-20261019.md). Zamítnutí se neobcházelo.

Nezávislé review a plná GitHub GREEN CI na novém kandidátovi stále zbývají; samotný targeted PASS není finální přijetí.
