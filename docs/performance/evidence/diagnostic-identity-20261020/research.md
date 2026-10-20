# Výběr a průzkum KEY-50

20.10.2026, základ main ab39b7185d0c9fb5e393c654818f43de82e07886; jeho verify39404188052 a hygiene39404188087 skutečně success. Uživatelské zadání: malý performance-related CLI úkol přes nový řadič až do PR/merge/mainCI.

## Výběr z existujícího Linearu
KEY-5/31/32/40/42 a ostatní runtime optimalizace vyžadují produkční CPU/GPU přejímku a širší scope. KEY-2 výslovně eviduje zbývající chybnou interpretaci network-left/identity-change v offline reportu; dřívější raw hitch/observer oddělení je už hotové a neopakuje se. Malý vymezený výsledek je veden jako child KEY-50. Parent zůstává In Progress.

Registry má4cizí diary rezervace, žádná nezahrnuje vybrané2soubory, renderer nebo github-ci-validation. Primární checkout tyto2cesty nemá dirty. Cizí rezervace nejsou přebírány. Hrané buildy a běžící 3D scény nejsou součástí offline práce.

## Primární podklady a doložený mechanismus
- client/game.ts, Game.setLocalId: při změně id a existujícím network emituje network-left/reason=identity-change a resetuje diagnostický/predikční epochový stav. Událost sama neprovádí odpojení transportu.
- client/ui.tsx: skutečné UI.leave emituje network-left bez tohoto důvodu; transport onLeave emituje network-disconnected. Jde o odlišné události.
- scripts/diagnostics-report.mjs: connectionEvents pro všechny4síťové druhy ukládají connected: kind === network-connected. Každý network-left tudíž zruší connected důkaz před vyhodnocením sampled connection context.
- CLOCK_BOUNDARIES a clockEvidence ve stejném souboru mají jiný účel: identity boundary má nadále rozdělovat server clock čítače.
- tests/diagnostics-report.test.ts už kryje pořadí, context age, guest, raw percentily, poškozené logy a server-clock segmenty, ale ne přesnou identity-change výjimku.
- docs/performance/evidence/playtest-20261015/README.md a KEY-2 dokládají význam spolehlivých reportů pro interpretaci render/síťových incidentů. Soukromý historický raw log se nekopíruje ani nepřepisuje.

Přímý reproduktor input.jsonl je označená syntetická sekvence existujícího schématu, ne nová produkční/GPU evidence. accept-cli.mjs spouští skutečné Node CLI v JSON i text režimu a kontroluje invarianty vstupu/výkonových čítačů. Výsledek před opravou se zaznamená samostatně; očekávaný mechanismus je potlačení2nesouladů na0.

## Varianty před implementací
1. Změnit Game/UI emisi: neřeší staré archivy, mění runtime a vyžaduje širší přejímku; pro tento již definovaný CLI problém nepřiměřené.
2. Obecný nový stavový model/opravování raw logu: vyšší počet stavů a riziko změny historie bez potřebného přínosu.
3. Vynechat všechny network-left: nesprávné, skutečné opuštění musí uzavřít connected období i server-clock segment.
4. Zvolená úzká klasifikace přesného identity-change pouze při tvorbě connectionEvents. Nemění lifecycle ani CLOCK_BOUNDARIES a nepřidává veřejné schéma.

Cílený refaktoring má udržet klasifikaci čitelnou a vyhnout se nové per-record alokaci/stavu. Jde o konstantní rozlišení události v již existujícím streaming průchodu; netvrdí se měřený CPU/FPS zisk. Chování hry, GPU, zdroje/cache a jejich lifecycle se nemění. Nevyřešené širší performance otázky zůstávají KEY-2/KEY-5 a jejich dětem.

## Reprodukce před implementací
Skutečné plain-Node JSON/text CLI: původní report vrací0nesouladů místo2; acceptance exit1 s přesnou asercí0 !== 2.9raw frames, server-clock20callbacků/12ms ve2intervalech a input SHA4056d5f4cb396a9b0dfd92d2cc915a7bda3ed1f8146fbfa99873f15e52dd96c6 zůstávají správné. Původní29diagnostických testů PASS (808.198ms), takže jde o nekrytou konkrétní regresi, ne plošně rozbitý základ. [Přesná evidence](baseline.json) a [původní failure](baseline-cli.stderr.log).
