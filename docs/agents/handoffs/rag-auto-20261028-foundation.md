# Předání: dokumentový základ v3 · KEY-67

Vlastník `rag-foundation-implement-01a17e9d`, příjemce koordinátor `/root`. Pracovní kopie `C:/Users/rezac/.codex/worktrees/clean-home-crazy-typka/StrahovCrazyShow`. Implementace, cílený refaktoring, testy a nezávislé review této komponenty jsou dokončené. Nejde o dokončení SQL migrace, crawleru, celého importu nebo nasazení chatbota.

Před prvním zápisem načteny AGENTS, architektura, koordinace/current-work, BMAD policy, vlastní task a [v3 kontrakt](../../rag-ingestion/20261028/document-v3-contract.md). První fáze byla pouze čtecí. Implementace začala až po výslovném GO a accepted-main syncu na `0f80ac852e499b7cec1d19fa7bea81254254ba9c`; konečný okolní HEAD při manifestu je `1de033a45ba649ce8f8b70dbcc97bf50c6abe334`. Posuny HEAD jsou práce koordinátora, nikoli commit tohoto podagenta. Claim byl vlastní a heartbeat obnovovaný; žádný další BMAD workflow, staging nebo commit.

## Rozsah a kompatibilita

Nové soubory: `shared/rag-provenance.ts`, `shared/rag-citation-policy.ts`, generovaný `shared/data/rag-citation-policy.json`, `server/rag-knowledge-types.ts`, `server/rag-document-contract.ts`, `scripts/rag-build-citation-policy.ts` a tři odpovídající nové testy. Existující změny pouze `shared/crazy-typka.ts`, `server/crazy-typka-retrieval.ts`, `server/rag-embeddings.ts`, `tests/rag-embeddings.test.ts`. Ignorované výstupy jen `.cache/rag-auto-foundation-20261028/`; toto předání je čtrnáctý vlastní verzovatelný soubor.

Legacy knowledge typy a seznam témat jsou přesunuté do listového modulu a původní retrieval je reexportuje. V2 validační logika se neměnila. Starý citační typ je `LegacyCrazyTypkaSource`; jeho původní validační větev zůstala stejná, včetně dosavadních hostname a licence URL pravidel. Nová union větev sama žádné v3 odpovědi nevydává a nepřidává archivní runtime wiring.

Nový explicitní embedding `inputVersion:"title-heading-text-v2"` serializuje přesně `[title, headingPath, text]`. Omitted inputVersion zůstává v1, default model/dimensions zůstávají `text-embedding-3-large`/3072 a staré hash tuple/IDs i `documentEmbeddingInput(legacyChunk)` mají shodné výsledky. Fyzické stránky/bbox, datum kontroly a parser metadata se do nového vstupu nedostanou. Profile factory ani helper nemažou nebo nepřeznačují starou cache.

## Exporty pro navazující části

- `rag-knowledge-types.ts`: původní legacy typy; `ParserProfile`, `ExtractionBlock`, `ExtractionChunk`, `ExtractionLink`, `WorkerEnvelope`, `PublishableExtraction`, `DocumentMetadataV3`, `KnowledgeDocumentV3`, `KnowledgeBlockV3`, `KnowledgeChunkV3`, `KnowledgeDatasetV3`, `KnowledgeDocumentBundleV3`, `ResolvedKnowledgeChunkV3`, `EvidenceKnowledgeChunk`.
- `rag-document-contract.ts`: `parserProfileSha256`, `validateWorkerEnvelope(value, expected, limits?)`, `discoveryLinks`, `requirePublishableExtraction`, `normalizedDocumentSha256`, `documentVersionId`, `buildKnowledgeDocumentV3(metadata, extraction, method, policy?, limits?)`, `validateKnowledgeDocumentV3(value, policy?, limits?)`, `validateKnowledgeDatasetV3(value, policy?, limits?)`, `buildDocumentCitation(document, spans, policy?)`, `resolveKnowledgeChunkV3(document, chunk, policy?)`. Dále `RagDocumentError`, `DocumentValidationLimits` a výchozí limity.
- `rag-embeddings.ts`: `EmbeddingInputVersion`, rozšířená profile factory, `validateEmbeddingProfile`, explicitní `documentEmbeddingInputV3(document, chunk, profile)`. Dnešní legacy store jeho nové využití musí zapojit ve svém scope.
- `shared/crazy-typka.ts`: `ExtractedCrazyTypkaSource`, rozšířený `CrazyTypkaSource`, `isExtractedCrazyTypkaSource` a neměnný `CRAZY_TYPKA_DOCUMENT_CITATION_POLICY`. Nová citace obsahuje documentFormat/pageCount podle následné výslovné dohody s root.
- Citation policy: `buildCitationPolicy(catalog)` v generatoru; browser-safe `validateCitationPolicy`, `canonicalizeCitationUrl`, `isCitationUrlAllowed` v shared modulu. Generátor má pouze explicitní spuštění, žádný importní zápis.

