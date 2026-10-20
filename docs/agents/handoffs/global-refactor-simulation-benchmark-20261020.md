# Předání: global-refactor-simulation-benchmark-20261020

- Vlastník: `refactor-01a15658-simulation-benchmark`; příjemce: `refactor-01a15658-audit`.
- Pracovní kopie: `C:/Users/rezac/Documents/GitHub/StrahovCrazyShow/.cache/refactor-20261020`, větev `codex/global-refactor`.
- Výchozí commit/claim: `53d608113b6e8dbafaebf6fd6a0e4661b1f8f806`.
- Výsledek: implementace, cílený refaktoring a ověření dokončené; připravené k review a samostatnému integračnímu commitu. Přijetí KEY-48 tím není uzavřené.
- Změněné soubory: `shared/simulation.ts`, `shared/local-benchmark.ts`, `tests/local-benchmarks.test.ts` a tento handoff.

## Vlastnictví a podklady

Navazující task byl znovu ověřen proti živému `claims.json`, `agent-tasks status`, aktuálnímu task JSON, maintenance spec, `git status --short` a HEAD. Nový scope byl čistý a bez kolizí; claim získán bez `--adopt-dirty`. `shared/simulation.ts` je v tomto tasku výslovně rezervovaný integrační bod. Do předaného avatar scope ani dalších cizích změn se znovu nezapisovalo. Žádné staging/commity ani spec/task změny.

Použity projektové AGENTS, mapa architektury, koordinační README, current-work, BMAD policy, šablona handoffu a průzkum `docs/refactoring/20261020/README.md` načtené v této relaci. Rekurzivní BMAD nebyl spuštěn. Primární technické podklady z 20. 10. 2026: skutečné zdroje obou modulů a jejich volajících, `shared/types.ts`, `shared/netcode.ts`, `shared/input-timeline.ts`, sedm taskových testů a lokální oficiální bindingy/deklarace `@dimforge/rapier3d-compat` verze `0.21.0`.

Výchozí cizí WIP zahrnoval předané avatar/quaternion změny, světový renderer, dokumentaci, autodev a koordinační/BMAD podklady. Nebyl převzat ani upraven. Koordinátor mezitím integroval další celky; HEAD při vytvoření manifestu byl `42fa92a823b4e57936bf9fbf8c0bc82f04bdb95a`. Diferenciální oracle i zde uvedený task diff jsou výslovně vůči původnímu `53d60811`, nikoli vůči měnícímu se HEAD.

## Průzkum, varianty a provedení

### Actor.step

`vehicle` je běžné boolean pole. `speed` setter zapisuje pouze `footSpeed`, `yaw` setter pouze `footYaw`. Getter `position` v pěší větvi vrací Rapier `body.translation()`. Jediné dva dotčené Rapier predikáty čtou collider handle a `Set.has`; žádný nevstupuje do `setVehicle`, `restore` ani `resetOnFoot`. `computedMovement` a `computedGrounded` vracejí výsledky posledního synchronního sweepu. `setNextKinematicTranslation` je před koncovou kontrolou pádu. `groundHeight` neodkazuje na Actor a koncový `setPosition` je až za posledním odstraňovaným guardem.

Server předává běžný objekt z `timelineStep`/kanonizace; klient vytváří `canonicalInput` a ukládá/replayuje jeho plain kopie. Změny módu jsou v synchronně oddělených UI/server/recovery/restore cestách. Mezi počátečním `if (this.vehicle)` a třemi redundantními podmínkami není v produkčním řetězci callback nebo accessor přepínající vozidlo.

Porovnání variant:

| Varianta | Dopad | Rozhodnutí |
| --- | --- | --- |
| Ponechat else a opakované guardy | Zbytečné zanoření po bezpodmínečném return a trojí zdání změny režimu uvnitř pěšího kroku | Nevybráno |
| Přímá pěší větev po return | Nejmenší změna, stejné výrazy a pořadí volání, žádné nové API ani stav | Vybráno |
| Nová stepOnFoot/strategy či snapshot režimu | Přidává rozhraní/parametry a dělí soudržný krok bez dalšího doloženého přínosu | Nevybráno |

Odstraněno pouze `else` po návratu, počáteční nulové inicializace dx/dz a doložené `!this.vehicle` u jump/speed/ground ray. `dx` a `dz` jsou přímé const: vyhodnocení zůstává n → run/speed → input.x/dx → input.z/dz → speed setter → yaw → grounded/jump → gravitace → compute movement → computed delta/position → speed → grounded → podpůrný ray → korekce → kinematic translation → případná obnova. Automobilová větev je beze změny. Mimo tělo `Actor.step` byl celý zdroj porovnán jako bajtově shodný s baseline.

