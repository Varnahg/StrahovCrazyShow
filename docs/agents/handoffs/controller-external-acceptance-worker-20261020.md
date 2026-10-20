# Předání: controller-external-acceptance-worker-20261020

- Vlastník: `perftransit-01a155b2-gate-worker`; příjemce: root koordinátor `perftransit-01a155b2-gate`.
- Pracovní kopie: `C:/Users/rezac/.codex/worktrees/ci-main-autonomous-pilot/StrahovCrazyShow`, větev `codex/performance-transit-runtime`, baseline `ba91b84c17918ee16a9472c57f38b427fa6e21da`.
- Výsledek: implementace podpůrného KEY-54, čtyři původní review příčiny a následná E3 hranice Linear Done opravené; cílená ověření změněných větví prošla. Root doložil i sériový průchod starého live-review fixture na baseline a kandidátu. Širší přijetí zůstává integrátorovi; nejde o herní výkonový výsledek KEY-53 ani o přijetí integrátorem.
- Cizí WIP: při zahájení pouze koordinační tasky/handoff, root BMAD spec a performance evidence. Nic z něj nebylo převzato ani měněno. Bez stagingu, commitu, PR/Linear zápisu nebo úprav runtime/checkpointů starých běhů.

## Soubory a mechanismus

1. `scripts/autodev/store.mjs`: striktní external varianta manifestu, nezávislý authority task/owner, přesný neměnný seznam důkazů a přenositelné cesty; původní CLI varianta zůstává kompatibilní.
2. `scripts/autodev/external-acceptance.mjs`: společný validátor authority z raw Git blobu připnutého base, aktuální přesné rezervace koordinátora, receipt identity a původních hashovaných bytes. Každá komponenta cesty a stabilní otevřený soubor se kontrolují před/po čtení. Odmítnutí symlinků, junctions, hardlinků, změněných/mizejících souborů a vadného UTF-8/JSON. První pass se připne před mutací, další změna jej nenahrazuje.
3. `scripts/autodev/adapters.mjs`: zmrazení externí autority v prepare, gate v accept/merge včetně merge=false a rekonciliace merged PR. Přesný adresářový prefix skutečného rendereru zahrnuje snapshoty i staging; široký původní scope zůstává povolený. Engine a worker protokol se nemění.
4. `scripts/autodev/github.mjs`: stejné pravidlo přímo před PATCH/status/merge, externí proof v acceptance a mergeIntent; kontrola přesných rodičů skutečného merge i obnovení bez druhého PUT. Přejímka je popsaná také v PR body.
5. `tests/autodev-store.test.ts`, `tests/autodev-external-acceptance.test.ts`, `tests/autodev-adapters.test.ts`, `tests/autodev-engine.test.ts`: manifest matrix, reálné dočasné Git repozitáře/claims, zachování původních bytes, hraniční cesty, tamper, přímé GitHub mutace s mock transportem, post-PATCH kontrola, merge recovery, staging scope a skutečný pending→resume se supervised implementací pouze jednou.
6. `docs/agents/bmad-controller.md`: konkrétní externí kontrakt, role a lifecycle; tento vlastní handoff.
7. `scripts/autodev/linear.mjs` (rozsah přidal root po release a zpětném předání): volitelný per-call `beforeMutation` v `setState`/`call`, spuštěný po status lookup a `start()`/přípravě transportu přímo před RPC `save_issue`. Žádný globální mutable guard, duplicitní status lookup ani změna běžného CLI volání.

## Průzkum, volba a refaktoring

Podklady z 20. 10. 2026: skutečná root BMAD specifikace `_bmad-output/implementation-artifacts/controller-external-acceptance-20261020/spec.md`, AGENTS, mapa architektury, koordinace, aktuální WIP, BMAD policy, store/source/adapters/github/engine, existující cílené testy a připnutý `_bmad/scripts/render_skill.py`. Přečtený současný řetězec potvrzuje, že engine již zachovává stopped/resume a dokončené kroky; `accept` předchází `merge=false`. Běžný verification check také nemůže přijmout výsledný commit ani chránit přímé GitHub volání.

Zvažované varianty: používat pouhý check (nedostatečná identita/pořadí), zavést další engine fáze a obecnou approval službu (zbytečná změna lifecycle a protokolu), nebo sdílený explicitní external validátor na skutečných mutačních hranicích. Zvolena poslední varianta. Sjednocené bezpečné čtení/pinning odstraňuje rozdílná pravidla adaptéru a klienta; sdílená kontrola merge rodičů obsluhuje nový i obnovený merge. Žádná cache důkazu mezi hranicemi, otevřené file handles se vždy uzavírají. Cena jsou opakované čtecí Git/file kontroly jen při přejímce; herní frame loop, vzhled a životní cyklus rendereru se nemění.

