---
title: Jediný reset pro recovery požadavky stejné epochy
type: bugfix
created: 2026-11-04
status: done
route: oneshot
---

<frozen-after-approval reason="Uživatel autorizoval konkrétní optimalizaci po zlepšení testu; příčinou tohoto samostatného celku jsou redundantní recovery resetty doložené jeho logem.">

## Intent

Odstranit zbytečné opakované přebázování predikce, když opožděné žádosti o obnovu dorazí až po již provedené obnově. V hráčském logu žádosti seq1441/1447 vznikly bez mezilehlé odpovědi a odpovědi1474/1475 změnily epochy45→46 během7,5ms. Celkem20dvojic client-request odpovědí je do20ms. Stejný důvod používá běžný i dveřní recovery kanál, proto se neatribuuje všech157odpovědí jen jednomu producentovi.

Given aktuální spojení a platný token epochyE, when server stále používáE a povolí rate limit, then provede jediný reset a forced authority se snapshotem dveří. Given další běžný či dveřní požadavekE po prvním resetu nebo server-clock-dropu, then nezmění epochu, nevyprázdní nové vstupy a neodešle další forced authority. Given odmítnutí rate limitem bez resetu, then pozdější retryE funguje. Neplatné/budoucí tokeny a stará spojení nesmějí měnit živou relaci.

Požadavek má povinné `inputEpoch`; společný protokolV15 chrání před starými producenty. Zachovat 1s retry, dosavadní limity stale-authority/predikce, fyziku a autoritativní stav. Dveřní recovery potřebuje poslední validní přijatou epochu aktuálního roomu před Game.reconcile. Pokud žádá ještě před první autoritou, odložit požadavek do první platné autority bez spotřebování cooldownu za neodeslaný pokus. Zachovat reset při bind/leave a terminální odmítnutí nekompatibilních dveří.

Úspěch znamená odstranění redundantních epoch resets v cíleném reprodukčním scénáři a zachované ovládání. Neznamená odstranění prvního důvodného resyncu, všech renderových záseků nebo splnění60FPS. Předchozí NCM experiment je neprůkazný a zůstává defaultOFF/loopback; nespojuje se s tímto patchem.

</frozen-after-approval>

## Implementation Notes

- Varianta jen klientský pending flag neřeší opožděný retry a vyžaduje další lifecycle stav. Pouhé prodloužení retry/authority limitu maskuje důsledky a nezajišťuje idempotenci. Optional legacy token zachová starým klientům původní chybu; volen povinný epoch guard aV15 pro jednoznačný kontrakt celé relace. Nová cache odpovědí/requestId/timer nejsou potřeba.
- Reuse: TimelineInputQueue.frontier/reset, AuthorityBuffer validovaný frontier a reset, současný1s recovery cadence, DoorConnection cooldown a currentRoomCallbacks. Zahrnout Game.visibility i advanceSimulation, UI overflow a dveřní bootstrap. Tři integrační klienty je třeba aktualizovat.
- Nejde o potvrzenou opravu předrenderových mezer6,66s/1,35s: jejich většina je mimo zaznamenaný Game callback. Tato hranice tvrzení zůstává v přejímce.
- Stage2 plán je připravený, implementace naváže po stage1 commitu. Task resync-epoch-20261104 má přesné runtime/test/CLI scopes; root drží společné důkazy a serializované validační zdroje.
- Stage1 přijatá na main77b44742; root uvolnil čisté Game/UI po doložených vlastních předáních. Implementační agent smí získat task resync-epoch-20261104. Zvlášť pokrýt Game.visibility (další běžný producent), běžný1s retry, UI overflow a doors callback před první validní authority. Nejnovější přijatý token v AuthorityBuffer je nezávislý na úspěchu Game.reconcile.

- Integrovatelný výsledek:107 cílených regresí PASS, skutečný starý/nový serverový handler pro stejný trigger2resety→1 a zachování nového vstupu, TypeScript/produkční build i SDK integrace PASS, nezávislé review[]. C14 v Edge skutečně dokončil join a pohyb s3relacemi, bez render/asset fault v úspěšném průchodu. [Úplná evidence a limity](../../../docs/performance/evidence/gameplay-frame-cost-20261103/resync-epoch-20261104/README.md).
- Plná sada3082 měla3selhání/5skip:2opomenuté30s aserce byly samostatně opravené na schválené60/180s (35cílenýchPASS), nezměněný řadičový timeout následně izolovaněPASS. Celá sada se znovu nespouštěla. První C14 startup také timeoutoval; jediný opravný start v ověřeném vlastním okně prošel. Ani tento úzký hotový fix neuzavírá spolehlivost startupu nebo celkovýFPS cíl.
- Nový HUD správně označil31,9FPS/p9546,2ms/p9968,4ms jako nevyhovující. Celkový zaznamenaný průchod rovněž FAILED podle nové přejímky. Tyto výsledky se nepřepisují na zelené kvůli přijetí samostatného epoch guardu. Vlastní peers/API/okno uklizené a vstupy revalidované.
