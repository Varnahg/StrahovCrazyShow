# Předání: webgpu-define-order-native-20261018

- Vlastník `webgpu-define-order-native-01a14497`; příjemce root. WT `C:/Users/rezac/.codex/worktrees/webgpu-comparison/StrahovCrazyShow`, větev `codex/webgpu-migration`, výchozí commit `d75110430d151b67088cd47f69e825236eace7c4`.
- Výsledek: přenesený sedmisouborový vendor/testový celek, cíleně ověřený v nové vlastní source closure nad frozen QA dependencies. Bez commitu, instalace, GPU nebo přijetí celé migrace. Game/QA15stage overlay/default renderer se nepřenášejí.
- Vstup: QA manifest `37b2d5e1c31f62d4f4d0cdebaaf3063cd1ad8f3e64156ddf58a2a99563fbb228`, jediný QA library runtime `MaterialDefines.js` SHA `43a75f4ae32d48c9f23a815f8f2996e895ce3e8d3574f4a04504ee00444916f4`. Žádné nové runtime rozhodnutí nebo hunk oproti schválenému QA kandidátu.
- Cizí WIP při převzetí: rootův QA task/handoff a nový native task. Nic z toho nebylo editováno. Vlastní rezervace předcházela prvnímu zápisu; původní V4/V5/V6/proof/dependency výstupy jsou zachované.

## Přesné změny

1. `patches/@babylonjs__core@9.30.0.patch`: preimage `0811815a615a8e501c4542ee2fa38fcc5fdd1a4394fbc610cb0aa5a0ae62c578`, output `21114f6048abdcba932a8640adf1a97b6281939d99ae6d53fbfe96ef76bf0503`, byte-identický QA patch. Původních 9813 B patch je zachováno.
2. `pnpm-lock.yaml`: preimage `54bae00191e01af417fffb8f243917dd299987c614121c09840475ed2b1b9ca8`, output `03d4edcd8f9d92fa7b6b320f5600709dd62612a5bad7867cef61875e7ecd8b53`, byte-identický QA lock se šesti hash substitucemi.
3. `tests/material-defines-serialization.test.ts`: byte-identický QA test.
4. `tests/material-defines-wgsl-order.test.ts`: jedinou funkční adaptací je bounded gzip loader přes `import.meta.url`, ověření rozbalené délky/SHA před JSON.parse. Žádné rozbalování na disk.
5. `tests/fixtures/material-defines-order/scenario.ts`: byte-identický ověřený QA fixture, žádný druhý canonicalizer/prototype wrapper.
6. `tests/fixtures/material-defines-order/baseline.json.gz`: pouze jiné balení původního JSON, žádná regenerace hodnot.
7. `tests/fixtures/material-defines-order/provenance.json`: gzip/compressed/uncompressed data a platné repository odkazy do `hitches-v18`, včetně původního mirrored RED.

`tests/inactive-light-defines-helper.test.ts` zůstává původní native soubor bez změny; dvě historické path assertions již neměl. Game, light-preparation, render-engine, package.json a pracovní node_modules jsou chráněné pre/post hashy. Žádný asset v native stromu nebyl zapsán nebo regenerován. Vlastní cache kopie tří existujících automobilových GLB sloužila pouze původní related regresi.

## Fixture a cílený refaktoring

Baseline: 9 709 634 B → gzip 1 370 891 B. Komprimovaný SHA `68cda48595cfa73bd7b1561ff5d4fbc47590d4ddcc46226f14d8221f67466858`; původní rozbalený SHA `355ec327227af96c64c83c354636894d0ba3e5128913d95c9716900294a4896f`. Gzip nemá filename/timestamp metadata; roundtrip je byte-exact. `maxOutputLength:9709634` a dvě integrity assertions chrání vstup testu; kontrola o jeden byte menšího limitu prokazatelně odmítne výstup. Původní plaintext baseline do native stromu nevzniká.

AST kontrola zachování assertions: serializer 34→34, WGSL test 17→19, všechny původní assertions ve stejném pořadí; navíc pouze délka/SHA rozbalené fixture. Všechen actual shader/material/plugin/instance/binding/cleanup fixture kód je beze změny. Změna nemá herní IO ani další runtime cache/observables.

## Ověření

