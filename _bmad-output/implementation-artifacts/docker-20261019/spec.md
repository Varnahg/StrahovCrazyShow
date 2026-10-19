---
title: 'KEY-45: Web a multiplayer v jednom Docker kontejneru'
type: 'feature'
created: '2026-10-19'
status: 'done'
baseline_commit: '856032d6f63f020ebeb45079d2130a114433521a'
route: 'dispatch'
review_loop_iteration: 0
context: ['{project-root}/AGENTS.md', '{project-root}/docs/agents/bmad-policy.md']
---

<frozen-after-approval reason="Uživatel výslovně schválil plán a implementaci 19. 10. 2026">

## Intent

Projekt má poskytovat produkční web, API a multiplayer jediným Docker kontejnerem na localhost:8080 po docker compose up -d --build. Jeden Node proces obslouží všechny cesty; grafika běží v prohlížeči.

## Boundaries & Constraints

Zachovat jeden sdílený svět, izolaci hosta, dočasné relace a WebGL2 default. Restart resetuje paměťový svět. Bez databáze, GPU v kontejneru, změn hry/assetů nebo přebírání cizího WIP. Vývojové proxy a hrané immutable preview zůstávají stejné. Jeden kontejner; HTTPS může ukončovat vnější hostitelská proxy.

## I/O & Edge-Case Matrix

| Situace | Vstup | Výstup |
|---|---|---|
| Web | GET / a veřejný asset | skutečný build, správný MIME, podpora revalidace |
| Chybějící asset | GET neexistující JS/GLB | 404, nikoli HTML |
| Konfigurace | HOST/PORT/STATIC_DIR | default loopback2567; Docker 0.0.0.0:2567 a /app/dist; neplatný port/chybějící index selže s chybou |
| Připravenost | /api/health | 503 před vytvořením světa a při shutdown, poté původní {ok:true,demo:true} |
| Připojení | dva platné tokeny | stejný svět a autoritativní pohyb; host/private API odmítnuté |
| Matchmaking | create/join/joinOrCreate/reconnect | odmítnutí před konstrukcí další simulace; joinById funguje |
| Neúplný clone | LFS pointer v public | build končí s návodem git lfs pull |
| Vypnutí | SIGTERM | Colyseus uklidí klienty/místnost; restart nové worldId |
| Diagnostika | veřejný bind | lokální endpointy404 |

</frozen-after-approval>

## Code Map

- server/index.ts: HTTP/Express, pevný bind, bootstrap jediné StrahovRoom; onDispose uklízí Rapier. Nový server/runtime.ts oddělí konfiguraci/statiku/readiness.
- client/ui.tsx již používá VITE_MULTIPLAYER_URL; SDK0.18.5 řeší relativní / proti originu. Docker build nastaví /; klient se nemění.
- package.json/pnpm-lock.yaml/pnpm-workspace.yaml/patches: Node24, pnpm11.25.0, tsx4.23.15 a express5.3.0 již zamčené; patch musí existovat před install.
- pnpm build kontroluje client/server/shared/scripts/tests a character JSON fixtures. Public má cca1.24GB, včetně LFS GLB.
- scripts/integration*.ts: skutečné SDK scénáře; scripts/test-integration.mjs vlastní server2568.
- server/session-diagnostics.ts a local-benchmarks.ts deaktivují sběr podle skutečné bind adresy.

## Tasks & Acceptance

**Execution:**
- [x] docker-runtime task: server/index.ts, server/runtime.ts, tests/server-runtime.test.ts — implementace, refaktoring, cílené HTTP/config testy.
- [x] docker-packaging task: Dockerfile, .dockerignore, compose.yaml, scripts/check-runtime-assets.mjs, tests/runtime-assets.test.ts — image a LFS guard.
- [x] docker-root task: package.json/lock, README.md/README.cs.md, docs/deployment/docker.md, scripts/integration-docker.ts a scripts/test-docker.mjs — závislosti, CZ/EN postupy, skutečná přejímka.
- [x] docker-validation task — rezervované full test/build/integration/Docker/browser ověření; review, evidence, integrace vlastních commitů do main.

**Acceptance Criteria:**
- Given úplný clone a Docker, when compose up --build, then jeden non-root kontejner je healthy a hra dostupná na8080 bez host node_modules/mountů.
- Given běžící image, when dva hráči vstoupí a host prozkoumává, then multiplayer sdílí svět/pohyb/chat a host nevidí jeho přítomnost.
- Given stejné image, when stop a restart, then první proces korektně skončí, nový svět přijímá nové relace.
- Given běžný dev či dosavadní preview, when klient přistupuje přes /realtime, then dosavadní smlouva funguje.

