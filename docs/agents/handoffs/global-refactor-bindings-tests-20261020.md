# Předání: global-refactor-bindings-tests-20261020

- Vlastník: `refactor-01a15658-bindings-tests`; příjemce: `refactor-01a15658-audit`.
- Pracovní kopie: `C:/Users/rezac/Documents/GitHub/StrahovCrazyShow/.cache/refactor-20261020`, větev `codex/global-refactor`; HEAD při převzetí `42fa92a823b4e57936bf9fbf8c0bc82f04bdb95a`.
- Výsledek: výslovně přidělený mechanický cleanup dokončen a relevantní kontroly PASS; připraveno k nezávislému převzetí. Žádný staging, commit, task/spec edit ani rekurzivní BMAD.
- Soubory: přesně 15 testů/fixture uvedených v manifestu níže a toto předání. Produkční soubory nebyly tímto taskem změněny.

## Převzetí WIP a podklady

Před prvním zápisem byl znovu načten task JSON včetně upřesněného verification a `_bmad-output/implementation-artifacts/global-refactor-20261020/bindings-tests-transfer.json`. SHA-256 transfer souboru: `42556be73e42972be77574b15f7e55adbf69993605869c90acdeaa7729f80802`.

Přímé předání od `refactor-01a15658-audit` identifikuje příjemce přesně jako `refactor-01a15658-bindings-tests` a uvádí 15 vstupních SHA. Čerstvá kontrola potvrdila všech **15/15 hashů**, shodu s task writePaths a volný rozsah proti sdílenému registru. Následoval úspěšný `claim --task global-refactor-bindings-tests-20261020 --owner refactor-01a15658-bindings-tests --adopt-dirty`; CLI zaznamenalo převzetí právě dvou již dirty cest: `tests/autodev-adapters.test.ts` a `tests/local-benchmarks.test.ts`. Jde o doložené testové payloady z předání autodev-source a simulation-benchmark, nikoli o jejich zahazování nebo nový původ tohoto celého diffu. Ostatních 13 cest odpovídalo přijatému main; cizí WIP mimo scope zůstal nedotčen. Heartbeat byl obnoven před závěrečným zápisem.

Průzkum vycházel ze skutečných importů a použití, dotčených mock těles/forwardingu, shader/lighting fixtures, loop `.entries()` a existujících testů. Importy nebyly odstraněny podle názvu či stáří. Všechny aserce, limity, baseline gzip, provenience, scénáře a produktové exporty zůstaly zachované.

## Volba a přesná změna

Zachovat nepoužité bindingy by ponechalo doložené diagnostiky. Odstranit celé konstrukční výrazy by změnilo scénu, pozorovatele a pořadí; odstranit mock parametry by změnilo pozici/aritu argumentů a případně forwarding. Volba je odstranit jen nepoužitý import/binding, samostatně zachovat inicializaci s vedlejším účinkem a u parametrů použít pouze `_` prefix. U loopu se zachovává `.entries()` a prázdná první pozice destructuringu. Žádné nové helpery/cache/stavy, žádné změny lifecycle nebo alokací konstrukčních objektů; nejde o výkonovou optimalizaci.

