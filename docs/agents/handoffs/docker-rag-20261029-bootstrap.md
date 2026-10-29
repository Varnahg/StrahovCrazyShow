# Docker RAG: bootstrap předání

Vlastník `docker-rag-bootstrap-child-20261029`, příjemce `/root`, pracovní kopie `C:/Users/rezac/.codex/worktrees/clean-home-crazy-typka/StrahovCrazyShow`. Bez stagingu/commitu. Pouze tři přidělené skripty, dva testy, vlastní cache a toto předání; Docker/compose/server/shared zdroje se neměnily.

## Kontrakt

- `node scripts/docker-rag-secrets.mjs`: root one-shot. Persistentní `/run/rag-owner/credentials.json` obsahuje pouze hex hesla `{owner,ingester}`, `/run/rag-reader/credentials.json` pouze `{reader}`. Odvozený `/run/rag-owner/postgres-password` je pro PostgreSQL `POSTGRES_PASSWORD_FILE`. Fixní role `scs_rag_owner`, `scs_rag_ingester`, `scs_rag_reader`. Soubory vznikají atomicky přes synchronizovaný temporary a exclusive hardlink, čitelné0444 pouze v příslušně oddělených Docker volume. Existující validní hodnoty se nemění. Nevalidní persistované hodnoty skončí bezpečnou chybou; chybějící odvozený password soubor se obnoví z owner JSON. Temp soubory po běžném pokusu odstraněny, crash orphan se ignoruje. Testovací overrides `RAG_OWNER_DIR`, `RAG_READER_DIR`.
- `node --import tsx scripts/docker-rag-bootstrap.ts`: node1000, oba interní credential volumes read-only a `OPENAI_API_KEY_FILE` (výchozí `/run/secrets/openai_api_key`). DB default `rag-db:5432/strahov_rag`, volitelné `RAG_DB_HOST/PORT/NAME`. Seed vstupy `server/data/rag/bootstrap-cache.json` a `bootstrap-documents.json`, případně `RAG_CACHE_SEED` / `RAG_DOCUMENT_SEED`.
- Cache seed `{schemaVersion:1,entries:[{profile,input,inputHash,vector}]}`; document seed `{schemaVersion:1,revision:1,bundles:[KnowledgeDocumentBundleV3]}`. Revision je kladné integer≤2147483647 a označuje celou zabalenou znalostní generaci. Vše se validuje před DB zápisem. Cache musí přesně odpovídat embedding vstupům schváleného zabaleného legacy corpusu nebo validovaného v3 dokumentu. Profil, input hash, rozměry a normalizace vektoru se kontrolují stávajícími kontrakty. Parametrizované SQL přidává cache pomocí `ON CONFLICT DO NOTHING`; existující data nepřepisuje.
- `node scripts/docker-game-entrypoint.mjs`: node1000, pouze reader volume + OpenAI secret. Hra dostane reader `RAG_DATABASE_URL`, API klíč a výchozí model `gpt-6-luna` / reasoning `none`, AI enabled1. Signály a exit code se předávají skutečnému serverovému child procesu; po skončení se listenery odstraní. Owner volume do hry nepřipojovat. Čistý game-only Compose může nadále používat původní CMD.

## Rozhodnutí a lifecycle

Existující migrace a importní API se znovu používají; nový uploader ani cache model nevzniká. Bootstrap vytváří pouze chybějící omezené role, existující ověří podle markeru a privilegovaných flagů. Role provisioning je serializovaný transakčním lockem. Před DDL s generovanými hesly nastaví a ověří `log_statement=none`, `log_min_error_statement=panic`; před prvními parametry ověří obě log_parameter nastavení0. Top-level chyby jsou pevné bezpečné zprávy.

Owner provede migraci/granty a validované vložení seedu. Importní publikace běží jako ingester, herní runtime jako reader. Role nemají superuser/create role/create DB/replication/bypassRLS. Hra nečte interní owner soubor. Owner connection má error listener, při jeho selhání se abortuje navazující práce; spojení se ukončí ve finally.

Slepý import při každém startu by přepsal legacy head. Proto owner-only tabulka `scs_rag_bootstrap` drží aplikovanou revizi a pending expected/target checkpoint. Rozhodování i checkpoint probíhají, zatímco skutečný importer drží svůj globální advisory lock. Neřízený či externě změněný head se zachová. Přerušení před publikací ponechá pending plán; přerušení po publikaci se rozpozná podle aktuálního cílového headu. V3 dokumenty používají context + prepareDocumentChanges + importPreparedDocumentCorpus; nevyjmenované dokumenty a suppression mapy zůstávají zachované. Archiv je samostatná kolekce.

