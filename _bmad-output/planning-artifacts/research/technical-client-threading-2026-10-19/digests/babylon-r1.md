# Babylon full core 9.30 — 19. 10. 2026

Read-only agent babylon_worker_research. S = C:/Users/rezac/.codex/worktrees/29fa/StrahovCrazyShow/.cache/webgpu-medium-vehicle-user-build-20261019/snapshot; C = S/node_modules/@babylonjs/core. Závislosti jsou chráněný junction do patchovaného 9.30.0, nebyly změněny. Místní audit je samostatná projektová evidence, nikoli externí benchmark.

Externí primární zdroje načtené 19. 10. 2026:
- https://doc.babylonjs.com/features/featuresDeepDive/scene/offscreenCanvas/ a https://www.babylonjs.com/Demos/Offscreen/source/ — full @babylonjs/core Engine + GLB demo. Dokládá worker architekturu, nikoli WebGPU paritu této hry.
- https://doc.babylonjs.com/setup/support/webGPU/webGPUOptimization/webGPUNonCompatibilityMode/ — render bundles mohou omezit submission, ale rekreace při změnách stojí čas.
- https://doc.babylonjs.com/setup/support/webGPU/webGPUOptimization/webGPUSnapshotRendering/ — dynamické změny vyžadují invalidaci.
- https://doc.babylonjs.com/features/featuresDeepDive/mesh/copies/thinInstances/ — méně JS objektů, kompromis cullingu/skupin.
- https://doc.babylonjs.com/features/featuresDeepDive/materials/shaders/computeShader/ — compute pro numerické algoritmy; readback může rušit přínos.
- https://doc.babylonjs.com/features/featuresDeepDive/importers/glTF/ — existující Draco/KTX2 dekodéry a worker infrastruktura.
- https://emscripten.org/docs/porting/pthreads.html — WASM threads potřebují odpovídající build a izolaci.
- https://html.spec.whatwg.org/multipage/workers.html — module worker nepovoluje importScripts.

Přesný audit:
- C/Engines/engine.pure.d.ts:264 a webgpuEngine.pure.d.ts:422 přijímají OffscreenCanvas.
- C/Rendering/renderingGroup.js:199–214 volá subMesh.render sekvenčně. Scene je vlastněna jedním Engine (scene.pure.js:1583,4130,4220).
- C/Engines/abstractEngine.pure.js:1189,1208 bez window DPR=1; resize:1225–1229 používá backing rozměr a znovu scaling. Nutný explicitní CSS/internal kontrakt.
- C/Misc/precisionDate.js:9–13 používá bez window Date.now; PerfCounter:103,116 tedy nemá stejnou sub-ms přesnost. Worker A/B musí použít vlastní performance.now.
- C/Misc/tools.pure.js:471–480 používá importScripts. Native WGSL policy v S/client/render-engine.ts:8–15,209 GLSL translator odmítá; ostatní lazy decoder cesty zůstávají gate.
- DynamicTexture může použít OffscreenCanvas (dynamicTexture.pure.js:26–49; abstractEngine.pure.js:1451–1458). Fonty a atlasový vzhled vyžadují skutečné ověření.
- Vestavěné Draco/KTX2 pools: dracoCodec.js:7–12,55–65; khronosTextureContainer2.js:152–181. Draco data přenáší, Geometry vzniká u Scene (dracoDecoder.js:143–144,179–202).

Varianty: (1) render worker oddělí UI, ale zůstává sériový renderer; (2) čisté geometrické joby lze offloadovat menším zásahem; (3) nezavádět redundantní decode pool; (4) WASM/Rust bez numerického hotspotu neřeší Babylon graph; (5) NCM/batching jsou přímější alternativy submission overheadu, ale musí mít obrazovou paritu. Jistota mechanismů střední až vysoká podle primárního kódu; všechny výkonové přínosy hry neověřené.

Produkční gate pro render worker: celý svět, stejné WGSL patche, GLB, DynamicTexture, stíny, kvality, resize/DPR, worker RAF, input/pointer lock, přesné label frameId, multiplayer pořadí, nový canvas po transferu, opakovaný teardown a skutečné CPU/GPU/frame/input/memory A/B. Malá kostka gate nesplňuje.
