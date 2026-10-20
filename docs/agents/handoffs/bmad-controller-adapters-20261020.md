# Předání: bmad-controller-adapters-20261020

- Vlastník: `bmadctl-01a155b2-adapters`; příjemce: koordinátor `bmadctl-01a155b2` a následné procesní QA.
- Worktree: `C:/Users/rezac/.codex/worktrees/ci-main-autonomous-pilot/StrahovCrazyShow`, větev `codex/bmad-single-task-controller`, základ `ceddc0802cd98dccfbee9d44fc00d6331ac9d749`.
- Výsledek: implementované konkrétní stages pro jeden explicitní assignment, GitHub/Linear/Codex adaptéry a cílené regresní testy. Žádný commit ani vzdálená mutace nebyly při této delegaci provedeny. Celý KEY-46 ani živý KEY-47 pilot tím nejsou označeny za přijaté.
- Cizí WIP: engine, koordinace, task katalog, dokumentace/spec a instalované dependencies byly ponechány jejich vlastníkům. Před zápisem ověřeny status/worktrees/registr a úspěšně získán vlastní claim. Upraveny jen níže uvedené taskové cesty a tento handoff.

## Implementace a refaktoring

`adapters.mjs` zajišťuje explicitní stages, zmrazený base/manifest/task/intent, disjunktní controller/worker claims, heartbeat a konzervativní recovery. Obsahový audit zahrnuje tracked, untracked i existující ignored soubory, deletion, Git index mode, rename oběma směry a symlink/junction guard. Jednotlivé worker stages mají oddělený audit změn vůči počátečnímu snapshotu. Digest worker zdrojů a testů je stabilní přes staging/commit; controller evidence je explicitně oddělená. Commit používá explicitní seznam souborů a očekávaný parent/tree/marker. Claim drahého ověření zůstane zachovaný při nejasném živém workeru. Finalizace má checkpoint před postupným release a je obnovitelná po prvním release.

`github.mjs` používá přímé `gh api` a explicitní Git operace, všechny stavy PR při reconciliation, exact head/base a check app/workflow/event identitu. Reálné Actions odpovědi mohou mít prázdné `pull_requests`; proto CI identity dokládá checkout log testovacího merge SHA a krok `Record verification identity`, obě required kontroly musejí testovat stejný merge. Acceptance má skutečný PR evidence URL, merge používá očekávané head SHA bez bypassu. Finalize ověřuje main CI přesného merge SHA a jeho přítomnost v main.

`linear.mjs` používá autentizované `codex app-server --stdio` přes experimentální přímé MCP RPC bez modelového turnu či čtení tokenů. Validuje inventory, podporuje skutečný `{id: "KEY-46", uuid: "..."}` i `{identifier, id}` tvar, stránkování a `isError`. Jeden aktualizovatelný komentář se dohledává markerem a ID; nejasný create zůstává unknown. RPC má timeouty, zpracování exit/error/close a ukončení i při chybějícím executable.

`codex.mjs` používá durable `ctx.supervise`, strukturované schemas, projektový renderer přes `uv run --no-cache`, explicitní zákaz apps/MCP/multi_agent a síťového přístupu implementačního workeru. Plan a tři nezávislé review jsou read-only; plán má primární podklady a read-only web search. Registry se čte přímo, protože status CLI bere zapisující mutex. Potvrzené výsledky se checkpointují před vytvořením evidence/progress mutací, takže replay po selhání progress nevyvolá další modelový worker ani falešný scope konflikt.

Sdílené helpery sjednocují Git/command execution, obsahové audity, claims/heartbeat, evidence a externí protocol validation. Nejde o OS ochranu jednotlivých writePaths; audit dokládá výsledný stav, nikoli každý historický zápis vrácený workerem zpět.

## Skutečné ověření 20. 10. 2026

- `node --check` všech čtyř `.mjs`: exit 0.
- `node --test tests/autodev-adapters.test.ts`: finálně **17 PASS / 0 FAIL**, exit 0, 40.538 s. Předchozí dvě série 16/16 PASS; další test byl přidán po nalezeném crash/replay problému vlastních evidence artefaktů.
- Testy používají skutečné dočasné Git repozitáře a skutečný claim CLI. Pokrývají ignored overwrite, rename, junction escape, source digest před/po add/commit a index mode, chybějící Codex executable, ztracenou Linear create odpověď, CI provenance, PR create replay, skutečný commit/replay, cizí index, změnu zdroje během checku, zachování validation claim při unknown, finalization release crash a stage replay po progress failure. GitHub/Linear mutace jsou v této sadě fake transporty; není to tvrzení o živém end-to-end create/merge.
- `pnpm exec tsc --noEmit`: finální exit 0. První běh odhalil TS7016 pro přímé importy nových `.mjs`; test převzal existující projektový vzor URL dynamického importu, následné běhy prošly.
- Přímý read-only smoke `LinearClient.getIssue("KEY-46")`, `list_issue_statuses` a `close()`: exit 0; canonical issue UUID `bbf6ca81-2f96-4c8f-afe5-f7dd52de793b`, tým `a38a94f2-6c9e-4e7f-94fe-42a6af84cf0b`, stav `In Progress`; status list je pole.
- Přímý read-only `GitHubClient.checks` pro PR #9: exit 0; head `1971da3aab42df48199b3e3dca9e54c56a4d81fc`, base `2c13b61bf9779c9ce1d931edcc06bc8bed47bb63`, app `15368`. [verify run 39332391809](https://github.com/Varnahg/StrahovCrazyShow/actions/runs/39332391809), check `118333502533`; [source-secret-hygiene run 39332391434](https://github.com/Varnahg/StrahovCrazyShow/actions/runs/39332391434), check `118333501102`. Oba prokazují test merge `f2a88d6d2a1095efe543a0e56b8228af01763436`. Historický PR je použit pouze jako read-only parser smoke, ne jako acceptance nového kandidáta.
- Prettier aplikován pouze na vlastní zdroje/schemas/testy. Plná sada/build/integrace a živý KEY-47 příslušejí koordinátorovi pod jeho resources; zde nebyly spuštěny.

## Snapshot včetně testů

Bundle SHA256 `3ef9ec5ac35d1b8962292e87efcb0b3e475a549efbff118a036faf79140f4afe`: SHA256 UTF-8 `JSON.stringify` níže uvedených objektů `{file,sha256}` v lexikografickém pořadí cest. Handoff samotný není součástí hashovaného zdrojového bundle.

| Soubor                                   | SHA256                                                             |
| ---------------------------------------- | ------------------------------------------------------------------ |
| `scripts/autodev/adapters.mjs`           | `4fd58848a22b1722067c78f3ed34b5c4e648691388cc9c11b7e1d01c04715a69` |
| `scripts/autodev/codex.mjs`              | `2e520e2cc2a332033be6a6f57a0e6242f6caba00e9cbd9560dab438bcb679d8f` |
| `scripts/autodev/github.mjs`             | `6e728c38b00f6ce8749a96c03d89499e42bdc6afc805176d22c6fe049505e72a` |
| `scripts/autodev/linear.mjs`             | `db4e83b416c73be2571d588744dee8f35e3f79509d0e77e6217705facff1201d` |
| `scripts/autodev/prompts/common.md`      | `617e421b4f9b0814efcf650eff59a0ad1e0f2997993438f26baef956b82c8101` |
| `scripts/autodev/schemas/implement.json` | `f47eeb928d7ea0ff5ea63f21ff62515b558c6fe100db36762b5cd5e49bcf48bd` |
| `scripts/autodev/schemas/plan.json`      | `d48b382fd2b98de34430cad929d6bb3a6016f59cba49690fac73a2e693b5e66d` |
| `scripts/autodev/schemas/review.json`    | `24990fe8cf2ec11f0624e970280d8748ea3c9214b5f6048a99d24e411383e2c1` |
| `tests/autodev-adapters.test.ts`         | `fd79e61063b9cec0cac276fe8917aeb3dea7cc8c62f66217b14a5a83b1fa0add` |

## Procesy, omezení a předání

Všechny vlastní cílené testy, TypeScript, GitHub read-only příkazy a app-server smoke skončily; app-server byl uzavřen. Nebyl spuštěn server, GPU, modelový implementační worker ani živá vzdálená mutace. Testové repozitáře byly uklizeny v test hooks. Žádný cizí proces/lock nebyl ukončen ani převzat.

Následuje skutečné kill/restart QA, nezávislé review a autorizovaný živý pilot. V1 při chybějícím supervisor receipt nebo neprokázaném vzdáleném účinku bezpečně zastaví unknown; nejde o obecný scheduler ani native process-tree containment. CI log parser je záměrně vázaný na existující pinned workflow/checkout a při jiné nebo chybějící provenance odmítá acceptance. Experimentální app-server API při nekompatibilitě selže explicitně.

Rezervace bude po tomto předání uvolněna příkazem `release --task bmad-controller-adapters-20261020 --owner bmadctl-01a155b2-adapters`. Task JSON, integraci a přijetí do společné evidence mění koordinátor.

## Addendum: skutečná BMAD vazba po procesním QA

20. 10. 2026, původní vlastník `bmadctl-01a155b2-adapters` převzal pouze své výše doložené soubory pomocí úspěšného `claim --adopt-dirty` po uvolnění QA tasku. Koordinátor výslovně schválil poslední dodatek kontraktu. Toto navazuje na historický checkpoint 17 testů a recovery QA 38 testů; uvedené starší hashe zůstávají evidencí svých běhů.

Změněny pouze `scripts/autodev/adapters.mjs`, `scripts/autodev/codex.mjs`, `scripts/autodev/schemas/plan.json`, `tests/autodev-adapters.test.ts` a tento handoff. Původní `scripts/autodev/schemas/review.json` byl odstraněn: jeho jednotný priority formát odporoval nativním review lenses. GitHub, Linear, engine/store/process/supervisor a procesní QA zdroje zůstaly beze změny.

