# Ověření epochové kalibrace — 14. 10. 2026

**827/827 testů, produkční build a celá izolovaná síťová integrace PASS.** Sekvenční běh17:07:53–17:11:15 UTC bez opakování pipeline. Snapshot `b773dc713420ad445379d20e4e968030a835bc49f4c5f7afc037f8580acc026d` obsahuje8389 vstupů/492 source-config-test souborů; po běhu všech492 hashů shodných a2568 bez listeneru.

Základ `c677d47fd5722475ea1700b44fb3aea6ea581955` je čistý publikovaný V11 s následným věrnějším Scene mockem. Přesně3 delty: client/network-timeline.ts, tests/network-timeline.test.ts a tests/network-latency-recovery.test.ts. Každý jiný source/test/config soubor při freeze odpovídal Git blobu HEAD. Assembly file SHA256 `5bcd81fbfbcc48f766af9d7276c489b7241a069280ca8729bc8650bab9525106`; autorův finální manifest `1fda9e0480595b5008d516d84e3c4fbfb74aed4bf3ab4e5a832cb99dc3ecd04e`.

Runtime je12řádkový diff s jedinou sdílenou podmínkou způsobilosti kalibrace. Over-budget vzorek nesmí založit half-RTT clock kotvu ani spotřebovat pending kalibraci. Raw RTT, limity, wire, probe, Game a fixed DT se nemění. Původní red reprodukce zůstala beze změny; nový skutečný queue regression po freshlow nevytváří trvalé ahead odmítání.

Cílené předání: původně14/19 PASS a5 konkrétních red regresí, po opravě19/19. Finální rozšíření o input-timeline/clock-drop a čekací assertions má26/26; disjunktní Probe/sender/Rapier/replay/recovery sada33/33, celkem59 různých PASS; narrow TypeScript bez diagnostik. Toto není úplná RTT×FPS matice. Způsobené dočasné waiting při samotném vysokém RTT zůstává explicitní, nikoli zamaskované.

Source/test obsah je neměnný a všechny kontroly proběhly nad stejným checkpointem. Assety používají původní identifikovanou reference; žádná instalace závislostí. Po pipeline znovu ověřen původní Babylon ImageProcessingPostProcess hash a schema5.0.36, nikoli všechny dependency bytes. Před každým heavy krokem ověřena absence4186/2581 klienta a nového herního JSONL. Živé B6 preview a hlavní checkout zůstaly nedotčené; žádný browser/GPU/Blender.

[Checkpoint](checkpoint.json), [pipeline](pipeline.jsonl), [výzkum/rozhodnutí](../../research-20261014/network-epoch-calibration.md), [předání](../../../agents/handoffs/validate-network-epoch-calibration-20261014.md).

**Meze:** prevence nové špatné epochové kotvyB neřeší rawRTT spike freezeA, již existující libovolně chybný clock, stáří numericky platného RTT bez timestampu, viditelné třesení/fázi ani FPS. Původ callback delay vyžaduje další konkrétní profil. Žádné nové GPU/pixelové tvrzení; celé KEY-7 a uživatelský cíl zůstávají otevřené. Provozní PID jsou jen v ignorované cache.
