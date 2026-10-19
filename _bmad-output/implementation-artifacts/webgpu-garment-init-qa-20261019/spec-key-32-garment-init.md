---
title: 'KEY-32: odstranit opakované scany při inicializaci garment materiálu'
type: 'bugfix'
created: '2026-10-19'
status: 'done'
route: 'oneshot'
review_loop_iteration: 0
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

Omezit opakované procházení celé scény při nastavování právě vytvořeného PBR materiálu oblečení. Dávkovat stejné počáteční hodnoty pomocí existujícího veřejného API před vlastním zveřejněním materiálu, zachovat vzhled, cache a lifecycle. Výsledek doložit skutečným CPU reproduktorem a produkčním obrazem, bez tvrzení, že tím zmizely všechny herní záseky. Hrané buildy a cizí WIP zůstanou neměnné.

</frozen-after-approval>

## Implementation Notes

- BMAD oneshot po aktuálním rendereru fe8292081bd751763aeb, jehož workflow/step01/step02/template/oneshot byly v tomto tahu plně přečtené; taskclaim QA vlastní cache/spec/evidence/renderer aheavy/GPU/build/4200/2595. Přímý helper má disjunktní kopii/CPUtesty/handoff. Žádné intentgaps/nevratnéakce/novépublicAPI, malá dvěma moduly ohraničená změna; žádný nový PRD/sprint nebo schvalovací checkpoint.
- Doložená cause evidence mainc0db: UVtrace0events/errors0 při6hitches, JSstack MaterialDirty→decorator setter→avatar-garments.materialFor45→install110→createAvatar346→TransitRenderer.update222. Stackpresence neníCPUshare; low shadercounttakéneníplynulost. Currentclean8fb/SDWf8neobsahujeodmítnutéUVmemo/guardy.
- Chainprozkoumán:materialForcachehit vrací existujícíentry a přidáusers; cachemissvytvořítexturesdlefamily a novýPBRmaterial, nastavíbarvy/maps/sheen/metadata, teprvepakcache.set a následnémeshassignment. PublicatomicMaterialsUpdate v pinned9.30material.pure má try/finally;blockflagfalse volámarkDirty(false). Pouze nový dosud vlastně nezveřejněnýmaterial nemáhotovédefines; prvnídraw musíkompletněvyhodnotitstejnéproperties. Scene-addedobservableaplikacepublikacipředcallbackemnedělá.
- Varianty: scene-globalblockbyumlčelcizíinvalidace a mělvíc rizik; novámaterialcachebyzměnilavlastnictví/refcount; SDKcontextindexmusípokrýtMultiMaterial/renderpass/resetlifecycle. Publicbatchnovéconfig je nejmenšíappzásah,žádnánovácache,stejnésetterypořadí/values,finally obnovídirtymechanism. Nepoužívatnadcompiled/cachedsdílenýmimateriály.
- Primárnísource https://github.com/BabylonJS/Babylon.js/blob/9.30.0/packages/dev/core/src/Materials/material.pure.ts a skutečnýinstalovanýcoref8, API https://doc.babylonjs.com/typedoc/classes/BABYLON.Material#atomicMaterialsUpdate . Změna jen copiedclient/avatar-garments.ts konfigurace novéhoPBRmaterial; textury/geometry/paleta/sheen/metadata/refcounts/disposalůstávají.
- Helper porovnává varianty vRESEARCH a dodává actualBabylonred/green foreignmesh/getMaterialtraversalcounts + exactfinalmaterial/texture/metadata/geometry/sharedcache/lastrelease parity. Earlyedc09payloadmělLF/CRLFassemblychybuaprázdnýblock; rootjejNEpřevzal,incidentlogzachovat apřevzítjen GREENstabilnípayload sorderedstatementinverseproof.
- RootQAordinaryproductioncopy,bezCPUprofileru/Textureoverlay;sourcehashobsahujetesty. Cílenéhelperregrese+studentgarments/fullTS/minifiedbuild, independentblindHunter a actualEdgegame/editor6presets/cloth/health/menu. NeměřitGPU běhemtestů. Po přijetí samostatnýnativeclaim+stableclean/combinedplnápipeline a rezervace2568; teprvepak vlastnídelta+testsnativecommit/main. DílčíCPU/GPUproofneníKEY32/defaultpřejímka. Evidence/handoff/Linear po každéetapě,ownprocessstop předrelease.

## Outcome

Přijato jakoomezenáCPUoptimalizace:6presetactualtraversals352→32,exactA/Pvalues/textures/geometry/lifecycle,cachehit0;portable2/2aQA8/8. Stabilníclean0671474/1474acombinedc291534/1534,oba fullTS/pnpm build/4isolatedintegrationPASS. Reviewruntime/test/assembly[]. ActualEdgecombinedc29 všech6readyeditorpresetů,dennípostava,nočnínástup/jízdaanávratdohotovéhoeditoru;11obrazů,render/asset/browserErrors0,pending0. Plain smoke38,4FPS/p9534,5/p99183,4/max303,2ms/6>=100ms/9programs,odlišnýprovoz/takty/combined:neFPSA/B,zásekyzůstávají.

Přesně2runtime/test souboryWT089964296a6fc677ea41e83db3f6e602d6ca6bf5→main145cbe952d6bfa1a5b3d51852e7b637a7fb02ee3;133cizíchWIPcestvoboucheckoutechbyteovězachováno,indexyprázdné/stromyshodné. QA4200/2595/2568stopped,kartazavřena/viewportreset. NováURL4202/?renderBackend=webgpu servírujesamostatnoukopiic29;595source/test,21codedistHTTPsha/health/embeddedsourcePASS. Jejínovýserveclaimzůstáváaktivní,původníhranésnapshotsbezezměny. Evidencegarment-init-qa/;KEY31/32/default/migračnícílzůstávajíotevřené.
