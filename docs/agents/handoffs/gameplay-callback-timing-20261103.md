# Předání: gameplay-callback-timing-20261103

- Vlastník `smoothness-callback-20261103-author`; příjemce `/root`. Canonical checkout/main, výchozí commit `cdb3b8f774688e2fad3d75487de29a7b767379c8`. Žádné větve ani kopie projektu.
- Problém: `cpuMs` a šest fází končí před recorderem a HUD. Z jejich hodnoty nelze odvodit cenu celého předchozího callbacku ani původ mezery v rAF.
- Hypotéza/změna: existující koncový čas `lastCpuFrameMs` lze následujícímu záznamu předat s přesným počátečním timestampem. Metrika je správné párování a rozlišení původního scope / celého Game callbacku / tail, nikoli vyšší FPS.
- Správnost: žádná změna hry, legacy polí, rendereru či readiness; pouze bounded číselný doplněk. Nezahrnuje práci enginu po callbacku, GPU execution, asynchronní UI nebo presentation. Reset kontextu/viditelnosti musí přerušit párování.
- Volba proti alternativám: přesun recorderu na konec stále neměří jeho vlastní cenu; další renderer hooks by rozšiřovaly scope. Předchozí dokončený údaj využívá existující clock endpoint, jednu opakovaně použitou Game dvojici a primitive snapshoty v recorderu. Žádné uchování mutable Game reference.
- Přijetí: skutečná Game fixture pro recorder/HUD tail, přesné/nesprávné timestampy, lifecycle/visibility, invalidní čas, privacy/server batch roundtrip a bounded windows. Přímé Node cílené testy a scoped TypeScript; žádný build/GPU/trvalý server.
- Stav: implementace a cílené ověření dokončené; root musí převzít společný checkpoint a praktické měření. Autor nic nestagoval ani necommitoval. Cizí dirty soubory nebyly převzaté.

## Výsledek a refaktoring

- Změněny `client/game.ts`, `client/session-diagnostics.ts`, `tests/game-diagnostics.test.ts`, `tests/session-diagnostics.test.ts` a toto předání. `tests/game-diagnostics-projection.test.ts` se nezměnil, ale byl ověřen a zahrnut do manifestu. Žádné sdílené exportní soubory druhého agenta nebyly měněny.
- Game znovu využívá již měřený `lastCpuFrameMs`. Jedinou mutable dvojici `completedDiagnosticCallback` doplní na konci callbacku a předá příštímu `recordFrame` jako `previousCallback`. Reset diagnostického kontextu ji odstraní; disposed/nevykazující Game ji neudržuje. Žádný nový renderer hook nebo timer.
- Recorder páruje jen explicitní `frameStartedAtMs` shodný s předchozím záznamem; raw CPU musí být konečné, nejméně původní měřený scope a skončit nejpozději před aktuálním startem. Chybějící/nesprávný pár je `null`, bez odhadování z engine delta. Raw rozdíl tail se počítá před zaokrouhlením rodičů.
- `frame-hitch.previousFrame.callbackCpuMs/callbackTailMs` jsou doplněné jen při explicitním novém vstupu; legacy snapshot shape zůstává. `frame-window.previousCallbackCpuMs/previousCallbackTailMs` jsou bounded nullable arrays zarovnané s `frameMs` (předchozí interval), jejich průměry počítají jen platně spárované vzorky. Staré `cpuMs/phases` stále popisují aktuální práci do labels; GPU ani nested fáze se nepřičítají.
- Kontext/visibility reset ruší pár. Caller objekt se nezadržuje, do důkazů se kopírují jen číselné hodnoty; následná mutace Game markeru nemění staré snímky. Současné `recorderCpuMs/recorderMaxMs` jsou zachované. Nové souhrny se dopočítají při uzavření okna, ne pomocí dalšího per-frame profilu.
- Testovací výstup session testu nyní podporuje stejný `GAME_DIAGNOSTICS_TEST_CACHE` jako Game fixture, aby ověřování zapisovalo výhradně do rezervované cache. Výchozí chování testu je zachované.

## Ověření

- `node --import tsx --test tests/session-diagnostics.test.ts tests/game-diagnostics.test.ts tests/game-diagnostics-projection.test.ts` s rezervovaným `GAME_DIAGNOSTICS_TEST_CACHE`: **50/50 PASS**, exit0,2231,4ms; `.cache/gameplay-callback-timing-20261103/tests-final.log`.
- První kontrola měla47/48PASS: historická transportní fixture bez dokončeného callbacku s novými null sloupci překročila svůj10k kalibrační limit o9B. Fixture byla doplněna o skutečný nový producer kontrakt (35ms dokončený callback), **limity nebyly zvýšené**. Druhá49/49PASS; poté doplněna regrese odečtení před zaokrouhlením →50/50PASS. Původní `tests-1.log` i `tests-2.log` zůstávají.
- Skutečný transportní stres:15 267 563B,939records,306POST,723hitches, maximum pending65 476B,0drops; souvislé sekvence a každý skutečný JSON body ověřený serverovým validátorem. High-refresh test uchová1025vzorků přes okna≤512, první pár neznámý a dalších1024správných.
- Explicitní TypeScript entrypoints `client/session-diagnostics.ts`, tři testfiles, strict/ES2022/Bundler/noEmit/skipLibCheck a stejné podpůrné flags projektu: **PASS**, exit0, `.cache/gameplay-callback-timing-20261103/types.log`. Game je v testu skutečná produkční metoda transpilovaná s nahrazenými scene/IO dependencies; celý projektový build má provést root nad oběma delegacemi.
- `git diff --check` PASS. SHA-256 všech čtyř změněných zdrojů/testů a nezměněného projection testu je v `.cache/gameplay-callback-timing-20261103/verification.json`.

## Omezení a předání

- Jde o wall čas Game callbacku přes poslední HUD/stats update, nikoli CPU instruction time, caller/engine endFrame, asynchronní React/transport práci nebo GPU/presentation. Zbylá mezera proto stále není sama diagnózou.
- Poslední dokončený callback se vykáže až v následujícím záznamu; pokud následuje ukončení nebo boundary, zůstane jeho párování neznámé. Žádná chybějící hodnota se nepřeznačí na0.
- Neběžel build, fullsuite, GPU ani skutečný síťový server. Pouze in-process HTTP collector fixtures a lehké CPU/type kontroly; všechny procesy skončily, testové dočasné soubory uklizené. Cache obsahuje jen logy/manifest.
- Root přebírá implementaci/refaktoring/ověření společně; stav tasku a commit mění pouze root. Následuje nezávislá kontrola a společný stabilní checkpoint, nikoli tvrzení o vyšším FPS.
