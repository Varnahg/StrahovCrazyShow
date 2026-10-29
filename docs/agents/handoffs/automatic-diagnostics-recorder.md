# Předání: automatic-diagnostics-recorder

- Vlastník: `diagnostics-recorder-01a13624-a`; příjemce: hlavní koordinátor `/root` (`diagnostics-01a13624-root`).
- Pracovní kopie: `C:/Users/rezac/Documents/GitHub/StrahovCrazyShow`, větev `main`, výchozí commit `91ee88f0aaa902c79fad589aeb84bc086a66c9ea`.
- Výsledek: dokončen samostatný automatický lokální recorder a sdílený přenosový kontrakt. Zapojení do hry/UI a skutečnou produkční přejímku vlastní koordinátor.
- Soubory: `client/session-diagnostics.ts`, `shared/session-diagnostics.ts`, `tests/session-diagnostics.test.ts`, tento handoff. Žádný převzatý cizí WIP; všechny tři implementační soubory byly nové.

## Chování a API

`sessionDiagnostics.start()` automaticky otevře UUID relaci pouze na localhost/loopback, připojí browserové události, ověří lokální capability a odešle první záznam. Není třeba zapínání nebo ruční export. `isRecording` je bezalokující stav pro render loop; `status()` vrací skutečně potvrzený zápis, frontu, ztráty a chybu. `recordFrame({frameStartedAtMs,frameMs,cpuMs,gpuMs,phases}, contextFactory)` ukládá všechny intervaly do oken; dražší kontext se čte jednou za sekundu, při propadech nejvýše čtyřikrát za sekundu. CPU fáze patří současnému renderu, interval předchozí práci: hitch nese předchozí CPU/fáze/kontext a přesný rAF čas, odděleně současnou práci. Přechod po skrytí/focusu je vlastní okno `visibility: "transition"`, aby nepoškodil statistiku viditelné hry.

Periodické ukládání běží po 5 sekundách, retry používá stejná serializovaná data a batch ID. Fronta má nejvýše 512 čekajících záznamů / 1 MiB a jeden přenášený batch do 128 KiB. Výpadky a překročení limitů se projeví ve stavu a `recording-gap`. Batch má nejvýše 128 záznamů, jednotlivý záznam 32 KiB. `pagehide` zkusí keepalive pouze do 60 KiB a ukončení bez BFCache označí jako `session-end`; doručení posledního konce po pádu nebo zavření nelze zaručit.

Zachycuje JS chyby, odmítnuté promises, resource error, browser focus/visibility/pagehide, podporované long tasks/long animation frames a jejich explicitní technické údaje. Úspěšné rychlé assety agreguje (počet/bajty/trvání), pomalé >=250 ms a neúspěšné požadavky uchovává jednotlivě; mají oddělený budget od hry/chyb. Konzole zachovává originální výstup a kopíruje pouze Error pole nebo známé technické prefixy projektu/Babylon/WebGL; ostatní objekty a uživatelské řetězce se neukládají. Dispose odstraní listenery, observer i vlastní console hooks, včetně HMR.

Sdílený validátor kontroluje obálku, velikosti, UUID, pořadí seq a tvar kind; UUID normalizuje na lowercase. Sanitizace kopíruje omezený čistý JSON strom, nečte gettery, zvládá cykly, odstraňuje citlivé klíče (chat/payload/profile/nickname/playerId/userId/accountId/credentials), URL query/fragmenty, URL credentials a běžná tajemství v technických chybách. Herní kontext musí být explicitně projektovaný call-site, nikoli libovolný stav aplikace.

## Podklady a refaktoring

Dne 13. 10. 2026 čteny skutečný kód a testy GPU diagnostiky, TypeScript konfigurace, pravidla koordinace a výpis technických `console.warn/error` call-site. Primární browserové podklady: [W3C Long Animation Frames](https://w3c.github.io/long-animation-frames/) a [W3C Long Tasks](https://www.w3.org/TR/longtasks-1/); podporu vždy ověřuje `supportedEntryTypes`. LoAF je pracovní specifikace a nikoli univerzálně dostupný GPU profil.

Refaktoring sjednotil serializaci/sanitizaci, práci s okny, resource souhrny, transport a lifecycle cleanup. Vykreslení neprovádí HTTP ani JSON serializaci každý snímek; per-frame drží kompaktní intervaly a omezené fáze. Kontrola emailů byla upravena tak, aby dlouhé technické řetězce bez `@` nezpůsobovaly kvadratický regex průchod. Duplicitní reference se kopírují, skutečné cykly se vynechají.

## Ověření

- `pnpm exec tsx --test tests/session-diagnostics.test.ts`: **12/12 PASS**, 13. 10. 2026, exit 0, poslední běh 576 ms. Pokrývá automatický start/ACK/source, veřejný host, všechny 240Hz intervaly, neměnnost kontextu, předchozí CPU versus současné, přesnou časovou kotvu, stabilní retry data, bounded offline frontu a mezery, visibility přechody, sanitizaci, validační limity, asset storm 400 zdrojů se zachováním game-ready/chyby a lifecycle observer/console, odmítnutí vadné ACK.
- `pnpm exec tsc --noEmit --strict --skipLibCheck --esModuleInterop --target ES2022 --module ESNext --moduleResolution Bundler --lib 'ES2022,DOM' client/session-diagnostics.ts shared/session-diagnostics.ts tests/session-diagnostics.test.ts`: **PASS**, exit 0.
- Prettier pouze tři vlastněné soubory; `git diff --check -- client/session-diagnostics.ts shared/session-diagnostics.ts tests/session-diagnostics.test.ts`: exit 0 (nové soubory dosud untracked).
- První cílený běh odhalil hranici časového okna testu a limit pending počítající také in-flight záznamy; testy zpřesněny a výkon sanitizace opraven. Recenzní připomínky k rAF kotvě, visibility, čistému ukončení a přezdívkám zapracovány.
- Úplná sada/build/integrace/GPU nespouštěny: drží je koordinátor. Ten již prakticky pozoroval automatický zápis ve skutečné hře, následně upozornil na startup resource storm; nová regrese ověřuje opravu. Tato evidence není srovnávací GPU benchmark.

SHA-256 checkpoint včetně testu:

| Soubor | SHA-256 |
| --- | --- |
| `client/session-diagnostics.ts` | `75628B295A1AF78EDB3FEBF31CD0EB2A824B4714BE7E9FB615C7061526C15A45` |
| `shared/session-diagnostics.ts` | `D816504BE3BF111F087C3F135386C9E38271A20033E7A2B466D9CCDADAD594C9` |
| `tests/session-diagnostics.test.ts` | `9E1B3F6691F5A6FB3F12B142187B1B8097047F337EC7DA974EE5D3E685A008CD` |

- Procesy: žádné dlouhožijící ani síťové procesy nebyly spuštěny. Testovací CLI skončily; žádné GPU využití.
- Omezení: záznam je technická diagnostika s omezenými buffery, nikoli video nebo úplný profiler. Při nečekaném pádu lze ztratit neodeslaný konec; bounded retry může za dlouhého výpadku zahodit staré události a výslovně to zaznamená. Neuchovává uživatelský obsah ani libovolné console objekty.
- Rezervace: po sepsání handoffu uvolněna příkazem `release`; integrátor převezme finální soubory a stav tasku aktualizuje až po společném ověření.
