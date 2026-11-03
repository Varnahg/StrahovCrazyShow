---
title: Plynulost StrahovCrazyShow – další nejúčinnější krok
type: technical
topic: gameplay smoothness
decision: Vybrat další ověřovací krok a následný zásah s největším očekávaným dopadem
source: primary-web-and-local-imports
status: complete
preset: standard
validation: normal
created: 2026-11-03
updated: 2026-11-03
tracked_claims_verified: 3
tracked_claims_unverified: 2
---

# Plynulost StrahovCrazyShow

## Doporučení

**Další práci zaměřit na náklad renderování každého snímku a na původ dlouhých mezer mezi snímky. Nepokračovat další shaderovou cache ani plošným převodem na workery.** Nejlepší kandidát na následnou změnu je zmenšit množství práce potřebné k výběru a odeslání viditelné scény. Před konkrétním zásahem je nutný jeden cílený trace a kontrolní změna: dosavadní data neurčují, zda nejvíc pomůže prostorové seskupení objektů, stíny, GPU práce, neměřený zbytek callbacku nebo čekání v enginu/browseru. Toto je rozhodnutí o příštím kroku, ne tvrzení o již prokázané příčině. [1][2][3]

Spolehlivý startup je současně podmínkou hratelnosti: v C9 uspěl jediný ze čtyř pokusů. Opravu vstupu do hry vést jako samostatný problém; nezaměňovat její výsledek za zvýšení FPS. Existující WebGL2 lze použít pro kontrolní běh bez nového enginu, ale jeho přípravná cesta se liší. Nepřepínat výchozí backend bez přejímky vzhledu a chování. [1][2]

## Co skutečně víme o hře

Jediná změřená připravená C9 scéna byla **opt-in ON2**, nikoli výchozí OFF baseline. Tři krátké stacionární vzorky: 24,1 / 23,1 / 22,5 FPS, p95 66,6–68,6 ms a p99 až 224,4 ms; Medium, 1280 × 720, 3 hráčské relace včetně 2 SDK peers, otevřený panel nastavení. Jsou slabým podkladem pro celou hru, ale dostačují k odmítnutí představy, že jde jen o vzácné drobné škubnutí. [1]

| Naměřená oblast | C9 rozsah | Co z ní vyplývá |
| --- | ---: | --- |
| Celý render scope callbacku |32,6–37,7 ms průměrně|Největší měřená část pravidelné práce.|
| Vyhodnocení aktivních meshů |8,6–10,1 ms|Silný kandidát pro podrobnější CPU trace.|
| Hlavní draw fáze |17,3–20,0 ms|Prověřit přípravu/odeslání příkazů, vazby a čekání.|
| Render targets |5,8–6,6 ms|Oddělit stíny a další cíle; není to automaticky cena samotných stínů.|
| Draw calls /triangles |491 /3,82 mil.|Čítače přes průchody; samy neurčují bottleneck.|
| GPU čas |nezískaný|null není nula ani důkaz nečinné GPU.|

Časy v tabulce jsou wall intervals a jsou vnořené do render scope; **nesčítají se**. Mohou obsahovat čekání v nativní vrstvě. Inventář asi 5200 registrovaných a2500–2550 enabled/visible geometrických meshů není počet skutečně frustum-active meshů. Ani 2,91 mil. enabled tree triangles nelze dělit 3,82 mil. all-pass triangles a výsledek vydávat za podíl práce stromů. [1][2]

Máme dva prokazatelně různé příklady záseků. Interval 105,1 ms odpovídal měřené části předchozího callbacku 101,6 ms, z toho render 97,3 ms. Jiný interval **1329,6 ms** měl měřenou část předchozího callbacku jen 66 ms. Současný LoAF začíná dlouho před renderStart; nevysvětluje celou mezeru. **Závěr platí jen pro měřený scope:** `game.ts:3335–3358` končí měření před recorderem a pozdější HUD/benchmark obsluhou. Neměřený zbytek téhož callbacku proto dosud není vyloučen, stejně jako další main-thread práce, nativní čekání, browser/presentation nebo odplánování. Příčina zatím potvrzená není. Konkrétní sekvence 1132/1653/1666 a omezené podmnožiny frame-window jsou v importu. [1][2][4][5]

