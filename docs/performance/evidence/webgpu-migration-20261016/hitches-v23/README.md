# KEY-31: čisté úpravy serializeru nepřinesly celkové zrychlení

18. 10. 2026. **Nevznikl nový vendor patch, lockfile, dependency kopie ani produkční cache.** Dokončený negativní experiment porovnal A=current records/name comparator, B=řazení validovaných celých řádků a C=stejný regex test+indexOf/slice. C zlevnil samotnou serializaci o3–5%, ale celý actual warm render nemá doložené zlepšení. Referencí zůstává A; day13 runtime se nemění.

Manifest `f3ca7da09c745b34511097c5126d08c33e0a5b6619dafda28ae1ff6641b62197` a202leaf artefaktů prošly nezávislým čtecím review: nálezy `[]`. [Podrobný report](proof/report.md) zachovává per-process výsledky, limity a reprodukci; [výzkum před změnou](proof/decision.md) rozlišuje pořadovou ekvivalenci od výkonu.

## Skutečné ověření

- Differential **6/6**: skutečné source A/B/C,4096generovaných bloků+1024mutací,9actual raw bloků, prefixy/numeric spelling/reserved/duplicate/opaque/limity/getters/throws/late keys. Celá MaterialDefines třída i původní property loop jsou byte-identické.
-9proložených micro procesů a9actual warm procesů v pořadí A/B/C/C/A/B/B/C/A; každý warm proces **5/5 PASS**. Na variantu a typ48warm a48nezměněných snímků,36submeshes/snímek.
- **27/27 cross-variant snapshotů exact**: WGSL/defines/layout/uniforms/Effect a key identity, refcount/events/reset/cleanup. Warm0novýchprogramů, genuine změna1program.
- Každá varianta **18/18** dosavadních regresí, scopedTS **3172/0**.18obsahuje6serializer testů+10materiálových větví+negative custom hook+jediný tiny triangle/PBR GLB loader test. Není to širší103testová loader matice.
- Jeden původní regression harness selhal na sdíleném receipt EEXIST; zachován. V2runner oddělil výstup každého souboru. Měřený loader, varianty a assertions se nezměnily.

Mediány ms pro36submeshes, Node/NullEngine; scopes se překrývají a nesčítají:

| Scope | A | B | C |
|---|---:|---:|---:|
| PBR toString |4,600|4,457|4,378|
| PBR celý sync render+budget/order |8,687|8,843|8,759|
| Standard toString |2,861|2,860|2,763|
| Standard celý sync render+budget/order |6,609|6,987|6,756|
| PBR+plugin toString |4,544|4,422|4,399|
| PBR+plugin celý sync render+budget/order |8,261|8,636|8,318|

Není to prokázaná celková regrese C, ale není doložený užitek pro další GPU faktor. B více kolísá mezi procesy. Micro měří raw loop a helper samostatným přímým voláním, nikoli odečtem mediánů; všechny vstupy se přesně našly v actual capture. Neinstrumentovaný produkční přínos ani GPU paměť z těchto čísel neplynou. Observer/JIT/GC a source-loader hranice jsou v reportu explicitní.

## Corpus a další varianty

Untimed test-only tap zachytil2953volání/9exact raw textů/0omitted,45156logických UTF-16B. Původní loop čte getters pouze jednou. Hypotetických99,695%opakování při uchování všech9klíčů není produkční ani LRU hitrate; pořadí přístupů se neukládalo. Homogenní fixture opakuje jeden materiál na36submeshes. Logická délka key+output není záruka skutečného heapu.

Root přidal oddělený inventář100fixture výskytů/49unique bloků z původní10větvové baseline. Obsahuje baseline i canonical větve a maximálně4ukázkovépaths na položku; **nelze z něj rekonstruovat úplnou access sequence**. Další proof má číst přesnou původní fixture a rozlišit raw baseline od already-sorted canonical kontrol.

Navazuje pouze izolovaný explicit-owner memo proof, nikoli produkční cache. Původní loop musí vždy dokončit reads/throws, lookup používá celý exact string, unknown/fallback se neukládá, entry+codeunit limity a clear/dispose jsou povinné. Produkční module lifetime versus engine/device ownership není tímto rozhodnuté. Vysoký hitrate sám nestačí; rozhoduje celý render, smíšené materiály a churn.

Další čtecí rozbory jsou uložené odděleně: [dávky scheduleru](scheduler-count-bound-research.md), [varianty serializeru](serializer-options-research.md) a [stabilní světelné sloty](stable-light-slot-research.md). U128limitu je doložené minimum5/2count-bound dávek ve dvou startupech, nikoli sekundová úspora. Jednotné světelné sloty by měnily UBO/shadow/quality kontrakt; vestavěný clustered režim nepodporuje současné STANDARD falloff a stíny beamů. Žádná z těchto variant se zatím neimplementovala.

[Archivní manifest](archive-manifest.json) ověřuje208artefaktů včetně všech vstupů a zachovaných neúspěchů. `proof/candidate/` je **nevybraná staging kopie**, bez node_modules/build identity; není publikovatelný kandidát. Původní importní cesty jsou zachované, archiv není samostatně instalovaný projekt. Hrané verze, native/main runtime a default zůstaly stejné; KEY-31 a celkový cíl nejsou dokončené.
