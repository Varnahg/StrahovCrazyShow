# Cílená GPU přejímka materiálů oken a lifecycle

18. 10. 2026, Edge, WebGPU compatibility mode. Produkční combined snapshot `205b4dda8028dd20b90dbd75177ba6ebd8d3fcf41d02cd97a8c44c42a6b9d05d`, vlastní QA 4194/API 2589, jeden skutečný multiplayer klient Alex. Lokální `profileEnvironment=1`, řízené testovací počasí, CSS i interní rozlišení 1514 × 644. Adaptér reportuje NVIDIA Pascal; tento export neurčuje přesný model ani ovladač. Hraný build 4195 ani starší buildy nebyly změněny.

KEY-37 runtime je integrovaný v main `dc858ce8a6ea90121ad0fb00cb5ebc96b5e54eec`. Guarded detach vlastněných Fresnel objektů a jedno per-material resetDrawCache nahrazují globální isEnabled invalidaci. Původní RED/GREEN pokrývá skutečný ready/render, frozen/unfrozen/shared materiály, opakované disposal, externí náhrady a cizí scénu. Aktuální čistý checkpoint prošel 1367 testy, combined 1427 testy; oba full TS/build/integration. Tyto sady byly provedeny před tímto GPU během, při něm žádný build ani CPU test neběžel.

Provedeno přes skutečné UI:

- B6 schodiště a průhledné vstupní dveře ve dne i v noci, se svítilnou.
- Medium → high → low → medium ve dne i v noci; průhlednost zůstala zachovaná.
- Neprůhledné venkovní okenní masky ve dne i v noci a návrat na denní osvětlení.
- Dva návraty z menu do téže produkční hry bez reloadu stránky; obraz oken zůstal funkční. Celkem tři ready, tři disposal, žádná zaznamenaná chyba renderu nebo assetu.

Všechny tři přípravy dokončily 39 stupňů za 38,70 / 44,28 / 42,83 s. Delší start je uživatelem přijatý tradeoff. Ukončení bylo ověřeno funkčně; `game-dispose` je emitováno před vlastní likvidací scény a **neměří trvání Fresnel cleanupu**. Tato přejímka neprokazuje jeho samostatnou časovou úsporu, fyzické uvolnění GPU paměti ani splnění výkonu celé migrace.

Kontrolní desetisekundový noční benchmark před B6 se svítilnou: 22,4 FPS, p95 60,7 ms, p99 71,9 ms, maximum 85,7 ms, health valid na začátku i na konci, bez pending operací a chyb. Je to profilovaný jednotlivý běh, nikoli finální WebGL2/WebGPU pár. Výkon je stále nedostatečný. KEY-31 a celková migrace zůstávají otevřené. KEY-36 zde nemá žádný zaznamenaný vzorek skutečně změněné expozice; jeho přejímka se tím neuzavírá.

## Evidence

- [Souvislý session log](session.jsonl.gz): 14 151 záznamů, session `890924ee-2131-4521-8e98-9228af8a4fe9`, oba rotační soubory zahrnuty. SHA nekomprimovaných bytů `463549ccfe9e1aa93d07feb276f9343124c9f5adb9e9f1e78b056ac58bafc652`; gzip roundtrip ověřen.
- [Souhrn včetně změn kvalit a příprav](summary.json), [přímý UI export benchmarku](b6-night-benchmark.json).
- [Denní sklo](quality-b6-day-medium.png), [noční sklo a svítilna](quality-b6-night-medium-f.png), [noční exteriér](quality-exterior-night-medium.png), [sklo po druhém návratu](quality-b6-reentry2.png).

První pokus staršího freeze helperu odmítl nekompletní run: četl jen první soubor a vynechal automaticky rotovaný `.part-0001`. Nový jednorázový souhrn zahrnuje oba díly a ověřuje sekvenci 0–14150 i zdrojovou identitu všech dávek. Nejde o opravu runtime diagnostiky. Vlastní QA služby byly po uložení ukončeny podle jejich runtime identity; 4195 zůstává spuštěný a neměnný.
