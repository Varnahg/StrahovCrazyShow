# Předání: serve-combined-playtest-20261014

- Vlastník root repairs-01a13624-combined-preview, ownership WT; nováURL **http://127.0.0.1:4187/**, API2582. Snapshot1cddfe82303f6d7365df5470fc09f9a3fa71b4c4021150b3c67c131c3401562c;922/922+build+celá integracePASS,515hashů zachovaných.
- Vlastní node --import tsx server/index.ts a node scripts/performance-preview.mjs běží hidden z immutable candidate. PřesnéPID/startUTC/command pouze v runtime cache .cache/combined-playtest-20261014/live-preview/runs/candidate-20261014-175032-921-0f6c5a93/runtime.json; oba aktuálníCIM starty/příkazy i vlastníci portů ověření. Ready=true až po HTTP kontrole, žádný cizí proces zastavený.
- HTTP health200, diagnostics status200 a buildSnapshotId odpovídají.5 skutečně servírovaných HTML/JS/CSS souborů byte-shodných sdist, klient obsahuje sourceID. Collector POST přes stejnýpreview vytvoříJSONL na disk; syntetický kind agent-collector-smoke je výslovně nongame. Současné3 JSONL jsou pouze tyto agentovy smoke záznamy, ne uživatelský test.
- První dva pokusy checkeru měly chybné očekávání HTTP200 místo správného201 a jedné JSONL řádky místo header+batch. Opraven pouze helper, aplikace zapisovala správně; původní pokusy zachované vlive-preview/http-first-attempt.json a http-second-attempt.json. Finální checker PASS, http-verification.json.
- App open_in_codex URL vrací queued. Není potvrzený skutečný browser render neboGPU. Automatické logy jsou součástíbuild a začnou bez ručního profileru; celý uživatelský cíl se neuzavírá.
- Aktuální čas a počasí, žádná QAweather fixture. Staré4186/API2581 ponechané beze změny. Tato nová služba drží jenport4187/2582; před jakýmkoli dalším heavy/GPU krokem kontrolovat také nové4187/2582 a skutečné herníJSONL zde, ne jen staréports. Smoke records nesmějí být zaměněné za hraní.
- Stop pouze vlastním live-preview/stop.ps1 s přesnou výše uvedenou runtime cestou; helper ověřuje vlastnictví, startUTC a příkaz. Rezervace zůstává aktivní, protože uživatel má službu ktestu.

## Bezpečné odstavení na pokyn koordinátora KEY-44 — 19. 10. 2026

Další implementace této relace je zastavená. Ověřené původní API i preview procesy již neexistují; při tomto odstavení nebyl ukončen žádný proces a nebyl použit zásah podle portu. Oba porty jsou bez listeneru. Přesné PID/start/command důkazy jsou pouze v lokálním reportu:
`.cache/combined-playtest-20261014/live-preview/shutdown-key44-20261019.json`.

Rezervace `serve-combined-playtest-20261014`, owner `repairs-01a13624-combined-preview`, může být po tomto dokončeném handoffu uvolněna. Neproběhl commit, integrace, plné testy, build, GPU, změna katalogu, AGENTS ani docs/verification.md. Původní runtime záznamy, neměnný snapshot/dist, automatické JSONL a pracovní soubory jsou zachované na uvedených cestách. Předešlé tvrzení v tomto dokumentu o běžících službách nahrazuje tento stav.

Dokončené vlastní světelné opravy byly již dříve publikované jako114389e,9d98ffc,960cb6f; tento shutdown nic dalšího nepřijímá. Širší historický neintegrovaný WIP a cizí novější změny zůstávají zachované. Tato portová rezervace neobsahuje nepředaný rozpracovaný herní feature. Opětovné spuštění vyžaduje nové přidělení a claim; není automaticky autorizované tímto handoffem.
