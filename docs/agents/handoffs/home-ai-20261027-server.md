# Předání: home-ai-20261027-server

- Vlastník: `home-ai-server-01a17e9d` (`/root/audit_rag`); příjemce: koordinátor `/root` chatu `01a17e9d-dd4a-7fe3-91ac-4f3bc548982d`.
- Pracovní kopie: `C:/Users/rezac/.codex/worktrees/clean-home-crazy-typka/StrahovCrazyShow`, větev `codex/clean-home-crazy-typka`; výchozí commit `a0e0e31286ae9521f1282a8bd966b40e8fdad628`.
- Výsledek: samostatný serverový AI/RAG celek implementovaný a ověřený cílenými CPU testy; zatím není tímto agentem zapojen do hlavního serveru ani commitnut. Integraci přebírá root.

## Soubory

- `shared/crazy-typka.ts`: browser-safe kontrakt, limity, speaker, validace status/session/odpovědi a povolených zdrojových odkazů.
- `server/crazy-typka.ts`: factory `createCrazyTypkaService({env?, fetch?, now?, limits?})`, samostatné náhodné AI relace, serverová historie, celý namespace `/api/ai`, admission a lifecycle.
- `server/crazy-typka-provider.ts`: pevné OpenAI endpointy, Responses structured output, osobnost, obě moderace, omezené dočítání odpovědi, timeout a abort.
- `server/crazy-typka-retrieval.ts`: jednou vytvořený BM25 index, normalizace/synonyma, minimální relevantní shoda, validace hashů a skutečná freshness hranice.
- `server/data/silicon-hill-knowledge.json`: 11 krátkých kurátorovaných chunků ze 6 zdrojů, verze/účinnost dokumentů, atribuce/licence, SHA-256 uložených parafrází.
- `tests/crazy-typka.test.ts`, `tests/crazy-typka-provider.test.ts`, `tests/crazy-typka-retrieval.test.ts`.
- Toto předání; `.cache/home-ai-20261027-server/{tests.log,tsc.log,manifest.json}`.

Cizí WIP nebyl převzat ani upraven. Počáteční změny rootu ve specifikacích, výzkumu a task katalogu zůstaly mimo zápisy; rovněž klientské soubory druhého agenta. Žádný zápis do `server/index.ts`, `client/ui.tsx`, lidského chatu, package manifestu/locku nebo dependencies. Root během práce vyměnil read-only dependency junction za fyzickou instalaci; na jeho pokyn byly testy po dobu instalace pozastavené.

## Chování a integrace

Factory je synchronní. Integrátor zavolá `if (await ai.handle(req,res)) return;` před obecnými CORS hlavičkami a při shutdown `await ai.close()`.

- `GET /api/ai/status` → 200 `{enabled:boolean}`. Bez klíče/modelu/vypínače `false`, bez předstírané AI odpovědi.
- `POST /api/ai/session`, JSON `{}` → 201 `{token,expiresAt}`; expirace v Unix epoch ms. Token 32 náhodných bajtů hex, na serveru klíčovaný SHA-256; nehraje roli herní identity.
- `POST /api/ai/chat`, JSON `{token,message,locale:"cs"|"en"}` → `{speaker,text,sources}`. Cizí historie a další pole se odmítají. Historii vlastní server, nejvýše 6 turnů.
- `DELETE /api/ai/session`, přesné `Authorization: Bearer <token>` → 204, zrušení inflight a smazání historie. Token nikdy nejde v URL.
- Neznámé podcesty a query v tomto namespace dostanou 404 bez propadnutí do wildcard CORS. Chyby mají bezpečný `{error:code}`; 429 také `retryAfterSeconds:60` a Retry-After.
- AI nemá vazbu na Community, hráče, profily, polohy, lidské kanály nebo zprávy.

Finální env: `CRAZY_TYPKA_ENABLED=1`, `OPENAI_API_KEY`, `OPENAI_MODEL`; volitelné `CRAZY_TYPKA_ALLOWED_ORIGINS` (čárkou oddělené přesné origins) a `CRAZY_TYPKA_GENERATIONS_PER_PROCESS` (snížení výchozího stropu 500). Factory odmítá neplatnou optional konfiguraci; root dle dohody obalí vytvoření safe fallbackem na disabled AI, aby chyba AI konfigurace nezastavila hru. Nelogovat raw výjimku parseru URL ani konfiguraci.

Admission nastává před čtením body; bounded session/IP/global mapy a fronty, max. 4 aktivní requesty, 1 inflight na relaci. Limity počítají socket IP, nikoli neověřený X-Forwarded-For. Globální cap počítá zahájené pokusy generování i při upstream chybě; není persistentní denní finanční rozpočet. Žádné automatické retry.

## Podklady a omezení evidence

