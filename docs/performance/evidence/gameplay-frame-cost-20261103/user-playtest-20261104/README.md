# Přijatý záznam uživatelského hraní · 4. 11. 2026

Relace `c16cb5a6-763b-44a6-a2e5-53adc32fd92a`, běžný C11 WebGPU. Hraní od Game.ready **01:31:18,748 do game-dispose 01:37:23,171 Praha**, celkem 364,4 s. [Pevná kopie JSONL v gzip](recording.jsonl.gz) a [receipt s SHA-256](receipt.json) obsahují přijatý prefix do 01:40:49,840 Praha: 265 batchů, 7 534 číslovaných záznamů bez mezery. Řádné opuštění hry je zachycené; pozdější browser události nepatří do herních metrik. Rozbalení archivu, SHA-256 a počet původních bajtů ověřeny PASS. Runtime/API startup log a označené QA počasí jsou přiložené.

## Co je doložené

- Přepínání Medium, Low, High a návrat Low je zachycené. Medium/High mají interně 2040×986, Low 1569×758; nastavení se tedy skutečně aplikovalo. Rozdílná trasa a časy neumožňují vydávat přepnutí za řízené srovnání presetů.
- Viditelné herní frame-window mimo přechody viditelnosti: 6 994 intervalů, průměr z celkové doby přibližně 19,2 FPS, p95 87,4 ms, p99 178,2 ms. **36 intervalů ≥250 ms, 3 ≥1 s, maximum 6 661,6 ms.** Hodnoty jsou intervaly snímků, ne čistý čas GPU nebo jedné CPU funkce.
- Nejdelší uložené intervaly: 01:35:59,291 Low 6 661,6 ms; 01:34:06,685 High 1 371,1 ms; 01:36:53,629 Low 1 349,2 ms. Jde o čas zaznamenání události, intervalStart/End jsou v raw logu. U změny High může být náklad přechodu; neslučovat jej s ustáleným presetem.
- **251 podrobných korekčních událostí**, z toho 159 resynců (157 client-request, 2 server-clock-drop). 38 podrobných korekcí je ≥1 m, maximum 2,678 m. Poslední herní context má kumulativně 653 korekcí: detailní event se záměrně emituje jen pro resync nebo odchylku ≥0,35 m. Tyto dvě množiny nejsou zaměnitelné; žádný označený respawn.
- 162 čekání timeline: 139 stale-authority, 18 prediction-budget, 5 latency-budget. Poslední serverová fronta v klientském contextu má 1 657 late a 428 epoch odmítnutí. 97 ze 173 RTT vzorků je označeno jako znečištěné dlouhou úlohou a není použito pro predikci. Z těchto hodnot nelze samotných určit čistou síťovou latenci.
- Uložené jsou CPU fáze a čas předchozího dokončeného callbacku, dlouhé JS úlohy/animation frames, polohy a herní kontext, viewport, kvalita, transport/fronty/authority i přenesené serverové clock čítače. Tato relace nemá zaznamenaný render-fault/startup-error.

## Hranice podkladů

Přijaté záznamy jsou souvislé v rozsahu omezeného automatického recorderu; nejsou videem, přesným vstupním replayem ani CPU call tree. GPU časové vzorky jsou null a v tomto uživatelském běhu neběžel samostatný systémový sampler. Nelze tedy prohlásit, že máme kompletní systémový/GPU trace nebo již určenou jedinou příčinu. Pro časové spojení konkrétních záseků s renderem, long tasks a síťovým zotavením je vlastní herní log uložený. Další krok je tento rozbor, nikoli další obecná stacionární série.
