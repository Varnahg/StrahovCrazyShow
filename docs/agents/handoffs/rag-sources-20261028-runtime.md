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

Koordinátor 28.10 převzal a commitoval runtime66c4335a a kalibraci9ed94e86. Předává původnímu resume agentovi navazující review opravy: expiry po async validaci, smíšené služby bez předčasného topic filtru a regression změny revize/historie. Žádný runtime helper/port neběží; DB vlastní samostatný root task. Před novým claimem root uvolní rag-runtime-integrator-01a17e9d; předání zahrnuje jen doložený runtime WIP a historii těchto commitů.

## Předání oprav review nad 9ed94e86

28. 10. 2026 `/root/vector_runtime_resume` převzal výslovné navazující zadání koordinátora, task `rag-sources-20261028-runtime`, owner `rag-vector-runtime-review-20261028`. Claim s `--adopt-dirty` převzal pouze předaný zápis tohoto handoffu; zdroje byly čisté na `9ed94e861651eb32547a6d0b677b3f54c03fd8dd`. Po kontrole diffu a cílené reprodukci byly dokončeny tři požadavky:

1. SQL validace používá čas zadaný před asynchronním čekáním. Překročení review nebo effectiveUntil během tohoto čekání dříve dovolilo publish i replay s HTTP200. Služba nyní po každém await validace synchronně zkontroluje všechny předané dokumenty vůči čerstvému `now()`. Čistý `isKnowledgeDocumentUsable` v retrieval modulu nečte registry/JSON ani neprovádí nový dotaz; sdílí existující kontrolu administrativních UTC dat a používá schema-validované efektivní ISO hranice. Žádný další await mezi touto kontrolou a publikací není. Další SQL dotaz by znovu otevřel stejnou časovou mezeru, proto nebyl zvolen. Helper `evidenceCurrent` sjednocuje publish, replay i kontrolu před generováním.
2. Z `explicitEvidenceFilters` byla odstraněna veškerá inference témat i implicitní SH autority podle jména služby. Zůstává pouze explicitní SH/SÚZ s dosavadní ochranou smíšených institucionálních kontextů. Nebyly přidány nové regex výjimky. Smíšené dotazy Fotokomora+kancelář, 3D tisk+posilovna a Fotokomora+menza už neztrácejí tematické kandidáty. Při45 řádcích není důvod vyvažovat tuto ztrátu recall domnělým výkonovým přínosem; offline eval bez filtrů doložil koordinátor samostatně, tento autor jej nespouštěl.
3. Přidány skutečné service regrese dvou úspěšných operací: stejný revisionId předá předchozí USER/assistant historii generátoru, změněný revisionId nepředá ani jednu. Existující implementace této hranice byla správná a nepotřebovala změnu.

Default `text-embedding-3-large`/3072, práh0.60, embedding adaptéry, SQL, provider i klient zůstaly nedotčené. Změněno pouze:

- `server/crazy-typka.ts`
- `server/crazy-typka-retrieval.ts`
- `server/rag-evidence-backend.ts`
- `tests/crazy-typka.test.ts`
- `tests/rag-evidence-backend.test.ts`
- `docs/home-ai/20261028/runtime/README.md`
- toto předání; pomocné logy a manifest pouze ve vlastní runtime cache.

### Skutečné ověření oprav review

- RED `review-red.log`:7 testů,2 PASS (obě historie),5 FAIL; čtyři časové hrany reprodukovaly200 místo409, topic regrese reprodukovala nadbytečný filtr photography.
- GREEN `review-green.log`:7/7 PASS, exit0. Časové testy pokrývají publish/replay × review/effectiveUntil, necitované evidence, potvrzený requestSeq a opakovaný replay bez nového embeddingu/generování.
- Finální stejná cílená sada pěti AI test souborů: **105/105 PASS**, žádný skip/cancel, exit0,1857.5528ms; `.cache/rag-sources-20261028-runtime/review-targeted-final.log`.
- Scoped strict TypeScript stejných pěti runtime/shared zdrojů a pěti testů: **PASS**, exit0, bez diagnostiky; `review-types-final.log`. Scoped Prettier a `git diff --check`: PASS.
- Manifest šesti změněných zdrojů/docs +12 čtených dependencies: `.cache/rag-sources-20261028-runtime/review-manifest.json`, checkedAt `2026-10-28T12:26:51.408Z`, SHA256 `{sources,inputs}` `ce0ed6eaac5a82df2e8c25ea73b3c9b43cf442b086cadf3e1e0666cb82ecdc53`.

