# Předání: webgpu-car-parity-20261016

- Vlastník: `webgpu-01a14497-car`; příjemce: `webgpu-01a14497-root`.
- Pracovní kopie: `C:/Users/rezac/.codex/worktrees/webgpu-comparison/StrahovCrazyShow`, detached HEAD; výchozí commit `f8c522730f152d23f7355b2bc872f5a37b83cba3` (koordinační katalog nad runtime základem `960cb6f`).
- Výsledek: car paint instancing se řídí skutečným shaderovým jazykem načtených materiálů. WebGL/GLSL zachovává současnou cestu; explicitní experiment s GLSL PBR na WebGPU použije tutéž cestu. Běžný WebGPU/WGSL, chybějící instanced arrays a explicitní `paintInstancing: false` zachovávají původní per-colour materiály.
- Změněné soubory: `client/car-pack.ts`, `tests/car-webgpu-parity.test.ts`, tento handoff.
- Cizí WIP: checkout byl při převzetí čistý. Následně koordinátor a engine agent upravovali své disjunktní soubory; nic z toho nebylo převzato do tohoto tasku.

## Průzkum a rozhodnutí

Primární zdroj: skutečně instalovaný `@babylonjs/core` **9.30.0** v hlavním checkoutu, čtený 16. 10. 2026, a projektový `client/car-paint-instances.ts`. Žádné zásahy do závislostí ani shaderového pluginu.

- `Materials/PBR/pbrBaseMaterial.pure.js:271` předává `forceGLSL || ForceGLSL` do konstruktoru materiálu. `Materials/material.pure.js:763` zvolí WGSL jen pro WebGPU bez tohoto opt-in. Jazyk je zachycen při vytvoření materiálu.
- `Materials/materialPluginManager.pure.js:38` ověřuje plugin proti **skutečnému** `material.shaderLanguage`. Projektový `CarPaintFallbackPlugin` deklaruje pouze GLSL a přidává GLSL `surfaceAlbedo` násobení pro běžný draw.
- `Engines/webgpuEngine.pure.js:1542–1580` obsahuje cestu GLSL → glslang/SPIR-V → Tint/WGSL → GPU shader module. Existence této cesty je zdrojový důkaz podpory, nikoli důkaz úspěšné kompilace celé herní varianty.
- `Meshes/instancedMesh.pure.js:586–714` registruje stride a na WebGPU vytváří VBO pro jednotlivé render passes. Zabraňuje tomu, aby pozdější `queue.writeBuffer` přepsal data všech průchodů. Existující `instanceColor` má čtyři floaty, tedy 16 bytů na instanci.
- `Meshes/mesh.pure.js:950` považuje registrovaný instance stream za přítomný i před vytvořením jeho per-pass VBO. Stávající pluginový `prepareDefines` je proto použitelný i při této cestě.
- `Engines/WebGPU/webgpuCacheRenderPipeline.js:826` bere skutečný `effectiveByteStride` a `getIsInstanced()` pro vertex layout; není potřeba nový layout ani změna assetu.

Porovnané varianty:

1. Nechat WebGPU guard beze změny: nejmenší změna, ale jiné paint batchování/draw workload mezi produkčním WebGL a experimentem.
2. Vypnout paint instancing v obou větvích: srovnatelné, avšak odchylka od současné produkční cesty a více barevných materiálů.
3. Povolit všechno podle `isWebGPU`/globálního `ForceGLSL`: samotný backend nezaručuje kompatibilitu a globál nemusí odpovídat už vytvořeným materiálům.
4. Přepsat plugin do WGSL: jiná implementace shaderu, nové vizuální riziko a zbytečně širší rozsah pro tento A/B experiment.
5. **Zvoleno:** ověřit GLSL na všech skutečných paint materiálech, vedle existujících capability/option podmínek. Beze změny veřejného API, assetů, PBR nastavení, barev nebo LOD.

Refaktoring přesunul výběr paint sources na jedno místo společné pro kontrolu jazyka a instalaci. Jde o malou jednorázovou alokaci při načtení packu; žádná nová práce v render loop. Sdílená `WeakMap` cache, počet leases, cleanup materiálů/textur/instancí i původní shaderový plugin zůstávají stejné.

## Ověření a předání

