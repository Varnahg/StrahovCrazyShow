# B6 exit: bounded CPU proof, 18. 10. 2026

Výsledek: u přesného merged boxu se nepotvrdil chybný shaderový stav při odchodu. Fresh outside ON a inside→outside ON vytvoří přesně stejný celý defines string. Druhý vstup i odchod znovu použijí původní Effect. Samostatně se v již existujících větvích prokázala závislost **pořadí řádků** na prvotním počtu slotů při pozdějším vstupu; to není atribuce naměřeného exit záseku.

## Vstup a rozsah

- Frozen V4 `bf28a56507b6b0650d214169c8cf94aa3b2d8abc4012a8b098e4e1366340c8c0`, jeho původní core/loaders9.30.0 s přijatými třemi inactive-falloff resety. SHA helperu `a6d21d15070f52d3a94ec7fd40eb22356a76a723165ce05afa67dbeded0e88ac`. Každý přímo vyšetřovaný source je ověřen proti frozen manifestu, dependency realpaths se shodují s V4.
- Raw `async-inactive-light-v4-normal-b6-1-session.jsonl`, SHA `8391e9ab2983c6f909d6e0553bf1d38e3a45285cb34d1bb349cce286b5cfd4da`; tři UI benchmarky first-f/outward/exit. Jejich polohy a viewMatrix jsou načtené přímo. Medium, UTC instant1792317600000, cloud0.96, rain0,1512×642. CPU žádné FPS/GPU měření neprovádí.
- Skutečný `new B6RealityController(scene)` vytvoří85 původních structural meshes; `loadProps` se nevolá. Witness `b6 floor 0 b6 stair:entry-dark-metal` má264vertexů,396indexů, jeden submesh0, originální position/normal/uv, metadata a `receiveShadows=false`, žádné instance ani textury. Není to dogleg madlo. Geometry hashe i metadata zůstávají při všech stavech shodné.
- Skutečné `GltfLightBudget.prepareFrame`, `StableLightState.update`, `PlayerFlashlight/VehicleLighting`, původní vytažené metody `Game.updateWorldPresentation`, `Game.updateRenderEnvironment`, `Game.isMeshReadyForCamera`, `SkyWeatherController.update/placeDisc` a `CinematicAtmosphere.update`. Pořadí je world→environment→budget→stable→actual scene.render.

## Tři větve a výsledky

| Větev / stav | Light types | Effect ve finálním běhu | Důkaz |
|---|---|---:|---|
| Fresh outside ON | S,D,H |1| full defines SHA `6f81a43b8b78f05577f9a4cd5f8904f90f3f3f0b9c54d2ade158e11d7110528c` |
| Inside inward ON | S,P,D,H |9| main camera draw |
| Inside outward ON | S,P,D,H |9| exact string i Effect reuse |
| Outside ON | S,D,H |16| exact string shodný s fresh outside |
| Inside ON znovu | S,P,D,H |9| reuse původního Effect |
| Outside ON znovu | S,D,H |16| reuse původního Effect |
| Skrytý outside precheck | S,D,H |22| frustumfalse,0draw; originální `mesh.isReady(true)` vracítrue v camera pass |
| Následný visible outside | S,D,H |22| skutečný main camera draw používá tentýž Effect |
| Inside po hidden precheck | S,P,D,H |30| aktivní key/value stejné jako inside9, jinak seřazený string |
| Exit po hidden precheck | S,D,H |22| reuse připraveného outside Effect |

ID platí jen pro tento CPU proces. Nejsou převodem raw Effect417/477 a vzájemně nezávislé enginy nemohou sdílet Effect identity.

H1: rozdíl inside→outside je legitimní: mizí `POINTLIGHT1`, `LIGHT_FALLOFF_STANDARD1`, `LIGHT3`, `HEMILIGHT3`; DIR se přesune2→1, HEMI3→2 a LIGHTCOUNT4→3. `MAXLIGHTCOUNT` zůstává4. H2 pro finální outside nebyla potvrzena: emitovaný string je byte-exact shodný s fresh referencí. V objectu zůstane27 klíčů slot3 navíc, ale všechnyfalse; všechny společné public hodnoty se shodují. False klíče se neemitují.

H3: camera-pass readiness předkontrola mimo frustum skutečně připraví **Effect** bez draw a visible draw jej použije. Neprovede WebGPU `createRenderPipeline`, nezná konečný descriptor, neprokazuje vyplnění pipeline cache ani eliminaci GPU queue gapu. Není to runtime návrh zavést all-mesh readiness scan.

## Samostatný doložený mechanismus pořadí

Fresh inside a outside-first→inside mají shodný komplet public define key/value včetně false/numeric hodnot, shodné světelné zdroje, cap a geometry. Jejich stringy se liší jen řádky97–100:

```
fresh inside:                 outside-first → inside:
#define LIGHT3               #define LIGHTCOUNT 4
#define HEMILIGHT3           #define MAXLIGHTCOUNT 4
#define LIGHTCOUNT 4         #define LIGHT3
#define MAXLIGHTCOUNT 4      #define HEMILIGHT3
```

