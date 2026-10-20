# Předání: bmad-controller-recovery-qa-20261020

- Vlastník: `bmadctl-01a155b2-recovery`; příjemce: `bmadctl-01a155b2-coordinator`.
- Pracovní kopie: `C:/Users/rezac/.codex/worktrees/ci-main-autonomous-pilot/StrahovCrazyShow`, větev `codex/bmad-single-task-controller`, základ `ceddc0802cd98dccfbee9d44fc00d6331ac9d749`.
- Výsledek: sedm skutečných subprocess crash/recovery testů a samostatný runner všech cílených autodev testů. Finální společný běh **38/38, exit 0**. Toto není živá přejímka GitHub/Linear ani dokončení KEY-46.
- Vlastní soubory: `scripts/test-autodev.mjs`, `tests/autodev-recovery.test.ts`, `tests/fixtures/autodev/{controller.mjs,worker.mjs,harness.ts}` a toto předání.
- Cizí WIP: existující engine/adapters, specifikace, katalog a koordinační evidence zůstaly beze změny. Nebyl převzat žádný jejich zápis ani spuštěn další BMAD workflow. Žádný commit, staging či vzdálená mutace.

## Podklady a volba testů

Načteny AGENTS, architecture/README/current-work/bmad-policy, task JSON, [specifikace](../../../_bmad-output/implementation-artifacts/bmad-controller-20261020/spec.md), [kontrakt](../../../_bmad-output/implementation-artifacts/bmad-controller-20261020/contract.md), engine/process/store/supervisor, původních 14 engine/store testů a předání enginu. Prvních 14 testů již pokrývalo běžné receipty a část singletonu; chyběl nový controller proces po skutečném kill.

Porovnány mock stavového algoritmu, CLI s injekcí adapteru a samostatné child procesy nad veřejným programovým API. Zvolen tenký lokální adapter ve fixture: nepřidává produkční CLI přepínač, nevytváří umělé checkpointy a nevolá GitHub/Linear/Codex. Produkční CLI se samostatně spouští pro `status`; jeho návratové kódy se neodvozují od fixture wrapperu. Pevné prodlevy nahrazeny startovacím ledgerem, IPC identitou a souborovou závorou. Skutečná 15s grace enginu zůstala beze změny.

1. Skutečný `SIGKILL` controlleru, nový proces `resume`, totožný supervisor PID, worker PID a attempt ID, jediný start. `status` během běhu/pádu i po dokončení; opakované complete resume zachová checkpoint i receipt bajtově.
2. Worker dokončí práci během nepřítomnosti controlleru; stavový checkpoint se přitom nezmění. Nový controller převezme původní receipt/logy bez dalšího dispatch.
3. Skutečný kill předem ověřeného supervisoru po pádu controlleru; resume i další resume zůstanou `unknown`, původní attempt, žádný nový worker ani vymyšlený receipt.
4. Dva samostatné resume procesy soupeří o singleton: jeden `BUSY`, jeden převezme původní worker.
5. Skutečný dokončený receipt s následně rozbitým JSON: `unknown/CORRUPT_STATE`, zachování poškozených bajtů a žádný replay.
6. Skutečný dokončený receipt s následně změněnou identitou: `unknown/UNKNOWN_ATTEMPT`, zachování poškozených bajtů a žádný replay.
7. Worker při nepřítomnosti controlleru skončí exit 7; dvě obnovení zachovají `stopped`, původní exit/receipt/logy a jediný start.

Produkční `node scripts/autodev.mjs status` prokazatelně vrací JSON, exit **0** pro running/complete, **1** pro stopped a **2** pro unknown; nemění obsah ani mtime checkpointu. `controllerAlive` je zkontrolováno proti skutečnému child PID, nikoli pouze uloženému stavu.

## Refaktoring a lifecycle

Společný harness sjednocuje spawn, sběr událostí, bounded čekání, čtení statusu a úklid. Neimplementuje stage machine ani vlastní attempt digest. Worker má soukromý nonce, startovací ledger, jednu závoru a 60s maximální životnost. Ověření singletonu používá skutečně současně spuštěné procesy, nikoli dvě Promise ve stejném controlleru.

