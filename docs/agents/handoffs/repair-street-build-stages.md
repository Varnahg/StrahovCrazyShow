# Předání: repair-street-build-stages

Vlastník `repairs-01a13624-streets`, příjemce `/root` / `repairs-01a13624-root`. Checkout `C:/Users/rezac/Documents/GitHub/StrahovCrazyShow`, main, výchozí HEAD `91ee88f0aaa902c79fad589aeb84bc086a66c9ea`. Vlastní předchozí změny `world-renderer.ts` a `world-renderer-startup.test.ts` byly výslovně převzaty přes adopt-dirty z `repair-world-build-stages`; streets a jeho test byly při claim čisté.

## Prokázaná příčina a zvolená hranice

Předchozí světový phase smoke měřil `buildStreets`2983ms jako jedinou atomickou operaci. Read-only dílčí profil před změnami ukázal, že nestačí dávkovat jen po materiálech nebo polygonech: asfaltový polygon1 má1865 bodů,1979 vstupních trojúhelníků a84 540 výstupních terénních trojúhelníků. Earcut trval v tomto CPU probe9,01ms, `drapeTriangles`979,88ms. Jde o kontrolovaný Node CPU průzkum, nikoli produkční/GPU důkaz.

Primární `shared/terrain.ts::drapeTriangles` zpracovává vstupní trojúhelníky nezávisle a nededuplikuje jejich vrcholy. Lze tedy z klientského calleru zpracovat8 vstupních trojúhelníků najednou a připojit jejich původní data v původním pořadí s index offsetem. Shared terrain, původní triangulace, clipping, výšky, normály ani UV se v tomto tasku nemění.

Před implementací byly z původních funkcí zachyceny SHA256 všech position/normal/UV/index bufferů pro4 povrchy, transition seznamu/dat, finálních meshů včetně static submesh ranges a lamp/provenance. Tyto reference jsou v novém `tests/street-build-stages.test.ts`, takže porovnání není pouze mezi dvěma callery nového kódu.

## Změna API a implementace

- `streetBuildSteps(context)` je generator `WorldBuildStep` s původním výsledkem `{meshes,lamps,crossings,transitions}`. Původní synchronní `buildStreets(context)` spotřebuje tentýž stream přes `runWorldBuildStagesSync`.
- `worldBuildSteps` místo jediné obří `buildStreets` operace používá `yield* streetBuildSteps(context)`. Root Game/start API zůstává `createWorldBuildJob` a samo zajišťuje yielding/abort/scene ownership.
- `streetVertexData` a `streetTransitionVertexData` také zachovávají sync API a mají společný stream s jejich staged verzí. Povrchy se drapují uvnitř velkých polygonů po8 input trojúhelnících; trojúhelníky/pořadí/unused vertices po filtrech zůstávají přesně zachované.
- Společný `appendStreetData` sjednocuje append, centroid/building mask filtr a index offset. Odstraňuje dočasné slice/map/reduce alokace na každý výstupní trojúhelník; nemění toleranci GIS/map footprint trimu ani containment fallback.
- Po prvním řízeném A/B přibyl cílený refaktoring: reused24-index scratch pro drape batch, reused candidate-mask pole, konzervativní mask broad phase z bbox skutečných výstupních vrcholů během jejich kopírování a explicitní mask loop místo nové `.some` closure pro každý triangle. Broad phase zahrnuje pouze ochranu zaokrouhlení centroidu `4 × Number.EPSILON × max(abs(coordinate),1)`; přesný centroid/bbox/mask test se nemění. Výsledné buffery zůstaly bitově stejné.
- Hranice materiálových přechodů se konstruují po indexovaných polygonech, kandidátních edges a filtrovaných segmentech. Cache přechodů se publikuje až po dokončení, takže cancel neuloží prefix.
- Lampy jsou samostatné kroky po skutečném lamp.id, stejně tak stripes; existující merge skupiny, materials, source metadata a přesné96m static submesh chunkování zůstávají beze změny. Upload/material a static chunk operace jsou samostatně pojmenované, aby šlo vidět jejich zbylé náklady.
- Phase události jsou agregované po materiálové skupině a dalších souvislých fázích; negeneruje se diagnostická zpráva za každý trojúhelník. Operation uvnitř fáze obsahuje triangulate/drape/upload/chunks a source index, takže maxOperation prozradí zbývající atomický náklad.
- Scene a partial mesh/material/light objekty vlastní host stejně jako u předchozího world jobu. Tato vrstva nevytváří další timery/RAF/controller ownership; cancellation zavírá generator a host následně dispose Game/Scene.

## Ověření

`pnpm exec tsx --test tests/street-build-stages.test.ts`: **3/3 PASS**, exit0,24,97s proces. Prokázaná bitová shoda proti pre-edit referenci všech4 povrchů a transition geometrie; abort u rozpracované transition konstrukce bez partial cache nebo pozdních mutací; sync i staged kompletní ulice mají stejné mesh/chunk/lamp/provenance hashes,9 výsledných meshů,38 lamp,6 crossing záznamů a819 materiálových přechodů.

Ve staged části tohoto **NullEngine CPU smoke** měly největší operace asfalt44ms (`exact-static-chunks`), paving54ms (8-triangle `drape:54:24`), sett17ms,gravel14ms, lamp7ms, lamp merge13ms. Jsou výrazně menší než celý streets call, ale **4ms není garantovaná horní mez** a tato čísla nejsou produkční výkonové přijetí. Jednotlivé CPU součty mezi dřívějším cold probe a tímto během nejsou srovnatelný A/B.

