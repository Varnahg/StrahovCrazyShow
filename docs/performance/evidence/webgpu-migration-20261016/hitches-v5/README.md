# KEY-31: asynchronní příprava startup pipeline

**Startup celek je integrován, gameplay zásek při prvním F zůstává otevřený.** Native commit `8d20cecc72066b498e735b8b2524fd23baa19eff` → main `232cffb1fd67b47766fedd2b27c933ddf786e617`. Výchozí backend se nemění. Hraný4193/C5 snapshot `c4e22edd3b691fce2827b5132ccbc09ec404a0aa6fd1338925ffddbe8a5be6f5` zůstal neměnný.

## Rozhodnutí a skutečný rozsah

[Předchozí první F](../hitches-v4/README.md) přidal80 modulů bez přesných či nových odvozených duplicit. Cache identického WGSL neměla doložený přínos. Receiver pokus přidával4,5ms/frame; stable torch by měnila fixed-cap výběr, street budget a souběh svítilny se vzdáleným řidičem. Zvolený menší zásah používá přesné aktuální descriptory a asynchronní pipeline pouze pod existujícím neprůhledným loading coverem.

`WebGpuPipelinePreparation` obaluje instance cache missů a skutečných `_draw`/clear cest připnutého Babylon9.30. Native builder dostává aktuální buffers/instance overrides, texture state, MRT, MSAA, blend a depth/stencil. Pending signál zůstává uvnitř vlastního draw; žádná náhradní pipeline ani Promise se nepředá GPU. Výsledek se z Promise nikdy nevkládá do měnící se cache: převezme jej až další platný synchronní požadavek a původní Babylon cesta provede insert/counters. Bounded záznamy, Effect/context/device identity a ownership kontroly chrání lifecycle.

Neúplné skryté průchody resetují ObjectRenderer refresh counters; once-only target tak skutečně zkusí další render. Ready výsledek, který aktuální eligible scéna při vynuceném retry nevyžádá, lze uvolnit jako neaktivní, nikoli vydávat za připravenou budoucí variantu. Pending práce dál blokuje readiness. Zachovány jsou původní timeouty, Effect/health kontroly, dva kompletní acceptance průchody a finální submitted-frame gate. Scope trvá přes restore a končí před gameplay. WebGL, fast a snapshot větve mají inertní helper.