### Projekce benchmarku

Klient synchronně promítá mutable čítače před první HTTP prodlevou. Server provádí stejnou projekci z JSON znovu před zápisem souboru. Kontrakt zahrnuje whitelist, pořadí čtení/validací, hlášky, nullable pole, volitelné bloky podle truthiness a pořadí klíčů výsledného JSON.

Porovnání variant:

| Varianta | Dopad | Rozhodnutí |
| --- | --- | --- |
| Ponechat dlouhou monolitickou funkci | Stejné chování, ale smíchaná odpovědnost tří velkých diagnostických bloků | Nevybráno |
| Privátní projectGpu/projectSceneView/projectRenderCost ve stejném modulu | Přesné přesunutí soudržných bloků, bez importů/API/frameworku; hlavní pořadí zůstává čitelné | Vybráno |
| Nové soubory nebo obecné schéma | Rozšíření rozsahu, nové závislosti/vrstva a vyšší riziko jiných validací či pořadí | Nevybráno |
| Hoist whitelistů/cache/helperů jako optimalizace | Mění životnost dat bez doložené potřeby a profilu | Nevybráno |

Tři helpery pouze vracejí vlastní projektovaný objekt. Hlavní funkce je volá na původním místě; guardy zůstávají stejné. `dimensions`, sample-count a matrix validace mají původní rozsah a pravidla. Whitelist renderCost vzniká stále jen při projekci tohoto bloku. Žádný nový cache nebo persistentní stav, asynchronní krok či veřejný export. Parametry/veřejná deklarace `projectLocalBenchmark` jsou shodné. Netvrdí se zrychlení ani FPS přínos.

## Ověření a původní selhání

Vše 20. 10. 2026 v uvedeném cwd; samostatné příkazy běžely postupně. Výstupy jsou v tool transcriptu a shrnuté zde, další log soubor mimo scope nevznikl.

1. **Původní přesný task příkaz**, přibližně 07:11 UTC, exit **1**, 28 679 ms:

```text
node --import tsx --test tests/physics.test.ts tests/terrain.test.ts tests/prediction-replay.test.ts tests/timeline-physics.test.ts tests/recovery-physics.test.ts tests/controls.test.ts tests/local-benchmarks.test.ts
```

Výsledek **34 PASS / 6 FAIL**. Všech 32 fyzikálních/řízení/terénních/replay testů a dva přímé benchmark testy prošly. Šest HTTP fixture selhalo před implementací výhradně na `TypeError: fetch failed`, příčina `connect EACCES 127.0.0.1:<ephemeral-port>` (51427, 51429, 51432, 51434, 51436, 51438). Selhání není přepsané úspěšným opakováním.

2. **Ověření příčiny sandboxu**, stále před implementací: `node --import tsx --test tests/local-benchmarks.test.ts` s loopback přístupem mimo sandboxové omezení, exit **0**, **8 PASS / 0 FAIL**, 884 ms. Žádný kód/test/limit se kvůli odmítnutému spojení neměnil.

3. **Nové kontraktní testy před implementací**: `node --import tsx --test --test-name-pattern="projection preserves diagnostic|projection reports the original" tests/local-benchmarks.test.ts`, exit **0**, **2 PASS**, 454 ms. Tím bylo doloženo, že nová očekávání pocházejí z původního chování.

4. **Lehká kontrola po extrakci**: stejný test soubor s patternem `projection preserves diagnostic|projection reports the original|local CPU|virtual camera`, exit **0**, **4 PASS**, 471 ms.

5. **Finální taskové testy**, sériově dle zadání a s loopback přístupem, přibližně 07:19–07:21 UTC, exit **0**, **42 PASS / 0 FAIL**, 78 849 ms:

```text
node --import tsx --test --test-concurrency=1 tests/physics.test.ts tests/terrain.test.ts tests/prediction-replay.test.ts tests/timeline-physics.test.ts tests/recovery-physics.test.ts tests/controls.test.ts tests/local-benchmarks.test.ts
```

Ověřeny skutečné Rapier pohyb/kolize/schody/terén, vstupy a projekce A/D, recovery, replay, zpožděný jump/timeline i HTTP zápis/whitelist/cleanup. Doba běhu není výkonové srovnání: výchozí příkaz měl souběh souborů, finální byl sériový.

Nové testy vyplňují skutečné mezery: pořadí kořenových a vnořených klíčů, nullable GPU/frame hodnoty, explicitní přítomnost oproti truthiness guardu a přesné první chybové hlášky při více vadných blocích. Nezavádějí kopii algoritmu jako oracle.

