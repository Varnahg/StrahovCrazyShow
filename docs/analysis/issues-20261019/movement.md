# BMAD podklady: pohyb, diagnostika a vizuální přejímka

Datum: 19. 10. 2026, Europe/Prague. Čtecí výzkum a rozhodovací podklad pro koordinátora; nejde o implementaci hry ani nový GPU důkaz. Výchozí commit: `db9108ddd3d069030abebd0fcccd6ecefbd0ff53`. Zdrojové závěry byly ověřovány přes committed obsah `git show HEAD:...`, nikoli proti cizím dirty změnám hlavního checkoutu. Přečteny plné popisy, vazby a komentáře všech 14 přidělených issues; komentář obsahoval pouze KEY-21. KEY-13 byl po novém pokynu uživatele znovu načten a má `Canceled`, `blocks=[]`.

Podklad navazuje na projektový BMAD koordinátora. Podagent podle [projektové policy](../../agents/bmad-policy.md) nespouští další workflow. Read-only analýza je nyní uložená v samostatné dokumentační rezervaci `bmad-issues-movement-20261019`.

**Společné rozhodnutí:** výkonnostní práce patří pod jeden optimalizační celek KEY-5, který zahrnuje CPU/GPU pipeline, startup a lifecycle; KEY-16 je jeho konkrétní B6 scénář s vlastními kritérii průchodnosti a vzhledu. Pohyb KEY-6/7/12, vizuální konzistence KEY-14/15, diagnostika KEY-2 a celková přejímka KEY-11 zůstávají samostatné. KEY-21 je již dítě KEY-2 a vlastní rozpracovanou implementaci. Sdílení příčinného řetězce ani měřicí trasy není důvod ztratit rozdílná přijímací kritéria. KEY-13 je vyřazen na výslovný pokyn uživatele; nepřidává žádnou aktivní testovací bránu.

Historická data pocházejí zejména z [výzkumu pohybu](../../performance/research-20261014/netcode-camera.md), [barev a světel](../../performance/research-20261014/visual-lighting.md), [B6 rozhodnutí](../../performance/research-20261014/b6-current-main.md) a [uživatelského testu 15. 10.](../../performance/evidence/playtest-20261015/README.md). V tomto úkolu nebyly spuštěny runtime testy, build, server, browser, GPU měření ani změněna instalace.

## KEY-1 — Opravit věrohodnost automatických logů a výběr herní relace

