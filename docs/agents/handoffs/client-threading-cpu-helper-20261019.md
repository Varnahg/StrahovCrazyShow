# Předání: client-threading-cpu-helper-20261019

- Vlastník: `threading-cpu-helper-01a15535-20261019-audit`; příjemce: root koordinátor KEY-40, `threading-01a15535-cpu-profile`.
- Pracovní kopie: `C:/Users/rezac/.codex/worktrees/9b78/StrahovCrazyShow`, detached HEAD `b798e72b4398e46dbc5a0957a65950c57774ea74`. Žádný commit/staging.
- Výsledek: připravená lokální diagnostická kopie Game se samostatným existujícím SelfProfilerV2, explicitním loopback `profileCpu=1` a přímým vlastnictvím `benchmark.cpuStop`. Není to worker implementace, hlavní runtime ani důkaz FPS přínosu. Root přebírá full TypeScript, minifikovaný hidden-map build a skutečný Edge.

## Rozsah a provenience

Všechny níže uvedené pracovní výstupy jsou v `.cache/client-threading-cpu-helper-20261019/`; jediný další zápis je tento handoff. Root `client/game.ts`, donor, hrané snapshoty a závislosti zůstaly nezměněné. Cizí WIP nebyl převzat.

- `client/game.ts`: kopie aktuálního immutable donor `.cache/client-threading-validation-20261019/combined`, source `1fbc05af4154cafb1fd6834748d86dde6d10c539d5431c3fda6323b430ba5752`. SHA před `67b026b976af9f316bcac323a603046b57cf2f6c8653f8d1fe22c7bb27ca8750`, po `5762b04bc15a5aabdc71b31f32602d5e405f1d1778fd3ba9f96bcf8edcdb1705`.
- `client/qa-cpu-profile.ts`: beze změny rozbalený `docs/performance/evidence/webgpu-migration-20261016/medium-cpu-profile/source/client/qa-cpu-profile.ts.txt.gz`, SHA `5ae79df9782be3d53fafc625dda2531e4b7a908a138431f75b3060ff609c6c68`.
- `tests/qa-cpu-profile.test.ts`: původních 11 testů beze změny z odpovídajícího `.txt.gz`, SHA `9c53612d2bde1849001522b93bfec7fe7e7f406f080de2b2d0b02729f860fc97`.
- `tests/game-cpu-profile.test.ts`: 14 nových lifecycle testů přes AST skutečné kopie Game, SHA `3ffab00ee76acf09ed57458e85e9606684434a42b516edd543dfd178ba0ba4c0`.
- `assemble.mjs`, `validate.mjs`, `assembly.json`, `manifest.json`, `validation.json`, `targeted.log`, `scoped-types.log`, `provenance/game.before.ts`, `provenance/game-edits.json`, `provenance/game.diff` tvoří reprodukční podklady a důkazy. `package.json` je byteová kopie donor manifestu pro lokální ESM testy. `tmp/` je vlastní dočasný adresář. `node_modules` je pouze junction na donor dependencies, bez instalace či zápisu do SDK.

Přesný obsah změny je v `provenance/game.diff`; `game-edits.json` obsahuje 15 jednoznačných změn včetně pouze lokálního odsazení nově obalených bloků. Assembler ověřil opačnou aplikaci všech změn až na původní SHA bajtů. Historický Game ani mesh/light overlay se nepřebíral.

## Chování a cílený refaktoring

Sampler se vytvoří jen pro WebGPU při aktivním lokálním recorderu, na `localhost`, `127.0.0.1`, `::1` nebo `[::1]`, s právě jedním query parametrem `profileCpu=1`. Bez volby, s duplicitou, jinou hodnotou, nonloopback adresou či WebGL se `beginQaCpuProfile` nevolá. Sampler zůstává 16 ms / 2000, jeden současný capture, jediný raw DOM export `#cpu-profile-result`; raw trace se neposílá session eventem.

Vlastnictví sjednocuje `takeBenchmarkCpuStop`: nejprve odebere stop closure z konkrétního benchmark state a vrátí ji právě jednou. Restart, konec záznamu, render error a dispose proto nevlastní novější capture. Renderer failure closure zachytí před odebráním benchmarku a zastaví před dalším fallible cleanup. Dispose zastaví už před abortem. Partial startup výjimka zavře lokální closure a zachová původní chybu.