- Snapshot loader ověřuje manifest a devět skutečně používaných instruction souborů. Planner dostává konkrétní `step-02-plan.md` a `spec-template.md`; schéma nyní vyžaduje explicitní `intentGaps` a anotovanou `codeMap`. Chybějící readiness výsledek ani neprázdný gap nejsou přijaté pro implementaci.
- Controller vytváří skutečný `spec.md` z renderované šablony, zmrazeného intentu/tasků/AC a ověřeného plánu. Zaznamená `baseline_commit`, snapshot, frozen/body/file SHA256 a původní text před atomickým zápisem. Při replay nesmí přepsat neznámý, změněný či odstraněný již vytvořený spec. Status se posouvá monotónně `ready-for-dev → in-progress → in-review → done`; `done` vzniká po úspěšných lokálních kontrolách před prvním commitem. Frozen/body hash se při status změně zachovává. Linear Done dál vzniká až po merge a main CI.
- Implementační worker čte `spec_file` a skutečný projektový implementační handoff ze snapshot step 3. Controller binding zachovává disjunktní claim a převádí výstup předání do strukturovaného výsledku; worker neupravuje specifikaci ani nespouští další workflow.
- Review launch texty se získávají ze skutečného step 4. Blind nemá intent/plan/spec/workflow kontext; verification nemá claims. Edge má `claims_file` pouze s původním pokynem číst jej až po vlastní trace. Každá lens běží jako samostatná čerstvá read-only relace a dostává cestu k diffu, nikoli jeho text vložený do promptu.
- Review výstupy jsou raw text uložený vedle receiptů. Edge se parsuje jako původní JSON array bez priority, verification jako předepsané evidence bloky nebo přesně `No verification gaps found.`, blind má čistý výsledek pouze `[]`. Nečitelný/prázdný/pozměněný diff a chybějící/nevalidní/skipped výsledky jsou explicitní chyby; nejsou clean review. Nálezy zastaví V1; nevznikla nová metodika severity ani repair smyčka.
- Evidence nese prompt/snapshot/spec/diff identity a raw výsledky. Společné helpery sjednocují snapshot validaci, skládání specifikace a promptů. Unified diff nových souborů nyní generuje přímo `git diff --no-index --binary`, bez zápisu indexu; zachovává nativní quoting, binary a no-final-newline chování.

Ověření addenda:

| Kontrola                                                                           | Skutečný výsledek                                                                                                                                                                            |
| ---------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| První rozšířená adapter sada                                                       | **23/23 PASS**, exit 0, 62.653 s                                                                                                                                                             |
| Finální `node --test tests/autodev-adapters.test.ts`                               | **24/24 PASS**, exit 0, **61.559 s**                                                                                                                                                         |
| `pnpm exec tsc --noEmit`                                                           | **exit 0**, po obou rozšířených checkpointech                                                                                                                                                |
| `node --check` adapters/codex                                                      | **exit 0**                                                                                                                                                                                   |
| Read-only loader/formatter smoke proti skutečnému snapshotu `f484d4f55325390b3da8` | **exit 0**, všech 9 instruction hashů ověřeno, skutečný template naplněn v paměti; frozen intent a AC zachované. Žádný renderer, modelový pilot ani zápis artefaktu nebyl při smoke spuštěn. |

Nové testy ověřují missing/tampered snapshot, skutečné naplnění šablony, frozen/body identitu přes statusy a replay, odmítnutí odstraněného či změněného specu, draft při intent gaps a nulový další model attempt, replay specifikace po progress failure, rozdělení promptů/blindness/late claims, per-lens native parsing, chybějící output/diff a skutečnou adapter cestu `verify → spec done`. Původní scope, claim, commit/PR/Linear replay a lifecycle regrese zůstaly zelené. Testové snapshot fixtures ověřují kontrakty parseru; read-only smoke ověřil kompatibilitu i se skutečným projektovým renderem. Živý modelový BMAD/PR pilot tím není nahrazen.

Nový zdrojový bundle včetně testů, stejné řazení a algoritmus jako výše: **`22bae4e3e2bd45635920763d7fcfecb80c1aa292631b97544a01ae4afefd1dc9`**. Odstraněné review schema se do nového bundle nezahrnuje.

| Soubor                                   | Aktuální SHA256                                                    |
| ---------------------------------------- | ------------------------------------------------------------------ |
| `scripts/autodev/adapters.mjs`           | `c7dc5c19b91c4c0eebea8387e77bf89fefb34b258152d396aa2d4984de305e02` |
| `scripts/autodev/codex.mjs`              | `a0bc2a13764c6a0b36e97b82ebd4838c6d9270fd45dd12888318015703a34205` |
| `scripts/autodev/github.mjs`             | `6e728c38b00f6ce8749a96c03d89499e42bdc6afc805176d22c6fe049505e72a` |
| `scripts/autodev/linear.mjs`             | `db4e83b416c73be2571d588744dee8f35e3f79509d0e77e6217705facff1201d` |
| `scripts/autodev/prompts/common.md`      | `617e421b4f9b0814efcf650eff59a0ad1e0f2997993438f26baef956b82c8101` |
| `scripts/autodev/schemas/implement.json` | `f47eeb928d7ea0ff5ea63f21ff62515b558c6fe100db36762b5cd5e49bcf48bd` |
| `scripts/autodev/schemas/plan.json`      | `f049ee14a3fbd3492ea51c1f456732734fb543ce76c418584606f40dd66ae966` |
| `tests/autodev-adapters.test.ts`         | `fbecb42a88bbddc77d55d9e506c6903251f7b55c99b5031bb888bac4808a6a44` |

Všechny vlastní testy/TypeScript/smoke procesy skončily. Žádná vzdálená mutace, commit, nový workflow ani další agent nebyly spuštěny. Po dokončení addenda následuje release stejného adapter claimu; koordinátor převezme nezávislé review, společný checkpoint a živý pilot.

## Addendum: opravy přijatého review-1

20. 10. 2026, původní vlastník znovu získal `bmad-controller-adapters-20261020` pod `bmadctl-01a155b2-adapters` s doloženým `--adopt-dirty`, až po potvrzeném release enginu. Podklad: [triage review-1](../../verification-evidence/bmad-controller-20261020/review-1.md). Upraveny pouze `scripts/autodev/adapters.mjs`, `scripts/autodev/github.mjs`, `tests/autodev-adapters.test.ts` a tento handoff. Engine/process/store, QA, Codex/Linear adaptéry, task katalog a assety se neměnily.

### Věcné opravy a důvody volby

- **B1/E1/P1 – spec status crash window:** před změnou souboru se durable uloží přesný status intent (`fromSha256`, `toSha256`, status). Reconcile běží před `assertSource`; přijme pouze doložený cílový hash, se stejným frozen/body hashem. Původní hash znamená dosud nedokončený zápis; třetí hash nebo neznámá editace se odmítá. Byla zvolena explicitní identita přechodu místo obecného přijímání libovolné status-only editace. `done` navíc vyžaduje předem uložené úspěšné checks pro právě daný source digest. Přechod do done se tedy neprovádí před čekáním na kontroly. Nový fault point `after-spec-write:<status>` leží přesně mezi zápisem souboru a finálním checkpointem.
- **P2 – validation lease při nejasném procesu:** stav `awaitingReceipt` se nastaví před `ctx.supervise` a zruší až po skutečně vráceném, enginem ověřeném terminálním receiptu. Jakákoli výjimka během tohoto čekání drží validation claim, včetně raw `EACCES`/`EIO`. Byla odstraněna klasifikace podle whitelistu chyb; známý neúspěšný terminální receipt naopak dovoluje zdroj uvolnit.
- **E3 – UTF-8 chunks:** oba command pipes mají vlastní stream decoder přes `setEncoding("utf8")`. Dekódování již neprobíhá samostatným `Buffer.toString()` pro každý chunk. Řešení zachovává průběžný sběr a limit výstupu, nepotřebuje bufferovat celý binární stream před dekódováním.
- **Návaznost engine optional JSON opravy:** pouze `undefined` znamená chybějící registry soubor. Přítomné `null`/`false`/`0`/prázdný řetězec a neplatná schema/claim data jsou `CORRUPT_STATE`, nikoli prázdný registr. Obsah se zachovává. CLI nadále provádí svou původní úplnou validaci při mutacích; adapter nepřebírá cizí lock ani neopravuje registry resetem.
- **V1/V2/V3 – behaviorální regresní pokrytí:** acceptance je testovaná pro missing/pending a completed failure/timed_out/cancelled/skipped/neutral i pozitivní success; neúspěch nesmí vydat status. Fresh merge prokazuje exact head precondition a odmítnutí stale acceptance/base, draft a closed PR. `merge=true` finalize skutečně provede lokální Git fetch/ancestry a zadržuje Linear Done i release až do úspěchu main CI přesného merge SHA.

Nejde o nový lifecycle nebo workflow. Opakovanou statusovou validaci sjednocuje jeden reconciler; engine a vzdálené service protokoly zůstávají zachované. Nejasný proces drží původní vlastnictví, místo odhadování ukončení podle chyby.

### Skutečné ověření opraveného checkpointu