- Autodev: odebrán pouze nepoužitý destructured import `executeWorkerInput`.
- Material-defines scenario: původní `const sun = new DirectionalLight(...), hemi = new HemisphericLight(...)` nahrazeno dvěma výrazy `new DirectionalLight(...)` a `new HemisphericLight(...)`, ve stejném pořadí a se stejnými argumenty.
- Game-authored: `[index,count]` → `[,count]` nad původním `[1,0,1,0].entries()`; sloučená deklarace sun/hemi rozdělena na zachované `const sun = new DirectionalLight(...)` a samostatné `new HemisphericLight(...)`. `sun.setEnabled(false)` zůstává následné.
- Opaque-sort: pouze pět nepoužitých bindingů odstraněno; zůstávají v původním pořadí samostatná volání `box("far",60)`, `box("middle",20)`, `box("near",5)` a v dalším scénáři `box("occluder",12)`, `box("middle-occluder",50)`. Ostatní bindingy, například používané far/middle/near v material-first scénáři, zůstaly.
- Nepoužité importy: `GLTFLoaderState`, fs `access`, netcode `FIXED_DT`, night `MeshBuilder`, `PhotoGrassPreparation`, typ `CarLod`, terrain `Actor`, typ `Weather`.
- Locomotion: dva nepoužité první parametry floor callbacků `x` → `_x`; druhý parametr `z` i volání `(x,z)` zachovány. Jiný floor callback, který x používá pro cross-slope, se nezměnil.
- Compilation mocks: tři nepoužité `descriptor` → `_descriptor`, `_compileRawShaderToSpirV` druhý parametr `stage` → `_stage`. `value`, queue `buffers`, receiver, návraty a forwarding zůstaly.
- Frame-lifecycle mocks: `beginRenderPass` `_descriptor`, queue `submit` `_buffers`, `_isOverFrameTime` `_timestamp`. Používané `createCommandEncoder(descriptor)` a `_processFrame(timestamp)` se nezměnily.

## Ověření a neměnné kontrakty

Před/po byl v paměti pořízen AST fingerprint všech 15 převzatých souborů, nezávisle na tracked Git diffu. Kontrola porovnala pořadí a kanonický AST text všech asercí, konstruktorů a `box()` volání. U každé funkce/mocku porovnala počet formálních parametrů a skutečnou JS `.length` odvozenou z AST (bez TS `this`, se zachováním hranice prvního default/rest parametru). Výsledek: **15/15 souborů shodných v těchto kontraktech; 1629 asercí, 441 new/box callů a 1023 funkcí**, žádný rozdíl. Žádný nový test zrcadlící import cleanup nebyl přidán.

Skutečné příkazy 20. 10. 2026, všechny v uvedené pracovní kopii:

1. `node --import tsx --check tests/autodev-adapters.test.ts`: exit 0.
2. `node --import tsx --test --test-name-pattern='adapters retain the established|source identity is invariant|ignored audit detects|stage audit rejects|stage audit canonicalizes|scope guards reject' tests/autodev-adapters.test.ts`: exit 0, **6 PASS / 0 FAIL / 0 SKIP**, 15472.469 ms. Povolený nesandboxovaný běh kvůli vlastním dočasným Git fixtures; stejný požadavek byl doložen už předchozím autodev taskem. Celých předchozích 102 testů se kvůli jedinému nepoužitému importu neopakovalo; jejich samostatné PASS je v předání autodev-source.
3. Následující jeden sériový běh 13 změněných lehkých testových souborů a samostatné sady material-defines order, přibližně 07:49:04–07:50:01 UTC:

   ```text
   node --import tsx --test --test-concurrency=1 tests/game-authored-light-preparation.test.ts tests/gltf-light-budget.test.ts tests/local-benchmarks.test.ts tests/locomotion-quality.test.ts tests/netcode.test.ts tests/night-lighting.test.ts tests/opaque-sort.test.ts tests/photo-grass-preparation.test.ts tests/realistic-car-pack.test.ts tests/terrain-patch.test.ts tests/weather.test.ts tests/webgpu-compilation-profile.test.ts tests/webgpu-frame-lifecycle-profile.test.ts tests/material-defines-wgsl-order.test.ts
   ```

   Exit 0, **166 PASS / 0 FAIL / 0 SKIP**, **57111.987 ms**. Původní subprocess fixtures běžely po sobě; aserce a limity beze změny. Zachován také explicitní test známého nepodporovaného order-sensitive shader procesoru. Kompaktní koncový stdout:

   ```text
   tests 166
   suites 0
   pass 166
   fail 0
   cancelled 0
   skipped 0
   todo 0
   duration_ms 57111.987
   ```

