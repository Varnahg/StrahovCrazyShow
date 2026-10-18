# KEY-31: oprava historie světelných příznaků odstranila novou Day kompilaci

18.10.2026. **Izolovaný vendor kandidát, opakované diagnostické GPU piloty a úplné ověření kombinovaného snapshotu.** Nativní integrace a celková migrace zůstávají samostatné. [Příčinu a negativní V3 pokus](../hitches-v10/README.md) nahrazuje v tomto kandidátovi přesný reset neaktivních falloff příznaků.

## Oprava a důkazy před GPU

Pinned Babylon9.30 `PrepareDefinesForLights` dostal pouze3 přiřazení false pro neaktivní `LIGHT_FALLOFF_PHYSICAL/GLTF/STANDARD`. Aktivní sloty a globální PBR flags se nemění; žádná cache, callback, plugin, nový scan nebo úprava readiness/timeoutu. Starý9103B patch je zachovaný prefix. Lock se liší pouze6 výskyty jeho SHA. Nový patch `0811815a615a8e501c4542ee2fa38fcc5fdd1a4394fbc610cb0aa5a0ae62c578`, helper `a6d21d15070f52d3a94ec7fd40eb22356a76a723165ce05afa67dbeded0e88ac`.

Fyzické nesdílené core/loaders kopie mají jednu class identity, ověřenou skutečným malým GLB a instanceof. Všech10860 původních i výsledných souborů zkontrolováno; jediná runtime delta je helper. Žádný install ani zápis do V5. [Finální manifest](vendor/manifest.json.gz) SHA `1f7fd825af1633d4efc227ffdc033d7e85540bd6400f7c03b7bbf0f4822d9eac`. Root má vlastní fyzický node_modules/tool-output root a3CLI shimy; jednotlivé package junctions jsou readonly. Žádný sdílený .pnpm/.modules/.vite cache odkaz.

Čistý RED15fail/1pass → **GREEN16/16**, související image-processing/shadow/light-budget/reflection regrese **77/77**, scoped TypeScript3134 souborů/0chyb. Testy zahrnují3falloff ×3globální PBR režimy a PBR/Standard opaque/alpha instances, plné defines/Effect reuse, cap/disable/reactivation, dirty no-op a frozen readiness/unfreeze. Celý vendor patch prošel reverse/check/apply roundtripem6souborů, výstupní bytes odpovídají QA core. Původní stale frozen draw se v NullEngine zavěsil a **není** vydáván za ověřený; počáteční chybné/import a přerušené logy jsou zachované. Fallback string a explicitní Node light cesta zůstávají mimo tento hunk.

## Produkční snapshot a ověření

V4 `bf28a56507b6b0650d214169c8cf94aa3b2d8abc4012a8b098e4e1366340c8c0` zachovává celý V3 aplikační kód včetně dřívějších nepřijatých coverage prototypů; mění pouze dependency/patch/lock a přidává2testy. [Composition](candidate-composition.json), [manifest](candidate-source-manifest.json.gz), [build](inactive-light-v4-build.json), [celá validace](inactive-light-v4-validation.json).

**pnpm test1384/1384 PASS**, produkční build s úplným TypeScript PASS, izolovaná test:integration PASS. Snapshot i všechny core/loaders bytes před/po kontrolách shodné; shared dependency metadata nezměněné. Build proběhl před GPU, test/integration po něm nad stejným neměnným snapshotem. Nativní vendor-only snapshot v tomto záznamu ještě není prohlášen za ověřený ani integrovaný.

## Opakované Day přechody

Edge native WebGPU compatibility, NVIDIA/pascal, medium/manual,1512×642 CSS i render,59.9Hz, jeden skutečný multiplayer klient/Alex, stejné řízené počasí. Fresh API a vstup od spawnu v každém běhu. Normální GPU timing +lokální opt-in profil, žádný souběžný build/test při měření. Panel nastavení zůstává otevřený v celém Day okně. Browser/driver cache se nemaže; nejsou to cold-driver testy ani finální WebGL2/WebGPU série.