- `node --test tests/autodev-adapters.test.ts`: **32 PASS / 0 FAIL**, exit **0**, **88.943 s**. Celá původní sada zůstala zelená; nové scénáře nejsou odvozené pouze z textu implementace.
- Dvě regrese spustily skutečný Node child, uložily spec status intent do diskového checkpointu, provedly **SIGKILL po zápisu `in-review`/`done` souboru před checkpointem**, načetly původní checkpoint z disku a obnovily skutečný review/verify adapter stage. Upravený frozen obsah byl nejprve odmítnut; po vrácení přesného cílového souboru se obnovil pouze správný status. Zároveň se odmítá status změněný bez intentu a done bez doložených checks.
- Skutečný child zapisoval UTF-8 text `Příliš žluťoučký kůň 🐎` po jednotlivých bajtech do stdout i stderr; obě zachycené hodnoty zůstaly beze změny.
- Raw receipt IO regrese drží skutečný validation claim ve fixture po `EACCES` i `EIO`; následný vrácený failed receipt dovolí release. Falsy/malformed registry testy ověřují i zachování přesných původních bajtů.
- CI/merge backend odpovědi jsou řízené fake transporty nad skutečnými produkčními guardy; finalize navíc používá skutečný dočasný Git repozitář a claim CLI. Žádný živý GitHub/Linear status, komentář ani merge nebyl v tomto followupu proveden.
- `pnpm exec tsc --noEmit`: **exit 0**. `node --check` adapters/github: **exit 0**. Prettier check tří změněných zdrojů/testů: **exit 0**.
- Všechny vlastní child procesy a testy skončily; fixture roots uklidily hooks. Plnou herní sadu/build/integraci spouští až koordinátor nad stabilním checkpointem. Materiálové LFS problémy z první plné sady nejsou součástí těchto změn.

### Nové hashe

Aktuální bundle včetně všech adapter zdrojů/schemas/promptu a testu, stejný algoritmus jako výše: **`433d291d1a4d40aade3f67d333020d51a4c64060f4ebebd9f7fc3679319cd87d`**.

| Soubor                                   | Aktuální SHA256                                                    |
| ---------------------------------------- | ------------------------------------------------------------------ |
| `scripts/autodev/adapters.mjs`           | `345fa035538e6232180be0b97e999b5d45ae94d5bc990190ea7e3a0b42d32463` |
| `scripts/autodev/codex.mjs`              | `a0bc2a13764c6a0b36e97b82ebd4838c6d9270fd45dd12888318015703a34205` |
| `scripts/autodev/github.mjs`             | `72641ba4f3566ac0c5e721eb952da50486ad68dd9f1bca5b66262dd0f0f98269` |
| `scripts/autodev/linear.mjs`             | `db4e83b416c73be2571d588744dee8f35e3f79509d0e77e6217705facff1201d` |
| `scripts/autodev/prompts/common.md`      | `617e421b4f9b0814efcf650eff59a0ad1e0f2997993438f26baef956b82c8101` |
| `scripts/autodev/schemas/implement.json` | `f47eeb928d7ea0ff5ea63f21ff62515b558c6fe100db36762b5cd5e49bcf48bd` |
| `scripts/autodev/schemas/plan.json`      | `f049ee14a3fbd3492ea51c1f456732734fb543ce76c418584606f40dd66ae966` |
| `tests/autodev-adapters.test.ts`         | `e981604b6b3d8b1cd6e39e18ef8a0862d397319badf3736bc523eb9ba68aa363` |

Po dokončení tohoto předání se adapter claim uvolňuje. Žádný commit, vzdálená mutace, nový workflow ani další agent nevznikly. Opravy jsou připravené pro recheck review-1 a společné ověření koordinátorem.

## Addendum: cílený recheck validation lease a merge SHA

20. 10. 2026, po výslovném potvrzení doběhu stabilní plné validace převzal původní vlastník pouze svůj adapter scope přes úspěšný `claim --adopt-dirty`. Upraveny jen `scripts/autodev/adapters.mjs`, `tests/autodev-adapters.test.ts` a tento handoff. LFS testy, timeouty, package konfigurace, engine/QA a ostatní zdroje zůstaly beze změny.

- **Více checků při resume:** samotné `!awaitingReceipt` nestačilo, pokud se při resume převzal hotový A a následný source audit selhal dříve, než adapter došel k dříve spuštěnému B. Release nyní navíc vyžaduje `complete` u všech již dispatchnutých `check:` attempts daného runu. Používá přímo autoritativní attempt stav enginu; nepřidává druhý registry ani odhadování podle chyb/PID.
- **Nová regrese:** první průchod přijme A, zaznamená B jako `started` a při čtení jeho receiptu dostane raw `EIO`; validation claim zůstává. Resume převezme A a změna skutečného fixture zdroje způsobí `SOURCE_CHANGED` ještě před B. Test ověří zachování stejného ownera i původního `claimedAt`. Teprve když je B terminal a vrátí se známý failed receipt, pozitivní větev dovolí release. Modelované receipts/attempty jsou řízený adapter vstup; samotný scope audit a claim CLI běží skutečně.
- **Přesnost finalize fixture:** dočasný Git nyní vytvoří base, skutečný PR head commit a samostatný `--no-ff` merge; test ověřuje tři různé SHA i oba merge parents a vrací pracovní kopii na PR větev. Main CI se musí žádat právě pro merge SHA. Záměna za base nebo head už nemůže projít. Zůstaly kontroly, že failed/pending main CI nevyvolá Linear Done ani release, zatímco success je dovolí. Git origin ve fixture je pouze lokální repozitář, žádná síťová mutace.

Ověření: `node --test tests/autodev-adapters.test.ts` **33/33 PASS**, exit **0**, **103.886 s**; `pnpm exec tsc --noEmit` **exit 0**; Prettier check obou změněných souborů **exit 0**. Všechny vlastní procesy a fixtures skončily/uklidily se. Plnou sadu/build/integraci provede koordinátor; tento followup ji neopakoval.

Aktuální bundle včetně testů (stejných osm cest a stejný algoritmus jako v předchozím addendu): **`d6e859227267d06eae622f3c99a9c6c6bb331998c7feb35eed6ed3c7ea426fa6`**. Změněné dílčí SHA256:

| Soubor                           | SHA256                                                             |
| -------------------------------- | ------------------------------------------------------------------ |
| `scripts/autodev/adapters.mjs`   | `b3e442bf8813ee129366308219925ce38cc10d31b529cb7787cf6f753abfc951` |
| `tests/autodev-adapters.test.ts` | `67830b5d0c1f40339d08da3b6f335e744126a2f0e5c7d17b33eadd286e4a3313` |

Ostatních šest hashů z předchozí tabulky zůstává shodných. Po tomto předání se stejný adapter claim uvolňuje; žádný commit, remote akce, nový workflow ani další agent nebyly spuštěny.

## Addendum: runtime delivery protocol 2 a bezpečné pokračování původního runu

Souhrnná integrační evidence: [runtime-input-repair.md](../../verification-evidence/bmad-controller-20261020/runtime-input-repair.md). Aktuální předání: **45/45 adapter testů PASS, tsc exit 0**, devět hashů níže; původní pilotní state/requests/receipts a implementace byly z této delegace pouze čtené. Závěrečná Win32_Process kontrola našla **0** Node procesů vlastních adapter fixtures.

20. 10. 2026. Nový základ této opravy je `c1c56327240d5634fa3f4670fc7264e6a4287238`, stejná vývojová worktree nyní na `codex/bmad-controller-pilot-evidence`. Vlastní cesty byly při zahájení committed/clean; úspěšný claim `bmad-controller-adapters-20261020`, owner `bmadctl-01a155b2-adapters`, bez adopt-dirty. Parent docs WIP se nepřebíral. Změny: `adapters.mjs`, `codex.mjs`, `schemas/plan.json`, nový `schemas/plan-readiness.json`, adapter test a tento handoff. Engine, supervisor, GitHub/Linear moduly, upstream renderer a pilotní checkout se neměnily.

### Průzkum a volba před implementací

Read-only prohlídka skutečného runu `key-47-c1ef58bf36c0` potvrdila:

- Planner `1565c7acd1bb16be238919a9` dostal pouze cesty k `step-02-plan.md` a `spec-template.md`. `Get-Content` i `Get-Item` skončily odepřením přístupu. Finální plán omezení pravdivě uváděl v research/decision/risks, ale měl `intentGaps: []`; starý controller neměl samostatný runtime readiness kontrakt a dispatchoval implementaci.
- Implementační attempt `e05980c9326af6af6e251ed3` skončil exit 0. Nebyl opakován ani měněn.
- Edge `b0e57585351ad920ec3d6979` a verification `ff0e45bfcd565e85fe6c43c0` měly terminal receipts exit 0, ale raw výstupy výslovně oznámily nečitelné lens instructions a **No review was performed**. Tyto texty nejsou clean review. Blind `b8fde5bb6d0743f16dc224e9` naopak přečetl common-dir diff a vrátil `[]`; parent doložil oba skutečné úspěšné Get-Content v jeho logu.
- Parentův read-only ACL průzkum doložil protected snapshot adresář s OWNER RIGHTS/SYSTEM/Administrators bez zděděného CodexSandboxUsers, zatímco dostupný spec dědil příslušná sandboxová práva. Pinned renderer používá `tempfile.mkdtemp` a přejmenování staging adresáře. Přesné vytváření ACL Pythonem nebylo trasované; doloženým selháním je nedoručení povinných vstupů modelu, nikoli chybějící soubor. Viz parent [baseline](../../verification-evidence/bmad-controller-20261020/pilot-upgrade-baseline.json) a [ACL evidence](../../verification-evidence/bmad-controller-20261020/pilot-snapshot-acl.json).

Porovnány změny ACL/sandbox oprávnění, kopie snapshotu do dalších přístupných artefaktů, opakování původního workflow a inline doručení přes stdin. Zvoleno **inline doručení přesně hashově ověřených snapshot instrukcí**, bez změny oprávnění a bez druhé implementace. Kopírování by přidalo další vlastnictví/cache a po commitu měnilo kandidátní tree; opakování původních pokusů by porušilo jejich immutable identity. Celý prompt v argv navíc může překročit Windows CreateProcess limit. Parent ověřil podporu `codex exec -` v instalovaném CLI; používá se stdin s krátkými, explicitními argv.

### Implementované chování

