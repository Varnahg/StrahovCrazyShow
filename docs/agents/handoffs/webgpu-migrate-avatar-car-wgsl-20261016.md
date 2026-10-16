# Předání: webgpu-migrate-avatar-car-wgsl-20261016

- Vlastník: `webgpu-mig-01a14497-avatar-car`; příjemce: `webgpu-migration-01a14497-root`.
- Worktree: `C:/Users/rezac/.codex/worktrees/webgpu-comparison/StrahovCrazyShow`, větev `codex/webgpu-migration`, výchozí commit `faf4a2576b5ad502ef1f2442f55bda4654230129`.
- Verzované soubory: `client/avatar-hair.ts`, `client/car-paint-instances.ts`, `client/car-pack.ts`, `tests/wgsl-avatar-car.test.ts`, `tests/car-webgpu-parity.test.ts`, tento handoff. Výchozí cizí WIP oblohy/health/vendor úkolů nebyl převzat ani měněn.
- Výsledek: nativní WGSL StudentHairTint a mirrored car paint fallback; car pack používá stejný native `instanceColor` stream v GLSL i WGSL. Zachována původní GLSL reference, geometrie, UV, atlas alpha, materiálové kalibrace a metadata. Preview/editor ani jiné entrypointy nejsou tímto taskem měněny.

## Průzkum a rozhodnutí

