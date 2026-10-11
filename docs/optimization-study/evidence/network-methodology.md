# Síťové měření a jeho omezení

Měřeno 10. 10. 2026 proti zmrazenému zdroji v `.cache/optimization-study-snapshot`. Seznam SHA-256 souborů je uložen v `network-server-timers.json`. Produkční implementace nebyla upravována. Server a boti běželi na stejném Windows počítači pod Node.js 24.19.0, komunikace vedla přes loopback. Nejde o měření běžného internetového připojení, browserového FPS ani kapacity pro 100 hráčů.

## Reprodukce

Z kořenové složky repozitáře spusťte v prvním terminálu vlastní server; port 2568 musí být volný:

```powershell
node --import tsx docs/optimization-study/evidence/network-server-probe.mts .cache/optimization-study-snapshot 2568 docs/optimization-study/evidence/network-server-timers.json 90
```

Po zprávě o připraveném serveru spusťte ve druhém terminálu:

```powershell
node --import tsx docs/optimization-study/evidence/network-benchmark.mts http://127.0.0.1:2568 docs/optimization-study/evidence/network-benchmark.json
```

Boti postupně tvoří skupiny 1, 8 a 16 hráčů. Po sekundě stabilizace se každá skupina měří šest sekund. Boti pouze chodí střídavě doleva a doprava, neodesílají chat ani nemění události. Všechny jejich relace se nakonec odpojí. Server se ukončí sám po zadaném čase; nezastavuje jiný proces. Skripty odmítají obvyklý vývojový port 2567 a benchmark vyžaduje prázdný server. Test nemá běžet proti sdílenému nebo produkčnímu světu.

Instrumentace obaluje pouze serverové `setInterval` se zadaným intervalem `1000/30`; měří skutečné časy vyvolání a délku callbacku. Nemění interval, herní čas ani fyziku. Délka callbacku zahrnuje `clock.tick()` Colyseusu, případnou odesílací práci spuštěnou z hodin a vlastní simulaci. Souhrn serveru zahrnuje celý 75sekundový původní běh, tedy startup, klidové úseky i fáze s boty. Nelze jej interpretovat jako izolovaný CPU čas fyziky při 16 hráčích.

## Co bylo naměřeno

| Hráči | Motion/s | Medián mezery / p95 | Payload snapshotu, medián | Příjem jednoho klienta | Součet příjmu všech klientů |
|---|---:|---:|---:|---:|---:|
| 1 | 14,989 | 47,418 / 93,564 ms | 103 B | 1,546 kB/s | 1,546 kB/s |
| 8 | 15,142 | 47,329 / 93,696 ms | 762 B | 11,539 kB/s | 92,310 kB/s |
| 16 | 14,995 | 48,453 / 94,330 ms | 1 484 B | 22,490 kB/s | 359,836 kB/s |

Jednotka kB je desetinná. Počítány jsou binární aplikační zprávy Colyseusu z WebSocket `message` eventu. Počty **nezahrnují** rámce WebSocket, TCP/IP, TLS ani další provoz. Tabulka sleduje pouze `motion`, nikoli první připojení, profily, sociální údaje a chat. Velikost čísel a identifikátorů ovlivňuje kódování.

Server měl požadovaný interval 33,333 ms, ale reálně 21,6895 callbacku/s. Medián mezery byl 46,3868 ms, p95 47,6394 ms a maximum 110,8932 ms. Délka celého callbacku: medián 0,7629 ms, p95 11,0344 ms, maximum 108,9686 ms. Zjištění potvrzuje problém s časováním v tomto prostředí; neurčuje samo o sobě jeho přesnou příčinu v OS/runtime a nezobecňuje na všechny Windows nebo produkční Linux.

Současný server na callback provede právě jeden fyzikální krok s dt 1/30, takže při tomto tempu posouvá simulovaný čas přibližně o 0,723 sekundy na sekundu skutečného času. To je odvození z naměřeného tempa a zdrojového kódu, nikoli samostatné měření rychlosti chůze. Klientův akumulátor pro renderové snímky tento serverový problém nekompenzuje.

Také časovač botů požadoval 30 odeslání/s a dosáhl 21,16–21,65/s. Výsledek proto neprokazuje kapacitu serveru při plném vstupu 30 Hz na hráče. Browser posílá vstupy z vlastního akumulátoru; headless timer není přesnou náhradou skutečného browserového vstupu.

Medián `latestAckSampleAge` byl 93,1–94,1 ms. Je to doba od odeslání konkrétního nejnovějšího potvrzeného vstupu do jeho pozorování v přijatém snapshotu, **není to ping RTT**. Protokol navíc používá jen poslední vstup a ack není dokladem replaye všech předchozích vstupů. Z kódu nainstalovaného Colyseusu plyne, že `clock.tick()` běží před simulačním callbackem; odeslání `motion` z těchto hodin proto může předcházet aktualizaci fyziky daného callbacku. Tato vlastnost spolu s rytmem časovačů vysvětluje část naměřeného čekání. Přesný rozpad latence by vyžadoval serverové časové značky v každé zprávě.

## Projekce pro 100 hráčů

Při zachování celoplošných snapshotů a přibližně 93 B na hráče je aplikační tok na klienta `100 × 15 × 93 ≈ 139 500 B/s`; součet odesílání serveru přibližně 13,95 MB/s (111,6 Mbit/s), ještě před transportní režií. Toto je **projekce**, ne naměřená kapacita 100 hráčů. Počet adresátů i velikost každé zprávy rostou s počtem hráčů: celkový tok je O(N²).

Pro rozptýlených 100 hráčů pomůže prostorový výběr příjemců/entity (AOI), rozdílná frekvence blízkých a vzdálených objektů, oddělení stálých profilů od pohybu a delta/kvantizované stavy. Pro 100 hráčů na jednom náměstí samotné AOI téměř nepomůže: je nutné otestovat i síťovou frekvenci, vizuální LOD davu, vzdálené animace a politiku vzájemných kolizí. Konečný důkaz cíle 100 hráčů vyžaduje samostatný test při plné vstupní frekvenci, renderové testy na cílovém notebooku a internetové scénáře s latencí a výpadky.

## Předběžný test původního vývojového serveru

Před zjištěním souběžných úprav repozitáře proběhl autorizovaný `pnpm test:integration` na existujícím serveru port 2567: PASS. Tento standardní test zkouší i chat, souhlas, blokování, vlastnictví událostí, obnovení relace a počasí; vytvořil demonstrační událost `Vlastní setkání`. Nejde o nezávislý důkaz výkonu nebo odolnosti při jitteru. Předběžný loopback test na tomto serveru dal obdobné hodnoty: 1/8/16 hráčů ≈ 1,545 / 11,366 / 22,708 kB/s na klienta, celkem při 16 hráčích ≈ 363,326 kB/s. Hlavním výsledkem jsou výše uvedené oddělené testy proti zmrazenému zdroji; předběžná čísla se k nim nepřičítají.
