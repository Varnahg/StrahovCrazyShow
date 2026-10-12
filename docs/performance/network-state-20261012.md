# Společný svět: přenos, predikce a životní cyklus relací

**Dodatek B5:** navazující oprava pozdních klientských callbacků a zrušeného připojování má vlastní zdrojový otisk a [funkční ověření](../verification.md). Server, kodek, renderer, CSS a výkonové harnessy se oproti B3 nezměnily; nové GPU/load měření nebylo spuštěné. Následující čísla nadále patří výslovně uvedeným checkpointům A/B1/B2/B3.

Práce 11.–12. 10. 2026, Europe/Prague. **Nejnovější checkpoint B3 snížil medián celkového přenosu ze serveru ke 100 skutečným klientům z 20,446 na 5,089 MB/s, tedy o 75,11 %.** Jediný společný svět i viditelnost všech hráčů zůstaly zachované. V této sérii vzrostl medián CPU serveru z 52,34 na 59,32 % jednoho jádra a medián p95 potvrzení vstupu z 63,81 na 80,24 ms; zrychlení CPU ani běžné odezvy se tedy neprokazuje. Následná 300s produkční kohorta B3 doložila obnovu po nahromadění vstupů: **31 cílených obnov, 0 aplikačních chyb**, bez přetrvávajícího zpoždění 14 příkazů v raw monitoru. FPS na Intel UHD 630 zůstala **28,9–30,9**. Starší B1 naměřil úsporu 75,14 % a jeden výrazně horší síťový vzorek; kompletní historie včetně omezení B2 zůstává níže.

B1 `1cdf4c6c3cded658d61117905c3d7b1be662e54ea9081fc002d2c3f86d7abb42` obsahuje 8191 zmrazených souborů včetně testů. Prošel **512/512 testy, produkčním buildem a izolovanou integrací**, všechny příkazy exit 0: [výsledky](../verification-evidence/network-state-20261012/results.json), [testy](../verification-evidence/network-state-20261012/test.log), [manifest](../verification-evidence/network-state-20261012/source-manifest.json).

B2 `3a27efd9e1ae36a8f3ebce99b3ccffa21e138a88bdc6d9c329a17a591b21875e` obsahuje následné úpravy kontrastu, mobilního rozložení a popisku náhledu osvětlení. Také prošel **512/512 testy, buildem a úplnou izolovanou integrací**, všechny příkazy exit 0: [výsledky B2](../verification-evidence/network-state-final-20261012/results.json), [testy B2](../verification-evidence/network-state-final-20261012/test.log), [manifest B2](../verification-evidence/network-state-final-20261012/source-manifest.json). [Porovnání zdrojů](../verification-evidence/network-state-final-20261012/source-comparison.json) potvrzuje pouze změny `hud.css`, HUD části `ui.tsx` a lokalizace; ostatních 8188 souborů včetně serveru a protokolu je totožných s B1. **B2 je přesto mezikrok, nikoli finální přejímka:** delší produkční měření odhalilo přetrvávající frontu vstupů a vedlo k opravě B3. Název složky `network-state-final-20261012` ani souborů `gpu-final-*` toto omezení nemění.

B3 `f908aacdec194939b7715d66bafae972530efa88e66378b1ba0b7656b3d8607f` obsahuje **8193 zmrazených souborů včetně testů**. Prošel **516/516 testy, produkčním buildem a všemi čtyřmi scénáři izolované integrace**, všechny příkazy exit 0: [výsledky B3](../verification-evidence/network-responsive-20261012/results.json), [testy B3](../verification-evidence/network-responsive-20261012/test.log), [integrace B3](../verification-evidence/network-responsive-20261012/test-integration.log), [manifest B3](../verification-evidence/network-responsive-20261012/source-manifest.json). [Samostatná kontrola tří produkčních GPU exportů a 300s kohorty B3](evidence/network-state-20261012/gpu-b3-check.json) prošla bez neshod; její skutečné obnovy a omezení jsou uvedeny níže.

## Výchozí stav a podklady

