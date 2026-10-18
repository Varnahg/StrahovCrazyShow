# Předání: webgpu-inactive-light-defines-qa-20261018

- Vlastník `webgpu-inactive-light-qa-01a14497`; příjemce root. WT `C:/Users/rezac/.codex/worktrees/webgpu-comparison/StrahovCrazyShow`, větev `codex/webgpu-migration`, výchozí HEAD `655f937`.
- Výsledek: izolovaný QA vendor patch a cílené ověření připravené k root snapshot/build/GPU pilotu. Není integrováno do native/main, žádný commit. Zápis pouze tento handoff a `.cache/webgpu-migration-checks/inactive-light-defines-qa-20261018/`.
- Frozen vstup day-zero-v3 `0e15522126720f08e892de60685df25f5d20c313c562c952151de7d94d9f964a`; původní dependencies-v5/hraný4193/4192/4188/cizí WIP beze změny. Bez instalace, pnpm či dalšího BMAD workflow.

## Přesná oprava a výstupy pro integrátora

Jediná změna Babylon runtime je ve vlastní fyzické kopii `dependencies/node_modules/@babylonjs/core/Materials/materialHelper.functions.js`: tři false assignments pro `LIGHT_FALLOFF_PHYSICAL/GLTF/STANDARD + index` v původním inactive resetu, vedle `LIGHT + index = false`. Aktivní sloty, global PBR flags, shader producer, cache, pluginy, draw/Promise/lifecycle semantics se nepřepisují. Žádný nový observer nebo průchod scénou.

Přenést pouze tyto čtyři candidate-relative soubory nad rootův úplný day-zero-v3 snapshot:

- `patches/@babylonjs__core@9.30.0.patch`
- `pnpm-lock.yaml`
- `tests/inactive-light-defines-history.test.ts`
- `tests/inactive-light-defines-helper.test.ts`

Ostatní candidate soubory jsou jen byte-identický import closure cílených testů, nikoli úplný produkční snapshot. Package/workspace verze a konfigurace zůstaly stejné. Nový patch SHA `0811815a615a8e501c4542ee2fa38fcc5fdd1a4394fbc610cb0aa5a0ae62c578`; helper SHA `a6d21d15070f52d3a94ec7fd40eb22356a76a723165ce05afa67dbeded0e88ac`. Starý patch `5e2a931d…7115` je zachován byte-for-byte jako prefix; lock se liší pouze řízenou substitucí tohoto SHA na šesti místech včetně loaders peer resolution. `patch-record.json` dokládá změny.

Rootův nový snapshot musí resolverem použít fyzický QA root `.cache/webgpu-migration-checks/inactive-light-defines-qa-20261018/dependencies/node_modules/`. Core i loaders jsou úplné fyzické kopie, každý výstupní soubor nlink1; žádný zapisovatelný odkaz do V5. Ostatní balíky jsou jednotlivé readonly junctions. Nebyl propojen `.pnpm`, `.modules.yaml`, `.bin` ani tool cache. Root plánuje vlastní node_modules a vlastní CLI shimy/cache; tento dependency root po freeze pouze číst.

## Testy a primární důkazy

- Čistý RED `targeted-red-final.log`:16testů,15očekávaných failures přes inactive flags/history,1PASS skutečného GLB loader identity. Ještě před vendor hunkem.
- GREEN `targeted-green.log`:16/16PASS,3.174s. Tři per-light falloff typy × tři globální PBR režimy × PBR/Standard opaque/alpha regular-instance cesty; skutečný helper/readiness/draw, plné defines a Effect reuse za celou světelnou sekvencí.
- Helper testy navíc cap4→2→4, scene.lightsEnabled OFF/ON, disableLighting, reactivation, dirty=false no-op, capability clamp8→6→8uniform slots, zachování global PBR flags a nepokrytého index99. Cap0 se nepoužívá jako oracle, jeho dřívější chování se neopravuje. Frozen readiness zachovává starý Effect a po unfreeze proběhne skutečný render/cleanup flags.
- Vlastní validní malý binary GLB se načetl přes skutečný loader. PBRMaterial i Mesh instanceof patří QA core; loader i test resolver mají stejný fyzický core realpath, žádnou druhou V5 class identitu.
- `related-regressions.log`:77/77PASS,6.788s. Původní image-processing ownership/value-updates, shadow-depth/freshness/includes, stable-light-state, glTF budget a sky/window reflection testy. Původní testy i jejich imports zůstaly byte-identické.
- `scoped-types.log`:3134souborů,0diagnostik; kořeny pouze oba nové testy a jejich transitive types, noEmit. Není to full-project typecheck/build.
- `patch-applicability.json/log`:PASS6souborů. Izolovaným fyzickým kopím byl skutečně odebrán celý starý patch (`git apply --check --reverse`, potom reverse); každý z pěti starých hunků změnil hash. Následný check/apply celého nového patch přesně reprodukoval všech6výsledných QA souborů včetně helperu. Původní V5 nebylo cílem žádného zápisu.
- Finální `manifest.json` ověřuje všech10860core/loaders vstupů proti původnímu V5 a výstupů; runtime delta musí být právě jediný helper. Zahrnuje current source/test/artifact/handoff SHA a skutečné resolver identity.

## Neúspěšné pokusy a omezení

`targeted-red.log` měl kromě očekávaných failures chybějící lokální readonly source copy a příliš časný frozen readiness check; není čistým RED důkazem. Chybějící byte-identický `strict-material-preparation.ts` byl doplněn. `targeted-red-02.log`, `targeted-red-03.log` a `frozen-diagnostic.log` obsahují přerušený vlastní runner. Diagnostika izolovala synchronní zavěšení unpatched NullEngine až při skutečném renderu se záměrně zastaralým frozen shaderem po odebrání jeho světelných bindingů. Test nyní ověřuje skutečný frozen readiness fastpath bez tohoto starého draw a skutečný draw až po unfreeze. Tyto logy nejsou PASS; oprava starého frozen draw je mimo scope. Vlastní child procesy byly ověřené podle commandline/parent a ukončené, nic neběží.

Toto jsou CPU/NullEngine/GLSL regrese. Requested PCF zde používá podporovaný fallback, textury v history fixture native NullEngine dummy uploader. Neprokazuje se GPU/WGSL obrazová ekvivalence nebo atribuce všech31produkčních Day příprav. Fallbacks.reduce měnící defines string mimo helper a explicitní Node light cesta jsou mimo opravovaný loop; libovolné custom pluginy nejsou novou přejímkou. Hunk neobchází frozen fastpath a nemaže `_keys` ani nevynucuje rebuild.

Cílený refaktoring sdílí fixture/capture pro table-driven history a nezavádí runtime test hook. Pro root následuje full snapshot, úplné ověření a měření stejného Day/F s obrazem a původními timeouty/readiness. Žádný fullsuite/build/integration/GPU nebyl tímto agentem spuštěn.

## Manifest a release

Schema `manifest.json`: `sources` je mapa candidate-relative cest na `{inputSha256,sha256,bytes,changed}`, `changedFiles` je přesný seznam4přenášených souborů, `dependencies` obsahuje root/roots, mapu všech package souborů a jedinou runtime změnu, `identity`, `validation`, `artifacts`, `handoff`. Manifest SHA předán rootovi samostatně, aby nevznikl self-hash cyklus. Ukončené procesy, předání rootovi a následný release; release není přijetí do main ani Done pro KEY-31. Bez commitu.