1. **Nové plánování:** skutečné step 2 a template jsou vloženy do promptu v plném ověřeném UTF-8 znění. Provenance uvádí `deliveryProtocol: 2`, jednotlivé SHA a hash celého promptu. Schema vyžaduje `ready` a `runtimeBlockers` odděleně od `intentGaps`. Missing/invalid/false readiness nebo neprázdné blockers zastaví postup před novou implementací. Prose v risks/decision se neparsuje heuristikou.
2. **Review metodika:** inline jsou pouze hashově ověřené původní lens/reference instrukce. Původní step 4 vyžaduje file-only diff, proto zůstává `diff_file` cesta a ověřený SHA; diff text v review promptu není. Blind/verification nemají claims text. Edge zachovává skutečné pozdní čtení původního dostupného `spec_file`, nikoli předčasně vložený spec s pokynem jej ignorovat.
3. **Transport:** malý executor uvnitř stávajícího `codex.mjs` přečte immutable input JSON, zkontroluje jeho SHA i prompt provenance před spawnem a předá text do `codex exec ... -` přes stdin. Ponechává streaming stdout/stderr, správný start/failure exit/signál a nepovažuje odmítnutý stdin za úspěšné doručení. Žádný shell ani dlouhý `node -e` bootstrap. Supervisor API a sandbox flags zůstaly shodné.
4. **Bounded legacy upgrade:** staré requesty se nejdřív přes `ctx.supervise` znovu navážou s **přesnými původními command/args/cwd/heartbeat**. Všechny nahrazované review attempts musejí vrátit identity-valid terminal receipt; state.status sám nestačí. Live se dočká, unknown/corrupt/missing/EACCES blokují jakýkoli nový v2 dispatch. Raw původní výsledky a chyby se zachovávají v samostatné evidenci, včetně explicitních unperformed reviews.
5. Jeden stabilní `plan-readiness:v2` read-only worker dostane původní plan/frozen intent/spec, skutečné inline instrukce a existující kandidát. Nesmí měnit frozen intent, reimplementovat nebo dělat remote akce. Při úspěchu následuje nejvýše jeden `review:v2:<lens>:<source>` attempt pro každou lens. V2 fail nevyvolá v3/retry smyčku. Starý plan, implement attempt, receipts a source identity zůstávají stejné.
6. **Checkpointy/evidence:** původní `reviewBefore` se uchová a neinterpretuje proti novým legitimním controller artefaktům. Nový `reviewBeforeV2` vzniká po settlementu/readiness. Guard běží při review a před accept/merge, i když run už prošel původními stages. Před commitem může vzniknout controller-owned `review-v2.json`; po commitu se zapisuje pouze runDir evidence a nové controller state fields. HEAD/tree zůstávají neměnné. Acceptance body používá novou jednoznačnou delivery proof identitu a výsledky; historické v1 artefakty nejsou vydávány za nová validní review.

Sdílené helpery sjednocují input hash/transport, replay původního requestu, strukturované readiness a verzi review proofu. Jediným zapisujícím subjektem skutečného run state zůstává engine přes své ctx.save/persist. Tato delegace **needitovala pilotní state, request, receipt ani žádný soubor pilotní worktree**; jen je četla pro průzkum. Žádný skutečný nový modelový pilot nebo remote mutation zde nebyly spuštěny.

### Skutečné ověření

| Kontrola                                               | Výsledek                                  |
| ------------------------------------------------------ | ----------------------------------------- |
| První cílený subset                                    | **8/8 PASS**, exit 0, 66.812 s            |
| Druhý cílený subset                                    | **7/7 PASS**, exit 0, 102.993 s           |
| Kompletní `node --test tests/autodev-adapters.test.ts` | **45/45 PASS**, exit **0**, **244.489 s** |
| `pnpm exec tsc --noEmit`                               | **exit 0**                                |
| Syntax/Prettier/git diff whitespace                    | **exit 0**                                |

Testy používají skutečné Node subprocessy, produkční stdin executor, produkční supervise/request/receipt mechanismus a skutečné dočasné Git/claim fixtures. Přenesly přes **64 KiB** vícebajtového českého/emoji textu bez ztráty, odmítly změněný input před spawnem, ověřily missing executable i exit 7. Každá v2 role má skutečný ledger přijatého stdin hash/byte count. Produkční runWorker parser s exit 0 a explicitním unperformed review vrací REVIEW_OUTPUT; opakované volání nesmí spustit další kopii.

Legacy scénáře pokrývají čekání na živého reviewera bez nových v2 workers, corrupt/mismatched/missing/IO-failed receipt, nesměšování blokované readiness s clean review, zachování původních request/receipt bajtů, jednoznačnou identitu před/po upgrade intentu i po dispatch a post-commit upgrade s nezměněným Git tree. Native worker inteligenci v těchto testech nahrazuje úzký Node program; nejde o tvrzení, že skutečný modelový upgrade pilotu už proběhl. Ten provede root po review tohoto checkpointu.

### Aktuální zdrojový snapshot

Bundle nyní obsahuje devět souborů (nově plan-readiness schema), stejný lexikografický JSON/SHA256 algoritmus: **`a5b0c51e34c6db357fdf1f171f720536a7009f81ba2371f6aa68b44acf6ae2d7`**.

| Soubor                                        | SHA256                                                             |
| --------------------------------------------- | ------------------------------------------------------------------ |
| `scripts/autodev/adapters.mjs`                | `7848ef4373fe0119e776702a19d1453f1a421796e2d008c7a90f43d281827168` |
| `scripts/autodev/codex.mjs`                   | `84515a1601c0b9934004278426402ab7ce39ee50bec0222e117171ffc2cd536e` |
| `scripts/autodev/github.mjs`                  | `72641ba4f3566ac0c5e721eb952da50486ad68dd9f1bca5b66262dd0f0f98269` |
| `scripts/autodev/linear.mjs`                  | `db4e83b416c73be2571d588744dee8f35e3f79509d0e77e6217705facff1201d` |
| `scripts/autodev/prompts/common.md`           | `617e421b4f9b0814efcf650eff59a0ad1e0f2997993438f26baef956b82c8101` |
| `scripts/autodev/schemas/implement.json`      | `f47eeb928d7ea0ff5ea63f21ff62515b558c6fe100db36762b5cd5e49bcf48bd` |
| `scripts/autodev/schemas/plan-readiness.json` | `cb118e6f0a2d63179ccbe4f0582e2db8ffbda5ee822ff3a90b9ed0f12ffe20d7` |
| `scripts/autodev/schemas/plan.json`           | `bcc675b832a2b6815e288ecaa7b9c71f6a9190ae42a58a9bc5cce2c8215bd4b0` |
| `tests/autodev-adapters.test.ts`              | `f2e7bfc33722e590cdd5cffacc2fc9cff9f6278adcac2796f4ce107afada5d93` |

Všechny vlastní testovací subprocessy skončily, fixtures se uklidily. Žádný nový claim pro pilot, nový workflow, další agent, commit nebo vzdálená mutace nevznikly. Po dokončení předání se vlastní adapter rezervace uvolňuje. Následuje root review, samostatná integrace opravy a řízené resume původního runu; změna neopravuje obecné ACL ani nepřijímá nečitelné zbývající vstupy.

## Addendum: opravy cíleného review delivery v2

20. 10. 2026, stejný vlastník, worktree a base `c1c56327240d5634fa3f4670fc7264e6a4287238`; úspěšný `claim --adopt-dirty` převzal jen doložené vlastní cesty. Podklad a triage: [review-delivery-v2.md](../../verification-evidence/bmad-controller-20261020/review-delivery-v2.md). Tento followup změnil pouze `scripts/autodev/adapters.mjs`, `tests/autodev-adapters.test.ts` a tento handoff.

- **B1:** platné původní raw findings i již uložené `data.reviews[].result.findings` blokují upgrade před jakýmkoli novým workerem; opakované review/accept nemohou nález vymazat čistou další odpovědí. Původní výsledky zůstávají archivované. Zvoleno zachování blokace; automatická triage či oprava by přidala neobjednaný repair loop.
- **B2:** scope audit může přijmout pouze konkrétní `review.json`, jehož přesné kanonické bajty odpovídají uloženým datům a tři výsledky odpovídají původním terminal receipts, attempt IDs a parsovaným raw výsledkům. Změněný obsah ani další controller soubor nepovolí. Blanket výjimka pro artifactDir by skryla cizí zápisy.
- **E1:** společný helper reconciliuje pending spec status a ověřuje celý hash, body i frozen blok. Readiness smí při chybějícím souboru použít přesnou uloženou `initialText` jen pro `created=false`; již vytvořený nebo změněný spec zůstává blokovaný. Nevzniká nový plán/spec ani druhá implementace.
- **E2/V2:** merge nejprve čtecím PR lookupem a existujícím GitHub identity guardem ověří, zda mutace už proběhla. Potvrzený merged PR převezme přesné merge SHA bez nového přijetí proti již posunutému main. Dosud otevřený PR dál vyžaduje delivery-v2 proof, aktuální acceptance i exact head/base guardy. GitHub/Linear ani engine/supervisor zdroje nebyly měněny.
- **V1:** skutečný původní implementační subprocess čeká na řízenou bránu a až při dokončení zapisuje kandidáta. Resume nejprve naváže původní worker, do té doby nemá žádný readiness attempt/dispatch; pak převezme stejný receipt a request a validuje dokončený source. Test by nepodmíněný readiness před dočkáním odmítl. Sdílený fixture helper sjednocuje jen dosavadní fake Codex transport, produkční supervisor zůstává skutečný.

