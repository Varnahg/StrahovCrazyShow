# Renderovací praxe – čtecí rešerše

Vše přečteno3.11.2026,6zdrojů/5webcalls. Dokumentace je rolling; přesná shoda každé volby s9.30 nebyla nezávisle potvrzena. Žádné tvrzení o FPS této hry.

- R1: CPU scope, GPU execution a prezentace jsou odlišné časové osy; profilovat současně, nesčítat překryvy. Snížení pixelů při stejných objektech testuje citlivost na fragmentovou práci; samostatné zjednodušení geometrie jinou větev. NVIDIA, bezdata, mechanismus/střední jistota: https://github.com/NVIDIA/elements/blob/main/.agents/skills/guidance-webgpu-performance/references/performance-diagnostics.md
- R2: Babylon poskytuje oddělené counters. TransformNode není renderovaný mesh; frozen transform/material/list potřebuje invalidaci, RTT může vyžadovat explicitní registraci. BabylonJS, bezdata, mechanismus/střední jistota9.30: https://github.com/BabylonJS/Documentation/blob/master/content/features/featuresDeepDive/scene/optimize_your_scene.md
- R3: Thin instances snižují počet JSobjektů, ale sdílejí hrubší viditelnost a jsou méně vhodné při časté změně členství. Prostorové skupiny jsou návrh k otestování, ne garantované zrychlení. BabylonJS, bezdata: https://doc.babylonjs.com/features/featuresDeepDive/mesh/copies/thinInstances
- R4: WebGPU caches/bundles mohou opakovat submission; změny resources vyžadují invalidaci. Snapshot rendering vyžaduje kontrolu dynamické scény. BabylonJS, bezdata,9.30transferstřední jistota: https://github.com/BabylonJS/Documentation/blob/master/content/setup/support/webGPU/webGPUInternals/webGPUOverview.md
- R5: Kompilace/upload/inicializace se musí oddělit od ustáleného renderu. Asynchronní pipeline nebo cache nedokazuje předpřípravu všech variant aplikace. Chrome,5.9.2023: https://developer.chrome.com/blog/new-in-webgpu-117
- Šestý zdroj index nepřidal mechanismus: https://doc.babylonjs.com/setup/support/webGPU/webGPUOptimization

Nedoporučené plošné zásahy: freeze všech active meshes/bounds; převést všechny objekty do jedné thin-instance skupiny. Dynamické rozlišení a konkrétní cadence stínů v tomto krátkém průchodu nemají dostatečnou samostatnou evidenci; doplnit jen při potřebě doporučení.
