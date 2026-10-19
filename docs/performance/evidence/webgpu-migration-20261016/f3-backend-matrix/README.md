# Medium backend matrix — nedokončená přejímka

Plán devíti proložených GL/CM/NCM běhů není dokončený. Dva skutečné jednotlivé průjezdy mají rozdílnou dopravu, a proto **neprokazují náskok žádného API**. NCM ani default z nich nelze přijmout. CM navíc odhalil konkrétní nepokrytou přípravu Medium: po game-ready během jízdy vzniklo17 shaderových programů a18 synchronních pipeline.

| Průjezd | GL g1 | WebGPU compatibility c1 |
| --- | ---: | ---: |
| FPS | 51,3 | 47,4 |
| p95 /p99 | 30,3 /39,8 ms | 28,9 /130,2 ms |
| Maximum /intervaly≥100ms | 175,7 ms /1 | 150,1 ms /5 |
| Ambient END bus/passenger/car | 0/1/1 | 1/0/0 |
| Nové preparations /modules /syncpipelines | nezměřeno | **17 /34 /18** |

Oba používají source **3c4be6d025f8524687e2eeb1cdf8f99f1c007ef12593ddda7c7db1ceb650fa03**, F3MD **3cc739bea27f7ec1f1b0f43e089d72d63ab15952166e7d3557c88af10ed34768**, Medium CSS/internal **2040×986**, Alexe, jednu skutečnou MP relaci, night1792447200000 a stejné řízené počasí. Přebraných576source/test a21distcode souborů má ověřené SHA; žádný runtimepatch, nový profiler ani rebuild. Původní1453/fullTSbuild/4integrace F3 se znovu nevydávají za spuštěné testy.

Health je valid, chybové/pending/asset čítače0. Oba public frame arrays mají právě jednu souvislou1:1 shodu s raw frame-window po zaokrouhlení0,1ms. Raw sekvence začínají0 bez mezer. Nástup false→true, rychlost>1 a jízda102,90/102,66m během benchmarku jsou doložené; oba intervaly zůstaly visible/focused. Collector po review kontroluje i Medium a skutečné durationSeconds. Samotný nápisFPS ani shodný source nejsou důkazem.

Pro WebGL profiler neposkytuje compilation měření: raw má active:true/backend:other, ale všechny WebGPU hooks jsou unavailable. Jeho nuly neznamenají nulové WebGL kompilace. WebGL GPU timer měří whole-frame, WebGPU main-render-pass-only; nelze je přímo porovnávat. RequestedAAtrue vobou; WebGL actual4samples, WebGPU actualsamples zde nezjištěné. GTX1060/driver582.28: g1před/po77/78°C,1151/936MHz; c1 77/77°C,1417/987MHz. Takty nejsou zamčené, browser/driver cache se neresetovala a trajektorie se mírně liší. Záznam nerozděluje kauzální cenu compilation/defines/driver/binding.

## Proč srovnání pokračuje až po opravě vstupů

`Game.trafficInstant()` používá Date.now()+snapshots.offset; noční timeOverride řídí sky/artlighting, nikoli dopravu. PID bus/passenger data a auta s75s jízdou/135s UTC periodou určují jiné rozmístění při každém běhu. Medium vybírábusydo300m(max8), passengersdo140m(max28). Benchmark `ambient` ukládá jen koncovou velikost vytvořených renderer map, nikoli frustum viditelnost ani min/max celého intervalu. Ani shodný ENDcount by tedy nedokazoval totožný workload; zde se navíc liší.

Obecný veřejný traffic-clock query v snapshotu není. Guest„Ukázka příjezdu“ má monotonic preview clock, ale vybírá příjezd podleDate.now a mění polohu/kameru; není to MPbenchmark fixture. Případný nový QA clock musí sjednotit také fyzikální transit obstacles. Load stratification by měla jen omezenou observační platnost. Nesnižovat přejímku na snazšíLow ani nevypínat dopravu.

Nejbližší konkrétní krok: existující bounded program/material attribution na současnémF3 přiřadí17 requestů a umožní odvodit chybějící Medium přípravu. To je nové zjištění; předchozí Low0programů tuto situaci nepokrývá.

## Zachované pomocné kroky

Kalibrační relace jen uložila Medium preference; preflight jen ověřil collector. Obě skončily bez benchmarku a zůstaly mimo řádky. g1 po vytvoření okna odhalil reset viewportu na1528×651; správných2040×986 bylo znovu nastaveno před benchmarkem a30s settling se restartoval. Původní setup/screenshot jsou zachované; celkový idle po ready byl delší. c1 dostal viewport před joinem. To je další omezení srovnatelnosti.

n1 spustil pouze vlastní API/HTTPpreview; **žádná NCM karta/engine ani benchmark nevznikly**. Všechny vlastní4200/2595procesy a herní karty jsou ukončené, viewport resetovaný. Hrané4201/4199/starší ani cizí WIP se neotevřely k zápisu. PID zůstávají pouze v ignored cache; archiv má označené provenance projekce.

Scope review opravilo raw/UI1:1, Medium/car/foreground gates a přesný časový interval; recheck[]. Finální raw/evidence audit je vreview.json. [partial-01/artifact-manifest.json](partial-01/artifact-manifest.json) zachovává výsledky, screenshoty, protokoly, pomocné kroky a SHA/délky. **Task matrix zůstává pending/blocked; cíl chatu aktivní. KEY31/32/34 ani migrace nejsou Done.**
