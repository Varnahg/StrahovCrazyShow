# KEY-31: izolovaný nativní kandidát se 13 světelnými etapami

18. 10. 2026. **První Golden/F mají opakovaně výrazně menší záseky, startup se však prodloužil. Kandidát není přenesený do native/main ani přijatý pro výchozí renderer.** Hrané verze zůstaly stejné. [Výzkum a volba variant](qa/analysis.md) předcházejí implementaci; samostatný [CPU proof](../hitches-v21/README.md) neznamená implementovanou cache.

## Přesný kandidát

Manifest `c989fc77778c484cbdf53d3f7bcb717837ece01ab18b8b4812069924a7f1eec7`, šest copied source/test souborů nad native `2a3dba44ea28dbeffa5324fe22c35011b1e333c4233bb99ed487ee7e057d3584`. Game používá původní spawn apply/full frustum a přidává day0/day1 OFF/ON pouze pro WebGPU; WebGL/default zůstává na devíti etapách. B6 kamera, actor, C5 preload/startContent/UI/pipeline-retention se nepřenášejí. Timeout30s,128meshes/4ms batching, strict readiness, pending Effects, dvě complete draws a finální submit gate jsou zachované.

Stávající lokální opt-in inventory dostává explicit19 slotů: unassigned+17Game jmen+overflow. Default16 a ostatní limity zůstávají, hardcap21 je převzatý z ověřené QA konfigurace. Žádná nová diagnostická vrstva. Refaktoring pouze sjednocuje rozlišení day/night v původním apply; žádný nový persistentní stav.

Stejné testové bytes: baseline **65PASS/9FAIL → kandidát74/74**, related **80/80**, scopedTS **3361/0**. Nezávislé čtecí review ověřilo exact6changes/234inputs, původní assertions, časové a lifecycle hranice; bez blokujících nálezů.

Root immutable snapshot **`b9d812d3262ec6e781b6d268b4ca0fec108ab0b32591dbfba83a70d0578b513f`**,568hashovaných souborů včetně testů/provenance. FullTS/build PASS07:07:07–07:07:49UTC; později nad stejnými bytes **1338/1338 bez skipů**07:24:01–07:27:17 a izolovaná integrace PASS07:27:21–07:27:45. Build se zbytečně neopakoval; full-validation receipt odkazuje původní úspěšný build. Frozen source/dependencies a shared package metadata nezměněné.

## Edge piloty bez profileEnvironment

Vlastní4194/API2589, čerstvý server pro každý běh, WebGPU compatibility/Nvidia-Pascal, medium/manual,1512×642 CSS i internal, Alex a1skutečná multiplayer relace. Řízené počasí cloud0.96, celestial shadows vypnuté. Měřicí okno v popředí; hraná4193 zůstala v menu s preview, bez souběžných testů/buildů/3D hry.

První kandidát byl následován čerstvou devítietapovou referencí a druhým kandidátem. Každý má stejnou posloupnost: vstup→Golden OFF10s→prvníF10s→Day s ponechanou ON10s→odchod/menu→about:blank. Starší nativní smoke z [hitches-v20](../hitches-v20/README.md) má pouze F okno po Golden a slouží jako další historický běh.

| Metrika | Day13 první | Native9 reference2 | Day13 druhý |
|---|---:|---:|---:|
| Vstup→ready |36,3736s|32,1425s|38,4478s|
| Příprava |23,6779s|19,2901s|22,7309s|
| Golden moduly/sync/max |0/0/125,1ms|72/51/4112ms|0/0/130,3ms|
| První F moduly/sync/max |4/3/149,1ms|82/57/5175ms|4/3/151,8ms|
| Day ON moduly/sync/max |4/1/211,2ms|4/1/217,6ms|4/1/200,3ms|
| F p95/p99 |34,6/52,0ms|39,3/949,2ms|31,7/43,8ms|
| F FPS v přechodovém okně |39,3|14,4|40,6|

Starší native9 smoke: startup33,4601s,prep20,1074s,F6265ms/82mod57sync. Nižší průměrné FPS okna obsahujícího sekundový zásek není důkaz rozdílu ustálených FPS. DayON není nezávislý cold Day test; už mu předcházel Golden/F. B6 v tomto kandidátovi nebylo testované.

