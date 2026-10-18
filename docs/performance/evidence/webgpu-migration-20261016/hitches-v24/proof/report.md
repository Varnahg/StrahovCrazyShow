# Bounded memo hotového define textu — izolovaný CPU důkaz

18.10.2026. **V tomto kontrolovaném warm řetězci memo zrychlilo i celý synchronní render, na miss churn naopak přidává režii. Žádná produkční cache nebo patch nevznikly.** Vlastnictví a browser/GPU přínos zůstávají samostatnými otevřenými podmínkami.

## Reference, kontrakt a izolace

Reference A je fyzický přijatý `Materials/materialDefines.js` SHA `43a75f4ae32d48c9f23a815f8f2996e895ce3e8d3574f4a04504ee00444916f4`. Předchozí čisté A/B/C mělo pouze3–5% rozdíl serializeru a žádné zlepšení celého warm renderu; nevznikla z něj shipping varianta. Tento proof nemíchá memo s pure C ani se změnou startup scheduleru.

`DefineMemo` má explicitní testový owner. Pro skutečné experimenty je konfigurace pevná64entries a262144součtových codeunits `key.length+value.length`; menší kapacity v unit testech ověřují hranice. Konfigurace je po konstrukci immutable. FIFO hit nemění pořadí. Lookup přes celý exact primitive raw string proběhne až po celém původním property loopu; miss deleguje skutečnému A helperu. Ukládá se jen změněný string `output!==raw`, takže unknown/fallback, empty, oversized a already-sorted výsledky se neukládají. Příliš drahá jednotlivá entry nevyhodí ostatní. Neexistuje hash-only klíč, material/Effect/engine key, druhé čtení getters nebo cache v entries obsahující resource objekty.

Fyzické dependencies se nemění. Loader ověří přesný preimage a na stejné skutečné module URL použije testový source; změna memo class je pouze poslední návratová věta **po** původním loopu. Testový owner controller je samostatný modul. Core veřejný namespace zůstává pouze `MaterialDefines`; originální18regresí to stále explicitně kontroluje. PBR/Standard/plugin/core/loaders mají jednu fyzickou identitu. Původní warm assertions, native WebGPUEngine.createEffect delegace, trace a NativeProcessingEngine jsou převzaté beze změny, navíc mají pouze jeden side-effect import pro beforeEach/afterEach owner lifecycle.

V1 nejprve přidával kontrolní exporty přímo do testového core namespace. Původní class assertion to správně odmítla5PASS/1FAIL. Assertion se neoslabila: controller byl přesunut ven a V2 prošla18/18 pro A i M. V1 generated modules, input/receipt/capture i neúspěšný log zůstaly. Žádný tento fixture neúspěch není produkční cache bug.

## Actual warm výsledky

Šest samostatných procesů v pořadí **A,M,M,A,A,M**, každý5/5PASS. Každý druh má na variantu48warm přepnutí a48nezměněných snímků; vždy36actual submeshes. Mediany ms celého synchronního budget/order/render:

| Actual druh | A | Memo | Relativně v tomto CPU fixture |
|---|---:|---:|---:|
| PBR |8.74455|5.57915|−36.20%|
| Standard |6.23860|4.54430|−27.16%|
| PBR + CampusSurfaceArt |8.70680|5.52245|−36.57%|

Každý jednotlivý memo proces má median pod každým A procesem pro příslušný druh. PBR A9.086/8.462/8.374 versus M5.551/5.390/5.823; Standard A6.560/6.426/6.200 versus M5.020/4.402/4.538; Surface A8.519/8.750/8.519 versus M5.733/5.198/5.354. Zachované všechny vzorky i maxima, žádný vyřazený pomalý proces.

Celé serializer scope A→M: PBR4.606→1.871ms, Standard2.868→1.412ms, Surface4.548→1.960ms. Tyto časy jsou **vnořené** v renderu a nesčítají se s ním. Memo nevynechává původní loop; lookup/hashing a celý původní řetězec stále stojí CPU. Trace/native cache timer zachovává známou post-call observer režii. Snapshot ověřování je mimo synchronní interval, jeho alokace mohou ovlivnit pozdější GC.

**54/54 kompletních variantních snapshotů mezi šesti běhy exact:** full defines, key/Effect IDs, zpracovaný WGSL, processing/layout metadata a forwarded uniform updates. Každé warm přepnutí pořád36actual native cache hitů,36Effectchanges,36serializací/onEffectCreated/setEffect/reset a0novýchprogramů. Genuine define změna1novýprogram a návrat do původního Effectu. Native refcount změny zachované. Úspěch i observer sentinel failure uklidí původní hooky/observers/scény/enginy/Effects/contexts a aktivní memo owner; každé afterEach vykazuje0retainedentries/0codeunits.

Typický úspěšný homogenní case má900raw calls,897hits a3misses,0evictions,3entries; key+value jednotky PBR/Surface17858, Standard9440. To je charakteristika **fixture**, nikoli odhad reálné hry.

## Úplný mixed corpus a nepříznivé workloady

Root inventář se100výskyty49unique není pořadí raw přístupů a jeho paths jsou omezené na4. Proto proof čte přímo9.7MB baseline gzip (packed68cda485…66858/plain355ec327…896f): úplných50baseline stavů10plugin/regular/thin větví. Canonical větev slouží pouze jako exact expected/already-sorted kontrola. Výběr raw má28unique/80764codeunits. Deset větví: PBR, Standard, CampusSurfaceArt, PhotogrammetryNight, TreeWind, CarPaint instanceColor, PhotoGrass regular/thin sphotoGrassFade, GrassWind thin aStudentHairTint. Ověřuje je také actual18class/WGSL/plugin/attribute testů obouvariant.

