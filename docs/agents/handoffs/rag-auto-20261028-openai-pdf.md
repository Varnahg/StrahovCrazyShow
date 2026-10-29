# Předání: rag-auto-20261028-openai-pdf

Aktuální checkpoint po úzkých root review opravách je uveden v závěrečné sekci: **67/67 testů a scoped TypeScript PASS**, manifest `root-review-manifest.json`. Původní předání a jeho evidence níže zůstávají zachované jako historie.

- Vlastník: `rag-openai-pdf-implement-01a17e9d`; příjemce: koordinátor `/root`, KEY-67.
- Pracovní kopie: `C:/Users/rezac/.codex/worktrees/clean-home-crazy-typka/StrahovCrazyShow`, větev `codex/automated-document-rag`.
- Výchozí HEAD při převzetí `14218a505ffb96cc5fd06f5807450d2da173e333`; během nezávislé práce koordinátora se posunul na `0ff4209cfbf854066530c8ee4802f3f2ede81770`. Tento agent nic nestagoval ani necommitoval a neměnil ostatní soubory.
- Výsledek: samostatný Node adapter a cílené fake-HTTP ověření dokončené. Žádný import, zveřejnění RAG nebo kvalitativní přijetí skutečné PDF extrakce tím není doložené.
- Změny: nové `server/rag-pdf-extraction.ts`, `tests/rag-pdf-extraction.test.ts`, toto předání; ignorované výstupy jen `.cache/rag-auto-openai-pdf-20261028/`.
- Cizí WIP: acquisition/extractor/catalog/research změny a dokončený Decisions router nedotčené; žádné převzetí jejich scope. Před zápisem načteny projektové instrukce, task, kontrakt a živý registr; vlastní claim a heartbeat získány.

## Primární podklady a rozhodnutí

