---
title: 'KEY-31: actual first-UV invalidation candidate'
type: 'bugfix'
created: '2026-10-19'
status: 'done'
route: 'oneshot'
review_loop_iteration: 0
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

Ověřit odstranění redundantní UV-driven global material invalidace při úplně prvním výpočtu texturové matice na WebGPU. Zachovat shadermath, UVvzhled a všechny pozdější identity přechody. Přínos musí ukázat skutečná Medium první jízda. Neměnit hrané verze/cizíWIP, neintegrovat nepříznivý či nejasný kandidát.

</frozen-after-approval>

## Implementation Notes

- Scope pouze vlastníQA, současnýnativeclean8fb+SDWf8/MD3cc. Rootclaim first-uv-qa vlastníheavy/GPU/build/4200/2595, helper mádisjunktnítask bezGPU. Nejsoumezeryvzadání/nevratnézměny/novépublicAPI; malý exact2hunk modulecandidate aregrese. BMADoneshot, stejnýtýmovýrenderer fe8292081bd751763aeb jižcelýnačtený.
- ActualCPUproof main9765e87:4stackpozorováníTexture.getTextureMatrix→Scene.markAllMaterialsDirty→fullsceneMaterial scan ventry196.8ms;first-vs-latertransition dosudneznámý. StockPBR/Standard/NodeMaterial rozhodujíUVidentity ažpovolánígetteru; sentineltrue→firstcomputedfalse nenízměnou dřívepoužitéstockmatice. Pinnedclient/core/loaders nemajíassignmentoverride, thirdpartyoverridehistoriebezsuper nenípodporovanýkontrakt tohoto kandidáta.
- Varianty: startup/factory eagerinitialization nepokryjelateclones;dirtymeshindex nepokrývárenderpass/MultiMaterial/instances;disableoptUV měníUVvaryingbudget. Vybrán hadCachedMatrix předalokací aWebGPU-onlyfirstdirtyguard. Math/cacheidentity a pozdějšífalse↔true notifikace bezezměny;WebGLhistorickáprvnínotifikace zůstává.
- Žádné mutace borrowednode_modules. OwnVitepretransform ověříexactpreimage a vložíexactcandidate, generateBundle vyžadujeprávě1hit a uložíreceipt. Ownsourceidentity obsahujeconfig/payload/tests;plainproductionbuild bezprofilingpolicy/hooků. Totonenífreshinstallproof ani nativepin; ten ažpopřijetí.
- HelperactualTexture/PBR/Standard/NodeMaterial/clone/uBase/toggle/rotation/latertransitions/matrixdefinesparity;rootfullTS/build, actualEdgeMedium2040×986/Alex/night/stejnároute+UV/healthhitch kontrola. ČíselnýFPSnáskok zjednoho běhu neschvalovat kvůlidopravě/cache/taktům;mechanismus a frame-tailvýsledek vyhodnotitvýslovně. BlindHunter přesvlastnídelta,omezenínezakrývat. Ownserviceszastavit,částečnývýsledek neníDoneceléKEY31/32/cíle.

## Outcome

QA experiment dokončen, kandidát **nepřijat**: CPU4/4 +4material procesy×6stavů exact parity a root replay, fullTS/minifiedbuild PASS, ale skutečná první jízda má35,4FPS/p9540,2/p99138,8/max802,9ms a14intervalů≥100ms. Provoz/takty/bočnívýchozípozice nejsou srovnatelné s předchozím během, zrychlení ani regresi nelze tvrdit. První nástup stále render133ms; největší interval render686,7ms. První-vs-pozdější UV změna zůstává neidentifikována. Žádná runtime/mainpatch integrace. Vlastníscéna/4200/2595 ukončeny,hranésnapshots bezezměny. Evidence `docs/performance/evidence/webgpu-migration-20261016/first-uv-qa/README.md`; KEY31/32 a celýcíl otevřené.
