---
title: 'Dávkovaná příprava WebGPU shaderů při načítání'
type: 'refactor'
created: '2026-11-02'
status: 'in-progress'
route: 'oneshot'
context:
  - 'AGENTS.md'
  - 'docs/agents/bmad-policy.md'
  - 'docs/agents/tasks/render-next-20261102-root.json'
  - 'docs/agents/tasks/webgpu-shader-scheduling-20261102.json'
---

<frozen-after-approval reason="Uživatel výslovně zadal další optimalizaci, její dokončení a samostatnou navazující optimalizaci proti zásekům.">

## Intent

Zmenšit dlouhé synchronní dávky vytváření WebGPU shaderových modulů při zakrytém startu celé hry. Normální produkční foreground pokus na GTX1060 zaznamenal jediný high/day-1-on render 20 826,5 ms; uvnitř stejného intervalu 35 pomalých createShaderModule volání zabralo 18 108,5 ms. Přesné shaderové cache zatím nemají dost doložených opakování. Rozdělit spuštění příprav do omezených dávek a změřit, zda se zkrátí nejdelší blokování bez zhoršení celkového startu.

Zachovat všechny původní shaderové vstupy, materiály, renderované varianty Low/Medium/High, dva potvrzovací draw průchody, health/validation/submission podmínky a existující timeouty. Žádné vynechání High, zvýšení timeoutu nebo prohlášení čekajícího shaderu za hotový. Přijetí vyžaduje skutečný úspěšný start a srovnatelné měření; CPU regrese samotná není důkaz FPS. Při zániku hry se čekající práce nesmí později dotknout rendereru. Po startu se adaptér odstraní a běžná herní smyčka nemá frontu navíc.

Pouze kanonický main. Zachovat původní Docker8080 a neúspěšné důkazy; buildy jen jako nové neměnné výstupy v .cache, bez kopií projektu/větví/worktrees. Tři původní cizí necommitnuté evidenční soubory zůstávají mimo rozsah. Následná druhá optimalizace proti herním zásekům přijde až po dokončení a commitu tohoto celku.

</frozen-after-approval>

## Implementation Notes

- Candidate5 už skutečně doručil CPU čítače: ve stejné generaci390 WGSL dvojic zabralo12 227,6ms, createEffect9853 volání12 932,4ms; žádné crossing/ambiguous/observerErrors/omissions. Po Lowtimeout31 236,8ms následuje rozlišení jednotlivých metod. Rozšířený profiler15/15 a integrační sada91/91 PASS, scope výslovně zakazuje sčítání child/parent a název „parser“ pro nerozlišené reziduum. Přenosový test nyní ověřuje také nenulové2/3/5/7ms child čítače přes oba skutečné privacy filtry. Původní7ms RED důkaz z candidate4 zůstává zachovaný.

- Rozhodnutí po A/B: od candidate4 je odmítnutá plošná fronta **výchozí vypnutá**; aktivuje ji pouze loopback`startupShaderScheduling=queued`. Starý candidate3 a jeho URL významy zůstávají zachované v archivované evidenci. Nativní výchozí cesta stále používá material guard a společný nativní completion retry. Nový CPU profiler a integrace mají87/87 cílených testůPASS; samostatnýhelper12/12 + scopedTypeScript. Nejde o dokončenou výkonovou opravu, nýbrž odstranění naměřené regrese z výchozího WIP a přesnější další měření.

- Po candidate3 ABBA je plošný deferral zamítnutý pro další přijetí: všechny čtyři starty timeoutovaly; prvních7 dokončených Low variant bylo s frontou v této malé sérii v průměru o25,7% delších, při stejných konečných počtech objektů. Oddělený instrumentovaný start má20,1225s CPU delta render callbacků proti44,8ms endFrame. Jeho inventář textů3,5765s není výkon hry. Navazuje pouze loopback `profileStartupCpu=1`: samostatný engine-owned profiler měří synchronní createEffect caller interval a WGSL initialize/finalize pair před nativním API, bez shaderových textů. Async include/generační/neuzavřené intervaly se nesmějí vydávat za CPU práci. Rootdelegovalhelper/testy/handoffsamostatnýmtaskem; Game loguje snapshotpředpřípravou a přiukončenístartupscope, kterýpřiúspěchuobsahujeisubmittedgate. Timeouty/readiness ani grafika se nemění.

