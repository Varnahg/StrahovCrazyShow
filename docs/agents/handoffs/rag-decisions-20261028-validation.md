# Průběžné předání živého Decisions ověření

Koordinátor `decisions-validation-01a17e9d`, task `rag-decisions-20261028-validation`. Před během claim i kontrola volného4268; soukromý API klíč načten pouze ze známého uživatelského souboru mimoGit. Žádný DB/Docker/GPU nebo node_modules zásah.

Dosud skutečně odesláno28 Decisions requestů,4 Responses generace (3Luna,1Sol) a8 doprovodných moderací. Souhrnný durable ledger je `.cache/rag-decisions-validation-20261028/budget.json`; každý pokus byl rezervován předtransportem, všechny dosud mají potvrzenou odpověď, žádný automatickýretry. Původní limit32/4/2complex nebyl překročen.

Předem zmrazená sada24syntetických případů:16kalibračních a8holdout. Při prahu0.80 všech24/24 očekávaných tiers; práh0.90 minul jednu skutečně složitou úlohu. Jde o malou syntetickou sadu, nikoli produkční distribuci či záruku obecné správnosti. Skutečný endpoint `/v1/decisions`, modelgpt-6-luna, oběnamedpredicate odpovědi ausage ověřené.

HTTP service harness127.0.0.1:4268 použil skutečnou moderaci/Decisions/Responses a výslovně injektovanou schválenou evidence fixture. Žádné skutečné embeddingy/SQL se v tomto harnessu nevolaly. Čtyři HTTP200 odpovědi, požadovaný i pozorovaný model: Luna,Sol,Luna po complexcap,Luna při chybějících lokálních podkladech. Všechny replay stejné a bez placeného opakování; reset204. Server i service pooly byly ukončeny.

Obsahová QA odhalila zbytečnou opravu předchozí správně doložené odpovědi v Sol větvi jen kvůli jiným aktuálním úryvkům. Root opravil jednu provider instrukci: absence starého podpůrného úryvku není důkaz předchozí chyby. Jde o konkrétní nález, ne důvod opakovat celé vyhodnocování. K ověření dvojice předchozí/nové odpovědi je navrženo explicitní navýšení celkového Responses capu4→6, při zachování nejvýše32 Decisions a2complex za celý checkpoint. Další placený běh se nespustí před koordinovanou úpravou tasku a novým claimem; ledger se nesmaže ani nevynuluje.

Root nyní uvolňuje tento validační claim po skončených procesech. Tím není KEY-68 ani celková živá přejímka označena za hotovou; review, CI a integrace ještě následují.

## Uzavřený živý checkpoint po konkrétní opravě

Po skutečném release admin změnil jen Responses cap4→6, se zachováním celkových32Decisions/2complex. Nový root claim předcházel dalšímu pokusu. Ledger append-only zachoval všech40 původních pokusů; budgetRevisions obsahuje původní limity, jejich změnu a SHA původního poleattempts.

Plánovaná Luna→Sol dvojice po opravě prošla2/2, správné requested iobservedmodel, citace, reset204 a bezplatnýreplay zachované. Sol tentokrát neopravoval dřívější správnou odpověď bez protichůdného důkazu. Celkové čerpánícheckpointu:30Decisions,6Responses,ztoho2complex,12moderací; všeconfirmed/received,0uncertain. Generační budget je vyčerpaný; žádné další generace vtomto checkpointu.

Syntetická klasifikačnísada24/24 při0.80; p50 celéhoadapteru377.7ms, p951203.5ms nad24různými malými dotazy. Nejde o produkční benchmark ani srovnání rychlosti dvou generátorů, jejich úlohy/vstupy se liší. Opravené serviceoperace trvaly přibližně4.05s Luna a13.90s Sol včetně moderace/routeru a injektovanéhoRAG; žádná nováSQL/embedding přejímka.

Bezpečná veřejná evidence je `docs/rag-ingestion/20261028/decisions/live-evidence.json`: syntetické otázky, tier/probability/usage, HTTP/model/replay výsledky a hash odpovědí. Celé modelové odpovědi a soukromý pomocnýledger zůstávají v ignorovanécache; klíč ani autorizačníhlavičky nebyly zapsány. VlastníHTTP4268 i všechny operace jsou ukončené. Root znovu uvolňuje tentoresource task; nezávislé review a finálníCI stále následují.
