# WebGL2/WebGPU: rozhodnutí před experimentem

16.10.2026, výchozí commit960cb6f; nový izolovaný worktree. Zadání je skutečné srovnání produkční scény, nikoli nasazení WebGPU. Frozen4188 e1b03fe/snapshot4dcb3f6f a veškerý původní WIP jsou nedotčené.

## Primární průzkum

Přečtené skutečné Game/UI/labels, rendererové pluginy, car pack, diagnostika a Babylon9.30 zdroje engine/init, materialPluginManager, Standard/PBR, timestampQuery. Dále oficiální Babylon WebGPU/NCM dokumentace: https://doc.babylonjs.com/setup/support/webGPU/webGPUOptimization/webGPUNonCompatibilityMode/ . Reprodukční základ jsou původní produkční výsledky night-flashlight-20261015; nejsou nové A/B.

WebGPU vyžaduje initAsync předScene; GLSL-only pluginy vyžadují StandardMaterial.ForceGLSL/PBRBaseMaterial.ForceGLSL. GLSL konverze sama není FPS důkaz a její runtime compiler závislosti/startup musí být identifikované. Car pack zatím naWebGPU vypíná paintinstancing; toto sjednotit a ověřit vzhled, jinak zapsat paritní blocker. getGlInfo se nahradí společným getInfo, skutečnou identitou API/adaptéru. LegacyGPUcounter může být0 bezencoder.writeTimestamp; nesmí se vydávat za nulovýGPUčas.

## Porovnání variant a volba

- Prostá výměna konstruktoru: odmítnuta; asyncinit, pluginy a metadata nejsou kompatibilní.
- KompletníWGSLpřepis: příliš široký pro určení backendového přínosu; měnil by materiály a obsah.
- Stejná hra s asyncfactory, kompatibilnímGLSL a explicitní queryvolbou: vybráno; nejmenší kontrolovatelný rozdíl, WebGL2zůstávádefault. Náklady: init/translation, vlastnídeps, kontrolacleanup a parita.
- WebGPUfast/NCM: samostatná třetí varianta poCMsmoke. Měřit rebuild/reuse; sdílenéavatarmateriály napříčkostrami mohou cacheinvalidovat. Snapshotrendering vypnuté kvůliLOD/streamingu/hráčům.
- Redukcegeometrie/kvality/rozlišení: nepoužít jako součást backendovéhoporovnání.

## Měření a hranice

JedenGPUhost, jedna3Dkarta, skutečnáhra/HUD/multiplayer. Výchozímedium, shodnéCSS/internalresolution, pevnéUTCnight+weatherfixture, stejnýavatar/spawn/kamera. 3páryA/B vpořadíA/B,B/A,A/B pokud oba backendy projdou funkčnímsmoke. Startup,15ssettle,10sOFF,10sprvníF,10swarmF,pohyb přeslampcutoff+opakování,další2skutečnéSDKavatary. ArchivrawJSONL a exporty, FPS/p95/p99/max/počty≥50/100/250/1000ms,CPUfáze, chyby, korekce a obraz. PrvníFnovéhoGame nenícleareddrivercache. Ambientníprovoz nenífixovaný astronáhledem; kontrolovatcounts a přiznatvariabilitu.

GlobálníGPUčas se meziAPInesmí srovnávat zodlišnýchscope; chybějící jeunavailable. PokudWebGPUneprojdevalidací, výkonovýbenefit je neprokázaný a zachováse původníchyba. Výsledky navazují až popřipravenémcheckpointu.

## První skutečný GPU smoke: překážka kompatibility

Snapshot e0de700bbcb2f603fac295ed718c9f872b8e5c993be64bd8195212b1ca49c90b, 8415 vstupů, 977/977 testů, build a úplná izolovaná integrace PASS. Edge extension,2040×986,1reálná multiplayer relace,GameWebGPUCM. V13:03:26.948Z seobjevila prvníGPUValidationError: noise textureSample vneuniformnívětvi oblohy. InvalidShaderModule následně zneplatnilpipelinea commandbuffers. Běhse NEPOUŽIJE proFPSsrovnání.

Pinnedshaderzdroje potvrdily noise/stars RawTexture generateMipMaps=true/TRILINEAR aMoonmapnoMipmap=false. LOD0 by změnilfiltraci. Varianty: (a) hoist implicitních texture samples před pixelové branches/return/discard; (b) explicitnígradientytextureGrad spředáním přescloudhelpers; (c) disableUniformityAnalysis, kterýjenzrušídiagnostiku. Vybráno(a) jako nejmenšícorrectnesspatch dvousouborů; zachováUV/mipy/filtry/koeficienty. Cena jevzorkování takéuněkterýchpozdějivyřazenýchpixelů. Změna budeidentická vobouABbackendech. Původněnedefinovanéderivacenaokrajích nelzeprohlásitzabajtověidentické.

Samostatnádiagnostika musípočítat device uncapturederror: Babylon9.30 jejenlogujeaonEffectErrorObservablenezahrnuje. Boundedprvnízprávy, počítánívšechchyb,detachadispose/rebindrestore. [WGSLderivativeuniformity](https://www.w3.org/TR/WGSL/#derivative-builtin-functions).
