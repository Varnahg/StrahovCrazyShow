# Předání: rag-auto-20261028-acquisition

- Vlastník: `rag-auto-acquisition-01a17e9d`; příjemce: koordinátor `rag-auto-root-01a17e9d`, KEY-67.
- Kopie: `C:/Users/rezac/.codex/worktrees/clean-home-crazy-typka/StrahovCrazyShow`, větev `codex/automated-document-rag`; base `5eebe2b043a088222b8160fabb7eefbbc3a36e80`.
- Výsledek k 28.10.2026 16:16 UTC: komponentová implementace a cílené ověření dokončeny; bez commitu, integrace, runtime zapojení nebo provozního crawlu. Přijetí a Linear vede koordinátor.
- Vlastní soubory: `server/rag-source-catalog.ts`, `server/rag-source-fetch.ts`, `server/data/rag/source-catalog.json`, `shared/data/rag-publishers.json`, `tests/rag-source-catalog.test.ts`, `tests/rag-source-fetch.test.ts` a toto předání. Ignorovaná cache pouze `.cache/rag-auto-acquisition-20261028/`.
- Cizí WIP: při vstupu root task JSON/research a extrakční `tools/`; nic nebylo převzato nebo změněno. Současný provider, SQL, `shared/crazy-typka.ts`, package/lock a herní runtime beze změny.

## Podklady a rozhodnutí před implementací

Celý uživatelský soubor `C:/Users/rezac/Downloads/zprava-hluboky-vyzkum (5).md` byl přečten jako data. SHA256 originálu: `34701ce643aa3e6fc93e3e8bf1e2cb07bdb3327e2e955f8192d09ae505c1179b`. Porovnání všech fyzických URL řádků zachovává 115 řádků, 114 URL, 27 hostname. Součty fyzických řádků jsou SU20, SH58, SÚZ26, ČVUT11; SH57 je počet unikátních URL po sloučení jediné duplicity na řádcích47/106. Katalog obsahuje13 přímýchPDF a5feedů, tři explicitní auth vstupy a dvě sociální stránky vyžadující policy review. STOH a StrahovOpenAir jsou pod SU podle doloženého původu, i když jsou v částiSH.

