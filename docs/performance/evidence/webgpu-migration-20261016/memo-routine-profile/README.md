# Cena interního serializer memo při světelných změnách

19. 10. 2026, KEY-31. Výsledek je omezený mechanismus proof, nikoli přijatá výkonnostní oprava nebo uzavření issue.

## Co se zjistilo

Přesný existující engine/device memo zlevnil pozorovaný serializer vstup, ale neodstranil hromadnou přípravu materiálů. Nativní runtime se tímto sběrem nemění; rozhodnutí šestiběhového čistého pilotu memo zatím nepřijmout zůstává v platnosti.

| Vybraná rutina / fáze | A vstup do auta | M vstup do auta | A další světlo | M další světlo |
| --- | --- | --- | --- | --- |
| serializer inclusive ms |61,2 /499volání|29,7 /499|50,8 /431|24,4 /429|
| PBR prepareDefines ms |22,8|22,7|8,3|9,5|
| PBR prepareEffect selfSelected ms |9,3|8,3|5,5|4,7|
| Standard readiness selfSelected ms |12,3|11,5|7,0|6,1|
| PBR readiness selfSelected ms |12,0|13,5|1,6|2,2|
| createEffect inclusive ms |2,0|1,6|1,3|1,6|
| bindGroups inclusive ms |16,4|12,4|10,0|11,1|
| updateUniformBuffer inclusive ms |1,4|2,1|1,3|1,5|
| MeshDraw preparation ms |124,1|92,2|76,6|50,8|
| MeshDraw bind/draw ms |53,5|46,1|33,3|36,4|

A je dříve přijatý routine profile `0ac5b4db9e77fe178f08ab3dd40cfb20f4af7724d61270eb9d5ffd9df2056e06`, sessionda753f79-b879-4f9c-ad17-03d915b4578d. M `118ba77141784bc835d96167d5d5515868d3b71001f80ee7cc2f8160ff4a22bb`, session82393618-53f8-469c-8c8f-35b9b280595a. První M initial vzorek serializer0volání, následně499a429; nejde o vypnutou cache s obaleným prototype toString.

Jde o různé instrumentované běhy, nikoli přesný kauzální procentní přínos nebo čisté FPS A/B. Vnořené inclusive se nesčítají s children; selfSelected odečítá jen vybrané děti. Routine časování zahrnuje celé Scene.render včetně dalších průchodů, ne pouze MeshDraw main fázi. Serializer obsahuje rawreads, owner/lease, lookup a případný canonical fallback, ne samostatný parser či hitrate. Režie timerů, GC/native/driver čekání a takty jsou zahrnuté.

## Minimální zásah a ověření

Stejný původní bounded8routine helper, max8světelných frame samples a max32depth. Jediná target změna: prototype MaterialDefines.toString→static MaterialDefines._SerializeForEngine. Zbylých7targetů, Game a jeho lifecycle/test mají stejné bajty jako A. Static wrapper nemění stocktoString identitu; guard uvnitř memo ji nadále přijme. Čtyři vendor payloady jsou přesný currentproof z již commitnuté evidence `../current-serializer-memo/`, včetně novějších Standard IBL/IP oprav. Core/loaders sdílejí současnou fyzickou testovou fixture, ostatní dependencies readonly.

33/33cílených helper/Game/mesh testů PASS, fullTypeScript/buildPASS. Nový test ověřuje stockidentity, customreceiver/0args/return/throw a exactstaticdescriptorrestore. Předchozí helper regrese zachovávají completion/exception/stalegeneration/partialrollback. Source manifest má635položek, assembly inverse pro úzké textové delty exact. Nejde o produkční patch/lock instalaci ani fullsuite/integraci M.

Úspěšný capture má460recordů seq0–459 bez mezer; UI celýframearray odpovídá právě jedné raw sekvenci.3kompletní samples, nulové errors/depthSkipped/restoreConflicts/omissions, cleanup0. Healthstart/endvalid a pending0; během benchmarku žádná zaznamenaná ztrátafocus. Independent blind review kódu i raw výsledku bez doloženého nálezu, s níže uvedenými omezeními.

## Podmínky a neúspěšný pokus

Edge155/GTX1060/driver582.28, Low77%, CSS1528×650/render1175×500,1actualAlex/0ambient, night1792447200000, řízené stejnépočasí. Stejný vstupE/W8000ms/space2500ms. Před/po GPU873/860MHz,71/72°C,P3; jen snapshoty, ne kontinuální/fixclock garance. M instrumentované49FPS,p9526,8ms,p9941,2ms,max178,2ms,4snímky≥100ms;0programů/modulů,2syncpipeline. Tato čísla nejsou čistým srovnáním s A/M pilotem bez timerů.

První herní pokus neměl ready/benchmark. Operátor v UI přečetl timeout; pozdější browser tabs.get potvrdil active:false. Tyto UI náhledy byly vráceny nástrojem, nemají zde samostatný uložený snímek. `all-sessions/` zachovává všechny původní relace včetně neúspěšných; jejich raw dokládá absenci ready/benchmark, sám neprokazuje timeout ani příčinnou souvislost s neaktivní kartou. Po přesunu pouze vlastní karty do autorizovaného samostatného aktivního okna a reloadu se hra připravila. Druhá kontrola před dokončením přípravy vrátila disabled; následný UI ukázal hotovou hru, nebyla proto restartovaná.

## Další rozhodnutí a vlastnictví

Nezvětšovat cache podle tohoto výsledku. Konkrétní další otázka je řetězec světelná změna→dirty flag→stovky opakovaných readiness/defines. Porovnat stabilní shaderové sloty a omezení invalidace podle skutečně ovlivněných meshů se všemi dopady na stíny, obraz, kvality, B6 a lifecycle. Žádná taková změna se v tomto diagnostickém tasku neprovádí.

Vlastní4200/2595 procesy ukončené podle jejich PID/start/path identity; přechod do menu ověřen před ukončením. Protected4199 všech17codefiles a servedHTML před/po exact. Hranébuildy a133foreignWIP zachované. `artifact-manifest.json` připíná38payloadů; gzip lossless, operativníPID vynechané. KEY-31 i celkový cíl zůstávají otevřené.
