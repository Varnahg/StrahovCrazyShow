# Řízené dokončení zátěžového měření

`scripts/performance-network.ts` přijímá nepovinný argument `STOP_FILE` za očekávaným celkovým počtem hráčů. Po zahřátí zaznamenává skutečná data do dosažení časového limitu nebo zjištění tohoto souboru. Kontrola souboru a čekání mají interval nejvýše 200 ms; zatížení procesu může skutečné pozorování zpozdit. Pak standardně zapíše report a odpojí všechny své relace. Existující stop soubor způsobí okamžité ukončení zaznamenávání, proto každý běh potřebuje novou cestu.

Report obsahuje skutečné `startedAt`, `endedAt`, `durationMs`, zvolený `requestedDurationMs` a `stopReason` (`deadline` / `stop-file`). Čas ani počty hráčů se neupravují. Kratší ukončené měření se nevydává za původně požadovanou dobu. Zpráva `recording-started` označuje začátek zaznamenávání po kontrole autentizované kohorty.

`scripts/performance-diverse.mjs` může přes proměnnou `STRAHOV_PERF_HARNESS_SOURCE` spustit externí harness mimo neměnný snapshot. Hodnota musí být absolutní cesta k jeho souboru. Všechny argumenty, včetně `STOP_FILE`, předává dál ve stejném pořadí.

Před prvním síťovým přihlášením wrapper rozebere skutečné importy harnessu a ověří SHA-256 `DEFAULT_PROFILE`, `canonicalInput`, `PROTOCOL_VERSION`, předloh avatarů a jejich importu typů proti manifestu i souborům vybraného snapshotu. Rozdíl znamená chybu. Report hry nadále používá její `sourceSnapshotId`; samostatná `harnessProvenance` obsahuje cesty a SHA-256 skutečného harnessu, wrapperu a šest ověřených importů. Síťový harness dodatečně ověřuje svůj vlastní hash vůči této provenienci. Stejná provenience je v reportu vydaných profilů.

Příklad pořadí argumentů:

```text
node --import tsx scripts/performance-diverse.mjs SNAPSHOT ENDPOINT COUNT 600 crowded OUTPUT WARMUP TOTAL_POPULATION ABSOLUTE_STOP_FILE
```

Po dokončení všech GPU vzorků vytvořit `ABSOLUTE_STOP_FILE` a vyčkat na výstup `disconnected`. Samostatný síťový report následně dovolí ověřit, že jeho interval skutečně pokryl intervaly GPU měření a že kohorta během nich měla požadovaný počet relací.

## Cílené ověření

Skutečný krátký SDK běh na odděleném portu 2592 proti nezměněnému snapshotu H `f7741a88638c05ab2bdc52c443fdc8382d31c0dc6d1dd24e1337ce1d94cfbb14`:

- Dvě přihlášené relace, minimum i maximum skutečné přítomnosti 2, 17 přijatých zpráv o pohybu, dvě vydané úplné předlohy avatarů.
- Požadovaných 10 000 ms; skutečných **823,893 ms**. Soubor byl zjištěn **158 ms** po jeho vytvoření. `stopReason=stop-file`.
- Nula resynchronizací, žádné zachycené chyby, po ukončení nula otevřených autentizovaných spojení.
- Šest importů shodných se snapshotem. Záměrně odlišný skutečně importovaný `netcode.ts` byl odmítnut před vydáním relací.
- Kontrolované zdroje a manifest snapshotu H měly před i po běhu totožné hashe. Měření ani utility snapshot H neměnily. Oddělený server byl ukončen.

Ověřený harness SHA-256: `8e98ef8b8c5f3b322d485ca6355e855bf23055862d678a77474a85b98c825a16`. Wrapper: `4ed130702245dcebfb5934744cc27a425728399e68b5a06b28f115baa5da5d97`.

Surové výstupy, přesné kopie obou utilit a úplné zachycené statistiky jsou v `evidence/harness-stop-20261011/`. Toto je důkaz korektního ukončení a provenience síťového testu, nikoliv měření FPS nebo GPU.
