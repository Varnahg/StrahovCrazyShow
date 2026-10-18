---
title: 'KEY-31: odstranit dlouhé čekání po změně světel a materiálů'
type: 'bugfix'
created: '2026-10-17'
status: 'in-progress'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: '86e0b6460514231b97d3159b640e85a7f2337c1f'
baseline_worktree: 'C:/Users/rezac/.codex/worktrees/webgpu-comparison/StrahovCrazyShow'
context:
  - '{project-root}/AGENTS.md'
  - '{project-root}/docs/agents/bmad-policy.md'
  - '{project-root}/docs/agents/tasks/webgpu-hitch-validation-20261017.json'
  - '{project-root}/docs/agents/tasks/webgpu-b6-variant-proof-20261018.json'
  - '{project-root}/docs/agents/tasks/webgpu-avatar-day-variant-proof-20261018.json'
  - '{project-root}/docs/agents/tasks/webgpu-b6-entry-view-proof-20261018.json'
  - '{project-root}/docs/agents/tasks/webgpu-b6-coverage-completion-prototype-20261018.json'
  - '{project-root}/docs/agents/tasks/webgpu-day-zero-preparation-prototype-20261018.json'
  - '{project-root}/docs/agents/tasks/webgpu-light-define-history-proof-20261018.json'
  - '{project-root}/docs/agents/tasks/webgpu-inactive-light-defines-qa-20261018.json'
  - '{project-root}/docs/agents/tasks/webgpu-inactive-light-defines-20261018.json'
  - '{project-root}/docs/agents/tasks/webgpu-avatar-day-view-proof-20261018.json'
  - '{project-root}/docs/agents/tasks/webgpu-material-budget-capture-proof-20261018.json'
  - '{project-root}/docs/agents/tasks/webgpu-avatar-day-far-prototype-20261018.json'
---

<frozen-after-approval reason="Uživatel17.10 výslovně zadal řešit osmivteřinové záseky, chránit hraný build a průběžně integrovat">

## Intent

**Problém:** Po přepnutí F, času a při odchodu z B6 vzniká přibližně sekundová přestavba materiálů a potom6–8sekund bez herního snímku. Síťové callbacky během dlouhé mezery fungují. Uživatel musí dostat plynulou změnu stejného herního obrazu.

**Přístup:** Změřit příčinnou hranici existujícím rawRAF/engine profilem, porovnat rozumné opravy, zvolit nejmenší doložený zásah a ověřit celý přechod i startup. Hraná4193/C5 a starší4192/4188 zůstanou neměnné; měření používá samostatnou4194/API2589.

## Boundaries & Constraints

**Vždy:** stejné světlo, stíny, materiály, geometrie a profily. Oddělit JS CPU, chybějící RAF a GPU dokončení. Zachovat úplnou readiness, timeouty, failure ownership a disposal; měřit source/backend/quality/rozlišení/polohy/počasí.

**Nikdy:** falešné ready, vypnutí validace či stínů, prodloužení watchdogu, vynucení webgpu-fast, cache či profiler bez důkazu. Žádný cizí WIP v commitu ani změna hraného dist.

## I/O & Edge-Case Matrix

| Stav | Vstup | Očekávání | Selhání |
|---|---|---|---|
| První F | medium/B6:0, venkovní start | Souvislé snímky a správné světlo | Vadná pipeline zůstane explicitní fault |
| Čas/quality/LOD | Noc, návrat ven, jiný pass | Aktuální správná varianta bez globálního churnu | Stale efekty se nepřijmou |
| Vlastnictví | Změna během přípravy, odchod/device loss | Poslední požadavek, cleanup starých zdrojů | Žádný pozdní submit |
| Evidence | raw RAF versus Game/engine cadence | Identifikovaná hranice prodlevy | Hypotéza není příčinný důkaz |

</frozen-after-approval>

## Code Map

