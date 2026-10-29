# Průběžné předání: repair-production-validation

Vlastník i příjemce vlastního rozsahu: `repairs-01a13624-validation`, main `91ee88f`. Rozšíření rezervace pro další immutable wave2 není převzetí cizích změn.

Baseline snapshot `f2705e4a74273d443dc2bb79f9be5ffd83efe7f54f54ef150b790c8978831410` má 8373 souborů včetně testů a dat. Produkční reference ve skutečném browseru: GTX1060/ANGLE D3D11, 1 reálná relace a HUD, medium, CSS i render 2040×986, noční preview 14.10.2026 00:00 Praha, 33,5 FPS, p95 48,2ms, p99 63,7ms. Předchozí vzorky 1280×720 jsou pilotní; shader/driver cache se neresetovala. Souhrn je `.cache/playtest-repairs-validation/baseline-medium-2040.json`; úplný session JSONL zachovaný, ale úplný benchmark modelReview export stažen nebyl.

Wave1 `300f47b09afbba1b6af71d56af69cc4b1c1c5a9c3d6be36b935a99b68a284a3b`: 8389 souborů (492 zdrojových/konfiguračních/testových), immutable assets z baseline. `pnpm test` 786/786 PASS, `pnpm build` PASS; `pnpm test:integration` FAIL na `D turns the real front wheels right`. Původní logy wave1-test.log, wave1-build.log, wave1-integration.log zachované, žádný výsledek se nenahrazuje opakovaným během.

Vlastní baseline API PID28968 a preview PID26708 byly zastaveny s ověřením start UTC a volných portů2571/4176; browser benchmark karta zavřená, viewport reset. Metadata příkazů/cwd/PID/start jsou v baseline-runtime.json. Do původních dev5173/2567 ani cizí building preview rezervace se nezasahovalo. Vlastní wave1 test/build/integration procesy skončily. Při administrativním rozšíření této rezervace žádný vlastní pomocný proces neběží.

Další krok: nový V11 checkpoint, test/build/integrace a praktický browser/GPU. Celkový cíl ani výkon zatím nejsou přijaté.

## Wave2 13.10.2026 22:00 Praha

Snapshot c3c8164a48f1ac9e02fbf57c4d46c6b67fdfd5ed9c71e817d76d125efdb1a3de, 8392 souborů (495 source/config/test). Celé pnpm test **808/808 PASS**, 148814ms; pnpm build **PASS**. Logy wave2-native-* a stage exit kódy wave2-native-pipeline.jsonl jsou v .cache/playtest-repairs-validation/.

pnpm test:integration **FAIL** na exit and park car. Předtím prošel SDK respawn i původní A/D/forward/reverse manévry ve stejných prazích, včetně dříve selhávajícího D-wheel. Následující network/backlog scripty kvůli fail-fast neběžely. Nový fail zachovaný. Prověřuje se holdUntil s počátečně true check, který vůbec nevyrobí nový brake příkaz a nechá settle odsimulovat budoucí throttle. SDK agent implementuje ack/epoch bariéru, regresi a failure evidence; není to zatím potvrzený konečný výsledek.

## Testovací update wave3 — 13.10.2026 23:55 Praha

Na přímé zadání uživatele předáváme další hratelný lokální update na **http://127.0.0.1:4176/**, API2571. Jde o hotový build immutable snapshotu `0f20b5a7c7ba9ce5ab9aa16bba3b0a6886823152a322be2724fd2cdad41d6248` v `.cache/playtest-repairs-validation/snapshots/wave3/`; 8406 souborů včetně 509 source/config/test a 7897 referencovaných neměnných assetů. Není to veřejné nasazení ani nový Git commit. Původní dev5173/API2567 se nemění.

Celý checkpoint: **874/874 pnpm test PASS, pnpm build PASS, všechny čtyři části pnpm test:integration PASS**. Skutečné exit kódy, časy a logy jsou ve `wave3-pipeline.jsonl`, `wave3-test.log`, `wave3-build.log`, `wave3-test-integration.log`. Předchozí neúspěšné běhy zůstávají zachované. V11 SDK oprava čeká na zpracování nového příkazu v aktuální epoše, nemění fyziku ani prahy manévrů.

