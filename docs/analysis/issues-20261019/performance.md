# BMAD podklady: plynulost, startup a životní cyklus

Analýza 19. 10. 2026, výchozí main `db9108ddd3d069030abebd0fcccd6ecefbd0ff53`. Čtecí průzkum úplných popisů a vztahů 15 přidělených Linear issues, posledních relevantních komentářů, commitnutého kódu/testů a přijaté evidence. Nové runtime opravy, testy hry ani GPU benchmarky nebyly provedeny. Historické testy a měření níže patří konkrétním citovaným checkpointům. Cizích 133 dirty cest hlavního checkoutu ani worker/preview/staged-world WIP nebylo převzato. Přímé zadání podagentovi podle projektové BMAD policy nevyvolává další rekurzivní workflow.

## Společná organizace a důkazní hranice

Uživatelský důraz na společnou optimalizaci renderování je správný důvod pro sjednocení řízení práce. Doporučený KEY-5 „Plynulost celé hry: rendering CPU/GPU, startup a lifecycle“ je společný produktový výsledek. Pod něj patří KEY-3/4/8/9/10/16/20/22 a již podřízený KEY-40. Podstrom KEY-22 včetně KEY-31/32 zůstává zachovaný, KEY-42 zůstává pod KEY-40. Diagnostika KEY-2, pohyb KEY-6/7/12, obrazová správnost KEY-14/15 a celková přejímka KEY-11 zůstávají svébytné. Výslovné zrušení KEY-13 řeší koordinátor; tento report je neznovuotevírá ani nepoužívá jako nový blokující úkol.

Parent-child vyjadřuje společný výsledek, nikoli prokázanou jedinou příčinu nebo GPU-bound stav. CPU submission, serializace defines, invalidace, driver čekání, GPU passy, načítání a teardown vyžadují odlišná měření. Rozšířený KEY-5 nelze zavřít jedním benchmarkem či samotným přepnutím WebGPU. Startup responzivita a teardown nejsou steady-state FPS.

Žádný přidělený pár není úplná duplicita: KEY-3/4 mají uživatelské interakční AC, KEY-31 mechanismus WebGPU; KEY-9 celou vegetaci, KEY-42 tile-only experiment; KEY-10 výkon souběhu hry/editoru, KEY-29 správnost async preview; KEY-20 celý odchod, Done KEY-37 konkrétní Fresnel invalidaci. Zachovat AC v dětech, sdílet implementační rozhodnutí a jednu přejímací matici. Nezakládat další obecný výkonový backlog.

Pro každou budoucí opravu: převzít přesný rozsah od vlastníka, rezervovat soubory/testy i výstupy, cílené regrese průběžně, fullsuite/build/integration nad stabilním checkpointem podle rozsahu. GPU/heavy-validation/porty koordinovat. Produkční A/B musí mít hash včetně testů, backend, GPU/driver, CSS i interní rozlišení, stejnou trasu/kameru/čas/počasí a reálné relace/HUD; oddělit diagnostické běhy, foreground, chyby, teploty a takty. Zachovat raw intervaly, neúspěchy, p95/p99/max, startup a paměť. NullEngine a počet programů nejsou FPS důkaz.

Primární zdroje a přijatá evidence:

- [Main zdrojový checkpoint](https://github.com/Varnahg/StrahovCrazyShow/tree/db9108ddd3d069030abebd0fcccd6ecefbd0ff53), pinovaný Babylon 9.30 a projektový patch `patches/@babylonjs__core@9.30.0.patch`.
- [E1: Medium/High vehicle a zbývající shadow programy](../../performance/evidence/webgpu-migration-20261016/medium-vehicle-qa/README.md).
- [E2: skutečné CPU profily a rozhodnutí workeru](../../performance/evidence/client-threading-cpu-profile-20261019/README.md).
- [E3: přijatá inicializace materiálů postav](../../performance/evidence/client-threading-character-materials-20261019/README.md).
- [E4: obrazová a Fresnel lifecycle přejímka](../../performance/evidence/webgpu-migration-20261016/quality-visual-acceptance/README.md).
- [E5: historický test 15. 10. a teardown](../../performance/evidence/playtest-20261015/README.md).
- [E6: technický výzkum vláken](../../../_bmad-output/planning-artifacts/research/technical-client-threading-2026-10-19/research.md).
- [E7: nativní shadow sharing a jeho limity](../../performance/evidence/webgpu-migration-20261016/shadow-share-native/README.md).
- [Babylon NCM](https://doc.babylonjs.com/setup/support/webGPU/webGPUOptimization/webGPUNonCompatibilityMode/) a [WHATWG Workers](https://html.spec.whatwg.org/multipage/workers.html), znovu načtené 19. 10. 2026. NCM přínos závisí na scéně; worker má startup a per-instance náklady. Ani jeden zdroj nedokazuje zrychlení této hry. Přímé načtení velké GPUWeb specifikace selhalo na limitu velikosti a není zde použito jako ověřený zdroj.

## KEY-3 — Odstranit záseky při svítilně a nastoupení do auta

**Rozhodnutí:** zachovat jako dítě KEY-5 a přejímku uživatelských interakcí. KEY-31 řeší konkrétní WebGPU přípravu; zde zůstává první/opakované F a nástup/výstup na podporovaných backendech. Výchozí `client/render-engine.ts` stále vybírá WebGL2.

**Důkazy a mezery:** stabilizace světel, glTF budget a přípravy jsou přijaté. Historických 2389,7→157,8 ms prvního F není měření current main ani úplné plynulosti. Aktuální `client/game.ts` připravuje vehicle varianty pouze při WebGPU Low. Medium/High kandidát E1 není přijatý runtime; jízda stále zachytila shadow programy a intervaly nad 100 ms.

**Varianty:** přesná příprava dalších variant má střední náklady, prodlužuje startup a může zachovat obraz. Oprava prokázaného Effect/cache lifecycle je užší, pokud ji potvrdí reproduktor. Trvale enabled světla s nulovou intenzitou nebo plošně vyšší cap mohou měnit sloty/stíny, proto nejsou doporučenou zkratkou.

**Postup a refaktor:** dokončit příčinnou reprodukci KEY-31; sdílet konečné světelné etapy a obnovu vlastněného stavu. Relevantní soubory: `client/game.ts`, `client/flashlight.ts`, `client/vehicle-lighting.ts`, `client/light-preparation.ts`, `client/stable-light-state.ts`, `client/gltf-light-budget.ts`. Konkrétní writePaths až podle mechanismu; nepřebírat Game WIP.

**Přijetí:** samostatná matice F/auto/lampové hranice/den/noc/B6, cold/warm, WebGL2 regrese i WebGPU. Cílené `tests/game-light-preparation.test.ts`, `tests/light-preparation.test.ts`, `tests/gltf-light-budget.test.ts`, pak produkční p95/p99/max a obraz. Správné vypnutí, dosah a occlusion, přiznaný startup/memory náklad. Vazba KEY-31 není důvod ztratit tyto AC.

## KEY-4 — Odstranit blokující změny kvality a přípravu postprocessů

**Rozhodnutí:** zachovat pod KEY-5, odděleně od KEY-31. Kontrakt zahrnuje low↔medium↔high↔auto, obraz i životní cyklus postprocessů.

**Důkazy a mezery:** main připravuje kvality, ale `client/cinematic.ts` při Low stále ruší pipeline; návrat vytváří novou `DefaultRenderingPipeline` a volá `prepare()`. Historický reuse ve wave3 není současná přijatá implementace. Done KEY-17 řeší konkrétní image-processing wrapper; neprokazuje všechny Bloom/FXAA prostředky. Úplná opakovaná quality/resource přejímka chybí. E2 zachycuje také samostatný cinematic quality náraz.

**Varianty:** ponechat create/dispose a odstranit redundantní práci má nejnižší paměťové riziko. Retence jediné kompatibilní odpojené pipeline může omezit opakovanou přípravu, ale drží paměť a potřebuje důkaz nulových skrytých passů. Cache všech kvalit má vyšší VRAM/ownership cenu a bez profilu není vhodná.

**Postup a refaktor:** porovnat první dvě možnosti na čistém main. Sjednotit konfiguraci/připojení do explicitní lifecycle cesty, zachovat image-processing kontrakt a skutečné shadow-map rozměry. Soubory: `client/cinematic.ts`, `client/render-quality-preparation.ts`, `client/adaptive-quality.ts`, integrační `client/game.ts`; testy `tests/cinematic-pipeline.test.ts`, `tests/cinematic-atmosphere.test.ts`, `tests/render-quality-preparation.test.ts`, `tests/game-quality-preparation.test.ts`.

**Přijetí:** všechny přechody cold/warm včetně změny požadavku během přípravy, původní limit uživatelského bloku <250 ms, obraz/stíny a stabilní prostředky po opakování. Prokázat release/refcount/observer chování; hypotetický wrapper leak nevydávat za živý nález. Potom kontrolované GPU A/B. KEY-17 je splněná ochrana, KEY-31 sdílený mechanismus, nikoli náhrada celé přejímky.

## KEY-5 — Plynulost celé hry: rendering CPU/GPU, startup a lifecycle

**Rozhodnutí:** použít jako společný produktový výsledek podle nového pokynu uživatele. Podřadit KEY-3/4/8/9/10/16/20/22, ponechat KEY-40 a zachovat podstrom KEY-22. Diagnostiku/pohyb/vizuální správnost neoznačovat automaticky za duplicitní.

**Důkazy a mezery:** current main obsahuje přijaté dílčí opravy, ale stále existují synchronní render nárazy i dlouhé RAF mezery nevysvětlené předchozím Game callbackem. Render wall není GPU timestamp. E2 instrumentované běhy nejsou FPS A/B; historický průměr 59,7 FPS nevylučoval lokální 6–8 FPS. Neexistuje doložená jediná GPU příčina všech symptomů.

**Varianty:** cílit doložené dominanty v dětech a ověřit společný průjezd má nejnižší riziko. Konzervativní statický index může snížit traversal, vyžaduje však LOD/stíny/kandidáty parity a měření. Přesun rendereru do workeru má vysokou cenu a neparalelizuje sériový `scene.render`.

**Postup:** jedna opakovatelná přejímací trasa B6/tráva/lampový cutoff/auto/další avatary, samostatné startup/menu/editor cykly; plain výkon oddělit od příčinné instrumentace. Implementovat a refaktorovat jen konkrétní child mechanismus. Relevantní integrační místa: `client/game.ts`, `client/render-cost.ts`, `client/active-mesh-candidates.ts`, `client/opaque-sort.ts`, `client/transit-renderer.ts`. Samotné přeskupení issues nemění runtime/cache/lifecycle.

**Přijetí:** celá hra/HUD a skutečné různorodé relace, raw p95/p99/max, žádné sekundové záseky, zachované entry/stairs/surfaces. Startup má pravdivé ready a responzivní loading; menu/editor nemají rostoucí prostředky. Přijaté dílčí změny ani přepnutí WebGPU nepřijímají automaticky celek. Celkový integrační checkpoint dál patří KEY-11.

## KEY-8 — Zrychlit studený start a přípravu velkých zdrojů

**Rozhodnutí:** zachovat pod KEY-5, zpřesnit na responzivní a pravdivý startup. Uživatel akceptoval delší loading výměnou za plynulejší hraní, nikoli odložení blokací za ready.

**Důkazy a mezery:** přesná pipeline příprava je v main. Staged world/street startup je nepřijatý WIP. Historické wave3 konstruktory 37–44 ms nelze použít pro current main. Velikost far.glb neprokazuje dominantní parsing/upload; souběžné asset walltimes se nesčítají. E2 zachovává startup timeout i pozdější úspěšnou přípravu 59,66 s.

**Varianty:** kooperativní rozdělení skutečných synchronních bloků má střední cenu a zachová obraz při deterministickém pořadí/cancel. Předzpracování geometrie může práci odstranit, vyžaduje však rezervaci zdrojů/výstupů a provenienci. Lazy loading viditelných prostředků po ready je rizikový; delší watchdog blokaci neopravuje.

**Postup a refaktor:** změřit download→decode→world construction→kolize→upload→variant preparation→potvrzený snímek. S původním vlastníkem vyhodnotit pouze doložené staged-world části; sjednotit deterministickou stavební cestu. Soubory: `client/game.ts`, `client/world-renderer.ts`, `client/streets-renderer.ts`, `client/render-startup.ts` a konkrétní loader podle profilu. Nové stage moduly teprve po doloženém převzetí.

**Přijetí:** cold production timeline, ovladatelný loading, cancel/reentry, shodná geometrie/kolize, připravené viditelné prostředky před ready, bounded cache a absence následného sekundového upload bloku. Cílené `tests/render-startup.test.ts`, `tests/game-webgpu-startup.test.ts` a skutečné asset/source testy; dále společná pipeline a GPU obraz. Vazby KEY-31, samostatný B6 streaming KEY-16 a teardown KEY-20. Neodstraňovat readiness kvůli lepšímu číslu startu.

## KEY-9 — Omezit CPU přípravu a vykreslovací náklady vegetace

**Rozhodnutí:** zachovat pod KEY-5 odděleně od KEY-42. Worker pokrývá pouze výrobu dlaždic, nikoli výběr kořenů, přechody, upload, stromy a draw.

**Důkazy a mezery:** main má deterministický prepareTile, yield po 16 vzorcích, FIFO1536 a bounded přípravu. E2 environment3,57/4,77 ms zahrnuje selection/upload i další práci. prepareTile se objevil v1/2 samples, batch flush14/9; sample count není funkční čas. Původní vegetační špičky nejsou current-main kontrolní baseline.

**Varianty:** snížit doložené alokace/dirty uploady/výběr na hlavním vlákně je malý zásah. Tile worker má omezený potenciál a komunikační/startup náklad. Snižování hustoty/detailu mění zadání a není doporučená první volba.

**Postup a refaktor:** dokončit KEY-42, současně profilově oddělit update/selection/placement/flush/tree detail-cache/draw. Soubory: `client/photographic-grass.ts`, `client/photo-grass-placement.ts`, `client/photo-grass-selection.ts`, `client/photo-grass-batch.ts`, `client/vegetation.ts`, `client/tree-appearance.ts`. Zachovat jeden generátor, explicitní ownership a bounded cache; nevytvářet druhé dlouhodobé úložiště matic.

**Přijetí:** původní problematická oblast i doložený travnatý koridor E2, chůze/jízda cold/warm a všechny kvality. Stejné kořeny/hustota/mapové plochy a volné komunikace, bounded heap/queue, GPU obraz a raw intervaly. Cílené `tests/photo-grass.test.ts`, `tests/photo-grass-selection.test.ts`, `tests/photo-grass-preparation.test.ts`, `tests/vegetation.test.ts`. Worker může být odmítnut, aniž by tím byla vyřešena celá vegetace; nativní WGSL port KEY-25 není výkonová přejímka.

## KEY-10 — Odstranit propad při otevření editoru avatara

**Rozhodnutí:** zachovat pod KEY-5 jako výkon souběhu hry/editoru; KEY-29 má odlišný async correctness kontrakt.

**Důkazy a mezery:** main má async preview, on-demand scheduler a přijaté material init opravy. `client/avatar-preview.ts` ale při update stále ruší starý rig před vytvořením nového. Persistent cache/make-before-break je nepřijatý WIP. Historické FPS před/uvnitř/po editoru nebyly ze shodných podmínek; šest presetů a dva Game cykly E3 jsou funkční smoke, ne výkonové A/B.

**Varianty:** krátce žijící samostatný engine je jednoduchý, opakuje však přípravu. Persistent preview s explicitním uspáním může zrychlit opakování za cenu retence paměti a menu/rejoin ownership. Sdílení hlavního enginu/scény je výrazně rizikovější kvůli canvas/passům/lifecycle a bez profilu nevhodné.

**Postup a refaktor:** nejprve current-main cold/repeated open-close na stejné kameře/světle. Pak s vlastníkem posoudit cache WIP, aktivaci panelu, cache hits, create-before-dispose a release. Soubory: `client/avatar-editor.tsx`, `client/avatar-preview.ts`, `client/on-demand-render.ts`, `client/avatar-renderer.ts`, integrační `client/ui.tsx`. Navržený persistent-preview modul není current-main důkaz a vyžaduje převzetí.

**Přijetí:** první i opakované otevření, změny všech presetů a rychlé úpravy při živé hře, hlavní hra/síť stále responzivní; žádné zbylé RAF/scény/listenery ani růst prostředků. Cílené `tests/avatar-preview-webgpu.test.ts`, `tests/on-demand-render.test.ts`, potom current-backend GPU souběh a resource trend. Nevypínat svět pro lepší číslo. Funkční KEY-29 může být dokončeno dříve, ale výkonové AC zůstávají zde.

## KEY-20 — Vyšetřit a odstranit 5,6sekundovou blokaci při odchodu do menu

**Rozhodnutí:** zachovat pod KEY-5, neslučovat s Done KEY-37. Vhodné zpřesnění názvu je „Ověřit a odstranit zbývající blokace při odchodu do menu“. Původních5640 ms je historický důkaz E5, nikoli současné měření.

**Důkazy a mezery:** KEY-37 odstranilo globální Fresnel invalidaci, current `client/cinematic.ts` odpojuje jen vlastněné parametry a resetuje konkrétní material cache. Celý `Game.dispose` stále synchronně uklízí controllery/pool/scene/engine. Událost game-dispose je zapsána před těmito operacemi; neznamená completion ani čas samotného Fresnel cleanup. Zbývající podíl JS/driver wait neznáme.

**Varianty:** odstranit doložené duplicitní dispose/invalidace je nejmenší zásah. Dávkovaný cleanup zachová responzivní menu, ale musí nejprve odpojit input/loop a oddělit starou generaci. Retence enginu/zdrojů může pomoci návratu za cenu paměti a ownership; bez profilu ji nevolit.

**Postup a refaktor:** zaznamenat start/end leave, stop-loop a cleanup skupiny v izolované kopii. Po reprodukci sjednotit ownership/finally cleanup dominantní větve. Soubory `client/game.ts`, `client/ui.tsx`, `client/cinematic.ts` a doložený drahý controller; testy `tests/cinematic-fresnel-disposal.test.ts`, `tests/game-render-engine.test.ts`, relevantní startup/lifecycle fixtures.

**Přijetí:** opakované menu/rejoin/editor cykly, UI responzivní, žádné callbacky staré generace, stabilizace paměti a wall-time od kliknutí po hotové menu. Po profilování explicitně stanovit měřitelný budget; nedoplňovat smyšlené tvrzení, že známá oprava odstranila celých5,64 s. KEY-17/37 jsou splněné ochrany, ne uzavření issue.

## KEY-29 — WebGPU: převést avatar editor a náhled na správný asynchronní lifecycle

**Rozhodnutí:** zachovat v podstromu KEY-22. Zbývající rozsah je zejména funkční přejímka; původní synchronní problém už není popisem přijatého kódu.

**Důkazy a mezery:** main používá async factory, abort/generation, on-demand scheduling, begin/render/end, validaci a čekání na odevzdanou práci. `tests/avatar-preview-webgpu.test.ts` pokrývá pozdní init/abort, chyby, stale generace a bounded readiness; `tests/on-demand-render.test.ts` i dequeued RAF po hide/show. GPU smoke E3 ověřilo šest presetů. Chybí úplné resize/DPR/hidden-visible/rejoin a resource trend. Persistent preview cache není přijatá.

**Varianty:** dokončit browser matici current-main a opravovat reprodukované mezery je nejlevnější. Převzetí persistent cache může pomoci KEY-10, ale přidává nový lifecycle kontrakt. Sdílení enginu s hrou je rozsáhlé a bez současného důvodu.

**Postup a refaktor:** testovací scénář se všemi presety, detail/rotace, resize/DPR, skrytí během init, zavření/přerušení, opakovaný vstup do hry. Soubory `client/avatar-preview.ts`, `client/avatar-editor.tsx`, `client/on-demand-render.ts`, případně `client/render-engine.ts` a `client/render-health.ts` podle reprodukce. Udržet jedinou generační autoritu, společné fail/dispose a jednoho vlastníka každého observeru/poolu/device.

**Přijetí:** pravdivé loading/ready/failed/unsupported, žádný stale obraz ani dvojí RAF, poslední zvolený profil vyhraje i při čekání, žádné zdroje po ukončení. Skutečný GPU obraz i lifecycle/resource trend; CPU fixtures nestačí. Výkon souběhu ponechat KEY-10, aby se funkční správnost nemíchala s neprokázanými FPS přínosy.

## KEY-31 — WebGPU: odstranit blokující přípravu pipeline a světelných variant

**Rozhodnutí:** zachovat jako prioritní mechanismus pod KEY-22; bez reprodukce nepřidávat další obecný warmup. KEY-3/4 zůstávají uživatelské AC.

**Důkazy a mezery:** E1 zachytilo pět nových SPOTLIGHT shadow programů, žádný nový hlavní program; materiáloví uživatelé byli unmatched. Uvolnění Effect/cachekey je hypotéza. Poslední relevantní komentář vyvrátil domněnku, že veřejná RTT readiness probíhá před PCF colorWrite=false: _checkReadiness spouští onBeforeRenderObservable. Podle této zamítnuté hypotézy neopravovat. Medium/High vehicle kandidát dosud není main.

**Varianty:** opravit prokázaný lifecycle/identity mechanismus může snížit opakování bez nové matice, vyžaduje však source/ABI/ownership paritu. Rozšíření skutečných variant má startup/VRAM cenu, ale neřeší zánik již připraveného efektu. Globální cache, oslabená readiness či delší timeout jsou rizikové zkratky.

**Postup a refaktor:** actual pinned reproduktor baseEffect replacement/last-owner release/derived identity/PCF depthstate. Vendor vada vyžaduje úzký `patches/@babylonjs__core@9.30.0.patch` a `pnpm-lock.yaml`; jinak zacílit `client/webgpu-shadow-readiness.ts`, `client/webgpu-pipeline-preparation.ts`, `client/light-preparation.ts`, `client/game.ts`. Jediná lifecycle cesta, omezené cache, odmítnuté pozdní výsledky. Regrese `tests/webgpu-shadow-sharing.test.ts`, `tests/webgpu-shadow-freshness.test.ts`, `tests/webgpu-pipeline-preparation.test.ts` a Game light/quality.

**Přijetí:** skutečné descriptor varianty, ready complete bez timeoutu, první/opakované F/auto/B6/quality, >=3 skutečné relace, zdravý renderer a raw p95/p99/max. Přiznat startup/paměť, zachovat WebGL obraz. Nula nových shaderů není nula pipeline ani důkaz plynulosti; neuzavírat podle dílčího programu count.

## KEY-32 — WebGPU: optimalizovat render submission a životní cyklus cache

**Rozhodnutí:** zachovat pod KEY-22. KEY-31 vlastní nepřipravené/znovu vznikající pipeline; zde je běžná submission CPU práce, bind/uniform, bundle reuse a cache lifecycle.

**Důkazy a mezery:** opaque sort, shadow sharing, garment a character init jsou přijaté. F3 první auto mělo mesh preparation95,5 ms, serializer37,4 a bindgroups12,2; scopes jsou vnořené, nesčítat. Sparse serializer experiment neměl konzistentní přínos a byl zamítnut. Nízké GPU utilization neurčuje konkrétní JS bottleneck; E2 nemá GPU timestamp.

**Varianty:** odstranit doloženou redundantní invalidaci/init má nízký architektonický dopad. NCM může využívat bundles, ale vyžaduje správnou skeleton/material identitu, vertex updates a depth prepass; dokumentace negarantuje přínos. Retence device/scény přes menu rozšiřuje paměť/ownership a patří až k prokázané potřebě KEY-20.

**Postup a refaktor:** plain CM baseline, oddělená attribution a srovnatelný NCM pilot s bundle creation/reuse. Další změna jen podle dominanty; nevytvářet novou serializer cache po negativním experimentu. Soubory `client/render-engine.ts`, `client/opaque-sort.ts`, `client/render-cost.ts`, konkrétní material pool a případně úzký pinovaný patch. Zachovat transparentní pořadí, LOD, stíny a oddělené kostry; cache jeden vlastník a konečný lifetime.

**Přijetí:** Medium a problematické přechody, >=3 actual relace, paměť po menu/rejoin/editor, bez obrazové regrese, proložené plain běhy. Cílené `tests/opaque-sort.test.ts` a relevantní material/lifecycle regrese podle změny; přínos dokládat raw intervals, nikoli pouhým počtem bundles. Podklady E3/E7 a oficiální NCM zdroj výše.

## KEY-38 — Zapojit stabilní BMAD do projektového workflow Codexu

**Rozhodnutí: ponechat Done.** Instalace, overrides, koordinační hranice, resolver/render, portability a discovery mají konkrétní přejímku v `f13cc3ac` a `955d1347`, nyní publikovaných v main. Původní „bez push“ je historický stav překonaný KEY-43.

Podklad: [přijatá BMAD evidence](../../verification-evidence/agents/coordination-20261012/bmad-20261017/README.md). Žádná další herní implementace ani slučování s runtime issues nejsou potřeba. Budoucí upgrade je samostatná rezervovaná údržba. Tento audit ověřil čitelnost policy a skutečný skill katalog; neprováděl novou reinstalaci.

## KEY-40 — Ověřit a zavést přínosné rozdělení klienta mezi CPU vlákna

**Rozhodnutí:** zachovat pod KEY-5 jako rozhodnutí o architektuře s měřeným výsledkem. KEY-42 je konkrétní první experiment; samotný Worker neuzavírá KEY-40.

**Důkazy a mezery:** výzkum E6 a profily E2 jsou v main. Physics kolem0,5 ms a B6 enclosing world0,16–0,18 ms neospravedlňují první široký worker. Active-mesh5,55–6,14 ms obsahuje scene-owned práci. Render zůstává sériovou dominantou; dlouhé RAF mezery a message overhead nejsou rozřešené. KEY-41 odstranilo doloženou práci bez nového vlákna.

**Varianty:** helper worker má malý bridge a patrně dílčí přínos. Main-thread submission refaktor práci odstraňuje přímo a patří KEY-32. OffscreenCanvas worker oddělí UI, ale vyžaduje bridge vstupů/HUD/sítě/resize/device loss/lifecycle a negarantuje vyšší herní FPS. Pool podle počtu jader nebo SAB by teď zbytečně rozšiřovaly riziko.

**Postup a refaktor:** dokončit KEY-42; další worker teprve podle nového profilu a maximálního možného přínosu. Jeden vlastník scene/device, jasné generační zprávy a bounded queues. Přesný scope současného prototypu je v KEY-42, další `client/game.ts`, `client/transit-renderer.ts` či `shared/simulation.ts` nejsou automaticky autorizované k přepsání.

**Přijetí:** plain produkční A/B, skutečná prezentace a input-to-applied/rendered latency, queue age, transfer/startup/memory a obraz/multiplayer/host parita. Negativní experiment je validní výsledek, ale sám neuzavírá širší nevyřešenou plynulost. WHATWG dokládá mechaniku a náklady workerů, nikoli benefit této hry. Neoznačit dokumentaci nebo hotový protokol za hotovou vícevláknovou optimalizaci.

## KEY-41 — Omezit průchody celé scény při inicializaci materiálů postav

**Rozhodnutí: ponechat Done.** `cb2bed42` používá veřejné atomicMaterialsUpdate pouze při konstrukci nesdíleného PBR, před existující cache. Actual Babylon128–352→32 foreign reads pro13 povrchů, cachehit0, hodnoty/defines/pozdější invalidace/lifecycle pokryté. Zdroj `client/character-materials.ts`, regrese `tests/character-material-init.test.ts`.

E3 zachovává clean1491/combined1524 při concurrency4, oba build/integration a skutečné GPU šest presetů/dva Game cykly. Původní dva default readiness timeouty nejsou zamlčené. Done je pouze redukce redundantní CPU práce, nikoli FPS A/B, worker přejímka nebo synchronizace změněného profilu při rejoin. Zachovat jako dokončený úzký výsledek pod KEY-40, nerozšiřovat jeho scope.

## KEY-42 — Ověřit worker pro přípravu travnatých dlaždic při pohybu

**Rozhodnutí:** zachovat In Progress, parent KEY-40 a původního vlastníka. Poslední opakované načtení vrací updatedAt `2026-10-19T19:57:28.316Z`; nové browser/A-B přijetí nebylo publikováno. Před publikací znovu ověřit, aktivní vlastník může pokračovat.

**Důkazy a mezery:** V2 má36 targeted, clean1500/combined1533 a build/integration dle uložené evidence, runtime je mimo main v9b78. Environment3,57/4,77 ms není izolovaný placement potenciál. Skutečný browser transfer, startup duplicita world dat, cold convergence a plain přínos chybí.

**Varianty:** přijmout jeden persistent module worker pouze při čistém přínosu; ponechat bounded native generátor, pokud overhead převáží; pool/SAB/renderer rewrite nyní zamítnout jako neúměrné rozšíření. Negativní výsledek archivovat bez zapnutí defaultu.

**Postup a refaktor:** dokončit již připravenou přejímku vlastníkem, nevytvářet druhou implementaci. Přesný task vlastní `client/photo-grass-placement.ts`, `client/photographic-grass.ts`, `client/photo-grass-worker.ts`, `client/photo-grass-worker-protocol.ts`, `client/photo-grass-tile-executor.ts`, `tests/photo-grass-worker.test.ts`, `tests/photo-grass.test.ts`. Tři worker moduly a worker test jsou WIP v9b78, nikoli součást main. Jeden deterministický generátor, FIFO1536, <=2 inflight i completions/update, bez druhé dlouhodobé cache.

**Přijetí:** reálně detached buffers, stale/duplicate/cancel/dispose, fallback bez dvou producentů, stejné kořeny/fades/kvality; proložené stejné travnaté trasy bez sampleru, queue/heap/startup a p95/p99/FPS. Zachovat zdroje a rozlišení obou variant. KEY-9 zůstává samostatnou celkovou vegetační přejímkou. Stav experimentu měnit až podle doloženého závěru, ne podle úspěšných unit testů.

## KEY-43 — Sjednotit Linear, publikovaný main a dokončené větve bez převzetí WIP

**Rozhodnutí: ponechat Done.** Konkrétní výsledek je publikace již existujícího main db9108dd, úklid prokazatelně přijatých větví a zachování WIP. Jde o uzavřenou administrativní operaci, nikoli přijetí celé hry.

Issue eviduje586/586 runtime/test a45/45 evidence hashů, remote0/0, GitHub hygiene success a zachování11 pracovních kopií. Tento audit znovu ověřil main hash a oddělení dirty runtime/workeru; neopakoval remote cleanup ani herní benchmarky. Neslučovat s KEY-11 a neznovuotevírat jen kvůli běžnému pokračování jiných issues. Nová hierarchie backlogu je další samostatný dokumentační výsledek, nikoli změna přijetí této operace.