Výzkum odhalil i konkrétní mezeru exportu: Game předává `frameIntervalsMs` a `frameWork.webgpuMainPassMs` se scope, ale `projectLocalBenchmark` je nepropouští do uloženého benchmarku; UI i server používají tento whitelist. Plný `lastCpuFrameMs` na konci callbacku existuje, ale není časovou řadou spárovanou s každým uloženým hitch. Není důvod stavět nový obecný profiler: použít existující trace/counters a případně úzce doplnit jejich přenos, validaci a správné časové párování. Dostupný main-pass GPU čas by stále nebyl časem celé GPU. [2]

## Pořadí podle dopadu a rizika

Pevnou podmínkou výběru je doložená příčina a zachování správnosti. Poté upřednostnit dopad na hráče, sílu důkazu, nízkou cenu ověření a vratnost. Číselné skóre očekávaných FPS by nyní vymýšlelo chybějící data; konkrétní produkční úprava zatím příčinnou podmínku nesplňuje.

| Priorita | Zásah nebo rozhodnutí | Proč teď / první důkaz | Riziko |
| --- | --- | --- | --- |
| P0 | Spolehlivě dosáhnout Game.ready |Bez startu není hratelnost; použít uložené fáze a případně existující strictbackend kontrolu.[1][2]|Neměnit limity ani skrýt chybu automatickým fallbackem.|
| P1 | Snížit pravidelný náklad viditelné scény |Render 32–38 ms; následný trace určí výběr meshů versus draw/submission.[1][3]|Statické/dynamické vlastnictví, culling, různé materiály.|
| P1 | Vysvětlit a odstranit dlouhé mezery |Doložený 1,33s interval má jiný profil než 105 ms render hitch.[1][4]|Chybná atribuce může vést k úplně neúčinné opravě.|
| P2 | Odezva vstupu, kamery a pohybu |Hladká kamera může pořád reagovat pozdě; chybí pohybový test.[10][11]|Další smoothing může zvýšit latenci.|
| P2 | První použití assetu nebo varianty |Porovnat první/opakovaný průchod, auto a svítilnu.[8]|Odkládání nesmí vystavit nepřipravený shader nebo chybějící objekt.|
| Až podle trace | GC/RAM, worker, síťová korekce |Zvláštní metriky a reprodukce musí určit jejich příspěvek.[12][13][14][15]|Velký refaktoring s novou latencí, kopírováním a lifecycle.|

Pro stálý render je pracovní favorit **prostorově omezená práce se statickými částmi světa a sdílení kompatibilních drawů**, nikoli jedna obří sloučená scéna. Babylon umožňuje instances a úpravy statických objektů; thin instances však mají společnou viditelnost celé skupiny. Zvětšení batchů snižuje submission, ale může zhoršit culling. Optimální velikost skupin je potřeba změřit. Plošné freeze může porušit změny světel, picking, bounds či render targets. [6][7]

Už existuje `EnabledMeshCandidates` s invalidací změn a filtrem vypnutých uzlů; frustum ponechává Babylonu. TreeRenderer už máLOD, throttling, cache a zmrazené transformace. Přidat znovu tyto mechanismy by nebyl nový přínos. Prostorový výběr nebo jiné rozdělení drawů musí navázat na současné vlastnictví. WebGPU bundles jsou další dostupný směr ke zkoušce, ne důvod plošně zapnout experimentální režim. [2][8]

## Metodika a praxe pro následující etapu

