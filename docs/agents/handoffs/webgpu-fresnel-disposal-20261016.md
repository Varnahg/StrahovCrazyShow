# Předání: webgpu-fresnel-disposal-20261016 / KEY-37

- Vlastník: `webgpu-mig-01a14497-fresnel`; příjemce: root `01a14497`.
- Pracovní kopie: `C:/Users/rezac/.codex/worktrees/webgpu-comparison/StrahovCrazyShow`, větev `codex/webgpu-migration`; native base `31e48d6`.
- Výsledek: samostatná oprava vlastnického Fresnel cleanupu s reálnou CPU render/defines/lifecycle regresí. GPU podíl na původním přibližně čtyřsekundovém Game disposal a finální obrazová přejímka zůstávají otevřené.
- Změněné verzované soubory: pouze `client/cinematic.ts`, `tests/cinematic-fresnel-disposal.test.ts`, tento handoff. Vlastní vstupy, logy a combined kopie jsou pouze v `.cache/webgpu-migration-checks/fresnel/`.
- Cizí WIP: primary `client/cinematic.ts` nebyl editovaný ani adoptovaný. Jeho pipeline attachment/reuse změna (37+/3−) je zachovaná v oddělené combined kopii; nepatří do native commitu. Žádný patch, lockfile, asset ani dependencies se neměnil.

## Výzkum a volba

Pinned Babylon 9.30 `FresnelParameters.isEnabled` volá `AbstractEngine.MarkAllMaterialsAsDirty(Fresnel|Misc)` přes všechny scény všech enginů. Constructor s `isEnabled:false` volá stejný setter, takže není lokálním řešením. Původní `Cinematic.dispose` tuto operaci opakoval pro reflection a opacity každého okna ještě před `Game.scene.dispose`.

Veřejný material Fresnel setter s null invaliduje jen daný materiál, ale pinned StandardMaterial ponechá po posledním null staré FRESNEL/OPACITYFRESNEL defines; skutečný ready/render to reprodukoval a samotné `markDirty(true)` nestačilo. Veřejný `resetDrawCache()` po odpojení vytvořil správné nové defines/Effect u frozen i unfrozen materiálu. Je to menší zásah než vendor změna obecné Fresnel cache.

Setter `expandToProperty` navíc porovnává `.equals()`: může odmítnout nově vytvořený ekvivalentní objekt a ponechat předchozí cizí referenci. Exterior-only helper nevytváří opacity Fresnel, přesto jej původní dispose mohl vypnout. Externí null reflection náhrada mohla cleanup ukončit výjimkou.

Volba: evidovat jen skutečně přijaté vlastní identity, zachovat původní ownership guard reflection texture, veřejně odpojit pouze tyto vlastní reference a provést jeden material draw-cache reset. Parametry se nemutují; globální Fresnel setter se nepoužije. Nutný scene environment texture update a shadow/pipeline cleanup zůstávají.

