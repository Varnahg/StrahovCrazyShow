# Předání: rag-decisions-20261028-adapter

- Vlastník: `decisions-adapter-01a17e9d`; příjemce: root koordinátor KEY-68 a `implement_decisions_runtime`.
- Pracovní kopie: `C:/Users/rezac/.codex/worktrees/clean-home-crazy-typka/StrahovCrazyShow`; větev `codex/automated-document-rag`; výchozí HEAD `5eebe2b043a088222b8160fabb7eefbbc3a36e80`.
- Stav: samostatný adaptér implementovaný, refaktorovaný a cíleně ověřený. Není důkazem dokončení runtime routingu, dostupnosti API pro účet, kalibrace ani nasazení. Bez commitu podle zadání koordinátora.
- Změněné soubory: `server/crazy-typka-decisions.ts`, `tests/crazy-typka-decisions.test.ts`, toto předání; ignorované důkazy v `.cache/rag-decisions-adapter-20261028/`.
- Cizí WIP: untracked dokumentový ingest, tasky, research, `tools/` a další práce ponechány. Žádné převzetí, staging, instalace závislostí, změna konfigurace nebo shared rozhraní.

## Výzkum a volba

Před implementací načteny AGENTS, architektura, koordinace, current-work, BMAD policy, task JSON, specifikace a [kontrakt](../../rag-ingestion/20261028/decisions/contract.md). Porovnány existující `rag-embeddings.ts` a jeho testy kvůli transportnímu lifecycle. Tento podagent další BMAD workflow nespouštěl.

