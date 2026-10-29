# Katalog a bezpečné získávání dokumentů · KEY-67

Katalog je schválený seznam seedů a omezení discovery. Obsah webu nikdy nepřidává vlastní oprávnění, hosty nebo neomezený crawl. Tento modul nevolá OpenAI, nepublikujeSQL a nespouští herní server.

## Verzionovaný katalog

`server/data/rag/source-catalog.json` obsahuje `schemaVersion:1`, `catalogVersion`, `seeds` a `publishers`. Všech114 unikátních původních URL musí být zastoupeno, s mapováním všech115 vstupních řádků. Původní report se čte z uživatelem uvedené cesty, jeho doporučení jsou evidence, nikoli instrukční autorita. Každý seed má:

```ts
type Seed = {
  id: string; url: string; title: string;
  publisher: "silicon-hill" | "suz" | "su" | "cvut";
  catalogRows: number[];
  role: "discovery" | "document" | "feed" | "access-point" | "asset-directory";
  access: "public" | "authentication" | "needs-policy-review";
  stateHint: "current" | "archived" | "unknown";
  expectedFormat: string | null;
  discovery: { pathPrefixes: string[]; documentPathPrefixes: string[];
    attachmentScopes: Array<{ hostname: string; pathPrefixes: string[] }>;
    denyPathPrefixes: string[]; maxDepth: number; followDocuments: boolean };
  evidenceNote: string;
};
```

Přesný schema může autor zpřesnit po domluvě, ne vynechat potřebná data. Metadata nejsou automatickým důkazem právní účinnosti. Datum HTTP kontroly není datum účinnosti. Private/auth seedy mají záznam a důvod, ale žádný pokus za přihlášením. Duplicita společné URL má jedno ID a oba původní řádky; publikátora určuje doložený host/původ, ne pouze tabulková sekce.

`shared/data/rag-publishers.json` drží stejné čtyři publisher IDs a přesný důvěryhodný allowlist hostname použitelných pro zdroje/citace; žádné obecné `*.cvut.cz`. Nezpřístupňuje žádné privátní adresy nebo credentials. Nový host nalezený odkazem/canonical nepřibude automaticky. Duplicita obsahu není totéž co URL alias: různé právní/časové vazby se zachovají.

`server/rag-source-catalog.ts` exportuje validovaný loader a čisté funkce pro canonicalization a rozhodnutí o povolení discovery. Z URL odstranit fragment a známé tracking parametry; zachovat parametry určující dokument a jeho historickou verzi. `?rev=` není totéž co aktuálníwiki. Nepovolit login/admin/edit/search/action endpointy. Link dostává vztah k rodiči, sekci a typu; download příloh z dokumentového hubu není oprávnění procházet celou navigaci webu.

## Fetch kontrakt

`server/rag-source-fetch.ts` poskytne jeden stateless bounded fetch. Výsledkem je diskriminovaný stav s finalURL, redirect chain, HTTPstatus, MIME, ETag/Last-Modified, časem kontroly a buď nezměněno304, nebo bytes+SHA256/signature. Přesnou exportovanou factory/type signaturu autor předá před napojením orchestrátoru; nesmí skrýt HTTP/nejasné výsledky jako prázdný úspěch.

Implementovaná factory je `createSourceFetcher(dependencies?)`; její výsledek přijímá `SourceFetchOptions` a vrací `SourceFetchResult`. Metadata dále nesou `charset:string|null` ze skutečné HTTP hlavičky. Orchestrátor uchová originální bytes/hash a workeru předá MIME s tímto charset parametrem, pokud existuje. Samotný transport pouze kontroluje podporované dekódování a původní bajty nepřekóduje. `createRobotsFetcher` má samostatnou omezenou cestu popsanou níže; úplné rozhraní a výsledky jsou v [předání](../../agents/handoffs/rag-auto-20261028-acquisition.md).

Vstupy: schválená URL/publisher policy, explicitní timeout/byte/redirect limity, AbortSignal, volitelné podmíněné HTTP validátory a callback pro robots rozhodnutí každé konkrétní URL. Roboti se získávají zvláštní cestou jen pro `/robots.txt` povoleného originu, aby nevznikla rekurze. Callback používá čistý Python helper popsaný v extractor-contract.md. Timeout/5xx robots je přiznaná dočasná překážka;404/410 absence pravidel se odliší. Crawler policy včetně cache/freshness později sestaví orchestrátor.

Povinné vlastnosti:

- Jen HTTPS pro dokumenty, bez URL credentials, neověřených portů a user-controlled proxy. Každý redirect i canonical znovu prochází stejnou politikou. Vědomě povolený historický HTTP seed lze pouze reportovat/navrhnoutHTTPS; nesmí potají snižovat transportní ochranu.
- DNS musí vrátit pouze veřejné adresy; odmítnout loopback, private, link-local, multicast, unspecified, reserved, IPv4-mapped IPv6 a jiná obcházení. IP použitá k připojení je připnutá k ověřenému výsledku, TLS/Host/SNI patří původnímu hostname. DNSrebind se nesmí schovat mezi kontrolou a requestem.
- Nedodávat cookies, authorization, IS/ISKAM relaci nebo klíče. Žádné vykonávání HTML/JS, žádný bypass anti-botu. Challenge/login HTML nesmí být úspěšný PDF dokument.
- Hlídá se skutečný počet entity bajtů i timeout celého přenosu. Preferovat `Accept-Encoding: identity`; pokud je podporovaná komprese, limit platí po dekompresi. Content-Length není jediná ochrana. Po překročení/abortu uzavřít právě vlastní stream/socket, ne cizí proces.
- MIME je hint, ne jediný důkaz formátu. Vrátit signaturuPDF/ZIP-OXML/legacyOLE/text; definitivní OOXML/format potvrzuje worker. PDF bez `.pdf` musí fungovat.
- Přechodná chyba nesmaže poslední soubor/verzi. Fetcher nic nemaže ani nepublikuje. 304 je jen výsledek získání, nikoli závěr, že následná indexace nepotřebuje práci.
- Bez automatických placených nebo nekonečných síťových opakování. Retry/backoff/per-host intervaly později řídí obnovitelná fronta. Problémovému zdroji se při jednom běhu nevěnuje neomezený počet požadavků.

## Ověření

Jednotkové transporty/DNS jsou injektované, bez listenerů a skutečné sítě. Testy zahrnou redirect na privátní/neschválenouadresu, DNSmix/rebind, cookies, TLSidentity, robody denial, conditional304, chunked/komprimovaný body limit, timeout/abort/late response, MIME versus signaturu a zachování validátorů. Katalog testuje114/115/27 inventář, konkrétní3auth endpointy, duplicituURL a scopeescape odkazy. Test nesmí jen přepsat implementační seznam očekávanými hodnotami; ověřit původní katalogové řádky a reprezentativní role.

Skutečné omezené GET/discovery později provede koordinátor s persistentním reportem. Tento komponentový scope sám nespouští hromadný crawler, parserovémodely, DB nebo celé testovací sady.
