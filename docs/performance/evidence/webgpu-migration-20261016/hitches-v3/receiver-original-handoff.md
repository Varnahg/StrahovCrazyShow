# Předání: webgpu-torch-receivers-20261017

- Vlastník: `webgpu-torch-receivers-20261017-dev`, příjemce root.
- WT `C:/Users/rezac/.codex/worktrees/webgpu-comparison/StrahovCrazyShow`, větev `codex/webgpu-migration`, claim base `3258d49afeb9b2ebeac4982efe66dc78466369b3`.
- Scope: `client/light-receivers.ts`, `client/vehicle-lighting.ts`, `tests/light-receivers.test.ts`, `tests/vehicle-lighting.test.ts`, `tests/flashlight.test.ts`, toto předání a `.cache/webgpu-torch-receivers-20261017/`. Cizí pipeline handoff/task WIP není převzat.
- Načteny aktuální primary AGENTS/policy, mapa/koordinace/current-work, celý BMAD `spec-key-31-long-frame-gaps.md`; BMAD vede root. Žádný další workflow ani subagent.

## Důkaz a rozhodnutí před kódem

Pinned Babylon9.30 `Light.canAffectMesh` řeší masks/includedOnlyMeshes/excludedMeshes, nikoli vzdálenost. Přitom hráčský `VehicleLighting` má STANDARD falloff24m a skutečné Standard/PBR WGSL mají za dosahem přesně nulový přímý příspěvek. F dnes mění membership vzdálených statických receiverů a vytváří zbytečné Effecty. GPU čekání zůstává jiná dosud vyšetřovaná část incidentu; kandidát se nevydává za kompletní8s fix.

Trvale enabled/intensity0 není zvoleno: mění dnešní rezervaci4slotů a potenciálně pouliční osvětlení, automatický glTF cap nebo OFF shadow práci. Přesný async warmup vyžaduje samostatné řešení descriptorů/tokenů a není menší změna. Kuželové culling a odhadovaný250ms receiver refresh nejsou zvoleny. Budoucí širší receiver policy pro auto/pouliční/B6 světla není součástí tohoto tasku.

Root schválil lokální `SpotLight` subclass pro hráčskou svítilnu: `super.canAffectMesh(mesh)` zachová původní masks/lists, vlastní Set drží pouze range exclusions. Žádné přepisování shared prototypů, cizích array entries, shaderů nebo rendereru. Konstrukční virtual call musí při dosud neexistujícím Setu vrátit původní výsledek. Inherited getClassName zůstane SpotLight. Scene serializace/clone se v této hře nepoužívají; obecný přenos této lokální policy přes ně není podporovaný kontrakt.

Veřejný array-only postup byl odmítnut: nedokáže rozlišit původně vlastní entry od pozdější cizí identické Mesh entry a volá lineární indexOf přes velký exclusion seznam. Per-instance method wrapper by šel vlastnit a obnovovat, ale subclass je jednodušší a nemění cizí descriptor/callback.

První přijímače jsou pouze prokazatelně statické meshe se zavedenými `artStatic` / `architecture-reality` tagy, známým Standard/PBR materiálem a neupdatable geometrií. Multimaterial, frozen/unknown/custom shader, instance source/regular/thin, skeleton/morph/baked animation/wind, zamčené či nesynchronizované/invalidní bounds zůstávají původní. Konzervativní world AABB má přednost před sférou kvůli možnému parent shear;5cm rezerva pouze rozšiřuje zachovaný dosah, nikdy neořezává původní24m.

Cap kontrola použije counterfactual seznam před vlastním odstraněním torch: pokud by počet přesáhl material cap nebo device-supported cap, receiver se neoptimalizuje. Tím se nepovýší dříve oříznuté jiné světlo. Neznámé konfigurace zůstávají osvětlené původní cestou.

## Vyžádané root napojení

