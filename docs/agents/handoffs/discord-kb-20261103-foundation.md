# Předání: discord-kb-20261103-foundation

- Vlastník: `discord-kb-20261103-foundation-agent`; příjemce: root koordinátor KEY-72.
- Checkout: `C:/Users/rezac/Documents/GitHub/StrahovCrazyShow`, větev `main`; zadání přijato po task checkpointu `d124d4a3`. Žádný vlastní commit; integraci provádí root.
- Výsledek: explicitní v3 větev `knowledge-curation`, její publikovatelný kontrakt, anonymní source metadata, atomický dokumentový ingest a additive SQL003 jsou implementované. CPU ověření prošlo; skutečná SQL migrace/publikace vyžaduje integrační okno.
- Soubory: `shared/knowledge-curation.ts`, `server/rag-curation-contract.ts`, `server/rag-migrations/003-knowledge-curation.sql`, `server/rag-knowledge-types.ts`, `server/rag-vector-store.ts`, `server/rag-ingest.ts`, `scripts/rag-import.ts`, `tests/rag-curation-contract.test.ts`, `tests/rag-ingest.test.ts`, `tests/rag-vector-store.test.ts`, `tests/rag-vector-db.test.ts`, tento handoff a `.cache/discord-kb-20261103/foundation/source-manifest.json`.
- Cizí WIP: žádný převzatý. Render změny a souběžná root runtime/UI práce zůstaly nedotčené. Původní `rag-document-contract.ts`, `rag-embeddings.ts` a historické SQL001/002 se nakonec neměnily.
- Podklady: přímý audit současných v3 kontraktů, SQL, importeru a cache; schválené rozhodnutí uživatele připouští označené komunitní zkušenosti. Nevytvářel jsem skutečné znalostní položky ani nepoužil soukromé exporty.

## Kontrakt pro integrátora

`buildCuratedKnowledgeDocumentV3(metadata, { text, headingPath, tokenCount }, profileId?, policy?)` z `server/rag-curation-contract.ts` vrací bundle kompatibilní s dokumentovým importem. `metadata.id` identifikuje homogenní jednotku, `itemId` sdružuje jednotky canonical FAQ. `tokenCount` musí compiler skutečně změřit pro `[title, headingPath, text]` připnutým tokenizerem; Node kontroluje strukturu, strop650 a nezávislý limit8191 UTF-8 bajtů, nikoli další tokenizer.

`reviewedAt` je kontrola kurace. `verified-official` vyžaduje `factCheckedAt` a podporující oficiální URL+locator s vlastními termíny; deadline jednotky nesmí přesáhnout podporu. `community-experience` vyžaduje `factCheckedAt:null`, `supportingRefs:[]`, skutečné období zkušenosti a explicitní omezení. Původní extraction dokumenty/hashy zůstávají stejné. Kurace neprochází publisher allowlistem jako instituce, má `authority:null` a nesmí potlačit oficiální legacy zdroj. Podporující URL stále procházejí původní veřejnou citační politikou.

Veřejný `CuratedKnowledgeSource` a validator jsou ve `shared/knowledge-curation.ts`; source nemá `url`, `author`, `publisher`, `checkedAt` ani extraction metadata. Inline karta/root UI zobrazuje pouze anonymní kurátorské informace. Striktní klíče a textový backstop odmítají raw audit pole, Discord message odkazy/mentions/snowflakes a zjevné lokální cesty. Sémantická anonymizace osobních údajů je nadále povinnost compileru a kurátorského review.

Nové store typy `RagDocumentV3`, `RagDocumentDatasetV3`, `RagDocumentBundleV3` jsou explicitní union; původní extraction buildery zůstávají úzce typované. Dispatcher validuje celou publikovanou jednotku a její přesný vztah blok/chunk/text. Zdrojové datum zkušenosti není právní účinnost; komunitní archiv proto neprochází `asOf` intervalovým filtrem.

