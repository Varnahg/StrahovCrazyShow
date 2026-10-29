# Předání: webgpu-completion-lifecycle-controls-20261021

- Vlastník `webgpu-completion-01a15a3e-lifecycle-controls`, příjemce root koordinátor.
- Worktree `C:/Users/rezac/Documents/GitHub/StrahovCrazyShow/.cache/player-feedback-20261020`, větev `codex/webgpu-completion-20261021`, baseline `a96f1aec`.
- Research/varianty před code: `docs/performance/evidence/webgpu-completion-20261021/lifecycle-controls/README.md`. Default-off own-device action + bezpečný běžný visibility anchor, bez produkčních/GPU/OS zásahů. Tento handoff zatím není hotová přejímka.

## Vlastní WIP pro úzké rozšíření test scope

Původní owner úspěšně claimnul čistý task. Baseline `lifecycle-controls/verify.mjs baseline` dokončen exit0:119/119CPU, syntax/TSX0/diff0, helper přesně `a5b3dc0000956b9abcd77dab55e06ae8c31f7f6c12ffb1ba5840f19562f933f9`, protected14 a frozenv6 všech25 před/po shodné. Proof `baseline.json` SHA `b2d80c789f322c89c583aa1b9cddb399d45c7fd4ba88ea96858de990a7bf78ad`; before manifest obsahuje exact helper/source/native/frozen SHA. Žádný build/install/server/GPU/full project suite/commit.

Vlastní dosavadní source WIP: nový `measurement/lifecycle-controls.mjs` (scoped no-wrapper action owner+native anchor), `measurement/common.mjs` (required flag/source seal), `measurement/harness.mjs` (explicit virtualmodule+flag), `measurement/qa-overlay.mjs` (explicit diagnosticUI/action+ownedcleanup), `measurement/receipt.mjs` (required flag/bounded existingstate action). Vlastní evidence README/verify.mjs/baseline.json/baseline-before.json/baseline.tap a tento handoff. Nový lifecycle test a úpravy tří přidělených fixturefiles ještě nejsou zapsané. Work-in-progress po změnách ještě nebyl testován, nelze používat jako accepted helper/build.

Povinný canonical `lifecycleControls` boolean odhalil dva další existující přímé sealed-input fixtures: `measurement/shader-attribution.test.mjs:157` a `measurement/buffer-lifecycle.test.mjs:141` potřebují pouze explicitní `lifecycleControls:false`, aby nové missing/tamper guardy nebyly obcházené. Tyto2cesty nejsou v původním tasku; autor je NEMĚNIL a nepřevzal cizí WIP. Koordinátor byl požádán o přesné rozšíření. Autor nyní zastavuje source zápisy a uvolní vlastní task pro administrativní úpravu. Po rozšíření smí tentýž původní owner reclaim `--adopt-dirty` výhradně zde doložený vlastní WIP. Root product/native/validation WIP ani frozen helperv6 nebyly převzaty či upraveny.

Všechny vlastní pomocné CPU procesy skončily, žádný vlastní port/proces neběží. Release je předání pro scopeupdate, nikoliv dokončení. Před dalším zápisem je nutný nový claim; root nesmí tento rozpracovaný helper zaměnit za neměnný v6/a5b3 nebo použít bez nového proof/sealu/review.

## Druhé ownWIP předání pro poslední explicitní fixture

Po exact2path rozšíření `d5a3f064` původní owner úspěšně reclaimnul --adopt-dirty. Doplnil pouze povinné false do schválených shader-attribution/buffer-lifecycle test inputů. Dále ve vlastněných cestách vytvořil nový lifecycle-controls.test.mjs, doplnil DOM/identity regrese do helper.test, povinný flag do clock/weather fixtures, explicitní false/default/seal metadata testy. Tmp fixture výstupy helper/weather testů jsou nyní pod výslovně rezervovanou `.cache/webgpu-completion-lifecycle-controls-20261021/`, ne v measurement prefixu.

