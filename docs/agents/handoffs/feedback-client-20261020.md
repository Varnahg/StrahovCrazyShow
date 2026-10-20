# Předání: feedback-client-20261020

- Vlastník: `feedback-impl-01a15a3e-client`; příjemce: koordinátor `/root`.
- Pracovní kopie: `C:/Users/rezac/Documents/GitHub/StrahovCrazyShow/.cache/player-feedback-20261020`, větev `codex/player-feedback-20261020`, výchozí commit `c713c2aedcafdb02358f05e4c9c51b607edeebc4`.
- Výsledek: připravená klientská komponenta a persistentní outbox; bez commitu, integraci a skutečnou browser přejímku provádí root.
- Změněné soubory: `client/feedback.tsx`, `client/feedback.css`, `client/feedback-outbox.ts`, `tests/feedback-outbox.test.ts`, `tests/feedback-form.test.ts`, toto předání.
- Cizí WIP: žádný převzat. Kontrakt `shared/feedback.ts` se pouze četl. Koordinátor/server/capture souběžně zapisují své oddělené soubory; nedotčeno.

## Podklady, alternativy a rozhodnutí

Přečteny AGENTS, architektura/koordinace/current-work, BMAD policy, aktuální specifikace a výzkum KEY-51. Lokálně ověřeny React 19, `useLocale`, `useDialogFocus`, formulářový/stylový vzor deníku a existující SSR test loader pro CSS. Dne 20. 10. 2026 byly znovu otevřeny primární dokumentace [IndexedDB](https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API/Using_IndexedDB), [native showModal](https://developer.mozilla.org/en-US/docs/Web/API/HTMLDialogElement/showModal) a [WAI dialog](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/).

- Native dialog proti vlastnímu backdrop/focus managementu: zvolen `showModal()` kvůli nativnímu inert pozadí a modal lifecycle, doplněn existující focus hook pro Tab/Escape/návrat focusu. Fallback `open` slouží prostředím bez dialog API; skutečné browser chování je nutno ověřit integračně.
- Paměťová fronta nemůže obnovit upload po reloadu; localStorage není vhodné pro Blob. Zvolen IndexedDB s atomickým read/write reducerem. Limity se kontrolují ve stejné transakci jako insert a Blob jiného reportu se při změně stavů zbytečně nepřepisuje.
- Retry používá stále stejné ID a uloženou obálku. Pozitivní stav vyžaduje 2xx, `accepted:true`, shodné ID a platný čas receipt. 4xx jsou zablokované do explicitního ručního retry; žádný automatický 413 loop. 5xx/síť/timeout/nesprávný receipt mají nejvýše 5 automatických pokusů s backoffem 2 s / 10 s / 30 s / 120 s a timeoutem 12 s na request.
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

SHA-256 klientského obsahu včetně testů; identitu celého integračního checkpointu předá root samostatně:

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
