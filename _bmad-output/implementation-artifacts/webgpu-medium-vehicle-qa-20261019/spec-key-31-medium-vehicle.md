---
title: 'KEY-31: připravit skutečná světla auta před WebGPU hraním'
type: 'bugfix'
created: '2026-10-19'
status: 'in-progress'
route: 'oneshot'
review_loop_iteration: 0
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

Omezit přípravu světelných a stínových variant auta až během první jízdy. Rozšířit existující skutečnou přípravu z Low také na WebGPU Medium/High a povolené počty pouličních světel. Zachovat stíny, obraz, kvality, nastavení hráče, úplnou připravenost, timeouty a lifecycle. Přínos musí potvrdit běžná produkční scéna; hrané verze a cizí rozpracované změny zůstanou neměnné.

</frozen-after-approval>

## Implementation Notes

- Root claim webgpu-medium-vehicle-qa vlastní copiedsource/build/evidence/spec/renderer a heavy/GPU/workspace/4200/2595. Přímý helper vlastní disjunktní cache/handoff a pouze lehké CPU kontroly. Aktuální renderer vydal fe8292081bd751763aeb, jehož workflow, step01, step02, template a oneshot byly plně načtené v tomto rozhovoru; aktuální policy znovu přečtena. Cohesive oneshot bez nevratných akcí, nové uživatelské volby nebo intentgap; interní API je koordinační rozhodnutí.
- Baseline clean06754993…582files a knowncombinedc29a7da7…595files již obsahuje přijatý SDWf8 sharing a garment068. Žádný nepřijatý UVguard, profiler, nový SDKcache nebo diagnostický source overlay. F8 packages jsou chráněný read-only vstup aktivní4202; žádný install nebo patch do nich.
- Podklady: Game prepareAllRenderQualities/prepareLightingVariants, light-preparation, render-quality-preparation, AuthoredLightPreparation a VehicleDirectionalBeam.updateBeam; skutečné testy a pinned Babylon ShadowGenerator/RenderTarget/mapSize lifecycle. Historical medium-attribution přiřadil2main+15shadow programů, následný SDWsharing ponechal6/12/7 v native a9/18/10 v combined průjezdu. CPUtrace3320 obsahuje updateBeam a shadowtarget/pass creation, ale nevyčíslujeCPUshare. Přesný přínos nového prewarm kandidáta se teprve změří.
- Prosté rozšíření0/1 na vyšší kvality mine dosažitelný2POINT bezcelestial stav. Porovnány quality-derived počty a stable0/1/2; vybrány stable0/1/2 pro WebGPU s původním quality/nonStreet clampem. Low získá1 redundantní clamped stage, stable celkem48 místo41 ve3quality passes. Nezavádí se nová orchestrace stage-setů při změně quality. WebGL ponechá původních9 stages bezvehiclelease,30/90s deadlines se nemění.
- Stable pořadí QUALITIES.filter(initial)+initial skutečně končí requestedquality a zanechá Medium256/High512 předReady. Actual veřejné Game.setQuality/applyAdaptiveQuality ale reprodukuje pozdní Medium→High request: adaptiveHigh/temporaryMedium, po restoregameHigh/map256. Stejný late request podporuje i původní qualitytest. Koordinátor proto před zápisem rozšířil copiedscope o render-quality-preparation.ts: optional requestedQuality a tailpass po complete finalattempt, pokud latestquality nesouhlasí. Zachovat started/paused/90s total a min(30s,remaining); žádný reset/timer/cache. Stable3passes/48 se nemění, finalPass označuje skutečný finalattempt, historii nefalšovat.
- Pouze copied Game/light-preparation/render-quality-preparation a relevantní portable testy. Ověřit skutečný mapSize/SHADOW defines, nenulový2POINTbudget, Lowduplicate/WebGL; stableorder, late public quality/FPS request, retrytimeout bezresetu, revision/restore/rootreplacement/abort/dispose. Cílený refaktoring bez změny fyziky, kamery, assetů nebo shader algoritmu. Root/main Game WIP se tímto nepřebírá.
- Helper GREEN, exactsource/test/inverse a independent blindHunter před rootfullTS/build a plain Edge Medium2040×986/1actualAlex/night firstdrive. Raw source/session/UI1:1/foreground/health/programcounts/hitches, GPUteplota/takty a provoz; žádný profiler ani souběžné CPU/GPU testy. Přínos nebo jeho absence rozhodne o dalším přijetí. CPUtesty ani početshaderů nejsou dokončení FPS/migration acceptance. Linear po etapách, owncommity/main, procesystop předrelease;4202/4201/4192/4188 a ostatní hrané verze zůstanou neměnné.
- Implementovaný helper manifest b7f2ddfb9c7230972b0411b254fb11f2e44923c874f70659630e0cceefd322d2; osm přesných souborů, inverse tří runtime souborů do067 byte-exact. Root candidate65d028c6e4c61555c7ae56e89b3b25268bc1a5abbd4b7a8dabe19213edc71e60/582files obsahuje testy. Helper i root152/152, rootfullTS a produkční minifiedbuild PASS. Nezávislý read-only blind-hunter cpu_profile_hooks prošel všech osm souborů a okolí, nálezy[]; GPU přijetí z toho neplyne.
- Plain Edge c1/x1/c2: candidate45,5FPS/p99102,7/max155,4/4programs versus control32,1/p99146,8/max222,5/9programs versus candidate42,5/p9993,7/max187,2/5programs. Všude skutečný nástup a přibližně100m jízda, foreground, source/session/UIraw1:1 a validhealth. Okolí2bus/0pass/1car,2/3/0,0/12/0 a odlišné takty79–85°C; není to srovnatelné FPS A/B a není přijato do main. Exit c2 potvrzen až po návratu fokusu klikem do canvas; první E z panelu nebyl funkční důkaz výstupu, není vykazován jako regrese hry.
- Existující local profileEnvironment=1 g1 na stejném source65d028:480actualmodules,4novéprogramy/8modulů/5sync při jízdě. Rawduplicate skupiny369/370 a373/374 už mají stejné texty z vehicle-0/1 a další calls po ready. Stageoverflow1 slučuje pozdní stage; nepřisuzovat pouze podle labelu. Chybějící WGSL text sám tyto opakované moduly nevysvětluje. Následuje opětovné použití dříve ověřeného šestifile attribution donor instrumentu, žádná nová optimalizace/cache. Diagnostic sourceec5ddd67fc497d9ec31cca171b1cc767f5498ac9fc05566500d4821cbdba6283/583files vznikl přesným donor převodem pěti souborů a clean třícestným sloučením Game; vlastní vehiclefix zachován. Diagnostické FPS se nevydává za výkonový přínos.
