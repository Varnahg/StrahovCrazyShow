# Produkční porovnání WebGL2 a WebGPU — 16. 10. 2026

**Výsledek: pro současnou implementaci přechod nedoporučujeme.** Stání s jedním avatarem běží na obou API poblíž 60 FPS. WebGPU však opakovaně nedokončí přípravu světel před stávajícím časovým limitem a první svítilna vyvolá přibližně pětisekundovou blokaci renderu. Při přidání dvou dalších avatarů a návratu na start se navíc ve všech třech WebGPU relacích objeví nezachycená chyba překladu GLSL. Z takových snímků nelze přijmout výkon se shodným obrazem.

To je závěr o tomto produkčním prototypu a měřeném zařízení, nikoli univerzální porovnání grafických API. Pro běžný výkon jsou významná omezení 60Hz prezentace a proměnlivé takty GPU. Plynulost při první interakci má podstatně silnější reprodukční důkaz.

## Identita a metodika

- Základ `960cb6f`, samostatná větev `codex/webgpu-comparison`. Žádný cizí WIP nebyl přimíchán. Kompletní zdrojový, konfigurační, assetový a testový snapshot: **a1eb953f7dc9805ee01798e1f11da854215896aadc484d1d3b3d3a89aaad065d**, 8418 vstupů; [manifest](measured-manifest.json).
- Celá sestavená produkční hra, HUD a skutečný multiplayer. Jeden vykreslující klient v Edge155, při zátěži další dva autentizovaní Colyseus/SDK klienti s úplnými odlišnými presety1 a4. Jeden společný svět, žádná privilegovaná změna polohy.
- Medium, CSS i interní rozlišení **2040×986**, stejné requested antialias/stencil/FXAA nastavení, stejný výchozí avatar a kamera. Astronomický okamžik **1792188000000** (17.10.2026 00:00 Praha). Neměnná QA weather fixture, SHA256 `6ad14fcc394b686886f65cfe461f894ea33224125518f3685e0728234edb961e`.
- WebGL2 hlásí GTX1060 přes ANGLE/D3D11. WebGPU hlásí `nvidia/pascal`; přesný název nezveřejňuje. Na hostu je jediný NVIDIA adaptér, GTX1060, ovladač582.28. WebGPU skutečný počet framebuffer samples nebyl veřejným dotazem potvrzen.
- Pořadí nových Game relací: **A1/B1, B2/A2, A3/B3**, pak samostatný pilot C1. A=WebGL2, B=WebGPU compatibility mode, C=WebGPU non-compatibility fast path. Snapshot rendering byl vypnutý. NCM potvrzuje `gpu.compatibilityMode:false` v úplném exportu.
- Každá hlavní relace: start, nastavení stejné noci a15s ustálení. Následují benchmarky s cílovou délkou10s: OFF, první F, čtyři přepnutí F a skutečná chůze W3s/S3s. Potom dva peers, explicitní návrat na start,15s ustálení a stejný benchmark se třemi avatary a zapnutou svítilnou. Kvůli blokacím trvala B-first okna10,26/11,13/10,80s a C-first11,49s; přepočty používají skutečné raw intervaly.
- První F znamená první uživatelské zapnutí v nové Game po běžné přípravě. Browserová ani disková cache ovladače nebyla vymazána. WebGPU příprava skončila timeoutem: jde o porovnání současného chování se stejným watchdogem, **nikoli stejně dokončeného zahřátí**.
- Každý export obsahuje raw intervaly. FPS=count/sum(intervals)×1000; percentily jsou nearest-rank z původních intervalů. Tabulka uvádí medián výsledků tří běhů, nikoli percentil smíchaných percentilů. HUD může kvůli jiné indexaci percentilu ukázat mírně odlišné číslo.

## Přijatá měření

