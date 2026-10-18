# KEY-31: pořadí zachycení light budgetu a readiness

18.10.2026. **Dokončený omezený CPU proof, bez runtime opravy a bez atribuce produkčního nákladu.** Vstup je frozen V4 `bf28a56507b6b0650d214169c8cf94aa3b2d8abc4012a8b098e4e1366340c8c0` s fyzicky odděleným Babylon9.30 core/loaders a již opravenými inactive falloff flags.

Podnětem byl skutečný histogram: V3 control2 měl cap4×216, cap42×2 a45materiálů bez tohoto pole; V4 pilot2 cap4×218 a45bez pole. Dvě42 jsou `photographic leaves · shared flat PBR` a `shared bent PBR`, fotografická tráva. Obě mají enabled/active meshes0; všech95/87 dostupných gameplay vzorků má grass draws/instances0. Nejsou to aktivní CC0 stromové materiály a jejich template nemá shadow/depth caster. **Histogram sám nevysvětluje Day zásek nebo startup variabilitu.**

## Skutečný mechanismus

Pinned glTF loader po vstupních promises globálně zvedne `maxSimultaneousLights` všech materiálů scény na maximum staré hodnoty a počtu scene lights, před awaited extensions a READY (`glTFLoader.pure.js:412–426`). Native Scene oznámí přidání materiálu odloženě (`scene.pure.js:2779`). Vlastní photographic-grass PBR nevzniká přes glTF onMaterialLoaded (`photo-grass-resources.ts:100–105`). Jestliže ho správce poprvé zachytí až při42, `GltfLightBudget.initialDeclaration` to klasifikuje jako fixed deklaraci a záměrně ji nesnižuje.

Známé default4 Game opravuje před preload renderem přes `prepareFrame → stableLights.update → scene.render`, při READY/COMPLETE a před běžným renderem. Samostatný preparation `beforeChecks` pouze inkrementuje render ID. Kontrolovaný čekající extension dovoluje ověřit tuto odlišnou hranici bez změny loader setteru nebo materiálové readiness.

| Skutečný tiny-glTF scénář | Výsledek |
|---|---|
| Vlastní PBR poprvé zachycen po inflaci |42zůstává po prepareFrame/READY/COMPLETE|
| Známý default4, readiness před prepareFrame |Effect sMAXLIGHTCOUNT42, potom nový Effect4|
| Známý default4, prepareFrame před readiness |Vyžádá pouze Effect4|
| Výslovná fixed7 deklarace |Zůstává7|
| Výslovná fixed42 deklarace |Zůstává42|

Ve všech větvích jsou skutečně aktivní jen **dvě světla**. Plné defines se liší pouze MAXLIGHTCOUNT42→4/7. Readiness probíhá přes skutečné `mesh.isReady(true)` se správným camera pass wrapperem; závěrečný render skutečně vykreslí očekávaný Effect. Setter ani readiness nejsou nahrazené.

## Ověření a hranice

[Probe](probe.test.ts), [analysis](analysis.md), [report](report.json.gz), [log](run-02.log). Finální přímý Node/tsx běh **5/5 PASS**, exit0,2.266s,18.10.03:03:52UTC. Předchozí5/5a report s méně přesným material-direct/default-pass pozorováním jsou zachované odděleně; finální assertions používají mesh/camera wrapper. Sdílená scénářová fixture má omezené await/deadlines a cleanup. Extension se odregistruje, observers/container/guard/scéna/engine uvolněné, activeLoaders0. Žádný proces nebo port nezůstává.

[Manifest](manifest.json) SHA `d9a5226f0aa76c7cf4d9250915e59716c3f243e73ff95c6dfc08ae5297d3029c`, [archiv10souborů](archive-manifest.json); source inputs i4pinned dependency SHA ověřené. Nezávislý čtecí audit bez nálezu.

READY gap je **testem řízený**, nikoli změřené původní produkční časování. NullEngine/GLSL nemá skutečný WebGPU UBO clamp, neprokazuje GPU výkon nebo obraz. První capture dvou produkčních grass materiálů v raw není. Proof opravňuje porovnat možné opravy prvního zachycení a ochrany readiness, ale sám nedokládá úsporu startupu. Žádný runtime guard, nový profiler/cache ani změna hraných buildů se tímto taskem nepřidává; celkový cíl zůstává otevřený.
