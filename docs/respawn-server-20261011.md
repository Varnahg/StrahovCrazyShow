# Serverová regrese návratu na start · 11. 10. 2026

**Jde o samostatně reprodukovanou chybu resetu, nikoli prokázanou příčinu uživatelova průletu střechou.** Uživatel později potvrdil funkční R i tlačítko; původní zaseknutí nebylo trvalé. Střešní kolize mají oddělenou diagnostiku a opravu. Živý server na 2570 ani snapshot N se v této práci nerestartovaly a nebyl spuštěný GPU benchmark.

Původní handler pouze vystoupil z vozidla, změnil polohu Actor a vyslal presence. Nevynuloval již přijaté vstupy, nevyslal okamžitý forced authoritative reset a nezapsal novou polohu do `store.players` před presence. Ta tedy až do dalšího simulačního callbacku obsahovala původní souřadnice a vehicle flag. Obyčejné vystoupení navíc četlo původní fyzikální polohu; nešlo o bezpečnou obnovu poškozeného nativního tělesa.

## Oprava a dohodnutý protokol

`server/respawn.ts` používá sdílené `Simulation.respawnActor(id)` od vlastníka fyziky. Tato serverová část nemění implementaci sdílené fyziky.

1. `InputQueue.reset()` odstraní pending vstupy a nastaví `ack = lastReceived`. Frontier neklesá na nulu; pozdě doručené duplicity jsou odmítnuté a následující `ack + 1` může pokračovat.
2. Sdílené recovery API obnoví pěšího Actor bez obyčejného výstupu z poškozené polohy. Případné vlastní nebo stale-owned auto obnoví podle sdíleného pravidla; cizí řidič je chráněný.
3. `synchronizePlayer` okamžitě sjednotí actor a presence včetně position, yaw, speed, vehicle, zone a ack. Stejný helper používá běžná serverová synchronizace.
4. Handler okamžitě pošle `authoritative` s `resync: true`, výslovným `respawn: true`, aktuálním tickem a zachovaným ack frontierem. Běžný resync ani welcome marker `respawn` nemají. Klient čekající na návrat přijme právě kombinaci obou příznaků; dřívější obecná resync odpověď v letu ho nesmí předčasně odblokovat.
5. Forced pěší state obsahuje rovněž aktuální `vehicleState`, pouze pokud projde sdíleným `validVehicleState`. Klient tak může v jednom reconcile obnovit pěší a automobilový stav, aniž mezi událostmi vykreslí původní poškozené auto. Invalidní cizí car state se nepřidává.
6. Následuje případný car broadcast obnoveného vlastního auta a již aktuální presence.

Koordinovaná klientská část sjednocuje R/tlačítko, před requestem vyčistí lokální input buffer a po dobu pending resetu neposílá další pohyb. Tím spolehlivá uspořádaná WS cesta umístí všechny předchozí vstupy před respawn request. Klientská obsluha forced resetu a sdílené Rapier recovery mají vlastní soubory/testy; tento protokol neprohlašuje jejich samostatné výsledky za serverové testy.

Opravná sestava používá **PROTOCOL_VERSION 6**. Protože nový klient vyžaduje konkrétní respawn acknowledgement, server/bundle se nasazují společně. Během přípravy zůstal N na verzi 5; nyní jej na místním odkazu nahradil společně ověřený O2. Nesoulad handshake odmítá starou protistranu místo nekonečného čekání na marker, který by nikdy neposlala.

## Cílený důkaz

`pnpm exec tsx --test --test-concurrency=1 tests/server-respawn.test.ts tests/netcode.test.ts`: **9/9 PASS**, exit 0, test runner 5,188 s. [Úplný log a výsledky](verification-evidence/respawn-server-20261011/results.json).

Tři nové testy používají skutečný `Simulation`, Rapier a `InputQueue`:

