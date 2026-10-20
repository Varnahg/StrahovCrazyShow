# Předání: feedback-server-20261020

- Vlastník: `feedback-impl-01a15a3e-server`; příjemce: root koordinátor KEY-52.
- Pracovní kopie: `C:/Users/rezac/Documents/GitHub/StrahovCrazyShow/.cache/player-feedback-20261020`, větev `codex/player-feedback-20261020`, výchozí commit `c713c2aedcafdb02358f05e4c9c51b607edeebc4`.
- Výsledek: implementovaný a cíleně ověřený serverový příjem, diskový inbox/outbox a Linear adapter. Integraci HTTP serveru, Compose, typovou kontrolu celé aplikace, skutečný vzdálený tok, browser a přijetí do main vlastní koordinátor. Podagent nečetl živý credential a nevytvářel skutečná vzdálená issue.
- Přesné soubory: `server/feedback.ts`, `server/feedback-store.ts`, `server/feedback-linear.ts`, `tests/feedback-server.test.ts`, `tests/feedback-store.test.ts`, `tests/feedback-linear.test.ts` a toto předání. Bez commitů podagenta, bez stagingu. Shared kontrakt zůstává pouze čtený.
- Cizí WIP: na začátku root-owned necommitované tasky, specifikace a `shared/feedback.ts`; nic z toho nebylo převzato ani změněno. Další souběžné klientské/capture změny jsou mimo rozsah.

## Podklady a rozhodnutí před implementací

Přečteny AGENTS.md, mapa architektury, koordinační README, current-work, BMAD policy, task JSON, schválený SPEC, výzkum KEY-51, package/TS konfigurace, existující lokální HTTP diagnostický handler a vzory testů. Před prvním zápisem získána disjunktní rezervace. Žádný další BMAD renderer ani podagent.

