# Předání: terrain-20261025-flowers

- Vlastník: `terrain-flowers-01a16b37`; příjemce: root.
- Pracovní kopie: `D:/CodexWorkspaces/StrahovCrazyShow-terrain-20261025`, větev `codex/terrain-quality-20261025`; baseline `ff13fa2b3b47363378ce55d34ed12eb5beec1ede`.
- Výsledek: integrovatelný zdrojový/runtime checkpoint s cílenou CPU přejímkou. Celkový build, GPU vzhled/FPS a integrace jsou přejímkou roota, nikoli tvrzením tohoto předání.
- Cizí WIP: ground/soil/vegetation renderer a shared ground-cover vlastní jiný agent; Game/QA a katalog root. Žádné jejich soubory nebyly upravené. Převzatý kontrakt `sampleGroundCover(x,z,out?)` je finální; `flowerDensity` je pravděpodobnost jednoho kandidáta/m².

## Změněné soubory

- `client/ground-flowers.ts`, `ground-flower-placement.ts`, `ground-flower-material.ts`: vlastní deterministické rozložení a dva omezené LOD batche, PBR materiál, async load/cleanup a retained preparation.
- `client/photographic-grass.ts`: načtení/aktualizace/úklid květin, společný triangle cap a combined preparation callback, společné čítače.
- `client/photo-grass-placement.ts`: thinning podle společného pole hustoty; nadále stejné terénní normály, pevný metr a tvrdé výluky.
- `client/photo-grass-batch.ts`: malý obecný kontrakt clone/maxRoots/metadata pro opětovné použití bounded upload/compaction/bounds implementace.
- `client/photo-grass-wind.ts`: sdílený uniform pro vlastní výšku a sílu rostliny, skutečné GLSL i WGSL; výchozí hodnoty trávy se nemění.
- `client/photo-grass-resources.ts`: cache identita obsahuje geometrii, skutečné rozměry atlasu, explicitní názvy a hashe v pevném pořadí `albedo,alpha,normal,normalBent,arm` a materiálovou recepturu. Obrácené insertion order sdílí, prohozené role nebo jiná receptura/rozměr nesdílí.
- `scripts/import-ground-flowers.mjs`, `scripts/derive-ground-flowers.py`: přenosný ověřený import, jednorázový headless výpis a lehká CPU derivace.
- `tests/ground-flowers.test.ts`, `tests/photo-grass.test.ts`, `tests/wgsl-vegetation.test.ts`.
- `public/models/vegetation/flowers/geometry.json` a čtyři původní 1K mapy `dandelion_01_diff_1k.jpg`, `dandelion_01_alpha_1k.png`, `dandelion_01_nor_gl_1k.jpg`, `dandelion_01_arm_1k.jpg` v `public/textures/vegetation/flowers/`.
- `assets/sources/vegetation/dandelion_01/`: README, provider-info/files, source-manifest, derived-components, derivation-audit a stejné čtyři malé původní mapy v `original-1k/`.
- Tento handoff, samostatný předaný flower-derive handoff a vlastní `.cache/terrain-flowers-20261025/`.

## Podklady a skutečná derivace