| Scénář | WebGL2 FPS, medián [rozsah] | WebGPU CM FPS, medián [rozsah] | p95 WebGL2 / WebGPU | p99 WebGL2 / WebGPU |
|---|---:|---:|---:|---:|
| Stání, F vypnutá |60,05 [59,72–60,06]|59,95 [59,07–60,06]|16,9 /16,9ms|19,2 /20,4ms|
| První F v nové Game |59,55 [59,36–59,72]|7,88 [7,74–8,49]|19,3 /22,9ms|23,3 /4975,8ms|
| Opakované F |59,15 [57,89–59,16]|58,30 [56,69–58,90]|19,9 /23,0ms|26,0 /28,6ms|
| W3s/S3s |59,39 [48,76–59,63]|53,44 [44,84–56,46]|20,5 /26,2ms|24,8 /36,7ms|
| Tři avatary |59,15 [57,73–59,50]|**neplatné kvůli GLSL chybě**|23,1 /—|26,5 /—|

Nejhorší snímek při první F: WebGL2 **63,4–76,0ms**, WebGPU CM **4898,3–5238,2ms**. V každém B běhu jsou dva intervaly≥1s; v A-first žádný interval≥100ms. Nízké p95 uB nesmí zakrýt dva obrovské snímky v malém souboru85–87 snímků.

První velký snímek je přímo doložený blokací vykreslování, nikoli pozadím karty:

| Běh | Interval | Předchozí callback | Z toho render | Nezávislý LongTask |
|---|---:|---:|---:|---:|
| B1 |4975,8ms|4968,1ms|4955,6ms|4969ms|
| B2 |4898,3ms|4890,3ms|4878,5ms|4891ms|
| B3 |5238,2ms|5229,1ms|5214,9ms|5230ms|

Druhý dlouhý interval v těchto oknech trvá3822,9/4812,6/4111,2ms, ale předchozí callback pouze33,7/36,3/29,7ms. Jeho příčina není izolovaná. **Nesmí se celý vydávat za práci JavaScriptu nebo shader compileru.** I případná režie automatizace či prezentace v této druhé mezeře zůstává neoddělená. První přibližně5s render blok je potvrzený samostatně.

Startup `mode-change → game-ready`: A **32,244s [32,234–32,670]**, B **44,898s [43,845–45,593]**. A dokončil všech devět stavů přípravy; B vždy skončil timeoutem u `night-1-off` po31,3–32,5s. Nelze to popsat jako hotový bezplatný warmup.

## Doplňkový fast-path pilot

C1 je **jediná** relace, nikoli další tři páry. OFF60,06FPS, warmF57,17FPS, pohyb51,88FPS. První F má nejhorší interval5105,2ms; samostatný první render blok4953,4ms a LongTask4967ms. Startup43,896s, opět timeout přípravy. Tento pilot neodstranil rozhodující zásek. Distribuce obnovování/reuse bundles nebyla zaznamenaná a přínos NCM na jiné scéně není vyloučen.

## Odmítnuté důkazy a kompatibilita

1. Původní GPU smoke `e0de700…` skončil na WGSL derivative uniformity: implicitní vzorkování oblohy uvnitř pixelové větve. [První chyba](failed-webgpu-smoke.json), [původní raw záznam](failed-webgpu-smoke.jsonl). Oprava přenesla sampling před větve/discard pro **oba** backendy; UV, textury, mipmapy, filtry a koeficienty zůstaly stejné. Některé později vyřazené pixely nyní provedou sampling navíc. Přesná shoda původně nedefinovaných derivací na hranách se netvrdí.
2. Druhý smoke běžel na neaktivní kartě asi1FPS. Po aktivaci Edge uživatelem se frekvence vrátila na60FPS. Tento smoke v tabulce není. Měřené relace byly visible/focused; výše uvedené5s blokace kryje skutečný render callback a LongTask.
3. V B1/B2/B3 se po spuštění peers a explicitním R objeví `GLSL compilation failed`, ještě před příslušným three benchmarkem. Korelace nerozlišuje samotný nový avatar od respawnu nebo jejich kombinace. Všechny tři three výsledky jsou vyřazené, přestože čítač render/asset errors byl0. [Přesné časy a důvody](adjudication.json). Předchozí OFF/F/warm/move okna této relace vznikla před chybou.
4. `unexpected LEFT_ANGLE` zatím neprokazuje konkrétní materiál ani WGSL/GLSL mix. Další diagnostika musí uchovat zpracovaný vadný shader kolem řádku453, effect/defines a případné `.fx` odpovědi. Nepřidávat naslepo další ForceGLSL. Na základě neplatných three FPS se nedělá výkonový závěr.

