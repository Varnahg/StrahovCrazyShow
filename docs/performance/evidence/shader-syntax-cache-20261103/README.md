# Bounded syntax cache: CPU candidate v4

3. 11. 2026. **V4 je nainstalovaný a ověřený jako opt-in experiment, pro výchozí zapnutí nebyl přijat a zůstává OFF.** [Závěrečná C9 série](final-campaign.md) má pouze1 úspěšný ON start ze2. Delší CPU páry ukázaly medián20.22 % úspory v prvním sweepu24 unikátních Effectů; cache není přijatá jako zlepšení FPS nebo celé hry. Neúspěšné first-use varianty i odlehlé výsledky zůstávají v evidenci. Následující CPU kapitoly zachovávají původní autorův checkpoint.

## Změna a původ

Kanonický `patches/@babylonjs__core@9.30.0.patch` zachovává **původních30176 bajtů byte-identicky** (SHA-256 `965f9774f8fd436bcd699d6f54c0a1b64a318f554bb261a85aa9189828f55c49`). Přidává pouze `Engines/Processors/shaderProcessor.js` a `.d.ts`, package verze zůstává9.30.0. Současný patch SHA-256:

```text
f97540a6800fc9b9c582cc5390fe9b03d8795f942944ae6b5ed3c58f4faf79ee
```

Přesný původní processor JS je `44287130f5bfd1b25918e7f1e747cd0094a3f9dd279167cd1761011d46f36bc7`; v4 JS `ab2d61fcb168f8c8540c3a3c558edeed5bfedef65c05a1efb4131204d3acee60`; v4 deklarace `41ed6e8e31a218e386b4342f84a35cff004d1dfb3bb3561598a47dff84bc38fb`. Varianty se testovaly jako jednotlivé staged dependency moduly s importy na totožné připnuté helpery, bez kopie projektu.

Klíč je přesný primitivní `preparedSourceCode` na hranici EvaluatePreProcessors, po includes, afterIncludes a preProcessor. Každá varianta vždy znovu provede původní `root.process` s aktuálními dictionaries/options/context. Nesdílí se hotové WGSL, binding context, výsledky podmínek, Effect, Scene ani GPU objekty. Vertex+fragment nadále zůstávají jednou synchronní processing jednotkou. Nonprimitive prepared input zachovává nativní parse cestu bez cache.

## API a admission

Deep import z `@babylonjs/core/Engines/Processors/shaderProcessor` nabízí interní:

```ts
CreateShaderSyntaxCache(processor, options?)
// lease: setEnabled(boolean), reset(), snapshot(), dispose()
```

Výchozí `enabled=false`. Jeden vlastník na konkrétní processor, uložený přes WeakMap. `dispose()` je idempotentní, uvolní reference a zanechá čitelný finální primitive snapshot; reset/setEnabled po dispose vyhodí chybu. `reset()` vyčistí obsah/čítače a zvýší generaci. Vypnutí vyčistí obsah, zachová historické čítače a rovněž změní generaci.

Výchozí limity:16 entries,2097152 účtovaných UTF-16 units,32768 nodes,8192 operators. Validované maximální konfigurační meze jsou64/8388608/131072/32768. **Jeden Map/LRU a tytéž entry/text budgets obsluhují všechny druhy položek:**

- První výskyt: native unfrozen parse+walk, uchová se pouze probation klíč.
- Druhý výskyt téhož aktuálního probation entry: opět native parse, bounded census/freeze známých node/operator tvarů, potom promotion na resident AST.
- Resident hit: pouze syntax se znovu použije; aktuální variantní walk zůstává.
- Prokázaný oversized/unsupported strom: bounded bypass marker uchovává jen klíč/druh. Další request stále parsuje a provede walk, ale neopakuje census/freezing. Klíč větší než text budget se vůbec neuchovává.

`entries = probationEntries + residentEntries + bypassEntries`. `sourceUnits` zahrnují všechny klíče, `nodeStringUnits/nodes/operators` pouze resident AST; `textUnits` je sourceUnits+nodeStringUnits. Jde o konzervativní účtování řetězců/uzlů, **ne skutečné heap bajty**. Do rozpočtu nepatří přechodný strom potřebný pro původní native parse ani původní Babylon expression cache.

