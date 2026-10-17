# Předání: bmad-pilot-20261017

- Vlastník: `bmad-01a14a49-pilot`; příjemce/integrátor: `bmad-01a14a49-root`.
- Pracovní kopie: `codex/bmad-integration`; výchozí commit `b10194bb4bc8a433d87f1ce73241277914710cfa`, stejný Git common-dir jako hlavní checkout.
- Výsledek: [český provozní návod](../bmad.md) připravený pro nezávislé review; integrace zatím není tvrzena. Přidělený pilot byl převzat z renderovaného BMAD dispatch, podagent další workflow nespouštěl.
- Přesné nové soubory: `docs/agents/bmad.md`, tento handoff, `_bmad-output/implementation-artifacts/bmad-pilot-20261017/README.md`, `checks.json` a `source-manifest.json` ve stejném adresáři evidence.
- Cizí rozpracované změny: instalační, policy a koordinační změny ostatních tasků byly pouze čtené; nic převzato ani změněno. Specifikace, task JSON, AGENTS, vendor skills a hra zůstaly mimo rozsah zápisu.
- Podklady: specifikace pilotu, skutečné instalované manifesty/scripts/skills 6.12.4 a předání jejich vlastníků, prohlédnuté 17. 10. 2026. Návod odkazuje na doloženou instalaci a následný výsledek reinstallu/přenositelnosti koordinátora; integrační přejímku dosud netvrdí.
- Refaktoring: společná pravidla odkazují na policy; sjednocena tabulka výstupů a přehled selhání. Žádné změny herních cache, alokací nebo lifecycle.
- Ověření: [evidence a omezení](../../../_bmad-output/implementation-artifacts/bmad-pilot-20261017/README.md), [výsledky kontrol](../../../_bmad-output/implementation-artifacts/bmad-pilot-20261017/checks.json). Obsahuje skutečné časy, verze, validaci katalogu, linky a shodu příkazů. Chybějící společný doklad se případně vykazuje jako pending; nejde o čistý úplný link pass.
- Snapshot: [SHA-256 manifest](../../../_bmad-output/implementation-artifacts/bmad-pilot-20261017/source-manifest.json) obsahuje návod, tento handoff, README evidence a výsledky kontrol. Samotný manifest není zahrnut ve vlastním otisku. Žádný commit podagent nevytvářel.
- Procesy a zdroje: jen krátké CPU CLI, všechny skončily; žádný server, renderer, instalátor, GPU nebo těžká validace, `resources: []`.
- Omezení a další krok: root provede nezávislé review přesného diffu, ověří případný pending odkaz na společnou evidenci a dokončí integraci. Tento pilot nedokládá funkčnost hry.
- Rezervace: claim `bmad-pilot-20261017` získán před zápisem bez `--adopt-dirty`; po hotovém předání následuje release. Aktuální stav je v registru, release není Done.
- Převod vlastních výstupů: po release předávám právě výše uvedené soubory koordinátorovi pro review, případné doložené opravy a integraci; žádný cizí soubor není předmětem převzetí. Stav tasku, specifikace a Linear aktualizuje integrátor až podle skutečného výsledku.

Oprava po review 17. 10. 2026: původní autor znovu rezervoval právě svých pět souborů pomocí `--adopt-dirty`. Opravil zobecnění rendereru: render platí pro build/build-auto, ostatní skills se řídí vlastním vstupem, vždy se zachováním rezervace před zápisem. Ověřil upravený odstavec proti instalovaným build/build-auto/spec/help vstupům, místní odkazy upravených dokumentů a obnovil výsledky/manifest. Žádné širší testy, vendor změny nebo procesy. Po této úzké opravě se claim opět uvolňuje a předání koordinátorovi trvá.