- `client/game.ts`: příprava světel a skutečný frame; `startBenchmark()` již ukládá compilation.start/end. C5 má navíc průběžné načítání a diagnostické try/finally, které se musí zachovat.
- `client/webgpu-compilation-profile.ts`: existující opt-in inventář a bezpečný unused-defines analyzer. Zatím pouze pozorování; žádná runtime normalizace.
- `client/webgpu-shadow-readiness.ts`, `client/tree-wind.ts`, pinned ShadowDepthWrapper: PBR base Effect přepnutí zahazuje odvozené depth identity. Fresh readiness guard musí zůstat.
- Pinned WGSL processor: případná normalizace až po finalizeShaders; processFinalCode běží dříve. Effect cache používá původní defines, pipeline cache effect.uniqueId. Samotné odstranění const neslibuje méně API calls.
- Hraná4193 je frozen C5. QA4194/API2589 má samostatné kopie a logy. Aktuální runtime práce byla po nepřijatém pokusu vrácena; neimplementovat znovu receiver scan bez nového důkazu.

## Tasks & Acceptance

- [x] Rekonstruovat původní incident a oddělit CPU, RAF a queue completion. F reprodukováno s1586msCPU,8568msRAFgap a8725,2mscompletion; síťové callbacky běží uvnitř.
- [x] Ověřit timestampOFF: zásek přetrval. Opravit pouze QA fence eligibility přes skutečný RenderHealth; readiness hry nezměněna.
- [x] Implementovat a prověřit konzervativní receiver kandidát včetně společného Game gate a StableLightState.63 nativních/79 kombinovaných cílených testů, fullTS/QA build PASS; výkonový pilot kandidáta zamítl.
- [x] Uložit experiment18701037dd3d8faae9b7bd1807ecfbf23e18aec4 a přesně jej vrátit db9018b8114770e0c71cd2e9b4000303d210b55e. Runtime není v main.
- [x] Skutečný PBR/TreeWind/Fresh wrapper CPU proof: OFF render ruší připravené ON depth varianty, jejich další zdroj/defines jsou shodné, tokeny nové. GLSL/NullEngine není GPU přejímka.
- [x] V Edge použít existující UI benchmark přes první F a uložit compilation.start/end. Všech80nových WGSL modulů známých, žádné raw/body ani nové odvozené duplicity, limity nedosaženy, health pending/errors0. [Úplná evidence](../../../docs/performance/evidence/webgpu-migration-20261016/hitches-v4/README.md).
- [x] Zvolit další úzký zásah: exact async pipeline preparation pouze během stávajícího startupu, pod coverem a bez rozšíření variant. Hitches-v4 neposkytuje důvod pro identickou WGSL cache; stable torch mění fixed-cap výběr a vyžaduje širší redesign.
- [x] `webgpu-migrate-pipeline-20261016`: nový `client/webgpu-pipeline-preparation.ts` a stejnojmenný test. Vlastněné instance miss/callsite brány používají native descriptor a token, bounded async pending/result; skutečnou pipeline zapíše původní synchronní cache cesta až při dalším aktuálním požadavku. Žádné pozdní async cache zápisy. Privátní pending signál neopouští vlastní draw/clear hranici; skutečné chyby zůstávají chybami.
- [x] Root `client/game.ts`: scope před prepareLighting až přes finální startup gate, helper frame completeness + pending/unconsumed vstupují do existující readiness. Incomplete RTT se znovu vykreslí; neaktivní ready orphan lze uvolnit po skutečném retry. Zachovány dvě kompletní acceptance draws, timeouty, aktuální varianty, abort/dispose a ownership hooků. WebGL/fast mají inertní cestu; během hraní async scope není.
- [x] Pinned proof29/29 a scopedTS0, native1296/1296 a kombinovaná produkce1352/1352, oba pnpm build/integration PASS. Tři QA startup páry, produkční pár bez detailní diagnostiky, prvníF a skutečný cancel/reentry mají [úplnou evidenci](../../../docs/performance/evidence/webgpu-migration-20261016/hitches-v5/README.md). Runtime8d20cecc72066b498e735b8b2524fd23baa19eff → main232cffb1fd67b47766fedd2b27c933ddf786e617.
- [x] Task `webgpu-b6-variant-proof-20261018`: dva noční starty v CPU proofu postrádají Directional, denní B6 OFF/ON jej potřebuje. Osm skutečných regular-instance částí dvou malých původních GLB je na spawn odpojených. Referenční vstup/odvozený landing vykreslí8/8, hlubší nav4/8. Po restore/reentry se5main Effectů znovu použije, wrapped leaf depth zanikne a dostane nový token. GLSL/NullEngine není GPU důkaz; plná geometrie/avatar/LOD/celestial spatial restore zůstávají neověřené. Manifest4d6d5c257cae73c23447473b0e769140be295e2a0af5ac6df29a9d948af009c0; důkazy předány nezávislému review.
- [x] Task `webgpu-b6-preparation-prototype-20261018`: cache-only a94 QA overlay, dvě day B6 OFF/ON etapy, camera-only a spatial refresh.44/44 targeted/fullTS/build, čtecí runtime i evidence review PASS. [Hitches-v7](../../../docs/performance/evidence/webgpu-migration-20261016/hitches-v7/README.md): inside pilot CPU1292.2→426.4ms, gap8163.8→1905.8ms, moduly80→20, sync59→10; startup32.4408→37.2335s. B6active505/495 a ambient/selection historie nejsou shodné, nejde o finální přejímku. WT e1956847cb6ea7ebe272431701570226d17809e7 → main fb9ac1a5153c15014db4bb1c4e53fc72ccdbc340 je pouze metadata/evidence, nikoli native runtime integrace.
- [x] Task `webgpu-avatar-day-variant-proof-20261018`: actual Alex12drawn/7Effects, OFF/ON A i menší B mají plné defines/Effect IDs/reuse shodné s B6. Texture IO adapter zachoval původní metadata/data, cleanup refs0; NullEngine/GLSL/POISSON a distance5 místo default8 jsou explicitní limity.6přesných porovnání a nezávislý audit PASS. [Hitches-v8](../../../docs/performance/evidence/webgpu-migration-20261016/hitches-v8/README.md).
- [x] Task `webgpu-b6-entry-view-proof-20261018`: jediný source-derived orbit s actual Simulation.cameraDistance nad57lokálními collidery zachová8GLB částí a přidá konkrétní dogleg madla/concrete treads. Stejný metal materialName nestačil, madla mají SHADOW variantu.4medium kombinace a čtecí audit PASS; plný produkční collision world/GPU neověřený.
- [x] Task `webgpu-b6-coverage-completion-prototype-20261018`: cache-only V2,72/72targeted+35/35inventory/fullTS/build,statické review i raw audit PASS. SkutečnýRED odhalil interníclamp16; explicitníhardcap20/default16 zachovává18labels. Pilot36431: prvníF0novýchmodulů/pipeline, zbytkovýCPU188.1ms/max190ms. Startup39.0587/prep21.1177s, OFF/ONsteady27/23.7FPS; nejedná se o rendererA/B ani native přijetí. [Hitches-v9](../../../docs/performance/evidence/webgpu-migration-20261016/hitches-v9/README.md) ponechává day preview869.2CPU+3593.8msgap a menší prodlevy na trase.
- [x] Task `webgpu-day-zero-preparation-prototype-20261018`: QA V3 doplnil day0OFF/ON a explicitníinventory21/default16.108/108targeted/fullTS/build PASS, ale produkční pilot0e155 stále31programů/62modulů/45sync,835msCPU+3309.5msgap; startup43.0761s/prep25.4694s. Negativní výkonový výsledek, žádné native přijetí. Day panel zůstal otevřený; nejedná se o matched FPS A/B. [Hitches-v10](../../../docs/performance/evidence/webgpu-migration-20261016/hitches-v10/README.md).
- [x] Task `webgpu-light-define-history-proof-20261018`: actual PBR/Standard4cesty,80drawcaptures,40párovýchfingerprintů. Night2ON ponechá neaktivníSTANDARD2 v prvnímday0OFF, day0ON jej odstraní; pozdějšístejnýDayOFF má novéEffectIDs a pouze tento definesdiff. CPUcounterfactual obnovíreuse. NullEngine/GLSL/reprezentativnímateriály bezIBL nejsou atribuce všech31produkčníchprogramů ani GPU důkaz. Manifest20187e11565307e44ac679014510962d27c89b389abbe59302d6fb153666df73, nezávislý audit PASS.
- [x] Task `webgpu-inactive-light-defines-qa-20261018`: pouze 3 false assignments, fyzické core+loaders a jedna class identity. Čistý RED15fail/1pass → GREEN16/16, související77/77, scopedTS0, celý vendor patch reverse/apply6/6. Manifest1f7fd825af1633d4efc227ffdc033d7e85540bd6400f7c03b7bbf0f4822d9eac; 10860 dependency souborů ověřených, jediná runtime delta. Root combined snapshotbf28a56507b6b0650d214169c8cf94aa3b2d8abc4012a8b098e4e1366340c8c0 fullTS/build PASS. Dva V4 Day piloty0novýchmodulů/pipeline, max137.9/155.3ms proti dvěma V3 62mod/45sync a3309.5/3178.9ms. Zbývající přechodová CPU práce101.6/107ms; startup V4 47.0673/42.6754s versus V3 43.0761/43.7435s kolísá. Celková migrace, ustálené FPS a nový B6 průchod nejsou přijaté. Původní stale frozen draw není součástí validovaného frozen readiness/unfreeze testu.
- [x] Task `webgpu-inactive-light-defines-20261018`: samostatný vendor patch/lock +2 regrese, pouze odstraněné2QA path assertions a nepoužitý probe stav. Native snapshoteb061b9eb34a0cdf8a94560ad7803ef9235ab1447e9b4d986c7cb640e2f0b7b3:1312/1312/fullTS/build/isolatedintegration PASS, combinedV4 1384/1384/build/integration PASS. Review bez nálezů. WT76978db3250c9a8a3ce3fc99f44f93fb4aedc8a1 → mainf9e3806d99e683bd54fb9d1f8d354f499ba31948,133dalšíchworkingcest zachováno. Žádný install, změna hraných buildů nebo další coverage runtime prototyp. [Nativní důkazy](../../../docs/performance/evidence/webgpu-migration-20261016/hitches-v12/README.md).
- [ ] Navazující výzkum: po canonical inactive resetu znovu porovnat cenu/potřebu15QA etap a přesného B6 kamerového/spatial pokrytí. Zúžení musí mít actual variant důkaz; bounded prewarm nesmí zakrýt startup regresi. Bez nového profileru/cache a bez automatického přenosu všech QA prototypů. Nativní vendor-only commit sám nenahrazuje chybějící denní/B6 přípravu.
- [x] Task `webgpu-material-budget-capture-proof-20261018`:5/5 actual tiny-glTF/Scene/GltfBudget/camera-pass větví, manifestd9a5226f0aa76c7cf4d9250915e59716c3f243e73ff95c6dfc08ae5297d3029c, čtecí audit bez nálezu. Late capture držífixed42; známý4 readiness předprepareFrame vytvoříEffect42 a následně4, guard předreadiness pouze4; explicit7/42 zachované. KontrolovanýREADYgap a neaktivníprodukčnígrass nedokládají startup náklad. Žádná runtime oprava. [Hitches-v13](../../../docs/performance/evidence/webgpu-migration-20261016/hitches-v13/README.md).
- [x] Task `webgpu-avatar-day-view-proof-20261018`: přijat ažV2 manifest0cadc7d49b71a567cb3ac27974a8e6e3502676640d13afb232b0d4fa9dff3730.7konfigurací/119captures/70defines+Effectporovnání/77přesnýchrestore kontrol včetně21výjimek. ReviewP2 focal/reference/getTarget drift opraven RED→GREEN, V1zachována. Far-only skutečněmění jenmaxZ10.06794–10.07243 z původníview; všechny aktuálnískin/morph-appliedvrcholy/bounds uvnitř. WorldTreeWindshadow stálekompiluje mimo main; recordedB6 comparator klipujeEli234shoe+3waist a je jen shader/draw comparator. Žádnýruntime/GPUbenefit důkaz.
- [x] Task `webgpu-avatar-day-far-prototype-20261018`: dokončený negativní experiment, runtime zamítnut. CPU64/64, scoped TS3366/0, skutečný avatar proof a fullTS/build PASS; snapshot d3780568200d6a88a3e63d60c2174ffc7e665c6bbb26dd78fb2b308df9365da3. První Golden16mod/12sync/max1178,4ms a F24/16/1748,7ms proti V4 0/0/124,5 a4/2/210,9. Startup43,2566 proti43,5224s neprokazuje výhodu. Raw audit8265 souvislých záznamů, health a cleanup PASS; ambientní rozdíly omezují úplnou atribuci. [Hitches-v15](../../../docs/performance/evidence/webgpu-migration-20261016/hitches-v15/README.md). B6/fullsuite/integrace této varianty neprovedeny; native/main a hrané buildy stejné.
- [ ] U přijatého kandidáta dokončit refaktor, regrese, stabilní native i kombinovaný test/build/integraci, GPU obraz a srovnatelné cold/warm/startup měření; samostatný commit/main/Linear.

