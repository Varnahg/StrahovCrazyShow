# Omezený observační sběr v14

Source 5cdb14e25afbdf83a9f5fa0707b31fed5caea184, snapshot ecb77e181ed33b8777755cdd426636e0d7a9eb98334df9301d33e353bafadb09;1216/1216 testů, TypeScript/build a izolovaná integrace PASS. Produkční session20d694ca-5862-4b83-ba49-13f717ba6c5c dokončila přípravu i game-ready bez hlášeného render faultu.

Inventář zachytil516 raw/body modulových volání, žádné přesné raw/body opakování a48 dodatečných shod po pouze odvozeném vynechání prokazatelně nepoužitých bezpečných generated konstant (48skupin,9,30%volání). Všech516 analyzováno, unknown/kapacitní ztráta/kolize0. Podrobný seznam jmen/skupin je záměrně omezen16řádky a exportTruncated=true; souhrn není kapacitně zkrácen. CaptureCPU1154,7ms, max7,8ms; nezahrnuje snapshot/serialization a není optimalizací.

Runtime shadery se nezměnily. Výsledek je omezená optimalizační hypotéza, nikoli důkaz cache hitů, sémantické ekvivalence nebo úspory času. Bez měřené úspory se cache ani transformace nezavádí; prioritu má doložená correctness chyba KEY-39.

Podmínky nejsou srovnatelné s dřívějšímv13: z uživatelského testu přetrvala low kvalita, jiný skutečný čas a během počátku startupu byla karta neaktivní; potom byla přesunuta do aktivního vlastního okna. Celkových46,0235s a23,7696s lighting se proto nevydává za zrychlení. První frame context vsummary zachovává skutečné CSS/internal rozlišení a ostatní podmínky. Nejde o konečnou FPS ani funkční přejímku.
