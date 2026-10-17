# Předání: webgpu-shader-inventory-20261016

## Aktuální výsledek po ukončení ručního testu 17. 10. 2026

Uživatel výslovně dokončil ruční test a root vrátil původní tří-souborový WIP autorovi k ověření. Znovu načteny aktuální primární AGENTS/policy/BMAD spec a získán claim `webgpu-shader-inventory-20261016` jako `webgpu-mig-01a14497-unused-20261017 --adopt-dirty`; převzetí navazuje na výslovný předchozí handoff SHA `83eadff7738b0c960e9609db237aa70c40f8b6c28743e444210530dbffa548e6`. Žádný restart implementace ani nové BMAD workflow.

Současný profiler a test byly znovu přesně zkopírovány do `.cache/webgpu-migration-checks/shader-inventory/`. Freeze SHA z nezávislého review se nezměnily (`991c3ff5…9499` / `f2db43c0…1fc9`); po ověření nebyla potřebná další runtime/test oprava ani refaktoring. Předchozí označení posledních úprav jako neověřených v historických sekcích níže je tímto uzavřené.

- `TSX_DISABLE_CACHE=1 node --import tsx --test tests/webgpu-compilation-profile.test.ts`: **33/33 PASS**, 0 failures, exit0; `unused-final-20261017.log`.
- `node typecheck.mjs`: **2957 souborů, 0 diagnostics**, exit0; `unused-types-final-20261017.log`.
- Manifest `unused-manifest-20261017.json`, SHA-256 `dc2e6935a8b07a838a1a72fe668fc73fcbdf01a3388c96422f4be40508590566`, ověřuje přesnou shodu všech5 staging inputs se současným WT, config/harness, pinned Babylon primární zdroje, readonly dependencies-v5 cestu a oba skutečné výsledkové logy. Ověřovaný WT HEAD `233eeb3` plus přesně identifikovaný vlastní diff.
- Původní nezávislý statický review vrátil `[]` nad stejnými zdrojovými SHA. K aktuálnímu diffu nepřibyly žádné runtime/test změny; doplnila se jen evidence tohoto ověření.

Všechny vlastní procesy doběhly; žádný server/GPU/full-suite/build/integrace se nespouštěly. CPU důkaz neurčuje skutečné produkční duplicity ani výkonový přínos. Root nyní koordinuje samostatný commit a integraci po BMAD review; podagent zatím nic nestagoval ani necommitoval. Dále zbývá rootovo Game ověření a produkční Edge sběr, následně celá migrační přejímka.

## Předání rozpracovaného ověření rootu 17. 10. 2026

Načten nový primární `AGENTS.md`, `docs/agents/bmad-policy.md` a BMAD specifikace `_bmad-output/implementation-artifacts/spec-key-31-wgsl-unused-defines-20261017.md` včetně task contextu. BMAD vede root; podagent další workflow nespouštěl. Výslovný příjemce tohoto implementačního WIP je `webgpu-migration-01a14497-root`, který autorizoval předání stejného scope a pozdější `--adopt-dirty` pro ověření. Uživatelův ruční test dosud není ukončený.

Nezávislý read-only reviewer `resume_plan_review` potvrdil níže uvedené přesné freeze hashy a vrátil prázdný seznam actionable nálezů `[]`. To je statické review bez spouštění kontrol, **nikoli nový test PASS**. Root přijal tento výsledek; BMAD metadata jsou integrovaná v main `1377f133c8553c90e9fa57501dd535f67e7c2ee3`. Runtime implementace se tím necommitovala ani nepřijala.

- `client/webgpu-compilation-profile.ts`: SHA-256 `991c3ff5ec2b09c3cae4cc715343582b2688dc8b8332c776663244b392dd9499`.
- `tests/webgpu-compilation-profile.test.ts`: SHA-256 `f2db43c07501ee8763ff621d890647c3d97d85a86242d690a5e4c5d3aa281fc9`.
- Třetí předávaný soubor je toto předání. Žádné ostatní dirty cesty nejsou součástí tohoto tasku.

Zbývá po výslovném konci ručního testu znovu zkopírovat **současné** dva zdroje do existujícího vlastního stagingu (kopie v `.cache/webgpu-migration-checks/shader-inventory/` jsou starší než poslední freeze), spustit cílený test a scoped TS, opravit případné skutečné chyby, vytvořit manifest důkazů, samostatný commit/integraci a produkční Edge sběr pod rezervací rootu. Přesný otevřený seznam neověřených změn a dosavadní výsledky jsou níže. Během ručního testu žádné další testy/TS/GPU neběžely. Podagent nemá pomocné procesy ani porty; po tomto předání uvolní svůj claim a slot. Uvolnění není Done.

## Pokračování 17. 10. 2026 — implementace před závěrečným ověřením

Příjemce původního výzkumného handoffu je nyní `shader_inventory`, owner `webgpu-mig-01a14497-unused-20261017`. Root doložil převod a zachoval původní dirty diff/SHA v `.cache/webgpu-migration/inventory-transfer-20261017.json`; claim s `--adopt-dirty` převzal pouze tento dokument. Base HEAD `6582860`. Žádná změna běžících snapshotů, assetů nebo dependencies.

