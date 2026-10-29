# KEY-3: příprava prvních světelných variant před hraním

Rozhodnutí před implementací, 16. 10. 2026. Root koordinuje skutečný GPU profil; tento agent připravuje pouze úzký navazující feature. Varianta V1 snížila maximum opakovaných přepnutí z 1913 na 93 ms, ale první ON stále má1114,4 ms, předchozí render1068,8 ms, environment30,9 ms a React click20,2 ms. To podporuje cílenou přípravu cold renderových variant; konstrukce světla sama není dominantní doložená příčina. Další A/B musí potvrdit výsledek a změřit přesunutý startup náklad.

## Varianty a rozhodnutí

- **Zvoleno: actual-scene startup příprava**. Po načtení finálních assetů, materiálů a lokálního avatara, před `ready`, projít current OFF/ON a normální night OFF/ON. Sdílet produkční render-only world/light přípravu. Neměnit veřejné quality/timeOverride/flashlightOn ani input, simulaci, predikci nebo RTT. Ponechat skutečné meshe, instancing, material plugins, light slots a shadow caster stav. Před hrou vykreslit obnovený aktuálně požadovaný stav.
- Runtime proxy compilation odmítnutá pro tento scope: kopie mesh/material by musela přesně zachovat submeshe, instancing, wind/alpha, shadows, aktuální světelný podpis a lifecycle. Dosavadní warm A/B už potvrzuje využitelnou cache skutečných variant.
- Globální všechny kvality/pozice/avatary/stavy B6 odmítnuté: počet variant a paměť/startup cena nejsou doloženě ohraničené. Tento krok nepokrývá neviděné budoucí materiály nebo všechny konfigurace.
- Dočasné `ready=true` a volání frame odmítnuté: spustilo by authority/input/simulaci/adaptive quality v loading fázi.
- Holé `await scene.whenReadyAsync()` odmítnuté: Babylon při disposal/timeout vyčistí observable bez vyřešení Promise. `forceCompilationAsync` vytváří dočasný submesh, začíná synchronně a má vlastní neukončitelný polling.

## Kontrakt implementace

Jediný vlastněný dočasný engine loop nahradí preload loop během přípravy. Readiness skutečných meshů se kontroluje po omezených dávkách a omezeném čase callbacku, s aktuálním camera renderPassId a jeho obnovou. Každý scénář dostane skutečný render, poté kontrolu nově použitých efektů. Před i po renderu se kontroluje `engine.areAllEffectsReady()`: mesh readiness samotná může kvůli hot swapping vracet předchozí ready effect. Game vlastní svůj engine; nečeká na editor v jiném enginu.

Celý běh má monotonic deadline a samostatný timeout i pro background/pozastavený RAF; scene disposal řeší Promise a uklidí observer/timer/loop. Timeout nebo chyba se vykáže jako incomplete, ne ready. `finally` restore čte současné requested settings, nikdy starou snapshot kopii. Dokončení, stage timings, ready checks/render counts a celkový startup cost se uloží jako technický diagnostický event bez osobních dat.

Nezávislé review před skutečným nasazením doplnilo nutnost progress renderu: readiness textur/postprocessů/stínů může záviset na již provedeném skutečném draw. Každý stav proto dostane počáteční progress render a další během čekání po dávce kontrol; ty nejsou dokladem readiness. Dokončení vyžaduje dva skutečné rendery s hotovými efekty před i po nich. Jedna synchronní shader/driver operace se nedá přerušit uprostřed; deadline se kontroluje bezprostředně po návratu. Vykázané rendery jsou kumulativní i při restartu stavu po změně settings.

Primární podklady: instalovaný Babylon9.30.0 Scene.isReady/whenReadyAsync/_checkIsReady, Mesh.isReady(true), Standard/PBR isReadyForSubMesh hot swapping, ThinEngine.areAllEffectsReady, ShadowGenerator.customIsReadyFunction a RenderTargetTexture.isReadyForRendering. Produkční Game.start/frame/updatePlayers a UI game-ready lifecycle byly prozkoumány dvěma nezávislými agenty.

## Přijetí a meze

CPU regrese ověří jediný loop, dávky/deadline, chybu, disposal v každé fázi, cleanup, skutečný render až po readiness, restore po změně settingu během čekání a nemožnost input/simulation před ready. GPU přejímka musí změřit startup navýšení, první i opakovaný F, den→noc, aktuální quality, více avatarů a B6/movement; neprohlašovat dosud nepřipravené varianty za hotové. Frozen4188 zůstává beze změny. V první fázi jde pouze o cache draft, protože root dokončuje neměnnou V1 pipeline.

## Refinement after actual GPU movement, 16 October 01:04 Prague

V3 preparation completed in5548.4ms and firstF fell1114.4→182.7ms, but the first walk still produced851.9ms (preceding render830.7ms). Repeating the path max69.3ms. Pinned lamp geometry puts spawn28.4369m from ipr2024-parking-south-central and the hitch sample30.14935m from it; production cutoff is30m. Enabled light inventory falls3→2. This identifies an unprepared POINT count transition, independent of repeated F state. Torch shadow empty/nonempty is less likely because its broadphase includes the local avatar; cinematic shadow stats cannot establish torch caster state.

Chosen refinement: six normal-night stages with0/1/2 actual owned street lamps ×OFF/ON, bounded by the current nonstreet enabled count and selected quality, plus currentOFF/ON andrestore (nine stages maximum). Use nearest existing mapped lamps, no proxies or new lights; actual lighting.night intensity, only behind loading overlay. Restore through the ordinary environment update. Same20s deadline and current settings revision/cancellation. Costs: more finite shader variants and startup time, measured before acceptance. Runtime lamp distance, intensity, selection and shadow rules remain unchanged. Keeping only no-street stages would miss0→2POINT; leaving lights permanently enabled or extending range would change rendering/performance semantics. Off-frustum-only precompile would not cover the proven count transition; defer until evidence requires it. All qualities/astronomical/B6/remote-avatar combinations remain outside this bounded startup set.

V4 actual GPU confirms the targeted refinement: first movement across the same cutoff now54.4ms maximum instead of851.9ms inV3. FirstF155.2ms. Preparation reached all8 light states but hit20s deadline on restore (20288.3ms total, restore only one progress draw); explicitly NOT accepted as complete. Selected30s deadline for the finite9-stage set after this measurement. This is a watchdog bound, not an artificial wait; preparation exits immediately when ready. Startup overhead is a real tradeoff, not hidden from acceptance. No gameplay pause or lower quality is introduced.