Default rozpočet nových vstupů je celkem256 /1MiB napříč všemi kolekcemi; `RAG_BOOTSTRAP_MAX_INPUTS/BYTES` umožní i0. Existující cache nečerpá rozpočet. Nejisté pokusy nikdy nedostanou automatické retry. Empty/malformed seed, nekompatibilní data, migrace nebo nejasný placený pokus skončí chybou, nikoli nekonečnou opakovací smyčkou. Automatický crawler a nové ověřování platnosti zdrojů tím nevznikají.

## Ověření

- `node node_modules/tsx/dist/cli.mjs --test tests/docker-rag-bootstrap.test.ts tests/docker-game-entrypoint.test.ts`: **13/13 PASS**,0skip, exit0. Testy pokrývají souběžný secrets init/restart, poškozený persistovaný soubor, reader-only runtime, SIGTERM/exit, foreign legacy/v3 heads, crash okolo publikace, validaci/cache rollback, omezené role a bezpečné DDL logování, migration failure a uncertain bez retry.
- Závěrečný fake test skutečně čte veřejné101entries +1v3bundle od rootu, validuje je a používá skutečný importní algoritmus pro první legacy/v3 publikaci i restart s nulou embedder volání. Je to fake SQL důkaz algoritmu, nikoli skutečná DB přejímka.
- `node node_modules/typescript/bin/tsc --project .cache/docker-rag-bootstrap-20261029/tsconfig.json --noEmit`: strict TypeScript **PASS**, exit0.
- Cílený `git diff --check`: **PASS**.

Žádný skutečný Docker, databáze, server, GPU, instalace či API volání nebyly spuštěné; soukromé klíče nebyly čtené. Vlastní CPU procesy skončily a testové dočasné adresáře byly uklizené pod rezervovanou cache. Root následně provede skutečnou izolovanou fresh/restart/transfer přejímku a společné review. Zdrojové zápisy po tomto předání zastavené; rezervace se uvolní bezprostředně po uložení.

## Úzká review oprava: monotónní generace seedu

Po předání rootu a jeho release byl znovu převzat vlastní původní scope. Nález: bez generace mohl starší image považovat novější managed head za svůj a publikovat starší obsah. Marker má nyní `seed_revision` a `pending_revision`, aditivní přechod starých rows používá0/null. Neřízený ruční head má přednost a zůstane zachovaný. Nižší generace nemění head ani marker; stejná generace s odlišným cílem selže před API/publikací; vyšší generace může aktualizovat pouze stále spravovaný head. Vyšší generace se stejným cílem jen posune marker.

Pending checkpoint nese původní generaci. Po publikaci před závěrečným potvrzením starší image ponechá nový head i pending marker beze změny; stejná generace dokončí marker a vyšší přebírá správnou skutečně publikovanou pending generaci jako svůj základ. Vyšší image před dokončením staršího nepublikovaného pending importu selže `bootstrap-pending-seed-revision`; nedokončený starý import nesmí přeznačit. Nečíslovaný původní marker se adoptuje pouze při přesné shodě aktuálního cíle, jinak zachová stav.

Preflight všech aktivních legacy/document/archive profilů pod importním lockem odmítne změnu modelu či dimenzí existující databáze kódem `bootstrap-profile-change-required`, před vložením cache nebo pokusem o embedding/publikaci. Nejde o transparentní profilovou migraci. Vybrané chyby mají explicitní whitelist bezpečných kódů; libovolná raw výjimka se stále nevypisuje.

Finální ověření po opravě: **17/17 targeted PASS**, scoped strict TypeScript PASS a cílený diffcheck PASS. Nové scénáře upgrade/downgrade, shodná generace s jiným cílem, pending crash, přesná adopce nečíslovaného markeru a profile-change preflight prošly. První pomocný pokus použít neexistující systémový Python nezměnil soubory; následná přímá úprava a oba finální Node/TS běhy byly úspěšné. Žádný DB/Docker/API běh ani zásah do rootova neměnného validačního snapshotu. Finální manifest je `.cache/docker-rag-bootstrap-20261029/manifest-revision.json`.

Root převzal stabilní source pro immutable Docker baseline. Jediné společné review nyní zjistilo nutnost ochrany managed seedu před starším image; předává zpět autorovi omezenou opravu explicitní seed revision a preflight zprávy pro změnu embedding profilu. Aktuální Docker baseline snapshot zůstává neměnný. Root nyní uvolňuje bootstrap claim pro původního autora; původ jeho dirty souborů je doložen.