`VehicleLighting.prepareReceivers(): readonly AbstractMesh[]` vrátí znovupoužívaný seznam změněných receiverů pro okamžité synchronní použití. Interní refresh před OFF→ON nesmí změny spotřebovat; akumulují se až do tohoto odběru.

Root zavede `StableLightState.markMeshesDirty(iterable)` ve vlastním scope. Na všech preload/preparation/submitted-frame/game render cestách pořadí bude `gltfLightBudget.prepareFrame()` → `stableLights.markMeshesDirty(flashlight?.beam.prepareReceivers() ?? [])` → `stableLights.update()` → skutečný render. Bez explicitního dirty vstupu samotné stableLights.update při pouhé lokální změně lightSources nemusí canonicalizovat re-admitted torch. Game/StableLightState a jejich testy nejsou součástí tohoto agenta.

VehicleLighting refresh před zapnutím zabrání prvnímu globálnímu přidání far receiverů. Finální root hook potom zachytí pozdější topology/cap/bounds změny před draw. Cizí metody/arrays ani samotný ON/OFF, intensity, shadow caster selection a street budget se nemění. Finální `prepareReceivers` při OFF pouze vydá pending změny, neprochází scénu; disabled světlo nemá material membership ani shadow pass a před příštím ON proběhne aktuální refresh.

## Implementace, refaktoring a životní cyklus

- `TorchReceiverLight` má vlastní Set exclusions, bounded pending Set a opakovaně použitý output buffer. Do veřejných included/excluded arrays nepíše, hooky jejich metod ani shared prototypy nenahrazuje. Detach/dispose odstraňuje reference; detach s pozdějším reattach obnoví nativní membership.
- Interní refresh běží jen při OFF→ON, nikoli dvakrát každý ustálený frame. Finální gate provádí jeden scan při ON. Cena je průchod `scene.meshes`, pro oprávněné objekty kontrola pluginů, aktuálních světel, ancestor chain a bounds. Výsledek canAffectMesh používá O(1) vlastní Set navíc k původním Babylon masks/lists. Nejde o novou shader cache.
- Běžné node/ancestor animace z `node.animations` znamenají fallback. Aktivní přímé animace a animation groups se před průchodem načtou z reálných `scene.animatables` a jejich runtime targetů; fallback platí i pro target `position`, `rotation`, `rotationQuaternion`, `scaling` na meshi či předku. AnimationGroup v pinned 9.30 startuje jednotlivé `beginDirectAnimation` na targetech (`animationGroup.pure.js:548`). Scratch Set se vždy vyprázdní ve `finally`, takže OFF období nedrží staré rigy/vector targets. Arbitrární pozdější změny ze skriptu mimo herní update/gate kontrakt tímto nejsou řešeny; stávající statické source meshe takový kontrakt nemají.
- Frozen world matrix sama o sobě je podporovaná: helper i skutečný draw používají stejnou frozen matici. `TransformNode.computeWorldMatrix` vrací původní matrix, není-li frozen node dirty (`transformNode.pure.js:926–932`). Test pokrývá přesun position při frozen transformaci i následné unfreeze. Frozen materiál naopak zůstává fallback; skutečné Standard/PBR readiness testy pokrývají také freeze po předchozím range exclusion před finálním gate.
- `Light.LIGHTMAP_DEFAULT` je nutná podmínka. SHADOWSONLY/lightmap modes nejsou důkaz nulového příspěvku. PBR debug mode, custom shader resolver, neznámé pluginy, projekční/IES textura a jiný falloff/range/parent konfiguraci vypnou lokální optimalizaci.
- PBR built-in přímé příspěvky (diffuse, translucency obě větve, specular, anisotropy, sheen, clear coat) obsahují násobení attenuation v pinned `ShadersWGSL/ShadersInclude/pbrDirectLightingFunctions.js:40–118`; `lightFragment.js:70–77` volí STANDARD attenuation, `:121–197` aplikuje PBR příspěvky a `:345–385` je sčítá. Povolený CampusSurfaceArt mění pouze fragment albedo/roughness, nikoli vertex polohu, light sum nebo shadow aggregate. Nepovolené materiály/plugins se neodhadují podle názvu.
- 5cm okraj je konzervativní numerická rezerva pro metrové souřadnice tohoto kampusu. Helper není určen jako obecný culler astronomických souřadnic nebo libovolných externích shaderů. Neprovádí kuželový test a zachová velký mesh, jakmile jeho world AABB do dosahu zasahuje.

