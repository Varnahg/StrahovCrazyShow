# KEY-67: v3 store a publikace — předání

Autor `rag-store-implement-01a17e9d`, příjemce `/root`. Cwd `C:/Users/rezac/.codex/worktrees/clean-home-crazy-typka/StrahovCrazyShow`; výchozí HEAD při implementaci `a5ac67d1`, při předání `a0c32275fbc7fbf51204f92d3ee19b8ca9986605` po souběžných vlastních commitech koordinátora. Nic jsem nestagoval ani necommitoval. Foundation/Python/PDF/runtime/UI WIP zůstal nedotčený.

## Soubory a chování

- `server/rag-vector-store.ts`: zachované legacy API; nové `captureSearch/searchSnapshot/assertSnapshot`, composite snapshot a v3 importní session. Cache/attempt logika je společná; cache se čte v dávkách512 přes norm/dimensions, bez přenosu celých vektorů.
- `server/rag-migrations/002-documents.sql`: additivní v3 tabulky a heads, pořadí bloků/chunků přes ordinal, immutable obsah, jednosměrné operational `sealed`, úplnost a trvalá legacy suppression/explicitní rollback. Původní `server/rag-schema.sql` je byte-identický; SHA256 `a6d91ea9085a3c6d14a7f83e1121a7dad10a5b854c3573d99c94a61d23b1a8d5`.
- `server/rag-ingest.ts`: změnový import celých dokumentů a sdílený embedding algoritmus. V1 importer výslovně odmítá v2 profil; žádné přeznačení cache.
- `scripts/rag-import.ts`: bounded `import-documents --input FILE --max-inputs N --max-bytes N`, `status --scope current|archive [--as-of ISO]`, explicitní role přes migrate flags nebo `RAG_READER_ROLE`/`RAG_INGESTER_ROLE`.
- `tests/rag-vector-store.test.ts`, `tests/rag-ingest.test.ts`, `tests/rag-vector-db.test.ts`: komponentové regrese a připravená skutečná DB přejímka.

Current view spojuje pouze legacy `public` a `public-documents`; archive čte pouze `public-archive`. Query vector se sdílí jen pro stejnou provider/model/dimensions. Archive `asOf` vyžaduje obě doložené hranice účinnosti, zatímco administrativní freshness používá `now`. Nové view nepřijímá topic filtr; legacy API jej zachovává.

Suppression uchovává přesný původní version binding a trvá přes logické `legacySourceId`, i když náhrada expirovala/byla retired nebo vznikla nová legacy metadata verze. Obnova musí jmenovat přesnou aktuální legacy verzi. Stale rollback, nekompatibilní model space a neplatné přechody se odmítají před embeddingem; publish znovu ověřuje base snapshot. Nový promotion musí mít úplný aktuálně použitelný v3 target, přičemž SQL samostatně vynucuje kompletní/sealed/current target stejné authority. Staré řádky a vektory se nemažou.

## Rozhraní pro další krok

`openRagDocumentImportSession(options)` / injectable `...WithPool` drží dosavadní importní advisory lock. `context(collection)` vrací snapshot, úplný publikovaný v3 dataset, suppression a aktuální legacy verze. `prepareDocumentChanges(context, changes, profile, now?)` vrací immutable plan.

`changes = { collection, expectedSnapshotId:string|null, upserts:KnowledgeDocumentBundleV3[], retireSourceVersionIds?, legacyReplacements?:[{legacySourceVersionId,documentSourceVersionId}], restoreLegacySourceVersionIds? }`.

`parseDocumentChangeSet(unknown)` ověří a zkopíruje vstup. `importDocumentChanges(options)` nebo `importPreparedDocumentCorpus(plan,session,options)` použije společný cache/uncertain/attempt algoritmus. Current upsert nahradí celou starší v3 verzi stejného source ID; archive přidává verze. Přesun do archivu není implicitní. Job orchestrace má uchovat prepared plan pro obnovu; stale změnová sada není automaticky rebased.

## Skutečné ověření

- Přímé Node/tsx nad dvěma unit soubory: **32 PASS, 0 FAIL, 0 SKIP**, poslední runner přibližně4,55s. Log `.cache/rag-auto-store-20261028/tests-final.log`.
- Scoped strict TypeScript včetně CLI a připraveného DB testu: **exit0**, `.cache/rag-auto-store-20261028/types-final.log`.
- Whitespace check prošel s `cr-at-eol` podle byte-preserving `.gitattributes`. Legacy bootstrap se neměnil.
- Nezávislé SQL review našlo a po opravě uzavřelo2P2: omezenému ingesteru chybělo UPDATE právo pro FOR SHARE a publikace neserializovala přidání parts. Řešení používá pouze `UPDATE(sealed)`, kompletní jednosměrné seal a explicitní RC zápisy. Runtime RR READ ONLY nebere row locks. Primární podklady: [PG17 SELECT](https://www.postgresql.org/docs/17/sql-select.html), [locking](https://www.postgresql.org/docs/17/explicit-locking.html). Další doložený nález re-review nenašlo.

Historické mezikroky zůstaly v logách: první TS měl2narrowing chyby; po seal změně falešný SQL transport zachytil `current_setting` uvnitř DDL jako samostatný logging SELECT (3testy), a DB fixture potřebovala explicitní doménové typy. Vše opravené před uvedeným finálním během.

## Co musí ještě provést koordinátor

**Skutečná DB/migrace ani celý build/integrace se v tomto scope nespouštěly.** Připravený opt-in DB test vyžaduje explicitní `*_test` databázi a administrační oprávnění pro vlastní UUID schema a dočasné NOLOGIN role. Teardown ověřuje vlastní schema a role OID. Zahrnuje upgrade naplněné v1 bez ztráty cache/head/ACL, omezeného ingesteru/readeru, current/archive/lineage rollback, oba směry RC race s pozorovanou blocking vazbou a odmítnutí RR zápisů. Tato SQL syntaxe a chování musí být přijaty skutečným PostgreSQL17 během koordinovaného okna; fake SQL je nedokládá.

Neproběhlo žádné DB spojení, Docker, listener, placené API nebo čtení klíčů. Žádné vlastní procesy nezůstávají. Sedmisouborový manifest s hashi je `.cache/rag-auto-store-20261028/manifest.json` z `2026-10-29T00:24:07.744Z`. Po tomto předání claim uvolňuji; celek není označený Done ani nasazený. Nejbližší navazující cíl je skutečný import jednoho dokumentu a odpověď s jeho citací.

## Root: skutečná PostgreSQL přejímka

Root převzal scope a v izolovaném source snapshotu spustil skutečný PG17/pgvector test proti nové vlastní `*_test` databázi. První běh odhalil syntaktickou chybu PL/pgSQL na CASE uvnitř IF; výraz dostal explicitní závorky. Původní neúspěšný log zůstal zachovaný. Po této jediné SQL opravě prošel test **19/19, 0 FAIL/0 SKIP** za3,45s včetně migrace naplněné v1, omezených rolí, composite view, suppression/rollback, archivu, RC races a odmítnutí RR zápisů.

Přesný opravený checkpoint je `.cache/rag-auto-store-20261028/manifest-db-fixes.json`; snapshot/log/receipt jsou `.cache/rag-auto-integration-20261028/db-0dadab17/`. Testovací DB `rag_auto_0dadab175ad3_test` je výslovně oddělená. Původní databáze měla před i po stejný public head `76922848bbaf791b366a87dc7b8985f5b995d9542b512948697b301edb3dbfdb` a90 cached vectors; žádná placená volání. Nejde ještě o import skutečného v3 dokumentu ani přejímku celého chatu.