1. **Jedna reprezentativní trasa.** Spawn→vegetace→B6, otočení kamery, rozběh/zastavení/strafe, jeden vstup do auta a svítilna. Skutečné ovládání, stejné dvaSDK peers a HUD. Uložit podmínky a porovnávat stejné úseky. Cíl je reprodukovat hráčský problém, ne vybrat nejhezčí číslo.[1][3]
2. **Oddělit tři režimy.** Startup; první použití funkce; ustálený opakovaný průchod. Náklady kompilace/uploadu neschovat do warmupu a současně je nemíchat do tvrzení o steady FPS. Nesnažit se nyní dalším výzkumem cache vyřešit celou hru.[1][8]
3. **Levná časová řada.** Zachovat úplné frame intervals, p50/p95/p99/max a četnost intervalů>50/>100/>250 ms za minutu. Označit akce a neplatná měření. P99 může minout ojedinělý 1,33s interval. C9 podmnožiny frame-window nejsou kompletní pole všech benchmarkových snímků.[1]
4. **Jeden oddělený detailní trace.** Edge/Chromium Performance se JS samplingem, main-thread tasks, frame/presentation a dostupnými GPU stopami, bez snímkování obrazovky během intervalu. Korelovat konkrétní hitch, kompilaci/upload, GC, nativní práci a zbývající čas mezi měřenými úseky. Pokrýt i recorder, HUD a práci enginu po Game callbacku. Instrumentovaný profil neporovnávat jako čistý FPS benchmark; dostupnost celé GPU časové osy je nutné ověřit. [2][3][4][5]
5. **Jeden rozlišovací zásah.** Nejdřív podle trace: například snížit pouze interní počet pixelů při stejné scéně. Nezměněný výsledek oslabí fragment-bound hypotézu, nevyloučí geometrii, driver nebo GPU obecně. Pokud trace ukáže traversal/submission, zkusit jednu prostorovou oblast/kompatibilní skupinu; pokud stíny, jeden konkrétní render pass. Vypnutí celé kvality současně není důkaz jedné příčiny.[3][6][7]
6. **Teprve potom jeden produkční patch.** Nejmenší ověřený zásah, přesné invalidace a úklid. Naměřit A/B/A nebo ABBA na identické verzi/podmínkách. Po neplánovaném selhání nejprve logy, nikoli nový restart. Nevytvářet další obecný profilovací framework.[1][3]

**Konkrétní další zadání:** z aktuálních dat převzít dva výše určené typy hitch, na nezměněném připraveném klientu získat jeden krátký trace a jedno kontrolní srovnání cílené podle trace. Výstupem musí být rozlišení callback/driver/GPU/presentation nebo přesně pojmenovaná mezera v měření a rozhodnutí o jediném patchi. Pokud default WebGPU po dvou plánovaných pokusech nedojde do ready, vrátit se k P0; existující `renderBackend=webgl2` je samostatná kontrola, ne náhrada za úspěšnýWebGPU test. `webgpu-fast` patří jen do odděleného loopback QA. Backend srovnání není izolovanou změnou jediné renderovací fáze.[1][2]

## Jak poznat lepší „feel“

60 FPS představuje rozpočet 16,67 ms,30 FPS 33,33 ms; není to celé rozpočtové okno pro vlastníJS, protože práci má i browser. Držet stejnou obnovovací frekvenci, monitor a velikost okna. C9 měl kolem 143 Hz; časová kvanta prezentace nelze ignorovat. Automatický cap 30 by zakryl část variability, ale neodstranil 1s zásek a může zhoršit odezvu.[9][10]

Navržená přejímka **není norma ani naměřený slib**: stejnou 60–120s trasu třikrát; alespoň o 20 % nižší p95 intervalu mezi snímky v každém páru a alespoň o polovinu nižší četnost intervalů > 100 ms, pokud je baseline dostatečně obsahuje. Nevyměnit to za horší p99/max, obraz, kolize nebo zjevně pomalejší vstup. Dále jeden 10 min průchod bez nevysvětleného > 250 ms záseku. Pokud variabilita měření převyšuje efekt, výsledek je neprůkazný. Stabilních 60 FPS je další cílová přejímka, nikoli automatický výsledek tohoto dílčího zlepšení.

Odezvu hodnotit zvlášť: vstup→handler→simulace→předání renderu jsou softwarové značky, ne úplné input-to-photon. Pro konečný pocit ověřit fyzický vstup a obraz nebo jinou skutečnou end-to-end metodu. Orbitální kamera už má exponenciální follow, first-person přímou pozici a hráč existující interpolaci. Nejdřív zjistit, zda je problém nízká frekvence obrazů, jitter pozice nebo záměrné zpoždění kamery; další smoothing není univerzální oprava.[2][10][11]

