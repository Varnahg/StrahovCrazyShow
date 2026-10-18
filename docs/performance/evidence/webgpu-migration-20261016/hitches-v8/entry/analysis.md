# B6 entry: bounded CPU view proof, 18. 10. 2026

Jeden source-derived pohled splňuje camera-pass coverage v tomto malém proofu. Není to GPU ani plný produkční kolizní důkaz. Žádný runtime soubor nebo frozen a94 nebyl změněn.

| Pohled, OFF i ON | Původní GLB části | Kovový box batch | Šikmá madla | Concrete treads |
|---|---:|---|---|---|
| Současný flat landing | 8/8 | ano | ne | ne |
| Jeden source orbit + lokální skutečná kolize | 8/8 | ano | ano | ano |

Použity přesné malé GLB reception-counter/noticeboard a skutečné loadProps/placements/regular instances. Entry geometrie je 55 kanonických boxů a 2 kanonická madla, původní B6 material/mesh factories, bez náhradních proxy tvarů. AST výřez původního konstruktoru vynechává pouze loop pokojových cedulek; vstupy roomAreas jsou prázdné a kolekce boxů/stair meshes omezené na entry. Full svět nebyl vytvořen. Samotný render proof trval 284.46 ms, celý Node příkaz 5.26 s; tato čísla nejsou měření výkonu hry.

## Odvození a kolize

Stejný landing jako a94: body `(entry.x, foundationOffset+.8, landingMaxZ)` = `(-4.85,2.6,-76.95)`. Směr z posledního approachRoute bodu dává yaw0. Původní Game defaults pitch .28, distance8; původní metoda updateCameraFollow se snapem jednorázového fixture ownera, bez historie skutečné hry. Cíl je body+.6Y. Skutečný `Simulation.cameraDistance` provádí Rapier Ball(.22) sweep, margin .01, bezpečný odpočet .03. Lokální skutečných 57 colliderů zkrátí arm na2.5018939686 a výsledná kamera je `(-4.85,4.1090513558,-79.2809009122)`.

Zdroj: frozen a94 `shared/b6-interior.ts:61` entry a`:77` approachRoute; `client/game.ts:398` defaults a`:2140` CameraFollow; `shared/simulation.ts:356` query,`:158` canonical box/stair construction; `shared/b6-entry.ts:30` madla. Izolovaný Rapier world dostal jeden inicializační step pro broadphase, poté jen queries. Produkční Simulation/actor/physics/network nebyly spuštěny ani měněny. Další kolizní svět, photogrammetry a případné editor transformace chybějí, proto nelze převzít výsledné XYZ jako univerzální production collision solve.

## Proč materialName entry-metal nestačí

Raw a94 `async-b6-candidate-inside1-session.jsonl`, seq4575, skutečný first-F main draw: mesh6256 **b6 dogleg floor 0 entry-metal**, preparation27.3 ms; mesh6194 **b6 floor 0 b6:concrete stair treads**, preparation25.2 ms. Materiál entry-metal je souhrn dvou mesh calls; aggregate effect242→418 není per-submesh shader dump.

Flat kreslí `b6 floor 0 b6 stair:entry-metal`, tedy box batch. Schází samostatný `b6 dogleg floor 0 entry-metal`, dvě sloučená šikmá madla. Oba používají stejný PBR material, ale vlastní submesh0/draw wrapper. Box batch nemá receiveShadows; factory `createB6StairMeshes` na`:121` jej madlům nastavuje. Ve finálním medium ON CPU proofu má madlo navíc přesně **SHADOW0, SHADOWPOISSON0, SHADOWS**, bez rozdílu INSTANCES/UV/alpha defines. Proto má jiný Effect. Report obsahuje konkrétní mesh/source/submesh/vertex attributes, plné defines a jejich SHA pro entry. Nový pohled přidává právě oba názvy z raw first-F topMeshes, ne pouze stejné materialName.

## Ověření a limity

`TSX_DISABLE_CACHE=1 node --import tsx probe.ts`, run-04.log, exit0: čtyři pevné kombinace2views×OFF/ON, cílené assertions včetně8/8, obou konkrétních meshů, různých shadow variants, nulových aktivních loaderů a lifecycle cleanup. Finální medium je shodné s raw benchmarkem. První dokončený high run zachován v report-03-initial-high.json/run-03.log; run-01/02 skončily před scénou na chybné cestě provenance k inlined Rapier wasm a jsou uchovány. Žádný grid nebo třetí pohled.

NullEngine vytváří ready16×16 interní textury bez obrazových bytes; skutečné texture/material factories zůstaly, ale bump/GPU capability parity není tvrzena. Kamera a material/instance frontend skutečně provedou camera-pass draws; bez rasteru, occlusion, WGSL a GPU compilation. Light fixture má odpovídající bounded P,D,H / S,P,D,H složení a actual PlayerFlashlight, nikoli celé počasí/Game environment. Effect ID z CPU nelze ztotožnit s WebGPU242/418.

Nejmenší navazující QA kandidát může nahradit flat pohled v existujících dvou B6 etapách tímto jedním odvozeným pohledem; nemusí přidávat etapy ani cache. Musí samostatně zachovat skutečný Game camera/pass, controller/light anchor, latest settings a restore všech dočasných camera polí; bezpečnější je nezasahovat do historie Game CameraFollow a použít read-only query. Přijetí a GPU přínos rozhodne koordinátor ve srovnatelném pilotu. Tento proof nedokládá odstranění celých1.9 s ani avatarních variant.
