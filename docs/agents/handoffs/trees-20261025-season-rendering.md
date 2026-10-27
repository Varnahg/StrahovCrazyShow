# Předání: trees-20261025-season-rendering

- Vlastník: `trees-season-rendering-01a16b37` (`weather_sky_fixes`); příjemce root, runtime autor `terrain_edge_review`.
- Cwd `D:/CodexWorkspaces/StrahovCrazyShow-terrain-20261025`, větev `codex/trees-realism-20261025`, baseline `8516c7b1877ec66c37120d9088264d44c52882f1`.
- Vlastní disjunktní claim, bez adopt-dirty. Fenologie již byla rootem převzatá a není upravená; loader, ground hooks a modely zůstávají souběžným vlastníkům.
- Výsledek: integrovatelný skutečný prefix opadu, PBR sezónní tónování, izolace shader cache a podpora autorských lokálních normál. GPU přejímka není součástí výsledku.

## Změny

`client/tree-season-geometry.ts`, `client/tree-season-material.ts` (nové); `client/tree-wind.ts`, `client/tree-appearance.ts`; nové testy `tree-season-geometry`, `tree-season-material`, `tree-effect-identity`; aktualizované `tests/tree-appearance.test.ts` a `tests/wgsl-vegetation.test.ts`; `docs/trees/20261025/season-rendering.md`, tento handoff a vlastní `.cache/trees-season-rendering-20261025/`.

Žádné změny v převzaté fenologii, Game/UI, TreeRenderer/vegetation, assetech ani engine patchi. TreeRenderer je potřebný pouze jako aktuální import testové fixture, dle domluvy s jeho autorem.

## API a vlastnictví

```ts
createTreeSeasonGeometryPlan(indices: ArrayLike<number>, colors: ArrayLike<number>): TreeSeasonGeometryPlan;
treeSeasonIndexCount(plan: TreeSeasonGeometryPlan, leafAmount: number): number;
applyTreeSeasonGeometry(mesh: Mesh, plan: TreeSeasonGeometryPlan, leafAmount: number): number;
new TreeSeasonMaterialPlugin(material: PBRMaterial);
setTreeSeasonMaterialState(mesh: AbstractMesh, family: TreeFamily, phenology: TreePhenology): void;
```

Plan obsahuje `vertexCount`, vlastní `indices:Uint16Array|Uint32Array`, `ranks:Uint16Array`, `indexEnds:Uint32Array`. Vstup colors je **normalizovaný RGBA**, ne raw Uint16. RGB musí být 1, alpha musí odpovídat uint16 ranku 1..65534 v toleranci Float32 normalizace; všechny tři rohy trojúhelníku mají shodný rank. Zdroje zůstávají nezměněné. Stabilní řazení zachová winding a pořadí uvnitř shodného ranku. Vysoké ranky padají první, threshold `floor(leafAmount*65535)`, count0 umožňuje loaderu skrýt foliage. Exportní rank musí být rozprostřený v celém rozsahu, nikoli 1..N.

Loader jednou nahraje plan.indices do prototypu. Klony mají sdílenou Geometry, vlastní SubMesh a season state. `apply` neuploaduje ani netoggluje enabled; nastaví indexStart0/indexCount, vypne vertex alpha a obnoví uložené plné lokální SubMesh bounds. Před prvním apply musí mít Mesh plné bounds včetně wind paddingu, protože mesh culling předchází submesh cullingu. Autor loaderu již přidal 0,1m padding XZ a obnovu po transform refresh. Range změna a binary search nemají per-frame alokace; bounding vectors se rekonstruují in-place. Per-mesh binding je WeakMap, nepřidává scene observer ani vlastní GPU resource.

Material factory jednou připojí Wind a Season plugin. Nové pořadí integrace je Wind→Season; neměnit registraci podle aktuální rodiny/sezóny. Oba mají unikátní getClassName a stálý feature define: pinovaný manager při přidávání pluginu zapíše hlavní class marker posledního pluginu, takže samotné různorodé class names nestačí pro rozlišení kombinace versus season-only. Hodnoty se mění jen přes hard-bind UBO. Evergreen má podzimní tónování vypnuté. Material.alpha zůstává 1 a leaf removal zůstává v geometrii.

`setTreeSeasonMaterialState` zajistí samostatný metadata envelope pro clone, protože Babylon standardně sdílí metadata objekt ze zdroje. Další volání pouze mění reference/state, nerozmnožují materiály. Fotografie/žilnatina se zachovává přes lineární surfaceAlbedo a jeho luminanci; normal/roughness/alpha mapy se nepřepisují. Raw color.a se přenáší vlastním varying; běžné vColor.a má při vypnutém VERTEXALPHA hodnotu1 a nelze z něj číst rank. Bez COLOR_0 je stabilní legacy fallback0,5. Nový loader používá tónované albedo i pro translucenci bez druhého raw-green color texture.

`applyTreeCrownShading` přeskočí mesh s `metadata.treeNormalSource='authored-local'`; ostatní legacy chování zůstává. Při exportu bez nového rank kontraktu se žádné falešné ranky nedopočítávají. V1 partial foliage je fallback politika loaderu, ne prokázaný nový komponentový opad.

## Primární evidence a refaktoring

Přečtené pinované Babylon9.30 zdroje: SubMesh.IsGlobal/refreshBoundingInfo, BoundingInfo/Box.reConstruct, PBR vertexColorMixing a pbrBlockAlbedoOpacity v obou jazycích, plugin manager/class identity a ShadowDepthWrapper. Modelářův skutečný geometry-only probe měl COLOR_0 normalized5123 VEC4; žádný Blender nebo GPU zde neběžel.