**AC:** Given stejný přechod F/čas/quality/B6, when se použije kandidát, then musí zkrátit celou prodlevu při stejném světle/obrazu a bez nepřiznaného přesunu do startupu. Given výkonové tvrzení, then musí mít odpovídající produkční důkaz se zdrojem, GPU, rozlišením, p95/p99 a zdravým lifecycle. Neprovedené přejímky zůstávají neověřené.

## Implementation Notes

Záměr je stále schválené odstranění dlouhých záseků. Nejsou nové intent gaps ani nevratné kroky. Po negativním pilotu se workflow vrací k technickému plánování; nejde o požadavek na nové potvrzení. Frozen intent a původní baseline zůstávají beze změny.
Vybraný navazující celek ověřuje async mechanismus na současných startup variantách. Nezakrývá gameplay neúplným obrazem ani netvrdí, že tím opravil první F; jeho budoucí varianty a shadow lifecycle zůstávají otevřené. Nenavyšuje coverage, takže nemůže skrytě přesunout B6 kompilace do načítání. Celý vstup→ready se musí změřit.
Receiver pilot v b6:0:6179,5ms gap proti6344,2ms původní kontroly o3,681cm vedle. Trvalý ON light gate4,576ms proti0,018ms; časný shodný ambient má frame p50/p95/p99 33,7/41,0/45,2 proti30,4/39,3/42,8ms. Jeden pár není statistické A/B, ale nepodporuje přijetí. Oba receiver tasky jsou blokované na novém užitečném návrhu; parent cíl pokračuje.
Startup inventáře mají0raw/body duplicit, ale29/28odvozených skupin po bezpečném odstranění nepoužitých defines. Nový UI benchmark první F obsahuje:728→808modulů,0raw/body opakování,38→38odvozených skupin/opakování. Žádné unknown/limited calls. Burst1062,2ms a6179,1ms gap jsou celé uvnitř okna; fence6265,1ms. Identická WGSL cache ani normalizace za účelem deduplikace nemají pro tento F doložený přínos. Pipeline descriptor identity z59calls neznáme; main/depth podíl nelze odečítat. Sběr samotného textového inventáře stál209,8msCPU, již započtených. Žádná další diagnostická vrstva nevznikla.

