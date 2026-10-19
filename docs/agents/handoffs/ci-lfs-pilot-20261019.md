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
