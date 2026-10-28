# Předání: jantar-startup-20261028-game

- Vlastník: `jantar-startup-game-01a17fd8` (`/root/map_assets`); příjemce: koordinátor `/root`, relace `01a17fd8-017a-7852-87f9-cd1538e1bde2`.
- Cwd `C:/Users/rezac/.codex/worktrees/jantar-home/StrahovCrazyShow`, větev `codex/jantar-home`, baseline `0d957a1ba0f53baeeef894b13791da857663d6fe`.
- Výsledek: připravená opt-in diagnostika skutečného Game startupu s implementací, refaktoringem a cílenými CPU důkazy. Není to oprava příčiny timeoutu ani přijetí hry. Žádný commit/staging.
- Vlastní změněné soubory: `client/game.ts`, `tests/game-authored-light-preparation.test.ts`, `tests/game-light-preparation.test.ts`, toto předání a `.cache/jantar-startup-game-20261028/`.
- Cizí WIP: SPEC/research a evidence patří rodiči; `client/light-preparation.ts` a `tests/light-preparation.test.ts` zapisuje `/root/audit_home_integration`. Jeho helper API bylo výslovně potvrzeno koordinátorem před zapojením. Ostatní tree tasky/handoffy z aktuálního dirty stromu nebyly upraveny ani převzaty.

## Podklady a rozhodnutí

Načteny aktuální AGENTS, BMAD policy, task JSON, `startup-timeout/SPEC.md` a `research.md`, skutečná Game cesta a původní testy. Přímé implementační zadání dítěti nespouští další BMAD. Čtecí audit před implementací doložil, že běžný multiplayer neměl poslední gate a nový focused timeout skutečně postupuje stage řetězcem; příčina není potvrzený nekonečný restart.

Zvoleno pozorování pouze již vyhodnocených výsledků `check/effectsReady`. Nové sondy by mohly posouvat kompilaci; náhradní readiness algoritmus, cache mutace, vyšší deadline či vynechání variant byly zamítnuty. Collector zůstává lokálně v `prepareLightingVariants`, bez nového helper souboru nebo veřejného API.

Po dohodě s rodičem se cache v této fázi vůbec nečte: raw stav by bez skutečného výsledku nedokazoval konkrétní blocker a obecné odmítnutí Proxy bez provedení jeho trapu není v browseru spolehlivý kontrakt. Nečtou se nové mesh/material data fields, jména, metadata ani metody. Vzorky popisují skutečnou neúspěšnou kontrolu a anonymní lokální pořadí, nikoli konkrétní nehotový Effect.

## Implementace a privacy

- Zapnutí přes existující `environmentProfile` (jeho factory povoluje jen explicitní jednoznačné `profileEnvironment=1` na loopbacku) a `sessionDiagnostics.isRecording`. Default, vzdálený hostname, chybějící recorder i duplicitní query zůstávají bez nových detailů.
- Původní `terrainReview && !network` named QA zůstává v samostatné větvi včetně původních názvů omezených na 120 znaků. Chybné legacy getter hodnoty nyní mohou vynechat label, nikoli změnit výsledek readiness kontroly na výjimku.
- Nový anonymní snapshot obsahuje pouze pevné gate/stage kategorie, quality z whitelistu, `ready:false`, lokální mesh ordinal a omezené počty. `mesh` a `material` zůstávají null. Žádné hráčské/session identity, názvy, pozice, URL, metadata či pakety.
- Uchovává se nejvýše posledních 8 vzorků; sousední shodná čekání se sloučí. `replacedSamples` pravdivě zaznamenává ořez. Čítače saturují na 1 000 000 s příznakem `capped`.
- WeakMap má nejvýše 4096 přidělených ordinalů na stage, při nové stage se nahrazuje a při settle se zahodí. Další objekty dostanou null ordinal a zvyšují omezený `droppedMeshOrdinals`; opakovaná čekání nevytvářejí silné reference na renderer objekty. Snapshot obsahuje pouze vlastní plain data.
- `Game.start` ponechává původní pipeline snapshot pouze named offline QA. Samotné nové multiplayerové zapnutí trackeru proto nezpřístupní dosud skrytý pipeline payload ani nevolá jeho snapshot navíc.
- Schválené `diagnostics: anonymous` zapíná helperovy číselné queue/retry/yield/pre-post-draw counters. Vypnutá diagnostika nemá `stage.readiness`; zachovává se skutečný helper boolean i počet/pořadí jeho volání.