## Design Notes

- Čistá normalizace generated WGSL const je menší varianta než cache, ale vyžaduje provenance, pozdější reference, zachování chyb a limity. Private per-engine processor bod musí být vlastněný a otestovaný. Pozdější komentované defines a effect.uniqueId zůstávají; přínos je hypotéza.
- Přesný async prewarm potřebuje skutečné instance overrides, texture state a main/shadow descriptor, deduplikaci a generation guard před vložením. PBR future shadow identitu musí udržet přes OFF render; pouhé přidržení Effect refcountu nestačí.
- Původní odhad6pevných slotů nebyl úplný: místní pěší svítilna a auto vzdáleného řidiče mohou mít současně2SPOT. Union je nejméně HEMI+DIR+3POINT+2SPOT; current art budget omezuje ulice, nikoli všechny non-street zdroje. Naivní intensity0 může změnit výběr fixed-cap materiálů. Jde o širší nezměřenou změnu, nikoli bezpečný jednořádkový fix. Vypnutí stínů, falešné ready a delší watchdog nejsou řešení.

## Verification

[Původní rekonstrukce](../../../docs/performance/evidence/webgpu-migration-20261016/hitches-v1/README.md), [queue/RAF hranice](../../../docs/performance/evidence/webgpu-migration-20261016/hitches-v2/README.md), [nepřijatý pilot a shadow proof](../../../docs/performance/evidence/webgpu-migration-20261016/hitches-v3/README.md). Poslední dokument obsahuje raw logy, výpočty, source/test hashy, limity a historii experimentu.
Full pnpm test/build/izolovaná integration se pro zamítnutý receiver pokus nespouštěly; předchozí1260/1320sady nejsou testem tohoto kandidáta. Pro přijatou změnu zůstávají povinné. Chráněné služby a cizí WIP se nepřepisují. Budoucí build nesmí pnpm implicitním install měnit sdílené dependencies; používat kontrolované ověření závislostí a native Vite loader.

