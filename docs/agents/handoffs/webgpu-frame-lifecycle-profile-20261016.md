# Předání: webgpu-frame-lifecycle-profile-20261016 / KEY-31

- Vlastník: `webgpu-mig-01a14497-frame-profile`; příjemce: root `01a14497`.
- Pracovní kopie: `C:/Users/rezac/.codex/worktrees/webgpu-comparison/StrahovCrazyShow`, větev `codex/webgpu-migration`, výchozí HEAD `3a71958`.
- Povolené změny: samostatný `client/webgpu-frame-lifecycle-profile.ts`, jeho nový test, tento handoff a vlastní `.cache/webgpu-migration-checks/frame-lifecycle/`. Game integruje root.

## Výzkum a rozhodnutí před implementací

Native-v7 CM relace `a2ed041f-c13b-4065-b707-9da693bde8ee` má idle raw RAF 59.9 Hz /85 vzorků, ale následně29 engine callbacků během30s přípravy. Root zaznamenal obdobný NCM výsledek (idle60.2Hz/85 vzorků,30 callbacků a timeout30.7s). Nejde o FPS A/B přejímku, ale samotná NCM volba nedostatek callbacků neodstranila.

Pinovaný AbstractEngine._renderLoop objednává další frame až po _processFrame. Ten spouští beginFrame, Game callbacky a endFrame; dosavadní scheduler `rafGap` proto znamená engine-callback gap, **nikoli přímo měřený raw RAF**. Starší formulace v pipeline handoffu se v tomto bodě tímto opravuje. Krátké apply/check/render a submit nevymezují celý synchronní engine frame.

WebGPU endFrame ukončuje pass, timestamp práci, oba hlavní encodery přes finish, submit, vytvoření nových encoderů a deferred texture/buffer destruction. Timestamp endPass navíc synchronně vytváří vlastní query encoder a finish před prvním await; musí být zachyceny všechny encodery vlastního device, nejen dva hlavní. GPUCanvasContext.getCurrentTexture může být synchronní prací při začátku main passu. mapAsync/Promise dokončení nejsou CPU ani GPU časové intervaly k součtu. Ve zdroji není klientský maxFPS/custom requester zápis; runtime hodnoty a skutečný host window se přesto musí doložit.

Varianty: pouze další raw RAF před startem nestačí; pouze begin/end observables nepokrývají plné metody ani jejich vlastní dispatch; globální prototype hooky by zasáhly jiné enginy. Vybrán explicitně vytvořený per-engine/device owner s vlastní současnou raw RAF sondou, wrappery zachovávajícími návraty/this/throw a bounded agregáty. Žádná render policy, cache, timeout, driver volba ani GPU wait se nemění. Submit zůstává stávajícímu compilation profileru.

Schválené API: `new WebGpuFrameLifecycleProfile(engine, { now?, slowCallMs?, onSlowCall?, rawFrame? })`, `snapshot()`, idempotentní `dispose()`. Root konstruuje pouze při jednoznačném loopback `profileEnvironment=1`. Snapshot rozlišuje dostupnost hooků, nullable měření, inclusive CPU, případnou async completion latency, raw RAF a engine callback/queue intervaly. Slow callback dostává phase/label/cpuMs/generation/frameId; snapshot ukládá root na začátku/konci přípravy. Chybějící měření nesmí být prezentováno jako nula.

Transient encoder/pass wrapper metadata budou uložena ve WeakMap, restore inventory pouze ve slabých referencích s pevným limitem a cleanup při finish/end. Žádný silný seznam všech GPU resources. Dispose a generation change obnoví pouze stále vlastněné wrappery, zruší pouze vlastní raw RAF a zneplatní pozdní diagnostické větve. CPU testy musí ověřit ochranu před reentrant/throwing observeři, nestandardními deskriptory a cizím přepsáním metod.

Implementace, výsledky a konečné předání budou doplněny po cílených kontrolách. Žádné GPU/UI/build/fullsuite/install v tomto tasku; produkční výsledek a zapojení má root.

## Implementace a přesný měřicí kontrakt

Hotové API odpovídá schválenému návrhu; `FrameLifecycleEngine` přijímá skutečný AbstractEngine i WebGPUEngine bez Game castu. Lifecycle `Observable.add` navíc připouští null a případné odmítnutí/chybu registrace uvádí v hook availability. Nebyl měněn Game ani jiný společný integrační vstup.

Měřené fáze: processFrame, beginFrame, renderFrame, endFrame, queueFrame, flush, endCurrentPass, timestampStart/End/PassEnd, destroyTextures/Buffers, createEncoder, encoderFinish, beginRenderPass, passEnd, currentTexture a queue writeBuffer/writeTexture/copyExternalImage. Submit má nadále samostatný compilation profiler. Wrapper createCommandEncoder zachytí i neznačené query encodery; při attach se převezmou také již existující upload/render encodery a případný aktuální pass.

Snapshot:

