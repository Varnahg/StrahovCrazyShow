# Samostatný diagnostický základ wave3 — rozhodnutí před sestavením

14. 10. 2026. Task `publish-wave3-diagnostics-baseline-20261014`, vlastník `pubdiag-01a13624-20261014`, koordinátor `/root`. Izolovaná pracovní kopie `C:/Users/rezac/.codex/worktrees/wave3-feature-publication/StrahovCrazyShow`, větev `codex/wave3-feature-publication`, výchozí HEAD `e215bf4fe5e7c148d806207f82ae6b849895fdd6`. Runtime byl při převzetí čistý a node_modules chybělo; koordinační katalog/podklady již zkopíroval root a nejsou součástí tohoto runtime diffu.

## Primární podklady a uzavřená závislostní sada

Autoritou jsou byte-identické zdroje v neměnném `C:/Users/rezac/Documents/GitHub/StrahovCrazyShow/.cache/playtest-repairs-validation/snapshots/wave3`, snapshot `0f20b5a7c7ba9ce5ab9aa16bba3b0a6886823152a322be2724fd2cdad41d6248`, a `source-manifest.json`. Před kopírováním bude SHA každého vybraného vstupu ověřen proti tomuto manifestu. Aktuální dirty main se nekopíruje.

Předchozí read-only audit skutečných importů, včetně TypeScript type-only vazeb, zjistil:

```text
client/session-diagnostics
  runtime -> shared/session-diagnostics
  type-only -> client/render-incident-profile
                  runtime -> client/benchmark-render-profile
server/session-diagnostics -> shared/session-diagnostics
scripts/diagnostics-report.mjs -> jen Node built-ins
```

`BenchmarkRenderCpuMs` zůstává tvarově shodný s HEAD. Frozen RenderIncidentProfile však skutečně předává třetí callback konstruktoru BenchmarkRenderProfile; proto je nutné jeho kompatibilní rozšíření, nikoliv celé nové Game měření. `render-cost.ts` ani `mesh-draw-profile.ts` nejsou v této dependency closure. Přidání mesh-draw by navíc vyžadovalo nový `renderMeshIdentity` z render-cost a nepatří do tohoto základu.

Minimální publikovaný celek včetně čtečky a regresí má14 souborů:

- `shared/session-diagnostics.ts`
- `client/session-diagnostics.ts`
- `server/session-diagnostics.ts`
- `client/render-incident-profile.ts`
- `client/benchmark-render-profile.ts`
- `client/main.tsx`
- `server/index.ts`
- `vite.config.ts`
- `scripts/performance-preview.mjs`
- `scripts/diagnostics-report.mjs`
- `tests/session-diagnostics.test.ts`
- `tests/session-diagnostics-server.test.ts`
- `tests/render-incident-profile.test.ts`
- `tests/diagnostics-report.test.ts`

Devět nových modulů/testů a kompatibilní benchmark změna budou převzaty přesně; main/proxy mají pouze ověřený malý diagnostický delta. **Server se nepřebírá celý:** pouze import `createSessionDiagnosticsHandler`, jeho vytvoření po existujícím `listenHost` a volání HTTP handleru před localBenchmarks. V11 queues/clock/authority/probe/respawn zůstanou původní. `tests/benchmark-render-profile.test.ts` je nezměněný proti HEAD; bude se pouze spouštět.

## Porovnané varianty a volba

1. Převzít celý Game/UI/server wave3: odmítnuto. Míchá V11, staged startup, osvětlení, editor a profily; znemožňuje samostatný následující phase-fix commit. Celý Game.diagnosticContext navíc čte timeline, glTF/light/candidate stats, které tento task nepřebírá.
2. Převzít pouze recorder bez type dependency: odmítnuto. Type-only import stále musí být dostupný a nový RenderIncidentProfile používá třetí callback nepřítomný ve starém BenchmarkRenderProfile.
3. Přepisovat recorder nebo vytáhnout nové samostatné typy jen pro zkrácení closure: nevybráno. Vytvořilo by to novou neověřenou meziverzi oproti již hashovanému wave3 bez přínosu pro tuto publikaci.
4. **Vybráno: přesné převzetí uzavřených modulů/testů, tři malé integrační oblasti a kompatibilní benchmark callback.** Type-only profil nezapíná herní renderer; recorder začne s browserem a collector uloží lokální data. Toto není celé Game FPS/context napojení.

Nezavádí se nové API nad wave3, další cache ani lifecycle. Již předané refaktory recorderu/profile/collectoru se zachovají. Plošné formátování nebo nové úpravy funkčního kódu se provedou jen při konkrétně doložené integrační chybě v povoleném rozsahu; jinak by znehodnotily exact-source převzetí. glTF fastpath, vegetace, Game/UI a všechny assetové materializace jsou mimo scope.

## Plán ověření a izolace

