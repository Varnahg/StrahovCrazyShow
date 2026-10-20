# Předání: feedback-client-20261020

- Vlastník původní implementace: `feedback-impl-01a15a3e-client`; navazující review: `feedback-impl-01a15a3e-client-r2`; příjemce: koordinátor `/root`.
- Pracovní kopie: `C:/Users/rezac/Documents/GitHub/StrahovCrazyShow/.cache/player-feedback-20261020`, větev `codex/player-feedback-20261020`, výchozí commit `c713c2aedcafdb02358f05e4c9c51b607edeebc4`.
- Výsledek: připravená klientská komponenta a persistentní outbox; bez commitu, integraci a skutečnou browser přejímku provádí root.
- Změněné soubory: `client/feedback.tsx`, `client/feedback.css`, `client/feedback-outbox.ts`, `tests/feedback-outbox.test.ts`, `tests/feedback-form.test.ts`, `scripts/feedback-browser.ts`, `tests/fixtures/feedback-browser/{index.html,main.tsx,capture.ts}`, `.github/workflows/feedback-browser.yml`, toto předání. CSS bylo vytvořeno původní implementací, při review se neměnilo.
- Cizí WIP: žádný převzat. Kontrakt `shared/feedback.ts` se pouze četl. Koordinátor/server/capture souběžně zapisují své oddělené soubory; nedotčeno.

## Podklady, alternativy a rozhodnutí