- Kontrolní srovnání3.11.: explicitní loopback query `startupShaderScheduling=native` nastaví shader helper `enabled:false`; remote host i běžná URL zachovají queued cestu. Helper v tomto režimu neinstaluje hooks/RAF, native Babylon callback zůstává synchronní. Stejný neměnný klientský build tak dovolí izolovat frontu při zachování material guard, pipeline/health/submission gates, stejné scény a časových limitů. Snapshot inertního helperu dokládá vypnutí; nejde o přijetí rychlejší varianty ani o volbu běžného hráče. Testy pokrývají loopback/remote a zachování ostatních gates.

- Aktualizace3.11.2026: candidate1 odhalil skutečný main-pass hot-swap nesoulad sun80B/pipeline96B. Per-instance StartupMaterialReadiness a retained-cleanup kontrola jej reprodukují a pokrývají v CPU regresích; související sada114/114 a build PASS. Candidate2 přesto timeoutoval v Low po30 466,8ms; v jednom pokusu se80/96 neopakovalo, `Game.ready` není doložené. [Rozbor](../../../docs/performance/evidence/render-next-20261102/startup-forensics.md) a raw hashe určují další izolaci fronty se zachovanou materiálovou ochranou. Frozen intent ani přejímací limity se nemění; task není dokončený.

- Podklady: normální foreground session `9acaaaad-5f3a-4d03-ae88-b519303d6b1b` a instrumentovaná `e675bb96-8f7a-4311-808c-2a37eea3152f`, baseline source/test `a03e0c635074c656ad73259b1626d3dafbe9e79ebd0a6e843f22c01fb684f904`. Předchozí neaktivní karta dávala raw RAF přibližně 1 Hz. Přesun téže karty do vlastního aktivního okna přes podporované browser management API obnovil presentation 59,9–60,2 Hz. Neaktivní pokusy nejsou FPS baseline.
- Běžný start: Low complete24,314s; High timeout46,873s po dlouhém synchronním volání, Medium se nedosáhlo. Instrumentovaný start Low complete25,639s/High timeout30,050s. Rozšířený inventář sám spotřeboval4,493s, jeho vnořené časy nesčítat. GPU celokaretní vzorky kritického úseku měly5% a přibližně3,8/6GiB; nejsou důkazem přesné příčiny blokování nativního API.
- Varianty: přesná module cache (jen8/884 známých opakování,516unknown, navíc retence textů/device lifecycle); odstranění nepoužitých defines (sémantická rizika,11/884candidatehits); nižší pipeline concurrency (stávající cap64 se uplatňuje až po shader module creation); odstranění variant/prodloužení timeoutu (nesplní požadované chování); zvolen omezený přísun skutečných shader preparations před nativním voláním. Přínos této volby je hypotéza ověřovaná A/B, nikoli předem přijatý výsledek.
- Primární kód: Babylon9.30 `webgpuEngine.pure.js:_preparePipelineContextAsync` vytváří synchronně vertex/fragment moduly a zavolá onReady; `effect.functions.js:createAndPreparePipelineContext` ignoruje návratovou Promise a čeká na callback. WebGPU context má isAsync=false, takže nestačí obyčejné odmítnutí Promise bez vlastního error consumeru. `WebGpuCompilationProfile` musí dál zachytávat skutečné nativní volání; nová fronta bude vně jeho wrapperu.
- Helper `client/webgpu-shader-preparation.ts` a jeho test vlastní podagent. FIFO s počátečním CPU rozpočtem4ms, maximem4 preparations na callback a omezenou frontou. Jediné nativní synchronní volání nelze přerušit; rozpočet je kooperativní, ne tvrzení tvrdého4ms stropu. Převzatý engine/device/receiver a argumenty zůstanou identické. Požadavky se po provedení/zrušení uvolní; žádná dlouhodobá cache shaderových textů či GPU objektů.
- Integrace rootu v `client/game.ts`: vlastnictví pouze ve scope startup quality/light preparation až do posledního submitted-frame gate, explicitní pending guard a diagnostický snapshot. Abort/engine dispose/retired context musí zastavit čekající práci; finally obnoví jen vlastněné hooks, nepřepíše cizí pozdější změnu. WebGL cesta inertní. `tests/game-webgpu-startup.test.ts` doplní skutečnou startup hranici a cleanup; helper testuje FIFO/budget/receiver/errors/cancellation/pinned callback kontrakt.
- Před dalším runtime zápisem původní run3 ukončen STOP, API exited, inputsRevalidated a cleanupErrors[] doloženy. Sampler ukončen, původní build se nepřepisuje. Kandidátní harness má vlastní evidence adresář a pojmenované výstupy; všechny nové testy patří do source manifestu. Výchozí profilovat bez profileEnvironment; rozšířený profiler pouze samostatně.
- Ověření: cílené shader/startup/lifecycle/quality testy, nezávislé čtecí review; nad stabilním checkpointem TypeScript/produkční build, celá sada a izolovaná SDK integrace podle rozsahu. Potom aktivní Edge, stejný viewport/GPU/QA počasí a skutečná produkční scéna. Zaznamenat nejdelší blokování, queue counters, startup doby i případné neúspěchy; alespoň opakovaný ready bez shader/device chyb. Dřívější PDF/řadičové nestability se nevyřeší přeznačením testu na PASS.
- Native rebuild se stages musí podle pinned nonFloatVertexBuffers zachovat synchronní provedení ve stejném draw; fronta proto řídí jen čerstvé contexts. Staged/lazy GLSL passthrough je zvlášť počítaný a zůstává krytý původními health/effect kontrolami. Helper14/14 a Game25/25 cílených testů PASS; první společná sada187/188 odhalila pouze source-regex očekávající původní druhý parametr prepareLighting, následně20/20 této fixture PASS. Žádný původní neúspěch se nepřepisuje.

