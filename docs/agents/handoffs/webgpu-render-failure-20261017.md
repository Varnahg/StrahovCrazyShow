# Předání: webgpu-render-failure-20261017

## Aktuální oprava review hranice — terminální frame/endFrame veto

Root vrátil původní WIP autorovi pro konkrétní review nález; znovu získán stejný task/owner s doloženým `--adopt-dirty`. Pinned `_processFrame` neověřuje počet activeRenderLoops před begin/end: `stopRenderLoop` samo nedokáže odvolat již vybraný callback. Doplněná skutečná CPU reprodukce také prokázala druhou hranici: callback může synchronně nahlásit health fault a normálně se vrátit, takže samotný outer catch následující endFrame nezastaví.

Obě varianty selhaly před opravou: `frame-health-terminal-red.log` má30testů,28PASS/2FAIL (exit1). První trace vydala begin/end/submit i s prázdnými active loops, druhá po synchronním reportu vydala end/submit. Přesné RED zdroje jsou zachované v `terminal-red-inputs/client/render-health.ts` a `terminal-red-inputs/tests/render-health.test.ts` pod stejnou cache.

Root před implementací výslovně schválil jeden úzký instanční `endFrame` veto navíc k `_processFrame` veto. Obě metody nyní sdílí descriptor/ownership/disposal instalační logiku. Při phase invalid/restart-required se originál vůbec nevolá. EndFrame nemá nový catch ani nevytváří sentinel výjimku: zdravý ruční návrat/throw dál patří původnímu callerovi. Zdravé `_processFrame` nadále zachovává původní return/throw/receiver/args; chybové zaznamenání a číselná deduplikace jsou stejné. Disposed wrappery jsou transparentní a cleanup nemaže pozdějšího vlastníka.

`endFrame` veto chrání i ruční finalizaci **již terminálního** rendereru. Neznamená to převzetí celé ruční preview/startup draw cesty: pokud její vlastní catch zatím chybu do health nenahlásil, zůstává odpovědnost tohoto calleru. Žádné kopírování RAF implementace, další hooky, opravný flush nebo Promise inspekce nebyly přidány. Pro BMAD ImplementationNotes je vhodné uvést rozšíření ze samotného `_processFrame` catch na dvojici `_processFrame` catch/veto + `endFrame` veto; veřejné API zůstává stejné.

- Finální `frame-health-terminal-green.log`: **32/32PASS**, exit0. Obsahuje předchozí scénáře plus late RAF se0loops, normálně navrácený inline fault, zdravé endFrame receiver/args/return/throw/thenable, obě skutečná profiler pořadí pro endFrame, pozdějšího vlastníka a unavailable/accessor/immutable policy pro oba hooky.
- `frame-health-terminal-types.log`: **2956souborů,0diagnostics**, exit0; vlastní diff check PASS.
- Manifest `manifest-terminal.json`, SHA-256 `580526734aaa21f788113c737dd63c1d7302ac8e97e67b68222bcf53cf31eabd`, uvádí přesné RED kopie, aktuální4inputs shodné s WT a log/harness/primární zdroje. Původní `manifest.json` zůstává historickou evidencí prvního28testového checkpointu.
- Aktuální health SHA-256 `7a5027922feb2292e9238917a7af58a2371187446d8cc36f0324562e49d583a4`; aktuální test SHA-256 `16af69dc8edf07afe9f6c467560fe17d2be8b5e7d073893340807c514d5e1dd8`. Tyto hashy nahrazují starší freeze níže a jsou předané rootu pro finální review.

Vlastní procesy skončily; žádné GPU, build/full suite/server/instalace. Zdroj/test jsou zmrazené. Tři soubory WIP a evidence se opět výslovně předávají rootu jako příjemci pro review/commit/integraci; podagent nic nestagoval ani necommitoval a po předání uvolní claim. Praktická Game/UI/GPU přejímka zůstává rootu.

- Vlastník: `webgpu-mig-01a14497-render-failure`, agent `shader_inventory`; příjemce root.
- WT `C:/Users/rezac/.codex/worktrees/webgpu-comparison/StrahovCrazyShow`, základ `5cdb14e25afbdf83a9f5fa0707b31fed5caea184`.
- Scope: pouze `client/render-health.ts`, `tests/render-health.test.ts`, toto předání a `.cache/webgpu-migration-checks/render-failure/`. Game/UI/resize/quality/input integraci vlastní root.
- Načteny aktuální primární AGENTS/policy, celý BMAD spec `spec-key-39-shadow-freshness-20261017.md` a jeho tři task contexty. Žádné rekurzivní BMAD workflow.

## Průzkum a rozhodnutí před implementací

Exact C4 snapshot `1383fc9296d70d256ead4c6df0ac87892cdcd522426272bc8e7288613266f277` má šest přečtených Game/UI/health/startup/validation/frame-profile souborů hashově shodných s manifestem a readonly dependencies-v5. Uživatelský log `user-test-20261017-completed/session-prefix.jsonl` dokládá validation faults seq2412/2413, pozdější UI stále ready, synchronní createBindGroup TypeError seq2496 a konec herních callbacků. Později odeslaný seq2498 obsahuje jen snímky před výjimkou (`toMs738221.7 < 738259.4`). Focus před pozdějším stale-texture submit seq3676 není doložená příčina flush.

Pinned `AbstractEngine._processFrame` volá `beginFrame` → `_renderFrame` → `endFrame` bez catch/finally. `_renderLoop` plánuje další RAF až potom. Sync chyba při JS descriptor konverzi se nemusí stát `uncapturederror`, a původní RenderHealth nemá přímý capture celého snímku. Game-only catch mine `endFrame`; globální window.error nerozlišuje vlastníka; volitelný frame profiler je pouze diagnostika a žádný fail callback neposkytuje. Vlastní kompletní RAF scheduler by zbytečně měnil chování a lifecycle.

