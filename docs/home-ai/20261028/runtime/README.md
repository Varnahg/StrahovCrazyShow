# Runtime OpenAI embeddingů a pgvector

Implementace tasku `rag-sources-20261028-runtime`, 28. 10. 2026. Aktuální návrh určuje [vektorový kontrakt](../research/vector-contract.md). Tento dokument nahrazuje popis dřívější lexikální etapy; její historické výsledky zůstávají v [předání](../../../agents/handoffs/rag-sources-20261028-runtime.md). Zde uvedené cílené kontroly používají injektované backendy/provider, nejsou živým hodnocením OpenAI ani PostgreSQL.

## Cesta dotazu

`crazy-typka.ts` nejprve provede origin/session/admission a requestSeq kontroly. Z aktuální otázky a nejvýše jedné předchozí úspěšné USER otázky vytvoří `prepareEvidenceQuery` přesný text do 8191 UTF-8 bajtů. Předchozí otázka se připojí pouze ke krátkému jednoznačnému navazujícímu dotazu. Assistant text se do embeddingu nikdy nepoužije. Potvrzený neúspěch smaže historii i kotvu; odmítnutý text se neuchovává pro další téma.

Provider moderuje přesně tento sestavený text. Teprve potom `rag-evidence-backend.ts` načte aktivní DB revizi a porovná celý embedding profil. Chybějící nebo odlišný profil zastaví práci před placeným embeddingem. `rag-embeddings.ts` vytvoří query embedding; `rag-vector-store.ts` vybere kandidáty skutečným parametrizovaným SQL cosine dotazem. Runtime nepoužívá JSON registry ani BM25 jako náhradní cestu při chybě databáze.

Volitelné metadata filtry rozeznávají explicitní SH/SÚZ a konkrétně pojmenované projekty. Běžná slova jako pokoj neurčují kandidáty. Smíšené instituce nebo služba použitá jako orientační bod pro ubytování nechají hledání bez filtru. SQL odpovídá za veřejnost, current status, časovou platnost a profil. Runtime přijme nejvýše 4 podklady a použije výchozí cosine distance práh0.60; explicitní `RAG_MAX_COSINE_DISTANCE` jej může změnit. Volbu a známé omezení anglické parafráze dokládá [skutečný eval](../research/vector-evaluation.md).

Generátor dostane vybrané podklady, instituci, verzi a platnost. Vstupní moderace se neopakuje; výstup se moderuje samostatně. Model smí citovat jen předané chunk IDs. URL a veřejná metadata sestavuje služba z ověřených zdrojů, tvar citací a klientský transport zůstávají stejné. Všechny použité source version IDs včetně necitovaných podkladů se uchovají interně pro ověření před publikací a replay.

## Konfigurace a rozpočty

Zapnutá AI vyžaduje `OPENAI_API_KEY`, `OPENAI_MODEL` a `RAG_DATABASE_URL`. Embedding profil má po evaluaci výchozí `text-embedding-3-large`/3072, případné `OPENAI_EMBEDDING_MODEL` a `OPENAI_EMBEDDING_DIMENSIONS` jej změní explicitně. Konfigurace musí odpovídat profilu aktivní SQL revize. Klíč ani DB URL se nevydávají klientovi či chybovému logu. Vadná konfigurace vypne pouze volitelnou AI, hra pokračuje.

`CRAZY_TYPKA_EMBEDDINGS_PER_PROCESS` a `CRAZY_TYPKA_EMBEDDING_TOKEN_BUDGET` snižují výchozí limity 500 pokusů a 500000 konzervativních UTF-8 rezervací za běh procesu. Rezervace se provede právě před HTTP pokusem, po lokální validaci, a při nejistém výsledku se nevrací. Nejde o přesný tokenizer ani trvalý finanční strop. Potvrzené `total_tokens` se evidují zvlášť v interním `usage()`. Generování má vlastní nezávislý strop. Žádná automatická placená retry nevzniká.

## Publikace, replay a lifecycle

SQL je autorita obsahu. Importované zdroje se projeví po atomické publikaci nové revize bez přestavby hry nebo restartu serveru. Source JSON je pouze administrativní vstup; společná v2 validace je exportována pro import a kontrolu SQL odpovědí. Starý textový registry zůstává jako testovací/datový pomocník a není volán produkční službou.

Přesný terminální replay nevolá moderaci, embedding ani generování. Úspěch pouze ověří proti DB revizi a platnosti všech závislostí. Potvrzená změna/expirace vrací uložený `response-expired` 409; dočasný výpadek DB vrací chybu bez potvrzeného requestSeq a původní úspěch uchová pro pozdější ověření. Async replay drží session lease, takže novější operace ani reset nemohou závodit s vrácením staré odpovědi. Nová revize odstraní starou historii před generováním.

Readiness má sdílenou rozpracovanou kontrolu a 2sekundovou cache, nespotřebovává embedding. Backend má časově omezené operace, abort forwarding a jeden idempotentní close. Služba při resetu/expiraci/shutdown ruší rozpracovanou práci, čistí historii a session stav, shutdown uzavře také DB pool. DELETE/reset funguje i při výpadku DB. Žádný nový watcher, crawler, scheduler, cross-session odpovědní cache nebo perzistence uživatelských dotazů nebyly přidány.

## Ověření a hranice předání

Při převzetí po přerušení prošlo 97/97 cílených testů a scoped strict TypeScript. Následná reprodukce prokázala nesprávné HTTP 502 u expirace vyhozené přímo během vector search; oprava sjednotila tento stav na 409 a ověřila replay bez druhého pokusu. Smíšené české/anglické dotazy nově ověřují konzervativní odstranění filtrů.

Finální počty, logy a hash manifest obsahuje [předání](../../../agents/handoffs/rag-sources-20261028-runtime.md). Ověření zahrnuje přesné pořadí moderation→embedding→SQL→generation→moderation, oddělené rozpočty, byte limit, DB/profile failure bez fallbacku, transient replay, expiraci necitovaných podkladů, reset/souběh/timeout/shutdown a kompatibilní citace. Testové lexical fixtures nejsou důkazem sémantické relevance.

Root provede skutečný PostgreSQL/pgvector test, import 45 současných chunků z 28 zdrojů přes OpenAI, eval/práh, společné kontroly, review a integraci. Tento runtime task nepoužil privátní konfiguraci, placené API, síťový port, GPU, hru, full suite ani build.
