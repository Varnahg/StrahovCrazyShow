# Předání: docker-packaging-20261019

- Vlastník: `docker-01a155e8-packaging`; příjemce: `docker-01a155e8-root`.
- Pracovní kopie: `C:/Users/rezac/.codex/worktrees/docker-single-container/StrahovCrazyShow`, větev `codex/docker-single-container`, výchozí commit `856032d6f63f020ebeb45079d2130a114433521a`.
- Výsledek: připravený multi-stage Dockerfile, jediná Compose služba `game`, kontrola runtime LFS pointerů a její CLI regrese. Skutečný image build a herní přejímku provádí integrátor; toto předání samo nepotvrzuje fungující kontejner.
- Změněné soubory: `Dockerfile`, `.dockerignore`, `compose.yaml`, `scripts/check-runtime-assets.mjs`, `tests/runtime-assets.test.ts`, toto předání. Dočasné testovací fixtures vznikly v `.cache/docker-packaging-tests/` a byly odstraněny testovým finally blokem.
- Cizí WIP: při claimu byl přítomen pouze rootův spec. Soubory runtime agenta, rootův package/lock/spec a smoke runner nejsou součástí tohoto předání. Nic z jejich diffů nebylo převzato ani commitnuto.

## Návrh a podklady

Výzkum 19. 10. 2026 vycházel z package/lock/workspace, tsconfig, importů klienta/serveru/shared/tests, public inventáře, LFS seznamu a skutečných pinovaných tsx/Colyseus balíčků. Primární zdroje: [Docker multi-stage](https://docs.docker.com/build/building/multi-stage/), [pnpm Docker](https://pnpm.io/docker), [Node24 TypeScript](https://nodejs.org/docs/latest-v24.x/api/typescript.html). Volbu a alternativy drží rootův [spec](../../../_bmad-output/implementation-artifacts/docker-20261019/spec.md).

Image používá `node:24-bookworm-slim`; builder instaluje pnpm11.25.0 a zamčené závislosti s předem dostupným workspace/patch souborem. Samostatná production-dependencies fáze nezahrnuje dev nástroje. Runtime kopíruje server, shared, dist, package, úplný tsconfig a produkční node_modules. Spouští přímo `node --import tsx server/index.ts` jako uživatel `node`; pnpm/Vite nemají runtime proces. Přesun tsx mezi dependencies a přímý Express jsou odpovědností root tasku.

Docker-only build nastavuje `VITE_MULTIPLAYER_URL=/`. Interně poslouchá `0.0.0.0:2567` a podává `/app/dist`; Compose publikuje výchozí `127.0.0.1:8080` s `BIND_ADDRESS`/`HTTP_PORT` overrides. Healthcheck používá Node fetch s abortem4s a timeoutem5s, restart policy je `unless-stopped`, shutdown grace30s. Nejsou hostitelské mounty, další služby ani init wrapper.

Build context explicitně ponechává veškeré public a klientské/serverové/shared/testové/scriptové vstupy. Character source JSON fixtures potřebné pro tsc zůstávají zahrnuté; Git, cache, lokální prostředí, výzkumné archivy a autorské binární zdroje nikoli. Filtr neřeší zmenšování veřejné sady modelů, což by bylo samostatnou změnou assetů.

## Refaktoring a lifecycle

LFS kontrola prochází strom jedinou funkcí, sdílí128B buffer, nesčítá velká modelová těla do paměti a file handle vždy zavře v finally. Reportuje všechny nalezené pointery v deterministickém pořadí a končí nenulovým statusem. Testovací helper vlastní jen svůj mkdtemp adresář a vždy jej odstraní. Runtime nepřidává druhý signal handler ani diagnostický diskový store.

## Skutečné ověření

Ověřeno 19. 10. 2026 před předáním v21:03UTC; průběžné výstupy jsou v tool logu relace.

- `node --import tsx --test tests/runtime-assets.test.ts`: exit0, **3/3**. Skutečná binární data a textová zmínka o pointeru projdou; vnořené LF/CRLF pointery končí exit1 s cestami a návodem; chybějící public adresář končí exit1.
- `docker compose config`: exit0; jedna služba `game`, `127.0.0.1:8080 -> 2567`, restart `unless-stopped`, grace30s.
- Stejná kontrola s `HTTP_PORT=18080`, `BIND_ADDRESS=0.0.0.0`: exit0; překládá přesně požadovaný bind/port.
- `node scripts/check-runtime-assets.mjs` nad skutečným public tohoto worktree: **exit1**, nalezeny unresolved pointery `models/vegetation/realistic/strahov-individual-trees.glb` a `models/vegetation/runtime/far.glb`. Kontrola tedy prokázala skutečný neúplný build vstup. Root byl upozorněn, aby LFS hydratoval před buildem; tento agent assety neupravoval.
- Prettier provedl pouze formátování Compose, skriptu a testu. **Neočekávaný vedlejší efekt:** `pnpm exec prettier --write ...` nejprve automaticky instaloval150 balíčků do node_modules, které vlastní root. Příkaz skončil exit0, ale vypsal ENOENT pro bin wrapper `conc.ps1`. Root dostal okamžité upozornění na možný souběh jeho instalace. Tento agent po zjištění nespouštěl další pnpm příkazy; opravu/ověření instalace řídí root. Manifest/lock nebyl tímto agentem ručně měněn.

## Identita předaného obsahu

SHA-256 po formátování, včetně testu:

| Soubor | SHA-256 |
|---|---|
| Dockerfile | `b9f02803a73029f55b1fe9e4a72f90d7c15ec6fcbf24a1f5dbf38325fcfb9726` |
| .dockerignore | `d032a8d58d4d3c6ad85728379cd20260c24884a2ef1d050d658c56d75f385011` |
| compose.yaml | `5236520d2919889e7022ccd7579605bad56902f0b51ebedd45c49f7ce2f4f120` |
| scripts/check-runtime-assets.mjs | `6b4f806237624c7d65ca4af24c80f2d4fa2ddbcffc7fae91cbb9f4c32f536410` |
| tests/runtime-assets.test.ts | `f9535ec8b141f865ad0b6562be4df5eb473f99325590b7814946316aa8d35126` |

## Procesy, omezení a převzetí

Žádný server, port ani Docker build nebyl spuštěn. Všechny vlastní krátké příkazy skončily: formatter session74901 exit0, real-asset-check session21577 exit1. Cizí root install PID3920 nebyl ukončen ani upravován. Nezůstává vlastní pomocný proces.

Celá sada testů, build, integrace, image build, browser a stop/start nebyly spuštěny, protože tyto zdroje vlastní root validační task. Finální přijetí musí zahrnout hydratovaný LFS obsah, funkční dependency install, reálné Docker sestavení a kontrolu neprivilegovaného runtime/health/shutdown.

Rezervaci po odeslání předání uvolňuje vlastník pomocí CLI; uvolnění není označení Done. Root přebírá tento rozsah, provádí full validaci a teprve potom aktualizuje stav tasku a integruje konkrétní vlastní soubory.
