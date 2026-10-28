# Předání: trees-20261026-webgpu-pipeline-diagnostics

- Vlastník: `trees-webgpu-pipeline-diagnostics-01a16b37`; příjemce: root koordinátor `trees-20261025`.
- Cwd/větev: `D:/CodexWorkspaces/StrahovCrazyShow-terrain-20261025`, `codex/trees-realism-20261025`; výchozí HEAD `8516c7b1877ec66c37120d9088264d44c52882f1`.
- Výsledek: opt-in diagnostika startup pipeline adapteru připravena k integraci; příčinu reálného v6 timeoutu musí určit další měření. Žádná readiness pravidla ani timeouty nebyly oslabeny.
- Přesné soubory: `client/webgpu-pipeline-preparation.ts`, `tests/webgpu-pipeline-preparation.test.ts`, `docs/trees/20261025/webgpu-pipeline-startup.md`, toto předání; vlastní `.cache/trees-webgpu-startup-20261026/`.
- Cizí WIP: adapter/test byly při claim čisté. Game/UI, root diagnostika a všechny stromové/assets změny byly pouze čteny. Žádný staging/commit/převzetí cizích změn.
- Primární výzkum a varianty: [webgpu-pipeline-startup.md](../../trees/20261025/webgpu-pipeline-startup.md); pinned Babylon cache/descriptor/non-float/Effect kód a actual v6 collector report. Hypotéza střídání typů je oddělená od prokázaného pipeline wait.
- API: constructor option `diagnostics?: boolean`; `snapshot(): WebGpuPipelinePreparationSnapshot | null`. Null mimo opt-in. Plain bounded snapshot render/readiness counts, entries/work, serials, descriptor/pending/capacity skip důvodů a posledního omezeného sample. Koordinátor již převzal tvar a zapojil Game.
- Refaktoring: první rozhodující OR guard rozložen do stejného short-circuit pořadí; read-only snapshot nevolá guard/prune/GPU. Poslední sample znovupoužívá jediný objekt/pole. Žádné renderer reference v diagnostics; disposal uvolňuje původní zdroje stejně jako dříve. Čítače saturují.
- Ověření 26. 10. 2026 10:38–10:40 UTC: přímý targeted tsx **37/37 PASS**, zděděný targeted TypeScript project **PASS**, `git diff --check` **PASS**, vše exit 0. Logy `targeted-tests-first.log`, `targeted-tests-final.log`, `targeted-types-final.log` v cache. První ad hoc type command bez strict měl chybu v nezměněném závislém modulu; původní log `targeted-types.log` zachován, přesný projektový config poté prošel.
- Repro: skutečný pinned non-float checker s keep-context outcome po jednom skipu konverguje; kontrolované FLOAT/UINT střídání stejného Effect dává 12 descriptor identity skipů / 6 renderů / 0 async work. Nahrazené shader/device IO není GPU důkaz ani automatické vysvětlení v6.
- Snapshot/diff: `.cache/trees-webgpu-startup-20261026/manifest.json`, kopie vlastních souborů v `source/`, `implementation.diff`; scope manifest zahrnuje také změněný test. Není identitou celého herního buildu.
- Procesy: pouze ukončené lehké CPU testy/types, bez serveru/GPU/Blenderu/build/fullsuite/install; žádný živý proces k převzetí.
- Další krok: root zmrazí v7, sestaví a pořídí skutečný pipeline snapshot; teprve podle konkrétní větve rozhodne o opravě. Root vlastní Linear/verification/integraci a označení tasku Done.
- Rezervace: po handoffu/snapshotu uvolněna CLI release; uvolnění není dokončení širší WebGPU přejímky.

## Navazující NCM oprava — 26. 10. 2026

