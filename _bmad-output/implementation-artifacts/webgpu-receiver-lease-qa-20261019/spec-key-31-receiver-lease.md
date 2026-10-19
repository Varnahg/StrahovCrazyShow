---
title: 'KEY-31: prostorový lease světelných přijímačů'
type: 'chore'
created: '2026-10-19'
status: 'done'
route: 'oneshot'
review_loop_iteration: 0
context: ['{project-root}/docs/agents/bmad-policy.md']
---

<frozen-after-approval reason="Již autorizovaná oprava plynulosti, nejprve vratný QA důkaz">

## Intent

Ověřit, zda konzervativní prostorový lease přijímačů světla auta odstraní podstatnou část opakované materiálové přípravy při zapnutí a jízdě bez drahého auditu každého snímku a bez změny osvětlení. Nejprve izolovaný skutečný Babylon CPU prototyp, pak podle důkazů současný produkční QA kandidát a měření. Nepřijaté nebo nedostatečně invalidované řešení se do runtime nepřenese. Hrané snapshoty a cizí WIP zachovat.

</frozen-after-approval>

## Implementation Notes

- Výsledek: helper10/10/scopedTS2958/0, root102/102/fullTS/buildPASS. CurrentEdgeA1/M1/A2max167,2/187,9/187,7ms a4>=100všude. DosahovýleaseNEpřijatdo runtime; source23140d1131f390c4ac1e59523348baeebf243cf3f5e0de2aade5c8fe453fcd67, evidence receiver-lease-qa/README.md. Codeblindreview[], rawindependentreviewpokusy selhalymodelcapacity; rootUIraw/source/seq/weather/health/focusauditdokončen. FirstfailedASTfixture101/102 zachovaná, opravena na nové pořadíbezruntimezměny. Cumulativeeligible1101/excluded1067/rebuild7 nejsoubenchmarkdelta aniFPSproof. Vlastníprocesyukončené, viewportreset, protected4199exact,133foreignWIPzachované. BMADdone znamenádokončenýQApokus, KEY31/32migraceopen.

- Root task `webgpu-receiver-lease-qa-20261019` vlastní QA/evidenci/BMAD/4200/2595/heavy/gpu. Child task `webgpu-receiver-lease-helper-20261019` má disjunktní cache/handoff, přímé konkrétní zadání bez rekurzivního BMAD. Použitý týmový renderer fe8292081bd751763aeb je totožný s právě přečteným workflow/step01/02/template/oneshot; story_key prázdný. Jediný malý vratný QA cíl, žádné intent gaps nebo nevratné změny, proto oneshot. Žádná implicitní licence zapisovat do Game/main/patch/lock.
- Vstup je accepted native909ebf8a se všemi současnými IP/IBL/prewarm opravami, nikoli memo runtime. Předchozí main82c23e39 prokázal499submesh serializer volání při vstupu do auta a92,2ms přípravy i s memo; samotné createEffect~1,6ms. Čistý6běhový memo pilot main07b26c6d nebyl přijat. Nový cíl není další cache ani přesun šestisekundové blokace.
- Primární mechanismus: pinned Light.setEnabled→_resyncMeshes→AbstractMesh._resyncLightSource→MaterialDefines.markAsLightDirty. canAffectMesh filtruje masks/inclusions/layers, ne range; STANDARD WGSL má za32m přesně nulový přímý beam. StableLightState může po membership změně znovu řadit sloty; renderer musí při re-admission dostat změnový seznam a kanonické pořadí.499 jsou volání/submeshe, ne499prokázaných různých materiálů.
- Varianty: starý per-frame scan18701037/revertdb9018 měl steadyON4,576ms proti0,018ms a cold6179,5vs6344,2ms, proto jej neopakovat. Trvale enabled/intensity0 spotřebovává slot/shadowpráci a může vytlačitlampu. Permanentní exclusion při aktivaci je neplatná za jízdy. Další Effectcache cílíjen~1,6ms. Kompletní per-submesh variantstate má větší binding/lifecycle riziko. Prostorový lease ověří menší zátěž bez celoscénového per-frame auditu, ale přínos je zatím hypotéza.
- Lease kontrakt: jednorázová eligibility a synchronizované celé worldAABB známých statických nedeformovaných receiverů,32m+pohybová rezerva+numerický okraj. Uvnitř rezervy jen kontrola pozice; před crossing obnovit membership. Counterfactual cap musí započítat beam i při OFF/vlastním exclusion; nesmí se povýšit původně oříznuté jiné světlo. Preserve masks/lists, velkébounds, instance/skeleton/morph/wind/custom/frozen fallbacky, původní intenzity/ON/OFF/stíny a plnou dosavadní prewarmcoverage.
- Cache/paměť/lifecycle: omezený rozsah jedné scény a světla, vlastní exclusions oddělené od cizích arrays. Remove/detach/dispose musí vyčistit reference. Změny materiálů/capů/geometrie/bounds/topologie a jiných světel vyžadují skutečný invalidation kontrakt. CPU prototyp s explicitním invalidate není důkaz, že jsou jeho předpoklady napojené v produkci; samostatný read-only audit určí všechny současné callery. Pokud je kontrakt příliš křehký/drahý, odmítnout dřív než GPU.
- Ověření: actual Babylon near/far/velkýmesh + sharedStandard/PBR readiness/Effect/defines, OFF/ON a2leasecrossings; stockcontrol, cap/truncation, unknown/deformed, explicitníinvalidace/disposal, žádný steady scan. Krátký CPUreplay uvede calls a elapsed; není GPU/FPSproof. ScopedTS a manifest současných dependencies/payloadů. Teprve po review a ověření produkčního invalidation kontraktu root sestaví nativeQA, provede targeted/fullTS/build a skutečný Edge průjezd; pokud evidence nedostačuje, nevydávat hotovou opravu. Relevantní fullnative/combinedtest/build/integration až před přijetím runtime.
- Výstup zůstává v samostatném evidencecommitu s raw výsledky a přesnými SHA; KEY31/32 zůstávají otevřené.133foreignWIP a played4188/4192–4199 byteově zachovat, ověřit skutečné klienty před GPU. Linear aktualizovat po výzkumu, rozhodnutí, implementaci, ověření a integraci. Rizikovější runtime změna vyžaduje doloženou převahu nad variantami a důkaz zachovaných features.