### Diferenciální důkaz ze skutečného původního kódu

Oba jednorázové `node --input-type=module` běhy načetly originál přímo přes `git show 53d608113b6e8dbafaebf6fd6a0e4661b1f8f806:<path>`, provedly AST výběr/transpilaci a spustily původní i nový produkční kód samostatně ve VM. Žádná ručně přepsaná původní funkce. Oba příkazy exit **0**.

- **Benchmark:** 199 cest plné platné fixture, 17 variant hodnot v každé cestě (undefined/null/booleany, signed zero, záporné, zlomkové, NaN/nekonečné, texty, objekty a pole), celé neplatné kořeny, obrácené pořadí vstupních klíčů a páry chyb. **3 460 vstupů**, z toho **795 přijatých / 2 665 odmítnutých**, **66 kombinací současných chyb**, **77 trace kontrol čtení getterů**. Porovnání deep hodnot včetně signed zero, přesné JSON serializace/pořadí klíčů, error name/message a pořadí čtení vstupů: **0 rozdílů**.
- **Actor:** skutečná původní i nová třída s řízenými synchronními bindingy/predikáty. **2 560 pěších + 16 automobilových scénářů**: klid/pohyb/diagonála/normalizace, run, jump, grounded, kladná/záporná vertikála, default a různé dt včetně nuly, podpora bez nálezu/plochá/blízká/vzdálená/šikmá/cizí a pád pod terén. **0 rozdílů** v pořadí čtení vstupů, controller/ray/kinematic/recovery voláních a argumentech i výsledném stavu. To je trace důkaz; skutečný Rapier ověřuje výše uvedená tasková sada.

`git diff --check` pro všechny tři změněné zdroje/testy: exit **0**, bez výstupu.

## Identita předání

Manifest vytvořen `2026-10-20T07:21:50.671Z`, zahrnuje testy. Je to identita tohoto disjunktního tasku, nikoli celého souběžně měněného checkoutu. Tento handoff se do vlastního manifestu nezahrnuje.

| Soubor | SHA-256 |
| --- | --- |
| `shared/local-benchmark.ts` | `4f0a4b61ca5293109f1e8ab00cd9ba6198bd48a38a4334246fd24ead3a903ea8` |
| `shared/simulation.ts` | `3ce273b85b99c9fa7014482a1822d15476aecd40ef841687004f3fe2cfe69c88` |
| `tests/local-benchmarks.test.ts` | `0127fd4a884d87470be7382b0df9b4fc8df0dfac3c847700c3f285f4957b0e96` |

Manifest SHA-256: `7be604a980b530432fd860f054f1ff80b6ce831376a15f5b74b3def67aaf7c36`. Payload: řádky v pořadí tabulky, každý `path + NUL + sha256`, spojení LF bez posledního LF.

SHA-256 přesných bajtů `git diff --binary 53d608113b6e8dbafaebf6fd6a0e4661b1f8f806 -- shared/local-benchmark.ts shared/simulation.ts tests/local-benchmarks.test.ts`: `c52e0a534cc6c525aef7e50709b4a877fdeeaa91a99f10986c70c45c370225fc`.

Originální zdroj benchmarku SHA-256: `1cb5f0217e7d25df9ad03d057383124b219546fc7e312a80e00437b9ddff8178`; simulation SHA-256: `11f6016a254b33b7b042ee1c225027b78c1b17b5913753c42d065ee8162d9ea5`.

## Procesy, omezení a další krok

Všechny vlastní testy/VM/CLI procesy doběhly. HTTP fixture vlastnily pouze dočasné loopback listenery a vlastní temp adresáře, které jejich cleanup uzavřel/odstranil. Žádný vlastní server, rezervovaný pevný port, preview, Blender ani GPU scéna nebyly spuštěny nebo ponechány. Žádný cizí proces nebyl ukončen.

Plná sada, build, izolovaná integrace a praktická produkční přejímka nebyly spuštěny: patří koordinátorovi pod samostatnou rezervací. CPU/NullEngine/trace důkazy nejsou měření GPU nebo FPS. Nepřidávaly se žádné zdroje `heavy-validation`, `gpu` ani `workspace-build`.

Po předání tohoto souboru se vlastní claim uvolní; výsledek release a čas dostane koordinátor v závěrečné zprávě. Release není stav Done. Integrátor `refactor-01a15658-audit` přebírá kontrolu diffu/manifestu, review, samostatný commit, společné ověření, Linear, `docs/verification.md` a případnou změnu stavu tasku.