## Review Triage Log

- Candidate4 instrumentace / opraveno: Game vložil nový CPU snapshot podklíč`profile`; skutečný privacy sanitizer tento klíč správněodstranil, takže session1b26f970 obsahuje pouze stage/rendererId a žádnépoužitelnéCPUčítače. ŽádnéCPUzávěryznínevyvozovat. Pojmenovánízměněnona`timing` podleexistujícíframe diagnostiky; privacypravidlo nezměněné. NováGame regrese používáskutečnýhelper snenulovým7msčítačem, clientsanitize aservervalidateDiagnosticsBatch: původníREDreprodukován, výslednásada88/88PASS. Candidate4 STOP/inputrevalidationPASS13:50:29.778UTC, vlastnísampler/kartaukončené, viewportreset.

- Kontrola3.11. / opraveno: inertní native varianta původně odstraňovala i completion signál pro opakování jednorázových RTT. Oba režimy nyní čtou stejný allocation-free nativní settlement čítač z vnitřního compilation profileru. Reálné Babylon `ObjectRenderer.shouldRender`, `PostProcess.apply` a `PostProcessManager._finalizeFrame` v Game startup regresi prokazují přeskočený pending postprocess před pipeline draw a následný jediný retry. RED s původní Game řádkou reprodukován, původní zelené zdroje bajtově obnoveny; společná sada172/172 PASS. Nezávislé review blockers[]. Žádné nové Promise observers/hooks ani změna readiness/timeoutů.

- High / opraveno: helper dispose mohl oznámit chybu přes onError bez throw, ale Game po finally původně publikoval ready. Nový assertStartupActive po celém cleanupu a regrese chyby obnovy hooku brání ready/render loop a ověřují dispose obou ownerů. Nezávislé zaměřené přezkoumání opravy: blockers[].