Podrobný průzkum a volba variant jsou v `docs/home-ai/20261027/research.md` a specifikaci KEY-64. Zdroje kontrolované 27. 10. 2026: oficiální web členství/dokumenty, konkrétní Stanovy z 1. 12. 2025 s účinností 1. 1. 2026, síťová pravidla datovaná 5. 6. 2018 a wiki projekty/sport. Členství vzniká formulářem/podpisem/ověřením totožnosti; platba podmiňuje čerpání výhod. Starší předpis o členství z roku 2022 a rozporný wiki cache snapshot nebyly použity.

Wiki odvozeniny nesou CC BY-SA 4.0, autora a označení úpravy. U ostatních zdrojů licence nezjištěna; ukládají se stručné faktické parafráze, ne plné dokumenty. Hash označuje uložený text, nikoli nedoložený hash původního PDF/HTML.

`reviewAfter=2026-11-27` je vynuceno: od `2026-11-27T00:00:00Z` retrieval vrací prázdnou evidenci. Totéž platí pro čas před kontrolou nebo neplatná/obrácená data. Datum kontroly není účinnost dokumentu. Aktualizace musí projít kontrolou podkladů a přepočtem hashů; žádný runtime fetch či automatické přijetí změn. Prázdná evidence dovoluje obecnou konverzaci a přiznání mezery, ne vymyšlené klubové rady.

## Refaktoring a lifecycle

Index, dokumentové frekvence a zkontrolovaná metadata vznikají jednou. Žádná sdílená cache uživatelských odpovědí ani externí index. Společné čtení JSON, admission, origin a provider request path soustřeďují limity i cleanup. Provider deadline platí i při zaseknutém dočítání body. Modelové sourceIds se validují proti skutečně vybraným chunkům; URL a atribuce skládá server a deduplikuje podle dokumentu.

Reset/disconnect/timeout/shutdown ruší AbortController. `finally` odpojuje listeners, timers a inflight slot. Jeden unref'ed interval odstraňuje i neaktivní expirované historie nejpozději při minutovém sweepu; expirace se navíc kontroluje při každém použití. `close()` interval ukončí, vymaže mapy a vyčká zrušené requesty. Výstup se ukáže až po validaci completed/schema/refusal a výstupní moderaci; chybná moderace je fail closed.

## Skutečné ověření

Dne 27. 10. 2026 po posledních změnách:

- Scope-only Prettier nad 8 vlastními soubory: exit 0.
- `node node_modules/typescript/bin/tsc --noEmit --target ES2022 --module ESNext --moduleResolution Bundler --resolveJsonModule --esModuleInterop --strict --skipLibCheck --types node shared/crazy-typka.ts server/crazy-typka.ts server/crazy-typka-provider.ts server/crazy-typka-retrieval.ts tests/crazy-typka.test.ts tests/crazy-typka-provider.test.ts tests/crazy-typka-retrieval.test.ts`: exit 0, bez diagnostiky; log `.cache/home-ai-20261027-server/tsc.log`.
- `node --import tsx --test tests/crazy-typka.test.ts tests/crazy-typka-provider.test.ts tests/crazy-typka-retrieval.test.ts`: **23/23 PASS**, exit 0, 527 ms; log `.cache/home-ai-20261027-server/tests.log`.
- Testy pokrývají CZ/EN parafráze, nesouvisející dotazy, freshness cutoff/invalid date, metadata/hashes, namespace/CORS/metody, konfiguraci off, vlastní historii/reset/expiry, odmítnutí extra historie/locale, admission před body, IP spoof, upload/kapacity, dedup/rates, cap při chybě i souběžné moderaci, body deadline, disconnect/shutdown, refusal/incomplete/falešné citace a moderaci obou stran.
- První běh odhalil jednu falešnou retrieval shodu na samotné „rules“ ve větě mimo corpus; zpřísněn minimální podíl relevantních tokenů. Scoped TypeScript odhalil příliš úzký inferred literal typ parametru limit=4; opraveno na number. Read-only review odhalilo nevynucené reviewAfter; opraveno s regresí. Vlastní kontrola zpřísnila locale a Bearer prefix. Následný finální běh je uveden výše.

## Snapshot a převzetí

Manifest osmi zdrojových/testových souborů (včetně corpus JSON) je `.cache/home-ai-20261027-server/manifest.json`; souhrnný SHA-256 nad JSON polem `{path,sha256}`:

`ee929f6265b9805e22014ccc5ca23cbc12d8c0ee9939991cd845581e38baef12`

Žádný dlouhožijící proces, port, GPU, build ani plná testovací sada nebyly spuštěny. Žádné skutečné OpenAI volání: testy injektují fake fetch. Neověřeny živá kvalita/latence/cena/model-account availability ani skutečná odolnost promptu proti adversarial dialogům. Citace sama nedokazuje faktickou správnost. Tyto limity nesmějí být zaměněny za hotovou produkční přejímku.

Rezervaci vlastník uvolňuje po tomto předání a ukončení všech krátkých CPU procesů. Root přebírá doložený dirty scope přes vlastní integrátor claim; release není stav Done. Další krok: převzít diff, zapojit server/UI, provést společný checkpoint a praktické ověření. Commit, main integraci a stav tasku/Linear provádí root.
