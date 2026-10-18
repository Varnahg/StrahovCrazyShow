# Předání: webgpu-native-day-coverage-qa-20261018

- Vlastník `webgpu-native-day-qa-01a14497`; příjemce root. WT `C:/Users/rezac/.codex/worktrees/webgpu-comparison/StrahovCrazyShow`, větev `codex/webgpu-migration`. Claim získán před prvním zápisem; přímý podúkol bez dalšího BMAD.
- Výsledek: izolovaný copied šest souborový kandidát nad native snapshotem `2a3dba44ea28dbeffa5324fe22c35011b1e333c4233bb99ed487ee7e057d3584`. Žádný native/main runtime zápis, commit, build, install, port nebo GPU.
- Výstupy: `.cache/webgpu-migration-checks/native-day-coverage-qa-20261018/` a tento handoff. Počáteční git status obsahoval pouze rootův nový task JSON; nebyl převzat ani měněn. Žádný cizí WIP nebyl upraven.

## Změny a refaktoring

1. Copied `client/game.ts`: pouze původní `prepareLighting` a profiler options. WebGPU zapne čtyři existující Day0/Day1 OFF/ON varianty přes stejný spawn apply. Day instant se získá jednou, isNight/isDay se vyhodnotí jednou při apply. Aktuální actor, rig, kamera/frustum, světelné cap a nejnovější requested restore jsou zachované. Game diff má8přidaných/2nahrazené řádky.
2. Copied `client/light-preparation.ts`: day typ, optional flag a jednou sestavený seznam13etap. Default/WebGL9etap, původní128/4ms batching, visible30s deadline, dvěcomplete readiness draws, pending/strict Effect gate a lifecycle beze změny.
3. Copied `client/webgpu-compilation-profile.ts`: pouze explicitní bounded maxStages hardcap21, default16 a ostatní limity stejné. Game při existujícím lokálním opt-in žádá19:17Game jmen +unassigned +overflow. Žádné nové hooks/cache.
4. Copied `tests/game-light-preparation.test.ts`: původní assertions zachované, opt-in assertion doplněná o19; actual Game metody s původní controlled IO fixture ověřují actual light/torch membership,13/9, nulovou POINT radianci při enabled=true, full camera shape, pending/requested rig replacement, timeout a retired cleanup. Není to GPU readiness/image důkaz.
5. Copied `tests/light-preparation.test.ts`: přesný13stage průchod a dvěcomplete ready draws; denní etapy spotřebují tentýž deadline, ne nový budget.
6. Copied `tests/webgpu-compilation-profile.test.ts`: explicitní/default/clamp/invalid/fractional limity,18named entries bezoverflow při19, dalšílabeloverflow, privacy/release. Starý explicit999 očekává nově schválený hardcap21 místo16; samostatný nový test drží implicitní default16.

Žádné B6 stages/camera, C5 preload/startContent/phased world, UI, postprocess retention, další diagnostické overlaye, default renderer, shader patch nebo dependency změna. Kopie234vstupů má přesně těchto6hashových rozdílů. Plná nativní aplikace a testy budou sestaveny rootem z původního immutable snapshotu +těchto6výstupů.

## Výzkum a startup omezení

`analysis.md` obsahuje doložený mechanismus, alternativy9/11/13/15etap, odmítnutýfar-only, přesné zdroje a náklady. Native firstF poGolden měl82novýchmodulů/57sync a6265ms interval; není důkaz, že tento kandidát odstraní všech82. Native9prep20.1074s, V6stejných9jmen14.2356s a všech15prep21.3658s mají různou historii preloaderu/rendercalls. V6Day4cena4.36–4.67s není predikce native přírůstku.30s se nemění; timeout/regrese znamená odmítnutí kandidáta, ne úlevu readiness. PrvníF CPU, B6, steadyFPS, další avatary/kvality/clear-weather/multiplayer a celá migrace zůstávají otevřené.

Read-only root podklady `native-day13-preflight-comparison.json` a `native-smoke-timeline-audit.json` v QA rootu odlišují Golden předbenchmarkem aFuvnitř; následná6265ms mezera obsahuje síťové callbacky a není celá JS blokace. Tyto podklady nejsou přepsané.

## Ověření

CPU okno výslovně přidělil root po ukončení druhého časovaného proofu; žádné měření GPU souběžně. Přímý Node/tsx, `TSX_DISABLE_CACHE=1`, vlastní source kopie a readonly junction na frozen `define-order-qa-20261018/dependencies/node_modules`. Žádné pnpm/install. Příkazy jsou v receipts.

- `run.mjs red red-01`: stejné nové testy nad3původními runtime soubory, **65PASS/9FAIL**, očekávaný exit1, UTC07:01:56.763–07:02:00.327. Všech9selhání jsou nové stage/limit/opt-in assertions; žádný import/parse error. Původní runtime SHA a stejné testové SHA jsou v receipt; baseline source zůstává uložená.
- `run.mjs targeted green-01`: **74/74PASS**,0skips, exit0, UTC07:02:05.172–07:02:08.623. Stejné testy jakoRED.
- `run.mjs related related-01`: **80/80PASS**,0skips, exit0, UTC07:02:13.850–07:02:20.108. Původní game-render-engine/game-light-lifecycle/game-webgpu-startup/render-startup/webgpu-pipeline-preparation soubory beze změn.
- `run.mjs types types-01`: scoped TypeScript včetně skutečného `client/game.ts` a3testů, **3361souborů/0chyb**, exit0, UTC07:02:27.256–07:02:46.010. Žádný emit.
- Nebyla nutná žádná opravafixture ani opakování neúspěšnéhoGREEN. RED zůstává zachovaný.
- Root oznámil nezávislé read-only review `resume_plan_review` bez blokujících nálezů nad stejnými runtime/test SHA před finálním manifestem.

Runtime freeze: Game `baaf5f55316222a7d4245357d53ef03351cd7d0ebee21a34c23ea5d2e03c6e7d`, scheduler `6bb6cd90be0eb2e1cf5b88b6fd930123ec34349c242e4db3fb8ce767e52eb58c`, profiler `cbeef371271c44f4e55d7c4aafe3a47f3d1cc123caa254c3817a3f5c6d308876`. `manifest.json` uvádí exact6changes, preimages,234source input/output SHA, evidence, runtime/dependency identity a tento handoff. `owned.diff` i samostatné diffy jsou součástí prefixu.

Všechny vlastní Node/test/TS procesy skončily; root informován o uvolnění CPU okna. Po zmrazení manifestu release vlastní rezervace; žádný živý proces/port nepředáván. Integrátor převezme6bytes pouze proti preimages, provede fullbuild/test/integration a nativní13stage GPU kontrolu v izolaci. Stav tasku/Linear/commit mění root, nikoli tento leaf.
