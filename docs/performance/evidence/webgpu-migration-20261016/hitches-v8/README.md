# KEY-31: doplnění důkazu pro avatara a vstup

18.10.2026. Dva omezené CPU proofy navazují na zbývajících20 modulů/10příprav v [GPU pilotu hitches-v7](../hitches-v7/README.md). **Nejsou GPU přejímkou, runtime opravou ani důkazem odstranění1.9s mezery.** Vstup je frozen a94 a pinned Babylon9.30/Rapier0.21; žádné nové závislosti, kopie celého projektu nebo změny hraných buildů.

## Skutečný avatar

[Handoff](avatar/handoff.md), [probe](avatar/probe.ts), [report](avatar/report.json.gz), [summary](avatar/summary.json.gz), [finální log](avatar/probe-final.log), [manifest](avatar/manifest.json.gz).

Actual Alex near vytvořený původním createAvatarRig/PrimitivePool/LOD/Animator má12 skutečně vykreslených částí a7 unikátních main Effectů. Pro OFF i ON jsou plné defines a Effect IDs stejné mezi B6 referencí, variantou A (B6 světla/kamera ve spawn pose) a menší variantou B (`apply(day, flashlightOn, 1)` s původní mapped lampou). Reentry po restore stejné Effecty znovu použije. Zapnutý POINT při intensity0 i0.7 zachová stejné defines/identity. Hidden varianta má0draws a není vydávaná za coverage.

Skin/garment skutečně používají4bone influencers a BONETEXTURE, head/ocular/hair regular INSTANCES, strands ALPHATEST/ALPHAFROMALBEDO/BUMP. Frontend caps byly explicitně nastavené, aby tyto větve nezmizely. Úzký schválený IO adapter dokončuje upload původně vytvořených raw textur; metadata a původní data se nemění, material/Effect readiness není přepsaná. Dvě64×64 normal textures a56×1 float bone texture mají po cleanup references0. URL textury používají NullEngine dummy upload; raster a reálné obrazové vlastnosti tím ověřené nejsou.

17captures,6přesných porovnání a cleanup assertions PASS, finální UTC00:19:15.265–.741. Předchozí neúspěšné pokusy jsou zachované. Kamera fixture má distance/cameraArm5, zatímco původní Game defaults jsou8; nejde o přesnou reprodukci výchozí startup kamery. Ověřený je actor/requested state, rig a výsledná kamera (restore odchylka6.02mm), nikoli úplná interní historie visibility/camera controllerů. Další avatary/LOD, plná animace, okolní occluders a aktivní celestial shadows zůstávají mimo rozsah.

## Konkrétní chybějící vstupní meshe

[Handoff](entry/handoff.md), [výklad](entry/analysis.md), [probe](entry/probe.ts), [report](entry/report.json.gz), [finální log](entry/run-04.log), [manifest](entry/manifest.json).

Flat landing view v OFF/ON kreslí8/8 původních GLB částí a kovový box batch, ale nekreslí `b6 dogleg floor 0 entry-metal` ani `b6 floor 0 b6:concrete stair treads`. Jediný source-derived orbit je vykreslí a zachová všech8 GLB částí. Tato jména odpovídají chybějícím meshům v raw seq4575. Box batch a madla sdílejí materiál, avšak ON madla mají jiný Effect a navíc SHADOW0/SHADOWPOISSON0/SHADOWS; samotný shodný materialName by byl nedostatečný důkaz.

Původní CameraFollow a skutečný Simulation.cameraDistance/Rapier sweep nad57kanonickými vstupními collidery dají pro landing body(-4.85,2.6,-76.95), inward yaw0, původní pitch0.28/distance8 kameru(-4.85,4.10905,-79.28090), arm2.501894m. Nejde o plný produkční collision world ani editorové transformace. Čtyři medium kombinace2views×OFF/ON a cleanup PASS; finální run-04 dne00:19:13UTC, scénová část284.46ms. První high výsledek i předchozí chyby cest jsou uchované a nejsou zaměněné za finální výsledek.

## Rozhodnutí a hranice

Nezávislé read-only review ověřilo manifesty/artefakty,73avatarových zdrojů a25entry vstupů, actual draws/defines/reuse, IO hranice a cleanup. Bez blokujícího nálezu pro navazující QA. Oba důkazy používají NullEngine/GLSL a POISSON místo WebGPU PCF; neprokazují WGSL/pipeline či pixelovou shodu ani počet kompilací, které zmizí na GPU. Samostatný typecheck/fullsuite/build/integration/GPU se u těchto proofů nespouštěl.

Vybrán další **izolovaný** QA kandidát: dvě day mapped-POINT1 OFF/ON etapy přes existující spawn apply a náhrada flat B6 view jedinou odvozenou orbit pose. Varianta A by přidala zbytečný režim kamery; samotná ON etapa nepokrývá doložený vstupní OFF zásek. Žádný přesun actoru/avatara, shadow retention ani nová cache. Čistý orbit target/desired výpočet se má sdílet s CameraFollow, normální historie a alokace zůstanou zachované. Virtuální B6 použije skutečný read-only clip bez přepisování Game pitch/cameraArm/snap. Původní30s deadline/readiness se nezvyšuje.

Dva nové stage labels přesahují původních16 v opt-in inventáři; QA výslovně použije existující bounded maxStages20, bez dalších hooks nebo změny ostatních limitů. Startup cenu a úplnou obnovu musí změřit další pilot. [Archivní manifest](archive-manifest.json) ověřuje24 převzatých souborů včetně gzip obsahu; runtime zdroje a malé GLB zůstávají pod SHA uvedenými v původních manifestech. Pro reprodukci je nutné obnovit odpovídající frozen vstupy/readonly dependencies a upravit lokální referenční cesty, nejde o samostatný instalační balík.
