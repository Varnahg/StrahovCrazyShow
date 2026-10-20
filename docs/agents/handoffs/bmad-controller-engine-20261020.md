# Předání: bmad-controller-engine-20261020

- Vlastník: `bmadctl-01a155b2-engine`; příjemce: `bmadctl-01a155b2-coordinator`.
- Pracovní kopie: `C:/Users/rezac/.codex/worktrees/ci-main-autonomous-pilot/StrahovCrazyShow`, větev `codex/bmad-single-task-controller`, základ `ceddc0802cd98dccfbee9d44fc00d6331ac9d749`.
- Výsledek: implementované `run`, `status`, `resume`, validace a zmrazení manifestu, atomický checkpoint, OS IPC singleton a oddělený supervisor s terminálním receipt. Adaptéry/živá PR integrace jsou samostatné navazující úkoly; tento handoff neoznačuje celek KEY-46 za hotový.
- Rozsah: `scripts/autodev.mjs`, `scripts/autodev/{engine,store,process,supervisor}.mjs`, `tests/autodev-{engine,store}.test.ts` a toto předání. Cizí WIP, task katalog, renderer, klient/server ani package soubory nezměněny.
- Podklady: zmrazená [specifikace](../../../_bmad-output/implementation-artifacts/bmad-controller-20261020/spec.md) a [kontrakt](../../../_bmad-output/implementation-artifacts/bmad-controller-20261020/contract.md), projektová pravidla, skutečný registry CLI; primární [Node IPC](https://nodejs.org/api/net.html#ipc-support), [detached procesy](https://nodejs.org/api/child_process.html#optionsdetached), [fs sync](https://nodejs.org/api/fs.html#filehandlesync), ověřeno 20. 10. 2026.

## Rozhraní a lifecycle

`engine.mjs` exportuje `run({repo, assignment, adapter?, onEvent?})`, `resume({repo, runId, adapter?, onEvent?})` a `status({repo, runId})`. Výsledkem je úplný JSON checkpoint doplněný `runDir`. `status` navíc vrací `controller`, `controllerAlive`, `resumable`; žádný soubor nemění. `running` na disku po pádu není důkaz běžícího řadiče. Aktivitu dokládá pouze IPC odpověď; PID je informační.

Manifest vyžaduje i disjunktní `workerTask`, volitelně `validationTask`. Canonical digest nereaguje na pořadí JSON klíčů, ale změnu chování odmítá. Run ID vychází z canonical git-common-dir a Linear issue, je stejné napříč worktrees stejného repozitáře. Originální manifest se znovu kontroluje i při resume; poškozené checkpointy zůstávají zachovány.

Adapter context odpovídá kontraktu: `repo`, `runId`, `runDir`, `assignment`, `state`, aktuální getter `data`, `save(patch)` se shallow merge, `supervise(options)`, `emit(event)`, `fault(point)`. Checkpointy jsou serializované i při `Promise.all` tří review workerů. Stejný souběžný key sdílí jediný promise; změněný příkaz pod tímto key se odmítne. Po chybě jednoho review se před uvolněním singletonu vyčkají jeho sourozenci.

`supervise` přijímá `{key,command,args,cwd,env?,heartbeat?}`. Heartbeat je jeden objekt nebo pole objektů `{command,args,cwd,intervalMs}`. První sadu supervisor skutečně awaitne před workerem. Selhání nevytvoří worker a má známý failure receipt; pozdější heartbeat selhání zneplatní úspěch workeru. Proměnné prostředí se pouze dědí/mergeují při spuštění, nepersistují se do requestů. Příkaz/argumenty/cwd/heartbeat tvoří stabilní identitu attemptu, environment se z uloženého receipt nereprodukuje.

Výsledek `supervise` obsahuje `attemptId`, `exitCode`, `signal`, `stdoutPath`, `stderrPath`, `finishedAt`, případně `error`/`heartbeatError`. Známe-li původní neúspěšný receipt, resume vrátí tentýž výsledek a nic znovu nespouští. Trvale zaznamenaný dispatch bez receipt a bez ověřeného IPC znamená `unknown`. Neexistuje automatické odstraňování zámku, retry podle stáří ani ukončování cizího PID. `UNKNOWN_EFFECT` z adapteru se také klasifikuje jako `unknown`.

Testovací `AUTODEV_TEST_CRASH_AT` vyvolá skutečný `SIGKILL` řadiče, jednou díky durable markeru. Body: `before-supervisor-spawn:<key>`, `after-supervisor-start:<key>`, `after-stage:<stage>` a libovolný explicitní bod adapteru přes `ctx.fault`, zejména `after-pr-create`. První bod záměrně ponechá nejistý dispatch, pokud ke spawn ještě nedošlo; nesmí se slepě opakovat.

## Refaktoring a omezení

Sdílené canonical JSON/hash/validace a atomic writer jsou ve `store.mjs`; IPC protokol a supervise v `process.mjs`; supervisor nikdy nezapisuje engine checkpoint. Jediná write queue řeší pořadí souběžných save/attempt dokončení. IPC sockety, heartbeat časovače, file handles a vlastní child procesy mají explicitní lifecycle; server se uvolní až po dopsání receipt a heartbeat completion. Logy se zachovávají pro původní attempt.

V1 podporuje Windows named pipes a Linux abstract Unix sockets. Ostatní OS odmítne, místo aby riskoval unlink živého pathname socketu. Pád samotného supervisoru bez receipt neumí obecný Node bezpečně spojit s ukončením všech potomků; výsledek zůstane `unknown`. Worker nesmí vytvářet neřízené background procesy, silnější OS containment není v tomto scope. Samostatné kill/restart testy dodává recovery QA a živý GitHub/Linear pilot integrátor.

## Ověření 20. 10. 2026

- `node --test tests/autodev-store.test.ts tests/autodev-engine.test.ts`: **exit 0, 14/14**, poslední běh 11.997 s. Obsahuje skutečné supervisor/worker procesy, tři paralelní receipty, singleton BUSY, status bez zápisu, neduplicitní failed worker resume, heartbeat bez neautorizovaného spawn a chybějící receipt bez replay. Node 24.19.0, Windows.
- Původně předepsané `node --import tsx --test ...`: **exit 1**, v této pracovní kopii chybí balíček `tsx`. Žádné závislosti ani lockfile nebyly měněny. Samostatné testy používají nativní stripping Node 24 a žádnou externí závislost.
- Cílený `tsc --noEmit --target ES2022 --module ESNext --moduleResolution Bundler --strict --skipLibCheck --typeRoots C:/Users/rezac/Documents/GitHub/StrahovCrazyShow/node_modules/@types --types node tests/autodev-engine.test.ts tests/autodev-store.test.ts`: **exit 0**, compiler přečten ze stávajících dependencies primárního checkoutu.
- `node --check` všech pěti `.mjs`, CLI `--help`, `git diff --check`: **exit 0**. Vlastní soubory sjednoceny stávajícím Prettierem.
- Plná sada/build/integrace se zde nespouštěly, task nemá heavy-validation. Živý backend ani Linux tímto výsledkem ještě nejsou doloženy.
- Test fixtures byly výhradně `mkdtemp` adresáře v uživatelském Temp, následně odstraněné. Žádný HTTP port. Procesní inspekce po testech nenašla vlastní běžící `autodev/supervisor.mjs`; žijící vlastní helper nepředávám.

## SHA-256 předávaného checkpointu

| Soubor | SHA-256 |
| --- | --- |
| scripts/autodev.mjs | 89B178913F6CCD6B945C2B499C47376AA6F76726A4F049F995F1519ADE62F00A |
| scripts/autodev/engine.mjs | 6313CDC29E71E1897B9F4335ABCD66087969D55B20F1ED779F3BA8A36E926327 |
| scripts/autodev/store.mjs | 9B708E2DB2D1CC86AEA1125023916230801D0A335B5E71A47BD8A0FAF8C100BD |
| scripts/autodev/process.mjs | B2D675C2F1AA0FE55BDBA68B9D582F7D6F0289B5F89C2878F613889A81DA8B98 |
| scripts/autodev/supervisor.mjs | CFA13C3C1F005E7D0671331C5C91DB1B4A4863C13911BF280E8A026D44BBD361 |
| tests/autodev-engine.test.ts | 4DDCFD7ECE518C8C2CE30BCE4B8580C99FE275C894A9A1BEF016AFFE41F026F9 |
| tests/autodev-store.test.ts | 8CF99FA80C04BF541CF87B84F5ECD0331840589E400AFDE5C3CFD0EAEB6715EE |

Rezervace se uvolňuje po tomto předání; implementace je doložené vlastní WIP předané koordinátorovi, nikoli volný rozsah pro jiné zadání. Commit, přijetí tasku a integraci provádí koordinátor. Žádný commit ani remote změna nebyly tímto podagentem provedeny.

## Addendum: opravy review 20. 10. 2026

Původní vlastník znovu úspěšně rezervoval stejné doložené WIP pomocí `--adopt-dirty`; žádný cizí soubor nepřevzal. Review doložilo dvě chyby: optional JSON read používal `null` současně pro ENOENT i pro existující JSON null a truthiness v engine mohla přepsat falsy checkpoint; `startedAt` neměl validaci, takže neplatný datum mohl vytvořit NaN deadline a nekonečné polling.

Nejmenší společná oprava používá `undefined` výhradně jako výsledek skutečného ENOENT. Žádný validní JSON tuto hodnotu nereprezentuje. `run`, `resume` a `status` testují explicitně `undefined`; existující `null`, `false`, `0` či prázdný řetězec vždy odmítnou jako `CORRUPT_STATE` před inicializací adapteru a zachovají původní bytes. Alternativa samostatného stat/access před čtením by přidávala I/O i race; nový sentinel tento problém nemá. Invalidní `startedAt` se odmítá validací konečného a canonical ISO UTC okamžiku před supervision; žádné nahrazení času aktuálním okamžikem ani automatický retry.

Na navazující žádost koordinátora byly auditovány i optional request/receipt/started callsites v `process.mjs` a `supervisor.mjs`. Přítomný falsy záznam nelze zaměnit za absenci. Orphan started/receipt bez engine dispatch checkpointu zastaví práci před jakýmkoli spawn. Sdílená receipt validace se používá i při přímém vstupu supervisoru; původní bytes zůstávají zachované. Nová CLI volba nepřibyla. Adaptéry nebyly upraveny; jejich autor dostal informaci, že optional ENOENT nyní vrací `undefined`.

Ověření po opravách:

- `node --test tests/autodev-store.test.ts tests/autodev-engine.test.ts`: **exit 0, 17/17**, 16.219 s, pouze testy dotčeného engine/store/process/supervisor.
- Nové přímé regrese: čtyři falsy hodnoty přes všechna tři engine API; dvanáct kombinací request/receipt/started × falsy hodnoty přes engine i přímý supervisor, bez logu nebo worker spawn; sedm chybějících/neplatných timestampů přes subprocess s 3s timeoutem. U timestampů původní worker proběhl právě jednou, resume nevolalo ani adapter stage, původní bytes i jediný attempt zůstaly zachované.
- Stejný cílený strict `tsc` pouze nad dvěma dotčenými testy: **exit 0**. `git diff --check`: **exit 0**. Celá sada/build/integrace se znovu nespouštěly; provede integrátor.
- Po testech nebyl nalezen vlastní živý supervisor; temp fixtures uklizeny. Žádné remote operace ani commit. Rezervace se po tomto addendu opět uvolňuje a vlastní WIP se předává stejnému koordinátorovi.

Aktuální SHA-256 nahrazují odpovídající hodnoty výše (CLI entrypoint zůstal beze změny):

| Soubor | SHA-256 |
| --- | --- |
| scripts/autodev/engine.mjs | 5248F5A8CF72B527B5F1CA2C392B56DD041985CED6876B068D4BB45D52C35B3B |
| scripts/autodev/store.mjs | 1B680AAA4300874580350BA5B9511AADCE47B343BB761F30EFD529618942E605 |
| scripts/autodev/process.mjs | 27C26E422A53892CF1DCD6FB71EE6EAB7C3B3DC099AF62E1F5B40265F7823AEC |
| scripts/autodev/supervisor.mjs | B367F982F2BD6FD54756E4CC5E0141AC96B0371A13D2D2AB60282F58C8E0F81B |
| tests/autodev-engine.test.ts | 8A15E441B79260D8673EB534C42B27AEAA34CCC19BFA4DBE52FA2D03E88593AE |
| tests/autodev-store.test.ts | 9E80A7A9AD370709F1EFB095AA466EFD04AEEB31DC21E9AF298DEC5F5F3E5D3A |
