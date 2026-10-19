# Předání: ci-lfs-pilot-20261019 — RED

- Vlastník: `ci-01a155b2-pilot-red`; příjemce: koordinátor `ci-01a155b2-pilot` a jím vyslaná **nová implementační relace**.
- Cwd: `C:/Users/rezac/.codex/worktrees/ci-main-autonomous-pilot/StrahovCrazyShow`; větev `codex/ci-lfs-pilot`; baseline `a9f1805808c653d2a9fb9cd81def446bfaead588`.
- Výsledek: výslovně nehotový RED checkpoint KEY-44. CLI vždy skončí exit 2 s oznámením, že připravenost assetů nebyla ověřena. Není to hotová funkce.
- Převod: koordinátor výslovně přebírá čtyři níže uvedené vlastní soubory. Nová relace získá rezervaci, převezme zachovaný checkpoint a implementuje původní kontrakt bez oslabení testů.

## Rozsah a podklady

Změněny pouze `scripts/check-lfs-assets.mjs`, `tests/lfs-assets.test.ts`, `.github/workflows/ci.yml` a toto předání. Vlastní ignorovaná evidence je v `.cache/ci-lfs-pilot-worker-20261019/`. Cizí WIP předchozí CI, task katalog a koordinátorovy artefakty zůstaly nedotčené. Žádný staging, commit, push, Linear zápis ani rekurzivní BMAD.

