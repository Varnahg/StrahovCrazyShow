# Předání: webgpu-manual-frame-failure-20261017

## Integrační refaktoring rootu

Při přípravě combined overlay root ověřil konkrétní kolizi: cizí persistent C4 preview má vnější `let active` a controller `setActive` uvnitř stejného try bloku, kam vlastní nový `const active` zaváděl stínění a při sloučení by způsobil assignment-to-const. Vlastní predikát byl proto přejmenován na `canRenderFrame` beze změny podmínky či chování. Cizí kód/flag se nemění. Předchozí source snapshot native-v15/a12f076d zůstává zachovaný jako mezikrok před tímto refaktoringem; nebyl vydáván za plně validovaný build. Následuje samostatný cílený test a nový finální checkpoint.

## Aktuální výsledek po opravě review P2: přednost první chyby

Root vrátil původní vlastní WIP autorovi; stejný owner znovu získal task s doloženým `--adopt-dirty`. Reviewer `functional_record` doložil, že již fulfilled výsledek `popErrorScope()` mohl svým `checked.then` nahlásit sekundární validation dříve než scheduler zpracoval původní render throw. Tím změnil důvod odmítnutí vnějšího health guardu.

Nová pinning regrese nejdříve selhala: `precedence-red.log`, **0/1 PASS**, exit 1, actual `secondary validation failure` místo identity `first render failure`. Přesný RED runtime/test jsou v `precedence-red-inputs/`. Nejmenší oprava synchronně volá `fail(frameError)` až po uzavření scope a připojení jeho rejection consumption, před původním `throw frameError`. První chyba je tak uzamčená před Promise reakcemi a sekundární scope výsledek zůstane bezpečně spotřebovaný. Žádný nový API, hook nebo GPU krok.

- Celé oba callers: `precedence-green.log`, **47/47 PASS**, exit 0. Regrese pokrývá původní Error i `undefined`, `null`, `0`, `false` proti okamžitě fulfilled validation chybě; jeden pop scope, žádný flush/submit, jeden render fault a žádné přepsání sekundárním validation faultem.
- Scoped TypeScript: `precedence-types.log`, **2987 souborů, 0 diagnostics**, exit 0; diff check PASS.
- Nový manifest `manifest-precedence.json`, SHA-256 `3d25478a1c307e3bb7d3e4b29bb4401e776f187ab23fd2f8eb59d87a53420ceb`, obsahuje 219 přesných staging inputs, aktuální čtyři vlastní zdroje shodné s WT, přesné dvě RED kopie, logy a primární zdroje. Původní manifest zůstává historickou evidencí před review opravou.
- Aktuální startup SHA-256: `8cba9b39c2448bd81f11bdf0fbd90634c0d8ef0450878bbe005e9a8adc7fcc54`.
- Aktuální startup test SHA-256: `f6ae5fafdf50f9857a759b163a2f64bf8f6cbf1d2ab9cbd3612a042805dfcb6f`.
- Preview a jeho test zůstaly beze změny: `f22ea1495f5fcd91a69bbecb853096e4819b519f31a7916ab91dfe17a67cc245` a `ed0e76066dc24753abcb1ee60e38b476484ffa8c96803404159c4bd966a28c18`.

Nezávislý read-only recheck `functional_record` potvrdil všechny čtyři hashy a uzavřel konkrétní P2 nález s výsledkem `[]`. Přečetl RED/GREEN/TS logy, sám nic nespouštěl ani neměnil. Rootu se výslovně předává stejných pět vlastních souborů a cache evidence pro commit/integraci; nic není nastagované ani commitované, žádné vlastní procesy neběží. Po předání se claim uvolní. GPU a combined přejímka zůstávají otevřené.

Vlastník `webgpu-mig-01a14497-manual-frame` (`shader_inventory`), příjemce root. Přesný scope: native WT `client/render-startup.ts`, `client/avatar-preview.ts`, jejich dva testy, toto předání a `.cache/webgpu-migration-checks/manual-frame-failure/`. Kontext AGENTS/policy a aktualizovaný BMAD spec39 načtený; žádný rekurzivní BMAD. Foreign persistent C4 preview ani frozen snapshots/dependencies se nemění.

Předchozí read-only průzkum přímo doložil `render-startup` capture→finally endFrame→pozdější health.report a preview uložení chyby→endFrame→await GPU→pozdější report. Oba původní testy end po chybném renderu vyžadovaly; jejich completion-check counter nebyl skutečný queue.submit. Další hook by neuměl poznat chybu, kterou caller ještě nenahlásil. Zvolená minimální varianta je proto přeskočit endFrame už podle lokálně zachycené chyby či ztráty vlastníka, zachovat uzavření scope a bezpečně spotřebovat jeho Promise. Preview nesmí čekat na nesouvisející queue/compiler po již známé chybě; samostatný flag zachová i falsy throw hodnoty. První chyba má přednost před cleanup/reportingem. Zdravé snímky se nemění.

