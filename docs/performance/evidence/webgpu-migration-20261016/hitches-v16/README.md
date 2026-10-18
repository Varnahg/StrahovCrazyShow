# KEY-31: normální režim V4 a zbývající B6 přechody

18. 10. 2026. **Celá oprava stále není přijatá.** První F uvnitř B6 už v tomto pilotu nemá původní osmivteřinovou prodlevu, ale otočení ven a odchod stále vyvolávají nové kompilace a záseky až2,14 s. Ustálené FPS uvnitř také zůstává nízké.

## Rozhodnutí a podmínky

Beze změny JS byl spuštěn plný immutable V4 `bf28a56507b6b0650d214169c8cf94aa3b2d8abc4012a8b098e4e1366340c8c0` ([zdroje a validace](../hitches-v11/README.md)) na vlastní4194/API2589, URL pouze `?renderBackend=webgpu`. Vynechání existujícího `profileEnvironment=1` vypne textový shader inventář, environment a engine-frame hooky. Zůstanou běžné session/frame/benchmark logy, module/pipeline počty a RenderHealth. GPU timestamp nastavení se tím nemění. Jde o normální instrumentaci hry, nikoli naprostou absenci diagnostiky.

V předchozí V4 referenci inventář vykázal4,3208 s vnořeného CPU času; asynchronní pipeline se už připravují souběžně. Proto byl zvolen tento krok před další změnou cache, scheduleru nebo světelného pokrytí. Vypíná několik hooků současně a nelze jej vydávat za izolovaný inventory-only A/B. Timeout30 s, všech15etap a úplné ready/final submit kontroly zůstaly.

Edge WebGPU compatibility, NVIDIA/pascal, medium/manual, CSS i render1512×642,59,9Hz,1skutečný multiplayer klient/Alex. Řízené simulované počasí s cloud0,96. Hraná4193/C5 zůstala v původním menu s jedním preview canvasem; jiné vlastní herní scény a test/build neběžely.4192/4188 a cizí WIP beze změny.

## Golden a první F od spawnu

Run `normal1`, session `af2c458b-80ec-4726-a9b5-5856a11fc5c6`,566 souvislých záznamů. Raw SHA `79cf383eeead79a05f4f5b8b9f26421b93b398aa3c424cb02abbd542066e4b6b`. Vstup24→ready331 **40,3144 s**, příprava **22,3198 s**, final gate43,1 ms.852 modulů,52sync/495async pipeline, vše dokončené bez pending/failure.

| Okno | Seq | FPS | p95 / p99 | Maximum | Nové moduly / sync |
|---|---|---:|---:|---:|---:|
| Golden OFF |389–412|46,4|27,4 /31,8 ms|117,9 ms|0 /0|
| První F |465–497|37,9|35,2 /48,9 ms|110,3 ms|4 /2|

Golden akce390 je31,3 ms po startu. F468 je799,1 ms po startu,56,3 ms po zavření panelu. Maximum Golden následujeCPU87,5 ms, F CPU72,3 ms/shadow target35,1 ms. Obě interakce stále překračují100 ms. Nezávislý audit potvrdil inventory=null, nepřítomnost environment/engine-frame událostí, health valid a dispose549 bez chyb. Resources0 z vypnutého profileru **nelze doložit**.

Proti [profilované V4 sérii](../hitches-v14/README.md) je pozorovaný vstup kratší3,208 s a příprava3,6834 s. Vstupy ale nejsou přesně totožné:852vs868 modulů,495vs500 async; Golden24,31vs85,08 s po ready, F53,00vs107,79 s. Během nového F se auta mění2→1. Koncové sceneView, počasí a geometrie/materiály odpovídají referenci. Není doložená izolovaná úspora inventáře ani steady rendererové FPS zlepšení.

## Čerstvá B6 relace

API i klient byly znovu spuštěné, před cestou nastaven den12:00, bez předchozí Golden/F. Run `normal-b6-1`, session `4b2aa0c5-ae32-44bc-9273-70bb61ca7b11`, raw SHA `8391e9ab2983c6f909d6e0553bf1d38e3a45285cb34d1bb349cce286b5cfd4da`. Vstup **41,6261 s**, příprava **23,7456 s**, final gate36,2 ms;884 modulů/52sync/504async, bez chyb. B6 místo je(−4,99206;2,62010;−77,09600), yaw6,28259, pitch0,28. Nejde o přesně totožnou pozici/historii s dřívějším V2 pilotem; přímo se zachovává sceneView a agregované počty v raw, nikoli přesný poslední B6 selection bod a úplná historie vybraných meshů.

