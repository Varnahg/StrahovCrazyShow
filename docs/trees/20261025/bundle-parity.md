# NCM parita indexového rozsahu stromů a opadu

26. 10. 2026, task `trees-20261026-bundle-parity`, owner `trees-bundle-parity-01a16b37`.

## Doložený mechanismus a RED před opravou

Pinned Babylon 9.30 `WebGPUEngine._draw` při reuse `fastBundle` nepřepíše dříve zaznamenané `drawIndexed(count, instances, start)`. Metadata `SubMesh.indexCount` proto nejsou důkazem skutečného nového příkazu. Pinned `WebGPUDrawContext.setIndirectData` navíc bez `forceUpdate` sleduje jen `instanceCount`; count/start považuje za invariant. `applyTreeSeasonGeometry` přitom oprávněně mění prefix původních indexů bez nového bufferu.

Nový `tests/tree-bundle-parity.test.ts` používá skutečný `Mesh._draw`, `WebGPUEngine._draw`, `WebGPUCacheRenderPipelineTree`, `WebGPUCacheBindGroups`, `WebGPUDrawContext`, `WebGPUBundleList`, `DrawWrapper` a skutečnou strukturu/životní cyklus `ShadowDepthWrapper`. Nahrazený je pouze shader/device/encoder/buffer IO. Fake `executeBundles` vykoná skutečně zaznamenaný direct/indirect draw command; nejde o kontrolu samotných metadat.

RED `.cache/trees-bundle-parity-20261026/red-count.log`: strom po změně partial 3→full 6 stále vykonal 3 indexy; opad 6→12 stále 6. Rozšířený `red-alias-indirect.log`: oba vytvořené shadow aliases zůstaly na 3 místo 6; indirect draw po vyřazení **jen** fastBundle také zůstal na 3 místo 6 při stejném instance count. První fixture pokus měl chybějící fake engine counter; je oddělený `red-first.log`, nikoli funkční RED důkaz.

## Varianty před implementací

| Varianta | Dopady | Volba |
| --- | --- | --- |
| Veřejné mesh.resetDrawCache | Disposuje běžné DrawWrapper/Effect/drawContext, ruší UBO sloty; custom ShadowDepthWrapper aliases nejsou v obyčejném submesh seznamu | Zamítnuto |
| DrawContext.reset / nastavit dirty celý material | Širší ztráta bind groups a owned UBO slots; může zbytečně znovu připravovat zdroje | Zamítnuto |
| Aktualizovat indirect buffer okamžitě přes setIndirectData(force) | Vyžaduje správný aktuální instance count každého passu a nový GPU write mimo skutečný draw | Zamítnuto |
| Vyřadit jen existující fastBundle a v indirect contextu resetovat cached instance-count sentinel na −1 | Následující skutečný native draw převezme aktuální range/instance count; zachová Effect, pipeline, UBO/bind groups i textury | Vybráno po RED |
| Globální cache wipe / změna defaultu na NCM | Nesouvisející invalidace celé scény a nepřijatá změna režimu | Zamítnuto |

## Dohodnuté API a ownership

`invalidateTreeDrawRange(mesh, subMesh, nextIndexStart, nextIndexCount): void` volá root v `applyTreeSeasonGeometry` bezprostředně po ověření vlastníka/rozsahu, **před** změnou indexStart/indexCount či dalšího stavu. Helper rozsah sám nemění. Beze změny range a mimo WebGPU NCM je no-op; default CM zůstává beze změny. NCM snapshot rendering není podporovaný kontrakt pro tuto mutaci a musí být odmítnutý.

Adaptér je výslovně připnutý na Babylon 9.30 a ověřuje skutečné existující instance/own-data struktury před jakoukoli mutací. Projde ordinary submesh wrappers, potom existující mapové entry/aliasy konkrétního ShadowDepthWrapper/submeshe. Nevolá `getEffect`, nevytváří aliasy, nezapisuje do cache jiných meshů a nezadržuje vlastníky v nové globální mapě. Absence shadow wrapperu je běžná větev opadu. Při neznámém tvaru selže před změnou range; nelze potichu prohlásit starý bundle za aktuální.

