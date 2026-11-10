# Integrační kontrakt schváleného Ultra plánu

Cwd D:/CodexWorkspaces/StrahovCrazyShow-graphics-20261104, branch codex/graphics-smoothness-20261104. Root vlastníGame atelemetrii. Každýleaf vlastní jen task paths, provádí refaktor/testy a bez dalšíhoBMAD předá stabilní checkpoint.

## UI/shared

RenderQuality zůstává low|medium|high. RenderQualityMode přidává ultra|custom k auto+3presetům.
VisualFeatures: shadows:boolean,clouds:boolean,groundVegetation:boolean,trees:'normal'|'far-only',postProcesses:boolean.
RenderPreferences: version:2,targetFps,mode; custom navíc quality:RenderQuality,renderScale:number(0.5..1),features:VisualFeatures. Presety ignorují customdata a mají své defaults.
EffectiveVisualSettings: mode,quality,targetFps,hardwareScaling,renderScale,features,budgets. Auto bere quality/scaling z adaptivního stavu. Ultra low/scale.5/alloff+far-only. Staré3presety zachovají budgets a postProcesses defaults.
Exporty: createRenderPreferences(mode,targetFps?),parseRenderPreferences(unknown),resolveVisualSettings(preferences,adaptive?:{quality,hardwareScaling}),toCustomRenderPreferences(effective,targetFps?). UI vlastník sdělí stabilní shared checkpoint rootu ihned.
AdaptiveQualityController: options.preferences,setPreferences(),getter preferences,snapshot.features. LegacysetMode/setTargetFps kompatibilní; ultra/custom manuální, Auto původní3qualityalgoritmus. Žádné per-frame alokace novéhoresolveru.
Game(root): constructor čtvrtý optional RenderPreferences, inicializovat PŘED loadWorld/vegetation. applyRenderPreferences(next):Promise<boolean>,cancelGraphicsApply():void,getEffectiveVisualSettings():EffectiveVisualSettings. true=potvrzenýtargetframe;false=neaplikováno/restored/error. onGraphicsState?: callback {applying:boolean,phase:'preparing'|'restoring'|null,error:string|null,restartRequired:boolean}. Tento GraphicsApplicationState typ exportovat ze shared/render-quality.
UI: společnýpanel předhrou/ve hře; draft/Použít/zahodit,50–100%,5voleb. Manual edit→customzaktuálníhoresolvedbase;presetreset. UložitlocalStoragejenpoGame success; předhrou uložitvalidníprefsbezGame. Odstranit per-select side effects a pozdější startupsetQuality, kteréby přepsaloflags z constructoru. Game.ready přiApplyzůstávátrue; overlay a callbacks, žádnýreload aniimplicitnífallback.

## Vegetace/obloha

loadVegetation(scene,options?) přijme options.visualFeatures:Pick<VisualFeatures,'groundVegetation'|'trees'>. Vracenýcontroller setVisualFeatures(features):Promise<void>; staréAPI zůstává.
ColdOff bez fotografickégrassIO/preparation, flowers/litter skryté bezupdate; readinessnesmí čekatnavypnutéčásti. On načte/reusevlastníky; lateOff nesmí znovuzapnout. FAR-only předload a v každémwarmupu, viditelnéFARkmeny/koruny; beznear/MIDrequests; boundedcachezůstává.
SkyWeather(scene,options?:{cloudsEnabled?:boolean}),setCloudsEnabled(boolean). RenderCoverage0 do sky/sun/moon; meteorologie/CloudLightSampler/astronomiebezezměny. Potvrditrootu případné přizpůsobení skutečnémuexportu.

## Světla

CinematicAtmosphere(scene,camera,sun,initialFeatures?:Pick<VisualFeatures,'shadows'|'postProcesses'>),setVisualFeatures(features):void. Defaults respektují starépresety; explicitnípostProcesses umožní Low+ON/High+OFF.
VehicleLighting(scene,kind?,shadowsEnabled=true),setShadowsEnabled(bool). PlayerFlashlight analogickyoptionalinitialflag a setter; potvrditrootunázev/signaturu. Offmasterprosolar/player/car, On dlequalitybudgetu. Světla samotnázůstávají.
ColdOff bezshadowgenerator/postpipeline. LiveOff smídržetjenjednusadu bezrender/casterselection/mapresize; žádnécachekombinací. Scene.postProcessesEnabled místo unsafe detach. Resize/reenable pod Gamepřípravou, disposeuvolníiretainedresources.

## Root

Samostatné graphicsApplying; nevypínatGame.ready. Jedinýpřípravnýrenderowner; běžnýframe dál onBeforeInputFrame/autority/timeline+simulace/neutralinput/flush. Připravitjen frozenApplytarget včetněscale2 aflags pomocí lower prepareLightingVariants +pravdivéshader/pipelinehealth adaptéry. Manualstart jen vybraná konfigurace; Auto původní3kvality.60s/quality a180s celkem zachovat. Po dokončenémsnímkucommit+persist; timeoutneznamenásuccess. Rollbackpouzegrafiky sreadiness,device-loss restartrequired.
Efektivnífeatures/revize/transition do benchmarku/rawcontextu/whitelistu (nikoli názvyobsahujícíprofile). ≥20%mediánu času scenérie protiLow bezopakovanép99regrese pro prokázanývýznamnýpřínos. Jednotlivévolby+Ultra, pevnápozice pohleddolů/scenérie a10sopakování, stejnépočasí/HUD/avataři/LOD; změnaresolutionmůžeměnitprojekčníLOD. Cold/warm/B6/car/night/lifecycle. Runtime/nejdelšíhitches a data-qualitynezakrýt. Rootserializujeheavy/GPU a provedeplnouvalidacinadstablecheckpointem.
