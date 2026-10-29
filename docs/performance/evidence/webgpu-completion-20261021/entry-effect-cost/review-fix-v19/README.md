# V19: doplnění StandardMaterial regresí po review

Jde pouze o testový checkpoint původního V18, nikoli opravu doložené runtime chyby. Review verification-2 nalezlo, že odstranění Standard předka index5 z engine association nemusí odhalit původní PBR-only testy. Původní helper V18, 174-file seal, handoff a logy zůstávají beze změn.

Primární kontrakt: pinovaný Babylon9.30 StandardMaterial.isReadyForSubMesh přímo volá scene.getEngine().createEffect (standardMaterial.pure.js:1268), zatímco PBR cesta používá _prepareEffect. Vybraný nejmenší zásah je přidat přímou deterministickou větev5→9 a actual StandardMaterial/NullEngine fixture; runtime ani metriky není důvod měnit. Pouze další PBR případ by mezeru neuzavřel. Širší instrumentace nebo změna cache jsou mimo zadání.

Deterministická větev má Standard inclusive6/selfSelected3 a engine inclusive3/selfSelected3, každý1call; PBR4/8 mají0calls. Nativní test provozuje skutečné Scene/StandardMaterial/Mesh/HemisphericLight a původní ThinEngine API. Po světelné dirty invalidaci musí první zachycený main frame obsahovat Standard i engine calls a žádného PBR předka. Zachová se existující Effect identity a po osmi render frames se původní deskriptory obnoví.

Výběr testů je pouze dvě nové Standard regrese přes --test-name-pattern. Ostatních42 testů téhož souboru nejsou v tomto checkpointu spuštěné. Root provede celou verifikaci. NullEngine/GLSL není GPU, výkonová ani celá Game přejímka; nativní test nedokazuje cache hit/miss ani GPU čas API.

## Skutečný výsledek

Vybrané nové testy:2 PASS/0 FAIL, syntax0. Izolovaný mutant bez Standard předka:0 PASS/2 očekávané FAIL; kandidátní runtime nebyl měněn. Všech275 chráněných před/po vstupů je shodných. Helper V19 80419b9012d8f8c4a0ac5f23260e874fa7cb408f9d1b9ab9dc8ac5270c7c1dd1. Kompletní42 starší testy, celý corpus/build/GPU jsou výslovně nepřezkoušené v tomto followupu.
