# CPU důkaz opakované přípravy známých materiálů

18. 10. 2026. Bounded proof je dokončený, produkční oprava se neimplementovala. Tři samostatné Node procesy prošly 5/5 případy, scoped TypeScript 2963 souborů / 0 chyb. Měření proběhlo v koordinovaném CPU okně bez root build/test/GPU práce. Přesné časy, příkazy, SHA zdrojů a logů jsou ve `final-runs.json`; raw výsledky jsou `report-run-05.json` až `07`, souhrn `summary.json`.

## Co je doložené

Předem dokončené varianty tří a čtyř světel se při každém přepnutí znovu připravují pro všech 36 skutečných submeshes (12 meshes, sdílený materiál). Ve všech třech druzích materiálu je při každém warm přepnutí přesně 36 volání serializeru, 36 skutečných WebGPUEngine.createEffect cache hitů, 36 onEffectCreated událostí, 36 změn Effect identity a 36 SubMesh/DrawWrapper.setEffect/actual WebGPUDrawContext.reset. Nevznikne žádný nový program. Nezměněný draw má tyto počty nulové. Cache hit tedy není vynecháním předchozí CPU přípravy.

Pro každý druh bylo ve třech procesech 48 warm přepnutí a 48 nezměněných snímků. Tabulka udává medián součtu daného scope pro všech 36 submeshes v jednom snímku, **ms v Node/NullEngine**:

| Scope | PBR | Standard | PBR + CampusSurfaceArt |
|---|---:|---:|---:|
| Celý synchronní budget/order/render | 8,541 | 6,079 | 8,349 |
| Stejný nezměněný render | 0,670 | 0,718 | 0,683 |
| Material readiness inclusive | 7,381 | 5,165 | 7,258 |
| PBR defines / Standard širší ready→mark | 1,211 | 1,188 | 1,176 |
| Options mezi mark a serializerem | 0,880 | 0,736 | 0,802 |
| Celé MaterialDefines.toString | 4,566 | 2,835 | 4,540 |
| Actual native createEffect | 0,279 | 0,183 | 0,265 |
| SubMesh.setEffect inclusive | 0,093 | 0,054 | 0,059 |
| Prázdný WebGPUDrawContext.reset | 0,026 | 0,011 | 0,009 |

Scopes jsou vnořené a **nesčítají se**. `optionsBeforeSerializer` obsahuje plugin PrepareEffect; `serializerInclusive` obsahuje původní sestavení textu i nový canonicalResult, tyto dvě části zde nejsou oddělené. Standard nemá samostatný callable defines scope: jeho širší interval zahrnuje další readiness/texture/plugin kontroly. `wallMs` v raw navíc zahrnuje await setImmediate; tabulka používá přímý synchronní interval. `lightToggleMs`, light budget a ordering jsou v raw samostatně, bez odvození exkluzivních časů.

Neinstrumentované kontroly před instalací časovacích hooků rovněž zachovaly stejné snapshots. Mají jen 2 změny a 3 nezměněné snímky na proces a běží před pozdějším JIT zahřátím. Neumožňují odhad instrumentační režie: jejich přepnutí jsou dokonce pomalejší než pozdější měřené mediány. V raw jsou zachovány i maxima a všechny běhy; nebyly vybrány pouze rychlé vzorky. Lokální wrappery, performance.now, počítání událostí, malý Set existujících Effects i uniform observer mají CPU/alokační režii. Snapshot validace je mimo měřený interval, ale její alokace mohou ovlivnit pozdější GC.

## Invariants, skutečný řetězec a hranice

- Stejné skutečné full defines, Effect/key identity, zpracované WGSL bytes, shader-processing metadata/layout a předávané material uniform hodnoty při každém návratu do známé varianty; skutečné 3/4 LIGHTCOUNT, pořadí lightSources a cap4. Actual GltfLightBudget/StableLightState a native Light.setEnabled, nikoli přepsaná readiness nebo umělý dirty flag.
- Skutečná změna Standard.disableLighting / PBR.alphaCutOff vytvoří právě jeden další program a odlišný Effect; návrat obnoví původní Effect. Návrat alphaCutOff používá zachycenou původní hodnotu 0,4, nikoli předpoklad 0,5.
- Pinned native createEffect cache increments jsou zachované: 8 přepnutí do každé varianty × 36 submeshes přidá 288 native referencí každému warm Effect. Proof je nesnižuje, neobchází události a nepřidává druhou Effect cache. Při teardown uvolní všechny fixture Effects přes native dispose(true); toto není změna produkčního refcount kontraktu.
- Testuje se skutečný CampusSurfaceArt plugin včetně callbacks, WGSL a 12 float hodnot v samostatném skutečném UniformBuffer. Native WGSL Material._createUniformBuffer záměrně používá non-UBO forwarding do Effect leftovers; test proto ověřuje skutečné delegované update argumenty (PBR12, Standard7, plugin15 názvů), nikoli neexistující getData() na material bufferu.
- NativeProcessingEngine class body je byte-identický s existujícím WGSL testem V6. Pinned WebGPUShaderProcessorWGSL/context a WebGPUEngine.createEffect jsou skutečné metody. Pipeline vytvoření, binding backend a draw submission jsou NullEngine; není zde browser WGSL kompilátor, GPU layout validation, obrazová shoda ani GPU připravenost.
- WebGPUDrawContext je skutečná třída, ale nemá GPU buffers/bindGroups/owner slots. GPU buffer-manager operace jsou fail-fast mimo povolenou hranici. Jeho malá naměřená reset cena **nedokazuje** malou cenu skutečných GPU binding resets/slot release/driver práce.
- Jedna perspektiva, hlavní pass, shadows vypnuté, standardní neinstancované meshes bez externích textur. Žádná světová/GLB/LOD/avatar/alpha-texture/RTT/shadow matice. Draw callback dokládá CPU cestu draw v NullEngine, nikoli GPU rasterizaci.
- Synchronous chyba skutečného onEffectCreated observeru zůstane identická; všechny vlastní hooky/observers/scény/enginy/Effects/contexts se uvolní i po této chybě. Lokální hook zachová receiver/arguments/return/throw, nesahá na then a neodstraní pozdějšího vlastníka.

