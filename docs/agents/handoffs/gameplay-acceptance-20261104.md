# Předání: přejímka plynulosti hraní · 4. 11. 2026

- Vlastník `gameplay-gate-20261104-impl`, příjemce root. Canonical checkout `C:/Users/rezac/Documents/GitHub/StrahovCrazyShow`, pouze `main`, výchozí commit `cadc09c95213ce7725905cbb7e63e1a8f38045de`. Vlastní task `gameplay-acceptance-20261104`; žádná větev/kopie projektu.
- Soubory: `shared/gameplay-acceptance.ts`, `scripts/gameplay-acceptance.mjs`, `scripts/performance-experiment.mjs`, `tests/gameplay-acceptance.test.ts`, `tests/performance-experiment.test.ts`, toto předání. Žádné změny Game, UI, rendereru, síťového protokolu ani cizího WIP. UI/návod/specifikaci vlastní root v oddělených rezervacích.
- Podklady: aktuální Game/recorder schema, původní `benchmarkResult` a podmínka `measurement-complete`, archiv skutečného hráčského testu c16cb5a6 a read-only kontrola edge cases. Původní monitor validoval konečná čísla a přítomnost výsledků, ne přejímkové meze. Textové `acceptance` zůstává popisem, nový číselný kontrakt je explicitní `gameplayAcceptance`.

## Výsledek a volba

Čistý browser-compatible `assessFrameSample(intervals, partialPolicy)` hodnotí průměr FPS, p95/p99, maximum a četnost dlouhých snímků; status passed je výslovně jen `scope: frame-sample`. Neplatná/chybějící/řídká pole ani příliš krátký vzorek se nevydávají za úspěch. Výchozí cíl60FPS a tolerance min90% cíle, p95≤2 rozpočty, p99≤3, max250ms, nejvýše1% intervalů≥50ms jsou projektová inženýrská politika, konfigurovatelná a neodvozovaná ze změřených pomalých FPS.

Úzký Node adapter čte JSONL/gzip a ukládá jen omezené číselné intervaly a agregáty (524288 frames, 2M records, 32 typů chyb; vstup nejvýše256MiB rozbalených bajtů). Nevzniká nový controller ani další per-frame herní práce. Kontroluje source/session/batch/seq, lifecycle, raw intervaly, síťové čítače a conservative movement estimate. Pohyb se nepočítá přes teleport/resync/epoch/visibility gap; běžné drobné korekce samy nevynulují pohyb. Detailní resync event a kumulativní delta se nesčítají: použit jejich maximum, s výslovným scope. Korekční vzdálenost je maximum filtrovaných detailních eventů, nikoli tvrzení kompletního input replaye.

Celá hratelnost vyžaduje default60s viditelného hraní,20s doloženého pohybu,20m trasy,≤1resync/min a korekci≤1m. Skryté/startup/přechodové intervaly jsou oddělené. Změny kvality se nevyřazují. Samotné stání nebo chybějící síť neprojde.

CLI: `node scripts/gameplay-acceptance.mjs recording.jsonl.gz --source <64hex> [--policy overrides.json] [--output new-result.json]`. Přímý Node24 import čistého `.ts` ověřen, bez nové závislosti. Výstup se nepřepisuje; exit0=passed,2=failed,3=inconclusive. CLI vyžaduje game-dispose pro `observationScope: complete-game-session`; zdravý živý prefix není celá přijatá relace. Jediný rotovaný díl bez ukončení proto neprojde; pro celý offline záznam je potřeba kompletní JSONL stream. Monitor zpracovává stávající rotované díly a má explicitní scope `planned-measurement-window` bez požadavku zničit Game.

Přidáním `gameplayAcceptance: { targetFps:60, minVisibleSeconds:60, minMovementSeconds:20, minTravelMetres:20, maxResyncsPerMinute:1, maxCorrectionMetres:1 }` do stávajícího plánu se aktivuje přejímka. `benchmarkCount` může být0; rozhoduje recorder skutečného pohybu. Nevyhovující data mají `decision: gameplay-failed`. Přijatý scénář zachovává `measurement-complete` pro kompatibilitu CLI wrapperů, ale přidává `gameplayAccepted:true` a detailní assessment. `optimizationAccepted` vždy zůstává false: absolutní přejímka sama nedokazuje A/B zrychlení. Legacy startup plány stále potvrzují jen sběr. Cleanup/identita zůstávají nutnou podmínkou přijetí.

## Skutečný archiv a omezení