Dne 28. 10. 2026 samostatně skutečně otevřeny primární [Decisions guide](https://developers.openai.com/api/docs/guides/decisions), [TypeScript create reference](https://developers.openai.com/api/reference/typescript/resources/decisions/methods/create) a její kompletní `.md` varianta. Ověřeny názvy polí `questions`, `type: predicate`, `name`, `instructions`, `answers`, `probability`, `safety_identifier` a vnořené povinné usage detaily. [Prompt caching](https://developers.openai.com/api/docs/guides/prompt-caching) potvrzuje oddělené cache read/write části input tokenů. Použité request/response pole nejsou odhadované SDK rozhraní.

Varianty:

- Skutečné Decisions s dvěma otázkami v jednom requestu respektuje přímé zadání a nepotřebuje generovat volný text. Dva samostatné requesty by zdvojovaly transport a komplikovaly účtování. Regex routing ani Responses klasifikace nejsou náhradou požadovaného endpointu.
- Přímý nativní fetch nepřidává SDK ani jeho retry/lifecycle. Použití existujícího privátního embedding helperu by vyžadovalo rozšířit vlastnictví souborů a spojilo dvě různé response smlouvy. Adaptér proto sdílí zavedený vzor, ale má vlastní úzké pomocníky.
- `response.json()` nebo samotný AbortSignal neomezí čtené bajty ani transport ignorující abort. Zvolen je omezený stream reader, lokální timeout včetně body a kontrola monotónního deadline také mezi okamžitými čteními.
- Žádná lokální cache nebo historie, žádná vlastní volba generativního modelu, žádné právo načítat URL z dotazu. API podporuje implicitní prompt cache; adaptér nenastavuje vlastní cache klíče nebo breakpointy a účtuje jen ověřené vrácené hodnoty. Nejde o doloženou výkonovou optimalizaci.

## Implementace a integrace

Exporty odpovídají kontraktu: `ComplexityDecision`, `DecisionRouter`, `createDecisionRouter`, `DecisionRouterError`, `DecisionRouterErrorCode`. Přesná TypeScript signatura byla zaslána koordinátorovi i runtime agentovi před caller implementací.

`classify(text, { signal, safetyIdentifier?, onAttempt? })` přijímá jen omezený USER text. Request používá pevné `https://api.openai.com/v1/decisions`, `redirect: error`, `gpt-6-luna`, dvě nezávislé predicate otázky a volitelný neprůhledný identifikátor. Samotná délka, jazyk, legitimní vulgarita, chybějící znalost či pokyn „drahý model“ neznamenají složitost.

`onAttempt` běží právě jednou po lokálních kontrolách a před HTTP. Parametr je UTF-8 velikost **celého serializovaného JSON requestu**, včetně pevných otázek. Aplikační výjimka zůstává stejným objektem. Neúspěšný HTTP pokus nevyvolá refund ani retry; procesní rozpočty vlastní caller. Textový limit 8191 bajtů, request 32768 bajtů, response 65536 bajtů a deadline 4000 ms jsou maximální hodnoty; konfigurovatelné limity lze pouze snížit. Neplatná konfigurace používá konečný kód `invalid-input`.

Response vyžaduje přesný model, dvě jedinečné očekávané predicate odpovědi a konečné pravděpodobnosti v rozsahu 0–1. Refusal je `invalid-response`; nejsou vráceny částečné výsledky. Usage vyžaduje nezáporná bezpečná celá čísla, total=input+output, cache read+write nejvýše input a reasoning nejvýše output. Cache ani reasoning se nepřičítají znovu. Nadbytečná upstream pole se neexportují. Výsledek neobsahuje model, tier ani instrukce k akci.

Refaktoring soustředil numerické kontroly, normalizaci bezpečných chyb, abortovatelný transport a cleanup. Buffer roste geometricky do pevného capu, nejsou uchovány celé předchozí chunky. Timer a listenery se uklidí v terminálních cestách; čtenář uvolní lock a pozdní response se zruší. Cleanup nečeká na neukončitelný promise a jeho chyby nepřepisují výsledek. Žádné logování dotazu, klíče, upstream body či stacku.

## Ověření

Finální běh 28. 10. 2026 přibližně 17:24 UTC:

- `node --import tsx --test tests/crazy-typka-decisions.test.ts`: exit 0, **18/18 pass**, 0 failed/cancelled/skipped; log `.cache/rag-decisions-adapter-20261028/tests.log`.
- `node node_modules/typescript/bin/tsc --noEmit --target ES2022 --module ESNext --moduleResolution Bundler --strict --skipLibCheck --types node --lib 'ES2022,DOM,DOM.Iterable' server/crazy-typka-decisions.ts tests/crazy-typka-decisions.test.ts`: exit 0; `.cache/rag-decisions-adapter-20261028/typescript.log` je prázdný úspěšný výstup.
- `node node_modules/prettier/bin/prettier.cjs --check server/crazy-typka-decisions.ts tests/crazy-typka-decisions.test.ts`: exit 0; log `.cache/rag-decisions-adapter-20261028/format.log`. Počáteční check vyžádal lokální formátování právě těchto dvou souborů; následný finální check prošel.
- Koordinační `validate`: 413 task definic validních v době kontroly; claim a heartbeat úspěšné.

Testy zahrnují skutečně serializovaný API request, oddělení otázek, 0/1 pravděpodobnosti, UTF-8 a JSON-expansion limity, odmítnutí rozpočtu před HTTP, callback mutation, invalidní model/jména/typy/refusal/usage, HTTP statusy bez retry, chybné metadata/JSON/UTF-8, split UTF-8, transport ignorující abort, pozdní response i rejection, stagnující body, odmítající cleanup a nekonečný okamžitý stream hladovějící timer queue. Používají fake fetch a skutečné Response/ReadableStream. Netvrdí kvalitu modelu na české evaluaci.

Snapshot SHA-256 zahrnuje implementaci i testy:

| Soubor | SHA-256 |
| --- | --- |
| `server/crazy-typka-decisions.ts` | `C82FA7ED9D69645B1DC70691FB05F786BD6F6110BCC5C7FF2E0B775E76D46B6F` |
| `tests/crazy-typka-decisions.test.ts` | `73CBE6F5DE2B9336D9B438B1496EDF5A9F668FB12D7F5DE14EB76948831D37BE` |

## Předání a limity

Žádné síťové listenery, GPU, DB, helpery ani placené API nebyly spuštěny. Testové keepalive intervaly končí ve vlastních finally blocích; příkazy jsou ukončeny. Plnou sadu/build/integraci a placenou českou evaluaci vlastní koordinátor v samostatném validačním scope. Živý účet/API a skutečné usage zde nebyly ověřeny.

Rezervace se uvolňuje po tomto předání; změny zůstávají doloženým výstupem tohoto vlastníka pro integrátora. Koordinátor převezme konkrétní hash/diff, doplní společné ověření, Linear a task stav. Tento handoff sám neoznačuje KEY-68 jako Done.

Root převzal a provedl30živých Decisions volání v odděleném scope. Nezávisléreview nyní předává zpět malou opravu: zachovat potvrzené reasoningTokens vusage, včetně testu nenulovéhoúdaje. Žádné aktivní helpery; root před novýmchildclaimem release. APIrequest/otázky se nemají měnit, živádata jsou zachovaná.

## Review oprava: zachovat reasoning usage

28. 10. 2026 v 18:40 UTC původní vlastník po výslovném root předání znovu získal stejný task pomocí `--adopt-dirty` (tři vlastní předané soubory). Prošel aktuální kontrakt a response mapping: adaptér pole `output_tokens_details.reasoning_tokens` správně validoval, ale zahazoval při sestavení výsledku. Náhrada nulou by ztratila potvrzené měření; zvolen je přímý přenos do nového povinného `ComplexityDecision.usage.reasoningTokens`, předem oznámený runtime agentovi. Jde o dvě doplněné řádky implementace a jeden očekávaný údaj regresního testu, bez dalšího refaktoringu.

Původní úspěšný fixture již vracel reasoning 3, output 5 a total 105. Přesný `deepEqual` nyní vyžaduje všechny tři hodnoty, takže ověřuje nenulový přenos i nepřičítání reasoning tokenů k output/total. Otázky, model, request, transport a cache/lifecycle se nemění.

- Stejný cílený testový příkaz: exit 0, **18/18 pass**; nový log `.cache/rag-decisions-adapter-20261028/review-reasoning-tests.log`.
- Stejný cílený strict TypeScript příkaz nad dvěma soubory: exit 0; `.cache/rag-decisions-adapter-20261028/review-reasoning-typescript.log`.
- Nový SHA-256 `server/crazy-typka-decisions.ts`: `8C0DBE63504D1946D1E73C49BC67740CF7020180D6F405B7B45A378E95AD340E`.
- Nový SHA-256 `tests/crazy-typka-decisions.test.ts`: `19BD4E431B3AB14ABC30146428376147BCBBA21BAA537C39F638F8BF63EE17C5`.

Předchozí důkazy a původní hashe zůstávají historicky zachované; aktuální manifest je `review-reasoning-manifest.json` ve vlastní cache. Žádné placené API, fullsuite, helper start nebo commit. Po předání jsou všechny vlastní příkazy ukončené a claim se opět uvolňuje root integrátorovi.