## Ověření

- První `node --test tests/autodev-store.test.ts tests/autodev-external-acceptance.test.ts`: exit 0, 15/15 PASS, 0 fail/skip, 175380.2789 ms. Doloženo nativním výstupem nástroje, session 94217.
- `node --test --test-name-pattern 'renderer reservation|external pending' tests/autodev-adapters.test.ts tests/autodev-engine.test.ts`: exit 0, 2/2 PASS, 0 fail/skip, 16268.5595 ms, session 52582. Pending→resume používal skutečný engine a supervisor; 1 implementační attempt, 1 source commit, opakované complete run/resume zachovalo stejné state bytes.
- Skutečný Windows prefix pro `C:/Users/rezac/.codex/worktrees/ci-main-autonomous-pilot/autodev-key-53-776f5f92725b`: helper vrací `_bmad/render/bmad-build/autodev-key-53-776f5f92725b-4be13dffb905/`. Root nezávisle ověřil shodný prefix skutečným `uv`/Python `Path.resolve()` a SHA256. Tento test renderer nic nezapisoval.
- `git diff --check` vlastních tracked souborů: exit 0. Prettier pouze osm vlastních změněných kódových/testových cest, bez plošných změn jiných souborů.
- Původní čtyřsouborový běh (`node --test tests/autodev-store.test.ts tests/autodev-external-acceptance.test.ts tests/autodev-adapters.test.ts tests/autodev-engine.test.ts`): exit 1, 132 testů, 130 PASS / 2 FAIL, 0 skip, 1696990.192 ms, session 43590. Byl zahájen před posledními zpřesněními a není finálním ověřením review oprav. Failures: live-review fixture setup timeout; a původní seznam veřejných exportů, který nezahrnoval dva nové renderer helpery. Seznam byl cíleně opraven a test pak prošel; původní neúspěch se nezamlčuje ani nemaže.
- Finální external/store opakování po zpřesnění čerstvého merge/UTF-8: `node --test tests/autodev-store.test.ts tests/autodev-external-acceptance.test.ts`, exit 0, 16/16 PASS, 0 fail/skip, 108897.1852 ms, session 18104.
- Finální prefix/API/externí handoff/engine test: `node --test --test-name-pattern 'renderer reservation|established public API|external commit handoff|external pending' tests/autodev-adapters.test.ts tests/autodev-engine.test.ts`, exit 0, 4/4 PASS, 0 fail/skip, 9693.9438 ms, session 52860.
- Širší původní regresní běh označil selhání původního live-review testu. Izolované opakování se stále souběžnou cizí fullvalidací potvrdilo konkrétní timeout v nástupu fixture (`waitFor` 15 s), nikoli nesprávný výsledek testované ochrany: exit 1, 0/1 PASS, 90381.5697 ms, session 72026. Původní kód/timing tohoto legacy testu nebyl změněn. Bez-zátěžové rozlišení zůstává otevřené root integrátorovi; souběžnou zátěž nepovažuji za prokázanou jedinou příčinu.
- Zamýšlený zápis pouze cleanup gate identifikovaného vlastního mock revieweru nebyl proveden: proces už skončil, identity guard odmítl zápis. Žádný ruční zásah do receipt/checkpointu.

### Opravy po nezávislém review