GPU/obrazová přejímka a změna defaultu nejsou součástí tohoto CPU kroku. Renderer zůstává CM WebGPU. Runtime integraci do stávajícího geometry helperu vlastní root.

## Implementace a refaktoring

`client/tree-draw-cache.ts` nejprve ověří verzi, ne-snapshot NCM režim, živý mesh a skutečně vlastněný submesh, platný nový rozsah, ordinary wrapper tabulku a případný konkrétní ShadowDepthWrapper/submesh map. Sleduje jen existující own-data položky; sparse render-pass index nevyvolá vytvoření či průchod chybějících aliasů. Ověří existující DrawWrapper/WebGPUDrawContext instance, engine buffer-manager identitu a zapisovatelnost potřebných polí, včetně správného pětiprvkového Uint32 indirect záznamu. Neznámý override či layout selže před první invalidací.

Teprve po úplném preflightu nastaví `fastBundle=undefined`; pro existující indirect buffer navíc `_currentInstanceCount=-1`. Příští skutečný draw obnoví count/start ze skutečných argumentů. Nevynucuje nový shader, pipeline, bind group ani UBO slot a sám nevolá GPU API. Dva dočasné deduplikační sety obsahují pouze již vlastněné wrappers/contexts; žádný persistentní registry, historie nebo observer nepřibývá. Shodný rozsah je O(1) no-op. Disposed mesh/scene/engine se neoživují.

## Ověření 26. 10. 2026, 13:36–13:54 UTC

- `node node_modules/tsx/dist/cli.mjs --test tests/tree-bundle-parity.test.ts`: **15/15 PASS**, exit 0, `.cache/trees-bundle-parity-20261026/targeted-tests-final.log`.
- Zděděný úzký TypeScript project s helperem/testem a importy: **PASS**, exit 0, `targeted-types-final.log`. První typecheck odhalil pouze testový private `_draw` přístup a nedostupný globální GPU typ; přesný pinned test cast/public DrawContext field type byly opraveny bez runtime změny.
- RED testový zdroj je zachován jako `red-test.ts`; `red-count.log` a `red-alias-indirect.log` dokazují původní vykonané počty. `green-first.log` dokládá první 4/4 hlavní regrese. První rozšířený fixture test očekával prázdnou tabulku, přestože pinned material assignment vytvoří prázdný DrawWrapper; nyní ověřuje zachování již existujících null-effect vlastníků i explicitně prázdnou tabulku po resetu. Neúspěšný log zůstává `targeted-first.log`.

Pokryto: původně částečný prefix→plný, snížení/zero/hidden/obnovení, změna startu při stejném countu, direct a skutečné indirect draw parametry při stejném instance countu; ordinary a shadow pass aliases; stejný Effect/refCount, pipeline cache, bind groups, material/texture, UBO slots a indirect buffer; nulové GPU zápisy během helperu a žádné další program/pipeline requests po obnově.

Dále shared geometry/material nepřenáší invalidaci na jiný mesh; 100 změn nepřidá žádný wrapper/alias; sparse pass 1 000 000 zůstává sparse. Late disposal, známý aktivní shadow override, neznámý override, accessor tabulka, foreign/missing manager, neplatný range, jiný owner/pin/snapshot a malformed poslední alias jsou pokryté. Atomic preflight failure zachová i dřívější hlavní bundle/indirect sentinel. CM/WebGL nekontroluje private tabulky a přímo vykoná nový range původní cestou.

Samostatný test veřejného resetDrawCache potvrdil odmítnutou variantu: zruší ordinary Effect/context, ale vytvořený custom shadow alias/bundle zůstane mimo jeho dosah. Fake Effect/device IO je hranice fixture; neprovádí se native shader/GPU kompilace a CPU počty nejsou GPU/obrazové měření. Zapojení a další přejímku vlastní root.

