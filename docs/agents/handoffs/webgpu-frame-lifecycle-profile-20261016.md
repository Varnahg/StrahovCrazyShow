# Předání: webgpu-frame-lifecycle-profile-20261016 / KEY-31

- Vlastník: `webgpu-mig-01a14497-frame-profile`; příjemce: root `01a14497`.
- Pracovní kopie: `C:/Users/rezac/.codex/worktrees/webgpu-comparison/StrahovCrazyShow`, větev `codex/webgpu-migration`, výchozí HEAD `3a71958`.
- Povolené změny: samostatný `client/webgpu-frame-lifecycle-profile.ts`, jeho nový test, tento handoff a vlastní `.cache/webgpu-migration-checks/frame-lifecycle/`. Game integruje root.

## Výzkum a rozhodnutí před implementací

Native-v7 CM relace `a2ed041f-c13b-4065-b707-9da693bde8ee` má idle raw RAF 59.9 Hz /85 vzorků, ale následně29 engine callbacků během30s přípravy. Root zaznamenal obdobný NCM výsledek (idle60.2Hz/85 vzorků,30 callbacků a timeout30.7s). Nejde o FPS A/B přejímku, ale samotná NCM volba nedostatek callbacků neodstranila.

Pinovaný AbstractEngine._renderLoop objednává další frame až po _processFrame. Ten spouští beginFrame, Game callbacky a endFrame; dosavadní scheduler `rafGap` proto znamená engine-callback gap, **nikoli přímo měřený raw RAF**. Starší formulace v pipeline handoffu se v tomto bodě tímto opravuje. Krátké apply/check/render a submit nevymezují celý synchronní engine frame.

WebGPU endFrame ukončuje pass, timestamp práci, oba hlavní encodery přes finish, submit, vytvoření nových encoderů a deferred texture/buffer destruction. Timestamp endPass navíc synchronně vytváří vlastní query encoder a finish před prvním await; musí být zachyceny všechny encodery vlastního device, nejen dva hlavní. GPUCanvasContext.getCurrentTexture může být synchronní prací při začátku main passu. mapAsync/Promise dokončení nejsou CPU ani GPU časové intervaly k součtu. Ve zdroji není klientský maxFPS/custom requester zápis; runtime hodnoty a skutečný host window se přesto musí doložit.

Varianty: pouze další raw RAF před startem nestačí; pouze begin/end observables nepokrývají plné metody ani jejich vlastní dispatch; globální prototype hooky by zasáhly jiné enginy. Vybrán explicitně vytvořený per-engine/device owner s vlastní současnou raw RAF sondou, wrappery zachovávajícími návraty/this/throw a bounded agregáty. Žádná render policy, cache, timeout, driver volba ani GPU wait se nemění. Submit zůstává stávajícímu compilation profileru.

Schválené API: `new WebGpuFrameLifecycleProfile(engine, { now?, slowCallMs?, onSlowCall?, rawFrame? })`, `snapshot()`, idempotentní `dispose()`. Root konstruuje pouze při jednoznačném loopback `profileEnvironment=1`. Snapshot rozlišuje dostupnost hooků, nullable synchronní měření, inclusive CPU, explicitně nepozorované async completion, raw RAF a engine callback/queue intervaly. Slow callback dostává phase/label/cpuMs/generation/frameId; snapshot ukládá root na začátku/konci přípravy. Chybějící měření nesmí být prezentováno jako nula.

Transient encoder/pass wrapper metadata budou uložena ve WeakMap, restore inventory pouze ve slabých referencích s pevným limitem a cleanup při finish/end. Žádný silný seznam všech GPU resources. Dispose a generation change obnoví pouze stále vlastněné wrappery, zruší pouze vlastní raw RAF a zneplatní pozdní diagnostické větve. CPU testy musí ověřit ochranu před reentrant/throwing observeři, nestandardními deskriptory a cizím přepsáním metod.

Implementace, výsledky a konečné předání budou doplněny po cílených kontrolách. Žádné GPU/UI/build/fullsuite/install v tomto tasku; produkční výsledek a zapojení má root.

## Implementace a přesný měřicí kontrakt

Hotové API odpovídá schválenému návrhu; `FrameLifecycleEngine` přijímá skutečný AbstractEngine i WebGPUEngine bez Game castu. Lifecycle `Observable.add` navíc připouští null a případné odmítnutí/chybu registrace uvádí v hook availability. Nebyl měněn Game ani jiný společný integrační vstup.

Měřené fáze: processFrame, beginFrame, renderFrame, endFrame, queueFrame, flush, endCurrentPass, timestampStart/End/PassEnd, destroyTextures/Buffers, createEncoder, encoderFinish, beginRenderPass, passEnd, currentTexture a queue writeBuffer/writeTexture/copyExternalImage. Submit má nadále samostatný compilation profiler. Wrapper createCommandEncoder zachytí i neznačené query encodery; při attach se převezmou také již existující upload/render encodery a případný aktuální pass.

