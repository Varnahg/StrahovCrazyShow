# Předání: docker-runtime-20261019

- Vlastník: `docker-01a155e8-runtime`; příjemce: koordinátor `docker-01a155e8-root`.
- Pracovní kopie: `C:/Users/rezac/.codex/worktrees/docker-single-container/StrahovCrazyShow`; výchozí HEAD `856032d6f63f020ebeb45079d2130a114433521a`. Bez vlastního commitu; integraci provede koordinátor.
- Výsledek: implementované a cíleně ověřené načtení `HOST`/`PORT`/`STATIC_DIR`, opt-in statický web, readiness a serverové omezení matchmakingu na `joinById`. Skutečnou hru a kontejner přejímá koordinátor.
- Změněné soubory: `server/index.ts`, nový `server/runtime.ts`, nový `tests/server-runtime.test.ts`, toto předání. Provozní log: `.cache/docker-runtime-tests/targeted-tests.log`.
- Cizí WIP: vlastní rozsah byl při claimu čistý; nebylo použito `--adopt-dirty`. Manifest/lockfile a Docker soubory mění koordinátor a souběžný packaging agent, nejsou součástí tohoto předání.

## Podklady a rozhodnutí

Výzkum 19. 10. 2026 vycházel ze skutečného `server/index.ts`, klientského `VITE_MULTIPLAYER_URL`, SDK 0.18.5, Colyseus core 0.18.9 a ws-transport 0.18.4. Express je přímá runtime závislost 5.3.0 připravená koordinátorem. Specifikace: `_bmad-output/implementation-artifacts/docker-20261019/spec.md`.

- Docker klient používá již existující build override `VITE_MULTIPLAYER_URL=/`; tento task nezasahuje do UI, dev proxy ani produkčního performance preview. Request/upgrade přepis by závisel na interním pořadí listenerů, proto není přidán.
- Bind zůstává bez konfigurace `127.0.0.1:2567`; veřejný bind v Dockeru deaktivuje stávající lokální diagnostické handlery před zápisem dat. `STATIC_DIR` musí být absolutní a obsahovat skutečný `index.html` ještě před startem simulace.
- Statika obsluhuje pouze explicitní adresář; MIME, HEAD, Range a ETag/Last-Modified poskytuje Express. Soubory se revalidují (`max-age=0`, bez `immutable`), protože GLB/textury nemají vždy hashovaný název. Chyby mají `no-store` a obecný text bez cest, chybějící asset se nezmění na index HTML. Dotfiles a traversal vracejí 403.
- Colyseus router obsluhuje frameworkové POST routy před Express middleware. Proto byl neúčinný Express guard nahrazen `matchMaker.controller.exposedMethods = ["joinById"]`; interní `createRoom()` pro jediný svět zůstává povolený. Odmítnutí proběhne před konstrukcí další fyziky.
- Readiness přejde na 200 až po vytvoření světa; `onBeforeShutdown` ji uzavře na 503. Pozdní dokončení startupu ji už neotevře. Signal handlers ani vypínací procesy se neduplikují. [Oficiální Colyseus lifecycle](https://docs.colyseus.io/server/graceful-shutdown) odpovídá pinovanému zdroji.

## Refaktoring a ověření

Konfigurace a HTTP statika jsou oddělené od herního entrypointu; readiness má jediný stav místo nezávislých příznaků. Statický middleware vzniká jednou při startupu, žádný filesystem scan ani alokace celého assetu nebyly přidány do request cesty. Herní stav a simulace se nemění.

Ověřeno 19. 10. 2026 přibližně 21:04 UTC:

- `node --import tsx --test tests/server-runtime.test.ts`: **PASS, 2/2 testy, exit 0**. Log v `.cache/docker-runtime-tests/targeted-tests.log`. Druhý test ověřuje skutečné HTTP: startup/shutdown 503, zdravou původní JSON odpověď, 403 soukromé fixture API, index HTML, JS/WASM/GLB MIME, 304, HEAD, 206 Range, chybějící assety 404 bez HTML fallbacku, dotfiles/traversal 403, neplatnou URL 400 a nepodporovanou metodu 405.
- `node node_modules/typescript/bin/tsc --noEmit --target ES2022 --module ESNext --moduleResolution Bundler --strict --skipLibCheck --esModuleInterop server/runtime.ts tests/server-runtime.test.ts`: **PASS, exit 0**, bez diagnostik. Nejde o úplnou typovou kontrolu projektu.
- Přímé formátování pouze nových vlastních souborů přes `node node_modules/prettier/bin/prettier.cjs --write server/runtime.ts tests/server-runtime.test.ts`: **PASS**. `git diff --check -- server/index.ts`: **PASS**. Skutečný diff entrypointu a nové soubory byly přečtené.
- Předpoklad, že `pnpm exec` pouze spustí formatter, se při souběžné instalaci ukázal chybný: pokus automaticky spustil vnořený install, formatter se nespustil. Vlastní ověřený řetězec `cmd 11196 → pnpm exec 16440 → install 19804` byl po koordinaci ukončen; vlastní session 56715 skončila exit 1. Koordinátorův PID 3920 nebyl ukončen. Následné příkazy již běžely přímo přes Node po potvrzeném dokončení frozen install; koordinátor zachoval schema 5.0.36. Tento pokus není vydáván za úspěšný test.

SHA-256 předávaných implementačních vstupů včetně testů:

| Soubor | SHA-256 |
| --- | --- |
| `server/index.ts` | `8432ef8ba57912596a2fce5feb7ba1fbb6e67d42456ba6ac1d4e9482ba2a2723` |
| `server/runtime.ts` | `3699393333ac62c8e3229592623d4b06920e6cb9cf40690fe68d35dfc05478d8` |
| `tests/server-runtime.test.ts` | `adeae43d6a626e13819fc0a9bee0a4c3ea1b52d042b1e0454cff0da540be454f` |

## Procesy, předání a omezení

Jediný vlastní HTTP server běžel uvnitř test runneru na rezervovaném `127.0.0.1:18081`; po testu byl uzavřen v `after` hooku. Fixture vznikla přes `mkdtemp` uvnitř rezervované `.cache/docker-runtime-tests/` a byla odstraněna až po ověření hranice adresáře. Následný `Get-NetTCPConnection -State Listen -LocalPort 18081` neukázal žádný listener. Žádný vlastní proces nezůstává běžet.

Rezervace se po zapsání tohoto předání uvolňuje přes `node scripts/agent-tasks.mjs release --task docker-runtime-20261019 --owner docker-01a155e8-runtime`; potvrzení dostane koordinátor. Pro plnou sadu musí koordinátor převzít také `port:18081` a `.cache/docker-runtime-tests/`. Stav tasku a přijetí aktualizuje koordinátor.

Nebyly spuštěné full suite/build, skutečný serverový bootstrap, SDK multiplayer, Docker ani GPU browser. Zejména pořadí skutečného Colyseus bootstrapu, odmítnutí veřejných create/join/joinOrCreate/reconnect, guest/privacy hranice, Docker shutdown/restart a produkční UI musí ověřit navazující integrační přejímka. Úspěšný lehký HTTP test dokládá pouze izolované HTTP helpery.