`previewDocumentChanges({ connectionString, changes, profile, signal? })` a CLI `node --import tsx scripts/rag-import.ts preview-documents --input ABS_JSON` poskytují READ ONLY přehled: CAS snapshot/revision, počty cache hitů/missing vstupů, UTF-8 bajty a deklarované změřené tokeny, nejisté pokusy, nutnost migrace003. Nevyžadují API klíč, nemění ledger a nevolají provider. Snapshot konflikty se neobcházejí. Preview používá administrativní/ingester připojení se SELECT na ledger; omezená runtime reader role tento ledger záměrně nemá.

## Refaktoring a ověření

Společné helpery pro review datum, currentness a dispatch oddělují kuraci od extrakce bez druhého indexu. Obě větve používají původní `title-heading-text-v2` a sdílenou per-input cache. Metadata-only změna vytváří novou neměnnou source version, ale nulové nové embeddingy. Preview obnovu nejistých pokusů neprovádí.

- `node --import tsx --test tests/rag-curation-contract.test.ts tests/rag-ingest.test.ts tests/rag-embeddings.test.ts tests/rag-vector-store.test.ts`: **82/82 PASS**, exit0, přibližně2,2s; 3.11.2026. Včetně skutečného import algoritmu nad syntetickou session, cache reuse, nejistého placeného pokusu a zachování headu při selhání.
- `node node_modules/typescript/bin/tsc --noEmit --pretty false`: **PASS**, exit0. První průchod odhalil vlastní narrowing chybu (opravena) a souběžné root-owned fixture chyby; závěrečný průchod prošel.
- `git diff --check` nad vlastními tracked soubory: PASS.
- Připraven opt-in reálný DB scénář v `tests/rag-vector-db.test.ts`: migrace001→002→003 a zachování ACL/head/cache, NULL authority, zákaz maskování jako SÚZ, retrieval/expiry, metadata cache reuse a archive/asOf. **Nespouštěno**: heavy-validation má jiný vlastník a root koordinuje oddělené okno. Žádná skutečná DB ani placené API nebyly v tomto tasku použity.
- Manifest11 implementačních/testových souborů: `.cache/discord-kb-20261103/foundation/source-manifest.json`, aggregate SHA-256 `7d3152e617b487c0951052fa66f0b197196bd2b5275dc5d6c2795e03cd05641d`. Handoff není součástí hash preimage. Výstup testů je ve zprávách relace; není vytvořen samostatný test log.

## Předání a zbývající přijetí

Vlastní pomocné procesy neběží; test runner i tsc skončily. Nebyl spuštěn server/port/GPU. Rezervace se po tomto předání uvolňuje, root přebírá uvedené dirty soubory a jejich další editace. Uvolnění není označení celé funkce Done.

Integrátor provede review, rezervované skutečné SQL testy, společné runtime/UI testy a importní preview finálního corpusu. Teprve poté případnou placenou indexaci a kontrolu publikace. Do `docs/verification.md` a Linear zapisuje root; tyto společné soubory nebyly součástí mé rezervace.

## Převzetí integrátorem 3. 11. 2026

Root po doloženém předání převzal scope. Doplnil úzký registr konkrétních podpůrných stránek kurace se skutečnými vydavateli; nepovoluje těmto webům dokumentovou extrakci ani crawler. Regrese odmítá jiného vydavatele, podcesty, query i podvrženou doménu. Následná sada má **83/83 PASS** (`validation/foundation-final.txt`). Skutečná izolovaná PostgreSQL sada má **20/20 PASS** (`validation/db-checkpoint1/results.txt`), včetně migrace, původních identit/cache, atomické publikace, odmítnutí neplatné authority a expirace. Společný TypeScript/Vite build prošel (`validation/build-checkpoint2.txt`); runtime/UI/bootstrap/citace mají **170 PASS, 1 volitelný SKIP** (`validation/runtime-final.txt`). Všechny uvedené logy jsou v `.cache/discord-kb-20261103/`. Samostatné live RAG měření a nasazení zatím nejsou dokončené; tento celek dodává kompatibilní mechanismus.
