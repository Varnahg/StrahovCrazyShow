# Předání: webgpu-shader-inventory-20261016

- Vlastník: `webgpu-mig-01a14497-shader-inventory` (`render_diagnosis`); příjemce: root.
- WT: `C:/Users/rezac/.codex/worktrees/webgpu-comparison/StrahovCrazyShow`, `codex/webgpu-migration`, základ `3898e7d`.
- Scope: `client/webgpu-compilation-profile.ts`, `tests/webgpu-compilation-profile.test.ts`, toto předání a `.cache/webgpu-migration-checks/shader-inventory/`.
- Cizí root handoff WIP není převzat. Game, primary, frozen hry a dependencies-v5 zůstávají beze změny.

## Průzkum a rozhodnutí před implementací

Pinned Babylon 9.30 `webgpuEngine.pure.js:1532–1539` přidává defines jako komentářový prefix k již zpracovanému WGSL. `:1504–1523` cache klíč Effectu zahrnuje oba shaders a všechny defines; nový Effect vytváří vertex i fragment module (`:1548–1558`). [Dawn ShaderModule.cpp](https://raw.githubusercontent.com/google/dawn/main/src/dawn/native/ShaderModule.cpp) porovnává raw WGSL a metadata; komentářové rozdíly mohou bránit reuse. Jde o mechanismus a motivaci inventáře, nikoli o naměřený podíl duplicit.

V12 actual startup skončil ready bez chyb, ale mode→ready 54 876,2 ms, příprava přibližně29,3s a další finální čekání13,1s. 690 module calls,204 pending diagnostics při konci přípravy. Synchronní module API5 615,4ms/max1 625,1ms, getCompilationInfo910,4ms/max848,4ms. Queue backpressure/GC je hypotéza; samotné API trvání neidentifikuje vnitřní browser mechanismus. First-F pilot nevytvořil nový shader module, ale vytvořil2pipeline; sourceIDnull/profilingON brání vydávat jej za formální FPS přejímku. C4 FPS piloty také nejsou potvrzený výkonový vítěz.

Varianty:

- Fingerprint bez úplné rovnosti: odmítnuto, kolize nejsou důkaz duplicit.
- Obecné odstraňování WGSL komentářů/whitespace/defines: odmítnuto. Inventář nic netransformuje; identitu těla doloží jen skutečný známý `_getWGSLShader(source,type,defines)` výsledek.
- Neomezený dump zdrojů či per-frame logování: odmítnuto kvůli paměti a objemu. Pouze bounded interní textová evidence a souhrn bez shaderového textu/GPU referencí.
- Zapnout inventář běžně nebo zavést cache/reuse: mimo scope. Default bez textové práce, pouze explicitní diagnostika; žádné GPU API argumenty ani výsledky se nemění.

Root schválil API: `captureShaderInventory?: boolean`, `setStage(stage: string | null)` a `snapshot().shaderInventory` (`null` při vypnutí). Interní pevné horní limity:1024 textů,32Mi UTF-16 code units (nominálně64MiB textu),16 etap,16 exported raw-duplicate a16 body-duplicate řádků. Volitelné testovací limits je mohou jen snížit. Hash je pouze index, duplicita se potvrzuje úplnou rovností. Neznámé descriptor/accessor tvary a přetečení jsou explicitní. Inventář neopakuje čtení getterů; přijímá vlastní datovou string property. Vlastní měřený CPU overhead je diagnostický náklad a nesmí být zaměněn za optimalizaci.

Privacy kontrakt: skutečný `shared/session-diagnostics.ts` omezuje hloubku8,6000uzlů,96vlastností objektu a32KiB záznam. Snapshot musí přežít klientskou sanitizaci a následné serverové `validateDiagnosticsBatch`; žádný shaderový text nesmí být přítomen ani před sanitizací.

## Implementace a ověření

- Implementován opt-in `ShaderInventory` uvnitř vlastního profileru. Sdílený helper počítadel a projekce řádků omezuje duplicitní stav; hashové indexy mají úplnou kontrolu rovnosti. Body evidence drží offset a odkaz na již uloženou textovou evidenci, nikoli druhou kopii těla či GPU objekt.
- `setStage` přijímá pouze krátké technické identifikátory. Souhrn po etapách a top duplicate rows odlišuje vertex/fragment/unknown, raw/body délku, počet volání a počet skutečně pozorovaných raw variant těla. Hash není unikátní identifikátor; číselné IDs jsou lokální jedné generaci.
- Raw/body repeated počty znamenají další přesně shodná pozorovaná module calls v generaci (i mezi etapami). Nejde o engine cache hits ani Dawn cache misses. Neznámé/omezené záznamy nejsou důkaz jedinečnosti. Rozdílné decomposition stejného raw textu označí budoucí body identity jako ambiguous.
- Descriptor code přijímá jen vlastní datovou string property. Accessor se znovu nevolá; trap selhání zvýší unknown/observerErrors, ale samostatná bezpečná větev dál provede povinnou shader validaci. Arguments, receiver, return/throw a Promise semantics zůstávají zachované.
- Disposal uvolní všechny uložené texty a indexy, ponechá jen bounded numeric/hash souhrn; obnova zařízení zahodí starou evidenci a počítá novou generaci. Default off nealokuje inventory, neinstaluje WGSL hook a nečte code/source/defines.
- `cpuTotalMs/cpuMaxMs` zahrnují capture/setStage, nikoli tvorbu snapshotu či serializaci. Jsou diagnostický overhead a mohou být vnořené v engine časech. Limit code units není limit celého JS heapu; indexy, bounded metadata a dočasný prefix mají další režii.

Vlastní staging `.cache/webgpu-migration-checks/shader-inventory/` obsahuje pět přesných zdrojů/testů včetně skutečného shared privacy filtru, config a readonly junction na dependencies-v5. Přímý Node, žádné instalace/cache zápisy do dependencies. Všechny vlastní procesy doběhly.

- Nové testy proti původnímu runtime z `git show 3898e7d:client/webgpu-compilation-profile.ts`: **13/22 PASS,9FAIL**, exit1, `inventory-baseline-red.log`. Chybí očekávané inventory API/evidence; tento baseline běh nepředstírá časové pořadí TDD.
- První implementation běh: **22/22 PASS**, exit0, `inventory-green-v1.log`.
- Po doplnění explicitního unknown při descriptor trapu a přesnějšího overhead scope: **22/22 PASS**, exit0, `inventory-final.log`. Příkaz `node --import tsx --test tests/webgpu-compilation-profile.test.ts`, `TSX_DISABLE_CACHE=1`.
- `node typecheck.mjs`: **2957 souborů,0diagnostics**, exit0, `inventory-types-final.log`; první scoped TS také prošel.
- Testy volají skutečný pinned `WebGPUEngine.prototype._getWGSLShader` bez GPU inicializace. Zahrnují známou FNV kolizi `costarring`/`liquid`, různé defines se stejným tělem, zachování původních komentářů, neznámý/custom výstup, limity textu/záznamů/etap/exportu, immutable snapshots, lifecycle a zachování validace při chybě pozorování.
- Maximální exportní rows s naplněnými stage slots prošly skutečným `sanitizeDiagnosticsData` a `validateDiagnosticsBatch`, celý záznam pod32KiB. Úplné snapshoty se po obou filtrech shodují a shaderový text není přítomen ani před filtrem.
- `git diff --check`: exit0.
- Nezávislý read-only review `stack_options` nad helper SHA `7c867ee450eac578fe5adb948f28b2a3eddfcf2304bc8bcee2433ac62247b515` a test SHA `697aa6fd4a87358208de6e5962810399a7a0457f60e0a817c86846f6ff39856d`: bez konkrétní actionable chyby; reviewer nic nespouštěl ani neměnil.

Manifest přesných inputs včetně testů a SHA logů je `.cache/webgpu-migration-checks/shader-inventory/manifest.json`, SHA-256 `c8d6cc5815cb72939557920b977a9301b2c58a32f0b1aaf58fc755906a71c707`; všech pět kopií odpovídalo pracovnímu stromu. CPU výsledky neprokazují skutečné duplicity produkční scény ani výkonový přínos. Žádný build, full suite, instalace, GPU ani server nebyly spuštěné.

## Předání

- Commit zahrnuje pouze profiler, jeho cílené testy a toto předání; přesný SHA a potvrzení release dostane root zprávou. Žádný root/primary WIP není přibalen.
- Vlastní procesy ukončené, žádné porty/GPU. Rezervace se uvolní po commitu. KEY-31 průběžně aktualizován; celek není označen Done.
- Root vlastní již schválené loopback opt-in Game wiring (`profileEnvironment=1`), `setStage` pro assets/preparation/submitted-frame/ready a skutečný sběr. Výkonové přejímky musí inventář vypnout. Snapshot lze logovat přímo nebo pod technickým klíčem `timing`; klíč obsahující `profile` privacy filtr záměrně odstraní.