- `finalize` ověřuje připnutou externí přejímku při vstupu, po main CI/getIssue před Linear Done, před progress/finalizationReady, mezi uvolněním claims a před návratem complete. Obnova z `finalizationReady` nepřeskočí ověření.
- Společný validátor po async source/authority kontrolách znovu čte receipt a všechny evidence. Regrese mění skutečný evidence soubor přesně při spuštění nativního `git diff` uvnitř sourceIdentity; validátor odmítne pin a zachová změněný soubor i původní receipt.
- Nový fixture používá skutečný `createAdapter().runStage('prepare', ctx)`, skutečný Git worktree a claims. Pouze vzdálený fetch je přesměrovaný na lokální temp Git; GitHub/Linear jsou mock transporty. Uložená autorita se bez ruční náhrady použije k úspěšnému přímému GitHub accept.
- Base/HEAD/working task mají tři různé definice a bajty; vrácená definice i SHA256 se nezávisle porovnávají s původními base bytes.
- První nové review ověření skončilo 3/4 PASS, exit 1, 60583.3655 ms (session 41731): chyba pouze v novém helperu, který při `ctx.data.acceptance = await ...` zachytil starý objekt před checkpoint save. Helper byl opraven na stejné `await ctx.save({ acceptance })`, jaké používá skutečný adaptér; žádný produktový assertion nebyl oslaben.
- Finální úzký příkaz: `node --test --test-name-pattern 'actual prepare freezes external|external finalize rechecks|external authority uses original base|external evidence is rechecked|external commit handoff|external pending|finalize gates Linear Done' tests/autodev-adapters.test.ts tests/autodev-external-acceptance.test.ts tests/autodev-engine.test.ts`. Exit 0, **7/7 PASS**, 0 fail/skip, **70549.4303 ms**, session 20712. Zahrnuje změnu po merge checkpointu, během main CI, crash po worker release a zablokovanou/úspěšnou obnovu bez opakování Linear Done. Žádný další široký běh podagentem po review.

### E3 a sériové rozlišení původního setup timeoutu

Root po druhém review předal stejných 10 vlastních dirty cest zpět původnímu workeru a přidal jedinou čistou cestu `scripts/autodev/linear.mjs`. Původní owner znovu získal rozšířenou rezervaci přes doložené `--adopt-dirty`; žádný cizí WIP nebyl převzat. Frozen intent/spec zůstal beze změny podagenta.

E3 oprava předává existující `ensureExternalAcceptance(requirePinned)` z adaptéru až k vlastnímu `save_issue` dispatch. Test používá skutečné `LinearClient.setState/call/getIssue/comment`, mockuje pouze `start/rpc`: změna evidence v `list_issue_statuses` i v přípravě save transportu vede k 0 `save_issue` a zachování claims; platný důkaz zapíše Done jednou a finalize replay jej neopakuje. Samostatná krátká regrese zachovává CLI chování bez guardu.

Po explicitním signálu root: `node --test --test-name-pattern 'external finalize guards native Linear Done|native Linear setState keeps unguarded CLI' tests/autodev-adapters.test.ts` — **exit 0, 2/2 PASS, 0 fail/skip, 29726.0308 ms**, session 48823. Žádný jiný test nebo široká validace v tomto E3 kroku. `git diff --check` vlastních cest: exit 0.

Root před tímto během provedl sériové izolované porovnání původního live-review fixture: frozen baseline **1/1 PASS, exit 0, 21465.865 ms**, kandidát **1/1 PASS, exit 0, 21647.3381 ms**, oba bez skip. Původní 15s wait ani produktové assertions nebyly změněny a root ověřil shodné kandidátní source hashe před/po. Jeho původní logy a result JSON jsou v ignorované `.cache/perf-transit-runtime-20261020/legacy-{baseline,candidate}.*`. Původní souběžná selhání výše zůstávají zachována; toto pozorování nepřipisuje souběhu jedinou prokázanou příčinu.

### Stabilní manifest implementace a testů

SHA256 původních bajtů deseti implementačních/testových/doc souborů (handoff sám není zahrnut), ověřeno 2026-10-20T21:29:56.352Z. Agregovaný `digest(manifest)` nad tímto pořadím objektů `{path,sha256}`: `3dd9d95b66fc10b796055978adc52fa2a303eef1eaf4ee9fa3c962e0ced776a3`. Předchozí devítisouborový manifest před E3 měl digest `ec4c142d936091917c9204cde242e2dce989720361d0c4efa554f56537fd876b`.

| Soubor | SHA256 |
| --- | --- |
| scripts/autodev/store.mjs | 2e3b4395351f646d26f52b505c3436ae4b49759463a220193e891fa9ee4420d6 |
| scripts/autodev/external-acceptance.mjs | 6b3b43b75f6c325479aeff421b68a477cbef8447f4a3672e6ef5aa6498c92287 |
| scripts/autodev/adapters.mjs | aa5b10c4060456579f800f2ab72d314d65873b8c37dc6a9a95d5d4b36fe6fd1c |
| scripts/autodev/github.mjs | 20be7bf2e833cd7671ea4de72a991729e63efad724784fb79c286a7e66b28402 |
| scripts/autodev/linear.mjs | 117108ece7d0bd513de09c3a126b86d788d8cad3f9f1dd0a48efb39b66729aa4 |
| tests/autodev-store.test.ts | d8cfd97ba23da9d8a18640c980b6873a4a3b19caa458799f57f4050c534bc6ae |
| tests/autodev-external-acceptance.test.ts | a5255f3292551cb4397ee2ffdef96f9404c7a95f3253044dcfb3469517ede1b4 |
| tests/autodev-adapters.test.ts | 80b74517671c78a21013fcf888ae0697a3f79b9bb8902eefdf42ae8bd7c59a2f |
| tests/autodev-engine.test.ts | 9c80a45aeabd9d7c0ec7ecd93754325a68b8e378ac3f11ba2e4730e8f8dfb732 |
| docs/agents/bmad-controller.md | 593aab673e88eae78f58581129dbd48ee45095a19bd21c762772ee8e3a9ada4b |