`validateWorkerEnvelope` očekává externě dodané `{sourceId,inputSha256,parserProfileSha256}`. Fingerprint je SHA-256 kanonického `['parser-profile-v1', celý descriptor]`, tedy také packages, pipeline, configurationHash, modelManifestHash a tokenizer. Lidské profile.id není důkaz identity. `discoveryLinks` přijímá strukturálně ověřený HTML/feed výsledek i při review-required; nadále jde jen o návrhy pro skutečnou acquisition/discovery policy a robots. Publikace má samostatnou přísnější bránu.

`validateKnowledgeDocumentV3` je metadata/sourceVersion hranice pro SQL. Nepředstírá kontrolu celého těla. Celý dataset validator ověřuje composite identity, reference, textové a normalizační hashe. Projekce `resolveKnowledgeChunkV3` předpokládá dataset-validované vstupy, kontroluje jejich source/version vazbu a vytváří modelové evidence ID přesně `v3-` + SHA-256(JSON.stringify([sourceVersionId, localChunkId])). Legacy IDs zůstávají původní. Projekce má topic:null a verzi rozlišující veřejnou citaci; dvě archivní verze tak nesplynou.

## Úplnost chunkování a tabulky

Po nezávislém review a výslovném rozhodnutí root je publication profil zatím **jeden blockId na chunk**. Strukturální vrstva může číst více referencí, ale publikační brána je do zavedení explicitního merge profilu odmítne. Chunks musí pokrýt všechny neprázdné textové bloky, mít přesně jejich headingPath a jejich text se musí v producer pořadí složit zpět na block.text. Pořadí bloků/chunků je významné; SQL má uchovat ordinal.

Blok tabulky má `tableChunking:{contextLineCount,headerLineIndexes}`. Jde o indexy do skutečného `block.text.split('\n')`, nikoli odhad z obsahu. Hlavičky jsou jedinečné, vzestupné, v mezích a mimo kontextový prefix. Metadata jsou pro publikovanou tabulku povinná. Opakovaný chunk prefix je přesně context + deklarované header řádky; zbytky chunků musí reprodukovat všechny ostatní zdrojové řádky v původním pořadí a násobnosti. Funguje tedy i non-leading/nesouvislá hlavička a opakované stejné hodnoty. Nejsou substring, odhady délky hlavičky nebo kvadratické zarovnávání.

Root měnil Python producenta v jeho vlastním scope; tento agent Python neměnil ani nespouštěl. Starší table envelope bez lineage může zůstat inspectovatelný/review, ale neprojde publikací. Normalizační hash nyní zahrnuje `tableChunking ?? null` jako šestou položku block tuple. V3 ještě nebyla publikovaná, staré v1 profily tento vývoj nemění.

## URL a citace

Artefakt je odvozený z rootem zmrazeného katalogu, ne z celého publisher inventáře. Má 108 pravidel a kanonický catalog SHA `3e2e243764a50828b78f3bb3e67e74ec38b84ca975619d6cc022547fd1f044b7`. Zachovává per-seed vazbu pozitivních scopes a zákazů, globální non-public hostname deny, explicitní asset-directory exact deny a přesné query AGÁTA. `rev` je zúžený jen na schválené wiki page prefixes; ostatní query nejsou novým oprávněním. Artifact není potvrzením fetchu, robots, právní účinnosti ani provenance konkrétní discovery hrany.

V3 citace je `document-extraction`, id=sourceVersionId, s publisher/sourceId/status/účinností/metodou a locatory. PDF má skutečný kladný pageCount a stránky v jeho mezích; ne-PDF má pageCount:null a žádné numerické page locatory. URL je kanonická. Nejvýše osm locatorů a 4096 UTF-8 bajtů jejich textu; přebytek je explicitní citation-limit, ne tiché ořezání. Zůstává současná omezená licence URL politika CC BY-SA 4.0/null; žádné nové licenční tvrzení se nevymýšlí.

## Refaktoring a hranice důkazu

Jednotné provenance/date/Unicode/ID guardy, jedna metadata a source-version validace a společná citation projekce zabránily rozcházení pravidel. Bounded JSON se kontroluje před klonováním celého vstupu. Již neměnné parsed struktury se při skládání výsledku zbytečně hluboce nekopírují. Neexistují nové intervaly, síťové procesy, soukromé query cache ani implicitní IO; generated policy se zapisuje jen explicitním CLI.

