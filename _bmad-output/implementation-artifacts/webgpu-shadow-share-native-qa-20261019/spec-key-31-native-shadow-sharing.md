---
title: 'KEY-31: nativní pin ověřeného shadow sharing payloadu'
type: 'bugfix'
created: '2026-10-19'
status: 'done'
route: 'oneshot'
review_loop_iteration: 0
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

Převést přesně ověřený ShadowDepthWrapper payload do projektového patche a přenositelných regresí. Prokázat novou frozen-lockfile instalaci, shodný skutečný modul a jednotnou Babylon identitu, čistý i přijatý kombinovaný checkpoint včetně testů/build/integrace. Integrovat jen vlastní ověřenou jednotku. Hrané snapshoty a cizí WIP zachovat. Nezaměňovat omezení násobení programů za odstranění≥100ms záseků nebo dokončení migrace.

</frozen-after-approval>

## Implementation Notes

- Malý přesný přenos jediného jižreviewed/runtimeověřeného payloadu plus pin/testy, bez nové runtimearchitektury/API/nevratného kroku či chybějícího uživatelského rozhodnutí. RootQA vlastnícache/evidence/BMAD a heavy/GPU/build/2568/4200/2595; leaf native vlastnípatch/lock/novétesty sdisjunktnímclaimem. Týmovýrenderer fe8292081bd751763aeb úspěšněvyvolán; stejný workflow/steps načtený při bezprostředněpředchozí QA jednotce.
- Přijatý f8a8c6091af9caa96ba897f28d7d490f3607d7856dee86b3a05321e1477aba29, preimagebd2bfe313728751f375d613492e7210adb09733556dcb8e6f2d8e720b55f122c. MD3cc patch bezezměny. QA main552ad5d:19CPUcase+4descriptorparity,1453/fullTS/build/4integration, actualMedium6requests/7sync/errors0 proti dřívějším17/18;5>=100ms přetrvává. Nejde o přesné FPSA/B.
- Varianty: zůstat u nepřenosného ručního QAoverlay by neaktualizovalo projekt; přepsat rootnode_modules by ohrozilo běžící snapshoty; zvolen scope pinovaného patche s freshcopy install a portable skutečnými19regresemi. Žádná změna sourcealgorithmu proti f8, pouze balení/replay.
- Clean vychází z3c4F3 a ověří app/test blobs proti aktuálnímuHEAD; combined zimmutable přijatého F3combined77d. Přidat pouze přesné nativehelpermanifestfiles. Nové sourceidentity obsahují i regresnífixture. Public/assets/docs readonly, vlastnídist, freshclean závislosti copy import; combined sdílí jen tento vlastní nový dependency strom.
- Given frozen install, when package načten, then ShadowDepthWrapper přesněf8 a ostatních10859core/loaderssouborů přesněF3 včetněMD3cc; app/loaders jeden skutečnýcore. Given stableclean/combined, when pnpmtest/build/testintegration, then celé výsledky a sourcehash zachované; selhání neopravňují keDone. Exactpayload actualQA GPU evidence lze použít pouze s doloženou runtimebyteparitou a explicitními mezerami dalšíchkontrol.
- Po helper převzetí scopedreview, vlastnícode/evidence commity a mainintegrace bez133cizíchWIP, průběžnýLinear. Nativepin neznamená celkovoufunkční/image/multiplayer/performancepřejímku; default/KEY31/32/cíl zůstávajíotevřené. Procesy ukončit předrelease.

- Přijato po skutečné frozeninstall10860singlemodparity, clean1472/combined1532+obabuild/fullTS+2x4integration. Native actual70810Medium6programs7sync/errors0,5>=100ms,p99116,max176.5; neprokazuje frame-tail improvement a cíl zůstáváotevřený.
- Nativecode main1757002/root4082ab,133WIPpreserved; independent nativepayload/pin/replay review[]. Metadata/sourceevidence73artefaktůsamostatně. Ownservices/karta stopped,protected4201byteidentityPASS. DalšísingleCPUselfprofileactualMedium, nepřidávatnaslepocontextreuse.
