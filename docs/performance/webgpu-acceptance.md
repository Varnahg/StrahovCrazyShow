# Protokol přijetí WebGPU a obecný evidence reporter

Reporter je samostatný nástroj pro **nové měření**, nikoli nová metodika historické série. `scripts/webgpu-report.mjs`, původní 34run A/B a jejich raw soubory se nemění. Ověřená čísla, obrazy a finální přijetí zapisuje koordinátor do migrační evidence; tento dokument nepředstavuje provedený GPU test.

## Spuštění a význam výsledku

```powershell
node scripts/webgpu-migration-report.mjs cesta/manifest.json cesta/report.json
```

Všechny vstupní cesty se vyhodnocují relativně k adresáři manifestu. Mohou být také absolutní. Výstup se vyhodnocuje vůči cwd. Nástroj neprovádí síťové požadavky, nespouští instrukce ze zpráv a nepřepisuje raw vstupy. Odmítne výstup shodný s manifestem, některou vstupní cestou či jejím symlink cílem; odmítne také přepis existujícího hardlinku. Každý načtený soubor dostane SHA-256, velikost a informaci o stabilitě během čtení. Textová cache je omezena na 32 MiB vstupních bytů. Před uzavřením reportu se znovu kontrolují velikost a mtime; měnící se soubor znamená neověřenou sadu. Není to filesystem lock ani náhrada archivované kopie.

Exit `0` znamená pouze úspěšné vytvoření reportu, také pokud obsahuje selhané běhy. Exit `2` znamená nečitelný/chybný manifest nebo neproveditelný zápis výstupu. Rozhodující jsou `runs[].status`, `runs[].targets` a `comparisons[].claimAvailable`. Pole `migrationApproval` vždy ponechává schválení oddělené funkční, obrazové, GPU a integrační přejímce.

## Manifest v1

Manifest je JSON objekt s těmito poli:

| Pole            | Kontrakt                                                                              |
| --------------- | ------------------------------------------------------------------------------------- |
| `schemaVersion` | Přesně `1`.                                                                           |
| `id`            | Jedinečné jméno zachované série.                                                      |
| `policy`        | Volitelné explicitní toleranční a opakovací podmínky níže.                            |
| `targets`       | Volitelné schválené výkonové cíle, oddělené od relativního srovnání.                  |
| `runs`          | Všechny pokusy včetně startup failure, neúspěšných a neověřených běhů.                |
| `expectedPairs` | Předem určené páry `{id,scenario,baseline,candidate}`; poslední dvě pole jsou run ID. |

`runs[]` obsahuje:

