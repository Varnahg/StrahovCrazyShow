# Dokončení automatického RAG · KEY-67

Tento plán shrnuje čtecí audit současného kódu a konkrétní zbývající implementaci. Neznamená, že již běží plný crawler, archivní retrieval nebo automatický PDF převod. Prioritní router má samostatný KEY-68/PR35.

## Identity a inkrementální změny

- Logické ID dokumentu je odvozené z ověřené identity zdroje/URL, nikoli z data kontroly. Přechod z původních ručních ID musí zachovat mapování a nerozmnožit stejný dokument pod novým ID.
- Dokumentová verze váže raw SHA, extrakční profil, normalizovaný obsah a provenance. Bloky a chunky odkazují na konkrétní verzi; originální bytes jsou v omezeném persistentním úložišti mimo Git.
- Nový embedding vstup je přesně `[title, headingPath, text]`. Stránka, bbox, pořadí bloků, kontrolní datum ani parser ID nejsou textem pro embedding. Nový profil `title-heading-text-v2` je odlišný od dosavadního v1; jeho první import není cache hit starého nekompatibilního profilu.
- Změna fyzické stránky nebo parseru při stejných výsledných vstupech neplatí nové embeddingy. Změna jediného skutečného vstupu vytváří pouze nový odpovídající vektor. Staré profily/cache zůstávají zachované.

## Varianty trvalého stavu a archivu

Porovnány souborový JSON journal s vlastní správou zámků, další SQLite databáze a tabulky v již používaném PostgreSQL. Preferované jsou PostgreSQL job/extraction/attempt tabulky a content-addressed filesystem pro originály. Nevzniká druhý databázový runtime; DB transakce a session lock mohou řídit souběh a obnovu po pádu. Síťová/modelová práce nemá držet otevřenou dlouhou transakci. Přesné omezení práv, ztráta spojení a recovery potřebují regresní testy.

Pro archiv nestačí odstranit SQL podmínku `status='current'`: současná revize dovoluje jen jednu verzi logického zdroje. Menší riziko představují additivní archivní membership tabulky s `source_version_id` a samostatný head `public-archive`, při společných profilech, cache a source versions. Alternativou je přestavba současných primárních/cizích klíčů; ta zasahuje do již přijaté current publikace podstatně více. Původní current head se nepřepne, dokud nový úplný snapshot neprojde přijetím.

Migrátor musí být verzovaný. Bezpodmínečné opakované přehrání současného bootstrap SQL by mohlo vrátit staré trigger funkce. SQL migrace mají jednoho vlastníka včetně orchestration tabulek. Bez testu zachování starého head/cache není migrace dokončená.

## Oddělené implementační celky

| Celek | Předpokládané soubory | Předání |
| --- | --- | --- |
| V3 dokumentový kontrakt, profil a citace | nové `server/rag-document-contract.ts`, `shared/rag-provenance.ts`; `server/rag-embeddings.ts`, `shared/crazy-typka.ts`, odpovídající testy | Validovaný worker výstup, legacy kompatibilita, verze dokumentu a pravdivý druh citace |
| SQL, store a atomická publikace | `server/rag-vector-store.ts`, `server/rag-ingest.ts`, `server/rag-schema.sql`, nové migrace, `scripts/rag-import.ts`, testy | Oddělené current/archive hlavy, více historických verzí, zachovaná cache a poslední dobrá revize |
| Obnovitelná orchestrace | nové `server/rag-document-pipeline.ts`, `server/rag-ingestion-jobs.ts`, `server/rag-ingestion-store.ts`, `scripts/rag-sync.ts`, testy | Fetch/discovery/extraction/indexace jako oddělené kroky, persistentní fronta, report všech seedů a důvodů nepublikace |
| Historický záměr, evidence a UI | evidence backend, Crazy Typka service/provider/Decisions, samostatná chat komponenta/CSS a testy | Aktuální zdroje jako výchozí, výslovné historické dotazy, označené archivní citace a replay závislosti |
| Provoz a integrace | Compose/Docker, případné dependencies/CI, společné entrypointy a přejímková evidence | Trvalé volume, worker lifecycle, bounded jobs, skutečné opakované importy a provozní kontrola |

Toto není samovolné rozšíření živých rezervací. Přesné writePaths a sdílené vstupy musí být přiděleny před první implementací. Samostatný OpenAI PDF adapter je vymezen v [kontraktu](openai-pdf-contract.md); acquisition a Python extractor mají již vlastní komponentové scopes.

## Povinné chování orchestrace

Job odděluje získaný raw hash, požadovaný parser profil, dokončenou extrakci a publikovanou verzi. `304` nesmí přeskočit čekající indexaci; nový parser může zpracovat uložený originál bez downloadu. Chyba, limit nebo review-required nesmažou poslední platnou publikaci. Dokument se publikuje úplný, nikdy jako směs starých a nových chunků. Nejasné placené pokusy se po restartu automaticky neopakují.

Všechny katalogové seedy i nalezené dokumenty mají reportovaný stav. Limit běhu vytváří obnovitelnou frontu, nikoli tichou ztrátu odkazů. Přílohy bez přípony, charakterová sada HTTP a feed entry policy jsou konkrétní integrační hranice již zjištěné v komponentách. Odkaz ani modelový výstup nikdy nerozšiřují host/path oprávnění.

## Historické dotazy a citace

Interní explicitní scope má výchozí `current`, alternativu `archive` a volitelné validované `asOf`. Vstup může později určit UI nebo třetí nezávislý Decisions predicate; to je nová samostatná evaluace po PR35. Samotný rok, slovo historie nebo chybějící current výsledky nejsou oprávněním přepnout do archivu. Nové téma historický scope automaticky nezdědí.

Právní účinnost archivního dokumentu se hodnotí vůči `asOf`; integrita a administrativní čerstvost vůči současnosti. Datum staré uložené kopie samo nedokazuje tehdejší právní účinnost. Citace musí identifikovat konkrétní source version a odlišit původní parafrázi, automatickou extrakci a archiv. Deduplikace pouze podle logického source ID by chybně sloučila dvě historické verze. DOCX nemá vymyšlená čísla fyzických stran.

Scope patří do identity requestSeq a replay závislostí. Změna scope při stejném pořadovém čísle musí být konflikt; přesný replay zůstává bez dalších placených kroků. Celý řetězec zachová moderaci, soukromí a expiry pravidla.

## Přijetí

Regrese musí doložit migraci bez ztráty staré publikace/cache; nezměněný import s nulou API volání; změnu metadata/page/bbox bez embeddingu; změnu jednoho vstupu; 304 s čekající indexací; parser migration; neúplnou extrakci; přílohu bez přípony; dvě historické verze; current bez archivního úniku; `asOf` proti dnešku; nespuštění archivu pouhým rokem; pravdivé citace a replay konflikt scope. Následně skutečný omezený import SH/SÚZ a report pokrytí katalogu, nikoli jen počet připravených komponent.
