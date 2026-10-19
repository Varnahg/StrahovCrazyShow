---
title: 'KEY-31/32/34: F3 Medium backend matrix'
type: 'chore'
created: '2026-10-19'
status: 'in-progress'
route: 'oneshot'
review_loop_iteration: 0
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

Na stejném aktuálním produkčním F3 checkpointu ověřit WebGL2, kompatibilní WebGPU a existující WebGPU non-compatibility režim při cílovém Medium. Změřit skutečné FPS a záseky první jízdy a rozhodnout, zda NCM pomůže doloženému bind/submission nákladu. Zachovat hrané buildy a nezapnout default podle dílčího výsledku.

</frozen-after-approval>

## Implementation Notes

- Rozsah je pouze zmrazená kopie již ověřeného native-clean F3 source3c4be6d…/MD3cc739…, stávající dist/testy a nové provozní protokoly. Žádná změna runtime, nový profiler/cache, shader nebo rebuild. Předešlé1453/fullTSbuild/4integration jsou doklad tohoto přesného snapshotu, nikoli nové testy.
- Primarycode: render-engine.ts přijímá veřejné querywebgl2/webgpu/webgpu-fast a před scénou nastaví compatibilityModefalse jenfast, snapshotRenderingfalse. PinnedWebGPUEngine._draw2896–2913 přiNCM používáfastBundle a obchází běžnýpipeline/bindgroup/drawsetup pouze pokud context nenídirty. WebGPUDrawContext.reset ruší bundle/bindgroups/buffer slots. Proto může ovlivnit40,5/33,4ms bind/draw zaktuálníhoprofilu, ale nenahrazuje37/24ms serializeru.
- Varianty: další schema/fragmentcachebylyodmítnuté CPU; whole-materialvariantreuse má větší potenciál vpreparation, ale dosudneprokázanýdirty/plugin/pass/device/refcountkontrakt. NCMjejižexistujícíenginecesta, vyžaduje aktuálnídata poF3 a obraz/health, není automatickýdefault. Přidat do stejného protokolu WebGL2 snížíduplicitníkontroly a poskytne skutečnou1actualreferenci. Není to finální≥3actualmatrix.
- Protokol9běhů Latinorder GL/CM/NCM, CM/NCM/GL, NCM/GL/CM. KaždývlastnífreshAPI/engine/tab, publicpreviewready a gameSvítilna(F)enabled;30s od veřejněpozorovanégame-ready. Alex/1actual/0ambient, MediumCSS/internal2040×986, night1792447200000, stejnéřízenéweather. S1900/E marker/UIentryhint, benchmark10s→close→E→W8000→space2500; během intervalu žádnéDOM/screenshot/GPUcommandpozorování. Rawready/protocol timestamps/clock/temp/trajectoryukládat.
- Given stejnézdrojovébytes a protokol, when backend vytvoříscénu, then veřejnývýsledek obsahuje skutečné backend/compatibilityMode/source/rozlišení/health a souvislourawsessionseq0. Given jinýambient/frameerror/asset/device/compiler/binding, when běh skončí, then rawzachovat, výlukuzdůvodnit a neprezentovat jako platnoupřejímku. NCMchyba jejmůževyřadit, neukončí smysluplnéGL/CMsrovnání.
- Vyhodnotit všechnaFPS/p95/p99/max/≥100ms spolu scompilation/submission a existujícímibundlecounters; counts nejsouGPUčas. Nepřisuzovatkauzálníprocentobezkontrolyclock/teplot/browserdrivercache. Startupdelšíjeuživatelempřijatelný, ale budepravdivěuveden. Screenshoty stejného setupu/afterdrive sloužíomezenéobrazovékontrole, neúplnéLOD/lifecyclepřejímce.
- WritePaths aresourcesvtasku: vlastnícache/evidence/BMAD/handoff, protectedborrowednativeclean dist; readonlydeps jsouchráněnéživým4201taskem. PředGPUověřenýinventář: žádnáherníkarta vEdge/IAB. Předkaždýmrunemznovukontrola vlastníhotabu+neexistencecizí3D;4201/4199/službyiastaršísnapshotybezezměny. StopjenexactPID/start/path/command, APIlogpředstopemflush; opravenýUseBasicParsing. PIDsjenignoredcache, varchivevýslovnáprovenanceprojekce.
- Nezávislýčtecíscope/raw review, scopedcommity/main/Linear. Malývratnýměřicíops celekbeznovéhoAPI/nevyjasněnéhozáměru; oneshot. Taskdonebudepouzeměření/rozhodnutí; migrace/Mediumcíle/≥3actual/defaultzůstanoupodle skutečnýchvýsledků.
- STOP/pending po2actualrows: rozdílný ambientUTCload(0/1/1vs1/0/0) a c1Medium17newprogram/18syncpipeline. Devítiběhová přejímka není provedena; nutný upstream attribution/coverage a traffic clock včetně fyzikálních obstacles. Vlastní API/taby ukončeny/viewport reset; goalaktivní a root pokračuje prerequisite. Spec neníDone, frozenintent nezúžený.
- Scope review doplnil právě1UI/rawframe match, medium/car/drive/foreground gate a durationSeconds interval místo11s. Recheck[]. g1/c1 oba valid=false kvůli ambient. n1 nevytvořil NCM renderer. Partial commit nepředstavuje finální performance/default přejímku.