## Design Notes

Vybrán Node24-bookworm-slim multi-stage s produkčními dependencies, server/shared/dist/package/tsconfig. tsx zůstává stávající transformační cestou, přesune se do dependencies; raw Node24 neřeší současné ESM/JSON/dekorátory. Server bundle by přidal nový neověřený build kontrakt. Další Nginx proces by komplikoval lifecycle; přepis /realtime listenerů závisí na interním pořadí Colyseus. Existující Docker-only env override tento problém odstraňuje.

Express bude přímá závislost; statika pouze explicitní absolutní STATIC_DIR, dotfiles deny, ETag/Last-Modified a max-age0 bez plošného SPA fallbacku. Readiness používá Colyseus onBeforeShutdown, ne druhý signal handler. HTTP port v Compose proměnný, default127.0.0.1:8080 ->2567; restart unless-stopped, stop grace30s. Externí HTTPS proxy předává celý origin i Upgrade, důvěra v X-Forwarded-For se nezapíná; adresní limit je za proxy společný.

Primární podklady: https://docs.docker.com/build/building/multi-stage/ ; https://pnpm.io/docker ; https://docs.colyseus.io/server/graceful-shutdown a skutečné zamčené balíčky. Výzkum rozlišuje doložené chování kódu od dosud neměřené Docker/browser funkčnosti.

## Verification

Cílené testy nových modulů; pnpm test, pnpm build, pnpm test:integration; docker compose config/build/up; HTTP/SDK/browser smoke, stop/restart. Výkonové sliby nejsou součástí; browser slouží funkční přejímce. Docker daemon při začátku nebyl dostupný; nezaměnit host test za kontejnerový důkaz.

## Implementation Notes

Základ df6b53af6f14fdda154489ae4ec355f19f1ddb25 v izolované worktree. Diary vlastník19.10 doložil čistý server/index.ts a uvolnil jej. Výstupy rezervované jednotlivými tasky. Při bootstrapu byl chybný port:0 v našem tasku; validátor jej odmítl, opraven na18081. První render byl omylem spuštěn po neúspěšném claimu (sekvenční shell nepřerušil na chybě); unikátní vlastní render prefix je nyní rezervovaný. Další závislé mutace se podmiňují ověřeným exit code. Cizí soubory ani rezervace nebyly přepsané.

## Spec Change Log

## Review Triage Log

| Nález | Verdikt / postup | Důkaz a oprava |
|---|---|---|
| Blind hunter | [] | Čtecí review celého vlastního runtime/config/test diffu bez podloženého nálezu. |
| Edge: stderr v captured stdout | medium / patch | Varování by zneplatnilo OSType/JSON. Oddělené stdout/stderr, stderr se zobrazí zvlášť. |
| Edge:120s versus180s restart | low / patch | Nadřazený timeout mohl předběhnout deklarované čekání. Restart má210s deadline. |
| Verification: skutečný frontend endpoint | medium / patch | SDK-only absolutní URL by neodhalila vadný VITE override. Přidán Playwright1.64.1 pouze do devDependencies a skutečné připojení sestaveného UI přes kořenové matchmake/WS. Chromium je jen hostitelský testovací předpoklad, ne runtime image. |
| Verification: pozdní odmítnutí create | medium / patch | Samotné !ok by prošlo i po alokaci druhé Simulation. Smoke kontroluje MATCHMAKE_NO_HANDLER i přesný invalid-method důvod před konstrukcí. |

Předběžné nezávislé review: timeouty a cancellation test runneru opravené včetně vlastních Windows Compose/Buildx potomků a hard deadline lifecycle forku. Runtime review bez nálezů. Skutečný build navíc odhalil broad !assets/ výjimku; nahrazena sedmi přesnými JSON cestami a Docker build ověřuje nepřítomnost assets/blender. Fetch smoke opraven na explicitní no-cache po důkazu default200/no-cache304/rawHTTP304. Původní výsledky zachované. Full1496testů, hostbuild,4izolovanéintegrace a celý Docker test včetně stop/restart PASS. Browser MP po retry ready+chat se SDK, hostizolacePASS; první cold a druhé souběžné3D/guest startup timeouty zůstávají vKEY-8, klientský kód beze změny. Finální třívrstvé review následuje.


Technická implementace a závěrečný Docker průchod po review PASS; BMAD done neoznačuje vzdálený merge. Přijetí konkrétního PR head/base a integraci samostatně dokončuje docker-main-integration-20261019.