Pro vzdálené hráče sledovat příchozí jitter, buffer underruns a korekce vmetrech/frekvenci. Interpolační buffer obchoduje plynulost za latenci. Testovat skutečné síťové podmínky; loopback a stání u spawnu neprokazují chování při ztrátách paketů ani řízení.[1][12]

## CPU, GPU, RAM a co nyní nedělat

**100 % využití GPU ani všech CPU vláken není cíl.** Cílem je krátká kritická cesta a pravidelně zobrazený snímek s rychlou reakcí. Přidání pracovníků nepomůže, pokud brzda zůstane v render submission neboGPU. CPU/GPU mohou pracovat souběžně; jejich časy se nesčítají jako běžné sekvenční funkce.[3][10]

Workery dávají smysl pro prokázané nezávislé CPU úlohy (například decode nebo přípravu geometrických dat). Komunikace a kopírování mají náklad; velká data potřebují promyšlený přenos a vlastnictví. Přestěhovat celé Babylon objekty, renderer nebo fyziku je architektonická změna, ne jednoduché zaškrtnutí „multicpu“. OMT 2019 se používá jen jako princip; jeho staré rady o bundlerech se nepřebírají.[14][15]

Paměť sledovat jako working set, alokace/GC a skutečně rezidentní GPU resources. MenšíRAM sama neznamená hladší hru; agresivní vyhazování užitečné cache může vracet náklady prvního použití. Nezavádět pooling nebo nový eviction systém bez korelace s pause/retencí. Účetní bajty geometrie vC9 nejsou VRAM.[1][13]

Nyní tedy ne: další AST cache; globální freeze scény; jedna obří instance skupina; plošný 30 FPS cap; přepis netcode/physics do workeru bez pohybového profilu; „optimalizace“ odůvodněná samotným GPU procentem. Alternativou k favoritovi render workload je oprava konkrétní browser/driver/scheduling mezery — ta má přednost, pokud trace prokáže, že způsobuje nejhorší hitches.[1][3][6][7]

## Co zůstává neznámé a kdy se vrátit ke zdrojům

Chybí aktuální čistáOFF gameplay baseline, úplný pohybový profil, GPU/driver/presentation atribuce, end-to-end odezva a dlouhodobá paměťová stabilita. Nelze poctivě slíbit konkrétní ziskFPS nebo tvrdit, že všechny záseky mají jednu příčinu. Obecná metodika je pokrytá; tyto otázky vyžadují měření hry, ne další širší webový průzkum.

Rolling API dokumentaci znovu ověřit před implementací proti připnutému Babylonu a konkrétnímu browseru. Starší principy interpolace a latence nejsou instrukcí k používání starýchAPI; v tomto běhu je korigují aktuálně načtenéLTS/MDN dokumenty. Strojový přehled stáří je v `staleness.json`; starý/bezdatový zdroj není vydávaný za čerstvý software benchmark. Projektový import přestává platit po změně relevantních vstupů nebo podmínek měření.

Strojový přehled pokrývá datované sledované výroky; nejstarší kontrolní termín je 2021-12-05 a dvě metodické položky jsou podle stáří publikace označené jako staré. Jejich principy byly v tomto běhu znovu porovnány s aktuálně načtenými primárními zdroji. Nedatované rolling stránky se do výpočtu nedoplňují smyšleným datem; ověřit je před použitím konkrétního API. Počty sledovaných tvrzení pocházejí z `recon_kit.py tally`, nejsou počtem všech vět nebo zdrojů reportu.

Uživatel následně výslovně autorizoval navazující implementaci. Ta začne samostatným rezervovaným celkem: úzká oprava úplnosti a párování existujících měření, cílené určení příčiny a jeden doložený výkonový zásah. Výzkum sám tento zásah ani jeho přínos neprohlašuje za hotový. Navazující projektový postup je BMad Build; nový PRD ani další výzkumný workflow nejsou potřeba.

## Zdroje

Vše přístupné/přečtené 3.11.2026. „Mechanismus“ není důkaz výkonového zisku u nás; „pozorování“ je platné pro uvedený dataset. U nedatovaných rolling stránek není datum návštěvy datem publikace.