Výchozí P5: `4601a8c8f94775e37befda81976b1a8457a171be923dd5b24981847b7c34000e`, 8175 souborů včetně testů. V novém worktree byly čtyři Git LFS soubory původně jen ukazatele. Po `git lfs checkout` byly materializované soubory přeneseny do výchozí kopie a všechny její hashe znovu porovnány s pracovní kopií před i po čtení: nulový rozdíl, shodný P5 otisk. Předchozí manifest s ukazateli je uchovaný v `.cache/network-baseline-before-lfs.json` a není podkladem měření.

Průzkum vycházel z aktuálního `server/index.ts`, `shared/netcode.ts`, `server/community.ts`, skutečně instalovaného Colyseus 0.18.9 a Rapier 0.21.0 a z primární dokumentace:

- [Colyseus: state synchronization](https://docs.colyseus.io/state) a [optimizing state](https://docs.colyseus.io/state/optimization), ověřeno 11. 10. 2026. Vlastní zpráva `broadcast("motion", …)` nedostávala automaticky delta optimalizace schémat; předchozí formát obsahoval celý seznam v každém paketu.
- [Colyseus: scalability](https://docs.colyseus.io/scalability), ověřeno 11. 10. 2026. Jedna místnost patří jednomu procesu. Další proces sám nerozdělí fyziku tohoto společného světa.
- [HUD: primární podklady a důvody změn](../hud-network-study.md).

## Změny a zachované vlastnosti

Protokol 8 má jeden enkodér na společný svět a jeden dekodér na klientské spojení. Nadále posílá pohyb ve 20 Hz a klient v každém platném paketu rekonstruuje všechny připojené hráče. Nezavádí oddělené skupiny, skrývání vzdálených hráčů ani změnu 60Hz autoritativní simulace.

Přenos používá krátká číselná ID a bitovou masku změněných polí. Vzdálené zobrazované souřadnice mají krok 1 mm (chyba nejvýše 0,5 mm), rychlost 0,001 m/s a natočení 0,0001 radiánu. Potvrzení vstupů a samostatné autoritativní stavy pro místní predikci jsou přesné. Stav auta se mění pouze bezeztrátově a při nezměněném autě se neopakuje. Přenáší se také skutečný kontakt postavy s podložím; následná změna vzdálené animace je samostatná práce.

Úplný obnovovací snímek vzniká při změně seznamu hráčů, nejpozději po 40 zprávách a na omezený požadavek klienta. Cílená odpověď neodčerpává číslo globální zprávy a vynutí další úplný společný snímek. Tím nevzniká nesoulad při návratu hodnoty na původní stav mezi příchodem hráče a dalším rozesláním. Dekodér ověřuje celý paket před změnou svého stavu. Zastaralý paket nevyvolává opakované požadavky na obnovu.

Predikce po opravě přepisuje uložené stavy každého přehrávaného vstupu. Současně odstraňuje záznamy nesprávného režimu vozidla a používá čas serverové odpovědi posunutý o pořadová čísla vstupů. Stále nejde o úplný historický rollback okolních pohyblivých překážek.

Relace zachovávají 30minutové okno obnovy. Po jeho vypršení se odstraní osobní sociální data, obousměrné vazby, limity, účasti a osobní kvízový stav. Fyzická postava se nadále odstraňuje už při odpojení. Autorská setkání si až do vlastního časového úklidu zachovávají `owner`, aby se nikdy nezměnila na veřejné ukázkové akce. Již získané týmové body zůstávají výsledkem týmu. Veřejné HTTP ani samostatný host nedostávají hráčskou přítomnost či zprávy.

Operace bez skutečné změny nespouštějí hromadnou synchronizaci. Změna kontaktu se posílá pouze oběma účastníkům; účasti na událostech zůstávají společným stavem. Aktivní změny a celkový počet zpráv jednoho spojení mají limity; pravidelný úklid také uvolňuje prošlé IP limity.

## Skutečná síť: 100 klientů, tři páry po 30 sekundách

[Úplné A/B výsledky a odkazy na všech šest vzorků](evidence/network-state-20261012/network-100/summary.json). Runner ověřil všech 8175 souborů A a 8191 souborů B1 proti jejich manifestům bez neshody. Pořadí bylo A/B, B/A, A/B; každý vzorek spustil vlastní nový server na portu 2580. Po pěti sekundách zahřátí následovalo 30 sekund měření se 100 skutečnými SDK relacemi a šesti různými avatarovými předlohami. V každém vzorku bylo po celou dobu **100 hráčů v jednom světě, všech 100 se pohybovalo, 0 aplikačních chyb a 0 resynchronizačních flagů**. Tyto nuly neznamenají nulové záseky.

Hardware: Intel Core i7-8750H, 12 logických procesorů, Windows 11, Node v24.19.0. Server i 100 SDK klientů běžely na stejném počítači. Neprobíhal browserový/GPU test. MB a KB jsou desetinné jednotky; přenos zahrnuje binární aplikační zprávy, bez WS/TCP/IP/TLS režie.

| Ukazatel | A: výchozí P5 | B1: nový přenos |
| --- | ---: | ---: |
| Celkem server → klienti, medián | 20,446 MB/s | **5,083 MB/s (−75,14 %)** |
| Celkem klienti → server, medián | 326,940 KB/s | 326,908 KB/s |
| CPU serveru, medián podílu jednoho jádra | 50,29 % | 50,23 % |
| CPU serveru, rozsah vzorků | 48,39–50,40 % | 47,41–59,00 % |
| Simulace podle serverového času, medián | 60,001 Hz | 59,998 Hz |
| Pohybové zprávy, medián / rozsah | 19,998 / 19,994–20,000 Hz | 19,965 / 19,328–19,996 Hz |
| Pozorované stáří potvrzení vstupu p95, rozsah | 61,42–68,26 ms | 65,76–142,38 ms |
| Pozorované stáří potvrzení vstupu p99, rozsah | 65,01–76,61 ms | 72,45–192,89 ms |
| Mezery příjmu pohybu p95, rozsah | 69,91–72,85 ms | 70,75–74,32 ms |
| Mezery příjmu pohybu p99, rozsah | 81,24–83,81 ms | 77,52–110,65 ms |
| Nejvyšší event-loop zpoždění ze všech vzorků | 57,18 ms | 130,55 ms |

CPU je `součet cpuMs / součet elapsedMs` pouze z úplných přibližně sekundových oken uvnitř měřeného intervalu. **Jde jen o proces serveru, nikoli součet serveru, SDK klientů a ostatních procesů.** Stovka kandidátních dekodérů na témže stroji rekonstruuje při 20 Hz přibližně 200 000 hráčských řádků za sekundu. Úspora celkového CPU stroje proto není doložená; serverové mediány jsou prakticky stejné. Stáří potvrzení měří odeslání vstupu až jeho pozorované potvrzení, není to RTT ani latence od klávesy k obrazu.

Mediány p95/p99 jednotlivých telemetrických oken, dále zprůměrované mediánem mezi běhy, jsou A **32,47/34,87 ms**, B1 **32,54/34,87 ms**. Nejde o společný percentil všech event-loop vzorků ani o snímkové časy. Jednotlivá okna i jejich maxima zůstávají v raw telemetrii.

### Zachovaný horší vzorek B03

[B03: síť](evidence/network-state-20261012/network-100/03-r2-B/network.json), [telemetrie](evidence/network-state-20261012/network-100/03-r2-B/server-telemetry.jsonl), [souhrn](evidence/network-state-20261012/network-100/03-r2-B/sample-summary.json). Přibližně **12. 10. 00:23:01,4–00:23:04,1 Praha** (11. 10. 22:23:01,4–22:23:04,1 UTC) obsahuje všech deset serverem časovaných mezer nad 100 ms; největší je 138 ms. Úsek 10.–15. sekundy měření měl 83 pohybových zpráv místo obvyklých 99–100. Celý vzorek měl **580 zpráv, 19,328 Hz, p95/p99 potvrzení 142,38/192,89 ms, CPU 59,00 % a event-loop maximum 130,55 ms**. Simulace přitom vykázala 59,998 Hz a neztratila hráče.

Zpoždění je viditelné už v serverových časových značkách, takže nejde pouze o pomalejší příjem v testovacím klientovi. Server při pozdějším callbacku dopočítá fyziku, ale odešle jediný aktuální snímek; zmeškané odesílací intervaly nedohání sérií starých zpráv. Velké mezery patří běžným delta paketům, nikoli pravidelným úplným snímkům. S nejhorším telemetrickým oknem souvisí pokles heapu o 44,89 MB, ale obdobné či větší poklesy v jiných vzorcích nastaly bez podobného zpoždění. **Příčina mezi GC, synchronní prací a plánováním hostitelského stroje není bez příslušné stopy rozlišená; chyba kodeku se z tohoto záznamu neprokazuje.**

B03 přenášel 4,931 MB/s i proto, že odeslal méně snímků. Pomocné přepočtení poměru celkového toku a frekvence zpráv na 20 Hz dává asi **5,103 MB/s**, ostatní dva B vzorky asi 5,091 MB/s. Jde o odvozené srovnání, nikoli další měření; nižší tok B03 není vydávaný za další úsporu komprese. Vzorek nebyl vyřazen ani nahrazen následným opakováním.

### Následný pár po 60 sekundách

[Samostatný A/B záznam](evidence/network-state-20261012/network-100-followup/summary.json), stejné dva zdroje, nový server pro každý běh, 100 hráčů a 5s zahřátí. Přenos **20,445 → 5,092 MB/s (−75,09 %)** potvrdil podobnou úsporu při běžné frekvenci. Pohyb byl **19,997 → 20,014 Hz**, simulace **59,998 → 60,008 Hz**, CPU **49,19 → 50,31 % jednoho jádra**. Potvrzení vstupů p95/p99 bylo A **71,74/77,05 ms**, B1 **70,67/77,46 ms**; event-loop maxima 46,24/51,09 ms. Oba běhy zachovaly 100 pohybujících se hráčů, 0 chyb a 0 resynchronizací. Jde o jeden dodatečný pár, který neruší omezení B03 ani nedokazuje odstranění jeho příčiny.

## B3: obnova při nahromadění vstupů a nová série 100 klientů

[Porovnání B2 → B3](../verification-evidence/network-responsive-20261012/source-comparison.json) obsahuje pouze šest změněných nebo přidaných souborů: `shared/netcode.ts`, `server/index.ts`, síťový měřicí skript, spouštěč integrace a dva nové regresní scénáře. Zbývajících 8187 souborů je totožných. `shared/motion-codec.ts` má v obou checkpointech SHA-256 `90cfb10e95586a6df1686cb97631ef874e9d5d1bdfab2e75e8be4ecb3da8e1ec`; klientská predikce, HUD, assety a protokol 8 se proti B2 nemění.

Změna běhu hry je omezená na frontu vstupů. Jestliže po přijetí celého platného paketu čeká více než osm příkazů, server nejvýše jednou za sekundu pro daného hráče frontu vyprázdní, potvrdí poslední přijaté pořadové číslo a odešle tomuto klientovi přesný autoritativní stav s důvodem `input-backlog`. Nepřidává fyzikální kroky ani zrychlení postavy a ostatní hráče neresynchronizuje. Staré příkazy se tak mohou zahodit při jednorázové opravě predikce, místo aby zpožďovaly každou další akci. Měřicí skript nově ukládá samostatné časové značky ACK a důvody resynchronizací; způsob a frekvence generování pohybu zůstávají stejné.

[Skutečná SDK integrace B3](../verification-evidence/network-responsive-20261012/input-backlog-integration.json) vynutila nahromadění příkazů. První obnova potvrdila pořadové číslo 16 za **2,4093 ms**; posun v X během této obnovy byl **0 m**. Následujících 50 potvrzení při pokračujícím 60Hz vstupu mělo p95 zpoždění **2 příkazy**. Druhý klient obdržel **0 resynchronizací**. Prošly také neplatné pořadí a omezení četnosti obnovy. Jde o cílený místní funkční scénář, nikoli obecně dosažitelnou internetovou latenci.

[Nové A/B měření B3](evidence/network-state-20261012/network-responsive-100/summary.json) provedlo opět tři páry po 30 sekundách, s pěti sekundami zahřátí, v pořadí A/B, B/A, A/B a s novým serverem pro každý běh. Všech 8175 souborů A a 8193 souborů B3 prošlo kontrolou manifestu. Všech šest běhů dokončilo celý interval a má `functionalPass: true`: **100 hráčů v jednom světě, 100 pohybujících se klientů, 0 aplikačních chyb a 0 resynchronizací**. Hardware, lokální provoz, šest avatarových předloh i definice CPU a přenosu odpovídají výše popsané metodice; GPU během této série neběželo.

| Ukazatel | A: výchozí P5, nová série | B3 |
| --- | ---: | ---: |
| Celkem server → klienti, medián | 20,446 MB/s | **5,089 MB/s (−75,11 %)** |
| Celkem klienti → server, medián | 326,940 KB/s | 326,845 KB/s |
| CPU serveru, medián podílu jednoho jádra | 52,34 % | 59,32 % |
| CPU serveru, rozsah vzorků | 50,23–57,03 % | 47,97–65,35 % |
| Simulace podle serverového času, medián | 60,006 Hz | 59,981 Hz |
| Pohybové zprávy, medián / rozsah | 19,998 / 19,995–19,998 Hz | 19,991 / 19,761–19,992 Hz |
| Stáří potvrzení vstupu p95, medián / rozsah | 63,81 / 59,75–69,24 ms | 80,24 / 65,44–86,71 ms |
| Stáří potvrzení vstupu p99, medián / rozsah | 71,52 / 66,37–75,88 ms | 91,03 / 73,98–115,75 ms |
| p95 nepotvrzených příkazů, rozsah vzorků | 3–4 | 3–5 |
| Nejvyšší event-loop zpoždění ze všech vzorků | 62,39 ms | 93,19 ms |

Úspora přenosu se zopakovala. **CPU serveru se v této sérii nezlepšilo:** medián vzrostl o 6,98 procentního bodu jednoho jádra, relativně o 13,34 %. Medián p95 potvrzení se zhoršil o 16,43 ms a p99 o 19,52 ms. Rozptyl mezi běhy je výrazný, takže tuto sérii nelze použít k oddělení vlivu kodeku, plánování hostitelského stroje a zbytku zátěže. Nejde ani o důkaz optimálního CPU řešení.

První B3 vzorek [02-r1-B](evidence/network-state-20261012/network-responsive-100/02-r1-B/sample-summary.json) měl **593 pohybových zpráv místo 600**, 19,761 Hz, 5,036 MB/s, p95/p99 potvrzení 86,71/115,75 ms a event-loop maximum 93,19 ms. Nižší tok tohoto vzorku není dodatečná kompresní úspora. Poslední B3 vzorek [06-r3-B](evidence/network-state-20261012/network-responsive-100/06-r3-B/sample-summary.json) měl 600 zpráv, 19,991 Hz, CPU 47,97 % a p95 potvrzení 65,44 ms; žádný vzorek nebyl nahrazen. Tato krátká série nevyvolala obnovu nahromaděné fronty a sama nenahrazuje cílenou integraci ani dlouhé společné GPU/síťové měření B3.

## Komponentové důkazy a funkční regrese

[Binární replay kodeku](evidence/network-state-20261012/codec.json) používá skutečný serializer Colyseusu a 120 shodných zpráv včetně tří úplných snímků. Pro 100 pohybujících se hráčů měří **1 199 531 → 211 825 B (−82,341 %)** pouze za zprávy pohybu. Rozdíl proti skutečným −75,14 % je očekávaný: úplná síť měří také přesné autoritativní odpovědi a skutečný průběh hry. Samotné kódování přidává práci: v tomto neizolovaném komponentovém běhu průměr 0,0627 → 0,1054 ms/zprávu a dekódování 0,0698 ms. Tato diagnostika nepředstavuje produkční CPU/FPS test. Syntetická varianta 1000 hráčů je pouze porovnání velikosti dat, nikoli důkaz kapacity.

[Predikce: skutečné `Game.reconcile` a Rapier](evidence/network-state-20261012/prediction-component.txt) porovnaly scénář jedné opravy a šesti potvrzení při střídání pořadí. Varianta s ponechanými starými záznamy provedla vždy **45 kroků světa**, opravená historie **15**, a všech šest konečných fyzikálních stavů bylo shodných. Časy původní/opravované varianty byly 17,329 / 7,233 / 6,332 ms a 3,543 / 2,644 / 2,360 ms; mediány **7,233 → 2,644 ms**. To dokládá odstranění opakované práce v tomto scénáři, ne procento zrychlení celé hry. Test nevytváří další nové vstupy a neprovádí historický rollback okolních pohyblivých kontaktů.

Součástí přijaté sady B1 jsou 9 regresí kodeku, 21 cílených kontrol životního cyklu včetně pěti vln po 100 prošlých identitách a skutečná SDK integrace. Ta ověřila všech 12 hráčů u všech pozorovatelů, přesnost pohybu, nový dekodér, odpojení/návrat, neúčinné požadavky a hranici veřejného HTTP. [Síťová integrace](../verification-evidence/network-state-20261012/network-integration.json), [respawn](../verification-evidence/network-state-20261012/integration-respawn.json), [celková integrace](../verification-evidence/network-state-20261012/integration.json).

## GPU: výchozí reference, mezikrok B2 a B3

Tři následující vzorky patří **výhradně výchozímu A/P5 `4601a8c8…`**, ne B1 ani B2. Celá produkční hra s HUD a panelem nastavení, 30 skutečných relací (29 SDK + browser), šest avatarových předloh, **Intel UHD 630 přes ANGLE D3D11, low, CSS 1920×1080, interně 1476×830**. Počasí je řízený uložený modelový záznam; světelný okamžik je 12. 10. 2026 12:00 Praha / 10:00 UTC. Všechny vzorky mají nulové chyby vykreslení a assetů, bez ambientních vozů/cestujících; pohyb avatarů průběžně měnil jejich detail.

| Výchozí vzorek | Délka / snímky | Průměr FPS | p95 / p99 snímku |
| --- | ---: | ---: | ---: |
| [A-a](evidence/network-state-20261012/gpu-baseline-a.json) | 10,01 s / 285 | 28,4 | 45,5 / 55,3 ms |
| [A-b](evidence/network-state-20261012/gpu-baseline-b.json) | 10,03 s / 302 | 30,1 | 40,6 / 52,8 ms |
| [A-c](evidence/network-state-20261012/gpu-baseline-c.json) | 10,02 s / 307 | 30,6 | 38,7 / 48,7 ms |

[Nezávislé ověření přenosu raw snímků, přepočtu FPS/percentilů a příslušnosti k síťovému intervalu](evidence/network-state-20261012/gpu-baseline-transfer-check.json) prošlo. [Síťová kohorta](evidence/network-state-20261012/gpu-baseline-network.json) udržela 30 hráčů, 0 chyb a 0 resynchronizací. První orientační pokus se zablokovaným obřím diagnostickým výpisem není součástí těchto tří vzorků.

### Produkční B2: srovnatelná konfigurace, neprokázané zrychlení FPS

Všechny tři úplné exporty B2 uvádějí zdroj `3a27efd9…`, stejný GPU renderer, rozlišení, ručně zvolené low, kameru, světelný okamžik a počasí jako výchozí reference. Zachovaly alespoň 30 avatarů v každém měřeném snímku a mají nulové chyby vykreslení i assetů. [Nezávislá kontrola B2](evidence/network-state-20261012/gpu-b2-check.json) z raw snímkových časů přepočítala FPS a percentily, ověřila relevantní zdrojové hashe a příslušnost všech tří desetisekundových intervalů k síťové kohortě. Výsledek této kontroly potvrzuje konzistenci důkazů, nikoli přijetí odezvy B2.

| Mezikrok B2 | Délka / snímky | Průměr FPS | p95 / p99 snímku | Detail avatarů při exportu |
| --- | ---: | ---: | ---: | --- |
| [B2-a](evidence/network-state-20261012/gpu-final-a.json) | 10,01 s / 289 | 28,8 | 45,0 / 52,4 ms | 1 blízký, 29 středních |
| [B2-b](evidence/network-state-20261012/gpu-final-b.json) | 10,01 s / 292 | 29,2 | 44,5 / 52,3 ms | 3 blízcí, 27 středních |
| [B2-c](evidence/network-state-20261012/gpu-final-c.json) | 10,00 s / 318 | 31,7 | 38,9 / 42,7 ms | 1 blízký, 29 středních |

Rozsahy A **28,4–30,6 FPS** a B2 **28,8–31,7 FPS** se překrývají. Pohyb ostatních hráčů měnil detail modelů i počet vykreslovaných trojúhelníků (B2 přibližně 0,933–1,070 milionu za všechny průchody). Tři navazující vzorky proto **nedokazují příčinné zvýšení FPS**. Výsledek neprokazuje 60 FPS ani výkon na samostatné GeForce.

### Dlouhá kohorta B2 odhalila trvalé zpoždění vstupů

[Síťový záznam B2](evidence/network-state-20261012/gpu-final-network.json) pokrývá **11. 10. 23:05:42,292–23:14:19,025 UTC**, tedy 12. 10. 01:05:42,292–01:14:19,025 Praha, celkem **516,733 s**. Po celou dobu obsahoval 30 hráčů v jednom světě, 29 pohybujících se SDK klientů, 0 aplikačních chyb a 0 resynchronizačních flagů. Simulace držela 60 Hz a pohybové zprávy 19,981 Hz. Souhrnný tok **529,337 KB/s** měří pouze 29 SDK klientů; přenos browseru se do tohoto součtu nezapočítává.

Přesto mělo pozorované potvrzení vstupu **medián 212,421 ms, p95 241,415 ms a p99 245,735 ms**, s p95 **14 nepotvrzených příkazů**. Nulový počet chyb a resynchronizací tedy nebyl dostatečnou podmínkou dobré odezvy. Rozbor fronty ukázal, že při produkci i spotřebě jednoho příkazu za tick již vzniklý náskok fronty sám nezmizí. To je důvod následné opravy B3, která omezuje nahromaděné vstupy cílenou obnovou autoritativního stavu. Ověření B3 není výsledkem tohoto B2 měření.

ACK metriky jsou souhrnem 29 SDK klientů, nikoli RTT nebo odezvou klávesy na obraz. Jediný raw monitor obsahuje 10 325 pohybových vzorků a hodnot zpoždění v příkazech, ale pouze 10 324 hodnot stáří potvrzení a žádné samostatné časové značky ACK. Pole `ackAges` se proto nesmí přiřazovat k pohybovým časům stejným indexem; zde z něj nejsou odvozovány percentily stáří ACK pro jednotlivá GPU okna.

### Produkční B3: tři GPU vzorky ve skutečné pětiminutové kohortě

Všechny tři exporty B3 mají zdroj `f908aacdec…`, stejnou kameru, světelný okamžik, počasí, Intel UHD 630, ruční low, CSS 1920×1080 a interní rozlišení 1476×830 jako výchozí reference. Produkční hra obsahovala HUD, panel nastavení a 30 skutečných relací; po celé každé měření zůstalo nejméně 30 avatarů. Chyby vykreslení i assetů jsou **0**. [Nezávislý přepočet B3](evidence/network-state-20261012/gpu-b3-check.json) ověřil všechny snímky, FPS, p95/p99, relevantní zdrojové hashe a úplné časové začlenění do síťového měření.

| Vzorek B3 | Délka / snímky | Průměr FPS | p95 / p99 snímku | Detail avatarů při exportu |
| --- | ---: | ---: | ---: | --- |
| [B3-a](evidence/network-state-20261012/gpu-responsive-a.json) | 10,04 s / 290 | 28,9 | 44,4 / 57,9 ms | 5 blízkých, 25 středních |
| [B3-b](evidence/network-state-20261012/gpu-responsive-b.json) | 10,01 s / 296 | 29,5 | 44,4 / 52,2 ms | 5 blízkých, 25 středních |
| [B3-c](evidence/network-state-20261012/gpu-responsive-c.json) | 10,01 s / 310 | 30,9 | 42,1 / 49,3 ms | 1 blízký, 29 středních |

Rozsah B3 **28,9–30,9 FPS** se překrývá s výchozími **28,4–30,6 FPS**. Měnící se detail avatarů a 0,906–1,061 milionu vykreslených trojúhelníků za všechny průchody omezují přímé porovnání jednotlivých snímků. **Zrychlení GPU ani dosažení 60 FPS se neprokazuje.** První vzorek skončil před následným nahromaděním vstupů; druhý a třetí proběhly po obnovách.

[Síťová kohorta B3](evidence/network-state-20261012/gpu-responsive-network.json) běžela **11. 10. 23:47:38,195–23:52:38,210 UTC** (12. 10. 01:47:38,195–01:52:38,210 Praha), celkem **300,014 s**, až do plánovaného konce. Zachovala 30 hráčů v jednom světě, 29 pohybujících se SDK klientů a 0 aplikačních chyb. Simulace byla **60,001 Hz**, pohybové zprávy **19,989 Hz**. Tok **529,553 KB/s** opět zahrnuje jen 29 SDK klientů, bez browserového přenosu. Souhrn jejich potvrzení měl **medián 49,872 ms, p95 90,490 ms, p99 113,493 ms a p95 5 nepotvrzených příkazů**.

V záznamu je skutečně **31 resynchronizací, všechny s důvodem `input-backlog`**, doručených mezi **23:48:01,007 a 23:48:03,537 UTC**. Obnovu dostalo všech 29 SDK klientů, dva z nich dvakrát; opakované obnovy dodržely sekundové omezení. Dalších **274,673 s** do konce kohorty se žádná další obnova nezapsala. Nebyla vložena umělá internetová porucha: fronta narostla během skutečného místního běhu a mechanismus ji obnovil. Příčina záseku hostitelského stroje tím není izolovaná. Obnova může viditelně opravit polohu, protože zahazuje dříve předpovězené vstupy; není vydávaná za bezchybnou plynulost ani za nulový počet resynchronizací.

Raw monitor jednoho SDK klienta obsahuje **5997 spárovaných `ackTimes`/`ackAges`** a **5998 hodnot `ackLag`**. V celém jeho běhu byl lag medián **3**, p95 **5**, p99 **6**, maximum **10 příkazů**. Přetrvávající lag 14 z B2 se zde neobjevil. Následující rozbor stáří ACK používá skutečné páry ACK, nikoli indexy pohybových paketů:

| Úsek jednoho monitoru | Počet ACK | Medián / p95 / p99 stáří ACK |
| --- | ---: | ---: |
| Před první obnovou, s 1s odstupem | 435 | 46,63 / 67,96 / 71,92 ms |
| Obnovy včetně 1s okrajů | 91 | 74,28 / 167,13 / 243,40 ms |
| Od 1 s po poslední obnově do konce | 5471 | 50,19 / 85,04 / 101,32 ms |
| Posledních 60 s | 1199 | 70,74 / 99,97 / 106,05 ms |

Hranice těchto úseků jsou **časový odhad**: export obsahuje monotónní `ackTimes`, ale nikoli přesný `performance.timeOrigin`. Převod do UTC vychází z nejkratšího pozorovaného místního přenosu mezi serverovým a přijímacím časem; rozptyl pozorovaných offsetů je asi 140 ms a od obnov byla ponechána 1s rezerva. Hodnoty `ackLag` nemají vlastní časové značky. Kvůli jedné dodatečné autoritativní zprávě se nepárují s ACK podle stejného indexu; konzervativní koncový úsek s vynecháním jedné hraniční položky má po obnově p95 **5**, maximum **9 příkazů**. V poslední minutě je medián **5** a p95 **6**, takže odezva nezůstala úplně konstantní. Počet nepotvrzených příkazů navíc zahrnuje přenos a nemusí být totožný s délkou fronty na serveru.

Tento běh spolu s cílenou integrací dokládá obnovu serverové fronty a pokračování společného světa po skutečném nahromadění. SDK ovladač ovšem **nespouští browserové `Game.reconcile` ani jeho reset pořadových čísel**; přijetí těchto autoritativních zpráv SDK není přímý test vynucené opravy browserové predikce. Souhrnné ACK metriky 29 klientů nelze přepočítat pouze z exportu jediného monitoru a výsledek nezaručuje stejnou odezvu na veřejném internetu.

## Hranice výsledku

Ověřena je výrazná úspora aplikačního přenosu při 100 lokálních relacích, odstranění konkrétního opakovaného přehrávání predikce a obnova serverové fronty po nahromadění vstupů v B3. Krátká série B3 zachovala úsporu 75,11 %, ale měla vyšší mediány CPU serveru a stáří potvrzení než její výchozí série. Pětiminutová produkční kohorta zachovala společný svět a po 31 cílených obnovách již nevykázala přetrvávající lag 14 v raw monitoru; korekce mohou být pro hráče viditelné. Produkční FPS B3 jsou změřené na Intel UHD 630, zrychlení proti výchozí verzi však není prokázané. Veřejný internet, vyšší kapacita, celkové CPU všech klientů a přímá vynucená oprava browserové predikce v tomto SDK scénáři nejsou změřené. Všichni současně se pohybující hráči se stále rozesílají všem; celkový tok proto i po zmenšení paketů roste kvadraticky. Jeden proces má konečnou kapacitu a přidání další instance samo nesdílí jeho fyziku. Žádný horší vzorek ani následné opakování není v tomto závěru skryté.
