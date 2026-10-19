---
title: 'KEY-31: přijmout nebo odmítnout přesné sdílení odvozených shadow programů'
type: 'bugfix'
created: '2026-10-19'
status: 'done'
route: 'oneshot'
review_loop_iteration: 0
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

Zmenšit doložené násobení shadow shader příprav během jízdy bez ztráty stínů nebo jiné funkce. V izolované současné F3 kopii ověřit přesné token sharing přes existující WebGPU engine cache se samostatnými draw contexts a vyváženým vlastnictvím efektů. Zachovat WebGL, FreshWebGPU readiness, hrané snapshoty a cizí WIP. O přijetí rozhodne cílené CPU ověření a skutečná produkční Medium jízda; neúspěšný kandidát do native runtime nepatří.

</frozen-after-approval>

## Implementation Notes

- Rozsah je izolovaný QA patch jediného pinovaného modulu a jeho testy; bez veřejného API, bez nevratných změn, bez mezery v uživatelském zadání. Root task webgpu-shadow-share-qa-20261019 drží vlastnícache/output a heavy/GPU/build/4200/2595. Disjunktní helper má vlastnítask/cache/test/handoff. Renderer stejný týmový snapshot fe8292081bd751763aeb; workflow/clarify/plan/oneshot již celé načtené při bezprostředně předchozí jednotce.
- Primární zdroj: Babylon9.30 ShadowDepthWrapper._makeEffect vytvoří GUID per(submesh,generator), WebGPUEngine.createEffect cachekey zahrnuje token+defines a cachehit přidá refcount. Shadow wrapper drží samostatné DrawWrapper/material/drawcontexts. _deleteDepthWrapperEffect uvolňuje1acquire perentry, passové aliasy nic nenabývají. Existing dispose/replacement ownership musí mít CPU proof.
- Actual Medium evidence medium-attribution source6f0979:2leafmainrequests+15shadowSPOTrequests ve4definesgroups;15máunmatchedidentity, plné defines jsou zachované. Stejné defines samy nestačí. Token sdílet jen uvnitřwrapper+sameorigEffect po úplné shodě derivedshaderlanguage/source/orderedABI/indexparametrů, nikdy sdílet DrawWrapper ani vytvořit vlastní cacheEffectů.
- Varianty: rozšířit vehicle stagesLow→všechquality je malé, ale frustum/LOD/dynamic-submesh GUID mezera zůstane; plošněpřipravitvše má velkýstartup bez důkazu retention. Přesné sharing řeší doložené násobení, přidává riziko bindings/refcount; volba proto podmíněna differential source/ABI a lifecycle testy a actualEdge. Snížení/vypnutí stínů odmítnuto, měnilo by funkci/vzhled.
- QA sestaví všech576source/test souborů současného3c4be6 a vlastní úplnou kopii pnpmdeps se zachovanými relativnímilinky. Předoverlay ověřit realpath, že modul patří QA a nikoli hranýmdeps. Beze změny appsource. Helpertesty jsou součástí sourceidentity/snapshotu; fullTS/build a relevantní/fullsuite nadstabilním checkpointem. Žádný nový profiler; běžný compilation counter stačí pro přínos, pokud se projeví.
- Given2příjemcese shodným derivedsource/ABI/freshbase, when oba připraví shadow, then engineprogram může být sdílen, contexts zůstanou samostatné. Given rozdíl source/ABI/base/options, then identityoddělit. Given replacement/dispose jednohoowner, then druhý zůstane valid; poslednírelease efektuklidí. WebGLbeze změny. TestyNullEngine nejsouGPUdůkaz.
- ActualEdge Medium2040×986/Alex/night/car route jako předchozí; změna dopravy/cache/instrumentace explicitnílimity, neúplnáFPSA/Bpřejímka. Nativní integration/default/fullgoal ažpozávěrečnýchgatech. BlindHunter pouzevlastnídiff; žádnýminimálnínález, přesnádosažitelnost. Služby/kartuzastavit předrelease, evidence/commit/Linear průběžně.

- Výsledek: isolated QA příznivý shaderrequest mechanismus17→6, sync18→7. Přetrvává5>=100ms, p99122.9ms; není výkonová/default přejímka. Přesný f8modul teprvepřevést do produkčního patche.
- 19helper/3copied critical/38repaired targeted/1453fullsuite/fullTS-build/4integration PASS; počátečnírootlayout ahelperfixture failures zachovány.10860depssinglechange proof. BlindHunter[]. Mediumcar+High/Low/torch/day/reset/Gameexit/editor6presets GPU smoke bez errors. PID/karta/GPUukončeny.
