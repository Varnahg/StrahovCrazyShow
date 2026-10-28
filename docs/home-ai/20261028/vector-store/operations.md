# PostgreSQL / pgvector: import a provoz

Implementace podle `research/vector-contract.md` používá PostgreSQL jako jedinou autoritu aktuální publikační revize. JSON soubory jsou administrativní vstupy, ne fallback při nedostupné DB. Model odpovědi je nezávislý na neměnném embedding profilu.

## Vstupy a příkazy

`RAG_DATABASE_URL` se předává bezpečně v prostředí, nikoli v argumentu/logu. Pro import navíc `OPENAI_API_KEY`, volitelné `OPENAI_EMBEDDING_MODEL` a `OPENAI_EMBEDDING_DIMENSIONS`. CLI nečte žádný secret soubor a neukládá konfiguraci. Příkazy z kořene projektu:

```sh
node --import tsx scripts/rag-import.ts migrate
node --import tsx scripts/rag-import.ts status
node --import tsx scripts/rag-import.ts import --max-inputs 45 --max-bytes 65536
```

Číselné limity jsou explicitní rozpočet jedné importní operace, nikoli odhad fakturovaných tokenů/ceny. Import si skutečně účtované usage převezme od poskytovatele. Při nezměněném nebo metadata-only importu lze použít `--max-inputs 0 --max-bytes 0`. Vyžaduje se úplná sada tří current a dvou archive JSON; chybějící/invalidní vstup není smazání publikovaných znalostí.

`migrate` spouští schema SQL v jedné transakci pod advisory zámkem. `status` vrací pouze aktivní revision ID a veřejný embedding profil. `import` vypíše souhrn počtů, usage a hashů; žádné dokumentové texty, DB URL, tokeny nebo vektory. Při chybě se vypisuje pevný bezpečný kód, ne raw exception.

## Práva a logování

DB patří do samostatného persistentního úložiště. Migration owner je administrativní role. Hra používá odlišný účet s pouze čtecími právy; CLI import odlišný účet s omezenými zápisy. Role a hesla spravuje provozovatel mimo Git. Migrace nevytváří globální cluster roles, aby izolované schema testy neměnily jiné role.

Na **samostatné provozní DB** po migraci může správce vytvořit dvě NOLOGIN skupiny a přiřadit do nich své login účty. Níže není žádné heslo; existující role se nepřepisují. Příkazy pro `public` jsou pouze pro produkční RAG schéma, ne pro testovací schema s náhodným názvem:

```sql
CREATE ROLE strahov_rag_reader NOLOGIN;
CREATE ROLE strahov_rag_ingester NOLOGIN;

GRANT USAGE ON SCHEMA public TO strahov_rag_reader, strahov_rag_ingester;
GRANT SELECT ON rag_schema_version,rag_profiles,rag_embedding_cache,
  rag_source_versions,rag_revisions,rag_revision_sources,rag_revision_chunks,rag_heads
  TO strahov_rag_reader;

GRANT SELECT ON rag_schema_version,rag_profiles,rag_embedding_cache,
  rag_source_versions,rag_revisions,rag_revision_sources,rag_revision_chunks,
  rag_heads,rag_embedding_attempts TO strahov_rag_ingester;
GRANT INSERT ON rag_profiles,rag_embedding_cache,rag_source_versions,
  rag_revisions,rag_revision_sources,rag_revision_chunks,rag_heads,rag_embedding_attempts
  TO strahov_rag_ingester;
GRANT UPDATE(state,finished_at,error_code) ON rag_revisions TO strahov_rag_ingester;
GRANT UPDATE(state,finished_at,prompt_tokens,total_tokens,error_code)
  ON rag_embedding_attempts TO strahov_rag_ingester;
GRANT UPDATE(revision_id,updated_at) ON rag_heads TO strahov_rag_ingester;
GRANT EXECUTE ON FUNCTION rag_reject_mutation(),rag_guard_revision(),rag_guard_revision_member()
  TO strahov_rag_ingester;
```

Skutečné login role dostanou členství v příslušné skupině přes administrátora, bez vlastnictví tabulek, `CREATE`, `SUPERUSER` či `BYPASSRLS`. Import nemá žádné DELETE ani UPDATE profilů/cache/source versions. DB triggery chrání také published revize a jejich členy. RAG tabulky/funkce mají po migraci explicitní REVOKE vůči PUBLIC. Reader nepotřebuje přístup k tabulce importních pokusů.

PostgreSQL musí mít **obě** nastavení `log_parameter_max_length=0` a `log_parameter_max_length_on_error=0`. Pool ověřuje hodnoty bez parametrů před jakýmkoli přenosem vektoru a při nevyhovujícím nastavení odmítne práci. Aplikace neloguje SQL parametry/raw chyby. Protokol používá bind parametry; JSON string vektoru se předává jako `$1::vector`, nikdy jako text vlepený do SQL.

## Publikace a obnova

Profil je SHA-256 tuple provider/model/dimensions/inputVersion. Embeddingový vstup je přesné `JSON.stringify([title, sourceLocator, text])`; cache klíč je profil + SHA-256 těchto UTF-8 bytů. Změna kontrolního data/URL/licence nezmění vstup, změna titulku nebo textu ano. Cache navíc porovnává přesný text a validuje uložený vektor.

Importer drží jediný session advisory lock na dedikovaném clientu. Během OpenAI requestu není otevřená SQL transakce. Každá dokončená dávka se samostatně trvale uloží do cache a označí complete. Teprve úplné source/chunk vazby, ready revize a head se zveřejní v jediné krátké transakci. Místní soubory se poté v runtime nečtou. Archive metadata mají revizní vazbu, ale nemají embedding/current chunk vazby.