Nový běh160 testů skončil159PASS/1FAIL: jediný původní `measurement/routine-cost.test.mjs:227` canonical seed stále postrádá required lifecycleControls:false. Proof `development-scope-seed160.json` SHA `e8fbfdca7eaf2aed1d776a52c3a1e397853fcc25859b10f54ac1922d99a05ce0`, zdroje/frozen/protected před/po shodné. Tento třetí soubor nebyl upraven, není dosud v scope. Celý current test corpus byl znovu prohledán bez zkrácení: direct canonical inputs jsou buffer-lifecycle:141, shader-attribution:157, weather-latency:217–218, routine-cost:227 a nový lifecycle-controls:77–78. Všechny kromě routine-cost mají explicitní lifecycleControls. Receipt-only identity helper:15 a clock:195 už field mají; clock:223/236 jsou záměrně dílčí pure verifyBuildContract/launch-plan inputs, ne canonical/receipt seed, jejich kontrakt se nemění. Shader-lifetime nemá canonical/receipt input. Úplný zbývající scope seznam je pouze `measurement/routine-cost.test.mjs`.

První vývojový běh měl neúplnou DOM health fixture (chybělo errorCount0); strict production-style guard správně odmítl destroy, ale test chybně čekal neomezeně na loss Promise. Ověřený vlastní helper worker PID59280(parent48676,parent verify22956) byl ukončen, ostatní/root procesy nebyly zasaženy; runner uchoval `development-hung-dom.json`/TAP. Fixture je opravena o původní scalar field a fail-fast call-count assertion PŘED čekáním, nikoli oslabením guardu. Další160-test běh byl normálně dokončen bez hanging procesu; lifecycle/UI/pureguard testy jsou zelené. Žádný vlastní proces/port nyní neběží.

Autor opět zastavuje source zápisy pro root exact1path administrativní doplnění. Koordinátor schválil potřebu routine-cost test path; před další změnou musí následovat release a reclaim stejného původního ownera --adopt-dirty jen tohoto doloženého WIP. Accepted frozenv6/a5b3, produkt, native pin a root snapshoty zůstaly bez našich zápisů. Current helper ještě není finálně accepted/sealed a nesmí být použit jako frozen runtime.

## Finální implementace, refaktoring a CPU předání

Po posledním exact1path rozšíření `2541033a` původní owner úspěšně reclaimnul vlastní WIP --adopt-dirty a doplnil pouze required false do routine-cost canonical seed. Původní scope návratové záznamy výše jsou historické. Aktuální výsledek je dokončený QA-only helper k nezávislému přijetí, nikoli přijatý product/GPU build.

Výsledek: explicitní výchozí false `--lifecycle-controls` patří do canonical build input/digest, browser/sidecar a receipt kontraktu i helper source sealu. Query nemá aktivační cestu. Explicitní diagnostické UI obsahuje běžný `about:blank` anchor `_blank`/`noopener` bez event/focus injekce a pojmenovanou jednorázovou akci pouze pro vlastní dočasnou hru. Před voláním se ověří exact Game/Scene/engine/device/health/rendererId/generation/startupAbort/current owner, ready/valid/no errors/pending0/no startup lease/quality preparation/benchmark a původní method identity. Původní destroy dostane exact receiver/no args, návrat i falsy throw se zachovají. WeakSet nedrží device silnou referencí, zabrání druhému pokusu i novým ownerem stejného device. Žádné lost/validation/Game/UI/Room metody se neobalují, žádný nový global/per-frame hook/polling.

Refaktoring: ownership/action/cleanup je v malém samostatném module. Dispose je idempotentní, odstraní pouze vlastní abort/scene pozorování, vyprázdní signal array a strong owner/device/option reference. Callback/cleanup chyba nezahladí původní akci. Bounded scalar state receipt má jen `action/attempted/outcome/rendererId/generation`; outcome returned/threw nepředstírá native loss či recovery. Ovládání zůstává pod původním startup ACK/immutable failed-queue guardem, starý disposed/rejoin callback se nedostane k čerstvé hře. Renderer startup/health/network/Room/ready/authority/render/pipeline a native patch nebyly měněné.

### Přesné změněné cesty

V prefixu `docs/performance/evidence/webgpu-completion-20261021/measurement/`:

- Runtime/helper: `common.mjs`, `harness.mjs`, `qa-overlay.mjs`, `receipt.mjs`, nový `lifecycle-controls.mjs`.
- Testy: `helper.test.mjs`, `clock.test.mjs`, `weather-latency.test.mjs`, `shader-attribution.test.mjs`, `buffer-lifecycle.test.mjs`, `routine-cost.test.mjs`, nový `lifecycle-controls.test.mjs`. U shader/buffer/routine jde jen o explicitní false v existujícím canonical seed.
- Uživatelské QA instrukce `README.md`.

