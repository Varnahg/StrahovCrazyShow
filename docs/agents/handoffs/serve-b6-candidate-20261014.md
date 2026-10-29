# Předání živého B6 preview — 14. 10. 2026

- Vlastník `repairs-01a13624-b6-preview`, koordinátor root. Worktree `C:/Users/rezac/.codex/worktrees/playtest-repairs-wave4/StrahovCrazyShow`, větev `codex/playtest-repairs-wave4`, HEAD `f63039b4067d57c8bdbe560ead5719cfc05cbb0d`.
- Na výslovný pokyn uživatele běží neměnný candidate na **http://127.0.0.1:4186/**, API2581. Snapshot `cbc158068138e3454a6959a0d7a945465ea2974e6c246e86ed231abf92a4b5dc`. Nové package/IMAGE a Game pracovní změny nejsou v tomto buildu.
- Provozní metadata (konkrétní PID, UTC start, příkaz, runtime stav) jsou pouze v `.cache/b6-transform-validation/live-preview/runs/candidate-20261014-143308-606-3e9d8f54/runtime.json`. CIM identita obou nových procesů ověřena. Health přes4186 vrací200/ok. Předchozí runtime `runs/candidate-20261014-141603-418-37498c6a` je ukončený, potvrzení v jeho `closed-for-preview-transfer.json`.

## Důvod oddělení a skutečný převod

Samotné dostupné HTTP/API preview není probíhající GPU přejímka. Před převodem byla opakovaně ověřena absence připojeného TCP klienta na4186/2581 i nových herních JSONL. Proto původní validační owner korektně zastavil pouze své procesy pomocí ověřeného runtime a potvrdil jejich zánik. Teprve poté uvolnil validate-b6 rezervaci, získal nový serve-b6 task s oběma porty a služby znovu spustil. Nešlo o přepsání vlastníka živého procesu; žádná existující herní relace nebyla zjištěna.

Nový task chrání `.cache/b6-transform-validation/live-preview/`, runtime zapisovanou `candidate/.cache/` a tento handoff. Zdroj, dist, sdílené assety a původní dependencies zůstávají pouze pro čtení. Nezabírá GPU/heavy-validation pro neexistující měření; každý takový další proces vyžaduje svou rezervaci a předstartovní kontrolu skutečného hraní.

## Helpery a ověření

`live-preview/start.ps1` a `stop.ps1` jsou odvozené ze start/stop QA helperů. Lifecycle kód se nezměnil; upravena metadata tasku/owneru, output/source/počasí a pouze portové resources, vstupní varianta omezená na candidate. Stávající manifest identity gate, kontrola registru/cwd/heartbeatu, průběžné runtime záznamy a bezpečný partial-start cleanup zůstávají. Oba helpery prošly PowerShell parserem. Předchozích18 mock scénářů patří původnímu lifecycle helperu, nejsou vydávané za nový samostatný běh této varianty.

Použít dostupný PowerShell Core7.6.5: `C:/Users/rezac/.cache/codex-runtimes/codex-primary-runtime/dependencies/native/powershell/pwsh.exe`. Při zastavení předat `live-preview/stop.ps1 -RuntimePath <přesný vlastní runtime.json>` a ověřit zánik; nikdy neukončovat proces jen podle portu. Rezervace zůstává aktivní, dokud její vlastní služby běží. Obnovovat heartbeat nejpozději po15minutách.

Před prvním startem bylo ověřeno510/510 source/config/test hashů a byte shoda HTTP HTML/JS/CSS, evidence v původním runu. Zachovaný source a build se během převodu nezměnil. Znovu potvrzeno původní schema5.0.36 a oba relevantní Babylon source hashes main instalace; nepřijatý patch v jiné worktree jej nemění.

## Otevřené kroky

Otevření URL přes app tool vrací queued; to není důkaz renderu. Žádný nový GPU/FPS/obrazový výsledek se netvrdí. Automatické herní logy se po načtení stránky uloží do `candidate/.cache/game-diagnostics/`; koordinátor je přiřadí a zkopíruje do run evidence před retencí. Při skutečné herní aktivitě další rušivé validace nezačínat. Pro řízené B6 A/B nejprve koordinovaně zastavit tento preview a převést služby zpět pod plnou validační rezervaci; samotný portový task neopravňuje k GPU měření.

## Bezpečné odstavení na pokyn koordinátora KEY-44 — 19. 10. 2026

Další implementace této relace je zastavená. Ověřené původní API i preview procesy již neexistují; při tomto odstavení nebyl ukončen žádný proces a nebyl použit zásah podle portu. Oba porty jsou bez listeneru. Přesné PID/start/command důkazy jsou pouze v lokálním reportu:
`.cache/b6-transform-validation/live-preview/shutdown-key44-20261019.json`.

Rezervace `serve-b6-candidate-20261014`, owner `repairs-01a13624-b6-preview`, může být po tomto dokončeném handoffu uvolněna. Neproběhl commit, integrace, plné testy, build, GPU, změna katalogu, AGENTS ani docs/verification.md. Původní runtime záznamy, neměnný snapshot/dist, automatické JSONL a pracovní soubory jsou zachované na uvedených cestách. Předešlé tvrzení v tomto dokumentu o běžících službách nahrazuje tento stav.

Dokončené vlastní světelné opravy byly již dříve publikované jako114389e,9d98ffc,960cb6f; tento shutdown nic dalšího nepřijímá. Širší historický neintegrovaný WIP a cizí novější změny zůstávají zachované. Tato portová rezervace neobsahuje nepředaný rozpracovaný herní feature. Opětovné spuštění vyžaduje nové přidělení a claim; není automaticky autorizované tímto handoffem.
