# Předání: webgpu-migrate-sky-wgsl-20261016 (KEY-28)

Vlastník `webgpu-mig-01a14497-sky`, příjemce root; pracovní kopie `C:/Users/rezac/.codex/worktrees/webgpu-comparison/StrahovCrazyShow`, větev `codex/webgpu-migration`. Scope převzat a claim získán před zápisem. KEY-25 je předaný samostatně v a62dce1.

## Průzkum a rozhodnutí před implementací

Prozkoumány všechny tři ShaderMaterial cesty: neprůhledná atmosphere dome, alpha Sun a alpha Moon, sdílený cloud sampling, všechny časové/barevné/astronomické uniformy, mat3 star transform, mipy/wrapping, kvalita, implicitní derivace a depth pravidla. Původní GLSL hoist oprava z 84a757b už předchází pixelovým returns/discards. Sky/Sun/Moon nepřijímají skutečné světelné/shadow varianty v shaderu, sampler/textury používají vlastní display colours; povrchový image processing se nepřidává. Sun/Moon mají applyFog=false, no depth write a explicitní farDepth, aby je zakryla skutečná vzdálená geometrie. ShaderMaterial může přidat FOG define/uniforms podle meshe, ale současné autorské shadery žádné fog includes nemají; port tento obraz nemění.

Varianty: runtime GLSL konverze nesplní native cíl; převzatý generovaný WGSL/Tint output by zanesl složitý nedoložený meziformát a converter dependency; společný DSL by měnil oba dosavadní zdroje a rozšiřoval riziko. Vybrané ručně vyjádřené native WGSL recepty v samostatném atmosphere-wgsl.ts zachovají původní GLSL reference. Sdílená cloud funkce a celestial vertex budou jediné pro všechny odpovídající materiály. Cloud edge/ray coefficients se předají z existujících konstant při jednorázové registraci, takže nevznikne nezávislý odhad škál. Výběr shaderLanguage bude explicitní podle skutečného enginu; factory ani ForceGLSL tento task nemění.

Primární podklady jsou pinované Babylon9.30 ShaderMaterial.isReady/bind, WebGPUShaderProcessorWGSL, WebGPUPipelineContext.setMatrix3x3 a UniformBuffer._updateMatrix3x3ForUniform; ShaderStore.ShadersStoreWGSL a stock native shader conventions. Native mat3 má12 float slotů, ale host stále dodává původních9 čísel a Babylon je zarovná. WGSL implicit textureSample zůstane v uniform control flow; bez LOD0, disableUniformityAnalysis nebo texture/colour změn. Žádný stínový wrapper se těmto materiálům nepřidává.

## Implementace a refaktoring

Nový atmosphere-wgsl.ts registruje pět nativních zdrojů v odděleném ShaderStoreWGSL: dome vertex/fragment, společný celestial vertex, Sun a Moon fragment. Každá ShaderMaterial cesta výslovně nastavuje jazyk podle skutečného engine.isWebGPU; Standard/PBR ForceGLSL, továrna enginu a Game zůstaly beze změny. Registrace probíhá jednou při importu, nikoli během renderu. Sdílené cloud funkce a parametry se generují jednou, neběží runtime GLSL konverze těchto native zdrojů. Původní GLSL recepty zůstávají byte-exact.

Native zdroje zachovávají číselné koeficienty a sled operací, implicitní mip sampling v uniform flow, UV/atan2 pořadí, astronomy/cloud uniforms a textury. Jediný WGSL select vybírá dva již existující směrové vektory; podmíněný thickness výpočet zůstává skutečným if, takže nevyhodnocuje degenerovaný smoothstep při nulovém coverage. Odpovídající zdrojové return/alpha/discard a farDepth pravidlo jsou zachované.

Při primárním review se výslovně ověřilo, že Babylon WGSL processor sám připojuje entry-point return a Y transform. Autorské main funkce proto nepředbíhají tuto injekci vlastním return. Helper funkce mají normální WGSL returns. Nevznikají nové GPU textury, další materiály/pass, mesh, observer, per-frame alokace, samostatný stav počasí ani jiný dispose lifecycle. Stínový wrapper na oblohu není přidán; fog/color/shadow vlastnictví se nemění.

## Ověření a evidence

Vlastní izolovaná kopie vstupů a logů je pouze `.cache/webgpu-migration-checks/sky/`. node_modules a public jsou read-only junctiony na rootův historický frozen snapshot. Žádný install ani edit přes ně nebyl proveden.

- `node --import tsx --test --test-concurrency=1 tests/atmosphere-native-wgsl.test.ts`: **3/3 PASS**,1.54s,exit0 (`native-v1.log`).
- `node --import tsx --test --test-concurrency=1 tests/atmosphere-native-wgsl.test.ts tests/atmosphere-sky.test.ts tests/atmosphere-light.test.ts tests/atmosphere-webgpu.test.ts tests/night-lighting.test.ts`: **22/22 PASS**,7.93s,exit0 (`targeted-final-v1.log`). Původní GLSL offline compiler regrese v atmosphere-webgpu.test.ts nebyla změněná a nadále prochází.
- `node typecheck.mjs`: targeted program zahrnuje tři runtime kořeny a oba WebGPU testy, **2964 importovaných souborů,0diagnostik**,exit0 (`types-v1.log`). Nejde o celý build.
- `node --import tsx compare-reference.mjs`: všech **5 původních GLSL ShaderStore zdrojů přesně shodných** s b1b25d1; jednotlivé SHA v `reference-parity.log`.
- Scoped Prettier a git diff --check PASS. `manifest.json` zahrnuje tři runtime soubory, oba testy (původní compiler test beze změny) a handoff.

Nový test vytvoří skutečný ShaderMaterial/controller v obou jazycích a porovná host uniformy, textury, mipy/wrap, blend/depth vlastnosti a geometrické/nebeské stavy v pěti UTC/day-night případech s pohybem a změnou kvality. Ověřuje kompletní cleanup. Skutečný native WGSL processor zpracuje12 párů (sky/Sun/Moon×fog define×reverse depth), porovná rozhraní se skutečnými material options, zajistí return až za engine Y transform a zkontroluje mat3 layout. Samostatná regrese používá pinovaný UniformBuffer matrix writer:9 původních hodnot se rozloží do12float slotů se zachováním vstupu.

## Meze a předání

CPU generation/NullEngine není skutečný WGSL typový/derivative validator a shaderové vzorce nebyly vykonávané na GPU. Root musí ověřit obraz oblaků/horizontu/hvězd, Moon limb/phase, zakrytí vzdálenou geometrií, atmosférické barvy a výkon v kompletní nativní hře. Tato CPU parita neprokazuje pixelovou shodu kompilátorů ani odstranění5s záseku. Původní browserové A/B a frozen4188 zůstávají neměnné.

Žádný vlastní GPU, build, full suite, server, install nebo dlouhožijící proces neběžel; všechny cílené procesy skončily. Po explicitním stagingu pěti změněných souborů, samostatném commitu a předání se claim uvolní; root dostane commit/release a vlastní přijetí, integraci, Linear i celkovou GPU přejímku. Surface a Game/UI WIP nejsou součástí tohoto commitu.