4. `git diff --check` nad přidělenými testovými cestami: exit 0. `PROOF_RUN` a `DEFINE_ORDER_REPORT` nebyly nastavené; testy nezapsaly volitelné reporty mimo rezervovaný scope.

## Manifest výsledku

Následující pořadí je shodné s transferem. SHA-256 `JSON.stringify` pole objektů `{path,sha256}`: **`57319849352dff480ef2870e7afce82193908455497693adbf945c5aeca92eb1`**. Zahrnuty jsou také oba dříve předané testové payloady; tento vlastní sebereferenční handoff je mimo manifest. Jejich vstupní hashe nadále určuje přesný transfer, nikoli samotný dirty Git strom.

| Soubor | SHA-256 výsledku |
| --- | --- |
| tests/autodev-adapters.test.ts | d55ddc154556975a350b361915ce3f33c513899b815c6cd5d68379c76f1cc681 |
| tests/fixtures/material-defines-order/scenario.ts | 8b3c9a6c948e7cc6d4c91428a68a73eefc37d6f1f80bbfdeea81ad529c82f4a8 |
| tests/game-authored-light-preparation.test.ts | c8c7607cc8173b5f09792ae9e7eed6ee9b8edefdd0a11b859b410853b058fcc3 |
| tests/gltf-light-budget.test.ts | b14598b1dc236ef56c81380a4eb64c7c14cb2c8dd1999949749cc6d1ea862d8a |
| tests/local-benchmarks.test.ts | 242c1f18dc6edbdd8d4ab76be0ad68330b19d7137c4a9020ed105143a77c06a1 |
| tests/locomotion-quality.test.ts | 29ec0df27c4cc73d1c4c9167878f2b27af4a8492ecda932e96805c4f8921659e |
| tests/netcode.test.ts | a3910d3d10c37dc54474c7a05a5dc6842b4cf534ac017dcd404d2a1c1bfe1420 |
| tests/night-lighting.test.ts | ee29ede898088874214dd25b3e5b95aed77d184668423f9cbd9434f62ae43aed |
| tests/opaque-sort.test.ts | 16bb5d44b73abfe69e7d23f5ed89637105e2d7668a7577c515a8f77665640858 |
| tests/photo-grass-preparation.test.ts | cd2d5f6e8c9cb769a1d157fa304697b302ebcbf8f8d6a5f01134161d9e650cd8 |
| tests/realistic-car-pack.test.ts | d5524d50e6c6cbb6146eaab1e4c13949227dd5acab1ffe407e039cd0267f2745 |
| tests/terrain-patch.test.ts | b257c9c5a9186b9050263a752435989a9dc6003f2cb21cbbff0abb7c588f1a8c |
| tests/weather.test.ts | e376e788fb559069cd3b3aff1545caa935d24c2b1b01b1374dbca914ed16b39e |
| tests/webgpu-compilation-profile.test.ts | 37dee1917e37568506137c00777a5d9690eb678b259576f7b4db603784bbb940 |
| tests/webgpu-frame-lifecycle-profile.test.ts | 4903760530ceeff8096ae6de8e34ae691a3db7d1c6ed3e79f275269ea75693a0 |

## Procesy, limity a předání

Oba vlastní Node test runnery i jejich řízené subprocessy skončily. Lokální HTTP a temp file fixtures použily původní `t.after` cleanup, žádná vlastní služba/port nezůstává. Žádný browser/GPU/Blender/build/integrace ani plná repo sada neběžely. NullEngine a nativní CPU zpracování WGSL nejsou GPU/FPS důkaz.

Příjemce převezme výsledek jako mechanickou vrstvu nad výslovně předanými testovými payloady, ověří konkrétní diff/manifest a zajišťuje společný CI checkpoint, evidenci a samostatný commit/integraci. Stav tasku tento podagent nemění. Po doručení následuje standardní CLI release, jeho skutečný čas/výsledek potvrdí závěrečná zpráva a společný registr; potom již do scope nebudou další zápisy.