Startup vůči staršímu smoke +2,9135s; druhý pár **+6,3053s**, z toho+3,4408s přípravy,+2,8723s před přípravou a−7,8ms tail. Čtyři denní etapy samy stojí5,2953/5,1528s, ale společných devět v kandidátech jen18,3807/17,5757s. Celý rozdíl proto nelze připsat samotnému počtu etap. Oba kandidáti dodrželi30s deadline; rezerva není zárukou dalších startů.

## Důkazy a omezení páru

Všechny UI exporty mají valid RenderHealth, errors/pending0 a správný source snapshot. Raw sekvence jsou souvislé: první kandidát612records/SHA `1fb094ac50e8d2863334123b701a9d2eaf4194f8d8c4ac5a0ff5406f5fe13fa2`, reference521/SHA `60c3758d2fc7ff8dfeed2399a06e6cb8bfcc1ae961fb83bd116d9df07fe8b924`, druhý kandidát427/SHA `9b44925ed7806d74ac1ce3eb8288a6449b151405a4151878884e8fb9b8a717a7`. Dispose603/518/424 mají prázdný payload, nejsou důkazem nulových úniků zdrojů. Nezávislý audit všech tří běhů potvrdil čísla a tyto limity.

- Kompletní kamera/matice/poloha, počasí, GPU a rozlišení souhlasí;239stromových meshů. Ambient a časování se liší. Ve druhém páru Golden passengers/cars2/0 proti5/2, F1/1 proti4/1, Day1/1 proti2/0.
- Druhý pár začíná okna po ready: Golden30,494/12,920s, F75,994/38,690s, Day111,604/73,077s. První kandidát a starší smoke měly odlišný počet oken.
- Referenční Golden zadržel otevřený panel po timeoutu kliknutí; kandidát jej zavřel ihned. Před F se panel v obou zavřel. Přechodné aria=false po F ve druhém kandidátovi následovala samostatná kontrola true; nejde o důkaz chybějícího stisku.
- Cadence není všude dostupná: starší smoke, první kandidát a reference2 mají jen1neplatný vzorek/Hznull. Druhý kandidát má85vzorků a59,9Hz. Žádný zaznamenaný blur/hidden. Tepelná/clock data nejsou ověřená; toto není finální renderer A/B.
- Native raw nemá benchmark-end ani action/lighting-change markery. **Delty/maxima jsou z UI exportů**, nikoli vyrobené přesné raw hranice. Původní QA summarizer správně odmítl chybějící end; nevznikly z něj falešné summary. Root audit používá UI výsledky a zachovává raw zvlášť.
- První kandidát F149,1ms následuje poCPU36,5ms; jiný interval126,4ms má124,5msCPU. Day211,2ms má188,7msCPU. Reference4112/5175ms následují poCPU23,6/84,1ms. Mezera není celá JS ani prokázaný GPU execution time. Nové jednotlivé programy bez inventáře neumíme přesně přiřadit.

## Rozhodnutí

Dokončený QA experiment je zachovaný pro další práci; **runtime integrace odložená kvůli startup regresi a nedokončené výkonové přejímce**. Není odmítnutý mechanismus denního pokrytí: opakovaně odstranil většinu nových Golden/F variant. Stále ale zbývá prvníF~150ms, Day~200ms, B6, další avatary/kvality/clear-weather, více skutečných relací a ustálené FPS.

Další zásah má vycházet z CPU proofu přípravy materiálů a porovnat levnější čistou serializaci s ostatními možnostmi; cache není předem zvolená. Potom znovu měřit celý vstup a interakce se stejnými limity. Žádné zvýšení timeoutu, oslabení readiness nebo automatický default flip.

[Archivní manifest](archive-manifest.json) ověřuje63artefaktů, zdroje kandidáta, logy, raw/UI a screenshoty. [První obraz](native-day13-normal1-golden-on.png), [druhý denní obraz](native-day13-normal2-day-on.png). Vlastní služby po každém běhu ukončené podle identity; kartaabout:blank, hrané4193/4192/4188 beze změny. Celkový cíl a KEY-31 zůstávají otevřené.