`hits` znamenají skutečné použití resident AST; probation lookup je stále miss. `deferred` počítá první bounded klíče, `promotions` úspěšné AST admission, `promotionSkips` odmítnuté promotion, `bypasses` levné vynechání auditu přes marker nebo příliš velký klíč. `oversized/unsupported` jsou počty requestů s takovou klasifikací, včetně markerů. Reset/dispose/disable+enable a reentrantní same-key fill/eviction kontrolují generaci i identitu pozorované položky. Po reentrantním vložení se nikdy nezapočte stejný retained strom podruhé. Výjimky z prováděného native parse/walk se předávají původnímu volajícímu.

## Ověření a reprezentativnost

`tests/shader-syntax-cache-native.test.ts`: **17/17 PASS**, runner3128.1588ms; scoped strict TypeScript PASS. Testy pokrývají32 actual Standard/PBR/shadow kontraktů, všechna výsledná WGSL data a celý binding context, nonfloat attributes, různá defines/indexParameters, měnitelné include bytes, afterIncludes výstup, jazykové flags, fyzicky frozen nodes/arrays/operators, všechny budgets, LRU, bypass markery, parser/callback exceptions a reentrantní lifecycle/admission. Patch preimage/prefix i forward/reverse EOF marker jsou ověřené.

Corpus je převzatý z [předchozího CPU výzkumu](../shader-cpu-kernel-20261103/README.md):32 případů má24 unikátních native Effect(name+defines) klíčů,3 shader families a6 přesných připravených textů. První sweep24 Effectů má48 evaluací, **12 parses/36 resident hits/6 promotions**. Retained6 AST:1426379 účtovaných text units,19659 nodes,5044 operators. Žádný velký druhý seznam není mimo budgets.

Fixtures mají skutečné pinned materiály/ShadowGenerator, WGSL1, **pureMode=false**, UBO=true a reálné zachycené indexParameters. Final Effect a texture readiness jsou stubnuté, není GPU kompilace/render. Chybí celá produkční sada pluginů, avatar/skinning a driver behavior. Node24.22.1 / Intel i7-8750H /12 logických CPU. JIT a původní expression cache jsou symetricky zahřáté; „cold“ znamená prázdnou AST cache, nikoli čerstvý browser.

## CPU A/B a rozhodnutí

Každý pár střídá B/A a A/B. Kernel čas zahrnuje lookup, parse, admission, census, freezing, eviction a variantní processing; reset je měřen zvlášť a přičten jako disjunktní práce. Výstupní hashování/serializace je mimo kernel timer, ale ve zvláštním inclusive `harnessWallMs`. Žádné raw odlehlé hodnoty se neodstraňují.

| Varianta | First-sweep medián C/B | Cold one-off | 2-entry thrash | Rozhodnutí |
| --- | ---: | ---: | ---: | --- |
| v1 first-use | 0.7529 | 1.2520 | 1.2145 | Nepřijata: cold/thrash cena; navíc opravený reentrant accounting defect. |
| v2 first-use + opravy | viz raw AB2 | viz raw AB2 | viz raw AB2 | Nepřijata: významná admission cena trvá. |
| v3 single bounded DFS | 0.7459 | 1.3727 | 1.2980 | Nepřijata: sloučení průchodů nezlevnilo misses. |
| **v4 second-use (AB4)** | **0.7938** | **1.0137** | **1.0074** | Slibný CPU kandidát; následná delší kontrola níže. |

V4 AB4: hot-lookup0.6934 (pouze syntetický upper-bound scénář, stejné Effecty by už cachoval engine), oversized1.0165. Poslední disabled blok měl tři výrazné odchylky a medián1.1296; **zachován a neoznačen za úspěšný**. Proto vznikly dvě samostatné delší série nad stejným v4 runtime,5 párů×12 sweepů×24 unikátních Effectů, v samostatných procesech:

| Kolo | First-sweep baseline/candidate ms | C/B | Disabled baseline/candidate ms | C/B |
| --- | ---: | ---: | ---: | ---: |
| 0 | 2695.7170 /2128.8946 | 0.78973 | 2721.7736 /2689.9072 | 0.98829 |
| 1 | 2684.9364 /2142.0519 | 0.79780 | 2884.0016 /2867.5607 | 0.99430 |
| 2 | 2861.4245 /2526.5617 | 0.88297 | 2674.9054 /2705.3999 | 1.01140 |
| 3 | 2677.9814 /2220.5072 | 0.82917 | 2695.8952 /2694.8631 | 0.99962 |
| 4 | 2665.7403 /2114.7445 | 0.79330 | 2668.8139 /2709.7248 | 1.01533 |

