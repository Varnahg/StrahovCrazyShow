# Předání: rag-sources-20261028-runtime

- Vlastník `rag-runtime-01a17e9d` (`/root/audit_security`), příjemce `/root`.
- Cwd `C:/Users/rezac/.codex/worktrees/clean-home-crazy-typka/StrahovCrazyShow`, větev `codex/rag-sources-sh-suz`. Výchozí commit `de6f87a2efbf8596bb03efae863e8d6763e22774`; během práce root integroval oddělené datové předání, při kontrole HEAD `5b4ff115d1f7060e3a818d45204d83ab18d9d094`. Žádný cizí WIP převzatý. Vlastní zdrojové změny jsou necommitnuté.
- Před zápisem přečteny AGENTS, policy, koordinace, architektura, current-work, finální spec a source-contract. Claim získán před prvním zápisem, heartbeat obnoven během práce. Čtecí návrh a porovnání variant proběhly před implementací.

## Výsledek a scope

Skutečný service/retrieval/provider řetězec načítá 45 aktuálních chunků z 28 zdrojů, odděluje SH/SÚZ a archiv. V2 metadata jsou per source. Lazy JSON/schéma/index init je pod ochranou optional AI, společný host zůstává funkční při vadných datech. Zachovány session isolation, requestSeq replay, admission, moderace, timeout/reset/shutdown, lokální první pozdrav a hranice po neúspěšném USER pokusu. Veřejné citace zachovávají dosavadní shape.

Přesné vlastní zdroje a testy:

- `server/crazy-typka-retrieval.ts`
- `server/crazy-typka-provider.ts`
- `server/crazy-typka.ts`
- `server/data/silicon-hill-knowledge.json`
- `shared/crazy-typka.ts`
- `tests/crazy-typka-retrieval.test.ts`
- `tests/crazy-typka-provider.test.ts`
- `tests/crazy-typka.test.ts`
- `tests/crazy-typka-ui.test.ts`

Dále vlastní `docs/home-ai/20261028/runtime/README.md`, tento handoff a `.cache/rag-sources-20261028-runtime/`. Žádný zápis do dětských SH/SÚZ JSON, centrálních docs/task katalogu, entrypointů nebo UI komponent.

Podklady: aktuální source-contract a spec KEY-65, SH/SÚZ source matrices a jejich 33 retrieval fixtures. Původní fakta/IDs zachované; explicitně předané upřesnění Fotokomora a nový `sh-projects-closed` podle dnešního projektového přehledu. Staré údaje nebyly vydávány za nově ověřené. Historické a nedoložené sazby, privátní IS ani bankovní údaje nebyly importovány.

## Refaktoring a lifecycle

Jedna validace registru a source usability rozhoduje při výběru, po provideru i při replay. Operace ukládá malé interní dependency IDs všech předaných zdrojů, i při nulových veřejných citacích. Source URL hosty sdílí runtime a klientský validátor; normalizace jazyka má jediný helper. Index/sources jsou neměnné a vznikají jen jednou; žádné per-request disk I/O ani nové intervaly. Aktualizace JSON vyžaduje restart serveru. Výkonový přínos nebyl měřen ani tvrzen.

## Skutečné ověření

28. 10. 2026, finální snapshot přibližně `00:41:29Z`:

- `node --import tsx --test tests/crazy-typka-retrieval.test.ts tests/crazy-typka-provider.test.ts tests/crazy-typka.test.ts tests/crazy-typka-ui.test.ts`: **84/84 PASS**, exit **0**, `759.7108 ms`; log `.cache/rag-sources-20261028-runtime/targeted-final-3.log`.
- Scoped `node node_modules/typescript/bin/tsc --noEmit --target ES2022 --module ESNext --moduleResolution Bundler --resolveJsonModule --esModuleInterop --strict --skipLibCheck --jsx react-jsx --lib ES2022,DOM,DOM.Iterable --types node,vite/client` nad čtyřmi TS zdroji a čtyřmi přidělenými testy: **PASS**, exit **0**, bez diagnostiky; `.cache/rag-sources-20261028-runtime/types-final-2.log`.
- Scoped Prettier pouze nad devíti vlastními soubory: exit 0. `git diff --check` nad stejnými soubory: exit **0**.
- Samostatný SÚZ data/retrieval validátor: prvně 16/20 případů, po opravě 20/20 PASS. Celá cílená sada navíc obsahuje všech 13 SH + 20 SÚZ případů. Rootův nezávislý holdout odhalil „občanku při převzetí pokoje“; dodaná konkrétní regrese nyní PASS, bez přepisování zdrojové parafráze.
- Původní neúspěšné testové logy zůstaly: `targeted-first.log` (71/72, chybně použitá společná testová hranice pro sport; opraveno na skutečný sportovní review termín), `targeted-expanded.log` (82/83, dvě SH české inflexe), `targeted-final.log` (83/84, oddělené „foto ateliéru“). Následná oprava normalizace zachovala všechny předchozí případy. Meziběhy zůstaly samostatně, nebyly přepsány.

Manifest devíti vlastních zdrojů/testů + čtyř skutečně čtených datových/fixture dependencies: `.cache/rag-sources-20261028-runtime/manifest.json`. SHA-256 nad JSON objektem `{sources,inputs}`:

`799a7988e3b048ea68b180abf9d380b4ded4c9b71c2542ebefa2bc900195b41f`

## Procesy, limity a převzetí

Všechny vlastní krátké CPU procesy skončily. Žádný dlouhožijící proces ani port nebyl spuštěn; HTTP unit tests používají injektované req/res a `http.emit`, nikoli `listen`. Žádná privátní konfigurace, placený endpoint, GPU, hra, build nebo celá testovací sada nebyly spuštěny. Fake-provider testy nedokazují živou faktickou kvalitu, recall mimo ověřené dotazy, úplnost katalogu ani cenu/latenci modelu.

Po zapsání tohoto handoffu a ukončení procesů vlastník uvolní claim CLI. Root přebírá přesný doložený dirty scope výše; release není Done. Root zajistí review, stabilní společné kontroly, případnou omezenou živou QA, aktualizaci Linear/spec a integraci. Snapshot musí obsahovat i oba nové docs retrieval fixture soubory.

## Převzetí rootem a změna požadované pipeline

Root převzal claim i doložený dirty scope. Vlastní 85/85 testů PASS zahrnuje dodatečnou reprodukci pronájmu hřiště bez jména instituce: hřiště se už neslévá s klubovou posilovnou; příslušná regrese ověřuje i navazující cenu. Změněny pouze retrieval a jeho test, podklady zůstaly beze změny. Root holdout11/11PASS a původní10/11zachován.

Uživatel následně výslovně požaduje OpenAI embeddingy a vektorovou DB. Tento v2 mezistav se ukládá jako infrastruktura provenance/platnosti, nikoli jako dokončený požadovaný RAG. Žádný build/server/GPU/placený endpoint této nové etapy neběžel. Root předává čistý checkpoint navazujícímu runtime autorovi; stávající task bude před novým claimem rozšířen o async vektorový backend. Textové vyhledávání se nesmí použít jako tichý náhradní backend při výpadku DB.
