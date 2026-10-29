# KEY-8: příčiny produkčního startu a navazující rozsah oprav

Průzkum 13. 10. 2026, read-only kód a skutečný produkční baseline. **Problém přetrvává i bez dev JSON modulů:** dlouhá synchronní konstrukce světa, povinný 76,5MB bootstrap vegetace a pozdní přepnutí na finální materiály/avatara jsou samostatné doložené mechanismy. Přesný podíl fyziky a jednotlivých konstruktorů světa zatím není změřený. Tento dokument není důkaz opraveného startu ani návrh pouze prodloužit načítací indikátor.

## Zdrojový checkpoint a podmínky

- Baseline `.cache/performance-snapshot/playtest-repairs-baseline/source-manifest.json`: úplný asset/source snapshot **f2705e4a74273d443dc2bb79f9be5ffd83efe7f54f54ef150b790c8978831410**, accepted code/config/tests **d3ee76c2eb756a66f992fcd3e1f164c2f48a738932ef0f9603c11671e12a956a**.
- Log `.cache/playtest-repairs-validation/baseline-session.jsonl`, SHA256 **d098f70141cf91c074b67ced1f80d281c6bd1bcd538f52b5045832fea9027326**, session `1ca3821c-8578-4a68-a36b-855c1fbb0f1f`.
- `game-start` seq78 potvrzuje `development:false`, production a uvedený accepted code snapshot. Serverová source-identity v hlavičce je jiné pozorování pracovního stromu, nikoli hash tohoto build výstupu.
- GTX1060 / ANGLE D3D11 / WebGL2,4×MSAA,1 skutečná multiplayerová relace/HUD. **Start byl na CSS i interním1280×720**, auto/medium, DPR1,25. Pozdější2040×986 benchmark ze stejné relace neměří start a jeho rozlišení se nesmí přenést na tuto část logu.
- Jde o první start hry v dané produkční kartě, nikoli prokázaně prázdnou HTTP/driver/shader cache. Více odpovědí má transferSize300 a plné encodedBodySize. V cache prohlížeče už mohly být zdroje; přesný ovladač není uložen.
- Sedm relevantních souborů bylo SHA256 porovnáno s baseline: `world-renderer.ts`, `presentation-rate.ts`, `vegetation.ts`, `b6-reality.ts`, `assets.ts`, `surface-pack.ts`, `shared/simulation.ts` — všechny shodné. Aktuální `game.ts/ui.tsx` mají nové koordinační/diagnostické opravy; konkrétní minifikované callbacky níže byly ověřeny proti **baseline dist**.

## Co produkční záznam skutečně měří

Časy jsou monotonic offsety od navigation timeOrigin. Prvních21 sekund zahrnuje menu a čekání uživatele; nelze je celé vydávat za načítání hry.

| Událost | Offset | Důkaz / interpretace |
|---|---:|---|
| network-connecting / connected |21,108 /21,256s|seq57/58; navázání v této relaci nebylo několikasekundovou brzdou.|
| mode-change multi |21,339s|seq59; vhodný orientační počátek přechodu do hry.|
| production game chunk |21,339–21,886s|seq75, transfer549410B, decoded3377810B.|
| synchronní UI pokračování |21,927–27,366s|LoAF#81 **5439,1ms**, z toho game modul top-level57,8ms a UI async pokračování5379,7ms. Offset6432108 v index chunku je `await import(game)` → `new Game` → callbacky/nastavení → `g.start()`. Bez jemného profilu nelze celých5379,7ms připsat jedné metodě buildWorld.|
| game-start |27,363s|seq78 vzniká až po synchronním konstruktoru.|
| presentation measurement dokončeno |28,917s|quality-change seq88;1553,5ms po game-start odpovídá záměrnému1550ms vzorkování klidového RAF.|
| far.glb request |32,727–36,331s|seq119,**76 500 788B transfer /3603,4ms**, tělo76 500 488B.|
| povrchové a avatarové textury zahájeny |40,907–40,910s|seq154–160: nové požadavky až při finální přípravě, těsně před game-ready.|
| game-ready |40,910s|seq147, **19,571s po mode-change**,13,547s po game-start. Není to potvrzení dokončení prvního finálního snímku.|
| dlouhý interval přes ready |38,742–43,807s|LoAF#192 **5065,3ms**: loader async pokračování2170,3ms a engine render callback2894,7ms. Tyto callbacky nejsou samostatná měření čistého GPU času.|
| React ui-state ready:true |46,401s|seq176,5,491s po game-ready; indikátor/efekt byl zpožděn další prací.|

