# Material budget capture: bounded CPU proof

18.10.2026, frozen V4 bf28a56507b6b0650d214169c8cf94aa3b2d8abc4012a8b098e4e1366340c8c0. Žádný runtime patch. Pět případů prošlo se skutečným pinned glTF loaderem, jeho globálním setterem, odloženým Scene observerem a nezměněným GltfLightBudget.

| Případ | Před prepareFrame | Po prepareFrame | Po READY/COMPLETE |
|---|---|---|---|
| První capture až přes deferred scene observer | cap42, Effect0 | cap42, stejný Effect0 | cap42 |
| Default4 zachycen včas, readiness před opravou | cap42, Effect1/MAXLIGHTCOUNT42 | cap4, Effect2/MAXLIGHTCOUNT4 | cap4 |
| Default4 zachycen včas, prepareFrame před readiness | žádný požadavek varianty42 | cap4, pouze Effect3/MAXLIGHTCOUNT4 | cap4 |
| Výslovný fixed7 | cap42, Effect4 | cap7, Effect5 | cap7 |
| Výslovný fixed42 | cap42, Effect6 | cap42, stejný Effect6 | cap42 |

Effect IDs jsou lokální tomuto procesu. Ve všech případech bylo42registrovaných světel, ale pouze2enabled; actual defines LIGHTCOUNT zůstal2. U známého default4 se celé defines liší pouze řádkem MAXLIGHTCOUNT42→4, u fixed7 obdobně42→7. Závěrečný skutečný camera-pass mesh draw použil po opravě očekávaný Effect. Nezaměňovat počet onEffectCreated notifikací za počet kompilací: například42,4,4 jsou tři notifikace, ale dvě Effect identity.

## Skutečné pořadí a řízený vstup

Miniaturní binary GLB se3vertices a jedním importovaným PBR. Jeho onMaterialLoaded callback vytvoří jeden samostatný vlastní PBR, připojený k jednomu původnímu Babylon boxu ve scéně. Vlastní PBR tedy není glTF materiál a nemá vlastní loader materialLoaded notifikaci; představuje nový materiál jiného producenta (v produkci vzniká fotografická tráva jinou asynchronní cestou). Callback neposouvá cap ani neimituje loaderový setter.

Včasná kontrola používá existující veřejné guard.prepareFrame hned po vytvoření, případně declareBudget7/42. Pozdní případ toto nedělá. Skutečný glTF pak globálně inflatuje scene.materials. Testovací onReady extension podrží přechod READY, aby šlo pořadí deterministicky číst. Ve všech případech: own-created(cap4) → extension-onReady-enter(cap42, loaderReady0) → skutečný deferred scene-added-own(cap42). Teprve poté test provede případné readiness, prepareFrame, skutečný render a uvolní READY/COMPLETE.

Readiness používá public mesh.isReady(true) s dočasným camera.renderPassId a jeho obnovou ve finally, stejně jako Game.isMeshReadyForCamera; efekt se čte z přesného camera draw wrapperu. Žádné force-ready flags, shader/cache mutace, náhradní setter nebo GPU wrapper. Každý await má3s watchdog, každá testovací větev10s limit. Registrovaná extension, scene/material/plugin observers, AssetContainer, guard, scene a engine se vždy uklidí.

## Výklad a hranice

1. Prokázaná reprodukovaná možnost: po prvním capture42 guard nemá původní4 a správně podle svého nynějšího kontraktu drží unknown nondefault jako fixed. Výslovně deklarovaný42 má shodný koncový cap, proto nelze bezpečně prostě nulovat všechny vysoké hodnoty na4.
2. Prokázaná reprodukovaná možnost: známý default4 se sice opraví, ale readiness mezi globální inflací a prepareFrame může vytvořit další Effect variantu. Správné pořadí prepareFrame→readiness tuto variantu v této fixture nevyžádá.
3. **Není prokázaná produkční atribuce**: raw V3 neobsahuje okamžik prvního capture ani actual readiness během extension gapu. Koncové dva grass materiály neměly enabled/active meshe,95/87gameplay vzorků vykazovalo0grass draws a template není shadow/depth caster. Tato fixture záměrně vykresluje vlastní box, aby doložila důsledek pro použitý materiál; netvrdí, že původní neaktivní tráva tuto práci provedla.
4. NullEngine používá GLSL a zde nemá WebGPU UBO-capability clamp; MAXLIGHTCOUNT42 není tvrzení o skutečném WebGPU layoutu. Žádný GPU čas, obraz ani startup výnos se neměřil. Řízené čekání onReady je testovací harmonogram, nikoli záznam původního produkčního loadu.

Zdrojové body: glTFLoader.pure.js412–426; scene.pure.js2779; GltfLightBudget.capture/initialDeclaration317–348, repair478–508; Game.renderPreloadScene958–961 a preparation beforeChecks2743. Produkční factory photo-grass-resources100–105 a souběžné loadTrees/loadPhotographicGrass ve vegetation792–797 vysvětlují relevantní kategorii cizího producenta. Přesné dependency SHA a celý event order jsou v report.json.

Finální run-02.log:5/5PASS, exit0, runner2.266s. Původní run-01 a report-material-direct-initial.json zůstaly; následný cílený refaktoring zpřesnil public mesh readiness/camera-pass/draw dokazování a cleanup assertions. Závislé soubory byly po testech znovu hashově ověřeny beze změny.
