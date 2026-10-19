---
title: 'KEY-31/32: skutečný spouštěč a cena UV invalidace'
type: 'chore'
created: '2026-10-19'
status: 'done'
route: 'oneshot'
review_loop_iteration: 0
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

Rozlišit první a pozdější UV identity notifikace a jejich skutečnou synchronní cenu v produkční Medium hře. Použít existující omezený lokální CPU capture a jediný copied Texture probe. Neměnit shader matematiku, notifikace ani produkční runtime. Získat rozhodující podklad pro opravu zbývajících herních záseků; hrané buildy a cizí WIP zůstanou nezměněné.

</frozen-after-approval>

## Implementation Notes

- Doložený current-native CPU profil f80/8fb/SDWf8 obsahuje čtyři stack pozorování Texture→Scene globaldirty→Material scene/submesh/pass scan během11,5ms, nikoli čtyři prokázaná volání nebo CPU podíl. Předchozí plain first-UV guard c78 nepřijat: entry render133ms, maxframe802,9/render686,7ms, jinýprovoz/88°C/start. První-vs-pozdější přechod dosud neznámý.
- Read-only průzkum skutečného cleanclient: SurfacePack.update a CharacterMaterials mohou vytvořit texturu pozdě; transit displej vzniká při příjezdu busu. Nalezené UV hodnoty jsou creation-only, cache klíč obsahuje škálu. Loader KHRtransform mění hodnoty předassign; podporaanimationpointer sama nedokládá skutečnou UVanimaci. Clone má prázdnoumatrixcache. Žádné tvrzení, že UVvysvětluje všechnyhitches.
- Varianty: další plain pilot nerozliší notifikaci; plošnéprofilovánígetMaterial přidá příliš mnoho timerů; cache/meshindex bezlifecycleproof je předčasný. Contextguardreorder má MultiMaterialgetMaterial resetDrawCachesideeffect. Vybrán64eventprobe pouze skutečných Texture UVdirty notification a postcapture wrapper-slot inventory, na přesném stockf27beznepřijatéoptimalizace.
- Footprint je malý a vratný: copiedTexture QA exporty, existingqa-cpu-profile.tsbegin/end/export adaptér a SHAguardedVitepretransform; žádnýmain/Game/runtimepin/lock/dependencywrite. Žádné nové trvalé veřejnéAPI, novéuživatelskévolby ani nevratnéakce/intentgaps. Ones hotvolba vycházíze známéhoúzkéhoscope; týmové overrides nevyžadují dalšípotvrzení.
- Helpertask vlastní copiedprobe+actualTexturetests/inverse/handoff, rootQAclaim cache/evidence/spec/renderer aheavy/GPU/build/4200/2595. Původníf80Game18editů/rendercost a stávajícíProfiler16ms/max2000 zůstávajíbyteexact. Probe začne jen přiúspěšnémCPUcapture, stopflag na benchmarkend/dispose, exportread uvolnísceneref. Boundedserializeddata, žádnéTextureobjekty vexportu.
- Captureevent obsahujeTextureid/name,hadMatrixpředalokací,identitybefore/after,uBase/UV/cachevalues a elapsedkolem původníhoScene.markAllMaterialsAsDirty. QA selhánínesmízměnitreturn/throw/math/notifikace. Wrapperinventory slotlength/livecount/max až po trace stop mimo měřenýinterval; holes jsou zatímhypotéza, neprofilovýnález.
- Ověřithelperdisabled/enabled/errors/overflow/reentrantgeneration/noScene/matrixdirtyparity, rootintegrationguard+existing29regresí/fullTS/minifiedhiddenmapsbuild, přesnýjedenmodulehit a nezměněnédependencies. PakjedenactualMediumEdgefirstentry/drive/source/session/raw1:1/foreground/health. ŽádnéCPU/GPUkonkurenceběhembenchmarku, FPSprofilerunevydávatzaA/B. Independentread-onlyreview a scopedcommit/main/Linear; ownservicesstop předrelease. Rozhodnout dalšíopravu podle actualdata, nikoli podle zelenýchtestůdiagnostiky.

## Outcome

Diagnostika dokončena: root31/31/fullTS/build a helper12/12+15-stateactualTextureparity PASS, review[]. Prvníroot30/31fixturecleanupfailure zachován,opravenpouzetestDOMrestorepředNullEnginedispose. Source3320c7a9…/probeedaa,oneVitehit. ActualEdgecapture769samples/benchmark-end/rawUI1:1/validhealth,ale6intervalů≥100ms a**UVevents0/overflow0/errors0/probeErrors0**. První-vs-pozdějšípřechod sevtomtoběhunevyskytl; wrapperinventoryunavailable nenínulováscéna. Konkrétnídirtystackyvedou také přesnovégarmentmateriály/transit a shadow/lightrecreation;nezaměňovatstackpresencezaCPUshare. Dalšípráce: publicatomicinitializationnovéhomateriálu aodloženáMedium/Highvehiclepříprava poSDWsharing. Žádnáprodukčníoptimalizacetímtocommitem,původníshader/math/notifikacebezezměny. Vlastníscéna/4200/2595stopped/viewportreset,hranésnapshots nedotčeny. Evidenceuv-dirty-profile/README.md; KEY31/32/default/migrace otevřené.