Přečteny AGENTS, architektura/koordinace/current-work, BMAD policy, aktuální specifikace a výzkum KEY-51. Lokálně ověřeny React 19, `useLocale`, `useDialogFocus`, formulářový/stylový vzor deníku a existující SSR test loader pro CSS. Dne 20. 10. 2026 byly znovu otevřeny primární dokumentace [IndexedDB](https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API/Using_IndexedDB), [native showModal](https://developer.mozilla.org/en-US/docs/Web/API/HTMLDialogElement/showModal) a [WAI dialog](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/).

- Native dialog proti vlastnímu backdrop/focus managementu: zvolen `showModal()` kvůli nativnímu inert pozadí a modal lifecycle, doplněn existující focus hook pro Tab/Escape/návrat focusu. Fallback `open` slouží prostředím bez dialog API; skutečné browser chování je nutno ověřit integračně.
- Paměťová fronta nemůže obnovit upload po reloadu; localStorage není vhodné pro Blob. Zvolen IndexedDB s atomickým read/write reducerem. Limity se kontrolují ve stejné transakci jako insert a Blob jiného reportu se při změně stavů zbytečně nepřepisuje.
- Retry používá stále stejné ID a uloženou obálku. Pozitivní stav vyžaduje 2xx, `accepted:true`, shodné ID a platný čas receipt. Terminální 4xx jsou zablokované do explicitního ručního retry; žádný automatický 413 loop. Výjimky 408 a 429 jsou dočasné a používají stejný bounded retry jako 5xx/síť/timeout/nesprávný receipt: nejvýše 5 automatických pokusů s backoffem 2 s / 10 s / 30 s / 120 s a timeoutem 12 s na request. Viz navazující review níže pro Retry-After.
- Expirace proti tiché ztrátě: po 7 dnech se hlášení už neposílá automaticky ani tlačítkem retry. Zůstává v pevně omezené kapacitě 5 reportů / 20 MiB, s explicitním varováním, exportem JSON + původního obrazu a odstraněním. Nové hlášení nemůže tiše vytlačit starší. Toto je záměrná reziduální retence do lidského rozhodnutí, nikoli tvrzení o doručení.

## API a integrace

`FeedbackDialog({open,onClose,getContext,capture})` odpovídá přidělení. Při otevření se jednou spustí capture, text je okamžitě přístupný; pending lze výslovně odebrat a pokračovat bez obrazu. Watchdog 6 s zabrání trvale čekajícímu UI. AbortSignal + generace chrání před starým výsledkem, URL a draft Blob se uvolní při odstranění, zavření nebo unmountu. Popis/kontakt zůstávají při síťovém queued výsledku i storage chybě zachované. Při skutečném receipt se vyčistí. Všechny viditelné copy/stavy jsou lokální CS/EN bez změny globálního katalogu.

`FeedbackOutbox`: `enqueue(report,image) -> accepted/queued`, `start`, `list`, `flush`, `retry(id?)`, `remove(id)`, `subscribe(listener)` (volitelný argument listeneru je právě přijatý receipt), `expired(entry)`, `dispose`. Injekce `FeedbackStorage`, fetch, hodiny, online a events umožňují skutečné testy stavového stroje. Konstruktor nic neposílá. Idempotentní `start()` při mountu komponenty obnoví pouze dříve uložená explicitně odeslaná pending, i když je prohlížeč už online a dialog zůstává zavřený. Další otevření `flush()` také zkouší pouze tyto entry; aktuální nový draft se nikdy neposílá před Send. Privacy CS/EN výslovně rozlišuje nové odeslání od starších automatických retry. Serverový agent potvrdil multipart pole `metadata` a `screenshot`.

Dispose ukončí vlastní requesty, listener a timer a zavře IDB spojení. Persistentní reporty nemaže. Při SSR není spuštěn capture, upload ani IndexedDB.

## Refaktoring a ověření

- Sjednocené ověřování přes shared allowlist; oddělený transport/persistence od Reactu. Bez herní per-frame práce, dalšího renderu či změny enginu. Pouze jeden URL náhled a jeden capture aktuální generace. Retry timer má vlastní generaci, souběžné enqueue/flush sdílí jeden in-flight request na ID.
- `pnpm exec tsx --test tests/feedback-outbox.test.ts tests/feedback-form.test.ts`: po review opravě 12/12, exit 0. Online reload obnovený samotným idempotentním startupem bez online eventu, otevření dialogu či ručního flush; prázdný startup bez uploadu; dispose během obnovy bez uploadu/beze ztráty entry; skutečná Blob data/MIME ve FormData, atomický count i byte budget (včetně dvou instancí), concurrency, validní/nevalidní receipt a accepted event, 4xx/413/429, bounded backoff/reload/expiry, online/dispose/abort, timeout, quota, validace přílohy a odstranění při probíhajícím requestu. SSR test skutečně renderuje CS/EN, required/label/dialog strukturu a nevyvolaný capture; není vydáván za browser focus test.
- `pnpm exec tsc --noEmit`: exit 0 i po navazující review opravě online reloadu, rozšíření testů a všech posledních produkčních změnách.
- `pnpm exec prettier --check client/feedback.tsx client/feedback.css client/feedback-outbox.ts tests/feedback-outbox.test.ts tests/feedback-form.test.ts`: exit 0 nad finálními soubory.
- Nebyl spuštěn build/celá sada/server/GPU ani vlastní browser; root má integrační a validation rezervaci. MemoryStorage test dokládá stavový stroj a transakční kontrakt, nikoli runtime IDB konkrétního prohlížeče. Rootovi výslovně předáno doplnit actual IDB/reload, native focus/Tab/Escape, rapid reopen a revokaci URL v browseru.
- Vlastní dlouhožijící procesy/porty: žádné; pouze skončené cílené testy/tsc/prettier.

## Snapshot zdrojů

Historický SHA-256 klientského obsahu po první review opravě startupu; aktuální review manifest je v poslední sekci. Identitu celého integračního checkpointu předá root samostatně:

| Soubor | SHA-256 |
|---|---|
| client/feedback.tsx | 8A26B1D9DE79372BAE72C3AA8EEFF9C1394A102EEA004F752A671A6D0C0D7062 |
| client/feedback.css | 3C926F724C503B3B28AC857A5C4A819EE6FDA4BEF3A3A01ECAA79F98121A6F7A |
| client/feedback-outbox.ts | 5AC2B01D5884352309543555933368A7D171A3CBD1D46F649B4B0C7E88232CC4 |
| tests/feedback-outbox.test.ts | 1F426935D1AC7DEEAD6FF82445697B86F0D0C05C319D2D985BB31616CABFFD37 |
| tests/feedback-form.test.ts | E1258996285B5F2D4E868FCC718A190AC1A41E739584C3B9D7544CB5806EEBCC |

Rezervace bude uvolněna po tomto předání; `release` neznamená integrační Done. Task status/Linear/evidence a commit aktualizuje pouze koordinátor.

## Navazující review oprava: online reload

Koordinátor doložil konkrétní chybějící lifecycle: mount původně pouze četl frontu a online reload nevyvolá `online` event. Varianta flush až po opětovném otevření formuláře proto nebyla dostatečná. Zvolen explicitní idempotentní `start()` volaný komponentou při mountu po přihlášení listeneru; proti automatickému requestu v konstruktoru zachovává jasného vlastníka start/stop a snadné testování. Obnovuje jen dříve uložená explicitně odeslaná entry, respektuje stejný backoff/attempt budget/expiry/4xx blokace a nevkládá nový draft do storage. Nový test prochází bez ručního flush a bez online události; souběžné starty se sloučí. Dispose během čekajícího restore nezačne upload a zachová entry. Původních vlastních šest souborů bylo před opravou doloženě převzato stejným ownerem přes `--adopt-dirty`; cizí změny ani credentials nebyly čteny/převzaty.

## Druhé review: 408/429, native focus a automatická browser regrese

Výchozí review checkpoint `7b6d02d69cff3de7e8f99041a9a0299dceda46f6`. Nový owner `feedback-impl-01a15a3e-client-r2` získal rozšířený client task; `--adopt-dirty` převzal pouze rootem výslovně předaný native focus diff v `client/feedback.tsx` (zachovaný nativní showModal a návrat na připojený trigger). Ostatní WIP se neměnil, credentials se nečetly.

- **408/429:** terminální blokace zůstala pro validační/ostatní 4xx, dvě dočasné odpovědi používají existující omezený retry. HTTP `Retry-After` u 429 přijímá celé sekundy nebo HTTP datum, ignoruje neplatné hodnoty a čekání omezí na 5 minut. Skutečné čekání je nejméně běžný backoff; explicitní retry neobchází uložený 429 deadline. Věk, maximální automatické pokusy a stejné ID/metadata zůstaly zachované. Primární podklad: [RFC 9110 §10.2.3](https://www.rfc-editor.org/rfc/rfc9110.html#name-retry-after).
- **Focus:** popis dostal standardní React `autoFocus`, který nativní dialog respektuje i při prvním mouse/F8 otevření. Při opětovném otevření po accepted výsledku se textarea znovu mountuje po resetu výsledku a autofocus míří na skutečný vstup. Rootův nativní trigger restore zůstává. Není přidaný druhý trap do native cesty; native browser chrome může při Tab vykazovat activeElement BODY, ale background aplikační controls zůstávají inert. Podklad: [MDN native dialog/autofocus](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/dialog).
- **Obnovené přijetí:** jediný bounded boolean přidává lokalizované „Dříve odeslané hlášení bylo přijato“ / „Your earlier report was received“, pokud receipt nesouvisí s aktuálním draftem. Nezakládá trvalou historii a nemaže ani nepřepisuje současný text.
- **Browser fixture:** tři malé fixture soubory importují skutečný produkční FeedbackDialog a nativní IndexedDB; deterministický 1×1 PNG nevyžaduje Babylon ani GPU scénu. Samostatný runner buduje pouze tento Vite entry a obsluhuje pouze testový loopback server. Produkční app/API nemají žádnou novou debug route či globální stav. Testový HTTP receiver poskytuje matching receipt a viditelnou přesnou metadata/image evidenci; není vydáván za produkční disk spool nebo Linear.
- **Automatizace:** runner přes skutečný Chromium `context.setOffline(true)` odešle popis + PNG přes skutečný React formulář, vyžaduje viditelný queued stav a absenci accepted, přečte skutečný IDB Blob, zavře stránku, obnoví online síť a otevře novou stránku. Vyžaduje automatické doručení před otevřením dialogu, shodný raw metadata JSON/obálku/obrazové bajty, matching receipt notice a prázdné IDB. Dále testuje první mouse otevření, první F8 otevření po reloadu, Enter, native modal/inert kontrakt při Tab, návrat na trigger, opětovné otevření po accepted, CS/EN a šířku 360 px. Žádná mocked IndexedDB ani browser-fetch injekce.

### Spuštění pro integrátora

Pod příslušnou validation/port rezervací:

```powershell
pnpm exec tsx scripts/feedback-browser.ts --serve-only
```

Výchozí URL je `http://127.0.0.1:4207/`. Viditelné ovládání: Open feedback / Čeština / English / Hold receipts (503) / Accept receipts / Reload fixture, dále nativní IDB a serverová evidence. Pro ruční průchod lze podržet receipt, odeslat skutečný formulář, zavřít dialog a reloadovat; po Accept se uložené hlášení odešle při plánovaném retry (nebo ručním retry v pending). Skutečné offline přepnutí sítě a zavření browser stránky automatizuje default runner:

```powershell
pnpm exec playwright install --with-deps chromium
pnpm exec tsx scripts/feedback-browser.ts
```

`--build-only` pouze sestaví fixture, `--skip-build` použije již sestavený výstup. `FEEDBACK_BROWSER_PORT` mění výchozí 4207; `FEEDBACK_BROWSER_OUTPUT` může změnit výstup pouze na potomka `.cache/player-feedback-validation/` (výchozí `browser-fixture`). Runner nikdy nemaže kořen cache a odmítne výstup mimo vyhrazený strom. Evidence je v `<output>-evidence/result.json`, při chybě také `failure.json` a pokud je stránka dostupná `failure.png`. Browser/context/server se při chybě ukončí. `--serve-only` nevytváří žádný browser proces a končí Ctrl+C.

Samostatný GitHub workflow instaluje stejný připnutý Node/pnpm a frozen lockfile jako běžná CI, cílené CPU testy, Chromium odpovídající zamčenému Playwright a default runner. Fixture nečte LFS herní assety a nepotřebuje produkční build/server/secrets. Ostatní plné gates zůstávají v existující CI.

### Skutečné ověření tohoto review

- `pnpm exec tsx --test tests/feedback-outbox.test.ts tests/feedback-form.test.ts`: **14/14**, exit 0. Nové meaningful regrese pro 408/429 backoff/attempt budget/expiry, integer/date/invalid/past/large Retry-After, ruční rate-limit retry a zachované terminální 4xx; SSR navíc skutečný autofocus atribut.
- Cílené `pnpm exec tsc --noEmit --target ES2022 --lib ES2022,DOM,DOM.Iterable --module ESNext --moduleResolution Bundler --jsx react-jsx --strict --skipLibCheck --esModuleInterop --allowImportingTsExtensions --types node,vite/client client/feedback.tsx client/feedback-outbox.ts tests/feedback-outbox.test.ts tests/feedback-form.test.ts scripts/feedback-browser.ts tests/fixtures/feedback-browser/main.tsx tests/fixtures/feedback-browser/capture.ts`: **exit 0**.
- Prettier check přes tyto zdroje + fixture HTML + workflow: **exit 0**. Existující čtyři upravované klientské/testové soubory mají v HEAD i po editaci původní LF (0 CRLF); žádná hromadná změna EOL.
- **Na výslovný pokyn root se lokálně nespouštěl build, server ani browser runner.** Skutečný runtime browser výsledek tohoto nového harnessu zatím není doložen; jeho první přejímku a plné gates provede root. Předchozí rootův reálný IAB/Linear průchod zůstává samostatným důkazem a zde není nahrazen fixturem.
- Refaktoring je omezený: jeden parser bounded Retry-After, existující state machine beze druhé fronty, jediný native autofocus a jediná bounded prior-ack informace. Vlastní dlouhožijící procesy/porty/GPU: žádné. Review task se uvolňuje po předání; integrátor vlastní další spuštění a commit.

### Aktuální SHA-256 manifest včetně testů a harnessu

| Soubor | SHA-256 |
|---|---|
| client/feedback.tsx | 75561573835FA115352FA6C61939CD0EC6DB4D11C2718273B24798CCDC3BCADF |
| client/feedback.css | 3C926F724C503B3B28AC857A5C4A819EE6FDA4BEF3A3A01ECAA79F98121A6F7A |
| client/feedback-outbox.ts | 8A0FA1FF5D598944BD9FBFE99510E971DDDBA32900BEBFA5C3B32B6BD5908188 |
| tests/feedback-outbox.test.ts | D56033B8E7575009CC4B335E243292C643F4406365876566614FC0D2DB4FB3D3 |
| tests/feedback-form.test.ts | 77BA7724AD0448935C32B970A56EEE7CBEA108F3775C047A43EC12AFB4190DA6 |
| scripts/feedback-browser.ts | C2D07780C3F076FFA898A45FFC4467B066FD937873896708CAA8FEB77ECB6CE8 |
| tests/fixtures/feedback-browser/index.html | D846A5FE0B808AE2554886B354F843CDBA8935EB71957939DBB6C08D66A67F9E |
| tests/fixtures/feedback-browser/main.tsx | E27F13EF02566AC9835FF7C9892E5B4566F504271F8C5E8AECE5B7207F35135B |
| tests/fixtures/feedback-browser/capture.ts | 66B941D0C2F50A9FC419DA25055957B1A38F85A80CBB9DF68E02FF46A1FC7245 |
| .github/workflows/feedback-browser.yml | 04E69A24818B1765C2AD1F9E13EF250320A72CC973ACD236F5BBBE3597C33063 |


## Přijetí integračního zapojení CI

Integrátor po odmítnutí pushe nového workflow (OAuth bez workflow scope) nahradil samostatnou workflow definici testem tests/feedback-browser.test.ts v existující pnpm test/verify sadě. Runner přijímá FEEDBACK_BROWSER_CHANNEL=chrome pro předinstalovaný Linux CI Chrome. Žádná další oprávnění nebyla vyžádána. Původní výše uvedený manifest workflow je historickým předáním; finální scope a CI výsledek určuje integrační checkpoint.