Oficiální zdroje znovu načteny 20. 10. 2026: [Linear GraphQL](https://linear.app/developers/graphql), [file upload](https://linear.app/developers/how-to-upload-a-file-to-linear), [rate limiting](https://linear.app/developers/rate-limiting), [aktuální schema SDK](https://raw.githubusercontent.com/linear/linear/master/packages/sdk/src/schema.graphql), [SDK error klasifikace](https://raw.githubusercontent.com/linear/linear/master/packages/sdk/src/error.ts), [Node 24 filesystem](https://nodejs.org/docs/latest-v24.x/api/fs.html). Credential API key používá raw Authorization; OAuth access token Bearer podle dokumentovaných kontraktů. Čísla kapacity jsou ochranné provozní výchozí hodnoty, nikoli změřené optimální limity.

Zvažované varianty vycházejí z dokončeného výzkumu: přímé Browser→Linear by vydalo credential a cílení klientu, server bez spoolu by potvrzoval nepersistované hlášení, DB/object storage přidávají provozní závislost pro dnešní jediný proces. Zvolena native Node 24 FormData s pevným limitem těla a asynchronní single-writer disková fronta na persistentním volume. Oddělení neměnného reportu/obrázku a malého atomicky měněného delivery state omezuje opakované zápisy obrazu. Jedna serializovaná store fronta chrání současné stejné ID; vzdálený worker je jeden a nerenderuje ani nesahá na herní stav.

## API a chování

`await createFeedbackService(options)` vrací `{ handle(req,res): Promise<boolean>, close(): Promise<void>, flush(): Promise<void> }`. Volby: `directory`, `env`, `fetch`, `now`, `random`, `workerIntervalMs`, `requestTimeoutMs`, `onDeliveryError(code, reportId)` a `limits` s `maxReports/maxBytes/maxFiles/maxActiveRequests/ratePerMinute/globalRatePerMinute`. Flush je řízená testovací/provozní primitive, žádný veřejný endpoint. Handler je nutné zapojit před generické API/CORS; close do vlastního shutdown lifecycle.

POST `/api/feedback`: jeden textový multipart field `metadata` (JSON), nejvýše jeden Blob `screenshot`. Přijímá guest bez room/session. Native buffer má strop 5 MiB, screenshot 4 MiB a pixelový strop shared kontraktu; kontroluje MIME, magic, rozměry a shodu capture. Nepodporované/duplicitní fields, další soubor, ready bez obrázku a obrázek při removed/unavailable se odmítají. PNG kontroluje délky chunků a koncový IEND, JPEG magic/SOF/EOI, WebP RIFF a variantu dimension header. Nejde o úplný decode obrázku.

Origin musí být přímý same-origin podle Host/socket TLS nebo přesná čárkou oddělená `FEEDBACK_ALLOWED_ORIGINS`. Neplatná konfigurace zastaví inicializaci. `Forwarded`/`X-Forwarded-*` neurčují host, IP ani povolený origin. Proxy veřejný origin se má nastavit explicitně. No-store/nosniff; nikdy CORS `*`. Žádné GET ani veřejné čtení payloadu či seznamu. Klient dostává pouze `{accepted:true,id,receivedAtUTC}` po fsync/publikaci kompletního reportu. Stejný obsah/ID vrátí původní receipt, jiný obsah 409. Chyby jsou stabilní sanitizované kódy, remote error text se neloguje.

Výchozí cap: 1000 reportů, 512 MiB včetně rezervy na delivery state, 4096 souborů/adresářů, 4 aktivní upload requesty, 10 požadavků/IP/min a 120 globálně/min; IP map má strop 1024. Nepoužívá proxy hlavičky pro kvóty. Timeout chrání intake i celé vzdálené HTTP odpovědi včetně body; close ruší pouze vlastní readers/fetch controllery. Remote response buffer nejvýše 128 KiB.

`FEEDBACK_DIR` je default `.cache/feedback`. Directory je určena jednomu Node writeru; více procesů/replicas sdílejících volume není podporovaný deployment. Kompletní adresář reportu se připraví jako `.staging-*`, soubory se fsyncují, adresář se publikuje rename a fsync parentu. Linux podporuje directory fsync; Windows nepodporované directory fsync chyby jsou explicitně tolerované, samotné soubory se flushují. Proto Windows test není důkaz odolnosti Linux volume proti fyzickému výpadku proudu.

Startup ověřuje uložené obálky, UUID, byte cap i SHA-256 reportu/obrazu. Poškozený potvrzený report se tiše nemaže: inicializace selže `corrupt`, správce musí zachovat a opravit data. Odstraňují se pouze nepublikované `.delivery-*` a staging starší hodiny; čerstvé pozůstatky se započítají do kapacity. Potvrzené reporty se automaticky nemažou a kapacita odmítne nové přijetí.

Linear env: `LINEAR_API_KEY` nebo `LINEAR_ACCESS_TOKEN`, `LINEAR_TEAM_ID`, `LINEAR_PROJECT_ID`, volitelně `LINEAR_STATUS_ID`. Bez úplné konfigurace se persistuje `pending-config` bez vzdáleného slibu. Jeden UUID issue se persistuje již při příjmu, před vzdáleným create také `createAttempted`. FileUpload→PUT kopíruje vrácené headery a assetUrl se persistuje před issueCreate. Každý create je potvrzen issue readbackem s UUID, markerem report ID, team/project a případným assetUrl. Restart/ambiguous response nejdřív dohledá stejný UUID; teprve explicitní not-found/null umožní opakovat stejné ID. Žádné vyhledávání privátních textů pro veřejné klienty.

HTTP200 GraphQL errors nejsou úspěch. 400/429 RATELIMITED (také SDK extensions.type), reset epoch milliseconds a Retry-After řídí exponenciální jitter/backoff; automaticky nejvýše 12 pokusů. Auth, explicitní invalid input, konfliktní readback nebo vyčerpané pokusy mají lokální `blocked` a sanitizovaný `error` v `delivery.json` pro obsluhu. Veřejný retry endpoint není. Změna credentialu sama neodblokuje trvale blocked report; správce musí pod dohledem integrátora obnovit jeho delivery state se zachováním UUID/createAttempted a následnou reconciliation. Credential se neposílá upload storage ani do issue body; text je Markdown/HTML escaped a známé tokenové formy i konkrétní configured credential se redigují před renderingem.

## Refaktoring a ověření

Sjednocen atomický durable zápis a klasifikace Linear code/type. Jediný request wrapper omezuje a timeoutuje hlavičky i body, není druhé neohraničené čtení. Pending výběr neklonuje delivered/blocked reporty a při chybějící konfiguraci ani již označené pending-config; fronta tak každých 5 sekund zbytečně nekopíruje obrázky/obsah historie. Obrazy se čtou jen při uploadu nebo startup integrity kontrole, ne při každém ticku. Jediný body buffer na request a serializovaný store/worker omezují alokace. Close ruší timers/readers/fetch a čeká vlastní store operace.

Příkaz `pnpm exec tsx --test tests/feedback-store.test.ts tests/feedback-linear.test.ts tests/feedback-server.test.ts` dne 20. 10. 2026 přibližně 20:21 UTC: exit 0, **30/30 pass**. Node v24.19.0. Použity skutečné native FormData multipart bajty a PNG fixture; HTTP stream/res jsou mock bez portu. Testy: concurrent duplicates, konflikt, restart/etapy/staging, byte/file/report quota, hash corruption, privátní receipt, MIME/dimensions/extra-fields, origin/proxyspoof, streamed oversize bez Content-Length, active cap, intake timeout/close, missing config, safe Markdown/credential redaction, upload headers/asset persistence, GraphQL200 errors, 400 rate reset, nonretry auth, ambiguous create→restart reconciliation, not-found→same UUID a konfliktní readback, fetch/header/body shutdown/deadline.

Koordinátor z reálného read-only Linear dotazu doložil přesný missing Issue tvar: HTTP200, data.issue=null, path=[issue], message=Entity not found: Issue, extensions.code=INPUT_ERROR, type=invalid input, userPresentableMessage=Could not find referenced Issue. Adapter whitelistuje pouze tento přesný INPUT_ERROR tvar. Dva další testy dokládají, že tento tvar dovolí opakovat stejné UUID a jiný INPUT_ERROR není důkaz absence ani podnět k dalšímu create.

První běh odhalil syntaktickou závorku v novém testu; po její opravě prochází. Následné běhy rozšířených testů také procházejí. Prettier pouze nad šesti vlastními kódovými/testovými soubory. Full suite/build/integrace/GPU/živý Linear tok podagent nespouštěl; patří root validaci, mocky nejsou důkaz vzdáleného doručení ani výkonu.

### Oprava doloženého review nálezu, 20:25 UTC

Koordinátor doložil, že HTTP200 může obsahovat úspěšné issueCreate a současně nonretryable errors v jeho vnořeném poli. Původní klasifikace zahodila partial data a zablokovala již vytvořené issue bez následného readbacku. Srovnání variant: okamžitý READ před blokováním by přidal druhou síťovou operaci do error větve a dvojí obsluhu reconciliation; zvolená varianta rozpozná ambiguous mutation a znovu použije již persistovanou verifying/retry větev s UUID a konečným rozpočtem 12 pokusů. Stejně se chová překročení byte capu odpovědi HTTP200, protože se tím nedokazuje selhání vzdálené mutace. Definitivní auth/input odmítnutí bez známky provedené mutace zůstává blocked bez dalších pokusů. RATELIMITED má dál přednost a zachová reset/backoff.

Před opravou obnoven claim s `--adopt-dirty` pouze na sedm doložených vlastních souborů z tohoto předání. Upraveny pouze `server/feedback-linear.ts`, `tests/feedback-linear.test.ts` a toto předání. Přidány testy mixed success+BAD_USER_INPUT, mixed success+FORBIDDEN, oversized HTTP200 po vzdáleném create→restart→READ, definitivní auth a input termination a konečný attempt budget. Stejný cílený příkaz dne 20. 10. 2026 20:25 UTC: exit 0, **36/36 pass**. Ambiguous případy mají právě jeden create, jeden UUID a po READ delivered. Žádné credentialy čteny, žádné další procesy/porty, refaktor znovu používá společnou retry/reconciliation větev.

SHA-256 checkpointu po cíleném ověření (s testy):

| Soubor | SHA-256 |
|---|---|
| server/feedback.ts | BCAB9AC2130FE60D3DC796BF0DFB939E60044B37D10397B709B19B2B1F2F5B0B |
| server/feedback-store.ts | 6C193FC8F56D4BC6194DB89F28D06FCD7594AB32E86F9C38F1F1D461D52EF0CD |
| server/feedback-linear.ts | E7EDAD2466FF6077CCE3BA5731D432C38122C2DDDBC96926B00B25BF7F1A5BD0 |
| tests/feedback-server.test.ts | F1758A85A22BD079E516753E8C7A767475A391ADDD367F359A3DA1149B9698EA |
| tests/feedback-store.test.ts | B2DE221B6891162F92138710EFFB14EFAC8AFF485D3DCCAEFDA1B4E9C4FAC400 |
| tests/feedback-linear.test.ts | 0D065126075E3AE393DB2FAF418513144701C4FF130594A65EA2422F3748A17B |

- Procesy a zdroje: pouze ukončené krátké CPU test/formatter příkazy; žádný server, port, GPU, build nebo pomocný proces nezůstává. Temp test adresáře v OS tmp odstraněny test finally.
- Omezení/další krok: root provede typovou kontrolu a stabilní checkpoint full suite/build/izolovanou integraci; se skutečnou konfigurací ověří upload a readback soukromého obrázku a restart/ambiguous UUID. Dále zvolí provozní archivaci, kapacitu/monitoring a retenci bez ztráty nepotvrzených dat. Power-loss/kill test na konkrétním Linux persistentním volume nebyl proveden.
- Rezervace: poprvé uvolněna při předání 20:21 UTC, pro opravu review nálezu znovu získána a uvolněna při druhém předání 20. 10. 2026 20:25 UTC; vlastní pomocné procesy ukončené. Release není integrace ani stav Done.
- Integrátor: root; přijetí, finální commit/hash, Linear a docs/verification.md doplní až po vlastním ověření.