Validace deklarovaného tokenCount není nezávislý tokenizer: vyžaduje správný worker profil a navíc hlídá byte limit celého embedding vstupu. Zdrojový OCR/AI přepis, autentická účinnost a úplnost vůči originálu jsou další quality/approval hranice. Tato komponenta dokládá strukturu a mechanickou vazbu **chunků na extrahované bloky**, ne pravdivost samotného OCR. Konečný WorkerEnvelope také obsahuje request context (sourceId/title/resolved links); koordinátor byl upozorněn, že jeho cache se musí svázat i s kontextem, nikoli pouze raw SHA. Context-free OpenAI candidate má samostatnou cache v jiném scope.

## Ověření a review

Finální přímý Node/tsx běh nad `rag-provenance`, `rag-citation-policy`, `rag-document-contract`, `rag-embeddings` a legacy `crazy-typka-retrieval`: **96 PASS, 0 FAIL, 0 SKIP**, 2166 ms, exit 0. [Log](../../../.cache/rag-auto-foundation-20261028/tests-final.log). Finální scoped strict TypeScript nad těmito moduly/testy prošel, [log](../../../.cache/rag-auto-foundation-20261028/typecheck-final.log). Prettier check přesně vlastních TS souborů prošel, [log](../../../.cache/rag-auto-foundation-20261028/format-check-final.log). Git diff check existujících vlastních změn prošel. Generated JSON byte parita je součástí testu.

Dřívější širší cílená sada také zahrnula tehdejší legacy ingest/store/evidence-backend a měla **111/111**. Nevydává se za finální ověření souběžně vznikající nové SQL implementace. Nebyl spuštěn herní fullsuite, build, skutečná DB ani integrace.

Čtecí reviewer provedl 532 URL případů (222 povolených), žádný grant nerozšířil skutečnou acquisition policy. U 53 legacy citačních vstupů, devíti legacy profilů a čtyř v1 textových vstupů nenašel změnu proti původnímu HEAD. Doložené chyby byly opraveny:

1. V3 dokument přijímal tečku/podtržítko v id, citace je odmítala: sjednoceno přes `isRagIdentifier`; skutečný [RED](../../../.cache/rag-auto-foundation-20261028/identifier-red.log) a [GREEN](../../../.cache/rag-auto-foundation-20261028/identifier-green.log), nezávislé potvrzení 1/1.
2. Neindexovaný neprázdný blok: doplněna coverage v obou publication cestách, včetně self-consistent přímého datasetu; [RED 2/2 fail](../../../.cache/rag-auto-foundation-20261028/coverage-red.log) → [GREEN 3/3](../../../.cache/rag-auto-foundation-20261028/coverage-green.log). Review/discovery zůstala zachovaná.
3. Vymyšlený headingPath chunku: přesná vazba na block path; [RED](../../../.cache/rag-auto-foundation-20261028/heading-red.log) → [GREEN](../../../.cache/rag-auto-foundation-20261028/heading-green.log), závěrečné nezávislé re-review 2/2 včetně přepočítaných hashů. Žádné otevřené review nálezy.

Čtecí Node probe převzal čtyři skutečné dříve zachycené producer JSON (dvě SÚZ PDF, SH DOCX a SÚZ hub HTML). Všechny prošly strukturou a všechny zůstaly odmítnuté pro publikaci jako review-required; HTML zachovalo 27 discovery links. [Receipt](../../../.cache/rag-auto-foundation-20261028/producer-shape-probe.json) váže raw/artifact/profile hashe. Nebyla znovu prováděna extrakce, Python ani inference; jde o kompatibilitu captured JSON, ne nové quality přijetí nebo nezávislé schválení profilu.

## Snapshot a předání

[Manifest](../../../.cache/rag-auto-foundation-20261028/manifest-final.json) z `2026-10-28T23:13:06.046Z` obsahuje 13 vlastních zdrojů, testů a generated policy. SHA-256 manifestu `05eb421f1e06b98c1e7b950b4562f0de7571c647f6d805cf7e1818a9fd0d76c2`. Handoff není zahrnutý do své vlastní kruhové identity. Předání v místním čase již 29. 10. 2026.

Žádný vlastní dlouhožijící proces, port, key file, API/DB/Python/GPU/instalace nebo build. Žádná servírovaná hra nebyla otevřená či měněná. Nic nestagováno ani necommitováno. Po tomto záznamu skutečný release; další úpravy pouze po novém pověření a rezervaci. Root přebírá integraci, širší ověření a změnu stavu tasku/Linear.
