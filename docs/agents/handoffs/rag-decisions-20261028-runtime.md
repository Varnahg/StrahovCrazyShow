# Předání: rag-decisions-20261028-runtime

- Vlastník: `decisions-runtime-01a17e9d`; příjemce: koordinátor `/root` zadání KEY-68.
- Pracovní kopie: `C:/Users/rezac/.codex/worktrees/clean-home-crazy-typka/StrahovCrazyShow`, větev `codex/automated-document-rag`; výchozí a při předání stále aktuální HEAD `5eebe2b043a088222b8160fabb7eefbbc3a36e80`.
- Výsledek: runtime implementace a cílené CPU ověření hotové. Živé API, kalibrace, plný checkpoint, review a integrace čekají na koordinátora. Nic nestagováno ani necommitováno.
- Změněné soubory: `server/crazy-typka.ts`, `server/crazy-typka-provider.ts`, `tests/crazy-typka.test.ts`, `tests/crazy-typka-provider.test.ts`, `compose.ai.yaml`, toto předání. Ignorované výstupy pouze `.cache/rag-decisions-runtime-20261028/`.
- Cizí WIP: acquisition/extraction/ingest změny a research artefakty nedotčené. Před prvním runtime zápisem převzata výhradně doložená věta Jantar onboardingu a jejích 12 testových řádků z `c38661f618ac6778d615c99a7ea383032ee3f526`; celý sedmisouborový commit ani UI/testy/metadata nepřevzaty. Adapter `server/crazy-typka-decisions.ts` a jeho test patří souběžnému disjunktnímu tasku; pouze čteny/importovány.

## Podklady, rozhodnutí a chování

Načteny AGENTS, mapa architektury, koordinace/current-work, BMAD policy, přidělený task, [specifikace](../../../_bmad-output/implementation-artifacts/rag-auto-20261028/spec-key-68-decisions-routing.md) a [API kontrakt](../../rag-ingestion/20261028/decisions/contract.md). Stav/validate/worktrees ověřeny, claim získán před zápisem a heartbeat obnoven. Další BMAD workflow ani agent nebyl spuštěn.