## Omezení interpretace

OFF je u60Hz prezentačního stropu. GPU checkpointy ukázaly82–83°C a proměnlivé grafické takty1088–1379MHz; [hardware.csv](hardware.csv). Teploty a takty nebyly pevně řízené. Menší rozdíly FPS proto nelze čistě přičíst backendu. Záměrně zůstal i pomalý A3 pohyb48,76FPS a B1 pohyb44,84FPS.

Pohyb má stejné vstupy, ale při rozdílných zásecích/korekcích odlišné dosažené trajektorie. Výchozí kamera a statické stanoviště se shodují; pohyb není deterministický replay. Ambientní doprava běží podle skutečného času. Celá mapa/B6/řízení auta a další kvality nebyly v této sérii přijímány.

WebGL total GPU timer se nesrovnává s WebGPU main-pass timerem. Nula nebo chybějící vzorek nejsou nulové GPU náklady. Nativní WGSL přepis, jiná strategie cache nebo dlouhodobě udržovaný GPU device nebyly implementovány ani změřeny.

## Reprodukce, validace a ochrana původní hry

Úplných34 JSON exportů a zachované JSONL jsou v lokálním `.cache/webgpu-comparison/runs/` a `retained-diagnostics/`, mimo rotující collector. Jejich SHA a přepočtená čísla obsahuje [results.json](results.json). Všech34 úplných sad původních číselných intervalů je navíc verzovaných v [frame-samples.json](frame-samples.json), takže základ výpočtů přežije i úklid velkých lokálních inventářů. Reprodukce bez GPU z úplných exportů:

```powershell
node scripts/webgpu-report.mjs .cache/webgpu-comparison/runs docs/performance/evidence/webgpu-comparison-20261016/adjudication.json docs/performance/evidence/webgpu-comparison-20261016/results.json
```

Reporter vznikl po měření a není součástí měřeného runtime snapshotu. Nezávislý druhý výpočet souhlasí s jeho mediány, rozsahy, percentily i chybnými třemi běhy.

Finální měřený runtime: **985/985 testů PASS**, produkční build/strictTypeScript PASS, kompletní izolovaná HTTP/SDK integrace2568 PASS. [Testy](full-test-final.log), [build](build-sky-v1.log), [integrace](integration-final.log), [cílené shader/lifecycle testy](sky-validation-targeted-v2.log). Původní LFS/fixture/compiler-loader selhání zůstala v `.cache/webgpu-comparison/logs/`; neopíráme se o jejich neúplné výsledky.

[Závěrečná kontrola](final-preservation.json) ověřuje8418/8418 nezměněných vstupů, pět původních servírovaných HTML/JS/CSS hashů frozen4188 a55 souborů přerušeného diary WIP. Původní4188 služby na začátku neběžely; nebyly restartované ani změněné. Vlastní preview4191/API2586, peers a GPU karta byly ukončené; dočasné rozlišení Edge obnovené. Provozní PID/claim data zůstávají jen lokální.

Experiment zůstává v oddělené větvi. **Výchozí hra se na WebGPU nepřepíná a KEY-5 se neuzavírá jako opravený výkon.** Přínos další migrace by musel ospravedlnit opravy kompatibility a změnu přípravy/cache; samotný backendový přepínač nyní výsledky nezlepšil.