- Root výslovně předal vlastní dirty adapter/test/docs a uvolnil task; převzal `trees-ncm-startup-probe-20261026` přes úspěšný `claim --adopt-dirty`. Toto je doložený převod stávajícího WIP, nikoli převzetí podle stáří rezervace.
- Stejné čtyři verzované soubory jako výše, nové důkazy jen ve vlastní `.cache/trees-webgpu-startup-20261026/`. Game, backend default, další testy a assety zůstaly pouze čtené.
- Doložená příčina chybějící async cesty: v11 NCM adapter byl záměrně inertní; 314 sync/0 async pipeline calls, timeout low po 30 364,1 ms. Konkrétní umístění 19 355,3 ms render CPU uvnitř nativních/GPU operací zatím není změřené. Není tvrzeno, že samotné sync pipeline API tuto dobu spotřebovalo.
- Implementace: pevný mode zachycen při vytvoření a chráněn při každém owned draw; NCM `clear(null, …)` nyní prochází stejným async pending boundary. Nativní hlavní draw, clear/bundle cache a aliasové shadow contexts byly prozkoumány. Zachovány readiness/serial/token/device guards, 64 bounded entries, once-only retry, deadline a cleanup. Žádné přepínání CM/NCM ani rozsáhlá invalidace.
- Refaktoring: jediný společný adapter zpracovává oba podporované režimy; test fixture používá stejné encoder IO a skutečné pinned DrawContext/BundleList/ShadowDepthWrapper, bez duplicitního produkčního lifecycle.
- RED: dvě skutečné NCM reprodukce před opravou selhaly podle očekávání. Finální cílený soubor **49/49 PASS**; cílené types **PASS**; diff check **PASS**. Výsledky a přiznané opravy fixture/typů jsou v [výzkumu](../../trees/20261025/webgpu-pipeline-startup.md). Po čistě typové korekci nebyla runtime sada bezdůvodně opakována.
- Snapshot `.cache/trees-webgpu-startup-20261026/ncm-followup/manifest.json` obsahuje přesné soubory, kopie a SHA; `ncm-followup.diff` je proti neměnnému v11 pro runtime/test. Žádný staging/commit/fullsuite/build/integrace/GPU/Blender/server. Všechny vlastní krátké CPU procesy skončily.
- Předává se jako integrovatelná úzká oprava; **GPU timeout ani NCM výkon nejsou zatím ověřené**. Root naváže praktickou kontrolou spolu s dokončenou funkcí a vede Linear/main integraci. Výchozí CM zůstává beze změny.
- Rezervace bude po vytvoření snapshotu uvolněna zpět rootovi; root může doložené vlastní soubory znovu převzít přes `--adopt-dirty`.

## Startup timeout: převod konkrétních vstupů · 28. 10. 2026

Původní root trees-webgpu-pipeline-integrator-01a16b37 předává client/webgpu-pipeline-preparation.ts, tests/webgpu-pipeline-preparation.test.ts do jantar-startup-20261028-diagnostics v Jantar worktree nad0d957a1ba0f53baeeef894b13791da857663d6fe. Předané zdroje jsou čisté a bajtově shodné s původní D kopií; žádný cizí WIP se nepřebírá. Nový přímý lidský požadavek opravuje opakovaný skutečný startup timeout. Nejde o přijetí příčiny ani GPU výsledku; první fáze je bounded opt-in bez změny readiness/limitů a bez hráčských identit.

- client/webgpu-pipeline-preparation.ts: a5b5b388904e523ad2f8016b7b0aecb4951a6baa1a10faf4e03de0fa34cfb0cc
- tests/webgpu-pipeline-preparation.test.ts: 585cc66b1861dcb299b4b2953e5d50022161820674795bd36051f985cd6fafca

Root po tomto předání zužuje svou rezervaci přes release/reclaim; ostatní cesty a vlastní dřívější handoff WIP zůstávají původnímu ownerovi. Žádný pomocný proces pro tento převod neběží a immutable4278/4280 se nemění.

## Upřesnění minimálního startup scope · 28. 10. 2026

Nové startup tasky ještě nebyly claimnuté ani nezměnily zdrojové soubory. Původní owner trees-webgpu-pipeline-integrator-01a16b37 přebírá zpět client/webgpu-pipeline-preparation.ts, tests/webgpu-pipeline-preparation.test.ts, které minimální diagnostika nevyžaduje. Cesty jsou čisté a bajtově shodné mezi D a Jantar kopiemi. Převod je skutečný release/reclaim, nikoli převzetí podle stáří.