Primární reference pro transport: [Node DNS24](https://nodejs.org/docs/latest-v24.x/api/dns.html), [Node HTTPS24](https://nodejs.org/docs/latest-v24.x/api/https.html), [IANA IPv4](https://www.iana.org/assignments/iana-ipv4-special-registry), [IANA IPv6](https://www.iana.org/assignments/iana-ipv6-special-registry), kontrolováno28.10.2026. Projektový kontrakt a celkové porovnání extrakčních variant vlastní koordinátor v `docs/rag-ingestion/20261028/`.

Pro transport byly porovnány nativní `fetch`, nový klient s vlastními závislostmi a Node `https.request`. Nativní fetch sám neposkytuje požadovanou kontrolu DNS/pinování bez dalšího transportního adapteru; nový klient přidává dependency/lifecycle rozsah. Zvolený Node core request s vlastním per-hop Agentem a per-operation Resolverem dává explicitní DNS, TLS a cleanup a vyhovuje zákazu nových Node dependencies. Cena je nové TLS spojení na každý hop; výkon ani rychlost crawlu nebyly měřeny. Alternativou je pozdější řízený connection pool, který zde není potřeba a mohl by znejasnit pinování/reuse.

Discovery zachovává přímou vazbu rodič/sekce/typ; obecný crawl celého hostname byl odmítnut. `pathPrefixes` povolují stránky pouze na původním originu a úzké namespace. Samostatné `documentPathPrefixes` a koordinátorem schválené `attachmentScopes` umožňují přílohy z hubů bez povolení navigace na celém webu. Nový hostname se nepřebírá z obsahu. Katalogové statusy jsou pouze `stateHint`, nikoliv ověřená právní účinnost.

## Exporty pro integraci

`loadSourceCatalog(input?: unknown): SourceCatalog` validuje registry, URL, scope a úplnost řádkových vazeb podle digestu; vrací izolovaný hluboce zmražený objekt. `canonicalizeSourceUrl(url, base?)` odstraňuje pouze fragment a známé tracking parametry; zachová `rev`, dokumentové query i case cesty. `decideDiscovery(catalog, {seedId,parentUrl,url,relation,depth,section})` vrací diskriminované povolení se zdrojovou vazbou, nebo důvod zamítnutí. `createSeedUrlPolicy(catalog, seedId)` vytváří synchronní policy pro fetch/redirect; `isPublisherUrlAllowed` samotné není oprávnění pro nové cesty.

`createSourceFetcher(deps?)` vrací `(options: SourceFetchOptions) => Promise<SourceFetchResult>`. Options vyžadují `url`, `publisher`, synchronní `policy`, asynchronní `robots(url,{signal,userAgent})`, `userAgent` a explicitní `limits:{timeoutMs,maxBytes,maxRedirects}`; volitelně `signal`, `validators:{url,etag?,lastModified?}`, `expectedFormat`. Robots callback vyžaduje skutečné `{allowed:true,reason}`; podporovaný metadata tvar má `crawlDelaySeconds?:number|null`, scheduling neprovádí fetcher.

Výsledek má `kind:'fetched'` + `bytes:Buffer`, `sha256`, `signature`, nebo `kind:'not-modified'`. Společná metadata: `finalUrl`, `redirects:[{url,statusCode,location}]`, `statusCode`, `mime`, `charset:string|null`, `etag`, `lastModified`, `checkedAt`, `retryAfter`. `charset` byl doplněn navazující opravou níže: jde o normalizovaný HTTP parametr, bez domýšlení hodnoty při jeho absenci. Chyba je `SourceFetchError` s diskriminátorem `code` a dostupnými HTTPmetadata. Výjimka nic nemaže ani nepublikuje. HTTP304 neznamená dokončenou indexaci; validátory patří přesné URL a nesmějí odcházet na nový redirect cíl.

`createRobotsFetcher(deps?)` je jediná cesta bez robots callbacku: pouze přesná `/robots.txt` bez query, redirect nesmí změnit URL/origin. Rozlišuje `kind:'absent'` pro404/410 od HTTP5xx/timeoutu. Prázdné200 robots je platný prázdný text; HTML/ZIP/PDF není robots. Orchestrátor musí sestavit originovou host policy pro robots, ne použít dokumentovou path policy.

## Implementace a cílený refaktoring

Per-operation Resolver vyhodnotí A iAAAA; jediná neveřejná adresa nebo přechodná chyba druhé rodiny odmítne celý výsledek. Připojení používá pouze ověřenou IP vrácenou lokálním `lookup` callbackem, původní hostname zůstává v Host/SNI a ověřování certifikátu. Private, loopback, link-local, multicast, unspecified, mapped/tunnel IPv6 a konzervativně special-purpose rozsahy jsou odmítnuté. Není proxy z prostředí, cookies, authorization ani automatický retry.

Sdílená funkce transferu obsluhuje dokument i přesně omezené robots; jedna cleanup funkce vlastní request/response/Agent pro každý hop a jeden abort/deadline životní cyklus zahrnuje robots, DNS, hlavičky i tělo. Resolver se ruší i po úspěchu/chybě; opožděná odpověď po timeoutu se zničí. Vnější abort listener a timer se vždy odstraní. Nejdříve se kontroluje skutečná velikost chunku, teprve pak se kopíruje do omezeného bufferu. Fetcher neudržuje žádnou diskovou ani HTTP cache.

Byla odstraněna zbytečná helper funkce; sjednocena kontrola scoped URL, transportní chybové stavy a cleanup. Současné soubory mají cílené formátování, bez plošných změn repozitáře.

## Ověření

Node24.22.1, 28.10.2026 16:15 UTC. Přímý příkaz `node --import tsx --test tests/rag-source-catalog.test.ts tests/rag-source-fetch.test.ts` s `RAG_ORIGINAL_CATALOG` nastaveným na originál: **23/23 pass, 0skip, exit0**, runner534.4968ms. Log `.cache/rag-auto-acquisition-20261028/tests-final.log`. Standardní test bez lokálního originálu přeskočí pouze dodatečné porovnání původních bytů; vždy ověřuje nezávislý digest všech114URL/115řádků.

Cílený strict TypeScript: `node node_modules/typescript/bin/tsc --noEmit --strict --skipLibCheck --target ES2022 --module ESNext --moduleResolution Bundler --resolveJsonModule --esModuleInterop --types node server/rag-source-catalog.ts server/rag-source-fetch.ts tests/rag-source-catalog.test.ts tests/rag-source-fetch.test.ts`: **exit0, bez diagnostik**, `.cache/rag-auto-acquisition-20261028/types-final.log`. První průběžná kontrola odhalila čtyři typové problémy v lokálních transportních typech/test fixtures; byly opraveny před finálním během.

Scénáře zahrnují DNSmix/rebind/IPv6, pinování Host/TLS/SNI, odmítnuté redirecty, robots deny/chybu, explicitní validátory a304, žádné cookies/auth, skutečné chunked limity, komprimovanou odpověď, MIME/signaturu/challenge, 5xx/Retry-After, timeout DNS/robots/body/headers, abort a pozdní odpověď. Nativní Resolver je testován mocky jeho metod; nevznikl listener ani skutečný DNS/zdrojový HTTP požadavek. Konkrétní původní katalog byl porovnán celý, ne jen reprezentativní vzorek.

## Identita checkpointu

Manifest je také v `.cache/rag-auto-acquisition-20261028/manifest.json`; následující SHA256 zahrnují všechny nové kódové/datové vstupy i testy.

| Soubor | SHA256 |
|---|---|
| `server/rag-source-catalog.ts` | `99ceced85209addca0a9ce942ed9c314b3620cccd4c2174f1d4bb79cbd981336` |
| `server/rag-source-fetch.ts` | `7ba3cca06fa3537babd1ed1a1fca1002db534ac9a925efe9bbae3d4d83c9ece1` |
| `server/data/rag/source-catalog.json` | `9a20cbfe6cb538587e9c0e83aae0c42dac261d6778761921efa67a36cb5a25c2` |
| `shared/data/rag-publishers.json` | `4aa27b6f6633b33f979bf364b16c6109e657a23ac996467078dd1419808cf403` |
| `tests/rag-source-catalog.test.ts` | `1868233ca426299269a04b88ef5fb820bd377a5cf9ba80c5097ca178cb0af686` |
| `tests/rag-source-fetch.test.ts` | `65391d1c3a4ef291824dde3f90bedbe2c96e53197a26b56384a80b112eb4df71` |

## Omezení a další krok

- Neproběhl skutečný source GET, hromadný crawl, parser, DB, placené API, build, plná testová sada ani herní/GPU ověření. Celkové end-to-end splněníKEY-67 se tímto netvrdí. Žádný helper proces nebo port nezůstal běžet.
- Komprese je záměrně odmítnuta; request žádá `identity`. Není dekompresor ani rozbalováníZIP. ZIP/OLE je pouze transportní signatura; skutečný formát a archive-bomb ochranu musí potvrdit izolovaný worker. Neznámý binární obsah a neznámé/neplatné textové kódování jsou reportovány jako `format` chyba; deklarované podporované non-UTF8 HTML bylo opraveno v navazujícím checkpointu níže.
- Jde o konzervativní public-unicast adresní politiku, nikoli obecnou IP knihovnu. Některé special-purpose globální anycast adresy se odmítnou záměrně. IPv6 přijímá veřejný rozsah2000::/3 po dalších výlukách.
- Přílohové namespaces jsou úzké. Nové externí hosty, nové cesty projektových webů nebo alternativní DokuWiki fetch endpointy je nutné doložit a doplnit vědomou změnou policy. Zamítnuté objevené odkazy má orchestrátor zachovat v reportu/frontě jako policy-review, ne je tiše zahodit. Současný katalog sám nedokazuje dostupnost/robots/platnost všechseedů.
- `shared/data/rag-publishers.json` je inventář důvěryhodných publisher kontextů, ne samostatné oprávnění ke všemu na každémhostname. Obsahuje i auth/sociální kontext kvůli úplnosti; caller musí kontrolovat `seed.access` a scoped policy. Hostfacebooku není prohlášen za vlastnictvíSH; katalog zachovává pouze zadané asociované stránky, automatický přístup se blokuje.
- Detekce password/challengeHTML je doplňkový guard, nikoli obecné potvrzení právní nebo obsahové validity. Datum HTTPkontroly nikdy nepovyšovat na účinnost. StateHint zůstává původní reportový hint.
- Rezervace se uvolní po tomto předání; změny přebírá koordinátor, stav tasku a integraci potvrzuje až on.

Root review po převzetí doložilo dvě P2: deklarované non-UTF8 HTML nepřejde transportem k podporujícímu parseru a úvodní HTML komentář způsobí falešný MIME/signature konflikt. HTTPcharset se navíc ztrácí. Předáváno zpět původnímu autorovi pro malou opravu a regrese; RSS discovery s prázdným scope zůstává otevřený bod pro skutečný feed audit, nikoli povolení celéhohostu. Root nyní uvolní claim před novým převzetím; žádný helper neběží.

## Navazující oprava dvou P2 · 28.10.2026 17:22 UTC

Původní autor převzal zpět sedm vlastních dirty cest doloženým předáním a novým úspěšným claimem `rag-auto-acquisition-01a17e9d --adopt-dirty`. Root předtím claim skutečně uvolnil. V této opravě se měnily pouze `server/rag-source-fetch.ts`, jeho test a toto předání; aktualizovaný manifest/logy zůstávají ve vlastním cache prefixu. Router, extrakční worker, RSS policy ani jiné cizí výstupy se neměnily. Commit ani integrace neproběhly.

Výzkum řetězce potvrdil bezpodmínečný fatální UTF8 decode před signaturou, zatímco worker `safety.decode_text` již čte HTTP/meta charset a BOM. Druhá příčina byla kontrola prvního tagu bez úvodních komentářů. Nativní Node24 runtime ověřil `TextDecoder` aliasy `windows-1250`/`cp1250`. Varianty: pouhé důvěřování `text/html` by přijalo binární payload; byte sniffing bez dekódování by ztratil kontrolu skutečného textového kódování. Zvoleno deklarované dekódování jen pro transportní kontrolu, se zachováním originálních bajtů a SHA256 a s následným striktním workerem.

- `FetchMetadata.charset:string|null` pochází z HTTP Content-Type. Node core `MIMEType` parsuje parametry a správně odlišuje skutečný charset od textu uvnitř jiného quoted parametru. Token je normalizován na lowercase; chybějící HTTP údaj zůstává `null`. Caller má uložit metadata a workeru předat MIME s `; charset=<charset>`, když charset existuje. Není to odhad kódování obsahu.
- Helper pro kontrolu textu používá BOM, poté HTTP charset, potom HTML meta deklaraci a až při absenci těchto údajů UTF8. Neznámý dekodér nebo neplatné bajty zůstávají explicitní `format` chybou. Není zavedena nová dependency ani náhradní ztrátové dekódování.
- Preamble helper přeskočí whitespace/BOM a uzavřené úvodní HTML komentáře pouze při rozpoznávání signatury. Kontrola password/challenge dál vidí celý dekódovaný text; neuzavřený komentář sám neprokazuje HTML. Binární řídicí znaky, nesouhlas PDF expectation/MIME, TLS, DNS a ostatní transportní guardy zůstaly.
- Refaktoring vyčlenil parametrizaci MIME, dekódování pro kontrolu a lineární průchod komentáři. Vrácený buffer se nepřekóduje ani nezkracuje; hash stále identifikuje přesně originál. Lifecyle síťových prostředků a cache se nemění.

Konkrétní RED: `node --import tsx --test --test-name-pattern='declared CP1250|HTML signature tolerates' tests/rag-source-fetch.test.ts` proti původní implementaci **0/2 pass, 2fail**: `Unrecognized binary or non-UTF-8 source` a `HTML MIME does not match document signature`. Zachovaný log: `.cache/rag-auto-acquisition-20261028/charset-preamble-red.log`.

GREEN stejných dvou regresí: **2/2 pass, exit0**, `.cache/rag-auto-acquisition-20261028/charset-preamble-green.log`. Finální relevantní transportní sada `node --import tsx --test tests/rag-source-fetch.test.ts`: **21/21 pass, 0skip, exit0**, runner1658.8619ms, `.cache/rag-auto-acquisition-20261028/charset-preamble-transport-final.log`. Vedle obou pozitivních případů přibylo ověření meta-only CP1250, quoted HTTP parametrů a negativní payloady pro binární C0/PNG, password, challenge, HTML pod PDF očekáváním i MIME, neukončený komentář a neznámý charset. Stejný cílený strict TypeScript příkaz uvedený výše: **exit0, bez diagnostik**, log `.cache/rag-auto-acquisition-20261028/charset-preamble-types-final.log`. Nezměněný katalog se znovu netestoval; jeho dřívější úplné porovnání zůstává platné.

Nové SHA256 nahrazují pouze dva řádky původního checkpointu; ostatní čtyři zůstávají shodné. Celý šestipoložkový manifest byl obnoven v `.cache/rag-auto-acquisition-20261028/manifest.json`.

| Soubor | SHA256 po opravě |
|---|---|
| `server/rag-source-fetch.ts` | `a00f4c0b5e5555615c22f72e64409c1ebc6dc9ad9dd7788e9efc0b36201dd8fb` |
| `tests/rag-source-fetch.test.ts` | `86a186a3b0d6bcaee6645d80aeae2d60eda12aa9b6b6a12bc7b2e710245b8275` |

Žádný skutečný GET, DNS dotaz, listener, instalace, placené API ani helper proces. Obě potvrzené P2 jsou opravené; RSS discovery zůstává explicitně otevřený limit. Autor po předání opět uvolní claim, konečné přijetí patří koordinátorovi.