Všechny subprocessy mají `windowsHide`, explicitní argumenty a žádný shell. Kill controlleru používá pouze zachycený ChildProcess handle. Kill supervisoru předem ověřuje PID/token/requestDigest přes jeho IPC. Ostatní worker procesy se pouštějí přes vlastní závoru; cleanup čeká na skutečné ukončení zachycených procesů. Rekurzivní odstranění fixture kontroluje původní canonical mkdtemp root, jeho rodičovský Temp a prefix. Žádné hledání procesů podle portu ani zasahování do cizího procesu.

## Skutečné výsledky 20. 10. 2026

Prostředí: Windows, Node **v24.19.0**, libuv **1.52.1**. Dependencies nebyly instalovány ani měněny.

| Kontrola | Výsledek |
| --- | --- |
| První `node --test tests/autodev-recovery.test.ts` | **exit 1, 6/7, 21.710 s**. Fixture sondovala IPC během kill supervisoru a obdržela `INVALID_IPC: Incomplete IPC response`; její původní cleanup navíc očekával dokončovací marker dítěte. |
| Druhý stejný příkaz po opravě sondy/cleanup | **exit 1, 6/7, 26.697 s**. Test předpokládal, že dítě žijící okamžik po smrti supervisoru musí žít i za 15 s; na Windows doběhlo jeho systémové ukončení. Engine již vrátil správné `unknown`. |
| Finální `node scripts/test-autodev.mjs` | **exit 0, 38/38, 77.218 s**: 17 adapters + 10 engine + 7 recovery + 4 store. Recovery scénář ztraceného supervisoru trval 16.217 s, skutečná grace se nefalšovala. |
| `node node_modules/typescript/bin/tsc --noEmit --target ES2022 --module ESNext --moduleResolution Bundler --strict --skipLibCheck --allowImportingTsExtensions --types node tests/autodev-recovery.test.ts` | **exit 0**, včetně importovaného harnessu. |
| `node --check` runneru, controller fixture a worker fixture | **exit 0**. |
| Prettier `--check` pěti vlastních zdrojových/testovacích souborů | **exit 0**. |
| `git diff --check` | **exit 0**; vlastní nové soubory byly navíc ověřeny Prettierem. |

