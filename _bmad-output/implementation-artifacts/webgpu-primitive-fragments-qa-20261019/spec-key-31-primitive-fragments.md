---
title: 'KEY-31/32: omezené opakované použití primitivních fragmentů'
type: 'refactor'
created: '2026-10-19'
status: 'done'
route: 'oneshot'
review_loop_iteration: 0
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

Odstranit podstatnější část doložené CPU ceny serializace při změně světel bez změny výsledného shaderu, čtení hodnot a herního chování. Nejdříve ověřit izolovaný bounded primitive fragment reuse proti aktuálnímu F3. Runtime změnu přijmout pouze po doložené správnosti a dostatečném CPU i produkčním přínosu; zachovat hrané buildy a cizí WIP.

</frozen-after-approval>

## Implementation Notes

- Důkazy: F3 native-clean3c4be6d025f8524687e2eeb1cdf8f99f1c007ef12593ddda7c7db1ceb650fa03 / MD3cc739bea27f7ec1f1b0f43e089d72d63ab15952166e7d3557c88af10ed34768. Aktuální Edge source46dab140… má při entry toString37,4ms/499 z95,5ms mesh přípravy, další24ms/431 z56,3ms; createEffect jen3,1/3,2ms. Předešlý sparse zápis nepřijat pro malý wholewarm zisk a nezlepšený cold. Nejde o cenu specifického vnitřního kroku ani FPS příslib.
- Primární průzkum: VehicleLighting.updateBeam→Light.setEnabled/_resyncMeshes→AbstractMesh._resyncLightSource→markAsLightDirty→PrepareDefinesForLights→Standard/PBR preparation→toString. Členství/count/typy/falloff/shadows/projector/IES a MAXLIGHTCOUNT skutečně mění defines; nula newprogram značí již předehřátý Effect. StableLightState markuje jen přeskládané seznamy. Automatický globalenabled cap může vytvářet další skutečné změny, ale v posledním Low profilu enabled3↔4 stále spadá do floor4; nelze mu připsat všechny náklady.
- Varianty: úplné submesh/pass variant reuse má největší potenciál, ale neprokázaný úplný signature/plugin/dirty/device/refcount kontrakt; plošnýfreeze/klony/hotswap vynechají potřebné aktualizace nebo znovu resetují draw cache. NCM může zlevnit bind/draw, nikoli defines a dosavadnífast piloty jej nepřijaly. Rezervacapu neodstraní nutný LIGHTCOUNT. Prefix metadata přidává stringy, densearray vyžaduje prototypebezpečnost. Starý whole-result memo nejprve dělal celý formatting; F3 drží jen names/order. Nový mechanismus vynechá opakovaný formatting i literal regex pouze pro prokazatelně stejný primitivní name/value, při zachování všech původních reads. Proto izolovaný proof před větším zásahem do engine readiness.
- Helper scope: .cache/webgpu-primitive-fragments-helper-20261019/ + vlastní handoff, disjunktní claim. RootQA .cache/webgpu-primitive-fragments-qa-20261019/ přebírá pouze dokončený hashovaný modul/testy. Hlavnípatch/lock/productionfiles mimo scope, žádná další diagnostická vrstva. Reuse poslední CPU fixtures včetně52/156+2init, actualWGSL11/55, wholewarm/cold3A/3B a stejné24receiptkontroly. F3 testy se neoslabují; nový cachekontrakt má samostatnou regresi.
- Cache kontrakt: WeakMapreceiver→holder, FIFO pouze holder bezreceiverref, max1024holders/524288value+fragment slots/4194304UTF16stringunits pro hodnotovéstringy+fragmenty. Eviction opravdu uvolní payload stále živého holderu. Žádné object/function/GPUvalue refs. Per-call immutable snapshot, publishjen po úplném úspěšném safe průchodu; nevynechat žádný původní getter/keycoercion/throw ani full-name check/canonical fallback/initboundary. Strukturální režie a inflightpayload se přiznají, nikoli falešný heaplimit.
- Given stejná primitive name/value v completed safe snapshotu, when serializer čte další stav, then přesný fragment a jeho předchozí bezpečnost lze použít znovu. Given změna typu/unsafe literal/key/proxy/reentrance/eviction, when původní cesta formátuje, then výstup, trace a throw jsou identické s F3/oracle a cache nezachová objectref ani nehotový výsledek.
- Nejprve targetedcorrectness+bounded lifecycle+actualwholewarm/cold/WGSL parity, potom jen při přínosu isolated immutable productionA/B bezroutineprofileru. Žádná extrapolace CPU→FPS, žádné defaultpřepnutí bez finální přejímky. Výzkum/rozhodnutí/implementace/tests/integrace průběžně doKEY31/32; review a scopedcommity/main.
- Malý oddělený vratný QA experiment bez nového veřejného API či nevyřešeného uživatelského záměru; oneshot. Vyšší paměťový/lifecycle kontrakt není vydáván za původní metadataonly optimalizaci. Při nedostatečném přínosu odmítnout, celý migrační cíl zůstává beze zúžení.
- Převzat frozen helper084ce468…/manifest4d89e6…;25/25targeted+scopedTS, exactinverse7hunků. RootA/P26/26,11WGSL/55states,6wholewarm×5+6cold×2+2churn+4pressurePASS.28receipts/75frozenroot sources, shader/layout/uniform parity přesná; nic se nepřepisovalo v installed/core/hranýchbuildech.
- VýsledekODMÍTNUTO: wholewarmPBR4,95785→8,37015ms, Standard4,0832→6,73005, surface5,11425→8,91925; coldPBR11,8911→15,23645, Standard8,0207→11,75525. Pressure499 A23,282/22,645 vsP61,914/62,106ms. BezGPU/build/runtimepřevzetí, nejde oFPS přínos. Nepokračovat tuningem tohoto kandidáta bez nového doloženého mechanismu.
- Nezávislé source/lifecycle i finalraw review[];175encoded/decoded SHA/délek ověřeno. Donepouzepro rozhodnutý experiment/helper, nikoli KEY31/32/default/celýcíl.