Vlastní leaf evidence prefix `docs/performance/evidence/webgpu-completion-20261021/lifecycle-controls/`: README výzkum/varianty/acceptance, `verify.mjs`, baseline-before/json/TAP, aktuální verification-before/json/TAP, development-hung-dom/json/TAP, development-scope-seed160/json/TAP a pre-asset-guard160/json/TAP. Tento handoff a výslovný soukromý `.cache/webgpu-completion-lifecycle-controls-20261021/` fixture prefix; dočasné podadresáře po testech uklizeny. Žádné další generated outputy.

Cizí root WIP (aktuální research/final-performance-protocol a validation/ci evidence) nebyl převzat ani zahrnut. Product Game/UI/RenderStartup/render-health/validation/factory, package/config/server/shared, assety, shared node_modules/native patch, source6 a všechny frozen/played buildy zůstaly bez našich zápisů. Žádný credential nebyl potřebný, čtený ani vypsaný. Žádný staging/commit.

### Aktuální ověření a identita

`node docs/performance/evidence/webgpu-completion-20261021/lifecycle-controls/verify.mjs` exit0: **160/160** testů (původních119 +41 nových meaningful owner/DOM/contract případů),26 helper syntaxes0, exact-once UI transform/TSX0, owned diff-check0. Helper27 inputs,15 protected runtime/config/GLB/native inputs a25 frozenv6 helper files před/po shodné. Výchozí119-only run a5b3 prošel před helper změnami; jeho proof `b2d80c789f322c89c583aa1b9cddb399d45c7fd4ba88ea96858de990a7bf78ad` je zachovaný.

- Final verification SHA `8147578a4e4fd1290c89866cf4e1289a83894be97feb5e3cf7d4ee61bb5f3a10`.
- Final TAP `1d1438c7306315ce33c7403c5371ed4d175e1f96c9c75067b242b8d29b6bc0a5`.
- Helper seal `f79bb85db37e746692ab32632c96ca2013c33ed50015aa9818a9dcdb0cdcf421`.
- Lifecycle module `98a3e7654ef82de854fa186d6cbbfe52c2991df70ec6eaebdddd4aa225b90740`; new test `60768ff901ecee5ca6c674c7ba63020b6afe8ba9a41285e6bc0c627984bbce42`; overlay `bcdf2d9223a16415e34e8f28762629b3a2dd1d7cefc6fea045ddfc3355ff560d`.
- Manifest jednotlivě uvádí všech27 helper source/test digestů,15 protected (včetně169928B strahov-compact.glb a skutečného shared Mesh e9dd) a25 frozen helper v6 SHA. UI preimage i transform digest se shodují s původním aktuálním product markerem. Hash dirty stromu se nevydává za checkpoint.

Default-off proxy/no device read, query-negative UI, supported/unsupported/foreign/missing/retired device, readiness/idle/startup lease/pending/generation/Scene/health/abort odmítnutí, original receiver/result/all falsy throws, same-device one-shot, sync original dispose a observer fault jsou ověřeny CPU. DOM/transport fixtures ověřují safe anchor bez handleru, lease refusal, skutečné zavolání původního fake terminal device přes owned UI, zachování jeho původního loss listeneru, immutable action receipt/ACK/teardown/rejoin. Seal/receipt testy odmítají absence/null/type/flag drift a coherent sidecars proti starému emitted bundle. Nejde o native GPU/browser důkaz.

### Procesy, omezení, review a release

Všechny vlastní Node/tsx/verify procesy skončily. Původní explicitně identifikovaný hanging DOM worker byl ukončen a jeho failure logy zachovány výše; nebyl ukončen root či cizí proces a žádné porty nebyly používány. Není vlastní GPU/browser/server/build/install/full project suite proces. Root fullsuite94784/source6 a jeho frozen a5b3 runtime pokračovaly nezávisle.

Current helper/source/proof SHA předány rootovi pro nezávislé read-only review; žádné další source/test/measurementREADME zápisy nejsou plánované. Po tomto předání následuje release stejného tasku/ownera, potvrzený tool výstupem a zprávou rootovi. Integrátor přebírá pouze exact diff po review a vyrábí nový immutable sealed build; nevyměňuje frozenv6 ani hraný build. Pak prakticky ověří loading-off/preparationViewReleased, original device.lost→health/Game/render stop/Room/UI recovery a skutečný hidden→visible přes vlastní native anchor. CPU call receipt neříká že device loss/recovery či visibility test už proběhl. Žádné FPS/obrazové zlepšení, backend default ani KEY-22 Done se tímto výsledkem netvrdí.