[Poly Haven Dandelion 01](https://polyhaven.com/a/dandelion_01), fotografie Rob Tuytel/model Rico Cilliers, [CC0](https://polyhaven.com/license). Import 25.10.2026: provider revision `1aaae5d9ce759a84e3b9d381821c8647cefa7a85`, velikost/MD5 ověřeny a SHA-256 uložené pro všech 10 souborů. 8K master + pět map **62,097,155 B** zůstávají na D v cache, ne v Gitu. Čtyři původní runtime mapy **1024×1024**, celkem **1,545,343 B**, jsou byte-identické s poskytovatelem; rozměry ověřené z PNG/JPEG hlaviček.

Z jednoho source raw LOD3 jsou vybrané horní žlutá hlava, její stonek a dva bazální listy: **near 60 tri**, **far 16 tri** (stejný stonek + UV-fit hlava). Near source výška 0,156891 m, společná deklarovaná výška všech LOD **0,158624 m**, radius **0,103894 m**. FAR geometrická odchylka hlavy max **7,087 mm**; není označená za source-exact. Source Displace modifier není aplikovaný, je explicitně evidovaný jako vynechaná část autorské derivace. Source-UV, fotografické kanály a split normals near zůstávají. Převod souřadnic zachovává winding; explicitní CCW mesh orientation odpovídá importu a two-sided PBR i v RH scéně.

Nejde o botanické určení na Strahově. Místo, počet a hustota jsou řídkou interpretací v konzervativní zadní B6 masce od ground agenta. CPU sanity kolem rear QA originu v boxu X27–45/Z−73–−55 má **13** platných kandidátů po výlukách; to není počet GPU viditelných květin. Např. root `(31,462896; −64,652288)` leží poblíž zadního pevného pohledu.

## Runtime kontrakt a refaktoring

`PhotographicGrass.load()` nyní načte květiny v témže startup asset lifecycle. `beginShaderPreparation()` vlastní oba retained helpery; nepotřebuje nový Game stage. Flower helper má unikátní geometrii/instance atributy, vlastní nulový fade/wind a zachová připravený Effect i po deaktivaci. Nečerpá data jiné live dávky. Neúspěšný clone/texture load, zánik scény, starý release callback i dvojí dispose jsou pokryté.

Květiny: nejvýše **2 draws**, dílčí limity low/medium/high **1200/2400/4800 tri** a **32/64/96 kořenů**. Tyto náklady se odečítají z původního celkového budgetu **60k/140k/280k**, včetně odcházejících fade kořenů. Snížení kvality ponechá nejbližší požadované rostliny. `grass.stats.triangles`, `draws`, `allocatedInstanceBytes` zahrnují obě vrstvy; `stats.flowers` přidává detaily. `stats.instances`/grassClumps zůstávají trsy trávy.

Placement cache má nejvýše **1536** buněk, jednoho deterministického kandidáta/m²; výběr prohlíží nejvýše 1536 buněk při změně pohledu, nejvýše po 0,15 s. Pracovní camera→focus úsek je omezený na 18 m. Toto je count-bounded CPU výběr, nikoli tvrzení o změřeném 1/2ms flower deadline. Dosavadní časově dělená grass příprava zůstává. V ustáleném pohledu se znovu neuploadují instance. Sdílené root/fade atributy, matice a cache nepřibývají při každé změně kvality; nevzniká nový shadow/depth pass.

Historická full-density regrese scheduleru má stále původní hash `481a3b9b…` i původní počet 1916; používá explicitní full-density fixture sampler, nikoli nově nahraný current-output hash. Nové skutečné density thinning má oddělené deterministické testy. Staré edge pokrytí ≥30 kořenů zůstává ověřené jako geometrický případ bez thinning.

## Ověření

Po `. .cache/terrain-20261025/activate.ps1`:

```text
node node_modules/tsx/dist/cli.mjs --test tests/ground-flowers.test.ts tests/photo-grass.test.ts tests/photo-grass-selection.test.ts tests/photo-grass-preparation.test.ts tests/wgsl-vegetation.test.ts
node node_modules/typescript/bin/tsc --noEmit --pretty false
```

**44/44 PASS**, exit 0, **37,472 s**, log `.cache/terrain-flowers-20261025/accepted-targeted-tests.log`. Typecheck **PASS**, exit 0, `typecheck-accepted.log`. `git diff --check` prošel dotčené tracked soubory. Native WGSL processor prošel PBR plugin cesty regular/thin/tangent; NullEngine prověřil skutečnou thin draw přípravu a izolaci bufferů. To nejsou GPU důkazy.

Historie oprav a omezení logů je ve `validation-history.md`; původní selhaná 30/32 full-density sada zůstává v `existing-targeted-tests.log`. `pnpm exec` se nepoužívá: automatický dependency check narazil na ochranu junction; nic se neinstalovalo. Přímé installed entrypointy jsou úspěšné.

## Checkpoint, procesy a další krok

Přesný seznam/hash souborů včetně testů je `.cache/terrain-flowers-20261025/checkpoint.json` (handoff sám se nehashuje, aby nevznikl kruhový odkaz). Runtime geometry ID: `f56d1c2ce84b6ded026cc8390d07c3539dd5e37ede3dc06465676618b15958e3`.

Blender PID35396 skončil, headless inspekce 13,03 s bez renderu/GPU; samostatný `terrain-20261025-flower-derive` claim byl již uvolněný. Všechny import/test/typecheck procesy skončily. Nebyl spuštěný server, build, fullsuite, GPU ani commit/staging. Hraná 2592 se neměnila.

Root: nezávislé review, celý stabilní checkpoint test/build/integration a pevné statické GPU pohledy. Prověřit počet/pixelový footprint, čitelnost žlutých hlav, oboustranné osvětlení, přechod LOD, hustotu proti referenci a skutečné FPS/p95/p99 na všech kvalitách. Nenavyšovat hustotu jen podle počtu trojúhelníků. Nejvyšší source balík se nemá přidávat do common Git; malé originály/derivace a receptura jsou přenosné.

Po vytvoření checkpointu a předání se hlavní claim uvolňuje; release není celková GPU/uživatelská přejímka. Stav tasku a integraci zapisuje root.

## Review oprava: skutečná úspěšná cesta loaderu

Owner `terrain-flowers-reviewfix-01a16b37` převzal výslovně vrácený checkpoint `bc7541d95e5eeb07f5be564dcd479ab5c9507c1bec7e9c6e5ee69a1dd0c1ec44` pomocí doloženého `--adopt-dirty`. Jediná zdrojová změna je nový test v `tests/ground-flowers.test.ts`; produkční soubory, cache klíč i assety zůstaly byte-identické. Hash porovnání všech 30 souborů původního manifestu potvrdilo právě tuto jedinou změnu.

Nový test volá přímo **`await PhotographicGrass.load(scene)`**. Nahrazuje pouze HTTP odpovědi skutečnými lokálními JSON assety a používá skutečný NullEngine TextureIO lifecycle s asynchronním onLoad. Ověřuje všechny tři produkční JSON requesty a všech devět načtených texture kanálů. Žádný plant loader, controller, resource constructor, placement/maska nebo rozpočet není nahrazený hotovou injektovanou instancí.

Pevná RH kamera B6 `(36, groundHeight + 1,7, −64)` směřuje k zadní pěšině `(29,24, groundHeight + 0,05, −64)`. Skutečný update musí skončit `ready`, `preparing=false`, `pendingTiles=0`, s nenulovou trávou i květinami. Počet trojúhelníků se porovnává se skutečně odeslanými thin instancemi a po celou přípravu zůstává pod společným medium capem. Matice květin musí ležet v reálné source masce a kamera se nepohne. Odstranění produkčního připojení květin tak nemůže projít očekáváním requestů/ready ani nenulových květin.

Jediný spuštěný testový příkaz:

```text
node node_modules/tsx/dist/cli.mjs --test tests/ground-flowers.test.ts
```

**10/10 PASS**, exit 0, **4,263 s**. Log `.cache/terrain-flowers-20261025/loader-reviewfix-tests.log`. Žádná širší sada, typecheck, build, browser ani GPU se v této opravě nespouštěly; celkové ověření přebírá root.

Aktualizovaný manifest je `.cache/terrain-flowers-20261025/checkpoint-reviewfix.json`, source digest **`ad8487b9599f1e81b9521c9068e820b2636281b04d61900f41e847746e61258c`**, SHA-256 manifestu **`d9591da0508c24bd78a95f7517536877f1f5d00def10a98d4afb0432d5152d1a`**. Původní manifest a jeho výsledky zůstaly zachované. Vlastní proces skončil; po předání je review-fix claim uvolněný.

## Klidový pohled: konzervativní mikrotranslační hysteréze

Owner `terrain-flowers-idle-01a16b37` převzal explicitně vrácený WIP pomocí `--adopt-dirty`. Tato navazující oprava mění pouze `client/photographic-grass.ts`, `client/ground-flowers.ts`, jejich dva testové soubory a přidává `client/vegetation-view-stability.ts` / `tests/vegetation-view-stability.test.ts`. Ostatních 26 source/asset souborů minulého manifestu zůstalo byte-identických. Fyzika, Actor, kamera, QA freeze, shader ani rozpočty nejsou změněné.

### Evidence a volba

Rootovy GPU HUD soubory `edge-candidate-v5-front-medium-hud.json` a `edge-candidate-v5-front-medium-hud-repeat.json` pod `.cache/terrain-gpu-20261025/` ukazují při stejné rotaci, FOV a projekci posun kamery X o **0,03568172455 m**, Y o **−0,00056171417 m** za uvedených 314 s. Změnily se jen translační členy view matice. Odpovídající X rychlost je **0,0001136360654 m/s**, tedy asi **17,05 µm za 0,15 s**. Celých 35,7 mm není subpixelový pohyb a nesmí se navždy ignorovat. Root zaznamenal `preparing=true`, `pendingTiles=0`, `transitionRoots=0` a cap 139992/139984; tyto HUD soubory samy nerozlišují všechny interní větve preparing. Zdrojová kontrola ukázala exact matrix/focus invalidaci a opakovaný výběr po dokončení. `fillVacancies` při nedostatku zbývajících trojúhelníků postupuje přes cursor, takže samotný cap není prokázaný nekonečný cyklus.

Porovnané varianty: delší debounce může při souvislém driftu odkládat práci donekonečna; epsilon proti minulému framu by nikdy nezachytil kumulaci; samotná world-distance tolerance nezaručuje subpixelovou změnu poblíž kamery; konstantní minZ jako hloubka je bezpečný, ale zbytečně omezuje klidový interval i u vzdálené trávy. Zvolen je snapshot-relative limit **maximálně 2 mm a současně 0,25 interního pixelu** s konzervativní dolní mezí hloubky skutečných kandidátů. Podkladem jsou připnuté Babylon 9.30 implementace `Matrix.PerspectiveFovRHToRef`, `Vector3.Project` a `Frustum.GetPlanesToRef` v `node_modules/@babylonjs/core/Maths/`, produkční source geometrie, world placement a skutečný shader/batch wind envelope.

### Implementace a životní cyklus

Sdílený helper ukládá view/projection, pozici oka a focus **jen při zahájení skutečného výběru**. Přesné porovnání rotace, celé projekce, FOV a obou interních rozměrů zůstává. Posuzuje zvlášť world posun oka, focus a skutečné float32 translační členy view matice. Projekční horní mez používá nejbližší možnou hloubku všech připuštěných source koulí **před LOD a budget thinning**, včetně posunu hloubky a off-center projekce. Nemá per-frame alokace. Pokud hloubka není hotová, koule protíná eye plane nebo projekce není podporovaný perspektivní tvar, pohyb se nepotlačí. Není zavedený nový odhad hloubky podle výšky kamery.

Výběrový range má navíc 2mm guard; skutečný shader range/fade zůstává živý. Source sphere respektuje rotaci okolo root originu, offset svého středu a stejný **2cm wind allowance** jako stávající `PhotoGrassBatch` renderer bounds. Stávající velkorysé grass cull okraje 0,16/0,95 m zůstávají minimem; flower sphere zahrnuje i offset středu. Tolerance se nevztahuje na frustum rendereru ani shader uniformy. Historická full-density reference **1916 roots / SHA `481a3b9b…`** zůstává beze změny.

Pro běžný pohyb i rotaci zůstává původní cadence **0,15 s**. Quality a flower-budget změny zůstávají hard výjimkou; jinak by budget event mohl být spotřebován před přeskočeným tickem. Pending práce zachovává původní anti-starvation prahy 3 m / přibližně 30°; přesná změna projekce/rozlišení její zastaralý snapshot zruší. Po skončení práce se dál mění skutečné `allocationDirty`, cursory, pending/revision stav; ukazatel preparing nebyl kosmeticky přepsaný. Zbytečné samostatné snapshot stavy FOV, height a focus nahradil společný helper.

### Ověření tohoto checkpointu

```text
node node_modules/tsx/dist/cli.mjs --test tests/vegetation-view-stability.test.ts tests/photo-grass.test.ts tests/ground-flowers.test.ts
node node_modules/typescript/bin/tsc --noEmit --pretty false
```

**43/43 PASS**, exit 0, **25,957 s**; log `.cache/terrain-flowers-20261025/idle-targeted-tests.log`. Typecheck **PASS**, exit 0; `idle-typecheck.log`. Cílený `git diff --check` PASS. První helper běh odhalil jen nesprávný název Babylon ortho factory v testu; používá se skutečný `OrthoOffCenterRHToRef`. Následné 41/42-testové běhy před finálním budget regression testem nejsou finální důkaz.

Skutečný `PhotographicGrass` se source rozmístěním, RH kamerou z front záznamu a medium capem: **139994 tri**, konzervativní depth **1,833211916 m**, dokončené preparation/allocation/pending. **240 frames ±10 µm jitter: 0 výběrů, 0 uploadů**, živý camera/focus uniform dál sleduje každý posun. **1200 frames při zaznamenané rychlosti = 2,272721 mm: 4 dokončené výběry**, potom opět skutečné `preparing=false` a `allocationDirty=false`; další 120 pevných frames bez výběru/uploadu. Nejde o tvrzení totožného GPU root setu z HUD.

Numerické projekční regrese používají skutečné Babylon matice/`Vector3.Project`, rozlišení 288/720/2160 px, FOV 0,3/0,85/1,2, hloubky 0,2/2/10 m, symetrickou i off-center projekci a body na hranách obrazu. Ověřují kumulaci, přesné rotace/projekce/rozlišení, near-eye fail-open, float32 view posuny a guard bod vstupující do frusta. Controller regrese ověřují květiny, původní cadence a zrušení pending snapshotu při změně projekce. Budget regrese řídí pouze publikovaný výstup companion flower controlleru; skutečný grass selection, allocation a thin batches musí uvolněný budget 2400 tri přijmout uvnitř 0,15 s a doplnit nejméně 2300 tri. Dosavadní chůze/sprint/otáčení, cache, cap, fade a disposal testy zůstávají.

Žádný browser/GPU/build/fullsuite, server, instalace ani commit/staging nebyly spuštěné. NullEngine a CPU projekční kontroly nejsou měření GPU výkonu. Root přebírá neměnný checkpoint pro statickou front/rear GPU přejímku a skutečné FPS/p95/p99; zejména je potřeba potvrdit klidové intervaly v produkci a zachované pokrytí okraje frusta. Při nepodporované projekci či extrémně blízké vegetaci gate záměrně nemusí mikroposun potlačit. Stávající renderer wind envelope není tímto patchem rozšiřovaný na libovolně velký vítr.

Manifest `.cache/terrain-flowers-20261025/checkpoint-idle.json` obsahuje **32 souborů**, source digest **`b9d62fd89f6083d24e7cfc35659be56a68453083279baeff995fec95dd3091f3`**, SHA-256 manifestu **`1cf4978cf7aeee19adc886443b77425c0d7c6675faa19e347b5d656609837f14`**. Handoff není zahrnutý do svého vlastního digestu. Vlastní test/typecheck procesy skončily; před release byl informován root. Release není celková GPU přejímka.