Volby a náklady jsou v `docs/trees/20261025/season-rendering.md`: prefix místo alpha/blend/discard-only nebo opakovaného index uploadu; sdílené materiály místo instance materiálu na strom; přesná normálová provenance místo přepsání nových autorských normál. Jedna správa ranků/prefixu, slabé per-mesh cache bez renderer resources. Shaderové větev/feature flags jsou stabilní přes čas, rodinu a LOD.

Stará eviction fixture používá skutečný `new TreeRenderer(scene)` s inicializovaným loader/cache stavem. Zastaralé regexové očekávání dvou callsites ve vegetation.ts nahradil skutečný renderer.describe nad dvěma source LOD: odvozené normály, nezměněné indices/root souřadnice, stejné mesh/material counts a jediný sdílený Wind plugin. Neoslabuje se zachování původních bufferů ani cleanup.

## Ověření

```text
node node_modules/tsx/dist/cli.mjs --test tests/tree-season-geometry.test.ts tests/tree-season-material.test.ts tests/tree-effect-identity.test.ts tests/tree-appearance.test.ts tests/wgsl-vegetation.test.ts
node node_modules/typescript/bin/tsc --noEmit --pretty false
```

**19/19 PASS**, exit0, **5,290 s**, `.cache/trees-season-rendering-20261025/targeted-tests.log`. Finální TypeScript **PASS**, exit0, `typecheck-final.log`. Vlastní source/test/doc whitespace a SHA ověřeny checkpoint skriptem; tracked diff check PASS.

- Prefix test kontroluje neporušené zdroje, rank hranice, stabilní ties/winding, Uint32 a chybné RGB/NaN/index/triangle vstupy.
- Skutečné Mesh klony po winter→compute→explicit refresh→move→partial foliage odešlou **6 a18 indices v main i ShadowGenerator passu**, při stejném sdíleném index bufferu. Dalších100 apply nezmění buffer ani bounding object. Zero/hide ovládá caller, nikoli helper.
- Actual PBR Effect fixture používá skutečný normalized UNSIGNED_SHORT color buffer a source texture IO adapter. Ověřuje VERTEXCOLOR/ALPHATEST, vypnuté VERTEXALPHA/ALPHABLEND, raw varying, nezměněné mapy a stejný program při změně fáze frozen materiálu.
- Native WGSL test používá Babylon processor nad skutečnými PBR hooks, regular/thin/tangent variantami a kombinací wind+season. Není to GPU kompilace.
- Cache test reprodukuje skutečný chybný Effect hit při staré default class/empty feature identitě v obou pořadích. Opravené wind/season/combined jsou různé, stejná kombinace sdílí program při oddělených UBO. Engine cache není mockovaná.
- Clone ownership test klonuje zdroj až po nastavení metadata a ověřuje následnou nezávislost ownerů. Lokální normály zůstávají byte-identické a legacy eviction uvolní geometry při zachování shared materiálu.

Historie: první příkaz se kvůli chybějícímu cache adresáři vůbec nespustil. První skutečný18/19 běh měl přísný chybný test, který čekal odstranění neaktivního GLSL `#if` textu; `targeted-first.log` zůstává. WebGL tento preprocessing správně deleguje driveru, proto finální test ověřuje skutečné flags a podmínku místo popírání existujícího zdroje. Následný meziběh tsc byl blokovaný jen cizím flowerBloom integračním stavem; root doplnil kontrakt, finální tsc je čistý. Při přesunu fixture byla opravena očekávání callsite počtu a interní Vector3 dirty vlajky; finální regrese kontroluje skutečné souřadnice a resources.

## Checkpoint a další krok

`.cache/trees-season-rendering-20261025/checkpoint.json` zahrnuje **10 source/doc/test souborů**; source digest **`4bdf3d4d6ac2f7485003c59997e944cd2fbaa3e09b30ee181ba06c5c349930ee`**, SHA256 manifestu **`b75a066654831ec8d53abe4809257e269774a34e385c9bb9ff093bc1b76fac6f`**. Handoff se nehashuje sám do sebe.

Vlastní procesy skončily. Žádná instalace, engine změna, Blender, server, GPU, build, fullsuite, staging ani commit. Hrané4179/2592 zůstaly nedotčené. Root přebírá integraci, nezávislé review a statické GPU ověření vzhledu palety, leaf/twig siluety, shadow alpha a skutečných nákladů. CPU draw/Effect důkazy nejsou obrazová přejímka ani FPS výsledek. Po odeslání rootovi je rezervace uvolněna; stav a akceptaci tasku určuje integrátor.
# Root převod přímého průsvitu po skutečném GPU pilotu

Root po původním předání převzal seasonal rendering jako `trees-season-rendering-integrator-01a16b37`. Pro doloženou opravu pilotní bílé přímé transmise nyní předává existující WIP `client/tree-season-material.ts`, `tests/tree-season-material.test.ts`, `tests/tree-effect-identity.test.ts` a `tests/wgsl-vegetation.test.ts` tasku `trees-20261025-transmission`, příjemce `trees-transmission-01a16b37`. Původní soubory mají doložený předchozí checkpoint; nejde o volný cizí WIP. Ostatní appearance/wind/geometry soubory zůstávají rootovi. Root integruje nový explicitní pilot opt-in do TreeRenderer; child tam nezapisuje. Žádné přepisování neměnného candidate-v3 nebo runtime obrázků.