First-sweep medián **0.79780**, všechny páry lepší. Disabled medián **0.99962**, regrese z krátkého bloku se neopakovala; příčina původních odchylek nebyla prokázána. Cold one-off i thrash v4 včas opustí probation bez zbytečného freezing. Proto je v4 vybraný pro **další skutečný browser/GPU A/B**, ne pro automatické zapnutí ve hře.

Krátký v3 cold CPU profil lokalizoval580.646ms ve FreezeShaderSyntax; tento proces zahrnoval parity/warmup, takže jeho phase sums nejsou normalizované samostatné cold A/B. Profil podpořil změnu admission, nikoli velkou TinyLFU/probation hierarchii, worker, změnu limits nebo jiné readiness.

## Incident závislostí a přesná hranice instalace

První `pnpm exec tsx --test` nečekaně spustil dependency reconcile (pnpm11 `verifyDepsBeforeRun` default install). Byl zastaven, session96427 exit1; tento log nemá testové výsledky. Root incident převzal. **Audit core10037 a loaders823 souborů** proti C6 manifestu zjistil pouze v1 Processor.js/.d.ts změny, žádné extra/missing;6 ze7 package.json sedělo, Vite byl8.3.5 místo baseline8.3.4. Package/workspace/lock Git bajty zůstaly beze změny. Vite tato CPU cesta nepoužívá.

Installed dependency po incidentu zůstává **v1**, nikoli finální v4. Finální v4 se měřil explicitně staged z zachovaného hashovaného původního source; společné Babylon helper bytes jsou auditem doložené. Autor už neprováděl žádný install/lock/node_modules zásah. **Root musí kontrolovaně aktualizovat patch hash/lock, obnovit verze podle lockfile a nativně znovu ověřit v4.** Nelze použít starý frozen build manifest jako identitu takto změněné instalace.

## Reprodukce

Vše pouze v canonical main, nové vlastní cache output adresáře a pod příslušnou heavy rezervací. **Nepoužívat pnpm exec/run v autorovacím okně změněného patche.**

Po správné root instalaci v4, bez env overrides:

```powershell
node --import ./node_modules/tsx/dist/loader.mjs --test tests/shader-syntax-cache-native.test.ts
node docs/performance/evidence/shader-syntax-cache-20261103/benchmark.mjs --out .cache/shader-syntax-cache-20261103/NEW-ab --rounds 5 --sweeps 3
```

Před instalací použít **explicitní** preserved preimage a staged module:

```powershell
$env:STRAHOV_SHADER_SYNTAX_PREIMAGE_DIR = Join-Path (Get-Location) '.cache/shader-syntax-cache-20261103/author'
node docs/performance/evidence/shader-syntax-cache-20261103/stage.mjs .cache/shader-syntax-cache-20261103/NEW-stage
$env:STRAHOV_SHADER_SYNTAX_TEST_MODULE = Join-Path (Get-Location) '.cache/shader-syntax-cache-20261103/NEW-stage/shaderProcessor.candidate.mjs'
node --import ./node_modules/tsx/dist/loader.mjs --test tests/shader-syntax-cache-native.test.ts
```

`stage.mjs` před použitím ověří immutable preimage hashe. Default native test bez staged override nesmí použít preserved preimage k obejití installed identity. CPU CLI podporuje `--scenario first-sweep|warm-lookup|cold-miss|eviction|oversized|disabled`. Jednoscénářové starší raw logy tisknou6 podporovaných scénářů; skutečně provedený subset jednoznačně určují options.scenario a results rows. Finální harness tuto čistě výstupní nepřesnost opravuje na executedScenarios; měřená verze driveru je archivovaná, timing/iteration kód se nezměnil.

## Důkazy a další krok

[validation.json](validation.json) a [artifacts/](artifacts/) zachovávají raw AB1–AB4, obě delší série, v3 CPU profil, všechny available test/TS logy, dependency audit, předchozí kandidáty, finální canonical runtime/preimage a hash manifest. Kontrola gzip round-trip je byte-exact. Původní staging EOF bug (No-newline marker) je opravený a má forward/reverse regresi.

Read-only review v4 admission/reentrancy nenašlo blocker. Root přebírá package/lock/install, controller whitelist/integration, plné ověření a GPU A/B. Autor nic nestagoval ani necommitoval. Žádné UI readiness, hustota, LOD, světlo, shader binds, includes cache ani worker se tímto taskem nemění.
