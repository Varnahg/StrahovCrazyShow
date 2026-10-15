# KEY-3: noční svítilna — průzkum a rozhodnutí

Zahájeno15.10.2026, praktické měření pokračuje16.10 Europe/Prague. Published maina8edf56, runtimee1b03fe; vlastní idle WT má496 runtime/test/config blobů shodných. Frozen4188 je immutable a node_modules patří jeho serve rezervaci.

## Prokázaný řetězec před implementací

Dva nezávislé read-only rozbory ověřily instalovaný Babylon9.30 a aktuální aplikaci. Light.setEnabled resynchronizuje meshe; AbstractMesh._resyncLightSource připojuje světla na konec. Scene.sortLightsByPriority neřadí existující mesh.lightSources. PrepareDefinesForLights a BindLights používají indexované sloty, effect cache klíč obsahuje celé defines. Skutečná introspekce helperu prokázala HEMI0/DIR1/POINT2/SPOT3 → po výměně pouliční lampy HEMI0/DIR1/SPOT2/POINT3 → po OFF/ON opět původní variantu, přestože složení typů je stejné.

GltfLoader navíc po loadu zvedá každému materiálu maxSimultaneousLights na scene.lights.length včetně vypnutých lamp. Main neobsahuje StableLightState ani GltfLightBudget; existují pouze v historickém WIP. Dřívější wave3 tedy není dnešní baseline. VehicleLighting guardy/setEnabled a map reuse i B6 pivot fix už v main jsou a nebudou znovu označeny za novou opravu.

První F vytváří SpotLight až v dospělé scéně; první aktivní beam vytvoří shadow generator/map. Broadphase dělá bounded periodic scan. Jsou to další možné náklady, nikoli zatím vysvětlení všech uživatelských sekundových pauz. Shadow enabled+neprázdný renderList je součást shader defines, nulová intenzita nevypíná shadow pass.

## Praktická reprodukce před implementací

Přímý IAB test celé produkční hry4188 v multiplayeru,1skutečný avatar+HUD, GTX1060/ANGLE D3D11, CSS/internal2040×986, medium, pevný night preview instant1792188000000, stejný spawn/kamera. OFF10s:42.8FPS,p95 45.7ms,p99 62.5ms,max83.7ms. První ON10s:39.5FPS,p95 29.8ms,p99 60.1ms, **max2389.7ms**. Hotové JSON v .cache/night-flashlight-20261015/baseline. COLD znamená prvníF novéhoGame, nikoli vymazanou browser/driver diskcache. Obraz/svítilna ověřeny přes canvas.dataset.flashlight=true a screenshot. Snímkování iGPU skutečné, neNullEngine. Měnící se simulované ambient objekty a počasí je nutné uvést při dalšímA/B.

## Varianty a rozhodnutí před implementací

1. Canonical pořadí pouze již vybraných světel: zachová membership/intenzity/stíny, odstraňuje prokázanou historii slotů. Conservativně přeskočit truncated/frozen/custom/unknown a nejmenší MultiMaterial cap. Zvoleno pro první úzkou opravu.
2. GlTF cap ownership guard: opraví pouze rozpoznanou loader inflaci, chráníexplicitní cap/scene/frozen/concurrent/READY. Zvoleno jako druhý související technický celek; převzít novější fastpath verzi, neper-frame material sweep.
3. Always-enabled intensity0: zamítnuto, protože zabírá slot a kreslí shadow pass; vB6/torch/key/street může změnit vzhled.
4. Všude zvýšit cap, freeze nebo blokovat dirty: zamítnuto, maskuje chybu/rozbíjí bindingy či vyřazuje světla.
5. Globální prewarm: odložen do důkazu bounded skutečných variant; forceCompilationAsync začíná synchronně a prosté přepnutí světel tam/zpět není správná příprava. Cold náklad se nesmí skrýt do nezměřeného startu.
6. Univerzální shader/proxy sloty/spatial receivers: perspektivní, ale podstatně větší zásah do Standard/PBR, stínů a vzhledu. Nutný nový profil před volbou.
7. Předvytvoření vypnuté svítilny: možná následná úzká oprava, pokud profil doloží first-F addLight/environment náklad; neřeší pravidelné varianty.

Rozhodnutí je nejprve implementovat a ověřit prokázané redundantní varianty a cap inflaci. Tyto dva kroky samy neopravňují uzavřít celý KEY-3: cold/warm produkčníA/B rozhodne, zda je třeba další zdokumentovaný zásah. Žádné změny síťových limitů, simulace, intenzit, barev, poloh a assetů.

## Primární podklady a regrese

client/art-lighting.ts:street capacity/nearest selection;client/game.ts:toggleFlashlight,oba render callsites,dispose;client/vehicle-lighting.ts:map/caster lifecycle; Babylon9.30 Light,AbstractMesh,materialHelper,thinEngine,Standard/PBR,glTFLoader; Khronos KHR_parallel_shader_compile. Historická předánírepair-light-lifecycle a repair-gltf-light-budget se berou jako kandidát, nikoli důkaz integrace do main.

Regrese: skutečné Standard/PBR defines a unchanged contributors pro street replacements/torch cycle, OFF bezslotu/passu, day/moon/night/B6/car/budgets, frozen/custom/MultiMaterial/add-remove, idle žádný material/mesh sweep, observersdispose, glTFempty/concurrent/READY/frozen/crossscene/explicitowner cap. Gamehooky po všech light/shadow změnách před oběma rendery, cleanup předscene.dispose. Prakticky cold/warm ON/OFF,movement,lampboundaries,B6,car/quality a víceavatarů; profilGPU/rozlišení/hash/perf a obraz.

## Doplňkové primární návody

- https://doc.babylonjs.com/features/featuresDeepDive/lights/lights_introduction/ (světelné limity a velikost shaderů).
- https://doc.babylonjs.com/features/featuresDeepDive/scene/optimize_your_scene/ (profilování a optimalizace).
- https://forum.babylonjs.com/t/performance-issue-with-spotlights-setenabled-and-material-maxsimultaneouslights/47473 (maintainer vysvětlení tohoto druhu stallu).
- Lokální pinovaný9.30 zdroj je rozhodující; aktuální dokumentace může popisovat novější API.