První frame-window#149 přímo obsahuje **2887ms CPU**, z toho **cinematic784,3ms a scene.render2042ms**. Následující okno má preceding frame interval2997,5ms, ale aktuální CPU123,5ms; čas snímku a aktuální CPU patří různým hranicím. LoAF#192, tyto frame windows a resource durations se překrývají — **nesčítat je jako nezávislé záseky**. Časné FPS0,46/0,33 jsou jednotlivé přechodové intervaly, nikoli ustálený výkon.

## Dev53MB není velikost produkčního avatar modulu

| Skutečný produkční zdroj | Decoded soubor | Encoded response | Transfer v baseline | Duration |
|---|---:|---:|---:|---:|
| index-4psmjTBz.js |6 484 370B|2 214 210B|2 214 510B|1159,7ms|
| avatar-renderer-Civ4Wm7Z.js |15 025 561B|4 710 875B|4 711 175B|1793,4ms|
| game-CG5RDN7H.js |3 377 810B|549 110B|549 410B|546,9ms|

Původní dev `student-garments.json`53 433 528B je jiná reprezentace doručená Vite dev serverem. Production avatar chunk obsahuje společnou zkomprimovanou/minifikovanou geometrii, ale pořád je velký. V baseline byl stažen už v menu od1,818s. Top-level avatar callback84,2ms, vytvoření menu preview141,1ms a další asset callbacky jsou prokázané; **nejde o doloženou příčinu následného5,38s UI pokračování při startu hry**. Automatický návrh „opravit production53MB soubor“ by řešil neexistující produkční URL.

Samostatné rozdělení geometrie/typed binary/načítání jen vybraného presetů může snížit menu přenos a parse. Není první úzkou opravou této startovací bariéry a vyžaduje rezervaci vstupů i derivovaných assetů a přesnou numerickou parity geometrií/UV/skin vah.

## A. Synchronní konstrukce před prvním await

`Game.constructor()` vytváří Engine/Scene, kameru a světla, poté volá **synchronní `buildWorld()`**, záložní auta, SkyWeatherController, déšť a posluchače. `buildWorld()` bez předání řízení vytváří terén, landcover, cesty/detail komunikací, reality ground, architekturu, základy, B6 fallback a schody, landmarks, campus exterior, outdoor objekty, popisky a závěrečné merge skupiny. Výsledkem je celý svět, ne jedna drobná položka.

Je přímo prokázaný **souvislý5,38s startovací callback** a synchronní složení této cesty. Který podkonstruktor tvoří kolik času, nelze z LoAF rozdělit. `new Simulation()` do tohoto callbacku nepatří: následuje až v `start()` po presentation await a `initPhysics()`.

### Přesný navazující task pro staged world

Disjunktní rozsah: `client/world-renderer.ts`, nový `client/world-build-stages.ts`, `tests/world-build-stages.test.ts`, `tests/world-renderer-startup.test.ts`; root vlastní přechod `Game.constructor/start/dispose` v `client/game.ts`. API návrh: `createWorldBuildJob(context, { signal, onPhase })` s `.run()` vracejícím původní world controllers. Stávající synchronní `buildWorld()` může nad stejnými operacemi zůstat pro export/test callery; nemají vzniknout dvě kopie herních pravidel.

