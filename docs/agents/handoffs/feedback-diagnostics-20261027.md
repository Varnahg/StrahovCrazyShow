# Předání soukromé diagnostiky feedbacku

27. 10. 2026. Autor `feedback-diagnostics-agent-20261027`, příjemce root. Pracovní kopie `D:/CodexWorkspaces/StrahovCrazyShow-terrain-20261025`; přímé navazující zadání po čtecím průzkumu. Žádný nový BMAD workflow. Uživatel přebírá herní testování: nebyla spuštěna hra, browser, herní server ani skutečné doručení do Linearu.

## Doložená příčina a hranice

Lokální launcher `.cache/trees-diagnostic-server-20261026/start-v13.ps1` odstraňuje `LINEAR_*` a `FEEDBACK_*`, poté nastaví pouze `FEEDBACK_DIR`. Worker proto nemá credential, tým a projekt a nemůže do Linearu odesílat. Bezpečný čtecí souhrn adresáře `feedback-v13-catalogue-01` našel 0 `delivery.json`; texty hlášení ani screenshoty se nečetly. Tato konkrétní příčina není důkazem závady jiného externího nasazení, jehož URL a prostředí dosud neznáme.

Dosavadní server entrypoint neměl zapojené `onDeliveryError`, takže chybějící konfigurace a chyby doručování nebyly běžně viditelné v logu. `pending-config` se po opravě prostředí může obnovit, `blocked` zůstává vyřazené. HTTPS proxy bez explicitního veřejného originu může odmítnout příjem403; to je další možné místo, nikoli prokázaná příčina tohoto deploymentu.

Primární dokumentace ověřená27.10: [GraphQL autentizace a chyby](https://linear.app/developers/graphql), [serverový upload](https://linear.app/developers/how-to-upload-a-file-to-linear), [rate limiting](https://linear.app/developers/rate-limiting). Stávající adapter správně rozlišuje raw API key a Bearer OAuth, kontroluje GraphQL errors i přiHTTP200, posílá upload ze serveru s vrácenými hlavičkami a respektuje rate-limit reset. Nebyl prokázán nový protokolový bug.

## Rozhodnutí a změny

Vybrána privátní agregovaná diagnostika a jeden konfigurační resolver. Veřejný stavový endpoint by zbytečně odhaloval provozní frontu; automatické odblokování by mohlo přehrát již vytvořené issue; odstranění izolace testovacích launcherů by umožnilo nechtěné skutečné odesílání. Tyto varianty se nepoužily.

Přesné vlastní soubory:

- `server/feedback-config.ts` — jednotné trim/precedence/auth rozhodnutí, oddělená bezpečná diagnostická projekce, whitelist chyb a chráněný observer.
- `server/feedback-diagnostics.ts` — samostatné read-only CLI, zahrnuté automaticky v Docker runtime přes server/.
- `server/feedback-linear.ts` — používá společný resolver, hlásí konfiguraci jen při změně bezpečné projekce a sanitizované doručovací chyby. Bez nové credential cache.
- `server/feedback.ts` — předává observer a sjednocuje bezpečné ohlášení storage chyb.
- `tests/feedback-config.test.ts`, `tests/feedback-diagnostics.test.ts`, `tests/feedback.test.ts`, doplněný `tests/feedback-linear.test.ts`.
- `docs/deployment/feedback.md` — skutečný rozsah diagnostiky, příkazy, kódy a omezení.

`server/index.ts` nebyl tímto agentem upraven. Root do něj samostatně zapojil `onDiagnostic`, což bylo čtecím pohledem potvrzené.

## API a chování

`FeedbackServiceOptions.onDiagnostic(event)` přijímá exportovaný union `FeedbackDiagnostic` z config modulu:

- `configuration` s `{configured, credentialMode, missing, warnings, allowedOriginsConfigured}`. Všechny řetězce jsou známé názvy/kódy, žádné hodnoty credential nebo cílových ID. `configured` znamená pouze přítomnost, ne API ověření.
- `delivery-error` s whitelistovaným `code` a stavem `pending`, `verifying` nebo `blocked`.
- `storage-error` s konstantním kódem `delivery-storage`.

Observer nemůže svou výjimkou změnit příjem nebo frontu. Původní `onDeliveryError` zůstává podporovaný a jeho logger výjimka už nezpůsobí zamítnutí úspěšně uloženého stavu. HTTP202, identity issue, retry budget, reconcile-before-create, pending-config/blocked, API endpoint a credential precedence zůstávají zachované. Podezřelé formáty credential se pouze popíšou konstantním varováním; nic se automaticky nepřepisuje.

CLI `node --import tsx server/feedback-diagnostics.ts [--directory CESTA]` čte jen omezené `delivery.json`, neinstancuje mutující FeedbackStore, nenásleduje report symlinky a neotevírá report.json/image.bin. Výpis je best effort, ne důkaz API přijetí. Neznámé error řetězce se mapují na `other`. Výstup nemá report ID, text, kontakt, soukromou URL ani credential. Žádná možnost replay/requeue nebo síťové kontroly není přidaná.

## Ověření

- Finální úzká sada `node node_modules/tsx/dist/cli.mjs --test --test-concurrency=2 tests/feedback-config.test.ts tests/feedback-diagnostics.test.ts tests/feedback.test.ts tests/feedback-linear.test.ts`: **30/30 PASS**, 0 fail/skip, exit0,1,39s. Log `.cache/feedback-diagnostics-20261027/targeted-final.log`.
- Scoped TypeScript přes `.cache/feedback-diagnostics-20261027/tsconfig.json`: **PASS**, exit0; `types-final.log`.
- Whitespace kontrola upravených i nových vlastních souborů PASS.
- Regrese zahrnují skutečný malý filesystem snapshot beze změn, ignorovaný staging, odmítnuté junction/symlink a oversized záznamy, CLI bez vytváření chybějící složky, skutečný oneshot CLI proces bez herního serveru, bezpečné výstupy, config přechody, logger výjimky, zachované blocked a původní fake transport upload/reconcile/error případy.
- Žádná celá sada, build, browser/GPU, síťový listener, reálný Linear request, ticket nebo replay nebyl spuštěn. Nebyly čteny či vypsány skutečné credential hodnoty.

## Převzetí

Zdrojové soubory, testy, dokumentace a malé důkazy uzavírá `.cache/feedback-diagnostics-20261027/manifest.json`; hash je předán rootu samostatně. Vlastní krátké testovací procesy skončily a dočasné fixture byly uklizené v ověřených vlastních adresářích. Rezervace bude po vytvoření manifestu uvolněna. Root vlastní staging/commit, server entrypoint a main integraci. Externí produkční doručení zůstává neověřené, dokud není identifikované nasazení a jeho bezpečné konfigurační/stavové údaje.