Promíchání je deterministicky testové, **ne produkční access trace**. Pro mixed full micro se z původních values zachová aktivní pořadí z raw řádků a připojí původní neaktivní hodnoty; raw výstup se před časováním exact ověří. Nejde o tvrzení, že pořadí původních false `_keys` bylo zaznamenané. Actual warm řetězec výše používá původní skutečné Defines objekty a loop.

Raw/helper/full jsou samostatně přímo měřené scopes, nikoli rozdíl odečítaných časů. Full při každém volání znovu sestavuje raw string; nepočítá jen lookup předem hashovaných hodnot. Pět batchů/scopů/proces, fáze rotované podle run ID. Mediany µs/call:

| Full workload | A | Memo | Význam |
|---|---:|---:|---|
| Mixed warm50stavů |92.758|23.798| po zahřátí28klíčů;0evictions |
| Mixed cold, clear před každým sweepem |91.814|73.545|28misses a22hits v každých50calls |
|129unikátních variant, FIFO churn |98.351|105.967| **+7.74%**,0hits |

U churn je skutečně aktivní i kombinovaný limit: peak44entries a262106codeunits, pod262144. Každá další nová entry vyžaduje eviction; žádný únik přes entry limit. Malé unique misses v helperu A2.216µs→M3.950µs; unknown A1.010→M1.340µs. Absolutní čísla jsou malá, ale ukazují reálný náklad oproti čisté funkci. Near-limit helper zahřátý hit je rychlý, avšak jde o jediný kontrolovaný32Ki blok, nikoli renderer. Žádné výsledky nelze převést na hru přes násobení794changes nebo hitrate.

## Ordered actual capture

Samostatný **untimed** V2 capture5/5PASS zaznamenal přímo vstup původního A helperu po raw loopu:2953calls/9textů/0omitted,22578unique codeunits. `capture-02-owners.json` obsahuje očíslovaný textový slovník, přesnou posloupnost ID a jméno testu pro owner boundaries. Četnosti se shodují s předchozím9textovým inventářem, nyní je pořadí zachované. Capture má vlastní počet/text/sequence cap a nezúčastňuje se timed porovnání. Je to skutečná posloupnost kontrolovaného warm fixture, stále ne production trace.

## Ověření, životnost a nevyřešená produkční volba

- Functional10/10PASS: mixed bytes, FIFO bez hit mutation, combined cap, oversized/no-evict, zero caps, unknown/sorted/empty, numeric/reserved/late syntax, near-limit, dvě nezávislé owners, clear/dispose, immutable konfigurace, getter reads na hitu, falsy throw identity, reentry bez outer provisional entry, latekeys, clone/equality a miss churn.
- Reference18/18 a Memo18/18 původních class/WGSL/plugin/attribute/tinyGLB identity regresí PASS. Žádné odebrané assertions; stejný known unsupported order-sensitive processor negativní limit.
- Šestactual warm5/5 + šestmicro exit0; scopedTS3172/0 pro skutečnou copied TS closure. JS owner/loader jsou behaviorálně ověřené; tento TS check nepředstírá kontrolu JS implementace.
- Žádný browser/GPU/fullsuite/build/install/port. Všechny children skončily před oznámením uvolnění CPU okna; časování explicitně koordinované. Původní shader sources, raw snapshots a negativní logy jsou zachované.

**Owner zde končí po každém testu.** Entries obsahují jen primitivní stringy, counters čísla; žádný engine/material/Effect/descriptor/observer ani user callback. Controller drží jen čistou referenční funkci a právě explicitně aktivního ownera, poafterEach null. Dispose uvolní všechny entry strings; u opuštěného explicit owner.convert je cache bypass, výsledkem zůstává referenční funkce.

Logický codeunit cap není fyzický heap limit: neobsahujeMap overhead, dočasné raw/parser stringy, ropes/sliced backing storage, internování čiGC. Žádné heap měření ani force-copy trik nebyl použit.0logicalretention po dispose není GPU leak proof. Fyzické Node/NullEngine pipeline/binding backendy nenahrazují browser driver.

Projektové `docs/performance/webgpu-migration.md:55` vyžaduje vlastnictví GPU caches per engine/device generation. Čistý module memo by byl sémanticky nezávislý naGPU, ale žil napříčscenes a není automaticky schválenou výjimkou. Engine-owned varianta vyžaduje explicitní binding; MaterialDefines engine nezná. Per-Defines WeakMap nededuplikuje36submeshes a bez dalšího mechanismu nemá celkový cap. LastCreatedEngine/Scene nejsou použité. Tato otázka musí být vyřešena samostatně před případným produkčním experimentem.

**Rozhodnutí z tohoto tasku:** memo má dostatečný pozitivní CPU důkaz pro další koordinátorské posouzení, ale FIFO churn má doloženou regresi a productionhit/locality ani heap nejsou změřené. Cache se do hry nepřidává. Další případný experiment musí mít jasný owner, zachovat všechny guard/throw/lifecycle kontrakty a samostatně změřit celý day13 startup/Golden/F při nezměněném scheduleru. Pokud se celý přínos nepotvrdí, negativní výsledek je platný.