1. Nejprve změřit engine/setup, terrain, streets, architecture, B6 structure, landmarks, exterior/outdoor a merge. Root UI `startup-phase` game-construction je užitečný celek, nikoli tato granularita.
2. Rozdělit tvorbu do deterministických dávek se stejným pořadím a finálním výsledkem. Předání řízení skutečnému event loopu mezi dávkami umožní render načítacího UI; `await Promise.resolve()` je pouze microtask a nestačí. Časový limit dávky například4ms je **návrh**, nikoli změřená záruka.
3. Pouhé yield mezi osmi obřími funkcemi nemusí odstranit zásek uvnitř jedné z nich. Pokud phase evidence označí architekturu/terén/merge jako velkou samostatnou dávku, koordinátor musí rezervovat příslušný výrobní modul a rozdělit jeho práci po existujících budovách/dlaždicích. Neměnit prostorové chunkování, topologii, materiály či svět jen kvůli hranici jobu.
4. Je nutný AbortSignal/generation guard před každou dávkou a po async hranici. Exit/retry nepřidá staré uzly do nové scény, nikdy nepřepne ready po dispose, každá částečně vytvořená položka má jednoho vlastníka a idempotentní cleanup. Chyba nesmí spolknout původní diagnostiku. Žádné ovládání/simulace před dokončením požadovaných kolizí a základního světa.
5. Testovat pořadí a počet operací synchronní vs staged cesty, identické world roots/metadata, polohy/bounds/mesh a material counts, materiálové skupiny, cancel před startem/mezi dávkami/při výměně scény, vrácený Promise/error, dispose a nulové přeživší timery/RAF. Fyzické B6 vstupy/schody/povrchy zachovat v existujících testech; GPU přejímka porovná i skutečný obraz a max longtask. Zelený scheduler unit test není důkaz odstraněného5s reálného callbacku.

## B. Pozdní finální materiály a první hotový render

`Game.start()` nyní postupuje: presentation → Rapier init → synchronní Simulation/colliders → preload render → moduly a `Promise.allSettled(B6,vegetation,car)` → **teprve potom SurfacePack.update, CinematicAtmosphere, VehicleLighting a updatePlayers** → game loop. SurfacePack nahrazuje Standard materiály PBR materiály a až při tom zakládá textury. Cinematic mění environment/ACES; jeho quality pipeline se poprvé připravuje v prvním herním `update`.

To znamená, že preload kreslí přechodnou konfiguraci, která se těsně u ready mění. Přímý časový důkaz: čtyři normal mapy povrchů, vlasová textura a garment AO/normal začínají40,907–40,910s. Mají transfer300B (opětovné použití/revalidace) a duration2921–2987ms, **což nelze vydávat za síťové stahování celého jejich obsahu**; callbacky čekají i na zablokované hlavní vlákno. První skutečný herní snímek má cinematic784,3ms + render2042ms.

První úzká root oprava má v `Game.start()` připravit **finální základní SurfacePack, skutečné známé světlo/weather/čas, cinematic quality a lokálního avatara před preload renderem**, aby se potřebné textury a konečné shader varianty připravovaly v téže fázi jako assety. Nejde jen o přesun `ready=true`. Reálně se odstraní kreslení/kompilace přechodné materiálové konfigurace a zbytečně sériové zahájení textur až za všemi assety. SurfacePack má observables pro nové/změněné meshe, takže může zůstat jedinou instancí i během loadování; metadata dodaná později musí být součástí ověření.

Cinematic/shadow caster výběr nesmí při každém preload frame znovu procházet právě vznikající svět bez potřeby. Čas/počasí má vycházet ze stejného zdroje jako finální frame, ne z pevného dne nebo jiné kvality. Po úspěchu všech loaderů aktualizovat přírůstky a readiness finálního viditelného snímku; nezavádět globální `scene.isReady()` nad vypnutými LOD jen pro hezký indikátor. Zachovat single scene, skutečnou 4slotovou herní politiku a korektní shader varianty (viz loader nález níže).