API usage a rozpočet odvozovány z oficiálních [Responses API](https://developers.openai.com/api/reference/resources/responses/methods/create) a otevřené [reasoning dokumentace](https://developers.openai.com/api/docs/guides/reasoning), ověřeno 28. 10. 2026. Otevření velké API reference přes web vracelo velikostní limit; aktuální indexovaný obsah usage souhlasil s reasoning dokumentací. Reasoning patří do output, cache read/write jsou části input; tyto části se znovu nepřičítají k total.

Zachován řetězec admission/seq/replay/pozdrav → moderace přesného bounded USER query → Decisions → dosavadní embedding/SQL/validace → pevná serverová tier policy → Responses/výstupní moderace → freshness/replay. RAG se vždy provádí dosavadním způsobem; veřejné DTO, historie, citace a multiplayer se nemění.

Porovnáno rozšiřování jednotlivého provider callu klientským/modelovým vstupem versus dvě serverem pevně nakonfigurované instance provideru. Zvoleny dvě instance se společným HTTP/mode­ration kódem a synchronní rezervací pokusu. Nevytvářejí listener, interval ani per-session cache; drží pouze konstantní konfiguraci. Rozhodovací výstup nikdy není model/URL/SQL pokyn. Jde o implementaci varianty již zvolené v kontraktu, nikoli měření modelové kvality.

- Simple zachovává `OPENAI_MODEL`/`OPENAI_REASONING_EFFORT`, výstup 600 tokenů. Complex default `gpt-6.1-sol`/low a 4096 tokenů včetně reasoning. Společná maximální délka zobrazené odpovědi se nemění. Complex model/effort jsou jen operator env.
- Kandidátní práh 0.80, konfigurovatelný 0.5–1.0; zatím nekalibrováno. Empty RAG sám nikdy neeskaluje. Bez místní evidence smí complex pouze při dostatečné jistotě, že nejde o místní fakta (`localSourcesProbability + threshold <= 1`); nejistý lokální požadavek zůstává simple.
- Samostatné hard capy 500 Decisions pokusů / 1 000 000 rezervovaných UTF-8 bajtů (konzervativní tokenová horní mez celého requestu) / 20 complex pokusů za proces. Env je může pouze snížit; nula vypíná příslušný routing rozpočet. Celkový dosavadní generation cap zachován. HTTP pokusy se nerefundují.
- Timeout/refusal/malformed/provider/routing-budget → simple bez opakování; cancellation/reset/shutdown/expiry/operation deadline → terminální konec bez fallbacku nebo dalšího embeddingu. Poslední complex slot se rezervuje synchronně před HTTP, bez `await` mezi výběrem a rezervací.
- Interní `usage()` odděluje Decisions, simple, complex, embeddingy a konečné důvody fallbacku. Obsahuje potvrzené usage a `unconfirmedUsageAttempts`; chybějící usage se nevydává za fakturovanou nulu. Provider callback zaznamená validní usage i u neúplného placeného výsledku, ale nepřenáší ji klientovi. Neplatné usage odmítne.

## Refaktoring a lifecycle

Společný `assertOperationActive` nahradil opakované kontroly identity/expiry/abort před placenými kroky i po generování; platí také při návratu z Decisions. Společné helpery počítají usage a vracejí kopie, aby příjemce nemohl modifikovat interní stropy. Validace usage je v provideru, agregace jen ve službě. Původní session/replay cache a zdrojové invalidace zachovány. Timeouty a abort readerů Decisions vlastní jeho adapter; tato služba nealokuje další timer a při disabled AI adapter neinicializuje.

## Ověření

Finální 28. 10. 2026 přibližně 17:28 UTC:

1. `node node_modules/tsx/dist/cli.mjs --test tests/crazy-typka-provider.test.ts tests/crazy-typka.test.ts` — exit 0, **72/72**, 0 fail/cancelled/skipped, 1545 ms; [log](../../../.cache/rag-decisions-runtime-20261028/targeted-tests-final.log).
2. `node node_modules/typescript/bin/tsc --noEmit --target ES2022 --lib ES2022,DOM,DOM.Iterable --module ESNext --moduleResolution Bundler --strict --skipLibCheck --esModuleInterop --resolveJsonModule --allowImportingTsExtensions --types node server/crazy-typka.ts server/crazy-typka-provider.ts tests/crazy-typka.test.ts tests/crazy-typka-provider.test.ts` — exit 0; [log](../../../.cache/rag-decisions-runtime-20261028/typecheck-final.log), prázdný úspěšný výstup. Zahrnuje importovanou závislost adapteru.
3. `git diff --check --` s přesnými pěti runtime soubory — exit 0.

Původní bezpečnostní asserty zachovány; fixture používá samostatně zaznamenávaný fake router. Nové scénáře skutečně serializují oba endpointy přes fake HTTP, ověřují model/effort/max_output_tokens, stejné moderované query, hash identity, privátní DTO, nulové náklady replay, limit před HTTP, 20-slot ceiling a souběh posledního slotu. Dále error/timeout/refusal, complex failure/incomplete/output moderation bez retry, reset/shutdown/disconnect/deadline/expiry během pending routeru a zdrojové expiry na complex cestě.

Průběžné první testování zachytilo eager factory při vypnuté AI, doplnění očekávaných usage polí a chybu fake Decisions fixture (chybějící povinné `output_tokens_details`); vše opraveno před finálním průchodem. Průběžný strict TS zachytil required `model` v testovém `Pick`, změněno na `Partial<Pick>`. První neúspěšné výstupy zůstávají v historii nástrojů; mezilehlý úspěšný log je `targeted-tests-pass1.log`, finální log jej nepřepisuje.

## Snapshot a předání

[Manifest](../../../.cache/rag-decisions-runtime-20261028/manifest.json) z `2026-10-28T17:29:27.615Z` obsahuje SHA-256 všech pěti vlastních runtime souborů včetně testů i čtecích adapter závislostí. [Vlastní diff](../../../.cache/rag-decisions-runtime-20261028/runtime.diff) má SHA-256 `171f1906970be17b35498821b70cd3d152843cc6b1ad124bbb71b9adede7a78d`. Neobsahuje ingest ani cizí source diff. Předání je samostatný následný textový artefakt a v uvedeném runtime diffu není.

Vlastní dlouhožijící procesy: žádné. Všechny Node kontroly doběhly; žádný port, DB, server, GPU, instalace, placené API, fullsuite ani build. Testová HTTP fixture nepoužívá síťový listener. Neměnný hraný build nebyl spuštěn ani měněn.

Omezení: fake HTTP neprokazuje dostupnost skutečného Decisions účtu, modelů, latenci nebo kvalitu klasifikace. Kalibraci českých případů, bounded live calls, plné CI/build/integraci a Linear/docs verification zajistí koordinátor ve svém scope. Main okno PR33 dál patří Jantaru. Stav tasku a integrační přijetí aktualizuje koordinátor; toto předání neznamená Done ani veřejné nasazení.

Rezervace bude uvolněna bezprostředně po zápisu tohoto předání; vlastní dirty změny jsou výslovně předány koordinátorovi pro review/integraci. Runtime autor je po release dále nemění bez nového pověření a claim.

Root po převzetí přidal jedinou providerinstrukci proti neopodstatněnému odvolání předchozí odpovědi kvůli novým úryvkům; živá Luna→Sol dvojice opravu potvrdila. Zachovat tento převzatý řádek. Dalšíreviewfix: Sol effortvalidace, typovanýRagEvidenceError vembedding callbacku, kumulativníDecisionbytecap a nestandardníthresholdregrese; adapter nově předá reasoningTokens. Root nyní uvolňuje scope, žádnéhelpery neběží; další placenáAPI se nevolají.

## Převzetí a opravy po review — 28. 10. 2026, 18:43 UTC

Na výslovné nové zadání root a výše doložené předání získal původní runtime autor znovu claim `decisions-runtime-01a17e9d` s `--adopt-dirty`; převzal pouze šest jmenovaných runtime/handoff cest. Rootův řádek proti spurious retraction i původní Jantar onboarding zachovány; provider test nově chrání i rootův řádek. Ingest ani disjunktní adapter soubory se neupravovaly.

1. **Konfigurace Sol effortu:** známý model `gpt-6.1-sol` odmítá none/minimal už při vytvoření provideru; platí tím také pro výchozí complex provider. Oba scénáře ověřeny přímým constructor testem i optional-service konfigurací bez jediného HTTP volání. Zdroj znovu vyhledán a otevřen: [oficiální reasoning guide](https://developers.openai.com/api/docs/guides/reasoning?api-mode=chat), část Reasoning effort. Nevybíráme jiný effort potichu a nevynucujeme neověřenou politiku pro libovolný operator model.
2. **Typované zrušení na hranici RAG:** příčina doložena v `createRagEvidenceBackend.operation`, který obecný `RequestError` převádí na provider-unavailable. Společná podmínka je nyní `operationActive()`, běžné volání používá `RequestError`, ale embedding callback výslovně `RagEvidenceError("cancelled")`. Regrese používá skutečný evidence backend i skutečný OpenAI embedding adapter s fake HTTP a fake store; druhý `captureActive` posune čas přes TTL. Výsledek 409/cancelled, 0 embedding HTTP, 0 embedding pokusů, 0 generací. Nepřidána duplicita lifecycle podmínky ani změna evidence backendu.
3. **Kumulativní rezervace:** test odvodí skutečný serializovaný request včetně pevných otázek a hash identity. Dva stejně velké požadavky se každý samostatně vejdou, jejich součet překročí rozpočet o 1 bajt. Druhý již nevolá Decisions HTTP; pořadí skutečně serializovaných generátorů je Sol → původní simple model. První rezervace se nevrací.
4. **Nastavitelný práh:** pro complex probability 0.85 mění práh 0.8→0.9 model Sol→simple. Pro probability 0.95/local 0.15 a prázdné podklady mění stejný práh také potřebnou jistotu o místních faktech; opět se ověřuje skutečný model v Responses body. Produkční policy se zde neměnila.
5. **Reasoning usage:** fixture přidána povinná adapter vlastnost `reasoningTokens`; reálná service+adapter fake-HTTP regrese potvrzuje přesnou hodnotu 3 versus 0. Output zůstává 5 a total 15, reasoning se nepřičítá podruhé. Stávající agregátor již předané číslo umí a nebyl duplikován.

Finální ověření po opravách: stejné dva přímé Node příkazy jako výše, **76/76 testů**, 0 fail/cancelled/skipped, 1265 ms, exit 0; strict scoped TypeScript exit 0; `git diff --check` exit 0. Logy: [testy](../../../.cache/rag-decisions-runtime-20261028/review-fixes-tests-final.log), [typy](../../../.cache/rag-decisions-runtime-20261028/review-fixes-typecheck-final.log). První průchod review oprav měl také 76/76; jeho samostatný log zůstává `review-fixes-tests-1.log`.

Aktuální runtime checkpoint je [review manifest](../../../.cache/rag-decisions-runtime-20261028/review-fixes-manifest.json) z `2026-10-28T18:43:14.928Z`, zahrnuje všechny runtime zdroje/testy včetně převzatého root řádku a hash stabilního adapteru `8c0dbe63504d1946d1e73c49bc67740cf7020180d6f405b7b45a378e95ad340e`. [Aktuální diff](../../../.cache/rag-decisions-runtime-20261028/review-fixes-runtime.diff) SHA-256 `e73dfeed94c8a7022820f44d49d1ac6bc13eec4c9f4db782ac8d57326dbbd6b8`; starý manifest/diff zachován jako historický checkpoint.

Bez placených API, instalací/pnpm, DB, serveru, GPU, fullsuite či buildu. Žádné vlastní pomocné procesy nezůstávají. Nic nestagováno/necommitováno. Po tomto doplnění opět release a úplné předání root pro navazující review/integraci; autor bez nové rezervace dále nezapisuje.