- `phases` má samostatné nullable metrics. Když hook nebyl instalován, nevydává nulu. `hooks` uvádí installed/partial/unavailable/ownership-conflict/ownership-lost, počet skutečně připojených a vynechaných objektů. Snapshot i cleanup odhalí cizí přepsání wrapperu a nepřevezmou ho zpět.
- CPU totals/max jsou inkluzivní synchronní délky jednotlivých API metod. Parent/child fáze se nesčítají. Slow event má bounded label, generation a frameId **při vstupu do volání**, tedy endFrame increment nerozdělí tentýž snímek mezi různá ID.
- `asyncSamples` se týká pouze Promise vrácených skutečně hookovanými metodami. Původní Promise identita je zachována, diagnostická větev má rejection handler a generation/dispose guard. Interní background timestamp mapAsync completion zde **není** změřena; nula v asyncSamples není nulová GPU/readback latence.
- Současná raw RAF sonda je oddělená od engine process/render callbacků a queue→process wait. Každá distribuce drží jen128 posledních hodnot; count/total/max jsou agregáty příslušné generation/probe epoch. Root musí porovnávat delty pouze při shodné generaci/epoch. Aktivační a disposed stav jsou explicitní. Delivery delay je null při neověřené shodě časových počátků host/global window, nikoli smyšlená nula.
- Runtime zahrnuje maxFPS+defined, active loop count, custom requester, context-lost/skip/background/renderEvenInBackground, host identity a `enableGPUTimingMeasurements`, veřejnou timerQuery capability i `device.features.has('timestamp-query')`. Snapshot žádnou tuto politiku nemění.

## Refaktoring, vlastnictví a lifecycle

Jeden wrapper/measuring/restoration mechanismus obsluhuje všechny fáze, samostatný interval agregátor všechny kadence. Lifecycle subscriptions mají společný null-safe wrapper. Metadata jsou pořizována ve snapshotu; běžné volání neformátuje shader/source dump a bez explicitního helper ownera nejsou žádné hooky či RAF sonda.

Transient bindings jsou ve WeakMap; restore inventory obsahuje pouze WeakRef, nejvýše512. Finish/end úspěšně ukončeného objektu ihned obnoví jeho metody a odstraní záznam. Opuštěné dead refs se průběžně prořezávají; dosažení limitu nezmění API návrat, ale výslovně zhorší coverage. Žádný silný seznam všech encoderů/passů nevzniká.

Dispose zruší pouze vlastní raw RAF, obnoví pouze stále vlastněné deskriptory, odpojí observery a uvolní owner registry. Device/context generation odstraní staré hooky a jejich coverage; pozdní Promise/RAF callbacks se nepřičtou do nové generace. Cizí engine/device owner se nepřebírá. Změna host window přesune sondu; synchronní nevyhovující RAF provider se neroztočí rekurzivně. Throwing clock/consumer ani reentrant reporting nesmí změnit původní engine návrat či výjimku.

## Skutečné cílené ověření

Vše běželo v `.cache/webgpu-migration-checks/frame-lifecycle/`, source/test kopie + readonly junction na dependencies-v5. Žádné instalace, vendor edits, browser, GPU, build, server ani full suite.

- Finální `node node_modules/tsx/dist/cli.mjs --test tests/webgpu-frame-lifecycle-profile.test.ts`: **18/18 PASS**, exit0,0.697s (`lifecycle-tests-final-v2.log`).
- Finální `node typecheck.mjs`: **2954 souborů / 0 diagnostik**, exit0 (`lifecycle-types-final-v2.log`). Součástí je skutečná typed assignability AbstractEngine/WebGPUEngine→helper; žádný integrační cast.
- CPU fixture simuluje celý96ms engine frame:2ms begin,17ms callbacky,77ms end; query encoder je zachycen navíc k hlavním dvěma. Test se nesnaží odhadovat GPU výkon, ale ověřuje přesné hranice a nepřepisování návratů.
- Regrese současných121 raw RAF callbacků proti3 engine callbackům, cap skips, raw delivery vs queue wait, identity/this/argumenty, původní throw/Promise/rejection, ztráta ownership, descriptor restore,1000 uzavřených transient resources + bounded520 opuštěných, chybějící hooky, dvougenerační restore, staré async callbacky, shared-device konflikt, nullable/replayed subscription, host replacement a cancel během request registrace.
- Původní `lifecycle-tests-v1.log` zachovává12/14 pass: dva testové omyly byly přesně opraveny (timestamp parent obsahuje také1ms submit, RAF1000ms interval měl plovoucí zaokrouhlení). Nešlo o GPU reprodukci ani výsledek optimalizace. Následné adversariální kontroly zpřesnily coverage reset, ownership audit, entry frameId a null-safe lifecycle.
- Scoped Prettier a `git diff --check` PASS. Finální source/test/handoff SHA budou v `manifest.json`.

## Předání a otevřené ověření

Helper nevydává příčinu1Hz engine callbacků za známou. Root zapojí owner pouze pro loopback opt-in, uloží startup/end snapshot a slow events a teprve potom rozliší engine CPU, skip policy a skutečnou active raw RAF kadenci. Případný následný GPU-timing-off experiment není součástí této změny a potřebuje srovnatelný vlastní snapshot.

Všechny vlastní CPU procesy skončily. Po samostatném commitu pouze helperu/testu/handoffu a předání rootovi se rezervace uvolní. Linear KEY-31 obsahuje průběžné research/decision/test informace, zůstává In Progress. Produkční GPU/UI a stabilní společnou přejímku má root; CPU fake-host testy je nenahrazují.
