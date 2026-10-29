# Předání: automatic-diagnostics-storage

- Vlastník: `diagnostics-storage-01a13624-b`; příjemce: koordinátor `diagnostics-01a13624-root`.
- Pracovní kopie: `C:/Users/rezac/Documents/GitHub/StrahovCrazyShow`, větev `main`, výchozí commit `91ee88f0aaa902c79fad589aeb84bc086a66c9ea`.
- Výsledek: hotový automatický lokální HTTP sběr a čtecí CLI. `GET /api/diagnostics/session/status` nevyžaduje env opt-in; `POST /api/diagnostics/session` ukládá validované dávky do ignorované `.cache/game-diagnostics/`. Registrace handleru před starým benchmark endpointem a obecnými API hlavičkami. Nikde není HTTP čtení záznamů, seznam návštěvníků ani multiplayerová přítomnost.
- Změněné soubory: `server/session-diagnostics.ts`, `server/index.ts`, `scripts/diagnostics-report.mjs`, `tests/session-diagnostics-server.test.ts`, `tests/diagnostics-report.test.ts`, tento handoff. `shared/session-diagnostics.ts` vlastní a předává agent recorder.
- Cizí WIP: nepřevzat. Společný `server/index.ts` byl před rezervací čistý; integrace má pouze import, vytvoření handleru a volání před původním benchmarkem. Původní služby5173/2567 zůstávají v držení `local-dev-20261013`.
- Bezpečnost/provoz: loopback listen/local/remote socket; přesná shoda místního `Host` a `Origin` nebo GET `Referer`; odmítnutý cross-site fetch. Vite proxy musí zachovat Host (`changeOrigin:false`, opravu konfigurace vlastní koordinátor). JSON max128KiB,128 záznamů, fronta16,120 pokusů/min. Sdílená sanitizace odstraňuje profil/chat/identity/přihlašovací hodnoty a URL query; sanitizace se opakuje před diskem.
- Životní cyklus: globálně serializované appendy s flush. Stabilní retry vrací původní ACK; konfliktní stejné batchId nebo starší sekvence409. Po restartu obnova z existujících JSONL; normální nové dávky nečtou celou historii. Paměťový ACK cache má64 relací. Pádový neúplný řádek zůstává jako důkaz, následný zápis začíná novým řádkem.
- Retence: rotace16MiB na soubor; celkem128MiB,7 dní a256 souborů. Odstraňují se jen vlastní UUID JSONL soubory. Hlavička ukládá limity, číslo části a již provedené odstranění. Retence a chybějící sekvence jsou v reportu zřetelné; nejde o neomezený archiv.
- Identita zdrojů: HEAD, SHA256 klient/server/shared/scripts/tests textových zdrojů a konfigurace, dirty/null, volitelný produkční snapshot env, čas a přesný rozsah. Binární modely a dependency cache nejsou hashovány. Zdroj je výslovně neatomický pozorovaný pracovní strom při příjmu, nikoli tvrzení o nezměnitelnosti browseru. Každých30s se kontroluje manifest jméno/mtime/velikost; obsah se znovu hashne pouze při změně. Identitu buildu klienta dodává integrátor samostatným game-start záznamem.
- CLI: `node scripts/diagnostics-report.mjs [file-or-directory] [--all] [--json]`; výchozí poslední dochovaná relace, její rotované části se spojí. Skutečné globální nearest-rank p95/p99 z doručených intervalů, oddělené hidden/transition mezery, chyby včetně HTTP>=400, nejhorší hitches/tasks, nastavení/UI/avatar změny, zdroje, mezery, duplicitní a neúplné řádky. Pouze čte.
- Podklady: existující `server/local-benchmarks.ts` a whitelist, skutečná Vite proxy, lokální Node24 API; 13.10.2026 primární dokumentace [Node filesystem promises/append flush](https://nodejs.org/docs/latest-v24.x/api/fs.html#fspromisesappendfilepath-data-options), [Origin](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Origin). Geometrické/mapové údaje se neměnily.
- Refaktoring: jeden gate původu požadavku, jedna serializovaná cesta zápisu/rotace/retry, sdílený validator, jediné percentilové vyhodnocení ze skutečných snímků. Hash cache odstraňuje opakované čtení celého stromu při stabilním hraní; žádný timer/proces založený modulem mimo příjem HTTP.
- Ověření: `pnpm exec tsx --test tests/session-diagnostics-server.test.ts tests/diagnostics-report.test.ts` **13/13 PASS**, exit0,13.10.2026 18:59 Praha. Ověřené chyby+libovolný počet avatarů, normalizace UUID, retry/restart/konflikt, nedůvěryhodný origin, Host proxy, JSON a deklarovaný/chunked size limit, rotace/retence, pádový tail, zdrojový hash, percentily,9800ms návrat z pozadí, HTTP404, UI/avatar změny. První běh10/11 měl chybu testovacího Host override přes fetch; fixture opravena na skutečný `http.request`, gate se neuvolňoval. Další11/11 a finální13/13 prošly.
- Další kontrola: Prettier nad vlastními novými soubory; `git diff --check -- server/index.ts` bez chyb. Plain Node `--help` a `--json` nad aktuálně vzniklým lokálním záznamem funguje a otevřeně hlásí původní recording-gap. Žádné zápisy reportu.
- Snapshot SHA256 včetně testů (předání18:59 Praha):
  - `server/session-diagnostics.ts`: `6981b37b2af17202ade9158a6baa96e89642fc849022630accc513e9556eb295`
  - `server/index.ts`: `1e43a4ac39a4b5e33968da5ee7070eb3f47386066037065210167141b478fb8e`
  - `scripts/diagnostics-report.mjs`: `c683d2e5b3014fab9249d2a67c9186648c538474013d10a1262aa92dbf659e00`
  - `tests/session-diagnostics-server.test.ts`: `3e67d65f2baae2492371a76730bd08fef68b02dd6e0cbb5f3f16cbeb15766eae`
  - `tests/diagnostics-report.test.ts`: `b2627fa81ec76cda1879d4994029022b0002939a2233cb3f0d05d0ae18795ebc`
- Procesy/zdroje: jen krátké cílené testy s dočasnými lokálními HTTP listenery a dočasnými adresáři; test fixtures vše zavřely/odstranily. Žádný vlastní dlouhožijící proces, GPU, build ani celá testovací sada.
- Omezení: příjem disk logů běží v jednom serverovém procesu; nejde o koordinaci více serverů zapisujících stejnou relaci. Stav každých30s je observation cache, nikoli okamžitý snapshot HMR. Abrupt crash může ztratit nedoručený klientský konec; no-session-end a recording-gap se neskrývají. Praktickou hru a plnou test/build/integraci drží koordinátor.
- Rezervace: handoff dokončen; následně `release --task automatic-diagnostics-storage --owner diagnostics-storage-01a13624-b`. Stav tasku a převzetí mění koordinátor.

## Oprava typování testů po integračním buildu

Koordinátor předal tři chyby kompilace z `.cache/automatic-diagnostics-validation/build.log` po úspěšných728 runtime testech. Původní vlastník si rezervaci znovu převzal s `--adopt-dirty` podle tohoto handoffu. Změněny pouze dva vlastní testy: jednostrunný namespace import udržuje direktivu `@ts-expect-error` přímo nad importem JS CLI; pole odmítaných HTTP hlaviček má explicitní `Record<string,string>[]`. Runtime serveru, reportu a schéma se nezměnily.

`pnpm exec tsc --noEmit --strict --skipLibCheck --target ES2022 --module ESNext --moduleResolution Bundler --types node --allowImportingTsExtensions tests/diagnostics-report.test.ts tests/session-diagnostics-server.test.ts` prošel exit0. Opakované cílené testy **13/13 PASS**. Prettier upravil pouze vlastní test import. Nové SHA256 nahrazují odpovídající položky výše:

- `tests/diagnostics-report.test.ts`: `8582aeed7e2837138202af4215c7042b8a8b50bea8d8cf82e87b619804d39619`
- `tests/session-diagnostics-server.test.ts`: `b4b116afcf48dccbe8267835bf9ae2b020f623a291051d928df31b08193b6d69`

Žádný pomocný proces nezůstal běžet. Rezervace po tomto dodatku opět uvolněna; plný build/checkpoint opakuje koordinátor.
