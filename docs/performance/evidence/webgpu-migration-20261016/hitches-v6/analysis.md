# B6 variant proof — 18. 10. 2026

## Výsledek a hranice

Pro dva konkrétní noční starty a uložené počasí je chybějící denní kombinace prokázaná: všechny současné startup etapy mají directional key vypnutý, denní B6 jej zapíná. Osm skutečných regular-instance částí dvou malých B6 GLB je na spawn odpojených, neaktivních a bez main Effectu pro camera pass. V denním vstupním pohledu jsou skutečně vykreslené s `INSTANCES` defines a cap4. Jde o CPU/GLSL důkaz missing coverage, nikoli GPU přejímku nebo velikost příspěvku k80 novým WGSL modulům/59 pipeline.

Po restore a návratu do téže denní B6 ON prezentace se všech10 sledovaných render users vrátí ke stejným5 unikátním main Effectům. U PBR listí s TreeWind/Fresh wrapperem se ale připravený torch depth Effect během OFF renderu zruší; další ON má nový Effect/token při stejných defines. Coverage může zachovat hlavní/instancované varianty, ale sama tento wrapped-depth churn neřeší. Z toho se netvrdí, že zanikají všechny běžné B6 shadow efekty bez wrapperu; jejich individuální cache reuse nebylo samostatně klasifikované.

## Skutečné vstupy a provedení

- Byte-identické runtime zdroje z ověřeného native snapshotu `d7490c5356406aa7c1e1020619fd90e2d3a4a8ec02115194d491e94fa0599047` (startup unit8d20cecc, main232cff). Pinned Babylon9.30/read-only dependencies-v5 včetně projektových patchů.
- Přesné Game metody `prepareLighting`, `isMeshReadyForCamera`, `updateWorldPresentation`, `updateRenderEnvironment`, `updateCameraFollow`, `updateAvatarPresentation` jsou načtené z AST, nikoli přepsané. Běží původní `prepareLightVariants`, sampler, SkyWeather.update/placeDisc, applyArtLighting, Cinematic.update/shadow response, PlayerFlashlight/VehicleLighting, GltfLightBudget a StableLightState.
- B6 používá původní loadProps/update/getter/dispose a původní konstruktorový light setup. Pouze velká stavební geometrie se nekonstruuje a asset/placement vstup je omezen na dvě původní položky `reception-counter` a `noticeboard`. GLB nejsou náhradní boxy: skutečné soubory44 528B a49 188B jsou načtené skutečným loaderem. Původní merge/instance algoritmus z nich vytvoří8 částí se skutečnými materiály a placements.
- GltfLightBudget se instaluje před loaderem stejně jako v Game. Finální cap je u všech sledovaných materiálů4, aktivní glTF loads0. Hardware-instancing capability je výslovně zapnutá jen pro CPU frontend NullEngine; skutečné material defines obsahují `INSTANCES`. GPU neexistuje.
- Dva captureNow jsou `2026-10-17T21:59:00Z` a `2026-10-17T22:04:36Z`. Původní Prague dateKey zvolí night anchor17.10.22:00Z, respektive18.10.22:00Z. Oba runy porovnají B6 day17.10.10:00Z i18.10.10:00Z.
- Weather a referenční view jsou z uloženého `async-v2-first-f-benchmark.json`: cloud0.96, medium, viewport1512×642, actor x−4.903794/y2.620092/z−77.051910, skutečná zaznamenaná camera.position/viewMatrix. Samplerové výpočty se nespekulují z kalendáře; v proofu se skutečně vyhodnotily.

## Light a shader matice

`S` je skutečný SPOT svítilny (STANDARD falloff, priority10), `P` běžný STANDARD POINT bez shadow generatoru, `D` Directional, `H` Hemisphere. Řádky představují skutečné pořadí po StableLightState; n se skutečně omezí capem, není odhadnuté jen ze jména etapy.

| Stav | Ordered layout | Celestial key / stíny |
|---|---|---|
| current OFF v obou nočních startech | P,P,H | intensity0 / none |
| current ON | S,P,P,H | intensity0 / none |
| night0 OFF/ON | H / S,H | intensity0 / none |
| night1 OFF/ON | P,H / S,P,H | intensity0 / none |
| night2 OFF/ON | P,P,H / S,P,P,H | intensity0 / none |
| day B6 OFF | P,D,H | intensity0.0223745 dne17.10;0.0222967 dne18.10 / none |
| day B6 ON | S,P,D,H | stejný aktivní directional / none |

Rezidentní Standard i PBR main defines se v B6 day OFF/ON neshodují s žádnou připravenou startup etapou. Nejde o jméno B6 fill: summary assertion přímo potvrzuje, že jeho POINT fingerprint je stejný jako pouliční POINT v night1. Rozdíl těchto konkrétních dat je chybějící D a odlišné obsazení slotů. Pro jiné datum s aktivním nočním Měsícem může být výsledek jiný; tento proof nepokrývá všechny roční/datumové kombinace.

## Skutečný pohled a vykreslení

`active` je skutečná příslušnost v Scene.getActiveMeshes. `drawn` se čte až z onAfterRender na skutečném camera pass a původního batch.visibleInstances; `shadowDrawPasses` z onAfterShadowMapRenderMesh a příslušného pass batch. Samotné attached/zone se nepovažuje za vykreslení.