Ověření stabilního patche: `node --test --test-name-pattern "legacy actionable findings|legacy review checkpoint replay|legacy readiness resumes the pre-file|live legacy implementation settles|adapter merge adopts" tests/autodev-adapters.test.ts` **5/5 PASS**, exit **0**, **66.972 s**; `pnpm exec tsc --noEmit`, Prettier check a `git diff --check` **exit 0**. První běh měl 4/5 PASS: nová merge fixture při skutečném checkoutu zdědila Windows autocrlf a správně narazila na změněný snapshot hash. Oprava je pouze `core.autocrlf=false` v jejím dočasném Git před commit/checkout; uvedený druhý běh prošel celý. Native subprocess/request/receipt a dočasné Git/claim operace běžely skutečně, GitHub odpovědi jsou řízené adapter-level fixture transporty.

Koordinátor výslovně převzal **jediný celý adapter test nad tímto stabilním checkpointem** souběžně s cílenými rechecky; zde se celá sada znovu nespouštěla. Všechny vlastní testovací procesy skončily, závěrečná Win32_Process kontrola: **0** Node procesů adapter fixtures. Pilotní worktree/state/requests/receipts ani parent docs se neměnily. Žádný remote efekt, commit, další agent či workflow.

Aktuální devítisouborový bundle (stejný lexikografický JSON/SHA256 algoritmus): **`7e0049b5320dd26b7cebaab73bb8a8b9be4c119d7cc4e2f0a3419c6ae1365879`**. Změněné hashe:

| Soubor                           | SHA256                                                             |
| -------------------------------- | ------------------------------------------------------------------ |
| `scripts/autodev/adapters.mjs`   | `eb757442893c0f3683636da81f8ff2ac3aece7ada8b7a03804defb680fc825f3` |
| `tests/autodev-adapters.test.ts` | `d611302d7d0549a14cc55d7a8fcc3f3a8eae0243a0f4897740ac0163dd4003a4` |

Ostatních sedm hashů z předchozí devítisouborové tabulky je shodných. Po tomto předání se adapter claim uvolňuje; další krok je integrátorův cílený recheck a širší adapter sada nad neměnnými zdroji.

## Addendum: zachování diagnostiky neúspěšného native workeru

Koordinátorův následný celý běh skutečně skončil **49/50 PASS, exit 1, 299.911 s**. Jediné selhání: `legacy acceptance upgrade after commit changes only run evidence and preserves the committed tree`, `review:v2:verification:66e7a8fff0ed3cfda7dfac5d21c2613f`, exit 1. Původní runner logy zůstávají v `.cache/bmad-controller-development/adapter-v2-final.{stdout,stderr}.log` a `adapter-v2-final-result.json`; konkrétní receipt/stderr odstranil tehdejší fixture cleanup. Jeho neexistence byla ověřena. **Příčina původního selhání z dostupné evidence není prokázaná.** Shared ledger append, start/transport failure i supervisor heartbeat failure jsou rozlišitelné možnosti, nikoli zjištění. Tři předchozí cílené rechecky byly podle koordinátora čisté; nenahrazují tento neúspěšný širší běh.

Původní vlastník převzal vlastní scope přes úspěšný `claim --adopt-dirty`. Změněny pouze `tests/autodev-adapters.test.ts` a tento handoff. Před úklidem každého fixture se nyní vypíšou receipt, request, stderr a stdout všech neúspěšných či nejasných native attempts pomocí test-runner diagnostic. Chybějící/poškozený receipt není tiše vynechán; cleanup pokračuje v `finally`. Ponechávání všech temp stromů by hromadilo testovací data bez zajištění čitelného reportu, produkční retry či změna sdíleného ledgeru by bez příčiny byly neověřeným workaroundem. Proto se produkční kód ani fixture transport neměnily.

Nový skutečný native subprocess s exit 7 a českým stderr ověřil zachování přesných logů, attempt identity a exit údajů před odstraněním fixture. Přesný neúspěšný postcommit scénář byl omezeně spuštěn třikrát, vždy **PASS**: 13.148 s; 15.249 s včetně nového diagnostického testu (**2/2 PASS**); 14.018 s. Původní chyba se nezopakovala, její příčinu tedy nelze uzavřít ani označit za prokázaný flake. `pnpm exec tsc --noEmit`, Prettier a diff check: **exit 0**. Celá sada se zde neopakovala. Všechny vlastní procesy skončily; Win32_Process kontrola: **0** adapter fixture Node procesů.

Nový test SHA256: **`9e9774dcc124400df845f494fa43b2f050ba4af553e7d1f5467bf88b44e0015b`**. Osm produkčních hashů z předchozího předání zůstává shodných; devítisouborový bundle: **`57d41d4b032aa5172f4944ca07eab92fa36fcf46d628b473e61c44330d435963`**. Pilotní checkout/state/receipts a vzdálené služby beze změny. Po předání se claim uvolňuje; koordinátor určí konečné ověření s novou diagnostikou, která při opakování selhání zachová dosud chybějící konkrétní důkaz.

## Addendum: skutečný SPEC kontrakt a jediná oprava legacy prezentace

Základ `353b4c31acd367d6310ddc913d018d850dbb8f0b`, stejná worktree/větev a owner; před změnou čistý vlastní scope a úspěšný claim bez adopt-dirty. Podnětem byl skutečný readiness výsledek pilotu nad snapshotem `607a5d7f6c796647d31c`: chybějící I/O matrix, slabé task/AC formáty a neuzavřená interní keep-full volba. Čtecí průzkum celého step02/template prokázal, že původní renderer zahodil matrix nahrazením celého frozen bloku. Pouhé přebalení starých strings by muselo domýšlet chybějící scénáře/rationale; opakování implementace nebo přepsání frozen textu by zničilo již platné důkazy. Koordinátor proto schválil typed prezentaci a jeden omezený read-only completion/amendment krok. Předešlé úplné ověření **51/51** a rechecky jsou historické; tento nový patch má vlastní cílené důkazy níže.

- Nový plán má strukturované tasks (path/action/reason), I/O rows, Given/When/Then AC a pozorované route facts. Renderer zachovává požadované sekce skutečné šablony, matrix escapuje a váže odvozené položky na existující intent/AC a worker writePaths. Sdílené helpery sjednocují validaci, render matrix/tasks a authorization binding.
- Dispatch vychází ze skutečných externích efektů přidělené pipeline; worker footprint/irreversibles/newDependencies zůstávají doloženými fakty. Keep-full je **rozhodnutí controlleru/koordinátora v již udělené autorizaci jediného tasku**, nikoli nová uživatelská volba či souhlas. Přesný token count se nevymýšlí: `tokenCount: null`, velikost amendmentu se měří v characters/words. Nesnižuje se route na oneshot kvůli obejití požadavků.
- Legacy migrace vyžaduje stage review, neúplnou původní prezentaci, původní neúspěšnou readiness, žádný staging/commit/PR/v2 review/check. Původní plan/implement/readiness/review requests se převezmou jen přes validní terminal receipts. Jeden `spec-completion:v1` vrátí odvozenou prezentaci, controller uloží durable from/to intent a změní jen přesně očekávaný spec. Matrix se přidává **mimo původní frozen blok**; body změna je explicitní amendment, frozen SHA a sourceDigest zůstávají přesné. Původní spec, plan/readiness, reviewBefore a raw výsledky zůstávají zachované.
- Jedna `plan-readiness:v3` validuje celý doplněný dokument; false/invalid výsledek zastaví run, žádný v4 či automatický repair loop. Completion i v3 dostávají celý negativní v2 result a jeho SHA. Obě klasifikace musí pokrýt přesně všechny původní otázky/blokátory, beze změny textu/indexu nebo vynechání. Povolené automatické vypořádání: pouze `workflow-keep-full` a pro runtime blockers také `spec-presentation`, obojí vázané na konkrétní authorization SHA. Produktové otázky, runtime prerequisites a nejasné klasifikace blokují i při `ready=true`; původní plan.intentGaps blokují vždy. Finální proof obsahuje původní result/SHA i completion assessment a nezávislé v3 assessment.
- **Význam textu posuzují modelové kroky. Controller ověřuje identitu, úplnost a úzký typ oprávnění; nejde o formální sémantický důkaz.** Nepoužívá prose regex pro rozpoznání gapů ani výjimku podle KEY-47/hashů. Reálné nové modelové spuštění a pokračování pilotu patří koordinátorovi po review.

Ověření: stabilní subset `spec presentation follows|bounded spec completion|specification uses|plan spec replay|snapshot prompts preserve|structured readiness failures|adapter merge adopts|legacy acceptance upgrade after commit|plan and legacy-readiness payloads` přes Node test runner **18/18 PASS**, exit **0**, **243.046 s**; TypeScript, syntax, Prettier a diff check **exit 0**. Subset zahrnuje skutečné native subprocessy/receipts, serializovaný diskový checkpoint a obnovu po completion input, amendment intent, file-write i checkpoint pádu; změněný frozen text, source, neprokázaný receipt, nesprávný stage a nové produktové otázky jsou odmítnuty bez opakování implementace. Raw completion output není přepsán evidence souborem. Předchozí vývojový běh 4/8 odkryl chyby nové fixture: porovnání JSON pořadí po canonical reload a souběžné přímé atomic renames fixture checkpointu (doložené EPERM). Fixture nyní používá stejnou single-writer queue jako engine a canonical digest; následně 9/9 a finálních 18/18 PASS. Tyto nové fixture chyby nevysvětlují historické neprokázané 49/50 selhání.

Portable snapshot fixture čte celé committed `.agents/skills/bmad-build/step-02-plan.md` a `spec-template.md`. Samostatný **read-only/in-memory smoke skutečného pilot snapshotu** ověřil oba reálné prompt body, matrix escaping `--help \| -h`, typed tasks/AC a nezměněné bajty pilot state/spec. Původní i amended frozen SHA: `539febe5eb262cc3382640d45116ff009ff3d49cdc753c500dd65768a8de0eb4`; sourceDigest zůstal `eab6516de7c14a86d0b53bddae3eec1832ea7734f2b4073b38a23015290bd108`. Původní negativní readiness SHA `f3493d6a698a06dba691a0a594fd76b936eb079e03541e0ba09b86b923c10e0d` a authorization SHA `2d536203be9ffc3eb433ad3ff3f5d28a8de5ca11e33d504dfd9cc48e1784d02f` byly obsaženy v obou nových immutable prompt vstupech. Smoke používal pouze in-memory kontraktová data, **0 modelových calls a žádné pilotní zápisy**; není to přijetí hypotetického doplnění.

