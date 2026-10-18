# Skutečný FAR thin-instance frontend: výsledek

Malý CPU proof používá frozen low-vehicle-v2 `5c6b36ad783a332030bf21f25344d17b43e6ea0005c9f0bb5a754bae7444c483`, skutečné geometry.json/material.json, acquireGrassResources, PhotoGrassBatch, PBR/PhotoGrassWind, VehicleLighting na low s 0/1 POINT a StableLightState. Produkce, dependencies a hrané buildy zůstaly beze změny.

## Doložený mechanismus a varianty

Resources.ready čeká na pět textur, nevytvoří aktivní thin draw ani Effect. Nenulový batch.flush připojí matrix a photoGrassFade. Pozorovaná FAR větev má 66 indexů / 22 trojúhelníků, count 1, 5120 B reservovaných polí, skutečné volání Mesh._renderWithThinInstances a drawElementsType s instancesCount 1. Celé defines obsahují INSTANCES a THIN_INSTANCES; atributy jsou position, normal, uv, world0..3, photoGrassFade. Low car 0 POINT má LIGHTCOUNT 2, car 1 POINT LIGHTCOUNT 3; oba SPOTLIGHT0, druhý také POINTLIGHT1. Plné defines jsou v reportech, nejsou odvozené z původního GPU hashe.

| Varianta v samostatném enginu | Pozorovaný výsledek |
| --- | --- |
| Skutečně ready textury | 0 programů; první FAR 0/1 POINT přidá 1+1 |
| Neinstancovaný public FAR clone | Připraví 2 jiné programy; první thin FAR přidá 1+1 |
| Zero-count batch s buffery | Normálně disabled, 0 programů; první FAR přidá 1+1 |
| Warm 0/1 → dispose → skutečný deferred cleanup | Poslední Effect zanikne. Následující FAR 0 reuse/0 nových, FAR 1 nový Effect/+1 program. Prosté warm-and-dispose nestačí. |
| Warm → běžný FAR skutečně získá OBĚ 0/1 varianty → temp dispose/cleanup | Oba Effecty zůstanou přesně reuse, 0 nových. Nedokazuje to bezpečné uvolnění po prvním libovolném draw. |
| Medium po FAR při stejných světlech | 252 indexů / 84 trojúhelníků, stejné dva Effecty/celé defines/atributy, 0 nových |

Negativní výsledek okamžité likvidace byl předán rootovi před handover kontrolou. Ta nic nepíše do refCount, setEffect nebo engine cache; pouze vykreslí běžný batch před uvolněním původního owneru. Žádná runtime retence nevznikla.

## Vlastnictví a cleanup

Public resource.clone sdílí Geometry. Další FAR batch bez oddělení geometrie proto přepíše live world0..3/photoGrassFade VertexBuffery: genuine RED09 selže na world0 a všech pět identit se změní. Public makeGeometryUnique na owned temporary clone PŘED flush poskytne GREEN10 a finální GREEN12. Živé roots/slots/fades, CPU matrix/fade pole, allocatedBytes, Geometry/VertexBuffer/material/texture identity a lease wind zůstanou shodné i po opakovaném dispose/release. Dočasný batch má potom 0 roots / 0 allocatedBytes; shared 2 materiály / 5 textur se uvolní až s poslední lease. Celý PhotographicGrass selection/tiling controller se neaktualizuje; nejde o jeho end-to-end test.

Deferred cleanup skutečně proběhne přes timer/event-loop turn a engine.beginFrame/endFrame, pak další turn. Poslední Effect v negativní variantě má skutečně isDisposed=true. CPU array snapshoty jsou read-only čtení připnutých batch.matrices/fades, protože veřejný VertexBuffer.getData po updateDirectly vrací null. Chování rendereru se tím nenahrazuje.

## Adaptační hranice

- NullEngine má instancedArrays=false. Fixture jej výslovně nastaví true před tvorbou meshů, aby provedl skutečnou CPU thin větev. Upload/draw NullEngine nejsou GPU operace: nejde o důkaz hardware instancing.
- Použita skutečná pinned NullEngine.createTexture factory, která vytvoří ready InternalTexture 1×1 bez dekódování původních pixelů. Žádné mesh/material/Effect isReady není přepsané. Geometrie/receptura jsou skutečné; vzhled není ověřený.
- Jde o GLSL frontend, ne native WGSL/pipeline/device validation. Fixture má jeden root s fade 1 a kameru na něj zaměřenou. Obrazové chování budoucí skryté přípravy s fade 0/alwaysSelect tím není přijaté.
- Není prokázáno, že celý 230–260ms browser/GPU gap pochází z tohoto programu. Jiné uživatelské záseky zůstávají otevřené.

## Běhy a další rozhodnutí

Finální run12 nad jediným konečným hashem fixture: 6/6 PASS, bez skipů, 1.995 s runner. Genuine geometry RED09 zůstává uchovaný. Všech 12 pokusů je zachováno: 01–02 odhalily ne-ready NullEngine RawTexture; IO adapter byl opraven na podporovanou Texture factory, shader readiness nebyla obejita. 06 předpokládal neexistující thinInstanceGetBuffer; 07–08 narazily na getData=null. Tyto fixture chyby nejsou mechanismus RED. 03/04/05/10/11 jsou předchozí cílené kontroly; jejich závěry znovu potvrzuje společný run12. Žádný TS/build/GPU ani celá projektová sada.

Další kandidát musí vlastnit Geometry a mít jasnou dobu života připravených Effectů. Root teprve porovná disabled owner do Game teardown versus zásah do skutečného empty batch. Await, neinstanced source, zero-count ani okamžitě zahozený temporary mesh nestačí. ForceCompilation je nevybraná alternativa: bez správného thin count/useInstances/atributů nemusí požádat o stejný program a sama nedokládá finální pass/pipeline. Žádná taková runtime varianta zde není implementovaná.
