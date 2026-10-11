# Reality Pack G — audit připravený, dosud neměřený

Finální zdroj ještě nebyl zmrazen. **Zatím neexistuje platný G výsledek FPS ani síťového zátěžového testu.** Výsledky D a úspěšné kontroly F se na G nepřenášejí.

## Připravený postup

1. Zaznamenat manifest nového G snapshotu včetně testů a assetů; převzít skutečné výsledky sekvenčních testů, buildu a izolované integrace tohoto snapshotu.
2. Po potvrzení připravenosti spustit z jeho kopie produkční preview 4176 a samostatný multiplayer server 2571. Hlavní vývojový server se zátěžově netestuje.
3. Ovládající agent připojí jediný skutečný browser, zaznamená GPU renderer, CSS i interní rozlišení, kameru, osvětlení, počasí a nastavení kvality. Nejdříve se pořídí srovnávací vzorky jediného účastníka.
4. Na pokyn spustit 29 skutečných Colyseus relací se šesti úplnými fiktivními předlohami. S browserem musí všechny autentizované motion streamy potvrzovat 30 účastníků jednoho světa. Používají se běžné session API a protocol importovaný ze stejného zmrazeného zdroje.
5. Po ustálení zaznamenat tři alespoň desetisekundové browserové vzorky a 120–180 sekund síťových vstupů, skutečné ticky, potvrzení, resynchronizace, pohyb a serverové CPU. Při měření nepoběží build ani testy.
6. Uchovat raw výsledky, skutečně vydané profily, screenshoty a manifest. Po dokončení odpojit boty a zaznamenat konečný stav.

Průměr FPS se nesmí zprůměrovat mezi opakováními tak, aby zakryl neúspěšný vzorek. Původní minimální cíl 30 FPS s p95 ≤ 33,3 ms se posoudí odděleně od nového cíle adaptace 60 FPS. Přesná kvalita, render scale a obsah záběru patří ke každému vzorku; pozastavení adaptace během desetisekundového benchmarku zachovává jeho podmínky.

## Podmínky a omezení

Skutečný WebGL adaptér určí až browserový JSON. Instalovaná GTX 1060 ani požadavek `high-performance` nepotvrzují její použití. [Read-only GPU a monitorová diagnostika](gpu-selection.md) při předchozí kontrole zjistila aktivní Intel výstup 1920 × 1080 / 60 Hz; 144 FPS na něm nebylo ověřeno. Inventář WMI se nepoužívá jako důkaz aktivního displeje.

Síťový test poběží na Windows loopbacku bez emulace internetové latence či ztrát. ACK age není ping ani input-to-photon. Zaznamenané CPU patří procesu serveru vůči jednomu jádru; nezahrnuje proces browseru ani botů. Naměřené bajty jsou serializované aplikační zprávy bez síťových hlaviček.
