# Výzkum více CPU vláken — předání

- Owner threading-01a15535-research, cwd9b78, KEY-40, aktivní širší cíl. Výzkumný celek dokončen, implementace a výkonové přijetí celé hry nikoli.
- BMAD Deep Recon přes úspěšně vyřešené týmové overrides/config. Primární WHATWG/GPUWeb/W3C/Babylon/Emscripten podklady, dva oddělení externí výzkumníci a read-only frozen-code audit. Navazující transit audit reagoval na skutečný produkční profil.
- Artefakty: `_bmad-output/planning-artifacts/research/technical-client-threading-2026-10-19/`, `docs/performance/client-threading/`. Semantické/source review bez věcných nálezů, structure[], čtyři prose opravy přijaty. Citace mechanicky bez chyb; ledger3verified/8unverified v přísném významu nezávislé replikace. Staleness map výslovně uvádí starý Chrome článek a průběžné nedatované standardy.
- Nový přepočet původních raw dat má pevný input SHA a shodnou selection8761/7578frames. Simulation0,34–0,38ms, dominantnírender16–18,4ms. Proto žádná spekulativní migrace fyziky/Rustu.
- Lab profiling dokončeno samostatným taskem: sedm post-ready transit envelope26,8–86,9ms, nečistý shaderprofiling režim neumožňuje plainFPScomparison. V těchtointervalech vegetation0–0,3ms. Původně navržený grassworker zatím nepřijat. Přesnýtransitclock odlišovat odlightingInstant.
- Následný úzký task ověřuje skutečný setter traversal amplification v CharacterMaterials. Worker schedule by nemohl přesunout material/mesh/LOD lifecycle a raycasts sdílené fyziky. Případnájednoduššífixace nepředstírá dokončeníKEY-40/KEY-5.
- Hrané4203 a starší, SDK a cizíWIP zachované. Předání původníhoadminu/7JSONů proběhlo; původnívlákno nadále vlastníshadowpassfix. Cíl zůstává aktivní.
