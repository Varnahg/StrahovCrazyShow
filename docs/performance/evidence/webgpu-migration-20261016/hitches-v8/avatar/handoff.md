# Předání: webgpu-avatar-day-variant-proof-20261018

- Vlastník `webgpu-avatar-proof-01a14497`; příjemce root. WT `C:/Users/rezac/.codex/worktrees/webgpu-comparison/StrahovCrazyShow`, větev `codex/webgpu-migration`.
- Dokončený bounded CPU proof, nikoli produkční implementace. Zápis pouze vlastní `.cache/webgpu-migration-checks/avatar-day-variant-proof-20261018/` a tento handoff. Cizí WIP, hrané snapshoty a runtime beze změny; žádný commit ani další BMAD workflow.
- Readonly vstup: frozen `b6-preparation-v1` snapshot `a94ea6ced62b1aa5a3e7c5f94aa4884cce83f30bb5063cda2e4e126507f4eb78`, pinned Babylon9.30/dependencies-v5. Žádná nová kopie projektu: přímé frozen imports a přesné AST metody/closure.

## Rozhodovací výsledek

Pro skutečný Alex near, konkrétní day18.10.10:00Z/cloud0.96 a medium jsou obě varianty shodné s B6 third-person referencí:

- A: původní B6 controller/sampler světla, ale avatar a kamera ve spawn pose.
- B: přesná existující lokální closure `Game.prepareLighting.apply(day, flashlightOn, 1)` nad skutečným nejbližším mapped lamp `ipr2024-parking-south-central`. Je to menší kandidát: nevyžaduje další B6 režim kamery.

OFF i ON vykreslí12 skutečných near částí a použijí stejných7 unikátních hlavních Effectů jako reference. Úplné defines jsou byte-identické, nejen LIGHT fingerprint. Po restore a reference reentry jsou Effect IDs znovu shodné. OFF layout `POINT,DIR,HEMI`; ON `SPOT,POINT,DIR,HEMI`, cap4. Zapnutý mapped POINT má v B intensity0; změna pouze intensity0→0.7 ponechá stejné defines i Effects. Pinned `materialHelper.functions.js:639–668,858–890` připravuje light slot podle seznamu světel/type/falloff/specular, nikoli intensity; samotná nulová intenzita světlo nevypíná.

Skutečný `createAvatarRig`/`AvatarPrimitivePool`, `AvatarLodController` a `AvatarAnimator` vytvořily původní authored tělo, hlavu, oči, vlasové karty a mikinu. Skin body a garments mají `NUM_BONE_INFLUENCERS 4` + `BONETEXTURE`; head/ocular/hair jsou regular `INSTANCES`; strands mají `ALPHATEST`, `ALPHAFROMALBEDO`, `BUMP`. Žádné avatarové proxy boxy. Pozorování skutečného main pass čte až native `onAfterRender`/per-pass instance batch. Skrytý near avatar je odpojený a má0drawn; existující ready Effect se nevydává za jeho vykreslení.

## Metoda, IO a limity

Game apply closure, `updateWorldPresentation`, `updateRenderEnvironment`, `updateCameraFollow`, `updateAvatarPresentation`, B6 light konstrukce/update a mapped lamp setup se načítají z původního AST beze změny jejich těl. B6 velká geometrie ani props se nekonstruují; reference přesune jen skutečný rig této fixture, actor zůstává deep-frozen na spawn. A/B používají původní spawn prezentaci. Přímé imports obsahují původní avatarová data/materiály/LOD, nikoli kopii jejich algoritmu. Pro osvětlení jsou použité tři skutečné nejbližší mapped lamp položky; B žádá právě jednu.

Root výslovně schválil úzký raw-texture upload IO adapter: nativní NullEngine alokace zachovává dimensions, format, type, sampling, mip/invert flags i původní byte buffer; adapter dodá pouze chybějící dokončení uploadu. Report uvádí všechna3volání a SHA dat: dvě64×64 RGBA/unsigned normals a56×1 RGBA/float bone texture. Žádná metoda material/Effect readiness se nemění. Všechny tři raw textury skončily s references0. Ostatní URL textury používají standardní NullEngine dummy upload; obraz a skutečné rozměry fotografických textur se tím neověřují.

Caps pro CPU frontend výslovně povolují instancing, derivatives a float textures, aby se neztratily BUMP/BONETEXTURE větve. NullEngine však používá GLSL a requested PCF padá na POISSON. SHADOW0 je v ON skutečně přítomné, není to důkaz WebGPU PCF layoutu/pipeline. Sky raster/IBL a collision jsou explicitní IO stubs; žádné okolní occluders, plná avatarová animace, další avatar/LOD ani aktivní celestial caster výběr se neověřují. V daném počasí jsou celestial shadows vypnuté. Referenční kamera je uložená z měřeného GPU pilotu, nikoli nový navrhovaný shipping pohled.

Výsledek podporuje další samostatný QA experiment B s plnou readiness a původní obnovou. Neprokazuje, kolik z10zbylých produkčních kompilací tím zmizí, nenahrazuje WebGPU měření a nevybírá shadow retenci.

## Ověření a cleanup

- `TSX_DISABLE_CACHE=1 node --import tsx probe.ts`, finální `probe-final.log`, exit0. UTC18.10.00:19:15.265–00:19:15.741;17captures,6přesných A/B/reentry porovnání, intensity-only a hidden/restore assertions PASS. Tento krátký interval není GPU/performance benchmark.
- `node summarize.mjs`, `summary.log`, exit0; znovu ověřuje všechny plné defines/Effect identity, cap4, SHADOW0 OFF/ON, hidden0draw a raw references0.
- První průchod `probe-initial.log` měl pouze částečné draws kvůli nedokončeným raw normals, proto není akceptovaným výsledkem; původní `report-before-raw-io-adapter.json` zůstává zachovaný. `probe-assertions.log` zaznamenává příliš přísnou přesnou rovnost camera smoothing; finální check používá původnímu controlleru odpovídající toleranci0.01m (skutečná odchylka v reportu). Žádné selhání se netvrdí jako PASS.
- Cílený refaktoring sjednotil AST načítání, capture, native batch observation a scénářový render s požadavkem na draw všech12near částí. Runtime algoritmy/cache nedotčené.
- Actor/weather/požadovaný flashlight/time/ready zůstaly nezměněné; kamera se vrátila do0.01m, rig/LOD/counts přesně. Observers odstraněné, scéna/engine/rig/controller/pool a vlastní textury dispose. Žádné pomocné procesy ani porty nezůstaly.
- Neproběhly fullsuite/build/integration, GPU, install/pnpm ani samostatný typecheck cache-only probe. Snapshot/zdroje/probe/report/logy a tento handoff obsahuje vlastní `manifest.json`; přesné SHA dostává root ve zprávě.
- Po explicitním předání následuje release téhož ownera; čas dokládá živý registr. Root převezme archivaci, rozhodnutí o QA a případnou implementaci. Release neoznačuje KEY-31 za Done.
