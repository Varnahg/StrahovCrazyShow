# Čtecí rozbor přípravných dávek

18. 10. 2026. Audit resume_plan_review nad day13 snapshotem b9d812d3262ec6e781b6d268b4ca0fec108ab0b32591dbfba83a70d0578b513f a oběma piloty hitches-v22. Žádný parametr ani runtime se nezměnil.

light-preparation.ts:109–110,380–407 ukončuje dávku na 128 položkách nebo 4 ms. Položky zahrnují i přeskočené meshe, zatímco checks je nepočítá. Zbytek fronty čeká na další engine callback. tickCount proto nelze vydávat za počet užitečných dávek ani automaticky zbytečné čekání.

Pro dokončené etapy bez pauzy/restartu dávají total+max konzervativní dolní mez count-bound dávek. První day-0-on:16dávek,61,2ms celkem,max14,5ms ⇒ nejméně4dávky pod4ms. Pouze2mohly dokončit frontu (3renders minus úvodníprogress); nejméně2tedy skončily na128. První restore obdobně nejméně3. Druhý běh má nejméně1+1. Přesné stop reasons telemetry neobsahuje; garantovaná časová úspora je zatím0ms.

376/395ticků a264/269callbacků bezdraw nejsou důkazem odstranitelných čekání. Kontroly stojí asi6,05/5,21s, render callbacky12,93/13,05s; zbytek3,74/3,65s zahrnuje engine/plánování/čekání. Jedna readiness kontrola trvala až801/531ms:4ms rozpočet je kooperativní, nepřeruší běžící volání.

Nejmenší případný kandidát je větší count limit (např.512) při stejných4ms a30s. Jeho proof musí pokrýt levné/časově omezené/long single checks, skipped meshes, retry/pending, retirement a dvě complete readiness draws. Neměnit progress render, ObjectRenderer retry ani final submitted gate. Změna na microtasks/task scheduler má širší begin/endFrame/submission a responsiveness dopady a není zvolená. Jediný GPU faktor128→512 nad stejnýmday13 by musel změřit celý startup; žádný slib sekundové úspory.
