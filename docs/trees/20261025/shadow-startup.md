# Opakované shadow shadery při WebGPU startupu

26. 10. 2026, task `trees-20261026-shadow-startup`, owner `trees-shadow-startup-01a16b37`.

## Důkazy a mechanismus před opravou

Koordinátor doložil frozen v7 timeout v current-on pro WebGPU compatibility i fast režim. Fast má inert startup adapter, přesto zaznamenává 49 health preparation waits. Shader inventory v `.cache/trees-gpu-20261025/v7-webgpu-shader-inventory.json` obsahuje v current-on 372 modulů, z toho 288 opakovaných přesných bajtových kopií; šest raw skupin má každá 49 volání (tři vertex/fragment páry). Pending shader-validation je oddělené od Game preparation gate a samo nevysvětluje tyto health waits.

Primární připnuté Babylon 9.30 zdroje:

- `Meshes/mesh.pure.js:1042–1113`: `Mesh.isReady(true)` kontroluje hlavní materiál i shadow generátory; ve shadow kontrole přepíná render pass, nikoli color-write stav.
- `Lights/Shadows/shadowGenerator.js:750–777`: skutečný **PCF** shadow callback nastaví `engine.setColorWrite(false)` a po unbind vrátí true. **PCSS tuto větev nemá.** Setter filtru vyžaduje `supportShadowSamplers`; výchozí NullEngine jinak přejde na Poisson.
- `Materials/materialHelper.functions.js:944`: PBR `DEPTHPREPASS` se odvozuje z `!engine.getColorWrite()`.
- Projektový `FreshWebGpuShadowDepthWrapper` připravuje base materiál ve shadow passu kvůli aktuálním light-layout bindům.
- Pinned `Materials/shadowDepthWrapper.js:80–105`: změna base efektu pro tentýž submesh zruší odvozené depth entry. Poslední vlastník uvolní depth Effect; engine jej odstraní z cache.

**RED reprodukce před změnou wrapperu**: nový `tests/tree-shadow-startup-repro.test.ts` používá skutečný TreeWind+TreeSeason PBR, Fresh wrapper, `VehicleLighting(scene, "player")` na low a `scene.render()` včetně skutečných PCF callbacks. NullEngine nahrazuje pouze driver IO, běží skutečné GLSL PBR/Effect/cache cesty. Explicitní capability a assert potvrzují FILTER_PCF; nejde o nepozorovaný Poisson fallback.

Po zahřátí bylo 3 programů. Osm cyklů `mesh.isReady(true)` → `scene.render()` přidalo **16 programů (19 místo 3)**. Base `DEPTHPREPASS` střídal false po kontrole a true po renderu, depth Effect ID se měnilo 3→4→…→18 a staré efekty se uvolňovaly. Test očekávající stabilitu správně selhal, exit 1. Log `.cache/trees-shadow-startup-repro-20261026/red-first.log`. Tím je mechanismus reprodukovaný v připnutém CPU řetězci; opravu ještě musí ověřit native GPU candidate.

## Porovnané varianty

| Varianta | Dopady | Rozhodnutí |
| --- | --- | --- |
| Normalizovat PCF color-write pouze ve Fresh wrapper readiness, pak obnovit caller state | Nejmenší vlastník zná konkrétní generator/filter i shadow pass; sjednotí base variantu s actual draw bez změny hlavního renderu, cachí a světel | Vybráno |
| Přepnout globální color-write v Game během celého `mesh.isReady(true)` | Hlavní PBR kontrola by proběhla ve shadow stavu, více světel/filtrů může potřebovat jiný stav; Game nezná aktuálně kontrolovaný generator | Zamítnuto |
| Patch Babylon Mesh.isReady/ShadowGenerator | Může obecně sjednotit probe state, ale zásah do sdílené dependency a širší ownership/verifikace není pro doložený projektový wrapper nutný | Zamítnuto pro tento fix |
| Přeskočit freshness/base readiness, prodloužit timeout nebo snížit počet kontrol | Maskuje nesoulad a může vrátit zastaralé light UBO rozložení | Zamítnuto |

PCF je jediný opravený predicate podle konkrétního pinned callbacku. PCSS i ostatní filtry zachovají stav volajícího. WebGL/custom ShaderMaterial factory větev zůstává původní. Očekávaný přínos je odstranění doložených opakovaných kompilací; přesný GPU čas ani FPS nejsou odvozené z CPU počtů.

## Implementace a refaktoring

Wrapper používá veřejný `generator.usePercentageCloserFiltering`, jehož pinned getter přesně odpovídá `FILTER_PCF`; import ShadowGenerator zůstává type-only. Po původních retirement/pass/override guards a pouze pokud caller dosud zapisuje barvu nastaví pro readiness `colorWrite=false`. Base readiness, případná standalone cesta i depth selection/light-layout checks proběhnou v tomto skutečném PCF stavu. `finally` obnoví původní true; původní false se nepřepisuje. Již skutečný PCF render tedy nepřidává žádné write toggles.

Jediný scope/finally obaluje původní readiness řetězec; nevznikla druhá kopie base přípravy ani nový cache/controller. Nezměnily se shadow varianty používané při skutečném renderu, světla, uniformy, barvy assetů, culling, timeouty ani shader-validation pravidla. Dependency junction zůstal read-only.

## Výsledky a hranice

26. 10. 2026, 11:08–11:13 UTC:

- RED→GREEN: přesný původní repro po opravě po osmi check/render cyklech zachová **3 programy a tentýž živý depth Effect**; před opravou 19 programů a opakované uvolnění/recreation. První green spolu se stávající freshness sadou: 15/15 PASS, log `green-first.log`.
- Finální `node node_modules/tsx/dist/cli.mjs --test tests/tree-shadow-startup-repro.test.ts tests/webgpu-shadow-freshness.test.ts`: **32/32 PASS**, exit 0, log `.cache/trees-shadow-startup-repro-20261026/targeted-tests-final.log`.
- Doloženo: PCSS samostatně, PCF+PCSS současně na stejném PBR submeshi, PCF→PCSS→PCF změna filtru; stabilní warm programy/efekty. Standalone i běžná cesta připravují base právě jednou. Původní true/false se zachová při success, false, throw, wrapper/scene/engine disposal. Reentrant wrong-pass a draw-override guard neprovedou zápis a zachovají vnější scope.
- `node node_modules/typescript/bin/tsc --project .cache/trees-shadow-startup-repro-20261026/tsconfig.targeted.json`: **PASS**, exit 0. Config dědí kořenový tsconfig a zahrnuje pouze wrapper, nový test a jejich importy. První kontrola odhalila čistě testový union `string | MaterialDefines` při čtení DEPTHPREPASS; pozorování nyní používá přesný serializovaný define. Původní `targeted-types-first.log` zachován.
- `git diff --check` nad wrapperem: **PASS**.

Žádný native GPU, Blender, install, build, celá sada či integrace nebyly tímto taskem spuštěny. CPU fixture prokazuje přesný state/lifecycle mechanismus a program churn; nativní WGSL/pipeline stabilitu, skutečný startup a obraz ověří koordinátor na novém frozen kandidátu. Stav širší WebGPU migrace není tímto uzavřen.