Průzkum 19. 10. 2026 zahrnul projektové instrukce, task/spec, původní CI, manifest, atributy, přenositelné CLI testy a lokální Git LFS help. Primární zdroje: [ls-files v3.7.1](https://raw.githubusercontent.com/git-lfs/git-lfs/v3.7.1/commands/command_ls_files.go), [pointer specifikace](https://raw.githubusercontent.com/git-lfs/git-lfs/v3.7.1/docs/spec.md), [update-index](https://git-scm.com/docs/git-update-index). HEAD vynechá staged deklarace; `files:null` je prázdný inventář. `checkout` dokládá velikost, `downloaded` cache. Místní inventář měl 12 pracovních pointerů při `downloaded=true`.

Zvoleny malé skutečné dočasné Git repozitáře s `hash-object`/`update-index`, izolovanou konfigurací a lokální commit identity. Běžný `git add` by závisel na filtrech a cache; jen mocky by neověřily HEAD/index. Malý externí LFS helper slouží pouze pro neplatný JSON a selhání upstreamu. Pouhé booleany nestačí; plný checksum/GLB parser by zbytečně rozšířil I/O a kontrakt. Herní vzhled, GPU a cache se nemění.

Testy pokrývají materializaci bez cache, mezery/Unicode, cwd/--root, prázdný inventář, LF/CRLF pointer stejné délky jako asset, chybějící soubor s cache, vadné velikosti, staged pointer, adresář/link, chybný HEAD/root/argument/inventář. Pointer fixtures prošly i oficiálním `pointer --check --stdin --no-strict`. CI přidává targeted test a preflight po Node setup před instalací; původní kroky zůstávají.

## Refaktoring a skutečné ověření

Fixture, staging, spouštění CLI a assertions sdílí malé helpery. Procesy jsou synchronní, skryté, s timeoutem; `t.after` uklízí i při selhání a před rekurzivním smazáním ověří absolutní dočasný kořen. Finální běh nezanechal žádný fixture adresář.

- Node `v24.19.0`, Git LFS `3.7.1`, Windows. Katalog validní, claim přijat.
- Skutečný kolizní claim jiného owner: **exit 1**, původní vlastní claim i source cesty beze změny. Raw důkaz `collision.json` v uvedené cache; žádný adopt-dirty ani převzetí podle stáří.
- `node --test tests/lfs-assets.test.ts`, 20:57:26–20:57:47 UTC: **22 testů, 21 fail, 1 pass, exit 1**, 20 612 ms. Všechna selhání jsou na nedokončeném CLI, žádná na fixture setupu/cleanupu. Obecný test nenulového LFS selhání prochází i se stubem; není to důkaz implementace. Žádný umělý assert(false), skip ani todo.
- `node scripts/check-lfs-assets.mjs`: **exit 2**, prázdné stdout, explicitní neimplementované readiness na stderr.
- Cílený `git diff --check`: exit 0. Původní i finální raw test logy/metadata, CLI výsledek a manifest jsou zachované v cache (`red-tests-first.*`, `red-tests.*`, `red-cli.json`, `red-source-sha256.json`). Provozní PID/registry patří pouze do lokální evidence.

## Zmrazené RED zdroje

| Soubor | SHA-256 |
| --- | --- |
| `tests/lfs-assets.test.ts` | `042aa1dec471509a696520608b3b223bf7c945a8d073fcea41ff3f10f74713de` |
| `scripts/check-lfs-assets.mjs` | `fa0f983f6d40ac778979f2558dba90fc71783ef8eec0e51baf161cfc5337af8b` |
| `.github/workflows/ci.yml` | `ed759c2f3558d04f41a73ab68be547fd8ea97aab8bfb62f0e1237317d9e9952c` |

Vlastní krátké procesy skončily; žádný port/server/GPU/build/instalace nebyly spuštěny. Po tomto handoffu vlastník bezprostředně provede release a doloží jej koordinátorovi závěrečnou zprávou. Release neznamená Done; změny mají výslovného příjemce.

Další krok koordinátora: commit převzatého rozsahu, zachování skutečného RED GitHub runu a odmítnutí merge, pak nová implementační relace. Full suite/build/integrace, Linux/GitHub gates, limit čtení 1024 bajtů a zavření descriptoru zatím nejsou ověřené; patří následné implementaci a přejímce. Stav tasku, společnou evidenci a konečné přijetí mění integrátor.

## Obnova novou relací — 19. 10. 2026

- Nový vlastník `ci-01a155b2-pilot-recovery`, výslovný příjemce koordinátor `ci-01a155b2-pilot`.
- Převzatý RED commit `e0ea60e642c1a1e177a6d1dfcf04c90dc18301b6` ve stejné výše uvedené worktree a větvi. Původní předání výše zůstává zachované.
- Před zápisem načteny AGENTS, architektura, koordinace, current-work, BMAD policy, task/spec a RED předání; ověřeny status/worktree/registry a úspěšně získán vlastní claim. Rekurzivní BMAD ani další delegace se nespouštěly.
- Při převzetí byly untracked pouze koordinátorovy `blocked-merge.json` a `red-github.json`; jejich obsah byl pouze přečten. RED GitHub run `39324153438` selhal a merge vrátil HTTP 405, remote main před/po pokusu zůstal `a9f1805808c653d2a9fb9cd81def446bfaead588` podle těchto důkazů.
- Vlastní změny obnovy: pouze `scripts/check-lfs-assets.mjs`, toto předání a ignorovaná `.cache/ci-lfs-pilot-worker-20261019/`. Testy i workflow zůstávají bajtově stejné; katalog/spec, cizí evidence, index, assety a LFS objekty se nemění. Žádný commit, push ani Linear zápis.

### Průzkum a rozhodnutí obnovy

Znovu ověřeny lokální Git LFS help/inventář a primární zdroje pinované v3.7.1: [HEAD inventář](https://raw.githubusercontent.com/git-lfs/git-lfs/v3.7.1/commands/command_ls_files.go), [pointer parser](https://raw.githubusercontent.com/git-lfs/git-lfs/v3.7.1/lfs/pointer.go) a [režimy pointer CLI](https://raw.githubusercontent.com/git-lfs/git-lfs/v3.7.1/commands/command_pointer.go). Doložený mechanismus: `checkout` je jen shoda velikosti a `downloaded` přítomnost cache; ani jedno nedokazuje pracovní asset. HEAD odděluje committed deklaraci od staged změn. Režim `pointer --check --stdin --no-strict` parsuje malý vstup a přijímá CRLF; režim generování pointeru přes `--file` by hashoval celý model.

Porovnány: jen inventory booleany (nedostatečné), pouze velikost/header regex (stejná velikost pointeru a údržba vlastního parseru), plný checksum nebo GLB parser (velké I/O, širší a formátově závislý kontrakt), zvolený HEAD inventář + validace cesty/typu/velikosti + bounded header a oficiální parser malých souborů. Zvolené řešení nepřidává dependencies ani asset download, je nezávislé na LFS cache a neovlivňuje vzhled, herní stav nebo GPU. Velké soubory se nehashují a pro ně se parser nespouští. Kontrola výslovně neslibuje odhalení stejně velkého poškozeného assetu.

### Implementace a cílený refaktoring

CLI přijímá pouze cwd nebo `--root DIR`, ověří skutečný checkout root, používá `git lfs ls-files --json HEAD` a přijímá `files:null`. Chyby Git/JSON/argumentů nesmějí skončit úspěchem. Každá položka musí mít bezpečnou relativní cestu a nezápornou bezpečnou celočíselnou velikost. `lstat` odmítá link/special-file na cílové cestě; `realpath` odmítá útěk přes adresářový link. Otevřený soubor se znovu kontroluje přes `fstat`.

Opakovaná práce je soustředěna v helperech pro spuštění Git, bezpečnou cestu a bounded čtení. Buffer má nejvýše 1024 bajtů; smyčka i při krátkém čtení sdílí stejný konečný rozpočet. `finally` zavírá descriptor při úspěchu i výjimce; parser běží až po zavření. Dvě `fstat` kontroly zachytí změnu velikosti/časů během čtení. `O_NOFOLLOW`/`O_NONBLOCK` omezují závod s výměnou typu souboru na platformách, které je podporují. Nejde o atomický snapshot proti souběžnému přepisování stromu. Žádná globální cache, dlouhožijící proces nebo per-file nenačtený descriptor nezůstává. Výstup uvádí počet a konkrétní cesty/důvody, nikdy obsah ani raw parser diagnostiku.

### Průběžná evidence obnovy

- Skutečný `node scripts/check-lfs-assets.mjs`, `2026-10-19T21:08:39.188Z`–`21:09:05.425Z`: **exit 1, 12 files / 12 failed**, každá cesta identifikovaná jako `unmaterialized Git LFS pointer`, stdout prázdné. Očekávaný místní neúspěch; všechny assety zůstaly pointery. Raw výsledek `recovery-cli.json` ve vlastní cache.
- První targeted pokus měl nesprávně těsný pomocný `spawnSync` limit 120 s: `21:07:37.737Z`–`21:09:37.786Z`, `ETIMEDOUT`, signal `SIGTERM`, žádný testový výstup. Zachováno v `recovery-tests.json` a odpovídajících stdout/stderr souborech. Toto není výsledek assertions ani green důkaz. Následuje stejný příkaz přímo bez pomocného limitu; původní testy se nemění.

### Konečné místní ověření a převod

- Přímý `node --test tests/lfs-assets.test.ts`, `2026-10-19T21:10:14.2637234Z`–`21:11:01.8009153Z`: **exit 0, 22 pass / 0 fail / 0 cancelled / 0 skipped / 0 todo**, test runner `47 356,4302 ms`. Raw `recovery-tests-direct.log` a čas/exit metadata `recovery-tests-direct.json` ve vlastní cache. Tento úplný běh je platný targeted důkaz; předchozí timeout není přepisován ani vydáván za testový výsledek. Příčina rozdílné délky pomocného a přímého běhu nebyla měřena.
- `git diff --check` vlastního scope: exit 0. Původní test hash ověřen před testováním i po něm. Workflow je nezměněný. Limit čtení a `finally` lifecycle doloženy inspekcí implementace; neměněná původní suite nemá syscall instrumentaci. Souběžnou změnu adresářů ani výkonový profil tento checkpoint netestoval.

| Soubor | SHA-256 po obnově |
| --- | --- |
| `scripts/check-lfs-assets.mjs` | `19e3861e5a843158f870c37e1394297fdc0acc249bdce105a43796e21290b218` |
| `tests/lfs-assets.test.ts` | `042aa1dec471509a696520608b3b223bf7c945a8d073fcea41ff3f10f74713de` (beze změny od RED) |
| `.github/workflows/ci.yml` | `ed759c2f3558d04f41a73ab68be547fd8ea97aab8bfb62f0e1237317d9e9952c` (beze změny od RED) |

Úplný vlastní manifest včetně tohoto předání je `recovery-source-sha256.json` a diff `recovery.diff` ve vlastní cache. Identitu předávaného zdroje tvoří RED commit plus tento manifest/diff, nikoli obecně dirty strom: mezitím přibyly koordinátorovy změny spec/CI dokumentace/evidence, do nichž tato relace nezapisovala.

Všechny vlastní test/CLI procesy jsou ukončené (ověřeno procesním seznamem); žádný server, port, GPU, build, instalace nebo síťový přenos assetů nebyly spuštěny. Po přerušeném wrapperu zůstal adresář `C:/Users/rezac/AppData/Local/Temp/strahov-lfs-preflight-frwPwX` s jediným prázdným `empty-gitconfig` a prázdným `repository with spaces`. Automatická kontrola odmítla jeho odstranění i následný užší pokus o odstranění pouze těchto ověřených prázdných položek; v obou případech uvedla jen `blocked by policy`. Žádné mazání se neprovedlo a kontrola se neobcházela. Jde o neaktivní dočasný zbytek, nikoli běžící proces či herní WIP; toto omezení bylo koordinátorovi výslovně sděleno.

Výsledek obnovy je **lokálně ověřená implementace připravená k přijetí**, nikoli Done celého pilotu. Koordinátor `ci-01a155b2-pilot` výslovně přebírá pouze CLI a tento handoff, se zachovanými původními testy a CI kroky. Provádí následné nezávislé review, commit/push, plnou GitHub suite/build/integraci a SHA-vázané přijetí; pouze on mění task stav/Linear/společnou evidenci a integruje. Tato relace po dokončení manifestu a předání bezprostředně uvolňuje `ci-lfs-pilot-20261019` owner `ci-01a155b2-pilot-recovery`; výsledek release doloží závěrečnou zprávou. Uvolnění není označení Done ani povolení jinému agentovi převzít nepřijatý diff bez tohoto předání.