Produkční měření GTX1060/ANGLE D3D11, CSS i render2040×986, 4×MSAA, medium, noční preview14.10.00:00 Praha, jeden reálný multiplayerový avatar/HUD: **36FPS, p9540.4ms, p9956.1ms**. Úplný stažený benchmark `wave3-medium-night-full.json`; není to důkaz 60FPS ani řízené A/B (živé počasí/cache). Material light cap4 prakticky potvrzen. Provedena svítilna on/off, výměna Mia/Alex, opětovné otevření editoru a low/medium/high. Auto60, jízda a více avatarů v tomto browser checkpointu znovu ověřené nejsou; skutečné SDK řízení prošlo integrací.

Automatický herní log371d306e…: oba rotované soubory zachované ve `wave3-session/`, report `wave3-report.json`, stručný `wave3-release-log-summary.json`. Doručeno3195 po sobě jdoucích událostí (seq0–3194),452 dávek,20839 foreground snímků, **0 mezer a0 recording-gap**. Karta během testu zanikla; **session-end chybí**, proto se netvrdí úplné doručení konce. Smíšený celý průběh36.15FPS/p9547.2/p9968.6ms není benchmark stabilní kvality. Stále nastal první flashlight hitch1149.4ms (mainDraw1047.6ms), další nejhorší453.7ms;0 zachycených JS chyb,0 tvrdých síťových korekcí,5 resynců v převážně stojícím testu. To není důkaz opraveného hraní v pohybu.

Živé procesy zůstávají **u dosavadního vlastníka** `repairs-01a13624-validation` pod stejnou rezervací: API PID13744/startUTC2026-10-13T21:35:17.1280764Z, preview PID18428/startUTC2026-10-13T21:35:17.1445399Z, příkazy/cwd v `wave3-runtime.json`. Identita obou ověřena před předáním. Porty ani GPU/heavy-validation se během uživatelského testu nepředávají jinému agentovi; nepouštět souběžné benchmarky/buildy/3D scény. Rezervace není uvolněná. Pokus o pomocný automatický heartbeat byl nástrojem odmítnut, proces se nespustil; obnovování zůstává ruční přes registrační CLI. Soubor `release-heartbeat.mjs` je pouze nespouštěný pomocný návrh.

Další vlastní zápisy se nesmějí dotknout zmrazených runtime/build/assets, ze kterých nyní uživatel testuje. Nové logy automaticky přibývají v `snapshots/wave3/.cache/game-diagnostics/`; uživatel nemusí zapínat měření ani exportovat. Celkový cíl oprav zůstává otevřený.

Read-only release audit dalšího agenta: všech8406 souborů má SHA shodu mezi checkoutem a snapshotem, manifest ID sedí; obsluhované HTML/hlavní JS/runtime JS/CSS byte parity, health200, automatický session/status enabled:true a odpovídající buildSnapshotId. Žádný source drift. Menu smoke9ed39fc4… po obyčejném pagehide doručil35 souvislých událostí včetně pagehide a session-end. Finální uživatelská karta8 je otevřená v menu na4176 a označená deliverable; QA karta7 je zavřená, viewport override resetovaný. Stará uživatelská karta3 na5173 zachována.

14.10 odpoledne při obnovení práce: ověřené původní PID13744/18428 již chybí a4176/2571 neposlouchají; žádný vlastní validační helper neběží. Původní dev PID také chybí, ale jeho cizí stale rezervace zůstala zachována. Všechny předchozí snapshoty/logy zůstávají beze změny. Tento validační vlastník uvolňuje rezervaci až po tomto ověření; navazující ověření B6 proběhne pod samostatným validate-b6-transform-20261014 v izolované worktree. Žádná GPU přejímka dnešní nové opravy zatím provedena nebyla.

První PowerShell5.1 wrapper chybně změnil běžný pnpm stderr na terminating NativeCommandError a nezachoval úplný child výsledek. Z něj se netvrdí PASS/FAIL testů; wave2-wrapper-failure.txt i původní log zachované. Následný Node orchestrátor zachoval skutečné stdout/stderr a exit kódy nad stejnými zdroji. Všechny vlastní validační procesy nyní skončily, žádný nový browser/server nespouštěn.