## Spec Change Log

17.10: první implementační varianta po GPU pilotu zamítnuta a vrácena. Další rozhodnutí se opírá o skutečný lifecycle proof a chybějící runtime inventář; status draft znamená technický průzkum, ne čekání na souhlas.

17.10 21:10UTC: doplněn skutečný inventář prvního F. Deduplikační hypotéza pro tento burst nepotvrzena. Výzkum další změny porovnává stabilní fyzickou skladbu světel a přesnou async přípravu; nelze pouze zadržet obraz do kompilace a nazvat to odstraněním záseku.

17.10 21:43UTC: async helper a Game wiring jsou implementované, cílené leaf28/28 a Game39/39 prošly; společný QA checkpoint cedb795597282e26f8aa4388e538676645a323d0728741c2e1b224731da67256 právě prochází targeted/fullTS/build. Přípravné review native i C5 wiring bez nálezů. GPU přínos ani kompletní matrix zatím nejsou ověřené; formální závěrečné BMAD review ještě nezačalo. Frontmatter in-progress zde doplněn po zahájení implementace, nejde o novou baseline.

18.10: startup celek integrován. Review callback retention opraveno RED→GREEN; QA plná sada1364/1368 odhalila4 chybějící C5 VM bindings, finální produkční sada1352/1352 je opravena bez oslabení assertions. Tři diagnostické páry pozorovaly41,9–43,0s versus27,6–28,8s; jeden produkční pár45,8/28,3s, ale jiný běh stejného kandidáta41,1s kvůli variabilitě před přípravou. Nejde o statistickou FPS přejímku. RuntimeF stále1172,2msCPU+6197,4msgap/+80modulů/+59sync; frozen intent a migrační cíl zůstávají otevřené.