## Stav ověření

Ověření pouze direct Node v `.cache/webgpu-torch-receivers-20261017/candidate`, jeho node_modules junction vede na readonly `.cache/webgpu-migration/dependencies-v5/node_modules`; žádná instalace ani změna závislostí. Snapshot obsahuje všechny tři přidělené testy a jejich client/shared closure.

- `targeted-freeze.log`: **28/28 PASS**, skutečný Babylon NullEngine, 3 přidělené test soubory; dosah/velký AABB/transformace/cap/device limit/unknown/frozen/instances/animace/cizí arrays/masks/detach/disposal, first/third person, stíny a ON/OFF.
- `scoped-types-freeze.log`: scoped TypeScript nad 2 runtime + 3 test roots a jejich závislostmi, **2997 souborů, 0 diagnostics**. Kontrola zahrnuje finální lifecycle `finally`. `git diff --check` vlastního scope PASS.
- Reálné Standard i PBR sdílené materiály: vzdálený oprávněný receiver při ON i OFF drží stejný Effect, blízký má nový ready SPOTLIGHT Effect. Negativní kontrola `native-control` používá děděný skutečný pinned SpotLight a noop lokální policy, žádnou kopii material produceru. `native-control-effects.log` očekávaně **0/2 PASS, 2 FAIL** na přesném tvrzení `far Effect must retain identity`. Tato kontrola prokazuje CPU mechanismus, není to GPU benchmark ani tvrzení o pořadí TDD.
- První test iterace odhalily chyby fixture (chybějící Babylon InstancedMesh/Animatable side-effect importy a nepovolené NullEngine instancedArrays). Opravené fixture ověřují, že vznikla skutečná instance/animatable. První dvě test spuštění byla ručně ukončena, protože hluboké porovnání Babylon-hooked array při selhání formátovalo obrovský cyklický objekt; assertions nyní porovnávají obsah/identity stručně. Nejde o pád produkčního rendereru.
- Typové opravy respektují pinned deklarace: stock customShaderNameResolve je v runtime undefined navzdory povinnému TS typu, plugin kontrola pracuje s ověřeným LitMaterial a SpotLight.dispose nemá parametry.

CPU důkazy nepotvrzují pixely, FPS, p95/p99 ani konec8s čekání. Neproběhl GPU, build, full suite, integration ani start serveru tímto agentem. Hrané snapshoty4193/C5,4192,4188 i QA porty/deps zůstaly nedotčené. Root musí integrovat svůj Game/StableLightState gate, provést společný stabilní checkpoint, nezávislé review a srovnatelné GPU měření. Commit/main integraci/Linear vlastní root; nejsou tímto předáním hotové.

Manifest v `.cache/webgpu-torch-receivers-20261017/freeze-manifest.json` obsahuje přesné SHA256 vlastních runtime/test/handoff souborů a finálních logů. Předávám rootovi pouze výše vyjmenovaný vlastní scope; cizí dirty soubory nejsou součástí předání.

Runtime a testy jsou zmrazené a hashe odeslané rootovi. Vlastní test/TS procesy skončily a jejich nepřítomnost byla ověřena podle command line; žádný cizí proces nebyl ukončen. Tímto výslovně předávám všech 6 vlastních verzovatelných souborů rootovi k review, případnému převzetí dirty rozsahu a samostatnému commitu. Po vytvoření manifestu uvolňuji svůj task claim; release není GPU přijetí ani stav Done.