Completion zachytí closure před `this.benchmark = undefined`, obalí celé dispose/snapshot/result dokončení a volá stop v `finally` až po metrikách, před `onBenchmark`. Selhání `getActiveIndices`, profile dispose, health snapshot nebo weather clone nemůže sampler ztratit. Callback může založit další benchmark; starý owner jej nezastaví. Skutečný helper však zůstává busy do vyřešení stop Promise, takže okamžitý reentrant benchmark běží bez nového capture; další explicitní benchmark po settlementu může vytvořit nový sampler. Test odlišuje tuto skutečnou vlastnost od stubovaného ownership scénáře.

Nebyly přidány mesh observers, další timer, transit wrapper ani nová obecná diagnostika. Cache a sampler helper zůstaly původní; per-frame cleanup používá pouze existující recorder flag a nepřidává objektové alokace.

## Skutečné ověření

`node .cache/client-threading-cpu-helper-20261019/assemble.mjs`: exit 0, donor identity, obě gzip SHA a exact Game byte inverse PASS.

První přímý cílený run: `node --import tsx --test tests/qa-cpu-profile.test.ts tests/game-cpu-profile.test.ts` v helper cwd, exit 0, 25/25 PASS. Následné reprodukční ověření s uloženými logy proběhlo přes `node .cache/client-threading-cpu-helper-20261019/validate.mjs`:

- 2026-10-19 18:42:54.011–18:42:55.616 UTC: `node --import tsx --test --test-reporter=tap tests/qa-cpu-profile.test.ts tests/game-cpu-profile.test.ts`, exit 0, 25/25 PASS. `targeted.log` SHA `7b4b711979b16967bd09683be7aefdd6ef030178ee744a04eddf6bb8567690ab`.
- 18:42:55.772–18:42:56.998 UTC: scoped `tsc --noEmit --strict --skipLibCheck --target ES2022 --module ESNext --moduleResolution bundler --esModuleInterop --lib ES2022,DOM --types node --typeRoots ./node_modules/@types client/qa-cpu-profile.ts tests/qa-cpu-profile.test.ts tests/game-cpu-profile.test.ts`, exit 0. Prázdný `scoped-types.log`. Toto není full Game typecheck.
- Před a po každé fázi ověřeno všech 583 donor manifest files a shodné SHA aktuálních `shadowDepthWrapper.js`, `materialDefines.js`, `texture.js` a Babylon package manifestu. Hodnoty jsou v `validation.json`. Dependency realpath je `C:/Users/rezac/.codex/worktrees/29fa/StrahovCrazyShow/.cache/webgpu-shadow-share-native-qa-20261019/clean/node_modules`; žádná závislost se nekopírovala z historického profileru.

Manifest 14 source/test/evidence souborů: `fee5a9497d1d3cf4cf59e3d888559971b3c667ace2e7e5bb8134e4dfb8951569`. Úplné SHA a `integrationFiles` jsou v `manifest.json`.

## Předání a omezení

Root má převzít jen čtyři položky `integrationFiles` do své nové kopie current combined, ověřit jejich SHA a Game base SHA. Podklady pro actual browser: vlastní Document-Policy `js-profiling`, explicitní URL volba, minifikované hidden source maps a oddělený raw DOM export. Existing `profileEnvironment=1` lze použít ke korelaci transit bracketu, ale zapíná i další shader/frame instrumentaci; profilerová FPS nejsou plain FPS A/B. Vzorky představují výskyt stacků, nikoli délku funkcí nebo podíl CPU.

Žádný dlouhožijící proces, GPU, server, build, fullsuite, integrace ani browser nebyl spuštěn. Full Game TS/build/actual Edge zůstává přidělen rootu. Změna samo o sobě neřeší KEY-40 worker přínos.

Rezervace: vlastní soubory jsou předány koordinátorovi; bezprostředně po zápisu tohoto handoffu bude provedeno `release` ownerem `threading-cpu-helper-01a15535-20261019-audit`. Stav tasku a přijetí mění integrátor.
