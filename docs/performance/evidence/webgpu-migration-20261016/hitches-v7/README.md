# KEY-31: pilot denní přípravy B6

18.10.2026. **Dílčí pozitivní QA pilot, nikoli produkční přijetí nebo dokončená oprava.** Navazuje na [CPU důkaz](../hitches-v6/README.md). Hraná4193/C5 a starší4192/4188 zůstaly nezměněné. Žádný runtime patch z tohoto pilotu není v native/main.

## Co se porovnalo

Kontrola `ec2802daf9426f63814054627adf5a18f04cd54eb2da20e800eb1a89feb6c563` je produkční C5 s již přijatou async startup přípravou. Kandidát `a94ea6ced62b1aa5a3e7c5f94aa4884cce83f30bb5063cda2e4e126507f4eb78` přidává dvě skryté B6 day OFF/ON etapy, skutečnou kameru na source-derived landing a explicitní obnovení prostorového caster výběru. Actor a avatar zůstávají na spawnu; žádná nová cache, shader nebo light-budget změna. Úplný diff je rozdělený do šesti souborů, vstupní/výstupní SHA v [overlay recordu](overlay-record.json) a [composition](candidate-composition.json).

Oba inside běhy začaly na spawnu po restartu **vlastního** měřicího serveru. Edge, WebGPU compatibility, NVIDIA/pascal (host GTX1060 podle předchozí host evidence), medium/manual,1512×642 CSS i render, jeden skutečný multiplayer klient/Alex, normální GPU timestamp timing a `profileEnvironment=1`. Denní preview18.10.10:00Z, uložené označené počasí. Neběžel build ani CPU testy. Kontrola je `b6:0` x−4.96336699/z−77.04441833, kandidát x−4.95691252/z−77.05388641, rozdíl1.146cm; stejný yaw6.28259265/pitch0.28/FOV0.85 a projekce.

| Metrika | Kontrola inside1 | Kandidát inside1 |
|---|---:|---:|
| Vstup → hotová hra |32.4408s|37.2335s|
| Příprava světel |13.7123s|19.2489s|
| Finální gate po přípravě |33.8ms|38.1ms|
| Startup moduly / async pipeline |528 /287|712 /395|
| První F: CPU burst |1292.2ms|426.4ms|
| Následující mezera mezi snímky |8163.8ms|1905.8ms|
| Nové moduly / shader preparations / sync pipeline |80 /40 /59|20 /10 /10|
| Inventář CPU uvnitř výše uvedené práce |261.6ms|58.7ms|
| UI okno: snímky / trvání / průměr |26 /10.40s /2.5FPS|157 /10.03s /15.6FPS|
| P95 / P99 celého studeného okna |1295.7 /8163.8ms|72.7 /428.3ms|

P99 kandidáta **není jeho maximum**; raw nejdelší mezera je1905.8ms. FPS tabulka zahrnuje první kompilaci, ne steady výkon. Dvě nové etapy zabraly2.4595+2.844s. Startup cena je výslovně započtená, žádné prodloužení30s visible deadline nebo úleva readiness. Oba benchmark health valid, pending/error0, dispose render/asset errors0. Nové raw/body duplicity0 v obou; derived-unused opakování delta0 u kontroly a **+4 u kandidáta**. Limity inventáře nedosažené. Samotné4 odvozené shody nejsou povolení pro runtime normalizaci/cache.

## Limity srovnání

Jeden pilot není statistické A/B ani úplná shoda historie scény. Při F mají oba1 ambient auto, kandidát během okna přejde na0. B6 activeMeshes505 proti495 při shodných structural85/propInstances6124/loadedAssets17. To není možné celé připsat autu. B6 controller při stejné kvalitě a podlaží aktualizuje výběr až po0.25m pohybu; velmi blízká finální poloha nezaručuje totožný poslední výběrový bod. Source/active počty při F jsou3779/1007 a3769/971. Vegetace109trees/279meshes a LOD1/16/92 se shoduje, active grass0, ale cached grass7/0. Draw calls906 v obou, triangles1102993/1098889. Další páry musí srovnat i selection/cestovní historii a obsah, nikoli pouze finální pozici.