Při přerušení se starý head nemění. Persistovaný inflight pokus se při příštím importu stejného profilu označí uncertain, a to napříč revizemi: změna metadata tedy nepřekryje nejasný výsledek. Dokončená cache se znovu neplatí. Pouze explicitní import s `--retry-uncertain` a novým rozpočtem může opakovat chybějící nejasné vstupy. Nelze garantovat exactly-once náklad mezi odpovědí API a uložením do DB bez poskytovatelem garantované idempotence; právě tuto mezeru uncertain stav přiznává.

Žádné periodické aktualizace ani mazání starých revizí nejsou zapnuté. Záloha má zahrnout PostgreSQL data i konfiguraci profilu/verzi aplikace; cache a revize jsou v DB, ne v paměti procesu. Ověření obnovy zálohy patří provozovateli při nasazení. Přepnutí na jiný model/dimenze vytvoří jiný profil a úplnou revizi, staré vektory se nemíchají.

## Runtime a testovací hranice

Runtime capture vybírá DB head/profile. Search používá skutečné `<=>` a filtry source current/public/času/profile ještě před vrácením evidence. Výsledek z DB znovu ověřuje v2 metadata, obsahový hash, source-version hash, přesný embedding vstup a SQL datumové sloupce. Source data z DB se nepovažují za bezpodmínečně důvěryhodná. Žádná query text/vector tabulka neexistuje. Query vektor žije jen v paměti operace a jako bind parametr.

`assertCurrent` ověřuje head i všechny interní source version dependencies po generování/replay. Jiná revize či expirace je false; porušené schéma/data a nedostupnost jsou chyby, nikoli prázdné výsledky. Pool má omezený počet spojení, connection/statement/query timeout. Abort zničí vlastní rozpracované spojení, do poolu se nevrací aktivní query ani držený zámek. Close ruší vlastní práci a ukončí pool.

Checkout client má vlastní dočasný `error` listener: pinovaný pg-pool 3.14.0 totiž při checkoutu odstraní poolový idle listener. Síťová chyba během query i čekání na embedding vyřadí přesné vlastní spojení a vrátí bezpečnou chybu; nesmí se stát neobslouženou událostí shazující Node proces. Při release se listener odstraní, takže se nehromadí při opakovaném použití poolu. Toto bylo ověřeno i ukončením přesného vlastního DB backendu v izolovaném testu.

CPU testy nepoužívají DB ani OpenAI. Skutečný test se spouští jen s explicitním `RAG_TEST_DATABASE_URL` do DB se jménem končícím `_test` (např. `strahov_rag_test`):

```sh
node --import tsx --test tests/rag-vector-db.test.ts
```

Test si vytvoří unikátní `rag_test_<uuid>` schema. Odstraní pouze schema, jehož vytvoření sám dokončil a jehož jméno/vlastníka ověří; nemaže databázi, public schema ani cizí tabulky. Vector extension může vytvořit pouze v této explicitní test DB a neodstraňuje ji. Embedding transport je i zde fake; živou OpenAI kvalitu/usage musí zvlášť doložit koordinátor.

## Volba a doložené ověření

Pro nynější malý corpus je použit přesný cosine scan bez ANN indexu. HNSW či IVFFlat by přidaly konfiguraci, paměť a riziko omezení kandidátů při filtrování; zatím není naměřená potřeba tohoto kompromisu. Nejde o tvrzení optimálnosti při velkém počtu dokumentů. PostgreSQL dovoluje cache, zdrojové verze a publikační head měnit ve stejné transakci. Alternativa s externím vektorovým úložištěm by vyžadovala další koordinační protokol publikace; textové hledání nesplňuje požadavek na embeddingy.

Jedna transakce přes HTTP by držela SQL zdroje během externího čekání a po chybě zahodila i úspěšně zaplacené dávky. Proto jsou dávky trvalé samostatně a poslední krátká transakce publikuje celý snapshot. Session advisory lock brání souběžnému dvojímu importu a je automaticky odstraněn při zániku vlastního spojení.

Dne 28. 10. 2026: cílené CPU testy store/import 16/16 PASS a scoped strict TypeScript PASS. Koordinátor spustil připravený skutečný test na PostgreSQL 17.11 s pgvector 0.8.7 v oddělené `strahov_rag_test`: 11/11 PASS, 0 skip, exit 0 (10 scénářů plus parent). Test zahrnuje exact cosine, nulové opakované/metadata-only náklady, změnu jednoho vstupu, odstranění, časové filtry, uchování starého head po chybě, přežití cache po reconnectu, nejisté pokusy napříč změnou metadat, souběh, immutabilitu, neúplnou publikaci, špatné dimenze, oddělení profilů, abort a disconnect. Fake embedding provider zde není důkazem kvality či dostupnosti živého OpenAI; tyto výsledky doplní kořenové ověření. Logy a manifest testovaných souborů jsou uvedeny v handoffu tasku.

Primární podklady: [pgvector](https://github.com/pgvector/pgvector), [node-postgres transakce](https://node-postgres.com/features/transactions), [parametrizované dotazy](https://node-postgres.com/features/queries), [PostgreSQL row-lock privileges](https://www.postgresql.org/docs/17/sql-select.html), [PostgreSQL advisory locks](https://www.postgresql.org/docs/current/explicit-locking.html#ADVISORY-LOCKS), [bind parameter logging](https://www.postgresql.org/docs/current/runtime-config-logging.html). Čtecí role nemá row-lock příkazy; omezený UPDATE grant importní role pokrývá také její `FOR UPDATE`/trigger `FOR SHARE`.
