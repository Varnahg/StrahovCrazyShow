# Další rozlišení nákladu hraní

Výchozí maincdb3b8f7 + ověřený diagnostický celek. Závěry výzkumu jsou v `_bmad-output/planning-artifacts/research/technical-gameplay-smoothness-2026-11-03/research.md`. Žádný dosavadnícounter sám neprokázalCPU/GPUbound.

1. Problém: pravidelnýrender scope32–38ms a jednotlivý1329,6ms interval, který původnínarrow66ms nevysvětluje.
2. Hypotéza: významný náklad může být v opakovaném submission/render state; zbývající mezera může patřit recorder/HUD nebo enginu/browseru. Příčiny oddělit časovým párováním.
3. Změna kontrolního běhu: stejný nový immutablebuild, WebGPUCM proti již existujícímu loopback `webgpu-fast` (NCM), stejnáMedium/CSS1280×720/target60/QAday+autumn/3relace. SyntaxcacheOFF. Snapshot rendering zůstává vypnutý v obou backend větvích. Žádný default switch podle jedinéhočísla.
4. Metrika: úplné frameIntervals, p95/p99/max a četnost>50/100/250ms; narrow a celá předchozíCallbackCPU/tail; dostupný GPUmainpass se scope. MainDraw/candidateevaluation a případnébundlecounters jsou mechanistickýpodklad, nikoli sčitatelné celkovéčasy.
5. Správnost: obě větve musí skutečnědosáhnoutready, stejné health/variant gates a původní30/90s limity. Bezbuildů/testů přiGPU. U NCM zvlášť pohyb/LOD, avatary, světla, stíny, zánik scény. Historický buffer-after-destroy a v12timeout nejsou aktuálněreprodukované, ale nejsou ani automatickyvyřešené.
6. Rozhodnutí: první jedenCM a jedenNCM běh jsou rozlišovací, ne finálnípřejímka. Pokud je kandidát zdravý a náklad se přesune očekávaným směrem, provést opakované A/B a pohybovou trasu před změnou defaultu či konkrétnímrenderpatchem. Při chybě nejprvelogy; žádné slepé opakování. Pokud samotná tato kontrola neurčí zbytek mezery, jeden samostatný krátký `profileFrameLifecycle=1` běh se stejným backendem a dvěmaboundarysnapshoty, nikoli drahý `profileEnvironment=1` se shadertextinventářem.

## Podklady k volbě první kontrolní varianty

Čtecí audit cdb3b8f7: render-engine.ts:91–92 volí CM/NCM a vobou zakazuje snapshot rendering; render-fallback.ts:12–21 držífastloopback. Native NCM asyncstartup jižpodporuje webgpu-pipeline-preparation.ts:115–116,171–175 a máregrese, staré tvrzeníinert z21.10 jehistorické. Tree draw-range má cílenouinvalidaci vtree-season-geometry/tree-draw-cache. Poslednínalezený v12 NCM timeout a staršíbuffer-after-destroy jsoujenhistorickéneúspěšnépodklady; nováGPUdata stále nutná. Cenakontrolnívarianty jeparametr existujícího backendu, proto jí dát přednost před spekulativním přepisemstatické scény.

WebGpuFrameLifecycleProfile užumíprocesní/renderframe/endFrame/flush/encoder/dispose/uploads a rawRAF/cadence. Synchronouswallinterval nenídůkazGPU execution a nestedintervaly senesčítají. Nový nezávislýpřepínač mádefaultOFF a maximálně8detaileventů/s; snapshots zachovávají counters. CompilationProfile neizolujecelé material readiness; RenderIncidentProfile dosud nemá runtimeconsumer. Dalšíobecnýprofiler nevzniká.