- Původní posloupnost při vozidle vzdáleném přibližně milion metrů vrátí Actor, ale nechá šest queued vehicle vstupů, ack 2 a stale presence. Nová cesta dá nula pending, ack 8, aktuální pěší presence, `resync: true`, platný car state a přijme nový pěší příkaz seq 9.
- Izolovaná injekce NaN/Infinity do nativní polohy auta i pěšího tělesa skončí platným spawnem, nulovou rychlostí/vertical/yaw, stejnou veřejnou identitou Actor a JSON payloadem bez tichého převodu neplatných čísel na null. Čtyři další fyzikální kroky zůstávají konečné.
- Respawn jiného hráče zachová přesný stav auta i jeho skutečného řidiče. Chybějící Actor nevyvolá cizí reset.

Šest stávajících netcode kontrol pokrývá queue deduplikaci, fixed step, restore/replay, interpolaci a pohyb. Těchto devět provedení jsou cílené testy serverové stavové logiky a skutečné fyziky; nejsou samy SDK roundtrip ani novou frozen pipeline. Aktuální živá relace nebyla těmito testy změněna.

## Skutečný SDK/HTTP roundtrip

`scripts/integration-respawn.ts` nyní vstupuje přes běžné HTTP vydání dvou relací a skutečný Colyseus SDK. Přijímá pouze izolovaný endpoint `127.0.0.1:2568`; odmítne omylem předané 2570 ještě před připojením. `scripts/test-integration.mjs` tento scénář spouští před stávající integrací a podporuje cílené `--respawn-only`. Před HTTP health čeká na startup zprávu svého vlastního serverového procesu, takže neprovede test proti cizímu procesu, který by již držel port. Po dokončení nebo chybě ukončí svůj server a počká na jeho exit.

Skutečný scénář bez privilegovaného zápisu pozice ověřil:

- normální nastoupení A do auta; burst 32 vehicle příkazů a respawn; v odpovědi `resync:true`, ack 32, aktuální pěší spawn a platný obnovený car state;
- stejné správné presence pro A i druhou připojenou relaci, až po forced authority pro žadatele;
- odmítnutí starého již potvrzeného vehicle příkazu, stabilní pěší stav a skutečný pohyb po novém `ack + 1`, pozorovaný i druhou relací;
- nové nastoupení A, skutečný pohyb auta o více než metr a zastavení; respawn B ponechal A řidičem a auto na jeho odjetém místě, místo aby je teleportoval na CAR_SPAWN;
- závěrečný vlastní respawn A obnovil kanonické auto pro další integrační scénář; oba SDK sockety byly po leave uzavřené.

**Cílená SDK sonda před doplněním korelačního markeru a verze 6: PASS, exit 0, 21 dokončených čekacích kontrol, tři forced reset odpovědi, nula SDK chyb a nula otevřených autentizovaných spojení po úklidu.** [Zachovaná wire evidence tohoto běhu](verification-evidence/respawn-server-20261011/sdk-final.json), [log](verification-evidence/respawn-server-20261011/sdk-final.log). Po ukončení vlastního serveru neměl port 2568 listener ani established spojení; případný OS TIME_WAIT označuje již zavřené sockety.

Také spojený runner `nový respawn scénář → původní integrační scénář` prošel **exit 0**; původní scénář dokončil všech svých 29 čekacích kontrol včetně jízdy, chatu, oprávnění a reconnectu. [Spojený log](verification-evidence/respawn-server-20261011/sdk-combined.log), [původní scénář](verification-evidence/respawn-server-20261011/sdk-existing-combined.json). Závěrečné zpřísnění nového scénáře o explicitní nulové SDK error/notice kontroly bylo zopakované cíleně; nemění provozní posloupnost runneru. Tyto počty se nepřičítají k unit testům jako unikátní testy. Finální frozen test/build/integration zůstává samostatným krokem hlavního agenta.

Aktuální SDK scénář navíc výslovně vyžaduje `respawn:true` u všech tří respawn odpovědí a ověřuje jeho absenci jak ve welcome, tak v odpovědi na běžný `resync` obou relací. Importuje skutečnou `PROTOCOL_VERSION`, takže pro opravnou sestavu vyžaduje 6. Finální izolovaná integrace **O2 prošla: 23 čekacích kontrol, tři markerové odpovědi, 0 chyb a 0 spojení po úklidu**. [O2 wire evidence](verification-evidence/pilot-20261011-o2/integration-respawn-evidence.json); starší JSON nebyl přepsán ani vydáván za markerový důkaz.