18.10 změna celkového cíle uživatelem: po dokončení migrace pokračovat na souvisejících performance/FPS-drop issues v Linear, celý proces projektovým BMAD. Starší cílové zakončení předáním do jiného chatu je nahrazené. Tato KEY-31 specifikace zůstává jedním aktuálním celkem; širší následný backlog není automaticky označen hotový ani rozpracovaný.

18.10 doplnění uživatele: při dlouho neřešitelné optimalizaci lze zvolit riskantnější řešení, pokud předchozí průzkum doloží jeho výhodnost proti rozumným variantám a zachování ostatních funkcí. Nejde o povolení přeskočit důkazy nebo přejímku; současný task je stále pouze CPU proof.

## Review Triage Log

18.10 far-plane QA review: CSM by mohlo reagovat novým SHADOWCSMUSESHADOWMAXZ define, ale tento snapshot CSM nepoužívá. Skutečný běžný Sun ShadowGenerator má ortho span72 a pevný depth0.1/180m, svítilna24m. Vazba camera.maxZ na nové stínové defines se v těchto cestách nenašla. Clear-weather GPU a world Day1 coverage zůstávají otevřené. Hitches-v14 eviduje V2 proof a referenční sérii; WT7a58c0b8872ddc7ffe6eb28de1ead7d07dcd2787 → main9eec8973aa699d5f4c13a11fbdfa20f4779046b9. Hitches-v13 proof integrace WT6621d576418071b6fe2be79138c35380a0fc454f → maindefec90e1d100c85df03c85f8c75c75ad703313c.

18.10 další rozhodnutí: šest extraDay0/Day1/B6 etap stojí12.09–13.45s z24.85–27.71s preparation, žádnáceládvojice není prokázaně redundantní. Day1worldvarianty se reálně využijí přiGoldenHour/lunarDIR/autě/B6pohleduven. V4 referenčnípořadí GoldenOFF→F→Day→Blue→Night→fullMoon má0novýchprogramů nazměny předvoleb; F4mod/2sync/max210.9ms, maxima ostatních119.5–161.4ms. Cloud0.96 vypínácelestialshadows, nekladnýDIR. Sekvenceje postupnězahřátá, ne6nezávislýchcoldtestů; B6/clearweather nepokryté. Chystanýcache-onlyfarQA experiment musí zachovat prvníGoldenF a samostatnýcoldB6entry/outward/exit, jinak se odmítne. Native runtime se tím nemění.