| Ref | Podporované tvrzení | Vydavatel a zdroj | Publikace/aktualizace | Přístup | Jistota/omezení |
| --- | --- | --- | --- | --- | --- |
| [1] | C9 intervaly, podfáze, limity datasetu | [Projektový primární import](imports/project-evidence.md) |2026-11-03|2026-11-03|Ověřené bajty/čtecí přepočet; bez nezávislé replikační studie.|
| [2] | Scope časů a již existující mechanismy | [Kód a přímé importy](imports/project-evidence.md) |main 22398e38|2026-11-03|Vysoká prokód, ne pro kauzalitu výkonu.|
| [3] | Top-down profiling, CPU/GPU/wait, oddělený detailní profil | [Unity – Best practices for profiling](https://unity.com/how-to/best-practices-for-profiling-game-performance) |bez přesného data|2026-11-03|Metodika, čerstvě načteno; číslaUnity se na hru nepřenášejí.|
| [4] | Main/frame/GPU trace a sampling | [Google – Performance reference](https://developer.chrome.com/docs/devtools/performance/reference) |rolling, přesné datumneurčeno|2026-11-03|Mechanismus, ověřit dostupnost stop.|
| [5] | LoAF a omezení 50 ms/instrumentace | [Google – Long Animation Frames](https://developer.chrome.com/docs/web-platform/long-animation-frames) |2024-10-14|2026-11-03|Mechanismus; ne úplná prezentace snímku.|
| [6] | Statická scéna, freeze, counters, draw calls | [BabylonJS – Optimizing Your Scene](https://github.com/BabylonJS/Documentation/blob/master/content/features/featuresDeepDive/scene/optimize_your_scene.md) |rolling/bezdata|2026-11-03|API porovnat s 9.30 před změnou.|
| [7] | Thin instances a viditelnost skupin | [BabylonJS – Thin Instances](https://doc.babylonjs.com/features/featuresDeepDive/mesh/copies/thinInstances) |rolling/bezdata|2026-11-03|Mechanismus, bez garantovaného zisku.|
| [8] | WebGPU cache a bundles | [BabylonJS – WebGPU overview](https://github.com/BabylonJS/Documentation/blob/master/content/setup/support/webGPU/webGPUInternals/webGPUOverview.md) |rolling/bezdata|2026-11-03|Nutná kontrola dynamické scény/pinu.|
| [9] | Rozpočet snímku a browserová režie | [Google – Rendering performance](https://web.dev/articles/rendering-performance) |2023-12-13|2026-11-03|Obecnýprincip, ne přejímací norma hry.|
| [10] | FPS versus end-to-endlatence | [NVIDIA – Understanding and Measuring PC Latency](https://developer.nvidia.com/blog/understanding-and-measuring-pc-latency/) |2023-05-05|2026-11-03|Původní text; ne doporučení ReflexSDK do browseru.|
| [11] | Interpolace přidává zpoždění, extrapolace může přestřelit | [Unity 6000.3 LTS – Rigidbody interpolation](https://docs.unity.com/en-us/engine/6000.3/manual/physics-section/physics-overview/rigidbody/rigidbody-interpolation) |relativně 2 měsíce, přesnýdenneurčen|2026-11-03|Analogickýmechanismus, neBabylonAPI.|
| [12] | Snapshot jitter/buffering versus latence | [Glenn Fiedler – Snapshot Interpolation](https://gafferongames.com/post/snapshot_interpolation/) |2014-11-30|2026-11-03|Původníprincip; nepřebírat číselnédefaults.|
| [13] | GC/allocations/retence jako diagnostika | [Google – Fix memory problems](https://developer.chrome.com/docs/devtools/memory-problems) |2024-11-06|2026-11-03|Mechanismus, u nás neprokázaná příčina.|
| [14] | Off-main-thread práce | [Google – Web workers](https://web.dev/articles/off-main-thread) |2019-12-05|2026-11-03|Starší princip; tooling tvrzení se nepřebírají.|
| [15] | Worker messaging/clone/transfer/DOM | [Mozilla – Using Web Workers](https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Using_web_workers) |rolling/bezdata|2026-11-03|Současný API kontrakt, změřit přenosy.|