Použita dovednost OpenAI Docs. Ověřeno 28. 10. 2026 hledáním a otevřením oficiálních [file inputs](https://developers.openai.com/api/docs/guides/file-inputs), [token counting](https://developers.openai.com/api/docs/guides/token-counting), [count reference](https://developers.openai.com/api/reference/resources/responses/subresources/input_tokens/methods/count) a [Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs?api-mode=responses). Samostatný čtecí podagent potvrdil celé count schéma z oficiální Markdown verze; web nástroj samotný její MIME nepodporoval.

Count reference potvrzuje `model`, `input`, `instructions`, `reasoning`, `text.format` i `truncation`. Parametry `store` a `max_output_tokens` v count schématu dokumentované nejsou. Proto oba requesty sdílejí přesně počítaný vstup včetně strict schema a `detail`, ale jen generace doplňuje `store:false` a výstupní strop. Odpověď count je `object:"response.input_tokens"` a celočíselný `input_tokens`. PDF používá `file_data` a `filename`; neprovádí se Files upload a neexistuje žádné `file_url` či vymyšlené `page_range`.

Zvažované varianty jsou vymezené v [kontraktu koordinátora](../../rag-ingestion/20261028/openai-pdf-contract.md): celé PDF, lokální dávky stran, selektivní AI fallback. Komponenta implementuje celé již získané PDF a oddělené count/extract kroky. Rozdělení PDF, normalizer, trvalý ledger a výběr extrakční politiky patří následné orchestraci. Oproti spojení obou API do jednoho neprůhledného kroku lze count receipt persistovat, uplatnit skutečný limit před generací a obnovit práci bez opakování count. Python worker nedostal síť ani klíč.

Přístup účtu, skutečná PDF věrnost, rychlost a účtování count endpointu nejsou změřené. Count se neoznačuje za bezplatný; jeho účetní usage zůstává neznámé.

## Přesné rozhraní a hranice

`createOpenAIPdfExtractor(options)` vrací neměnný `profile`, `count(input, call)` a `extract(input, receipt, call)`. Typy jsou exportované přímo z modulu.

- `input`: `Uint8Array bytes`, očekávaný `sha256`, explicitní `pageCount` od důvěryhodného lokálního preflightu. Před sítí se kontroluje hash a přesná PDF hlavička. Adapter není plný PDF parser a nezjišťuje sám skutečný počet stran.
- Factory vyžaduje `model`, explicitní `reasoningEffort` (nebo `null` pro záměrné vynechání pole), `maxInputTokens` a `maxOutputTokens`. Model je serverová konfigurace. Známý Sol odmítne none/minimal před HTTP; podporu libovolného zvoleného modelu/vision tím komponenta neprokazuje. Vrácený `observedModel` zachovává i skutečný snapshot za aliasem.
- Maximální komponentové hranice: 8 MiB PDF, 20 stran, 16 MiB request, 2 MiB generační body (count nejvýše 64 KiB), 15 s count a 60 s extraction. Lze je snížit. Vstupní tokenový strop je explicitně do 1 000 000 a výstupní do 32 768; konkrétní pilot musí zvolit podstatně odpovídající rozpočet a podporovaný modelový kontext.
- Count receipt je JSON-safe a vrací raw SHA, počet stran, profile ID, extraction key, přesný hash count body, tokenový počet a případný request ID. Checksum všech polí detekuje poškození interního ledgeru; **není to autentizace veřejně předaného receipt**. Příjem je určen pouze výsledku `count` nebo důvěryhodnému internímu úložišti.
- `onAttempt(reservation, signal)` může být async. Proběhne jednou po lokální validaci a adapter jej dokončený vyčká před fetch. Deadline i caller abort pokrývají také toto čekání. Pozdní dokončení callbacku nespustí HTTP. Callback dostane abort signal; jeho vlastní DB vedlejší účinky a jejich obnovu řídí orchestrátor.
- Rezervace count má tokeny a celkový tokenový strop `null`, výstupní strop 0. Teprve generation rezervuje potvrzený input count a celý output strop. `attempted` se nastaví až bezprostředně před skutečným vyvoláním fetch; odmítnutí/timeout rezervace není vykázané jako odeslaná API operace.
- Count přesahující generační input budget zůstává inspectovatelným receipt; `extract` jej odmítne před callbackem a HTTP. Žádný automatický retry, fallback, modelová eskalace nebo vnitřní globální rozpočet; souhrnné trvalé počty pokusů řídí budoucí ledger.

Profil váže model/effort/detail a hashe promptu/schema. Extraction key váže raw SHA a profil. Provozní limity nejsou sémantický profil: změna output capu sama nemění count vstup ani nepřepočítává starý úspěšný převod. Každý generační pokus má navíc hash svého přesného HTTP body v accounting; nelze zaměnit tento hash s count hashem. Chunkovací/normalizační politika zůstává mimo tento profil.

## Strukturovaný kandidát a účetnictví

Výsledek má vždy `kind:"candidate"`, nikdy publikační approval. Obsahuje přesně očekávané pořadí stran, bloky textu/nadpisů/seznamů/poznámek/popisků a tabulky s explicitními buňkami a spans. Validátor hlídá horní limity, úplné pokrytí tabulkového gridu včetně prázdných buněk, překryvy, meze a indexy hlaviček. Model neurčuje source ID, URL, deterministická ID ani bbox. Nečitelný či nezachycený obsah zůstává v `unresolved`; stránka bez textu není sama prohlášena za kvalitně přečtenou.

`PdfExtractionError` zveřejňuje jen konečný bezpečný `code` a případné `accounting` s fází, hashem requestu, skutečným attempted stavem, bezpečným request ID a potvrzeným usage nebo `null`. Potvrzené usage se zachová i u incomplete/refusal/špatného výsledného JSON. Malformed usage se odmítne a neoznačí za potvrzené; chybějící je neznámé, nikoli nula. Cache/reasoning údaje jsou podmnožiny a nepřičítají se znovu k total. Odmítnutí admission callbacku se zachová jako původní aplikační chyba; upstream texty/hlavičky/klíč se do error message ani logu nekopírují.

## Refaktoring a lifecycle

Společná `prepare`, receipt validace, tvorba rezervace a jediná `post` cesta obsluhují oba endpointy. Nejsou dva kopírované síťové implementační řetězce. Factory drží jen konstantní konfiguraci, bez cache dokumentů, listenerů nebo intervalů. PDF bytes se před asynchronní rezervací zkopírují; volající později nezmění odesílaný vstup. Body buffer roste geometricky do pevného stropu. Timer, parent listener a reader se uklidí i při ignorujícím transportu; pozdní body se ruší bez čekání na nekooperující cleanup.

Byly zachované hranice scope: existující provider/router/embedding transporty se globálně nerefactorovaly. Žádné změny shared, SQL, Pythonu, dependencies, CI, klienta nebo konfigurace.

## Ověření a nezávislá kontrola

Závěrečný běh 28. 10. 2026 přibližně 20:44 UTC, po opravě review nálezu:

1. `node node_modules/tsx/dist/cli.mjs --test tests/rag-pdf-extraction.test.ts` — exit 0, **55 PASS, 0 FAIL, 0 SKIP**, přibližně 460 ms; [log](../../../.cache/rag-auto-openai-pdf-20261028/tests-review-final.log).
2. Přímý `node node_modules/typescript/bin/tsc --noEmit --target ES2022 --lib ES2022,DOM,DOM.Iterable --module ESNext --moduleResolution Bundler --strict --skipLibCheck --esModuleInterop --types node server/rag-pdf-extraction.ts tests/rag-pdf-extraction.test.ts` — exit 0; [log](../../../.cache/rag-auto-openai-pdf-20261028/typecheck-review-final.log), prázdný úspěšný výstup.
3. Lokální Prettier `--check` nad přesně těmito dvěma soubory — exit 0; [log](../../../.cache/rag-auto-openai-pdf-20261028/format-final.log). Žádný pnpm install/sync.

Regrese pokrývají skutečnou serializaci obou endpointů, JSON roundtrip receipt, změnu dokumentu/profilu, změnu provozního capu, chybný vstup bez HTTP, kumulativní obsah requestu, tokenový budget před generací, async reservation, abort/deadline/late fetch/nekonečný okamžitý stream, cleanup, provider chyby, byte/UTF-8/JSON limity, stránky, tabulkové spans a hlavičky, neúplnost/refusal, neznámé a malformed usage. Jde výhradně o fake HTTP se syntetickými bytes.

Čtecí podagent `/root/implement_openai_pdf/api_shape_audit` našel jeden skutečný P2: původní `Buffer.toString("ascii")` při kontrole signatury maskoval horní bit. Bytes `a5d0c4c6adb1aeb7` se tak mylně dekódovaly jako `%PDF-1.7`. [RED regrese](../../../.cache/rag-auto-openai-pdf-20261028/signature-red.log) před opravou skutečně selhala. Oprava porovnává přesné prefixové bytes a ASCII číslice, [GREEN](../../../.cache/rag-auto-openai-pdf-20261028/signature-green.log) prošla 1/1. Nezávislé opakování potvrdilo `invalid-input`, 0 HTTP a 0 admission callbacků. Další konkrétní vady review nenašlo.

První scoped TypeScript během implementace zachytil ztracené narrowing za lokální arrow funkcí `fail`; změna na explicitní funkci vracející `never` problém odstranila. Historické průběžné výsledky jsou zachované; první checkpoint test logy nebyly přepsané review logy.

## Snapshot a předání

[Manifest](../../../.cache/rag-auto-openai-pdf-20261028/manifest.json), čas `2026-10-28T20:44:37.652Z`:

- `server/rag-pdf-extraction.ts`: SHA-256 `e171b5dac47d377acbec7a2746f1cb9f20d011e6f3044fb50f58bc23e72f44e0`, 32534 bytes.
- `tests/rag-pdf-extraction.test.ts`: SHA-256 `d9258f988a3d8ab82f4d60b8958bc9e8b48aa2fe5dda0ff309ec6dcf80742748`, 32693 bytes.

Manifest zahrnuje oba zdroje včetně testů; toto následné předání není součástí vlastní kruhové identity. Oba soubory jsou nové a necommitované. Integrátor přebírá tento přesný výsledek, případné napojení a změnu task statusu.

Vlastní dlouhožijící procesy: žádné. Cílené Node kontroly skončily; žádný port, DB, Docker, GPU, instalace, API klíč nebo placené volání. Žádná servírovaná hra nebyla otevřená či změněná. Po zápisu tohoto předání bude rezervace uvolněna a slot předán koordinátorovi; bez nového pověření a claim se do scope dále nezapisuje.

Omezení: dokumentová fidelity, dostupnost modelu/count účtu, reálná latence/cena, úplnost OCR, skutečné vícestránkové tabulky a plná pipeline vyžadují navazující přejímku. Zvolený jednosouborový formát zatím neřeší lokální page batching ani offline normalizer. Pozitivní strukturovaný výsledek nesmí být vydáván za kvalitativní souhlas k importu všech validních zdrojů.

## Root review a zpětné předání

Po převzetí doplnil nezávislý čtecí audit dvě skutečné P2 reprodukce s fake HTTP: změna mutable call.signal během async admission ponechá jeden listener na původním signálu; potvrzený input usage 101 při count/maxInputTokens 100 dosud vrátí candidate. Root předává původnímu autorovi úzkou opravu snapshotu call options a kontroly potvrzeného input/rezervačního rozpočtu se zachováním skutečného usage v chybě. Hodnotu receipt inputTokens je nutné před asynchronní cestou rovněž zachytit; JSON-persistovaný receipt nemusí být frozen. Již vzniklou platbu nelze odmítnutím kandidáta vrátit a nemá následovat retry.

Oba nálezy mají dostat skutečné RED/GREEN regrese a závěrečnou cílenou sadu/strict TypeScript. Předchozí signature oprava zůstává uzavřená. Root přidal pouze tento handoff; zdrojové dva soubory stále odpovídají předanému manifestu. Před novým převzetím autora root uvolní svůj claim; žádné pomocné procesy neběží.

## Opravy po root review — 28. 10. 2026, 21:12 UTC

Původní autor převzal výslovně předané tři dirty cesty po root release pod stejným ownerem s `--adopt-dirty`. Pracovní HEAD `0f80ac852e499b7cec1d19fa7bea81254254ba9c` již obsahuje koordinátorem provedenou synchronizaci přijatého main. Mimo vlastní modul, test, cache a toto předání se nezapisovalo.

1. **Stabilní call options:** společný `captureCall` načte a validuje `signal`/`onAttempt` právě jednou při vstupu metody a vytvoří interní neměnný snapshot. `post` používá zachycený parent signal pro registraci, guardy i cleanup a zachycený callback pro admission. Změna caller objektu během await tak nemůže přesunout cleanup na jiný signál ani zamaskovat původní chybu cizím abortem. Regrese ověřují i jednotlivé čtení getters a změnu callbacku/signálu při úspěchu, odmítnutí admission, provider chybě, abortu a timeoutu.
2. **Potvrzené input usage:** po validaci receipt se `inputTokens` uloží do lokálního snapshotu před jakoukoli asynchronní hranicí. Nový validní kandidát se odmítne kódem `input-token-budget`, pokud skutečné potvrzené input usage překročí buď tento rezervovaný count, nebo konfigurovaný `maxInputTokens`. Output cap a ostatní guardy zůstávají. Při odmítnutí se zachová skutečné `usage`, `attempted:true` i request ID. Již vzniklé volání/platbu nelze tímto krokem vrátit a nenásleduje žádný retry. Chybějící usage nadále zůstává `null`, ne nula.

Rezervace je horní strop: nižší skutečné usage se nevydává za rezervované množství a samo nevyvolává chybu. Testy oddělují překročení maxInput capu od překročení menšího count při vyšším capu. JSON-roundtrip receipt se úmyslně změní během HTTP v obou směrech; navýšení nesmí dodatečně rozšířit rezervaci a snížení nesmí zpětně přepsat původní budget. V žádném scénáři se skutečné 101/1/102 usage nefalšuje na count 100.

Ověření:

- [Skutečné RED regrese](../../../.cache/rag-auto-openai-pdf-20261028/root-review-red.log) před opravami: 12 testů, 2 PASS / 10 FAIL, exit 1. Selhání zahrnují únik listeneru, nesprávně přesměrovanou cancellation a neodmítnutý nadlimitní input.
- [Cílené GREEN](../../../.cache/rag-auto-openai-pdf-20261028/root-review-green.log) po opravách: **12/12 PASS**, exit 0.
- Stejný přímý Node/tsx příkaz nad celým vlastním testovým souborem: **67 PASS, 0 FAIL, 0 SKIP**, přibližně 580 ms, exit 0; [log](../../../.cache/rag-auto-openai-pdf-20261028/root-review-tests-final.log).
- Stejný scoped strict TypeScript příkaz nad dvěma soubory: exit 0; [log](../../../.cache/rag-auto-openai-pdf-20261028/root-review-typecheck-final.log). Prettier check obou souborů: exit 0; [log](../../../.cache/rag-auto-openai-pdf-20261028/root-review-format-final.log).

Nový [manifest](../../../.cache/rag-auto-openai-pdf-20261028/root-review-manifest.json) z `2026-10-28T21:12:44.381Z` zachovává zdroje i testy:

- `server/rag-pdf-extraction.ts`: 33305 bytes, SHA-256 `57372e7a9e951ae10a625527fc2dfbe243c40eb8865602cc28cd2d507bb3c024`.
- `tests/rag-pdf-extraction.test.ts`: 38947 bytes, SHA-256 `a07285407678c0952a51c7a01e7a50aea11ab40ba581cd5da2a54a0a8a0af3ee`.

Původní manifest, logy i uzavřená signature regrese zůstaly beze změny. Žádné placené API, klíč, Python, DB, instalace, build, server, staging nebo commit. Všechny vlastní krátké kontroly doběhly; žádné pomocné procesy nezůstávají. Po doplnění předání následuje opět release a převzetí koordinátorem pro re-review/integraci.

Root převzal přesný nový checkpoint. Původní nezávislý reviewer zopakoval oba konkrétní scénáře: 0 listenerů po mutaci signal, chyba se skutečným usage při input 101 nad rezervaci/cap 100, změna JSON receipt během callbacku guardy nezmění a nižší skutečné usage 99 zůstává platné. Oba P2 jsou uzavřené bez další doložené regrese. Šlo o čtyři fake HTTP volání v paměti, žádné skutečné API nebo nové soubory. Navazující živý pilot má samostatný omezený task; komponentový výsledek sám netvrdí jeho dokončení.