Koordinátor provedl dva samostatné kontrolované CPU A/B běhy původního immutable baseline `streetVertexData` a aktuálního factory nad totožnými vstupy, pod svou rezervací heavy-validation. Během nich byly zastavené geometry editace i další testování. První výsledek zůstal zachovaný a vedl k výše uvedenému refaktoringu.

| Řízený Node geometry A/B | Original median | Current median | Změna |
|---|---:|---:|---:|
| `street-cpu-ab.json`, před mask/scratch refaktorem |2740,87ms|2908,49ms|+6,1%|
| `street-cpu-ab-v2.json`, finální implementace |3300,23ms|2739,75ms|**−17,0%**|

Každý běh: jeden warmup každého factory, čtyři měřené průchody každého factory v pořadí original/current/current/original/original/current/current/original, GC před průchodem, stejné vstupní objects, stejné output hash/počty a ověřené source hashes před/po. V2 má original3152–3378ms, current2716–2868ms; každý current průchod byl pod každým original v této sérii. **Porovnávat varianty uvnitř daného A/B, nikoli absolutní čísla mezi V1 a V2.** Jde výhradně o Node CPU tvorbu geometrie; nevypovídá o FPS, GPU nebo celé produkční době startu. Oba root procesy skončily exit0, stderr prázdný, `unchanged:true`, `equalWarmupBuffers:true`.

- V1 evidence `.cache/playtest-repairs-validation/street-cpu-ab.json`, SHA256 `9C2C1157320300C6BAE32BC3386D3979A937EBB5FA743E44EADF27871748E728`.
- V2 evidence `.cache/playtest-repairs-validation/street-cpu-ab-v2.json`, SHA256 `837561E903EFD8165C55D74148433A694E455F42B521D7D9C7436603EA480636`. Měřený current streets source hash je shodný s finálním souborem v tabulce níže.
- Finální `pnpm exec tsx --test tests/street-build-stages.test.ts tests/streets.test.ts tests/surface-transitions.test.ts`: **13/13 PASS**, exit0,29,3s proces. Obsahuje původní166059 pavement triangles, holes/upward normals/building footprint cutouts,432 junction samples, PID sample alignment, mapped/photo lamp collisions a flush joint terrain/precision/provenance regrese.
- Finální `pnpm exec tsx --test tests/world-build-stages.test.ts tests/world-renderer-startup.test.ts`: **11/11 PASS**, exit0,52,4s proces. Skutečná sync/staged whole-world parity s vnořenými street kroky a world cancel/error/ownership scénáře, včetně zachování foreign objectů a zrušení scheduleru bez pozdního zápisu. Případ parity27,0s, cancel9,43s, error9,61s; tyto časy nejsou produkční performance assertion.
- Úzký `pnpm exec tsc --noEmit --pretty false --target ES2022 --module ESNext --moduleResolution Bundler --strict --skipLibCheck --esModuleInterop --resolveJsonModule --allowImportingTsExtensions --experimentalDecorators --useDefineForClassFields false --types node,vite/client client/streets-renderer.ts client/world-renderer.ts tests/street-build-stages.test.ts tests/world-renderer-startup.test.ts`: **PASS**, exit0. `git diff --check` nad těmito cestami PASS.

V posledním whole-world smoke byly největší street atomiky91ms (asphalt exact-static-chunks),35ms(paving drape),25ms(sett drape),15ms(gravel drape). Zmizela jediná několikasekundová street operace; **pořád není garantována4ms hranice**, zejména kvůli nezměněnému static chunk helperu a jednotlivým drape dávkám. Architecture/landcover/terrain byly explicitně ponechány pro další rozhodnutí podle wave3 browser evidence, nikoli mimo scope přepsány.

## Zbývající přejímka

- Reálný browser/production startup/root phase log a vizuální/kolizní přejímka; pouze koordinátor s GPU rezervací. Žádný FPS/slib celé opravy KEY-8 zatím není.
- Pokud se ukáže, že jednotlivý vstupní trojúhelník nebo static chunk stále dominuje, další změna shared terrain/static-submesh factory potřebuje samostatnou rezervaci. Tyto soubory nebyly změněny.

## Snapshot a ukončení

| Soubor | SHA256 |
|---|---|
| client/streets-renderer.ts | E67E3266D54948C96C7909904D6678500F9BC20813E2C01D974AA26B2F5542CC |
| client/world-renderer.ts | 008949B703584DBC4D25FC443C3B395D876AD702CCA4DAE6C744F1A6F632B68D |
| tests/street-build-stages.test.ts | B18924755F64DBF0F71C8ACAD38826C902E597F153F412EF2D1B6AFF08E1BE0E |
| tests/world-renderer-startup.test.ts | 7B0881C54BCCBA4362D0B0243231F0A4D7C9B3E53CB280B3CD9AA5330654126A |

Přesné změny jsou tyto čtyři cesty a toto předání. `tests/streets.test.ts`, shared terrain/streets, source datasets, assety, Game/UI, world scheduler helper, package/lockfile nebyly tímto taskem změněny. Žádný nový helper mimo scope nevznikl. Testy jsou součástí snapshotu.

Všechny vlastní cílené testy a tsc skončily. A/B procesy i evidence vlastní root pod heavy-validation; žádný vlastní server/port/GPU/Blender/build/fulltest spuštěn nebyl. Rezervace po předání uvolněna `release`. Root přijímá integrovatelný výsledek, provede wave3 browser/fullcheckpoint přejímku a aktualizuje stav tasku a `docs/verification.md`; toto předání neoznačuje celý cíl za hotový.
