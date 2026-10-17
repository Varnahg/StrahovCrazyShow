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
- [ ] Task `webgpu-b6-preparation-prototype-20261018`: pouze cache QA overlay nad async-production-v3. Dvě day B6 OFF/ON etapy, source-derived landing, skutečná kamera/controllers bez přesunu actoru/avatara. Úzký spatial-refresh vstup Cinematic pro B6/restore, latest požadavky, controller/asset revision, původní timeout a readiness. Root sestaví izolovaný snapshot a porovná celý startup i prvníF. Žádná nová cache ani změna hraných buildů.
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

18.10 navazující rozhodnutí: prokázaná chybějící denní/instance coverage ospravedlňuje omezený QA prewarm. Samotný day/spawn nepřipojí B6 props; plošný mesh sweep nezaručí skutečné instance/pass. Kamera-only varianta zachová actor/animation historii a obraz, ale přidá startup práci a nepokrývá zanikající wrapped depth. Tyto náklady musí následný GPU pilot změřit. Širší shadow retention/light-slot redesign zatím není vybraný; naváže pouze pokud nový profil prokáže jeho výhodnost. Frozen intent beze změny.

Čtecí native a C5 overlay audity bez nálezů. CPU/obrazová korektnost sama nestačila k přijetí výkonu. Formální závěrečné BMAD review přijatého runtime celku zatím neproběhlo.