Inside fresh SHA `c22483322ec62f7ae0fb92d593dc753bef250d6b2652870f6c67e692aa352a62`, outside-first inside SHA `e4682b7914745d740cd314f37cf791bfcc04582ed4839a67e71cdcc3cfefe3b0`. Report obsahuje oddělené kopie `_keys`, public hodnoty, plné stringy, key SHA a jejich diffs. Nejde o ponechaný aktivní falloff ani změnu světla. Dosud není same-engine production atribuce zbytečné kompilace nebo GPU času této odlišnosti.

Primární pinned zdroje (pod V4 `node_modules/@babylonjs/core/`):

- `Materials/materialHelper.functions.js:861–864`: chybějící LIGHTn založí nový vlastní klíč a vyžádá rebuild; konkrétní light flags jsou nastavené poté.
- `Materials/materialHelper.functions.js:672–703`: reset existujících inactive slotů; LIGHTCOUNT/MAXLIGHTCOUNT vznikají až za aktivní light loop. Při fresh3 slot3 ještě neexistuje; pozdější čtvrtý je vložen za počítadla.
- `Materials/materialHelper.functions.js:711`: `defines.rebuild()` při novém slotu.
- `Materials/materialDefines.js:141–151`: `rebuild()` kopíruje `Object.keys(this)` bez třídění, tedy insertion order.
- `Materials/materialDefines.js:214–235`: `toString()` jde přes `_keys` ve stejném pořadí; false hodnoty vynechá.
- `Materials/PBR/pbrBaseMaterial.pure.js:1182–1183`: PBR předá `defines.toString()` do `engine.createEffect`.
- `Engines/webgpuEngine.pure.js:1504–1523`: Effect cache key obsahuje celý `fullDefines` string; exact hit reuse, jinak nový Effect. `Engines/thinEngine.pure.js:1682–1703` má stejný princip použitý CPU proofem.

## Omezení a varianty dalšího kroku

NullEngine používá skutečnou Babylon material/draw frontend cestu s GLSL, ne WebGPU shader processor, GPU raster ani descriptor. Původní default caps zůstaly. Sky time/astronomie/lighting jsou skutečné, pouze sky disc shader IO je sink/TransformNode a reflection cube IO je no-op bez instalovaného IBL texture. Medium Cinematic update nevytváří postprocess pipeline; neočekávané glass/celestial caster větve vyhazují chybu. Proto jde o izolaci světelné historie, nikoli úplnou shodu renderu celé hry. Původní NullEngine URL texture dummy a nehotové raw plaque uploady zůstaly beze změny; witness žádné textury nemá.

Torch používá skutečnou camera-origin větev s platnými prázdnými root/elbow handles. Žádný actor se nepřesouvá, physics/network neběží, žádné Alex/glTF assety se nenačítají. Raw třetí osoba nemá zaznamenanou transientní hand pose. Celestial shadows jsou skutečnou response funkcí vypnuté, torch enabled se shadow mapou; witness originálně stíny nepřijímá. Ostatní svět/buildings/props/LOD ani všechen shadow seznam nejsou reprodukované. Raw exit14programů nelze připsat jednomu tomuto boxu.

Možnosti zhodnocené tímto důkazem:

1. Další generický reset type/falloff historie nemá pro exit oporu: konečný string už je správný a opakované přechody reuse fungují.
2. Skrytá readiness předkontrola má levný prokázaný Effect mechanismus, ale neřeší přesný WebGPU pipeline descriptor. Zavedení širšího scanu by mohlo jen přesunout kompilaci/CPU práci do startupu; nyní se nezavádí.
3. Exact skutečný draw potřebné geometrie v pokryté outside konfiguraci může doplnit chybějící pokrytí, ale vyžaduje produkční ověření a zvyšuje startup. Tento proof neslibuje snížení všech exit programů.
4. Samostatný bounded proof stabilního pořadí pro identické public key/value má konkrétní důvod. Musí nejprve ověřit skutečné same-engine duplicate Effects a primární plugin/define ordering kontrakt. Žádné plošné třídění, další cache ani vendor patch nejsou součástí tohoto úkolu.

Doporučení rootovi: uzavřít obecnou outside history hypotézu tohoto witness jako nepotvrzenou; případný další proof pořadí držet odděleně od coverage příčiny exit burstu. Nový runtime zásah z tohoto CPU výsledku samotného nevyplývá.

## Ověření a lifecycle

`TSX_DISABLE_CACHE=1 node --import tsx --test proof.test.ts`: finální `run-06-freeze.log`,4/4PASS,4.726s. Tři požadované větve plus injected failure. `report.json` obsahuje full defines, identity/disposal a cleanup pro všechny čtyři fixtures. Žádný build/fullsuite/GPU/port/install/commit.

První run0/4 odhalil chybnou testovou představu o force-disposal sdílených cached Effectů, nikoli runtime bug; po zániku všech scene meshes/materials se nyní force-dispose všech Effectů vlastního izolovaného enginu dokončí. Run04 měl3/4 kvůli záměrně přísnějšímu object equality: jeho vysvětlením je27 false inactive klíčů, nikoli emitovaný rozdíl. Logy/reporty nejsou přepsané. Runtime se nikdy neupravoval.

Refaktoring proofu sjednotil fixture, originální-method extraction, stavový apply/draw/precheck, sample a lifecycle. Jediná factory svědka; žádný nový cache mechanismus. Po úspěchu i injected failure: žádné own observers, budget material/load refs, stable-light observers; global SceneLoader observer počet0→0, scene/engine a sledované Effects disposed. Žádný pomocný proces neběží.
