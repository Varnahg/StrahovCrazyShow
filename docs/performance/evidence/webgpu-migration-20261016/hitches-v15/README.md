# KEY-31: zamítnuté zúžení Day1 přípravy

18. 10. 2026. **Far-only kandidát V5 nebyl přijat.** Zachoval avatarovou geometrii a lifecycle, ale vynechal část světových variant potřebných při první zlaté hodině a svítilně. Runtime změny zůstávají pouze v archivovaném QA experimentu; native/main a hrané 4193/4192/4188 se nemění.

## Experiment a kontrola

Vstupem je plný V4 `bf28a56507b6b0650d214169c8cf94aa3b2d8abc4012a8b098e4e1366340c8c0`. V5 `d3780568200d6a88a3e63d60c2174ffc7e665c6bbb26dd78fb2b308df9365da3` mění pouze Game, malý dočasný far-plane helper a dva testy. Manifest prototypu má SHA `b60b063bbe12aa81f435204f61d2f08a5547e02357bc0c0044dda6c9c50a48a7`; přesný diff, zdroje, testy a původní handoff jsou v `prototype/`.

Původních 15 etap, 30s deadline, dvě úplná ready draws, final submit gate, B6 camera/spatial restore a shader health kontroly zůstaly. Helper mění pouze maxZ v Day1 OFF/ON, při každém loading draw čte aktuální rigy a při ukončení přesně obnoví původní hodnotu. Nevytváří cache, observers ani gameplay stav.

64/64 cílených testů, scoped TypeScript 3366/0 a skutečný sedmikonfigurační avatar proof (119 captures, 70 plných defines/Effect porovnání, 77 restore včetně 21 výjimek) PASS. Čtecí review bez blokujícího nálezu. Root plný TypeScript a produkční build PASS, 03:53:11.461–03:53:57.583 UTC. Celá sada a integrace V5 nebyly spuštěny: první GPU kontrola už prokázala důvod odmítnutí.

## Produkční Edge pilot

WebGPU compatibility, NVIDIA/pascal, medium/manual, CSS i render 1512×642, jeden skutečný multiplayer klient na čerstvém API. Stejné řízené počasí s cloud 0,96 jako [V4 reference](../hitches-v14/README.md), stejný spawn a pořadí první Golden OFF → první F. Žádný souběžný build/test v měřicích oknech. Panel zůstává otevřený při Golden; F okno začíná s panelem, následně zavření a klávesa F.

| Přechod | V4 nové moduly / sync | V5 nové moduly / sync | V4 maximum | V5 maximum |
|---|---:|---:|---:|---:|
| První Golden OFF | 0 / 0 | 16 / 12 | 124,5 ms | 1178,4 ms |
| První F | 4 / 2 | 24 / 16 | 210,9 ms | 1748,7 ms |

V5 Golden: 37,9 FPS, p95 29,4 ms / p99 61,8 ms, raw seq1493–1584. První interval 319,6 ms následuje CPU282,4 ms; nejdelší 1178,4 ms následuje CPU22,5 ms. V5 F: 30,4 FPS, p95 35,1 ms / p99 42,1 ms, seq1726–1928; interval402,3 ms po CPU400,5 ms a následná mezera1748,7 ms po CPU99,4 ms. **Celá mezera není doložená JavaScript blokace.** Různé scene registry, čas od ready a diagnostický režim neumožňují přesnou kvantifikaci rendererové regrese ani steady FPS přejímku. Nové kompilace a sekundové prodlevy však přímo nesplňují podmínku tohoto experimentu.

Jednotlivé startupy V4→V5: **43,5224→43,2566 s**, lighting příprava **26,0032→25,6548 s**, final gate35,4→34,2 ms. V5 celkem838 modulů/52 sync/477 async proti V4 868/52/500. Úspora26,6setin sekundy v jediném běhu není doložené zrychlení. Náklad diagnostického shader inventáře je v čase zahrnutý; následující měření musí použít existující režim bez podrobné diagnostiky.

Raw session `85f3f9da-c4fb-427a-b76b-fe1e0cac5a82`, 8265 souvislých záznamů seq0–8264, SHA `b040f76156e1a0ebb239951d658bf97a74c1323cfc6ef844a86a5ac01b0111d1`. Obě UI okna mají platný health bez render/asset chyb. Hra ukončena přes UI, vlastní karta převedena na about:blank a pouze vlastní služby ukončeny podle identity. Delší nečinný úsek po druhém benchmarku je v raw zachován; čas získání výsledku se nevydává za čas okna.

Nezávislý čtecí audit raw souhlasil s odmítnutím. Golden akce seq1494 je32,2 ms po startu; F seq1731 je845,6 ms po startu a53 ms po zavření panelu. Inventory self-time49,0/89,5 ms je vnořený v příslušných oknech. Příprava Day1 OFF/ON klesla4,3956→3,2098 s, B6 vzrostla4,0437→4,8524 s; jejich moduly146→94 a110→132. To podporuje přesun práce, nikoli identitu konkrétních variant.

Celé sceneView včetně matic a obnoveného maxZ1100 souhlasí. Golden byl117,7 s po ready proti85,08 s, registry3326 proti3330 a materiály223 proti222; při V5 F jsou2ambientní pasažéři a mizí auto, V4 má0pasažérů/1auto. Tyto rozdíly omezují kauzální atribuci. Dispose8243 je bez chyb, profil8244 inactive/resources0/observerErrors0. Raw audit neobjevil sekvenční ztráty.

## Rozhodnutí a limity

Far-only neintegrovat; další zmenšování pohledu ani přesun čekání po game-ready tento výsledek neopraví. Zachovat plné world Day1 pokrytí a nejdřív změřit náklad již existujícího diagnostického opt-in. B6, clear-weather shadows, multiplayer, úplná funkční a rendererová přejímka V5 neprovedeny. KEY-31 a migrační cíl zůstávají otevřené.

[Archivní manifest](archive-manifest.json) ověřuje48 převzatých souborů, včetně rozbalených gzip obsahů. Jde o dokončený negativní experiment, nikoli dokončenou opravu nebo přijetí migrace.