Readiness, camera pass, varianty, batch/deadline budgety, health, finální submitted-frame gate, restore a multiplayer se nemění. Žádný nový render, compile, readiness probe, timer nebo listener. Další opt-in náklad tvoří bounded scalar kopie a WeakMap pro skutečně vrácené false výsledky; výkonový dopad ani GPU výkon nebyl měřen.

## Cílený refaktoring

Jeden saturovaný increment obsluhuje počty; meze jsou lokální pojmenované konstanty. Named a anonymní větev se oddělují před jakýmkoli čtením labelů. Ordinal lifecycle je navázaný na původní přechod stage a původní Promise finally, bez nového cleanup vlastníka. Testovací prostředí obou existujících VM fixtures dostalo pouze sessionDiagnostics seam; ostatní původní asserty zůstaly.

## Ověření

Pouze přímý příkaz:

`node --import tsx --test tests/game-authored-light-preparation.test.ts tests/game-light-preparation.test.ts`

- První implementace: 38/38, exit 0; `.cache/jantar-startup-game-20261028/tests-01.log`.
- Po doplnění hidden/lifecycle regrese: 39/39, exit 0; `tests-final.log`.
- Finální kód po sjednocení konstant a zahazování WeakMap při settle: 39/39, exit 0, 5062,8573 ms dne 28. 10. 2026; `tests-02.log`.
- `git diff --check -- client/game.ts tests/game-authored-light-preparation.test.ts tests/game-light-preparation.test.ts`: exit 0.

Nové skutečné Game regrese ověřují opt-in/remote/default/recording gating, nepřátelské name/material/metadata/identity gettery, nečtení cache accessorů, max 8 vzorků, saturaci, 4100 různých meshes a reset budgetu na další stage. Porovnávají přesné check/effect/draw sekvence a základní výsledky opt-in/off při complete, timeout, dispose a původní výjimce. Hidden událost pozastaví práci/deadline stejně v obou režimech a původní timer/visibility observer se uklidí. Test z pravého `Game.start` AST initializeru ověřuje hranici pipeline payloadu pro offline versus network. Původní named QA, materiálové factory/cache důkazy, torch/street varianty, restore a retirement testy zůstaly zelené.

Neproběhl package manager, install, global TypeScript, full suite, build, server, browser ani GPU. NullEngine/CPU a řízené scheduler seamy nejsou důkaz pixelů, GPU rychlosti nebo odstranění původního timeoutu. Praktický produkční Edge záznam provede koordinátor v samostatném kandidátu.

## Identita diffu a výsledku

Diff obsahuje pouze vlastní tři source/test soubory; `client/game.ts` +66/-9, authored test +1/-1, light test +199/-4. Včetně testů je uložen v `.cache/jantar-startup-game-20261028/source.diff`.

| Soubor | SHA-256 |
| --- | --- |
| `client/game.ts` | `266922aa2d87f60cc2d77d3fc1acf0146245f9e6442d05ac1318ceb7ab9d3781` |
| `tests/game-authored-light-preparation.test.ts` | `12e2cc169f37b44d71c01903966ae427be154cf946ae6c5a660b0c0389914bfe` |
| `tests/game-light-preparation.test.ts` | `8c6a40e32aa96e06fabfe528f226916ad691e869cf93c083dbae06e924f73bb6` |
| `source.diff` | `cdc1f230ca36a2f925be28a9455e43bf64ea6305b2ae853b218bf4344d26ad4c` |
| `tests-02.log` | `2cc04b4750a9b3b5a73f3ae284f0021e79713128e8437f563f6666bab82851c4` |

## Procesy, zdroje a převzetí

Vlastní testovací procesy skončily s exit 0. Žádný dlouhodobý helper, port či GPU resource nezůstává. Chráněné 4278/4280, jejich dependencies ani běžící herní karty nebyly otevřeny nebo změněny.

Po tomto předání se uvolňuje claim `jantar-startup-20261028-game`; skutečné potvrzení release/čas následuje v závěrečné zprávě. Uvolnění není Done. Rodič integruje konkrétní diff se schváleným helperem, doplní Linear/centrální evidenci, stabilní kontroly a nový skutečný multiplayerový důkaz.
