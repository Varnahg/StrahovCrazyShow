# B6: obnovení jehličnanu u vstupu

`b06-tree-placement.json` opravuje pouze polohu existujícího stromu `ipr-b6-north-conifer` na **X −10,5 / Z −76,5 m**. Zdrojový strom, geometrie, materiály i LOD0/1/2 zůstávají stejné. Poloha kmene má **nejistotu ±2 m**: jde o interpretaci koruny z ortofota/IPR a uživatelské fotografie, nikoli geodetické zaměření ani botanické určení druhu.

## Proč strom nebyl vidět

Starý bod −10,317/−94,077 je správný převod původně ručně zvoleného pixelu581/325, ale nesprávná poloha tohoto jehličnanu. `streetSurfaceAt` tam vrací asphalt; od osy chodníku25920440 je0,8988m při šířce1,8m. K tomu platí původní0,1m ochranný odstup cesty. `placementClassifier.tree` jej proto odmítne. Nejde o chybu GPU, chybějící asset ani nesprávné LOD. `loadTrees` následně deaktivuje načtené meshe, pro které neexistuje odpovídající skupina `TREES`.

Opravený bod projde nezměněnými filtry. Při průzkumu byl2,151m od skutečné asfaltové polygonové hrany a2,546m mimo současný CAD půdorys B6. Ground Y je přibližně0,0579m; runtime vždy znovu používá `groundHeight`. V `surveyed-trees.json` nebyl další bod v okolí X[−40,15]/Z[−105,−40]. Koruna může komunikaci převyšovat, kmen není postaven do cesty.

## Primární podklady

- Uživatelská B6 front fotografie z24.10.2026, datum pořízení neznámé, SHA `748bacdcf689e1ab8706ef9048505e85ef9acd71628c1e340e5a27cd0134366c`. Fotografie B2 se pro polohu B6 nepoužila.
- IPR ortofoto8.6.2024, `docs/streets/strahov-ortho-2024.jpg`, SHA `7db01f50b15dcb55fb12271406608bb847ca8e73411952957612373e0b849473`, georeference vedle obrázku. Kandidát odpovídá pixelu580,266/395,583; původní pixel325 ve svislé ose je asi17,6m severněji.
- Detail vstupu `docs/reality-pack/facade-study/b6-entry-ortho-2024.jpg`, SHA `18b6c25987930149d0338aeef5701f1faa98797f3c730f53d319e60d8d584fe2`, metadata `b6-entry-path-audit.json`; kandidát pixel263,5/305.
- Původní hashově ověřené IPR2023 L16 dlaždice1127463/1127464/1127471/1127472, načtené `photo_projection.load_i3s` a původní JPEG UV s horním počátkem. Zelené body ve výškovém pásmu5–11m mají obálku X[−12,564;−8,752]/Z[−78,193;−74,864] a medián[−9,855;8,503;−75,851]. Stín a koruna zakrývají kmen. Izolovaný bodY19,466m není použit pro změnu velikosti; původní12m výškový odhad /6,5m koruna zůstávají. Přesné souborové hashe a kontrolní hodnoty obsahuje JSON.

Zdrojová data © IPR Praha. Žádné raw fotografie ani zdrojové meshe se nepřidávají do upraveného treepacku.

## Implementace a skutečné souřadnice

Rozumné varianty byly přepsat stromový balík, obejít filtr a přidat bod dodatečně, nebo opravit jeden doložený kandidát před původními kontrolami. Zvolená poslední varianta nemění obecná pravidla, ostatní stromy, materiály, cache ani pořadí životního cyklu. Aktivuje se pouze pro uvedené treeId při registrované CAD B6. Source provenance zůstává `reference-interpreted-not-surveyed` s konkrétním `placementSource`.

Runtime.tree LOD0/1 obsahují **lokální vrcholy**; například LOD0 bark X[−3,459;0,829]/Z[−3,087;1,509]. Far GLB má také lokální vrcholy, ale uzly bark/leaves obsahují historickou translation[−10,317;0;−94,077]. Není správné přičítat tuto polohu podruhé ani přepékat vertex buffers. `attachAuthoredTreeMesh` pro oba načítací směry odstraní node position/rotation/scale, připojí mesh ke společnému aktuálnímu rootu, aktualizuje world matrix a bounding info a znovu je zmrazí. Stejný `TREES` bod používá `treeTrunkCollision` pro fyziku. Streamovaný detail později používá současný root a jeho obálky, ne původní glTF polohu.

Assety jsou beze změny: LOD0 `.tree` SHA `8da0e90eea68887d039fca92a083be3e9d41e6cf3f1ae2a36bb9420f511895e2`; LOD1 SHA `9d75854de8933c04a9a3a90504529bd0266759fb1af7d1a85edaf50d2333c306`. Oba LOD2 uzly existují ve zveřejněném `far.glb`. Modelový manifest a původní master data se neregenerují.

## Ověření a hranice

**11/11 cílených CPU testů PASS**, TypeScript kontrola PASS. Test načetl dvě skutečné LOD2 větve přímo přes Babylon `ImportMeshAsync` z publikovaného GLB (NullEngine, bez materiálových obrázků), prokázal původní node translation a ověřil každý world vertex po opravě. Oba skutečné runtime chunks pak prošly produkčním `startDetailLoads`; ověřena poloha všech vrcholů, původ kmene, zmrazené world bounds a pozdější LOD po nezávislém přesunu rootu. Negativní fixtures zachovávají odmítnutí dodatečně položené budovy, chodníku i neplatného rozsahu. Původní testy nad hashi všech stromových buffers stále procházejí.

Nejde o GPU/fotografickou přejímku ani měření výkonu celého světa. Viditelnost v produkční hře a průchod u vstupu po integraci ověřuje koordinátor. Žádný Blender, server, fullsuite ani regenerace stromů nebyly součástí tohoto podúkolu.