Archiv vrací **failed**: 6994 viditelných intervalů,19,216FPS, p9587,4ms, p99178,2ms, max6661,6ms;159resynců, maxkorekce2,678m. Conservative movement29,35s/116,63m. Současně eviduje3 `window-duration` coverage mezery (60/48,8/80,1ms poblíž přepnutí presetů). Souvislé seq tedy není totéž jako úplné frame-time pokrytí. Tyto mezery nikdy nepovolí passed, ale nezakryjí prokazatelná překročení prahů; výsledek má `coverageIssues` a `coverageComplete:false`. Kritická korupce identity/seq/čísel zůstává inconclusive. Žádná dodatečná změna recorderu ani tvrzení příčiny záseků.

## Ověření a převzetí

- `node --import tsx --test tests/gameplay-acceptance.test.ts tests/performance-experiment.test.ts`: **32/32 PASS**,0fail/skip,2664,98ms, exit0. Log `.cache/gameplay-acceptance-20261104/tests-second.log`. Testy zahrnují archiv, raw/identity mezery, reset čítačů, oddělení eventů/snapshotů, hidden/transition, bezpohybový scénář, chybějící dispose, přímý CLI i neúspěšný cleanup.
- `node --check` obou `.mjs` a scoped `git diff --check`: PASS.
- Root nezávisle spustil celoprojektový `tsc --noEmit` PASS a11/11 UI/presentation testů proti tomuto shared modulu; bez relevantní následné TS změny se stejná kontrola neopakovala. Log rootu `.cache/gameplay-frame-cost-20261103/acceptance-typecheck.log`.
- Žádný build, full suite, server ani GPU nebyl tímto podagentem spuštěn. Všechny lehké procesy skončily. Runtime přejímku, review, společný commit, Linear a stav tasku přebírá root; toto předání samo není dokončená gameplay optimalizace.
- Po předání jsou vlastní soubory zmrazené a rezervace se uvolňuje pro integraci. Cizí změny nebyly staged ani commitnuté.

## Opravy dvou review nálezů

Root výslovně předal vlastní soubory zpět; claim byl znovu získán s doloženým adopt-dirty. Opraveny pouze dvě přejímkové díry:

1. **Pokrytí začátku/konce a okolí transition.** Kontroluje se i game-ready→první okno, mezera po vyloučeném okně a poslední okno→ukončení. Skutečné hidden intervaly jsou doložené browser-state událostmi; samotná transition příznakovost neomluví další chybějící čas. Na leading/trailing hranici platí explicitní allowance nejvýše `policy.maxFrameMs` (default250ms) pro jediný rozpracovaný callback/interval; běžná vnitřní návaznost toleruje2ms zaokrouhlení. Při řádném odchodu se respektuje network-left hranice před následným React dispose. Odebrání pěti prvních nebo posledních oken a přečíslování seq i se zbylými65s už neprojde; normální první transition a ukončení200ms po posledním frame startu projdou. Doložené hidden období nevytváří pohyb ani síťové delty přes jeho mezeru.
2. **Čekání bez resync odpovědi.** Nové konfigurovatelné projektové meze `maxAuthorityAgeMs:250` a `maxTimelineWaitsPerMinute:1` hodnotí čerstvost autority a samostatné `network-timeline-wait` eventy. Nerozšiřují protokol ani recorder. Čekání a resync se nesčítají do jedné metriky. Chybějící authority age je coverage issue a nemůže vytvořit PASS; záporná/neplatná hodnota je korupce. Doložená zastaralá autorita, nadlimitní čekání či nepřipravené připojení mají failed. Regrese obsahuje60FPS s nejprve dostatečným pohybem a pak zablokovanou timeline bez jediné resync odpovědi.

Finální kontrola po těchto opravách: **35/35 PASS**,0fail/skip,2592,62ms, exit0; `.cache/gameplay-acceptance-20261104/tests-review-final.log`. `node --check scripts/gameplay-acceptance.mjs` a scoped `git diff --check` PASS. První kontrolní běh opravy měl jeden fixture FAIL kvůli příliš přísnému vylučování pohybu při samotném wait eventu; oprava zachovala skutečnou position/speed evidenci a blokuje pouze teleport/resync/epoch/visibility mezery. Oba původní logy jsou zachované v task cache. Source/test soubory jsou nyní znovu zmrazené, root dostal freeze před doplněním tohoto handoffu. Nezávislé ověření review oprav a nového TS tvaru přebírá root; žádný nový GPU/server/build.
