# Předání: webgpu-quality-preparation-20261018

- Vlastník `webgpu-quality-preparation-01a14497`; příjemce root migrace. WT `C:/Users/rezac/.codex/worktrees/webgpu-comparison/StrahovCrazyShow`, výchozí HEAD `c9f62e9`.
- Výsledek: implementovaný malý startup orchestrátor všech tří kvalit, cílené testy a typy PASS. **GPU přínos a Game integrace nejsou tímto leafem přijaté.** Žádný build/fullsuite/GPU/port/install/commit.
- Vlastní runtime/test: nové `client/render-quality-preparation.ts` SHA `3dd4cc6c9837f67b97d086b903c469bfed48affd538589dc98d10536373a78fc`; `tests/render-quality-preparation.test.ts` SHA `f83f78346228f81598cd4ab257452dcefe85a468afe04450ced638e8492a4ac7`. Další vlastní zápisy pouze task cache a toto předání. Game, light helper, adaptive policy a všechny cizí změny nedotčeny.
- Podklad a volba v `.cache/webgpu-migration-checks/quality-preparation-20261018/analysis.md`: skutečný auto-low první F3993,4ms,8modules/49sync pipelines; médium se připravuje předready, auto pak přepíná až vgameplay. Selektivní low-F neprokazuje ostatní světla/kvality; visible async transition vyžaduje větší lifecycle. Uživatel výslovně přijímá delší startup. Zvolená konečná3quality matrix nepřidává cache ani nemění feature/policy.

## API a zapojení rootem

`prepareRenderQualities({ initialQuality, applyQuality(quality), prepare({quality, timeoutMs, finalPass}), restore(), isDisposed(), now })` vrací `Promise<RenderQualityPreparationResult>`.

- Fixní seznam low/medium/high, počáteční requested quality poslední, právě3průchody. `applyQuality` je pouze dočasná render změna, nikdy veřejné adaptive `setMode`/UI setter.
- `prepare` musí být původní bounded light helper se skutečným loopem/watchdogem/readiness a poskytnutým timeoutem. Orchestrátor nepřidává vlastní timer ani render loop a neumí zrušit libovolnou cizí nikdy nekončící Promise.
- Každý pass má nejvýše30s aktivního času včetně synchronního apply; globálně90s aktivního času včetně mezer a finally restore. Odečítá se jen finite kladné reported pausedMs, nejvýše pozorovaný wall interval underlying preparation. Deadline se kontroluje před/po passu i po finally. Synchronní volání nelze preemptovat; overrun nedostane complete.
- Root zachová `prepareLightingVariants` a final-pass restore musí uvnitř původního restore stage opravdu vykreslit a ověřit nejnovější requested nastavení. Helperfinally volá `restore` znovu pouze na živém owneru; root má callback idempotentní po odstranění override. Latest žádost nemění počet/průběžné timeouty.
- Vrácené neúspěšné statusy zastaví další kvalitu. Původní callback throw/rejection včetně undefined/null/false/0 zůstává původní; secondary restore exception jej ani vrácený failed/timeout/disposed výsledek nepřekryje. Samostatná restore exception odmítne Promise. `isDisposed` má root předat jako retirement včetně rendererFailed/scene disposal.
- Výsledek zachovává LightPreparationResult pole; stage údaje jsou kopie s `passQuality`, nikoli tvrzením o skutečné quality poslední restore při late user requestu. `qualities[]` má plánovanouquality, finalPass, measured elapsed/active/paused, status/failureStep/stageCount. Původní stage objekty se nemutují. Existující shader inventory se nerozšiřuje a není vydáván za úplný quality × light inventář.

## Refaktoring a ověření

- Sdílený časový přepočet pro průběh/finally, jeden pevný seznam kvalit, žádný persistent state, vlastní resources nebo cache. Výsledek má nejvýše3pass summaries plus skutečně vrácené bounded stages.
- První funkční běh19/19PASS, strictTS184/0 (`targeted-01.log`, `types-01.log`). Potom pouze scoped Prettier2novéfiles; původní bytes uložené v `before-format/`.
- Finální `node .cache/webgpu-migration-checks/quality-preparation-20261018/validate.mjs 02`:19/19PASS +strictTS184/0, exit0. Přesné UTC, command, readonly deps a input SHA v `targeted-02.json`. Typecheck roots jsou jen nový helper/test a jejich closure; nejde o fullTS Game.
- Scénáře: všechna3počáteční pořadí, final-pass flag, callback timeout allowance, fixedpass limit, původní stage fields, hidden vs active čas, nepravdivě příliš velká/neplatná pause, synchronous apply/prepare overrun, globální mezery, finally overrun, všechny neúspěšné statusy, primary/secondary falsy errors, retirement a late requested restore bez změny auto mode.
- Skutečná kompozice s `prepareLightVariants`:39attributed stages,117skutečných calls jeho render callbacku, původní dvěready acceptance draws na etapu,3dispose detaches a žádný zbývajícíloop/timer. Jde o kontrolované CPU callbacks, nikoli GPU obraz/pipeline důkaz.
- Oba nové soubory prošly `git diff --no-index --check -- /dev/null <file>` bez whitespace nálezu. Žádné další soubory nebyly formátované.

## Předání

Root paralelně vlastní Game wrapper, actual Game testy a následné čisté/kombinované checkpointy. Musí ověřit actual auto→low→F, ručníquality roundtrip, low/high světla, zachování opacity/postprocess/shadow/LOD, cancellation a terminální chyby. Úspěšná příprava jedné sady ještě nedokládá retenci všech pipeline po jejím opuštění.

Všechny vlastní procesy skončily. Source/test bytes frozen; žádné pomocné služby. Finální manifest zahrne sources, test logs, analysis, runner, původní formátované preimages a tento handoff. SHA manifestu je předáno zvlášť bez self-hash cyklu. Po předání release; task/Linear Done a integraci potvrzuje root, nikoli samotný leaf PASS.