- `node verify-transfer.mjs`: gzip roundtrip, exact assertions, byte-identický scenario, všechny preimages/output a chráněné cesty PASS; `transfer-integrity.json`.
- `TSX_DISABLE_CACHE=1 node --import tsx --test --test-concurrency=1 tests/material-defines-serialization.test.ts tests/material-defines-wgsl-order.test.ts` ve vlastní `candidate`: **18/18 PASS**, exit 0, UTC 06:21:19.071–06:21:23.278; `targeted.log` / `targeted-run.json`.
- Celých 14 souvisejících native testových souborů, bez skipu: **103/103 PASS**, exit 0, UTC 06:21:23.386–06:21:50.365; `related.log` / `related-run.json`. Zahrnuje původní inactive-light, ownership/exposure/shadow/sky/budget/stable a WGSL surface/avatar-car/vegetation regrese i actual GLB loader identity.
- `node types.mjs`: scoped TypeScript **3169 files / 0 errors**, exit 0; `scoped-types.log`.
- Validační closure: 105 hashovaných native input/output souborů, vlastní cache node_modules junction pouze na frozen `define-order-qa-20261018/dependencies/node_modules`. Jedna fyzická core/loaders identita; nic se neinstalovalo do WT/main. QA runtime a dependency manifest zůstávají shodné.
- `git diff --check` patch/lock PASS. Plný native test/build/integration a WebGPU/WebGL smoke provede root nad stabilním checkpointem; zde nebyly spuštěny.

## Rozhodnutí a limity

Výzkum i varianty jsou v přijatém QA proofu a projektové BMAD evidenci. Tento přenos zachovává bounded whole-block literal serializer po původním čtení; nemění _keys/rebuild/clone/equality ani Effect cache. Guard má zachovaný celý fallback, 32768 znaků / 1024 defines a přesný spelling. Nejde o nový obecný parser nebo WebGPU-only klíč.

Global MaterialDefines patch působí také na WebGL. Kontrakt je omezený na aktuálně ověřené projektové default processor/plugin cesty. Order-sensitive custom hook je prokázaný nepodporovaný případ; syntax guard ho nerozpozná. Původní mirrored baseline RED zůstává otevřený a pozitivní related car test jej nenahrazuje. CPU/WGSL/NullEngine není driver/obrazový důkaz.

Root před přenosem ohlásil QA V6 plnou sadu 1402/1402/build/integraci a dílčí zlepšení outward/exit. Tyto výsledky se nepřipisují nativní hře bez QA15stage overlay. První F a zbylý exit mají v QA nadále přibližně 317/928 ms a rychlejší startup není prokázaný. Celkový cíl, steady FPS a úplná přejímka zůstávají otevřené.

## Předání a procesy

`.cache/webgpu-migration-checks/define-order-native-20261018/manifest.json` má přesných sedm souborů, preimages, výstupy, source/dependency/test hashy, gzip provenance a handoff. `owned.diff` obsahuje pouze tento celek; binární gzip je identifikovaný délkou/SHA. Všechny vlastní Node procesy skončily, žádná služba/port/GPU scéna nevznikla. Po předání release bez commitu. Root provede review, plnou native pipeline/smoke a teprve potom samostatný commit/main/Linear; stav tasku mění integrátor.


## Přijetí integrátorem18.10.2026

Root po doloženém handoff/release převzal rezervaci přes adopt-dirty. Přenos zkontrolován nezávislým čtecím review bez blokujících nálezů. Native snapshot2a3dba44ea28dbeffa5324fe22c35011b1e333c4233bb99ed487ee7e057d3584 prošel1330/1330noskip/fullTS/build/isolatedintegration. Oba Edge backendy skutečně vykreslily scénu, Golden/F a návratdo menu bezhealtherrors. Výkonovýsmoke nativeF6,265s aWebGL1,4146s je nepřijat; QAcoverage se nepřenáší. [Evidence](../../performance/evidence/webgpu-migration-20261016/hitches-v20/README.md) uchovává původníleafhandoff/hash, rawdata, logy, limity a integračníreceipt.

Runtime c18844f2264dd773269406346e62318d0dee3338 → main7eb777763c9cbf1b090d672d755d12d0a59a987d, přesně7files,132dalšíchcestbezezměny. Own4194/2589servicesidentity-stopped,kartaaboutblank. Taskdone znamená tuto komponentu, nikoli KEY31/celoumigraci.