- Před instalací a cílenou validací zkontrolovat established TCP4186/2581 a nové herní JSONL. Při aktivním uživatelském hraní heavy práci odložit, služby neupravovat.
- Vlastní skutečná node_modules složka, `pnpm install --frozen-lockfile`, bez upgradů, změn manifestu/lockfilu či přesměrování na jiné WT. Uchovat instalační log a SHA konfigurace před/po.
- Spustit čtyři nové testy a nezměněný benchmark-render-profile test. Nezavádět nové testy kopírující implementaci; používají se předané skutečné regrese.
- Typová kontrola sestavené čisté WT podle skutečného tsconfig. Chybějící dependency/asset pointer nejprve doložit rootu, nerozšiřovat samostatně scope.
- Uchovat původní selhání i případné opravy, přesné source hashes, minimální diff proti HEAD a handoff. Root provede širší přejímku, staging a samostatný commit/integraci main.
- Tento task nespouští celou sadu, build, integrační server, browser ani GPU a nevydává CPU/NullEngine test za herní výkonový důkaz.

## Skutečné sestavení a ověření

Zápis rozhodnutí výše předcházel kopírování runtime. Claim zahrnoval vlastní `heavy-validation`, node_modules a cache. Před instalací byly porty4186/2581 pouze Listen, bez Established klienta; žádný JSONL v `candidate/.cache/game-diagnostics`. Před cílenou validací znovu ověřeno v15:46:46.961Z:0 Established,0 logů; evidence `pre-validation-client-check.json`. Preview procesy zůstaly pod původním vlastníkem, nezasahovalo se do nich.

- `pnpm install --frozen-lockfile`: exit0,13,6s. Resolver přeskočen,141 balíčků; vlastní skutečná složka node_modules v publication WT. `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml` i `tsconfig.json` zůstaly byte-identické HEAD. Log `.cache/wave3-diagnostics-publication/install.log`, SHA konfigurace před/po v sousedních `config-before.json` a `config-after-install.json`. Žádný upgrade, package patch ani assetová materializace.
- Každý ze14 vstupů ověřen SHA proti frozen source-manifestu před prvním kopírováním.13 souborů převzato přesně. `server/index.ts` sestaven z čistého HEAD přidáním pouze3 schválených řádků; následná programová kontrola porovnala celý jeho text s očekávaným třířádkovým delta. Vstupní evidence `assembly-inputs.json`.
- Cílený příkaz `node --import tsx --test --test-concurrency=1 tests/session-diagnostics.test.ts tests/session-diagnostics-server.test.ts tests/render-incident-profile.test.ts tests/diagnostics-report.test.ts tests/benchmark-render-profile.test.ts`: **exit0,50/50 PASS**,5 916,8992ms podle test runneru. Záznam `targeted-tests.log`. Jde o existující předané regrese; neplní úlohu úplné herní integrace.
- `node node_modules/typescript/bin/tsc --noEmit --pretty false`: **exit0,0 diagnostik**, skutečná kořenová konfigurace a celý sestavený projekt. `types.log` je prázdný; žádné vynechání starých souborů nebo oslabení compiler options.
- `git diff --check` pro změněné tracked soubory: exit0. Runtime tracked delta má22 přidaných a4 odstraněné řádky v5 existujících souborech; dalších9 souborů jsou nové přesné moduly/testy.
- Nezávislé porovnání potvrdilo HEAD byte parity pro Game, UI, shared/netcode, server/respawn, render-cost, active-mesh-candidates, cinematic, package/lock/workspace/tsconfig a původní benchmark test. Tyto soubory se netagovaly jako změny. Nový glTF fastpath, mesh-draw a foreign vegetation nebyly převzaty.

Výsledný manifest14 source/test souborů: SHA-256 `297916679ef32df4b9ad87fcc5c14006fa6050e6a023b252bd525ae32162a811`, definovaný jako SHA UTF-8 `JSON.stringify` seřazeného pole `{path,sha256}` v pořadí `assembly-output.json.entries`. Detailní soubor obsahuje také jednotlivé source/HEAD/final SHA, velikosti, původní frozen snapshot a seznam chráněných souborů.13 finálních SHA je shodných s frozen wave3; server je úmyslný HEAD+collector delta.

Cílená refaktorovací kontrola: integrační glue nepřidává druhý recorder ani profiler, vlastní lifecycle je ponechán ve třídách z původního ověřeného snapshotu. Benchmark callback používá stávající jediný intervalový mechanismus a nerozšiřuje jeho CPU shape. Collector zachovává jediný vstup HTTP route před benchmark handlerem. Proto nebyl potřebný žádný nový přepis nebo zbytečné přeformátování při této publikaci; exact-source parity má přednost před kosmetickým refaktorem.

Všechny vlastní instalační/test/typecheck procesy skončily. Neproběhl build, celá testová sada, herní integrace, browser, GPU, staging ani commit. Root přebírá kandidáta pro širší přejímku a přesný samostatný commit. Funkční omezení zůstává záměrné: automatický browser recorder/storage/reporting je připraven, celé Game FPS/context napojení patří do pozdější samostatné skupiny.