Přečten Linear [KEY-27](https://linear.app/gigeconomy/issue/KEY-27/webgpu-nativni-wgsl-vlasy-barvy-aut-a-instance-vsech-lod) a skutečné Babylon 9.30 zdroje v read-only závislostech historického A/B snapshotu.

- `ShadersWGSL/ShadersInclude/pbrBlockAlbedoOpacity`: vlasový `CUSTOM_FRAGMENT_UPDATE_ALBEDO` je uvnitř funkce. Používá původní lokální `albedoTexture`, `albedoInfos` a `vAlbedoColor`, nikoli náhodné globální aliasy. `helperFunctions` poskytuje vektorový `toLinearSpaceVec3`, včetně stejné exact/approx sRGB varianty jako engine.
- Původní RGB sample se neutralizuje stejnou luminancí `0.2126/0.7152/0.0722`, násobí stejným texture level a omezí na `0.45..1.55`. Alpha/discard dál vlastní původní PBR blok. Cutoff zůstává `0.42`, roughness `0.76`, oboustranné světlo i depth write zůstávají stejné.
- WGSL `instancesDeclaration` a `vertexColorMixing` podporují `instanceColor: vec4<f32>` → `vertexInputs.instanceColor` → `vColor`; PBR albedo blok barvu spotřebuje. Stávající 16bytový stream a `INSTANCESCOLOR` oprava pro LOD source zůstávají.
- `instancedMesh.pure.js` přepíná opačný determinant na regular draw. Stávající `hardBindForSubMesh` proto musí dál zapisovat skutečný tint každého efektivního mesh; WGSL fallback čte `uniforms.carPaintFallback` v main před světly. UBO layout tří floatů a bind lifecycle nebyl změněn.
- `CarShadowProxyPack` používá standardní Babylon `StandardMaterial`, nikoli vlastní ShaderMaterial. Shadow proxy geometrie/metadata a shared skeleton/bone-texture logika se tímto portem nemění. Samostatnou native ShadowDepthWrapper kompatibilitu řeší vendor task.

Porovnané varianty: ponechat GLSL konverzi (nesplní nativní cíl), vrátit per-colour material clones (jiný draw workload/cache), nebo nativní hooky nad původními daty (zvoleno). Refaktoring přesunul GLSL/WGSL recipe objekty do sdílených immutable konstant, takže se při každém dotazu zbytečně znovu nevytvářejí. Žádný nový per-frame stav, neomezená cache, texture sample, uniform pro vlasy ani další draw call.

## Ověření

Vlastní `.cache/webgpu-migration-checks/avatar-car/` obsahuje potřebné vstupy a testy; `node_modules` je read-only junction na historický `.cache/webgpu-comparison/frozen/node_modules`. Používány **pouze přímé existující Node CLI**, žádný pnpm bootstrap/install, změna závislostí ani cizího kořenového node_modules.

- Manifest `source-manifest.json`: **`ece7250ba40bf9330186fec151af4dd3932d0e1c58faec8f0bfe225237958d36`**, 228 kopírovaných vstupů včetně testů. Jde o cílenou CPU kopii, nikoli úplný produkční checkpoint. Hash každého z pěti změněných runtime/test souborů byl porovnán se skutečným worktree a shoduje se.
- `node node_modules/tsx/dist/cli.mjs --test tests/wgsl-avatar-car.test.ts tests/car-webgpu-parity.test.ts tests/car-paint-instances.test.ts tests/car-shadow-proxy.test.ts`: **15/15 PASS, exit 0**, 16. 10. 2026 17:15 CEST, `targeted-v3.log`.
- `node node_modules/tsx/dist/cli.mjs --test --test-name-pattern 'Alex and Sam|colour edits' tests/student-hair.test.ts`: **2/2 vybraných regresí PASS, exit 0**, `hair-lifecycle.log`. Source-master a ostatní testy tohoto souboru nebyly v tomto výběru spuštěny.
- Cílený strict TypeScript nad čtyřmi výše uvedenými car/native testy: **PASS, exit 0**, `types-v2.log`. Příkaz: `node node_modules/typescript/bin/tsc --noEmit --strict --skipLibCheck --target ES2022 --lib ES2022,DOM,DOM.Iterable --module ESNext --moduleResolution Bundler --esModuleInterop --resolveJsonModule --allowImportingTsExtensions --types node tests/wgsl-avatar-car.test.ts tests/car-webgpu-parity.test.ts tests/car-paint-instances.test.ts tests/car-shadow-proxy.test.ts`.
- Zachován `targeted-v1.log`: 14/15 PASS; nový test nesprávně čekal inline číslo alpha cutoff, zatímco pinned WGSL processor správně emituje `const ALPHATESTVALUE = 0.42`. Opraveno očekávání definice i jejího použití, bez runtime opravy. První fixture také modelovala nízké NullEngine/WebGL1 capabilities; nyní explicitně zapíná float textures a testuje skutečnou produkční bone-texture cestu, nikoli uniform fallback. Výstrahy původní fixture nejsou GPU zjištění.
- Zachován `types-v1.log`: chyběl pouze zkopírovaný existující `scripts/car-glb-reader.d.mts`; po doplnění check vstupu prošla kontrola bez runtime/test kódové změny.

Nové důkazy: skutečný Babylon PBR WGSL shader processing vlasů pro obě textury a gamma větve; stejná authored arithmetic; 6 současných avatar presetů s různými vlastními skeleton/bone textures, brýlemi/vousy a dvěma cykly barev, near/medium/far hair přechody a pruning; skutečný CPU Babylon paint draw dispatch všech tří LOD, dvou různých mirrored tintů, změn determinantů a kvalit, porovnaný s GLSL; přesné geometry/LOD/PBR/Float32 barvy ve skutečně importovaných GLB s fresh bytes pro každou scénu. Existující shadow proxy regrese potvrzují zachovanou referenční geometrii a caster výběr.

## Hranice a převzetí

NullEngine nahrazuje GPU program a draw submission. **Native WGSL driver validace, obraz, GPU shadow draw a výkon tímto nejsou prokázány.** Koordinátor musí provést společný checkpoint s aktuálním vendor patchem, materiály a zcela novým native enginem, poté skutečné avatary/auta a main/shadow obrazy. Shader processing test nepoužívá GLSL converter, ale není shader compiler.

Build, plná sada, server, GPU ani Blender nebyly spuštěny. Všechny vlastní krátké CLI procesy skončily. Samostatný commit obsahuje pouze šest uvedených verzovaných souborů; po něm release a předání SHA koordinátorovi. Linear průběžně aktualizován; KEY-27 není Done podle CPU výsledku.