Snapshot:

- `phases` má samostatné nullable metrics. Když hook nebyl instalován, nevydává nulu. `hooks` uvádí installed/partial/unavailable/ownership-conflict/ownership-lost, počet skutečně připojených a vynechaných objektů. Snapshot i cleanup odhalí cizí přepsání wrapperu a nepřevezmou ho zpět.
- CPU totals/max jsou inkluzivní synchronní délky jednotlivých API metod. Parent/child fáze se nesčítají. Slow event má bounded label, generation a frameId **při vstupu do volání**, tedy endFrame increment nerozdělí tentýž snímek mezi různá ID.
- Po níže doložené P2 opravě `returned`/`thrown` počítají pouze synchronní návrat/výjimku. `asyncCompletion="unobserved"` výslovně říká, že Promise settlement není pozorován. Helper nečte then a nepřipojuje žádné then/catch handlers; původní Promise identita i rejection handling patří callerovi. Pending/async totals byly odstraněny, aby nevydávaly neznámý stav za nulu.
- Současná raw RAF sonda je oddělená od engine process/render callbacků a queue→process wait. Každá distribuce drží jen128 posledních hodnot; count/total/max jsou agregáty příslušné generation/probe epoch. Root musí porovnávat delty pouze při shodné generaci/epoch. Aktivační a disposed stav jsou explicitní. Delivery delay je null při neověřené shodě časových počátků host/global window, nikoli smyšlená nula.
- Runtime zahrnuje maxFPS+defined, active loop count, custom requester, context-lost/skip/background/renderEvenInBackground, host identity a `enableGPUTimingMeasurements`, veřejnou timerQuery capability i `device.features.has('timestamp-query')`. Snapshot žádnou tuto politiku nemění.

## Refaktoring, vlastnictví a lifecycle

Jeden wrapper/measuring/restoration mechanismus obsluhuje všechny fáze, samostatný interval agregátor všechny kadence. Lifecycle subscriptions mají společný null-safe wrapper. Metadata jsou pořizována ve snapshotu; běžné volání neformátuje shader/source dump a bez explicitního helper ownera nejsou žádné hooky či RAF sonda.

Transient bindings jsou ve WeakMap; restore inventory obsahuje pouze WeakRef, nejvýše512. Finish/end úspěšně ukončeného objektu ihned obnoví jeho metody a odstraní záznam. Opuštěné dead refs se průběžně prořezávají; dosažení limitu nezmění API návrat, ale výslovně zhorší coverage. Žádný silný seznam všech encoderů/passů nevzniká.

Dispose zruší pouze vlastní raw RAF, obnoví pouze stále vlastněné deskriptory, odpojí observery a uvolní owner registry. Device/context generation odstraní staré hooky a jejich coverage; pozdní RAF callbacks se nepřičtou do nové generace a po P2 opravě zde nejsou žádné diagnostické Promise callbacks. Cizí engine/device owner se nepřebírá. Změna host window přesune sondu; synchronní nevyhovující RAF provider se neroztočí rekurzivně. Throwing clock/consumer ani reentrant reporting nesmí změnit původní engine návrat či výjimku.

## Ověření první verze 9747476 (historická evidence)

Vše běželo v `.cache/webgpu-migration-checks/frame-lifecycle/`, source/test kopie + readonly junction na dependencies-v5. Žádné instalace, vendor edits, browser, GPU, build, server ani full suite.

- Finální `node node_modules/tsx/dist/cli.mjs --test tests/webgpu-frame-lifecycle-profile.test.ts`: **18/18 PASS**, exit0,0.697s (`lifecycle-tests-final-v2.log`).
- Finální `node typecheck.mjs`: **2954 souborů / 0 diagnostik**, exit0 (`lifecycle-types-final-v2.log`). Součástí je skutečná typed assignability AbstractEngine/WebGPUEngine→helper; žádný integrační cast.
- CPU fixture simuluje celý96ms engine frame:2ms begin,17ms callbacky,77ms end; query encoder je zachycen navíc k hlavním dvěma. Test se nesnaží odhadovat GPU výkon, ale ověřuje přesné hranice a nepřepisování návratů.
- Regrese současných121 raw RAF callbacků proti3 engine callbackům, cap skips, raw delivery vs queue wait, identity/this/argumenty, původní throw/Promise/rejection, ztráta ownership, descriptor restore,1000 uzavřených transient resources + bounded520 opuštěných, chybějící hooky, dvougenerační restore, staré async callbacky, shared-device konflikt, nullable/replayed subscription, host replacement a cancel během request registrace.
- Původní `lifecycle-tests-v1.log` zachovává12/14 pass: dva testové omyly byly přesně opraveny (timestamp parent obsahuje také1ms submit, RAF1000ms interval měl plovoucí zaokrouhlení). Nešlo o GPU reprodukci ani výsledek optimalizace. Následné adversariální kontroly zpřesnily coverage reset, ownership audit, entry frameId a null-safe lifecycle.
- Scoped Prettier a `git diff --check` PASS. Finální source/test/handoff SHA budou v `manifest.json`.