Potřebné testy: SurfacePack vytvořen právě jednou; existující a opožděně načtené materiály dostanou stejnou konverzi/mokrost/detail; první finální render používá stejné objekty/material identity; stejný lokální avatar se bez změny profilu netvoří dvakrát; úspěch/chyba/cancel každého loaderu uvolní vlastněné prostředky; dispose během presentation/physics/assets nehlásí ready. Rozsah `client/game.ts` + nový cílený startup fixture test drží root; případný nový scheduler modul dostane vlastní task. GPU musí zvlášť vykázat celkový start, nejdelší main-thread task a první3s hry.

## C. Vegetační bootstrap tvoří hlavně vložené textury

Povinné `loadVegetation()` čeká na `loadTrees()` a photographic grass. `loadTrees()` stáhne manifest, pak celé `far.glb`, přidá jeho obsah, napojí109 stromů/materialy a teprve pak vrátí controller. `Game.start()` na tento Promise čeká. Samotné označení far tedy neznamená levný download.

Nezávislé čtení GLB JSON/bufferViews a image hlaviček z **neměněného souboru**:

| Složka far.glb | Velikost |
|---|---:|
| Celý GLB |76 500 488B|
| JSON chunk |177 572B|
| Devět unikátních image bufferViews |**67 850 872B (88,7%)**|
| Ostatní bufferViews |8 471 996B|
| LeafSet001 normal PNG2048²,16bit RGB |18 335 249B|
| LeafSet019 normal PNG2048²,16bit RGB |19 492 792B|

V GLB je219 mesh záznamů,3 materiály,9 textur; devět image views nemá duplicitní odkazy. Všechny mají2048². Dvě normal mapy samy tvoří37,83MB. GLB SHA256 **a378eb7951da498e433d5b4ca2bf3e93b2fb0f8ec740e23c81f746879b94b729**. **Doložená velikost a přenos nejsou důkaz konkrétního image decode/upload CPU času.**

Navazující task má rezervovat runtime export skript, source manifesty, všechny vstupní obrázky a generované runtime GLB/textury současně. Nejdříve porovnat formát skutečně uploadovaný renderovací cestou a referenční dekódované texely: běžná Babylon image texture cesta používá WebGL UNSIGNED_BYTE, ale shodu převodu PNG16→runtime8 včetně gamma/normal/alpha je nutné **prokázat**, ne předpokládat z názvu souboru. Pak lze připravit přenosový/runtime derivát s totožným vzhledem při zachování originálních zdrojů a provenience. Žádné automatické ubrání stromů/foliage detailu; KTX2 či jiná ztrátová komprese až po samostatném pixelovém a shader/capability ověření. Bez této rezervace se assety v auditu neregenerovaly.

## D. Skrytá změna materiálového limitu glTF loaderem

Nový přímý nález primárního Babylon9.30 zdroje: `@babylonjs/loaders/glTF/2.0/glTFLoader.pure.js` řádky412–417 po dokončení load scene iterují **všechny** `scene.materials` a nastaví:

```ts
material.maxSimultaneousLights = Math.max(material.maxSimultaneousLights, scene.lights.length);
```

Počítá i vypnuté lampy a zasahuje také materiály vytvořené před glTF importem. V runtime klientských souborech nebylo nalezeno obnovení cap4. Přímý malý in-memory experiment použil skutečný `LoadAssetContainerAsync('data:'+JSON.stringify({asset:{version:'2.0'},scene:0,scenes:[{nodes:[]}],nodes:[]}), scene, {pluginExtension:'.gltf'})` a instalovaný loader. Výstup13.10.2026 21:54 Praha, exit0:

```json
{"registered":43,"enabled":2,"before":[4,4],"after":[43,43]}
```

`before/after` jsou existující StandardMaterial a PBRMaterial. Žádné textury, souborové výstupy, GPU ani server; vytvořená scéna/container/NullEngine byly zrušené.

