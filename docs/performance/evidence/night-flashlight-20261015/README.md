# KEY-3: první ověřený celek — stabilita světelných variant

Baseline maina8edf56/runtimee1b03fe, source4dcb3f6f. Kandidát2983a71a3f40a0d3bbd63775d51b180308986c2e47a541d629d18e85ebfa5337,8403 vstupů včetně163 testů.52targeted+4diagnostics+942full testů PASS, strictTS/build a izolovanáSDK/HTTPintegration2568 PASS. Vstupy po pipeline shodné.

## Mechanismus a změna

Canonical pořadí existujících netruncated světel odstraňuje historii indexovanýchdefines; GltfLightBudget opravuje pouze rozpoznanou loader inflaci dočasných caps. Zachovává owner/frozen/scene/lifecycle. Automatickýdefault4 je dolnímez, ne tvrdýlimit: při vzdáleném autě+místnísvítilně+B6+měsíci musí zůstat i5 skutečnýchpřispěvatelů. Intenzity, dosahy, geometrie a síť se nemění. Gamehooky jsou předoběmarendery a cleanup předscene.dispose.

## Praktické A/B

Skutečná celá produkční hra, multiplayer1reálnýavatar+HUD, GTX1060/ANGLE D3D11, CSS/internal2040×986,medium, stejnýspawn/kamera a nightinstant1792188000000. Kandidát používá přesně zaznamenaná baseline weatherfields, výslovně označenáQA. Simulovanýambient se vyvíjí, browser/driver cache nebyla vymazána. PrvníF znamená prvníaktivaci novéGame, ne studenoudiskovoucache.

| Běh | Baseline max | Kandidát max | Baseline p95 | Kandidát p95 |
| --- | ---: | ---: | ---: | ---: |
| Svítilna OFF |83.7ms|52.2ms|45.7ms|32.4ms|
| První ON |2389.7ms|1114.4ms|29.8ms|22.7ms|
| Opakované cykly |1913ms|93ms|34.9ms|21.5ms|

Raw intervaly, scene/GPU/weather údaje a SHA úplných lokálních JSON jsou vev1-comparison.json. První candidate pokus měl při otevření novéIABkarty jiné rozlišení; byl celý vyloučen, raw je uchovaný vcache. Žádný zahrnutý výsledek se nezískal výběrem lepší části běhu. Režie recordingu/benchmarku je naoboustranách stejná.

## Rozsah přijetí

Opakované přepínání má doložený velký přínos; celýKEY-3 ještě **není hotový**. PrvníON stále blokuje1114.4ms: precedingCPU1100.8ms ztoho render1068.8/environment30.9, Reactclick20.2. Následuje samostatná omezená příprava skutečných aktuálních/nočníchOFF/ON variant předGame.ready; startupcost musí být přiznaný a změřený. Předvytvoření samotné svítilny nebo slepýforceCompilation tuto hlavní render část neřeší.

Oba přípravné výzkumy a alternativy: ../../research-20261015/night-flashlight.md. Hraný frozen4188, původní uživatelská relace a dependencies zůstaly nezměněné. Nový testovací kandidat4189 byl poGPUtestu ukončen, GPU karta zavřená.