**Rozhodnutí: ponechat Done.** Commit `4bd7c4b7` je předkem výchozího main. Původní věrohodnost a zdravý browser-to-disk sběr mají doložené přijetí; retence, tvrdé ukončení/offline a nejlepší možné doručení konce byly výslovné limity. Neopakovat již hotový lifecycle připojení, měření posunu a výběr herní relace. Nová korelace patří KEY-2/21. [Issue](https://linear.app/gigeconomy/issue/KEY-1/opravit-verohodnost-automatickych-logu-a-vyber-herni-relace), [commit](https://github.com/Varnahg/StrahovCrazyShow/commit/4bd7c4b79bea9dea20b5d8fe0d5bc3467fdbbfcb).

## KEY-2 — Doplnit měření příčin renderových a síťových záseků

**Rozhodnutí: ponechat otevřený diagnostický parent; KEY-21 neslučovat jako duplicitu.** Main již obsahuje frame lifecycle, render health, terminal failure, systémovou telemetrii a CPU profily. [Game](../../../client/game.ts) automaticky ukládá šest CPU fází, ale běžný `diagnosticContext` stále postrádá úplnou korelaci flashlight/camera/editor stavů. [Report](../../../scripts/diagnostics-report.mjs) už odděluje raw threshold counts od překrývajících se observer záznamů; tento historický požadavek se nemá implementovat znovu. `network-left/identity-change` však stále vstupuje do connection events jako disconnected. Chybí měření celkové režie, nikoli jen recorder self-time.

**Varianty a volba:** levný běžný sběr doplnit významově přesnými událostmi a omezeným detailním QA oknem. Vždy zapnutý profiler zvyšuje režii/data; pouze ruční profilování nezachytí běžné hraní. Média a přesné input batches řeší existující KEY-21. GPU query ponechat asynchronní; callback delay nepojmenovávat čistá wire latency.

**Rozsah/refaktor:** [game-diagnostics](../../../client/game-diagnostics.ts), [recorder](../../../client/session-diagnostics.ts), [schema](../../../shared/session-diagnostics.ts), report; Game/UI pouze koordinované hunks. Sjednotit identity run/game/renderer/frame, whitelist a lifecycle reset, nevytvářet další paralelní schéma.

**Přijetí:** skutečná frame→collector→report cesta, reconnect/guest/invalid getters, unavailable pro chybějící data. Existující `tests/game-diagnostics-projection.test.ts`, `tests/session-diagnostics.test.ts`, `tests/diagnostics-report.test.ts` doplnit jen o zbývající mezery. A/B recorder ON/OFF v celé produkční hře, stejná trasa/HUD/GPU/rozlišení; bounded fronty a explicitní ztráty. Pořadí: koordinace s KEY-21, potom společné použití pro KEY-5/6/7/12. [Issue](https://linear.app/gigeconomy/issue/KEY-2/doplnit-mereni-pricin-renderovych-a-sitovych-zaseku).

## KEY-6 — Opravit odesílání vstupů a zachovat řízení po render záseku

**Rozhodnutí: ponechat samostatně; společná movement matice s KEY-7/12.** [FrameInputBuffer](../../../client/network-input-buffer.ts) již má frame/timer/pressure flush, balíčky po 8, bounded queue a rolling rate limit. Recovery zachovává rate budget; Game po stallu automaticky nemaže držený úmysl. Tyto části nepřepisovat. Test 15. 10. přesto ukázal timer interval 3878 ms a sampled discarded/expired vstupy při nulovém overflow. Nula overflow není přejímka ovládání. Blokované hlavní vlákno oddálí i input/timer callbacky; [W3C LoAF](https://www.w3.org/TR/long-animation-frames/) je pracovní návrh popisující tento model.

**Varianty a volba:** reprodukovat skutečné production→enqueue→flush→server apply při 100/250/1500/4000ms stallech a keyup během blokace. Odlišit zachování známého úmyslu od pozdě doručeného keyup. Další timer neřeší zablokované vlákno; vyšší limity zvětší stale replay/flood riziko. Worker má jiný lifecycle a patří KEY-40 až po naměřeném přínosu.

**Rozsah/refaktor:** input buffer, [timeline](../../../client/network-timeline.ts), úzké Game/UI wiring; [serverová timeline](../../../shared/input-timeline.ts) pouze po prokázané chybě. Centralizovat reset/ack/expiry, odlišit reálný input od neutral replay, zachovat fixedDT a omezenou paměť.

**Přijetí:** `tests/network-input-buffer.test.ts`, `tests/client-recovery.test.ts`, `tests/input-timeline.test.ts`, `tests/input-backlog.test.ts`, SDK integrace. Prakticky W/brzda/A-D/skok před a po incidentu, bounded fronty, žádné zrychlení, správný aktuální úmysl po recovery, host izolace a oprávnění řidiče. Render příčiny opravuje KEY-5; zde musí zůstat doklad bezpečného řízení. [Issue](https://linear.app/gigeconomy/issue/KEY-6/opravit-odesilani-vstupu-a-zachovat-rizeni-po-render-zaseku).

## KEY-7 — Opravit skokové korekce multiplayerového pohybu a auta

**Rozhodnutí: ponechat samostatnou autoritativní recovery opravu.** V11, epoch calibration a potvrzování RTT špičky jsou v main; neopakovat je. Archiv 15. 10. má 115 korekcí ≥0,35 m mimo respawn/změnu režimu, maximum 21,087 m, a šest historických server-clock-drop bariér plus client-request během 14 ms. [AuthorityBuffer](../../../client/authority-buffer.ts) slučuje ordinary state, ale epoch/resync/respawn vrací jako okamžité bariéry; [UI](../../../client/ui.tsx) je ihned aplikuje. To je konkrétní mechanismus pro reprodukci, nikoli důkaz, že lze bezpečně vynechat každou starší bariéru.

**Varianty a volba:** recovery transakce rozliší respawn, změnu režimu a obnovu autority. Sloučit jen bariéry s prokázanou zachovanou sémantikou/frontierem. „Vždy poslední paket“ může ztratit respawn; větší timeout/replay budget prodlouží predikci bez autority; celosvětový rollback má výrazně vyšší náklady a lifecycle složitost. Nejprve adversariální reprodukce skutečného řetězce.

**Rozsah/refaktor:** buffer, timeline, úzké `Game.reconcile`/UI callbacky; serverový kontrakt pouze pokud stávající reason nestačí. Jediná bounded recovery state machine, diagnostické counters oddělené od fyziky, žádná neomezená historie.

**Přijetí:** `tests/authority-buffer.test.ts`, `tests/client-recovery.test.ts`, `tests/network-latency-recovery.test.ts`, `tests/prediction-replay.test.ts`. Ordinary/epoch/drop/respawn/rejoin, server restart, změna řidiče, pořadí paketů a 50–200ms latency. Zachovat původní okamžitou respawn bariéru. Stejnou autoritu aplikovat právě jednou ve správném čase. Praktická jízda se synchronizovaným logem/obrazem; KEY-21 dodává korelaci a KEY-12 samostatně přijímá prezentaci. [Issue](https://linear.app/gigeconomy/issue/KEY-7/opravit-skokove-korekce-multiplayeroveho-pohybu-a-auta).

## KEY-11 — Ověřit úplné odstranění nálezů a integrovat stabilní checkpoint

**Rozhodnutí: ponechat závěrečnou přejímku, nikoli další implementační backlog.** Synchronní main/origin a clean 1491-testový checkpoint dokládají historii a omezený smoke, ne plynulost celé hry. Historických 51,24 FPS, p95 34,3 ms, p99 77,5 ms z 15. 10. se netýká dnešního main. Nové zadání analyzuje a organizuje backlog; samo neruší dřívější explicitní pozastavení širokého herního cíle. **KEY-13 je na přímý pokyn uživatele vyřazen a není aktivní podmínkou této přejímky.**

**Varianty a volba:** jediná matice požadavek→důkaz→verze→otevřená závada. Zelená pipeline nemůže nahradit obraz/FPS; jeden obří benchmark na konci zhorší atribuci. Přijímat úzké stabilní změny a následně společný checkpoint. KEY-5 sdružuje optimalizaci včetně startup/lifecycle, movement a vizuální konzistence mají vlastní podmínky. Neopakovat celé testy kvůli změně dokumentace.

**Rozsah/refaktor evidence:** samostatně rezervovaná přejímací evidence a nakonec [docs/verification.md](../../verification.md), bez runtime změn. Sjednotit tabulku místo přepisování historie; odlišit commit, instalaci, source manifest a skutečný immutable build.

**Přijetí:** úplná hra/HUD, jeden i více skutečných různých avatarů, cold/warm, den/noc, first/third person, chůze/jízda, obě schodiště B6, editor/leave/rejoin a host izolace. GPU/ovladač, CSS/internal resolution, FPS/p95/p99/max, obraz a původ každého důkazu. Zachovat KEY-14/15 a KEY-6/7/12, nenahradit je průměrným FPS. `pnpm test`, build a izolovaná integrace nad stabilním snapshotem včetně testů podle platné koordinace. [Issue](https://linear.app/gigeconomy/issue/KEY-11/overit-uplne-odstraneni-nalezu-a-integrovat-stabilni-checkpoint).

## KEY-12 — Odstranit třesení obrazu při pohybu z třetí osoby

**Rozhodnutí: ponechat samostatnou prezentaci a kameru.** Phase fix `75046d0` je v main. `updateNetworkPresentation` již váže alpha na timeline/epoch/currentSeq; [skutečné Game testy](../../../tests/game-interpolation.test.ts) pokrývají konstantní pohyb, zero-step, waiting a recovery. Původní accumulator fix znovu neimplementovat. `Game.reconcile` stále nahrazuje `visualOffset` rozdílem fyzikální staré a opravené polohy; nezachovává přímo předchozí zobrazenou pozici. To je konkrétní experiment, nikoli prokázaná příčina každého uživatelského otřesu.

**Varianty a volba:** měřit pre/post render pose a kameru, oddělit autoritativní skok, interpolaci a collision arm. První cílená regrese: dvě malé korekce během jednoho segmentu. Případný fix zachová viditelnou kontinuitu běžné opravy, ale nevyhladí explicitní respawn. Vyšší smoothing threshold skrývá časovou chybu; camera spring zvyšuje odezvové zpoždění a nespraví chybnou autoritu.

**Rozsah/refaktor:** [Game](../../../client/game.ts) prezentace/kamera, timeline jen při doloženém kontraktu; `tests/game-interpolation.test.ts`, `tests/client-recovery.test.ts`, `tests/vehicle-camera.test.ts`, `tests/camera-look.test.ts`. Sdílet render pose avatara/auta/kamery a omezit alokace bez změny fyziky; zachovat reset všech presentation caches při změně identity.

**Přijetí:** 60/144 FPS CPU regrese a skutečné video pěšky/auto, first/third person, guest/multi, den/noc, schody/kolize i projekce A/D. KEY-7 přijímá autoritu, zde je nutná hladká prezentace a odezva. KEY-21 poskytne přesnou korelaci; render KEY-5 může odstranit spouštěč, ale nenahrazuje test kamery. [Issue](https://linear.app/gigeconomy/issue/KEY-12/odstranit-treseni-obrazu-pri-pohybu-z-treti-osoby).

## KEY-13 — Odstranit červené záblesky místo textur při náročném načítání scén

**Rozhodnutí: Canceled na přímý pokyn uživatele 19. 10. 2026.** Uživatel je již dlouho nepozoruje a výslovně požádal položku zahodit. Koordinátor zrušil issue a odstranil blokaci KEY-11; read-only opětovné načtení potvrzuje `status=Canceled`, `blocks=[]`. Historie zůstává. Nejde o nové měření, prokázanou technickou příčinu ani tvrzení, že byly právě otestovány všechny scény. Žádná nová oprava, reprodukce nebo přejímka tohoto issue není podmínkou další práce. Znovu otevřít pouze při novém výskytu s aktuální identitou buildu. [Issue a přímé rozhodnutí](https://linear.app/gigeconomy/issue/KEY-13/odstranit-cervene-zablesky-misto-textur-pri-narocnem-nacitani-scen).

## KEY-14 — Opravit nepřirozené noční barvy a jas materiálů

**Rozhodnutí: ponechat samostatnou barevnou konzistenci.** Kandidát `557eb880` není předkem main; současný [Cinematic.configure](../../../client/cinematic.ts) stále používá HDR `true` a `imageProcessingEnabled=false`. Původní výzkum/actual controller regrese doložily neúčinné material defines této cesty. KEY-17 ownership je vyřešen; jeho patch není dokončením nočních barev. [Babylon image processing](https://doc.babylonjs.com/features/featuresDeepDive/materials/shaders/image_processing/) vysvětluje linear/gamma a opakované zpracování, nikoli všechny konkrétní pixely hry.

**Varianty a volba:** znovu porovnat úzký non-HDR/material-side kandidát s dnešním main a engine změnami. Zachovat pozdější Fresnel disposal, WebGPU přípravu a art hodnoty. HDR fullscreen je alternativa s kompatibilitou všech custom shaderů a dalším passem; vlastní bloom/FXAA zvyšuje údržbu; intenzita/gamma naslepo neopraví kontrakt. Non-HDR má nejmenší doložený rozsah, pokud projde bloom/clipping přejímkou.

**Rozsah/refaktor:** cinematic a původní [kandidátní tests/cinematic-image-processing.test.ts](https://github.com/Varnahg/StrahovCrazyShow/blob/557eb880b6caff433f2d8e87211b20165baa4c12/tests/cinematic-image-processing.test.ts), stávající cinematic suites. Sjednotit vlastníka konfigurace, quality transitions a observer disposal; neměnit současně paletu/textury, nekopírovat celou starou worktree.

**Přijetí:** low-first, medium-first, high→low→medium, reattach/dispose, actual Standard/PBR defines a pass inventory. Pak stejné reference den/noc, kvality, WebGL2/WebGPU: odstín, čitelnost, clipping/banding, bloom, stíny a FPS. NullEngine PASS nenahrazuje obraz. Samostatná integrace s aktuálními důkazy; tato barevná baseline pomůže KEY-15. [Issue](https://linear.app/gigeconomy/issue/KEY-14/opravit-neprirozene-nocni-barvy-a-jas-materialu).

## KEY-15 — Opravit nepřirozené chování osvětlení při pohledu z dálky

**Rozhodnutí: ponechat prostorovou kontinuitu lamp, neslučovat s KEY-14.** [Art lighting](../../../client/art-lighting.ts) po 0,5 s vybírá nejbližší 1/2 lampy podle hráče s hranicí `min(32, range+8)` a mění enabled/intensity; B6 má pohyblivé fill světlo. Jde o konkrétní kandidátní mechanismy, nikoli obrazově potvrzenou příčinu uživatelského pozorování. [Babylon lights](https://doc.babylonjs.com/features/featuresDeepDive/lights/lights_introduction/) potvrzuje finite material light budget a náklady více dynamických světel; automaticky zvýšit cap není doložené řešení.

**Varianty a volba:** jedna mapovaná lampa/plochá reference při přiblížení/oddálení, otočení stojící kamery a nearest boundary. Po potvrzení výměny slotů porovnat hysteresis/stabilní výběr s fade. Fade může potřebovat další slot nebo ubírat jiné světlo; receiver přiřazení přidá cache invalidaci. Lightmap je širší alternativa pro statickou složku, ale potřebuje nové zdroje a den/noční/wetness kontrakt.

**Rozsah/refaktor:** art lighting, případná pool/emissive vazba v [streets rendereru](../../../client/streets-renderer.ts); B6 pouze po přiřazení jeho jevu. Oddělit výběr, intenzitu a emisi, zachovat čtyřsvětelný budget, reálné pozice a provenance. Žádná regenerace assetů v této úzké opravě.

**Přijetí:** selected IDs, player/camera distance, receiver lights, intensity/range a obraz téže plochy. Den/noc, všechny kvality, torch/headlight/B6 kombinace, bez skoků, průsvitu přes překážky, ztráty svítilny či nového shader stall. `tests/art-lighting-budget.test.ts`, `tests/night-lighting.test.ts`, nová regrese potvrzené boundary chyby. Barvy hodnotit na stabilním KEY-14. [Issue](https://linear.app/gigeconomy/issue/KEY-15/opravit-neprirozene-chovani-osvetleni-pri-pohledu-z-dalky).

## KEY-16 — Odstranit záseky při vstupu do B6 a přechodu mezi patry

**Rozhodnutí: zařadit pod hlavní optimalizaci KEY-5, zachovat samostatnou B6 přejímku včetně kolizí a vzhledu.** Pivot fix `af4d6eff` je v main, má skutečné ancestor/freeze/reattach regrese a není třeba jej opakovat. [B6 controller](../../../client/b6-reality.ts) podmíněně synchronizuje root a používá scratch inverse, ale stále řídí floor/stairs visibility a add/remove meshes. Čtyři >1s pauzy v téměř stejném místě patra 3 v testu 15. 10. vylučují vysvětlení pouze hranicí patra; neprokazují selhání pivot fixu.

**Varianty a volba:** cold vstup, opakovaný průchod, obě schodiště a stojící/otáčející hráč v patře 3 s torch ON/OFF. Rozlišit attach/visibility, light membership, shader readiness, shadow traversal a kolize. Příprava variant řeší cold compile, ne steady traversal. Hysteresis patra pomůže jen při doloženém churn; trvalé attach zvýší aktivní render náklady; dlouhodobá inverse cache zkomplikuje invalidaci.

**Rozsah/refaktor:** B6 controller, podle profilu úzký lighting/preparation modul. Shared B6/simulation jen při reprodukované geometrické chybě. Oddělit desired visibility a aplikovat delty, zachovat identitu a foreign ownership. [Lifecycle testy](../../../tests/b6-render-lifecycle.test.ts) zachovat, doplnit pouze nalezený mechanismus.

**Přijetí:** venek→hala→obě schodiště→patra→ven, first/third person, den/noc, cold/warm. Žádný transition stall ≥250 ms, propadnutí, zablokování či povrch/kolize mismatch; měřit i menší opakované špičky/p95/p99 a zachovat obsah. Shader důkazy sdílet s KEY-3/5/31, ale jejich PASS nenahrazuje průchodnost. [Issue](https://linear.app/gigeconomy/issue/KEY-16/odstranit-zaseky-pri-vstupu-do-b6-a-prechodu-mezi-patry).

## KEY-17 — Opravit vlastnictví image-processing wrapperu a únik observeru v Babylon 9.30

**Rozhodnutí: ponechat Done.** `7cc5a596` je předkem main; vlastnictví wrapperu a observer cleanup má doložené owned/borrowed/shared regrese v [tests/babylon-image-processing-ownership.test.ts](../../../tests/babylon-image-processing-ownership.test.ts). Nerozšiřovat hotový kontrakt na noční vzhled, obsah `557eb880` ani GPU výkon. KEY-14 nadále potřebuje vlastní přijetí. [Issue](https://linear.app/gigeconomy/issue/KEY-17/opravit-vlastnictvi-image-processing-wrapperu-a-unik-observeru-v), [původní výzkum](../../performance/research-20261014/image-processing-ownership.md).

## KEY-18 — Oddělit přírůstky serverového času od historických čítačů v reportu

**Rozhodnutí: ponechat Done.** `f4f6116c` je předkem main; [offline report](../../../scripts/diagnostics-report.mjs) již odděluje observed deltas od lifetime maxima, segmentuje neporovnatelné intervaly a uvádí unavailable při chybějících datech. Neopakovat tento hotový scope ani jej zaměňovat za novou schopnost měřit všechny serverové pauzy. [Issue](https://linear.app/gigeconomy/issue/KEY-18/oddelit-prirustky-serveroveho-casu-od-historickych-citacu-v-reportu), [commit](https://github.com/Varnahg/StrahovCrazyShow/commit/f4f6116c643bf001702f1b96331a3088d1717b08).

## KEY-19 — Zapojit automatické frame logy a izolovanou vlastní síťovou diagnostiku v main

**Rozhodnutí: ponechat Done.** `e1b03fe8` je předkem main; skutečný test 15. 10. potvrdil automatické frame i vlastní network/server logy bez seq mezer. [Game diagnostics](../../../client/game-diagnostics.ts) zachovává scalar whitelist a guest izolaci. Další light/camera/media korelace patří KEY-2/21; hotový sběr není důkaz FPS nebo správných pixelů. [Issue](https://linear.app/gigeconomy/issue/KEY-19/zapojit-automaticke-frame-logy-a-izolovanou-vlastni-sitovou), [evidence](../../performance/evidence/playtest-20261015/README.md).

## KEY-21 — Propojit pohybový a obrazový deník hraní se scénáři a vyhodnocením

**Rozhodnutí: dokončit existující WIP jako dítě KEY-2.** Worktree `codex/playtest-diary` na `9d98ffc5` obsahuje necommitnuté capture/timeline/diary, server artefakty, scénáře a report; v main nejsou. Převzetí vyžaduje vlastníky a handoff, nikoli novou paralelní implementaci. Taskové `ready` neprokazuje dokončení. Dnešní main má novější render lifecycle, který je nutné při integraci zachovat.

**Varianty a volba:** schválený capture aktuálního framebufferu po renderu, freeze metadata při kopii, bounded pool a jedna komprese. Druhý render mění měřenou situaci; permanentní readPixels může způsobit stall. `toBlob` může vrátit null a při nepodporovaném formátu PNG, takže evidovat skutečný MIME/úspěch ([HTML standard](https://html.spec.whatwg.org/multipage/canvas.html#dom-canvas-toblob)). Worker posoudit až podle režie copy/encode.

**Rozsah/refaktor:** existující plánované/WIP `shared/playtest-diary.ts`, `client/playtest-timeline.ts`, `client/playtest-capture.ts`, `client/playtest-diary.ts`, `server/playtest-artifacts.ts`, `shared/playtest-scenarios.ts`, `scripts/playtest-report.mjs`, `scripts/playtest-review.mjs`; entrypoints koordinovaně. Sjednotit run/game/frame/action identity, source input versus replay a storno leave/rejoin. Tyto cesty jsou budoucí integrace, nikoli přítomnost v main.

**Přijetí:** deset stanovišť bez teleportu, 10Hz pose, bounded incident ring, fotografie/burst, SHA/ack/dedupe/retence. Retry/offline/crash/resize/rapidF, missing-media pravdivě; celá hra A/B bez nového sběrem způsobeného stallu >50 ms a p95 delta ≤2 ms. Lidské záznamy hodnotit až na zprávu, žádná automatizace; jisté nálezy deduplikovat, estetické hypotézy označit. Toto dodá společnou evidenci pohybu, barev a optimalizace, nikoli jejich automatické Done. [Issue](https://linear.app/gigeconomy/issue/KEY-21/propojit-pohybovy-a-obrazovy-denik-hrani-se-scenari-a-vyhodnocenim).

## Pořadí a hranice další práce

1. KEY-21: předání původních vlastníků, sémantická integrace na aktuálním základu, korelace a režie. KEY-2 souběžně vyřeší zbývající významové mezery bez opakování hotových profilerů.
2. KEY-6/7/12: jedna reprodukční matice, nejdřív správnost sender/recovery, potom kontinuita obrazu; samostatné změny, cílený refaktoring a přijetí každého kontraktu.
3. KEY-14: aktuální revalidace úzkého kandidáta a barevná baseline; následně konkrétní prostorový jev KEY-15.
4. KEY-16: B6 scénář hlavního optimalizačního celku KEY-5; sdílet CPU/GPU příčiny, ponechat vstupy/schody/kolize a vzhled jako samostatná kritéria.
5. KEY-11: společný stabilní produkční checkpoint až podle dosud platných požadavků a koordinovaného obnovení původně pozastaveného cíle. KEY-13 není aktivní brána ani plánovaná práce.

Publikaci rozhodnutí do Linearu, integraci dokumentace a případné založení přesných implementačních rezervací provádí koordinátor. Tento podklad nedává oprávnění přebírat cizí WIP, měnit hraný immutable build ani spouštět náročné validace bez rezervace.