## Navazující v10 guard failure — 26. 10. 2026

Root zachoval skutečné selhání fast startupu v `.cache/trees-gpu-20261025/v10-fast-guard-failure.json`. Sloupec 2625 v řádku 79 frozen bundle ukazuje na odmítnutý klíč pole. **Původní domněnka o dvojitém backslashi byla vyvrácena**: live a frozen-v10 helper měly shodný SHA `02b245c1d6dc69964426a6f89dcc1b9c882602fd7cc89c57dea49190ecde4b5a`, regex obsahoval jediný znak U+005C. Přímé JS vyhodnocení literálu načteného ze souboru přijalo `0`, `1`, `12`, `127`, `1000000`; odmítlo `undefined`, `-1`, `01`. Regex se neopravoval ani nezměnil. Původní testy již používaly ordinary pass 1 a shadow 2/3, ale ne celý nativní lifecycle vytváření rendereru nad již existujícím meshem.

Koordinátor autorizoval doplnění přesného omezeného error detailu: label `main`/`shadow` a JSON-escaped key nejvýše 80 znaků, bez hodnot či objektů. Přidané pozitivní regrese používají skutečné `engine.createRenderPassId`, nenulová/vícemístná ID a skutečně existující sparse index 1 000 001 v ordinary i shadow alias tabulce. Negativní klíče dál atomicky selhávají.

### Doložená nativní prázdná položka

Pinned `ObjectRenderer` constructor (`Rendering/objectRenderer.js:302–334`) vytvoří `_renderPassIds=[]` a `_createRenderPassId()` nejprve zavolá `_releaseRenderPassId()`. Ten i při prvním vytvoření iteruje `numPasses` a předá `undefined` do `engine.releaseRenderPassId`. `Engines/AbstractEngine/abstractEngine.renderPass.pure.js:35` potom zavolá `_removeDrawWrapper(undefined)` na existujících submeshech. `Meshes/subMesh.pure.js:45` zapíše vlastní enumerable slot `_drawWrappers["undefined"]=undefined`.

Skutečný `new ObjectRenderer` CPU test reprodukoval tentýž guard a hlášku `main pass key "undefined"`; `guard-followup/red-native-tombstone.log`, exit 1. Camera IDs přiděluje kladný monotónní counter a Game camera readiness vrací předchozí pass ve finally. V tomto doloženém řetězci není potřebný chybějící camera pass ani legitimní −1. V10 původně konkrétní klíč nezaznamenal; nativní GPU potvrzení opravy proto stále patří novému immutable běhu rootu.

Po výslovném schválení koordinátora helper toleruje **pouze** main tabulku, přesný klíč `undefined`, vlastní data descriptor s value `undefined` a writable/enumerable/configurable true. Položku nemaže ani nepřepisuje. Živý wrapper, null, accessor, změněné flags, ostatní named klíče a stejná položka v shadow tabulce zůstávají odmítnuté před jakoukoli invalidací. Jde o popis konkrétního nativního lifecycle, nikoli obecné ignorování neznámých polí.

### Výsledek follow-up

Actual ObjectRenderer konstrukce, vytvoření wrapperu pro jeho platné ID a skutečný release nyní projdou; named i numerický prázdný slot zůstanou nedotčené a další příkaz vykoná nový count. **19/19 cílených CPU testů PASS** a úzký TypeScript project **PASS**, exit 0, přibližně 16:17 UTC. Logy `guard-followup/targeted-tests-final.log`, `targeted-types-final.log`. Rozšířené negativní descriptor testy dokazují zachování atomicity.

Původní cache manifest/source snapshot zůstává zachovaný; nový handoff snapshot je v `guard-followup/`. Žádný GPU, build nebo změna defaultu. V10 CM zůstává referencí a fast neúspěch se nepřepisuje cílenými CPU výsledky.
