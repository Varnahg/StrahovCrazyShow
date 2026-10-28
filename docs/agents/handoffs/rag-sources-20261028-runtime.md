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

## Vektorový runtime: předání po obnovení 28. 10. 2026

Původní vektorový autor `/root/audit_security` skončil při chybě kapacity modelu bez dokončeného předání. Koordinátor po kontrole `list_agents` výslovně předal jeho WIP novému `/root/vector_runtime_resume`; původní agent již neběžel. Předchozí task nespouštěl dlouhé helpery ani porty, aktuální node procesy při převzetí začínaly až po přerušení. Žádný cizí proces nebyl ukončen. Evidovaná rezervace `rag-vector-runtime-01a17e9d` byla uvolněna a úspěšně převzata jako `rag-vector-runtime-resume-20261028` s doloženým `--adopt-dirty` sedmi TS cest. Výchozí HEAD tohoto předání je `986ab3d82caf0ebf0297d3a684caa42ad22f2359`; žádný commit nebyl proveden.

Převzatá a dokončená implementace:

- `server/rag-evidence-backend.ts` propojuje přesný moderovaný query text, OpenAI embedder a skutečné SQL kandidáty. Ověřuje profil před zaplacením, používá pouze konzervativní metadata filtry, uchovává source-version dependencies a rozlišuje prázdnou relevanci od chyby backendu. Žádný JSON/BM25 fallback.
- `server/crazy-typka.ts` používá async backend a oddělené embedding/generation rozpočty. Přesný replay ověřuje pouze SQL; přechodný výpadek nesmaže úspěch ani nepotvrdí novou chybu. Session lease chrání replay proti souběhu/resetu. Potvrzený neúspěch je hranicí předchozího USER tématu; historii odstraní i nová DB revize. DELETE a shutdown fungují při výpadku DB.
- `server/crazy-typka-provider.ts` odděluje vstupní moderaci od generování; výstupní moderace zůstává. `server/crazy-typka-retrieval.ts` exportuje čistý v2 validátor pro import/store, produkční služba nevolá jeho textový registry.
- Testy: `tests/rag-evidence-backend.test.ts`, `tests/crazy-typka-provider.test.ts`, `tests/crazy-typka.test.ts`.
- Aktuální vysvětlení: `docs/home-ai/20261028/runtime/README.md`. Dřívější lexikální popis v tomto souboru byl nahrazen, historické důkazy výše zůstaly.

Přesný dirty scope příjemce je uvedených sedm TS souborů, runtime README a toto předání. Žádná změna klienta, transportu citací, server/index, konfigurace, package/lock, SQL/ingest, embedding adaptéru nebo zdrojových dat v této navazující fázi.

### Rozhodnutí a cílený refaktoring

Veškeré asynchronní operace backendu sdílí jeden timeout/abort/error-cleanup wrapper a idempotentní close. Readiness spojuje souběžné kontroly s krátkou 2sekundovou cache; nemá embedding náklady. Runtime ukládá pouze poslední terminální operaci a její evidence snapshot, nenavyšuje počet intervalů ani perzistenci dotazů.

Při obnovení byly opraveny dvě doložené hrany: (1) expirace vyhozená přímo při vector search vracela502, nyní stejně jako ostatní confirmed expiration409; RED502≠409 a následné GREEN jsou zachované. (2) Explicitní SH ve smíšené větě o kolejném nebo anglická Fotokomora jako orientační bod ubytování zbytečně omezovaly SQL filtr. Široká kontextová slova nyní mohou pouze odstranit optional filtr, nikdy vybrat IDs nebo vytvořit nový tematický filtr; české i anglické příklady jsou v testu.

### Skutečné důkazy tohoto převzetí

- Úvodní společná cílená sada:97/97PASS, exit0, `.cache/rag-sources-20261028-runtime/resume-targeted-initial.log`; počáteční scoped strict tsc PASS.
- Cílená reprodukce expirace: `resume-expiry-red.log` exit1 kvůli skutečnému502; po opravě `resume-expiry-green.log`1/1PASS, exit0. `resume-filter-test.log`7/7PASS.
- Finální příkaz `node --import tsx --test tests/rag-evidence-backend.test.ts tests/crazy-typka-provider.test.ts tests/crazy-typka.test.ts tests/crazy-typka-retrieval.test.ts tests/crazy-typka-ui.test.ts`: **98/98PASS**, žádný skip/cancel, exit0,1380.495ms. Log `resume-targeted-final.log`.
- Scoped strict TypeScript nad pěti runtime/shared zdroji a pěti testy s ES2022/ESNext/Bundler/resolveJsonModule/strict/react-jsx: **PASS**, exit0, bez diagnostiky; `resume-types-final.log`.
- Prettier pouze osm vlastních zdrojů/testů/docs: exit0, `resume-format.log`. `git diff --check` vlastních tracked cest: PASS.
- Manifest osmi předaných zdrojů/docs a deseti čtených dependencies: `.cache/rag-sources-20261028-runtime/resume-manifest.json`, checkedAt `2026-10-28T11:48:28.090Z`, SHA256 `{sources,inputs}`: `5e91ffe88d482490ca780bb85a5fbc3eee1069074ad210fb7351820752c04fc4`.

Žádné live OpenAI/DB volání, privátní konfigurace, síťový proces, build, full suite ani GPU nebyly v tomto převzetí použity. Všechny vlastní krátké procesy skončily. Cílené fake-store testy nejsou důkazem SQL integrace nebo sémantické kvality. Práh `RAG_MAX_COSINE_DISTANCE` zůstává explicitně volitelný a bez odhadnutého defaultu; root jej případně nastaví podle skutečného eval. Prázdná hodnota je úmyslně vadná konfigurace. Root dokončí skutečný import/eval, společné kontroly a review/integraci; release tohoto tasku není Done celého KEY-65.