18.10 nativní vendor celek uzavřen samostatně: přenos4souborů, targeted16/16, AST zachování28+16assertions, native1312/1312/build/integration, combined1384/1384/build/integration, review bez nálezů. Metadata GPU archivu WT e08ee35c14bfeac436d148a904c90f709fbf73aa → main06357479364d5b4d12d528a1569810aba554797b. Runtime commit76978db→f9e3806 nepřenáší QA prewarm; nelze mu přisuzovat odstranění všech nativních gameplay záseků. Linear203e087a-596c-4eec-bbb3-9c393f5022f0. Formální závěrečné BMAD review celého přijatého hitch matrix stále neproběhlo.

18.10 opakovaný Day výsledek V4:31novýchprogramů→0 při404přepnutích Effectů, opakovaně bez sekundové mezery. První pár má shodné pre-Day agregáty, poslední pár shodný celý sceneView a počasí, ale cars0/1, koncový registry3322/3326 a2materiály cap42 proti všem známýmcap4. Tyto rozdíly a Day64.44/57.69s po ready zůstávají výslovné; přírůstek FPS přechodového okna není přejímkou steady FPS. Startup rozdíl+3.9912/−1.0681s nedokládá absenci regrese. První V4 F4mod/2sync/max157.9ms, částshadow79.5ms; B6 se v těchto V4 průchodech neopakovalo. Linear82644f23-57ec-45ac-8df7-cf10f5ccf7fe. Samostatná nativní oprava má explicitní rezervaci; main runtime ještě nezměněný.

18.10 V3 negativní pilot: další prewarm sám neodstranil denní3.3sprodlevu a přidal startup. Zdrojový audit vyvrátil traffic-timeOverride a přepisování stage updatePreloadVisuals; budoucí ambientLOD/pending conversion zůstávají hypotézy. Vybrán minimální vendor inactive reset před pluginem (další define identita/callbacks/cache invalidace), aplikačním hookem (streamed materials/cap-only changes/lifecycle) a dalším přeuspořádáním startupu (cena+historická závislost zůstává). Pinned helper už zná active count/dirty guard;3reset assignments nemění aktivní světelné flags. GPU cenu, obraz a obecné custom plugin chování je nutné přiznat jako neověřené. Evidence/Linear808f7c06-3745-4714-b904-763ddedd9d97. Frozen intent/původní baseline nezměněné, formální finální review stále čeká na přijatý celek a plné ověření.

18.10 navazující rozhodnutí: prokázaná chybějící denní/instance coverage ospravedlňuje omezený QA prewarm. Samotný day/spawn nepřipojí B6 props; plošný mesh sweep nezaručí skutečné instance/pass. Kamera-only varianta zachová actor/animation historii a obraz, ale přidá startup práci a nepokrývá zanikající wrapped depth. Tyto náklady musí následný GPU pilot změřit. Širší shadow retention/light-slot redesign zatím není vybraný; naváže pouze pokud nový profil prokáže jeho výhodnost. Frozen intent beze změny.

18.10 po pilotu: zbývající main preparation328.9ms obsahuje konkrétní avatar materiály170.7ms a entry materiály52.6ms; flashlight target CPU2.5ms neprokazuje čistý GPU podíl. Úplná atribuce20WGSL z bounded exportu není možná. Další průzkum proto míří na main coverage, ne automaticky na shadow retention. Inventář už využívá16stage labels; další etapy vyžadují vědomé zacházení s existujícím limitem, bez nové diagnostické vrstvy a bez zamlčení overflow. Další opakované páry musí srovnat poslední přístup/selection stav (B6 cadence0.25m při stejnéquality/floor), nikoli jen finální souřadnice.

Čtecí native a C5 overlay audity bez nálezů. CPU/obrazová korektnost sama nestačila k přijetí výkonu. Formální závěrečné BMAD review přijatého runtime celku zatím neproběhlo.

## Další měření bez podrobného opt-in

V4 inventory self-time4,3208s CPU je vnořený v celém startupu a není slib stejné časové úspory. Async pipeline příprava už je souběžná. Nejmenší další krok nevyžaduje změnu JS: stejný immutable V4 spustit bez existujícího profileEnvironment=1. Zůstanou základní module/pipeline counters, RenderHealth, startup/lighting/benchmark/frame události; vypnou se textové inventáře a environment/engine-frame hooks. Ztratí se jejich detailní atribuce, což se výslovně uvede. Nejde o nový cache, diagnostickou vrstvu nebo izolovaný inventory-only A/B. Zachovat world coverage,30s deadline a úplnou ready kontrolu; nejprve celý vstup a první Golden/F, poté samostatný cold B6.
