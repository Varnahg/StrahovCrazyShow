# Předání: webgpu-b6-variant-proof-20261018

- Vlastník: `webgpu-b6-proof-01a14497`; příjemce: root, koordinátor migrace.
- Pracovní kopie: `C:/Users/rezac/.codex/worktrees/webgpu-comparison/StrahovCrazyShow`, větev `codex/webgpu-migration`; claim base `8368d056d80211cc5b13b32f9933dad6a2d6aca7`.
- Výsledek: dokončený omezený CPU proof chybějícího pokrytí B6 variant. Žádný produkční patch ani GPU přejímka.
- Zápisy: pouze tento handoff a `.cache/webgpu-migration-checks/b6-variant-proof-20261018/`. Hrané snapshoty, runtime, testy projektu a cizí WIP beze změn. Nový BMAD workflow nebyl spuštěn; proof navazuje na rootův `spec-key-31-long-frame-gaps.md`.

## Doložený výsledek

Skutečné Game/controller/sampler metody a pinned Babylon9.30 nad dvěma malými původními GLB porovnaly noční starty před a po Prague dateKey hranici17./18.10. Původní startup etapy mají directional key intensity0. Den v B6 má aktivní Directional a layout `POINT,DIR,HEMI`, po F `SPOT,POINT,DIR,HEMI`. Žádná startup main defines varianta rezidentního Standard/PBR tomu neodpovídá. B6 POINT má přitom stejný layout fingerprint jako street POINT; samotné jméno světla není důkaz nového layoutu.

Osm skutečných regular-instance částí reception-counter/noticeboard je na spawn odpojených, bez main Effectu. Recorded B6 view vykreslí8/8 main a7 shadow částí. Hlubší nav pohled(-4.85,-73)→serviceRoute[1] vykreslí jen4/8 main a2 shadow části. Source-derived vstupní landing(-4.85,-76.95) směrem dovnitř zachytí stejných8/7 jako reference v této malé fixture; bez plných stěn to není finální produkční volba kamery.

Po OFF restore a návratu k totožné B6 day ON prezentaci se všech10 sledovaných render users vrátí ke stejným5 main Effectům. TreeWind PBR leaf wrapper však starý ON depth při skutečném OFF renderu zruší: Effect38→40 a79→81, nový token při stejných defines. Coverage tak může pomoci main/instance missům, sama neřeší wrapped-depth churn. Reuse všech běžných neobalených B6 depth Effectů nebyl samostatně klasifikován.

Actor/weather jsou nezměněné, physics mutations0, network inputs0, avatar a LocalAvatarPresentation zůstaly na spawn;40 camera collision dotazů je readonly. B6 props se znovu odpojí, kamera se vrátí v toleranci0.01m, fillOFF, active glTF loads0. Game.ready zůstává false; žádná readiness se nefinguje. Vlastní scény, observers, kontrolery a enginy jsou uvolněné ve finally.

## Podklady a skutečné ověření

- Runtime kopie: native snapshot `d7490c5356406aa7c1e1020619fd90e2d3a4a8ec02115194d491e94fa0599047`; všechny kopie client/shared jsou byte-identické. Aktiva44 528B+49 188B jsou byte-identická vůči frozen C5 `c4e22edd3b691fce2827b5132ccbc09ec404a0aa6fd1338925ffddbe8a5be6f5`. Vlastní `manifest.json` ověřuje vstupní hashy i výsledky.
- Referenční počasí/kamera: `.cache/webgpu-hitch-validation-20261017/async-v2-first-f-benchmark.json`. Původní LIGHT pořadí, falloff, filter, cap, main defines, instance batches a shadow passes jsou uložené v `report.json`; stručná matice v `summary.json` a výklad v `analysis.md`.
- Finální příkaz v proof cache: `TSX_DISABLE_CACHE=1 node --import tsx probe.ts`, exit0. Dva date scénáře,9 startup etap v každém, B6 OFF/ON obou dnů, camera coverage, restore/reentry a lifecycle assertions PASS. UTC17.10.23:23:53.975–23:23:55.234 (lokálně18.10), fixture+cleanup1258.658ms; CPU user2172000µs/system63000µs. Log `probe-final.log`.
- `node summarize.mjs`, exit0; vlastní assertions pro missing layout, POINT equivalenci, draw coverage, main reuse a depth disposal PASS. Log `summary.log`.
- Předchozí neúspěšné/diagnostické pokusy jsou uchované odděleně, zejména `probe-initial.log`, `probe-camera-budget.log`, `probe-draw-observer.log`; nejsou vydávány za PASS. Finální runtime/probe se po posledním úspěšném běhu nezměnily.
- Refaktoring proofu sjednotil capture/observation přes skutečnou per-pass batch strukturu a jeden presentation helper; produkční algoritmy se načítají z AST. Neupravuje se jejich cache/lifecycle.

## Limity a další krok

NullEngine/GLSL frontend není WGSL/GPU důkaz. Instancing capability je zapnutá jen pro CPU; požadované PCF zde padá na podporovaný POISSON filter. Sky raster/IBL IO a camera collision jsou explicitní stubs, plná B6 geometrie, avatar/animace, okolní scéna a další LOD nejsou zahrnuté. Deterministický16ms scheduler není měření startup výkonu. U konkrétního cloud0.96 jsou celestial shadows vypnuté; správná spatial caster obnova při dt0 se stejným aktivním sun zůstává otevřená a vyžaduje vlastní explicitní řešení. Neproběhl GPU, fullsuite, build, integrace, server ani install/pnpm. Neproběhl samostatný typecheck tohoto cache-only proofu.

Nejmenší opodstatněný další krok je oddělený QA experiment denní B6 OFF/ON camera-only přípravy s plnou readiness a korektní obnovou. Pro první diagnostické srovnání lze použít recorded replay. All-mesh sweep sám nepokryje odpojené props. Bounded shadow retention či širší zásah zatím tento proof neautorizuje; vyžadoval by srovnatelné GPU A/B, v němž po zlepšení main coverage prokazatelně dominuje zbylý depth churn, a důkaz zachování obrazu, cache budgetu a disposal/generation ownership.

## Předání a rezervace

Všechny vlastní pomocné procesy jsou ukončené, žádný port/GPU proces nevznikl. `manifest.json` zahrnuje tento handoff a všechny finální proof/test/log soubory; jeho SHA dostává root v předávací zprávě. Po této zprávě následuje release stejného ownera; registr je autoritou času uvolnění. Release neoznačuje migraci ani KEY-31 za dokončené. Root přebírá důkazy, volbu navazujícího QA, archivaci a případný commit; tento agent nic necommituje.
