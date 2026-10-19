# Atribuce transit controlleru po produkčním profilu

Read-only agent transit_hotspot_audit, 19.10.2026, source65d028 ve vlastní .cache/client-threading-lab-20261019/snapshot. Žádné změny/testy. Jedno navazující kolo otevřené skutečným profilem.

Environment game.ts2303–2309 měří celý transit.update včetně listeners/GC/scheduling; nelze říct, že 26,8–86,9ms spotřeboval sampleTransit.

1. Nový NPC: transit-renderer.ts391–395 vytvoří kompletní near+medium rig i když ihned půjde do far. avatar-renderer.ts931–940 oči/vlasy/anatomie/garments, avatar-skinned.ts38–106 skeleton a dvě geometrie. CharacterMaterials.get94–182 nastavuje nový PBR řadou setterů. Pinned material.pure.js1376–1401 _markAllSubMeshesAsDirty prochází všechny scene meshes/submeshes/draw wrappers i pro zatím nepoužitý material; pbrMaterial.pure.js906–938 decorators. Garments analog84–105 už používá veřejný atomicMaterialsUpdate. Nezměřený podíl konkrétních transit špiček.
2. Výběr NPC používá radius+nearest cap bezretention/hysterese, destroy předcreate (transit376–397). LOD ctor čte world/bounds a JSONshape key (avatar-lod83–187,273–297), prvnífar build/upload191–237,333–357; remove/add jednotlivýchmeshů419–442. Scene removal indexOf/splice +syncobservers (scene2351–2361), AbstractMesh.dispose freeActiveMeshes/freeRenderingGroups (1823–1835). Pool.pruneUnused každýupdate (transit428, avatar-renderer309–332). Konkrétní churn v slowframes není dosud měřen.
3. Ground callback není čistý groundHeight: game871–873 injectsim.surfaceHeight, simulation282–303 používá liveRapier raycast. Viditelnévozidlo5query a selectedNPC1/frame. Samostatný worker znamená jinou physics ownership architekturu.
4. Čistý sampleTransit shared/transit498–505 generuje aktivní passenger/traffic snapshot; schedule/day/boardingpath užcachované373–420, pathlength507–519. Možný worker až po samostatném změření. Faravatar se neanimuje; medium30Hz (avatar-lod450–465).

Upřesnění: Material.dispose standardně používá meshMap, protože newScene(engine) má useMaterialMeshMap:true (scene1573; material1522–1526); netvrdit full-scene disposal fallback jako běžnoucestu. Dirty setter traversal je však bezpodmínečný. Asyncmesh/materialaddition observers způsobují i pozdější renderpráci; removalobservers synchronní, nepřipisovat vše transitintervalu.

Clock: multiplayer transit má Date.now()+snapshots.offset (game516–521), NE lightingInstant. GuestpreviewTransit nelze vydávat za reprodukci skutečného multiplayeru. Prodeterministickéreplay zachytit skutečný transitepoch/IDs.

Další nejmenší důkaz: actualCPUrepro material setter amplification; pro atribuciceléhobloku krátký browserCPUsample nebo úzký boundedtransit breakdown sampling/create/LOD/remove/ground/prune. Browser SelfProfilerV2 existoval v dřívější evidence, ale v tomtofrozenclientu není. Žádné jiždoložené FPSzlepšení.