Primární zdroje: pinované `Materials/fresnelParameters.pure.js`, `Misc/decorators.js`, `Materials/standardMaterial.pure.js`, `Materials/material.pure.js` v readonly dependencies-v5; upstream [FresnelParameters](https://raw.githubusercontent.com/BabylonJS/Babylon.js/9.30.0/packages/dev/core/src/Materials/fresnelParameters.pure.ts) a [setter decorator](https://raw.githubusercontent.com/BabylonJS/Babylon.js/9.30.0/packages/dev/core/src/Misc/decorators.ts). Konkrétní v6 pozorování a jeho hranice jsou v KEY-37; absence samostatného teardown GPU měření se nezakrývá.

## Implementace a refaktoring

- Společný interní configure helper vrací přijaté vlastní Fresnel reference. Veřejný `applyWindowSkyReflection` zachovává boolean API i všechny původní koeficienty, alpha, textury a vzhled.
- Scene controller používá mapu materiál→vlastnictví místo samotné množiny. Nový ownership objekt vzniká pouze při jednorázovém zpracování okna, ne v render loopu.
- Cleanup zachová externí texture takeover. Každou Fresnel property kontroluje samostatně přes přesnou referenci; nedotýká se equals-rejected, externě nahrazené ani exterior-only cizí opacity.
- Po všech detach změnách resetuje cache jednou na materiál. Úzké `null!` dokumentuje nesoulad deklarace 9.30 s existujícím nullable runtime; žádná vendor typová změna.
- Stávající kvality/day-night nepřevádějí vlastnictví. Repeated dispose zůstává idempotentní. Sdílený parametr může zůstat na jiném materiálu/enginu enabled, protože cleanup odpojí referenci místo změny objektu.

## Důkazy

Staging kopíruje jen vstupní source dependency graph a používá readonly junction na `.cache/webgpu-migration/dependencies-v5/node_modules`; nebyl spuštěn install/pnpm exec/build/server/GPU/full suite.

- `fresnel-red.log`: skutečný původní runtime **0/7 pass**, exit1. Dva globální Fresnel sweeps zasáhly vlastní i cizí engine; testy odhalily shared/external změny, exterior opacity i null replacement výjimku. RED zůstává uložený.
- `fresnel-green-v1.log`: **27/27 pass**, exit0, 4.382 s. Nových7 testů + existující `cinematic-atmosphere`, `window-sky-reflection`, `render-maintenance`, `cinematic` a `cinematic-pipeline`. Příkaz ve stagingu: `node node_modules/tsx/dist/cli.mjs --test tests/cinematic-fresnel-disposal.test.ts tests/cinematic-atmosphere.test.ts tests/window-sky-reflection.test.ts tests/render-maintenance.test.ts tests/cinematic.test.ts tests/cinematic-pipeline.test.ts`.
- `fresnel-types-v1.log`: scoped strict TypeScript **2959 souborů / 0 diagnostik**, exit0 (`node typecheck.mjs`). Roots: native `client/cinematic.ts` a nový test.
- Testuje se skutečný ready/render po cleanup, správné defines/Effect, zachované alpha/frozen, sdílené/source-instanced geometry, dva enginy, equals-rejected assignments, externí replacement/null/texture takeover, cizí exterior opacity, quality reuse, již disposovaný materiál a opakované dispose. Pouze raw cube storage je v NullEngine fixture CPU stand-in; nejedná se o GPU důkaz.
- Scoped Prettier a `git diff --check` PASS. `preservation.json` potvrzuje primary beze změny a staging obnovený na čistý native source.

## Oddělená combined kopie pro root

Primary HEAD `2644a6d` i native výchozí cinematic měly stejnou SHA `7ad7e26e49ec0c86f11b429ddf57fe3054e1fcda6aca357d0012e59df23a21f7`.

- Zachovaný primary WIP: `inputs/primary-wip.ts`, SHA `57b4a6bbc39448481d740ff490761dfc68b00a6a565eafd550084ef02db85193`.
- Čistý native výsledek: `inputs/native-after.ts`, SHA `b01306e45a67cb1b050a8cd18879bafd215c48db7d683de6cf228cb4e1d86bac`.
- `git merge-file -p native-after native-before primary-wip` skončil exit0, bez konfliktů. Combined je pouze `combined/cinematic.ts`, SHA `db72123f8856b5175069f27946b4c025069d16e97be33860dbc680352e50d6d5`; má současně cizí pipeline attach/reuse i tento Fresnel cleanup.
- Nad combined source byly samostatně spuštěny **7/7 nové regrese PASS** (`combined/fresnel-tests.log`, 1.912 s) a strict TS **2959/0** (`combined/types.log`). To není přijetí celé cizí pipeline změny ani její GPU ověření. Po tomto běhu je staging zpět na native source.
- `inputs/manifest.json`, `combined/manifest.json` a finální `manifest.json` zachycují přesné identity. Root před použitím combined kopie znovu ověří, že primary WIP stále odpovídá její vstupní SHA; nic neaplikovat automaticky nad novější cizí editací.

## Omezení, procesy a další krok

Současné `onMaterialRemoved` tracking semantics zůstaly zachované: tento úzký fix nově neslibuje AssetContainer remove/readd kontrakt. Odebrání není vždy disposal a public `resetDrawCache()` hledá jen meshe právě přítomné ve scéně; rozšíření pro dočasně odstraněné meshe vyžaduje další explicitní scope/reprodukci. V této opravě nebyla rozšířena ani obnova všech historických materiálových hodnot před zapnutím cinematic vrstvy.

Všechny vlastní CPU procesy skončily, žádný dlouhožijící proces/port k předání. Po commitu přesných tří souborů a předání rootovi se rezervace uvolní. Linear KEY-37 má průběžné research/decision/test komentáře a zůstává In Progress. Root vlastní finální merge, stabilní plnou pipeline a skutečný GPU teardown/obraz; 27 CPU testů nejsou jejich náhradou.
