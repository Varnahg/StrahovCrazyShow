---
title: 'KEY-44: Autonomní LFS preflight pilot a obnova'
type: 'feature'
created: '2026-10-19'
status: 'in-progress'
route: 'dispatch'
baseline_commit: 'a9f1805808c653d2a9fb9cd81def446bfaead588'
review_loop_iteration: 0
context:
  - docs/agents/bmad-policy.md
  - docs/agents/tasks/ci-lfs-pilot-20261019.json
  - docs/agents/tasks/ci-pilot-coordination-20261019.json
---

<frozen-after-approval reason="Uživatel výslovně požaduje jeden autonomní pilot včetně obnovy po selhání; nejprve přijatá CI/ochrana main.">

## Intent

Přidat malou kontrolu připravenosti LFS assetů přímo v checkoutu a na ní ověřit celý autonomní cyklus. Předchozí CI celek je přijatý přes PR #7 a main CI39321924235. Pilot musí zachovat skutečné neúspěšné ověření, prokázat blokaci merge a pokračovat v nové agentní relaci bez oslabení testů či ochrany.

## Boundaries & Constraints

Pouze `scripts/check-lfs-assets.mjs`, `tests/lfs-assets.test.ts`, úzké zapojení do `.github/workflows/ci.yml`, vlastní handoff a koordinátorova evidence. Žádné nové dependencies, herní změny, asset download/mutace ani obecný scheduler. Dítě drží vlastní disjunktní claim a nespouští BMAD. Koordinátor vlastní specifikaci, GitHub runy/přijetí a metadata. GitHub preflight se spustí po Node/checkout, před instalací a velkou sadou; původní plná CI zůstává.

CLI: `node scripts/check-lfs-assets.mjs [--root DIR]`. Inventář je committed HEAD přes `git lfs ls-files --json HEAD`; index nesmí změnit očekávanou velikost. `files:null` znamená prázdný inventář. Chyba Git/LFS/JSON nebo argumentů nesmí být úspěch. Pro každou položku ověř relativní cestu uvnitř rootu, běžný soubor, existenci, deklarovanou velikost a nepřítomnost LFS pointeru. Číst nanejvýš 1024 bajtů na soubor a descriptor vždy zavřít. Nespolehej na inventory booleany `checkout`/`downloaded`. Výstup obsahuje počet souborů a konkrétní cesty/důvody; nevypisuje obsah. Kontrola není kontrolní součet stejně velkého poškozeného assetu.

## I/O & Edge-Case Matrix

| Scénář | Očekávání |
| --- | --- |
| Materializovaný asset s očekávanou velikostí, i bez lokálního LFS cache objektu | Úspěch. |
| Prázdný committed inventář | Úspěch, nula souborů. |
| Pointer, včetně CRLF a délky shodné s deklarovaným assetem | Nenulový exit a konkrétní cesta/důvod. |
| Chybějící file nebo odlišná velikost | Nenulový exit, chybějící/size-mismatch. |
| Mezery a Unicode v názvu | Správná identita cesty, žádné dělení whitespace. |
| Změněný staged pointer | Očekávání dál pochází z HEAD. |
| Chybný root/inventář/argument | Zřetelné selhání, žádný fetch nebo zápis. |
| Red checkpoint | PR CI selže, merge je odmítnut, testy a handoff zůstanou. |
| Nová implementační relace | Převezme doložený checkpoint, implementuje původní kontrakt, původní testy se neoslabí. |

</frozen-after-approval>

## Code Map

- `tests/source-secret-hygiene.test.ts`: vzor přenositelného CLI testu v dočasném Git repozitáři, ověřený cleanup.
- `git lfs ls-files --help`, `git lfs pointer --help`: instalovaná 3.7.1 podporuje stabilní JSON a `pointer --check --stdin --no-strict`; tento režim nehashuje velký model.
- Git LFS `commands/command_ls_files.go` v3.7.1: bez HEAD přimíchává index, prázdný slice může být null; checkout je jen shoda velikosti a downloaded jen dostupnost LFS cache.
- `.gitattributes` a manifesty vegetace: skutečné LFS modely, nikoli náhodná testovací data.
- `.github/workflows/ci.yml`: přijatý Ubuntu24.04 verify job; přidat malý targeted CLI test/preflight před frozen install, zachovat všechny stávající kroky.

## Tasks & Acceptance

**Execution:**
- [ ] `tests/lfs-assets.test.ts`: skutečné malé dočasné Git/LFS fixtures; CLI black-box testy výše uvedených stavů. Syntetické pointery lze vložit přímo do indexu pomocí hash-object/update-index, aby fixture nepotřebovala stahování ani globální hooks.
- [ ] `scripts/check-lfs-assets.mjs`: nejprve zřetelně nedokončený red stub; obnova jej nahradí minimální bounded implementací podle původních testů.
- [ ] `.github/workflows/ci.yml`: zapojit targeted test a kontrolu pracovních assetů před velkou sadou.
- [ ] Vlastní předání: zaznamenat testy, původní chyby, procesy, owner a převod. Žádný vlastní commit/push dítěte; provede koordinátor.
- [ ] Koordinátor: zachovat red commit/run, skutečné odmítnutí merge, obnovit v nové relaci, nezávisle review, přijmout green SHA a integrovat samostatně.

**Acceptance Criteria:**
- Given checkout s pointerem, when preflight běží, then skončí nenulově před parsováním modelů a uvede přesnou cestu.
- Given skutečné assety, when GitHub provede finální pilotní CI, then preflight i celá původní suite/build/integrace projdou.
- Given neúspěšný red checkpoint, when se koordinátor pokusí o merge pod rulesetem, then main zůstane nezměněná.
- Given zachovaný red checkpoint, when nová relace naváže, then původní testy beze změny projdou po implementaci a výsledek se sloučí až po všech gates.

## Design Notes

Výzkum skutečné worktree: 12/12 pracovních LFS souborů jsou pointery, přestože inventory downloaded=true. Proto kontrola pracovních souborů doplňuje `git lfs fsck` objektového úložiště. Porovnáno s kontrolou pouze booleanů (nedostatečná), plným SHA všech modelů (zbytečná I/O cena) a parsováním GLB (pozdní, formátově omezené). Zvolen HEAD inventář + fstat + omezený header; malé pointery může ověřit oficiální `git lfs pointer --check --stdin --no-strict`. Cache hry/vzhled/GPU se nemění. Pomocné procesy synchronní a krátké, žádné servery.

## Implementation Notes

Red fáze je výslovně plánovaný test obnovy na izolované větvi; nesmí se vydávat za hotovou funkci. Kód může být záměrně nekompletní, testy musejí vyjadřovat skutečné požadované chování. Koordinátor a implementer mají oddělené writePaths. CLI nepřejímá zámky ani nevybírá další task.

## Spec Change Log

## Review Triage Log

## Verification

- `node --test tests/lfs-assets.test.ts`: cílené lehké fixture testy bez dependencies/GPU.
- Kolizní claim během vlastního claimu: exit1, žádný změněný scope ani source.
- Skutečné GitHub red a green runy; chybový merge request za aktivního rulesetu; zachovaný head/base main.
- Nezávislé read-only review finálního diffu, původní test hash a SHA-vázané přijetí.