Ověření: nejdříve skutečné pinned WebGPUEngine endFrame/flushFramebuffer s řízeným queue.submit, RED původních callers, pak GREEN/scoped TS/input manifest. Bez GPU, serveru, instalace, buildu a full suite; commit/integraci a combined merge vlastní root.

## Implementace a refaktoring

Startup volá endFrame pouze pokud skutečně začal snímek, nemá lokální chybu a vlastník/signál/health jsou stále aktivní. Po beginFrame znovu ověří vlastnictví před render callbackem. Scope vždy popne a jeho Promise spotřebuje; první capture používá explicitní boolean, takže se nepřepíše falsy chyba při scope cleanup. Failure reporter je best-effort, původní rejection zůstává i pokud onFault hodí.

Preview používá stejný first-error princip. Po render faultu či abort/dispose přeskočí endFrame; právě jednou uzavře scope, připojí rejection consumption a odmítne původní render failure dřív než zavolá shaderModules/compilation nebo queue.onSubmittedWorkDone. Error scope nemusí nikdy dokončit, ale už známý sync fault nesmí držet UI loading. `fail` odděluje Error prezentaci pro onState od přesné původní rejection hodnoty; chybný onState observer nemůže výsledek přepsat. Cleanup již externě disposed engine znovu nedisponuje. Stav vlastnictví se kontroluje i před/po begin a po renderu. Aktivní predicate je jednou na controller a pomocná resolved Promise vzniká jen při výjimečném scope failure, nikoli navíc pro každý zdravý snímek.

Žádný engine hook ani profiler nebyl přidán; `on-demand-render.ts`, foreign persistent preview, assety a závislosti zůstaly beze změny. Game/UI nebo veřejné API se tímto taskem nemění.

## Skutečné výsledky

Staging `.cache/webgpu-migration-checks/manual-frame-failure/` má219 přesně inventarizovaných klientských/shared/testových inputs a readonly dependencies-v5. Runtime metody `WebGPUEngine.prototype.endFrame` i `.flushFramebuffer` jsou skutečné pinned implementace. Řízení spolupracovníků a queue.submit je CPU fixture, ne GPU zařízení. Čítače `flush/gpu-submit` se vedou zvlášť od `onSubmittedWorkDone`; zdravé oba callers výslovně prokazují jeden flush a submit.

- `manual-red.log`: **37/40PASS,3FAIL**, exit1, před implementací. Prokázaný trace preview byl begin→render→end→flush→gpu-submit i při render throw; startup throw i abort rovněž provedly end/submit.
- `manual-red-expanded.log`: **37/45PASS,8FAIL**, exit1, před implementací. Přidává falsy errors, pending GPU, reporter/cleanup failures a ztrátu vlastníka. Původní callers navíc vytvořily unhandled reporting failure; GREEN tuto chybu nemá. Přesné čtyři RED soubory jsou v `red-inputs/`.
- První oprava `manual-green-v1.log`: **45/45PASS**, exit0.
- Po doplnění přímého external engine.dispose scénáře, healthy-positive důkazů a cíleném refaktoringu: `manual-final-refactor.log`: **46/46PASS**, exit0, žádná async activity po ukončení testů. `manual-types-final.log`: **2987souborů,0diagnostics**, exit0.
- Příkazy: `TSX_DISABLE_CACHE=1 node --import tsx --test tests/render-startup.test.ts tests/avatar-preview-webgpu.test.ts`; `node typecheck.mjs` ve vlastním stagingu. Vlastní diff check PASS.
- Manifest `manifest.json` SHA-256 `96b387d3554f833d60b720f3e0ba567bf552655c960694f9ead468d40c17fc8e` obsahuje exact219staging inputs, shodu čtyř vlastních souborů s WT,4REDkopie, logs, pinned sources a harness.

Freeze pro rootův nezávislý review:
- `client/render-startup.ts`: `ddcaa86259b9f8a6d937be62e13dc61337a2427385322e48662ce96c18be9625`.
- `client/avatar-preview.ts`: `f22ea1495f5fcd91a69bbecb853096e4819b519f31a7916ab91dfe17a67cc245`.
- `tests/render-startup.test.ts`: `a8d0a9bfe5f3689e4ecb459eec061881374504019bacf518523cd9645a91225f`.
- `tests/avatar-preview-webgpu.test.ts`: `ed0e76066dc24753abcb1ee60e38b476484ffa8c96803404159c4bd966a28c18`.

## Předání

Pět souborů tasku a cache evidence se výslovně předávají rootu `webgpu-migration-01a14497-root` pro review, samostatný commit/integraci a sémantický combined preview merge. Nic není nastagované ani commitované. Všechny vlastní procesy skončily, žádné porty/GPU. Po předání agent uvolní claim; release není přijetí či Done. Produkční build/full pipeline a skutečná GPU failure/restart přejímka zůstávají rootu a nejsou nahrazené tímto CPU důkazem.
