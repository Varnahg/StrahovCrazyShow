# Předání: webgpu-migrate-vegetation-wgsl-20261016 (KEY-25)

Vlastník `webgpu-mig-01a14497-veg`, příjemce root `webgpu-mig-01a14497-root`; WT `C:/Users/rezac/.codex/worktrees/webgpu-comparison/StrahovCrazyShow`, větev `codex/webgpu-migration`. Práce vychází z autorizované úplné migrace a výzkumu nad b1b25d1. Původní A/B a frozen4188 zůstávají beze změny.

## Rozhodnutí před implementací

Pinovaný Babylon 9.30: MaterialPluginManager volá isCompatible/getCustomCode/getUniforms s jazykem materiálu. Pro WGSL vytváří z ubo typů vlastní deklarace; GLSL vertex/fragment declaration text proto nelze kopírovat. Native PBR hooks používají mesh.world, uniforms.*, vertexOutputs/fragmentInputs a immutable swizzle hodnoty. Tree hook běží před instancesVertex; používá původní mesh world, nikoli dosud neexistující finalWorld. PhotoGrass vlastnictví UBO se vybírá podle rendering mesh metadata při každém hard bind, nikoli podle jednotné instance pluginu.

Varianty: pokračovat v GLSL runtime konverzi by nesplnilo native migraci; obecná regex translace by skryla rozdíly swizzle assignment, ternary a UBO scope; nový shader DSL pro tři malé pluginy by přidal nové API a provenienční řetězec. Vybrány explicitní WGSL recepty vedle nezměněných GLSL referencí, se společnými původními host bindings a datovým kontraktem. Native vektory se přestaví celé; PhotoGrass focusT má skutečnou podmínku, aby nulový focusLength nikdy nevyhodnocoval dělení nulou. Koeficienty, pořadí math, wind/time, inverse-transpose normals/tangent shear, root fade a instance identity se nemění.

Přesný scope: client/tree-wind.ts, client/grass-material.ts, client/photo-grass-wind.ts, tests/wgsl-vegetation.test.ts, tests/tree-appearance.test.ts, tento handoff a vlastní `.cache/webgpu-migration-checks/vegetation/`. Factory/Game/quality/assets/kolize se nemění. Původní tree-appearance test obsahoval opačný WGSL-null kontrakt. Zápisy byly pozastavené a claim uvolněn; root jej rozšířil v katalogu commitem3460e8e. Po výslovném převzetí vlastních pěti WIP cest následoval oprávněný --adopt-dirty reclaim a teprve potom úzká aktualizace tohoto testu.

## Implementace a refaktoring

Všechny tři pluginy nyní přijímají GLSL i WGSL. Native recepty jsou neměnné sdílené objekty mimo callback, takže se nevytvářejí při každé shaderové přípravě. GLSL recepty a UBO deklarace zůstaly přesně stejné; nové jazykové větve mění pouze shaderový zdroj a vypouštějí duplicitní GLSL deklarace v native cestě. Host bind metody, rozsahy/kvalita, proměnné počasí, per-owner metadata, materiály/textury, alokace instance bufferů i dispose zůstávají stejné. Tree native větev zachovává tangent.w. Grass/PhotoGrass zachovávají worldPos.y/w a finální světové varyings; PhotoGrass dělí pouze při původní kladné focusLength podmínce. Nebyla přidaná nová cache, uniform, texture read nebo runtime observer.

Nový test prochází skutečným MaterialPluginManager UBO/PrepareEffect callbackem a native PBR ShaderStore/ShaderProcessor pro **12 kombinací** tří pluginů, regular/thin instance a tangent/no-tangent. Kontroluje jediné UBO deklarace, správný varying/attribute interface a nepřítomnost GLSL deklarací. Další kontroly vytvářejí skutečný PBR materiál v obou jazycích, ověřují aktualizace času/větru ve frozen materiálu a per-rendering-mesh PhotoGrass metadata/fallback. Původní tree test rozšiřuje existující normal/tangent kontrakt na nově podporovaný WGSL a zachovává jeho nezávislou geometrickou regresi.

## Skutečné ověření

Vlastní izolovaná kopie vstupů je v `.cache/webgpu-migration-checks/vegetation/`; node_modules, public a assets jsou pouze čtené junctiony na rootův historický frozen snapshot. Nebyl proveden install nebo zápis přes tyto junctiony. Testové soubory kopírují aktuální vlastní zdroje; výchozí GLSL reference byly získané pomocí git show b1b25d1.

- První přípravný shell příkaz měl nesprávný cwd, takže nenašel formatter/copy cesty ani nový test. Neproběhla shaderová regrese ani zápis mimo vlastní cache. Zachováno v `runner-note.md`.
- `node --import tsx --test --test-concurrency=1 tests/wgsl-vegetation.test.ts`: **3/3 PASS**, 3.11 s, exit0 (`targeted-native-v1.log`).
- `node --import tsx --test --test-concurrency=1 tests/wgsl-vegetation.test.ts tests/tree-appearance.test.ts tests/photo-grass.test.ts tests/vegetation.test.ts tests/vegetation-runtime.test.ts`: **37/37 PASS**, 36.33 s, exit0 (`targeted-final-v1.log`).
- `node typecheck.mjs`: úzký program se třemi runtime kořeny a dvěma změněnými testy, **3181 importovaných souborů, 0 diagnostik**, exit0, 7.96 s (`types-v1.log`). Nejde o celý projektový build.
- `node --import tsx compare-reference.mjs`: skutečné GLSL getCustomCode(vertex/fragment) a getUniforms výsledky všech tří pluginů **přesně shodné** s b1b25d1; SHA zůstávají v `reference-parity.log`. Tento audit není náhradou native obrazové parity.
- Scoped Prettier a `git diff --check` exit0. `manifest.json` obsahuje SHA šesti předaných souborů včetně obou testů.

## Meze a předání

Native shader processor/NullEngine jsou CPU kontrakty, nikoli WGSL typová validace ovladačem. Skutečný shader compiler, obraz větru, celestiálních/lokálních stínů, listových hran/fade, LOD a výkon musí ověřit root na GPU nad kompletním native checkpointem. Zde nebyl použit glslang/Tint ani jiná konverze k potvrzení native cest. ShadowDepthWrapper kompatibilitu zkoumá jiný agent a tento task ji nemění. Factory/Game nadále rozhoduje root až po dokončení dalších pluginů; tento port sám nezapíná produkční WebGPU.

Žádný vlastní GPU/build/full-suite/server, instalace ani dlouhožijící proces neběžel. Všechny cílené procesy skončily. Po explicitním stagingu šesti vlastních souborů, samostatném commitu a předání bude claim uvolněn; root obdrží konkrétní commit a release a rozhodne o přijetí/integraci. Cizí surface plugin WIP a koordinační dokumenty nejsou součástí commitu.