Všechny vlastní krátké procesy skončily; žádný port, síťová služba, placené API, databázová integrace, full suite, build ani GPU nebyly spuštěny. Žádný commit. Po zapsání předání se claim uvolní a koordinátor přebírá uvedený přesný dirty rozsah k opakované společné kontrole a integraci.

Navazující čtecí review uzavřelo E1/E2 a původní B1, ale doložilo regresi: Fotokomora+kancelářSÚZ nyní vynucuje jenSÚZ. Koordinátor volí úplné odstranění odvozovaných NLP filtrů z runtime, včetně instituce; SQL API explicitních metadatových filtrů zůstává podporované/testované. Offline skutečné SQL nad45zaplacenýmiqueryvectors bezvšechfiltrů zachovalo stejné39/39 předprahem a38/39 při0.60. Předáváno původnímu autorovi, po rootrelease znovu vlastníclaim. Žádné helpery neběží.

## Úplné odstranění odvozovaných SQL filtrů

Podle tohoto předání `/root/vector_runtime_resume` získal nový claim `rag-vector-runtime-unfiltered-20261028`, převzal sedm doložených runtime dirty cest a odstranil celou `explicitEvidenceFilters`, nepoužívaný typ instituce a navazující post-filter guard. `store.search` v chatu nyní dostává pouze `{limit, now}`; SQL vybere sémantické kandidáty při zachování povinných source/profile/freshness pravidel. `prepareEvidenceQuery`, bezpečná USER kotva, expiry opravy, model large/3072 i práh0.60 jsou zachovány. Store API authority/topics zůstalo nedotčené pro explicitní administrativní dotazy.

Dosavadní test konkrétního classifieru byl nahrazen behaviorální regresí skutečné backend→store cesty. Jedenáct dotazů včetně Fotokomora+kancelářSÚZ, Fotokomora+kancelářSH, obou institucí samostatně i společně, 3D tisk+posilovna a Fotokomora+menza ověřuje, že se odešle celý query embedding a jen limit/čas, a že runtime nevyřadí platný SQL výsledek podle slovního odhadu autority.

- RED `unfiltered-red.log`: původní implementace pro první smíšený dotaz skutečně poslala nadbytečné `authority: suz`.
- GREEN `unfiltered-green.log`: behaviorální regrese PASS pro všech11 dotazů.
- Finální pětisouborová cílená sada: **105/105 PASS**, žádný skip/cancel, exit0,978.5456ms; `unfiltered-targeted-final.log`.
- Scoped strict TypeScript: **PASS**, exit0 bez diagnostiky; `unfiltered-types-final.log`. Scoped Prettier PASS; po formátování žádný odkaz na odstraněný export v server/tests/scripts ani současné runtime dokumentaci.
- Manifest šesti souborů celého předávaného runtime checkpointu a12 dependencies: `unfiltered-manifest.json`, checkedAt `2026-10-28T12:38:37.846Z`, SHA256 `{sources,inputs}` `54f305f5705e690b1809c36f2b89f64c49fc47ddefc483a480bafee28e6d39a5`. Při převzetí HEAD9ed94e86, během nezávislé práce koordinátora se HEAD posunul na `bedaacb7b95abb3e9d482d27e25cc0f09ce084e3`; zde žádný commit proveden nebyl.

V této poslední opravě se změnily pouze backend, jeho test a runtime README; původní expiry/history opravy zůstávají v celém sedmisouborovém dirty předání. Žádná nová API platba, DB integrace, server, full suite, build ani GPU. Všechny krátké helpery skončily. Po konečné kontrole diffu se claim uvolňuje a root přebírá stejné doložené runtime cesty včetně tohoto předání. Offline query eval popsaný koordinátorem nebyl tímto agentem opakován.