Původní selhání byla chybnými předpoklady testovací fixture, ne doloženou regresí enginu. Windows libuv přidává nedetached děti do Job Object s `JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE`; po ztrátě supervisoru proto nelze přenosně vyžadovat přežití workeru. Primární zdroj odpovídající instalované verzi: [libuv v1.52.1, src/win/process.c](https://github.com/libuv/libuv/blob/v1.52.1/src/win/process.c#L65-L91), ověřeno 20. 10. 2026. Finální test na Windows logoval `worker survived supervisor loss: true` a následně `worker alive after recovery: false`; hlavní invariant `unknown` a žádný replay platil. Pád samotného controlleru prokázal přežití téhož detached supervisoru i workeru.

## Procesy a zachovaná evidence

Final run používal pouze vlastní `mkdtemp` repozitáře pod `C:/Users/rezac/AppData/Local/Temp/strahov-autodev-recovery-*`, bez HTTP portů, GPU a buildu. Příkaz controlleru: `node tests/fixtures/autodev/controller.mjs <fixture-root> run|resume [run-id]`; worker: `node tests/fixtures/autodev/worker.mjs <fixture-root>`. Cwd byl vždy konkrétní fixture root, provozní výstupy v jeho `.git/autodev/runs/` a kořeni.

Finální dvojice supervisor/worker PID: `35656/6276`, `43040/39752`, `42632/41640`, `10104/44660`, `15048/45236`, `43244/31932`, `45704/45868`. Každý scénář doložil jejich ukončení, ukončení všech controllerů/CLI i odstranění svého ověřeného rootu. Závěrečná Win32_Process kontrola v 01:15–01:16 CEST našla **0** Node procesů pro autodev fixture/supervisor. Žádný živý pomocný proces se nepředává.

První failure root zůstal zachovaný: `C:/Users/rezac/AppData/Local/Temp/strahov-autodev-recovery-avrd5v`, nonce `41715b7d-f91a-40ed-8f3d-e609b69a7415`, původní supervisor `14800`, worker `43548`; oba již ukončené. Obsahuje původní state/request/started/stdout/stderr, ledger a závoru; žádný receipt. Konkrétní bezpečně ohraničený PowerShell cleanup příkaz odmítlo automatické schvalování jako **blocked by policy**, bez podrobnějšího důvodu. Blokace nebyla obcházena; původní failure artefakty se ponechávají. Ostatní fixture roots byly odstraněny standardním ověřeným testovým cleanupem.

## SHA-256 testovaného checkpointu

| Soubor | SHA-256 |
| --- | --- |
| scripts/test-autodev.mjs | 639160363EA976AB48085065EE15FF0B3199BCF112C634A0AEE91C2F84EF7CE4 |
| tests/autodev-recovery.test.ts | A863EE5F75480381B41C3C4BAFF8DEB95F7BC59AB89D6F65ADDE5FDD28770AE5 |
| tests/fixtures/autodev/controller.mjs | 4FF06EE0D77EEE109D0A2E10029DBF6519DC52CD42198A2ACE02B0EF9935245B |
| tests/fixtures/autodev/worker.mjs | F9EF7DEC026404A8AE8581CA8513837575FABA395E356151A599F5EF2C265DB0 |
| tests/fixtures/autodev/harness.ts | 2C71BB7841DDF1DA113E1D774E887DC70F5617FC2B84966F007BD56D6BFFEAFE |
| scripts/autodev.mjs | 89B178913F6CCD6B945C2B499C47376AA6F76726A4F049F995F1519ADE62F00A |
| scripts/autodev/engine.mjs | 6313CDC29E71E1897B9F4335ABCD66087969D55B20F1ED779F3BA8A36E926327 |
| scripts/autodev/process.mjs | B2D675C2F1AA0FE55BDBA68B9D582F7D6F0289B5F89C2878F613889A81DA8B98 |
| scripts/autodev/supervisor.mjs | CFA13C3C1F005E7D0671331C5C91DB1B4A4863C13911BF280E8A026D44BBD361 |
| scripts/autodev/store.mjs | 9B708E2DB2D1CC86AEA1125023916230801D0A335B5E71A47BD8A0FAF8C100BD |
| scripts/autodev/adapters.mjs | 4FD58848A22B1722067C78F3ED34B5C4E648691388CC9C11B7E1D01C04715A69 |
| scripts/autodev/codex.mjs | 2E520E2CC2A332033BE6A6F57A0E6242F6CABA00E9CBD9560DAB438BCB679D8F |
| scripts/autodev/github.mjs | 6E728C38B00F6CE8749A96C03D89499E42BDC6AFC805176D22C6FE049505E72A |
| scripts/autodev/linear.mjs | DB4E83B416C73BE2571D588744DEE8F35E3F79509D0E77E6217705FACFF1201D |
| tests/autodev-engine.test.ts | 4DDCFD7ECE518C8C2CE30BCE4B8580C99FE275C894A9A1BEF016AFFE41F026F9 |
| tests/autodev-store.test.ts | 8CF99FA80C04BF541CF87B84F5ECD0331840589E400AFDE5C3CFD0EAEB6715EE |
| tests/autodev-adapters.test.ts | FD79E61063B9CEC0CAC276FE8917AEB3DEA7CC8C62F66217B14A5A83B1FA0ADD |

## Omezení a převzetí

Linux nebyl tímto během ověřen. Plná herní sada/build/integrace nebyly spuštěny; task nemá heavy-validation. Místní fixture nemá skutečný Linear/GitHub backend a nepředstírá PR/merge přejímku. Tu nad konkrétním živým úkolem a následným finálním zdrojem provede koordinátor, stejně jako Linear aktualizaci, katalog, commit a integraci. Budoucí úpravy adapters vyžadují odpovídající novou validaci; uvedené hashe popisují právě tento běh.

Po předání a ověření ukončených procesů se rezervace uvolňuje. Vlastní necommitované soubory jsou tímto doloženě předané koordinátorovi, nikoli volný WIP. Přijetí tasku a začlenění do společné evidence je odpovědností integrátora.
