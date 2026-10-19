# Předání: webgpu-uv-dirty-helper-20261019

- Vlastník: `webgpu-01a15102-uv-dirty-helper`; příjemce: koordinátor `/root`.
- Pracovní kopie: `C:/Users/rezac/.codex/worktrees/29fa/StrahovCrazyShow`, detached HEAD; při předání HEAD `289d173f696c28f2e40c94bf8bb14af7cb768bc1`. Pinned vstup je vlastní čistý snapshot `webgpu-shadow-share-native-qa-20261019/clean`, nikoli aktuální dirty strom.
- Výsledek: připravený a zmrazený QA-only probe skutečných UV dirty notifikací. Produkční patch ani fyzické závislosti se neměnily; integraci a stav tasku přebírá koordinátor.
- Změněné soubory: pouze tento handoff a prefix `.cache/webgpu-uv-dirty-helper-20261019/`. Přesných 20 artefaktů včetně zdroje, preimage, loaderu, testů, logů a kontraktu vypisuje `manifest.json.artifacts`. Jediný runtime payload je `candidate/Textures/texture.pure.js`.
- Cizí rozpracované změny: nic nepřevzato, žádný zápis do cizích souborů, běžících snapshotů ani node_modules. Žádné staging/commity.

## Identita a podklady

- Stock vstup `Materials/Textures/texture.pure.js`: SHA-256 `f27fd4a566579ea2cc99c43ae056e48546b3d433aded037ab97c997c6299a976`, z čistého native snapshotu se source ID `8fb217a11a338de1cc687b953177d6cad8291e5f67bb2e1d02d781c4a6ab320e`. Nejde o dřívější odmítnutý firstUV kandidát.
- Payload SHA-256: `edaa133c49ee6886424b2530f51360ca1810b64912349a524d213e3e126fbe7c`.
- Frozen manifest SHA-256: `00f9d8eee6fa2771fc5939ac7cb30ad1a10a9fc6eef56d658132820ed6d62588`. `source-inverse.json` dokládá přesnou inverzi prefixu a dvou lokálních zásahů na původní f27.
- Závislostní svědci zůstávají SDW `f8a8c6091af9caa96ba897f28d7d490f3607d7856dee86b3a05321e1477aba29` a MaterialDefines F3 `3cc739bea27f7ec1f1b0f43e089d72d63ab15952166e7d3557c88af10ed34768`.

## API, loader a lifecycle

Payload přidává named exports `qaBeginTextureUVTrace()`, `qaEndTextureUVTrace()`, `qaReadTextureUVTrace()` a `qaAbortTextureUVTrace()`. `CONTRACT.md` je úplný kontrakt. Begin resetuje předchozí generaci; end pouze vypne sběr. Read až po benchmarku odpojí aktuální stav, pořídí inventář a uvolní scénu i při chybě. Abort vše uvolní. Reentrantní begin chrání generační kontrola, starý finish/read nesmí vymazat novou relaci.

Výchozí režim je vypnutý. Nejvýše 64 rezervovaných událostí, další notifikace jen zvyšují overflow. `hadCachedMatrix` se čte před původní alokací; levný probe není na cached-return fastpath. Začátek/konec časují skutečné původní `Scene.markAllMaterialsAsDirty` v `getTextureMatrix`; žádná notifikace se nepřeskakuje. Původní matematika, callback, návratová identita a původní výjimky zůstávají. Diagnostické chyby hodin/metadata jsou zachyceny a označeny; vynucená původní chyba se používá pouze pro CPU safety test, nikoli jako tvrzení o dosažitelném produkčním bugu.

Události obsahují pouze primitivní metadata: zkrácené jméno do 200 znaků, ID, UV parametry/uBase, předchozí/novou identitu, hadCachedMatrix, časové hranice, completion/throw stav a příslušnost k inventarizované scéně. Metadata z accessorů se nevynucují, neznámé hodnoty jsou explicitní. Export nedrží Texture ani matrix reference. Po end zůstává nejvýše jedna persistentní Scene reference do read/abort/nového begin; další scény počítá `otherSceneNotifications`.