[WebGPU specifikace](https://www.w3.org/TR/2026/CRD-webgpu-20260915/#dom-gpudevice-createrenderpipelineasync) popisuje async pipeline jako použitelnou po dokončení Promise bez dalšího čekání na její přípravu. To je mechanismus, nikoli obecná záruka kratšího startupu.

## Ověření a integrace

| Checkpoint | Testy | Build | Izolovaná integration |
|---|---:|---|---|
| Native `d7490c53…59047` |1296/1296 PASS|PASS|PASS|
| Produkční kombinace `ec2802da…6c563` |1352/1352 PASS|PASS|PASS|
| Dřívější QA `998afe35…47ecb` |1364/1368,4 VM fixture chyby|targeted/fullTS/build před pilotem PASS|po selhání full sady nespouštěna|

Plné příkazy jsou `pnpm --config.verify-deps-before-run=false test`, `build --configLoader native` a `test:integration`. Sdílené dependency metadata se nezměnily. Produkční kombinace má normální timestamp timing a neobsahuje QA fence/cadence zásahy. Čtyři původní chyby byly chybějící binding `WebGpuPipelinePreparation` ve starší C5 VM fixture; její skutečný inert helper byl importován a vložen do environment bez změny assertions. Samotná fixture pak14/14 PASS a finální plná sada1352/1352. Neúspěšný QA log je zachován, nikoli přepsán na úspěch.

Leaf pinned cache/draw/clear testy mají29/29 PASS a scopedTS2959 souborů/0diagnostik. Pokrývají přesný descriptor, cache token+cache identitu, proložené výsledky, disabled cache, pending limity, inactive orphans, once-only retry, non-float reprocessing, skutečné chyby, cancellation a cizí ownership. Review odhalilo ponechaný retry callback po dispose: RED0/1 → mutable callback uvolněný při dispose → GREEN29/29. Pozdní resolve/reject nesmí držet Game ani zapisovat do cache. Oprava prošla opakovaným review; původní v1 pilot zůstal zmrazený.

[Integrace](integration.json) commitnula pouze6 vlastních native souborů. Pět ověřených working overlays zachovává C5 funkce/assertions; cizí `game-startup.test.ts` zůstává untracked. Dalších128 working cest, včetně rozpracované BMAD evidence, zachovalo přesné bajty. Review integračního helperu opravilo recovery a HEAD/tree race; publikace používá explicitní tree/parent a atomické expected-old update-ref, vlastní index lock a recovery záznam. Žádný QA zásah ani hraný dist nebyly integrovány.

## Tři diagnostické startup páry

Edge, WebGPU compatibility, NVIDIA/pascal (host GTX1060 podle hitches-v3), medium/manual,1512×642 CSS i render, jeden skutečný multiplayer klient, spawn x110/z12, řízená označená meteorologie. A používá3cf48f74…54507b, B998afe35…47ecb. Oba mají společný QA timestamp OFF a opt-in inventář. Vstup znamená network-connecting→game-ready, ne samotný konstruktor enginu.

| Pár | Celý startup A/B | Příprava A/B | Preparation→ready A/B | Moduly A/B | Pipeline A/B |
|---|---:|---:|---:|---:|---:|
|1|42,2108 /27,6001s|17,4023 /11,9836s|9,0215 /0,0343s|540/528|348/339|
|2|42,9578 /28,6631s|17,4928 /12,8417s|9,1396 /0,0304s|540/540|342/342|
|3|41,8998 /28,8106s|15,8724 /12,7543s|10,2374 /0,0288s|528/540|339/342|

Počty patří ke konci přípravy; render pokusy nejsou počet kompletních snímků. Kandidáti mají všechny async pipelines i shader validations completed, pending/failures0. Kontroly mají při stejném mezikroku ještě160/165/190 čekajících validations. Completion latence se překrývají a jejich součet není GPU ani elapsed čas.

Jde o popisná pozorování, nikoli čistý kauzální odhad. Ambient/čas/zahřátí a pořadí A→B se liší. Pár1 má1/0aut, pár2 shodně1bus/0cestujících/0aut, pár3 má4/1cestujících. Rozdíl12 modulů se v páru3 obrátil, proto kandidát soustavně neprováděl pouze menší shaderovou práci. Shodné počty nejsou identita descriptorů. Po půlnoci se navíc podle kódu změnil noční anchor na18.10.22:00Z; raw jej přímo neukládá. Pár2 začal přípravu v obou případech před půlnocí a jednou zachycený anchor se během etap nepřepočítává. Tyto časové závěry jsou inference z připnutého zdroje a vstupních hranic.

## Produkce bez podrobné diagnostiky

Samostatný produkční pár používá původní C5 a novou produkční kombinaci, **normální GPU timing**, inventory=null, žádnou QA fence. Stejná kvalita, viewport, preset a počasí; oba visible/focused, cadence59,9Hz. Kontrola0/0/0 ambient, kandidát0/0/1auto; rozdílný realtime instant. Exposure ani celestial key normální telemetry neukládá.

| Produkční pár | Původní C5 | Kandidát |
|---|---:|---:|
| Celý vstup→ready |45,8286s|28,3464s|
| Před přípravou |18,1310s|15,6926s|
| Příprava |16,1675s|12,6209s|
| Závěrečné čekání |11,5301s|0,0329s|
| Moduly /pipeline |528 /339|528 /339|
| Sync /async pipeline |339 /0|52 /287|

Celý rozdíl17,4822s nelze připsat helperu:2,4384s vznikly již před ním. **Dřívější smoke stejného kandidáta trval41,0688s a zůstává v evidenci.** Měl pre-prep26,4960s, world assembly8,7998s a resource duration `far.glb`10,9015s. V navazujícím kandidátu world assembly3,8872s a stejný76 500 488B `far.glb`6,4244s. Log neodděluje disk, přenos, scheduling a systémovou zátěž. Nelze slíbit stabilní28sekundový start ani zaměnit QA výsledky za produkční statistickou přejímku. Všechny produkční běhy skončily bez render/asset chyb; detailed disposed resource counters při vypnutém opt-in profileru nejsou uložené.

## První F stále trvá

V třetím QA kandidátu následoval denní B6 test s existujícím10s UI benchmarkem. Celý burst a mezera leží uvnitř okna: **75 skutečných snímků /10,03s**. UI7,5FPS zahrnuje cold hitch a není steady FPS. Renderer2/generation1 je na obou hranicích valid, pending/errors0.

- Pozice b6:0 x−4,903796/z−77,051910, medium1512×642, ambient0/0/1, denní preview18.10.10:00Z. Původní hitches-v4 mělo jiný den a blízkou pozici; nejde o přesný gameplay A/B.
- CPU1172,2ms, mainDraw1146,8ms,40programových párů/793Effect změn; následuje **6197,4ms gap** a6343,2ms post-submit completion. Queue wait+6112,4ms, completedCPU+85,0ms, raw/process +1; síťové callbacky pokračují.
- Moduly752→832 (+80), sync206→265 (+59), async290→290 (+0). Raw/body ani nové odvozené duplicity nevznikly, limity/unknown/collisions0. Helper je při gameplay ukončený.
- Inventář sám přidal242,5ms CPU, již zahrnutých do nadřazených časů. Fence zahrnuje queue i doručení callbacku; není čistý GPU čas.

[Snímek měření](images/async-v2-first-f-benchmark.jpg) a [skutečná B6 scéna](images/async-v2-b6-first-f.jpg) doplňují raw/benchmark gzip. Žádné zlepšení ani regresi gameplay FPS z tohoto jediného odlišného běhu nevyhlašujeme.

## Zrušení a další vstup

Sessionaf97c0f4 má1603 souvislých záznamů,0faultů. První pozdní klik proběhl až po ready a **není cancel důkaz**. Druhý Game renderer4 byl zrušen7568,1ms po preparation-start; DOM byl v light-preparation, žádné complete ani ready pro něj nenásledovalo. Preview5 a následný Game6 uspěly; v logu jsou přesně dvě game-ready, pro první a třetí vstup. Všechny3dispose mají errors0/assets0 a opt-in profily inactive/tracked0/raw stopped/epoch2. Konkrétní stage ani počet pending GPU Promise při cancel nejsou v raw zaznamenané.

## Co zbývá

KEY-31, FPS/multiplayer přejímka i migrační cíl zůstávají otevřené. Nový zdrojový průzkum ukazuje prostorovou mezeru: startup připravuje aktivní scénu u spawnu, zatímco B6 props jsou mimo ni vypnuté a odpojené ze `scene.meshes`. Pouhé projetí všech registrovaných meshů nepomůže. B6 a street POINT mohou být shaderově stejné; chybějící layout se nesmí určit pouze z názvu lampy.

Další krok je CPU proof skutečné prezentace spawn→denní B6 OFF/ON→restore, ordered light/define/instance/pass identity a odděleného main/depth reuse. Teprve potom omezený QA kandidát. Dřívější shadow proof varuje, že OFF render může zrušit budoucí ON depth identitu; nepřidávat další cache bez nového důkazu. Zachovat fyziku, síťové vstupy, aktuální restore, timeouty a měřit celý startup i první F.

[Srovnání](comparison.json), [manifest všech archivovaných vstupů](manifest.json), [integrace](integration.json), `sources/`, `validation/` a bezeztrátové `raw/` umožňují kontrolu čísel. Žádný provozní PID ani rezervační registr není součástí evidence.
