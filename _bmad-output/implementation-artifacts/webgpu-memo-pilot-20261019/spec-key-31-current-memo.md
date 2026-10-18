---
title: 'KEY-31: současný čistý A/M/A pilot omezeného memo'
type: 'chore'
created: '2026-10-19'
status: 'done'
route: 'oneshot'
review_loop_iteration: 0
context: ['{project-root}/docs/agents/bmad-policy.md']
---

<frozen-after-approval reason="Navazující již autorizovaný výkonnostní pilot; žádná změna přijetí migrace">

## Intent

Na současném přijatém nativním runtime ověřit, zda dříve correctnessověřený omezený engine/device-owner memo zmenší zbývající světelné záseky. Přenést pouze přesné čtyři vendor delta při zachování všech novějších oprav, porovnat čisté první jízdy A/M/A a podle výsledku přijmout či odmítnout následující nativní integraci. Hrané buildy a main runtime do přijetí zůstávají neměnné.

</frozen-after-approval>

## Implementation Notes

- Dokončeno: rozšířený A1/M1/A2/M2/A3/M3. M nyní nepřijato do nativního runtime; medián max187,4→159,8ms, p9929,7→34,2ms, FPS54→52,8. Rozdílné GPUtakty/idle/trajektorie v raw zachované, nejde o kauzální regresi. Všech6healthvalid/UIrawexact/0programů/0modulů/2syncpipeline.51/51currentproof+11WGSL/55stavů exact,18Mtargeted/fullTS/buildPASS. Independentreview bez doloženého nálezu. Evidence `docs/performance/evidence/webgpu-migration-20261016/current-serializer-memo/README.md`; task done znamená dokončené rozhodnutí pilotu, nikoli splněný KEY-31 nebo migraci. Hrané buildy/mainruntime bezezměny; vlastní4200/2595 ukončené.

- Jediný reversibleQA cíl bezproduktovýchnejasností/irreversibility, protooneshot. Rootclaim vlastnícache/evidenci/BMAD/4200/2595/heavy/gpu. Childproofdisjunktní, bezdalšíhoworkflow; žádnáinstalace/patchlockmodifikace tohoto pilotu. Rendererconfig/workflowfe8292081bd751763aeb opět bezezměny.
- AktuálníGPUScene routineprofile0ac5b4db: toString61,2/50,8ms,createEffect2/1,3ms,bindgroups16,4/10ms; měřeno walltime s vlastnírežií, nikolifinalFPS. Serializerobsahuje rawreads+canonical parser/sort. Cachelookupoptimalizace cílímenšínáklad; fixlight-slots měníshader/shadow/GPUpráci. Pure serializer rewrites dříve neprokázalywhole-render benefit. Existujícíexplicit-ownermemo je nejmenšíověřitelnýkandidát:64entries/262144combinedUTF16units, žádnéGPUobjektyvtextovýchentries,rawgetter/throwsvždy předlookupem,customserializer0args+owner/deviceepochs/cleanup.
- Rizika: uniquechurn+12,59% ze staršíhoCPUproofu, paměťovýcodeunitlimit neníheaplimit; customorder-sensitive shader omezení zůstává. DřívějšíGPUmemo páry měly jinéNPC/auta anenulovéshader/pipeline misses, takže nedokládají nynějšípřínosani kauzálníregresi. SoučasnýM může být odmítnut.
- Currentproof8567f6fba66a8bfcdcc5fa767b3efa328ed850af8bde98458bfaeb865814ca69: přesné4vendorfiledelta; Std/PBRjenjedinácallsitezměna,novějšíIBL/IPbajtyzachované,inverse4/4.51/51currentcorrectness,scopedTS3169/0,11WGSLscénářů/55celýchstavůA/Mexact kroměmemoobservačníchpolí.10860dependencyinvariantcheckpřed/po. NejdeGPUFPSproof.
- A je byteověnative909ebf8a ve vlastním source/runtime, dist/packagesreadonly; M stejnéapp/test/assetbytes +čtyřisoukromévendorzměny a přesnáprovenance. ŽádnýMeshDraw/timer/JSsampler/DocumentPolicy; obalenístocktoString by memo vypnulo,protozakázané. Všechnyskutečnédependencyroots majíjednuclassidentity; source/proof/dependencyhashypřipnout.
- Spustit stejný firstdrive A1→M1→A2,1actualAlex/0ambient,manualLow77%,stejnéCSS/internal/night/weather aovládání. Ověřitforeground/actualsource,health/pending,program/module/pipeline a záznamroute. Uchovat iregrese/invalidruns, odlišitmissing/changedconditions. FPS/p95/p99/max/≥100ms a startupzaznamenat; nenífinálníMedium/2040×986/3peerpřejímka.
- Relevantnícurrentproof testy+fullTS/buildM, independentreview stávajícípřenesenédelty i assembly. Teprve stabilnípilot rozhodne o samostatné nativnípatch/lock/testintegraci s fullclean/combinedsuite/build/isolatedintegration. Samostatnýevidencecommit,ostatní133WIPcest/původníhranésnapshoty zachované. Vlastníprocesy ukončit neboexplicitněpředat; operativníPIDnecommitovat.
