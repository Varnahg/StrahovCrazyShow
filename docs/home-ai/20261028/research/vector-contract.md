# Závazný vektorový kontrakt KEY-65

Uživatel výslovně opravil původní interpretaci: cílem jsou **OpenAI embeddingy a vektorová databáze**. Tento kontrakt nahrazuje původní zákaz DB/embeddingů a textový runtime v dřívější specifikaci. Ověřené source/chunk v2 JSON a oddělené archivy zůstávají vstupem administrativního importu. Žádný veřejný runtime crawler ani neobjednaný scheduler nevzniká.

## Zvolená cesta

- OpenAI `text-embedding-3-large`, explicitně3072 rozměrů jako výsledný profil po [skutečné A/B evaluaci](vector-evaluation.md). Původní kandidát small/1536 zůstává podporovaný a jeho cache oddělená. Model generující odpověď je nezávislý. Jiný embedding model/rozměr/formát je nový neměnný profil, nikoli přepsání cache.
- PostgreSQL17 + pgvector0.8.7, přesný SQL cosine `<=>`; žádný odhad výkonu nebo HNSW bez měření. Podporovaný oficiální image `pgvector/pgvector:0.8.7-pg17-bookworm`; konkrétní digest zaznamenat.
- SQL je autorita pro aktivní publikační revizi a její obsah. Server nepoužívá místní JSON jako fallback. JSON je importní vstup, nové publikování v DB se projeví bez přestavby hry.
- Nezměněný import0embedding calls, metadata-only změna0, změna jednoho vstupu jen jeho nový embedding. Publikace je atomická a stará revize zůstává dostupná po chybě. Rozpracované dávky mají trvalý stav; po nejasném výsledku není automatická placená retry.

## Embedding modul

`server/rag-embeddings.ts` vlastní následující exporty:

```ts
type EmbeddingProfile = Readonly<{
  id: string; provider: "openai"; model: string; dimensions: number;
  inputVersion: "title-locator-text-v1";
}>;
createEmbeddingProfile(options?: { model?: string; dimensions?: number }): EmbeddingProfile;
// Profil = SHA256(JSON.stringify(["openai", model, dimensions, inputVersion])).
documentEmbeddingInput(chunk: KnowledgeChunk): string;
// Přesně JSON.stringify([chunk.document.title, chunk.sourceLocator, chunk.text]).
embeddingInputHash(input: string): string;
type EmbeddingResult = { vectors: number[][]; usage: { promptTokens: number; totalTokens: number } };
type Embedder = {
  readonly profile: EmbeddingProfile;
  embed(inputs: readonly string[], options: {
    signal: AbortSignal; user?: string;
    onAttempt?: (inputBytes: number) => void;
  }): Promise<EmbeddingResult>;
};
createOpenAIEmbedder(options: { apiKey: string; profile: EmbeddingProfile;
  fetch?: typeof fetch; timeoutMs?: number; maxInputs?: number;
  maxInputBytes?: number; maxBatchBytes?: number; responseBytes?: number }): Embedder;
```

Pevný endpoint `/v1/embeddings`, float encoding, redirect:error, bounded fetch+body timeout a cleanup. Výchozí limit32vstupů,8191UTF-8bajtů na vstup,64KiB batch textu,128KiB requestbody,4MiB response. UTF-8 rozpočty jsou konzervativní horní omezení, nejsou deklarovány jako skutečně účtované tokeny. `onAttempt` po lokální validaci těsně před fetch, přesně jednou; jeho zamítnutí se nesmí zabalit jako upstream chyba. Zrušení/timeout bez potvrzeného usage se nerefunduje. Validovat object/model/indexy/počet/dimenze/konečnost/nenulovou jednotkovou normu, vrátit seřazené vektory a validní usage. Chyby jen pevné bezpečné kódy, žádný input/key/upstream body. Žádná auto retry. `checkedAt`, reviewAfter a jiné kontrolní metadata nejsou embeddingový vstup.

## PostgreSQL úložiště a import

`server/rag-vector-store.ts` vlastní pool, migraci a parametrizované SQL. `server/rag-schema.sql` vlastní trvalé profily, embedding cache, verze zdrojů, immutable revize, vazby source/chunk, jediný public head a stavy embedding pokusů. Archivní metadata lze uchovat v revizi, ale nikdy neembedovat nebo vyhledávat jako aktuální text. Veřejnost/current/čas/profil se filtrují v SQL ještě před vrácením evidence.

```ts
type RagSnapshot = { revisionId: string; profile: EmbeddingProfile };
type VectorHit = { chunk: KnowledgeChunk; sourceVersionId: string; distance: number };
type VectorKnowledgeStore = {
  captureActive(signal?: AbortSignal): Promise<RagSnapshot | null>;
  search(snapshot: RagSnapshot, queryVector: readonly number[], filters: {
    authority?: KnowledgeAuthority; topics?: readonly KnowledgeTopic[];
    limit: number; now?: number;
  }, signal?: AbortSignal): Promise<readonly VectorHit[]>;
  assertCurrent(snapshot: RagSnapshot, sourceVersionIds: readonly string[], now?: number,
    signal?: AbortSignal): Promise<boolean>;
  close(): Promise<void>;
};
createVectorKnowledgeStore(options: { connectionString: string;
  connectionTimeoutMs?: number; statementTimeoutMs?: number; maxConnections?: number;
}): VectorKnowledgeStore;
```

