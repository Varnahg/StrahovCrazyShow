# Primitive fragment reuse — odmítnuto podle CPU důkazů

Nová omezená cache hotových primitivních fragmentů zachovala ověřené výsledky, ale opakovaně a výrazně zpomalila celé materiálové řetězce i pracovní sadu499 příjemců. **Do runtime se nepřijímá, GPU pilot se nespouští.** Main zůstává na přijatém metadata-only F3; nejde o FPS zlepšení.

| Medián tří procesních mediánů whole CPU | F3 A | Fragment cache P |
| --- | ---: | ---: |
| Warm PBR | 4,9579 ms | 8,3701 ms |
| Warm Standard | 4,0832 ms | 6,7301 ms |
| Warm surface | 5,1142 ms | 8,9192 ms |
| Cold PBR | 11,8911 ms | 15,2364 ms |
| Cold Standard | 8,0207 ms | 11,7552 ms |

Wholewarm/cold pořadí A/P/P/A/A/P, stejné skutečné shader/Effect/layout/uniform výstupy. Warm je24 neinstrumentovaných celých render intervalů po předehřátí Effectů na proces; cold čtyři kohorty po36 nových submeshech. Jde o Node/NullEngine IO s actual WGSL a WebGPUEngine.createEffect, nikoli GPU/driver/world FPS. Tabulka popisuje výsledek kandidáta; nerozlišuje samostatný kauzální podíl porovnávání, alokací, freeze, GC a publikace cache.

Pracovní sada je **projekce**348 PBR a151 Standard define objektů z přesných předchozích warm stavů,406/308 public keys,375592 value+fragment slots. Nejde o přesné rozložení materiálů celé hry. Časy499 serializer calls A/P/P/A: **23,2825 / 61,9144 / 62,1064 / 22,6446 ms**, vždy24 časovaných přechodů. Aktualizace hodnot a dodatečná kontrolní serializace každého výsledku jsou mimo interval a výslovně mění warmup; nejde o čistý production A/B. Shader text a checksum jsou totožné. Jediný synthetic96shape churn47,9956→61,8827ms je podpůrný, nikoli statistický/GPU důkaz.

## Příčina k řešení a porovnané varianty

Aktuální produkční F3 profil má toString37,4ms/499 při entry a24ms/431 při další revizi, mesh preparation95,5/56,3ms a createEffect3,1/3,2ms. Pinned primary code potvrzuje VehicleLighting.updateBeam→Light.setEnabled/_resyncMeshes→AbstractMesh._resyncLightSource→markAsLightDirty→PrepareDefinesForLights→Standard/PBR→toString. Členství, LIGHTCOUNT, slotfeatures/shadows/textury skutečně mění defines; nula newprogram není důkaz no-op. StableLightState označuje jen přeuspořádané seznamy. Global enabled budget může měnit MAXLIGHTCOUNT, avšak poslední Low3↔4 nepřekračuje floor4.

Celá submesh/pass variant reuse může odstranit nejvíc přípravy, ale vyžaduje úplný non-light dirty/plugin/attribute/pass/device/refcount kontrakt a zachování aktuálních bindingů. NCM míří na bind/draw, nikoli tuto přípravu, a dosavadnífast výsledky nebyly přijaty. Plošný freeze/klony/hotswap neřeší bezpečně dynamické aktualizace a reset draw contextu. Stabilní cap neodstraní nutný LIGHTCOUNT. Densearray/prefix mají jiná prototype/paměťová rizika. Staré whole-result memo nejprve formátovalo celý raw řetězec. Zde byl proto poprvé testován přesný primitive fragment reuse uvnitř původního read loopu, bez přimíchání jiných optimalizací. Výsledek jej odmítá; nepokračovat přidáním této cache do projektu.

## Explicitní nový cache kontrakt

Reference MaterialDefines SHA **3cc739bea27f7ec1f1b0f43e089d72d63ab15952166e7d3557c88af10ed34768**, kandidát **084ce46889d79c37867b8fb97bd64f21d9bb2545ccd205983b427fab274293e2**. Přesný inverse7hunků, ostatní fyzický core/loaders beze změny. Není to metadata-only F3: WeakMap receiver→holder a bounded FIFO drží completed frozen names/primitive values/fragments. Reuse pouze stejného primitive string name a SameValue primitive value; původní `_keys.length/index/value` reads/coercion/throw/order/fallback a full-name equality zůstávají. Unsafe/object/function/symbol values se nepublikují. Nested call používá vlastní immutable snapshot; all-hit outer po inner replacement/eviction znovu publikuje svůj completed snapshot.

FIFO nemá receiver reference, replacement drží jednu queue pozici a eviction skutečně smaže payload živého holderu. Limity1024holders/524288value+fragment slots/4194304UTF16 stringunits, payload≤1024keys/32768emitted chars. Jsou to logické payload limity; strukturální/WeakMap/F3 metadata overhead a in-flight snapshots nejsou celkovým heap/GC limitem. Nové cache testy se nezaměňují za původní metadata-only schema assertions; ty se neoslabily.

## Ověření a reprodukce

- Helper manifest SHA `4d89e6f7ef117daae40a1a891ec63db956830a6a02fe9f05e10c02b70b320b1d`,25/25 targeted a scopedTS0. Rozpad10 novýchcache tests+8existing differential+7public/schema. Zahrnuje52/156+2init, reentrant throw/replacement/eviction, unit/slot/count accounting, prototype poisoning, actualblocks/generated mutations. První24/24 před přidáním dalšího explicitního eviction testu zachováno; nejde o failed renderer test.
- Root A i P26/26 actualpackage/public/schema/prototype kontrol, actualWGSL11scénářů/55stavů včetně historického order-sensitive limitation a GLB single core identity. Dále6warm×5testů +6cold×2,2churn a4pressure jobs PASS.28 source receipts,75 vlastních frozen vstupů, všechny actual shader/layout/uniform snapshots napříč A/P shodné, původní cleanup assertions PASS.
- Root připravil exactfixtures z předchozího ověřeného sparse pokusu a reference z native-cleanF3 source3c4be6d025f8524687e2eeb1cdf8f99f1c007ef12593ddda7c7db1ceb650fa03. Po dokončeném helperu: `accept-helper.mjs <přesnýSHAmanifestu>` → `run.mjs` → `analyze.mjs`. Loader nahrazuje jediné přesné fyzické MD module URL, ponechá jedinou core/loaders identitu; inspector čte vybraný payload. Originální runtime balíčky a hrané buildy se neinstalovaly ani nepřepisovaly.
- Pomocný smoke projection nejprve neměl správný exportpath PBRMaterialDefines; po ověření skutečného pinned exportu opraven na pbrBaseMaterial.pure. Finální pressure vstup má přesný počet375592slots a očekávané shader texty; tento pomocný smoke není přijat jako kontrolní timing.
- Pro odmítnutý CPU kandidát nevznikl produkční build/server/GPU běh ani fullsuite/integrace. Předchozí native F3 test/build/integrace tím nejsou nahrazené. Reviewer provedl čtecí source/lifecycle audit bez nálezů; finální raw/evidence přezkum je vreview.json.

[artifact-manifest.json](artifact-manifest.json) obsahuje encoded/decoded SHA a délky root skriptů, fixtures, helper kompletního protokolu i všech měření. Hrané snapshoty a cizí WIP beze změny. KEY31/32, finální výkon/default i celý cíl zůstávají otevřené.