Změněné cesty: adapters/codex, plan schema, nové spec-completion a plan-readiness-v3 schemas, adapter test a tento handoff. Engine/supervisor, GitHub/Linear, upstream renderer/skills/overrides, package metadata, parent docs a pilot zůstaly beze změny. Celou sadu a review převezme koordinátor nad stabilním checkpointem; po úklidu vlastních procesů a předání se claim uvolňuje.

Aktuální jedenáctisouborový bundle (lexikograficky seřazené `{file,sha256}` rows, SHA256 UTF-8 JSON): **`2af4751955f85ff86f12f33e8ea9a413999f46e8ca040ff1056568fe99e7b361`**.

| Soubor                                           | SHA256                                                             |
| ------------------------------------------------ | ------------------------------------------------------------------ |
| `scripts/autodev/adapters.mjs`                   | `b87e419af54ea72743b76029c1d52d84a464a64c832661fd73dda6b0747f7734` |
| `scripts/autodev/codex.mjs`                      | `4a6322e4d717d6fe05c68f48071da044d9dc60333024274d75d8a2cf625f7283` |
| `scripts/autodev/github.mjs`                     | `72641ba4f3566ac0c5e721eb952da50486ad68dd9f1bca5b66262dd0f0f98269` |
| `scripts/autodev/linear.mjs`                     | `db4e83b416c73be2571d588744dee8f35e3f79509d0e77e6217705facff1201d` |
| `scripts/autodev/prompts/common.md`              | `617e421b4f9b0814efcf650eff59a0ad1e0f2997993438f26baef956b82c8101` |
| `scripts/autodev/schemas/implement.json`         | `f47eeb928d7ea0ff5ea63f21ff62515b558c6fe100db36762b5cd5e49bcf48bd` |
| `scripts/autodev/schemas/plan-readiness-v3.json` | `080f125734c31018975424fa6fb3c9fd27813d17361e4e18f680a73ef838e42e` |
| `scripts/autodev/schemas/plan-readiness.json`    | `cb118e6f0a2d63179ccbe4f0582e2db8ffbda5ee822ff3a90b9ed0f12ffe20d7` |
| `scripts/autodev/schemas/plan.json`              | `459ce6bb3e8fb7850bc2375c8e387a1dc482879dcad4f44d02744e790af78bda` |
| `scripts/autodev/schemas/spec-completion.json`   | `5723c3a568907362d8fffc0a99d76de9b95a1e5fdca837209dfcd3d426fcc407` |
| `tests/autodev-adapters.test.ts`                 | `2d8b1a4f6d75fe5a9f0b4f1f76c39fa76a757c8108507208e71d4611207e91c3` |

## Addendum: review opravy literal matrix a crash před rename

Po dobu root full suite proběhlo pouze čtení/průzkum. Teprve po výslovném uvolnění freeze (root výsledek **62/62 PASS**, exit 0, 511.980 s) získal původní autor stejný claim přes `--adopt-dirty`. Změněny pouze `codex.mjs`, `adapters.mjs`, adapter test a tento handoff; bez pilotních/remote/modelových akcí.

- Matrix amendment nyní používá callback v `String.replace`, takže obsah není replacement program. Konkrétní regrese kontroluje přesný řádek pro nové i legacy renderování: všechny `$$`, `$&`, `$'`, dollar-backtick tokeny, pipe i LF/CRLF a české znaky se zachovají nebo požadovaně escapují.
- Pro amendment byl vybrán přesný sibling temp s **nonce, path, owner, target SHA a doloženou předchozí absencí uloženými před `wx` vytvořením**. RunDir staging by přidal cross-device rename problém; glob cleanup/ignore by skryl cizí výstupy. Sdílený helper pouze pro amendment ověří zdrojové/frozen/from/to identity a přesný běžný nezdílený soubor, doplní pouze chybějící bajty přesného UTF-8 prefixu (včetně prázdného souboru), provede sync a ověří celý cílový obsah i file identity před rename. Před scope auditem se rekonciliuje pouze tento zaznamenaný temp. Delší, non-prefix, nezaznamenaný, symlink/junction či nejednoznačný temp zůstává zachovaný a blokuje; nic se globálně nemaže nebo nepovoluje.
- Tři nové **nativní controller kill/restart** testy skutečně ukončují vlastní child proces po `wx/create`, s prefixem končícím uprostřed vícebajtového UTF-8 znaku a po kompletním synced zápisu před rename. Resume načte diskový checkpoint, zachová frozen/source/original receipts a nespouští znovu modelové role. Čtecí/negativní větve ověřily zachování cizího tempu, non-prefix/delšího obsahu i junctionu. Tři starší amendment intent/write/checkpoint regrese zůstaly zahrnuté.
- Čtyři native regrese pokrývají `priorReadiness.runtimeBlockers` s `runtime-prerequisite` i `unresolved` v completion i závěrečné v3 při novém `ready=true` a prázdných nových arrays. Přesně navázaný původní blokátor vyvolá `RUNTIME_BLOCKERS`; completion nemění původní spec, v3 zachová již provedený legitimní amendment beze změny při repeat resume. Nevzniká další review ani duplicitní worker.

Kompatibilita byla posouzena samostatně: read-only inventář obsahoval pouze skutečný KEY-47 legacy run bez deliveryProtocol/specFormatVersion, žádný doložený protocol-2 planner consumer. Commit `353b4c31` nebyl publikován a žádná lokální remote-tracking větev jej neobsahovala. Koordinátor proto nález změny meziformátu triagoval jako **false pro aktuální publikovaný/živý consumer**. Hypotetický nepublikovaný protocol-2 interim stav bez nového spec/authorization kontraktu zůstává explicitně nepodporovaný a zastaví na validaci; nepřidává se broad migration. Existující oddělení delivery protocol a specFormatVersion se neměnilo.

Ověření: `node --test --test-name-pattern "spec matrix rendering|native controller kill after amendment temp|prior runtime blocker|bounded spec completion preserves.*after-spec-amendment-(intent|write|checkpoint)" tests/autodev-adapters.test.ts` **11/11 PASS**, exit **0**, **218.538 s**, 0 skips. TypeScript po doplnění chybějící testové anotace `line: string`: **exit 0**; syntax, Prettier a diff check **exit 0**. Žádná širší sada zde neběžela. Root přebírá cílené nezávislé rechecky a celkové test/build/integration ověření.

Nový jedenáctisouborový bundle: **`9888e6b063b20e8e565cda56e15c60f992d66a6a078089ea0b6649f6cf5ab654`**. Změněné dílčí hashe níže; ostatních osm z předchozí tabulky zůstává shodných.

| Soubor                           | SHA256                                                             |
| -------------------------------- | ------------------------------------------------------------------ |
| `scripts/autodev/adapters.mjs`   | `cf539bd0179f39df6646a2e40a29b1185a0340aa96d3f0dfa64776de336ad11e` |
| `scripts/autodev/codex.mjs`      | `86017354a3e4e154bc26fda920087a724c76acf0b8a79c43f80b58ed22460be9` |
| `tests/autodev-adapters.test.ts` | `d6751150598c0145fdb330940a1065d4c9b978eefa0a5ee3ed6b9b381dcc933b` |

Všechny vlastní subprocessy jsou ukončené a fixtures uklizené; po předání se původní adapter rezervace uvolňuje. Žádný commit, nové workflow, subagent či změna pilotního state/spec/receipt nevznikly.

## Addendum: test nejednoznačného tempu vedle hotového endpointu

Po výslovném uvolnění dalšího source freeze původní vlastník získal claim přes `--adopt-dirty`. Změněn pouze adapter test a tento handoff; produkční zdroje zůstaly přesně stejné.

Existující `after-spec-amendment-write` crash test nyní obsahuje stav `completed:false`, přesný cílový spec `toText` a přesný zaznamenaný temp s platným bajtovým prefixem. Dvě resume s reloadem diskového checkpointu musejí skončit `BMAD_SPEC_TEMP`, zachovat oba soubory i checkpoint bajtově, ponechat `completed:false` a nezměnit attempts ani worker ledger (0 nových workerů, žádné readiness v3/review v2). Po odstranění pouze testem vloženého nejednoznačného tempu pokračují původní pozitivní replay assertions.

Spuštěn **jen tento jediný případ** přes přesný `--test-name-pattern`: **1/1 PASS**, exit **0**, **27.900 s**. `pnpm exec tsc --noEmit`, Prettier a diff check: **exit 0**. Širší ověření zůstává koordinátorovi. Vlastní subprocessy skončily a fixtures se uklidily; po předání se claim uvolňuje.

Test SHA256: **`d079eaf786875218cd88c9b8bc618f6a26ac9b3adbe552b70263a9d26a2ac849`**. Ostatních deset zdrojových hashů zůstává shodných, včetně explicitně ověřených adapters `cf539bd0179f39df6646a2e40a29b1185a0340aa96d3f0dfa64776de336ad11e` a codex `86017354a3e4e154bc26fda920087a724c76acf0b8a79c43f80b58ed22460be9`. Nový jedenáctisouborový bundle: **`718593e049dc4c80bbedbca1d94ff7faca570e897dfa62311da2b0b05eda2115`**. Žádné pilotní/remote/modelové akce ani produkční změny.

## Addendum: svázané výstupní schema a jediná oprava slabého completion kontraktu