Vrácená data musí projít stejnou v2 validací/hash/URL/účinností jako import, bez hard-coded souborového fallbacku. Schematická chyba a nedostupnost nejsou prázdné výsledky. Vektory do SQL jako validovaný JSON string a `$1::vector`, ne JS PostgreSQL array. Názvy tabulek pevné. Timeout spojení a SQL, při abortu vlastní spojení zrušit/vyřadit, nikdy nevracet do poolu neukončenou práci. Logování bind parametrů vypnout, raw SQL chyby nezveřejňovat.

`server/rag-ingest.ts` a `scripts/rag-import.ts` vlastní importní algoritmus a CLI. Přesnou exportovanou signaturu importní funkce může store autor zvolit, protože ji runtime nevolá; předat ji rootovi pro skutečnou QA. CLI příkazy migrate/import/status, bez automatického placeného retry; nejasné předešlé pokusy vyžadují explicitní `--retry-uncertain` s rozpočtem. Explicitní current3JSON a archive2JSON jako celek. Chybějící/invalidní vstup není mazání. Session advisory lock na dedikovaném klientu, během OpenAI volání nedržet SQL transakci. Dokončené embedding dávky commitovat průběžně. Kompletní revizi a public head publikovat v jedné krátké transakci na stejném clientu. Profily/cache/hotové revize chránit před přepisem, oddělit migrate/ingest/read práva v deploymentu. Dotazy ani embeddingy uživatelů nejsou perzistované.

## Backend a služba

`server/rag-evidence-backend.ts` propojí store/embedder. Runtime autor vlastní tuto interní fasádu; store a embedding interface výše nemění bez domluvy.

- Factory při zapnuté AI vyžaduje `RAG_DATABASE_URL`; žádný tichý BM25 fallback. Default embedding profil large/3072, env `OPENAI_EMBEDDING_MODEL` a `OPENAI_EMBEDDING_DIMENSIONS` jej mohou explicitně zvolit. Přesná shoda s publikovaným DB profilem je nutná před platbou.
- `ready` ověří schema, aktivní ready revizi a profil. Empty DB není připravený chat. Reset/DELETE a shutdown musí fungovat i při výpadku DB.
- Admission a requestSeq replay jako dosud. Přesný terminální replay nesmí znovu moderovat, embedovat ani generovat; provede jen DB ověření revize/platnosti.
- Připravit omezený query text z aktuální zprávy a nejvýše posledního bezpečného USER tématu. Assistant prose ani failed/blocked text nesmí do embeddingu. Přijatá chyba tvoří beze slov hranici, přes kterou se staré téma neobnoví.
- Moderovat **přesný sestavený query text před queryembedding API**, potom capture profil/revize, embedding, SQL search, generování z důkazů a output moderace. Původní provider rozdělí moderování a generování; nepřidávat druhou zbytečnou vstupní moderaci.
- DB query je skutečným výběrem kandidátů v celém platném veřejném corpusu. Runtime neodvozuje omezení instituce ani tématu z přirozeného textu: pojmenování jedné služby nevylučuje další část kombinované otázky. SQL API zachovává explicitní metadata filtry pro administrativní použití a jejich databázové regrese. Žádné předstírání vektorového hledání nad předem BM25 zvolenými IDs.
- Vybrat max4podklady, výchozí cosine distance práh0.60 doložený [evaluací](vector-evaluation.md), včetně známého EN omezení. Nízkou relevanci nevyplnit náhodnými citacemi.
- Interně uchovat snapshot a všechny source version dependencies včetně necitovaných evidence. Změna revize/expirace před publikací nebo replay znamená confirmed response-expired; nedostupná DB při replay nesmaže uložený úspěch, vrátí nepotvrzenou chybu pro pozdější ověření.
- Oddělit `CRAZY_TYPKA_EMBEDDINGS_PER_PROCESS` a `CRAZY_TYPKA_EMBEDDING_TOKEN_BUDGET` od generation cap. Konzervativně rezervovat před HTTP, usage evidovat odděleně; žádná slíbená denní finanční kvóta. API klíč a DB URL nikdy klientovi/logu.
- Veřejný tvar citací i origin/session/abort/privacy ochrany zůstanou. Žádné změny lidského multiplayeru.

## Přijetí

Mock jednotky nestačí. Nutná skutečná PG/pgvector integrace s parametrizovanými vektory v CI a izolované místní DB; nezměněný import0calls, metadata-only0, jeden změněnýchunk1, odstranění bezreembed, přerušení zachovástarýhead, restartznovupoužijecache, souběhnespustíduplikát, nesprávnýprofil/dimenzenepublikuje, archiv/future/expiredvSQLchybí. SkutečnýOpenAI import45textů a omezenýqueryeval musí doložitmodel/usage/recall/latenci. Před každým živým během explicitní stropy; žádné klíče doGit. Plnýbuild/SDK/CI a nezávisléreview až na stabilní kombinaci. Veřejné nasazení vyžaduje provozovatele hostu, místní Docker nepředstírá produkční deployment.

Primární zdroje ověřené28.10.2026: [OpenAI Embeddings](https://developers.openai.com/api/docs/guides/embeddings), [API](https://developers.openai.com/api/reference/resources/embeddings/methods/create), [pgvector](https://github.com/pgvector/pgvector), [node-postgres query](https://node-postgres.com/features/queries), [transakce](https://node-postgres.com/features/transactions), [pool](https://node-postgres.com/features/pooling). Embedding profil a parser jsou vlastní aplikační rozhodnutí; model/práh a omezení malé eval sady dokládá [skutečná evaluace](vector-evaluation.md).
