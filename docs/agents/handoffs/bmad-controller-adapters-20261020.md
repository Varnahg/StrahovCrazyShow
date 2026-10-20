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
