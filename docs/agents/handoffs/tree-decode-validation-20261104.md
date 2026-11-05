# Předání: tree-decode-validation-20261104

- Vlastník: graphics-d-decode-20261104; příjemce: root.
- Pracovní kopie: D:/CodexWorkspaces/StrahovCrazyShow-graphics-20261104, codex/graphics-smoothness-20261104, výchozí commit6805bcd4396eeb6abd17f724914a054b06fa86bc. Výslovná uživatelská výjimka pro D je v aktuálním AGENTS.md.
- Rozsah rezervace: client/tree-asset-loader.ts, tests/tree-streaming.test.ts, tests/tree-asset-validation.test.ts a toto předání. Žádný další BMAD workflow, build ani GPU.

## Rozhodnutí před změnou

1. Problém: synchronní stromový decode opakovaně prochází stejné float atributy při post-fetch práci. Root profil skutečných crown032/033 přiřadil decode183/131ms zcelkové přípravy248/165ms.
2. Mechanismus: readTreeGlb nejprve validuje všechny accessors, pak je čte znovu po primitivech, validateGeometry znovu kontroluje finite a decodeTreePrototype znovu volá accessor. Veřejný readTreeGlb současně vrací mutable json/buffer views, takže trvalá cache by měnila pozdější validaci.
3. Jediná změna: privátní per-decode validované views pro synchronní decodeTreePrototype; veřejný wrapper bez cache. Uvnitř privátního decode neopakovat finite scan stejného již ověřeného view, zachovat strukturální/type/componentType/bounds/shape/index/unused-data kontroly.
4. Hlavní metrika: cílené regresní výsledky a přesná výstupní parita; produkční CPU A/B provede root odděleně. Nejde o důkaz FPS.
5. Správnost: žádná persistent cache, žádné změny LOD, indexového pořadí, assetů, materiálů, fetch concurrency, integrity či abort. Veřejná následná mutace json nebo bufferu musí mít původní výsledek validace.
6. Přijetí leafu: cílené valid/invalid a streaming/lifecycle testy PASS; lokální refaktor bez duplikace parseru; předání přesných souborů/hashe a root review. Celkové CPU, build/SDK a Edge přijetí patří rootovi.

Alternativy: veřejná memoizace by oslabila kontrolu mutable dat; kopie celého parseru by časem rozdělila guardy; privátní opt-in sdílí jediný parser a zachovává veřejnou cestu. Counting sort měl menší profilovaný podíl, worker/yield přidává ownership a lifecycle rozsah; obě varianty se nyní neimplementují.

## Výsledek a předání

- Změněné soubory: client/tree-asset-loader.ts, nový tests/tree-asset-validation.test.ts a toto předání. Rezervovaný tests/tree-streaming.test.ts nebyl upraven; všechny jeho původní aserce a testy zůstávají.
- Soukromý parseTreeGlb sdílí jediný parser s veřejným readTreeGlb. Malá lokální mapa vzniká jen pro decodeTreePrototype; expected type/componentType i bounds guardy se vyhodnocují před každým cache hitem. První průchod stále validuje všechny accessors včetně nepoužitých. Tvar a rozsah indexů se kontrolují vždy.
- Finite průchod validateGeometry se přeskočí pouze v privátním GLB decode po ověření všech float views. Veřejný readTreeGlb i runtime chunks zůstávají na původní validační cestě. Žádný globální stav, persistent cache, nová resource ani změna fetch/abort nevznikla. Mapu nedrží návratové části; drží pouze stejné typed-array views na původní buffer.
- Regrese: exact bytes a uint16/uint32 výstup, původní zero-copy ownership, nové decode po mutaci bufferu; cache-hit expected type/componentType; unreferenced NaN/Infinity/bounds; geometry shape/index range; veřejné fresh views, následná mutace source dat, normalized/type/componentType/count/view bounds; navíc samostatná NaN validace legacy runtime chunks.
- Lokální refaktoring je omezený na společný privátní parser, typ accessor view a interní explicitní příznak dříve ověřených float atributů. Celý parser se nekopíruje, cache nemění veřejný podpis ani následnou validaci.
- Ověření: node --import tsx --test tests/tree-asset-validation.test.ts tests/tree-asset-loader.test.ts tests/tree-streaming.test.ts tests/tree-cluster-streaming.test.ts tests/tree-catalog-loading.test.ts tests/tree-season-geometry.test.ts — 64 PASS,0 FAIL,0 SKIP,exit0,5176.0716ms; stdout tool chunk3cf031. Poté doplněna pouze sedmá testová legacy-NaN regrese: celý nový tests/tree-asset-validation.test.ts znovu7 PASS,0 FAIL,0 SKIP,exit0,850.387ms; chunkf33731. Runtime po prvním cíleném souborovém běhu nebyl měněný.
- Scoped TypeScript přes runtime a nový test, se stejnými target/lib/module/moduleResolution/strict/decorator volbami projektu, PASS/exit0 před i po posledním testovém doplnění. git diff --check vlastního rozsahu PASS.
- SHA256 client/tree-asset-loader.ts: 89369301263a8173e0a8e11828f5464350361317e15ea74eee93e2a88afc3681.
- SHA256 tests/tree-asset-validation.test.ts: 66d65edc994251ff5291b599abc1a6c8a29ac08b086bf4521fb2f56e5791b709.
- Produkční byteparita6GLB, CPU A/B, nezávislé review, plná sada/build/SDK a skutečný Edge průchod jsou následný root rozsah; tento leaf je za hotové nevydává. Žádný FPS nebo odstranění4–7,5s GPU-process mezer se netvrdí.
- Vlastní testovací procesy skončily. Žádný server, port, GPU, instalace, build ani další podagent při implementaci neběžely. Nic není staged ani commitnuté.
- Root přebírá uvedené3 soubory; následuje uvolnění pouze tree-decode-validation-20261104. Další změna na žádost review vyžaduje nový claim.
