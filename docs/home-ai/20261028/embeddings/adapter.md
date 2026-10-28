# Serverový OpenAI embedding adapter

Task `rag-vector-20261028-embeddings`, vlastník `rag-embeddings-01a17e9d`. Závazné API určuje [vector-contract](../research/vector-contract.md); explicitní požadavek uživatele na OpenAI embeddingy a PostgreSQL/pgvector překrývá původní čistě textový návrh. Tento modul nemění kurátorovaná data, SQL, import ani herní UI.

## Průzkum a volba

Primární zdroje ověřené 28. 10. 2026: [Embeddings API](https://developers.openai.com/api/reference/resources/embeddings/methods/create), [průvodce](https://developers.openai.com/api/docs/guides/embeddings), modely [small](https://developers.openai.com/api/docs/models/text-embedding-3-small) a [large](https://developers.openai.com/api/docs/models/text-embedding-3-large), [Batch API](https://developers.openai.com/api/docs/guides/batch). API podporuje pole vstupů, explicitní dimenze a float výstup; odpověď nese index, model a usage. Dokumentované tokenové limity jsou 8192 na vstup a 300 000 souhrnně. OpenAI uvádí normalizaci vektorů na jednotkovou délku.

Small má výchozích 1536 dimenzí a zveřejněnou cenu $0.02 za milion vstupních tokenů, large 3072 a $0.13. Obecné tvrzení o schopnějším large pro neanglické texty není důkazem české retrieval kvality tohoto projektu. Profil small/1536 je první konfigurace; srovnání vyžaduje živý eval na stejných dotazech. Data samotná zabírají 45 krátkých vstupů, proto jsou vhodné malé sekvenční dávky. Asynchronní Batch API nabízí nižší cenu, ale přidává lifecycle souboru/jobu a čekání; pro první import nebylo zvoleno.

Porovnáno použití SDK, samostatný fetch a rozšíření chat provideru. Zvolen samostatný fetch adapter bez nové závislosti: pevné API, žádné skryté SDK retry a disjunktní vlastnictví. Nemění chatový provider ani jeho lifecycle. Adapter zpracuje jedinou dávku; rozdělení importu, trvalé pokusy, obnovu a atomickou publikaci vlastní importní modul.

## Identita a vstup

- Profil je zmrazený objekt s SHA-256 nad přesným `JSON.stringify(["openai", model, dimensions, "title-locator-text-v1"])`.
- Povolené modely jsou ověřené `text-embedding-3-small` (1–1536 dimenzí) a `text-embedding-3-large` (1–3072). Bez parametrů se vytvoří small/1536; zadaný large bez rozměru má 3072. Další model potřebuje explicitní podporu, nikoli automatický fallback.
- `documentEmbeddingInput` vrací přesně `JSON.stringify([chunk.document.title, chunk.sourceLocator, chunk.text])`. Žádné trimování, normalizace diakritiky ani připojení dat kontroly.
- `embeddingInputHash` je SHA-256 přesného UTF-8 vstupu. Neobsahuje čas kontroly, source IDs ani profil; import musí klíč cache skládat z input hash **a** profile ID.
- Prázdné/whitespace vstupy a neplatné UTF-16 surrogate sekvence se odmítnou. Platné emoji a české/Unicode texty se nemění. Profile přijatý zvenku se znovu ověří a zkopíruje do vlastního immutable objektu.

## Rozpočty, validace a chyby

Výchozí a zároveň maximální velikostní limity: 32 vstupů, 8191 UTF-8 bajtů na vstup, 64 KiB součtu textů, 128 KiB serializovaného requestu a 4 MiB response. Velikostní overrides mohou limity snížit. Timeout je 20 s, konfigurovatelný od 1 ms do 60 s. Volitelný `user` má nejvýše 128 UTF-8 bajtů; volající sem má předat pseudonymní identifikátor. UTF-8 součet je konzervativní rozpočtová jednotka, nikoli vykázaný počet účtovaných tokenů.

Lokální validace, serializace a kontrola pre-abortu probíhají před `onAttempt`. Callback se volá právě jednou těsně před transportem. Jeho výjimka se záměrně propaguje beze změny, aby nezaniklo odmítnutí rozpočtu. Callback je synchronní podle veřejného typu. Pokud během callbacku dojde k abortu, fetch nezačne, ale případná již provedená rozpočtová rezervace se automaticky nevrací. Počet pokusů, trvalou evidenci nejistého výsledku a účtování vlastní volající.

HTTP endpoint je pevný, s `redirect:error` a `encoding_format:float`. Timeout zahrnuje načtení i dočtení těla, zrušení funguje i s transportem ignorujícím signal. Byte cap se kontroluje z Content-Length i skutečně přečtených bajtů. Buffer roste po omezených blocích; nezadržuje neomezený seznam drobných chunků. Po skončení se odstraní listener/timer a zruší reader. Opožděný response po abortu dostane vlastní cancel.

Odpověď se vydá až po kontrole list/object tagů, přesné shody modelu, počtu výsledků, unikátních indexů pokrývajících celý vstup a očekávaných dimenzí. Čísla musejí být konečná, norma nenulová a v toleranci `1e-3` od jedné. Tolerance je aplikační pravidlo pro float zaokrouhlení, nikoli odhad relevance. Vadné vektory se tiše nenormalizují. Výsledky se řadí podle indexu. Usage musí být konečná nezáporná safe integer čísla s total alespoň prompt; vrací se jen po úplné validaci odpovědi.

`EmbeddingError` poskytuje pouze pevný `.code` a stejný message: `invalid-profile`, `invalid-configuration`, `invalid-input`, `request-too-large`, `request-timeout`, `cancelled`, `rate-limited`, `provider-unavailable`, `invalid-response`. Žádný upstream body, input, API klíč ani původní chyba transportu se nepřenáší. Jedinou záměrnou výjimkou je důvěryhodná chyba callbacku `onAttempt`; veřejná služba ji musí mapovat svým obvyklým bezpečným způsobem. Modul nic neloguje a neposílá automatické retry.

## Důkazy a omezení

- `node --import tsx --test tests/rag-embeddings.test.ts`: **40/40 PASS**, 28. 10. 2026.
- Scoped strict TypeScript nad adapterem a jeho testem: **PASS**; přesný příkaz a logy jsou v předání.
- Testy pokrývají profil/input identitu, indexy/dimenze/normu, malformed/null/overflow data, UTF-8/request/response hranice, budget callback, skutečné 1536/3072 délky, rozdělené streamy, timeout, abort a pozdní response cleanup.
- Veškerý transport je fake. Nebyl čten skutečný klíč ani proveden API request, DB operace, build, server nebo GPU práce. Živé modelové oprávnění, usage, latency, recall a relevance práh zůstávají integrační přejímkou. Bez těchto měření se optimálnost ani dosažená kvalita netvrdí.