| Pohled ON18.10 | Attached instance části | Main active/drawn | Torch shadow drawn |
|---|---:|---:|---:|
| Spawn startup | 0 | 0/0 | 0 |
| Přesný zaznamenaný B6 vstup | 8 | 8/8 | 7 |
| Návrh nav(-4.85,-73) → serviceRoute[1](-1,-71.95), eye foundation+self.eyeHeight | 8 | 4/4 | 2 |
| Source-derived landing(-4.85,-76.95), eye3.43, pohled k approachRoute.last(-4.85,-73) | 8 | 8/8 | 7 |

Hlubší nav pohled vykreslí4 části reception-counter (aged timber laminate, dark rubber or drain, brushed grey metal, window glass). Čtyři části noticeboard (aged timber laminate, ivory painted timber, notice paper, dark rubber or drain) v main draw chybí. U nav pohledu se ve shadow pass objeví jen counter wood/rubber. Vstup/landing zachytí všechny uvedené main části a7 neprůhledných shadow částí; counter glass není shadow draw.

Pro tento malý ROI je source-derived landing lepší kandidát než hlubší nav směr. **Nejde o produkční doporučení bez GPU ověření:** nejsou zde plné B6 stěny/occluders, okolní budovy, skutečný avatar nebo celý caster pool. Další QA může použít přesný recorded replay jako diagnostický vstup; source-derived landing je pouze navazující ověřená možnost pro dvě malá aktiva.

## Restore a lifecycle

Skutečný actor je deep-frozen na spawn a physics mutace/network input mají tripwire. Virtuální B6 přechod používá pouze existující metody s presentation position a skutečnou Game.camera, cameraLight=true. B6 krok nemění skutečný avatar/root/LOD/animaci ani LocalAvatarPresentation. Original prepareLighting na spawn používá původní avatar presentation cestu s dt0.

Po návratu: osm B6 instancí je opět odpojených, fill OFF, camera se vrací do požadovaného spawn pose (tolerance0.01m kvůli původnímu lerp), actor/weather zůstaly beze změny, physics updates0, network inputs0, readonly camera queries40. FlashlightOn=false, timeOverride=null, Game.ready=false; žádná falešná herní readiness.

Camera collision dotazy mají explicitní no-obstacle IO stub. Referenční větev potom použije původní zaznamenanou camera matrix, nikoli neověřený nový collision solve. Sky raster uniform IO a IBL texture update jsou stubs; světelný sampler a shadow response jsou skutečné. Plná avatar animace není zahrnuta. U controlled weather jsou všechny celestial shadows vypnuté; případné zavolání nestudované glass/spatial caster konfigurace proof výslovně odmítá. Nález koordinace o potřebném `forceSpatialSelection` při dt0 přesunu pod stejným aktivním sun zůstává mimo tento výsledek a nesmí být zaměněn za ověřenou obnovu všech produkčních shadow seznamů.

NullEngine používá GLSL a pro požadované PCF přechází na svůj podporovaný POISSON filter2/quality2. Report obsahuje skutečné hodnoty; neprokazuje WGSL, WebGPU PCF descriptor ani obraz. Scope readiness je skutečný NullEngine mesh/Effect frontend, ne GPU kompilace. Clock scheduleru je deterministický16ms tick; jeho stage elapsed není wall/performance metrika. Samostatný wall interval proofu je uveden níže.

## Ověření a náklady

Finální `TSX_DISABLE_CACHE=1 node --import tsx probe.ts`: exit0, dva date scenarios s původními9 startup etapami, B6 day OFF/ON17+18, dvěma dalšími pohledy a restore/reentry, všechny assertions PASS. UTC23:23:53.975–23:23:55.234 dne17.10 (lokálně18.10), fixture+cleanup1258.658ms; celý shell6.306s včetně importů a summary. `node summarize.mjs` má vlastní assertions pro chybějící layout, POINT equivalenci, camera coverage, main reuse a depth disposal; PASS. Všechny scény/enginy/procesy skončily. Žádné full tests/build/integration, plná scéna, heavy GLB, GPU, server, install nebo pnpm.

Zachované nedokončené pokusy nejsou PASS: kolizní proxy noticeboard neměla collisionBoxes a byla nahrazena skutečnými malými GLB; první matrix měla GltfLightBudget po loaderu, což bylo před konečnými výsledky opraveno; první draw observer používal staré umístění batchCache a podle skutečné pinned per-pass struktury byl opraven. Finální log neobsahuje tyto chyby ani receiveShadows warningy z dřívějšího nesmyslného instance setteru.

## Co z výsledku plyne pro další rozhodnutí

1. Nejmenší odůvodněný další krok je **samostatný QA coverage experiment**, nikoli cache: aktuální day B6 OFF/ON, skutečné controllers a camera-only prezentace, včetně korektní spatial caster obnovy. Nezměnit actor/network ani watchdog/readiness; measured startup musí přiznat novou práci. Implementation zatím nebyla autorizovaná tímto taskem.
2. All-scene mesh sweep nepokryje odpojené B6 props a má vyšší cenu bez jistoty skutečného instancing/pass descriptoru. Není lepší první krok.
3. Coverage může odstranit main/instance missy, jejichž reuse je zde doložený. Nezaručí odstranění celéhoF: wrapped tree depth tokeny zanikají při OFF restore, další avatar/LOD, nové streaming assets a jiné počasí nejsou zahrnuté.
4. Širší riskantnější zásah do shadow variantového vlastnictví by odůvodnilo až nové srovnatelné GPU A/B: po prokázaném poklesu main missů přetrvává dominantní zpoždění spojené s obnovenými depth variantami. Pak porovnat bounded variant retention proti samostatné přípravné ownership cestě a stabilním light slots, s memory/dispose/generation a obrazovými testy. Aktuální výsledek nevybírá ani neimplementuje cache.