Read inventarizuje vlastní `scene.meshes`, `mesh.subMeshes` a `subMesh._drawWrappers`: počty mesh/submesh/arrays, součet deklarovaných délek, vlastní indexové sloty, živé enumerable objekty, maxima a díry. Jde o strukturu pole, nikoli GPU paměť, počet draw calls nebo čas. Main-wrapper override není součástí součtu. Inventář neběží uvnitř benchmarku. Časové intervaly jsou inkluzivní a mohou se vnořit; nesčítat je jako výlučný CPU čas.

Loader `.cache/webgpu-uv-dirty-helper-20261019/loader.mjs` přijímá `UV_DIRTY_CORE` (absolutní borrowed core) a `UV_DIRTY_MODULE` (absolutní own payload); přesměruje pouze přesnou fyzickou URL `Materials/Textures/texture.pure.js`. Ověřuje f27 preimage i edaa payload. Exportuje `core` a `moduleAt(relativePath)`. `UV_DIRTY_VARIANT=A` ponechá stock modul pro referenci.

## Refaktoring a ověření

Lifecycle a sanitizace jsou soustředěny v prefixu; dva lokální zásahy ponechávají původní UV výpočet. Stav nedrží per-event resource reference ani callback swaps. Žádná nová persistentní runtime cache, profiler nebo per-fastpath clock.

`node .cache/webgpu-uv-dirty-helper-20261019/run-light.mjs` dokončeno 2026-10-19 13:54:40–13:54:42 UTC, všechny tři subprocessy exit 0:

- `node --test uv-trace.test.mjs`: 12/12 PASS, 0 FAIL; `targeted.log`.
- `parity-process.mjs` s A a P: 15 skutečných stock Texture stavů, přesná shoda matrix hodnot, návratových identit, cached identity a 7 původních dirty notifikací; `parity-A.json` a `parity-P.json` mají totožný SHA. Zahrnuje identity/nonidentity přechody, cached return, uBase, rotace, homogeneous, clone, optimizeUVAllocation a detached/noScene.
- Safety testy pokrývají disabled režim, dvě hodiny/notifikaci, end bez inventáře, sparse draw-wrapper inventář, původní throw, clock throw, 64/overflow, reset/abort/repeat, reentranci notifikace i inventáře, inventory chybu, noScene a druhou scénu. `light-results.json` obsahuje příkazy, prostředí, časy, exit a SHA logů.

První assembler skončil před zápisem kandidáta kvůli nejednoznačnému textovému výskytu dirty volání také v reflection metodě. Oprava omezila vyhledávání na getTextureMatrix; `first-assembly-error.log` je stručný záznam pozorované chyby, nikoli původní úplný subprocess log. Není to runtime změna ani výkonnostní výsledek.

## Procesy, omezení a převzetí

Všechny pomocné CPU procesy skončily, žádný server/port/GPU proces nebyl spuštěn. Poslední CPU ověření skončilo 13:54:42 UTC; parent dostal výslovný signál CPU done a neměnného payloadu před jeho GPU scénou. Po zmrazení už probíhá jen čtení/hash IO a tento handoff.

Child nespouštěl fullsuite, build, install, shader fixture ani GPU. Jde o CPU bezpečnost/paritu probe, nikoli důkaz příčiny produkčních záseků, GPU parity nebo FPS přínosu. Parent samostatně hlásí 31/31 integračních testů, full TS a minified hidden-map build PASS; tyto výsledky nenahrazují budoucí skutečný capture. Další krok je parentův omezený diagnostický sběr s exportem až po skončení Profiler stop promise.

- Rezervace: 2026-10-19 uvolněna příkazem `node scripts/agent-tasks.mjs release --task webgpu-uv-dirty-helper-20261019 --owner webgpu-01a15102-uv-dirty-helper`, exit 0, výstup `Released webgpu-uv-dirty-helper-20261019 (webgpu-01a15102-uv-dirty-helper).` Žádné vlastní procesy ani další zápisy do frozen prefixu nezůstávají.
- Integrátor: `/root` převezme přesný edaa payload, frozen manifest a kontrakt; rozhodnutí o evidenci, případných dalších změnách a stavu tasku patří jemu. Runtime integrace tohoto helperu do main není předmětem předání.