- Nový test načítá skutečné tři GLB LOD, porovnává geometrii SHA-256, PBR parametry, barvy v lineárním prostoru, sdílení barevných zdrojů a LOD prahy mezi běžným WebGL a vynuceným WebGPU/GLSL.
- Používá skutečné Babylon balení instance dat včetně WebGPU per-pass VBO a kontroluje 16bytový stride i packed Float32 hodnoty.
- Ověřuje WGSL fallback, explicitní opt-out, chybějící instanced arrays, sdílení packu mezi leases a odstranění meshes/materials/textures.
- Testovací engine je NullEngine s nastaveným backendovým kontraktem. **Neprovádí GPU kompilaci, rendering ani měření výkonu.** Vizuální parity, converter, mirrored draw uniformy a WebGPU fast bundles vyžadují navazující browserovou přejímku koordinátora.
- Příkaz pro koordinátorův frozen snapshot s vlastními závislostmi: `pnpm exec tsx --test tests/car-webgpu-parity.test.ts tests/car-paint-instances.test.ts tests/car-material-budget.test.ts tests/realistic-car-pack.test.ts`.
- První cílený běh (koordinátorův frozen snapshot, 16. 10. 2026 14:39 CEST) skončil exit 1, **14/15 pass**. Nový test chybně četl `effectiveByteStride`, což je WebGPU alignment rozšíření nepřipojené u NullEngine. Opraveno na základní veřejné `VertexBuffer.byteStride`; žádná runtime změna nebyla potřeba. Původní log zůstal v `.cache/webgpu-comparison/logs/car-targeted.log`.
- Druhý společný běh (14:41 CEST, `.cache/webgpu-comparison/logs/backend-targeted.log`) odhalil rozdílné geometry hashe; ostatní porovnávané paint hodnoty souhlasily. Hypotéza rozdílné Array/TypedArray serializace byla následným během **vyvrácena**: všechny typy byly stejné a `Array.from` nezměnilo výsledek. Současná typová kontrola odhalila nesprávný název LOD property v novém testu; opraveno na pinned `distanceOrScreenCoverage` s dodatečnou kontrolou konečných a různých prahů.
- Třetí běh (14:43 CEST, `.cache/webgpu-comparison/logs/backend-targeted-v3.log`) stále hlásil geometry hash rozdíl; typová kontrola už prošla. Následný read-only inline CPU experiment ve frozen cwd v 14:45–14:46 zjistil: positions, indices i world matrices přesně stejné; pouze 175/78/19 normal komponent v near/medium/far se lišilo, maximálně `2.9802322387695312e-8`.
- Mechanismus byl reprodukován dvěma importy **stejného WebGL backendu** ze sdílených `Uint8Array`: vznikly stejné rozdíly a změnil se SHA samotných zdrojových byte arrays. `mesh.pure.js:2559` v `bakeTransformIntoVertices` normalizuje normály in-place; glTF accessor může být pohledem do vstupního GLB. Druhý test tedy zpracovával už mutovaný zdroj. Při čerstvých GLB byte arrays jsou WebGL/WebGPU normály přesně shodné. Normálové SHA-256 (JSON numeric array) pro oba backendy: near `f729997e952a7071ac1fb178242d21ee3818f63d4925da077ce1e1b53b559439`, medium `80adb4ae7a922c62b97a9603ef105556e7fc802eff4b9554e34ef9da1c9f2338`, far `651597630067015b8ff3229fc2f6ab786d6578f97bb1e2288dc5f5a1bea00340`.
- Opraven pouze nový test fixture: každá nezávislá scéna znovu načte původní bytes. Porovnání zůstává přesné, bez numerické tolerance/zaokrouhlení. Není to zjištěná odchylka produkčního backendu.
- Finální společný cílený běh v4: **PASS 34/34, exit 0**, `.cache/webgpu-comparison/logs/backend-targeted-v4.log`. Zahrnuje všechny tři nové car parity testy, existující paint/material/realistic-car regrese a navazující engine/diagnostic/UI kontrakty. Přesné numerické porovnání geometrie, barev, PBR hodnot a LOD prahů prošlo. Typová kontrola v3 prošla; po opravě čtení fresh bytes následuje koordinátorův strict build. Build/celá sada/integrace/GPU nejsou součástí tohoto podtasku.
- Snapshot/diff: samostatný commit obsahuje právě tři výše uvedené soubory; SHA je uvedeno v závěrečném předání koordinátorovi. Žádná cizí změna nebyla přidána.
- Procesy a zdroje: žádný server, GPU kontext, build ani dlouhožijící pomocný proces nebyl spuštěn. Pouze read-only průzkum, editace vlastních souborů a jejich formátování.
- Rezervace se uvolňuje ihned po tomto samostatném commitu; aktuální výsledek `release` je předán koordinátorovi. Žádný proces nezůstává. Task status, GPU přejímka a přijetí do `docs/verification.md` patří koordinátorovi.
