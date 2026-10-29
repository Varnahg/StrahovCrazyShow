# Předání: serve-main-playtest-20261015

- Vlastník: playtest-main-20261015-live; služby zůstávají pod aktivním claimem.
- URL: http://127.0.0.1:4188/; izolované API2583. Source commit e1b03fe8a6c14f25c14bb6173ce90c29050ed9ea, snapshot4dcb3f6fc34a560b455c0ee5c4f02a014105142d4bcce392f2628bca0e012ca0.
- Cwd: vlastní key17-ownership-integration WT/.cache/main-playtest-20261015/frozen. Převzato po dokončení prepare tasku a uvolnění jeho zdrojů. Sources/dist i borrowed own node_modules jsou během testu immutable.
- Ověření15.10: HTTPhealth200, recorder status200/enabled, server buildSnapshotId a client bundle marker shodné;5 skutečně servírovaných HTML/JS/CSS souborů SHA shodných s dist. GIT_CEILING chrání před nepravdivou ancestor Git identitou.
- Skutečný nový POST201/receipt a diskJSONL PASS; d6164e33-2721-4518-9ba4-3ed54f15fcd8 je označený synthetic agent-collector-smoke, nikoli hraná relace. Nové uživatelské logy jsou ve frozen/.cache/game-diagnostics/.
- Procesní identity/cmd/startUTC/port jsou pouze v .cache/main-playtest-20261015/live/current-runtime.json a příslušném runs/runtime.json. Hidden launcher, porty předem volné; stop.ps1 smí zastavit pouze ověřené vlastní identity. Služby běží, serve rezervace se neuvolňuje.
- Browser panel byl požádán přímo o URL. HTTP ověření není potvrzení GPU/renderu; ruční test provede uživatel. Měřicí okno rezervuje samostatný user-playtest-window-20261015.
- Postup: jedna herní karta; společný svět; medium den→noc stejná trasa,3./1.osoba, B6 vstupy/obě schodiště/F,low/high/auto,editor/avatar,mapa,auto,tab background,R a přechod solo/multi. Zakončit návratem do menu a5s na flush.
- Meze: automatické frame/network/quality/viewport údaje ano; camera/flashlight/lighting selection a obraz nejsou úplně zachycené. Uživatel stručně doplní krok/místo/den-noc a viditelný jev. Nejde o nové FPS nebo odstranění všech nálezů.
16Oct2026: same original dependency owner created an additional read-only borrowing junction at playtest-diary/StrahovCrazyShow/node_modules to this immutable pinned9.30.0 dependency tree, at the explicit diary coordinator request. No install/target byte changed. Diary must NEVER install/update/patch through this junction while frozen4188 borrows it. Original main node_modules is not the accepted pinned/patched validation tree. Global dependency reservation remains with this live preview owner; no dependency ownership was transferred. New link creation only; no new server/GPU process.

## Bezpečné odstavení na pokyn koordinátora KEY-44 — 19. 10. 2026

Další implementace této relace je zastavená. Ověřené původní API i preview procesy již neexistují; při tomto odstavení nebyl ukončen žádný proces a nebyl použit zásah podle portu. Oba porty jsou bez listeneru. Přesné PID/start/command důkazy jsou pouze v lokálním reportu:
`.cache/main-playtest-20261015/live/shutdown-key44-20261019.json`.

Rezervace `serve-main-playtest-20261015`, owner `playtest-main-20261015-live`, může být po tomto dokončeném handoffu uvolněna. Neproběhl commit, integrace, plné testy, build, GPU, změna katalogu, AGENTS ani docs/verification.md. Původní runtime záznamy, neměnný snapshot/dist, automatické JSONL a pracovní soubory jsou zachované na uvedených cestách. Předešlé tvrzení v tomto dokumentu o běžících službách nahrazuje tento stav.

Dokončené vlastní světelné opravy byly již dříve publikované jako114389e,9d98ffc,960cb6f; tento shutdown nic dalšího nepřijímá. Širší historický neintegrovaný WIP a cizí novější změny zůstávají zachované. Tato portová rezervace neobsahuje nepředaný rozpracovaný herní feature. Opětovné spuštění vyžaduje nové přidělení a claim; není automaticky autorizované tímto handoffem.

Obnovitelné výsledky této relace: docs/performance/evidence/night-flashlight-20261015/ a .cache/night-flashlight-20261015/{baseline,v1,v3,v4,v5}/ v této worktree. Obsahují logy, snapshoty včetně testů a přijaté/nepřijaté iterace. Helper4189/API2584 byl ukončen při publikaci; dnešní read-only kontrola potvrdila nepřítomnost všech8zapsaných PID jeho4běhů i listenerů. Cíl celé historické opravy již byl paused a zůstává paused; žádný podagent této relace neběží.

Dependency stav se nemaže ani neopravuje: playtest-diary/node_modules nadále může být junction na tento target. Incident16Oct: pnpm exec v diary ohlásil automatickou dependency kontrolu a .modules.yaml měl SHA25620d94b459d55d75fdaf74f9e115b15de9f0308a06d3f9086181f15162445b978; původní hash tohoto metadata souboru nebyl nalezen. Přerušená read-only kontrola nedoložila neměnnost celé instalace. V tomto shutdownu nebyl proveden install/restore/patch ani odstranění junction. Koordinátor musí případné další sdílení závislostí převzít vědomě a odděleně od restartu starého frozen4188.

Původní main Game/UI diagnostický WIP a úzký katalog deníku byly výslovně předané diary koordinátorovi01a141c7 v docs/agents/handoffs/dev-coordination-maintenance.md. Tuto cizí navazující práci ani její claims nyní neupravuji. Smíšený novější main WIP není automaticky vlastnictvím této relace.