## Peer review P2 — rozhodnutí před navazující opravou

Peer review zjistil, že původní observeResult připojí rejection handler, ale po dispose/generation change již neuchová chybu. Tím změní hostitelské unhandledRejection chování bez trvalé evidence. Native-v8 je zmrazený před touto opravou a nesmí být považován za přijatý konečný profiler.

Varianta A (lifetime ledger + povinný durable error callback) by zachovala asynchronní měření, ale přidala by dalšího vlastníka pozdních chyb, persistence a forwarding lifecycle vedle RenderHealth/compilation profileru. Varianta B (žádné pozorování Promise settlement) je užší a odpovídá této diagnóze: potřebujeme synchronní pre-await práci a současné raw RAF, nikoli další async health vrstvu.

Root schválil B. Před změnou helperu vznikají regresní testy pro nulové čtení then a připojení handlerů, caller-owned rejection a skutečné unhandledRejection v izolovaném CPU subprocessu při active/disposed/new-generation. Nové metriky budou returned/thrown pro synchronní výsledek a explicitní asyncCompletion=unobserved; žádné pending/async totals, které by předstíraly známý stav. Constructor/snapshot/dispose/onSlowCall zůstanou. Implementace a výsledky následují po RED reprodukci.

## P2 oprava — implementace, refaktoring a ověření

Navazující změna vychází z native HEAD4f8e7ed a mění pouze stejné tři vlastní soubory. Z wrapperu byla úplně odstraněna metoda observeResult i všechna čtení then, Promise.resolve a settlement handlers. Jediné měřené výsledky jsou synchronní returned/thrown, přičtené v původním finally bloku; Promise návrat není vydáván za úspěšné async dokončení. Ostatní engine hooky, raw RAF, ownership a veřejné API zůstávají.

- RED před změnou helperu: **16/22 pass,6 fail**, exit1, `promise-side-effects-red.log`. Native Promise then getter měl2 přístupy; skutečný unhandledRejection event byl0 v izolovaných active/dispose/generation subprocessích. Po dispose byla původní evidence pending1/failures0.
- GREEN: **22/22 PASS**, exit0,1.219s, `promise-side-effects-green.log`. Getter then ani záměrně nebezpečný thenable getter není vůbec čten. Callerem připojený catch dostane původní error; samostatné subprocessy ověřují původní Promise/error identity a unhandledRejection observed1 ve všech třech lifetime stavech. Synchronní throw zůstává původní a má oddělený thrown counter.
- Strict TS: **2954 souborů /0 diagnostik**, exit0, `promise-side-effects-types.log`; stále ověřuje skutečné AbstractEngine/WebGPUEngine assignability bez integračních castů.
- Příkazy z původního vlastního stagingu: `node node_modules/tsx/dist/cli.mjs --test tests/webgpu-frame-lifecycle-profile.test.ts`, `node typecheck.mjs`. Tři malé child procesy jsou CPU-only, bez shell interpolace, s timeoutem a ukončením; nevytvářejí žádný server ani GPU.
- Baseline helper je zachovaný v `promise-before.ts`; aktuální source/test/handoff a baseline SHA jsou v `promise-fix-manifest.json`. Starší logy/manifest se nepřepisují. Scoped Prettier a git diff --check PASS.

Native-v8 zůstává immutable před opravou. Root má uložit případnou diagnostiku s jeho skutečným source hash, nikoli ji zpětně označit za verzi tohoto opraveného helperu. KEY31 je nadále In Progress; následuje samostatný commit/release a root review/integrace.

## Předání a otevřené ověření

Helper nevydává příčinu1Hz engine callbacků za známou. Root zapojí owner pouze pro loopback opt-in, uloží startup/end snapshot a slow events a teprve potom rozliší engine CPU, skip policy a skutečnou active raw RAF kadenci. Případný následný GPU-timing-off experiment není součástí této změny a potřebuje srovnatelný vlastní snapshot.

Všechny vlastní CPU procesy skončily. Po samostatném commitu pouze helperu/testu/handoffu a předání rootovi se rezervace uvolní. Linear KEY-31 obsahuje průběžné research/decision/test informace, zůstává In Progress. Produkční GPU/UI a stabilní společnou přejímku má root; CPU fake-host testy je nenahrazují.