## Podklady a rozhodovací varianty

Přesné soubory/SHA v `source-evidence.json`, core Babylon9.30.0 s přijatým serializerem `43a75f4…916f4`, QA snapshot `fc6efd2…1d525`:

- `Materials/PBR/pbrBaseMaterial.pure.js:921–945,963–1198`: defines → dirty options/plugin → serializer → engine cache, poté událost/reset/setEffect. `_prepareDefines:1202–1436` včetně světel a pluginů.
- `Materials/standardMaterial.pure.js:820–1289`: inline odpovídající řetězec, plugin PrepareEffect1227 a serializer1264 až po sestavení options.
- `Materials/materialDefines.js:213–278`: původní property reads/text a bounded canonicalResult. Celé toString je měřený scope, nikoli izolovaný parser.
- `Engines/webgpuEngine.js:1504–1524`, `Materials/drawWrapper.js:50–59`, `Meshes/subMesh.js:75–87`, `Engines/WebGPU/webgpuDrawContext.js:79–88,150–175`: cache a ownership/reset/dispose.
- `Materials/material.pure.js:759–771`, `Materials/uniformBuffer.js:739–776`: WGSL material non-UBO → Effect forwarding. Samostatný plugin UniformBuffer odpovídá existujícímu testu `tests/wgsl-surface-materials.test.ts:75–90`.
- V6 `client/mesh-draw-profile.ts:172–182,306–321` měří draw preparation od beforeRender do beforeBind. Produkčních 200ms není samotný compiler. `docs/performance/evidence/webgpu-migration-20261016/hitches-v19/README.md` dokládá firstF313,9msCPU/main280,3/shadow2,8,1program/794Effectchanges/825draws. Tento malý proof tuto CPU cenu neatribuuje celou a **nepřepočítává 36→794**.

| Možnost | Co může ušetřit a proč není automatickou volbou |
|---|---|
| Levnější čistý serializer/parser | Největší zde přímo změřený úzký scope. Lze zkoumat stejné bytes s menším počtem dočasných polí/record objektů; musí zachovat původní getter/throw pořadí, whole-block fallback, limity, numeric/custom string kontrakt a plugin matrix. Tento proof neodděluje původní text loop od canonicalizeru, nový kandidát nevznikl. Bez persistentní paměti/lifecycle mapy. |
| Dřívější lookup ve stávající Effect cache | Potenciálně vynechá options, které jsou zde menší než serializer. Musí však znát hotové defines a zachovat customShaderNameResolve, plugin PrepareEffect/attributes/UBO/samplers, callbacky a cache refcount/reset. Přesunutí před tyto callbacks mění kontrakt. Nová složitost není podle těchto výsledků první doložená volba. |
| Shared material příprava | V tomto homogenním fixture se opakuje stejná práce36×. Produkční submeshes se ale liší lightSources, instance/vertex layout, receiveShadows, pass, textura, cap a plugin stav. Sdílení jen podle material identity není bezpečné a potřebuje širší klíče/invalidaci. |
| Stabilní light slots | Mohly by odstranit přepnutí, ale drží shader práci i při nulové intenzitě, mění cap/výběr a shadow/receiver chování. Širší obrazový a lifecycle zásah; dřívější receiver pilot měl vlastní per-frame cenu. Tento proof jej nepřijímá. |
| Další prewarm | Pomůže chybějícím prvním programům, nikoli doloženým warm hitům. Má startup náklad a zvláštní shadow lifecycle. Root samostatně ověřuje day13 se současným serializerem. |
| Žádná změna | Přijatelná, pokud browser/GPU porovnání nepotvrdí užitek menšího bezpečného kandidáta. Produkční API ani renderer se tímto taskem nemění. |

Další případný výzkum může porovnat čistou serializaci s omezeným memo hotového původního stringu, vždy až po původních property reads/throws. Memo by mělo vlastní limit paměti/lifecycle a není zde vybrané ani implementované. Nesmí se míchat se současným day13 GPU experimentem.

## Zachované negativní běhy

`run-01` maskoval původní fixture chybu neuklizenými adapter contexts; `run-02` doložil chybný předpoklad getData() na WGSL material non-UBO; `run-03` měl správných32 warm snímků na druh, ale špatný hardcoded návrat alphaCutOff. `run-04` prošel5/5 před posledním doplněním synchronních intervalů a refcount assertions. `types-01` našel dva lokální TS problémy (nadbytečné plugin argumenty a typ lokálního počitadla), opraveno v testu. Žádný z těchto neúspěchů není runtime RED/GREEN oprava hry. Původní logy/reporty zůstávají zachované; finální závěr používá pouze exact source běhů05–07 a types-02.

Reprodukce jednotlivého testu z tohoto prefixu: `TSX_DISABLE_CACHE=1 node --import ./node_modules/tsx/dist/loader.mjs --test --test-concurrency=1 --test-timeout=30000 proof.test.ts`; typy `node types.mjs`. Žádný pnpm/install/fullsuite/build/GPU/port. Runner `run-final.mjs` má per-process60s limit a výstupy wx; znovu jej nespouštět přes frozen logy.
