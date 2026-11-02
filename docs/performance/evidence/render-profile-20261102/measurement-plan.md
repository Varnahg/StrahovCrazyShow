# Profilovací protokol · 2. 11. 2026

Baseline: main fdc7b91911e1ef0ca655bddce7b6a8e077c907e2; neměnné build výstupy v `.cache/render-profile-20261102/build/`. Původní localhost8080/index-Cd89_BZ6.js/client3a1a6137… zachován a při počáteční kontrole měl0canvas.

- Primární backend explicitně `webgpu`, kvalitaMedium, target60, CSS1280×720. Skutečné backbuffer/adaptér/driver/Edge verzi přečíst z výsledků; žádný SwiftShader vydávaný za GPU.
- Tři nové page/Game generace i izolované API starty run1/2/3. Globální browser/driver cache se nemaže; cold znamená první použití v dané generaci, nikoli fyzicky prázdnou cache.
- Po vstupu a skutečné ready připojit2 SDKpeers preset1/2, vyčkat na jejich3řádkovou motion readiness a30s ustálení. Stejný nickname/preset hlavního hráče a stejné podmínky při každém startu.
- UI day+summer; přesnýUTC okamžik zexportu (existující summer anchor je15. červenec, denní10:00Z). Pevný explicitně simulovaný QA model20°C/cloud0.15/rain0/wind1from230. Pro nočníscénu změnit pouze světelnýnáhled na night, následně kontrolovat stejný summer stav.
- V každém runu spawn/vegetace/okolí-vstupB6 po3×10sMedium. Vzorky značené runN-spawn-medium-01..03, vegetation-medium-01..03, b6-medium-01..03. Začátky nejméně22s od sebe kvůli3/min collector limitu; neplatné pokusy zachovat jakoinvalid/reason.
- Skutečný průchod stejným úsekem B6/vegetace zopakovat; první nástup/jízdu a nočnísvítilnu označit v časovéose. Nedostupné drženíkláves nebo jinéovládání uvést, nikdy neteleportovat. Low/High doplnit na stejné pevnépozici jako screeningpresety, ne izolovanou kauzalitu jednotlivýchrozpočtů.
- Při každém10sintervalu normálníHUD, zavřenýdetailníreport, fokus/visibility. Mezi clickstart a dokončením nesnímatDOM/screenshot. Poté stáhnoutfullJSON přes UI, ověřitrawframeIntervals/health/compilation/source. Collector4179jejenredukovanýwhitelist; není náhradou.
- Automatický JSONL session log: časUTC=timeOrigin+atMs, previousCPU patří předchozímuintervalu. UIbenchmark obsahuje BenchmarkRenderProfile; náročnější profileEnvironment/CPUtrace je samostatnýdiagnostickýběh, ne stejná FPSserie.
- Systémovýsampler odděleně, interval2s/warmup30s, vlastní režie a PIDidentity. NepřičítatGPUenginy ani sdílenoupaměť napříčprocesy; timestampGPUmainpass není celáGPUpráce.
- Cleanup: PEERS_STOP a peers-cleanup, odchodmainhráče/close vlastníkarty a doposlánídiagnostiky, STOPsampleru a jeho stopped/summary, STOPvlastníhoAPI/preview a cleanup.json. Obnovitviewport a zachovatvšechnyrawpokusy.

Výstup: opakovanýdominantní náklad nebo přesně vymezenámezera v důkazech; jeden další zásah s příčinou, rozsahem, alternativami, dopady a přejímacími kritérii. Bez herních runtime/API změn.