Zvolený nejmenší zásah je vždy aktivní per-engine `_processFrame` wrapper v RenderHealth. Zachová původní synchronní return/throw/receiver/argumenty; nebude inspektovat then ani přidávat Promise handlery. Dedup použije pouze číselný error counter a generační epochu, žádný snapshot v horké cestě. Report chyby nesmí nahradit originální exception; wrapper nesmí opravně volat endFrame/flush. Chybějící/accessor/readonly hook znamená explicitní render fault, nikoli nepozorovaný healthy stav. Root tuto fail-closed politiku schválil.

Obnova contextu musí přes existující onFault doručit channel=device s novou generací a restart-required, včetně případu bez předchozího loss eventu. Callback může být synchronní už během konstrukce RenderHealth, kdy externí Game.renderHealth ještě není přiřazené; vlastní změna se o toto přiřazení neopírá. Ruční begin/render/end v avatar preview tento hook sám nepokrývá; preview již má vlastní zachycení a vlastněný scheduler.

## Ověření

Implementace má jediného health vlastníka na engine. Instanční descriptor se instaluje bez čtení getterů a uvolní jen pokud je stále vlastněný; pozdější wrapper není přepsán. Retained wrapper po disposal pouze deleguje originálu. Úspěšný frame provede pouze kontrolu receiveru/disposal a přečte číselnou generaci/error counter; nepřidává snapshot, token ani kopii pole argumentů. `frameFailed` sjednocuje kontrolu proměnného lifecycle po synchronním původním volání a současně odstraňuje nesprávné TypeScript narrowing přes toto volání. Scope nejsou ruční preview draw ani cizí engine/global window chyby.

Obnova contextu použije společnou device terminální cestu s novou epochou. Loss+restore nyní správně poskytují dvě device notifikace v různých generacích; duplicitní loss uvnitř stejné generace zůstává jediný. Pending guard po obnově dostane důvod nové epochy; stará async operace nemůže změnit nové čítače. `onFault` API se nezměnilo.

Izolovaný staging `.cache/webgpu-migration-checks/render-failure/` obsahuje přesné4inputs, konfiguraci, scoped TS runner a readonly junction na dependencies-v5. Reprodukce používá skutečný pinned `AbstractEngine._renderLoop/_processFrame/_renderFrame` na NullEngine, řízené throw v begin/callback/end/submit a skutečný volitelný `WebGpuFrameLifecycleProfile` v obou pořadích připojení. Jde o CPU ownership/lifecycle důkaz, nikoli vykreslení na GPU.

- Před runtime implementací `frame-health-red-v3.log`: **28 testů,17PASS,11FAIL**, exit1. Chybí zachycení frame faultů, restore callback a explicitní unavailable/owner ochrana. První pokus měl importní fixture chybu (`AbstractEngine` barrel); opraven import přímo pinned `.pure`. Red-v2 navíc odhalil fixture promise cleanup, upravený v Red-v3 bez async activity po skončení testu.
- První implementace `frame-health-green-v1.log`: **27/28PASS**, jediný fail byl nesprávný fixture přístup `snapshot().metrics` místo existujícího `.phases`. Scoped `frame-health-types-v1.log` měl1diagnostic kvůli TS narrowing fáze přes volání, jež může synchronně dispose/restore renderer.
- Po cíleném refaktoringu `frame-health-final.log`: **28/28PASS**, exit0; `frame-health-types-final.log`: **2956 souborů,0diagnostics**, exit0. Příkazy `TSX_DISABLE_CACHE=1 node --import tsx --test tests/render-health.test.ts` a `node typecheck.mjs` v uvedeném stagingu.
- Pokrytí: všechny čtyři frame throw body, rejection guard identity, reporter failure/dedupe, původní args/return/receiver, žádný snapshot na success, then-getter/Promise návraty, restore bez loss, stará generace/dispose, dva renderery, inherited/own descriptor, pozdější owner, unavailable/accessor/immutable hook, opakovaný owner a actual profiler layering.
- `git diff --check` nad vlastními soubory PASS.

Manifest `.cache/webgpu-migration-checks/render-failure/manifest.json`, SHA-256 `26517f1fd0a1a2774e8766968cd0c6d9dc029aeef362643c0d06836fa315fa59`, obsahuje přesné aktuální4inputs shodné s WT, původní baseline runtime hash, pinned Babylon zdroje, harness a RED/GREEN/TS log hashy. RED log výslovně předchází posledním fixture opravám; současné input hashy patří finálnímu GREEN.

Freeze pro review:
- `client/render-health.ts`: SHA-256 `36ee444acf17a21b7858d331c023f6fb09859807337d4064db042838fc301683`.
- `tests/render-health.test.ts`: SHA-256 `5ab1bb5197156ef0c97a988a1dca53e9a10a9ca309ffd66a47fa4acc64cbeb31`.

Žádný GPU, full suite, build, server, instalace ani změny frozen snapshotů. Všechny vlastní procesy skončily. Root má přesný freeze pro nezávislé BMAD review; jeho Game/UI integrace a skutečný produkční failure/restart scénář zůstávají otevřené. Nic není nastagované ani commitované. Tento tří-souborový WIP a evidence se výslovně předávají rootu (`webgpu-migration-01a14497-root`) pro případné opravy po review, samostatný commit a integraci; po předání agent uvolní task/slot. Uvolnění není Done.