| Běh | Vstup→ready | Příprava | Day CPU | Day maximum | Nové moduly / sync |
|---|---:|---:|---:|---:|---:|
| V3 pilot1 (hitches-v10) |43.0761s|25.4694s|835.0ms|3309.5ms|62 /45|
| V4 pilot1 |47.0673s|27.7113s|101.6ms|137.9ms|0 /0|
| V3 control2 |43.7435s|26.1760s|1028.6ms|3178.9ms|62 /45|
| V4 pilot2 |42.6754s|24.8467s|107.0ms|155.3ms|0 /0|

První V4 Day seq987 je37.1ms uvnitř okna986–1045; seq991 přepne404 existujících Effectů, mainDraw74ms,0programů. Moduly890→890/sync53→53/async513 beze změny, inventory CPU delta0. P95/P9926.9/33.1ms. První venkovní F seq1251,854.3ms uvnitř okna1240–1461:4moduly/2sync, maximum157.9ms poCPU115.1ms, shadow target79.5ms, další103.7ms interval. Zaznamenaný nový materiálový Effect patří listům; oba nové programy tím nejsou plně atribuované. Panel se zavřel795.6ms po začátku,58.7ms před F. P95/P9934.1/46.5ms. Největší další gameplay interval173.8ms; žádný nad500ms. [Obraz F](inactive-light-v4-pilot1-on.png).

Poslední V3 Day1199 je55.7ms uvnitř okna1196–1267. Seq1206:1076.9ms interval/CPU1028.6ms,31novýchprogramů a404Effectchanges; další3178.9ms mezera poCPU24.3ms. Inventory CPU194.7ms je zahrnuté. V4 Day1363 je38.2ms uvnitř okna1361–1474; seq1366:155.3ms interval/CPU107ms,404 existujících Effectů/0programů. Moduly870→870/sync53→53, inventory CPU delta0. P95/P9929.6/34.4ms. [Obraz dne](inactive-light-v4-pilot2-day.png).

## Co z toho lze přijmout

Dva kontrolní přechody kompilovaly31novýchprogramů a dva opravené přechody žádný. Spolu s actual-helper reprodukcí to podporuje konkrétní opravu historie defines. Zbytkových138–155ms stále nesplňuje cíl bez interaction hitches≥100ms. Poslední pár neopakoval F nebo B6; nejde o přijetí celé coverage, ustáleného FPS ani výchozího rendereru.

Srovnatelnost má omezení. V prvním páru jsou pre-Day auta1/source3330/active580, poloha, ustálená kamera a počasí shodné, ale Day nastal V3 73.80s / V4 35.35s po ready. Poslední pár má shodný celý sceneView včetně kamerových matic, počasí i aktivní geometrii580/instances296, ale Day64.44/57.69s po ready, pre-Day auta0/1 a koncový registry3322/3326. V3 koncový cap histogram má2materiály cap42, V4 všechny známé cap4. Samotný počet aktivních meshů tedy neprokazuje identickou scénu. FPS26.2→42.3 či26.4→46 jsou přechodová okna se zásekem, **nikoli steady FPS přejímka**.

Startup rozdíly+3.9912/−1.0681s nedokládají absenci regrese. První pár má+1.7569s před přípravou a+2.2419s v přípravě; asset fáze se překrývají, nesčítat. Startup moduly V3 872/876 versus V4 888/868, async501/503 versus513/500; stage historie se mění. V posledním páru je−8modulů přesně−4night0OFF a−4B6ON. Root nadále měří celý vstup→ready a zachovává původní30s preparation timeout.

Všechny tři nové raw logy mají souvislou sekvenci: V4pilot1 session77fd1f80-29c1-4e27-800f-ab5b2ed9aac0 (2027records), V3control2 2bc1cc7e-5f3c-490d-acda-941115df24f4 (1707), V4pilot2 2b08f15e-4681-49db-9355-f416b0407ad0 (1639). Health valid/pending/errors0, dispose bez render/asset chyb, profil inactive/resources0/observerErrors0. Stage cap21 bez overflow/unknown/limited. [Archivní manifest](archive-manifest.json) ověřuje52převzatých souborů a rozbalených gzip obsahů. Nezávislé code/provenance/raw review bez otevřeného nálezu. Hrané4193/4192/4188 a cizí WIP nezměněné.