Implementované API je `captureUnusedDefineInventory?: boolean`, účinné jen spolu s `captureShaderInventory`. Obsahuje pouze druhou schválenou observační vrstvu. Zachytí skutečný výsledek owned `_convertDefinesToConst` uvnitř `postProcessor`, přes přesnou shodu argumentů a výstupu `finalizeShaders` doloží tabulku v konečném body a připustí pouze známý jednořádkový `SHADER_NAME` prefix z pinned Effect.functions. Ten zůstává v odvozeném porovnání. Shader, descriptor, receiver, původní výsledky/výjimky ani Promise se nepřepisují.

Konzervativní scanner respektuje [WGSL 3.2/3.3](https://www.w3.org/TR/WGSL/#blankspace-and-line-breaks) včetně všech line breaks a vnořených blokových komentářů. Identifikátory mimo ASCII, neznámé direktivy, nevyvážené bloky a nejednoznačná nebo ne-top-level tabulka vedou na unknown. Kandidátem k vynechání je jen nepoužitá konstanta s uppercase ASCII názvem do64 znaků (kromě reserved `NULL`) a jednoduchým bool nebo kladným decimal-int literálem0..2147483647. Lowercase, reserved/komplexní hodnoty zůstávají; zachovávají se také všechny jejich tranzitivní závislosti. Jde záměrně o podmnožinu legálních jmen/literálů. Přesná odvozená shoda není tvrzení sémantické nebo cache ekvivalence.

Pevný32Mi UTF-16 budget se sdílí mezi raw evidencí a čekající provenance. Provenance má navíc8 záznamů/512Ki znaků, nejvýš4 vnořené postProcessor rámce a64Ki/1024řádků tabulky. Evikce je explicitně počítaná a chybějící provenance zůstává unknown. Odvozené identity drží pouze rozsahy již uloženého raw textu; fingerprint se vždy ověřuje úplnou rovností, bez allocation per znak. Po analýze se uvolní dočasné tokeny a dependency sets; přetrvává jen číselný souhrn, bounded16 jmen a numeric ranges. Disposal/nová device generation uvolňuje texty i provenance. Default-off nečte procesor ani shaderové texty.

Průběžný izolovaný CPU běh měl27/27 PASS. Následný rozšířený běh `.cache/webgpu-migration-checks/shader-inventory/unused-v1.log` měl31/32 PASS: jediný fail byl překlep očekávaného hex hashe známé kolize (`c466019e` místo správného `c465019e`); test skutečně potvrdil dvě různé identity. Scoped TS `unused-types-v1.log` měl1diagnostic kvůli unii fixture objektů s optional undefined klíči. Obě fixture chyby jsou opravené.

**Aktuálně neověřené:** opakování po těchto opravách, následné statické zpřesnění rozlišování všech závorek/top-level hranice, konfliktní provenance stejného raw textu a accessor-safe discovery, plus nová regrese ambiguities. Root dne17.10. vyhradil ruční test uživatele, takže další testy a TS jsou zastavené až do jeho zprávy. Žádný můj testový, TS, serverový či GPU proces neběží (ověřeno CIM). Samostatný runtime commit bude vytvořen teprve po skutečném závěrečném ověření a nezávislém review.

## Navazující observační vrstva schválená před implementací

Nad čistým `779c121` root schválil `captureUnusedDefineInventory: true` spolu s původním `captureShaderInventory`; žádné runtime shadery se neupravují. V13 měl662 přesně známých raw/body volání bez shod a bez ztráty evidence. Offline probe `v13-generated-const-probe.log` doložil, že pinned processor přidává materiálové defines i jako skutečné `const` deklarace uvnitř těla: odlišný nepoužitý define tedy vytváří odlišné body. Opakovaný stejný body s jiným vnějším komentářovým prefixem byl správně detekován jako shoda.

Zvolený rozsah je observační: zachytit skutečný výstup `_convertDefinesToConst` na konkrétním engine-owned processoru uvnitř jeho postProcessor, doložit jeho přenos přes finalize do konečného body, konzervativně určit reference a porovnat jen odvozené pohledy. Nejasná provenance, syntaxe, top-level pozice nebo limity znamenají unknown/keep. Zbylé komentáře, bindings, layout i použitá deklarace musí zůstat přesné. Žádný obecný stripping všech konstant či komentářů, žádná cache a žádné změny návratů GPU/processor API.

Adversariální primární review před implementací: Babylon `_convertDefinesToConst` přijímá numeric prefix, ne jen literály. I `1/0` či `1; const_assert false` by generátorem prošly. Nepřítomnost referencí proto nestačí k bezpečnému odstranění možného shader-creation erroru. První rozsah ponechá komplexní/neprokázané initializery a jejich tranzitivní závislosti; k vynechání připustí jen striktně ověřené jednoduché skalární literály a legální názvy. Odvozená shoda zůstává diagnostický kandidát, nikoli důkaz plné sémantické či cache ekvivalence. Lexer musí bezpečně rozlišovat všechny WGSL line breaks (nebo je odmítnout jako unknown), vnořené komentáře a všechny reference mimo generated table včetně atributů, array bounds a const_assert; shadowing smí vést ke konzervativnímu keep.

Původní paměťové/exportní limity se nezvyšují; provenance a dočasná textová evidence mají vlastní malé limity a sdílí textový budget s raw evidencí. Následuje relevantní implementace, CPU regrese a scoped TS, bez GPU/build/full suite.

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