| Pole               | Kontrakt                                                                                                                                                                                          |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`, `scenario`   | Neprázdné řetězce; run ID musí být jedinečné. Scenario odděluje první interakci, warm stav, pohyb, populaci a kvalitu.                                                                            |
| `backend`          | `webgl2`, `webgpu` (CM) nebo `webgpu-fast` (NCM). Ověří se skutečný backend i compatibilityMode v benchmarku.                                                                                     |
| `sourceSnapshotId` | SHA-256 úplného source/assets checkpointu. Musí souhlasit s benchmarkem a JSONL `source.buildSnapshotId`.                                                                                         |
| `order`            | Pozorované pořadí běhu jako nezáporné celé číslo. Pořadí neurčuje jméno souboru.                                                                                                                  |
| `benchmark`        | Cesta k původnímu Game benchmark JSON, nebo `null` při selhání před výsledkem. Také lze `{path,sha256}`.                                                                                          |
| `sessionId`        | Přesná diagnostická session, která obsahuje tento pokus.                                                                                                                                          |
| `startup`          | `{status,durationMs,message?}`. Status `ready`, `failed`, `timeout`, `unsupported` nebo `cancelled`; vše kromě `ready` zneplatní běh. Doba je skutečně pozorovaná, nikoli součet dílčích profilů. |
| `conditions`       | Parametry prostředí a postupu níže; nepřevádět neznámé údaje na nuly.                                                                                                                             |
| `evidence`         | Konzole a původní JSONL se session/sequence hranicemi níže.                                                                                                                                       |

`conditions` obsahuje neprázdné `gpuId`, `browserId`, `fixtureId`, `routeId`, `cacheState`; dále `visible:true`, `hud:true`, `other3DScenes:0`, `frameCapHz` (kladné číslo nebo výslovně `null` pro neznámý strop) a `thermal:{startC,endC,minClockMHz,maxClockMHz}`. GPU identifikátor musí mít doložený původ; z maskovaného `nvidia/pascal` se nevymýšlí přesný model. `fixtureId` označuje neměnnou sadu času/počasí/avatarů/scény; `routeId` stejný postup a vstupy. `cacheState` musí popsat skutečný protokol, například nová Game při zachované browser/driver cache. První F v nové Game se neoznačuje jako vyčištěná driver cache.

`evidence.console` je `{path,format,complete,sha256?}`. `format` je `text` nebo `json`. JSON obsahuje pole zpráv, nebo `{entries:[...]}`. Každá zpráva je řetězec nebo objekt s `message`/`text`/`description` a případně `level`/`type`. Level `error`, `fatal`, `assert` a konkrétní shader/device/rejection chybové texty jsou zachované jako chyby. `truncated:true`, `hasMore:true` nebo `dropped>0` v obálce znamenají neúplný export. `complete:true` musí odpovídat zachycení od začátku příslušného startup pokusu po konec měření a jeho diagnostické vyprázdnění; prázdná konzole sama úplnost nedokazuje.

`evidence.diagnostics` je `{paths,fromSeq,toSeq,benchmarkStartSeq,complete}`. `paths` je pole cest nebo `{path,sha256}` ke **všem** potřebným JSONL částem. Rozsah musí obsahovat aktuální `mode-change`, `renderer-ready`, dokončené `lighting-preparation`, `game-ready`, konkrétní `benchmark-start` a celý konec měření. `benchmarkStartSeq` odkazuje na přesný počáteční záznam. Reporter zpracuje `type:"batch"` s `sessionId`, `source.buildSnapshotId` a `records:[{seq,atMs,kind,data}]`; jiné sessions se nepletou do výsledku. Shodné retransmise jsou deduplikované, konfliktní kopie jsou zachované a zneplatní důkaz. Mezery, `recording-gap`, chybné JSONL řádky, neúplný konec nebo chybějící identity jsou neověřené.

`benchmark-start.data` musí obsahovat `rendererId`, `avatars`, `position:{x,y,z}`, `yaw`, `pitch`, `camera:{position:{x,y,z},fov,minZ,maxZ}`, `quality`, `viewport` a `renderResolution`. Počáteční renderer musí odpovídat health snapshotu; počáteční počet, měřené minimum a konečný součet LOD musí souhlasit. Toto samo neprokazuje nepřítomnost krátkého zvýšení populace mezi vzorky: držet pevnou doloženou kohortu skutečných SDK relací a zahrnout její definici do fixtures.

Starší native-v1 bez počátečního `avatars` zůstává použitelný pro diagnostiku, ale nedostane výkonové tvrzení. **Jeho frozen soubory se kvůli novému kontraktu nedopisují.**

## Policy a targets

Výchozí policy:

| Pole                       | Výchozí hodnota                         |
| -------------------------- | --------------------------------------- |
| `minimumDurationSeconds`   | `10`                                    |
| `requiredRepeats`          | `3`, minimum jsou vždy tři              |
| `durationToleranceSeconds` | `0.5`, musí být menší než minimum délky |
| `maxTemperatureDeltaC`     | `3`                                     |
| `maxClockDeltaPercent`     | `5`                                     |
| `positionToleranceMetres`  | `0`                                     |
| `angleToleranceRadians`    | `0`                                     |
| `fovToleranceRadians`      | `0`                                     |

Prostorové tolerance nastavit explicitně před měřením, ne až podle nevyhovujících výsledků. Yaw se porovnává modulo plný obrat, pitch přímo. Projekční a view matice se nepoměřují bajtově napříč API; kontrolují se skutečné world/camera pozice, yaw/pitch, FOV a clip distances. Počáteční i koncový stav musí ladit, route ID není náhradou za skutečnou polohu po záseku.

Teplotní mez se vztahuje na celou obálku start/end teplot všech opakování. Taktová mez je `100 × (maximum − minimum) / ((maximum + minimum) / 2)` přes zaznamenané rozsahy celé série. Throttling není důvod zahodit pomalý raw běh; znemožní připsat rozdíl samotnému backendu.

Targets mají volitelná pole `minimumFps`, `maximumP95Ms`, `maximumP99Ms`, `maximumFrameMsExclusive`, `maximumStartupMs` a `maximumStalls:{"50":n,"100":n,"250":n,"1000":n}`. Prahy nejsou odvozené z naměřených dat. Pro KEY-22 byly zadány cíle p95 ≤20 ms, p99 ≤33,3 ms a žádný migrační interakční interval ≥100 ms; přiblížení k60 FPS je třeba interpretovat vůči prezentaci. Reporter nevymýšlí číselnou definici „přiblížit se“ ani nový startup limit. Cíl lze nesplnit a přitom mít **platný pomalý běh**, který musí zůstat ve srovnání.

## Přijetí důkazů a výpočty

- `valid`: všechny požadované důkazy pro interval a jeho podmínky jsou přítomné bez zjištěné chyby. Neznamená to správný obraz ani schválenou migraci.
- `invalid`: doložená chyba, neúspěšný startup, neplatný health/generation, asset/render chyby, runtime GLSL konverze nativního kandidáta, porušená konzistence nebo neodpovídající renderer. Raw metriky zůstávají diagnosticky dostupné, když lze jejich intervaly vypočítat.
- `unverified`: chybějící, neúplné nebo měnící se důkazy. Není to úspěch ani automaticky prokázaná chyba rendereru.

Health se kontroluje nezávisle od souhrnného boolean: start/end purpose/game, rendererId, generation, phase, validity, error/pending a kanálové čítače. Výslovné console/JSONL chyby nejsou přebité nulovým HUD/benchmark počtem. Zprávy `unhandled-rejection`, `console-error`, `js-error`, `render-fault`, startup failure a neúspěšná příprava se uchovají. `webgpu-work` se zachová jako profil pomalé práce a **sám není chyba**. Chybné načtení modelu/textury/shaderu/WASM se neignoruje.

`rawFailures` zachovává důkazy z každého zdroje; stejná událost může být v konzoli i JSONL. Délka tohoto pole proto není počet jedinečných vad ani počet chybných snímků.

Compilation profil musí na obou hranicích pozorovat interval s platnými generačními/monotónními čítači. U WebGPU se vyžadují příslušné installed hooks, žádné pending/failures/observer errors a pozorovaný submit. Nulové GLSL/Tint/compilerLoad počty platí jen pro pozorovaný život profileru. `attachedAfterDeviceCreation:true` samo nevyřadí validní FPS interval; výstup výslovně uvádí `startupPhaseCoverage:"partial-engine-init-excluded"`. **Nelze z toho tvrdit úplné rozložení startup kompilace.** Celkový wall startup se počítá samostatně z aktuálního `mode-change → game-ready`, s renderer-ready identitou a úplnými error-scoped logy.

FPS je `počet / součet frameIntervalsMs × 1000`; percentil používá nearest rank `ceil(n×p)−1`. Reporter nepřebírá deklarované FPS/p95/p99. Uvádí maximum a počty intervalů **≥**50/100/250/1000 ms. Raw a wall délka se kontrolují s policy tolerancí. Nefinitní, nulové či záporné intervaly se nevyhlazují ani nezahazují.

Páry musí být ze stejného source/assets snapshotu, GPU/browser, quality, CSS/internal resolution, počasí/UTC, kohorty, route/cache protokolu a srovnatelných tepelných podmínek. Potřebují nejméně tři kompletní proložené páry a obě pořadí AB/BA; například pořadí run ID `a1,b1,b2,a2,a3,b3`, páry `(a1,b1),(a2,b2),(a3,b3)`. Toto je **schéma pořadí, nikoli naměřená série**. Pořadí musí potvrdit skutečné benchmark completion timestamps. Identické raw benchmark bytes nelze pod různými názvy počítat jako další opakování. Chybějící očekávaný běh, opakované použití stejného runu nebo nevyhovující pár zablokuje tvrzení celé skupiny.

Report zachová jednotlivá opakování a shrnuje jejich median/min/max. FPS/p95/p99/max mají i párovou procentní změnu; startup a stalls také absolutní párové rozdíly. Percentily se neslévají ani neprůměrují jako nový percentil. NCM/CM, první interakce a warm scénář se nemíchají pod jeden scénář. Capped FPS neprokazuje neomezený GPU throughput. Main-pass GPU čas, celý GPU frame, CPU API calls a asynchronní completion latence jsou různé veličiny; reporter je nesčítá ani nezaměňuje. Lifetime maxima, statické shared cache čítače a poslední frame bundle counters nevydává za intervalovou distribuci.

## Co nástroj nemůže potvrdit

Manifest a completeness flags jsou odpovědnost sběru. Reporter neumí objevit zamlčené pokusy mimo manifest, autentizovat ručně podvržené čítače, dokazovat vyčištění driver cache ani ověřit obraz z textového logu. Zachovat původní exporty a všechny startup failures, jejich source/asset identitu, konzoli a JSONL. Pro skutečné přijetí dál platí funkční matice všech avatarů, B6, aut, světel, kvality, editoru/recovery a integrační kontroly z KEY-22/KEY-34. Hraný native-v3 na4192/API2587, jeho závislosti a původní4188 se během této práce nemění.

Syntetické příklady kompletního manifestu a adversariálních variant jsou pouze v `tests/webgpu-migration-report.test.ts`; nejsou to výkonové důkazy hry.