### Zachovaný původní assertion selhaného izolovaného souběžného testu

Úplnou původní diagnostiku včetně runtime requestu zachoval root byte-copy v ignorovaném `.cache/perf-transit-runtime-20261020/gate-worker-raw-handoff-20261020.txt`, SHA256 `4cbcaed47edecb47a0325daefde1914b55177397c65eb732b395f049895795bd`. Request `plan-readiness:v3`, attempt `ec1122f6eeba43634eb5e33a`, requestDigest `31d4118090d4a1a7e2e83592776c0bb3e6911ae6312d9caf3267fb3898fef609`; v okamžiku diagnostiky jeho receipt chyběl (`ENOENT`). Provozní IPC token zůstává pouze v ignorovaném originálu.

```text
ℹ tests 1
ℹ suites 0
ℹ pass 0
ℹ fail 1
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 90381.5697

✖ failing tests:

test at tests\autodev-adapters.test.ts:1287:1
✖ blind authority repair never dispatches while an original native reviewer is live (23828.8266ms)
  Error: Timed out: live original authority review
      at waitFor (file:///C:/Users/rezac/.codex/worktrees/ci-main-autonomous-pilot/StrahovCrazyShow/tests/autodev-adapters.test.ts:390:9)
      at async reviewAuthorityFixture (file:///C:/Users/rezac/.codex/worktrees/ci-main-autonomous-pilot/StrahovCrazyShow/tests/autodev-adapters.test.ts:913:5)
      at async TestContext.<anonymous> (file:///C:/Users/rezac/.codex/worktrees/ci-main-autonomous-pilot/StrahovCrazyShow/tests/autodev-adapters.test.ts:1288:13)
      at async Test.run (node:internal/test_runner/test:1389:7)
      at async startSubtestAfterBootstrap (node:internal/test_runner/harness:387:3)
```

## Předání a omezení

Build, plná herní sada, integrace, GitHub CI/PR/merge a GPU měření nebyly podagentem spuštěny; jsou věcí root integrátora a jeho rezervací. Externí receipt není podpis ani autentizace proti škodlivému lokálnímu vlastníku stejného účtu. Koordinátor posuzuje smysl a srovnatelnost A/B; validátor dokládá původ/scope a integritu důkazu. Síťový závod při posunu base nemůže REST PUT sám atomicky zamknout; projektový ruleset a ověření skutečných merge rodičů brání jeho nepravdivému přijetí.

Žádný dlouhožijící vlastní helper/server/port. Všechny uvedené testové procesy skončily; konečný CIM dotaz 2026-10-20T21:15Z nenašel vlastní supervisor ani test runner z uvedených příkazů. Fixture cleanup proběhl v jejich původních test hooks, bez cizích procesů nebo zásahu do checkpointů. Předáno root; po tomto záznamu následuje release vlastní rezervace. Task stav, review triage, spec, bez-zátěžové rozlišení starého timeoutu a celkové přijetí/integraci spravuje root.

Root integrátor převzal vlastní10dirtycest původního workeru podle předání a provedl druhé review. Všechny původní nálezy odstraněné; nová konkrétní E3 mezera je uvnitř LinearClient.setState mezi list_issue_statuses a save_issue. Root nyní předává stejný doložený WIP zpět původnímu workeru, žádný vlastní proces neběží. Po release se v administrativním slotu přidá pouze scripts/autodev/linear.mjs a příjemce znovu claimne rozšířený task. Frozen intent, ostatní funkční chování a původní logs zůstávají.

Zpětné předání po E3: oprava i úzká regrese dokončené výše, všechny vlastní testy ukončené; kontrola CIM 2026-10-20T21:29Z nenašla vlastní supervisor ani E3 test runner. Bez stagingu, commitu a externích zápisů. Po tomto předání se uvolňuje pouze vlastní rozšířená rezervace; další re-review a celkové ověření provádí root.
