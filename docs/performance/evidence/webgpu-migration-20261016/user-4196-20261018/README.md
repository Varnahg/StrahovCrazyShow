# Uživatelský test4196: záseky celého světa

18. 10. 2026 uživatel oznámil, že po testu zůstávají viditelné záseky celé hry. Test je v nové4196, snapshot `5d247248f50a762877e9079bb4fcd65280e959e8014eb3f65b2662e397c518cb`. Stará4195 nemá nový herní vstup. Uživatelský úsek session `ccac5532-9f27-46a0-928f-b6b5c1e62acf` je entry636, ready1014, disposal1695; předchozí agentův smoke se do výsledků nezapočítává.

Načítání76,95s, hraní161,59s. Zaznamenáno85 hitchů, z toho44 alespoň100ms,14 alespoň250ms a5 alespoň500ms; maximum903,2ms. Všechny velké intervaly mají kontext outside,22ze44 nastaly při jízdě. Renderer i assety hlásí0chyb, což není důkaz plynulosti. Dokument byl viditelný; tyto intervaly nemají příznak návratu ze skryté karty.

`frameMs` měří předchozí interval, proto se porovnává s `previousFrame.cpuMs`. Z14velkých intervalů jsou dva převážně herní CPU práce (součet696,9ms intervalů proti660,5ms Game CPU); zbývajících12 má5897,7ms intervalů proti647,2ms Game CPU. Reziduum zahrnuje práci mimo měřený callback, čekání a plánování — **nelze je označit za změřený GPU čas**.

| Svědek | Doložený mechanismus |
|---|---|
| F1039 →1041 | Game301ms, render284,5ms, main267,1ms;3nové programy/711Effect změn. |
| Následný1044 | Mezera886,4ms, předchozíGame46,2ms; LoAF838,1ms před renderStart. |
| Carenter1264 →1268 | Burst193,5ms/3programy/131Effect změn, následně600,9ms mezera s předchozímGame17,4ms. |
| Jízda1291 →1296 | Burst215,2ms/5programů/387Effect změn a změna3→2světla; poté903,2ms interval s předchozímGame20,7ms. Uvnitř mezery běží síťový callback1293 a timer1294. |
| Manualhigh1460 →1464 | Game359,5ms: transit154,6ms, render172,4ms,0nových programů během render profilu. Následují požadavky na nové textury vlasů/oblečení. |

LoAF script `babylon-BAa1hXcn.js:249942` je celý `_boundRenderFunction`, nikoli konkrétní draw nebo GPU operace. Effect změna není nová kompilace. Hitch export má limit4záznamy/s a materiálové detaily jsou omezené, takže počty nejsou neomezený trace.

Z15quality událostí je10 pouze scaling,3 pouze kvalita,1 obojí a1 warmup revize. Prvních šest scale-only změn nemá v následující sekundě hitch alespoň100ms. Největší mezera nastala při dlouho stabilním low/scale2; obecné obvinění adaptive quality není podložené.

## Další postup podle důkazů

B6-only příprava tento průchod sama neopraví. Prioritu má ověření chybějících low variant skutečného světla auta: `VehicleLighting` na low nepoužívá stíny, `PlayerFlashlight` je používá vždy. Současných13lightstages připravuje pouze torch. Pro shadowreceivers tedy není explicitně připraven unshadowedSPOT s0/1POINT. Task `webgpu-low-vehicle-proof-20261018` porovná celé defines a Effect reuse se skutečnými controllery. Samotný zdrojový rozdíl neprokazuje příčinu celé903ms mezery.

Samostatná doložená CPU větev je synchronní tvorba transit rigů při změně radius/cap. Počet budoucích oprav se neodvozuje jen z tohoto jednoho průchodu. Zatím nevzniká nová cache ani diagnostická vrstva a žádný runtime fix z tohoto reportu se neprohlašuje za hotový.

[Raw log](session.jsonl.gz) obsahuje1717souvislých záznamů; [souhrn a vybraný uživatelský úsek](summary.json). SHA nekomprimovaných bytů `52cdf6bde7f27268ee6f628d347ba636a9ebb13d42aa504be2fb0a949434d425`. Disposal a následné Edge menu potvrzují ukončení průchodu. Hrané4195/4196 zůstávají beze změny. Read-only kontrola hardwaru po testu identifikovala NVIDIA GeForce GTX1060/6GB, ovladač582.28; nejde o měření GPU práce během záseku.

## Výsledek úzkého CPU ověření

[Uchované testy, výsledky a nezávislá kontrola](vehicle-proof/review.md) potvrzují dvě chybějící varianty PBR pro nízkou kvalitu světla auta. Pět cílených testů prošlo. Předpříprava skutečným controllerem zabránila nové kompilaci v této omezené scéně. Nejde o důkaz odstranění uživatelských záseků; samostatný produkční kandidát musí teprve projít kontrolou lifecycle a měřením v celé hře.