Základ `fbeb58218c596e9828047c83194fb8412a1cec5b`. Během root serial freeze probíhalo pouze čtení; po jeho výslovném uvolnění (historický root výsledek 1614 PASS, 1 existing skip, build/integration exit 0) byl vlastní scope čistý a získán claim bez adopt-dirty. Změněny adapters/codex, schemas plan/spec-completion, adapter test a tento handoff.

Skutečný v1 raw výstup SHA `631058f07ebec4bf7821b394c3487bcac8bff0f9be59ac1862d3f4a2ca08eebb` obsahoval čtyři prázdná `then`, readonly původní testy a controller handoff v `tasks.path` a popisné footprint strings. Postvalidator správně odmítl; static schema však nabízelo pouze `type:string` a prompt nedostatečně odděloval role. Navíc původní immutable input vázal cestu k `--output-schema`, nikoli jeho bajty. Rozvolnění scope nebo heuristické rozřezávání Když/Pak by měnilo kontrakt; prompt-only oprava by ponechala stejnou mezeru. Zvolená oprava přesouvá již platná omezení před modelový výstup a zachovává kontrolu po něm.

- `presentation` je property-level object|null. Substantivní intent/runtime blockers mají přednost; `ready=false` může vrátit null bez vymyšlené matice/úkolů. Blocked nový plán s null prezentací uloží plánovou evidenci a zastaví před tvorbou specifikace. `ready=true` bez blockerů dál vyžaduje úplnou strukturu. Supported `pattern` vyžaduje neprázdný text, task/AC fields jsou jednotlivé řádky; nepoužívá se root anyOf ani if/then/else. Koordinátor ověřil podporovaný subset v [OpenAI Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs); [Codex cookbook](https://developers.openai.com/cookbook/examples/codex/build_iterative_repair_loops_with_codex) doložil lokální `--output-schema`, nikoli oprávnění přidat jeho iterativní loop/model override.
- `tasks.path` znamená pouze worker WRITE action. Readonly podklady patří do Code Map, manifestové příkazy do Verification a controller handoff/artifacts zůstávají controller-owned. Footprint obsahuje raw filenames; popisy nejsou cestami. Dynamické enumy svazují path/footprint a authorization basis, prompt tuto hranici i samostatné given/when/then výslovně uvádí.
- **Přesná directory hranice:** nový planner této verze vyžaduje konkrétní soubory ve frozen worker writePaths; directory worker scope zastaví před planner dispatch s `PLAN_PATHS_REQUIRED`, bez modelového loopu nebo domýšlení nových filenames. Tasky mají být konkrétní již před zahájením runu. Controller artifact/render directory scopes jsou dál podporované. Pro legacy completion jsou enumy odvozeny ze skutečných konkrétních worker candidate files v ověřené source identity, takže existující directory rezervace lze použít pro tyto již doložené soubory, nikoli jako novou obecnou write cestu.
- Každý nový structured worker dostane vlastní immutable schema v runDir podle attempt key. Input/provenance váže path, SHA a output-contract version 2; executor ověří bajty před spawnem. Existující schema s jinými bajty se nepřepisuje. Staré immutable requesty se rekonciliují s původními args a zachovávají starý nehashovaný kontrakt.
- Jediný `spec-completion:v2` je povolen jen po identity-valid terminal v1 exit 0, validním JSON, `ready=true`, prázdných nových gaps/blockers, správném úplném priorReadiness reconciliation a doloženém `SPEC_PRESENTATION` nesouladu starého **nebound** kontraktu. Vše zůstává v již omezeném legacy pre-amendment/precommit/pre-v2-review stavu. Aktuální bound v1 se tímto mechanismem neopakuje; platný starý v1 také ne. V1 raw/result/input/request/receipt zůstávají zachované a hashově uvedené v repair historii. V2 false/invalid/failed je trvalý stop bez další completion generace.
- Sdílené completion validation/identity helpery vážou amendment, cached proofs a jedinou readiness v3 na **skutečně použitý completion**. V3 obdrží amended target, původní negativní readiness i historii v1/v2. Původní plan intent gaps, review findings a substantive prior runtime blockers zůstávají zastavující. Žádná reimplementace, žádný obecný retry framework.

Ověření: **13/13 nových cílených testů PASS**, exit 0, **197.891 s**; **6/6 přímo dotčených původních transport/replay testů PASS**, exit 0, **59.491 s**. TypeScript, Prettier a diff check **exit 0**. Native testy přečetly skutečné schema přes subprocess/executor, ověřily doručený SHA a tamper-stop před child spawnem; reprodukovaly neplatný historický output shape, nullable blocked prioritu, validní v1 bez opravy, pády po v2 intentu/výsledku/receiptu a stable v2 false/invalid/exit 7 bez duplicit. Původní intent/runtime otázka se nesmí ztratit kvůli mechanické chybě prezentace. Celá lokální sada se neopakovala.

Čistý builder/validator smoke nad skutečným pilotem (žádná celá stage) potvrdil nezměněný authorization SHA `2d536203be9ffc3eb433ad3ff3f5d28a8de5ca11e33d504dfd9cc48e1784d02f`, priorReadiness SHA `f3493d6a698a06dba691a0a594fd76b936eb079e03541e0ba09b86b923c10e0d` a original raw SHA výše. Nové schema obsahuje pouze `scripts/check-lfs-assets.mjs` a `tests/lfs-assets-help.test.ts`, odmítá prázdné then a dovoluje blocked null. In-memory schema SHA: `16f7f5336678a09d6ca1308734c4d9c62afc36d5d25448d48fb695a864ed6af6`; prompt SHA: `736ac632abd2486cf0e9d1caba43d8819ec6e9d2a7284107e28ea5ee2be60dd2`. Pilot state a raw bytes před/po shodné, **0 model calls a 0 pilotních zápisů**. Tento smoke není přijetí nového modelového výsledku; skutečný běh provede root po review.

Vlastní fixture subprocessy jsou ukončené (Win32_Process: **0**), fixtures uklizené. Engine/supervisor, GitHub/Linear, package metadata, parent docs, pilot a vzdálené služby zůstaly beze změny; žádný commit ani další agent. Po předání se claim uvolňuje; integrátor přebírá review a přesnou GitHub CI.

Jedenáctisouborový bundle: **`cfdf2939bb33644bc966805899af7a365969d1b55555fca3350bd02149e529ac`**. Změněné hashe níže; ostatních šest z předchozí tabulky je shodných.

| Soubor                                         | SHA256                                                             |
| ---------------------------------------------- | ------------------------------------------------------------------ |
| `scripts/autodev/adapters.mjs`                 | `cb7fa5c16769cf3a74a2aa94929d892641ae05d4f0de03be58677670d72ed5af` |
| `scripts/autodev/codex.mjs`                    | `473947b15dd6e139eded0ef52269ef975355822824694840180e2b09d9137f0a` |
| `scripts/autodev/schemas/plan.json`            | `c1e586db92de3c0f7716ddc08ab163ae0d9d021e38591e673dcabc464d2bb89f` |
| `scripts/autodev/schemas/spec-completion.json` | `23c214395cc0060dfa7596335dfeb3df2c221d3a42ad2ad20ae1a76c40025490` |
| `tests/autodev-adapters.test.ts`               | `3ea74d1a4eb24d9ed259ce9d923ca5e2bb973cf0ca5542bbba8f3d44d43d9b04` |

## Addendum: test-only uzavření plan/null a terminal schema resume

Po úspěšném převzetí vlastního WIP přes `claim --adopt-dirty` byly změněny pouze adapter test a tento handoff. Produkční kód ani compatibility se neměnily.

- Dva skutečné `runStage('plan')` průchody používají native supervised planner a výsledek `ready=false`, `presentation:null`, zvlášť pro intentGaps a runtimeBlockers. Kontrolují přesné `INTENT_GAPS`/`RUNTIME_BLOCKERS`, původní uložený výsledek a plan.json, neexistující spec a repeat resume bez nového modelového pokusu. Stub je pouze renderer output nad ověřeným fixture snapshotem.
- Nový native test dokončí supervised `runWorker` s terminálním receiptem, změní schema bytes a obnoví přes `runWorker` dvakrát. Očekává `WORKER_SCHEMA` ještě před voláním supervision; původní request/receipt bytes i jediný worker spawn zůstávají stejné. Nepoužívá executor replay, který by chybějící resume guard zakryl.

Cílený pattern `terminal runWorker receipt rejects schema tamper|plan stage preserves blocked null`: **3/3 PASS**, exit **0**, **14.144 s**. TypeScript, Prettier a diff check **exit 0**. Širší sada neběžela. Vlastní subprocessy skončily a fixtures jsou uklizené; po předání se claim uvolňuje.

Test SHA256: **`9cc3dbb68160acaf82042b7a219f2003a3eb783c4ab71f7de4e8b9fd252cd1fb`**. Ostatních deset produkčních hashů z předchozí tabulky je shodných; explicitně ověřeny adapters `cb7fa5c16769cf3a74a2aa94929d892641ae05d4f0de03be58677670d72ed5af` a codex `473947b15dd6e139eded0ef52269ef975355822824694840180e2b09d9137f0a`. Nový bundle: **`66d6383391f53d1a0642fce02e37b436cb5a81be105fdbca99610a24307a8cb8`**. Root triage nepodporovaného nepublikovaného interim amendmentu bez completionIdentity zůstává zachována; nepřidává se další migrace. Žádné pilotní/modelové/remote akce ani commit.

## Addendum: úplné authority vstupy a jediný přesně povolený blind repair

Základ `938254e3fe874de24b89ade193f8f8e5b7a95d6d`; vlastní source scope byl čistý a claim získán bez adopt-dirty. Změněny jen adapters/codex, adapter test a tento handoff. Výzkum a koordinační autorizace jsou v `docs/verification-evidence/bmad-controller-20261020/review-authority-research.md` a `pilot-review-authority-stop.json`.

Doložená příčina: starý review preambule jmenoval AGENTS/policy, ale zákaz znovu otevírat „instruction files named above“ nebyl omezen na skutečně dodané snapshot bodies. Blind proto výslovně neprovedl review. Uznat odmítnutí jako clean nebo automaticky opakovat libovolný REVIEW_OUTPUT by ztratilo důkaz; opakovat všechny tři role by zbytečně zahodilo platné dva přezkumy. Zvolena koordinačně schválená úzká varianta: celé nové authority bodies se SHA a přesný administrativní allowlist jediného historického odmítnutí.

- Všechny NOVÉ review dostávají plné `AGENTS.md` a `docs/agents/bmad-policy.md`, jejich cesty/SHA i snapshot lens bodies. Zákaz reopening je omezen na výslovně vyjmenované inline cesty. Běžné read-only příkazy pro diff/kód jsou povoleny; další agenti, workflow, servery a dlouho běžící helpery zakázány. Diff zůstává file-only, edge claims se čtou až v původním pozdním kroku. Blind/verification nedostávají spec/plan/claims ani staré refusal/history jako instrukce.
- Oprava je omezena na původní precommit review checkpoint, přesný starý chybný blind prompt/provenance a úplné konkrétní odmítnutí. Raw output musí odpovídat všem 260 UTF-8 bytes včetně absence koncového newline. Stdout musí obsahovat přesnou původní dvojici completed agent messages (progress včetně LF, pak stejné odmítnutí), bez dalších agent messages. Není to regex/substring odhad významu libovolného textu; ostatní odmítnutí, extra prose i bound novější vstupy zůstávají zastavené.
- Před jakýmkoli novým workerem se převezmou všechny tři identity-valid terminal receipts, původní immutable inputs, provenance, snapshot/diff/spec/source binding a native výsledky. Chybějící/live/failed/corrupt/nesouhlasící původní důkaz blokuje; jakýkoli původní validní finding blokuje. Původní refusal zůstává `REVIEW_OUTPUT`, `result:null`, nikoli clean.
- Durable `blindAuthorityRepairV1` váže originály, raw/stdout SHA a přesnou authority. Jediný nový klíč je `review:authority-v1:blind:<source-prefix>`. Intent/receipt/result replay využije tentýž pokus. Invalid/fail/finding nového blind je trvalý stop bez další generace. Edge/verification zachovávají původní attempt ID, raw SHA a provenance; výběr je kontrolován i v cached proofu. Historie je součástí controller proofu, nikoli nového blind promptu.
- Sdílené čtení immutable worker inputu je odděleno od supervision a znovu použito stávajícím resume; zachovává schema tamper guard i původní args. Transport protocol 2, output schema, authorization, planning/completion/readiness a service lifecycle se neměnily. Aktuální skutečný completed amendment se `completionIdentity` a readiness v3 je podporovaný a pouze převzatý, bez opakování implementace či completion.

Cílené ověření: první dvoupřípadový průchod našel jen zbytečnou zmínku `claims_file` ve společné větě pro blind; preambule nyní tuto část uvádí pouze pro edge. Následující přesný subset **15/16 PASS**, **363.684 s**, měl jedinou chybnou testovou predikci: `validateReceipt` pro mismatch identity vrací **UNKNOWN_ATTEMPT**, test čekal **CORRUPT_STATE**. Produkční guard byl správný a neměnil se. Opravena jen aserce; doplněno zachování vadných receipt bytes, všech původních bytes a attempt keys, plus native ledger SHA/UTF-8 délky skutečně doručeného nového promptu. Závěrečné dva dotčené případy **2/2 PASS**, **60.325 s**, exit **0**. Všech **12 nových scénářů a 4 přímo dotčené původní scénáře** mají zelený důkaz; již zelené ostatní případy se zbytečně neopakovaly. TypeScript, Prettier, node syntax a diff check **exit 0**. Celá lokální sada neběžela.

Native scénáře pokrývají actual refusal, completed amendment/readiness v3, přesnou jednu náhradu blind a dva původní výsledky, pády po intentu/receiptu/výsledku, skutečně živého původního reviewera, missing/corrupt/mismatched/failed receipts, nálezy všech tří rolí, extra prose a změnu koncových bytes, novější bound input, absent/changed authority, invalid/exit 7/finding náhrady a repeat resume bez duplicit. Původní prompt/parser/progress-replay a terminal schema tamper testy také prošly.

Read-only/in-memory smoke nad skutečným pilotem **exit 0**: všechny tři receipts validní; blind input prompt SHA `e0e9f9d664a690a3711c1cbd1971cdeb8d708c4a3fff4097b10d6a9feec80248` a raw SHA `2e83cc0289d527fd685ca75b3d484d2ae9490c5ebc363eeb68f68f9700e9bc34` přesně matchují allowlist. Edge/verification parsers zůstávají clean. Nové in-memory prompty obsahují skutečné authority SHA `a40a7b039275e345d697c81debfd8ec81351f416fd9018321e1d2f9ecec6c841` (AGENTS) a `8edb0acd4e0b74d2162e339f2f5032f9143a93da95142935192d27a7bf693596` (policy), file-only diff a zachovanou blindness. State bytes před/po shodné, SHA `f41e9cb81ada7f32d64cd7271969f6fe840326e3edbe49f721a12d2991e99730`; skutečná source identity stále `eab6516de7c14a86d0b53bddae3eec1832ea7734f2b4073b38a23015290bd108`, frozen `539febe5eb262cc3382640d45116ff009ff3d49cdc753c500dd65768a8de0eb4`. Completion attempt `7aec03ccfcc73b9d0b1a3345`/`spec-completion:v2` a readiness v3 zachovány. Žádná celá stage nad pilotem, model call, pilotní zápis, remote efekt či commit.

Stabilní jedenáctisouborový bundle: **`a363260580ba389ac0ab6ef55d74c4a61dcc711e19af635a8805b9b7f2c8b7ac`**. Osm ostatních hashů z předchozího bundle bylo znovu ověřeno beze změny.

| Změněný soubor | SHA256 |
| --- | --- |
| `scripts/autodev/adapters.mjs` | `5f9788841c039e6f34222a8675809f80a112a0014d233a3736df52ad9d7e2ca2` |
| `scripts/autodev/codex.mjs` | `bc1bb3acc49121664732789a494543cc4be8f2d15aa0c7a2296137276e0cbcb1` |
| `tests/autodev-adapters.test.ts` | `f153d8dfd48f5d921504d0765b1085f0e64a92363ed32777923fb21f04435563` |

Vlastní testové subprocessy skončily a fixtures byly uklizeny. Po finálním procesovém ověření se původní claim uvolňuje. Source/test checkpoint se po předání nemění; koordinátor přebírá nezávislé review a skutečný pilot/GitHub průchod.

## Addendum: cílené uzavření authority review E1/V1/V2

Původní vlastník převzal pouze vlastní předaný WIP přes `claim --adopt-dirty`. Historická freeze/review evidence zůstala zachovaná. Změněny jen `codex.mjs`, adapter test a tento handoff; produkční `adapters.mjs` ani další kontrakty se neměnily.

E1: původní filtr odstranil top-level `error`/`turn.failed` ještě před porovnáním agent messages. Nyní parser nejprve odmítne oba explicitní failure event types, i když supervisor receipt hlásí exit 0 a zbývající dvě zprávy přesně odpovídají allowlistu. Odmítnutí všech neúspěšných tool příkazů by bylo příliš široké; jejich běžné `item.completed` command_execution záznamy se proto nemění. Dva skutečné native worker scénáře emitují přesné odmítnutí plus zvlášť `error` a `turn.failed`, skončí exit 0 a při dvou resume musejí zastavit `REVIEW_OUTPUT` před intentem/novým dispatch. Raw, stdout, request/input/receipt bytes a attempt keys zůstávají stejné.

V1: historický blind prompt/provenance má samostatnou pevnou předlohu přímo v testu, s dosazením pouze runtime cest a identit. Nepoužívá produkční `legacyBlindAuthorityPrompt` ani novou prompt preambuli k výrobě očekávaného historického vstupu. Prochází skutečným immutable input/native supervisor/adapter řetězcem, takže regrese pevného slova produkčního fingerprintu již nezmění zároveň obě strany testu.

V2: po úspěšné opravě se v kopii cached `reviewsV2` změní nejprve ID původního edge, potom ID nového blind. Oba skutečné stage resume musejí vrátit `REVIEW_INPUT`, nezměnit originální bytes/plánovací historii/attempt keys a nespustit dalšího workera. Produkční cached-selection guard byl správný a zůstal beze změny. Tentýž happy fixture navíc obsahuje legitimní read-only command_execution s exit 1; oprava nad ním dál projde, takže E1 nerozšiřuje zákaz na obyčejný tool failure.

Spuštěn pouze přesný pattern `blind authority repair resumes none|blind authority repair rejects native`: **3/3 PASS**, exit **0**, **86.153 s**. TypeScript, Prettier, node syntax a diff check **exit 0**. Žádná širší sada, model, pilotní či remote akce. Vlastní fixture/test/tsc procesy ověřeně **0**; po tomto předání se claim uvolňuje a source/test freeze trvá do dalšího zadání.

Nový bundle11: **`9ebb933e43564b97141df9dceb65908cb1580f534e6a7a358fea8b8aee2975a0`**. Codex SHA **`94657cab689ce35eedd79096d3d131c6e44dd47e602a5fe79f2b66992a8e9ce0`**, test SHA **`350fe61a889cbcdb85ae60643e0010604ed3b53fa96adb954cda5ed9326cd4ad`**. Zbylých devět hashů bylo znovu ověřeno beze změny, včetně adapters **`5f9788841c039e6f34222a8675809f80a112a0014d233a3736df52ad9d7e2ca2`**.
