# Převzetí úložiště přepisů Crazy Typky

- Vlastník `chat-monitor-20261106-store`, příjemce koordinátor monitoringu. Kanonický checkout `C:/Users/rezac/Documents/GitHub/StrahovCrazyShow`, větev `main`, základ `20fb1d104f0fcc2860e6ea88d868b4c96ad3d303`.
- Rezervace `chat-monitor-store-20261106`. Změna patří do `server/chat-monitor-store.ts`, `server/chat-monitor-schema.sql`, `tests/chat-monitor-store.test.ts` a tohoto předání.

## Plán rozhodnutí před změnou

1. Problém. Server dokončuje výměny v paměti a při replayi vrací stejný výsledek. Přehled potřebuje soukromé trvalé uložení omezené na oprávněné nové relace.
2. Mechanismus. SQL unikátní klíč konverzace a pořadí zajistí idempotentní INSERT. Společná doba expirace závisí na první úspěšně uložené výměně. Dotazy pro správce filtrují aktivní okno nezávisle na úklidu.
3. Zkoušená změna. Oddělené PostgreSQL schéma v soukromé databázi, omezená fronta s časovými limity a metadaty o ztrátách, jeden SQL příkaz pro audit a vydání detailu. SQL migrace je explicitní.
4. Hlavní metrika. Po dvojím vložení stejné výměny je v detailu jeden úplný pár; při odpojení databáze zůstane zápis vůči chatu neblokující a roste počitadlo ztrát.
5. Správnost. Datum 31. května plus tři kalendářní měsíce je 31. srpna a datum 31. ledna plus tři měsíce je 30. dubna, ve stejném čase UTC. Další výměna lhůtu neposouvá. Do SQL parametrů ani uložené struktury nepatří IP adresa, herní profil, token relace nebo interní chybové zprávy poskytovatele.
6. Přijetí. Cílené testy ověří kapacitu, výpadek, sanitizaci chyb a ukončení. Izolované PostgreSQL ověří skutečnou migraci, idempotenci, přesné znění, řazení, audit a expiraci. Drahé ověření a skutečný databázový proces spouští koordinátor.

Zápis do logů by komplikoval omezení přístupu, deduplikaci a zaručené filtrování podle lhůty. Přímý databázový zápis v chatové odpovědi by rozšířil dopad latence a výpadků PostgreSQL. Oddělený postup využívá existující balíček `pg`, přidává omezený paměťový rozpočet a umožňuje měřit neuložené výměny. Vhodné primární podklady jsou [PostgreSQL INSERT](https://www.postgresql.org/docs/17/sql-insert.html), [výpočet kalendářních intervalů](https://www.postgresql.org/docs/17/functions-datetime.html), [databázové logování](https://www.postgresql.org/docs/17/runtime-config-logging.html) a [parametrizované dotazy node-postgres](https://node-postgres.com/features/queries).

## Výsledek a ověření

- `createChatMonitorStore` nabízí synchronní vložení do fronty se 128 čekajícími položkami a jedním aktivním zápisem, seznam po 50 záznamech, auditované čtení detailu, provozní počitadlo ztrát a ukončení. Serializace začíná až po předání řízení. Přepis jako JSON v `bytea` zachovává i hraniční Unicode bez rozšíření sloupců s identitou. SQL zachovává stejnou dobu expirace u celé konverzace. Čištění probíhá při startu a každou minutu, včetně režimu bez sběru s dostupnou správou.
- Počitadlo je za běh procesu. Tvrdé ukončení může ztratit neodeslané položky v paměti. Požadavky na zápis a dotazy správce používají omezené časy PostgreSQL i ovladače. Korektní shutdown dá frontě dvě sekundy na doběh, uvolní čekající položky a vyčká na aktuální dotaz před uzavřením poolu. Chyby ovladače se k volajícímu dostávají ve formě pevného kódu.
- Explicitní schéma spustit jako vlastník v oddělené databázi. Pro runtime roli nastavit `log_parameter_max_length=0`, `log_parameter_max_length_on_error=0` a `log_error_verbosity=terse`. Před prvním SQL bindem každé připojení ověří tyto parametry a stav volitelného `pgaudit.log_parameter`.
- Runtime role potřebuje `USAGE` na schématu. Na `conversations` vyžaduje `SELECT`, `INSERT`, `DELETE` a `UPDATE(first_seen_at)`. Na `exchanges` vyžaduje `SELECT` a `INSERT`. Na `reads` vyžaduje `INSERT` a `SELECT(conversation_id)` pro `RETURNING`. RAG role se schématem nesdílí oprávnění.
- Lokální cílený `node --import tsx --test tests/chat-monitor-store.test.ts` skončil kódem 0, dva testy prošly a SQL test byl při tomto prvním běhu přeskočen. Samostatný strict TypeScript check obou souborů se shodnými relevantními volbami projektu skončil kódem 0.
- Koordinátor v následném běhu ověřil skutečný PostgreSQL 17 v izolovaném pgvector kontejneru. Běh skončil 157/157 bez přeskočení a zahrnul zápis, kurzor, audit, retenci i zákaz bindu při nezabezpečeném nastavení. Důkaz je `.cache/chat-monitor-20261106/targeted.log`, řádek 10 a závěrečný souhrn.
- SQL test se povolí pouze pro `CHAT_MONITOR_TEST_DATABASE_URL` s loopback hostem a databází `chat_monitor_test`. Po kontrole názvu a absence původního schématu aplikuje migraci a po kontrole vlastní schéma odstraní.
- Otisky SHA-256 převzatých implementačních souborů jsou `305e2b39fd49fd27f0c66a103247a41a97871a243580fdb2ad679cb3f4e9810a` pro store, `cd71b557b1ad1420be8693d41ec99814b205d6b01c3613d5546a7e39edd61653` pro schéma a `326333b19bcc3bff9c959a8d5665434669c2bac70d6166cb16f4b4ed3b3124ab` pro test.
- Při provozním vypnutí sběru ponechat nakonfigurovaný monitor, aby běžel úklid již zapsaných výměn. Při odstavení celého monitoru je nutný ekvivalentní SQL úklid. Retenci provozovatel musí dodržet také u případných obnovitelných záloh.
- Cizí rozpracované změny zůstaly mimo rozsah. Podagent nespouštěl dlouhožijící proces, port, build ani integraci. Součástí předání jsou pouze čtyři výše uvedené soubory.