**To není důkaz43 skutečně osvětlujících slotů v pixelu.** `PrepareDefinesForLights/BindLights` používají aktuální `mesh.lightSources`; inactive světla v něm nejsou. `streets-renderer.ts` navíc mapované lampy inicializuje explicitně intensity0 a disabled, takže není podložené tvrdit, že je preload všechny současně rozsvítí. Přesto max cap ovlivňuje define/key `MAXLIGHTCOUNT`, indexované shader source expansion a jeho změna materiál zneplatňuje. WebGL `GetSupportedSimultaneousLights` bez deklarovaného UBO limitu cap dále neomezuje. První import tak může překlopit cap existujícího světa4→počet scénových světel a vytvářet jinou variantu; velikost nákladu je nutné měřit.

Fixture, který sám nastaví cap4 a nenačte glTF, **nedokazuje cap4 ve skutečné produkční hře**. Root doplňuje histogram skutečných materiálových caps a active lightSources do inventáře. Další úzký task může izolovat scene-specific glTF material-budget lifecycle v novém `client/gltf-light-budget.ts` a `tests/gltf-light-budget.test.ts` s root integrací: zachovat zamýšlený cap existujících materiálů, určit politiku nových importovaných materiálů, ověřit skutečné pořadí loader onReady/complete vůči renderu a souběžným importům. Nepatchovat neověřeně node_modules a nevracet cap pouze jednou na úplném konci — během preloadu by nechtěné varianty už mohly být vytvořené. Přesný použitý loader hook musí task ověřit na primárním API a reálném minimal glTF fixture.

## Fyzika, záměrné čekání a chybějící důkazy

- `measurePresentationRate()` cíleně pozoruje klidový RAF1550ms (timeout2200ms) před render loopem, aby neměřil refresh z FPS zatížené hry. Nelze ho „paralelizovat s render/build“ a dál označovat výsledek za idle cadence. Lze zvážit poctivě označenou reuse měřené session cadence nebo změnu adaptive kontraktu v samostatném tasku; tento1,55s interval není odhalená chyba.
- `initPhysics()` drží jeden Promise pro `RAPIER.init()`, tedy opakovaně neinicializuje Wasm v témže modulu. Po něm `new Simulation()` synchronně tvoří terrain/campus/landmark/B6/stair/building/tree/vehicle colliders. Bez phase timing nelze určit, kolik z intervalů po28,917s je Wasm init, generování dat, Rapier trimesh nebo render.
- LoAF#90 callback presentation tick389,2ms může zahrnout navazující microtask práci; jeho název není důkaz389ms uvnitř samotného pole RAF vzorků. LoAF#95 má2301,8ms, ale jen205,5ms přiřazených engine callbacku: neoznačit zbylý čas automaticky za konkrétní fyzikální metodu.
- Babylon glTF `compileMaterials` má defaultfalse. `LoadAssetContainerAsync` dokončení není stejné jako připravený finální shader celé hry. Název minifikovaného chunku `standardMaterial...js` zde zahrnuje i glTFLoader; callback offset192989 byl přímo dohledán do jeho async load cesty, **není to důkaz času StandardMaterial shaderu**.
- Wave1 snapshot300f47… má nové hrubé `startup-phase` události import/construction/start, ale v dostupných uložených datech ještě nemá produkční session log s těmito fázemi. Nejsou k dispozici jemné konstruktory, rozpad loaderů ani srovnatelná repeated cold série.

## Podmínky přijetí oprav

Další produkční log má měřit navigation/menu zvlášť od start input → constructor → presentation → physics-init → colliders → asset imports → jednotlivé loaders → finální material setup → první skutečně připravený/ovladatelný snímek. Zapisovat wall duration, main-thread maximum, počty prostředků a source ID; netvrdit CPU/GPU příčinu z jedné agregované hodnoty. Nejméně první a opakovaný start v popsaném cache stavu; stejné GPU, rozlišení, kvalita, kamera, relace/HUD, stejný svět. Nové hodnoty nesmějí přepsat původní baseline.

Za úspěch nelze považovat jen dřívější `ready=true`, delší loading overlay, skrytí světa nebo odsunutí stejného záseku do prvních kroků. Musí klesnout doložená souvislá blokace/objem zbytečné práce při zachované fyzice, vzhledu a ovládání. Test/build/integrace i GPU běhy zůstávají koordinované pod `repair-production-validation`.