| Okno | Seq | FPS | p95 / p99 | Maximum | Nové moduly / sync |
|---|---|---:|---:|---:|---:|
| OFF uvnitř |891–920|28,4|42,7 /50,3 ms|62,5 ms|0 /0|
| První F |1015–1103|23,5|55,5 /64,7 ms|203,2 ms|2 /1|
| Ustálené ON |1272–1333|24,3|50,8 /63,5 ms|85,6 ms|0 /0|
| Otočení ven, ON |1594–1635|33,7|44,2 /101,1 ms|963,2 ms|22 /16|
| Odchod, ON |1690–1713|36,6|32,3 /45,5 ms|2142,3 ms|28 /16|

Každé okno začíná s panelem, pak se panel zavře; první F navíc stiskne F, otočení použije stejný horizontální drag, odchod drží W3,2 s. Před otočením postava nemění polohu, yaw se změní na9,42359; odchod končí(−4,98796;1,41730;−80,54957). Rychlost postupu během blokací ovlivňuje skutečně uraženou vzdálenost, proto je zachována koncová poloha.

První F:203,2 ms poCPU200,5 ms a následně125,7 ms poCPU43,5 ms. Otočení:143,1/842,1/963,2 ms poCPU137/207,9/112,6 ms. Odchod:366,1 ms poCPU359,2 ms, burst odpovídá přechodu b6:0→outside. Následující2142,3 ms mezera poCPU38 ms už probíhá v outside. **Dlouhá mezera není celá doložená JS blokace ani přesně připsaný GPU čas.** Bez podrobného profileru chybí raw RAF/engine-frame atribuce, ale počty kompilací a úplné intervaly zůstávají.

Čtecí audit potvrdil1814 souvislých záznamů a všech5health výsledků. F1024 je930,1 ms po startu,80,2 ms po zavření panelu. První F mámain169,7 ms a1nový program; omezený materiálový výpis jej přesně neurčuje. Otočení drží4světla, light-order revision19, budget writes4574 a activeLoaders0, zatímco aktivní obsah roste například998→1432meshů. Nové Effecty zahrnují PBR `reality aged pale plaster`/`m#797c75`→468, Standard `reality pale aluminum sill`/`reality concrete plinth`→470 a bark→472; nejde o úplné přiřazení11programů.

Výstup mění4→3světla/revision19→20, bez budget repair nebo aktivního loaderu. Burst mámain335,2 ms,14programů a255změn Effectů, shadow target1,6 ms. Reprezentativní materiál `b6 stair:entry-dark-metal`5708 měníEffect417→477; mesh sample6278 je skutečný merged box batch `b6 floor 0 b6 stair:entry-dark-metal`, ne dogleg madla. Avatar přitom znovu použije staršíEffecty283/280/281/284. V dlouhé mezeře1698 proběhly síťové callbacky1695/1697, což vylučuje tvrzení o souvislé2,14sJSblokaci. Dispose1796 bez render/asset chyb; resources0 bez profileru nedoloženo.

## Další postup a limity

Neintegrovat V4 jako dokončenou opravu pouze na základě prvního F. Nejdřív rozebrat konkrétní materiálové změny při otočení/odchodu, světelné typy a pořadí slotů, shader historii a prostorový výběr. Porovnat opravu redundantních variant s doplněním skutečně potřebného pokrytí; další etapy mohou zhoršit startup. Žádná nová cache ani diagnostická vrstva nebyla přidána.

Původní kontrolní snapshot už má fulltest/build/integraci; pro pouhou změnu URL se kód nerebuildoval. Clear-weather shadows, jiné avatary, multiplayer, všechny kvality a finální WebGL2/WebGPU opakované páry zůstávají neověřené. Provoz ukončen přes UI, karta about:blank, vlastní services zastaveny podle identity. KEY-31 i migrace zůstávají otevřené.

[Archivní manifest](archive-manifest.json) ověřuje22 artefaktů včetně rozbalených gzip obsahů. Tři screenshoty ukazují skutečný Golden/B6 obraz, nikoli pixel parity přejímku.