Obrazové snímky po F níže zachovávají očekávanou scénu, svítilnu a avatara při vizuální kontrole; nejsou pixelově přesnou přejímkou všech funkcí. Runtime mimo tento pohled, editorově přesunutý B6, další avatary/LOD/quality a multiplayer zatím nejsou novým pilotem ověřené.

## Zbývající práce v prvním F

Raw candidate seq4574→4575→4580 ukazuje main draw396.9ms, měřenou material preparation328.9ms a flashlight shadow target2.5ms CPU. Šest top avatar materiálů má170.7ms přípravy (skin52.9, strands23.9, garment23.8, leather23.8, ocular23.5, hair22.8), dva B6 schodové materiály52.6ms. Tree main preparation101.6→14.7ms proti kontrole. Některé skin/garment meshes skutečně používají skeleton se4bone influencers; oči/vlasy nelze automaticky označit za skinning.

Effect události prokazují přepnutí entry-metal242→418, ocular409→420, hair410→421, skin411→422, garments412→423. Jiné události painted concrete/sign míří na starší identity289/283. Detail má limit8 materiálů a771 událostí je vynechaných; onEffectCreated není samo o sobě důkaz kompilace. V benchmark okně nebyly webgpu-work labels přes25ms threshold. Nelze úplně přiřadit20modulů na konkrétní main/depth pass ani z krátkého CPU targetu odvozovat GPU cenu. Evidence upřednostňuje doplnění konkrétní main coverage avatara/schodů před shadow retention; další návrh ještě není implementovaný.

## Záznamy a ověření

- Inside kontrola [raw](async-b6-control-inside1-session.jsonl.gz), [startup](async-b6-control-inside1-summary.json.gz), [UI benchmark](b6-control-inside-first-f-benchmark.json.gz), [vyhodnocení](b6-control-inside-first-f-summary.json.gz), [obraz](b6-control-inside-first-f-on.png). Sessionc26a6d46-276f-4455-9d93-3c94c18b7c08; rawSHA4f210f5d761f15a950799d6c4c8799e2562f0b4ae16298995b9f717133309b93.
- Kandidát [raw](async-b6-candidate-inside1-session.jsonl.gz), [startup](async-b6-candidate-inside1-summary.json.gz), [UI benchmark](b6-candidate-inside-first-f-benchmark.json.gz), [vyhodnocení](b6-candidate-inside-first-f-summary.json.gz), [obraz](b6-candidate-inside-first-f-on.png). Session189e9a95-d52a-444e-9378-195abadb7302; rawSHA99b311ccac1d35b360683787fd156764641ebcbeb7c180a7dbfbbb70b4a5e826.
- Outside control `async-b6-control1`/`b6-control-first-f` je samostatná poloha před interiérem:1121.3msCPU+6351.7msgap,+80modulů/+58sync, startup33.0291s. Není inside A/B kontrolou.
- `async-b6-resumed-excluded` je explicitně vyřazené reentry: server obnovil poslední pozici u B6, nikoli spawn. Nebyl v něm měřen prvníF. Je zachován jako metodický nález; následné inside běhy měly restartovaný vlastní server.
- [Cílené testy](targeted-v3.log.gz)44/44 PASS, [full TS/produkční build](b6-preparation-v1-build.json)PASS, sdílená dependency metadata beze změn. Starší failed fixture logy v1/v2 zachované. Fullsuite/integration tohoto QA prototypu zatím neběžely; předchozí přijatá sada není jeho test.
- Nezávislý read-only runtime audit bez blokujících nálezů: přesné2etapy, kamera/current-state restore, retired cleanup, spatial refresh, WebGL původní cesta, zachované timeout/readiness. Samostatný audit raw čísel potvrzuje výše uvedené hodnoty a uvedené confoundy. Žádný reviewer nespouštěl GPU/testy.
- [Archivní manifest](archive-manifest.json) ověřuje36 převzatých souborů a gzip obsah; [offline výpočet](summarize-b6-pilot.mjs) je součástí evidence. Frozen candidate zahrnuje testy; [source manifest](candidate-source-manifest.json.gz) zachovává přesnou identitu.

Další krok: porovnat bezpečné doplnění main přípravy avatara a vstupních materiálů, teprve potom nový izolovaný kandidát a opakované cold/warm/startup běhy. Nativní integrace a přepnutí defaultu zůstávají otevřené.
